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

from .shared import get_database, get_current_user, get_user_tenant_id, iraq_date_from_utc, resolve_business_date

router = APIRouter(prefix="/api", tags=["Branch Stock Count"])

# ⭐ خريطة تحويل الوحدات الوزنية/الحجمية (مطابقة لمنطق الخصم في server.py)
_LINK_WEIGHT_MAP = {
    "غرام": 1.0, "كغم": 1000.0, "كيلو": 1000.0, "كجم": 1000.0,
    "gram": 1.0, "kg": 1000.0,
    "مل": 1.0, "لتر": 1000.0, "ml": 1.0, "liter": 1000.0, "l": 1000.0,
}


def _convert_link_consumption_to_main(consumption_qty: float, consumption_unit: str,
                                      main_unit: str, piece_weight: float,
                                      piece_weight_unit: str) -> float:
    """يُحوّل الكمية المُستهلكة من وحدة الرابط إلى الوحدة الرئيسية للمنتج المُصنّع.
    نسخة مطابقة تماماً لدالة الخصم في server.py لضمان تطابق المباع مع الخصم الفعلي."""
    cu = (consumption_unit or "").strip()
    mu = (main_unit or "").strip()
    pwu = (piece_weight_unit or "").strip()
    pw = float(piece_weight or 0)
    if not cu or cu == mu:
        return consumption_qty
    if cu == pwu and pw > 0:
        return consumption_qty / pw
    cu_factor = _LINK_WEIGHT_MAP.get(cu)
    mu_factor = _LINK_WEIGHT_MAP.get(mu)
    if cu_factor is not None and mu_factor is not None:
        return consumption_qty * cu_factor / mu_factor
    pwu_factor = _LINK_WEIGHT_MAP.get(pwu)
    if cu_factor is not None and pwu_factor is not None and pw > 0:
        qty_in_pwu_base = consumption_qty * cu_factor / pwu_factor
        return qty_in_pwu_base / pw
    return consumption_qty


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


# ⭐ جرد مواد التغليف (مسار منفصل)
class PackagingCountItemInput(BaseModel):
    packaging_material_id: str
    actual_qty: float


class PackagingCountSubmit(BaseModel):
    branch_id: str
    business_date: Optional[str] = None
    items: List[PackagingCountItemInput]
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
    
    # ⭐ الوارد اليوم من قسم التصنيع (delivered) — مطابقة بتاريخ العراق (يدعم الشفت الليلي)
    received_map = {}
    base_date = datetime.fromisoformat(business_date).date()
    win_start = (base_date - timedelta(days=1)).isoformat() + "T00:00:00"
    win_end = (base_date + timedelta(days=1)).isoformat() + "T23:59:59"
    bo_query = {
        "to_branch_id": branch_id,
        "status": "delivered",
        "delivered_at": {"$gte": win_start, "$lte": win_end},
    }
    if tenant_id:
        bo_query["$or"] = [
            {"tenant_id": tenant_id},
            {"tenant_id": {"$exists": False}},
            {"tenant_id": None},
        ]
    async for order in db.branch_orders_new.find(bo_query, {"_id": 0, "items": 1, "delivered_at": 1}):
        # الوارد يُنسب لليوم التشغيلي بحسب تاريخ العراق لوقت التسليم (يطابق الشفت الليلي)
        if iraq_date_from_utc(order.get("delivered_at")) != business_date:
            continue
        for it in order.get("items", []) or []:
            pid = it.get("product_id")
            if not pid:
                continue
            received_map[pid] = received_map.get(pid, 0) + (it.get("quantity", 0) or 0)

    # ⭐⭐ المباع اليوم — يُطابق الخصم الفعلي تماماً من مخزون الفرع:
    #   كل منتج بيع نهائي مرتبط بعدة منتجات مُصنّعة (manufactured_links) بكميات/وحدات مختلفة،
    #   فنُفكّك كل عنصر مُباع إلى استهلاكه الحقيقي من كل منتج مُصنّع (مع تحويل الوحدة).
    #   نعتمد business_date للطلب (واعٍ بالشفت الليلي) مع fallback لـ created_at للطلبات القديمة.
    sold_map = {}
    s, e = _day_bounds(business_date)
    orders_query = {
        "branch_id": branch_id,
        "status": {"$nin": ["cancelled", "refunded"]},
        "$or": [
            {"business_date": business_date},
            {"business_date": {"$exists": False}, "created_at": {"$gte": s, "$lte": e}},
            {"business_date": None, "created_at": {"$gte": s, "$lte": e}},
        ],
    }
    if tenant_id:
        orders_query["tenant_id"] = tenant_id
    day_orders = await db.orders.find(orders_query, {"_id": 0, "items": 1}).to_list(5000)

    # تحميل المنتجات النهائية + المنتجات المُصنّعة المرتبطة دفعة واحدة (أداء)
    finished_ids = set()
    for o in day_orders:
        for it in o.get("items", []) or []:
            if it.get("product_id"):
                finished_ids.add(it["product_id"])
    products_map = {}
    if finished_ids:
        async for p in db.products.find(
            {"id": {"$in": list(finished_ids)}},
            {"_id": 0, "id": 1, "manufactured_links": 1, "manufactured_product_id": 1, "manufactured_consumption_qty": 1},
        ):
            products_map[p["id"]] = p
    mp_ids = set()
    for p in products_map.values():
        links = list(p.get("manufactured_links") or [])
        if not links and p.get("manufactured_product_id"):
            links = [{"manufactured_product_id": p.get("manufactured_product_id")}]
        for lk in links:
            if lk.get("manufactured_product_id"):
                mp_ids.add(lk["manufactured_product_id"])
    mp_units = {}
    if mp_ids:
        async for mp in db.manufactured_products.find(
            {"id": {"$in": list(mp_ids)}},
            {"_id": 0, "id": 1, "unit": 1, "piece_weight": 1, "piece_weight_unit": 1},
        ):
            mp_units[mp["id"]] = mp

    for o in day_orders:
        for it in o.get("items", []) or []:
            qty_sold = float(it.get("quantity", 0) or 0)
            if qty_sold <= 0:
                continue
            prod = products_map.get(it.get("product_id"))
            if prod:
                links = list(prod.get("manufactured_links") or [])
                if not links and prod.get("manufactured_product_id"):
                    links = [{
                        "manufactured_product_id": prod.get("manufactured_product_id"),
                        "consumption_qty": prod.get("manufactured_consumption_qty") or 1,
                    }]
                if links:
                    for lk in links:
                        mp_id = lk.get("manufactured_product_id")
                        if not mp_id:
                            continue
                        cq = float(lk.get("consumption_qty") or 1)
                        cu = lk.get("consumption_unit")
                        mp = mp_units.get(mp_id)
                        if cu and mp:
                            cq = _convert_link_consumption_to_main(
                                cq, cu, mp.get("unit") or "حبة",
                                float(mp.get("piece_weight") or 0), mp.get("piece_weight_unit") or "",
                            )
                        sold_map[mp_id] = sold_map.get(mp_id, 0) + cq * qty_sold
                    continue
            # احتياط للطلبات القديمة: منتج مُصنّع مباشر في العنصر
            direct = it.get("manufactured_product_id") or it.get("product_id") or it.get("id")
            if direct:
                sold_map[direct] = sold_map.get(direct, 0) + qty_sold
    
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
    business_date = business_date or await resolve_business_date(tenant_id, branch_id)
    
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
    business_date = payload.business_date or await resolve_business_date(tenant_id, payload.branch_id)
    
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
    business_date = business_date or await resolve_business_date(tenant_id, branch_id)
    
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


@router.get("/branch-stock-count/pending-alerts")
async def pending_count_alerts(branch_id: Optional[str] = None, current_user: dict = Depends(get_current_user)):
    """⭐ تنبيهات الجرد المعلّق لمسؤول المطبخ/الكاشير.
    يُرجع الفروع التي بها وردية مفتوحة (شفت نشط) وتحتاج جرداً ولم يُسجَّل بعد.
    🔒 خصوصية الجرد لكل فرع: يُحصر بفرع المستخدم (أو الفرع المختار) فلا يرى موظف فرع جردَ فرعٍ آخر."""
    db = get_database()
    tenant_id = get_user_tenant_id(current_user)

    # تحديد الفرع المستهدف: المعامل branch_id (تبديل المالك بين الفروع) ثم فرع المستخدم نفسه.
    # الموظف المرتبط بفرع لا يرى إلا فرعه. المالك بلا فرع وبلا معامل يرى الجميع (إشراف).
    user_branch = current_user.get("branch_id")
    target_branch = branch_id if (branch_id and branch_id != "all") else user_branch

    # الفروع ذات وردية مفتوحة حالياً (شفت نشط)
    shift_q = {"status": "open"}
    if tenant_id:
        shift_q["tenant_id"] = tenant_id
    if target_branch:
        shift_q["branch_id"] = target_branch
    open_shifts = await db.shifts.find(
        shift_q, {"_id": 0, "branch_id": 1, "business_date": 1, "started_at": 1, "opened_at": 1}
    ).to_list(100)

    seen = set()
    pending = []
    for sh in open_shifts:
        branch_id = sh.get("branch_id")
        if not branch_id or branch_id in seen:
            continue
        seen.add(branch_id)
        business_date = sh.get("business_date") or iraq_date_from_utc(sh.get("started_at") or sh.get("opened_at"))

        # هل يحتاج الفرع جرداً؟ (مخزون منتجات > 0 أو وارد اليوم)
        inv_q = {"branch_id": branch_id, "quantity": {"$gt": 0}}
        if tenant_id:
            inv_q["$or"] = [
                {"tenant_id": tenant_id}, {"tenant_id": {"$exists": False}}, {"tenant_id": None},
            ]
        has_inv = await db.branch_inventory.count_documents(inv_q, limit=1) > 0
        had_received = False
        if not has_inv:
            base_date = datetime.fromisoformat(business_date).date()
            win_s = (base_date - timedelta(days=1)).isoformat() + "T00:00:00"
            win_e = (base_date + timedelta(days=1)).isoformat() + "T23:59:59"
            bo_q = {"to_branch_id": branch_id, "status": "delivered", "delivered_at": {"$gte": win_s, "$lte": win_e}}
            if tenant_id:
                bo_q["tenant_id"] = tenant_id
            async for _bo in db.branch_orders_new.find(bo_q, {"_id": 0, "delivered_at": 1}):
                if iraq_date_from_utc(_bo.get("delivered_at")) == business_date:
                    had_received = True
                    break
        if not has_inv and not had_received:
            continue

        # هل سُجِّل الجرد؟
        cq = {"branch_id": branch_id, "business_date": business_date, "status": "submitted"}
        if tenant_id:
            cq["tenant_id"] = tenant_id
        submitted = await db.branch_stock_counts.find_one(cq, {"_id": 0, "id": 1})
        if submitted:
            continue

        branch = await db.branches.find_one({"id": branch_id}, {"_id": 0, "name": 1})
        pending.append({
            "branch_id": branch_id,
            "branch_name": (branch or {}).get("name") or branch_id,
            "business_date": business_date,
        })

    return {"pending": pending, "count": len(pending)}



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



# ============================================================================
# 📦 جرد مواد التغليف للفروع (مسار منفصل)
# ============================================================================

@router.get("/branch-stock-count/packaging-today")
async def get_packaging_count_today(
    branch_id: str,
    business_date: Optional[str] = None,
    current_user: dict = Depends(get_current_user),
):
    """قالب جرد مواد التغليف لفرع: لكل مادة تغليف في مخزن الفرع → المتبقي المتوقع (المُستلم − المُستخدم)."""
    db = get_database()
    tenant_id = get_user_tenant_id(current_user)
    business_date = business_date or await resolve_business_date(tenant_id, branch_id)

    inv_query = {"branch_id": branch_id}
    if tenant_id:
        inv_query["$or"] = [
            {"tenant_id": tenant_id}, {"tenant_id": {"$exists": False}}, {"tenant_id": None},
        ]
    rows = []
    async for pkg in db.branch_packaging_inventory.find(inv_query, {"_id": 0}):
        received = float(pkg.get("quantity") or 0)
        used = float(pkg.get("used_quantity") or 0)
        expected = round(received - used, 3)
        rows.append({
            "packaging_material_id": pkg.get("packaging_material_id"),
            "name": pkg.get("name") or pkg.get("material_name") or "—",
            "unit": pkg.get("unit") or "قطعة",
            "received_qty": round(received, 3),
            "used_qty": round(used, 3),
            "expected_qty": expected,
            "unit_cost": float(pkg.get("cost_per_unit") or 0),
        })

    # جرد سابق اليوم؟
    prev_query = {"branch_id": branch_id, "business_date": business_date, "kind": "packaging"}
    if tenant_id:
        prev_query["tenant_id"] = tenant_id
    existing = await db.branch_packaging_counts.find_one(prev_query, {"_id": 0})
    actual_map = {}
    if existing:
        for it in existing.get("items", []) or []:
            actual_map[it.get("packaging_material_id")] = it.get("actual_qty")
    for r in rows:
        r["actual_qty"] = actual_map.get(r["packaging_material_id"])

    return {
        "branch_id": branch_id,
        "business_date": business_date,
        "items": rows,
        "has_packaging": len(rows) > 0,
        "already_submitted": bool(existing),
    }


@router.post("/branch-stock-count/submit-packaging")
async def submit_packaging_count(
    payload: PackagingCountSubmit,
    current_user: dict = Depends(get_current_user),
):
    """تسجيل جرد مواد التغليف: يحسب الفقد (المتوقع − الفعلي)، يسجّل حركة فقد تغليف،
    ويعدّل used_quantity ليطابق المتبقي الفعلي."""
    db = get_database()
    tenant_id = get_user_tenant_id(current_user)
    business_date = payload.business_date or await resolve_business_date(tenant_id, payload.branch_id)
    now_iso = datetime.now(timezone.utc).isoformat()
    performed_by_name = current_user.get("full_name") or current_user.get("username")

    branch = await db.branches.find_one({"id": payload.branch_id}, {"_id": 0, "name": 1})
    branch_name = (branch or {}).get("name") or payload.branch_id

    # حذف حركات فقد التغليف السابقة لنفس الفرع/اليوم (منع التكرار)
    await db.inventory_movements.delete_many({
        "type": "branch_packaging_loss",
        "branch_id": payload.branch_id,
        "business_date": business_date,
    })

    saved_items = []
    total_variance = 0.0
    total_loss_value = 0.0

    for input_item in payload.items:
        pkg = await db.branch_packaging_inventory.find_one({
            "branch_id": payload.branch_id,
            "packaging_material_id": input_item.packaging_material_id,
        }, {"_id": 0})
        if not pkg:
            continue
        received = float(pkg.get("quantity") or 0)
        used = float(pkg.get("used_quantity") or 0)
        expected = round(received - used, 3)
        actual = max(0.0, float(input_item.actual_qty or 0))
        variance = round(expected - actual, 3)  # موجب = فقد
        unit_cost = float(pkg.get("cost_per_unit") or 0)
        variance_cost = round(variance * unit_cost, 2) if variance > 0 else 0.0

        saved_items.append({
            "packaging_material_id": input_item.packaging_material_id,
            "name": pkg.get("name") or "—",
            "unit": pkg.get("unit") or "قطعة",
            "expected_qty": expected,
            "actual_qty": actual,
            "variance": variance,
            "variance_cost": variance_cost,
            "unit_cost": unit_cost,
        })

        if variance > 0:
            total_variance += variance
            total_loss_value += variance_cost

        # عدّل used_quantity ليطابق المتبقي الفعلي: remaining = received - used = actual
        await db.branch_packaging_inventory.update_one(
            {"id": pkg.get("id")},
            {"$set": {"used_quantity": round(received - actual, 3), "last_updated": now_iso, "last_count_at": now_iso}},
        )

        if variance > 0:
            await db.inventory_movements.insert_one({
                "id": str(uuid.uuid4()),
                "tenant_id": tenant_id,
                "type": "branch_packaging_loss",
                "category": "packaging",
                "product_id": input_item.packaging_material_id,
                "product_name": pkg.get("name"),
                "material_name": pkg.get("name"),
                "quantity": variance,
                "unit": pkg.get("unit") or "قطعة",
                "total_value": variance_cost,
                "cost_after_waste": variance_cost,
                "branch_id": payload.branch_id,
                "branch_name": branch_name,
                "performed_by_name": performed_by_name,
                "notes": f"فقد تغليف من الجرد — متوقع {expected}، فعلي {actual}",
                "business_date": business_date,
                "created_at": now_iso,
            })

    existing_query = {"branch_id": payload.branch_id, "business_date": business_date, "kind": "packaging"}
    if tenant_id:
        existing_query["tenant_id"] = tenant_id
    existing = await db.branch_packaging_counts.find_one(existing_query, {"_id": 0})

    doc = {
        "branch_id": payload.branch_id,
        "branch_name": branch_name,
        "business_date": business_date,
        "kind": "packaging",
        "items": saved_items,
        "total_variance": round(total_variance, 3),
        "total_loss_value": round(total_loss_value, 2),
        "status": "submitted",
        "submitted_by_id": current_user.get("id"),
        "submitted_by_name": performed_by_name,
        "submitted_at": now_iso,
        "notes": payload.notes,
        "tenant_id": tenant_id,
    }
    if existing:
        await db.branch_packaging_counts.update_one({"id": existing.get("id")}, {"$set": doc})
        doc["id"] = existing.get("id")
    else:
        doc["id"] = str(uuid.uuid4())
        doc["created_at"] = now_iso
        await db.branch_packaging_counts.insert_one(doc)

    return {
        "message": "تم حفظ جرد التغليف",
        "id": doc["id"],
        "total_variance": doc["total_variance"],
        "total_loss_value": doc["total_loss_value"],
        "items_count": len(saved_items),
    }
