"""Regression: Weekly Low-Profit endpoint MUST use current product.cost
from the products collection, NOT the (possibly stale) item.cost stored
inside each order.

User report (May 24, 2026): "Classic Burger" current raw materials cost is
1,976 IQD/unit (purple field). But the weekly alert showed total cost
1,989,796 IQD for 148 units (= ~13,444/unit) because order.items[].cost
contained old/wrong values from before recent cost-calculation fixes.

Fix: endpoint now reads `products.cost` and multiplies by item.quantity.
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


def test_endpoint_loads_products_collection_for_current_costs():
    body = _weekly_body()
    assert "db.products.find" in body, (
        "Must query products collection to get the current (purple field) cost"
    )


def test_endpoint_uses_qty_multiplier_for_materials_and_packaging():
    body = _weekly_body()
    # Multiplied by qty (the user's whole bug was missing this multiplier)
    assert re.search(r"materials_cost.*\*\s*qty", body, re.DOTALL) or \
           re.search(r"unit_cost\s*-\s*unit_pkg\)\s*\*\s*qty", body), (
        "materials_cost must be multiplied by qty (per-unit cost × quantity)"
    )
    assert re.search(r"unit_pkg\s*\*\s*qty", body), (
        "packaging_cost must be multiplied by qty"
    )


def test_endpoint_does_not_use_stale_item_cost_field():
    body = _weekly_body()
    # The buggy version did `cost = float(item.get("cost") or 0)` then
    # `materials_cost += cost - pkg`. Pin that this pattern is gone.
    assert "item.get(\"cost\")" not in body, (
        "Must NOT use the possibly-stale item.cost stored in orders. "
        "Use products.cost (current) × qty instead."
    )


def test_endpoint_falls_back_to_product_name_when_id_missing():
    body = _weekly_body()
    # Lookup by product_id first, then by product_name (legacy orders may
    # not store product_id consistently)
    assert "current_cost_by_id" in body
    assert "current_cost_by_name" in body


def test_sales_report_also_uses_current_product_cost():
    """The cost_breakdown_by_product map in /reports/sales must follow
    the same single-source-of-truth rule."""
    src = _src()
    # Sales report block sits BEFORE the weekly endpoint
    sales_section = src.split("# ==================== WEEKLY LOW-PROFIT ALERT")[0]
    assert "_current_cost_by_id" in sales_section, (
        "Sales report must also load current product costs"
    )
    assert "item.get(\"cost\")" not in sales_section, (
        "Sales report must not use stale item.cost for the breakdown"
    )
