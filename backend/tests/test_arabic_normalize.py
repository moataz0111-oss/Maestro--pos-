"""اختبارات تطبيع النص العربي + المطابقة القوية لأسماء المنتجات مع طلبات الفروع.
يغطي اختلافات الإملاء التي كانت تكسر مطابقة التوفّر (P0)."""
import sys
import os

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from routes.inventory_system import (
    normalize_arabic,
    normalize_arabic_loose,
    match_product_by_name,
)


def test_alef_variants_match():
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


def test_empty():
    assert normalize_arabic("") == ""
    assert normalize_arabic(None) == ""
    assert normalize_arabic_loose("") == ""


# ---------- مطابقة المنتجات ----------

def _prods(*pairs):
    return [{"id": str(i), "name": n, "quantity": q} for i, (n, q) in enumerate(pairs)]


def test_match_exact_and_letter_variants():
    prods = _prods(("كراة مشروم", 200), ("لحم برغر", 50))
    assert match_product_by_name("كراه مشروم", prods)["quantity"] == 200  # ة/ه
    assert match_product_by_name("لحم برغر", prods)["quantity"] == 50


def test_match_al_prefix_loose():
    prods = _prods(("شرائح الطماطة", 500))
    m = match_product_by_name("شرائح طماطة", prods)
    assert m is not None and m["quantity"] == 500


def test_match_spelling_typo_fuzzy():
    prods = _prods(("موزريلا براد", 80))
    m = match_product_by_name("موزاريلا براد", prods)  # ألف زائدة داخلية
    assert m is not None and m["quantity"] == 80


def test_no_false_match_between_similar_families():
    # عائلة "بان" يجب ألا تتداخل
    prods = _prods(("بان كانتاكي", 342), ("بان فاهيتا", 81))
    m = match_product_by_name("بان 5انش", prods)
    # يجب ألا يُربط خطأً بأي من العائلة (أو يُرفض لأنه غامض/منخفض التشابه)
    assert m is None


def test_picks_largest_quantity_on_duplicate_name():
    prods = _prods(("ارز ريزو", -17), ("ارز ريزو", 300))
    assert match_product_by_name("ارز ريزو", prods)["quantity"] == 300


def test_unmatched_returns_none():
    prods = _prods(("لحم برغر", 50))
    assert match_product_by_name("شيء غير موجود تماما", prods) is None
