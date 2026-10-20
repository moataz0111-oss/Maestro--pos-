"""
🏢 Inventory project isolation — عزل المخزن والمشتريات والتصنيع بالمشروع.
يُفعَّل بـ dependency على الراوتر، ثم get_scoped_database() تعيد DB تُقيّد القراءة وتوسم الإدخال بالمشروع.
"""
from contextvars import ContextVar
from typing import Optional
from fastapi import Depends, Request

from .shared import get_database, get_current_user, get_user_tenant_id, requested_project_id

_INV_SCOPE: ContextVar[Optional[dict]] = ContextVar("inventory_project_scope", default=None)

PROJECT_COLLECTIONS = {
    "raw_materials", "manufactured_products", "packaging_materials", "suppliers", "purchases_new",
    "purchase_requests", "warehouse_purchase_requests", "manufacturing_requests", "manufacturing_inventory",
    "inventory_movements", "warehouse_transactions", "price_alerts", "yield_variances",
    "material_cost_layers", "cost_layers", "manufacturing_records", "manufacturing_movements",
    "inventory_corrections", "purchase_invoices", "purchase_suppliers", "manufacturing_notifications",
    "warehouse_notifications", "supplier_payments", "inventory_transactions",
}
BRANCH_COLLECTIONS = {
    "branch_requests", "branch_orders_new", "branch_inventory", "branch_packaging_inventory",
    "packaging_requests", "branch_request_notifications", "warehouse_transfers", "inventory_transfers",
}
SCOPED = PROJECT_COLLECTIONS | BRANCH_COLLECTIONS


async def set_inventory_scope(request: Request, current_user: dict = Depends(get_current_user)):
    pid = requested_project_id(current_user, request)
    if not pid:
        _INV_SCOPE.set(None)
        return
    db = get_database()
    bq = {"project_id": pid}
    tid = get_user_tenant_id(current_user)
    if tid:
        bq["tenant_id"] = tid
    ids = [b["id"] async for b in db.branches.find(bq, {"_id": 0, "id": 1}) if b.get("id")]
    _INV_SCOPE.set({"project_id": pid, "branch_ids": ids})


def current_inventory_project() -> Optional[str]:
    sc = _INV_SCOPE.get()
    return sc["project_id"] if sc else None


class _ScopedCollection:
    def __init__(self, coll, name: str, scope: dict):
        self._c, self._name, self._s = coll, name, scope

    def _cond(self) -> dict:
        pid = self._s["project_id"]
        if self._name in BRANCH_COLLECTIONS:
            ids = self._s["branch_ids"]
            return {"$or": [{"project_id": pid}, {"branch_id": {"$in": ids}},
                            {"to_branch_id": {"$in": ids}}, {"from_branch_id": {"$in": ids}}]}
        return {"project_id": pid}

    def _strict(self, f):
        return {"$and": [f or {}, self._cond()]}

    def _lenient(self, f):
        # قراءة عنصر محدد: من المشروع أو عنصر قديم غير موسوم (لا يكسر العمليات)
        return {"$and": [f or {}, {"$or": [self._cond(), {"project_id": {"$in": [None, ""]}}]}]}

    def _tag(self, doc):
        if isinstance(doc, dict) and not doc.get("project_id"):
            doc["project_id"] = self._s["project_id"]
        return doc

    def find(self, filter=None, *args, **kwargs):
        return self._c.find(self._strict(filter), *args, **kwargs)

    async def find_one(self, filter=None, *args, **kwargs):
        sort = kwargs.get("sort") or []
        if sort and str(sort[0][0]).endswith("_number"):
            # عدّادات الترقيم (رقم الطلب/التحويل/الشراء) تبقى موحّدة على مستوى المؤسسة
            return await self._c.find_one(filter, *args, **kwargs)
        return await self._c.find_one(self._lenient(filter), *args, **kwargs)

    async def update_one(self, filter, *args, **kwargs):
        return await self._c.update_one(self._lenient(filter), *args, **kwargs)

    async def update_many(self, filter, *args, **kwargs):
        return await self._c.update_many(self._lenient(filter), *args, **kwargs)

    async def delete_one(self, filter, *args, **kwargs):
        return await self._c.delete_one(self._lenient(filter), *args, **kwargs)

    async def delete_many(self, filter, *args, **kwargs):
        return await self._c.delete_many(self._lenient(filter), *args, **kwargs)

    async def find_one_and_update(self, filter, *args, **kwargs):
        return await self._c.find_one_and_update(self._lenient(filter), *args, **kwargs)

    async def count_documents(self, filter=None, *args, **kwargs):
        return await self._c.count_documents(self._strict(filter), *args, **kwargs)

    async def distinct(self, key, filter=None, *args, **kwargs):
        return await self._c.distinct(key, self._strict(filter), *args, **kwargs)

    def aggregate(self, pipeline, *args, **kwargs):
        return self._c.aggregate([{"$match": self._cond()}] + list(pipeline), *args, **kwargs)

    async def insert_one(self, doc, *args, **kwargs):
        return await self._c.insert_one(self._tag(doc), *args, **kwargs)

    async def insert_many(self, docs, *args, **kwargs):
        return await self._c.insert_many([self._tag(d) for d in docs], *args, **kwargs)

    def __getattr__(self, name):
        return getattr(self._c, name)


class _ScopedDB:
    def __init__(self, db, scope: dict):
        self._db, self._s = db, scope

    def _wrap(self, name, coll):
        return _ScopedCollection(coll, name, self._s) if name in SCOPED else coll

    def __getattr__(self, name):
        return self._wrap(name, getattr(self._db, name))

    def __getitem__(self, name):
        return self._wrap(name, self._db[name])


def get_scoped_database():
    db = get_database()
    sc = _INV_SCOPE.get()
    return _ScopedDB(db, sc) if sc else db


async def inventory_project_backfill_v1(db):
    """وسم وثائق المخزن غير الموسومة: وثائق الفروع ← مشروع الفرع، الباقي ← المشروع الافتراضي/الأول"""
    import logging
    from datetime import datetime, timezone
    log = logging.getLogger(__name__)
    if await db.migrations.find_one({"name": "inventory_project_backfill_v1"}):
        return
    branch_project = {b["id"]: b.get("project_id") async for b in db.branches.find({}, {"_id": 0, "id": 1, "project_id": 1}) if b.get("id")}
    default_project = {}
    async for p in db.projects.find({"deleted_at": {"$exists": False}}, {"_id": 0, "id": 1, "tenant_id": 1, "is_default": 1}).sort("created_at", 1):
        if p.get("is_default") or p["tenant_id"] not in default_project:
            default_project[p["tenant_id"]] = p["id"]
    total = 0
    missing = {"$or": [{"project_id": {"$exists": False}}, {"project_id": None}, {"project_id": ""}]}
    for name in SCOPED:
        coll = db[name]
        async for d in coll.find(missing, {"_id": 1, "tenant_id": 1, "branch_id": 1, "to_branch_id": 1, "from_branch_id": 1}):
            pid = branch_project.get(d.get("branch_id")) or branch_project.get(d.get("to_branch_id")) \
                or branch_project.get(d.get("from_branch_id")) \
                or default_project.get(d.get("tenant_id") or "default")
            if pid:
                await coll.update_one({"_id": d["_id"]}, {"$set": {"project_id": pid}})
                total += 1
    await db.migrations.update_one(
        {"name": "inventory_project_backfill_v1"},
        {"$set": {"name": "inventory_project_backfill_v1", "applied": True, "updated": total,
                  "applied_at": datetime.now(timezone.utc).isoformat()}},
        upsert=True,
    )
    log.info(f"🏢 inventory_project_backfill_v1: tagged {total} docs")
