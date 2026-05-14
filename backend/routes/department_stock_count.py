"""
الجرد الشهري للأقسام (Department Monthly Stocktake)

3 أقسام يُمكن جردها شهرياً:
- manufacturing: قسم التصنيع (manufacturing_inventory)
- warehouse_raw: المخزن الرئيسي للمواد الخام (raw_materials)
- packaging: مخزن مواد التغليف (packaging_materials)

السلوك:
- زر الجرد يظهر فقط في آخر 5 أيام من الشهر (من اليوم 25 إلى نهاية الشهر).
- بدء الشهر الجديد → الزر يختفي تلقائياً.
- بعد الإرسال، يحفظ الجرد بكامل التفاصيل ويظهر في تقرير المخزون والتصنيع.
"""

from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import List, Optional, Tuple
from datetime import datetime, timezone
from calendar import monthrange
import uuid

from .shared import get_database, get_current_user, get_user_tenant_id

router = APIRouter(prefix="/api", tags=["Department Stock Count"])


DEPARTMENT_COLLECTIONS = {
    "manufacturing": "manufacturing_inventory",
    "warehouse_raw": "raw_materials",
    "packaging": "packaging_materials",
}

DEPARTMENT_LABELS = {
    "manufacturing": "قسم التصنيع",
    "warehouse_raw": "المخزن الرئيسي (مواد خام)",
    "packaging": "مخزن مواد التغليف",
}


class StockCountItemInput(BaseModel):
    item_id: str
    actual_qty: float
    notes: Optional[str] = None


class StockCountSubmit(BaseModel):
    department: str
    period: Optional[str] = None  # YYYY-MM
    items: List[StockCountItemInput]
    notes: Optional[str] = None


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _current_period() -> str:
    n = _now()
    return f"{n.year:04d}-{n.month:02d}"


def _is_due_window() -> Tuple[bool, int]:
    """يحدد إن كان اليوم ضمن آخر 5 أيام من الشهر.
    
    Returns: (is_due, days_remaining_in_month)
    """
    n = _now()
    _, last_day = monthrange(n.year, n.month)
    days_remaining = last_day - n.day
    return (n.day >= 25, days_remaining)


async def _build_template(db, department: str, period: str, tenant_id: Optional[str]):
    """يبني قالب الجرد: لكل صنف نُرجع الكمية النظامية (من DB) ليُدخل المستخدم الفعلية."""
    coll_name = DEPARTMENT_COLLECTIONS.get(department)
    if not coll_name:
        raise HTTPException(status_code=400, detail="قسم غير معروف")
    
    coll = db[coll_name]
    q = {}
    if tenant_id:
        q["$or"] = [
            {"tenant_id": tenant_id},
            {"tenant_id": {"$exists": False}},
            {"tenant_id": None},
        ]
    
    raw_items = await coll.find(q, {"_id": 0}).to_list(5000)
    items = []
    for it in raw_items:
        unit_cost = float(it.get("cost_per_unit") or it.get("unit_cost") or 0)
        # حقل الاسم يختلف حسب المجموعة
        item_name = it.get("name") or it.get("raw_material_name") or it.get("material_name") or ""
        items.append({
            "item_id": it.get("id"),
            "item_name": item_name,
            "unit": it.get("unit", ""),
            "system_qty": float(it.get("quantity", 0) or 0),
            "min_quantity": float(it.get("min_quantity", 0) or 0),
            "unit_cost": round(unit_cost, 2),
            "actual_qty": None,
            "variance": None,
            "variance_cost": None,
        })
    items.sort(key=lambda x: x.get("item_name") or "")
    return items


@router.get("/department-stock-count/is-due")
async def is_due(current_user: dict = Depends(get_current_user)):
    """يخبر الواجهة إن كان وقت الجرد قد حلّ (آخر 5 أيام من الشهر)."""
    is_due_, days_remaining = _is_due_window()
    period = _current_period()
    db = get_database()
    tenant_id = get_user_tenant_id(current_user)
    
    # حالة كل قسم لهذا الشهر (مُسجل أم لا)
    statuses = {}
    for dept in DEPARTMENT_COLLECTIONS:
        q = {"department": dept, "period": period, "status": "submitted"}
        if tenant_id:
            q["tenant_id"] = tenant_id
        found = await db.department_stock_counts.find_one(q, {"_id": 0, "id": 1, "submitted_at": 1, "submitted_by_name": 1})
        statuses[dept] = {
            "submitted": bool(found),
            "submitted_at": found.get("submitted_at") if found else None,
            "submitted_by_name": found.get("submitted_by_name") if found else None,
        }
    
    return {
        "is_due": is_due_,
        "days_remaining_in_month": days_remaining,
        "period": period,
        "today": _now().date().isoformat(),
        "departments": statuses,
    }


@router.get("/department-stock-count/template")
async def get_template(
    department: str,
    period: Optional[str] = None,
    current_user: dict = Depends(get_current_user),
):
    """يُرجع قالب الجرد لقسم محدد (وإن كان هناك مسوّدة/مُسجل يدمج البيانات)."""
    db = get_database()
    tenant_id = get_user_tenant_id(current_user)
    period = period or _current_period()
    
    items = await _build_template(db, department, period, tenant_id)
    
    q = {"department": department, "period": period}
    if tenant_id:
        q["tenant_id"] = tenant_id
    existing = await db.department_stock_counts.find_one(q, {"_id": 0})
    
    if existing:
        saved_map = {it.get("item_id"): it for it in (existing.get("items") or [])}
        for it in items:
            saved = saved_map.get(it["item_id"])
            if saved:
                it["actual_qty"] = saved.get("actual_qty")
                it["variance"] = saved.get("variance")
                it["variance_cost"] = saved.get("variance_cost")
                it["notes"] = saved.get("notes")
        return {
            "department": department,
            "department_label": DEPARTMENT_LABELS.get(department),
            "period": period,
            "items": items,
            "status": existing.get("status"),
            "submitted_by_name": existing.get("submitted_by_name"),
            "submitted_at": existing.get("submitted_at"),
            "total_variance": existing.get("total_variance"),
            "total_loss_value": existing.get("total_loss_value"),
            "notes": existing.get("notes"),
            "has_submitted": True,
        }
    
    return {
        "department": department,
        "department_label": DEPARTMENT_LABELS.get(department),
        "period": period,
        "items": items,
        "status": "pending",
        "has_submitted": False,
    }


@router.post("/department-stock-count/submit")
async def submit_count(payload: StockCountSubmit, current_user: dict = Depends(get_current_user)):
    """يحفظ الجرد + يُحدّث الكميات الفعلية في DB + يسجل حركات الفقد/الفائض."""
    db = get_database()
    tenant_id = get_user_tenant_id(current_user)
    period = payload.period or _current_period()
    coll_name = DEPARTMENT_COLLECTIONS.get(payload.department)
    if not coll_name:
        raise HTTPException(status_code=400, detail="قسم غير معروف")
    
    items_template = await _build_template(db, payload.department, period, tenant_id)
    template_map = {it["item_id"]: it for it in items_template}
    
    now_iso = _now().isoformat()
    performed_by_name = current_user.get("full_name") or current_user.get("username")
    
    saved_items = []
    total_variance = 0.0
    total_loss_value = 0.0
    
    # حذف حركات stocktake_variance سابقة لنفس الفترة/القسم (لمنع تكرار)
    await db.inventory_movements.delete_many({
        "type": "stocktake_variance",
        "department": payload.department,
        "period": period,
    })
    
    for input_item in payload.items:
        tmpl = template_map.get(input_item.item_id)
        if not tmpl:
            continue
        actual_qty = max(0.0, float(input_item.actual_qty or 0))
        system_qty = tmpl["system_qty"]
        variance = round(system_qty - actual_qty, 4)  # موجب = فقد، سالب = فائض
        unit_cost = tmpl.get("unit_cost") or 0
        variance_cost = round(variance * unit_cost, 2)
        
        saved_items.append({
            "item_id": input_item.item_id,
            "item_name": tmpl["item_name"],
            "unit": tmpl["unit"],
            "system_qty": system_qty,
            "actual_qty": actual_qty,
            "variance": variance,
            "variance_cost": variance_cost,
            "unit_cost": unit_cost,
            "notes": input_item.notes,
        })
        
        if variance > 0:
            total_variance += variance
            total_loss_value += variance_cost
        
        # تحديث الكمية الفعلية في DB
        await db[coll_name].update_one(
            {"id": input_item.item_id},
            {"$set": {"quantity": actual_qty, "last_updated": now_iso, "last_stocktake_at": now_iso}},
        )
        
        # سجل حركة لكل فرق غير صفري
        if abs(variance) > 0.001:
            await db.inventory_movements.insert_one({
                "id": str(uuid.uuid4()),
                "tenant_id": tenant_id,
                "type": "stocktake_variance",
                "category": "stocktake",
                "department": payload.department,
                "period": period,
                "material_id": input_item.item_id,
                "material_name": tmpl["item_name"],
                "quantity": abs(variance),
                "unit": tmpl["unit"],
                "total_value": abs(variance_cost),
                "cost_per_unit": unit_cost,
                "cost_before_waste": 0 if variance > 0 else 0,
                "cost_after_waste": variance_cost if variance > 0 else 0,
                "is_loss": variance > 0,
                "is_surplus": variance < 0,
                "performed_by_name": performed_by_name,
                "notes": f"جرد شهري — نظامي {system_qty}، فعلي {actual_qty} ({'فقد' if variance > 0 else 'فائض'})",
                "created_at": now_iso,
            })
    
    # حفظ السجل
    q = {"department": payload.department, "period": period}
    if tenant_id:
        q["tenant_id"] = tenant_id
    existing = await db.department_stock_counts.find_one(q, {"_id": 0})
    
    doc = {
        "department": payload.department,
        "department_label": DEPARTMENT_LABELS.get(payload.department),
        "period": period,
        "items": saved_items,
        "total_variance": round(total_variance, 4),
        "total_loss_value": round(total_loss_value, 2),
        "status": "submitted",
        "submitted_by_id": current_user.get("id"),
        "submitted_by_name": performed_by_name,
        "submitted_at": now_iso,
        "notes": payload.notes,
        "tenant_id": tenant_id,
    }
    if existing:
        await db.department_stock_counts.update_one({"id": existing.get("id")}, {"$set": doc})
        doc["id"] = existing.get("id")
    else:
        doc["id"] = str(uuid.uuid4())
        doc["created_at"] = now_iso
        await db.department_stock_counts.insert_one(doc)
    
    doc.pop("_id", None)
    return {"message": "تم حفظ الجرد الشهري بنجاح", "count": doc}


@router.get("/department-stock-count/history")
async def history(
    department: Optional[str] = None,
    limit: int = 24,
    current_user: dict = Depends(get_current_user),
):
    """قائمة الجرود الشهرية السابقة (تستخدم في تقرير المخازن)."""
    db = get_database()
    tenant_id = get_user_tenant_id(current_user)
    q = {}
    if department:
        q["department"] = department
    if tenant_id:
        q["$or"] = [
            {"tenant_id": tenant_id},
            {"tenant_id": {"$exists": False}},
            {"tenant_id": None},
        ]
    rows = await db.department_stock_counts.find(q, {"_id": 0}).sort("period", -1).to_list(int(limit) or 24)
    return {"counts": rows}
