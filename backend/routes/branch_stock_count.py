"""
الجرد اليومي للفروع (Branch Daily Stock Count)
- مسؤول الفرع/المطبخ يدخل الكمية الفعلية المتبقية من كل منتج بنهاية اليوم
- النظام يحسب: المتوقع = افتتاحي + وارد − مباع
- الفقد = المتوقع − الفعلي (يُوزَّع تلقائياً على مكونات الوصفة)
- يمنع إغلاق الصندوق إذا كان الفرع يحوي منتجات ولم يُسجَّل الجرد
"""

from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime, timezone, timedelta
import uuid

from .shared import get_database, get_current_user, get_user_tenant_id

router = APIRouter(prefix="/api", tags=["Branch Stock Count"])


# ==================== MODELS ====================

class StockCountItemInput(BaseModel):
    product_id: str
    actual_qty: float
    notes: Optional[str] = None


class StockCountSubmit(BaseModel):
    branch_id: str
    business_date: Optional[str] = None  # YYYY-MM-DD; default = today
    items: List[StockCountItemInput]
    notes: Optional[str] = None


# ==================== HELPERS ====================

def _today_iso() -> str:
    return datetime.now(timezone.utc).date().isoformat()


def _day_bounds(date_iso: str):
    return date_iso + "T00:00:00", date_iso + "T23:59:59"


async def _build_count_template(db, branch_id: str, business_date: str, tenant_id: Optional[str]):
    """يبني قالب الجرد اليومي لفرع لمنتجاته المصنّعة:
    لكل منتج في مخزن الفرع: opening, received, sold, expected.
    """
    # جلب مخزون الفرع الحالي (يمثل: الافتتاحي + الوارد − المباع كرصيد جاري)
    inv_query = {"branch_id": branch_id}
    if tenant_id:
        inv_query["$or"] = [
            {"tenant_id": tenant_id},
            {"tenant_id": {"$exists": False}},
            {"tenant_id": None},
        ]
    branch_inv = await db.branch_inventory.find(inv_query, {"_id": 0}).to_list(2000)
    
    # جرد البارحة (لو موجود) → الافتتاحي = actual_qty للبارحة
    prev_date = (datetime.fromisoformat(business_date).date() - timedelta(days=1)).isoformat()
    prev_count_query = {"branch_id": branch_id, "business_date": prev_date, "status": "submitted"}
    if tenant_id:
        prev_count_query["tenant_id"] = tenant_id
    prev_count = await db.branch_stock_counts.find_one(prev_count_query, {"_id": 0})
    prev_actual_map = {}
    if prev_count:
        for it in prev_count.get("items", []) or []:
            prev_actual_map[it.get("product_id")] = it.get("actual_qty", 0)
    
    # الوارد اليوم من قسم التصنيع (delivered today) — من branch_orders_new
    s, e = _day_bounds(business_date)
    received_map = {}
    bo_query = {
        "to_branch_id": branch_id,
        "status": "delivered",
        "delivered_at": {"$gte": s, "$lte": e},
    }
    if tenant_id:
        bo_query["tenant_id"] = tenant_id
    async for order in db.branch_orders_new.find(bo_query, {"_id": 0, "items": 1}):
        for it in order.get("items", []) or []:
            pid = it.get("product_id")
            if not pid:
                continue
            received_map[pid] = received_map.get(pid, 0) + (it.get("quantity", 0) or 0)
    
    # المباع اليوم من POS — orders today بنفس branch_id
    sold_map = {}
    orders_query = {
        "branch_id": branch_id,
        "created_at": {"$gte": s, "$lte": e},
        "status": {"$nin": ["cancelled", "refunded"]},
    }
    if tenant_id:
        orders_query["tenant_id"] = tenant_id
    async for order in db.orders.find(orders_query, {"_id": 0, "items": 1}):
        for it in order.get("items", []) or []:
            pid = it.get("manufactured_product_id") or it.get("product_id") or it.get("id")
            if not pid:
                continue
            sold_map[pid] = sold_map.get(pid, 0) + (it.get("quantity", 0) or 0)
    
    # تجميع كل منتج (الموجود حالياً أو الوارد اليوم أو من جرد البارحة)
    all_product_ids = set()
    inv_map = {}
    for inv in branch_inv:
        pid = inv.get("product_id")
        if not pid:
            continue
        all_product_ids.add(pid)
        inv_map[pid] = inv
    for pid in received_map:
        all_product_ids.add(pid)
    for pid in prev_actual_map:
        all_product_ids.add(pid)
    
    # بناء العناصر مع معلومات الوصفة والتكلفة
    items = []
    for pid in all_product_ids:
        inv = inv_map.get(pid, {})
        # جلب المنتج المصنّع (للوصفة والكلفة)
        product = await db.manufactured_products.find_one({"id": pid}, {"_id": 0})
        if not product:
            # ربما تم حذفه — تخطي
            continue
        received_qty = received_map.get(pid, 0)
        sold_qty = sold_map.get(pid, 0)
        current_qty = inv.get("quantity", 0) or 0  # الكمية الحالية في DB
        
        # الافتتاحي: من جرد البارحة، أو محسوب رجوعاً من المخزون الحالي
        if pid in prev_actual_map:
            opening_qty = prev_actual_map[pid]
        else:
            # لا يوجد جرد سابق → الافتتاحي = الحالي - الوارد اليوم + المباع اليوم
            opening_qty = max(0, current_qty - received_qty + sold_qty)
        
        expected_qty = opening_qty + received_qty - sold_qty
        
        # تكلفة الوحدة المعتمدة (بعد الهدر)
        unit_cost = product.get("production_cost") or product.get("raw_material_cost_after_waste") or product.get("raw_material_cost") or 0
        
        items.append({
            "product_id": pid,
            "product_name": product.get("name"),
            "unit": product.get("unit"),
            "opening_qty": round(opening_qty, 4),
            "received_qty": received_qty,
            "sold_qty": sold_qty,
            "expected_qty": round(expected_qty, 4),
            "current_qty_in_db": round(current_qty, 4),
            "unit_cost": round(unit_cost, 2),
            "recipe": product.get("recipe", []),
            "actual_qty": None,  # سيُدخل من قبل المسؤول
            "variance": None,
            "variance_cost": None,
        })
    
    items.sort(key=lambda x: x.get("product_name") or "")
    return items, prev_count


# ==================== ENDPOINTS ====================

@router.get("/branch-stock-count/today")
async def get_today_count(
    branch_id: str,
    business_date: Optional[str] = None,
    current_user: dict = Depends(get_current_user),
):
    """يُرجع قالب الجرد اليومي للفرع (مع الكميات المُحسوبة)؛ إذا كان قد سُجّل اليوم يُرجع المسجّل."""
    db = get_database()
    tenant_id = get_user_tenant_id(current_user)
    business_date = business_date or _today_iso()
    
    # هل يوجد جرد مسجل اليوم؟
    existing_query = {"branch_id": branch_id, "business_date": business_date}
    if tenant_id:
        existing_query["tenant_id"] = tenant_id
    existing = await db.branch_stock_counts.find_one(existing_query, {"_id": 0})
    
    items, prev_count = await _build_count_template(db, branch_id, business_date, tenant_id)
    
    if existing:
        # دمج actual_qty من السجل الموجود لو وُجد
        actual_map = {it.get("product_id"): it for it in (existing.get("items") or [])}
        for it in items:
            saved = actual_map.get(it["product_id"])
            if saved:
                it["actual_qty"] = saved.get("actual_qty")
                it["variance"] = saved.get("variance")
                it["variance_cost"] = saved.get("variance_cost")
                it["notes"] = saved.get("notes")
        return {
            "branch_id": branch_id,
            "business_date": business_date,
            "items": items,
            "status": existing.get("status"),
            "submitted_by_name": existing.get("submitted_by_name"),
            "submitted_at": existing.get("submitted_at"),
            "total_variance": existing.get("total_variance"),
            "total_loss_value": existing.get("total_loss_value"),
            "notes": existing.get("notes"),
            "has_submitted_today": True,
        }
    
    return {
        "branch_id": branch_id,
        "business_date": business_date,
        "items": items,
        "status": "pending",
        "has_submitted_today": False,
        "prev_count_date": prev_count.get("business_date") if prev_count else None,
    }


@router.post("/branch-stock-count/submit")
async def submit_count(payload: StockCountSubmit, current_user: dict = Depends(get_current_user)):
    """يحفظ الجرد اليومي ويُحدّث مخزون الفرع + يسجل حركات الفقد."""
    db = get_database()
    tenant_id = get_user_tenant_id(current_user)
    business_date = payload.business_date or _today_iso()
    
    # ابن القالب لجلب الكميات المتوقعة الصحيحة
    template_items, _ = await _build_count_template(db, payload.branch_id, business_date, tenant_id)
    template_map = {it["product_id"]: it for it in template_items}
    
    # احصل على بيانات الفرع
    branch = await db.branches.find_one({"id": payload.branch_id}, {"_id": 0, "name": 1})
    branch_name = (branch or {}).get("name") or payload.branch_id
    
    now_iso = datetime.now(timezone.utc).isoformat()
    performed_by_name = current_user.get("full_name") or current_user.get("username")
    
    saved_items = []
    total_variance = 0.0
    total_loss_value = 0.0
    
    # حذف حركات الفقد السابقة لنفس الفرع/اليوم (لمنع التكرار عند إعادة التسجيل)
    await db.inventory_movements.delete_many({
        "type": "branch_loss",
        "branch_id": payload.branch_id,
        "business_date": business_date,
    })
    
    for input_item in payload.items:
        tmpl = template_map.get(input_item.product_id)
        if not tmpl:
            continue
        actual_qty = max(0.0, float(input_item.actual_qty or 0))
        expected_qty = tmpl["expected_qty"]
        variance = round(expected_qty - actual_qty, 4)  # موجب = فقد
        variance_cost = round(variance * (tmpl.get("unit_cost") or 0), 2)
        
        # توزيع الفقد على مكونات الوصفة
        # ملاحظة: cost_before_waste = 0 لأن الفقد غير مدرج في الوصفة (يُحسب كهدر كامل)
        recipe_breakdown = []
        if variance > 0 and tmpl.get("recipe"):
            for ing in tmpl["recipe"]:
                qty_lost = (ing.get("quantity", 0) or 0) * variance
                cost_per_unit = ing.get("cost_per_unit", 0) or 0
                waste_pct = ing.get("waste_percentage", 0) or 0
                effective_cost = (cost_per_unit / (1 - waste_pct / 100)) if (0 < waste_pct < 100) else cost_per_unit
                cost_lost = qty_lost * effective_cost
                recipe_breakdown.append({
                    "raw_material_id": ing.get("raw_material_id"),
                    "raw_material_name": ing.get("raw_material_name"),
                    "quantity": round(qty_lost, 4),
                    "qty_lost": round(qty_lost, 4),
                    "unit": ing.get("unit"),
                    "cost_per_unit": cost_per_unit,
                    "waste_percentage": waste_pct,
                    "cost_before_waste": 0,  # الفقد ليس مدرج في الوصفة الأصلية
                    "cost_after_waste": round(cost_lost, 2),
                    "waste_value": round(cost_lost, 2),
                })
        
        saved_items.append({
            "product_id": input_item.product_id,
            "product_name": tmpl.get("product_name"),
            "unit": tmpl.get("unit"),
            "opening_qty": tmpl["opening_qty"],
            "received_qty": tmpl["received_qty"],
            "sold_qty": tmpl["sold_qty"],
            "expected_qty": expected_qty,
            "actual_qty": actual_qty,
            "variance": variance,
            "variance_cost": variance_cost,
            "unit_cost": tmpl.get("unit_cost"),
            "recipe_breakdown": recipe_breakdown,
            "notes": input_item.notes,
        })
        
        if variance > 0:
            total_variance += variance
            total_loss_value += variance_cost
        
        # تحديث مخزون الفرع لتطابق الكمية الفعلية
        await db.branch_inventory.update_one(
            {"branch_id": payload.branch_id, "product_id": input_item.product_id},
            {
                "$set": {
                    "quantity": actual_qty,
                    "last_updated": now_iso,
                    "last_count_at": now_iso,
                }
            },
            upsert=False,
        )
        
        # سجل حركة "branch_loss" لو فيه فقد
        if variance > 0:
            await db.inventory_movements.insert_one({
                "id": str(uuid.uuid4()),
                "tenant_id": tenant_id,
                "type": "branch_loss",
                "category": "manufacturing",  # لأنه يدخل في حساب كفاءة الهدر
                "product_id": input_item.product_id,
                "product_name": tmpl.get("product_name"),
                "material_name": tmpl.get("product_name"),
                "quantity": variance,
                "unit": tmpl.get("unit"),
                "total_value": variance_cost,
                "cost_before_waste": 0,  # الفقد غير مدرج (هدر كامل)
                "cost_after_waste": variance_cost,
                "consumed_ingredients": recipe_breakdown,
                "branch_id": payload.branch_id,
                "branch_name": branch_name,
                "performed_by_name": performed_by_name,
                "notes": f"فقد ناتج عن الجرد اليومي — متوقع {expected_qty}، فعلي {actual_qty}",
                "business_date": business_date,
                "created_at": now_iso,
            })
    
    # حفظ السجل
    existing_query = {"branch_id": payload.branch_id, "business_date": business_date}
    if tenant_id:
        existing_query["tenant_id"] = tenant_id
    existing = await db.branch_stock_counts.find_one(existing_query, {"_id": 0})
    
    doc = {
        "branch_id": payload.branch_id,
        "branch_name": branch_name,
        "business_date": business_date,
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
        await db.branch_stock_counts.update_one(
            {"id": existing.get("id")},
            {"$set": doc},
        )
        doc["id"] = existing.get("id")
    else:
        doc["id"] = str(uuid.uuid4())
        doc["created_at"] = now_iso
        await db.branch_stock_counts.insert_one(doc)
    
    doc.pop("_id", None)
    return {
        "message": "تم حفظ الجرد اليومي",
        "count": doc,
    }


@router.get("/branch-stock-count/check")
async def check_pending_count(
    branch_id: str,
    business_date: Optional[str] = None,
    current_user: dict = Depends(get_current_user),
):
    """يفحص هل الفرع بحاجة لجرد قبل إغلاق الصندوق.
    
    Logic:
    - إذا الفرع ليس به مخزون منتجات (quantity > 0): لا حاجة → can_close=True
    - إذا فيه مخزون ولم يُسجل جرد اليوم: can_close=False
    - إذا سُجل جرد اليوم: can_close=True
    """
    db = get_database()
    tenant_id = get_user_tenant_id(current_user)
    business_date = business_date or _today_iso()
    
    # هل يوجد مخزون في الفرع؟
    inv_query = {"branch_id": branch_id, "quantity": {"$gt": 0}}
    if tenant_id:
        inv_query["$or"] = [
            {"tenant_id": tenant_id},
            {"tenant_id": {"$exists": False}},
            {"tenant_id": None},
        ]
    has_inventory = await db.branch_inventory.count_documents(inv_query, limit=1) > 0
    
    # أيضاً: لو وصلت طلبات اليوم
    s, e = _day_bounds(business_date)
    bo_query = {
        "to_branch_id": branch_id,
        "status": "delivered",
        "delivered_at": {"$gte": s, "$lte": e},
    }
    if tenant_id:
        bo_query["tenant_id"] = tenant_id
    had_received = await db.branch_orders_new.count_documents(bo_query, limit=1) > 0
    
    if not has_inventory and not had_received:
        return {
            "branch_id": branch_id,
            "business_date": business_date,
            "needs_count": False,
            "can_close": True,
            "reason": "لا يوجد مخزون منتجات مصنعة في هذا الفرع",
        }
    
    existing_query = {"branch_id": branch_id, "business_date": business_date, "status": "submitted"}
    if tenant_id:
        existing_query["tenant_id"] = tenant_id
    existing = await db.branch_stock_counts.find_one(existing_query, {"_id": 0, "id": 1, "submitted_at": 1, "total_loss_value": 1})
    
    if existing:
        return {
            "branch_id": branch_id,
            "business_date": business_date,
            "needs_count": True,
            "can_close": True,
            "submitted_at": existing.get("submitted_at"),
            "total_loss_value": existing.get("total_loss_value", 0),
        }
    
    return {
        "branch_id": branch_id,
        "business_date": business_date,
        "needs_count": True,
        "can_close": False,
        "reason": "يجب إدخال الجرد اليومي للمنتجات قبل إغلاق الصندوق",
    }


@router.get("/branch-stock-count/history")
async def history(
    branch_id: Optional[str] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    current_user: dict = Depends(get_current_user),
):
    """قائمة الجرود السابقة."""
    db = get_database()
    tenant_id = get_user_tenant_id(current_user)
    
    if not start_date:
        start_date = (datetime.now(timezone.utc) - timedelta(days=30)).date().isoformat()
    if not end_date:
        end_date = _today_iso()
    
    q = {"business_date": {"$gte": start_date, "$lte": end_date}}
    if branch_id:
        q["branch_id"] = branch_id
    if tenant_id:
        q["$or"] = [
            {"tenant_id": tenant_id},
            {"tenant_id": {"$exists": False}},
            {"tenant_id": None},
        ]
    
    rows = await db.branch_stock_counts.find(q, {"_id": 0}).sort("business_date", -1).to_list(500)
    return {"counts": rows, "period": {"start": start_date, "end": end_date}}
