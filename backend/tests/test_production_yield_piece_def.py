"""Regression: production paths (manufacture / add-stock) must respect piece_def_value.

User report ("دجاج فاهيتا"): a manufactured product whose main unit is a WEIGHT unit
(غرام) but is counted in حصص (1 حصة = 80 غرام via piece_def_value) calculated the
"add stock" conversion using piece_weight=1 → treating 300 حصة as 300 غرام instead of
300 × 80 = 24000 غرام.

Fix: _resolve_piece_grams (respects piece_def_value) + _resolve_recipe_yield (mirrors
_enrich_unit_cost_fields: weight main unit → yield = grams/factor; else grams/piece_grams).
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from routes.inventory_system import _resolve_piece_grams, _resolve_recipe_yield


def test_piece_grams_uses_piece_def_over_weight_unit():
    # 1 حصة = 80 غرام defined, piece_weight degenerate (=1)
    p = {"piece_weight": 1, "piece_weight_unit": "حصة", "piece_def_value": 80, "piece_def_unit": "غرام"}
    assert _resolve_piece_grams(p) == 80.0


def test_piece_grams_falls_back_to_piece_weight():
    p = {"piece_weight": 250, "piece_weight_unit": "غرام", "piece_def_value": 0, "piece_def_unit": None}
    assert _resolve_piece_grams(p) == 250.0


def test_yield_weight_main_unit_uses_grams():
    # دجاج فاهيتا: unit=غرام (weight) → yield = total_grams / factor(غرام=1)
    p = {"unit": "غرام", "piece_weight": 1, "piece_weight_unit": "حصة",
         "piece_def_value": 80, "piece_def_unit": "غرام"}
    assert _resolve_recipe_yield(p, 8000) == 8000.0  # 8000 غرام yield


def test_yield_count_main_unit_uses_piece_def():
    # main unit حصة (count) + 1 حصة = 80 غرام → yield = 8000/80 = 100 portions
    p = {"unit": "حصة", "piece_weight": 1, "piece_weight_unit": "حصة",
         "piece_def_value": 80, "piece_def_unit": "غرام"}
    assert _resolve_recipe_yield(p, 8000) == 100.0


def test_yield_count_main_legacy_burger():
    # لحم برغر: unit=حبة (count), piece_weight=250غ, no piece_def → yield = 25000/250 = 100 حبة
    p = {"unit": "حبة", "piece_weight": 250, "piece_weight_unit": "غرام",
         "piece_def_value": 0, "piece_def_unit": None}
    assert _resolve_recipe_yield(p, 25000) == 100.0


def test_yield_legacy_per_unit_when_no_piece_info():
    # no piece_weight and no piece_def → legacy per-unit mode (yield 0 => caller uses quantity directly)
    p = {"unit": "صحن", "piece_weight": 0, "piece_weight_unit": "غرام",
         "piece_def_value": 0, "piece_def_unit": None}
    assert _resolve_recipe_yield(p, 5000) == 0.0


def test_yield_zero_when_no_recipe_grams():
    p = {"unit": "حصة", "piece_weight": 1, "piece_def_value": 80, "piece_def_unit": "غرام"}
    assert _resolve_recipe_yield(p, 0) == 0.0
