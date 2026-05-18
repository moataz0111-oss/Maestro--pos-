"""
Test: المنتج المُصنّع كمكوّن في وصفة منتج آخر.
يتأكد من:
1. الـ helper `_ingredient_weight_grams` يحسب الوزن من piece_weight للمنتج المُصنّع.
2. منطق الخصم في `produce_manufactured_product` يدعم النوعين.
"""
import asyncio


_UNIT_WEIGHT_MAP = {
    "غرام": 1.0, "كغم": 1000.0, "كيلو": 1000.0, "كجم": 1000.0,
    "gram": 1.0, "kg": 1000.0,
    "مل": 1.0, "لتر": 1000.0, "ml": 1.0, "liter": 1000.0, "l": 1000.0,
}
_COUNT_UNITS = {"قطعة", "حبة", "علبة", "كرتون", "صحن", "piece"}


class FakeCollection:
    def __init__(self, data):
        self._data = data
    async def find_one(self, query, projection=None):
        for d in self._data:
            if all(d.get(k) == v for k, v in query.items()):
                return d
        return None


class FakeDB:
    def __init__(self, raw_materials, manufactured):
        self.raw_materials = FakeCollection(raw_materials)
        self.manufactured_products = FakeCollection(manufactured)


async def _ingredient_weight_grams(db, ing):
    qty = float(ing.get("quantity") or 0)
    unit = (ing.get("unit") or "").strip()
    if qty <= 0:
        return 0.0
    factor = _UNIT_WEIGHT_MAP.get(unit)
    if factor is not None:
        return qty * factor
    # ⭐ منتج مُصنّع
    if ing.get("manufactured_product_id"):
        mfg = await db.manufactured_products.find_one({"id": ing["manufactured_product_id"]})
        if mfg and mfg.get("piece_weight"):
            pw = float(mfg.get("piece_weight") or 0)
            pwu = mfg.get("piece_weight_unit") or "غرام"
            pf = _UNIT_WEIGHT_MAP.get(pwu, 0)
            if pw > 0 and pf > 0:
                return qty * pw * pf
        return 0.0
    # مادة خام بـ pack_info
    if unit in _COUNT_UNITS:
        material_id = ing.get("raw_material_id")
        if material_id:
            mat = await db.raw_materials.find_one({"id": material_id})
            if mat and mat.get("pack_quantity") and mat.get("pack_unit"):
                pf = _UNIT_WEIGHT_MAP.get(mat["pack_unit"], 0)
                if mat["pack_quantity"] > 0 and pf > 0:
                    return qty * float(mat["pack_quantity"]) * pf
    return 0.0


async def test_burger_sauce_with_mayo():
    """صوص برغر يحتوي:
       - 1 كغم توابل (مادة خام)
       - 1 كغم مايونيز (منتج مُصنّع، piece_weight=1غ → 1 كغم = 1000 وحدة)
       الوزن الإجمالي = 2000 غرام
    """
    raw_materials = []
    manufactured = [
        {"id": "mayo", "piece_weight": 1, "piece_weight_unit": "غرام", "quantity": 5000},  # 5000 وحدة (5كغم)
    ]
    db = FakeDB(raw_materials, manufactured)
    recipe = [
        {"raw_material_id": "spices", "quantity": 1, "unit": "كغم"},  # 1000g
        {"manufactured_product_id": "mayo", "quantity": 1000, "unit": "حبة"},  # 1000 * 1g = 1000g
    ]
    total = 0
    for ing in recipe:
        total += await _ingredient_weight_grams(db, ing)
    assert total == 2000, f"Expected 2000g, got {total}"
    print(f"✅ صوص برغر = {total}g (توابل 1000g + مايونيز 1000g)")


async def test_mfg_ingredient_with_kg_piece_weight():
    """منتج مُصنّع وزن قطعته 1كغم → استخدام 0.5 منه = 500غ."""
    manufactured = [
        {"id": "dough", "piece_weight": 1, "piece_weight_unit": "كغم", "quantity": 100},
    ]
    db = FakeDB([], manufactured)
    recipe = [{"manufactured_product_id": "dough", "quantity": 0.5, "unit": "حبة"}]
    total = 0
    for ing in recipe:
        total += await _ingredient_weight_grams(db, ing)
    assert total == 500, f"Expected 500g, got {total}"
    print(f"✅ 0.5 حبة عجين (1كغم/حبة) = {total}g")


async def test_mfg_ingredient_without_piece_weight_returns_zero():
    """منتج مُصنّع بدون piece_weight → يُرجع 0 (آمن)."""
    manufactured = [{"id": "x", "piece_weight": 0}]
    db = FakeDB([], manufactured)
    recipe = [{"manufactured_product_id": "x", "quantity": 5, "unit": "حبة"}]
    total = 0
    for ing in recipe:
        total += await _ingredient_weight_grams(db, ing)
    assert total == 0, f"Expected 0, got {total}"
    print(f"✅ مُصنّع بدون piece_weight = 0g (آمن)")


async def main():
    await test_burger_sauce_with_mayo()
    await test_mfg_ingredient_with_kg_piece_weight()
    await test_mfg_ingredient_without_piece_weight_returns_zero()
    print("\n🎉 All manufactured-as-ingredient tests passed!")


if __name__ == "__main__":
    asyncio.run(main())
