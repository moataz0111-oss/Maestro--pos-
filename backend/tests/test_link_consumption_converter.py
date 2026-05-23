"""Test the unified consumption_unit converter used by MfgLinksEditor.

Customers want to bind a regular sale product to a manufactured product
using ANY meaningful unit (e.g., the manufactured product is stored in
"كغم" but the sale consumes "غرام"). The backend converts the chosen
consumption_unit to the manufactured product's MAIN unit for cost &
inventory deduction.
"""
import os
import sys

os.environ.setdefault("MONGO_URL", "mongodb://localhost:27017")
os.environ.setdefault("DB_NAME", "maestro_pos_test")
os.environ.setdefault("REACT_APP_BACKEND_URL", "http://localhost:8001")

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

import importlib.util as _ilu  # noqa: E402

_spec = _ilu.spec_from_file_location(
    "link_units",
    os.path.join(os.path.dirname(__file__), "..", "utils", "link_units.py"),
)
_link_units = _ilu.module_from_spec(_spec)
_spec.loader.exec_module(_link_units)
_convert_link_consumption_to_main = _link_units.convert_link_consumption_to_main


def test_same_unit_no_conversion():
    """consumption_unit == main_unit → no change."""
    assert _convert_link_consumption_to_main(5, "حبة", "حبة", 0, "") == 5
    assert _convert_link_consumption_to_main(2.5, "كغم", "كغم", 0, "") == 2.5


def test_sub_unit_to_main_via_piece_weight():
    """consumption=شريحة, main=حبة, piece_weight=46 شريحة/حبة → divide."""
    # 92 شريحة → 2 حبة
    assert _convert_link_consumption_to_main(92, "شريحة", "حبة", 46, "شريحة") == 2.0
    # 23 شريحة → 0.5 حبة
    assert _convert_link_consumption_to_main(23, "شريحة", "حبة", 46, "شريحة") == 0.5


def test_kg_to_grams_same_family():
    """Manufactured product stored in غرام, user picks كغم → multiply."""
    # 2 كغم → 2000 غرام
    assert _convert_link_consumption_to_main(2, "كغم", "غرام", 0, "") == 2000.0
    # 0.5 كغم → 500 غرام
    assert _convert_link_consumption_to_main(0.5, "كغم", "غرام", 0, "") == 500.0


def test_grams_to_kg_same_family():
    """Manufactured product stored in كغم, user picks غرام → divide."""
    # 500 غرام → 0.5 كغم
    assert _convert_link_consumption_to_main(500, "غرام", "كغم", 0, "") == 0.5
    # 1500 غرام → 1.5 كغم
    assert _convert_link_consumption_to_main(1500, "غرام", "كغم", 0, "") == 1.5


def test_liter_to_ml():
    """Same family but volume: لتر → مل."""
    assert _convert_link_consumption_to_main(1, "لتر", "مل", 0, "") == 1000.0
    assert _convert_link_consumption_to_main(250, "مل", "لتر", 0, "") == 0.25


def test_kg_to_main_via_pwu_bridge():
    """Main=حبة, piece_weight=500 غرام, user picks كغم → 1كغم/0.5كغم بالحبة = 2 حبة."""
    # 1 كغم = 1000 غرام ÷ 500 غرام/حبة = 2 حبة
    assert _convert_link_consumption_to_main(1, "كغم", "حبة", 500, "غرام") == 2.0
    # 0.25 كغم = 250 غرام ÷ 500 غرام/حبة = 0.5 حبة
    assert _convert_link_consumption_to_main(0.25, "كغم", "حبة", 500, "غرام") == 0.5


def test_grams_to_main_via_pwu_bridge():
    """Main=حبة, piece_weight=500 غرام, user picks غرام → divide."""
    assert _convert_link_consumption_to_main(750, "غرام", "حبة", 500, "غرام") == 1.5


def test_unknown_unit_returns_qty_as_is():
    """Unknown unit string → return qty unchanged (safe fallback)."""
    assert _convert_link_consumption_to_main(5, "foo", "حبة", 0, "") == 5
