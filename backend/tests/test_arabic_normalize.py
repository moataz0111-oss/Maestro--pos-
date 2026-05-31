"""اختبارات تطبيع النص العربي لمطابقة أسماء المنتجات مع طلبات الفروع.
يغطي اختلافات الإملاء الشائعة التي كانت تكسر مطابقة التوفّر (P0)."""
import sys
import os

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from routes.inventory_system import normalize_arabic


def test_alef_variants_match():
    # أ / إ / آ / ا يجب أن تتطابق
    assert normalize_arabic("أحمد") == normalize_arabic("احمد")
    assert normalize_arabic("إجاص") == normalize_arabic("اجاص")
    assert normalize_arabic("آيس كريم") == normalize_arabic("ايس كريم")


def test_taa_marbuta_and_yaa():
    assert normalize_arabic("شاورمة") == normalize_arabic("شاورمه")
    assert normalize_arabic("حلوى") == normalize_arabic("حلوي")


def test_extra_spaces_and_diacritics():
    assert normalize_arabic("لحم  برغر") == normalize_arabic("لحم برغر")
    assert normalize_arabic("  جبنة  ") == normalize_arabic("جبنه")
    assert normalize_arabic("بُرغُر") == normalize_arabic("برغر")


def test_arabic_indic_digits():
    assert normalize_arabic("منتج ١٢٣") == normalize_arabic("منتج 123")


def test_tatweel_removed():
    assert normalize_arabic("جــبنة") == normalize_arabic("جبنه")


def test_empty():
    assert normalize_arabic("") == ""
    assert normalize_arabic(None) == ""


def test_qty_mapping_scenario():
    """محاكاة بناء خريطة الكميات بالاسم المُطبّع كما في get_branch_requests."""
    factory = [
        {"id": "1", "name": "جبنة موزاريلا", "quantity": 200},
        {"id": "2", "name": "لحم برغر", "quantity": 50},
    ]
    qty_by_name = {}
    for p in factory:
        nm = normalize_arabic(p["name"])
        q = float(p["quantity"])
        if nm not in qty_by_name or q > qty_by_name[nm]:
            qty_by_name[nm] = q

    # طلب فرع باختلاف إملائي (تاء مربوطة + مسافة زائدة)
    req_item = {"product_name": "جبنه  موزاريلا", "available_quantity": -17}
    nm = normalize_arabic(req_item["product_name"])
    assert nm in qty_by_name
    assert qty_by_name[nm] == 200  # ليس -17
