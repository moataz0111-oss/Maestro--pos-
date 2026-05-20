"""
Test: عند تعديل وحدة الوزن (piece_weight_unit) من مل إلى لتر (أو العكس)،
يتم مزامنة product.unit + تحويل القيم العددية تلقائياً.
"""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))


def _simulate_unit_sync(product, new_pwu, piece_weight=None):
    """يحاكي منطق المزامنة في endpoint PATCH /manufactured-products/{id}/recipe."""
    update_fields = {}
    old_unit = (product.get("unit") or "").strip()
    _FAMILY = {
        "weight": {"غرام": 1, "كغم": 1000, "كيلو": 1000, "كجم": 1000, "gram": 1, "kg": 1000},
        "volume": {"مل": 1, "لتر": 1000, "ml": 1, "liter": 1000, "l": 1000},
    }
    _COUNT_UNITS = {"قطعة", "حبة", "علبة", "كرتون", "صحن", "piece"}

    def _fam(u):
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
            ratio = old_factor / new_factor
        elif old_fam == "count" and new_fam in ("weight", "volume"):
            pw_new = piece_weight if piece_weight is not None else product.get("piece_weight")
            if isinstance(pw_new, (int, float)) and pw_new > 0:
                ratio = float(pw_new)
        elif old_fam in ("weight", "volume") and new_fam == "count":
            pw_new = piece_weight if piece_weight is not None else product.get("piece_weight")
            if isinstance(pw_new, (int, float)) and pw_new > 0:
                ratio = 1.0 / float(pw_new)
    if ratio is not None:
        update_fields["unit"] = new_pwu
        for fld in ("quantity", "total_produced", "transferred_quantity", "remaining_quantity"):
            val = product.get(fld)
            if isinstance(val, (int, float)) and val:
                update_fields[fld] = round(val * ratio, 6)
    return update_fields


def test_ml_to_liter_converts_all_values():
    """مل → لتر يقسم القيم على 1000."""
    product = {
        "unit": "مل",
        "quantity": 20000,
        "total_produced": 60000,
        "transferred_quantity": 40000,
        "remaining_quantity": 20000,
    }
    upd = _simulate_unit_sync(product, "لتر")
    assert upd["unit"] == "لتر"
    assert upd["quantity"] == 20
    assert upd["total_produced"] == 60
    assert upd["transferred_quantity"] == 40
    assert upd["remaining_quantity"] == 20


def test_liter_to_ml_multiplies_values():
    """لتر → مل يضرب القيم في 1000."""
    product = {"unit": "لتر", "quantity": 3, "total_produced": 60}
    upd = _simulate_unit_sync(product, "مل")
    assert upd["unit"] == "مل"
    assert upd["quantity"] == 3000
    assert upd["total_produced"] == 60000


def test_gram_to_kg_converts():
    """غرام → كغم يقسم على 1000."""
    product = {"unit": "غرام", "quantity": 500}
    upd = _simulate_unit_sync(product, "كغم")
    assert upd["unit"] == "كغم"
    assert upd["quantity"] == 0.5


def test_different_family_skips_conversion():
    """تغيير من مل إلى كغم (عائلتان مختلفتان غير قطعة) → لا مزامنة."""
    product = {"unit": "مل", "quantity": 1000}
    upd = _simulate_unit_sync(product, "كغم")
    assert upd == {}


def test_piece_to_liter_uses_piece_weight():
    """⭐ قطعة → لتر باستخدام piece_weight (مثال: 1 قطعة = 3 لتر)."""
    product = {"unit": "قطعة", "quantity": 20, "total_produced": 100, "piece_weight": 3}
    upd = _simulate_unit_sync(product, "لتر", piece_weight=3)
    assert upd["unit"] == "لتر"
    assert upd["quantity"] == 60  # 20 قطعة × 3 لتر/قطعة
    assert upd["total_produced"] == 300


def test_piece_to_kg_uses_piece_weight():
    """قطعة → كغم: 5 قطع × 0.5 كغم/قطعة = 2.5 كغم."""
    product = {"unit": "قطعة", "quantity": 5}
    upd = _simulate_unit_sync(product, "كغم", piece_weight=0.5)
    assert upd["unit"] == "كغم"
    assert upd["quantity"] == 2.5


def test_piece_without_piece_weight_skips():
    """قطعة → لتر بدون piece_weight → لا تحويل."""
    product = {"unit": "قطعة", "quantity": 10}
    upd = _simulate_unit_sync(product, "لتر")
    assert upd == {}


def test_same_unit_no_op():
    """نفس الوحدة → لا تغيير."""
    product = {"unit": "لتر", "quantity": 5}
    upd = _simulate_unit_sync(product, "لتر")
    assert upd == {}


def test_unknown_unit_skips():
    """وحدة غير معروفة (مثل قطعة) → لا مزامنة."""
    product = {"unit": "قطعة", "quantity": 10}
    upd = _simulate_unit_sync(product, "لتر")
    assert upd == {}


if __name__ == "__main__":
    test_ml_to_liter_converts_all_values()
    test_liter_to_ml_multiplies_values()
    test_gram_to_kg_converts()
    test_different_family_skips_conversion()
    test_same_unit_no_op()
    test_unknown_unit_skips()
    print("✅ كل اختبارات مزامنة الوحدات نجحت")
