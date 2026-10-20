"""
📉 تنبيهات انخفاض مخزون المشاريع عبر واتساب (مثل تقرير الورديات):
- فوري: عند نزول مادة تحت الحد الأدنى (مرة واحدة حتى يُعاد تعبئتها)
- ملخص يومي صباحاً (8:00 بتوقيت المشروع) بكل المواد الناقصة
المستلمون: مدير المشروع + مالك المشروع + مالك المؤسسة والمدراء (عبر notify_owner_multichannel).
"""
import logging
from datetime import datetime, timezone, timedelta

from .shared import get_database

logger = logging.getLogger(__name__)

KINDS = (("raw_materials", "مواد خام"), ("packaging_materials", "مواد تغليف"))
DAILY_HOUR = 8


def _fmt(q):
    q = float(q or 0)
    return str(int(q)) if q == int(q) else f"{q:.2f}"


async def _low_items(db, tenant_id, project_id):
    items = []
    for coll, label in KINDS:
        async for m in db[coll].find(
            {"tenant_id": tenant_id, "project_id": project_id, "min_quantity": {"$gt": 0},
             "$expr": {"$lte": [{"$ifNull": ["$quantity", 0]}, "$min_quantity"]}},
            {"_id": 0, "id": 1, "name": 1, "unit": 1, "quantity": 1, "min_quantity": 1},
        ):
            items.append({**m, "kind": coll, "kind_label": label})
    return items


def _lines(items):
    return "\n".join(
        f"{'🔴' if float(i.get('quantity') or 0) <= 0 else '🟠'} {i['name']}: {_fmt(i.get('quantity'))} {i.get('unit') or ''}"
        f" (الحد الأدنى {_fmt(i.get('min_quantity'))})"
        for i in items
    )


async def run_stock_alerts(now=None, tenant_id=None):
    from server import notify_owner_multichannel
    db = get_database()
    now = now or datetime.now(timezone.utc)
    pq = {"deleted_at": {"$exists": False}, "is_active": {"$ne": False}}
    if tenant_id:
        pq["tenant_id"] = tenant_id
    async for p in db.projects.find(pq,
                                    {"_id": 0, "id": 1, "tenant_id": 1, "name": 1, "timezone": 1}):
        tid, pid = p["tenant_id"], p["id"]
        items = await _low_items(db, tid, pid)
        low_ids = {i["id"] for i in items}
        state = {s["item_id"] async for s in db.low_stock_alert_state.find({"project_id": pid}, {"_id": 0, "item_id": 1})}
        # المواد التي أُعيدت تعبئتها → تُحذف من الحالة لتُنبَّه مجدداً لاحقاً
        recovered = state - low_ids
        if recovered:
            await db.low_stock_alert_state.delete_many({"project_id": pid, "item_id": {"$in": list(recovered)}})
        new_items = [i for i in items if i["id"] not in state]
        # أول تشغيل للمشروع: تُسجَّل المواد الناقصة الحالية بصمت (الملخص اليومي يغطيها)
        seeded = await db.low_stock_seed.find_one({"project_id": pid})
        if not seeded:
            await db.low_stock_seed.insert_one({"project_id": pid, "tenant_id": tid, "at": now.isoformat()})
            if new_items:
                await db.low_stock_alert_state.insert_many([
                    {"tenant_id": tid, "project_id": pid, "item_id": i["id"], "kind": i["kind"],
                     "alerted_at": now.isoformat(), "seeded": True} for i in new_items])
            new_items = []
        if new_items:
            await notify_owner_multichannel(
                title=f"📉 تنبيه نقص مخزون — {p['name']}",
                message=f"المواد التالية نزلت تحت الحد الأدنى:\n{_lines(new_items)}\n\nيرجى إعادة التعبئة أو إنشاء طلب شراء.",
                severity="warning", category="low_stock", send_email=False, tenant_id=tid,
                metadata={"project_id": pid, "type": "low_stock_instant", "count": len(new_items)},
            )
            await db.low_stock_alert_state.insert_many([
                {"tenant_id": tid, "project_id": pid, "item_id": i["id"], "kind": i["kind"],
                 "alerted_at": now.isoformat()} for i in new_items
            ])

        # ملخص يومي (8 صباحاً بتوقيت بغداد افتراضياً)
        local = now + timedelta(hours=3)
        today = local.strftime("%Y-%m-%d")
        if items and local.hour >= DAILY_HOUR:
            done = await db.low_stock_daily_state.find_one({"project_id": pid, "date": today})
            if not done:
                await notify_owner_multichannel(
                    title=f"📋 ملخص المخزون الناقص اليومي — {p['name']}",
                    message=f"عدد المواد الناقصة: {len(items)}\n{_lines(items)}",
                    severity="info", category="low_stock", send_email=False, tenant_id=tid,
                    metadata={"project_id": pid, "type": "low_stock_daily", "count": len(items)},
                )
                await db.low_stock_daily_state.update_one(
                    {"project_id": pid, "date": today},
                    {"$set": {"project_id": pid, "tenant_id": tid, "date": today, "count": len(items),
                              "sent_at": now.isoformat()}}, upsert=True)
