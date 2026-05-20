"""
Test: تحويل للتصنيع يُحدّث cost_per_unit بطريقة المتوسط المُرجّح،
ويُستخدم سعر التحويل الجديد مباشرة لو نفذ المخزن السابق.
"""


def _simulate_transfer_cost(existing, new_qty, new_cpu):
    """يحاكي منطق احتساب cost_per_unit في transfer_to_manufacturing."""
    old_qty = float(existing.get("quantity") or 0)
    old_cpu = float(existing.get("cost_per_unit") or 0)
    total_qty = old_qty + new_qty
    if old_qty <= 0:
        return new_cpu
    if total_qty > 0:
        return round((old_qty * old_cpu + new_qty * new_cpu) / total_qty, 6)
    return old_cpu


def test_depleted_stock_uses_new_price():
    """نفذ المخزن (qty=0) ثم تحويل جديد بسعر مختلف → السعر الجديد."""
    existing = {"quantity": 0, "cost_per_unit": 100}
    cpu = _simulate_transfer_cost(existing, 10, 250)
    assert cpu == 250


def test_weighted_average_when_stock_remains():
    """5 قطع @100 + 5 قطع جديدة @200 = متوسط مرجّح 150."""
    existing = {"quantity": 5, "cost_per_unit": 100}
    cpu = _simulate_transfer_cost(existing, 5, 200)
    assert cpu == 150.0


def test_weighted_unequal_quantities():
    """10 قطع @ 90 + 5 قطع @ 120 = (900+600)/15 = 100."""
    existing = {"quantity": 10, "cost_per_unit": 90}
    cpu = _simulate_transfer_cost(existing, 5, 120)
    assert cpu == 100.0


def test_first_transfer_no_existing():
    """لا يوجد رصيد سابق → استخدم السعر الجديد."""
    existing = {"quantity": 0, "cost_per_unit": 0}
    cpu = _simulate_transfer_cost(existing, 7, 333.33)
    assert cpu == 333.33


if __name__ == "__main__":
    test_depleted_stock_uses_new_price()
    test_weighted_average_when_stock_remains()
    test_weighted_unequal_quantities()
    test_first_transfer_no_existing()
    print("✅ كل اختبارات تحديث سعر التحويل نجحت")
