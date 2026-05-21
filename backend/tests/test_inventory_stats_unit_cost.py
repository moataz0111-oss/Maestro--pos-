"""Test that GET /api/inventory-stats computes manufactured_products total_value
correctly using per-unit cost, not per-batch cost.

Regression: previously the endpoint did `quantity * raw_material_cost` where
`raw_material_cost` is the entire BATCH cost. For a product with quantity=6000
حصة and batch_cost=2,349,964 IQD, this gave 14 BILLION instead of ~2.35M.
"""
import asyncio
from unittest.mock import AsyncMock, MagicMock, patch


def _async_iter(items):
    class It:
        def __init__(self, xs):
            self._xs = list(xs)
            self._i = 0
        def __aiter__(self):
            return self
        async def __anext__(self):
            if self._i >= len(self._xs):
                raise StopAsyncIteration
            v = self._xs[self._i]
            self._i += 1
            return v
    return It(items)


def _build_mock_db(raw_materials, manufacturing, products):
    db = MagicMock()

    # raw_materials.find().to_list()
    rm_cursor = MagicMock()
    rm_cursor.to_list = AsyncMock(return_value=raw_materials)
    db.raw_materials = MagicMock()
    db.raw_materials.find = MagicMock(return_value=rm_cursor)
    # raw_materials.find (async iterator for _enrich_unit_cost_fields)
    db.raw_materials.find = MagicMock(side_effect=lambda *a, **kw: (
        _async_iter([]) if (a and isinstance(a[0], dict) and "id" in a[0]) else rm_cursor
    ))
    # Allow both .find({}, {}).to_list() and async for mat in db.raw_materials.find(...)
    # Simpler: use a side_effect that returns the right type based on args
    def rm_find(*args, **kwargs):
        # If first arg is a filter dict with $in, return async iter
        if args and isinstance(args[0], dict) and any(k in args[0] for k in ("id",)):
            return _async_iter([])
        return rm_cursor
    db.raw_materials.find = MagicMock(side_effect=rm_find)

    mi_cursor = MagicMock()
    mi_cursor.to_list = AsyncMock(return_value=manufacturing)
    db.manufacturing_inventory = MagicMock()
    db.manufacturing_inventory.find = MagicMock(return_value=mi_cursor)

    mp_cursor = MagicMock()
    mp_cursor.to_list = AsyncMock(return_value=products)
    db.manufactured_products = MagicMock()
    db.manufactured_products.find = MagicMock(return_value=mp_cursor)

    # Counts
    db.purchases_new = MagicMock()
    db.purchases_new.count_documents = AsyncMock(return_value=0)
    db.branch_orders_new = MagicMock()
    db.branch_orders_new.count_documents = AsyncMock(return_value=0)
    return db


from routes import inventory_system  # noqa: E402

def test_total_value_uses_per_unit_not_per_batch():
    """The fix: total_value = qty * unit_cost_after_waste (NOT * raw_material_cost)."""
    # Simulate "أرز ريزو" scenario
    products = [
        {
            "id": "rizo",
            "name": "أرز ريزو",
            "quantity": 6000,
            "unit": "غرام",
            "piece_weight": 167,
            "piece_weight_unit": "حصة",
            # Batch cost (the dangerous field used by the old bug)
            "raw_material_cost": 2_338_823,
            "raw_material_cost_after_waste": 2_349_964,
            "cost_before_waste": 2_338_823,
            "recipe": [
                {"raw_material_id": "rice", "unit": "كغم", "quantity": 1002},
            ],
        },
    ]
    raw_materials = [{"id": "rice", "quantity": 100, "cost_per_unit": 2000, "min_quantity": 0}]
    manufacturing = []
    db = _build_mock_db(raw_materials, manufacturing, products)

    with patch("routes.inventory_system.get_db", return_value=db):
        from routes.inventory_system import get_inventory_statistics
        result = asyncio.run(get_inventory_statistics())

    mp_stats = result["manufactured_products"]
    assert mp_stats["count"] == 1

    # Old bug would give 6000 * 2_349_964 = 14_099_784_000 (14 BILLION)
    # New fix: 6000 * unit_cost. unit_cost = 2_349_964 / yield.
    # yield = totalGrams/pieceGrams = 1002000 / 167 = 6000 → unit_cost ≈ 391.66 → total ≈ 2_349_964
    # Strict check: must be <= batch_cost (since quantity matches yield).
    assert mp_stats["total_value"] < 3_000_000, (
        f"total_value should be ~2.35M not billions. Got {mp_stats['total_value']:,.0f}"
    )
    # Sanity floor: should be close to batch cost when qty == yield
    assert mp_stats["total_value"] > 2_000_000


def test_total_value_when_quantity_less_than_yield():
    """If only half the produced stock remains, total_value should halve too."""
    products = [
        {
            "id": "p1",
            "name": "test",
            "quantity": 3000,  # half of the 6000 yielded
            "unit": "غرام",
            "piece_weight": 167,
            "piece_weight_unit": "حصة",
            "raw_material_cost": 2_338_823,
            "raw_material_cost_after_waste": 2_349_964,
            "cost_before_waste": 2_338_823,
            "recipe": [{"raw_material_id": "rice", "unit": "كغم", "quantity": 1002}],
        },
    ]
    db = _build_mock_db([], [], products)

    with patch("routes.inventory_system.get_db", return_value=db):
        from routes.inventory_system import get_inventory_statistics
        result = asyncio.run(get_inventory_statistics())

    # Expected ~ 1.17M (half of 2.35M)
    assert 1_000_000 < result["manufactured_products"]["total_value"] < 1_500_000
