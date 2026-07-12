"""
نظام المخزون والمشتريات المتكامل
التدفق: المورد ← المشتريات ← المخزن (مواد خام) ← التصنيع ← الفروع ← الزبون
"""

from fastapi import APIRouter, HTTPException, Depends, UploadFile, File, Form
from pydantic import BaseModel, Field, model_validator
from typing import List, Optional, Dict, Any
from datetime import datetime, timezone, timedelta
import uuid
import os
import aiofiles
from pathlib import Path

from .shared import get_database, get_current_user, get_user_tenant_id, UserRole
from services.cost_layer_service import (
    add_cost_layer,
    get_active_layers,
    get_current_effective_cost,
    consume_fifo,
    reconcile_layers_with_quantity,
    detect_price_increase,
    propagate_cost_to_products,
    PRICE_DIFF_THRESHOLD_PERCENT,
)

router = APIRouter(prefix="/api", tags=["Inventory System"], dependencies=[Depends(get_current_user)])

# ==================== HELPERS ====================

import re as _re

# علامات التشكيل العربية (الحركات) لإزالتها عند التطبيع
_ARABIC_DIACRITICS = _re.compile(r"[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED\u0640]")


def normalize_arabic(text: str) -> str:
    """يوحّد النص العربي لمطابقة آمنة بين أسماء المنتجات والطلبات.
    - أ/إ/آ/ٱ → ا، ة → ه، ى → ي، ؤ → و، ئ → ي
    - إزالة التشكيل والتطويل (ـ)
    - توحيد الأرقام العربية الهندية إلى لاتينية
    - دمج المسافات المتعددة وإزالة الأطراف والتحويل للأحرف الصغيرة (للاتيني)."""
    if not text:
        return ""
    s = str(text)
    s = _ARABIC_DIACRITICS.sub("", s)
    # توحيد الهمزات والألفات
    trans = {
        "أ": "ا", "إ": "ا", "آ": "ا", "ٱ": "ا",
        "ة": "ه", "ى": "ي", "ؤ": "و", "ئ": "ي", "ء": "",
        # أرقام عربية هندية → لاتينية
        "٠": "0", "١": "1", "٢": "2", "٣": "3", "٤": "4",
        "٥": "5", "٦": "6", "٧": "7", "٨": "8", "٩": "9",
    }
    s = s.translate(str.maketrans(trans))
    # دمج المسافات (يشمل المسافات غير الفاصلة) وتقليم الأطراف
    s = _re.sub(r"\s+", " ", s).strip().lower()
    return s


def normalize_arabic_loose(text: str) -> str:
    """نسخة "مرنة" من التطبيع للمطابقة الاحتياطية فقط (عند فشل المطابقة الدقيقة):
    - تطبّق normalize_arabic أولاً
    - تحذف "ال" التعريف من بداية كل كلمة (الطماطة → طماطة)
    - تحذف جميع المسافات تماماً (شرائح طماطة → شرائحطماطه)
    - تطوي الحروف المكرّرة المتتالية (موزاريلا/موززاريلا تتقاربان)
    تُستخدم كحلٍّ أخير لأن دمج "ال" والمسافات قد يوحّد أسماء متقاربة."""
    s = normalize_arabic(text)
    if not s:
        return ""
    words = []
    for w in s.split(" "):
        if len(w) > 3 and w.startswith("ال"):
            w = w[2:]
        words.append(w)
    s = "".join(words)
    # طي الحروف المكرّرة المتتالية (مثل ـلل → ـل)
    s = _re.sub(r"(.)\1+", r"\1", s)
    return s


from difflib import SequenceMatcher as _SeqMatcher


def match_product_by_name(name: str, products: list):
    """يطابق اسم عنصر طلب فرع مع قائمة منتجات مصنّعة بثلاث مراحل آمنة:
      1) مطابقة دقيقة بعد التطبيع (أ/ة/ى... + مسافات).
      2) مطابقة مرنة (حذف "ال" والمسافات وطي التكرار) — تلتقط شرائح الطماطة ≈ شرائح طماطة.
      3) تشابه عالٍ (≥0.86) وغير غامض — يلتقط الأخطاء الإملائية مثل موزريلا ≈ موزاريلا
         مع رفض المطابقة الغامضة (إذا تقارب مرشّحان) منعاً لربط منتج بآخر خطأً.
    يعيد المنتج (الأكبر كمية عند تكرار الاسم) أو None."""
    tn = normalize_arabic(name)
    if not tn:
        return None
    # 1) دقيق
    exact = [p for p in products if normalize_arabic(p.get("name") or "") == tn]
    if exact:
        return max(exact, key=lambda x: float(x.get("quantity") or 0))
    # 2) مرن
    tl = normalize_arabic_loose(name)
    loose = [p for p in products if normalize_arabic_loose(p.get("name") or "") == tl]
    if loose:
        return max(loose, key=lambda x: float(x.get("quantity") or 0))
    # 3) تشابه عالٍ غير غامض
    scored = []
    for p in products:
        pn = normalize_arabic(p.get("name") or "")
        if pn:
            scored.append((_SeqMatcher(None, tn, pn).ratio(), p))
    if not scored:
        return None
    scored.sort(key=lambda x: x[0], reverse=True)
    best_ratio, best_prod = scored[0]
    if best_ratio >= 0.86:
        # رفض الغموض: يجب أن يتفوّق الأفضل بفارق واضح عن الثاني
        if len(scored) == 1 or (best_ratio - scored[1][0]) >= 0.04:
            return best_prod
    return None


def suggest_product_by_name(name: str, products: list, min_score: float = 0.45):
    """يقترح أقرب منتج مصنّع لاسم لم يُطابَق تلقائياً (للعرض كاقتراح "هل تقصد:").
    يعيد {name, quantity, id, score} لأفضل تطابق فوق `min_score`، وإلا None.
    عتبة أدنى من عتبة المطابقة التلقائية (0.86) لأنه اقتراح بصري فقط لا ربط فعلي."""
    tn = normalize_arabic(name)
    if not tn or not products:
        return None
    best_ratio, best_prod = 0.0, None
    for p in products:
        pn = normalize_arabic(p.get("name") or "")
        if not pn:
            continue
        r = _SeqMatcher(None, tn, pn).ratio()
        if r > best_ratio:
            best_ratio, best_prod = r, p
    if best_prod is not None and best_ratio >= min_score:
        return {
            "name": best_prod.get("name"),
            "quantity": float(best_prod.get("quantity") or 0),
            "id": best_prod.get("id"),
            "score": round(best_ratio, 2),
        }
    return None


# خرائط تحويل الوحدات إلى وحدة أساسية (غرام أو مل تُعامل ك "غرام" للعائد)
_UNIT_WEIGHT_MAP = {
    "غرام": 1.0, "كغم": 1000.0, "كيلو": 1000.0, "كجم": 1000.0,
    "gram": 1.0, "kg": 1000.0,
    "مل": 1.0, "لتر": 1000.0, "ml": 1.0, "liter": 1000.0, "l": 1000.0,
}
_COUNT_UNITS = {"قطعة", "قطع", "حبة", "حبات", "علبة", "علب", "كرتون", "كراتين", "صحن", "piece", "pieces", "unit"}


def _resolve_piece_grams(product: dict) -> float:
    """يُرجع الوزن الحقيقي للقطعة الواحدة بالغرام، مع احترام تعريف البورشن.
    ⭐ piece_def_value (1 حصة = 80 غرام) له الأولوية المطلقة متى كان صالحاً —
    حتى لو كانت piece_weight_unit وزنية/فارغة. وإلا يُستخدم piece_weight × معامل الوحدة.
    (يطابق منطق _enrich_unit_cost_fields و getPieceGrams في الواجهة)."""
    pw = float(product.get("piece_weight") or 0)
    pwu = product.get("piece_weight_unit") or "غرام"
    pdv = float(product.get("piece_def_value") or 0)
    pdu = product.get("piece_def_unit")
    if pdv > 0 and pdu and _UNIT_WEIGHT_MAP.get(pdu):
        return pdv * _UNIT_WEIGHT_MAP[pdu]
    return pw * _UNIT_WEIGHT_MAP.get(pwu, 1.0)


def _has_piece_definition(product: dict) -> bool:
    """هل المنتج يُعدّ/يُباع بالقطعة/الحصة (له تعريف بورشن صريح piece_def_value)؟
    عندها يُحسب عائد العرض بالقطع (total_grams ÷ piece_grams) وليس بالغرام،
    ويُمنع تجاوز "الوحدة الرئيسية الوزنية" الذي يُحوّل العائد إلى غرامات."""
    pdv = float(product.get("piece_def_value") or 0)
    pdu = product.get("piece_def_unit")
    return pdv > 0 and bool(pdu) and bool(_UNIT_WEIGHT_MAP.get(pdu))



def _resolve_recipe_yield(product: dict, total_grams: float) -> float:
    """العائد (عدد وحدات المنتج التي تُنتجها الوصفة) من إجمالي وزن الوصفة بالغرام.
    يطابق منطق _enrich_unit_cost_fields:
      1) إذا الوحدة الرئيسية وزنية (غرام/كغم/مل/لتر) → العائد = total_grams ÷ معامل الوحدة.
      2) وإلا → العائد = total_grams ÷ piece_grams (مع احترام piece_def_value).
    نمط الدفعة يُفعّل فقط عند وجود piece_weight أو تعريف بورشن (حفاظاً على النمط القديم per-unit)."""
    # ⭐ كمية إنتاج الوصفة الفعلية (actual_recipe_yield) لها الأولوية المطلقة متى
    # كانت مُعرّفة (>0) — تُعالج تمدّد/انكماش الكتلة أثناء الطبخ (مثل المايونيز:
    # مجموع المكونات 6.795 كغم لكن الناتج الفعلي 7 كغم). تبقى الوصفات القديمة
    # بلا هذا الحقل بنفس سلوكها تماماً.
    ary = float(product.get("actual_recipe_yield") or 0)
    if ary > 0:
        return ary
    if total_grams <= 0:
        return 0.0
    pw = float(product.get("piece_weight") or 0)
    pdv = float(product.get("piece_def_value") or 0)
    if pw <= 0 and pdv <= 0:
        return 0.0  # لا piece_weight ولا تعريف → النمط القديم (per-unit)
    main_unit = (product.get("unit") or "").strip()
    main_factor = _UNIT_WEIGHT_MAP.get(main_unit)
    if main_factor:
        return total_grams / main_factor
    piece_grams = _resolve_piece_grams(product)
    if piece_grams > 0:
        return total_grams / piece_grams
    return 0.0


async def _compute_recipe_count_yield(db, product: dict) -> float:
    """العائد العدّي (عدّ←عدّ): عندما تكون وحدة البورشن الفرعية عدّية (شريحة) والمكوّنات
    قطعية بتعبئة عدّية مطابقة (1 قطعة = 46 شريحة) → العائد = Σ(كمية × تعبئة) ÷ piece_weight.
    يطابق مسار count_yield في _enrich_unit_cost_fields. يُستخدم كاحتياط في مسارات التصنيع
    وزيادة الكمية عندما يعجز الحساب الوزني (total_grams = 0) — لأن الوحدات العدّية لا
    تُحوَّل إلى غرامات. هذا يمنع السقوط في النمط per-unit الذي يستهلك كميات خاطئة."""
    pw = float(product.get("piece_weight") or 0)
    pwu = product.get("piece_weight_unit") or ""
    if pw <= 0 or _UNIT_WEIGHT_MAP.get(pwu):
        return 0.0  # لا piece_weight أو الوحدة الفرعية وزنية → ليس مسار عدّ←عدّ
    recipe = product.get("recipe") or []
    raw_ids = [ing.get("raw_material_id") for ing in recipe if ing.get("raw_material_id")]
    raw_map = {}
    if raw_ids:
        async for mat in db.raw_materials.find(
            {"id": {"$in": raw_ids}}, {"_id": 0, "id": 1, "pack_quantity": 1, "pack_unit": 1}
        ):
            raw_map[mat["id"]] = mat
    total = 0.0
    for ing in recipe:
        qty = float(ing.get("quantity") or 0)
        if qty <= 0:
            continue
        if ing.get("unit") == pwu:
            total += qty
            continue
        ipq = float(ing.get("pack_quantity") or 0)
        ipu = ing.get("pack_unit")
        if ipq <= 0 or not ipu:
            mat = raw_map.get(ing.get("raw_material_id"))
            if mat:
                ipq = float(mat.get("pack_quantity") or 0)
                ipu = mat.get("pack_unit")
        if ipq <= 0 or not ipu:
            continue
        if ipu == pwu or not _UNIT_WEIGHT_MAP.get(ipu):
            total += qty * ipq
    return (total / pw) if total > 0 else 0.0




async def _ingredient_weight_grams(db, ing: dict) -> float:
    """
    ⭐ يحسب الوزن الفعلي للمكوّن بالغرام، مع دعم تحويل العلبة/الكرتون عبر pack_info.

    مثال: مكوّن بـ "2.4 علبة" حيث 1 علبة = 1500 غرام → النتيجة: 3600 غرام.
    إذا كان الوحدة قياسية (غرام/كغم/مل/لتر) — يُستخدم الجدول مباشرة.
    إذا كانت قطعية بدون pack_info — يُرجع 0 (لا يدخل في حساب العائد).
    """
    qty = float(ing.get("quantity") or 0)
    unit = (ing.get("unit") or "").strip()
    if qty <= 0:
        return 0.0
    # وحدات قياسية معروفة
    factor = _UNIT_WEIGHT_MAP.get(unit)
    if factor is not None:
        return qty * factor
    # ⭐ snapshot للحزمة على المكوّن نفسه (إن وُجد)
    ipq = float(ing.get("pack_quantity") or 0)
    ipu = ing.get("pack_unit")
    if ipq > 0 and ipu:
        pf = _UNIT_WEIGHT_MAP.get(ipu, 0)
        if pf > 0:
            return qty * ipq * pf
    # ⭐ مكوّن من نوع منتج مُصنّع — احسب الوزن عبر piece_weight × qty
    if ing.get("manufactured_product_id"):
        mfg = await db.manufactured_products.find_one(
            {"id": ing["manufactured_product_id"]},
            {"_id": 0, "piece_weight": 1, "piece_weight_unit": 1}
        )
        if mfg and mfg.get("piece_weight"):
            pw = float(mfg.get("piece_weight") or 0)
            pwu = mfg.get("piece_weight_unit") or "غرام"
            pf = _UNIT_WEIGHT_MAP.get(pwu, 0)
            if pw > 0 and pf > 0:
                return qty * pw * pf
        return 0.0
    # وحدات قطعية: حاول استخدام pack_info من المادة الخام
    if unit in _COUNT_UNITS or not unit:
        material_id = ing.get("raw_material_id")
        if material_id:
            mat = await db.raw_materials.find_one(
                {"id": material_id},
                {"_id": 0, "pack_quantity": 1, "pack_unit": 1}
            )
            if mat and mat.get("pack_quantity") and mat.get("pack_unit"):
                pack_qty = float(mat.get("pack_quantity") or 0)
                pack_unit = mat.get("pack_unit") or "غرام"
                pack_factor = _UNIT_WEIGHT_MAP.get(pack_unit, 0)
                if pack_qty > 0 and pack_factor > 0:
                    # 1 علبة = pack_qty * pack_factor غرام
                    return qty * pack_qty * pack_factor
    # غير قابل للتحويل → 0 (لا يُحسب)
    return 0.0


async def _compute_recipe_total_grams(db, recipe: list) -> float:
    """يجمع وزن كل مكونات الوصفة بالغرام (مع دعم pack_info)."""
    total = 0.0
    for ing in (recipe or []):
        total += await _ingredient_weight_grams(db, ing)
    return total


async def _consumed_as_ingredient_map(db, product_id: Optional[str] = None) -> dict:
    """يُرجع {product_id: {unit: qty}} لكميات المنتجات المُصنّعة المُستهلَكة كمكوّن
    في تصنيع منتجات أخرى (Nested Recipes) — من حركات الاستهلاك manufactured_consumption.
    تُستخدم لخصمها من 'المتبقي' فيُصحّح المخزون ذاتياً حتى للبيانات القائمة."""
    match = {"type": "manufactured_consumption"}
    if product_id:
        match["product_id"] = product_id
    consumed: dict = {}
    cursor = db.inventory_movements.aggregate([
        {"$match": match},
        {"$group": {"_id": {"pid": "$product_id", "unit": "$unit"}, "q": {"$sum": "$quantity"}}},
    ])
    async for row in cursor:
        key = row.get("_id") or {}
        pid = key.get("pid")
        if not pid:
            continue
        unit = key.get("unit")
        consumed.setdefault(pid, {})
        consumed[pid][unit] = consumed[pid].get(unit, 0.0) + abs(float(row.get("q", 0) or 0))
    return consumed


def _consumed_in_product_unit(consumed_map: dict, product_id: str, product_unit: Optional[str]) -> float:
    """يحوّل كميات الاستهلاك (المسجَّلة بوحداتها) إلى وحدة المنتج لطرحها من المتبقي."""
    entries = consumed_map.get(product_id)
    if not entries:
        return 0.0
    target_f = _UNIT_WEIGHT_MAP.get(product_unit or "")
    total = 0.0
    for unit, qty in entries.items():
        src_f = _UNIT_WEIGHT_MAP.get(unit or "")
        if unit == product_unit or not target_f or not src_f:
            total += qty  # نفس الوحدة أو وحدات عدّية → بدون تحويل
        else:
            total += qty * src_f / target_f  # تحويل وزني/حجمي (مثل غرام→كغم)
    return total


async def _remaining_qty_map(db, products: list) -> dict:
    """يُرجع {product_id: المتبقي} بنفس معادلة بطاقة المصنع تماماً:
    المتبقي = إجمالي المُصنّع − المحوّل للفروع − المستهلَك كمكوّن (مقصوصاً عند ≥ 0).
    ⭐ هذا هو نفس ما يُعرض في تبويب التصنيع (GET /manufactured-products)،
    فيضمن أن "المتوفر" في طلبات الفروع = "المتبقي" المعروض بالضبط."""
    consumed_map = await _consumed_as_ingredient_map(db)
    result = {}
    for p in products:
        total = p.get("total_produced", 0) or 0
        transferred = p.get("transferred_quantity", 0) or 0
        consumed = _consumed_in_product_unit(consumed_map, p.get("id"), p.get("unit"))
        remaining = total - transferred - consumed
        result[p.get("id")] = round(remaining, 6) if remaining > 0 else 0.0
    return result


async def _resolve_ingredient_ids(db, ing: dict, tenant_id: Optional[str] = None) -> dict:
    """🔧 محاولة الربط التلقائي للمكوّن بالاسم إن كان كلا المعرّفين فارغ.

    يستخدم لتعافي البيانات القديمة (Legacy) التي حُفظت بدون manufactured_product_id
    أو raw_material_id. يبحث أولاً في raw_materials، ثم في manufactured_products.
    يُعيد القاموس بعد التعديل (in-place).
    """
    if ing.get("raw_material_id") or ing.get("manufactured_product_id"):
        return ing
    name = (ing.get("raw_material_name") or "").strip()
    if not name:
        return ing
    # بحث بالاسم في المواد الخام أولاً
    name_regex = {"$regex": f"^{name}\\s*$", "$options": "i"}
    rm = await db.raw_materials.find_one({"name": name_regex}, {"_id": 0, "id": 1})
    if rm and rm.get("id"):
        ing["raw_material_id"] = rm["id"]
        if not ing.get("source"):
            ing["source"] = "raw"
        return ing
    # ثم المنتجات المُصنّعة
    mp_query = {"name": name_regex}
    if tenant_id:
        mp_query["tenant_id"] = tenant_id
    mp = await db.manufactured_products.find_one(mp_query, {"_id": 0, "id": 1})
    if not mp and tenant_id:
        # fallback بدون tenant
        mp = await db.manufactured_products.find_one({"name": name_regex}, {"_id": 0, "id": 1})
    if mp and mp.get("id"):
        ing["manufactured_product_id"] = mp["id"]
        ing["source"] = "manufactured"
    return ing


# ==================== MODELS ====================

# --- الموردين ---
class SupplierCreate(BaseModel):
    name: str
    phone: Optional[str] = None
    email: Optional[str] = None
    address: Optional[str] = None
    company_name: Optional[str] = None
    notes: Optional[str] = None

class SupplierResponse(BaseModel):
    id: str
    name: str
    phone: Optional[str] = None
    email: Optional[str] = None
    address: Optional[str] = None
    company_name: Optional[str] = None
    notes: Optional[str] = None
    total_purchases: float = 0.0
    is_active: bool = True
    created_at: str

# --- المشتريات ---
class PurchaseItemCreate(BaseModel):
    raw_material_id: Optional[str] = None  # إذا كان موجود في النظام
    name: str  # اسم المادة
    quantity: float
    unit: str
    cost_per_unit: float
    total_cost: float = 0.0

class PurchaseCreate(BaseModel):
    supplier_id: str
    invoice_number: Optional[str] = None
    items: List[PurchaseItemCreate]
    total_amount: float
    payment_method: str = "cash"  # cash, credit, transfer
    payment_status: str = "paid"  # paid, pending, partial
    notes: Optional[str] = None
    price_increase_reasons: Optional[Dict[str, Any]] = None  # {by_id:{}, by_name:{}}

class PurchaseResponse(BaseModel):
    id: str
    purchase_number: int
    supplier_id: Optional[str] = None
    supplier_name: Optional[str] = None
    invoice_number: Optional[str] = None
    invoice_image_url: Optional[str] = None
    items: List[Dict[str, Any]] = []
    total_amount: float = 0.0
    payment_method: Optional[str] = None
    payment_status: Optional[str] = None
    status: Optional[str] = None  # pending, sent_to_warehouse, received
    notes: Optional[str] = None
    created_by: Optional[str] = None
    created_at: Optional[str] = None
    sent_to_warehouse_at: Optional[str] = None
    sent_to_warehouse_by: Optional[str] = None

# --- طلبات الشراء من المخزن ---
class PurchaseRequestCreate(BaseModel):
    items: List[Dict[str, Any]]  # [{name, quantity, unit, notes}]
    priority: str = "normal"  # urgent, high, normal, low
    notes: Optional[str] = None

class PurchaseRequestResponse(BaseModel):
    id: str
    request_number: int
    items: List[Dict[str, Any]]
    priority: str
    status: str  # pending, approved, purchased, cancelled
    notes: Optional[str] = None
    created_by: str
    created_at: str
    approved_by: Optional[str] = None
    approved_at: Optional[str] = None

# --- المخزن (المواد الخام) ---
class RawMaterialCreate(BaseModel):
    name: str
    name_en: Optional[str] = None
    unit: str
    quantity: float = 0.0
    min_quantity: float = 0.0
    cost_per_unit: float = 0.0
    waste_percentage: float = 0.0  # نسبة الهدر %
    category: Optional[str] = None
    # === تعريف الوحدة (اختياري) — يُستخدم عندما تكون الوحدة قطعة/علبة/كرتون ===
    # مثال: علبة جبن = 250 غرام  ⇒ pack_quantity=250, pack_unit="غرام"
    # مثال: كرتون مايونيز = 12 قطعة ⇒ pack_quantity=12, pack_unit="قطعة"
    pack_quantity: Optional[float] = None
    pack_unit: Optional[str] = None

class RawMaterialResponse(BaseModel):
    id: str
    name: str
    name_en: Optional[str] = None
    unit: str
    quantity: float
    min_quantity: float
    cost_per_unit: float
    waste_percentage: float = 0.0  # نسبة الهدر %
    effective_cost_per_unit: float = 0.0  # التكلفة الفعلية بعد الهدر
    total_value: float = 0.0
    category: Optional[str] = None
    pack_quantity: Optional[float] = None
    pack_unit: Optional[str] = None
    last_updated: str
    created_at: str

# --- تحويلات المخزن للتصنيع ---
class WarehouseToManufacturingCreate(BaseModel):
    items: List[Dict[str, Any]]  # [{raw_material_id, quantity}]
    notes: Optional[str] = None

class WarehouseTransferResponse(BaseModel):
    id: str
    transfer_number: int
    transfer_type: str  # warehouse_to_manufacturing, manufacturing_to_branch
    items: List[Dict[str, Any]]
    total_cost: float = 0.0
    status: str  # pending, approved, received
    notes: Optional[str] = None
    created_by: str
    created_at: str
    received_by: Optional[str] = None
    received_at: Optional[str] = None

# --- التصنيع (المنتجات النهائية) ---
class RecipeIngredient(BaseModel):
    # ⭐ raw_material_id اختياري لدعم المكونات من نوع منتج مُصنّع (nested recipes)
    raw_material_id: Optional[str] = None
    raw_material_name: str
    quantity: float
    unit: str
    cost_per_unit: float = 0.0
    waste_percentage: Optional[float] = 0.0  # نسبة الهدر للمادة الخام
    # ⭐ حقول المكوّن من نوع منتج مُصنّع (Nested Recipes)
    manufactured_product_id: Optional[str] = None
    source: Optional[str] = None  # "raw" | "manufactured"
    # حقول pack-info الاختيارية (تُستخدم في احتساب الوزن/التكلفة)
    pack_quantity: Optional[float] = None
    pack_unit: Optional[str] = None

    model_config = {"extra": "allow"}

    @model_validator(mode="after")
    def _validate_source(self):
        # ملاحظة: لا نرفع خطأ حتى نسمح بحفظ المكونات القديمة (الباقية بدون معرّفات)
        # سيتم محاولة الربط التلقائي بالاسم في طبقة المعالجة.
        return self

class ManufacturedProductCreate(BaseModel):
    name: str
    name_en: Optional[str] = None
    unit: str = "قطعة"
    piece_weight: Optional[float] = None  # وزن القطعة (اختياري)
    piece_weight_unit: Optional[str] = "غرام"  # وحدة وزن القطعة
    piece_def_value: Optional[float] = None  # ⭐ تعريف البورشن للوحدات العدّية (1 قطعة = X)
    piece_def_unit: Optional[str] = None     # ⭐ وحدة التعريف الحقيقية (غرام/كغم/مل/لتر)
    actual_recipe_yield: Optional[float] = None  # ⭐ كمية إنتاج الوصفة الفعلية (تمدّد/انكماش الطبخ)
    recipe: List[RecipeIngredient]  # الوصفة
    quantity: float = 0.0  # الكمية المصنعة المتوفرة
    min_quantity: float = 0.0
    selling_price: float = 0.0
    # 🎯 تكاليف التصنيع (تُحسب من مجموع المكونات)
    production_cost: Optional[float] = None  # التكلفة بعد الهدر (المعتمدة)
    cost_before_waste: Optional[float] = None  # التكلفة قبل الهدر (للمحاسبة على الموردين)
    category: Optional[str] = None

class ManufacturedProductResponse(BaseModel):
    id: str
    name: str
    name_en: Optional[str] = None
    unit: str
    piece_weight: Optional[float] = None  # وزن القطعة
    piece_weight_unit: Optional[str] = "غرام"
    recipe: List[Dict[str, Any]]
    quantity: float  # الكمية المتوفرة
    min_quantity: float
    raw_material_cost: float = 0.0  # تكلفة المواد الخام
    selling_price: float = 0.0
    profit_margin: float = 0.0
    category: Optional[str] = None
    last_updated: str
    created_at: str

# --- طلبات الفروع من التصنيع ---
class BranchOrderCreate(BaseModel):
    to_branch_id: str
    items: List[Dict[str, Any]]  # [{product_id, quantity}]
    priority: str = "normal"
    notes: Optional[str] = None

class BranchOrderResponse(BaseModel):
    id: str
    order_number: int
    to_branch_id: str
    to_branch_name: Optional[str] = None
    items: List[Dict[str, Any]]
    total_cost: float = 0.0
    status: str  # pending, approved, shipped, delivered, cancelled
    priority: str
    notes: Optional[str] = None
    created_by: str
    created_at: str
    approved_at: Optional[str] = None
    shipped_at: Optional[str] = None
    delivered_at: Optional[str] = None

# --- مخزون الفروع ---
class BranchInventoryResponse(BaseModel):
    id: str
    branch_id: str
    branch_name: Optional[str] = None
    product_id: str
    product_name: str
    quantity: float
    cost_per_unit: float = 0.0
    total_value: float = 0.0
    last_updated: str

# --- إعدادات المخزون ---
class InventorySettingsUpdate(BaseModel):
    inventory_mode: str  # centralized, per_branch
    auto_deduct_on_sale: bool = True
    low_stock_notifications: bool = True

# --- مواد التغليف (الورقيات) ---
class PackagingMaterialCreate(BaseModel):
    name: str
    name_en: Optional[str] = None
    unit: str  # قطعة، رول، علبة، كيس
    quantity: float = 0.0
    min_quantity: float = 0.0
    cost_per_unit: float = 0.0
    category: Optional[str] = None  # أكياس، علب، ورق، أدوات

class PackagingMaterialResponse(BaseModel):
    id: str
    name: str
    name_en: Optional[str] = None
    unit: str
    quantity: float = 0.0
    min_quantity: float = 0.0
    cost_per_unit: float = 0.0
    total_value: float = 0.0
    category: Optional[str] = None
    total_received: float = 0.0
    transferred_to_branches: float = 0.0
    remaining_quantity: float = 0.0
    tenant_id: Optional[str] = None
    last_updated: Optional[str] = None
    updated_at: Optional[str] = None
    created_at: Optional[str] = None

# --- طلبات مواد التغليف من الفروع ---
class PackagingRequestCreate(BaseModel):
    items: List[Dict[str, Any]]  # [{packaging_material_id, name, quantity, unit}]
    priority: str = "normal"
    notes: Optional[str] = None
    from_branch_id: Optional[str] = None  # اختياري - إذا كان المستخدم admin يمكنه تحديد الفرع

class PackagingRequestResponse(BaseModel):
    id: str
    request_number: int
    from_branch_id: Optional[str] = None
    from_branch_name: Optional[str] = None
    items: List[Dict[str, Any]]
    priority: str
    status: str  # pending, approved, transferred, received, cancelled
    notes: Optional[str] = None
    created_by: str
    created_by_name: Optional[str] = None
    created_at: str
    approved_by: Optional[str] = None
    approved_at: Optional[str] = None
    transferred_at: Optional[str] = None
    received_at: Optional[str] = None

# --- مخزون مواد التغليف في الفروع ---
class BranchPackagingInventoryResponse(BaseModel):
    id: str
    branch_id: str
    branch_name: Optional[str] = None
    packaging_material_id: str
    packaging_material_name: str
    quantity: float
    used_quantity: float = 0.0
    remaining_quantity: float = 0.0
    cost_per_unit: float = 0.0
    total_value: float = 0.0
    last_updated: str

# ==================== HELPER FUNCTIONS ====================

def get_db():
    """Get database instance from shared module"""
    return get_database()

async def get_current_user_from_token(token: str):
    """Get current user from token"""
    from server import get_current_user as server_get_current_user
    return await server_get_current_user(token)

# ==================== SUPPLIERS ROUTES ====================

@router.post("/suppliers", response_model=SupplierResponse)
async def create_supplier(supplier: SupplierCreate):
    """إضافة مورد جديد"""
    db = get_db()
    
    supplier_doc = {
        "id": str(uuid.uuid4()),
        **supplier.model_dump(),
        "total_purchases": 0.0,
        "is_active": True,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    
    await db.suppliers.insert_one(supplier_doc)
    del supplier_doc["_id"]
    return supplier_doc

@router.get("/suppliers", response_model=List[SupplierResponse])
async def get_suppliers():
    """جلب جميع الموردين"""
    db = get_db()
    suppliers = await db.suppliers.find({"is_active": True}, {"_id": 0}).to_list(1000)
    return suppliers

@router.get("/suppliers/{supplier_id}", response_model=SupplierResponse)
async def get_supplier(supplier_id: str, current_user: dict = Depends(get_current_user)):
    """جلب مورد محدد"""
    db = get_db()
    supplier = await db.suppliers.find_one({"id": supplier_id}, {"_id": 0})
    if not supplier:
        raise HTTPException(status_code=404, detail="المورد غير موجود")
    return supplier

@router.put("/suppliers/{supplier_id}")
async def update_supplier(supplier_id: str, supplier: SupplierCreate):
    """تحديث بيانات المورد"""
    db = get_db()
    await db.suppliers.update_one(
        {"id": supplier_id},
        {"$set": supplier.model_dump()}
    )
    return await db.suppliers.find_one({"id": supplier_id}, {"_id": 0})

@router.delete("/suppliers/{supplier_id}")
async def delete_supplier(supplier_id: str):
    """حذف (تعطيل) المورد"""
    db = get_db()
    await db.suppliers.update_one(
        {"id": supplier_id},
        {"$set": {"is_active": False}}
    )
    return {"message": "تم حذف المورد"}

# ==================== PURCHASES ROUTES (المشتريات) ====================

@router.post("/purchases-new")
async def create_purchase(purchase: PurchaseCreate, current_user: dict = Depends(get_current_user)):
    """إنشاء فاتورة شراء جديدة (مشتريات خارجية مباشرة) — مع تتبّع وتبرير زيادة الأسعار +10%."""
    db = get_db()
    tenant_id = current_user.get("tenant_id")

    # الحصول على رقم الفاتورة التسلسلي
    last_purchase = await db.purchases_new.find_one(
        sort=[("purchase_number", -1)]
    )
    purchase_number = (last_purchase.get("purchase_number", 0) if last_purchase else 0) + 1

    # جلب بيانات المورد
    supplier = await db.suppliers.find_one({"id": purchase.supplier_id}, {"_id": 0})

    # === كشف وتبرير زيادة السعر +10% أو أكثر مقارنةً بآخر فاتورة لنفس الصنف ===
    PRICE_INCREASE_THRESHOLD_PCT = 10.0
    reasons_by_id = (purchase.price_increase_reasons or {}).get("by_id") or {}
    reasons_by_name = (purchase.price_increase_reasons or {}).get("by_name") or {}
    missing_justifications = []
    price_increase_log = []

    for item in purchase.items:
        new_cost = float(item.cost_per_unit or 0)
        if new_cost <= 0:
            continue
        iname = (item.name or "").strip()
        rm_id = item.raw_material_id
        match_query: Dict[str, Any] = {}
        if tenant_id:
            match_query["tenant_id"] = tenant_id
        if rm_id:
            match_query["items.raw_material_id"] = rm_id
        else:
            match_query["items.name"] = iname
        last_inv = await db.purchases_new.find_one(match_query, {"_id": 0}, sort=[("created_at", -1)])
        if not last_inv:
            continue
        last_cost = 0.0
        for li in (last_inv.get("items") or []):
            if rm_id and li.get("raw_material_id") == rm_id:
                last_cost = float(li.get("cost_per_unit", 0) or 0)
                break
            if (not rm_id) and (li.get("name") or "").strip() == iname:
                last_cost = float(li.get("cost_per_unit", 0) or 0)
                break
        if last_cost <= 0:
            continue
        diff_pct = ((new_cost - last_cost) / last_cost) * 100.0
        if diff_pct >= PRICE_INCREASE_THRESHOLD_PCT:
            reason = ((reasons_by_id.get(rm_id) if rm_id else None) or reasons_by_name.get(iname) or "").strip()
            if not reason:
                missing_justifications.append({
                    "raw_material_id": rm_id, "name": iname,
                    "new_cost": round(new_cost, 2), "last_cost": round(last_cost, 2),
                    "diff_pct": round(diff_pct, 2),
                })
            else:
                price_increase_log.append({
                    "raw_material_id": rm_id, "name": iname,
                    "new_cost": round(new_cost, 2), "last_cost": round(last_cost, 2),
                    "diff_pct": round(diff_pct, 2), "reason": reason,
                    "supplier_name": last_inv.get("supplier_name"),
                    "last_invoice_number": last_inv.get("invoice_number"),
                    "last_purchase_date": last_inv.get("created_at"),
                })

    if missing_justifications:
        raise HTTPException(
            status_code=400,
            detail={
                "code": "PRICE_INCREASE_REASON_REQUIRED",
                "message": "يتطلب تبرير زيادة السعر +10% أو أكثر لبعض الأصناف",
                "threshold_pct": PRICE_INCREASE_THRESHOLD_PCT,
                "items_requiring_reason": missing_justifications,
            },
        )

    # حساب إجمالي كل صنف
    items_with_totals = []
    for item in purchase.items:
        item_dict = item.model_dump()
        item_dict["total_cost"] = item.quantity * item.cost_per_unit
        items_with_totals.append(item_dict)

    purchaser_name = current_user.get("full_name") or current_user.get("name") or current_user.get("username") or current_user.get("email") or "غير معروف"
    purchase_doc = {
        "id": str(uuid.uuid4()),
        "purchase_number": purchase_number,
        "supplier_id": purchase.supplier_id,
        "supplier_name": supplier.get("name") if supplier else None,
        "invoice_number": purchase.invoice_number,
        "invoice_image_url": None,  # سيتم تحديثه عند رفع الصورة
        "items": items_with_totals,
        "total_amount": purchase.total_amount,
        "payment_method": purchase.payment_method,
        "payment_status": purchase.payment_status,
        "status": "pending",  # في انتظار الإرسال للمخزن
        "notes": purchase.notes,
        "price_increase_log": price_increase_log,  # ⭐ سجل تبريرات زيادة السعر +10% للمراجعة
        "tenant_id": tenant_id,
        "created_by": purchaser_name,
        "created_by_id": current_user.get("id"),
        "created_by_name": purchaser_name,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "sent_to_warehouse_at": None,
        "sent_to_warehouse_by": None
    }

    await db.purchases_new.insert_one(purchase_doc)

    # تحديث إجمالي مشتريات المورد
    if supplier:
        await db.suppliers.update_one(
            {"id": purchase.supplier_id},
            {"$inc": {"total_purchases": purchase.total_amount}}
        )

    purchase_doc.pop("_id", None)
    return purchase_doc


# ⭐ حذف فاتورة شراء (للتصحيح عند إدخال قيم خاطئة)
@router.delete("/purchases-new/{purchase_id}")
async def delete_purchase(purchase_id: str, current_user: dict = Depends(get_current_user)):
    """حذف فاتورة شراء — يخصم الإجمالي من المورد ويسجل في audit log."""
    db = get_db()
    purchase = await db.purchases_new.find_one({"id": purchase_id}, {"_id": 0})
    if not purchase:
        raise HTTPException(status_code=404, detail="الفاتورة غير موجودة")
    
    # تأكد أن الفاتورة لم تُرسل للمخزن بعد (لمنع كسر المخزون)
    if purchase.get("status") == "sent_to_warehouse":
        raise HTTPException(status_code=400, detail="لا يمكن حذف فاتورة أُرسلت للمخزن بالفعل")
    
    # خصم الإجمالي من إجمالي المورد
    if purchase.get("supplier_id"):
        await db.suppliers.update_one(
            {"id": purchase["supplier_id"]},
            {"$inc": {"total_purchases": -float(purchase.get("total_amount", 0))}}
        )
    
    await db.purchases_new.delete_one({"id": purchase_id})
    
    # سجل audit
    await db.audit_logs.insert_one({
        "id": str(uuid.uuid4()),
        "action": "delete_purchase",
        "purchase_id": purchase_id,
        "purchase_number": purchase.get("purchase_number"),
        "supplier_name": purchase.get("supplier_name"),
        "total_amount": purchase.get("total_amount"),
        "deleted_by": current_user.get("id"),
        "deleted_at": datetime.now(timezone.utc).isoformat(),
    })
    
    return {"message": f"تم حذف الفاتورة #{purchase.get('purchase_number')}", "deleted_amount": purchase.get("total_amount", 0)}


@router.post("/purchases-new/{purchase_id}/upload-invoice")
async def upload_invoice_image(
    purchase_id: str,
    file: UploadFile = File(...)
):
    """رفع صورة الفاتورة"""
    db = get_db()
    
    purchase = await db.purchases_new.find_one({"id": purchase_id})
    if not purchase:
        raise HTTPException(status_code=404, detail="الفاتورة غير موجودة")
    
    # إنشاء مجلد الفواتير
    INVOICES_DIR = Path("/app/backend/uploads/invoices")
    INVOICES_DIR.mkdir(parents=True, exist_ok=True)
    
    # حفظ الصورة
    file_ext = file.filename.split(".")[-1] if "." in file.filename else "jpg"
    filename = f"invoice_{purchase_id}_{datetime.now().strftime('%Y%m%d%H%M%S')}.{file_ext}"
    file_path = INVOICES_DIR / filename
    
    async with aiofiles.open(file_path, 'wb') as out_file:
        content = await file.read()
        await out_file.write(content)
    
    # تحديث رابط الصورة في الفاتورة
    image_url = f"/api/uploads/invoices/{filename}"
    await db.purchases_new.update_one(
        {"id": purchase_id},
        {"$set": {"invoice_image_url": image_url}}
    )
    
    return {"message": "تم رفع الصورة بنجاح", "image_url": image_url}

@router.post("/purchases-new/{purchase_id}/send-to-warehouse")
async def send_purchase_to_warehouse(purchase_id: str):
    """إرسال المشتريات للمخزن"""
    db = get_db()
    
    purchase = await db.purchases_new.find_one({"id": purchase_id})
    if not purchase:
        raise HTTPException(status_code=404, detail="الفاتورة غير موجودة")
    
    if purchase.get("status") != "pending":
        raise HTTPException(status_code=400, detail="تم إرسال هذه الفاتورة مسبقاً")
    
    # التحقق من وجود صورة الفاتورة
    if not purchase.get("invoice_image_url"):
        raise HTTPException(status_code=400, detail="يجب رفع صورة الفاتورة أولاً")
    
    # إضافة المواد للمخزن
    for item in purchase.get("items", []):
        # البحث عن المادة الخام
        raw_material = await db.raw_materials.find_one({
            "name": item.get("name")
        })
        
        if raw_material:
            # تحديث الكمية والتكلفة
            new_quantity = raw_material.get("quantity", 0) + item.get("quantity", 0)
            # حساب متوسط التكلفة المرجح
            old_value = raw_material.get("quantity", 0) * raw_material.get("cost_per_unit", 0)
            new_value = item.get("quantity", 0) * item.get("cost_per_unit", 0)
            avg_cost = (old_value + new_value) / new_quantity if new_quantity > 0 else item.get("cost_per_unit", 0)
            
            await db.raw_materials.update_one(
                {"id": raw_material["id"]},
                {
                    "$set": {
                        "quantity": new_quantity,
                        "cost_per_unit": avg_cost,
                        "last_updated": datetime.now(timezone.utc).isoformat()
                    }
                }
            )
        else:
            # إنشاء مادة خام جديدة
            new_material = {
                "id": str(uuid.uuid4()),
                "name": item.get("name"),
                "name_en": None,
                "unit": item.get("unit", "كغم"),
                "quantity": item.get("quantity", 0),
                "min_quantity": 0,
                "cost_per_unit": item.get("cost_per_unit", 0),
                "category": None,
                "last_updated": datetime.now(timezone.utc).isoformat(),
                "created_at": datetime.now(timezone.utc).isoformat()
            }
            await db.raw_materials.insert_one(new_material)
    
    # تحديث حالة الفاتورة
    await db.purchases_new.update_one(
        {"id": purchase_id},
        {
            "$set": {
                "status": "sent_to_warehouse",
                "sent_to_warehouse_at": datetime.now(timezone.utc).isoformat(),
                "sent_to_warehouse_by": "system"
            }
        }
    )
    
    # إنشاء سجل وارد للمخزن
    incoming_record = {
        "id": str(uuid.uuid4()),
        "type": "incoming",
        "source": "purchases",
        "source_id": purchase_id,
        "supplier_id": purchase.get("supplier_id"),
        "supplier_name": purchase.get("supplier_name"),
        "items": purchase.get("items"),
        "total_amount": purchase.get("total_amount"),
        "invoice_image_url": purchase.get("invoice_image_url"),
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.warehouse_transactions.insert_one(incoming_record)
    
    return {"message": "تم إرسال المشتريات للمخزن بنجاح"}

@router.get("/purchases-new", response_model=List[PurchaseResponse])
async def get_purchases(status: Optional[str] = None, current_user: dict = Depends(get_current_user)):
    """جلب جميع المشتريات"""
    db = get_db()
    
    query = {}
    if status:
        query["status"] = status
    
    purchases = await db.purchases_new.find(query, {"_id": 0}).sort("created_at", -1).to_list(1000)
    return purchases

@router.get("/purchases-new/{purchase_id}")
async def get_purchase(purchase_id: str, current_user: dict = Depends(get_current_user)):
    """جلب فاتورة شراء محددة"""
    db = get_db()
    purchase = await db.purchases_new.find_one({"id": purchase_id}, {"_id": 0})
    if not purchase:
        raise HTTPException(status_code=404, detail="الفاتورة غير موجودة")
    return purchase

# ==================== EXTERNAL PURCHASES REPORT (تقرير المشتريات الخارجية) ====================

def _purchase_payment_summary(p: dict) -> dict:
    """يحسب المسدد والمتبقي وحالة الدفع لفاتورة شراء."""
    total = float(p.get("total_amount") or 0)
    payments = p.get("payments") or []
    paid = float(p.get("paid_amount") if p.get("paid_amount") is not None else sum(float(x.get("amount") or 0) for x in payments))
    # توافق قديم: فاتورة معلّمة مدفوعة بالكامل بدون سجل دفعات
    if paid == 0 and p.get("payment_status") == "paid" and not payments:
        paid = total
    remaining = round(total - paid, 2)
    if paid <= 0:
        status = "unpaid"
    elif remaining > 0.009:
        status = "partial"
    else:
        status = "paid"
    return {"paid_amount": round(paid, 2), "remaining_amount": max(remaining, 0), "pay_status": status}


async def _total_treasury_balance(db, tenant_id: Optional[str]) -> float:
    """إجمالي رصيد خزينة المالك (كل الفروع) = الإيداعات − السحوبات − تحويلات الأرباح."""
    q = {"tenant_id": tenant_id} if tenant_id else {}
    deps = await db.owner_deposits.find(q, {"_id": 0, "amount": 1}).to_list(20000)
    wds = await db.owner_withdrawals.find(q, {"_id": 0, "amount": 1}).to_list(20000)
    tfs = await db.owner_profit_transfers.find(q, {"_id": 0, "amount": 1}).to_list(20000)
    return round(
        sum(float(d.get("amount") or 0) for d in deps)
        - sum(float(w.get("amount") or 0) for w in wds)
        - sum(float(t.get("amount") or 0) for t in tfs),
        2,
    )


@router.get("/purchases-report")
async def purchases_report(
    start: Optional[str] = None,
    end: Optional[str] = None,
    supplier_id: Optional[str] = None,
    current_user: dict = Depends(get_current_user),
):
    """تقرير المشتريات الخارجية: الفواتير + الموردون + الدائن/المدين + حالة السداد + رصيد الخزينة."""
    db = get_db()
    tenant_id = get_user_tenant_id(current_user)

    query: Dict[str, Any] = {}
    if supplier_id:
        query["supplier_id"] = supplier_id
    if start or end:
        rng: Dict[str, Any] = {}
        if start:
            rng["$gte"] = start
        if end:
            rng["$lte"] = end + "T23:59:59"
        query["created_at"] = rng

    raw = await db.purchases_new.find(query, {"_id": 0}).sort("created_at", -1).to_list(5000)

    invoices = []
    suppliers_map: Dict[str, Dict[str, Any]] = {}
    total_amount = 0.0
    total_paid = 0.0
    for p in raw:
        summ = _purchase_payment_summary(p)
        amt = float(p.get("total_amount") or 0)
        items = p.get("items") or []
        qty_total = sum(float(it.get("quantity") or 0) for it in items)
        inv = {
            "id": p.get("id"),
            "purchase_number": p.get("purchase_number"),
            "supplier_id": p.get("supplier_id"),
            "supplier_name": p.get("supplier_name") or "غير محدد",
            "invoice_number": p.get("invoice_number"),
            "invoice_image_url": p.get("invoice_image_url"),
            "created_by": p.get("created_by") or "غير معروف",
            "created_at": p.get("created_at"),
            "items": items,
            "items_count": len(items),
            "total_quantity": qty_total,
            "total_amount": amt,
            "payment_method": p.get("payment_method"),
            "status": p.get("status"),
            "sent_to_warehouse_at": p.get("sent_to_warehouse_at"),
            "payments": p.get("payments") or [],
            **summ,
        }
        invoices.append(inv)
        total_amount += amt
        total_paid += summ["paid_amount"]

        sid = p.get("supplier_id") or p.get("supplier_name") or "unknown"
        if sid not in suppliers_map:
            suppliers_map[sid] = {
                "supplier_id": p.get("supplier_id"),
                "supplier_name": p.get("supplier_name") or "غير محدد",
                "invoice_count": 0, "total_amount": 0.0, "total_paid": 0.0,
                "total_remaining": 0.0, "total_quantity": 0.0,
            }
        s = suppliers_map[sid]
        s["invoice_count"] += 1
        s["total_amount"] += amt
        s["total_paid"] += summ["paid_amount"]
        s["total_remaining"] += summ["remaining_amount"]
        s["total_quantity"] += qty_total

    # إثراء بيانات الموردين (هاتف/نوع)
    sup_docs = {s["id"]: s for s in await db.suppliers.find({}, {"_id": 0}).to_list(2000)}
    suppliers = []
    for s in suppliers_map.values():
        doc = sup_docs.get(s.get("supplier_id")) or {}
        s["phone"] = doc.get("phone")
        s["supplies"] = doc.get("supplies") or doc.get("category") or doc.get("notes")
        s["total_amount"] = round(s["total_amount"], 2)
        s["total_paid"] = round(s["total_paid"], 2)
        s["total_remaining"] = round(s["total_remaining"], 2)
        suppliers.append(s)
    suppliers.sort(key=lambda x: x["total_amount"], reverse=True)

    treasury_balance = await _total_treasury_balance(db, tenant_id)
    total_remaining = round(total_amount - total_paid, 2)

    return {
        "summary": {
            "total_amount": round(total_amount, 2),      # المدين (إجمالي الفواتير)
            "total_paid": round(total_paid, 2),          # الدائن (المسدّد)
            "total_remaining": max(total_remaining, 0),  # المتبقي
            "invoice_count": len(invoices),
            "supplier_count": len(suppliers),
            "treasury_balance": treasury_balance,
        },
        "suppliers": suppliers,
        "invoices": invoices,
    }


# مدة الأجل الافتراضية (تقديري) لاستحقاق فواتير الموردين غير المسددة
DEFAULT_SUPPLIER_DUE_DAYS = 30


def _parse_iso_date(val):
    """يحاول قراءة تاريخ ISO ويعيد datetime (UTC) أو None."""
    if not val:
        return None
    try:
        s = str(val)
        if len(s) == 10:  # YYYY-MM-DD
            return datetime.fromisoformat(s).replace(tzinfo=timezone.utc)
        return datetime.fromisoformat(s.replace("Z", "+00:00"))
    except Exception:
        return None


@router.get("/supplier-payment-dues")
async def supplier_payment_dues(current_user: dict = Depends(get_current_user)):
    """استحقاقات دفعات الموردين (للجرس) — كل فاتورة غير مسددة/جزئية مع تاريخ الاستحقاق.

    منطق الاستحقاق:
      - إذا وُجد حقل due_date يدوي على الفاتورة → يُستخدم (تاريخ فعلي).
      - وإلا → تاريخ الفاتورة + 30 يوم (تقديري estimated=True).
      - أي فاتورة عليها متبقٍّ تُعتبر مستحقة وتظهر في القائمة.
    """
    db = get_db()
    raw = await db.purchases_new.find({}, {"_id": 0}).sort("created_at", -1).to_list(5000)
    now = datetime.now(timezone.utc)

    items = []
    overdue_count = 0
    total_remaining = 0.0
    for p in raw:
        summ = _purchase_payment_summary(p)
        remaining = summ["remaining_amount"]
        if remaining <= 0.009:
            continue
        manual_due = _parse_iso_date(p.get("due_date"))
        estimated = manual_due is None
        created = _parse_iso_date(p.get("created_at")) or now
        due_dt = manual_due or (created + timedelta(days=DEFAULT_SUPPLIER_DUE_DAYS))
        days_overdue = (now.date() - due_dt.date()).days
        is_overdue = days_overdue > 0
        if is_overdue:
            overdue_count += 1
        total_remaining += remaining
        items.append({
            "id": p.get("id"),
            "purchase_number": p.get("purchase_number"),
            "supplier_id": p.get("supplier_id"),
            "supplier_name": p.get("supplier_name") or "غير محدد",
            "invoice_number": p.get("invoice_number"),
            "total_amount": float(p.get("total_amount") or 0),
            "paid_amount": summ["paid_amount"],
            "remaining_amount": remaining,
            "pay_status": summ["pay_status"],
            "created_at": p.get("created_at"),
            "due_date": due_dt.date().isoformat(),
            "estimated": estimated,
            "days_overdue": days_overdue,
            "is_overdue": is_overdue,
        })

    # الأكثر تأخراً أولاً ثم الأقرب استحقاقاً
    items.sort(key=lambda x: (-x["days_overdue"], x["due_date"]))

    return {
        "dues": items,
        "total_count": len(items),
        "overdue_count": overdue_count,
        "total_remaining": round(total_remaining, 2),
    }



class PurchasePayment(BaseModel):
    amount: float
    payment_method: str = "cash"  # cash | card | bank_withdrawal | zain_cash
    payment_date: Optional[str] = None  # تاريخ الدفع (YYYY-MM-DD) — يدخله المستخدم في النموذج
    notes: Optional[str] = None


@router.post("/purchases-new/{purchase_id}/pay")
async def pay_purchase_invoice(purchase_id: str, payload: PurchasePayment, current_user: dict = Depends(get_current_user)):
    """تسديد فاتورة مورد (كامل/جزئي) — يُخصم من إجمالي رصيد خزينة المالك."""
    db = get_db()
    if current_user["role"] not in [UserRole.ADMIN, UserRole.GENERAL_MANAGER, UserRole.SUPER_ADMIN, UserRole.MANAGER]:
        raise HTTPException(status_code=403, detail="غير مصرح — التسديد للمالك/المدير فقط")
    tenant_id = get_user_tenant_id(current_user)

    p = await db.purchases_new.find_one({"id": purchase_id}, {"_id": 0})
    if not p:
        raise HTTPException(status_code=404, detail="الفاتورة غير موجودة")

    summ = _purchase_payment_summary(p)
    remaining = summ["remaining_amount"]
    amount = round(float(payload.amount or 0), 2)
    if amount <= 0:
        raise HTTPException(status_code=400, detail="المبلغ يجب أن يكون أكبر من صفر")
    if amount > remaining + 0.01:
        raise HTTPException(status_code=400, detail=f"المبلغ يتجاوز المتبقي على الفاتورة ({remaining:,.0f} IQD)")

    # التحقق من رصيد الخزينة الكلي
    balance = await _total_treasury_balance(db, tenant_id)
    if amount > balance + 0.01:
        raise HTTPException(status_code=400, detail=f"رصيد الخزينة غير كافٍ. المتاح: {balance:,.0f} IQD، المطلوب: {amount:,.0f} IQD")

    now = datetime.now(timezone.utc).isoformat()
    pay_date = (payload.payment_date or now[:10])[:10]
    by_name = current_user.get("full_name") or current_user.get("username") or "النظام"
    withdrawal_id = str(uuid.uuid4())
    await db.owner_withdrawals.insert_one({
        "id": withdrawal_id, "tenant_id": tenant_id, "amount": amount,
        "date": pay_date, "actual_payment_date": pay_date,
        "beneficiary": f"مورد: {p.get('supplier_name') or 'غير محدد'}",
        "description": f"تسديد فاتورة مشتريات #{p.get('purchase_number')} — {p.get('supplier_name') or ''}",
        "category": "purchase_payment", "payment_method": payload.payment_method,
        "linked_purchase_id": purchase_id, "supplier_id": p.get("supplier_id"),
        "notes": payload.notes, "created_by": by_name, "created_at": now,
    })

    payment_rec = {
        "id": str(uuid.uuid4()), "amount": amount, "payment_method": payload.payment_method,
        "withdrawal_id": withdrawal_id, "notes": payload.notes, "paid_by": by_name,
        "date": pay_date, "created_at": now,
    }
    new_paid = round(summ["paid_amount"] + amount, 2)
    new_status = "paid" if new_paid >= float(p.get("total_amount") or 0) - 0.01 else "partial"
    await db.purchases_new.update_one(
        {"id": purchase_id},
        {"$push": {"payments": payment_rec}, "$set": {"paid_amount": new_paid, "payment_status": new_status}},
    )
    return {
        "message": "تم تسديد المبلغ وخصمه من الخزينة",
        "paid_amount": new_paid,
        "remaining_amount": max(round(float(p.get("total_amount") or 0) - new_paid, 2), 0),
        "payment_status": new_status,
        "treasury_balance": round(balance - amount, 2),
    }


@router.delete("/purchases-new/{purchase_id}/payments/{payment_id}")
async def delete_purchase_payment(purchase_id: str, payment_id: str, current_user: dict = Depends(get_current_user)):
    """إلغاء دفعة تسديد فاتورة — يعيد المبلغ للخزينة."""
    db = get_db()
    if current_user["role"] not in [UserRole.ADMIN, UserRole.GENERAL_MANAGER, UserRole.SUPER_ADMIN]:
        raise HTTPException(status_code=403, detail="غير مصرح")
    p = await db.purchases_new.find_one({"id": purchase_id}, {"_id": 0})
    if not p:
        raise HTTPException(status_code=404, detail="الفاتورة غير موجودة")
    payments = p.get("payments") or []
    target = next((x for x in payments if x.get("id") == payment_id), None)
    if not target:
        raise HTTPException(status_code=404, detail="الدفعة غير موجودة")
    if target.get("withdrawal_id"):
        await db.owner_withdrawals.delete_one({"id": target["withdrawal_id"]})
    remaining_payments = [x for x in payments if x.get("id") != payment_id]
    new_paid = round(sum(float(x.get("amount") or 0) for x in remaining_payments), 2)
    new_status = "unpaid" if new_paid <= 0 else ("paid" if new_paid >= float(p.get("total_amount") or 0) - 0.01 else "partial")
    await db.purchases_new.update_one(
        {"id": purchase_id},
        {"$set": {"payments": remaining_payments, "paid_amount": new_paid, "payment_status": new_status}},
    )
    return {"message": "تم إلغاء الدفعة وإعادة المبلغ للخزينة", "paid_amount": new_paid, "payment_status": new_status}


# ==================== تصحيح كمية/سعر صنف في فاتورة مُستلمة ====================
class CorrectPurchaseItem(BaseModel):
    item_index: int
    new_quantity: float
    new_cost_per_unit: Optional[float] = None
    reason: Optional[str] = None


@router.patch("/purchases-new/{purchase_id}/correct-item")
async def correct_purchase_item(purchase_id: str, payload: CorrectPurchaseItem, current_user: dict = Depends(get_current_user)):
    """تصحيح كمية/سعر صنف في فاتورة شراء (حتى لو مُستلمة/مدفوعة) — للمالك/المدير فقط.
    يعكس الأثر بالكامل: إجمالي الفاتورة + مخزون المادة الخام (الكمية + متوسط التكلفة) +
    رصيد المورد + استرجاع أي مبلغ مدفوع زائد إلى خزينة المالك، مع تسجيل في سجل التدقيق."""
    db = get_db()
    if current_user["role"] not in [UserRole.ADMIN, UserRole.GENERAL_MANAGER, UserRole.SUPER_ADMIN, UserRole.MANAGER]:
        raise HTTPException(status_code=403, detail="غير مصرح — التصحيح للمالك/المدير فقط")
    tenant_id = get_user_tenant_id(current_user)
    now = datetime.now(timezone.utc).isoformat()

    p = await db.purchases_new.find_one({"id": purchase_id}, {"_id": 0})
    if not p:
        raise HTTPException(status_code=404, detail="الفاتورة غير موجودة")

    items = list(p.get("items") or [])
    idx = payload.item_index
    if idx < 0 or idx >= len(items):
        raise HTTPException(status_code=400, detail="رقم الصنف غير صحيح")

    new_qty = round(float(payload.new_quantity or 0), 3)
    if new_qty <= 0:
        raise HTTPException(status_code=400, detail="الكمية يجب أن تكون أكبر من صفر")

    old_item = dict(items[idx])
    old_qty = float(old_item.get("quantity") or 0)
    old_cost = float(old_item.get("cost_per_unit") or 0)
    old_item_total = float(old_item.get("total_cost") if old_item.get("total_cost") is not None else old_qty * old_cost)
    new_cost = round(float(payload.new_cost_per_unit), 2) if payload.new_cost_per_unit is not None else old_cost
    new_item_total = round(new_qty * new_cost, 2)

    delta_qty = round(new_qty - old_qty, 3)
    delta_total = round(new_item_total - old_item_total, 2)
    if abs(delta_qty) < 1e-9 and abs(delta_total) < 1e-9:
        raise HTTPException(status_code=400, detail="لا يوجد تغيير في القيم")

    # 1) تحديث الصنف وإعادة حساب إجمالي الفاتورة
    items[idx] = {**old_item, "quantity": new_qty, "cost_per_unit": new_cost, "total_cost": new_item_total}
    new_total_amount = round(sum(float(x.get("total_cost") or 0) for x in items), 2)

    # 2) عكس أثر المخزون (إن كانت الفاتورة قد أُرسلت للمخزن)
    stock_adjusted = None
    if p.get("status") == "sent_to_warehouse":
        name = old_item.get("name")
        rm = await db.raw_materials.find_one({"name": name})
        if rm:
            cur_qty = float(rm.get("quantity") or 0)
            cur_cost = float(rm.get("cost_per_unit") or 0)
            cur_value = cur_qty * cur_cost
            new_rm_qty = round(cur_qty + delta_qty, 3)
            new_rm_value = round(cur_value + delta_total, 2)
            if new_rm_qty <= 0:
                new_rm_qty = max(new_rm_qty, 0)
                new_rm_cost = new_cost
            else:
                new_rm_cost = round(new_rm_value / new_rm_qty, 4) if new_rm_value > 0 else new_cost
            await db.raw_materials.update_one(
                {"id": rm["id"]},
                {"$set": {"quantity": new_rm_qty, "cost_per_unit": new_rm_cost, "last_updated": now}},
            )
            stock_adjusted = {"material": name, "old_qty": cur_qty, "new_qty": new_rm_qty,
                              "old_cost": round(cur_cost, 4), "new_cost": new_rm_cost}
        # تحديث لقطة حركة الوارد للمخزن لتبقى متسقة
        await db.warehouse_transactions.update_many(
            {"source_id": purchase_id, "source": "purchases"},
            {"$set": {"items": items, "total_amount": new_total_amount}},
        )

    # 3) تعديل إجمالي مشتريات المورد بالفرق
    if p.get("supplier_id") and abs(delta_total) > 1e-9:
        await db.suppliers.update_one({"id": p["supplier_id"]}, {"$inc": {"total_purchases": delta_total}})

    # 4) استرجاع أي مبلغ مدفوع زائد إلى الخزينة (إن انخفض الإجمالي تحت المسدد)
    summ = _purchase_payment_summary(p)
    paid_before = summ["paid_amount"]
    payments = list(p.get("payments") or [])
    refund_total = 0.0
    if payments and paid_before > new_total_amount + 0.01:
        overpaid = round(paid_before - new_total_amount, 2)
        remaining_to_claw = overpaid
        processed = {}
        for pay in sorted(payments, key=lambda x: x.get("created_at") or "", reverse=True):
            amt = float(pay.get("amount") or 0)
            if remaining_to_claw <= 0.009:
                continue
            reduce_by = round(min(amt, remaining_to_claw), 2)
            new_amt = round(amt - reduce_by, 2)
            remaining_to_claw = round(remaining_to_claw - reduce_by, 2)
            refund_total = round(refund_total + reduce_by, 2)
            wid = pay.get("withdrawal_id")
            if wid:
                if new_amt <= 0.009:
                    await db.owner_withdrawals.delete_one({"id": wid})
                else:
                    await db.owner_withdrawals.update_one({"id": wid}, {"$set": {"amount": new_amt}})
            processed[pay.get("id")] = new_amt
        rebuilt = []
        for pay in payments:
            na = processed.get(pay.get("id"), float(pay.get("amount") or 0))
            if na > 0.009:
                rebuilt.append({**pay, "amount": na})
        payments = rebuilt

    if payments:
        new_paid = round(sum(float(x.get("amount") or 0) for x in payments), 2)
    elif paid_before > 0 and not (p.get("payments") or []):
        # توافق: فاتورة مُعلّمة مدفوعة بلا سجلات دفع — تُعتبر مدفوعة بالقيمة المصحّحة (لا سحب لاسترجاعه)
        new_paid = new_total_amount
    else:
        new_paid = 0.0

    if new_paid <= 0:
        new_status = "unpaid"
    elif new_paid >= new_total_amount - 0.01:
        new_status = "paid"
    else:
        new_status = "partial"

    await db.purchases_new.update_one(
        {"id": purchase_id},
        {"$set": {
            "items": items,
            "total_amount": new_total_amount,
            "payments": payments,
            "paid_amount": new_paid,
            "payment_status": new_status,
        }},
    )

    # 5) سجل التدقيق
    await db.audit_logs.insert_one({
        "id": str(uuid.uuid4()),
        "action": "correct_purchase_item",
        "tenant_id": tenant_id,
        "purchase_id": purchase_id,
        "purchase_number": p.get("purchase_number"),
        "item_name": old_item.get("name"),
        "old_quantity": old_qty, "new_quantity": new_qty,
        "old_cost_per_unit": old_cost, "new_cost_per_unit": new_cost,
        "old_total_amount": float(p.get("total_amount") or 0), "new_total_amount": new_total_amount,
        "stock_adjusted": stock_adjusted,
        "treasury_refund": refund_total,
        "reason": payload.reason,
        "corrected_by": current_user.get("full_name") or current_user.get("username"),
        "corrected_at": now,
    })

    return {
        "message": f"تم تصحيح الصنف «{old_item.get('name')}» بنجاح",
        "item_name": old_item.get("name"),
        "old_quantity": old_qty, "new_quantity": new_qty,
        "new_item_total": new_item_total,
        "new_total_amount": new_total_amount,
        "stock_adjusted": stock_adjusted,
        "treasury_refund": refund_total,
        "paid_amount": new_paid,
        "payment_status": new_status,
    }



# ==================== مدفوعات الموردين على مستوى الحساب ====================
class SupplierPayment(BaseModel):
    amount: float
    payment_method: str = "cash"
    payment_date: Optional[str] = None
    notes: Optional[str] = None


async def _supplier_open_invoices(db, supplier_id, tenant_id):
    """فواتير المورد غير المسددة بالكامل، الأقدم أولاً."""
    q = {"supplier_id": supplier_id}
    if tenant_id:
        q["tenant_id"] = tenant_id
    invs = await db.purchases_new.find(q, {"_id": 0}).to_list(20000)
    invs.sort(key=lambda x: (x.get("created_at") or x.get("invoice_date") or ""))
    out = []
    for p in invs:
        summ = _purchase_payment_summary(p)
        if summ["remaining_amount"] > 0.01:
            out.append((p, summ["remaining_amount"], summ["paid_amount"]))
    return out


@router.post("/suppliers/{supplier_id}/pay")
async def pay_supplier_account(supplier_id: str, payload: SupplierPayment, current_user: dict = Depends(get_current_user)):
    """تسديد دفعة/مبلغ كامل لمورد — يُوزَّع على فواتيره الأقدم أولاً ويُخصم من إجمالي خزينة المالك."""
    db = get_db()
    if current_user["role"] not in [UserRole.ADMIN, UserRole.GENERAL_MANAGER, UserRole.SUPER_ADMIN, UserRole.MANAGER]:
        raise HTTPException(status_code=403, detail="غير مصرح — التسديد للمالك/المدير فقط")
    tenant_id = get_user_tenant_id(current_user)
    supplier = await db.suppliers.find_one({"id": supplier_id}, {"_id": 0})
    if not supplier:
        raise HTTPException(status_code=404, detail="المورد غير موجود")

    amount = round(float(payload.amount or 0), 2)
    if amount <= 0:
        raise HTTPException(status_code=400, detail="المبلغ يجب أن يكون أكبر من صفر")

    open_invs = await _supplier_open_invoices(db, supplier_id, tenant_id)
    total_remaining = round(sum(r for _, r, _ in open_invs), 2)
    if total_remaining <= 0:
        raise HTTPException(status_code=400, detail="لا توجد مستحقات على هذا المورد")
    if amount > total_remaining + 0.01:
        raise HTTPException(status_code=400, detail=f"المبلغ يتجاوز مستحقات المورد ({total_remaining:,.0f} IQD)")

    balance = await _total_treasury_balance(db, tenant_id)
    if amount > balance + 0.01:
        raise HTTPException(status_code=400, detail=f"رصيد الخزينة غير كافٍ. المتاح: {balance:,.0f} IQD، المطلوب: {amount:,.0f} IQD")

    now = datetime.now(timezone.utc).isoformat()
    pay_date = (payload.payment_date or now[:10])[:10]
    by_name = current_user.get("full_name") or current_user.get("username") or "النظام"

    # سحب واحد من إجمالي الخزينة (وليس من فرع)
    withdrawal_id = str(uuid.uuid4())
    await db.owner_withdrawals.insert_one({
        "id": withdrawal_id, "tenant_id": tenant_id, "amount": amount,
        "date": pay_date, "actual_payment_date": pay_date,
        "beneficiary": f"مورد: {supplier.get('name') or 'غير محدد'}",
        "description": f"تسديد مستحقات المورد {supplier.get('name') or ''}",
        "category": "supplier_payment", "payment_method": payload.payment_method,
        "supplier_id": supplier_id, "notes": payload.notes,
        "created_by": by_name, "created_at": now,
    })

    # التوزيع على الفواتير الأقدم أولاً
    left = amount
    affected = []
    for p, remaining, paid in open_invs:
        if left <= 0.01:
            break
        alloc = round(min(left, remaining), 2)
        new_paid = round(paid + alloc, 2)
        new_status = "paid" if new_paid >= float(p.get("total_amount") or 0) - 0.01 else "partial"
        payment_rec = {
            "id": str(uuid.uuid4()), "amount": alloc, "payment_method": payload.payment_method,
            "withdrawal_id": withdrawal_id, "notes": payload.notes, "paid_by": by_name,
            "date": pay_date, "created_at": now,
        }
        await db.purchases_new.update_one(
            {"id": p["id"]},
            {"$push": {"payments": payment_rec}, "$set": {"paid_amount": new_paid, "payment_status": new_status}},
        )
        affected.append({"purchase_id": p["id"], "purchase_number": p.get("purchase_number"), "amount": alloc})
        left = round(left - alloc, 2)

    return {
        "message": "تم تسديد المبلغ وخصمه من إجمالي خزينة المالك",
        "amount_paid": amount,
        "invoices_affected": len(affected),
        "remaining_dues": round(total_remaining - amount, 2),
        "treasury_balance": round(balance - amount, 2),
    }


@router.post("/suppliers/{supplier_id}/settle-dues")
async def settle_supplier_dues(supplier_id: str, current_user: dict = Depends(get_current_user)):
    """تصفير مستحقات المورد (تسوية بدون خصم من الخزينة) — للمبالغ المسحوبة يدوياً مسبقاً."""
    db = get_db()
    if current_user["role"] not in [UserRole.ADMIN, UserRole.GENERAL_MANAGER, UserRole.SUPER_ADMIN]:
        raise HTTPException(status_code=403, detail="غير مصرح — التصفير للمالك فقط")
    tenant_id = get_user_tenant_id(current_user)
    supplier = await db.suppliers.find_one({"id": supplier_id}, {"_id": 0})
    if not supplier:
        raise HTTPException(status_code=404, detail="المورد غير موجود")

    open_invs = await _supplier_open_invoices(db, supplier_id, tenant_id)
    if not open_invs:
        raise HTTPException(status_code=400, detail="لا توجد مستحقات على هذا المورد")

    now = datetime.now(timezone.utc).isoformat()
    by_name = current_user.get("full_name") or current_user.get("username") or "النظام"
    settled_total = 0.0
    for p, remaining, paid in open_invs:
        new_paid = round(float(p.get("total_amount") or 0), 2)
        payment_rec = {
            "id": str(uuid.uuid4()), "amount": round(remaining, 2),
            "payment_method": "manual_settlement", "no_treasury": True,
            "notes": "تسوية يدوية — تصفير مستحقات (مسحوبة مسبقاً)", "paid_by": by_name,
            "date": now[:10], "created_at": now,
        }
        await db.purchases_new.update_one(
            {"id": p["id"]},
            {"$push": {"payments": payment_rec}, "$set": {"paid_amount": new_paid, "payment_status": "paid"}},
        )
        settled_total = round(settled_total + remaining, 2)

    return {
        "message": "تم تصفير مستحقات المورد بدون خصم من الخزينة",
        "settled_amount": settled_total,
        "invoices_settled": len(open_invs),
    }


@router.get("/suppliers/{supplier_id}/account")
async def supplier_account(supplier_id: str, start: Optional[str] = None, end: Optional[str] = None,
                           current_user: dict = Depends(get_current_user)):
    """كشف حساب المورد: مدين/دائن، الفواتير، الدفعات، وتجميع شهري للرسم البياني."""
    db = get_db()
    tenant_id = get_user_tenant_id(current_user)
    supplier = await db.suppliers.find_one({"id": supplier_id}, {"_id": 0})
    if not supplier:
        raise HTTPException(status_code=404, detail="المورد غير موجود")
    q = {"supplier_id": supplier_id}
    if tenant_id:
        q["tenant_id"] = tenant_id
    invs = await db.purchases_new.find(q, {"_id": 0}).to_list(20000)

    def in_range(d):
        if not d:
            return True
        ds = str(d)[:10]
        if start and ds < start:
            return False
        if end and ds > end:
            return False
        return True

    total_debit = 0.0  # إجمالي الفواتير (مستحق على المحل)
    total_credit = 0.0  # إجمالي المدفوع
    invoices_out = []
    payments_out = []
    monthly = {}
    ledger = []
    for p in invs:
        inv_date = (p.get("invoice_date") or p.get("created_at") or "")[:10]
        summ = _purchase_payment_summary(p)
        amt = round(float(p.get("total_amount") or 0), 2)
        if in_range(inv_date):
            total_debit = round(total_debit + amt, 2)
            invoices_out.append({
                "id": p.get("id"), "purchase_number": p.get("purchase_number"),
                "invoice_number": p.get("invoice_number"), "date": inv_date,
                "total_amount": amt, "paid_amount": summ["paid_amount"],
                "remaining_amount": summ["remaining_amount"], "payment_status": summ["pay_status"],
            })
            m = inv_date[:7] or "—"
            monthly.setdefault(m, {"month": m, "debit": 0.0, "credit": 0.0})
            monthly[m]["debit"] = round(monthly[m]["debit"] + amt, 2)
            ledger.append({"date": inv_date, "type": "debit", "amount": amt,
                           "description": f"فاتورة #{p.get('purchase_number')}"})
        for pay in (p.get("payments") or []):
            pd = str(pay.get("date") or pay.get("created_at") or "")[:10]
            if in_range(pd):
                pamt = round(float(pay.get("amount") or 0), 2)
                total_credit = round(total_credit + pamt, 2)
                payments_out.append({
                    "id": pay.get("id"), "date": pd, "amount": pamt,
                    "payment_method": pay.get("payment_method"), "no_treasury": pay.get("no_treasury", False),
                    "purchase_number": p.get("purchase_number"), "paid_by": pay.get("paid_by"),
                })
                m = pd[:7] or "—"
                monthly.setdefault(m, {"month": m, "debit": 0.0, "credit": 0.0})
                monthly[m]["credit"] = round(monthly[m]["credit"] + pamt, 2)
                ledger.append({"date": pd, "type": "credit", "amount": pamt,
                               "description": f"دفعة — فاتورة #{p.get('purchase_number')}"})

    ledger.sort(key=lambda x: x.get("date") or "")
    payments_out.sort(key=lambda x: x.get("date") or "", reverse=True)
    invoices_out.sort(key=lambda x: x.get("date") or "", reverse=True)
    monthly_list = sorted(monthly.values(), key=lambda x: x["month"])

    return {
        "supplier": {"id": supplier.get("id"), "name": supplier.get("name"),
                     "company_name": supplier.get("company_name"), "phone": supplier.get("phone")},
        "summary": {
            "total_debit": total_debit,
            "total_credit": total_credit,
            "total_remaining": round(max(total_debit - total_credit, 0), 2),
            "invoices_count": len(invoices_out),
        },
        "invoices": invoices_out,
        "payments": payments_out,
        "monthly": monthly_list,
        "ledger": ledger,
    }



# ==================== PURCHASE REQUESTS (طلبات الشراء من المخزن) ====================

@router.post("/warehouse-purchase-requests")
async def create_warehouse_purchase_request(request: PurchaseRequestCreate, current_user: dict = Depends(get_current_user)):
    """إنشاء طلب شراء من المخزن — يبدأ بحالة pending_owner_approval"""
    db = get_db()
    
    # رقم تسلسلي
    last_request = await db.warehouse_purchase_requests.find_one(sort=[("request_number", -1)])
    request_number = (last_request.get("request_number", 0) if last_request else 0) + 1
    
    request_doc = {
        "id": str(uuid.uuid4()),
        "request_number": request_number,
        "items": request.items,
        "priority": request.priority,
        "status": "pending_owner_approval",
        "notes": request.notes,
        "created_by": current_user.get("id"),
        "created_by_name": current_user.get("full_name") or current_user.get("username") or "warehouse",
        "created_at": datetime.now(timezone.utc).isoformat(),
        "tenant_id": current_user.get("tenant_id"),
        # تتبع كامل لمراحل التدفق
        "owner_approved_by": None,
        "owner_approved_by_name": None,
        "owner_approved_at": None,
        "owner_rejected_reason": None,
        "purchasing_handled_by": None,
        "purchasing_handled_at": None,
        "purchase_invoice_id": None,
        "warehouse_received_by": None,
        "warehouse_received_at": None,
    }
    
    await db.warehouse_purchase_requests.insert_one(request_doc)
    del request_doc["_id"]
    return request_doc


@router.post("/warehouse-purchase-requests/{request_id}/approve")
async def approve_warehouse_purchase_request(
    request_id: str,
    current_user: dict = Depends(get_current_user)
):
    """موافقة المالك على طلب الشراء — ينقله للمشتريات.
    
    صلاحية المالك/المدير العام فقط.
    """
    if current_user.get("role") not in ["admin", "manager", "super_admin", "owner"]:
        raise HTTPException(status_code=403, detail="فقط المالك/المدير يستطيع الموافقة")
    
    db = get_db()
    req = await db.warehouse_purchase_requests.find_one({"id": request_id})
    if not req:
        raise HTTPException(status_code=404, detail="الطلب غير موجود")
    if req.get("status") != "pending_owner_approval":
        raise HTTPException(status_code=400, detail=f"حالة الطلب الحالية ({req.get('status')}) لا تسمح بالموافقة")
    
    await db.warehouse_purchase_requests.update_one(
        {"id": request_id},
        {"$set": {
            "status": "approved_by_owner",
            "owner_approved_by": current_user.get("id"),
            "owner_approved_by_name": current_user.get("full_name") or current_user.get("username"),
            "owner_approved_at": datetime.now(timezone.utc).isoformat(),
        }}
    )
    return {"message": "تمت الموافقة وأُرسل الطلب للمشتريات", "request_id": request_id}


@router.post("/warehouse-purchase-requests/{request_id}/reject")
async def reject_warehouse_purchase_request(
    request_id: str,
    payload: dict,
    current_user: dict = Depends(get_current_user)
):
    """رفض المالك لطلب الشراء."""
    if current_user.get("role") not in ["admin", "manager", "super_admin", "owner"]:
        raise HTTPException(status_code=403, detail="فقط المالك/المدير يستطيع الرفض")
    
    db = get_db()
    req = await db.warehouse_purchase_requests.find_one({"id": request_id})
    if not req:
        raise HTTPException(status_code=404, detail="الطلب غير موجود")
    if req.get("status") not in ["pending_owner_approval", "approved_by_owner"]:
        raise HTTPException(status_code=400, detail="لا يمكن رفض هذا الطلب في حالته الحالية")
    
    reason = (payload or {}).get("reason", "")
    await db.warehouse_purchase_requests.update_one(
        {"id": request_id},
        {"$set": {
            "status": "rejected_by_owner",
            "owner_approved_by": current_user.get("id"),
            "owner_approved_by_name": current_user.get("full_name") or current_user.get("username"),
            "owner_approved_at": datetime.now(timezone.utc).isoformat(),
            "owner_rejected_reason": reason,
        }}
    )
    return {"message": "تم رفض الطلب", "request_id": request_id}


@router.post("/warehouse-purchase-requests/{request_id}/price-and-create-invoice")
async def price_request_and_create_invoice(
    request_id: str,
    payload: dict,
    current_user: dict = Depends(get_current_user)
):
    """قسم المشتريات يدخل اسم المورد + الأسعار + رقم الفاتورة، 
    ويُنشئ فاتورة شراء (purchases_new) مرتبطة بطلب المخزن.
    
    payload: {
        supplier_id: str,
        invoice_number: str,
        items: [{name, quantity, unit, cost_per_unit}],
        total_amount: float,
        payment_method: str,
        payment_status: str,
        notes: str (optional)
    }
    
    الفاتورة تبدأ pending وتنتظر إرسالها للمخزن (مرحلة الاستلام).
    """
    if current_user.get("role") not in ["admin", "manager", "super_admin", "owner", "purchasing", "purchasing_keeper"]:
        raise HTTPException(status_code=403, detail="غير مسموح")
    
    db = get_db()
    req = await db.warehouse_purchase_requests.find_one({"id": request_id})
    if not req:
        raise HTTPException(status_code=404, detail="الطلب غير موجود")
    if req.get("status") != "approved_by_owner":
        raise HTTPException(status_code=400, detail="يجب أن يكون الطلب معتمداً من المالك")
    
    # إنشاء فاتورة شراء
    last_purchase = await db.purchases_new.find_one(sort=[("purchase_number", -1)])
    purchase_number = (last_purchase.get("purchase_number", 0) if last_purchase else 0) + 1
    
    supplier = await db.suppliers.find_one({"id": payload.get("supplier_id")}, {"_id": 0})
    
    items = payload.get("items", [])
    items_with_totals = []
    detected_alerts = []
    tenant_id = current_user.get("tenant_id")
    
    # خريطة: اسم → raw_material_id من الطلب الأصلي (للحفاظ على الربط)
    request_items_by_name = {}
    for ri in (req.get("items") or []):
        rname = (ri.get("name") or "").strip()
        if rname and ri.get("raw_material_id"):
            request_items_by_name[rname] = ri.get("raw_material_id")

    # === فرض تبرير زيادة السعر +10% أو أكثر ===
    PRICE_INCREASE_THRESHOLD_PCT = 10.0
    reasons_by_id = (payload.get("price_increase_reasons") or {}).get("by_id") or {}
    reasons_by_name = (payload.get("price_increase_reasons") or {}).get("by_name") or {}
    missing_justifications = []
    price_increase_log = []

    # جلب آخر سعر شراء لكل صنف (من purchases_new) ومقارنته بالسعر الحالي
    for item in items:
        new_cost = float(item.get("cost_per_unit", 0) or 0)
        if new_cost <= 0:
            continue
        iname = (item.get("name") or "").strip()
        rm_id = item.get("raw_material_id") or request_items_by_name.get(iname)
        # ابحث عن آخر فاتورة شراء تحتوي على هذا الصنف
        match_query: Dict[str, Any] = {}
        if tenant_id:
            match_query["tenant_id"] = tenant_id
        if rm_id:
            match_query["items.raw_material_id"] = rm_id
        else:
            match_query["items.name"] = iname
        last_inv = await db.purchases_new.find_one(
            match_query, {"_id": 0}, sort=[("created_at", -1)]
        )
        if not last_inv:
            continue
        last_cost = 0.0
        for li in (last_inv.get("items") or []):
            if rm_id and li.get("raw_material_id") == rm_id:
                last_cost = float(li.get("cost_per_unit", 0) or 0)
                break
            if (not rm_id) and (li.get("name") or "").strip() == iname:
                last_cost = float(li.get("cost_per_unit", 0) or 0)
                break
        if last_cost <= 0:
            continue
        diff_pct = ((new_cost - last_cost) / last_cost) * 100.0
        if diff_pct >= PRICE_INCREASE_THRESHOLD_PCT:
            key = rm_id or iname
            reason = (reasons_by_id.get(rm_id) if rm_id else None) or reasons_by_name.get(iname) or ""
            reason = (reason or "").strip()
            if not reason:
                missing_justifications.append({
                    "raw_material_id": rm_id,
                    "name": iname,
                    "new_cost": round(new_cost, 2),
                    "last_cost": round(last_cost, 2),
                    "diff_pct": round(diff_pct, 2),
                })
            else:
                price_increase_log.append({
                    "raw_material_id": rm_id,
                    "name": iname,
                    "new_cost": round(new_cost, 2),
                    "last_cost": round(last_cost, 2),
                    "diff_pct": round(diff_pct, 2),
                    "reason": reason,
                    "supplier_name": last_inv.get("supplier_name"),
                    "last_invoice_number": last_inv.get("invoice_number"),
                    "last_purchase_date": last_inv.get("created_at"),
                })

    if missing_justifications:
        raise HTTPException(
            status_code=400,
            detail={
                "code": "PRICE_INCREASE_REASON_REQUIRED",
                "message": "يتطلب تبرير زيادة السعر +10% أو أكثر لبعض الأصناف",
                "threshold_pct": PRICE_INCREASE_THRESHOLD_PCT,
                "items_requiring_reason": missing_justifications,
            },
        )

    for item in items:
        item_dict = dict(item)
        item_dict["total_cost"] = float(item.get("quantity", 0)) * float(item.get("cost_per_unit", 0))
        # احفظ raw_material_id من الطلب الأصلي إن لم يكن مُحدداً
        if not item_dict.get("raw_material_id"):
            iname = (item.get("name") or "").strip()
            if iname in request_items_by_name:
                item_dict["raw_material_id"] = request_items_by_name[iname]
        items_with_totals.append(item_dict)

        # === كشف فرق السعر vs raw_materials.cost_per_unit ===
        # نبحث المادة بالـ id إن وُجد، وإلا بالاسم
        material_id = item_dict.get("raw_material_id") or item.get("material_id")
        if not material_id:
            mq = {"name": item.get("name")}
            if tenant_id:
                mq["tenant_id"] = tenant_id
            existing_material = await db.raw_materials.find_one(mq, {"_id": 0, "id": 1})
            if existing_material:
                material_id = existing_material.get("id")
        if material_id:
            alert = await detect_price_increase(
                db,
                tenant_id=tenant_id,
                material_id=material_id,
                material_name=item.get("name"),
                unit=item.get("unit", "كغم"),
                quantity=float(item.get("quantity", 0) or 0),
                new_cost=float(item.get("cost_per_unit", 0) or 0),
                purchase_id=None,  # سنُحدّثه بعد إنشاء الفاتورة
                purchase_number=str(purchase_number),
                triggered_by_user_id=current_user.get("id"),
                triggered_by_role=current_user.get("role"),
            )
            if alert:
                detected_alerts.append(alert)
    
    purchase_id = str(uuid.uuid4())
    purchase_doc = {
        "id": purchase_id,
        "purchase_number": purchase_number,
        "supplier_id": payload.get("supplier_id"),
        "supplier_name": supplier.get("name") if supplier else payload.get("supplier_name"),
        "invoice_number": payload.get("invoice_number"),
        "invoice_image_url": None,
        "items": items_with_totals,
        "total_amount": payload.get("total_amount", sum(i["total_cost"] for i in items_with_totals)),
        "payment_method": payload.get("payment_method", "cash"),
        "payment_status": payload.get("payment_status", "paid"),
        "status": "pending",
        "notes": payload.get("notes"),
        "linked_request_id": request_id,
        "price_increase_log": price_increase_log,  # ⭐ سجل تبريرات زيادة السعر +10% للمراجعة
        "created_by": current_user.get("id"),
        "created_at": datetime.now(timezone.utc).isoformat(),
        "tenant_id": current_user.get("tenant_id"),
        "sent_to_warehouse_at": None,
        "sent_to_warehouse_by": None,
    }
    await db.purchases_new.insert_one(purchase_doc)

    # ربط التنبيهات بالـ purchase_id الجديد
    if detected_alerts:
        await db.price_alerts.update_many(
            {"id": {"$in": [a["id"] for a in detected_alerts]}},
            {"$set": {"purchase_id": purchase_id}}
        )
    
    # تحديث طلب المخزن — يدعم الفواتير الجزئية
    is_partial = bool(payload.get("partial"))
    invoice_ids = list(req.get("purchase_invoice_ids") or [])
    if req.get("purchase_invoice_id") and req.get("purchase_invoice_id") not in invoice_ids:
        invoice_ids.append(req.get("purchase_invoice_id"))
    invoice_ids.append(purchase_id)

    if is_partial:
        # نقص الكميات المشتراة من بنود الطلب (لإبقاء المتبقي مفتوحاً)
        purchased_qty_by_key = {}
        for it in items_with_totals:
            rm_id = it.get("raw_material_id")
            iname = (it.get("name") or "").strip()
            key = rm_id or f"name::{iname}"
            purchased_qty_by_key[key] = purchased_qty_by_key.get(key, 0.0) + float(it.get("quantity", 0) or 0)

        updated_items = []
        for ri in (req.get("items") or []):
            rm_id = ri.get("raw_material_id")
            iname = (ri.get("name") or "").strip()
            key = rm_id or f"name::{iname}"
            remaining = float(ri.get("quantity", 0) or 0) - purchased_qty_by_key.get(key, 0.0)
            if remaining < 0:
                remaining = 0.0
            if remaining > 0:
                new_ri = dict(ri)
                new_ri["quantity"] = remaining
                updated_items.append(new_ri)

        if updated_items:
            # ابقَ الطلب مفتوحاً (معتمد من المالك) للسماح بفواتير أخرى للباقي
            await db.warehouse_purchase_requests.update_one(
                {"id": request_id},
                {"$set": {
                    "status": "approved_by_owner",
                    "items": updated_items,
                    "purchasing_handled_by": current_user.get("id"),
                    "purchasing_handled_by_name": current_user.get("full_name") or current_user.get("username"),
                    "purchasing_handled_at": datetime.now(timezone.utc).isoformat(),
                    "purchase_invoice_ids": invoice_ids,
                    "last_partial_at": datetime.now(timezone.utc).isoformat(),
                }}
            )
        else:
            # لم يتبقَّ شيء — أغلق الطلب رسمياً
            await db.warehouse_purchase_requests.update_one(
                {"id": request_id},
                {"$set": {
                    "status": "priced_by_purchasing",
                    "purchasing_handled_by": current_user.get("id"),
                    "purchasing_handled_by_name": current_user.get("full_name") or current_user.get("username"),
                    "purchasing_handled_at": datetime.now(timezone.utc).isoformat(),
                    "purchase_invoice_id": purchase_id,
                    "purchase_invoice_ids": invoice_ids,
                }}
            )
    else:
        await db.warehouse_purchase_requests.update_one(
            {"id": request_id},
            {"$set": {
                "status": "priced_by_purchasing",
                "purchasing_handled_by": current_user.get("id"),
                "purchasing_handled_by_name": current_user.get("full_name") or current_user.get("username"),
                "purchasing_handled_at": datetime.now(timezone.utc).isoformat(),
                "purchase_invoice_id": purchase_id,
                "purchase_invoice_ids": invoice_ids,
            }}
        )
    
    return {
        "message": "تم تسعير الطلب وإنشاء الفاتورة. أرفق صورة الفاتورة ثم أرسلها للمخزن.",
        "purchase_id": purchase_id,
        "purchase_number": purchase_number,
        "price_alerts": detected_alerts,  # تنبيهات الزيادة/النقصان (إن وُجدت)
        "price_alerts_count": len(detected_alerts),
        "partial": is_partial,
    }


@router.get("/inventory-movements")
async def get_inventory_movements(
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    material_id: Optional[str] = None,
    movement_type: Optional[str] = None,
    category: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """قائمة حركات المخزن (دخول وخروج) خلال فترة.
    
    Query params:
    - start_date / end_date: نطاق تاريخي (YYYY-MM-DD)
    - material_id: تصفية حسب مادة محددة
    - movement_type: 'in' أو 'out' أو 'adjustment'
    - category: 'incoming' | 'to_manufacturing' | 'manufacturing' | 'to_branch'
    
    إن لم تُحدَّد التواريخ، تُرجع آخر 30 يوماً.
    """
    db = get_db()
    query = {}
    if current_user.get("tenant_id"):
        query["$or"] = [
            {"tenant_id": current_user["tenant_id"]},
            {"tenant_id": {"$exists": False}},
            {"tenant_id": None},
        ]
    
    # نطاق تاريخي افتراضي: آخر 30 يوماً
    if not start_date:
        start_date = (datetime.now(timezone.utc) - timedelta(days=30)).date().isoformat()
    if not end_date:
        end_date = datetime.now(timezone.utc).date().isoformat()
    
    query["created_at"] = {
        "$gte": start_date + "T00:00:00",
        "$lte": end_date + "T23:59:59",
    }
    
    if material_id:
        query["material_id"] = material_id
    if movement_type:
        query["type"] = movement_type
    
    # خريطة تصنيف الحركات (5 فئات شاملة)
    CATEGORY_MAP = {
        "incoming": [
            "in", "purchase_received", "manual_stock_add", "raw_material_stock_add",
            "incoming", "packaging_stock_added",
        ],
        "to_manufacturing": [
            "warehouse_to_manufacturing", "raw_material_to_manufacturing",
            "manufacturing_transfer", "partial_transfer",
        ],
        "manufacturing": [
            "product_manufactured", "manufacturing",
        ],
        "consumption": [
            "manufacturing_consumption", "manufactured_consumption",
        ],
        "to_branch": [
            "transfer_to_branch", "branch_request_fulfilled", "out",
        ],
    }
    if category and category in CATEGORY_MAP:
        query["type"] = {"$in": CATEGORY_MAP[category]}
    
    movements = await db.inventory_movements.find(query, {"_id": 0}).sort("created_at", -1).to_list(2000)
    
    # تصنيف كل حركة — النوع هو المرجع (يصحّح أي category مخزّن قديم/غير دقيق)
    type_to_category = {}
    for cat, types in CATEGORY_MAP.items():
        for t in types:
            type_to_category[t] = cat
    for m in movements:
        derived = type_to_category.get(m.get("type"))
        if derived:
            m["category"] = derived
        elif not m.get("category"):
            m["category"] = "other"
    
    # ملخص الفترة
    total_in = sum(m.get("quantity", 0) for m in movements if m.get("type") in CATEGORY_MAP["incoming"])
    total_out = sum(m.get("quantity", 0) for m in movements if m.get("type") in (CATEGORY_MAP["to_branch"] + CATEGORY_MAP["to_manufacturing"]))
    total_in_value = sum(m.get("total_value", 0) for m in movements if m.get("type") in CATEGORY_MAP["incoming"])
    total_out_value = sum(m.get("total_value", 0) for m in movements if m.get("type") in (CATEGORY_MAP["to_branch"] + CATEGORY_MAP["to_manufacturing"]))
    
    # ملخص لكل فئة
    category_summary = {cat: {"count": 0, "value": 0.0, "quantity": 0.0} for cat in CATEGORY_MAP}
    for m in movements:
        cat = m.get("category", "other")
        if cat in category_summary:
            category_summary[cat]["count"] += 1
            category_summary[cat]["value"] += m.get("total_value", 0) or 0
            category_summary[cat]["quantity"] += m.get("quantity", 0) or 0
    
    # ملخص شهري (تجميع حسب اليوم)
    daily_summary = {}
    for m in movements:
        day = m.get("created_at", "")[:10]
        if not day:
            continue
        if day not in daily_summary:
            daily_summary[day] = {"date": day, "in_qty": 0, "out_qty": 0, "in_value": 0, "out_value": 0, "movements": 0}
        if m.get("type") in CATEGORY_MAP["incoming"]:
            daily_summary[day]["in_qty"] += m.get("quantity", 0)
            daily_summary[day]["in_value"] += m.get("total_value", 0)
        elif m.get("type") in (CATEGORY_MAP["to_branch"] + CATEGORY_MAP["to_manufacturing"]):
            daily_summary[day]["out_qty"] += m.get("quantity", 0)
            daily_summary[day]["out_value"] += m.get("total_value", 0)
        daily_summary[day]["movements"] += 1
    
    return {
        "movements": movements,
        "summary": {
            "total_in": total_in,
            "total_out": total_out,
            "total_in_value": total_in_value,
            "total_out_value": total_out_value,
            "movements_count": len(movements),
            "period": {"start": start_date, "end": end_date},
            "by_category": category_summary,
        },
        "daily": sorted(daily_summary.values(), key=lambda x: x["date"], reverse=True),
    }


@router.get("/reports/raw-material-consumption")
async def get_raw_material_consumption(
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    material_id: Optional[str] = None,
    product_id: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """تقرير حركة استهلاك المواد الخام في التصنيع.

    يُجمّع حركات الاستهلاك (manufacturing_consumption / manufactured_consumption)
    خلال فترة، ويعرض:
      - السجل التفصيلي (المادة، المنتج المُصنّع، الكمية، القيمة، التاريخ، المُنفّذ)
      - ملخص لكل مادة خام (إجمالي الكمية والقيمة)
      - ملخص لكل منتج مُصنّع (إجمالي قيمة المواد المستهلكة)
    """
    db = get_db()
    if not start_date:
        start_date = (datetime.now(timezone.utc) - timedelta(days=30)).date().isoformat()
    if not end_date:
        end_date = datetime.now(timezone.utc).date().isoformat()

    query = {
        "type": {"$in": ["manufacturing_consumption", "manufactured_consumption"]},
        "created_at": {"$gte": start_date + "T00:00:00", "$lte": end_date + "T23:59:59"},
    }
    if current_user.get("tenant_id"):
        query["$or"] = [
            {"tenant_id": current_user["tenant_id"]},
            {"tenant_id": {"$exists": False}},
            {"tenant_id": None},
        ]
    if material_id:
        query["material_id"] = material_id
    if product_id:
        query["product_id"] = product_id

    movements = await db.inventory_movements.find(query, {"_id": 0}).sort("created_at", -1).to_list(5000)

    by_material = {}
    by_product = {}
    total_qty = 0.0
    total_value = 0.0
    for m in movements:
        qty = abs(m.get("quantity", 0) or 0)
        val = abs(m.get("total_value", 0) or m.get("cost_after_waste", 0) or 0)
        total_qty += qty
        total_value += val
        mkey = m.get("material_id") or m.get("material_name") or m.get("product_name") or "—"
        mat = by_material.setdefault(mkey, {
            "material_id": m.get("material_id"),
            "material_name": m.get("material_name") or m.get("product_name") or "—",
            "unit": m.get("unit"), "quantity": 0.0, "value": 0.0, "count": 0
        })
        mat["quantity"] += qty
        mat["value"] += val
        mat["count"] += 1
        pkey = m.get("product_id") or m.get("product_name") or "—"
        prod = by_product.setdefault(pkey, {
            "product_id": m.get("product_id"),
            "product_name": m.get("product_name") or "—",
            "value": 0.0, "count": 0
        })
        prod["value"] += val
        prod["count"] += 1

    for v in by_material.values():
        v["quantity"] = round(v["quantity"], 3)
        v["value"] = round(v["value"], 2)
    for v in by_product.values():
        v["value"] = round(v["value"], 2)

    return {
        "movements": movements,
        "by_material": sorted(by_material.values(), key=lambda x: x["value"], reverse=True),
        "by_product": sorted(by_product.values(), key=lambda x: x["value"], reverse=True),
        "summary": {
            "total_quantity": round(total_qty, 3),
            "total_value": round(total_value, 2),
            "movements_count": len(movements),
            "period": {"start": start_date, "end": end_date},
        },
    }



@router.post("/warehouse-purchase-requests/{request_id}/confirm-receipt")
async def confirm_warehouse_receipt(
    request_id: str,
    payload: Optional[dict] = None,
    current_user: dict = Depends(get_current_user)
):
    """المخزن يؤكد استلام البضاعة → يُضيف الكميات للمخزون + يُنشئ حركة مخزن لكل فاتورة.

    يدعم الفواتير الجزئية: لكل فاتورة شراء مرتبطة، يُنشئ حركة مخزن منفصلة + يُحدث حالة الفاتورة.
    Body اختياري: { purchase_id: str } — لاستلام فاتورة واحدة فقط من بين عدة فواتير جزئية.
    عند استلام كل الفواتير، يُغلق الطلب نهائياً (`received_by_warehouse`).
    """
    db = get_db()
    req = await db.warehouse_purchase_requests.find_one({"id": request_id})
    if not req:
        raise HTTPException(status_code=404, detail="الطلب غير موجود")
    if req.get("status") not in ("priced_by_purchasing", "approved_by_owner"):
        # نسمح بـ approved_by_owner لأنّ الطلب قد يكون مفتوحاً بسبب فواتير جزئية سابقة
        raise HTTPException(status_code=400, detail="الطلب غير جاهز للاستلام")

    # حدد قائمة الفواتير المراد استلامها
    target_purchase_id = (payload or {}).get("purchase_id") if payload else None
    all_invoice_ids = list(req.get("purchase_invoice_ids") or [])
    if req.get("purchase_invoice_id") and req.get("purchase_invoice_id") not in all_invoice_ids:
        all_invoice_ids.append(req.get("purchase_invoice_id"))
    if not all_invoice_ids:
        raise HTTPException(status_code=400, detail="لا توجد فواتير شراء مرتبطة بهذا الطلب")

    invoice_ids_to_process = [target_purchase_id] if target_purchase_id else all_invoice_ids

    # إضافة المواد للمخزن (نفس منطق send-to-warehouse) — نظام طبقات FIFO
    movements_logged = 0
    received_purchase_ids = []
    tenant_id = current_user.get("tenant_id")
    for purchase_id in invoice_ids_to_process:
        purchase = await db.purchases_new.find_one({"id": purchase_id}) if purchase_id else None
        if not purchase:
            continue
        if purchase.get("status") != "pending":
            # هذه الفاتورة استُلمت سابقاً — تخطَّها
            continue

        for item in purchase.get("items", []):
            item_qty = float(item.get("quantity", 0) or 0)
            item_cost = float(item.get("cost_per_unit", 0) or 0)
            # تطابق بالـ raw_material_id أولاً (الأدق)، ثم بالاسم
            raw_material = None
            preset_id = item.get("raw_material_id") or item.get("material_id")
            if preset_id:
                rmq = {"id": preset_id}
                if tenant_id:
                    rmq["$or"] = [
                        {"tenant_id": tenant_id},
                        {"tenant_id": {"$exists": False}},
                        {"tenant_id": None},
                    ]
                raw_material = await db.raw_materials.find_one(rmq)
            if not raw_material:
                mq = {"name": item.get("name")}
                if tenant_id:
                    mq["tenant_id"] = tenant_id
                raw_material = await db.raw_materials.find_one(mq)
            if raw_material:
                # زِد الكمية فقط — لا تُحدّث cost_per_unit (سيُحدَّد من أقدم طبقة)
                new_quantity = float(raw_material.get("quantity", 0) or 0) + item_qty
                await db.raw_materials.update_one(
                    {"id": raw_material["id"]},
                    {"$set": {
                        "quantity": new_quantity,
                        "last_updated": datetime.now(timezone.utc).isoformat(),
                    }}
                )
                material_id_for_log = raw_material["id"]
                material_name_for_log = raw_material.get("name")
                # أضف طبقة تكلفة جديدة (FIFO)
                await add_cost_layer(
                    db,
                    material_id=raw_material["id"],
                    material_name=raw_material.get("name") or item.get("name"),
                    unit=item.get("unit") or raw_material.get("unit") or "كغم",
                    quantity=item_qty,
                    unit_cost=item_cost,
                    tenant_id=tenant_id,
                    source="purchase",
                    source_id=purchase_id,
                    source_number=str(purchase.get("purchase_number") or ""),
                )
                # بعد الإضافة: cost_per_unit = تكلفة أقدم طبقة نشطة
                effective = await get_current_effective_cost(db, raw_material["id"], tenant_id)
                if effective is not None:
                    await db.raw_materials.update_one(
                        {"id": raw_material["id"]},
                        {"$set": {
                            "cost_per_unit": effective,
                            "last_cost_updated_at": datetime.now(timezone.utc).isoformat(),
                        }}
                    )
            else:
                new_id = str(uuid.uuid4())
                await db.raw_materials.insert_one({
                    "id": new_id,
                    "name": item.get("name"),
                    "name_en": None,
                    "unit": item.get("unit", "كغم"),
                    "quantity": item_qty,
                    "min_quantity": 0,
                    "cost_per_unit": item_cost,
                    "category": None,
                    "last_updated": datetime.now(timezone.utc).isoformat(),
                    "created_at": datetime.now(timezone.utc).isoformat(),
                    "tenant_id": tenant_id,
                })
                material_id_for_log = new_id
                material_name_for_log = item.get("name")
                # طبقة أولى للمادة الجديدة
                await add_cost_layer(
                    db,
                    material_id=new_id,
                    material_name=item.get("name"),
                    unit=item.get("unit") or "كغم",
                    quantity=item_qty,
                    unit_cost=item_cost,
                    tenant_id=tenant_id,
                    source="purchase",
                    source_id=purchase_id,
                    source_number=str(purchase.get("purchase_number") or ""),
                )

            # === تسجيل حركة دخول (IN) في inventory_movements — منفصلة لكل فاتورة ===
            await db.inventory_movements.insert_one({
                "id": str(uuid.uuid4()),
                "type": "in",
                "subtype": "purchase_receipt",
                "material_id": material_id_for_log,
                "material_name": material_name_for_log,
                "quantity": item.get("quantity", 0),
                "unit": item.get("unit"),
                "cost_per_unit": item.get("cost_per_unit", 0),
                "total_value": item.get("quantity", 0) * item.get("cost_per_unit", 0),
                "reference_type": "purchase_invoice",
                "reference_id": purchase_id,
                "reference_number": purchase.get("purchase_number"),
                "invoice_image_url": purchase.get("invoice_image_url"),  # ⭐ صورة كل فاتورة منفصلة
                "request_id": request_id,
                "request_number": req.get("request_number"),
                "supplier_name": purchase.get("supplier_name"),
                "performed_by": current_user.get("id"),
                "performed_by_name": current_user.get("full_name") or current_user.get("username"),
                "notes": f"استلام فاتورة شراء #{purchase.get('purchase_number')} من {purchase.get('supplier_name', 'مورد')}",
                "created_at": datetime.now(timezone.utc).isoformat(),
                "tenant_id": current_user.get("tenant_id"),
            })
            movements_logged += 1

        # حدّث حالة الفاتورة
        await db.purchases_new.update_one(
            {"id": purchase_id},
            {"$set": {
                "status": "sent_to_warehouse",
                "sent_to_warehouse_at": datetime.now(timezone.utc).isoformat(),
                "sent_to_warehouse_by": current_user.get("id"),
            }}
        )
        received_purchase_ids.append(purchase_id)

    # تحقق: هل استُلمت كل الفواتير المرتبطة؟
    pending_invoices = await db.purchases_new.count_documents({
        "id": {"$in": all_invoice_ids},
        "status": "pending",
    })

    if pending_invoices == 0 and not (req.get("items") or []):
        # كل الفواتير استُلمت ولا كميات متبقية في الطلب → أغلق نهائياً
        await db.warehouse_purchase_requests.update_one(
            {"id": request_id},
            {"$set": {
                "status": "received_by_warehouse",
                "warehouse_received_by": current_user.get("id"),
                "warehouse_received_by_name": current_user.get("full_name") or current_user.get("username"),
                "warehouse_received_at": datetime.now(timezone.utc).isoformat(),
            }}
        )
    elif pending_invoices == 0 and req.get("status") == "priced_by_purchasing":
        # كل الفواتير استُلمت، الطلب كان priced_by_purchasing → أغلق
        await db.warehouse_purchase_requests.update_one(
            {"id": request_id},
            {"$set": {
                "status": "received_by_warehouse",
                "warehouse_received_by": current_user.get("id"),
                "warehouse_received_by_name": current_user.get("full_name") or current_user.get("username"),
                "warehouse_received_at": datetime.now(timezone.utc).isoformat(),
            }}
        )

    return {
        "message": f"تم استلام {len(received_purchase_ids)} فاتورة وإضافة {movements_logged} حركة مخزن",
        "request_id": request_id,
        "received_purchase_ids": received_purchase_ids,
        "movements_logged": movements_logged,
        "pending_invoices_left": pending_invoices,
    }


@router.get("/warehouse-purchase-requests")
async def get_warehouse_purchase_requests(
    status: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """جلب طلبات الشراء.
    
    الحالات:
    - pending_owner_approval: ينتظر موافقة المالك
    - approved_by_owner: معتمد، ينتظر تسعير المشتريات
    - rejected_by_owner: مرفوض
    - priced_by_purchasing: تم تسعيره، ينتظر استلام المخزن
    - received_by_warehouse: مستلم نهائياً (مغلق)
    """
    db = get_db()
    query = {}
    if status:
        query["status"] = status
    if current_user.get("tenant_id"):
        query["$or"] = [
            {"tenant_id": current_user["tenant_id"]},
            {"tenant_id": {"$exists": False}},
            {"tenant_id": None},
        ]
    requests = await db.warehouse_purchase_requests.find(query, {"_id": 0}).sort("created_at", -1).to_list(1000)
    return requests

@router.patch("/warehouse-purchase-requests/{request_id}/status")
async def update_warehouse_purchase_request_status(request_id: str, status: str):
    """تحديث حالة طلب الشراء"""
    db = get_db()
    
    update_data = {"status": status}
    if status == "approved":
        update_data["approved_at"] = datetime.now(timezone.utc).isoformat()
        update_data["approved_by"] = "system"
    
    await db.warehouse_purchase_requests.update_one(
        {"id": request_id},
        {"$set": update_data}
    )
    
    return {"message": "تم تحديث الحالة"}

# ==================== RAW MATERIALS (المواد الخام - المخزن) ====================

@router.post("/raw-materials-new")
async def create_raw_material(material: RawMaterialCreate, current_user: dict = Depends(get_current_user)):
    """إضافة مادة خام جديدة"""
    db = get_db()
    tenant_id = get_user_tenant_id(current_user)
    
    # حساب التكلفة الفعلية بعد الهدر
    waste_percentage = material.waste_percentage or 0
    effective_cost = material.cost_per_unit
    if waste_percentage > 0 and waste_percentage < 100:
        effective_cost = material.cost_per_unit / (1 - waste_percentage / 100)
    
    material_doc = {
        "id": str(uuid.uuid4()),
        **material.model_dump(),
        "tenant_id": tenant_id,
        "effective_cost_per_unit": round(effective_cost, 2),
        "total_value": material.quantity * material.cost_per_unit,
        "last_updated": datetime.now(timezone.utc).isoformat(),
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    
    await db.raw_materials.insert_one(material_doc)
    del material_doc["_id"]
    return material_doc

# ==================== Cost Layers (FIFO) + Price Alerts ====================

@router.get("/raw-materials-new/{material_id}/cost-layers")
async def list_material_cost_layers(material_id: str, current_user: dict = Depends(get_current_user)):
    """طبقات تكلفة المادة (الأقدم أولاً) — للمالك/المخزن/المشتريات."""
    db = get_db()
    tenant_id = current_user.get("tenant_id")
    layers = await db.material_cost_layers.find(
        {"material_id": material_id, **({"tenant_id": tenant_id} if tenant_id else {})},
        {"_id": 0}
    ).sort("received_at", 1).to_list(500)
    active = [layer for layer in layers if layer.get("status") == "active" and (layer.get("remaining_quantity", 0) or 0) > 0]
    total_active_qty = sum(float(layer.get("remaining_quantity", 0) or 0) for layer in active)
    total_active_value = sum(float(layer.get("remaining_quantity", 0) or 0) * float(layer.get("unit_cost", 0) or 0) for layer in active)
    return {
        "material_id": material_id,
        "layers": layers,
        "active_count": len(active),
        "depleted_count": len(layers) - len(active),
        "total_active_quantity": round(total_active_qty, 4),
        "total_active_value": round(total_active_value, 2),
        "current_effective_cost": (active[0].get("unit_cost") if active else None),
    }


@router.get("/price-alerts")
async def list_price_alerts(
    status_filter: Optional[str] = None,  # 'unread' | 'read' | 'dismissed' | None=all
    limit: int = 100,
    current_user: dict = Depends(get_current_user)
):
    """تنبيهات تغير الأسعار — للمالك/السوبر فقط."""
    if current_user.get("role") not in ["admin", "super_admin"]:
        return {"alerts": [], "unread_count": 0, "total_count": 0}

    db = get_db()
    tenant_id = current_user.get("tenant_id")
    q = {}
    if tenant_id:
        q["tenant_id"] = tenant_id
    if status_filter in ("unread", "read", "dismissed"):
        q["status"] = status_filter

    alerts = await db.price_alerts.find(q, {"_id": 0}).sort("triggered_at", -1).to_list(max(1, min(limit, 500)))
    unread_q = {**q}
    unread_q["status"] = "unread"
    unread_count = await db.price_alerts.count_documents({"tenant_id": tenant_id, "status": "unread"} if tenant_id else {"status": "unread"})
    return {
        "alerts": alerts,
        "unread_count": unread_count,
        "total_count": len(alerts),
    }


@router.post("/price-alerts/{alert_id}/mark-read")
async def mark_price_alert_read(alert_id: str, current_user: dict = Depends(get_current_user)):
    if current_user.get("role") not in ["admin", "super_admin"]:
        raise HTTPException(status_code=403, detail="غير مسموح")
    db = get_db()
    res = await db.price_alerts.update_one(
        {"id": alert_id},
        {"$set": {"status": "read", "read_at": datetime.now(timezone.utc).isoformat()},
         "$addToSet": {"read_by": current_user.get("id")}}
    )
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="التنبيه غير موجود")
    return {"message": "تم تعليم التنبيه كمقروء"}


@router.post("/price-alerts/mark-all-read")
async def mark_all_price_alerts_read(current_user: dict = Depends(get_current_user)):
    if current_user.get("role") not in ["admin", "super_admin"]:
        raise HTTPException(status_code=403, detail="غير مسموح")
    db = get_db()
    tenant_id = current_user.get("tenant_id")
    q = {"status": "unread"}
    if tenant_id:
        q["tenant_id"] = tenant_id
    res = await db.price_alerts.update_many(
        q,
        {"$set": {"status": "read", "read_at": datetime.now(timezone.utc).isoformat()}}
    )
    return {"message": "تمت قراءة الكل", "updated": res.modified_count}


@router.post("/price-alerts/{alert_id}/dismiss")
async def dismiss_price_alert(alert_id: str, current_user: dict = Depends(get_current_user)):
    if current_user.get("role") not in ["admin", "super_admin"]:
        raise HTTPException(status_code=403, detail="غير مسموح")
    db = get_db()
    res = await db.price_alerts.update_one(
        {"id": alert_id},
        {"$set": {"status": "dismissed", "dismissed_at": datetime.now(timezone.utc).isoformat()}}
    )
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="التنبيه غير موجود")
    return {"message": "تم تجاهل التنبيه"}


@router.get("/raw-materials-new")
async def get_raw_materials(current_user: dict = Depends(get_current_user)):
    """جلب جميع المواد الخام"""
    db = get_db()
    tenant_id = get_user_tenant_id(current_user)
    
    query = {}
    if tenant_id:
        query["tenant_id"] = tenant_id
    
    materials = await db.raw_materials.find(query, {"_id": 0}).to_list(1000)
    
    # جلب IDs المواد المحوّلة (مرة واحدة) لتحسين الأداء
    transferred_ids = await _get_transferred_material_ids(db, tenant_id)
    
    # حساب القيمة الإجمالية والتكلفة الفعلية والإحصائيات لكل مادة
    for material in materials:
        material["total_value"] = material.get("quantity", 0) * material.get("cost_per_unit", 0)
        # حساب التكلفة الفعلية بعد الهدر إذا لم تكن موجودة
        waste_percentage = material.get("waste_percentage", 0)
        if waste_percentage > 0 and waste_percentage < 100 and not material.get("effective_cost_per_unit"):
            material["effective_cost_per_unit"] = round(material.get("cost_per_unit", 0) / (1 - waste_percentage / 100), 2)
        elif not material.get("effective_cost_per_unit"):
            material["effective_cost_per_unit"] = material.get("cost_per_unit", 0)
        
        # إحصائيات المخزون
        material["total_received"] = material.get("total_received", material.get("quantity", 0))
        material["transferred_to_manufacturing"] = material.get("transferred_to_manufacturing", 0)
        material["remaining_quantity"] = material.get("quantity", 0)
        
        # === حالة التحويل: هل خرجت المادة من المخزن إلى التصنيع من قبل؟ ===
        is_transferred = material["id"] in transferred_ids
        material["is_transferred"] = is_transferred
        material["can_edit"] = not is_transferred  # قبل التحويل: تعديل كامل
        material["can_delete"] = not is_transferred  # قبل التحويل: حذف مسموح
    
    return materials

@router.get("/reports/price-increases")
async def get_price_increase_report(
    days: int = 30,
    material_id: Optional[str] = None,
    supplier_id: Optional[str] = None,
    min_pct: float = 10.0,
    current_user: dict = Depends(get_current_user),
):
    """تقرير تبريرات زيادة أسعار الشراء +N% خلال آخر X يوم.

    يجمع كل سجلات `price_increase_log` من فواتير `purchases_new` ضمن النطاق المحدد.
    يدعم الفلترة بالمادة الخام، المورد، ونسبة الزيادة الأدنى.
    """
    db = get_db()
    tenant_id = get_user_tenant_id(current_user)
    cutoff = (datetime.now(timezone.utc) - timedelta(days=max(1, int(days)))).isoformat()

    query: Dict[str, Any] = {
        "price_increase_log": {"$exists": True, "$ne": []},
        "created_at": {"$gte": cutoff},
    }
    if tenant_id:
        query["tenant_id"] = tenant_id
    if supplier_id:
        query["supplier_id"] = supplier_id

    rows: List[Dict[str, Any]] = []
    summary_by_supplier: Dict[str, Dict[str, Any]] = {}
    summary_by_material: Dict[str, Dict[str, Any]] = {}

    async for inv in db.purchases_new.find(query, {"_id": 0}).sort([("created_at", -1)]).limit(2000):
        for entry in (inv.get("price_increase_log") or []):
            diff_pct = float(entry.get("diff_pct") or 0)
            if diff_pct < min_pct:
                continue
            if material_id and entry.get("raw_material_id") != material_id:
                continue
            old_c = float(entry.get("last_cost") or 0)
            new_c = float(entry.get("new_cost") or 0)
            # نحتاج إلى quantity لاحتساب القيمة المالية للزيادة
            qty = 0.0
            for it in (inv.get("items") or []):
                if entry.get("raw_material_id") and it.get("raw_material_id") == entry.get("raw_material_id"):
                    qty = float(it.get("quantity") or 0)
                    break
                if (not entry.get("raw_material_id")) and (it.get("name") or "").strip() == entry.get("name"):
                    qty = float(it.get("quantity") or 0)
                    break
            cost_impact = (new_c - old_c) * qty

            row = {
                "invoice_id": inv.get("id"),
                "invoice_number": inv.get("invoice_number"),
                "invoice_date": inv.get("created_at"),
                "supplier_id": inv.get("supplier_id"),
                "supplier_name": inv.get("supplier_name"),
                "purchaser_name": inv.get("created_by_name") or "",
                "raw_material_id": entry.get("raw_material_id"),
                "material_name": entry.get("name"),
                "old_cost": round(old_c, 2),
                "new_cost": round(new_c, 2),
                "diff_pct": round(diff_pct, 2),
                "quantity": qty,
                "cost_impact": round(cost_impact, 2),
                "reason": entry.get("reason") or "",
                "last_supplier_name": entry.get("supplier_name") or "",
                "last_invoice_number": entry.get("last_invoice_number") or "",
                "last_purchase_date": entry.get("last_purchase_date"),
            }
            rows.append(row)

            # تجميع حسب المورد
            sup_key = inv.get("supplier_id") or "unknown"
            s = summary_by_supplier.setdefault(sup_key, {
                "supplier_id": sup_key,
                "supplier_name": inv.get("supplier_name") or "غير محدد",
                "count": 0, "avg_pct": 0.0, "total_impact": 0.0,
            })
            s["count"] += 1
            s["avg_pct"] = ((s["avg_pct"] * (s["count"] - 1)) + diff_pct) / s["count"]
            s["total_impact"] += cost_impact

            # تجميع حسب المادة
            mat_key = entry.get("raw_material_id") or entry.get("name") or "unknown"
            m = summary_by_material.setdefault(mat_key, {
                "raw_material_id": entry.get("raw_material_id"),
                "material_name": entry.get("name") or "غير محدد",
                "count": 0, "max_pct": 0.0, "total_impact": 0.0,
            })
            m["count"] += 1
            if diff_pct > m["max_pct"]:
                m["max_pct"] = diff_pct
            m["total_impact"] += cost_impact

    total_impact = round(sum(r["cost_impact"] for r in rows), 2)
    return {
        "rows": rows,
        "total_rows": len(rows),
        "total_cost_impact": total_impact,
        "by_supplier": sorted(summary_by_supplier.values(), key=lambda x: -x["total_impact"]),
        "by_material": sorted(summary_by_material.values(), key=lambda x: -x["total_impact"]),
        "filters": {"days": days, "min_pct": min_pct, "material_id": material_id, "supplier_id": supplier_id},
    }


@router.post("/raw-materials/last-purchase-prices")
async def get_last_purchase_prices(payload: dict, current_user: dict = Depends(get_current_user)):
    """جلب آخر سعر شراء + التاريخ + اسم المورد لكل مادة خام.

    Body: { material_ids: [str], names: [str] (optional fallback) }
    Returns: { by_id: {material_id: {cost, date, supplier_name, invoice_number}},
              by_name: {name: {cost, date, supplier_name, invoice_number}} }
    """
    db = get_db()
    tenant_id = get_user_tenant_id(current_user)

    material_ids = [mid for mid in (payload.get("material_ids") or []) if mid]
    names = [(n or "").strip() for n in (payload.get("names") or []) if n]

    by_id: Dict[str, Dict[str, Any]] = {}
    by_name: Dict[str, Dict[str, Any]] = {}

    query: Dict[str, Any] = {}
    if tenant_id:
        query["tenant_id"] = tenant_id
    # احصر بالفواتير التي تحتوي على أحد هذه المواد أو الأسماء — لتقليل النقل
    or_conditions = []
    if material_ids:
        or_conditions.append({"items.raw_material_id": {"$in": material_ids}})
    if names:
        or_conditions.append({"items.name": {"$in": names}})
    if or_conditions:
        query["$or"] = or_conditions

    # رتّب حسب الأحدث
    cursor = db.purchases_new.find(query, {"_id": 0}).sort([("created_at", -1)]).limit(500)
    needed_ids = set(material_ids)
    needed_names = set(names)
    async for inv in cursor:
        if not (needed_ids or needed_names):
            break
        inv_date = inv.get("created_at")
        sup_name = inv.get("supplier_name") or ""
        inv_no = inv.get("invoice_number") or ""
        for it in (inv.get("items") or []):
            rm_id = it.get("raw_material_id")
            iname = (it.get("name") or "").strip()
            cost = float(it.get("cost_per_unit") or 0)
            if cost <= 0:
                continue
            entry = {
                "cost": round(cost, 2),
                "date": inv_date,
                "supplier_name": sup_name,
                "invoice_number": inv_no,
            }
            if rm_id and rm_id in needed_ids and rm_id not in by_id:
                by_id[rm_id] = entry
                needed_ids.discard(rm_id)
            if iname and iname in needed_names and iname not in by_name:
                by_name[iname] = entry
                needed_names.discard(iname)

    return {"by_id": by_id, "by_name": by_name}


@router.get("/raw-materials-new/alerts/low-stock")
async def get_raw_materials_low_stock(current_user: dict = Depends(get_current_user)):
    """تنبيهات المواد الخام المنخفضة تحت الحد الأدنى — للمالك فقط"""
    db = get_db()
    tenant_id = get_user_tenant_id(current_user)

    # المالك / السوبر فقط
    if current_user.get("role") not in ["admin", "super_admin"]:
        return {"alerts": [], "critical_count": 0, "warning_count": 0, "total_count": 0}

    query = {}
    if tenant_id:
        query["tenant_id"] = tenant_id

    materials = await db.raw_materials.find(query, {"_id": 0}).to_list(2000)

    alerts = []
    for m in materials:
        qty = float(m.get("quantity", 0) or 0)
        min_q = float(m.get("min_quantity", 0) or 0)
        if min_q <= 0:
            continue  # لا يوجد حد أدنى محدد
        if qty <= min_q:
            severity = "critical" if qty <= 0 else "warning"
            alerts.append({
                "material_id": m.get("id"),
                "material_name": m.get("name"),
                "quantity": qty,
                "min_quantity": min_q,
                "unit": m.get("unit", ""),
                "shortage": round(min_q - qty, 3),
                "severity": severity,
            })

    # الحالات الحرجة أولاً
    alerts.sort(key=lambda a: (0 if a["severity"] == "critical" else 1, a["material_name"] or ""))

    critical_count = sum(1 for a in alerts if a["severity"] == "critical")
    warning_count = sum(1 for a in alerts if a["severity"] == "warning")

    return {
        "alerts": alerts,
        "critical_count": critical_count,
        "warning_count": warning_count,
        "total_count": len(alerts),
    }


@router.post("/raw-materials-new/{material_id}/admin-correct")
async def admin_correct_raw_material(
    material_id: str,
    payload: dict,
    current_user: dict = Depends(get_current_user),
):
    """⚡ تصحيح إداري لمادة خام محوّلة — للمالك/المدير العام فقط.

    يسمح بتعديل الكمية / الحد الأدنى / الوحدة / التكلفة لمادة مرّ عليها تحويل
    (مثل خطأ إدخال غرام بدل كغم). يُسجَّل التصحيح في `inventory_corrections`.

    Body (كل الحقول اختيارية، يُحدّث ما يُرسَل فقط):
        quantity, min_quantity, unit, cost_per_unit, reason
    """
    db = get_db()
    privileged = {"admin", "manager", "super_admin", "branch_manager", "owner"}
    role = (current_user.get("role") or "").lower()
    if role not in privileged:
        raise HTTPException(status_code=403, detail="غير مسموح — التصحيح الإداري للمالك/المدير فقط")

    mat = await db.raw_materials.find_one({"id": material_id}, {"_id": 0})
    if not mat:
        raise HTTPException(status_code=404, detail="المادة غير موجودة")

    update: Dict[str, Any] = {}
    diff_log: Dict[str, Any] = {}

    def _set_if(field, caster):
        if field in payload and payload[field] is not None:
            new_val = caster(payload[field])
            update[field] = new_val
            diff_log[field] = {"old": mat.get(field), "new": new_val}

    _set_if("quantity", float)
    _set_if("min_quantity", float)
    _set_if("cost_per_unit", float)
    _set_if("unit", str)
    # ⭐ السماح بتعديل الاسم
    _set_if("name", lambda v: str(v).strip())
    _set_if("name_en", lambda v: str(v).strip())
    # ⭐ السماح بتعديل تعريف القطعة/التعبئة (1 وحدة = X من وحدة فرعية، مثل 1 قطعة = 250 غرام)
    _set_if("pack_quantity", lambda v: float(v) if v else None)
    _set_if("pack_unit", lambda v: str(v).strip() if v else None)
    # Legacy aliases for backward compatibility (manufactured products use piece_weight)
    _set_if("piece_weight", float)
    _set_if("piece_weight_unit", lambda v: str(v).strip())

    if not update:
        raise HTTPException(status_code=400, detail="لا حقول للتحديث")

    update["last_updated"] = datetime.now(timezone.utc).isoformat()
    update["last_admin_correction_at"] = update["last_updated"]
    update["last_admin_correction_by"] = current_user.get("id")

    await db.raw_materials.update_one({"id": material_id}, {"$set": update})

    # 🔧 مزامنة manufacturing_inventory: عند تصحيح الوحدة/الاسم/التكلفة على المادة الخام،
    # يجب أن ينعكس فوراً على سجل قسم التصنيع المرتبط بنفس المادة (لمنع عرض وحدة قديمة كـ كغم
    # بينما المادة فعلياً قطعة بعد التصحيح). الكمية لا تُمسّ هنا.
    mi_sync: Dict[str, Any] = {}
    if "unit" in update:
        mi_sync["unit"] = update["unit"]
    if "name" in update:
        mi_sync["material_name"] = update["name"]
        mi_sync["raw_material_name"] = update["name"]
    if "cost_per_unit" in update:
        mi_sync["cost_per_unit"] = update["cost_per_unit"]
    if "pack_quantity" in update:
        mi_sync["pack_quantity"] = update["pack_quantity"]
    if "pack_unit" in update:
        mi_sync["pack_unit"] = update["pack_unit"]
    if "piece_weight" in update:
        mi_sync["piece_weight"] = update["piece_weight"]
    if "piece_weight_unit" in update:
        mi_sync["piece_weight_unit"] = update["piece_weight_unit"]
    if mi_sync:
        mi_sync["last_updated"] = update["last_updated"]
        try:
            # نُحدّث جميع السجلات المرتبطة (سواء حُفظت بـ material_id أو raw_material_id)
            await db.manufacturing_inventory.update_many(
                {"$or": [{"material_id": material_id}, {"raw_material_id": material_id}]},
                {"$set": mi_sync},
            )
        except Exception:
            pass

    # 🔁 لو تغيّرت الكمية: حدّث طبقات FIFO النشطة لتطابق الكمية الجديدة
    if "quantity" in update:
        new_qty = update["quantity"]
        # أبسط منهج: امسح كل طبقات NS النشطة وأنشئ طبقة واحدة جديدة بالتكلفة الحالية
        cost_for_layer = update.get("cost_per_unit", float(mat.get("cost_per_unit") or 0))
        try:
            await db.cost_layers.update_many(
                {"material_id": material_id, "active": True},
                {"$set": {"active": False, "remaining_quantity": 0, "closed_reason": "admin_correction"}}
            )
            if new_qty > 0:
                await db.cost_layers.insert_one({
                    "id": str(uuid.uuid4()),
                    "material_id": material_id,
                    "material_name": mat.get("name"),
                    "unit": update.get("unit") or mat.get("unit"),
                    "quantity": new_qty,
                    "remaining_quantity": new_qty,
                    "unit_cost": cost_for_layer,
                    "active": True,
                    "source": "admin_correction",
                    "tenant_id": mat.get("tenant_id"),
                    "created_at": datetime.now(timezone.utc).isoformat(),
                })
        except Exception:
            pass

    # سجل التصحيح للمراجعة
    await db.inventory_corrections.insert_one({
        "id": str(uuid.uuid4()),
        "material_id": material_id,
        "material_name": mat.get("name"),
        "diff": diff_log,
        "reason": (payload.get("reason") or "").strip(),
        "performed_by": current_user.get("id"),
        "performed_by_name": current_user.get("full_name") or current_user.get("username"),
        "performed_by_role": role,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "tenant_id": mat.get("tenant_id"),
    })

    return {
        "message": "تم التصحيح الإداري وتسجيله في سجل المراجعة",
        "material_id": material_id,
        "changes": diff_log,
    }


@router.get("/raw-materials-new/{material_id}")
async def get_raw_material(material_id: str, current_user: dict = Depends(get_current_user)):
    """جلب مادة خام محددة"""
    db = get_db()
    tenant_id = get_user_tenant_id(current_user)
    query = {"id": material_id}
    if tenant_id:
        query["tenant_id"] = tenant_id
    material = await db.raw_materials.find_one(query, {"_id": 0})
    if not material:
        raise HTTPException(status_code=404, detail="المادة غير موجودة")
    material["total_value"] = material.get("quantity", 0) * material.get("cost_per_unit", 0)
    return material

@router.put("/raw-materials-new/{material_id}")
async def update_raw_material(material_id: str, material: RawMaterialCreate, current_user: dict = Depends(get_current_user)):
    """تحديث مادة خام — مقيّد بحالة التحويل:
    - قبل التحويل (is_transferred=False): تعديل كامل (اسم/تكلفة/كمية)
    - بعد التحويل: مرفوض (المادة مقفلة، يمكن فقط الإضافة عبر add-stock أو الشراء)
    """
    db = get_db()
    tenant_id = get_user_tenant_id(current_user)

    # تأكد أن المادة موجودة وضمن نطاق tenant
    q = {"id": material_id}
    if tenant_id:
        q["tenant_id"] = tenant_id
    existing = await db.raw_materials.find_one(q, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="المادة غير موجودة")

    # === فحص حالة التحويل ===
    if await _is_material_transferred(db, material_id, tenant_id):
        raise HTTPException(
            status_code=409,
            detail="لا يمكن تعديل المادة بعد تحويلها للتصنيع. يمكنك فقط زيادة الكمية عبر إضافة المخزون أو شراء جديد."
        )

    # حساب التكلفة الفعلية بعد الهدر
    waste_percentage = material.waste_percentage or 0
    effective_cost = material.cost_per_unit
    if waste_percentage > 0 and waste_percentage < 100:
        effective_cost = material.cost_per_unit / (1 - waste_percentage / 100)
    
    update_data = material.model_dump()
    update_data["effective_cost_per_unit"] = round(effective_cost, 2)
    update_data["total_value"] = material.quantity * material.cost_per_unit
    update_data["last_updated"] = datetime.now(timezone.utc).isoformat()
    
    await db.raw_materials.update_one(
        {"id": material_id, "tenant_id": tenant_id} if tenant_id else {"id": material_id},
        {"$set": update_data}
    )
    
    return await db.raw_materials.find_one({"id": material_id}, {"_id": 0})


@router.delete("/raw-materials-new/{material_id}")
async def delete_raw_material(material_id: str, current_user: dict = Depends(get_current_user)):
    """حذف مادة خام — مسموح فقط قبل التحويل للتصنيع، وللمالك/السوبر فقط."""
    if current_user.get("role") not in ["admin", "super_admin"]:
        raise HTTPException(status_code=403, detail="غير مسموح — للمالك فقط")

    db = get_db()
    tenant_id = get_user_tenant_id(current_user)

    q = {"id": material_id}
    if tenant_id:
        q["tenant_id"] = tenant_id
    material = await db.raw_materials.find_one(q, {"_id": 0})
    if not material:
        raise HTTPException(status_code=404, detail="المادة غير موجودة")

    if await _is_material_transferred(db, material_id, tenant_id):
        raise HTTPException(
            status_code=409,
            detail="لا يمكن حذف المادة بعد تحويلها للتصنيع. تم استخدامها في عمليات التصنيع."
        )

    # حذف المادة + طبقاتها (لا حركات لأنها لم تُحوّل)
    await db.raw_materials.delete_one({"id": material_id})
    await db.material_cost_layers.delete_many({"material_id": material_id})

    return {"message": f"تم حذف المادة {material.get('name')} بنجاح"}


async def _get_transferred_material_ids(db, tenant_id: Optional[str]) -> set:
    """يُرجع IDs المواد التي تم تحويلها للتصنيع (وُجدت في حركة OUT أو manufacturing_request fulfilled).
    
    ملاحظة: لا نُطبّق tenant_id strict filter لأن material_id هو UUID فريد، وبعض السجلات
    القديمة لا تحوي tenant_id (قبل multi-tenant migration).
    """
    transferred = set()

    # 1) من حركات المخزون: type يحوي "out" أو نوع "warehouse_to_manufacturing"
    movement_query = {
        "$or": [
            {"type": "warehouse_to_manufacturing"},
            {"type": "out"},
            {"type": "manufacturing_transfer"},
            {"type": "raw_material_to_manufacturing"},
        ]
    }

    async for mv in db.inventory_movements.find(movement_query, {"_id": 0, "material_id": 1, "items": 1}):
        if mv.get("material_id"):
            transferred.add(mv["material_id"])
        for item in (mv.get("items") or []):
            if item.get("material_id"):
                transferred.add(item["material_id"])

    # 2) من طلبات التصنيع المُنفّذة
    async for req in db.manufacturing_requests.find({"status": "fulfilled"}, {"_id": 0, "items": 1}):
        for item in (req.get("items") or []):
            if item.get("material_id"):
                transferred.add(item["material_id"])

    return transferred


async def _is_material_transferred(db, material_id: str, tenant_id: Optional[str]) -> bool:
    """فحص سريع: هل تم تحويل هذه المادة من قبل؟ (UUID فريد، لا حاجة لفلتر tenant_id)"""
    # فحص حركات OUT
    mq = {
        "$or": [
            {"material_id": material_id},
            {"items.material_id": material_id},
        ],
        "type": {"$in": ["warehouse_to_manufacturing", "out", "manufacturing_transfer", "raw_material_to_manufacturing"]},
    }
    if await db.inventory_movements.count_documents(mq, limit=1) > 0:
        return True
    # فحص manufacturing_requests fulfilled
    rq = {"status": "fulfilled", "items.material_id": material_id}
    if await db.manufacturing_requests.count_documents(rq, limit=1) > 0:
        return True
    return False


@router.post("/raw-materials-new/{material_id}/add-stock")
async def add_raw_material_stock(material_id: str, quantity: float = 1, current_user: dict = Depends(get_current_user)):
    """زيادة كمية المادة الخام مباشرة (للتعديل اليدوي)"""
    db = get_db()
    tenant_id = get_user_tenant_id(current_user)
    
    query = {"id": material_id}
    if tenant_id:
        query["tenant_id"] = tenant_id
    material = await db.raw_materials.find_one(query)
    if not material:
        raise HTTPException(status_code=404, detail="المادة غير موجودة")
    
    if quantity <= 0:
        raise HTTPException(status_code=400, detail="الكمية يجب أن تكون أكبر من صفر")
    
    # زيادة الكمية وإجمالي الوارد
    await db.raw_materials.update_one(
        {"id": material_id},
        {
            "$inc": {
                "quantity": quantity,
                "total_received": quantity  # إجمالي الوارد
            },
            "$set": {"last_updated": datetime.now(timezone.utc).isoformat()}
        }
    )
    
    # تسجيل الحركة
    await db.inventory_movements.insert_one({
        "id": str(uuid.uuid4()),
        "type": "raw_material_stock_add",
        "material_id": material_id,
        "material_name": material.get("name"),
        "quantity": quantity,
        "notes": "إضافة يدوية للمخزون",
        "created_at": datetime.now(timezone.utc).isoformat()
    })
    
    return {
        "message": f"تم إضافة {quantity} {material.get('unit')} إلى {material.get('name')}",
        "new_quantity": material.get("quantity", 0) + quantity
    }


@router.post("/raw-materials-new/{material_id}/reduce-stock")
async def reduce_raw_material_stock(
    material_id: str,
    quantity: float = 0,
    zero: bool = False,
    current_user: dict = Depends(get_current_user),
):
    """نقص كمية المادة الخام أو تصفيرها — متاح فقط للمالك/المدير العام (admin/super_admin).
    zero=true ⇒ تصفير الكمية بالكامل. وإلا يُنقص بمقدار quantity (لا تقل عن صفر)."""
    role = (current_user or {}).get("role", "")
    if role not in ("admin", "super_admin"):
        raise HTTPException(status_code=403, detail="هذا الإجراء متاح للمالك/المدير العام فقط")

    db = get_db()
    tenant_id = get_user_tenant_id(current_user)

    query = {"id": material_id}
    if tenant_id:
        query["tenant_id"] = tenant_id
    material = await db.raw_materials.find_one(query)
    if not material:
        raise HTTPException(status_code=404, detail="المادة غير موجودة")

    current_qty = float(material.get("quantity", 0) or 0)
    if zero:
        reduce_by = current_qty
    else:
        if quantity <= 0:
            raise HTTPException(status_code=400, detail="الكمية يجب أن تكون أكبر من صفر")
        reduce_by = min(float(quantity), current_qty)

    new_qty = round(current_qty - reduce_by, 3)
    now_iso = datetime.now(timezone.utc).isoformat()

    await db.raw_materials.update_one(
        {"id": material_id},
        {"$set": {"quantity": new_qty, "last_updated": now_iso}},
    )

    await db.inventory_movements.insert_one({
        "id": str(uuid.uuid4()),
        "tenant_id": tenant_id,
        "type": "raw_material_stock_reduce",
        "material_id": material_id,
        "material_name": material.get("name"),
        "quantity": reduce_by,
        "unit": material.get("unit"),
        "notes": "تصفير الكمية يدوياً (مالك/مدير عام)" if zero else "نقص يدوي للكمية (مالك/مدير عام)",
        "performed_by_name": current_user.get("full_name") or current_user.get("username"),
        "created_at": now_iso,
    })

    return {
        "message": ("تم تصفير كمية " if zero else "تم نقص كمية ") + str(material.get("name")),
        "reduced_by": reduce_by,
        "new_quantity": new_qty,
    }


# ==================== WAREHOUSE TO MANUFACTURING (تحويل من المخزن للتصنيع) ====================

@router.post("/warehouse-to-manufacturing")
async def transfer_to_manufacturing(transfer: WarehouseToManufacturingCreate):
    """تحويل مواد خام من المخزن لقسم التصنيع"""
    db = get_db()
    
    # رقم تسلسلي
    last_transfer = await db.warehouse_transfers.find_one(sort=[("transfer_number", -1)])
    transfer_number = (last_transfer.get("transfer_number", 0) if last_transfer else 0) + 1
    
    # التحقق من توفر المواد الخام
    items_with_details = []
    total_cost = 0
    insufficient = []
    
    for item in transfer.items:
        material = await db.raw_materials.find_one({"id": item.get("raw_material_id")}, {"_id": 0})
        if not material:
            raise HTTPException(status_code=404, detail=f"المادة الخام غير موجودة: {item.get('raw_material_id')}")
        
        requested_qty = item.get("quantity", 0)
        available_qty = material.get("quantity", 0)
        
        if available_qty < requested_qty:
            insufficient.append({
                "name": material.get("name"),
                "requested": requested_qty,
                "available": available_qty,
                "unit": material.get("unit")
            })
        else:
            item_cost = requested_qty * material.get("cost_per_unit", 0)
            items_with_details.append({
                "raw_material_id": material["id"],
                "raw_material_name": material.get("name"),
                "quantity": requested_qty,
                "unit": material.get("unit"),
                "cost_per_unit": material.get("cost_per_unit", 0),
                "total_cost": item_cost
            })
            total_cost += item_cost
    
    if insufficient:
        raise HTTPException(
            status_code=400,
            detail={
                "message": "مواد خام غير كافية",
                "insufficient_materials": insufficient
            }
        )
    
    # إنشاء سجل التحويل
    transfer_doc = {
        "id": str(uuid.uuid4()),
        "transfer_number": transfer_number,
        "transfer_type": "warehouse_to_manufacturing",
        "items": items_with_details,
        "total_cost": total_cost,
        "status": "pending",
        "notes": transfer.notes,
        "created_by": "system",
        "created_at": datetime.now(timezone.utc).isoformat(),
        "received_by": None,
        "received_at": None
    }
    
    await db.warehouse_transfers.insert_one(transfer_doc)
    
    # خصم المواد من المخزن وتحديث الإحصائيات
    for item in items_with_details:
        await db.raw_materials.update_one(
            {"id": item["raw_material_id"]},
            {
                "$inc": {
                    "quantity": -item["quantity"],
                    "transferred_to_manufacturing": item["quantity"]  # تتبع المحول للتصنيع
                },
                "$set": {"last_updated": datetime.now(timezone.utc).isoformat()}
            }
        )
    
    # إضافة للتصنيع (وارد)
    for item in items_with_details:
        rm_id = item["raw_material_id"]
        existing = await db.manufacturing_inventory.find_one({"$or": [{"raw_material_id": rm_id}, {"material_id": rm_id}]})
        if existing:
            # ⭐ مزامنة تكلفة الوحدة بطريقة المتوسط المُرجّح (Weighted Average)
            # إن كانت الكمية الحالية = 0 (نفذ المخزن) → استخدم سعر التحويل الجديد مباشرة.
            old_qty = float(existing.get("quantity") or 0)
            old_cpu = float(existing.get("cost_per_unit") or 0)
            new_qty = float(item["quantity"])
            new_cpu = float(item["cost_per_unit"])
            total_qty = old_qty + new_qty
            if old_qty <= 0:
                weighted_cpu = new_cpu  # المخزن السابق نفذ → السعر الجديد
            elif total_qty > 0:
                weighted_cpu = (old_qty * old_cpu + new_qty * new_cpu) / total_qty
            else:
                weighted_cpu = old_cpu
            await db.manufacturing_inventory.update_one(
                {"id": existing["id"]} if existing.get("id") else {"$or": [{"raw_material_id": rm_id}, {"material_id": rm_id}]},
                {
                    "$inc": {"quantity": item["quantity"]},
                    "$set": {
                        "cost_per_unit": round(weighted_cpu, 6),
                        # توحيد الحقلين لمداواة السجلات القديمة
                        "raw_material_id": rm_id,
                        "material_id": rm_id,
                        "last_updated": datetime.now(timezone.utc).isoformat(),
                    }
                }
            )
        else:
            await db.manufacturing_inventory.insert_one({
                "id": str(uuid.uuid4()),
                "raw_material_id": item["raw_material_id"],
                "material_id": item["raw_material_id"],  # توحيد الحقلين
                "raw_material_name": item["raw_material_name"],
                "material_name": item["raw_material_name"],  # توحيد الحقلين
                "quantity": item["quantity"],
                "unit": item["unit"],
                "cost_per_unit": item["cost_per_unit"],
                "last_updated": datetime.now(timezone.utc).isoformat(),
                "created_at": datetime.now(timezone.utc).isoformat()
            })
    
    del transfer_doc["_id"]
    return transfer_doc

@router.get("/warehouse-transfers")
async def get_warehouse_transfers(transfer_type: Optional[str] = None, current_user: dict = Depends(get_current_user)):
    """جلب تحويلات المخزن"""
    db = get_db()
    
    query = {}
    if transfer_type:
        query["transfer_type"] = transfer_type
    
    transfers = await db.warehouse_transfers.find(query, {"_id": 0}).sort("created_at", -1).to_list(1000)
    return transfers

@router.post("/warehouse-transfers")
async def create_warehouse_transfer(transfer_data: dict):
    """إنشاء تحويل من التصنيع للفرع"""
    db = get_db()
    
    transfer_type = transfer_data.get("transfer_type")
    to_branch_id = transfer_data.get("to_branch_id")
    items = transfer_data.get("items", [])
    notes = transfer_data.get("notes", "")
    
    if transfer_type != "manufacturing_to_branch":
        raise HTTPException(status_code=400, detail="نوع التحويل غير مدعوم")
    
    if not to_branch_id:
        raise HTTPException(status_code=400, detail="يجب تحديد الفرع المستلم")
    
    if not items:
        raise HTTPException(status_code=400, detail="يجب إضافة منتجات للتحويل")
    
    # جلب معلومات الفرع
    branch = await db.branches.find_one({"id": to_branch_id}, {"_id": 0})
    if not branch:
        raise HTTPException(status_code=404, detail="الفرع غير موجود")
    
    # رقم تسلسلي
    last_transfer = await db.warehouse_transfers.find_one(sort=[("transfer_number", -1)])
    transfer_number = (last_transfer.get("transfer_number", 0) if last_transfer else 0) + 1
    
    # التحقق من توفر المنتجات المصنعة
    items_with_details = []
    insufficient = []
    
    for item in items:
        product_id = item.get("product_id")
        requested_qty = item.get("quantity", 0)
        
        # البحث في المنتجات المصنعة
        product = await db.manufactured_products.find_one({"id": product_id}, {"_id": 0})
        if not product:
            raise HTTPException(status_code=404, detail=f"المنتج غير موجود: {product_id}")
        
        available_qty = product.get("quantity", 0)
        
        if available_qty < requested_qty:
            insufficient.append({
                "name": product.get("name"),
                "requested": requested_qty,
                "available": available_qty,
                "unit": product.get("unit", "قطعة")
            })
        else:
            items_with_details.append({
                "product_id": product["id"],
                "product_name": product.get("name"),
                "quantity": requested_qty,
                "unit": product.get("unit", "قطعة"),
                "cost": product.get("raw_material_cost", 0) * requested_qty
            })
    
    if insufficient:
        raise HTTPException(
            status_code=400,
            detail={
                "message": "كمية غير كافية",
                "insufficient_products": insufficient
            }
        )
    
    # إنشاء سجل التحويل
    transfer_doc = {
        "id": str(uuid.uuid4()),
        "transfer_number": transfer_number,
        "transfer_type": "manufacturing_to_branch",
        "to_branch_id": to_branch_id,
        "to_branch_name": branch.get("name"),
        "items": items_with_details,
        "total_cost": sum(item.get("cost", 0) for item in items_with_details),
        "status": "completed",
        "notes": notes,
        "created_by": "system",
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    
    await db.warehouse_transfers.insert_one(transfer_doc)
    
    # خصم الكمية من المنتجات المصنعة وزيادة المحول
    for item in items_with_details:
        await db.manufactured_products.update_one(
            {"id": item["product_id"]},
            {
                "$inc": {
                    "quantity": -item["quantity"],
                    "transferred_quantity": item["quantity"]  # الكمية المحولة للفروع
                },
                "$set": {"last_updated": datetime.now(timezone.utc).isoformat()}
            }
        )
    
    # إضافة الكمية لمخزون الفرع
    for item in items_with_details:
        # البحث عن المنتج في مخزون الفرع
        existing = await db.branch_inventory.find_one({
            "branch_id": to_branch_id,
            "product_id": item["product_id"]
        })
        
        if existing:
            await db.branch_inventory.update_one(
                {"branch_id": to_branch_id, "product_id": item["product_id"]},
                {
                    "$inc": {
                        "quantity": item["quantity"],
                        "received_quantity": item["quantity"]
                    },
                    "$set": {"last_updated": datetime.now(timezone.utc).isoformat()}
                }
            )
        else:
            await db.branch_inventory.insert_one({
                "id": str(uuid.uuid4()),
                "branch_id": to_branch_id,
                "product_id": item["product_id"],
                "product_name": item["product_name"],
                "quantity": item["quantity"],
                "received_quantity": item["quantity"],  # الكمية الواردة
                "sold_quantity": 0,  # الكمية المباعة
                "unit": item["unit"],
                "last_updated": datetime.now(timezone.utc).isoformat(),
                "created_at": datetime.now(timezone.utc).isoformat()
            })
    
    # تسجيل الحركة
    await db.inventory_movements.insert_one({
        "id": str(uuid.uuid4()),
        "type": "transfer_to_branch",
        "transfer_id": transfer_doc["id"],
        "from_location": "manufacturing",
        "to_location": to_branch_id,
        "to_location_name": branch.get("name"),
        "items": items_with_details,
        "notes": notes,
        "created_at": datetime.now(timezone.utc).isoformat()
    })
    
    del transfer_doc["_id"]
    return transfer_doc

# ==================== BRANCH REQUESTS (طلبات الفروع من التصنيع) ====================

@router.post("/branch-requests")
async def create_branch_request(request_data: dict, current_user: dict = Depends(get_current_user)):
    """إنشاء طلب فرع من التصنيع"""
    db = get_db()
    tenant_id = get_user_tenant_id(current_user)
    
    to_branch_id = request_data.get("to_branch_id")
    items = request_data.get("items", [])
    packaging_items = request_data.get("packaging_items", [])
    priority = request_data.get("priority", "normal")
    notes = request_data.get("notes", "")
    requested_by = request_data.get("requested_by", "")
    requested_by_name = request_data.get("requested_by_name", "")
    
    if not to_branch_id:
        raise HTTPException(status_code=400, detail="يجب تحديد الفرع")
    
    if not items and not packaging_items:
        raise HTTPException(status_code=400, detail="يجب إضافة منتجات أو مواد تغليف للطلب")
    
    # جلب معلومات الفرع
    branch = await db.branches.find_one({"id": to_branch_id}, {"_id": 0})
    if not branch:
        raise HTTPException(status_code=404, detail="الفرع غير موجود")
    
    # رقم تسلسلي
    last_request = await db.branch_requests.find_one(sort=[("request_number", -1)])
    request_number = (last_request.get("request_number", 0) if last_request else 0) + 1
    
    # تفاصيل المنتجات
    items_with_details = []
    total_cost = 0
    
    for item in items:
        product_id = item.get("product_id")
        quantity = item.get("quantity", 0)
        
        # جلب المنتج المصنع
        product = await db.manufactured_products.find_one({"id": product_id}, {"_id": 0})
        if product:
            # ⭐ سعر الوحدة الواحدة (وليس تكلفة الدفعة كاملة)
            _backfill_cost_fields(product)
            await _enrich_unit_cost_fields(db, product)
            unit_cost = float(product.get("unit_cost_after_waste") or 0)
            if unit_cost == 0:
                # fallback للبيانات القديمة جداً
                p_qty = float(product.get("quantity") or 0)
                p_batch = float(product.get("raw_material_cost_after_waste") or product.get("production_cost") or product.get("raw_material_cost") or 0)
                unit_cost = (p_batch / p_qty) if p_qty > 0 else 0
            cost = unit_cost * quantity
            total_cost += cost
            items_with_details.append({
                "product_id": product_id,
                "product_name": product.get("name"),
                "quantity": quantity,
                "unit": product.get("unit", "قطعة"),
                "cost_per_unit": unit_cost,
                "total_cost": cost,
                "available_quantity": product.get("quantity", 0)
            })
    
    # ⭐ تفاصيل مواد التغليف (تُحفظ وتُحتسب ضمن إجمالي الطلب)
    packaging_with_details = []
    for pitem in packaging_items:
        material_id = pitem.get("packaging_material_id") or pitem.get("material_id")
        p_qty = float(pitem.get("quantity", 0) or 0)
        if not material_id or p_qty <= 0:
            continue
        material = await db.packaging_materials.find_one({"id": material_id}, {"_id": 0})
        if material:
            p_unit_cost = float(material.get("cost_per_unit") or 0)
            p_cost = p_unit_cost * p_qty
            total_cost += p_cost
            packaging_with_details.append({
                "packaging_material_id": material_id,
                "name": material.get("name"),
                "quantity": p_qty,
                "unit": material.get("unit", "قطعة"),
                "cost_per_unit": p_unit_cost,
                "total_cost": p_cost,
                "available_quantity": material.get("quantity", 0)
            })
    
    # إنشاء سجل الطلب
    request_doc = {
        "id": str(uuid.uuid4()),
        "request_number": request_number,
        "to_branch_id": to_branch_id,
        "to_branch_name": branch.get("name"),
        "items": items_with_details,
        "packaging_items": packaging_with_details,
        "total_cost": total_cost,
        "status": "pending",  # pending, approved, processing, shipped, delivered, cancelled
        "priority": priority,
        "notes": notes,
        "requested_by": requested_by,
        "requested_by_name": requested_by_name,
        "tenant_id": tenant_id,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "approved_at": None,
        "shipped_at": None,
        "delivered_at": None
    }
    
    await db.branch_requests.insert_one(request_doc)
    del request_doc["_id"]
    return request_doc

@router.get("/branch-requests")
async def get_branch_requests(status: Optional[str] = None, branch_id: Optional[str] = None, current_user: dict = Depends(get_current_user)):
    """جلب طلبات الفروع"""
    db = get_db()
    tenant_id = get_user_tenant_id(current_user)
    
    query = {}
    if tenant_id:
        query["tenant_id"] = tenant_id
    if status:
        query["status"] = status
    if branch_id:
        query["to_branch_id"] = branch_id
    
    requests = await db.branch_requests.find(query, {"_id": 0}).sort("created_at", -1).to_list(1000)

    # 🔄 تحديث available_quantity ليساوي "المتبقي" المعروض على بطاقة المنتج في تبويب التصنيع.
    # ⭐⭐ السبب الجذري: "المتبقي" ليس حقل quantity الخام، بل = إجمالي المُصنّع − المحوّل − المستهلَك
    #    (تُحسب في GET /manufactured-products). لذا نقرأ نفس المعادلة هنا عبر _remaining_qty_map
    #    حتى يتطابق "المتوفر" في طلب الفرع مع "المتبقي" المعروض تماماً.
    all_prods = await db.manufactured_products.find(
        {}, {"_id": 0, "id": 1, "name": 1, "quantity": 1, "tenant_id": 1,
             "total_produced": 1, "transferred_quantity": 1, "unit": 1}
    ).to_list(50000)
    remaining_by_id = await _remaining_qty_map(db, all_prods)
    for req in requests:
        req_tenant = req.get("tenant_id")
        # منتجات نفس مستأجر الطلب (هي ما يراه المستخدم في تبويب التصنيع)
        scope = [p for p in all_prods if p.get("tenant_id") == req_tenant] if req_tenant else []
        if not scope:
            scope = all_prods
        for it in (req.get("items") or []):
            pid = it.get("product_id")
            # ⭐ آلية المصنع (الأنظف والأدق): نقرأ "المتبقي" مباشرةً بمعرّف المنتج (product_id).
            if pid and pid in remaining_by_id:
                it["available_quantity"] = remaining_by_id[pid]
                it.pop("suggestion", None)
            else:
                # احتياط للطلبات القديمة بمعرّف مفقود/تالف: مطابقة بالاسم ضمن نفس المستأجر
                matched = match_product_by_name(it.get("product_name") or "", scope)
                if matched is not None:
                    it["available_quantity"] = remaining_by_id.get(matched.get("id"), 0)
                    it.pop("suggestion", None)
                else:
                    # لا منتج مطابق → التوفّر الحقيقي = 0 (بدل رقم سالب مضلّل) + اقتراح أقرب اسم
                    it["available_quantity"] = 0
                    sug = suggest_product_by_name(it.get("product_name") or "", scope)
                    if sug:
                        it["suggestion"] = sug
                    else:
                        it.pop("suggestion", None)

    pkg_ids = set()
    for req in requests:
        for pit in (req.get("packaging_items") or []):
            if pit.get("packaging_material_id"):
                pkg_ids.add(pit["packaging_material_id"])
    if pkg_ids:
        mats = await db.packaging_materials.find(
            {"id": {"$in": list(pkg_ids)}}, {"_id": 0, "id": 1, "name": 1, "quantity": 1}
        ).to_list(5000)
        pqty_by_id = {m["id"]: float(m.get("quantity") or 0) for m in mats}
        pqty_by_name = {normalize_arabic(m.get("name") or ""): float(m.get("quantity") or 0) for m in mats if normalize_arabic(m.get("name") or "")}
        for req in requests:
            for pit in (req.get("packaging_items") or []):
                mid = pit.get("packaging_material_id")
                pnm = normalize_arabic(pit.get("name") or "")
                if mid and mid in pqty_by_id:
                    pit["available_quantity"] = pqty_by_id[mid]
                elif pnm and pnm in pqty_by_name:
                    pit["available_quantity"] = pqty_by_name[pnm]
    return requests

@router.put("/branch-requests/{request_id}/status")
async def update_branch_request_status(request_id: str, status_data: dict):
    """تحديث حالة طلب الفرع"""
    db = get_db()
    
    new_status = status_data.get("status")
    valid_statuses = ["pending", "approved", "processing", "shipped", "delivered", "cancelled"]
    
    if new_status not in valid_statuses:
        raise HTTPException(status_code=400, detail="حالة غير صالحة")
    
    update_data = {"status": new_status}
    
    if new_status == "approved":
        update_data["approved_at"] = datetime.now(timezone.utc).isoformat()
    elif new_status == "shipped":
        update_data["shipped_at"] = datetime.now(timezone.utc).isoformat()
    elif new_status == "delivered":
        update_data["delivered_at"] = datetime.now(timezone.utc).isoformat()
    
    result = await db.branch_requests.update_one(
        {"id": request_id},
        {"$set": update_data}
    )
    
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="الطلب غير موجود")
    
    return {"message": "تم تحديث الحالة", "status": new_status}

@router.delete("/branch-requests/{request_id}")
async def delete_branch_request(request_id: str, current_user: dict = Depends(get_current_user)):
    """حذف طلب فرع نهائياً. للأدوار المركزية/الإدارة فقط.
    لا يُعيد أي مخزون لأن الطلب المعلّق لم يُخصم منه أصلاً."""
    db = get_db()
    result = await db.branch_requests.delete_one({"id": request_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="الطلب غير موجود")
    return {"message": "تم حذف الطلب نهائياً", "request_id": request_id}


@router.post("/branch-requests/bulk-delete")
async def bulk_delete_branch_requests(payload: dict, current_user: dict = Depends(get_current_user)):
    """حذف جماعي لطلبات الفروع. payload: { request_ids: [..] }.
    يحذف فقط الطلبات ضمن مستأجر المستخدم (إن وُجد). آمن: الطلبات المعلّقة لم تُخصم من المخزون."""
    db = get_db()
    request_ids = payload.get("request_ids") or []
    if not isinstance(request_ids, list) or not request_ids:
        raise HTTPException(status_code=400, detail="request_ids مطلوبة")
    tenant_id = current_user.get("tenant_id") if current_user else None
    query: Dict[str, Any] = {"id": {"$in": request_ids}}
    if tenant_id:
        query["tenant_id"] = tenant_id
    result = await db.branch_requests.delete_many(query)
    return {"message": f"تم حذف {result.deleted_count} طلب", "deleted_count": result.deleted_count}



@router.put("/branch-requests/{request_id}/relink-item")
async def relink_branch_request_item(
    request_id: str,
    payload: dict,
    current_user: dict = Depends(get_current_user),
):
    """يربط عنصراً غير مُطابَق في طلب فرع بمنتج مُصنّع مقترح (زر "هل تقصد؟").
    payload: { item_index: int, product_id: str }.
    يُحدّث product_id واسم المنتج للعنصر فيصبح "المتوفّر" دقيقاً فوراً."""
    db = get_db()
    tenant_id = current_user.get("tenant_id") if current_user else None

    try:
        item_index = int(payload.get("item_index"))
    except (TypeError, ValueError):
        raise HTTPException(status_code=400, detail="item_index غير صالح")
    product_id = payload.get("product_id")
    if not product_id:
        raise HTTPException(status_code=400, detail="product_id مطلوب")

    req = await db.branch_requests.find_one({"id": request_id}, {"_id": 0})
    if not req:
        raise HTTPException(status_code=404, detail="الطلب غير موجود")
    items = req.get("items") or []
    if item_index < 0 or item_index >= len(items):
        raise HTTPException(status_code=400, detail="فهرس العنصر خارج النطاق")

    prod = await db.manufactured_products.find_one({"id": product_id}, {"_id": 0})
    if not prod:
        raise HTTPException(status_code=404, detail="المنتج المُصنّع غير موجود")
    if tenant_id and prod.get("tenant_id") and prod.get("tenant_id") != tenant_id:
        raise HTTPException(status_code=403, detail="المنتج يخص مستأجراً آخر")

    items[item_index]["product_id"] = product_id
    items[item_index]["product_name"] = prod.get("name")
    items[item_index].pop("suggestion", None)

    await db.branch_requests.update_one(
        {"id": request_id}, {"$set": {"items": items}}
    )
    return {
        "message": "تم ربط العنصر بالمنتج",
        "request_id": request_id,
        "item_index": item_index,
        "product_id": product_id,
        "product_name": prod.get("name"),
    }



async def _resolve_request_product(db, item: dict, tenant_id):
    """يحل المنتج المصنّع الفعلي لعنصر طلب فرع — بآلية المصنع النظيفة:
    بالمعرّف (product_id) أولاً = قراءة "المتبقي" الحقيقي مباشرةً، ثم بالاسم احتياطاً
    للطلبات القديمة بمعرّف تالف (دقيق → مرن → تشابه عالٍ آمن، ضمن نفس المستأجر).
    يعيد الوثيقة أو None."""
    pid = item.get("product_id")
    if pid:
        p = await db.manufactured_products.find_one({"id": pid}, {"_id": 0})
        if p:
            return p
    nm = item.get("product_name") or ""
    if nm.strip():
        all_prods = await db.manufactured_products.find({}, {"_id": 0}).to_list(50000)
        scope = [p for p in all_prods if p.get("tenant_id") == tenant_id] if tenant_id else []
        if not scope:
            scope = all_prods
        matched = match_product_by_name(nm, scope)
        if matched is not None:
            return matched
    return None



@router.post("/branch-requests/{request_id}/fulfill")
async def fulfill_branch_request(
    request_id: str,
    payload: Optional[dict] = None,
    current_user: dict = Depends(get_current_user),
):
    """تنفيذ طلب الفرع (تحويل المنتجات) — يدعم تعديل/تخفيض الكميات لكل منتج.

    Body اختياري:
        - items: [{product_id, quantity}] — كميات مُرسلة مُعدّلة (أقل من المطلوب = تخفيض، 0 = رفض)
        - packaging_items: [{packaging_material_id, quantity}] — كميات تغليف مُعدّلة
        - notes_to_kitchen: str — رسالة من المصنع لمسؤول المطبخ
    إذا لم يُرسَل payload: يُنفّذ الكميات الأصلية كاملةً.
    """
    db = get_db()
    payload = payload or {}
    tenant_id = get_user_tenant_id(current_user)

    # جلب الطلب
    request = await db.branch_requests.find_one({"id": request_id}, {"_id": 0})
    if not request:
        raise HTTPException(status_code=404, detail="الطلب غير موجود")

    if request.get("status") not in ["pending", "approved", "processing"]:
        raise HTTPException(status_code=400, detail="لا يمكن تنفيذ هذا الطلب")

    # الكميات المُخصّصة من المصنع
    custom_items = payload.get("items") or []
    custom_pkg = payload.get("packaging_items") or []
    notes_to_kitchen = (payload.get("notes_to_kitchen") or "").strip()

    custom_qty_by_pid: Dict[str, float] = {}
    for ci in custom_items:
        pid = ci.get("product_id")
        if pid:
            custom_qty_by_pid[pid] = max(0.0, float(ci.get("quantity") or 0))
    custom_qty_by_pkg: Dict[str, float] = {}
    for cp in custom_pkg:
        mid = cp.get("packaging_material_id")
        if mid:
            custom_qty_by_pkg[mid] = max(0.0, float(cp.get("quantity") or 0))

    # ابنِ قوائم التنفيذ (الكمية المُرسلة لا تتجاوز المطلوب) + تتبّع التخفيضات
    items_to_fulfill = []
    reduced_items = []
    for item in request.get("items", []):
        pid = item.get("product_id")
        original_qty = float(item.get("quantity") or 0)
        send_qty = custom_qty_by_pid.get(pid, original_qty) if custom_items else original_qty
        if send_qty > original_qty:
            send_qty = original_qty
        if send_qty < original_qty:
            reduced_items.append({
                "product_name": item.get("product_name"),
                "requested": original_qty,
                "sent": send_qty,
                "unit": item.get("unit", "قطعة"),
                "rejected": send_qty <= 0,
            })
        if send_qty <= 0:
            continue
        items_to_fulfill.append({**item, "quantity": send_qty, "original_quantity": original_qty})

    pkg_to_fulfill = []
    for pitem in request.get("packaging_items", []):
        mid = pitem.get("packaging_material_id")
        original_qty = float(pitem.get("quantity") or 0)
        send_qty = custom_qty_by_pkg.get(mid, original_qty) if custom_pkg else original_qty
        if send_qty > original_qty:
            send_qty = original_qty
        if send_qty < original_qty:
            reduced_items.append({
                "product_name": pitem.get("name"),
                "requested": original_qty,
                "sent": send_qty,
                "unit": pitem.get("unit", "قطعة"),
                "rejected": send_qty <= 0,
            })
        if send_qty <= 0:
            continue
        pkg_to_fulfill.append({**pitem, "quantity": send_qty})

    if not items_to_fulfill and not pkg_to_fulfill:
        raise HTTPException(status_code=400, detail="لا توجد كميات للتنفيذ — جميع الأصناف مرفوضة")

    # التحقق من توفر الكميات (المُعدّلة) — يحل المنتج بالمعرّف أو الاسم لتفادي
    # ظهور "كمية غير كافية" لمنتج متوفر فعلاً بسبب مرجع product_id قديم/مختلف.
    # ⭐ نتحقق ضد "المتبقي" (= المُصنّع − المحوّل − المستهلَك) وليس الحقل الخام quantity،
    #    حتى يتطابق التحقق مع ما يُعرض للمستخدم بالضبط.
    _consumed_map = await _consumed_as_ingredient_map(db)

    def _remaining_of(p):
        total = p.get("total_produced", 0) or 0
        transferred = p.get("transferred_quantity", 0) or 0
        consumed = _consumed_in_product_unit(_consumed_map, p.get("id"), p.get("unit"))
        r = total - transferred - consumed
        return r if r > 0 else 0.0

    insufficient = []
    for item in items_to_fulfill:
        product = await _resolve_request_product(db, item, tenant_id)
        if product:
            item["_resolved_pid"] = product.get("id")
        avail = _remaining_of(product) if product else 0
        if not product or avail < float(item.get("quantity") or 0):
            insufficient.append({
                "name": item.get("product_name"),
                "requested": item.get("quantity"),
                "available": avail,
            })
    for pitem in pkg_to_fulfill:
        material = await db.packaging_materials.find_one({"id": pitem.get("packaging_material_id")}, {"_id": 0})
        if not material or material.get("quantity", 0) < pitem.get("quantity", 0):
            insufficient.append({
                "name": pitem.get("name"),
                "requested": pitem.get("quantity"),
                "available": material.get("quantity", 0) if material else 0
            })

    if insufficient:
        raise HTTPException(
            status_code=400,
            detail={
                "message": "كمية غير كافية في مخزون التصنيع",
                "insufficient_products": insufficient
            }
        )
    
    # تنفيذ التحويل
    to_branch_id = request.get("to_branch_id")
    branch = await db.branches.find_one({"id": to_branch_id}, {"_id": 0})
    
    for item in items_to_fulfill:
        product_id = item.get("_resolved_pid") or item.get("product_id")
        quantity = item.get("quantity")
        
        # خصم من المنتجات المصنعة وزيادة المحول
        await db.manufactured_products.update_one(
            {"id": product_id},
            {
                "$inc": {
                    "quantity": -quantity,
                    "transferred_quantity": quantity  # الكمية المحولة للفروع
                },
                "$set": {"last_updated": datetime.now(timezone.utc).isoformat()}
            }
        )
        
        # إضافة لمخزون الفرع
        existing = await db.branch_inventory.find_one({
            "branch_id": to_branch_id,
            "product_id": product_id
        })
        
        if existing:
            await db.branch_inventory.update_one(
                {"id": existing["id"]},
                {
                    "$inc": {
                        "quantity": quantity,
                        "received_quantity": quantity
                    },
                    "$set": {"last_updated": datetime.now(timezone.utc).isoformat()}
                }
            )
        else:
            await db.branch_inventory.insert_one({
                "id": str(uuid.uuid4()),
                "branch_id": to_branch_id,
                "product_id": product_id,
                "product_name": item.get("product_name"),
                "quantity": quantity,
                "received_quantity": quantity,
                "sold_quantity": 0,
                "unit": item.get("unit", "قطعة"),
                "cost_per_unit": item.get("cost_per_unit", 0),
                "last_updated": datetime.now(timezone.utc).isoformat(),
                "created_at": datetime.now(timezone.utc).isoformat()
            })
    
    # ⭐ تحويل مواد التغليف من المخزن الرئيسي لمخزن الفرع
    pkg_tenant_id = request.get("tenant_id")
    for pitem in pkg_to_fulfill:
        material_id = pitem.get("packaging_material_id")
        p_qty = pitem.get("quantity", 0)
        if not material_id or p_qty <= 0:
            continue
        material = await db.packaging_materials.find_one({"id": material_id}, {"_id": 0})
        if not material:
            continue
        new_qty = max(0, material.get("quantity", 0) - p_qty)
        await db.packaging_materials.update_one(
            {"id": material_id},
            {"$set": {
                "quantity": new_qty,
                "transferred_to_branches": material.get("transferred_to_branches", 0) + p_qty,
                "last_updated": datetime.now(timezone.utc).isoformat()
            }}
        )
        branch_pkg = await db.branch_packaging_inventory.find_one({
            "branch_id": to_branch_id,
            "packaging_material_id": material_id
        })
        if branch_pkg:
            await db.branch_packaging_inventory.update_one(
                {"id": branch_pkg["id"]},
                {"$inc": {"quantity": p_qty},
                 "$set": {"last_updated": datetime.now(timezone.utc).isoformat()}}
            )
        else:
            await db.branch_packaging_inventory.insert_one({
                "id": str(uuid.uuid4()),
                "branch_id": to_branch_id,
                "packaging_material_id": material_id,
                "packaging_material_name": material.get("name"),
                "quantity": p_qty,
                "used_quantity": 0,
                "cost_per_unit": material.get("cost_per_unit", 0),
                "created_at": datetime.now(timezone.utc).isoformat(),
                "last_updated": datetime.now(timezone.utc).isoformat(),
                "tenant_id": pkg_tenant_id
            })
    
    # تحديث حالة الطلب
    now_iso = datetime.now(timezone.utc).isoformat()
    fulfilled_by_name = current_user.get("full_name") or current_user.get("username") or ""
    await db.branch_requests.update_one(
        {"id": request_id},
        {"$set": {
            "status": "delivered",
            "shipped_at": now_iso,
            "delivered_at": now_iso,
            "fulfilled_by_name": fulfilled_by_name,
            "reduced_items": reduced_items,
            "fulfillment_note": notes_to_kitchen,
        }}
    )
    
    # تسجيل الحركة (بالكميات المُرسلة فعلياً)
    await db.inventory_movements.insert_one({
        "id": str(uuid.uuid4()),
        "type": "branch_request_fulfilled",
        "request_id": request_id,
        "from_location": "manufacturing",
        "to_location": to_branch_id,
        "to_location_name": branch.get("name") if branch else "",
        "items": [{"product_id": it.get("product_id"), "product_name": it.get("product_name"),
                   "quantity": it.get("quantity"), "unit": it.get("unit")} for it in items_to_fulfill],
        "created_at": now_iso
    })

    # ⭐ إشعار مسؤول المطبخ بالتخفيضات (إن وُجدت)
    if reduced_items:
        try:
            await db.branch_request_notifications.insert_one({
                "id": str(uuid.uuid4()),
                "type": "branch_order_reduced",
                "request_id": request_id,
                "request_number": request.get("request_number"),
                "to_branch_id": to_branch_id,
                "to_branch_name": branch.get("name") if branch else request.get("to_branch_name"),
                "requested_by": request.get("requested_by"),
                "requested_by_name": request.get("requested_by_name"),
                "reduced_items": reduced_items,
                "reduced_count": len(reduced_items),
                "notes_to_kitchen": notes_to_kitchen,
                "fulfilled_by_name": fulfilled_by_name,
                "status": "unread",
                "created_at": now_iso,
                "tenant_id": tenant_id or request.get("tenant_id"),
            })
        except Exception:
            pass  # لا تُفشل العملية بسبب خطأ في الإشعار

    return {
        "message": "تم تنفيذ الطلب بنجاح",
        "request_id": request_id,
        "reduced_items": reduced_items,
        "transferred_count": len(items_to_fulfill),
    }

# ==================== BRANCH REQUEST NOTIFICATIONS (إشعارات مسؤول المطبخ) ====================

@router.get("/branch-request-notifications/unread")
async def get_unread_branch_request_notifications(current_user: dict = Depends(get_current_user)):
    """إشعارات مسؤول المطبخ غير المقروءة (تخفيض كميات من المصنع)."""
    db = get_db()
    tenant_id = get_user_tenant_id(current_user)
    query: Dict[str, Any] = {"status": "unread"}
    if tenant_id:
        query["tenant_id"] = tenant_id
    # مسؤول الفرع يرى إشعارات فرعه فقط؛ المدير/المالك يرى الكل
    user_branch = current_user.get("branch_id")
    user_role = current_user.get("role")
    if user_branch and user_role not in [UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.GENERAL_MANAGER, UserRole.MANAGER]:
        query["to_branch_id"] = user_branch
    notifications = await db.branch_request_notifications.find(
        query, {"_id": 0}
    ).sort([("created_at", -1)]).limit(200).to_list(200)
    return notifications


@router.post("/branch-request-notifications/{notification_id}/ack")
async def ack_branch_request_notification(
    notification_id: str,
    current_user: dict = Depends(get_current_user),
):
    """اعتماد (إخفاء) إشعار تخفيض الكميات لمسؤول المطبخ."""
    db = get_db()
    res = await db.branch_request_notifications.update_one(
        {"id": notification_id},
        {"$set": {
            "status": "acknowledged",
            "acknowledged_at": datetime.now(timezone.utc).isoformat(),
            "acknowledged_by": current_user.get("id"),
            "acknowledged_by_name": current_user.get("full_name") or current_user.get("username"),
        }}
    )
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="الإشعار غير موجود")
    return {"message": "تم اعتماد الإشعار"}

# ==================== MANUFACTURING REQUESTS (طلبات التصنيع من المخزن) ====================

@router.post("/manufacturing-requests")
async def create_manufacturing_request(request_data: dict):
    """إنشاء طلب من التصنيع للمخزن (لطلب مواد خام)"""
    db = get_db()
    
    items = request_data.get("items", [])
    priority = request_data.get("priority", "normal")
    notes = request_data.get("notes", "")
    requested_by = request_data.get("requested_by", "")
    requested_by_name = request_data.get("requested_by_name", "")
    
    if not items:
        raise HTTPException(status_code=400, detail="يجب إضافة مواد خام للطلب")
    
    # رقم تسلسلي
    last_request = await db.manufacturing_requests.find_one(sort=[("request_number", -1)])
    request_number = (last_request.get("request_number", 0) if last_request else 0) + 1
    
    # تفاصيل المواد
    items_with_details = []
    total_cost = 0
    
    for item in items:
        material_id = item.get("material_id")
        quantity = item.get("quantity", 0)
        
        # جلب المادة الخام
        material = await db.raw_materials.find_one({"id": material_id}, {"_id": 0})
        if material:
            cost = material.get("cost_per_unit", 0) * quantity
            total_cost += cost
            items_with_details.append({
                "material_id": material_id,
                "material_name": material.get("name"),
                "quantity": quantity,
                "unit": material.get("unit", "كغم"),
                "cost_per_unit": material.get("cost_per_unit", 0),
                "total_cost": cost,
                "available_quantity": material.get("quantity", 0)
            })
    
    # إنشاء سجل الطلب
    request_doc = {
        "id": str(uuid.uuid4()),
        "request_number": request_number,
        "request_type": "manufacturing_to_warehouse",
        "items": items_with_details,
        "total_cost": total_cost,
        "status": "pending",
        "priority": priority,
        "notes": notes,
        "requested_by": requested_by,
        "requested_by_name": requested_by_name,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "fulfilled_at": None
    }
    
    await db.manufacturing_requests.insert_one(request_doc)
    del request_doc["_id"]
    return request_doc

@router.get("/manufacturing-notifications/unread")
async def get_unread_manufacturing_notifications(current_user: dict = Depends(get_current_user)):
    """جلب إشعارات قسم التصنيع غير المُعتمدة (للـ Toast الفوري)."""
    db = get_db()
    tenant_id = get_user_tenant_id(current_user)
    query: Dict[str, Any] = {"status": "unread"}
    if tenant_id:
        query["tenant_id"] = tenant_id
    notifications = await db.manufacturing_notifications.find(
        query, {"_id": 0}
    ).sort([("created_at", -1)]).limit(200).to_list(200)
    return notifications


@router.post("/manufacturing-notifications/{notification_id}/ack")
async def ack_manufacturing_notification(
    notification_id: str,
    payload: Optional[dict] = None,
    current_user: dict = Depends(get_current_user),
):
    """اعتماد إشعار من قسم التصنيع (اضغطه ليختفي وتُسجل اللاحقة).

    Body اختياري: { action: 'accept' | 'wait' } — لتوضيح قرار المصنع.
    """
    db = get_db()
    action = (payload or {}).get("action") or "ack"
    res = await db.manufacturing_notifications.update_one(
        {"id": notification_id},
        {"$set": {
            "status": "acknowledged",
            "acknowledged_at": datetime.now(timezone.utc).isoformat(),
            "acknowledged_by": current_user.get("id"),
            "acknowledged_by_name": current_user.get("full_name") or current_user.get("username"),
            "acknowledgement_action": action,
        }}
    )
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="الإشعار غير موجود")
    return {"message": "تم اعتماد الإشعار", "action": action}


@router.get("/manufacturing-requests")
async def get_manufacturing_requests(status: Optional[str] = None, current_user: dict = Depends(get_current_user)):
    """جلب طلبات التصنيع من المخزن — مع تحديث available_quantity وقت العرض"""
    db = get_db()
    
    query = {}
    if status:
        query["status"] = status
    
    requests = await db.manufacturing_requests.find(query, {"_id": 0}).sort("created_at", -1).to_list(1000)
    
    # 🔄 تحديث available_quantity لكل صنف من raw_materials الحالية
    # (الكميات المحفوظة قديمة وقد تغيّرت منذ إنشاء الطلب)
    material_ids = set()
    for req in requests:
        for it in (req.get("items") or []):
            if it.get("material_id"):
                material_ids.add(it["material_id"])
    if material_ids:
        mats = await db.raw_materials.find(
            {"id": {"$in": list(material_ids)}},
            {"_id": 0, "id": 1, "quantity": 1},
        ).to_list(2000)
        qty_by_id = {m["id"]: float(m.get("quantity") or 0) for m in mats}
        for req in requests:
            for it in (req.get("items") or []):
                mid = it.get("material_id")
                if mid:
                    it["available_quantity"] = qty_by_id.get(mid, 0)
    
    return requests

@router.post("/manufacturing-requests/{request_id}/fulfill")
async def fulfill_manufacturing_request(
    request_id: str,
    payload: Optional[dict] = None,
    current_user: dict = Depends(get_current_user)
):
    """تنفيذ طلب التصنيع — يدعم التنفيذ الجزئي بكميات مُعدّلة من المخزن.

    Body اختياري:
        - items: [{material_id, quantity}] — كميات مُخصّصة (للتجزئة)
        - partial: bool — إذا true، يبقى الطلب مفتوحاً للباقي
        - notes_to_manufacturing: str — رسالة من المخزن لقسم التصنيع
    إذا لم يُرسَل payload: يُنفّذ الكميات الأصلية كاملةً (السلوك القديم).
    """
    db = get_db()
    tenant_id = current_user.get("tenant_id")
    payload = payload or {}
    
    request = await db.manufacturing_requests.find_one({"id": request_id}, {"_id": 0})
    if not request:
        raise HTTPException(status_code=404, detail="الطلب غير موجود")
    if request.get("status") not in ("pending", "partially_fulfilled"):
        raise HTTPException(status_code=400, detail="لا يمكن تنفيذ هذا الطلب")

    # حدد الكميات الفعلية المراد إرسالها
    custom_items = payload.get("items") or []
    is_partial = bool(payload.get("partial"))
    notes_to_mfg = (payload.get("notes_to_manufacturing") or "").strip()

    custom_qty_by_mid: Dict[str, float] = {}
    for ci in custom_items:
        mid = ci.get("material_id")
        if mid:
            custom_qty_by_mid[mid] = max(0.0, float(ci.get("quantity") or 0))

    # ابنِ قائمة المواد المراد تنفيذها (يتجاهل الأصناف ذات الكمية صفر)
    items_to_fulfill = []
    for item in (request.get("items") or []):
        mid = item.get("material_id")
        original_qty = float(item.get("quantity") or 0)
        send_qty = custom_qty_by_mid.get(mid, original_qty) if custom_items else original_qty
        if send_qty <= 0:
            continue
        if send_qty > original_qty:
            send_qty = original_qty  # لا تُرسل أكثر مما طُلب
        items_to_fulfill.append({**item, "quantity": send_qty, "original_quantity": original_qty})

    if not items_to_fulfill:
        raise HTTPException(status_code=400, detail="لا توجد كميات للتنفيذ")

    # التحقق من توفر المواد للكميات المُخصّصة
    insufficient = []
    for item in items_to_fulfill:
        material = await db.raw_materials.find_one({"id": item.get("material_id")}, {"_id": 0})
        avail = float(material.get("quantity", 0) or 0) if material else 0
        if avail < float(item.get("quantity") or 0):
            insufficient.append({
                "name": item.get("material_name"),
                "requested": item.get("quantity"),
                "available": avail,
            })
    if insufficient:
        raise HTTPException(
            status_code=400,
            detail={
                "message": "كمية غير كافية في المخزن",
                "insufficient_materials": insufficient,
            },
        )

    # تنفيذ التحويل
    cost_changed_materials = []
    for item in items_to_fulfill:
        material_id = item.get("material_id")
        quantity = float(item.get("quantity") or 0)

        try:
            await reconcile_layers_with_quantity(db, material_id, tenant_id)
        except Exception:
            pass

        before_mat = await db.raw_materials.find_one({"id": material_id}, {"_id": 0, "cost_per_unit": 1})
        cost_before = float(before_mat.get("cost_per_unit", 0) or 0) if before_mat else 0

        fifo_result = await consume_fifo(
            db,
            material_id=material_id,
            quantity=quantity,
            tenant_id=tenant_id,
        )
        await db.raw_materials.update_one(
            {"id": material_id},
            {
                "$inc": {"quantity": -quantity},
                "$set": {"last_updated": datetime.now(timezone.utc).isoformat()}
            }
        )
        weighted_cost = fifo_result.get("weighted_avg_cost") or item.get("cost_per_unit", 0)
        new_effective = fifo_result.get("new_effective_cost")
        if new_effective is not None and abs(new_effective - cost_before) > 0.001:
            cost_changed_materials.append(material_id)

        existing = await db.manufacturing_inventory.find_one({"$or": [{"material_id": material_id}, {"raw_material_id": material_id}]})
        if existing:
            await db.manufacturing_inventory.update_one(
                {"id": existing["id"]} if existing.get("id") else {"$or": [{"material_id": material_id}, {"raw_material_id": material_id}]},
                {
                    "$inc": {"quantity": quantity},
                    "$set": {
                        "last_updated": datetime.now(timezone.utc).isoformat(),
                        "cost_per_unit": weighted_cost,
                        "material_id": material_id,
                        "raw_material_id": material_id,
                    }
                }
            )
        else:
            # 🔧 تأكيد الاسم: لو الـ item لا يحمل اسماً ابحث في raw_materials
            mat_name = item.get("material_name") or item.get("raw_material_name")
            if not mat_name and material_id:
                _m = await db.raw_materials.find_one({"id": material_id}, {"_id": 0, "name": 1, "unit": 1})
                if _m:
                    mat_name = _m.get("name")
                    if not item.get("unit"):
                        item["unit"] = _m.get("unit")
            await db.manufacturing_inventory.insert_one({
                "id": str(uuid.uuid4()),
                "material_id": material_id,
                "raw_material_id": material_id,  # توحيد الحقلين
                "material_name": mat_name,
                "raw_material_name": mat_name,
                "quantity": quantity,
                "unit": item.get("unit"),
                "cost_per_unit": weighted_cost,
                "last_updated": datetime.now(timezone.utc).isoformat(),
                "created_at": datetime.now(timezone.utc).isoformat()
            })

    # تحديث حالة الطلب — partial أم fulfilled
    now_iso = datetime.now(timezone.utc).isoformat()

    if is_partial:
        # خفّض كميات الطلب الأصلي بالكميات المرسلة، وأبقِه pending إن بقي شيء
        updated_items = []
        any_remaining = False
        for orig in (request.get("items") or []):
            mid = orig.get("material_id")
            sent_qty = next((float(it["quantity"]) for it in items_to_fulfill if it.get("material_id") == mid), 0.0)
            remaining = float(orig.get("quantity") or 0) - sent_qty
            if remaining < 0:
                remaining = 0.0
            if remaining > 0:
                any_remaining = True
                new_item = dict(orig)
                new_item["quantity"] = remaining
                updated_items.append(new_item)

        # سجل التنفيذ الجزئي (للتدقيق وإشعار التصنيع)
        partial_log_entry = {
            "fulfilled_at": now_iso,
            "fulfilled_by": current_user.get("id"),
            "fulfilled_by_name": current_user.get("full_name") or current_user.get("username"),
            "items": [{
                "material_id": it.get("material_id"),
                "material_name": it.get("material_name"),
                "sent_quantity": it.get("quantity"),
                "original_quantity": it.get("original_quantity"),
                "unit": it.get("unit"),
            } for it in items_to_fulfill],
            "notes_to_manufacturing": notes_to_mfg or "تم إرسال كمية أقل من المطلوب — بانتظار توفر المواد المتبقية",
        }

        await db.manufacturing_requests.update_one(
            {"id": request_id},
            {
                "$set": {
                    "status": "partially_fulfilled" if any_remaining else "fulfilled",
                    "items": updated_items if any_remaining else (request.get("items") or []),
                    "last_partial_at": now_iso,
                    "fulfilled_at": now_iso if not any_remaining else None,
                },
                "$push": {"fulfillment_log": partial_log_entry},
            }
        )

        # ⭐ إشعار فوري لقسم التصنيع
        try:
            await db.manufacturing_notifications.insert_one({
                "id": str(uuid.uuid4()),
                "type": "partial_transfer",
                "request_id": request_id,
                "request_number": request.get("request_number"),
                "items_summary": [{
                    "material_name": it.get("material_name"),
                    "sent_quantity": it.get("quantity"),
                    "original_quantity": it.get("original_quantity"),
                    "unit": it.get("unit"),
                } for it in items_to_fulfill],
                "items_count": len(items_to_fulfill),
                "any_remaining": any_remaining,
                "notes_to_manufacturing": partial_log_entry["notes_to_manufacturing"],
                "from_warehouse_user": current_user.get("full_name") or current_user.get("username"),
                "status": "unread",
                "created_at": now_iso,
                "tenant_id": tenant_id,
            })
        except Exception:
            pass  # لا تُفشل العملية بسبب خطأ في الإشعار
    else:
        # تنفيذ كامل (سلوك قديم)
        await db.manufacturing_requests.update_one(
            {"id": request_id},
            {"$set": {
                "status": "fulfilled",
                "fulfilled_at": now_iso,
                "fulfilled_by": current_user.get("id"),
                "fulfilled_by_name": current_user.get("full_name") or current_user.get("username"),
            }}
        )

    # حركة المخزن
    await db.inventory_movements.insert_one({
        "id": str(uuid.uuid4()),
        "type": "warehouse_to_manufacturing",
        "subtype": "partial" if is_partial else "full",
        "request_id": request_id,
        "request_number": request.get("request_number"),
        "from_location": "warehouse",
        "to_location": "manufacturing",
        "items": [{
            "material_id": it.get("material_id"),
            "material_name": it.get("material_name"),
            "quantity": it.get("quantity"),
            "original_quantity": it.get("original_quantity"),
            "unit": it.get("unit"),
        } for it in items_to_fulfill],
        "notes_to_manufacturing": notes_to_mfg if is_partial else None,
        "performed_by": current_user.get("id"),
        "performed_by_name": current_user.get("full_name") or current_user.get("username"),
        "created_at": now_iso,
        "tenant_id": tenant_id,
    })

    # نشر تكلفة المنتجات المُصنّعة
    propagated_summary = []
    for mid in cost_changed_materials:
        result = await propagate_cost_to_products(db, material_id=mid, tenant_id=tenant_id)
        propagated_summary.append({"material_id": mid, **result})

    return {
        "message": ("تم تنفيذ جزئي — أُرسل ما يتوفر ويبقى الباقي بانتظار شراء المواد"
                    if is_partial else "تم تنفيذ الطلب وتحويل المواد للتصنيع"),
        "request_id": request_id,
        "partial": is_partial,
        "items_fulfilled": len(items_to_fulfill),
        "notes_to_manufacturing": notes_to_mfg if is_partial else None,
        "cost_propagation": propagated_summary,
    }


@router.patch("/manufacturing-requests/{request_id}/status")
async def update_manufacturing_request_status(request_id: str, status: str):
    """تحديث حالة طلب التصنيع (رفض أو إلغاء)"""
    db = get_db()
    
    valid_statuses = ["pending", "fulfilled", "rejected", "cancelled"]
    if status not in valid_statuses:
        raise HTTPException(status_code=400, detail=f"حالة غير صالحة. الحالات المتاحة: {', '.join(valid_statuses)}")
    
    request = await db.manufacturing_requests.find_one({"id": request_id})
    if not request:
        raise HTTPException(status_code=404, detail="الطلب غير موجود")
    
    await db.manufacturing_requests.update_one(
        {"id": request_id},
        {"$set": {
            "status": status,
            "updated_at": datetime.now(timezone.utc).isoformat()
        }}
    )
    
    return {"message": "تم تحديث حالة الطلب", "status": status}


# ==================== PURCHASE REQUESTS (طلبات الشراء) ====================

@router.post("/purchase-requests")
async def create_purchase_request(request_data: dict):
    """إنشاء طلب شراء من المخزن"""
    db = get_db()
    
    items = request_data.get("items", [])
    supplier = request_data.get("supplier", "")
    priority = request_data.get("priority", "normal")
    notes = request_data.get("notes", "")
    requested_by = request_data.get("requested_by", "")
    requested_by_name = request_data.get("requested_by_name", "")
    
    if not items:
        raise HTTPException(status_code=400, detail="يجب إضافة مواد للطلب")
    
    # رقم تسلسلي
    last_request = await db.purchase_requests.find_one(sort=[("request_number", -1)])
    request_number = (last_request.get("request_number", 0) if last_request else 0) + 1
    
    # تفاصيل المواد
    items_with_details = []
    total_cost = 0
    
    for item in items:
        cost = item.get("estimated_cost", 0) * item.get("quantity", 0)
        total_cost += cost
        items_with_details.append({
            "material_name": item.get("material_name"),
            "quantity": item.get("quantity", 0),
            "unit": item.get("unit", "كغم"),
            "estimated_cost": item.get("estimated_cost", 0),
            "total_cost": cost
        })
    
    # إنشاء سجل الطلب
    request_doc = {
        "id": str(uuid.uuid4()),
        "request_number": request_number,
        "request_type": "purchase",
        "items": items_with_details,
        "total_cost": total_cost,
        "supplier": supplier,
        "status": "pending",  # pending, approved, ordered, received, cancelled
        "priority": priority,
        "notes": notes,
        "requested_by": requested_by,
        "requested_by_name": requested_by_name,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "approved_at": None,
        "ordered_at": None,
        "received_at": None
    }
    
    await db.purchase_requests.insert_one(request_doc)
    del request_doc["_id"]
    return request_doc

@router.get("/purchase-requests")
async def get_purchase_requests(status: Optional[str] = None):
    """جلب طلبات الشراء"""
    db = get_db()
    
    query = {}
    if status:
        query["status"] = status
    
    requests = await db.purchase_requests.find(query, {"_id": 0}).sort("created_at", -1).to_list(1000)
    return requests

@router.put("/purchase-requests/{request_id}/status")
async def update_purchase_request_status(request_id: str, status_data: dict):
    """تحديث حالة طلب الشراء"""
    db = get_db()
    
    new_status = status_data.get("status")
    valid_statuses = ["pending", "approved", "ordered", "received", "cancelled"]
    
    if new_status not in valid_statuses:
        raise HTTPException(status_code=400, detail="حالة غير صالحة")
    
    update_data = {"status": new_status}
    
    if new_status == "approved":
        update_data["approved_at"] = datetime.now(timezone.utc).isoformat()
    elif new_status == "ordered":
        update_data["ordered_at"] = datetime.now(timezone.utc).isoformat()
    elif new_status == "received":
        update_data["received_at"] = datetime.now(timezone.utc).isoformat()
    
    result = await db.purchase_requests.update_one(
        {"id": request_id},
        {"$set": update_data}
    )
    
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="الطلب غير موجود")
    
    return {"message": "تم تحديث الحالة", "status": new_status}


@router.post("/purchase-requests/{request_id}/receive")
async def receive_purchase_request(request_id: str, received_items: Optional[List[dict]] = None):
    """استلام طلب الشراء وإضافة المواد للمخزن"""
    db = get_db()
    
    request = await db.purchase_requests.find_one({"id": request_id})
    if not request:
        raise HTTPException(status_code=404, detail="الطلب غير موجود")
    
    if request.get("status") not in ["approved", "ordered"]:
        raise HTTPException(status_code=400, detail="يجب أن يكون الطلب معتمداً أو مطلوباً قبل الاستلام")
    
    # استخدام الكميات المستلمة أو الكميات المطلوبة
    items_to_receive = received_items or request.get("items", [])
    
    # إضافة المواد للمخزن
    for item in items_to_receive:
        material_name = item.get("material_name")
        quantity = item.get("received_quantity", item.get("quantity", 0))
        
        # البحث عن المادة في المخزن
        existing_material = await db.raw_materials.find_one({"name": material_name})
        
        if existing_material:
            # زيادة الكمية
            await db.raw_materials.update_one(
                {"id": existing_material["id"]},
                {
                    "$inc": {
                        "quantity": quantity,
                        "total_received": quantity
                    },
                    "$set": {"last_updated": datetime.now(timezone.utc).isoformat()}
                }
            )
        else:
            # إنشاء مادة جديدة
            await db.raw_materials.insert_one({
                "id": str(uuid.uuid4()),
                "name": material_name,
                "unit": item.get("unit", "كغم"),
                "quantity": quantity,
                "total_received": quantity,
                "transferred_to_manufacturing": 0,
                "min_quantity": 10,
                "cost_per_unit": item.get("estimated_cost", 0),
                "waste_percentage": 0,
                "effective_cost_per_unit": item.get("estimated_cost", 0),
                "created_at": datetime.now(timezone.utc).isoformat()
            })
    
    # تحديث حالة الطلب
    await db.purchase_requests.update_one(
        {"id": request_id},
        {"$set": {
            "status": "received",
            "received_at": datetime.now(timezone.utc).isoformat(),
            "received_items": items_to_receive
        }}
    )
    
    # تسجيل الحركة
    await db.inventory_movements.insert_one({
        "id": str(uuid.uuid4()),
        "type": "purchase_received",
        "request_id": request_id,
        "items": items_to_receive,
        "notes": f"استلام طلب شراء #{request.get('request_number')}",
        "created_at": datetime.now(timezone.utc).isoformat()
    })
    
    return {"message": "تم استلام المشتريات وإضافتها للمخزن", "request_id": request_id}


@router.get("/warehouse-transactions")
async def get_warehouse_transactions(type: Optional[str] = None):
    """جلب حركات المخزن (واردات/صادرات)"""
    db = get_db()
    
    query = {}
    if type:
        query["type"] = type
    
    transactions = await db.warehouse_transactions.find(query, {"_id": 0}).sort("created_at", -1).to_list(1000)
    return transactions

# ==================== MANUFACTURING INVENTORY (مخزون التصنيع) ====================

# ⭐ DELETE: حذف سجل من مخزون التصنيع (لاستخدامه عند تضارب الأسعار أو سجل قديم)
@router.delete("/manufacturing-inventory/{item_id}")
async def delete_manufacturing_inventory_item(
    item_id: str,
    current_user: dict = Depends(get_current_user),
):
    """حذف سجل واحد من مخزون قسم التصنيع.
    صلاحية: مدير/سوبر/مالك فقط. يُعيد للمادة المعدّل المرتبط فرصة لإعادة التحويل بسعر صحيح.
    """
    role = (current_user.get("role") or "").lower()
    if role not in {"admin", "super_admin", "owner", "manager"}:
        raise HTTPException(status_code=403, detail="غير مسموح — للمدير/المالك فقط")
    db = get_db()
    item = await db.manufacturing_inventory.find_one({"id": item_id}, {"_id": 0})
    if not item:
        raise HTTPException(status_code=404, detail="السجل غير موجود")
    # ضع علامة عودة على المادة الخام (اختياري): اخصم transferred_to_manufacturing
    linked = item.get("raw_material_id") or item.get("material_id")
    qty = float(item.get("quantity") or 0)
    if linked and qty > 0:
        try:
            await db.raw_materials.update_one(
                {"id": linked},
                {"$inc": {"transferred_to_manufacturing": -qty},
                 "$set": {"last_updated": datetime.now(timezone.utc).isoformat()}}
            )
        except Exception:
            pass
    # سجل تدقيق
    try:
        await db.audit_logs.insert_one({
            "id": str(uuid.uuid4()),
            "action": "delete_manufacturing_inventory",
            "entity_type": "manufacturing_inventory",
            "entity_id": item_id,
            "user_id": current_user.get("id"),
            "user_email": current_user.get("email"),
            "details": {
                "name": item.get("material_name") or item.get("raw_material_name"),
                "quantity": qty,
                "unit": item.get("unit"),
                "cost_per_unit": item.get("cost_per_unit"),
                "linked_raw_material_id": linked,
            },
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
    except Exception:
        pass
    result = await db.manufacturing_inventory.delete_one({"id": item_id})
    return {
        "success": True,
        "deleted": result.deleted_count,
        "message": "تم حذف السجل بنجاح. يمكنك الآن إعادة التحويل بسعر صحيح.",
    }


@router.get("/manufacturing-inventory")
async def get_manufacturing_inventory(current_user: dict = Depends(get_current_user)):
    """جلب مخزون قسم التصنيع (المواد الخام المستلمة).

    🔧 يُثري كل سجل بالاسم/الوحدة من `raw_materials` إن كانت مفقودة محلياً،
    لمنع ظهور "بدون اسم" حتى قبل تشغيل المزامنة الشاملة.
    """
    db = get_db()
    inventory = await db.manufacturing_inventory.find({}, {"_id": 0}).to_list(1000)

    # نُجمّع كل المعرّفات لاستعلام raw_materials دفعة واحدة (أداء أفضل)
    ids = list({(it.get("material_id") or it.get("raw_material_id")) for it in inventory if (it.get("material_id") or it.get("raw_material_id"))})
    masters_map = {}
    if ids:
        masters = await db.raw_materials.find(
            {"id": {"$in": ids}},
            {"_id": 0, "id": 1, "name": 1, "unit": 1, "cost_per_unit": 1}
        ).to_list(len(ids))
        masters_map = {m["id"]: m for m in masters}

    for it in inventory:
        linked = it.get("material_id") or it.get("raw_material_id")
        master = masters_map.get(linked) if linked else None
        master_name = (master or {}).get("name")
        master_unit = (master or {}).get("unit")
        # ⭐ الأولوية للاسم الموجود في raw_materials (المرجع المُحدّث)،
        # نتراجع إلى الاسم المخزّن محلياً فقط إن لم يكن هناك مرجع.
        name = master_name or it.get("material_name") or it.get("raw_material_name")
        if name:
            it["material_name"] = name
            it["raw_material_name"] = name
        # الوحدة: أولوية لما في سجل المادة الخام (لتعكس آخر تصحيح إداري)
        if master_unit:
            it["unit"] = master_unit
        # المعرّفات (توحيد)
        if linked:
            it["material_id"] = linked
            it["raw_material_id"] = linked
    return inventory

# ==================== MANUFACTURED PRODUCTS (المنتجات المصنعة) ====================

@router.post("/manufactured-products")
async def create_manufactured_product(
    product: ManufacturedProductCreate,
    current_user: dict = Depends(get_current_user)
):
    """إنشاء منتج مصنع جديد (وصفة)"""
    db = get_db()
    tenant_id = current_user.get("tenant_id")
    
    # حساب تكلفة المواد الخام (قبل + بعد الهدر)
    raw_material_cost = 0  # قبل الهدر
    raw_material_cost_after_waste = 0  # بعد الهدر (المعتمدة)
    recipe_items = []

    for ingredient in product.recipe:
        base_cost = ingredient.quantity * ingredient.cost_per_unit
        raw_material_cost += base_cost
        # تكلفة فعلية بعد الهدر
        waste_pct = ingredient.waste_percentage or 0
        if waste_pct > 0 and waste_pct < 100:
            effective_cost_per_unit = ingredient.cost_per_unit / (1 - waste_pct / 100)
        else:
            effective_cost_per_unit = ingredient.cost_per_unit
        raw_material_cost_after_waste += ingredient.quantity * effective_cost_per_unit
        item = ingredient.model_dump()
        # 🔧 محاولة الربط بالاسم إن كان كلا المعرّفين فارغ (تعافي البيانات القديمة)
        item = await _resolve_ingredient_ids(db, item, tenant_id)
        recipe_items.append(item)

    # 🎯 تكلفة التصنيع المعتمدة = بعد الهدر (يُستخدم في احتساب تكلفة المبيعات)
    production_cost = product.production_cost if product.production_cost is not None else round(raw_material_cost_after_waste, 2)

    product_doc = {
        "id": str(uuid.uuid4()),
        "tenant_id": tenant_id,
        "name": product.name,
        "name_en": product.name_en,
        "unit": product.unit,
        "piece_weight": product.piece_weight,  # ⭐ وزن القطعة (للنمط Batch)
        "piece_weight_unit": product.piece_weight_unit or "غرام",
        "piece_def_value": product.piece_def_value,  # ⭐ تعريف البورشن للوحدات العدّية
        "piece_def_unit": product.piece_def_unit,     # ⭐ وحدة التعريف الحقيقية
        "actual_recipe_yield": product.actual_recipe_yield,  # ⭐ كمية إنتاج الوصفة الفعلية
        "recipe": recipe_items,
        "quantity": product.quantity,
        "min_quantity": product.min_quantity,
        "raw_material_cost": round(raw_material_cost, 2),  # قبل الهدر (للموردين)
        "raw_material_cost_after_waste": round(raw_material_cost_after_waste, 2),  # بعد الهدر
        "cost_before_waste": round(raw_material_cost, 2),  # alias
        "production_cost": production_cost,  # ⭐ التكلفة المعتمدة (بعد الهدر)
        "selling_price": product.selling_price,  # سعر البيع — يحدده المستخدم في قائمة الطعام، ليس هنا
        "profit_margin": product.selling_price - production_cost if product.selling_price > 0 else 0,
        "category": product.category,
        "last_updated": datetime.now(timezone.utc).isoformat(),
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    
    await db.manufactured_products.insert_one(product_doc)
    del product_doc["_id"]
    return product_doc

def _backfill_cost_fields(product: dict) -> dict:
    """احتساب حقول التكلفة (قبل/بعد الهدر) من الوصفة للمنتجات القديمة التي لا تحملها."""
    has_before = product.get("cost_before_waste") is not None or product.get("raw_material_cost") is not None
    has_after = product.get("raw_material_cost_after_waste") is not None
    has_production = product.get("production_cost") is not None
    if has_before and has_after and has_production:
        return product

    cost_before = 0.0
    cost_after = 0.0
    for ing in product.get("recipe", []) or []:
        try:
            qty = float(ing.get("quantity", 0) or 0)
            cpu = float(ing.get("cost_per_unit", 0) or 0)
            waste_pct = float(ing.get("waste_percentage", 0) or 0)
        except (TypeError, ValueError):
            continue
        base = qty * cpu
        cost_before += base
        if 0 < waste_pct < 100:
            effective_cpu = cpu / (1 - waste_pct / 100)
        else:
            effective_cpu = cpu
        cost_after += qty * effective_cpu

    cost_before = round(cost_before, 2)
    cost_after = round(cost_after, 2)
    if product.get("raw_material_cost") is None:
        product["raw_material_cost"] = cost_before
    if product.get("cost_before_waste") is None:
        product["cost_before_waste"] = cost_before
    if product.get("raw_material_cost_after_waste") is None:
        product["raw_material_cost_after_waste"] = cost_after
    if product.get("production_cost") is None:
        product["production_cost"] = cost_after
    return product


# ⭐ حساب موحّد لتكلفة وعائد الوحدة (يطابق منطق WarehouseManufacturing.js — يدعم pack_info)
async def _enrich_unit_cost_fields(db, product: dict) -> dict:
    """يحسب `computed_yield` و `unit_cost_after_waste` و `unit_cost_before_waste`
    باستخدام piece_weight + pack_info من raw_materials. مصدر واحد للحقيقة لجميع
    الواجهات (بطاقات التصنيع + MfgLinksEditor + الباكند للطلبات).

    يدعم 3 مصادر لمعلومات الحزمة (pack_info) بترتيب الأولوية:
      1) pack_quantity/pack_unit المخزّنة على المكوّن نفسه (snapshot).
      2) pack_quantity/pack_unit من raw_materials المرتبطة.
      3) piece_weight/piece_weight_unit من المنتج المُصنّع الوسيط (nested recipes).
    """
    UNIT_W = {"غرام": 1.0, "كغم": 1000.0, "كيلو": 1000.0, "كجم": 1000.0,
              "gram": 1.0, "kg": 1000.0, "مل": 1.0, "لتر": 1000.0, "ml": 1.0, "liter": 1000.0, "l": 1000.0}
    COUNT_UNITS = {"قطعة", "قطع", "حبة", "حبات", "علبة", "علب", "كرتون", "كراتين", "صحن", "piece", "pieces", "unit"}

    pw = float(product.get("piece_weight") or 0)
    pwu = product.get("piece_weight_unit") or "غرام"
    # ⭐ تعريف البورشن: عند وحدة عدّية (قطعة/شريحة/علبة...) لا وزن لها، نستخدم
    # الوزن الحقيقي المُعرَّف للقطعة (piece_def_value + piece_def_unit) لحساب دقيق.
    pdv = float(product.get("piece_def_value") or 0)
    pdu = product.get("piece_def_unit")
    # ⭐ تعريف البورشن (piece_def_value + piece_def_unit) له الأولوية المطلقة متى
    # كان مُعرّفاً وصالحاً — حتى لو كانت piece_weight_unit وزنية أو فارغة (بيانات
    # قديمة/تالفة). هذا يمنع تجاهل التعريف (مثال: 1 شريحة = 80غ) واحتساب عائد خاطئ
    # (40÷1 بدل 40÷80) عندما يُحفظ piece_weight=1 مع وحدة وزنية افتراضية.
    if pdv > 0 and pdu and UNIT_W.get(pdu):
        piece_grams = pdv * UNIT_W.get(pdu)
    else:
        piece_grams = pw * UNIT_W.get(pwu, 1.0)

    recipe = product.get("recipe") or []

    # اجلب raw_materials المرتبطة لاستخراج pack_info
    raw_ids = [ing.get("raw_material_id") for ing in recipe if ing.get("raw_material_id")]
    raw_map = {}
    if raw_ids:
        async for mat in db.raw_materials.find({"id": {"$in": raw_ids}}, {"_id": 0, "id": 1, "pack_quantity": 1, "pack_unit": 1}):
            raw_map[mat["id"]] = mat

    # ⭐ اجلب المنتجات المُصنّعة الوسيطة لاستخراج piece_weight (Nested Recipes)
    mfg_ids = [ing.get("manufactured_product_id") for ing in recipe if ing.get("manufactured_product_id")]
    mfg_map = {}
    if mfg_ids:
        async for m in db.manufactured_products.find({"id": {"$in": mfg_ids}}, {"_id": 0, "id": 1, "piece_weight": 1, "piece_weight_unit": 1}):
            mfg_map[m["id"]] = m

    def _ingredient_pack_info(ing):
        """يُرجع (pack_quantity, pack_unit) للمكوّن من أي مصدر متاح، أو (0, None)."""
        # 1) snapshot على المكوّن نفسه
        ipq = float(ing.get("pack_quantity") or 0)
        ipu = ing.get("pack_unit")
        if ipq > 0 and ipu:
            return ipq, ipu
        # 2) من المادة الخام
        mat = raw_map.get(ing.get("raw_material_id"))
        if mat and float(mat.get("pack_quantity") or 0) > 0 and mat.get("pack_unit"):
            return float(mat["pack_quantity"]), mat["pack_unit"]
        # 3) من المنتج المُصنّع الوسيط (piece_weight يلعب دور pack_quantity)
        mfg = mfg_map.get(ing.get("manufactured_product_id"))
        if mfg and float(mfg.get("piece_weight") or 0) > 0:
            return float(mfg["piece_weight"]), mfg.get("piece_weight_unit") or "غرام"
        return 0.0, None

    # حساب إجمالي الوصفة (مع pack_info لمكونات قطعية)
    total_grams = 0.0
    for ing in recipe:
        qty = float(ing.get("quantity") or 0)
        unit = (ing.get("unit") or "").strip()
        f = UNIT_W.get(unit)
        if f:
            total_grams += qty * f
        elif unit in COUNT_UNITS or not unit:
            ipq, ipu = _ingredient_pack_info(ing)
            pf = UNIT_W.get(ipu, 0) if ipu else 0
            if ipq > 0 and pf > 0:
                total_grams += qty * ipq * pf

    calc_yield = (total_grams / piece_grams) if (piece_grams > 0 and total_grams > 0) else 0.0

    # ⭐ تصحيح حرج: إذا كانت الوحدة الرئيسية (main_unit) وزنية (غرام/كغم/مل/لتر)،
    # فإن piece_weight لا يُحدّد الوحدة الرئيسية بل وحدة فرعية افتراضية. في هذه
    # الحالة، الـ yield الصحيح = total_grams ÷ factor(main_unit) (كم وحدة من main_unit).
    # مثال: لحم مفروم بـ main_unit="غرام"، piece_weight=60، total_grams=10,250
    #   → yield الصحيح = 10,250 / 1 = 10,250 غرام
    #   → unit_cost = 108,299 / 10,250 = 10.57 IQD/غرام (ليس 634 IQD لكل قطعة 60غ).
    main_unit_str = (product.get("unit") or "").strip()
    main_unit_factor = UNIT_W.get(main_unit_str)
    # ⭐ لا يُطبّق تجاوز الوحدة الوزنية إذا كان للمنتج تعريف بورشن صريح (piece_def_value):
    # في هذه الحالة المنتج يُعدّ بالحصص، فالعائد = total_grams ÷ piece_grams (بالحصص)
    # وليس total_grams ÷ 1 (بالغرام). مثال: دجاج فاهيتا 300غ ÷ 80 = 3.75 حصة (وليس 300).
    if main_unit_factor and total_grams > 0 and not _has_piece_definition(product):
        calc_yield = total_grams / main_unit_factor

    # عائد بديل قطعي (لوحدات فرعية كـ شريحة)
    # ⭐ يدعم تحويل count→count: إذا pack_unit وحدة عدّ (غير وزنية) و pwu وحدة عدّ أيضاً،
    #    نعتبر كل "pack_quantity" من المادة الخام = pack_quantity من وحدات المنتج الفرعية.
    #    مثال: 1 قطعة لحم بقري مقدد = 10 شرائح (pack_quantity=10, pack_unit="قطعة"),
    #          والمنتج "بكن بقري" piece_weight_unit="شريحة" → 5 قطعة × 10 = 50 شريحة → ÷1 = 50 قطعة-منتج.
    pwu_is_weight = pwu in UNIT_W
    count_yield = 0.0
    if calc_yield == 0 and pw > 0:
        sum_in_pwu = 0.0
        for ing in recipe:
            qty = float(ing.get("quantity") or 0)
            if ing.get("unit") == pwu:
                sum_in_pwu += qty
                continue
            ipq, ipu = _ingredient_pack_info(ing)
            if ipq <= 0 or not ipu:
                continue
            if ipu == pwu:
                # تطابق مباشر للوحدة
                sum_in_pwu += qty * ipq
            elif (not pwu_is_weight) and (ipu not in UNIT_W):
                # كلا الوحدتين عدّية (count) ومختلفتان نصياً — نفترض التكافؤ
                # (مثال: pack_unit="قطعة" + piece_weight_unit="شريحة")
                sum_in_pwu += qty * ipq
        if sum_in_pwu > 0:
            count_yield = sum_in_pwu / pw

    final_yield = calc_yield or count_yield
    # ⭐ كمية إنتاج الوصفة الفعلية (actual_recipe_yield) تُستخدم كعائد الوصفة المحسوب
    # متى كانت مُعرّفة (>0) — تعالج تمدّد/انكماش الكتلة أثناء الطبخ.
    ary = float(product.get("actual_recipe_yield") or 0)
    if ary > 0:
        final_yield = ary
    stored_qty = float(product.get("quantity") or 0)
    # ⭐ تكلفة الوحدة = كلفة الوصفة المخزّنة ÷ عائد هذه الوصفة بالذات (final_yield).
    # كل منتج يُحسب حسب إدخاله الخاص: العائد إمّا من actual_recipe_yield المُعرّف له،
    # أو محسوب من مكوّناته (calc_yield/count_yield مع احترام piece_def_value).
    # البسط (raw_material_cost_after_waste) يخصّ هذه الوصفة نفسها، فالمقام يجب أن يكون
    # عائد الوصفة نفسها — لا الكمية التراكمية المُنتجة (total_produced) التي كانت تُضخّم
    # القسمة وتُنقص التكلفة للمنتجات الحصصية (مثل لحم ستيك: 2052 وليس 26).
    # في نمط الدفعة تُحجَّم الوصفة عند الإنتاج فيتطابق البسط والمقام تلقائياً
    # (مثل المايونيز: 48,334 ÷ 30 = 1,611).
    denom = final_yield or stored_qty or 1.0

    batch_after = float(product.get("raw_material_cost_after_waste") or product.get("production_cost") or product.get("raw_material_cost") or 0)
    batch_before = float(product.get("cost_before_waste") or product.get("raw_material_cost") or 0)

    product["computed_yield"] = round(final_yield or stored_qty, 6)
    product["unit_cost_after_waste"] = round(batch_after / denom, 6)
    product["unit_cost_before_waste"] = round(batch_before / denom, 6)
    # ⭐ متوسط التكلفة المرجّح (WAC): إذا خُزِّن سعر وحدة مرجّح عبر الدفعات (يُحدّث عند كل
    # تصنيع جديد بسعر مختلف) فهو مصدر الحقيقة لسعر الوحدة بدل كلفة آخر وصفة. ثابت تجاه
    # السحوبات (التحويل/الاستهلاك) بطبيعته، لذا لا حاجة لتعديله إلا عند التصنيع.
    wac_after = float(product.get("wac_unit_after") or 0)
    wac_before = float(product.get("wac_unit_before") or 0)
    if wac_after > 0:
        product["unit_cost_after_waste"] = round(wac_after, 6)
    if wac_before > 0:
        product["unit_cost_before_waste"] = round(wac_before, 6)
    return product


@router.get("/manufactured-products")
async def get_manufactured_products(current_user: dict = Depends(get_current_user)):
    """جلب جميع المنتجات المصنعة"""
    db = get_db()
    products = await db.manufactured_products.find({}, {"_id": 0}).to_list(1000)

    # ⭐ المستهلَك كمكوّن في تصنيع منتجات أخرى (Nested Recipes) — يُخصم من المتبقي.
    # يُجمَع من حركات الاستهلاك (manufactured_consumption) فيُصحّح ذاتياً للبيانات القائمة.
    consumed_map = await _consumed_as_ingredient_map(db)

    # إضافة الحقول الإحصائية - المتبقي = إجمالي المُصنّع - المحول - المستهلَك كمكوّن
    for product in products:
        total = product.get("total_produced", 0) or 0
        transferred = product.get("transferred_quantity", 0) or 0
        consumed = _consumed_in_product_unit(consumed_map, product.get("id"), product.get("unit"))
        # المتبقي = إجمالي المُصنّع - المحول للفروع - المستهلَك في تصنيع منتجات أخرى
        remaining = total - transferred - consumed
        if remaining < 0:
            remaining = 0.0
        product["total_produced"] = total
        product["transferred_quantity"] = transferred
        product["consumed_as_ingredient"] = round(consumed, 6)
        product["remaining_quantity"] = round(remaining, 6)
        product["quantity"] = round(remaining, 6)  # تحديث الكمية لتتوافق
        # ⭐ ملء حقول التكلفة (قبل/بعد الهدر) للمنتجات القديمة
        _backfill_cost_fields(product)
        # ⭐ حساب موحّد لتكلفة الوحدة (يدعم pack_info) — مصدر واحد للحقيقة
        await _enrich_unit_cost_fields(db, product)

    return products


# ⭐ إصلاح التعريفات المفقودة: فحص + تحديث جماعي لـ piece_def_value
# ⚠️ يجب التسجيل قبل `/manufactured-products/{product_id}` لتجنب تصادم المسار
class PieceDefFixItem(BaseModel):
    id: str
    piece_def_value: float
    piece_def_unit: str = "غرام"


class PieceDefFixPayload(BaseModel):
    items: List[PieceDefFixItem]


@router.get("/manufactured-products/missing-piece-def")
async def get_missing_piece_definitions(current_user: dict = Depends(get_current_user)):
    """يفحص المنتجات المُصنّعة ذات الوحدة الرئيسية العدّية التي تنقصها تعريف بورشن صالح
    (piece_def_value) ولها وصفة وزنية قابلة للحساب — فيكون عائدها/تكلفتها خاطئاً (مثل 40÷1).

    يُرجع قائمة المنتجات الناقصة مع اقتراح قيمة عند توفّر مصدر موثوق (piece_weight وزني)."""
    db = get_db()
    tenant_id = current_user.get("tenant_id")
    query: Dict[str, Any] = {}
    if tenant_id:
        query["tenant_id"] = tenant_id
    products = await db.manufactured_products.find(query, {"_id": 0}).to_list(5000)
    missing = []
    for p in products:
        main_unit = (p.get("unit") or "").strip()
        if main_unit in _UNIT_WEIGHT_MAP:
            continue  # وحدة رئيسية وزنية → لا تحتاج تعريف بورشن
        pw = float(p.get("piece_weight") or 0)
        pwu = p.get("piece_weight_unit") or "غرام"
        pwu_is_weight = pwu in _UNIT_WEIGHT_MAP
        pdv = float(p.get("piece_def_value") or 0)
        pdu = p.get("piece_def_unit")
        has_valid_def = pdv > 0 and pdu and (pdu in _UNIT_WEIGHT_MAP)
        # تعريف حقيقي بديل: وزن قطعة وزني > 1 (وليس الـ placeholder المقفل =1)
        has_real_piece_weight = pwu_is_weight and pw > 1
        if has_valid_def or has_real_piece_weight:
            continue
        total_grams = await _compute_recipe_total_grams(db, p.get("recipe") or [])
        if total_grams <= 0:
            continue  # لا وصفة وزنية قابلة للحساب → التعريف لا يؤثر
        suggested_value = pw if (pwu_is_weight and pw > 0 and pw != 1) else 0
        missing.append({
            "id": p.get("id"),
            "name": p.get("name"),
            "unit": main_unit,
            "piece_weight": pw,
            "piece_weight_unit": pwu,
            "total_recipe_grams": round(total_grams, 2),
            "current_piece_def_value": pdv,
            "current_piece_def_unit": pdu,
            "suggested_value": suggested_value,
            "suggested_unit": pwu if pwu_is_weight else "غرام",
        })
    missing.sort(key=lambda x: x.get("name") or "")
    return {"count": len(missing), "items": missing}


@router.post("/manufactured-products/fix-piece-definitions")
async def fix_piece_definitions(
    payload: PieceDefFixPayload,
    current_user: dict = Depends(get_current_user),
):
    """تحديث جماعي لـ piece_def_value / piece_def_unit لمجموعة منتجات مُصنّعة.
    يتحقّق من ملكية المستأجر، ويتجاهل القيم غير الصالحة (قيمة <= 0 أو وحدة غير وزنية)."""
    db = get_db()
    tenant_id = current_user.get("tenant_id")
    updated = 0
    skipped = []
    now_iso = datetime.now(timezone.utc).isoformat()
    for item in payload.items:
        if item.piece_def_value <= 0 or item.piece_def_unit not in _UNIT_WEIGHT_MAP:
            skipped.append({"id": item.id, "reason": "قيمة أو وحدة غير صالحة"})
            continue
        q: Dict[str, Any] = {"id": item.id}
        if tenant_id:
            q["tenant_id"] = tenant_id
        res = await db.manufactured_products.update_one(
            q,
            {"$set": {
                "piece_def_value": float(item.piece_def_value),
                "piece_def_unit": item.piece_def_unit,
                "updated_at": now_iso,
            }},
        )
        if res.matched_count:
            updated += 1
        else:
            skipped.append({"id": item.id, "reason": "غير موجود أو لا يخص هذا المستأجر"})
    return {"success": True, "updated": updated, "skipped": skipped}



# ⭐ مزامنة شاملة: ربط المكونات اليتيمة (orphan) بأسمائها تلقائياً
# ⚠️ يجب التسجيل قبل `/manufactured-products/{product_id}` لتجنب تصادم المسار
@router.post("/manufactured-products/sync-orphan-ingredients")
async def sync_orphan_ingredients(
    dry_run: bool = False,
    current_user: dict = Depends(get_current_user),
):
    """فحص جميع المنتجات المُصنّعة وربط المكونات بدون معرّفات (raw_material_id / manufactured_product_id)
    بأسمائها تلقائياً.

    - يبحث أولاً في `raw_materials`، ثم في `manufactured_products`.
    - `dry_run=true` يُرجع تقريراً بدون تطبيق أي تعديل.
    - يُرجع: عدد المنتجات المفحوصة، اليتامى الموجودون، الذين تم ربطهم، غير المتطابقين.
    """
    db = get_db()
    tenant_id = current_user.get("tenant_id")

    query = {}
    if tenant_id:
        query["tenant_id"] = tenant_id

    products = await db.manufactured_products.find(query, {"_id": 0}).to_list(2000)

    scanned = len(products)
    orphans_total = 0
    linked = 0
    unmatched = []
    products_updated = 0
    products_touched = []

    for prod in products:
        recipe = prod.get("recipe") or []
        changed = False
        prod_linked = []
        prod_unmatched = []
        for ing in recipe:
            if ing.get("raw_material_id") or ing.get("manufactured_product_id"):
                continue
            orphans_total += 1
            before_raw = ing.get("raw_material_id")
            before_mfg = ing.get("manufactured_product_id")
            await _resolve_ingredient_ids(db, ing, tenant_id)
            if ing.get("raw_material_id") != before_raw or ing.get("manufactured_product_id") != before_mfg:
                linked += 1
                changed = True
                prod_linked.append({
                    "name": ing.get("raw_material_name"),
                    "raw_material_id": ing.get("raw_material_id"),
                    "manufactured_product_id": ing.get("manufactured_product_id"),
                    "source": ing.get("source"),
                })
            else:
                prod_unmatched.append(ing.get("raw_material_name"))
                unmatched.append({
                    "product_id": prod.get("id"),
                    "product_name": prod.get("name"),
                    "ingredient_name": ing.get("raw_material_name"),
                })
        if changed:
            products_updated += 1
            products_touched.append({
                "id": prod.get("id"),
                "name": prod.get("name"),
                "linked": prod_linked,
                "unmatched": prod_unmatched,
            })
            if not dry_run:
                await db.manufactured_products.update_one(
                    {"id": prod.get("id")},
                    {"$set": {
                        "recipe": recipe,
                        "last_updated": datetime.now(timezone.utc).isoformat(),
                    }},
                )

    # سجل تدقيق
    if not dry_run and products_updated:
        try:
            await db.audit_logs.insert_one({
                "id": str(uuid.uuid4()),
                "action": "sync_orphan_ingredients",
                "entity_type": "manufactured_product",
                "user_id": current_user.get("id"),
                "user_email": current_user.get("email"),
                "tenant_id": tenant_id,
                "details": {
                    "scanned": scanned,
                    "orphans_total": orphans_total,
                    "linked": linked,
                    "products_updated": products_updated,
                },
                "created_at": datetime.now(timezone.utc).isoformat(),
            })
        except Exception:
            pass

    # ─── 🔧 المرحلة الثانية: مزامنة manufacturing_inventory مع raw_materials ───
    # ربط السجلات بدون أسماء + مزامنة الوحدات والأسماء والتكاليف من المادة الخام الأصلية
    # ملاحظة: لا نُصفّي بـ tenant_id لأن `manufacturing_inventory` تاريخياً ليست مفصولة بالـ tenant
    mi_items = await db.manufacturing_inventory.find({}, {"_id": 0}).to_list(5000)
    mi_synced = 0
    mi_orphans = []
    for mi in mi_items:
        linked_id = mi.get("material_id") or mi.get("raw_material_id")
        if not linked_id:
            # حاول الربط بالاسم (مادة خام)
            nm = (mi.get("material_name") or mi.get("raw_material_name") or "").strip()
            if nm:
                import re as _re
                rm = await db.raw_materials.find_one({"name": {"$regex": f"^{_re.escape(nm)}\\s*$", "$options": "i"}}, {"_id": 0})
                if rm:
                    linked_id = rm.get("id")
        if not linked_id:
            mi_orphans.append({"id": mi.get("id"), "name": mi.get("material_name") or mi.get("raw_material_name")})
            continue
        rm = await db.raw_materials.find_one({"id": linked_id}, {"_id": 0})
        if not rm:
            continue
        # افحص الفروقات وحدّث ما يلزم
        changes: Dict[str, Any] = {}
        if mi.get("unit") != rm.get("unit") and rm.get("unit"):
            changes["unit"] = rm.get("unit")
        # أعد الاسم لكلا الحقلين للحفاظ على التوافق
        if rm.get("name"):
            if mi.get("material_name") != rm.get("name"):
                changes["material_name"] = rm.get("name")
            if mi.get("raw_material_name") != rm.get("name"):
                changes["raw_material_name"] = rm.get("name")
        # احفظ معرّف الربط للتوحيد
        if not mi.get("material_id"):
            changes["material_id"] = linked_id
        if not mi.get("raw_material_id"):
            changes["raw_material_id"] = linked_id
        # تكلفة الوحدة
        if rm.get("cost_per_unit") is not None and mi.get("cost_per_unit") != rm.get("cost_per_unit"):
            # نُحدّث فقط إذا الوحدتان متطابقتان (لتجنّب فقدان المعنى عند تغيير وحدات)
            if (changes.get("unit") or mi.get("unit")) == rm.get("unit"):
                changes["cost_per_unit"] = rm.get("cost_per_unit")
        if changes:
            changes["last_updated"] = datetime.now(timezone.utc).isoformat()
            if not dry_run:
                await db.manufacturing_inventory.update_one({"id": mi.get("id")}, {"$set": changes})
            mi_synced += 1

    return {
        "success": True,
        "dry_run": dry_run,
        "scanned": scanned,
        "orphans_total": orphans_total,
        "linked": linked,
        "unmatched_count": len(unmatched),
        "products_updated": products_updated,
        "products": products_touched,
        "unmatched": unmatched[:50],
        # ⭐ تقرير مزامنة قسم التصنيع
        "mfg_inventory_scanned": len(mi_items),
        "mfg_inventory_synced": mi_synced,
        "mfg_inventory_orphans": mi_orphans[:20],
    }


@router.get("/manufactured-products/{product_id}")
async def get_manufactured_product(product_id: str):
    """جلب منتج مصنع محدد"""
    db = get_db()
    product = await db.manufactured_products.find_one({"id": product_id}, {"_id": 0})
    if not product:
        raise HTTPException(status_code=404, detail="المنتج غير موجود")
    # ⭐ المتبقي = إجمالي المُصنّع - المحول - المستهلَك كمكوّن في تصنيع منتجات أخرى
    total = product.get("total_produced", 0) or 0
    transferred = product.get("transferred_quantity", 0) or 0
    consumed_map = await _consumed_as_ingredient_map(db, product_id)
    consumed = _consumed_in_product_unit(consumed_map, product_id, product.get("unit"))
    remaining = max(total - transferred - consumed, 0.0)
    product["consumed_as_ingredient"] = round(consumed, 6)
    product["remaining_quantity"] = round(remaining, 6)
    product["quantity"] = round(remaining, 6)
    _backfill_cost_fields(product)
    await _enrich_unit_cost_fields(db, product)
    return product


# ⭐ تعديل وصفة منتج مصنّع موجود (إضافة/حذف/تعديل مكونات + إعادة احتساب التكلفة)
class ManufacturedProductRecipeUpdate(BaseModel):
    recipe: List[RecipeIngredient]
    piece_weight: Optional[float] = None
    piece_weight_unit: Optional[str] = None
    piece_def_value: Optional[float] = None  # ⭐ تعريف البورشن: قيمة الوزن الحقيقي للوحدة العدّية
    piece_def_unit: Optional[str] = None     # ⭐ وحدة التعريف الحقيقية (غرام/كغم/مل/لتر)
    actual_recipe_yield: Optional[float] = None  # ⭐ كمية إنتاج الوصفة الفعلية (تمدّد/انكماش الطبخ)
    reason: Optional[str] = None  # سبب التعديل (للتدقيق)
    name: Optional[str] = None  # ⭐ تعديل اسم الوصفة
    name_en: Optional[str] = None

    @model_validator(mode="before")
    @classmethod
    def _coerce_empty_to_none(cls, data):
        """⭐ تطبيع: قيم نصية فارغة → None لتجنّب أخطاء float_parsing."""
        if not isinstance(data, dict):
            return data
        for key in ("piece_weight", "piece_weight_unit", "piece_def_value",
                    "piece_def_unit", "actual_recipe_yield", "reason", "name", "name_en"):
            v = data.get(key)
            if isinstance(v, str) and v.strip() == "":
                data[key] = None
        return data


@router.patch("/manufactured-products/{product_id}/recipe")
async def update_manufactured_product_recipe(
    product_id: str,
    payload: ManufacturedProductRecipeUpdate,
    current_user: dict = Depends(get_current_user),
):
    """تعديل وصفة منتج مصنّع موجود — يعيد احتساب التكلفة قبل/بعد الهدر وهامش الربح."""
    db = get_db()
    product = await db.manufactured_products.find_one({"id": product_id})
    if not product:
        raise HTTPException(status_code=404, detail="المنتج غير موجود")

    if not payload.recipe or len(payload.recipe) == 0:
        raise HTTPException(status_code=400, detail="الوصفة لا يمكن أن تكون فارغة")

    # احتساب التكلفة الجديدة
    raw_material_cost = 0.0
    raw_material_cost_after_waste = 0.0
    recipe_items = []
    tenant_id = current_user.get("tenant_id")
    for ingredient in payload.recipe:
        # 🧹 تنظيف floating-point noise: قرّب لـ 6 خانات عشرية
        qty = round(float(ingredient.quantity), 6)
        cpu = round(float(ingredient.cost_per_unit), 6)
        base_cost = qty * cpu
        raw_material_cost += base_cost
        waste_pct = ingredient.waste_percentage or 0
        if 0 < waste_pct < 100:
            effective_cpu = cpu / (1 - waste_pct / 100)
        else:
            effective_cpu = cpu
        raw_material_cost_after_waste += qty * effective_cpu
        item = ingredient.model_dump()
        item["quantity"] = qty
        item["cost_per_unit"] = cpu
        # 🔧 الربط التلقائي للمكوّن بالاسم إن لزم
        item = await _resolve_ingredient_ids(db, item, tenant_id)
        recipe_items.append(item)

    new_production_cost = round(raw_material_cost_after_waste, 2)
    selling_price = product.get("selling_price", 0) or 0
    new_profit_margin = round(selling_price - new_production_cost, 2) if selling_price > 0 else 0

    update_fields = {
        "recipe": recipe_items,
        "raw_material_cost": round(raw_material_cost, 2),
        "raw_material_cost_after_waste": round(raw_material_cost_after_waste, 2),
        "cost_before_waste": round(raw_material_cost, 2),
        "production_cost": new_production_cost,
        "profit_margin": new_profit_margin,
        "last_updated": datetime.now(timezone.utc).isoformat(),
    }
    if payload.piece_weight is not None:
        update_fields["piece_weight"] = payload.piece_weight
    # ⭐ تعريف البورشن للوحدات العدّية (يُستخدم في حساب العائد والتكلفة)
    # نُحدّثه فقط عند إرساله صراحةً في الطلب (مثل نافذة تعديل الوصفة)،
    # حتى لا تمسحه عمليات أخرى لا ترسله (مثل المزامنة) → نحافظ على التعريف.
    _fields_set = getattr(payload, "model_fields_set", set())
    if "piece_def_value" in _fields_set:
        update_fields["piece_def_value"] = payload.piece_def_value
    # ⭐ كمية إنتاج الوصفة الفعلية — نُحدّثها فقط عند إرسالها صراحةً (للحفاظ عليها
    # عند عمليات أخرى لا ترسلها مثل المزامنة).
    if "actual_recipe_yield" in _fields_set:
        update_fields["actual_recipe_yield"] = payload.actual_recipe_yield
    if "piece_def_unit" in _fields_set:
        update_fields["piece_def_unit"] = payload.piece_def_unit
    if payload.piece_weight_unit is not None:
        update_fields["piece_weight_unit"] = payload.piece_weight_unit
        # ⭐ مزامنة جميع الإعدادات: عند تغيير وحدة الوزن، نُحدّث product.unit أيضاً
        # ونحوّل القيم العددية (الكمية/الإنتاج/المحول) لضمان تطابق العرض في كل البطاقات.
        old_unit = (product.get("unit") or "").strip()
        new_pwu = payload.piece_weight_unit.strip()
        _FAMILY = {
            "weight": {"غرام": 1, "كغم": 1000, "كيلو": 1000, "كجم": 1000, "gram": 1, "kg": 1000},
            "volume": {"مل": 1, "لتر": 1000, "ml": 1, "liter": 1000, "l": 1000},
        }
        _COUNT_UNITS = {"قطعة", "حبة", "علبة", "كرتون", "صحن", "piece"}

        def _fam(u: str):
            for k, vals in _FAMILY.items():
                if u in vals:
                    return k, vals[u]
            if u in _COUNT_UNITS:
                return "count", 1.0
            return None, None

        old_fam, old_factor = _fam(old_unit)
        new_fam, new_factor = _fam(new_pwu)
        ratio = None
        if old_fam and new_fam and old_unit != new_pwu:
            if old_fam == new_fam and old_fam in ("weight", "volume"):
                # نفس العائلة (مل↔لتر، غرام↔كغم): تحويل خطي بالنسبة بين الوحدتين
                ratio = old_factor / new_factor
            elif old_fam == "count" and new_fam in ("weight", "volume"):
                # 🔧 قطعة → لتر/كغم: استخدم piece_weight (وزن القطعة الواحدة) كمعامل التحويل
                # نُفضّل piece_weight الجديد (المُرسَل)، وإلا القديم المخزّن
                pw_new = payload.piece_weight if payload.piece_weight is not None else product.get("piece_weight")
                if isinstance(pw_new, (int, float)) and pw_new > 0:
                    ratio = float(pw_new)  # 1 قطعة = pw_new وحدة جديدة
            elif old_fam in ("weight", "volume") and new_fam == "count":
                # حالة عكسية نادرة (لتر → قطعة)
                pw_new = payload.piece_weight if payload.piece_weight is not None else product.get("piece_weight")
                if isinstance(pw_new, (int, float)) and pw_new > 0:
                    ratio = 1.0 / float(pw_new)
        if ratio is not None:
            update_fields["unit"] = new_pwu
            for fld in ("quantity", "total_produced", "transferred_quantity", "remaining_quantity"):
                val = product.get(fld)
                if isinstance(val, (int, float)) and val:
                    update_fields[fld] = round(val * ratio, 6)
    # ⭐ تعديل الاسم إن أُرسل
    if payload.name is not None and payload.name.strip():
        update_fields["name"] = payload.name.strip()
    if payload.name_en is not None:
        update_fields["name_en"] = payload.name_en.strip()

    await db.manufactured_products.update_one(
        {"id": product_id},
        {"$set": update_fields},
    )

    # سجل تدقيق
    try:
        old_cost = product.get("production_cost") or product.get("raw_material_cost_after_waste") or 0
        await db.audit_logs.insert_one({
            "id": str(uuid.uuid4()),
            "action": "manufactured_product_recipe_update",
            "entity_type": "manufactured_product",
            "entity_id": product_id,
            "entity_name": product.get("name"),
            "user_id": current_user.get("id"),
            "user_email": current_user.get("email"),
            "tenant_id": current_user.get("tenant_id"),
            "details": {
                "reason": payload.reason or "",
                "old_recipe_count": len(product.get("recipe", []) or []),
                "new_recipe_count": len(recipe_items),
                "old_production_cost": old_cost,
                "new_production_cost": new_production_cost,
            },
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
    except Exception:
        pass

    updated = await db.manufactured_products.find_one({"id": product_id}, {"_id": 0})
    return {
        "success": True,
        "message": "تم تحديث الوصفة بنجاح",
        "product": updated,
    }


@router.post("/manufactured-products/{product_id}/produce")
async def produce_product(
    product_id: str,
    quantity: float = 1,
    actual_yield: Optional[float] = None,
    current_user: dict = Depends(get_current_user),
):
    """تصنيع كمية من المنتج (خصم المواد الخام من مخزون التصنيع)

    🔧 نمط الدفعة (Batch Mode):
    إذا كان `piece_weight` مُحدداً والوصفة تحتوي على مواد وزنية (غرام/كغم) يمكن
    احتساب عدد القطع الناتجة (calculated_yield = total_grams / piece_grams).
    عندها تُعتبر الوصفة "دفعة كاملة" تُنتج `calculated_yield` قطعة.
    عند طلب `quantity` قطعة: نُحجّم كميات المكونات بالنسبة `quantity / calculated_yield`
    ونحفظ الوصفة المُحدَّثة (يطلب المستخدم ذلك صراحةً) ثم نستهلك المواد مرة واحدة.

    في حال عدم وجود piece_weight، يعمل النظام بالنمط القديم (PER UNIT) ويُضرب
    كل مكوّن في `quantity`.

    📊 Yield Variance Tracking:
    إن مُرّر `actual_yield`، يُسجَّل في collection `yield_variances` الفرق بين
    `quantity` (المتوقَّع) و `actual_yield` (الفعلي) لتعقّب الهدر الخفي.
    تُضاف `actual_yield` إلى المخزون بدلاً من `quantity` (إذا اختلفا).
    """
    db = get_db()

    product = await db.manufactured_products.find_one({"id": product_id})
    if not product:
        raise HTTPException(status_code=404, detail="المنتج غير موجود")

    # ───── احتساب العائد من الوصفة (مع دعم pack_info للعلب/الكراتين) ─────
    total_grams = await _compute_recipe_total_grams(db, product.get("recipe") or [])
    # ⭐ العائد يحترم تعريف البورشن (piece_def_value) + الوحدة الرئيسية الوزنية
    calculated_yield = _resolve_recipe_yield(product, total_grams)
    # ⭐ احتياط عدّ←عدّ: للمنتجات الحصصية بوحدة فرعية عدّية (شريحة) ومكوّنات قطعية
    # (1 قطعة = 46 شريحة) يكون total_grams = 0 فيعجز الحساب الوزني. نحسب العائد العدّي
    # حتى لا يسقط النظام في النمط per-unit الذي يستهلك المواد بكميات خاطئة.
    if calculated_yield <= 0:
        calculated_yield = await _compute_recipe_count_yield(db, product)

    is_batch_mode = calculated_yield > 0
    now_iso = datetime.now(timezone.utc).isoformat()
    tenant_id = current_user.get("tenant_id") if current_user else None
    performed_by_name = (current_user or {}).get("full_name") or (current_user or {}).get("username")

    # ───── إذا batch mode: حجّم الوصفة لتُطابق quantity المطلوبة ─────
    recipe_scaled = False
    scale_factor = 1.0
    if is_batch_mode:
        scale_factor = float(quantity) / calculated_yield
        if abs(scale_factor - 1.0) > 1e-6:
            new_recipe = []
            for ing in (product.get("recipe") or []):
                ni = dict(ing)
                ni["quantity"] = round((ing.get("quantity") or 0) * scale_factor, 6)
                new_recipe.append(ni)
            # إعادة احتساب التكلفة
            rm_cost = 0.0
            rm_cost_aw = 0.0
            for i in new_recipe:
                q = i.get("quantity", 0) or 0
                cpu = i.get("cost_per_unit", 0) or 0
                wp = i.get("waste_percentage", 0) or 0
                rm_cost += q * cpu
                eff = cpu / (1 - wp / 100) if 0 < wp < 100 else cpu
                rm_cost_aw += q * eff
            sp = product.get("selling_price", 0) or 0
            new_pcost = round(rm_cost_aw, 2)
            new_pmargin = round(sp - new_pcost, 2) if sp > 0 else 0
            _scaled_set = {
                "recipe": new_recipe,
                "raw_material_cost": round(rm_cost, 2),
                "raw_material_cost_after_waste": round(rm_cost_aw, 2),
                "cost_before_waste": round(rm_cost, 2),
                "production_cost": new_pcost,
                "profit_margin": new_pmargin,
                "last_updated": now_iso,
            }
            # ⭐ حرج: إذا كانت كمية الإنتاج الفعلية مثبّتة يدوياً، حجّمها بنفس المعامل
            # حتى لا تبقى قديمة (مثل 7) بينما تُمثّل الوصفة المُحجّمة دفعة أكبر (مثل 30).
            # وإلا تُقسَّم الكلفة على 7 بدل 30 فيظهر سعر الكيلو مضخّماً.
            _old_ary = float(product.get("actual_recipe_yield") or 0)
            if _old_ary > 0:
                _scaled_set["actual_recipe_yield"] = round(_old_ary * scale_factor, 6)
            await db.manufactured_products.update_one(
                {"id": product_id},
                {"$set": _scaled_set}
            )
            product = await db.manufactured_products.find_one({"id": product_id})
            recipe_scaled = True
            # سجل تدقيق لإعادة الحجم
            try:
                await db.audit_logs.insert_one({
                    "id": str(uuid.uuid4()),
                    "action": "recipe_auto_scaled_on_produce",
                    "entity_type": "manufactured_product",
                    "entity_id": product_id,
                    "entity_name": product.get("name"),
                    "user_id": current_user.get("id"),
                    "user_email": current_user.get("email"),
                    "tenant_id": tenant_id,
                    "details": {
                        "requested_quantity": quantity,
                        "calculated_yield_before": round(calculated_yield, 3),
                        "scale_factor": round(scale_factor, 6),
                    },
                    "created_at": now_iso,
                })
            except Exception:
                pass

    # في batch mode الوصفة تُمثّل الدفعة الكاملة → استهلاك مرّة واحدة (multiplier=1)
    # في legacy mode الوصفة per-unit → استهلاك × quantity
    multiplier = 1 if is_batch_mode else quantity

    # ───── التحقق من توفر المواد ─────
    insufficient = []
    for ingredient in product.get("recipe", []):
        needed = (ingredient.get("quantity", 0) or 0) * multiplier
        # ⭐ مكوّن من نوع منتج مُصنّع
        if ingredient.get("manufactured_product_id"):
            mfg = await db.manufactured_products.find_one({"id": ingredient["manufactured_product_id"]})
            available = mfg.get("quantity", 0) if mfg else 0
            if available < needed:
                insufficient.append({
                    "name": ingredient.get("raw_material_name") or (mfg.get("name") if mfg else "منتج مُصنّع"),
                    "needed": round(needed, 3),
                    "available": round(available, 3),
                    "unit": ingredient.get("unit"),
                    "source": "manufactured",
                })
            continue
        # مكوّن من نوع مادة خام (السلوك الأصلي)
        # ⭐ مطابقة قوية: السجلات القديمة قد تحمل raw_material_id أو material_id فقط
        rm_id = ingredient.get("raw_material_id")
        manufacturing_item = await db.manufacturing_inventory.find_one({
            "$or": [{"raw_material_id": rm_id}, {"material_id": rm_id}]
        })

        available = manufacturing_item.get("quantity", 0) if manufacturing_item else 0

        if available < needed:
            insufficient.append({
                "name": ingredient.get("raw_material_name"),
                "needed": round(needed, 3),
                "available": round(available, 3),
                "unit": ingredient.get("unit")
            })

    if insufficient:
        raise HTTPException(
            status_code=400,
            detail={
                "message": "مواد غير كافية لإنتاج هذا المنتج",
                "insufficient_materials": insufficient
            }
        )

    # حساب تكلفة هذه الدفعة من الإنتاج (قبل/بعد الهدر)
    batch_cost_before_waste = 0.0
    batch_cost_after_waste = 0.0
    consumed_details = []

    # خصم المكونات (مواد خام أو منتجات مُصنّعة) + تسجيل حركة استهلاك
    for ingredient in product.get("recipe", []):
        needed = (ingredient.get("quantity", 0) or 0) * multiplier
        base_cost = ingredient.get("cost_per_unit", 0) or 0
        waste_pct = ingredient.get("waste_percentage", 0) or 0
        effective_cost = (base_cost / (1 - waste_pct / 100)) if (0 < waste_pct < 100) else base_cost
        line_before = needed * base_cost
        line_after = needed * effective_cost
        batch_cost_before_waste += line_before
        batch_cost_after_waste += line_after

        # ⭐ خصم من المنتجات المُصنّعة
        if ingredient.get("manufactured_product_id"):
            await db.manufactured_products.update_one(
                {"id": ingredient["manufactured_product_id"]},
                {"$inc": {"quantity": -needed}, "$set": {"last_updated": now_iso}}
            )
            consumed_details.append({
                "manufactured_product_id": ingredient["manufactured_product_id"],
                "name": ingredient.get("raw_material_name"),
                "quantity": round(needed, 6),
                "unit": ingredient.get("unit"),
                "cost_per_unit": base_cost,
                "waste_percentage": waste_pct,
                "cost_before_waste": round(line_before, 2),
                "cost_after_waste": round(line_after, 2),
                "source": "manufactured",
            })
            # سجل حركة استهلاك منتج مُصنّع
            await db.inventory_movements.insert_one({
                "id": str(uuid.uuid4()),
                "tenant_id": tenant_id,
                "type": "manufactured_consumption",
                "category": "manufacturing",
                "product_id": ingredient["manufactured_product_id"],
                "product_name": ingredient.get("raw_material_name"),
                "quantity": -needed,
                "unit": ingredient.get("unit"),
                "reason": f"إنتاج {product.get('name')} ({quantity} {product.get('unit', 'حبة')})",
                "user_id": current_user.get("id"),
                "user_email": current_user.get("email"),
                "created_at": now_iso,
            })
            continue

        # خصم من المواد الخام (السلوك الأصلي)
        consumed_details.append({
            "raw_material_id": ingredient.get("raw_material_id"),
            "raw_material_name": ingredient.get("raw_material_name"),
            "quantity": round(needed, 6),
            "unit": ingredient.get("unit"),
            "cost_per_unit": base_cost,
            "waste_percentage": waste_pct,
            "cost_before_waste": round(line_before, 2),
            "cost_after_waste": round(line_after, 2),
        })

        await db.manufacturing_inventory.update_one(
            {"$or": [
                {"raw_material_id": ingredient.get("raw_material_id")},
                {"material_id": ingredient.get("raw_material_id")}
            ]},
            {
                "$inc": {"quantity": -needed},
                "$set": {"last_updated": now_iso}
            }
        )
        # حركة استهلاك مادة خام لإنتاج منتج
        await db.inventory_movements.insert_one({
            "id": str(uuid.uuid4()),
            "tenant_id": tenant_id,
            "type": "manufacturing_consumption",
            "category": "manufacturing",
            "material_id": ingredient.get("raw_material_id"),
            "material_name": ingredient.get("raw_material_name"),
            "quantity": round(needed, 6),
            "unit": ingredient.get("unit"),
            "cost_per_unit": base_cost,
            "waste_percentage": waste_pct,
            "total_value": round(line_after, 2),
            "cost_before_waste": round(line_before, 2),
            "cost_after_waste": round(line_after, 2),
            "product_id": product_id,
            "product_name": product.get("name"),
            "batch_quantity": quantity,
            "performed_by_name": performed_by_name,
            "notes": f"استُهلكت لإنتاج {quantity} {product.get('unit')} من {product.get('name')}",
            "created_at": now_iso,
        })
    
    # 📊 Yield Variance: العدد الفعلي المُنتَج (إن لم يُمرَّر، يُعتبر مساوياً للمطلوب)
    effective_yield = float(actual_yield) if (actual_yield is not None and actual_yield >= 0) else float(quantity)
    yield_variance = effective_yield - float(quantity)
    yield_variance_pct = (yield_variance / float(quantity) * 100.0) if quantity > 0 else 0.0

    # ⭐⭐ متوسط التكلفة المرجّح (WAC): عند تصنيع دفعة جديدة بسعر مختلف عن المخزون الحالي،
    # يُعاد حساب سعر الوحدة ليصبح متوسطاً مرجّحاً:
    #   سعر الوحدة الجديد = (سعر الوحدة القديم × المتبقي القديم + كلفة الدفعة) ÷ الكمية الكلية
    # مثال: 100 وحدة @ 10 + 50 وحدة @ (800÷50=16) → 150 وحدة @ 12.
    _cmap = await _consumed_as_ingredient_map(db, product_id)
    prev_remaining = (
        (product.get("total_produced", 0) or 0)
        - (product.get("transferred_quantity", 0) or 0)
        - _consumed_in_product_unit(_cmap, product_id, product.get("unit"))
    )
    if prev_remaining < 0:
        prev_remaining = 0.0
    # سعر الوحدة القديم: المرجّح المخزّن إن وُجد، وإلا المحسوب من الوصفة الحالية
    _prev_enriched = await _enrich_unit_cost_fields(db, dict(product))
    prev_wac_after = float(product.get("wac_unit_after") or _prev_enriched.get("unit_cost_after_waste") or 0)
    prev_wac_before = float(product.get("wac_unit_before") or _prev_enriched.get("unit_cost_before_waste") or 0)
    new_total_qty = prev_remaining + effective_yield
    if new_total_qty > 0:
        new_wac_after = (prev_wac_after * prev_remaining + batch_cost_after_waste) / new_total_qty
        new_wac_before = (prev_wac_before * prev_remaining + batch_cost_before_waste) / new_total_qty
    else:
        new_wac_after = (batch_cost_after_waste / effective_yield) if effective_yield > 0 else 0.0
        new_wac_before = (batch_cost_before_waste / effective_yield) if effective_yield > 0 else 0.0

    # زيادة كمية المنتج المصنع وإجمالي الإنتاج (باستخدام العدد الفعلي)
    await db.manufactured_products.update_one(
        {"id": product_id},
        {
            "$inc": {
                "quantity": effective_yield,
                "total_produced": effective_yield
            },
            # ⭐ عائد آخر دفعة = الكمية المُنتجة فعلياً في هذا التصنيع. يُستخدم كمقام دقيق
            # لتكلفة الوحدة (الكلفة المخزّنة تخص هذه الدفعة) — يمنع القسمة على عائد قديم.
            "$set": {
                "last_batch_yield": effective_yield,
                "last_updated": now_iso,
                "wac_unit_after": round(new_wac_after, 6),
                "wac_unit_before": round(new_wac_before, 6),
            }
        }
    )
    
    # حركة إنتاج منتج مصنع (دخول للمنتجات المصنعة)
    await db.inventory_movements.insert_one({
        "id": str(uuid.uuid4()),
        "tenant_id": tenant_id,
        "type": "product_manufactured",
        "category": "manufacturing",
        "product_id": product_id,
        "product_name": product.get("name"),
        "material_name": product.get("name"),
        "quantity": effective_yield,
        "unit": product.get("unit"),
        "total_value": round(batch_cost_after_waste, 2),
        "cost_before_waste": round(batch_cost_before_waste, 2),
        "cost_after_waste": round(batch_cost_after_waste, 2),
        # ⭐ لقطة تكلفة الدفعة + المتوسط المرجّح (WAC) وقت الإنتاج — لسجل الدفعات
        "batch_unit_cost_after": round((batch_cost_after_waste / effective_yield) if effective_yield > 0 else 0.0, 6),
        "batch_unit_cost_before": round((batch_cost_before_waste / effective_yield) if effective_yield > 0 else 0.0, 6),
        "wac_unit_after": round(new_wac_after, 6),
        "wac_unit_before": round(new_wac_before, 6),
        "consumed_ingredients": consumed_details,
        "performed_by_name": performed_by_name,
        "notes": f"تصنيع {effective_yield} {product.get('unit')} من {product.get('name')}"
                 + (f" (المتوقّع: {quantity}، فرق: {yield_variance:+.3f})" if abs(yield_variance) > 1e-6 else ""),
        "created_at": now_iso,
    })

    # 📊 سجل فرق العائد (Yield Variance) — يُحفظ دائماً عند تمرير actual_yield (حتى لو كان الفرق صفر)
    variance_record = None
    if actual_yield is not None:
        cost_per_unit_after = (batch_cost_after_waste / effective_yield) if effective_yield > 0 else 0.0
        variance_value = round(yield_variance * cost_per_unit_after, 2)  # القيمة المالية للفرق
        variance_record = {
            "id": str(uuid.uuid4()),
            "tenant_id": tenant_id,
            "product_id": product_id,
            "product_name": product.get("name"),
            "unit": product.get("unit"),
            "expected_yield": float(quantity),
            "actual_yield": effective_yield,
            "variance": round(yield_variance, 6),
            "variance_pct": round(yield_variance_pct, 3),
            "variance_value": variance_value,
            "batch_cost_before_waste": round(batch_cost_before_waste, 2),
            "batch_cost_after_waste": round(batch_cost_after_waste, 2),
            "cost_per_unit_after": round(cost_per_unit_after, 4),
            "performed_by_id": current_user.get("id"),
            "performed_by_name": performed_by_name,
            "created_at": now_iso,
        }
        await db.yield_variances.insert_one(dict(variance_record))
        variance_record.pop("_id", None)

    return {
        "message": f"تم تصنيع {effective_yield} {product.get('unit')} من {product.get('name')}",
        "new_quantity": product.get("quantity", 0) + effective_yield,
        "cost_before_waste": round(batch_cost_before_waste, 2),
        "cost_after_waste": round(batch_cost_after_waste, 2),
        "recipe_scaled": recipe_scaled,
        "scale_factor": round(scale_factor, 6) if recipe_scaled else 1.0,
        "calculated_yield_before": round(calculated_yield, 3) if is_batch_mode else None,
        "batch_mode": is_batch_mode,
        "expected_yield": float(quantity),
        "actual_yield": effective_yield,
        "yield_variance": round(yield_variance, 6),
        "yield_variance_pct": round(yield_variance_pct, 3),
        "yield_variance_record": variance_record,
    }


# ============================================================================
# 📦 سجل دفعات الإنتاج — تاريخ كل دفعة (الكمية، تكلفة الوحدة، WAC)
# ============================================================================

@router.get("/manufactured-products/{product_id}/batches")
async def get_product_batches(
    product_id: str,
    limit: int = 100,
    current_user: dict = Depends(get_current_user),
):
    """يُرجع سجل دفعات الإنتاج لمنتج مُصنّع (من حركات المخزون من نوع product_manufactured).

    لكل دفعة: التاريخ، الكمية، إجمالي تكلفة الدفعة، تكلفة الوحدة (لتلك الدفعة)،
    والمتوسط المرجّح للتكلفة (WAC) وقت الإنتاج إن توفّر.
    """
    db = get_db()
    tenant_id = current_user.get("tenant_id") if current_user else None

    query: Dict[str, Any] = {"type": "product_manufactured", "product_id": product_id}
    if tenant_id:
        query["tenant_id"] = tenant_id

    rows = await db.inventory_movements.find(query, {"_id": 0}).sort("created_at", -1).to_list(limit)

    batches = []
    for r in rows:
        qty = float(r.get("quantity") or 0)
        total_after = float(r.get("cost_after_waste") or r.get("total_value") or 0)
        total_before = float(r.get("cost_before_waste") or 0)
        # تكلفة الوحدة لهذه الدفعة: المخزّنة إن وُجدت، وإلا تُحسب من الإجمالي/الكمية
        unit_after = r.get("batch_unit_cost_after")
        if unit_after is None:
            unit_after = (total_after / qty) if qty > 0 else 0.0
        unit_before = r.get("batch_unit_cost_before")
        if unit_before is None:
            unit_before = (total_before / qty) if qty > 0 else 0.0
        batches.append({
            "id": r.get("id"),
            "created_at": r.get("created_at"),
            "quantity": round(qty, 3),
            "unit": r.get("unit"),
            "total_cost_after": round(total_after, 2),
            "total_cost_before": round(total_before, 2),
            "unit_cost_after": round(float(unit_after), 4),
            "unit_cost_before": round(float(unit_before), 4),
            "wac_unit_after": (round(float(r["wac_unit_after"]), 4) if r.get("wac_unit_after") is not None else None),
            "wac_unit_before": (round(float(r["wac_unit_before"]), 4) if r.get("wac_unit_before") is not None else None),
            "performed_by_name": r.get("performed_by_name"),
            "notes": r.get("notes"),
        })

    # الحالة الحالية للمنتج (WAC المخزّن + إجمالي المُنتَج)
    product = await db.manufactured_products.find_one(
        {"id": product_id}, {"_id": 0, "name": 1, "unit": 1, "wac_unit_after": 1, "wac_unit_before": 1, "total_produced": 1}
    ) or {}

    total_qty = round(sum(b["quantity"] for b in batches), 3)
    total_value = round(sum(b["total_cost_after"] for b in batches), 2)

    return {
        "product_id": product_id,
        "product_name": product.get("name"),
        "unit": product.get("unit"),
        "current_wac_after": (round(float(product["wac_unit_after"]), 4) if product.get("wac_unit_after") is not None else None),
        "current_wac_before": (round(float(product["wac_unit_before"]), 4) if product.get("wac_unit_before") is not None else None),
        "batches": batches,
        "summary": {
            "total_batches": len(batches),
            "total_quantity": total_qty,
            "total_value": total_value,
            "avg_unit_cost": round((total_value / total_qty) if total_qty > 0 else 0.0, 4),
        },
    }



# ============================================================================
# 📊 Yield Variance — تقرير فروقات العائد المتوقّع مقابل الفعلي
# ============================================================================

@router.get("/yield-variances")
async def get_yield_variances(
    product_id: Optional[str] = None,
    days: int = 30,
    limit: int = 200,
    current_user: dict = Depends(get_current_user),
):
    """يُرجع سجلات فروقات العائد (Yield Variances) للمنتجات المُصنّعة.

    Filters:
      - product_id: قصر السجلات على منتج واحد.
      - days: عدد الأيام الماضية (الافتراضي 30).
      - limit: حدّ أقصى للسجلات (الافتراضي 200).
    """
    db = get_db()
    tenant_id = current_user.get("tenant_id") if current_user else None

    query: Dict[str, Any] = {}
    if tenant_id:
        query["tenant_id"] = tenant_id
    if product_id:
        query["product_id"] = product_id
    if days and days > 0:
        cutoff = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()
        query["created_at"] = {"$gte": cutoff}

    rows = await db.yield_variances.find(query, {"_id": 0}).sort("created_at", -1).to_list(limit)

    # ملخّص إجمالي
    total_records = len(rows)
    total_variance_value = round(sum(float(r.get("variance_value") or 0) for r in rows), 2)
    total_expected = round(sum(float(r.get("expected_yield") or 0) for r in rows), 3)
    total_actual = round(sum(float(r.get("actual_yield") or 0) for r in rows), 3)
    total_units_variance = round(total_actual - total_expected, 3)

    # 📊 تجميع لكل منتج — يكشف أي المنتجات يهدر أكثر (مرتّب: الأكثر خسارة أولاً)
    prod_agg: Dict[str, Any] = {}
    for r in rows:
        pid = r.get("product_id") or r.get("product_name") or "?"
        a = prod_agg.get(pid)
        if not a:
            a = {
                "product_id": r.get("product_id"),
                "product_name": r.get("product_name"),
                "unit": r.get("unit"),
                "batches": 0, "expected_yield": 0.0, "actual_yield": 0.0, "variance_value": 0.0,
            }
            prod_agg[pid] = a
        a["batches"] += 1
        a["expected_yield"] += float(r.get("expected_yield") or 0)
        a["actual_yield"] += float(r.get("actual_yield") or 0)
        a["variance_value"] += float(r.get("variance_value") or 0)
    by_product = []
    for a in prod_agg.values():
        exp = a["expected_yield"]
        a["units_variance"] = round(a["actual_yield"] - exp, 3)
        a["variance_pct"] = round(((a["actual_yield"] - exp) / exp * 100) if exp else 0.0, 2)
        a["expected_yield"] = round(exp, 3)
        a["actual_yield"] = round(a["actual_yield"], 3)
        a["variance_value"] = round(a["variance_value"], 2)
        by_product.append(a)
    by_product.sort(key=lambda x: x["variance_value"])  # الأكثر خسارة (أكثر سلبية) أولاً

    return {
        "records": rows,
        "by_product": by_product,
        "summary": {
            "total_records": total_records,
            "total_expected_yield": total_expected,
            "total_actual_yield": total_actual,
            "total_units_variance": total_units_variance,
            "total_variance_value": total_variance_value,
        },
        "filters": {"product_id": product_id, "days": days, "limit": limit},
    }


@router.post("/manufactured-products/{product_id}/add-stock")
async def add_product_stock(product_id: str, quantity: float = 1, current_user: dict = Depends(get_current_user)):
    """زيادة كمية المنتج مع خصم المواد الخام (مثل التصنيع تماماً).
    ⭐ يخصم مكونات الوصفة (مواد خام + منتجات مُصنّعة) من مخزون التصنيع للكمية المُضافة،
    ويتحقق من توفر المواد قبل الإضافة، ثم يُزامن الوصفة مع الكمية الجديدة."""
    db = get_db()

    product = await db.manufactured_products.find_one({"id": product_id})
    if not product:
        raise HTTPException(status_code=404, detail="المنتج غير موجود")

    if quantity <= 0:
        raise HTTPException(status_code=400, detail="الكمية يجب أن تكون أكبر من صفر")

    now_iso = datetime.now(timezone.utc).isoformat()
    tenant_id = current_user.get("tenant_id") if current_user else None
    performed_by_name = (current_user or {}).get("full_name") or (current_user or {}).get("username")

    # ───── احتساب معامل الاستهلاك (نفس منطق التصنيع) ─────
    # ⭐ العائد يحترم تعريف البورشن (piece_def_value) + الوحدة الرئيسية الوزنية
    tg = await _compute_recipe_total_grams(db, product.get("recipe") or [])
    calculated_yield = _resolve_recipe_yield(product, tg)
    # ⭐ احتياط عدّ←عدّ (انظر produce) — يمنع استهلاك خاطئ للوحدات العدّية
    if calculated_yield <= 0:
        calculated_yield = await _compute_recipe_count_yield(db, product)
    is_batch_mode = calculated_yield > 0
    # batch mode: الوصفة تمثل calculated_yield قطعة → معامل = quantity / calculated_yield
    # legacy mode: الوصفة per-unit → معامل = quantity
    consume_factor = (quantity / calculated_yield) if is_batch_mode else quantity

    recipe = product.get("recipe") or []

    # ───── التحقق من توفر المواد (مطابقة كلا حقلي المعرّف) ─────
    insufficient = []
    for ingredient in recipe:
        needed = (ingredient.get("quantity", 0) or 0) * consume_factor
        if needed <= 0:
            continue
        if ingredient.get("manufactured_product_id"):
            mfg = await db.manufactured_products.find_one({"id": ingredient["manufactured_product_id"]})
            available = mfg.get("quantity", 0) if mfg else 0
            if available < needed:
                insufficient.append({"name": ingredient.get("raw_material_name") or (mfg.get("name") if mfg else "منتج مُصنّع"), "needed": round(needed, 3), "available": round(available, 3), "unit": ingredient.get("unit"), "source": "manufactured"})
            continue
        rm_id = ingredient.get("raw_material_id")
        mi = await db.manufacturing_inventory.find_one({"$or": [{"raw_material_id": rm_id}, {"material_id": rm_id}]})
        available = mi.get("quantity", 0) if mi else 0
        if available < needed:
            insufficient.append({"name": ingredient.get("raw_material_name"), "needed": round(needed, 3), "available": round(available, 3), "unit": ingredient.get("unit")})
    if insufficient:
        raise HTTPException(status_code=400, detail={"message": "مواد غير كافية لإضافة هذه الكمية", "insufficient_materials": insufficient})

    # ───── خصم المكونات + تسجيل حركة استهلاك ─────
    for ingredient in recipe:
        needed = (ingredient.get("quantity", 0) or 0) * consume_factor
        if needed <= 0:
            continue
        base_cost = ingredient.get("cost_per_unit", 0) or 0
        waste_pct = ingredient.get("waste_percentage", 0) or 0
        effective_cost = (base_cost / (1 - waste_pct / 100)) if (0 < waste_pct < 100) else base_cost
        line_after = needed * effective_cost
        if ingredient.get("manufactured_product_id"):
            await db.manufactured_products.update_one(
                {"id": ingredient["manufactured_product_id"]},
                {"$inc": {"quantity": -needed}, "$set": {"last_updated": now_iso}}
            )
            await db.inventory_movements.insert_one({
                "id": str(uuid.uuid4()), "tenant_id": tenant_id,
                "type": "manufactured_consumption", "category": "manufacturing",
                "product_id": ingredient["manufactured_product_id"],
                "product_name": ingredient.get("raw_material_name"),
                "quantity": -needed, "unit": ingredient.get("unit"),
                "reason": f"زيادة كمية {product.get('name')} ({quantity} {product.get('unit', 'حبة')})",
                "performed_by_name": performed_by_name, "created_at": now_iso,
            })
            continue
        await db.manufacturing_inventory.update_one(
            {"$or": [{"raw_material_id": ingredient.get("raw_material_id")}, {"material_id": ingredient.get("raw_material_id")}]},
            {"$inc": {"quantity": -needed}, "$set": {"last_updated": now_iso}}
        )
        await db.inventory_movements.insert_one({
            "id": str(uuid.uuid4()), "tenant_id": tenant_id,
            "type": "manufacturing_consumption", "category": "manufacturing",
            "material_id": ingredient.get("raw_material_id"),
            "material_name": ingredient.get("raw_material_name"),
            "quantity": round(needed, 6), "unit": ingredient.get("unit"),
            "cost_per_unit": base_cost, "waste_percentage": waste_pct,
            "total_value": round(line_after, 2), "cost_after_waste": round(line_after, 2),
            "product_id": product_id, "product_name": product.get("name"),
            "batch_quantity": quantity, "performed_by_name": performed_by_name,
            "notes": f"استُهلكت لزيادة {quantity} {product.get('unit')} من {product.get('name')}",
            "created_at": now_iso,
        })

    # زيادة الكمية
    await db.manufactured_products.update_one(
        {"id": product_id},
        {
            "$inc": {
                "quantity": quantity,
                "total_produced": quantity
            },
            "$set": {"last_updated": now_iso}
        }
    )

    # ⭐ مزامنة تلقائية للوصفة لتطابق الكمية الجديدة (مع دعم pack_info)
    recipe_scaled = False
    scale_factor = 1.0
    fresh = await db.manufactured_products.find_one({"id": product_id})
    total_grams = await _compute_recipe_total_grams(db, fresh.get("recipe") or [])
    # ⭐ العائد يحترم تعريف البورشن (piece_def_value) + الوحدة الرئيسية الوزنية
    calc_yield = _resolve_recipe_yield(fresh, total_grams)
    # ⭐ احتياط عدّ←عدّ (انظر produce)
    if calc_yield <= 0:
        calc_yield = await _compute_recipe_count_yield(db, fresh)
    target_qty = float(fresh.get("quantity") or 0)
    if calc_yield > 0 and target_qty > 0 and abs(calc_yield - target_qty) >= 0.5:
        scale_factor = target_qty / calc_yield
        new_recipe = []
        for ing in (fresh.get("recipe") or []):
            ni = dict(ing)
            ni["quantity"] = round((ing.get("quantity") or 0) * scale_factor, 6)
            new_recipe.append(ni)
        rm_cost = 0.0
        rm_cost_aw = 0.0
        for i in new_recipe:
            q = i.get("quantity", 0) or 0
            cpu = i.get("cost_per_unit", 0) or 0
            wp = i.get("waste_percentage", 0) or 0
            rm_cost += q * cpu
            eff = cpu / (1 - wp / 100) if 0 < wp < 100 else cpu
            rm_cost_aw += q * eff
        sp = fresh.get("selling_price", 0) or 0
        new_pcost = round(rm_cost_aw, 2)
        new_pmargin = round(sp - new_pcost, 2) if sp > 0 else 0
        await db.manufactured_products.update_one(
            {"id": product_id},
            {"$set": {
                "recipe": new_recipe,
                "raw_material_cost": round(rm_cost, 2),
                "raw_material_cost_after_waste": round(rm_cost_aw, 2),
                "cost_before_waste": round(rm_cost, 2),
                "production_cost": new_pcost,
                "profit_margin": new_pmargin,
                "last_updated": now_iso,
            }}
        )
        recipe_scaled = True

    # تسجيل حركة الإضافة
    await db.inventory_movements.insert_one({
        "id": str(uuid.uuid4()),
        "type": "manual_stock_add",
        "product_id": product_id,
        "product_name": product.get("name"),
        "quantity": quantity,
        "notes": f"زيادة كمية مع خصم المواد الخام{' + مزامنة الوصفة ×' + str(round(scale_factor, 4)) if recipe_scaled else ''}",
        "created_at": now_iso,
    })

    return {
        "message": f"تم إضافة {quantity} {product.get('unit')} إلى {product.get('name')} وخصم المواد الخام",
        "new_quantity": product.get("quantity", 0) + quantity,
        "recipe_scaled": recipe_scaled,
        "scale_factor": round(scale_factor, 6) if recipe_scaled else 1.0,
    }


# ⭐ تصفير كمية المنتج المصنّع (لإعادة ضبط المخزون عند وجود اختلاف بين الوحدات المخزنة)
@router.post("/manufactured-products/{product_id}/reset-quantity")
async def reset_product_quantity(product_id: str, current_user: dict = Depends(get_current_user)):
    """تصفير كل كميات المنتج المصنّع: total_produced=0, transferred_quantity=0, quantity=0.
    مفيد عندما يكون المخزون مخزّن بوحدة خاطئة (مثلاً غرام بدل قطعة) ويُراد إعادة الحساب."""
    db = get_db()
    product = await db.manufactured_products.find_one({"id": product_id})
    if not product:
        raise HTTPException(status_code=404, detail="المنتج غير موجود")

    now_iso = datetime.now(timezone.utc).isoformat()
    await db.manufactured_products.update_one(
        {"id": product_id},
        {
            "$set": {
                "quantity": 0,
                "total_produced": 0,
                "transferred_quantity": 0,
                "wac_unit_after": 0,
                "wac_unit_before": 0,
                "last_updated": now_iso,
            }
        }
    )

    # سجل في حركة المخزون للتدقيق
    await db.manufacturing_movements.insert_one({
        "id": str(uuid.uuid4()),
        "type": "reset_quantity",
        "product_id": product_id,
        "product_name": product.get("name"),
        "quantity": 0,
        "previous_quantity": product.get("quantity", 0),
        "previous_total_produced": product.get("total_produced", 0),
        "previous_transferred": product.get("transferred_quantity", 0),
        "notes": "تصفير يدوي للكمية",
        "user_id": current_user.get("id"),
        "created_at": now_iso,
    })

    return {
        "message": f"تم تصفير كمية {product.get('name')}",
        "previous": {
            "quantity": product.get("quantity", 0),
            "total_produced": product.get("total_produced", 0),
            "transferred_quantity": product.get("transferred_quantity", 0),
        },
    }


# ==================== BRANCH ORDERS (طلبات الفروع من التصنيع) ====================

@router.post("/branch-orders-new")
async def create_branch_order(order: BranchOrderCreate):
    """إنشاء طلب فرع من قسم التصنيع"""
    db = get_db()
    
    # رقم تسلسلي
    last_order = await db.branch_orders_new.find_one(sort=[("order_number", -1)])
    order_number = (last_order.get("order_number", 0) if last_order else 0) + 1
    
    # جلب بيانات الفرع
    branch = await db.branches.find_one({"id": order.to_branch_id}, {"_id": 0})
    if not branch:
        raise HTTPException(status_code=404, detail="الفرع غير موجود")
    
    # التحقق من توفر المنتجات المصنعة
    items_with_details = []
    total_cost = 0
    insufficient = []
    
    for item in order.items:
        product = await db.manufactured_products.find_one({"id": item.get("product_id")}, {"_id": 0})
        if not product:
            raise HTTPException(status_code=404, detail=f"المنتج غير موجود: {item.get('product_id')}")
        
        requested_qty = item.get("quantity", 0)
        available_qty = product.get("quantity", 0)
        
        if available_qty < requested_qty:
            insufficient.append({
                "name": product.get("name"),
                "requested": requested_qty,
                "available": available_qty,
                "unit": product.get("unit")
            })
        else:
            item_cost = requested_qty * product.get("raw_material_cost", 0)
            items_with_details.append({
                "product_id": product["id"],
                "product_name": product.get("name"),
                "quantity": requested_qty,
                "unit": product.get("unit"),
                "cost_per_unit": product.get("raw_material_cost", 0),
                "total_cost": item_cost,
                "recipe": product.get("recipe", [])
            })
            total_cost += item_cost
    
    if insufficient:
        raise HTTPException(
            status_code=400,
            detail={
                "message": "منتجات مصنعة غير كافية",
                "insufficient_products": insufficient
            }
        )
    
    order_doc = {
        "id": str(uuid.uuid4()),
        "order_number": order_number,
        "to_branch_id": order.to_branch_id,
        "to_branch_name": branch.get("name"),
        "items": items_with_details,
        "total_cost": total_cost,
        "status": "pending",
        "priority": order.priority,
        "notes": order.notes,
        "created_by": "system",
        "created_at": datetime.now(timezone.utc).isoformat(),
        "approved_at": None,
        "shipped_at": None,
        "delivered_at": None
    }
    
    await db.branch_orders_new.insert_one(order_doc)
    del order_doc["_id"]
    return order_doc

@router.get("/branch-orders-new")
async def get_branch_orders(status: Optional[str] = None, branch_id: Optional[str] = None):
    """جلب طلبات الفروع"""
    db = get_db()
    
    query = {}
    if status:
        query["status"] = status
    if branch_id:
        query["to_branch_id"] = branch_id
    
    orders = await db.branch_orders_new.find(query, {"_id": 0}).sort("created_at", -1).to_list(1000)
    return orders

@router.patch("/branch-orders-new/{order_id}/status")
async def update_branch_order_status(order_id: str, status: str):
    """تحديث حالة طلب الفرع"""
    db = get_db()
    
    order = await db.branch_orders_new.find_one({"id": order_id})
    if not order:
        raise HTTPException(status_code=404, detail="الطلب غير موجود")
    
    update_data = {"status": status}
    
    if status == "approved":
        update_data["approved_at"] = datetime.now(timezone.utc).isoformat()
    elif status == "shipped":
        update_data["shipped_at"] = datetime.now(timezone.utc).isoformat()
        
        # خصم المنتجات من قسم التصنيع
        for item in order.get("items", []):
            await db.manufactured_products.update_one(
                {"id": item.get("product_id")},
                {
                    "$inc": {"quantity": -item.get("quantity", 0)},
                    "$set": {"last_updated": datetime.now(timezone.utc).isoformat()}
                }
            )
    elif status == "delivered":
        update_data["delivered_at"] = datetime.now(timezone.utc).isoformat()
        
        # إضافة المنتجات لمخزون الفرع
        for item in order.get("items", []):
            existing = await db.branch_inventory.find_one({
                "branch_id": order.get("to_branch_id"),
                "product_id": item.get("product_id")
            })
            
            if existing:
                await db.branch_inventory.update_one(
                    {"id": existing["id"]},
                    {
                        "$inc": {"quantity": item.get("quantity", 0)},
                        "$set": {"last_updated": datetime.now(timezone.utc).isoformat()}
                    }
                )
            else:
                await db.branch_inventory.insert_one({
                    "id": str(uuid.uuid4()),
                    "branch_id": order.get("to_branch_id"),
                    "branch_name": order.get("to_branch_name"),
                    "product_id": item.get("product_id"),
                    "product_name": item.get("product_name"),
                    "quantity": item.get("quantity", 0),
                    "cost_per_unit": item.get("cost_per_unit", 0),
                    "recipe": item.get("recipe", []),
                    "last_updated": datetime.now(timezone.utc).isoformat(),
                    "created_at": datetime.now(timezone.utc).isoformat()
                })
    
    await db.branch_orders_new.update_one(
        {"id": order_id},
        {"$set": update_data}
    )
    
    return {"message": "تم تحديث الحالة"}

# ==================== BRANCH INVENTORY (مخزون الفروع) ====================

@router.get("/branch-inventory/{branch_id}")
async def get_branch_inventory(branch_id: str):
    """جلب مخزون فرع محدد"""
    db = get_db()
    inventory = await db.branch_inventory.find({"branch_id": branch_id}, {"_id": 0}).to_list(1000)
    
    # حساب القيمة الإجمالية وضمان وجود الحقول الجديدة
    for item in inventory:
        item["total_value"] = item.get("quantity", 0) * item.get("cost_per_unit", 0)
        item["received_quantity"] = item.get("received_quantity", item.get("quantity", 0))
        item["sold_quantity"] = item.get("sold_quantity", 0)
        item["remaining_quantity"] = item.get("quantity", 0)
    
    return inventory

@router.post("/branch-inventory/{branch_id}/sell")
async def sell_from_branch(branch_id: str, product_id: str, quantity: float = 1):
    """البيع من مخزون الفرع (خصم تلقائي)"""
    db = get_db()
    
    # البحث عن المنتج في مخزون الفرع
    inventory_item = await db.branch_inventory.find_one({
        "branch_id": branch_id,
        "product_id": product_id
    })
    
    if not inventory_item:
        raise HTTPException(status_code=404, detail="المنتج غير موجود في مخزون الفرع")
    
    if inventory_item.get("quantity", 0) < quantity:
        raise HTTPException(
            status_code=400,
            detail=f"الكمية غير كافية. متوفر: {inventory_item.get('quantity', 0)}"
        )
    
    # خصم الكمية وزيادة المباع
    await db.branch_inventory.update_one(
        {"id": inventory_item["id"]},
        {
            "$inc": {
                "quantity": -quantity,
                "sold_quantity": quantity
            },
            "$set": {"last_updated": datetime.now(timezone.utc).isoformat()}
        }
    )
    
    return {
        "message": f"تم البيع: {quantity} {inventory_item.get('product_name')}",
        "remaining": inventory_item.get("quantity", 0) - quantity,
        "sold": inventory_item.get("sold_quantity", 0) + quantity,
        "cost": quantity * inventory_item.get("cost_per_unit", 0)
    }

# ==================== INVENTORY SETTINGS ====================

@router.get("/inventory-settings")
async def get_inventory_settings():
    """جلب إعدادات المخزون"""
    db = get_db()
    settings = await db.settings.find_one({"type": "inventory_settings"}, {"_id": 0})
    
    if not settings:
        # إعدادات افتراضية
        settings = {
            "type": "inventory_settings",
            "inventory_mode": "centralized",  # centralized or per_branch
            "auto_deduct_on_sale": True,
            "low_stock_notifications": True
        }
        await db.settings.insert_one(settings)
    
    return settings

@router.put("/inventory-settings")
async def update_inventory_settings(settings: InventorySettingsUpdate):
    """تحديث إعدادات المخزون"""
    db = get_db()
    
    await db.settings.update_one(
        {"type": "inventory_settings"},
        {"$set": settings.model_dump()},
        upsert=True
    )
    
    return {"message": "تم تحديث الإعدادات"}

# ==================== STATISTICS ====================

@router.get("/inventory-stats")
async def get_inventory_statistics(current_user: dict = Depends(get_current_user)):
    """إحصائيات المخزون"""
    db = get_db()
    
    # إحصائيات المواد الخام
    raw_materials = await db.raw_materials.find({}, {"_id": 0}).to_list(1000)
    total_raw_value = sum(m.get("quantity", 0) * m.get("cost_per_unit", 0) for m in raw_materials)
    low_stock_raw = [m for m in raw_materials if m.get("quantity", 0) <= m.get("min_quantity", 0)]
    
    # إحصائيات التصنيع
    manufacturing = await db.manufacturing_inventory.find({}, {"_id": 0}).to_list(1000)
    total_manufacturing_value = sum(m.get("quantity", 0) * m.get("cost_per_unit", 0) for m in manufacturing)
    
    # إحصائيات المنتجات المصنعة
    products = await db.manufactured_products.find({}, {"_id": 0}).to_list(1000)
    # ⭐ احتساب القيمة الإجمالية بسعر الوحدة الواحدة (وليس بتكلفة الدفعة كاملة)
    total_products_value = 0.0
    for p in products:
        _backfill_cost_fields(p)
        await _enrich_unit_cost_fields(db, p)
        qty = float(p.get("quantity", 0) or 0)
        unit_cost = float(p.get("unit_cost_after_waste", 0) or 0)
        total_products_value += qty * unit_cost
    low_stock_products = [p for p in products if p.get("quantity", 0) <= p.get("min_quantity", 0)]
    
    # إحصائيات المشتريات
    purchases_count = await db.purchases_new.count_documents({})
    pending_purchases = await db.purchases_new.count_documents({"status": "pending"})
    
    # إحصائيات طلبات الفروع
    branch_orders_count = await db.branch_orders_new.count_documents({})
    pending_orders = await db.branch_orders_new.count_documents({"status": "pending"})
    
    return {
        "raw_materials": {
            "count": len(raw_materials),
            "total_value": total_raw_value,
            "low_stock_count": len(low_stock_raw),
            "low_stock_items": low_stock_raw[:5]  # أول 5 فقط
        },
        "manufacturing": {
            "count": len(manufacturing),
            "total_value": total_manufacturing_value
        },
        "manufactured_products": {
            "count": len(products),
            "total_value": total_products_value,
            "low_stock_count": len(low_stock_products),
            "low_stock_items": low_stock_products[:5]
        },
        "purchases": {
            "total": purchases_count,
            "pending": pending_purchases
        },
        "branch_orders": {
            "total": branch_orders_count,
            "pending": pending_orders
        }
    }


# ==================== تصفير البيانات (RESET DATA) ====================

class ResetDataRequest(BaseModel):
    reset_branch_orders: bool = False  # تصفير طلبات الفروع
    reset_purchases: bool = False  # تصفير طلبات الشراء
    reset_manufacturing: bool = False  # تصفير طلبات التصنيع
    reset_raw_materials_qty: bool = False  # تصفير كميات المواد الخام
    reset_manufactured_qty: bool = False  # تصفير كميات المنتجات المصنعة
    reset_branch_inventory: bool = False  # تصفير مخزون الفروع

@router.post("/inventory-reset")
async def reset_inventory_data(data: ResetDataRequest):
    """
    تصفير بيانات المخزون والمشتريات
    يستخدم بعد التجربة لتنظيف البيانات
    """
    db = get_db()
    results = {
        "reset_counts": {},
        "success": True,
        "message": "تم التصفير بنجاح"
    }
    
    try:
        # تصفير طلبات الفروع (المرسلة والمنفذة)
        if data.reset_branch_orders:
            deleted = await db.branch_orders_new.delete_many({})
            results["reset_counts"]["branch_orders"] = deleted.deleted_count
        
        # تصفير طلبات الشراء (المشتريات)
        if data.reset_purchases:
            # حذف فواتير الشراء
            deleted_purchases = await db.purchases_new.delete_many({})
            results["reset_counts"]["purchases"] = deleted_purchases.deleted_count
            
            # حذف طلبات الشراء المعلقة
            deleted_requests = await db.purchase_requests.delete_many({})
            results["reset_counts"]["purchase_requests"] = deleted_requests.deleted_count
        
        # تصفير سجلات التصنيع
        if data.reset_manufacturing:
            deleted = await db.manufacturing_records.delete_many({})
            results["reset_counts"]["manufacturing_records"] = deleted.deleted_count
            
            # حذف حركات المخزون المتعلقة بالتصنيع
            deleted_movements = await db.inventory_movements.delete_many({"type": {"$in": ["manufacturing", "transfer_to_manufacturing"]}})
            results["reset_counts"]["manufacturing_movements"] = deleted_movements.deleted_count
        
        # تصفير كميات المواد الخام (دون حذف المواد نفسها)
        if data.reset_raw_materials_qty:
            updated = await db.raw_materials.update_many(
                {},
                {"$set": {"quantity": 0, "last_updated": datetime.now(timezone.utc).isoformat()}}
            )
            results["reset_counts"]["raw_materials_qty_reset"] = updated.modified_count
            
            # تصفير مخزون التصنيع
            updated_mfg = await db.manufacturing_inventory.update_many(
                {},
                {"$set": {"quantity": 0, "last_updated": datetime.now(timezone.utc).isoformat()}}
            )
            results["reset_counts"]["manufacturing_inventory_reset"] = updated_mfg.modified_count
        
        # تصفير كميات المنتجات المصنعة
        if data.reset_manufactured_qty:
            updated = await db.manufactured_products.update_many(
                {},
                {"$set": {"quantity": 0, "last_updated": datetime.now(timezone.utc).isoformat()}}
            )
            results["reset_counts"]["manufactured_products_qty_reset"] = updated.modified_count
        
        # تصفير مخزون الفروع
        if data.reset_branch_inventory:
            deleted = await db.branch_inventory.delete_many({})
            results["reset_counts"]["branch_inventory"] = deleted.deleted_count
        
        # حذف جميع حركات المخزون إذا تم تصفير أي شيء
        if any([data.reset_branch_orders, data.reset_purchases, data.reset_manufacturing, 
                data.reset_raw_materials_qty, data.reset_manufactured_qty, data.reset_branch_inventory]):
            deleted_all_movements = await db.inventory_movements.delete_many({})
            results["reset_counts"]["inventory_movements"] = deleted_all_movements.deleted_count
        
        return results
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"خطأ في تصفير البيانات: {str(e)}")



# ==================== NOTIFICATIONS (الإشعارات) ====================

@router.get("/warehouse-notifications")
async def get_warehouse_notifications(status: Optional[str] = None):
    """جلب إشعارات المخزن"""
    db = get_db()
    
    query = {"target_role": {"$in": ["warehouse_keeper", "admin", "super_admin"]}}
    if status:
        query["status"] = status
    
    notifications = await db.notifications.find(query, {"_id": 0}).sort("created_at", -1).to_list(100)
    return notifications

@router.post("/warehouse-notifications")
async def create_warehouse_notification(
    title: str,
    message: str,
    notification_type: str = "info",
    related_id: Optional[str] = None,
    related_type: Optional[str] = None
):
    """إنشاء إشعار للمخزن"""
    db = get_db()
    
    notification = {
        "id": str(uuid.uuid4()),
        "title": title,
        "message": message,
        "type": notification_type,  # info, warning, success, purchase_delivery
        "target_role": "warehouse_keeper",
        "related_id": related_id,
        "related_type": related_type,
        "status": "unread",
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    
    await db.notifications.insert_one(notification)
    del notification["_id"]
    return notification

@router.patch("/warehouse-notifications/{notification_id}/read")
async def mark_notification_read(notification_id: str):
    """تحديد الإشعار كمقروء"""
    db = get_db()
    
    await db.notifications.update_one(
        {"id": notification_id},
        {"$set": {"status": "read", "read_at": datetime.now(timezone.utc).isoformat()}}
    )
    return {"message": "تم تحديد الإشعار كمقروء"}

@router.delete("/warehouse-notifications/{notification_id}")
async def delete_notification(notification_id: str):
    """حذف إشعار"""
    db = get_db()
    await db.notifications.delete_one({"id": notification_id})
    return {"message": "تم حذف الإشعار"}


# ==================== PURCHASE DELIVERY TO WAREHOUSE ====================

@router.post("/purchase-requests/{request_id}/deliver-to-warehouse")
async def deliver_purchase_to_warehouse(request_id: str):
    """تحويل المشتريات للمخزن (إنشاء إشعار للاستلام)"""
    db = get_db()
    
    request = await db.purchase_requests.find_one({"id": request_id})
    if not request:
        raise HTTPException(status_code=404, detail="الطلب غير موجود")
    
    if request.get("status") not in ["approved", "ordered"]:
        raise HTTPException(status_code=400, detail="يجب اعتماد الطلب أو طلبه من المورد أولاً")
    
    # تحديث حالة الطلب
    await db.purchase_requests.update_one(
        {"id": request_id},
        {"$set": {
            "status": "in_transit",
            "delivery_started_at": datetime.now(timezone.utc).isoformat()
        }}
    )
    
    # إنشاء إشعار للمخزن
    items_summary = ", ".join([f"{item.get('material_name')} ({item.get('quantity')} {item.get('unit', '')})" 
                               for item in request.get("items", [])[:3]])
    if len(request.get("items", [])) > 3:
        items_summary += f" و {len(request.get('items', [])) - 3} أصناف أخرى"
    
    notification = {
        "id": str(uuid.uuid4()),
        "title": f"مشتريات جاهزة للاستلام - طلب #{request.get('request_number')}",
        "message": f"تم تحويل مشتريات من قسم المشتريات وتحتاج للاستلام: {items_summary}",
        "type": "purchase_delivery",
        "target_role": "warehouse_keeper",
        "related_id": request_id,
        "related_type": "purchase_request",
        "status": "unread",
        "items": request.get("items", []),
        "total_cost": request.get("total_cost", 0),
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    
    await db.notifications.insert_one(notification)
    
    return {
        "message": "تم تحويل المشتريات للمخزن وإرسال إشعار للاستلام",
        "notification_id": notification["id"],
        "request_id": request_id
    }

@router.post("/warehouse-notifications/{notification_id}/receive")
async def receive_from_notification(notification_id: str):
    """استلام المشتريات من الإشعار وإضافتها للمخزن"""
    db = get_db()
    
    notification = await db.notifications.find_one({"id": notification_id})
    if not notification:
        raise HTTPException(status_code=404, detail="الإشعار غير موجود")
    
    if notification.get("type") != "purchase_delivery":
        raise HTTPException(status_code=400, detail="هذا الإشعار ليس إشعار مشتريات")
    
    request_id = notification.get("related_id")
    items = notification.get("items", [])
    
    # إضافة المواد للمخزن
    for item in items:
        material_name = item.get("material_name")
        quantity = item.get("quantity", 0)
        
        existing_material = await db.raw_materials.find_one({"name": material_name})
        
        if existing_material:
            await db.raw_materials.update_one(
                {"id": existing_material["id"]},
                {
                    "$inc": {"quantity": quantity, "total_received": quantity},
                    "$set": {"last_updated": datetime.now(timezone.utc).isoformat()}
                }
            )
        else:
            await db.raw_materials.insert_one({
                "id": str(uuid.uuid4()),
                "name": material_name,
                "unit": item.get("unit", "كغم"),
                "quantity": quantity,
                "total_received": quantity,
                "transferred_to_manufacturing": 0,
                "min_quantity": 10,
                "cost_per_unit": item.get("estimated_cost", item.get("cost_per_unit", 0)),
                "waste_percentage": 0,
                "created_at": datetime.now(timezone.utc).isoformat()
            })
    
    # تحديث حالة طلب الشراء
    if request_id:
        await db.purchase_requests.update_one(
            {"id": request_id},
            {"$set": {
                "status": "received",
                "received_at": datetime.now(timezone.utc).isoformat()
            }}
        )
    
    # تحديث الإشعار
    await db.notifications.update_one(
        {"id": notification_id},
        {"$set": {
            "status": "completed",
            "completed_at": datetime.now(timezone.utc).isoformat()
        }}
    )
    
    # تسجيل الحركة
    await db.inventory_movements.insert_one({
        "id": str(uuid.uuid4()),
        "type": "purchase_received",
        "notification_id": notification_id,
        "request_id": request_id,
        "items": items,
        "notes": "استلام مشتريات من إشعار",
        "created_at": datetime.now(timezone.utc).isoformat()
    })
    
    return {"message": "تم استلام المشتريات وإضافتها للمخزن بنجاح"}


# ==================== مواد التغليف (الورقيات) ====================

@router.get("/packaging-materials")
async def get_packaging_materials(
    category: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """جلب جميع مواد التغليف"""
    db = get_db()
    tenant_id = get_user_tenant_id(current_user)
    
    query = {}
    if tenant_id:
        query["tenant_id"] = tenant_id
    if category:
        query["category"] = category
    
    materials = await db.packaging_materials.find(query, {"_id": 0}).to_list(500)
    
    # حساب الكميات وتنظيف البيانات
    result = []
    for material in materials:
        total_received = material.get("total_received", material.get("quantity", 0))
        transferred = material.get("transferred_to_branches", 0)
        material["total_received"] = total_received
        material["transferred_to_branches"] = transferred
        material["remaining_quantity"] = total_received - transferred
        material["total_value"] = material.get("quantity", 0) * material.get("cost_per_unit", 0)
        result.append(material)
    
    from fastapi.responses import JSONResponse
    import json
    return JSONResponse(content=json.loads(json.dumps(result, default=str)))

@router.post("/packaging-materials")
async def create_packaging_material(
    material: PackagingMaterialCreate,
    current_user: dict = Depends(get_current_user)
):
    """إضافة مادة تغليف جديدة"""
    db = get_db()
    tenant_id = get_user_tenant_id(current_user)
    
    now = datetime.now(timezone.utc).isoformat()
    new_material = {
        "id": str(uuid.uuid4()),
        "name": material.name,
        "name_en": material.name_en,
        "unit": material.unit,
        "quantity": material.quantity,
        "min_quantity": material.min_quantity,
        "cost_per_unit": material.cost_per_unit,
        "category": material.category,
        "total_received": material.quantity,
        "transferred_to_branches": 0,
        "tenant_id": tenant_id,
        "created_at": now,
        "last_updated": now
    }
    
    await db.packaging_materials.insert_one(new_material)
    new_material.pop("_id", None)
    
    return {"message": "تمت إضافة مادة التغليف بنجاح", "material": new_material}

@router.put("/packaging-materials/{material_id}")
async def update_packaging_material(
    material_id: str,
    material: PackagingMaterialCreate,
    current_user: dict = Depends(get_current_user)
):
    """تحديث مادة تغليف"""
    db = get_db()
    tenant_id = get_user_tenant_id(current_user)
    
    query = {"id": material_id}
    if tenant_id:
        query["tenant_id"] = tenant_id
    
    update_data = {
        "name": material.name,
        "name_en": material.name_en,
        "unit": material.unit,
        "min_quantity": material.min_quantity,
        "cost_per_unit": material.cost_per_unit,
        "category": material.category,
        "last_updated": datetime.now(timezone.utc).isoformat()
    }
    
    result = await db.packaging_materials.update_one(query, {"$set": update_data})
    
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="مادة التغليف غير موجودة")
    
    return {"message": "تم تحديث مادة التغليف بنجاح"}

@router.post("/packaging-materials/{material_id}/add-stock")
async def add_packaging_stock(
    material_id: str,
    quantity: float,
    cost_per_unit: Optional[float] = None,
    notes: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """إضافة كمية لمادة التغليف"""
    db = get_db()
    tenant_id = get_user_tenant_id(current_user)
    
    query = {"id": material_id}
    if tenant_id:
        query["tenant_id"] = tenant_id
    
    material = await db.packaging_materials.find_one(query)
    if not material:
        raise HTTPException(status_code=404, detail="مادة التغليف غير موجودة")
    
    update_data = {
        "quantity": material.get("quantity", 0) + quantity,
        "total_received": material.get("total_received", 0) + quantity,
        "last_updated": datetime.now(timezone.utc).isoformat()
    }
    
    if cost_per_unit is not None:
        update_data["cost_per_unit"] = cost_per_unit
    
    await db.packaging_materials.update_one(query, {"$set": update_data})
    
    # تسجيل الحركة
    await db.inventory_movements.insert_one({
        "id": str(uuid.uuid4()),
        "type": "packaging_stock_added",
        "material_id": material_id,
        "material_name": material.get("name"),
        "quantity": quantity,
        "notes": notes,
        "created_by": current_user.get("id"),
        "created_at": datetime.now(timezone.utc).isoformat(),
        "tenant_id": tenant_id
    })
    
    return {"message": f"تمت إضافة {quantity} {material.get('unit')} بنجاح"}

@router.delete("/packaging-materials/{material_id}")
async def delete_packaging_material(
    material_id: str,
    current_user: dict = Depends(get_current_user)
):
    """حذف مادة تغليف"""
    db = get_db()
    tenant_id = get_user_tenant_id(current_user)
    
    query = {"id": material_id}
    if tenant_id:
        query["tenant_id"] = tenant_id
    
    result = await db.packaging_materials.delete_one(query)
    
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="مادة التغليف غير موجودة")
    
    return {"message": "تم حذف مادة التغليف بنجاح"}


# ==================== طلبات مواد التغليف ====================

@router.get("/packaging-requests")
async def get_packaging_requests(
    status: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """جلب طلبات مواد التغليف"""
    db = get_db()
    tenant_id = get_user_tenant_id(current_user)
    
    query = {}
    if tenant_id:
        query["tenant_id"] = tenant_id
    if status:
        query["status"] = status
    
    requests = await db.packaging_requests.find(query, {"_id": 0}).sort("created_at", -1).to_list(200)
    
    return requests

@router.post("/packaging-requests")
async def create_packaging_request(
    request: PackagingRequestCreate,
    current_user: dict = Depends(get_current_user)
):
    """إنشاء طلب مواد تغليف جديد"""
    db = get_db()
    tenant_id = get_user_tenant_id(current_user)
    
    # الحصول على رقم الطلب التالي
    last_request = await db.packaging_requests.find_one(
        {"tenant_id": tenant_id} if tenant_id else {},
        sort=[("request_number", -1)]
    )
    next_number = (last_request.get("request_number", 0) if last_request else 0) + 1
    
    now = datetime.now(timezone.utc).isoformat()
    
    # تحديد الفرع - من المستخدم أو من الطلب
    branch_id = current_user.get("branch_id") or request.from_branch_id
    
    new_request = {
        "id": str(uuid.uuid4()),
        "request_number": next_number,
        "from_branch_id": branch_id,
        "items": request.items,
        "priority": request.priority,
        "status": "pending",
        "notes": request.notes,
        "created_by": current_user.get("id"),
        "created_by_name": current_user.get("name", current_user.get("email")),
        "created_at": now,
        "tenant_id": tenant_id
    }
    
    # جلب اسم الفرع
    if branch_id:
        branch = await db.branches.find_one({"id": branch_id})
        if branch:
            new_request["from_branch_name"] = branch.get("name")
    
    await db.packaging_requests.insert_one(new_request)
    new_request.pop("_id", None)
    
    # إرسال إشعار لأمين المخزن
    await db.notifications.insert_one({
        "id": str(uuid.uuid4()),
        "type": "packaging_request",
        "title": "طلب مواد تغليف جديد",
        "message": f"طلب جديد رقم #{next_number} يحتوي على {len(request.items)} صنف",
        "reference_id": new_request["id"],
        "for_role": "warehouse_keeper",
        "is_read": False,
        "created_at": now,
        "tenant_id": tenant_id
    })
    
    return {"message": "تم إرسال الطلب بنجاح", "request": new_request}

@router.post("/packaging-requests/{request_id}/approve")
async def approve_packaging_request(
    request_id: str,
    current_user: dict = Depends(get_current_user)
):
    """الموافقة على طلب مواد تغليف"""
    db = get_db()
    tenant_id = get_user_tenant_id(current_user)
    
    query = {"id": request_id}
    if tenant_id:
        query["tenant_id"] = tenant_id
    
    pkg_request = await db.packaging_requests.find_one(query)
    if not pkg_request:
        raise HTTPException(status_code=404, detail="الطلب غير موجود")
    
    if pkg_request.get("status") != "pending":
        raise HTTPException(status_code=400, detail="لا يمكن الموافقة على هذا الطلب")
    
    await db.packaging_requests.update_one(query, {"$set": {
        "status": "approved",
        "approved_by": current_user.get("id"),
        "approved_at": datetime.now(timezone.utc).isoformat()
    }})
    
    return {"message": "تمت الموافقة على الطلب"}

@router.post("/packaging-requests/{request_id}/transfer")
async def transfer_packaging_request(
    request_id: str,
    current_user: dict = Depends(get_current_user)
):
    """تحويل مواد التغليف للفرع"""
    db = get_db()
    tenant_id = get_user_tenant_id(current_user)
    
    query = {"id": request_id}
    if tenant_id:
        query["tenant_id"] = tenant_id
    
    pkg_request = await db.packaging_requests.find_one(query)
    if not pkg_request:
        raise HTTPException(status_code=404, detail="الطلب غير موجود")
    
    if pkg_request.get("status") not in ["pending", "approved"]:
        raise HTTPException(status_code=400, detail="لا يمكن تحويل هذا الطلب")
    
    now = datetime.now(timezone.utc).isoformat()
    branch_id = pkg_request.get("from_branch_id")
    
    # خصم من مخزن التغليف الرئيسي وإضافة لمخزن الفرع
    for item in pkg_request.get("items", []):
        material_id = item.get("packaging_material_id")
        quantity = item.get("quantity", 0)
        
        if material_id:
            # خصم من المخزن الرئيسي
            material = await db.packaging_materials.find_one({"id": material_id})
            if material:
                new_qty = max(0, material.get("quantity", 0) - quantity)
                await db.packaging_materials.update_one(
                    {"id": material_id},
                    {"$set": {
                        "quantity": new_qty,
                        "transferred_to_branches": material.get("transferred_to_branches", 0) + quantity,
                        "last_updated": now
                    }}
                )
                
                # إضافة لمخزن الفرع
                if branch_id:
                    branch_inv = await db.branch_packaging_inventory.find_one({
                        "branch_id": branch_id,
                        "packaging_material_id": material_id
                    })
                    
                    if branch_inv:
                        await db.branch_packaging_inventory.update_one(
                            {"id": branch_inv["id"]},
                            {"$set": {
                                "quantity": branch_inv.get("quantity", 0) + quantity,
                                "last_updated": now
                            }}
                        )
                    else:
                        await db.branch_packaging_inventory.insert_one({
                            "id": str(uuid.uuid4()),
                            "branch_id": branch_id,
                            "packaging_material_id": material_id,
                            "packaging_material_name": material.get("name"),
                            "quantity": quantity,
                            "used_quantity": 0,
                            "cost_per_unit": material.get("cost_per_unit", 0),
                            "created_at": now,
                            "last_updated": now,
                            "tenant_id": tenant_id
                        })
    
    # تحديث حالة الطلب
    await db.packaging_requests.update_one(query, {"$set": {
        "status": "transferred",
        "transferred_at": now,
        "transferred_by": current_user.get("id")
    }})
    
    return {"message": "تم تحويل مواد التغليف للفرع بنجاح"}

@router.post("/packaging-requests/{request_id}/cancel")
async def cancel_packaging_request(
    request_id: str,
    current_user: dict = Depends(get_current_user)
):
    """إلغاء طلب مواد تغليف"""
    db = get_db()
    tenant_id = get_user_tenant_id(current_user)
    
    query = {"id": request_id}
    if tenant_id:
        query["tenant_id"] = tenant_id
    
    result = await db.packaging_requests.update_one(query, {"$set": {
        "status": "cancelled",
        "cancelled_by": current_user.get("id"),
        "cancelled_at": datetime.now(timezone.utc).isoformat()
    }})
    
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="الطلب غير موجود")
    
    return {"message": "تم إلغاء الطلب"}


# ==================== مخزون مواد التغليف في الفروع ====================

@router.get("/branch-packaging-inventory")
async def get_branch_packaging_inventory(
    branch_id: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """جلب مخزون مواد التغليف في الفروع"""
    db = get_db()
    tenant_id = get_user_tenant_id(current_user)
    
    query = {}
    if tenant_id:
        query["tenant_id"] = tenant_id
    
    # إذا كان المستخدم من فرع محدد، جلب مخزون فرعه فقط
    user_branch_id = current_user.get("branch_id")
    if user_branch_id:
        query["branch_id"] = user_branch_id
    elif branch_id:
        query["branch_id"] = branch_id
    
    inventory = await db.branch_packaging_inventory.find(query, {"_id": 0}).to_list(500)
    
    # حساب الكميات المتبقية
    for item in inventory:
        item["remaining_quantity"] = item.get("quantity", 0) - item.get("used_quantity", 0)
        item["total_value"] = item.get("remaining_quantity", 0) * item.get("cost_per_unit", 0)
    
    return inventory

@router.post("/branch-packaging-inventory/deduct")
async def deduct_branch_packaging(
    branch_id: str,
    items: List[Dict[str, Any]],  # [{packaging_material_id, quantity}]
    order_id: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """خصم مواد التغليف من مخزون الفرع (يُستخدم عند البيع)"""
    db = get_db()
    tenant_id = get_user_tenant_id(current_user)
    
    now = datetime.now(timezone.utc).isoformat()
    
    for item in items:
        material_id = item.get("packaging_material_id")
        quantity = item.get("quantity", 0)
        
        if material_id and quantity > 0:
            branch_inv = await db.branch_packaging_inventory.find_one({
                "branch_id": branch_id,
                "packaging_material_id": material_id
            })
            
            if branch_inv:
                await db.branch_packaging_inventory.update_one(
                    {"id": branch_inv["id"]},
                    {"$set": {
                        "used_quantity": branch_inv.get("used_quantity", 0) + quantity,
                        "last_updated": now
                    }}
                )
    
    # تسجيل الحركة
    await db.inventory_movements.insert_one({
        "id": str(uuid.uuid4()),
        "type": "packaging_deducted",
        "branch_id": branch_id,
        "items": items,
        "order_id": order_id,
        "created_at": now,
        "tenant_id": tenant_id
    })
    
    return {"message": "تم خصم مواد التغليف بنجاح"}




# ==================== WASTE EFFICIENCY REPORT (تقرير كفاءة الهدر) ====================

@router.get("/reports/waste-efficiency")
async def waste_efficiency_report(
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    branch_id: Optional[str] = None,
    receiving_branch_id: Optional[str] = None,
    group_by: str = "product",  # 'product' | 'raw_material'
    current_user: dict = Depends(get_current_user),
):
    """تقرير كفاءة الهدر — يقارن الكلفة قبل/بعد الهدر.
    
    Params:
    - start_date / end_date: نطاق التاريخ (YYYY-MM-DD)
    - branch_id: فرع المطبخ (الذي صنع المنتج). اختياري.
    - receiving_branch_id: الفرع المستلم للمنتج عبر transfer_to_branch. اختياري.
    - group_by: 'product' (افتراضي) أو 'raw_material'
    """
    # صلاحيات: المالك/المدير فقط
    role = (current_user or {}).get("role", "")
    if role not in ("admin", "super_admin", "manager", "branch_manager"):
        raise HTTPException(status_code=403, detail="هذا التقرير متاح للمالك/المدير فقط")
    
    db = get_db()
    tenant_id = current_user.get("tenant_id")
    
    if not start_date:
        start_date = (datetime.now(timezone.utc) - timedelta(days=30)).date().isoformat()
    if not end_date:
        end_date = datetime.now(timezone.utc).date().isoformat()
    
    base_query = {
        "created_at": {"$gte": start_date + "T00:00:00", "$lte": end_date + "T23:59:59"},
    }
    if tenant_id:
        base_query["$or"] = [
            {"tenant_id": tenant_id},
            {"tenant_id": {"$exists": False}},
            {"tenant_id": None},
        ]
    
    # === حركات التصنيع (product_manufactured) — تحوي consumed_ingredients ===
    mfg_query = {**base_query, "type": {"$in": ["product_manufactured", "branch_loss"]}}
    if branch_id:
        mfg_query["branch_id"] = branch_id
    
    mfg_movements = await db.inventory_movements.find(mfg_query, {"_id": 0}).to_list(5000)
    
    # === حركات التحويل للفروع (لمعرفة الفرع المستلم) ===
    transferred_products = set()  # set of product_ids transferred to receiving_branch_id
    if receiving_branch_id:
        tr_query = {
            **base_query,
            "type": {"$in": ["transfer_to_branch", "branch_request_fulfilled"]},
            "branch_id": receiving_branch_id,
        }
        async for tr in db.inventory_movements.find(tr_query, {"_id": 0, "product_id": 1, "items": 1}):
            if tr.get("product_id"):
                transferred_products.add(tr["product_id"])
            for it in tr.get("items", []) or []:
                if it.get("product_id"):
                    transferred_products.add(it["product_id"])
        # نُبقي فقط حركات إنتاج لمنتجات وصلت لذلك الفرع
        mfg_movements = [m for m in mfg_movements if m.get("product_id") in transferred_products]
    
    # === تجميع ===
    if group_by == "raw_material":
        agg = {}  # raw_material_id -> { name, qty, cost_before, cost_after }
        for m in mfg_movements:
            for ing in m.get("consumed_ingredients", []) or []:
                rid = ing.get("raw_material_id") or ing.get("raw_material_name")
                if not rid:
                    continue
                if rid not in agg:
                    agg[rid] = {
                        "id": rid,
                        "name": ing.get("raw_material_name", "—"),
                        "unit": ing.get("unit", ""),
                        "quantity": 0.0,
                        "cost_before_waste": 0.0,
                        "cost_after_waste": 0.0,
                        "movements_count": 0,
                    }
                agg[rid]["quantity"] += ing.get("quantity", 0) or 0
                agg[rid]["cost_before_waste"] += ing.get("cost_before_waste", 0) or 0
                agg[rid]["cost_after_waste"] += ing.get("cost_after_waste", 0) or 0
                agg[rid]["movements_count"] += 1
    else:
        agg = {}  # product_id -> aggregate
        for m in mfg_movements:
            pid = m.get("product_id") or m.get("product_name")
            if not pid:
                continue
            if pid not in agg:
                agg[pid] = {
                    "id": pid,
                    "name": m.get("product_name", "—"),
                    "unit": m.get("unit", ""),
                    "quantity": 0.0,
                    "cost_before_waste": 0.0,
                    "cost_after_waste": 0.0,
                    "movements_count": 0,
                }
            agg[pid]["quantity"] += m.get("quantity", 0) or 0
            agg[pid]["cost_before_waste"] += m.get("cost_before_waste", 0) or 0
            agg[pid]["cost_after_waste"] += m.get("cost_after_waste", 0) or 0
            agg[pid]["movements_count"] += 1
            # ⭐ تفصيل المكوّنات المستهلكة لكل منتج (للعرض عند الضغط على المنتج)
            ing_map = agg[pid].setdefault("_ingredients", {})
            for ing in m.get("consumed_ingredients", []) or []:
                rid = ing.get("raw_material_id") or ing.get("raw_material_name")
                if not rid:
                    continue
                d = ing_map.setdefault(rid, {
                    "name": ing.get("raw_material_name", "—"),
                    "unit": ing.get("unit", ""),
                    "quantity": 0.0,
                    "cost_before_waste": 0.0,
                    "cost_after_waste": 0.0,
                })
                d["quantity"] += ing.get("quantity", 0) or 0
                d["cost_before_waste"] += ing.get("cost_before_waste", 0) or 0
                d["cost_after_waste"] += ing.get("cost_after_waste", 0) or 0
    
    # حساب الفروق والنسب
    rows = []
    total_before = 0.0
    total_after = 0.0
    for entry in agg.values():
        # ⭐ استخرج تفصيل المكوّنات (إن وُجد) قبل النسخ
        ing_detail = entry.pop("_ingredients", {})
        before = round(entry["cost_before_waste"], 2)
        after = round(entry["cost_after_waste"], 2)
        diff = round(after - before, 2)
        waste_pct = round(((after - before) / before * 100), 2) if before > 0 else 0.0
        details = []
        for d in ing_detail.values():
            d_before = round(d["cost_before_waste"], 2)
            d_after = round(d["cost_after_waste"], 2)
            details.append({
                "name": d["name"],
                "unit": d["unit"],
                "quantity": round(d["quantity"], 3),
                "cost_before_waste": d_before,
                "cost_after_waste": d_after,
                "waste_value": round(d_after - d_before, 2),
            })
        details.sort(key=lambda x: x["waste_value"], reverse=True)
        rows.append({
            **entry,
            "cost_before_waste": before,
            "cost_after_waste": after,
            "waste_value": diff,
            "waste_percentage": waste_pct,
            "details": details,
        })
        total_before += before
        total_after += after
    
    # ترتيب: الأعلى هدراً أولاً
    rows.sort(key=lambda r: r["waste_value"], reverse=True)
    
    total_diff = round(total_after - total_before, 2)
    total_pct = round(((total_after - total_before) / total_before * 100), 2) if total_before > 0 else 0.0
    
    return {
        "rows": rows,
        "summary": {
            "total_cost_before_waste": round(total_before, 2),
            "total_cost_after_waste": round(total_after, 2),
            "total_waste_value": total_diff,
            "total_waste_percentage": total_pct,
            "items_count": len(rows),
            "movements_count": len(mfg_movements),
            "period": {"start": start_date, "end": end_date},
        },
        "filters": {
            "branch_id": branch_id,
            "receiving_branch_id": receiving_branch_id,
            "group_by": group_by,
        },
    }


# ============================================================================
# 📊 تقرير هدر وتكلفة مواد الفروع (مبني على المبيعات + الجرد)
# ============================================================================

_BR_WASTE_WEIGHT_MAP = {
    "غرام": 1.0, "كغم": 1000.0, "كيلو": 1000.0, "كجم": 1000.0,
    "gram": 1.0, "kg": 1000.0,
    "مل": 1.0, "لتر": 1000.0, "ml": 1.0, "liter": 1000.0, "l": 1000.0,
}


def _br_convert_consumption(consumption_qty, consumption_unit, main_unit, piece_weight, piece_weight_unit):
    """يُحوّل كمية مستهلكة من وحدة الرابط إلى الوحدة الرئيسية للمنتج المُصنّع
    (مطابق لمنطق الخصم الفعلي في server.py)."""
    cu = (consumption_unit or "").strip()
    mu = (main_unit or "").strip()
    pwu = (piece_weight_unit or "").strip()
    pw = float(piece_weight or 0)
    if not cu or cu == mu:
        return consumption_qty
    if cu == pwu and pw > 0:
        return consumption_qty / pw
    cf = _BR_WASTE_WEIGHT_MAP.get(cu)
    mf = _BR_WASTE_WEIGHT_MAP.get(mu)
    if cf is not None and mf is not None:
        return consumption_qty * cf / mf
    pf = _BR_WASTE_WEIGHT_MAP.get(pwu)
    if cf is not None and pf is not None and pw > 0:
        return (consumption_qty * cf / pf) / pw
    return consumption_qty


@router.get("/reports/branch-waste-efficiency")
async def branch_waste_efficiency_report(
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    branch_id: Optional[str] = None,
    current_user: dict = Depends(get_current_user),
):
    """⭐ تقرير الفروع: تكلفة المواد (المنتجات المُصنّعة) المُستهلكة عبر المبيعات لكل فرع،
    قبل/بعد الهدر (حسب نسب الهدر المعرّفة)، بالإضافة لقيمة الفقد الفعلي من الجرد (variance).

    - يعتمد على الطلبات (orders) المُفكَّكة إلى مكوّناتها المُصنّعة (مطابق للخصم الفعلي).
    - branch_id: فلترة بفرع البيع. اختياري (الكل عند الغياب).
    - الفقد الفعلي: من حركات branch_loss الناتجة عن الجرد.
    """
    role = (current_user or {}).get("role", "")
    if role not in ("admin", "super_admin", "manager", "branch_manager"):
        raise HTTPException(status_code=403, detail="هذا التقرير متاح للمالك/المدير فقط")

    db = get_db()
    tenant_id = current_user.get("tenant_id")

    if not start_date:
        start_date = (datetime.now(timezone.utc) - timedelta(days=30)).date().isoformat()
    if not end_date:
        end_date = datetime.now(timezone.utc).date().isoformat()

    # === الطلبات في الفترة (حسب business_date مع fallback لـ created_at) ===
    s_iso = start_date + "T00:00:00"
    e_iso = end_date + "T23:59:59"
    orders_query = {
        "status": {"$nin": ["cancelled", "refunded"]},
        "$or": [
            {"business_date": {"$gte": start_date, "$lte": end_date}},
            {"business_date": {"$exists": False}, "created_at": {"$gte": s_iso, "$lte": e_iso}},
            {"business_date": None, "created_at": {"$gte": s_iso, "$lte": e_iso}},
        ],
    }
    if branch_id:
        orders_query["branch_id"] = branch_id
    if tenant_id:
        orders_query["tenant_id"] = tenant_id

    day_orders = await db.orders.find(
        orders_query, {"_id": 0, "items": 1}
    ).to_list(20000)

    # تحميل المنتجات النهائية المرتبطة
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

    # تحميل المنتجات المُصنّعة (تكلفة الوحدة قبل/بعد الهدر + الوحدة)
    mp_ids = set()
    for p in products_map.values():
        links = list(p.get("manufactured_links") or [])
        if not links and p.get("manufactured_product_id"):
            links = [{"manufactured_product_id": p.get("manufactured_product_id")}]
        for lk in links:
            if lk.get("manufactured_product_id"):
                mp_ids.add(lk["manufactured_product_id"])
    mp_map = {}
    if mp_ids:
        async for mp in db.manufactured_products.find(
            {"id": {"$in": list(mp_ids)}},
            {"_id": 0},
        ):
            mp_map[mp["id"]] = mp

    # تجميع الكميات المُستهلكة لكل منتج مُصنّع
    consumed = {}  # mp_id -> qty
    for o in day_orders:
        for it in o.get("items", []) or []:
            qty_sold = float(it.get("quantity", 0) or 0)
            if qty_sold <= 0:
                continue
            prod = products_map.get(it.get("product_id"))
            if not prod:
                continue
            links = list(prod.get("manufactured_links") or [])
            if not links and prod.get("manufactured_product_id"):
                links = [{"manufactured_product_id": prod.get("manufactured_product_id"),
                          "consumption_qty": prod.get("manufactured_consumption_qty") or 1}]
            for lk in links:
                mp_id = lk.get("manufactured_product_id")
                if not mp_id:
                    continue
                cq = float(lk.get("consumption_qty") or 1)
                cu = lk.get("consumption_unit")
                mp = mp_map.get(mp_id)
                if cu and mp:
                    cq = _br_convert_consumption(cq, cu, mp.get("unit") or "حبة",
                                                 float(mp.get("piece_weight") or 0), mp.get("piece_weight_unit") or "")
                consumed[mp_id] = consumed.get(mp_id, 0) + cq * qty_sold

    # === الفقد الفعلي من الجرد (branch_loss) ===
    loss_query = {
        "type": "branch_loss",
        "created_at": {"$gte": s_iso, "$lte": e_iso},
    }
    if branch_id:
        loss_query["branch_id"] = branch_id
    if tenant_id:
        loss_query["$or"] = [
            {"tenant_id": tenant_id}, {"tenant_id": {"$exists": False}}, {"tenant_id": None},
        ]
    loss_map = {}  # mp_id -> {qty, value}
    async for lm in db.inventory_movements.find(loss_query, {"_id": 0}):
        pid = lm.get("product_id")
        if not pid:
            continue
        d = loss_map.setdefault(pid, {"qty": 0.0, "value": 0.0})
        d["qty"] += abs(float(lm.get("quantity", 0) or 0))
        d["value"] += abs(float(lm.get("total_value") or lm.get("cost_after_waste") or 0))

    # === بناء الصفوف ===
    rows = []
    total_before = total_after = total_loss = 0.0
    all_ids = set(consumed.keys()) | set(loss_map.keys())
    for mp_id in all_ids:
        mp = mp_map.get(mp_id)
        if not mp:
            mp = await db.manufactured_products.find_one(
                {"id": mp_id}, {"_id": 0},
            ) or {}
        qty = round(consumed.get(mp_id, 0.0), 3)
        # ⭐ تكلفة الوحدة (لا تكلفة الدفعة) — نفس مصدر الحقيقة المستخدم في المبيعات/POS
        # (raw_material_cost هو إجمالي تكلفة الدفعة، لذا يجب القسمة على الإنتاجية).
        try:
            await _enrich_unit_cost_fields(db, mp)
        except Exception:
            pass
        unit_after = float(mp.get("unit_cost_after_waste") or 0)
        unit_before = float(mp.get("unit_cost_before_waste") or unit_after or 0)
        cost_before = round(qty * unit_before, 2)
        cost_after = round(qty * unit_after, 2)
        loss = loss_map.get(mp_id, {"qty": 0.0, "value": 0.0})
        waste_val = round(cost_after - cost_before, 2)
        waste_pct = round((waste_val / cost_before * 100), 2) if cost_before > 0 else 0.0
        rows.append({
            "id": mp_id,
            "name": mp.get("name") or "—",
            "unit": mp.get("unit") or "",
            "quantity": qty,
            "cost_before_waste": cost_before,
            "cost_after_waste": cost_after,
            "waste_value": waste_val,
            "waste_percentage": waste_pct,
            "loss_qty": round(loss["qty"], 3),
            "loss_value": round(loss["value"], 2),
        })
        total_before += cost_before
        total_after += cost_after
        total_loss += loss["value"]

    rows.sort(key=lambda r: (r["loss_value"] + r["waste_value"]), reverse=True)
    total_diff = round(total_after - total_before, 2)
    total_pct = round((total_diff / total_before * 100), 2) if total_before > 0 else 0.0

    # === فقد مواد التغليف من الجرد (branch_packaging_loss) ===
    pkg_loss_query = {
        "type": "branch_packaging_loss",
        "created_at": {"$gte": s_iso, "$lte": e_iso},
    }
    if branch_id:
        pkg_loss_query["branch_id"] = branch_id
    if tenant_id:
        pkg_loss_query["$or"] = [
            {"tenant_id": tenant_id}, {"tenant_id": {"$exists": False}}, {"tenant_id": None},
        ]
    pkg_agg = {}  # packaging_material_id -> {name, unit, qty, value}
    pkg_total_loss = 0.0
    async for pm in db.inventory_movements.find(pkg_loss_query, {"_id": 0}):
        pid = pm.get("product_id") or pm.get("material_name") or "—"
        d = pkg_agg.setdefault(pid, {
            "id": pid,
            "name": pm.get("product_name") or pm.get("material_name") or "—",
            "unit": pm.get("unit") or "قطعة",
            "loss_qty": 0.0,
            "loss_value": 0.0,
        })
        qv = abs(float(pm.get("quantity", 0) or 0))
        vv = abs(float(pm.get("total_value") or pm.get("cost_after_waste") or 0))
        d["loss_qty"] += qv
        d["loss_value"] += vv
        pkg_total_loss += vv
    packaging_rows = []
    for d in pkg_agg.values():
        packaging_rows.append({
            **d,
            "loss_qty": round(d["loss_qty"], 3),
            "loss_value": round(d["loss_value"], 2),
        })
    packaging_rows.sort(key=lambda r: r["loss_value"], reverse=True)

    return {
        "rows": rows,
        "summary": {
            "total_cost_before_waste": round(total_before, 2),
            "total_cost_after_waste": round(total_after, 2),
            "total_waste_value": total_diff,
            "total_waste_percentage": total_pct,
            "total_loss_value": round(total_loss, 2),
            "items_count": len(rows),
            "orders_count": len(day_orders),
            "period": {"start": start_date, "end": end_date},
        },
        "packaging_rows": packaging_rows,
        "packaging_summary": {
            "total_loss_value": round(pkg_total_loss, 2),
            "items_count": len(packaging_rows),
        },
        "filters": {"branch_id": branch_id},
    }


@router.get("/reports/branch-comparison")
async def branch_comparison_report(
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    current_user: dict = Depends(get_current_user),
):
    """⭐ لوحة مقارنة الفروع: نسبة الفقد + تكلفة المواد لكل فرع جنباً إلى جنب.
    يفكّك مبيعات كل فرع لمكوّناتها المُصنّعة، ويضيف الفقد الفعلي من الجرد (branch_loss)،
    ويرتّب الفروع من الأعلى هدراً للأقل."""
    role = (current_user or {}).get("role", "")
    if role not in ("admin", "super_admin", "manager", "branch_manager"):
        raise HTTPException(status_code=403, detail="هذا التقرير متاح للمالك/المدير فقط")

    db = get_db()
    tenant_id = current_user.get("tenant_id")

    if not start_date:
        start_date = (datetime.now(timezone.utc) - timedelta(days=30)).date().isoformat()
    if not end_date:
        end_date = datetime.now(timezone.utc).date().isoformat()
    s_iso = start_date + "T00:00:00"
    e_iso = end_date + "T23:59:59"

    # === الطلبات في الفترة (كل الفروع) ===
    orders_query = {
        "status": {"$nin": ["cancelled", "refunded"]},
        "$or": [
            {"business_date": {"$gte": start_date, "$lte": end_date}},
            {"business_date": {"$exists": False}, "created_at": {"$gte": s_iso, "$lte": e_iso}},
            {"business_date": None, "created_at": {"$gte": s_iso, "$lte": e_iso}},
        ],
    }
    if tenant_id:
        orders_query["tenant_id"] = tenant_id
    day_orders = await db.orders.find(orders_query, {"_id": 0, "items": 1, "branch_id": 1}).to_list(50000)

    # تحميل المنتجات النهائية + المُصنّعة دفعة واحدة
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
    mp_map = {}
    if mp_ids:
        async for mp in db.manufactured_products.find(
            {"id": {"$in": list(mp_ids)}},
            {"_id": 0, "id": 1, "unit": 1, "piece_weight": 1, "piece_weight_unit": 1,
             "raw_material_cost": 1, "raw_material_cost_after_waste": 1},
        ):
            mp_map[mp["id"]] = mp

    # === تجميع التكلفة لكل فرع ===
    branch_agg = {}  # branch_id -> {before, after}
    for o in day_orders:
        bid = o.get("branch_id") or "—"
        agg = branch_agg.setdefault(bid, {"before": 0.0, "after": 0.0})
        for it in o.get("items", []) or []:
            qty_sold = float(it.get("quantity", 0) or 0)
            if qty_sold <= 0:
                continue
            prod = products_map.get(it.get("product_id"))
            if not prod:
                continue
            links = list(prod.get("manufactured_links") or [])
            if not links and prod.get("manufactured_product_id"):
                links = [{"manufactured_product_id": prod.get("manufactured_product_id"),
                          "consumption_qty": prod.get("manufactured_consumption_qty") or 1}]
            for lk in links:
                mp_id = lk.get("manufactured_product_id")
                if not mp_id:
                    continue
                cq = float(lk.get("consumption_qty") or 1)
                cu = lk.get("consumption_unit")
                mp = mp_map.get(mp_id)
                if not mp:
                    continue
                if cu:
                    cq = _br_convert_consumption(cq, cu, mp.get("unit") or "حبة",
                                                 float(mp.get("piece_weight") or 0), mp.get("piece_weight_unit") or "")
                consumed_qty = cq * qty_sold
                agg["before"] += consumed_qty * float(mp.get("raw_material_cost") or 0)
                agg["after"] += consumed_qty * float(mp.get("raw_material_cost_after_waste") or mp.get("raw_material_cost") or 0)

    # === الفقد الفعلي من الجرد لكل فرع ===
    loss_query = {"type": "branch_loss", "created_at": {"$gte": s_iso, "$lte": e_iso}}
    if tenant_id:
        loss_query["$or"] = [
            {"tenant_id": tenant_id}, {"tenant_id": {"$exists": False}}, {"tenant_id": None},
        ]
    branch_loss = {}
    async for lm in db.inventory_movements.find(loss_query, {"_id": 0, "branch_id": 1, "total_value": 1, "cost_after_waste": 1}):
        bid = lm.get("branch_id") or "—"
        branch_loss[bid] = branch_loss.get(bid, 0.0) + abs(float(lm.get("total_value") or lm.get("cost_after_waste") or 0))

    # === فقد مواد التغليف من الجرد لكل فرع ===
    pkg_loss_query = {"type": "branch_packaging_loss", "created_at": {"$gte": s_iso, "$lte": e_iso}}
    if tenant_id:
        pkg_loss_query["$or"] = [
            {"tenant_id": tenant_id}, {"tenant_id": {"$exists": False}}, {"tenant_id": None},
        ]
    branch_pkg_loss = {}
    async for pm in db.inventory_movements.find(pkg_loss_query, {"_id": 0, "branch_id": 1, "total_value": 1, "cost_after_waste": 1}):
        bid = pm.get("branch_id") or "—"
        branch_pkg_loss[bid] = branch_pkg_loss.get(bid, 0.0) + abs(float(pm.get("total_value") or pm.get("cost_after_waste") or 0))

    # أسماء الفروع
    branch_names = {}
    async for b in db.branches.find({}, {"_id": 0, "id": 1, "name": 1}):
        branch_names[b["id"]] = b.get("name")

    # === بناء الصفوف ===
    rows = []
    all_bids = set(branch_agg.keys()) | set(branch_loss.keys()) | set(branch_pkg_loss.keys())
    for bid in all_bids:
        agg = branch_agg.get(bid, {"before": 0.0, "after": 0.0})
        before = round(agg["before"], 2)
        after = round(agg["after"], 2)
        waste_value = round(after - before, 2)
        loss_value = round(branch_loss.get(bid, 0.0), 2)
        packaging_loss = round(branch_pkg_loss.get(bid, 0.0), 2)
        # نسبة الفقد = (الهدر + الفقد الفعلي) / تكلفة المواد بعد الهدر
        denom = after if after > 0 else 0
        loss_pct = round(((waste_value + loss_value) / denom * 100), 2) if denom > 0 else 0.0
        rows.append({
            "branch_id": bid,
            "branch_name": branch_names.get(bid) or (bid if bid != "—" else "غير محدد"),
            "cost_before_waste": before,
            "cost_after_waste": after,
            "waste_value": waste_value,
            "loss_value": loss_value,
            "packaging_loss": packaging_loss,
            "total_loss": round(waste_value + loss_value, 2),
            "loss_percentage": loss_pct,
        })

    rows.sort(key=lambda r: r["total_loss"], reverse=True)
    for i, r in enumerate(rows):
        r["rank"] = i + 1

    # ترتيب منفصل للفروع حسب فقد التغليف (الأعلى أولاً)
    packaging_ranking = sorted(
        [
            {"branch_id": r["branch_id"], "branch_name": r["branch_name"], "packaging_loss": r["packaging_loss"]}
            for r in rows if r["packaging_loss"] > 0
        ],
        key=lambda r: r["packaging_loss"], reverse=True,
    )
    for i, r in enumerate(packaging_ranking):
        r["rank"] = i + 1

    return {
        "rows": rows,
        "packaging_ranking": packaging_ranking,
        "summary": {
            "branches_count": len(rows),
            "total_cost_after_waste": round(sum(r["cost_after_waste"] for r in rows), 2),
            "total_loss": round(sum(r["total_loss"] for r in rows), 2),
            "total_actual_loss": round(sum(r["loss_value"] for r in rows), 2),
            "total_packaging_loss": round(sum(r["packaging_loss"] for r in rows), 2),
            "period": {"start": start_date, "end": end_date},
        },
    }







# ==================== PURCHASE REQUEST AUTO-SUGGESTIONS ====================

@router.post("/warehouse-purchase-requests/suggest-quantities")
async def suggest_purchase_quantities(
    payload: dict,
    current_user: dict = Depends(get_current_user),
):
    """يقترح كميات شراء ذكية لمواد خام محددة بناءً على استهلاكها التاريخي.
    
    Body: { "material_ids": [str], "days": 30 (default), "coverage_days": 7 (default) }
    """
    db = get_db()
    tenant_id = current_user.get("tenant_id")
    
    material_ids = payload.get("material_ids", []) or []
    days = int(payload.get("days", 30) or 30)
    coverage_days = int(payload.get("coverage_days", 7) or 7)
    
    if not material_ids:
        return {"suggestions": []}
    
    period_start = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()
    
    OUTGOING_TYPES = [
        "warehouse_to_manufacturing", "raw_material_to_manufacturing",
        "manufacturing_transfer", "manufacturing_consumption",
        "transfer_to_branch", "branch_request_fulfilled", "out",
    ]
    
    suggestions = []
    for mid in material_ids:
        mq = {"id": mid}
        if tenant_id:
            mq["$or"] = [
                {"tenant_id": tenant_id},
                {"tenant_id": {"$exists": False}},
                {"tenant_id": None},
            ]
        material = await db.raw_materials.find_one(mq, {"_id": 0})
        if not material:
            continue
        
        current_stock = float(material.get("quantity", 0) or 0)
        min_qty = float(material.get("min_quantity", 0) or 0)
        unit = material.get("unit", "")
        
        consumption_query = {
            "material_id": mid,
            "type": {"$in": OUTGOING_TYPES},
            "created_at": {"$gte": period_start},
        }
        if tenant_id:
            consumption_query["$or"] = [
                {"tenant_id": tenant_id},
                {"tenant_id": {"$exists": False}},
                {"tenant_id": None},
            ]
        total_consumed = 0.0
        async for m in db.inventory_movements.find(consumption_query, {"_id": 0, "quantity": 1}):
            total_consumed += float(m.get("quantity", 0) or 0)
        
        daily_avg = total_consumed / days if days > 0 else 0
        weekly_avg = daily_avg * 7
        
        target_stock = max(min_qty * 2, daily_avg * coverage_days * 2)
        suggested = max(0.0, target_stock - current_stock)
        
        if suggested >= 100:
            suggested = round(suggested / 10) * 10
        elif suggested >= 10:
            suggested = round(suggested / 5) * 5
        else:
            suggested = round(suggested, 2)
        
        if total_consumed == 0 and current_stock < min_qty:
            suggested = max(suggested, round((min_qty * 2) - current_stock, 2))
        
        reason_parts = []
        if daily_avg > 0:
            reason_parts.append(f"متوسط الاستهلاك اليومي ≈ {daily_avg:.2f} {unit}")
            reason_parts.append(f"الأسبوعي ≈ {weekly_avg:.1f} {unit}")
        if current_stock <= min_qty:
            reason_parts.append(f"⚠️ المتوفر ({current_stock:g}) ≤ الحد الأدنى ({min_qty:g})")
        if not reason_parts:
            reason_parts.append("لا يوجد استهلاك مسجل خلال الفترة")
        
        suggestions.append({
            "raw_material_id": mid,
            "name": material.get("name"),
            "unit": unit,
            "current_stock": round(current_stock, 2),
            "min_quantity": round(min_qty, 2),
            "total_consumed_period": round(total_consumed, 2),
            "daily_avg": round(daily_avg, 2),
            "weekly_avg": round(weekly_avg, 2),
            "target_stock": round(target_stock, 2),
            "suggested_qty": float(suggested),
            "coverage_days": coverage_days,
            "period_days": days,
            "reason": " • ".join(reason_parts),
        })
    
    return {"suggestions": suggestions}



# ==================== STOCKOUT PREDICTIONS (تنبؤ النفاد) ====================

@router.get("/raw-materials/stockout-predictions")
async def stockout_predictions(
    days_lookback: int = 30,
    current_user: dict = Depends(get_current_user),
):
    """تنبؤ ذكي بنفاد المخزون لكل مادة خام.
    
    لكل مادة:
    - يحسب متوسط الاستهلاك اليومي خلال آخر `days_lookback`.
    - يحسب الأيام المتبقية = current_stock / daily_avg.
    - تاريخ النفاد المتوقع = today + days_remaining.
    - يصنف الحالة: critical (≤3 أيام) | warning (≤7 أيام) | safe (>7 أيام) | no_consumption.
    
    متاح للمالك/المدير/أمين المخزن.
    """
    role = (current_user or {}).get("role", "")
    allowed_roles = ("admin", "general_manager", "super_admin", "manager", "branch_manager",
                     "warehouse", "warehouse_keeper", "stock_keeper")
    if role not in allowed_roles:
        raise HTTPException(status_code=403, detail="هذه الميزة متاحة للمالك/المدير/أمين المخزن")
    
    db = get_db()
    tenant_id = current_user.get("tenant_id")
    
    period_start = (datetime.now(timezone.utc) - timedelta(days=days_lookback)).isoformat()
    
    OUTGOING_TYPES = [
        "warehouse_to_manufacturing", "raw_material_to_manufacturing",
        "manufacturing_transfer", "manufacturing_consumption",
        "transfer_to_branch", "branch_request_fulfilled", "out",
    ]
    
    # كل المواد الخام
    mq = {}
    if tenant_id:
        mq["$or"] = [
            {"tenant_id": tenant_id},
            {"tenant_id": {"$exists": False}},
            {"tenant_id": None},
        ]
    materials = await db.raw_materials.find(mq, {"_id": 0}).to_list(5000)
    
    predictions = []
    for mat in materials:
        mid = mat.get("id")
        current_stock = float(mat.get("quantity", 0) or 0)
        min_qty = float(mat.get("min_quantity", 0) or 0)
        unit = mat.get("unit", "")
        
        cq = {
            "material_id": mid,
            "type": {"$in": OUTGOING_TYPES},
            "created_at": {"$gte": period_start},
        }
        if tenant_id:
            cq["$or"] = [
                {"tenant_id": tenant_id},
                {"tenant_id": {"$exists": False}},
                {"tenant_id": None},
            ]
        total_consumed = 0.0
        async for m in db.inventory_movements.find(cq, {"_id": 0, "quantity": 1}):
            total_consumed += float(m.get("quantity", 0) or 0)
        
        daily_avg = total_consumed / days_lookback if days_lookback > 0 else 0
        
        if daily_avg > 0:
            days_remaining = current_stock / daily_avg
            stockout_date = (datetime.now(timezone.utc) + timedelta(days=days_remaining)).date().isoformat()
        else:
            days_remaining = None  # لا استهلاك → غير محدد
            stockout_date = None
        
        # التصنيف
        if daily_avg == 0:
            status = "no_consumption"
        elif current_stock <= 0:
            status = "out_of_stock"
        elif days_remaining is not None and days_remaining <= 3:
            status = "critical"
        elif days_remaining is not None and days_remaining <= 7:
            status = "warning"
        else:
            status = "safe"
        
        predictions.append({
            "material_id": mid,
            "name": mat.get("name"),
            "unit": unit,
            "current_stock": round(current_stock, 2),
            "min_quantity": round(min_qty, 2),
            "daily_avg": round(daily_avg, 3),
            "weekly_avg": round(daily_avg * 7, 2),
            "days_remaining": round(days_remaining, 1) if days_remaining is not None else None,
            "stockout_date": stockout_date,
            "status": status,
            "below_min": current_stock <= min_qty and min_qty > 0,
        })
    
    # ترتيب: out_of_stock → critical → warning → below_min → safe → no_consumption
    status_order = {
        "out_of_stock": 0, "critical": 1, "warning": 2,
        "safe": 3, "no_consumption": 4,
    }
    predictions.sort(key=lambda p: (
        status_order.get(p["status"], 99),
        p["days_remaining"] if p["days_remaining"] is not None else 99999,
    ))
    
    summary = {
        "out_of_stock": sum(1 for p in predictions if p["status"] == "out_of_stock"),
        "critical": sum(1 for p in predictions if p["status"] == "critical"),
        "warning": sum(1 for p in predictions if p["status"] == "warning"),
        "safe": sum(1 for p in predictions if p["status"] == "safe"),
        "no_consumption": sum(1 for p in predictions if p["status"] == "no_consumption"),
        "total": len(predictions),
        "lookback_days": days_lookback,
    }
    return {"predictions": predictions, "summary": summary}
