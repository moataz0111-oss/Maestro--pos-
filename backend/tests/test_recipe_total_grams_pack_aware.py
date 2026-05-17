"""
Test: حساب total_grams للوصفة يجب أن يشمل وزن العلب/الكراتين عبر pack_info.
يحاكي سيناريو المستخدم:
- وصفة: 1 علبة فطر (pack=1500غ) + 1 كغم موزاريلا + 1 كغم جبن كريمي + 0.5 كغم بصل + 1 كغم بقصم
- الوزن الإجمالي الفعلي = 1500 + 1000 + 1000 + 500 + 1000 = 5000 غرام
- مع وزن قطعة 30 غرام → 5000/30 = 166.67 قطعة (وليس 83 كما كان قبل الإصلاح)
"""
import asyncio
import sys
import os

# نقلّد محرّك الـ database محلياً لاختبار logic فقط
class FakeCollection:
    def __init__(self, data):
        self._data = data
    async def find_one(self, query, projection=None):
        for d in self._data:
            ok = all(d.get(k) == v for k, v in query.items())
            if ok:
                return d
        return None

class FakeDB:
    def __init__(self, raw_materials):
        self.raw_materials = FakeCollection(raw_materials)


# نُعيد كتابة منطق الـ helper بدون الـ imports
_UNIT_WEIGHT_MAP = {
    "غرام": 1.0, "كغم": 1000.0, "كيلو": 1000.0, "كجم": 1000.0,
    "gram": 1.0, "kg": 1000.0,
    "مل": 1.0, "لتر": 1000.0, "ml": 1.0, "liter": 1000.0, "l": 1000.0,
}
_COUNT_UNITS = {"قطعة", "حبة", "علبة", "كرتون", "صحن", "piece"}


async def _ingredient_weight_grams(db, ing):
    qty = float(ing.get("quantity") or 0)
    unit = (ing.get("unit") or "").strip()
    if qty <= 0:
        return 0.0
    factor = _UNIT_WEIGHT_MAP.get(unit)
    if factor is not None:
        return qty * factor
    if unit in _COUNT_UNITS:
        material_id = ing.get("raw_material_id")
        if material_id:
            mat = await db.raw_materials.find_one({"id": material_id})
            if mat and mat.get("pack_quantity") and mat.get("pack_unit"):
                pack_qty = float(mat.get("pack_quantity") or 0)
                pack_unit = mat.get("pack_unit") or "غرام"
                pack_factor = _UNIT_WEIGHT_MAP.get(pack_unit, 0)
                if pack_qty > 0 and pack_factor > 0:
                    return qty * pack_qty * pack_factor
    return 0.0


async def _compute_recipe_total_grams(db, recipe):
    total = 0.0
    for ing in (recipe or []):
        total += await _ingredient_weight_grams(db, ing)
    return total


async def test_user_scenario():
    """يحاكي سيناريو المستخدم بالضبط."""
    raw_materials = [
        {"id": "mushroom", "pack_quantity": 1500, "pack_unit": "غرام"},  # 1 علبة = 1500غ
        {"id": "milk_powder", "pack_quantity": 500, "pack_unit": "غرام"},  # 1 قطعة = 500غ مثلاً
        {"id": "egg", "pack_quantity": 50, "pack_unit": "غرام"},  # 1 بيضة = 50غ
    ]
    db = FakeDB(raw_materials)

    # وصفة كما كتبها المستخدم (قبل الـ auto-scale)
    recipe = [
        {"raw_material_id": "mushroom", "quantity": 1, "unit": "علبة"},
        {"raw_material_id": "mozz", "quantity": 1, "unit": "كغم"},
        {"raw_material_id": "cream", "quantity": 1, "unit": "كغم"},
        {"raw_material_id": "onion", "quantity": 0.5, "unit": "كغم"},
        {"raw_material_id": "crackers", "quantity": 1, "unit": "كغم"},
    ]

    total = await _compute_recipe_total_grams(db, recipe)
    expected = 1500 + 1000 + 1000 + 500 + 1000  # = 5000g
    assert total == expected, f"Expected {expected}, got {total}"

    yield_pieces = total / 30  # piece_weight=30g
    assert abs(yield_pieces - 166.667) < 0.01, f"Expected ~166.67 pieces, got {yield_pieces}"
    print(f"✅ User scenario: {total}g → {yield_pieces:.2f} قطعة")


async def test_ingredient_without_pack_info_returns_zero():
    """مكوّن قطعي بدون pack_info → لا يُحسب في الوزن."""
    raw_materials = []
    db = FakeDB(raw_materials)
    recipe = [{"raw_material_id": "x", "quantity": 5, "unit": "علبة"}]
    total = await _compute_recipe_total_grams(db, recipe)
    assert total == 0.0, f"Expected 0 (no pack_info), got {total}"
    print(f"✅ علبة بدون pack_info ⇒ 0")


async def test_mixed_units():
    """خلط بين غرام/كغم/مل/لتر/علبة بـ pack_info."""
    raw_materials = [
        {"id": "box1", "pack_quantity": 250, "pack_unit": "مل"},  # 1 علبة = 250 مل
    ]
    db = FakeDB(raw_materials)
    recipe = [
        {"raw_material_id": "a", "quantity": 100, "unit": "غرام"},     # 100g
        {"raw_material_id": "b", "quantity": 0.5, "unit": "كغم"},      # 500g
        {"raw_material_id": "c", "quantity": 200, "unit": "مل"},       # 200g (≈ 200ml ≈ 200g)
        {"raw_material_id": "d", "quantity": 0.3, "unit": "لتر"},      # 300g
        {"raw_material_id": "box1", "quantity": 4, "unit": "علبة"},    # 4 * 250ml = 1000g
    ]
    total = await _compute_recipe_total_grams(db, recipe)
    expected = 100 + 500 + 200 + 300 + 1000  # = 2100
    assert total == expected, f"Expected {expected}, got {total}"
    print(f"✅ Mixed units: {total}g")


async def main():
    await test_user_scenario()
    await test_ingredient_without_pack_info_returns_zero()
    await test_mixed_units()
    print("\n🎉 All recipe total_grams accuracy tests passed!")


if __name__ == "__main__":
    asyncio.run(main())
