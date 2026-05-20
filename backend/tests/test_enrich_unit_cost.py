"""Test that GET /api/manufactured-products enriches products with unit_cost_after_waste.

This ensures a single source of truth between the manufacturing page cards and
MfgLinksEditor in Settings. Without enrichment, the two UIs computed different
costs because Settings.js lacked access to raw_materials pack_info.
"""
import asyncio
import os
import sys
from unittest.mock import AsyncMock, MagicMock

# Ensure backend imports work
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from routes.inventory_system import _enrich_unit_cost_fields


def _make_db_with_raw_materials(raw_materials):
    """Build a mock db where db.raw_materials.find returns an async iterator."""
    class AsyncIter:
        def __init__(self, items):
            self._items = list(items)
            self._idx = 0

        def __aiter__(self):
            return self

        async def __anext__(self):
            if self._idx >= len(self._items):
                raise StopAsyncIteration
            item = self._items[self._idx]
            self._idx += 1
            return item

    raw_mats_collection = MagicMock()
    raw_mats_collection.find = MagicMock(return_value=AsyncIter(raw_materials))

    db = MagicMock()
    db.raw_materials = raw_mats_collection
    return db


def test_weight_based_recipe_unit_cost():
    """Recipe with 60kg total weight, piece_weight=120g → yield=500, cost=batch/500."""
    db = _make_db_with_raw_materials([])
    product = {
        "unit": "حبة",
        "piece_weight": 120,
        "piece_weight_unit": "غرام",
        "raw_material_cost_after_waste": 736475,
        "cost_before_waste": 641168,
        "quantity": 500,
        "recipe": [
            {"raw_material_id": "x", "unit": "كغم", "quantity": 60},  # 60 kg = 60000 g
        ],
    }
    asyncio.run(_enrich_unit_cost_fields(db, product))
    assert product["computed_yield"] == 500.0
    assert abs(product["unit_cost_after_waste"] - 1472.95) < 0.1  # 736475/500


def test_count_based_recipe_with_pack_info():
    """Recipe with 3 قطعة (each = 46 شريحة) → yield=3 حبة when piece_weight=46 شريحة."""
    db = _make_db_with_raw_materials([
        {"id": "cheese", "pack_quantity": 46, "pack_unit": "شريحة"},
    ])
    product = {
        "unit": "حبة",
        "piece_weight": 46,
        "piece_weight_unit": "شريحة",
        "raw_material_cost_after_waste": 13800,
        "cost_before_waste": 13800,
        "quantity": 3,
        "recipe": [
            {"raw_material_id": "cheese", "unit": "قطعة", "quantity": 3},
        ],
    }
    asyncio.run(_enrich_unit_cost_fields(db, product))
    assert product["computed_yield"] == 3.0
    assert abs(product["unit_cost_after_waste"] - 4600.0) < 0.01


def test_no_piece_weight_falls_back_to_stored_quantity():
    """Without piece_weight, use stored quantity as yield."""
    db = _make_db_with_raw_materials([])
    product = {
        "unit": "قطعة",
        "piece_weight": 0,
        "raw_material_cost_after_waste": 14400,
        "cost_before_waste": 14400,
        "quantity": 36,
        "recipe": [],
    }
    asyncio.run(_enrich_unit_cost_fields(db, product))
    assert product["unit_cost_after_waste"] == 400.0  # 14400/36


def test_zero_yield_uses_quantity_then_one():
    """Empty recipe + zero quantity → denom=1 → unit_cost = batch_cost."""
    db = _make_db_with_raw_materials([])
    product = {
        "unit": "حبة",
        "piece_weight": 0,
        "raw_material_cost_after_waste": 5000,
        "cost_before_waste": 5000,
        "quantity": 0,
        "recipe": [],
    }
    asyncio.run(_enrich_unit_cost_fields(db, product))
    assert product["unit_cost_after_waste"] == 5000.0
