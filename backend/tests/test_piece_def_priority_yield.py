"""Regression: piece_def_value must take ABSOLUTE priority in yield/cost calc.

User report ("دجاج راب"): product showed wrong cost because yield computed as
40 / 1 instead of 40 / 80. Root cause: `_enrich_unit_cost_fields` only applied
the portion definition (piece_def_value × piece_def_unit) when piece_weight_unit
was a COUNT unit (`pwu not in UNIT_W`). If the product had piece_def_value=80 but
piece_weight_unit left as a weight unit ('غرام') or null (legacy/corrupt data),
the 80 was IGNORED and the system fell back to piece_weight(=1) → yield 40/1.

Fix: a valid piece_def_value (with a valid weight piece_def_unit) is always used,
regardless of piece_weight_unit.
"""
import asyncio
import os
import sys

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from motor.motor_asyncio import AsyncIOMotorClient
from routes.inventory_system import _enrich_unit_cost_fields


def _db():
    c = AsyncIOMotorClient(os.environ["MONGO_URL"])
    return c[os.environ["DB_NAME"]]


# recipe totalling exactly 40 grams
RECIPE = [{"raw_material_name": "دجاج", "quantity": 40, "unit": "غرام"}]
BASE = {
    "id": "x", "tenant_id": "t", "name": "دجاج راب",
    "raw_material_cost": 1000, "raw_material_cost_after_waste": 1000,
    "production_cost": 1000, "cost_before_waste": 1000,
    "total_produced": 0, "quantity": 0, "recipe": RECIPE,
}


def _enrich(extra):
    p = dict(BASE)
    p.update(extra)
    asyncio.get_event_loop().run_until_complete(_enrich_unit_cost_fields(_db(), p))
    return p


def test_def_used_when_pwu_is_count_unit():
    """Clean case: 1 شريحة = 80 غرام → 40/80 = 0.5."""
    p = _enrich({"unit": "شريحة", "piece_weight": 1, "piece_weight_unit": "شريحة",
                 "piece_def_value": 80, "piece_def_unit": "غرام"})
    assert p["computed_yield"] == 0.5


def test_def_used_even_when_pwu_is_weight_unit():
    """CORE FIX: piece_def_value=80 must win even if piece_weight_unit='غرام'."""
    p = _enrich({"unit": "شريحة", "piece_weight": 1, "piece_weight_unit": "غرام",
                 "piece_def_value": 80, "piece_def_unit": "غرام"})
    assert p["computed_yield"] == 0.5, "piece_def_value must not be ignored for weight pwu"


def test_def_used_when_pwu_is_null():
    """CORE FIX: legacy product with null piece_weight_unit still honors the def."""
    p = _enrich({"unit": "شريحة", "piece_weight": 1, "piece_weight_unit": None,
                 "piece_def_value": 80, "piece_def_unit": "غرام"})
    assert p["computed_yield"] == 0.5


def test_no_def_falls_back_to_piece_weight():
    """When no valid def exists, fall back to piece_weight (genuinely undefined)."""
    p = _enrich({"unit": "شريحة", "piece_weight": 1, "piece_weight_unit": "شريحة",
                 "piece_def_value": 0, "piece_def_unit": None})
    assert p["computed_yield"] == 40.0  # 40/1 — triggers the red warning badge in UI


def test_weight_product_unaffected():
    """Weight-based product (لحم برغر style): piece_weight=250غ, no def → unchanged."""
    p = _enrich({"unit": "حبة", "piece_weight": 250, "piece_weight_unit": "غرام",
                 "piece_def_value": 0, "piece_def_unit": None,
                 "recipe": [{"raw_material_name": "لحم", "quantity": 1000, "unit": "غرام"}]})
    assert p["computed_yield"] == 4.0  # 1000 / 250
