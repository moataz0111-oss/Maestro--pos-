"""Regression: Weekly Low-Profit endpoint MUST use the unified cost resolver
that respects manufactured_links (same as POS), not the stale stored
item.cost or raw product.cost.

User reports (May 24, 2026):
1. "Classic Burger" current raw materials cost is 1,976 IQD/unit (purple
   field). Weekly alert showed 1,989,796 IQD for 148 units.
2. "Mushroom Burger" cost is 1,016 IQD/unit (from linked manufactured
   product). Reports showed 8,017 IQD/unit.

Both bugs solved by routing through `_resolve_product_unit_cost` which
unwraps `manufactured_links → _enrich_unit_cost_fields → unit_cost_after_waste`.
"""
from pathlib import Path
import re


def _src():
    return (Path(__file__).resolve().parents[1] / "routes" / "reports_routes.py").read_text(encoding="utf-8")


def _weekly_body():
    src = _src()
    m = re.search(
        r"async def get_weekly_low_profit_products\b.*?(?=\n@router\.|\nasync def |\Z)",
        src,
        re.DOTALL,
    )
    assert m, "Function not found"
    return m.group(0)


def test_endpoint_uses_unified_costs_map():
    body = _weekly_body()
    assert "_build_current_costs_map" in body, (
        "Must use unified costs map (which resolves manufactured_links)"
    )


def test_endpoint_uses_qty_multiplier_for_materials_and_packaging():
    body = _weekly_body()
    assert re.search(r'\["unit_cost"\]\s*\*\s*qty', body), (
        "materials_cost must be entry.unit_cost × qty"
    )
    assert re.search(r'\["unit_pkg"\]\s*\*\s*qty', body), (
        "packaging_cost must be entry.unit_pkg × qty"
    )


def test_endpoint_does_not_use_stale_item_cost_field():
    body = _weekly_body()
    assert "item.get(\"cost\")" not in body, (
        "Must NOT use the possibly-stale item.cost stored in orders"
    )


def test_endpoint_lookup_by_id_with_name_fallback():
    body = _weekly_body()
    assert "_by_id.get(pid_ref)" in body
    assert "_by_name.get(pid)" in body, (
        "Must fall back to product name when product_id missing in legacy orders"
    )


def test_sales_report_also_uses_unified_costs_map():
    """The cost_breakdown_by_product map in /reports/sales must follow
    the same single-source-of-truth rule."""
    src = _src()
    sales_section = src.split("# ==================== WEEKLY LOW-PROFIT ALERT")[0]
    assert "_build_current_costs_map" in sales_section, (
        "Sales report must use the unified costs map"
    )
    assert "item.get(\"cost\")" not in sales_section, (
        "Sales report must not use stale item.cost"
    )
