"""Tests for sub-unit (piece_weight_unit) conversion in product linked to manufactured products.

When a regular product is linked to a manufactured product via `manufactured_links`,
the user can choose to consume in either the main unit (e.g., حبة) or the sub-unit
(e.g., شريحة). The backend must:
  1. Compute correct cost based on the chosen consumption_unit.
  2. Deduct the correct equivalent in main units from manufactured_products / branch_inventory.
"""
import pytest


# Replicates the conversion logic embedded in server.py
def normalize_consumption_to_main_unit(link, mfg_product):
    consumption_qty = float(link.get("consumption_qty") or 1)
    consumption_unit = link.get("consumption_unit") or mfg_product.get("unit") or "حبة"
    main_unit = mfg_product.get("unit") or "حبة"
    pwu = mfg_product.get("piece_weight_unit") or ""
    pw = float(mfg_product.get("piece_weight") or 0)
    if consumption_unit == pwu and consumption_unit != main_unit and pw > 0:
        consumption_qty = consumption_qty / pw
    return consumption_qty


class TestConsumptionUnitConversion:
    def test_sub_unit_consumption_2_slices(self):
        """User selects 2 شريحة of cheese (1 حبة = 46 شريحة) => 2/46 حبة."""
        mp = {"unit": "حبة", "piece_weight": 46, "piece_weight_unit": "شريحة"}
        link = {"consumption_qty": 2, "consumption_unit": "شريحة"}
        result = normalize_consumption_to_main_unit(link, mp)
        assert abs(result - (2 / 46)) < 1e-9

    def test_main_unit_consumption(self):
        """User selects 1 حبة => 1 حبة."""
        mp = {"unit": "حبة", "piece_weight": 46, "piece_weight_unit": "شريحة"}
        link = {"consumption_qty": 1, "consumption_unit": "حبة"}
        result = normalize_consumption_to_main_unit(link, mp)
        assert result == 1.0

    def test_legacy_link_without_consumption_unit_defaults_to_main(self):
        """Legacy data without consumption_unit must default to main unit (no division)."""
        mp = {"unit": "حبة", "piece_weight": 46, "piece_weight_unit": "شريحة"}
        link = {"consumption_qty": 3}
        result = normalize_consumption_to_main_unit(link, mp)
        assert result == 3.0

    def test_no_piece_weight_no_conversion(self):
        """If piece_weight=0, no conversion is applied even if consumption_unit matches pwu."""
        mp = {"unit": "كغم", "piece_weight": 0, "piece_weight_unit": "غرام"}
        link = {"consumption_qty": 500, "consumption_unit": "غرام"}
        result = normalize_consumption_to_main_unit(link, mp)
        # Without piece_weight metadata we cannot safely convert; fall back to raw qty
        assert result == 500.0

    def test_same_unit_main_and_sub(self):
        """When main_unit == pwu (degenerate case), no conversion applied."""
        mp = {"unit": "حبة", "piece_weight": 1, "piece_weight_unit": "حبة"}
        link = {"consumption_qty": 5, "consumption_unit": "حبة"}
        result = normalize_consumption_to_main_unit(link, mp)
        assert result == 5.0
