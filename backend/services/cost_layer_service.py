"""
Cost Layer Service (FIFO) — إدارة طبقات تكلفة المواد الخام

الفكرة:
- كل دفعة شراء تُسجَّل كطبقة مستقلة (cost_layer) بسعرها وكميتها.
- عند الاستهلاك: يُسحب من أقدم طبقة نشطة أولاً (FIFO).
- raw_materials.cost_per_unit = سعر أقدم طبقة نشطة (الـ "current effective cost").
- raw_materials.quantity = مجموع remaining_quantity لكل الطبقات النشطة.
"""
from datetime import datetime, timezone
import uuid
from typing import Optional


PRICE_DIFF_THRESHOLD_PERCENT = 1.0  # نسبة الفرق التي تُولِّد تنبيهاً (≥ 1%)


async def add_cost_layer(
    db,
    *,
    material_id: str,
    material_name: str,
    unit: str,
    quantity: float,
    unit_cost: float,
    tenant_id: Optional[str],
    source: str = "purchase",
    source_id: Optional[str] = None,
    source_number: Optional[str] = None,
    received_at: Optional[str] = None,
) -> dict:
    """يُضيف طبقة تكلفة جديدة (FIFO) للمادة."""
    if quantity <= 0:
        return {}
    layer = {
        "id": str(uuid.uuid4()),
        "tenant_id": tenant_id,
        "material_id": material_id,
        "material_name": material_name,
        "unit": unit or "كغم",
        "unit_cost": float(unit_cost or 0),
        "original_quantity": float(quantity),
        "remaining_quantity": float(quantity),
        "source": source,
        "source_id": source_id,
        "source_number": source_number,
        "received_at": received_at or datetime.now(timezone.utc).isoformat(),
        "created_at": datetime.now(timezone.utc).isoformat(),
        "status": "active",
    }
    await db.material_cost_layers.insert_one(layer)
    layer.pop("_id", None)
    return layer


async def get_active_layers(db, material_id: str, tenant_id: Optional[str] = None):
    """يُرجع الطبقات النشطة (الأقدم أولاً)."""
    query = {"material_id": material_id, "status": "active", "remaining_quantity": {"$gt": 0}}
    if tenant_id:
        query["tenant_id"] = tenant_id
    return await db.material_cost_layers.find(query, {"_id": 0}).sort("received_at", 1).to_list(500)


async def get_current_effective_cost(db, material_id: str, tenant_id: Optional[str] = None) -> Optional[float]:
    """تكلفة أقدم طبقة نشطة (التكلفة الفعلية الجارية)."""
    layers = await get_active_layers(db, material_id, tenant_id)
    if layers:
        return float(layers[0].get("unit_cost", 0))
    return None


async def consume_fifo(
    db,
    *,
    material_id: str,
    quantity: float,
    tenant_id: Optional[str] = None,
) -> dict:
    """يستهلك الكمية من أقدم الطبقات (FIFO).
    
    يُحدّث remaining_quantity للطبقات + status='depleted' إذا وصلت 0.
    يُحدّث raw_materials.cost_per_unit ليُساوي تكلفة أقدم طبقة نشطة بعد الاستهلاك.
    
    يُرجع: {consumed, weighted_avg_cost, drained_from_layers, new_effective_cost}
    """
    if quantity <= 0:
        return {"consumed": 0, "weighted_avg_cost": 0, "drained_from_layers": [], "new_effective_cost": None}

    layers = await get_active_layers(db, material_id, tenant_id)
    remaining_to_consume = float(quantity)
    consumed_total = 0.0
    weighted_value = 0.0
    drained = []

    for layer in layers:
        if remaining_to_consume <= 0:
            break
        avail = float(layer.get("remaining_quantity", 0) or 0)
        if avail <= 0:
            continue
        take = min(avail, remaining_to_consume)
        new_remaining = round(avail - take, 6)
        new_status = "depleted" if new_remaining <= 0 else "active"
        await db.material_cost_layers.update_one(
            {"id": layer["id"]},
            {"$set": {
                "remaining_quantity": max(new_remaining, 0),
                "status": new_status,
                "last_consumed_at": datetime.now(timezone.utc).isoformat(),
            }}
        )
        consumed_total += take
        weighted_value += take * float(layer.get("unit_cost", 0) or 0)
        remaining_to_consume -= take
        drained.append({
            "layer_id": layer["id"],
            "unit_cost": layer.get("unit_cost", 0),
            "consumed": take,
        })

    weighted_avg_cost = (weighted_value / consumed_total) if consumed_total > 0 else 0
    new_effective_cost = await get_current_effective_cost(db, material_id, tenant_id)

    # حدّث raw_materials.cost_per_unit ليعكس الطبقة الأقدم النشطة الحالية
    if new_effective_cost is not None:
        update_q = {"id": material_id}
        if tenant_id:
            update_q["tenant_id"] = tenant_id
        await db.raw_materials.update_one(
            update_q,
            {"$set": {
                "cost_per_unit": new_effective_cost,
                "last_cost_updated_at": datetime.now(timezone.utc).isoformat(),
            }}
        )

    return {
        "consumed": consumed_total,
        "weighted_avg_cost": weighted_avg_cost,
        "drained_from_layers": drained,
        "new_effective_cost": new_effective_cost,
    }


async def reconcile_layers_with_quantity(db, material_id: str, tenant_id: Optional[str] = None):
    """مُصالحة: إذا تبيّن أن raw_materials.quantity أقل من مجموع الطبقات (نتيجة استهلاك خارج FIFO)،
    نسحب الفرق من الأقدم. هذه طريقة دفاعية لأن بعض نقاط الاستهلاك ما تزال تستخدم $inc مباشر.
    """
    query = {"id": material_id}
    if tenant_id:
        query["tenant_id"] = tenant_id
    mat = await db.raw_materials.find_one(query, {"_id": 0})
    if not mat:
        return None

    actual_qty = float(mat.get("quantity", 0) or 0)
    layers = await get_active_layers(db, material_id, tenant_id)
    layered_qty = sum(float(layer.get("remaining_quantity", 0) or 0) for layer in layers)

    diff = round(layered_qty - actual_qty, 6)
    if diff > 0.0001:
        # هناك استهلاك حدث خارج FIFO — اسحب الفرق من الأقدم
        await consume_fifo(db, material_id=material_id, quantity=diff, tenant_id=tenant_id)

    return {"actual_qty": actual_qty, "layered_qty": layered_qty, "drained": max(diff, 0)}


async def detect_price_increase(
    db,
    *,
    tenant_id: Optional[str],
    material_id: Optional[str],
    material_name: str,
    unit: str,
    quantity: float,
    new_cost: float,
    purchase_id: Optional[str],
    purchase_number: Optional[str],
    triggered_by_user_id: Optional[str],
    triggered_by_role: Optional[str],
) -> Optional[dict]:
    """يُقارن السعر الجديد مع التكلفة الحالية في raw_materials. ينشئ price_alert
    إذا كان الفرق ≥ PRICE_DIFF_THRESHOLD_PERCENT (1%) سواء بالزيادة أو بالنقصان.
    """
    old_cost = None
    if material_id:
        q = {"id": material_id}
        if tenant_id:
            q["tenant_id"] = tenant_id
        m = await db.raw_materials.find_one(q, {"_id": 0, "cost_per_unit": 1})
        if m:
            old_cost = float(m.get("cost_per_unit", 0) or 0)

    # لو ما عندنا تكلفة سابقة (مادة جديدة) — لا تنبيه
    if not old_cost or old_cost <= 0:
        return None

    new_cost = float(new_cost or 0)
    if new_cost <= 0:
        return None

    diff = new_cost - old_cost
    percent = (diff / old_cost) * 100.0

    if abs(percent) < PRICE_DIFF_THRESHOLD_PERCENT:
        return None

    direction = "increase" if diff > 0 else "decrease"
    severity = "critical" if abs(percent) >= 10 else ("warning" if abs(percent) >= 5 else "info")

    alert = {
        "id": str(uuid.uuid4()),
        "tenant_id": tenant_id,
        "material_id": material_id,
        "material_name": material_name,
        "unit": unit or "كغم",
        "quantity": float(quantity or 0),
        "old_cost": old_cost,
        "new_cost": new_cost,
        "diff": round(diff, 4),
        "percent_change": round(percent, 2),
        "direction": direction,
        "severity": severity,
        "purchase_id": purchase_id,
        "purchase_number": purchase_number,
        "triggered_by_user_id": triggered_by_user_id,
        "triggered_by_role": triggered_by_role,
        "triggered_at": datetime.now(timezone.utc).isoformat(),
        "status": "unread",  # unread | read | dismissed
        "read_by": [],
    }
    await db.price_alerts.insert_one(alert)
    alert.pop("_id", None)
    return alert



async def propagate_cost_to_products(
    db,
    *,
    material_id: str,
    tenant_id: Optional[str] = None,
) -> dict:
    """يُحدّث raw_material_cost في المنتجات المصنعة (manufactured_products) و POS products
    التي تستخدم هذه المادة في وصفتها — يعكس السعر الفعلي الجديد بعد تغير طبقات FIFO.
    
    يُرجع: {updated_manufactured: int, updated_pos: int}
    """
    # السعر الحالي للمادة
    mat_q = {"id": material_id}
    if tenant_id:
        mat_q["tenant_id"] = tenant_id
    mat = await db.raw_materials.find_one(mat_q, {"_id": 0, "cost_per_unit": 1, "name": 1})
    if not mat:
        return {"updated_manufactured": 0, "updated_pos": 0}
    new_cost = float(mat.get("cost_per_unit", 0) or 0)
    if new_cost <= 0:
        return {"updated_manufactured": 0, "updated_pos": 0}

    updated_mfg = 0
    updated_pos = 0

    # 1) المنتجات المصنعة (manufactured_products)
    mfg_query = {"recipe.raw_material_id": material_id}
    if tenant_id:
        mfg_query["tenant_id"] = tenant_id
    async for prod in db.manufactured_products.find(mfg_query, {"_id": 0}):
        # حدّث cost_per_unit للمكوّن داخل الوصفة + إعادة حساب raw_material_cost
        recipe = prod.get("recipe", []) or []
        new_recipe = []
        total_cost = 0.0
        for ing in recipe:
            ing_copy = dict(ing)
            if ing.get("raw_material_id") == material_id:
                ing_copy["cost_per_unit"] = new_cost
            qty = float(ing_copy.get("quantity", 0) or 0)
            cost = float(ing_copy.get("cost_per_unit", 0) or 0)
            total_cost += qty * cost
            new_recipe.append(ing_copy)
        selling = float(prod.get("selling_price", 0) or 0)
        await db.manufactured_products.update_one(
            {"id": prod["id"]},
            {"$set": {
                "recipe": new_recipe,
                "raw_material_cost": round(total_cost, 4),
                "profit_margin": (selling - total_cost) if selling > 0 else 0,
                "last_cost_recalc_at": datetime.now(timezone.utc).isoformat(),
            }}
        )
        updated_mfg += 1

    # 2) منتجات POS (products) التي تستخدم هذه المادة في recipe (إن وُجدت)
    pos_query = {"recipe.material_id": material_id}
    if tenant_id:
        pos_query["tenant_id"] = tenant_id
    async for prod in db.products.find(pos_query, {"_id": 0}):
        recipe = prod.get("recipe", []) or []
        new_recipe = []
        total_cost = 0.0
        for ing in recipe:
            ing_copy = dict(ing)
            if ing.get("material_id") == material_id:
                ing_copy["cost_per_unit"] = new_cost
            qty = float(ing_copy.get("quantity", 0) or 0)
            cost = float(ing_copy.get("cost_per_unit", 0) or 0)
            total_cost += qty * cost
            new_recipe.append(ing_copy)
        await db.products.update_one(
            {"id": prod["id"]},
            {"$set": {
                "recipe": new_recipe,
                "cost_per_unit": round(total_cost, 4),
                "last_cost_recalc_at": datetime.now(timezone.utc).isoformat(),
            }}
        )
        updated_pos += 1

    return {"updated_manufactured": updated_mfg, "updated_pos": updated_pos}
