"""Regression: Sales report top totals (`total_cost`, `total_materials_cost`,
`total_packaging_cost`, `total_profit`) must match the sum of
`cost_breakdown_by_product`. Both come from the SAME unified costs map.

User report (May 24, 2026): top "تكلفة المواد" card showed 960,895 IQD,
but drill-down dialog summed to only 155,346 IQD — a ~6× discrepancy.
Cause: top totals used the stale `order.total_cost` (saved at order
creation with old/wrong cost), while drill-down recomputed dynamically.

Fix: BOTH derive from the unified costs map (`_build_current_costs_map`).
"""
from pathlib import Path
import re


def _src():
    return (Path(__file__).resolve().parents[1] / "routes" / "reports_routes.py").read_text(encoding="utf-8")


def test_totals_not_from_stale_order_total_cost():
    src = _src()
    sales_section = src.split("# ==================== WEEKLY LOW-PROFIT ALERT")[0]
    # Must NOT sum order.total_cost into total_cost anymore
    assert 'total_cost = sum(_sn(o.get("total_cost"))' not in sales_section, (
        "total_cost must not be summed from stale order.total_cost. "
        "Use the unified by_product breakdown instead."
    )


def test_totals_derived_from_by_product():
    src = _src()
    sales_section = src.split("# ==================== WEEKLY LOW-PROFIT ALERT")[0]
    # Must derive top totals from by_product after the loop
    assert "total_materials_cost = sum(v.get(\"materials_cost\", 0) for v in by_product.values())" in sales_section
    assert "total_packaging_cost = sum(v.get(\"packaging_cost\", 0) for v in by_product.values())" in sales_section
    assert "total_cost = total_materials_cost + total_packaging_cost" in sales_section
    assert "total_profit = total_sales - total_cost" in sales_section


def test_returned_keys_present():
    """Ensure the response still exposes the same keys (no breaking change)."""
    src = _src()
    sales_section = src.split("# ==================== WEEKLY LOW-PROFIT ALERT")[0]
    # Look at the sales-endpoint return (last big return before weekly section)
    for key in ['"total_sales"', '"total_cost"', '"total_materials_cost"',
                '"total_packaging_cost"', '"total_profit"', '"profit_margin"',
                '"cost_breakdown_by_product"']:
        assert key in sales_section, f"Response is missing key {key}"
