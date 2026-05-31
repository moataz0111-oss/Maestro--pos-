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


class _AsyncIter:
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


def _make_db_with_raw_materials(raw_materials, manufactured_products=None):
    """Build a mock db where db.raw_materials.find and db.manufactured_products.find
    return async iterators."""
    raw_mats_collection = MagicMock()
    raw_mats_collection.find = MagicMock(return_value=_AsyncIter(raw_materials))

    mfg_collection = MagicMock()
    mfg_collection.find = MagicMock(return_value=_AsyncIter(manufactured_products or []))

    db = MagicMock()
    db.raw_materials = raw_mats_collection
    db.manufactured_products = mfg_collection
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



# ============================================================================
# 🥩 Beef Bacon scenario (regression for handoff bug)
# ============================================================================
# Recipe: 5 قطع لحم بقري (raw material, pack=550g/piece) → 2750g total.
# Manufactured product piece_weight = 30g/slice → yield = 91.67 slices.
# batch cost 27500 IQD → unit cost ≈ 300 IQD/slice.
# Bug: previously denom fell back to stored_qty=30 → unit cost = 917 IQD.

def test_beef_bacon_pack_quantity_from_raw_material():
    """5 قطع × 550 جم/قطعة = 2750 جم → 91.67 شريحة → 300 IQD/شريحة."""
    db = _make_db_with_raw_materials([
        {"id": "beef", "pack_quantity": 550, "pack_unit": "غرام"},
    ])
    product = {
        "unit": "شريحة",
        "piece_weight": 30,
        "piece_weight_unit": "غرام",
        "raw_material_cost_after_waste": 27500,
        "cost_before_waste": 27500,
        "quantity": 30,  # remaining slices — should NOT influence the unit cost
        "recipe": [
            {"raw_material_id": "beef", "unit": "قطعة", "quantity": 5},
        ],
    }
    asyncio.run(_enrich_unit_cost_fields(db, product))
    assert abs(product["computed_yield"] - 91.666667) < 0.001
    assert abs(product["unit_cost_after_waste"] - 300.0) < 1.0


def test_pack_info_snapshot_on_ingredient_takes_priority():
    """If pack_info is stored on the ingredient itself, use it (no raw_material lookup needed)."""
    db = _make_db_with_raw_materials([])  # No raw material data
    product = {
        "unit": "شريحة",
        "piece_weight": 30,
        "piece_weight_unit": "غرام",
        "raw_material_cost_after_waste": 27500,
        "cost_before_waste": 27500,
        "quantity": 30,
        "recipe": [
            {
                "raw_material_id": "beef",
                "unit": "قطعة",
                "quantity": 5,
                "pack_quantity": 550,
                "pack_unit": "غرام",
            },
        ],
    }
    asyncio.run(_enrich_unit_cost_fields(db, product))
    assert abs(product["computed_yield"] - 91.666667) < 0.001
    assert abs(product["unit_cost_after_waste"] - 300.0) < 1.0


def test_nested_manufactured_product_intermediate():
    """Recipe uses a manufactured intermediate (piece_weight=200g) by 'قطعة'."""
    db = _make_db_with_raw_materials(
        raw_materials=[],
        manufactured_products=[
            {"id": "patty", "piece_weight": 200, "piece_weight_unit": "غرام"},
        ],
    )
    product = {
        "unit": "حبة",
        "piece_weight": 250,
        "piece_weight_unit": "غرام",
        "raw_material_cost_after_waste": 10000,
        "cost_before_waste": 10000,
        "quantity": 0,
        "recipe": [
            {"manufactured_product_id": "patty", "unit": "قطعة", "quantity": 10},
        ],
    }
    asyncio.run(_enrich_unit_cost_fields(db, product))
    # 10 * 200 = 2000g total ; 2000/250 = 8 burgers
    assert abs(product["computed_yield"] - 8.0) < 0.001
    assert abs(product["unit_cost_after_waste"] - 1250.0) < 0.1


def test_count_unit_variant_qatae():
    """'قطع' (plural without ة) should be treated the same as 'قطعة'."""
    db = _make_db_with_raw_materials([
        {"id": "beef", "pack_quantity": 550, "pack_unit": "غرام"},
    ])
    product = {
        "unit": "شريحة",
        "piece_weight": 30,
        "piece_weight_unit": "غرام",
        "raw_material_cost_after_waste": 27500,
        "cost_before_waste": 27500,
        "quantity": 30,
        "recipe": [
            {"raw_material_id": "beef", "unit": "قطع", "quantity": 5},
        ],
    }
    asyncio.run(_enrich_unit_cost_fields(db, product))
    assert abs(product["computed_yield"] - 91.666667) < 0.001


# ============================================================================
# 🥓 Count-based pack_info scenario (real customer data: "بكن بقري")
# ============================================================================
# Raw material: "لحم بقري مقدد" - 1 قطعة (كرتون) = 10 قطعة (شرائح صغيرة).
# Manufactured "بكن بقري": piece_weight=1, piece_weight_unit="شريحة".
# Recipe: 5 قطعة من اللحم المقدد → 5 × 10 = 50 شريحة → yield = 50 قطعة-منتج.
# Cost: 5 × 5,500 = 27,500 IQD ÷ 50 = 550 IQD per قطعة-منتج.
# Bug before fix: pack_unit="قطعة" was rejected (not weight), so yield=0,
# denom fell back to stored_qty (1) → unit_cost = 27,500 IQD ❌

def test_count_based_pack_info_with_different_count_units():
    """5 قطع لحم × 10 شرائح/قطعة = 50 شريحة → 550 IQD/قطعة-منتج."""
    db = _make_db_with_raw_materials([
        {"id": "beef-bacon", "pack_quantity": 10, "pack_unit": "قطعة"},
    ])
    product = {
        "unit": "قطعة",
        "piece_weight": 1,
        "piece_weight_unit": "شريحة",
        "raw_material_cost_after_waste": 27500,
        "cost_before_waste": 27500,
        "quantity": 1,  # current stored — should NOT influence unit_cost
        "recipe": [
            {"raw_material_id": "beef-bacon", "unit": "قطعة", "quantity": 5},
        ],
    }
    asyncio.run(_enrich_unit_cost_fields(db, product))
    assert abs(product["computed_yield"] - 50.0) < 0.001
    assert abs(product["unit_cost_after_waste"] - 550.0) < 0.01


def test_count_based_pack_info_matching_pwu_string():
    """If pack_unit and piece_weight_unit are both 'شريحة', behaves identically."""
    db = _make_db_with_raw_materials([
        {"id": "beef-bacon", "pack_quantity": 10, "pack_unit": "شريحة"},
    ])
    product = {
        "unit": "قطعة",
        "piece_weight": 1,
        "piece_weight_unit": "شريحة",
        "raw_material_cost_after_waste": 27500,
        "cost_before_waste": 27500,
        "quantity": 1,
        "recipe": [
            {"raw_material_id": "beef-bacon", "unit": "قطعة", "quantity": 5},
        ],
    }
    asyncio.run(_enrich_unit_cost_fields(db, product))
    assert abs(product["computed_yield"] - 50.0) < 0.001
    assert abs(product["unit_cost_after_waste"] - 550.0) < 0.01


def test_cheese_slices_count_to_count_ignores_gram_piece_def():
    """🧀 جبن امريكي شرائح (سيناريو المستخدم الحقيقي):
    المادة الخام "جبن شيدر شرائح" مُعرّفة 1 قطعة = 46 شريحة.
    الوصفة: 4 قطعة (كلفة 30,000) → العائد = 4×46 = 184 شريحة، الكلفة = 163.04/شريحة.
    يجب أن يعمل المسار عدّ←عدّ سواءً وُجد تعريف غرام وهمي (1 شريحة = 1 غرام) أم لا —
    لأن الشريحة وحدة عدّ معرّفة داخل القطعة، لا وزن بالغرام."""
    db = _make_db_with_raw_materials([
        {"id": "cheddar", "pack_quantity": 46, "pack_unit": "شريحة"},
    ])
    base = {
        "unit": "شريحة",
        "piece_weight": 1,
        "piece_weight_unit": "شريحة",
        "raw_material_cost_after_waste": 30000,
        "cost_before_waste": 30000,
        "quantity": 0,
        "recipe": [
            {"raw_material_id": "cheddar", "unit": "قطعة", "quantity": 4},
        ],
    }
    # (أ) بلا تعريف غرام — المطلوب
    p1 = dict(base)
    asyncio.run(_enrich_unit_cost_fields(db, p1))
    assert abs(p1["computed_yield"] - 184.0) < 0.001, p1["computed_yield"]
    assert abs(p1["unit_cost_after_waste"] - (30000.0 / 184.0)) < 0.01, p1["unit_cost_after_waste"]
    # (ب) مع تعريف غرام وهمي (1 شريحة = 1 غرام) — يجب أن يبقى عدّ←عدّ هو الحاكم
    db2 = _make_db_with_raw_materials([
        {"id": "cheddar", "pack_quantity": 46, "pack_unit": "شريحة"},
    ])
    p2 = dict(base); p2["piece_def_value"] = 1; p2["piece_def_unit"] = "غرام"
    asyncio.run(_enrich_unit_cost_fields(db2, p2))
    assert abs(p2["computed_yield"] - 184.0) < 0.001, p2["computed_yield"]
    assert abs(p2["unit_cost_after_waste"] - (30000.0 / 184.0)) < 0.01, p2["unit_cost_after_waste"]


def test_various_slices_per_piece_count_to_count():
    """🧀 أنماط شرائح مختلفة (بيانات المستخدم): تأكيد عموم منطق عدّ←عدّ لأي N.
    جبن مدخن: 1 قطعة = 10 شرائح، 3 قطعة بكلفة 11,250 → 30 شريحة، 375/شريحة.
    """
    cases = [
        # (slices_per_piece, qty_pieces, batch_cost, expected_yield, expected_unit)
        (10, 3, 11250, 30.0, 375.0),     # جبن مدخن
        (46, 4, 30000, 184.0, 30000 / 184.0),  # جبن شيدر
        (8, 5, 16000, 40.0, 400.0),
    ]
    for spp, qty, cost, exp_y, exp_u in cases:
        db = _make_db_with_raw_materials([
            {"id": "ch", "pack_quantity": spp, "pack_unit": "شريحة"},
        ])
        p = {
            "unit": "شريحة", "piece_weight": 1, "piece_weight_unit": "شريحة",
            "raw_material_cost_after_waste": cost, "cost_before_waste": cost, "quantity": 0,
            "recipe": [{"raw_material_id": "ch", "unit": "قطعة", "quantity": qty}],
        }
        asyncio.run(_enrich_unit_cost_fields(db, p))
        assert abs(p["computed_yield"] - exp_y) < 0.001, (spp, p["computed_yield"])
        assert abs(p["unit_cost_after_waste"] - exp_u) < 0.01, (spp, p["unit_cost_after_waste"])





def test_count_pack_not_applied_when_pwu_is_weight():
    """Safety: if piece_weight_unit is weight (غرام), count-based pack_unit
    must NOT trigger the count_yield path (avoids unit-confusion bugs)."""
    db = _make_db_with_raw_materials([
        {"id": "x", "pack_quantity": 10, "pack_unit": "قطعة"},  # count pack
    ])
    product = {
        "unit": "قطعة",
        "piece_weight": 30,
        "piece_weight_unit": "غرام",  # weight piece
        "raw_material_cost_after_waste": 27500,
        "cost_before_waste": 27500,
        "quantity": 5,
        "recipe": [
            {"raw_material_id": "x", "unit": "قطعة", "quantity": 5},
        ],
    }
    asyncio.run(_enrich_unit_cost_fields(db, product))
    # Since pwu="غرام" but pack_unit="قطعة", calc_yield can't compute (no grams).
    # count_yield should NOT activate (pwu is weight) → fallback to stored_qty=5.
    # unit_cost = 27500/5 = 5500 (NOT 550)
    assert abs(product["unit_cost_after_waste"] - 5500.0) < 0.01




# ============================================================================
# 🥩 Weight-based main unit (لحم مفروم scenario — May 23, 2026 hotfix)
# ============================================================================
# When main_unit is itself a weight unit (غرام/كغم), piece_weight is just an
# informational sub-unit hint, NOT a yield divisor. The yield must be measured
# in main_unit itself.

def test_weight_main_unit_yield_is_total_grams():
    """لحم مفروم: unit='غرام', piece_weight=60, total_grams=10,250 → yield = 10,250 غرام."""
    db = _make_db_with_raw_materials([
        {"id": "lahm", "pack_quantity": 0, "pack_unit": ""},
    ])
    product = {
        "unit": "غرام",  # ⭐ main unit is weight itself
        "piece_weight": 60,
        "piece_weight_unit": "غرام",
        "raw_material_cost_after_waste": 108299,
        "cost_before_waste": 92344,
        "quantity": 1,
        "recipe": [
            {"raw_material_id": "lahm", "unit": "غرام", "quantity": 10250},
        ],
    }
    asyncio.run(_enrich_unit_cost_fields(db, product))
    assert abs(product["computed_yield"] - 10250.0) < 0.01
    assert abs(product["unit_cost_after_waste"] - 10.566731707) < 0.001


def test_weight_main_unit_kg_to_grams():
    """منتج بـ unit='كغم' وبه وصفة بالغرام → yield بالـ كغم."""
    db = _make_db_with_raw_materials([])
    product = {
        "unit": "كغم",
        "piece_weight": 1,
        "piece_weight_unit": "كغم",
        "raw_material_cost_after_waste": 20000,
        "cost_before_waste": 20000,
        "quantity": 1,
        "recipe": [
            {"raw_material_id": "x", "unit": "غرام", "quantity": 2000},
        ],
    }
    asyncio.run(_enrich_unit_cost_fields(db, product))
    assert abs(product["computed_yield"] - 2.0) < 0.001
    assert abs(product["unit_cost_after_waste"] - 10000.0) < 0.01


def test_count_main_unit_yield_uses_piece_weight_unchanged():
    """Regression: لما main_unit عدّية (قطعة/حبة), السلوك القديم يظل."""
    db = _make_db_with_raw_materials([])
    product = {
        "unit": "قطعة",
        "piece_weight": 60,
        "piece_weight_unit": "غرام",
        "raw_material_cost_after_waste": 60000,
        "cost_before_waste": 60000,
        "quantity": 1,
        "recipe": [
            {"raw_material_id": "x", "unit": "كغم", "quantity": 6},
        ],
    }
    asyncio.run(_enrich_unit_cost_fields(db, product))
    assert abs(product["computed_yield"] - 100.0) < 0.001
    assert abs(product["unit_cost_after_waste"] - 600.0) < 0.01
