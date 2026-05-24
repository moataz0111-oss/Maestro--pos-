"""Regression: Reports must use the SAME cost-resolution logic as POS.

Bug (May 24, 2026): user reported "Mushroom Burger" cost showing as
8,017 IQD/unit in reports while the correct cost (from linked
manufactured product) is 1,016 IQD/unit. The bug was:
- reports used product.cost (raw stored value, possibly stale)
- POS uses _enrich_unit_cost_fields(manufactured_product) × consumption_qty

Fix: introduced `_resolve_product_unit_cost` and `_build_current_costs_map`
in reports_routes.py — single source of truth shared with POS via
manufactured_links resolution.
"""
from pathlib import Path
import re


def _src():
    return (Path(__file__).resolve().parents[1] / "routes" / "reports_routes.py").read_text(encoding="utf-8")


def test_helper_function_exists():
    src = _src()
    assert "async def _resolve_product_unit_cost" in src, (
        "Must define _resolve_product_unit_cost helper"
    )
    assert "async def _build_current_costs_map" in src, (
        "Must define _build_current_costs_map helper"
    )


def test_resolver_imports_enrich_unit_cost_fields():
    """Must use the same single-source-of-truth helper that POS uses."""
    src = _src()
    assert "from routes.inventory_system import _enrich_unit_cost_fields" in src, (
        "Must use _enrich_unit_cost_fields (same as POS) for accuracy"
    )


def test_resolver_uses_manufactured_links():
    src = _src()
    m = re.search(
        r"async def _resolve_product_unit_cost.*?(?=\nasync def |\Z)",
        src,
        re.DOTALL,
    )
    body = m.group(0)
    assert "manufactured_links" in body
    assert "manufactured_product_id" in body
    assert "unit_cost_after_waste" in body
    assert "consumption_qty" in body


def test_resolver_uses_convert_link_consumption():
    """Same unit conversion as POS (kg→g, piece, etc.)."""
    src = _src()
    m = re.search(
        r"async def _resolve_product_unit_cost.*?(?=\nasync def |\Z)",
        src,
        re.DOTALL,
    )
    body = m.group(0)
    assert "_convert_link_consumption_to_main" in body, (
        "Must use the same unit conversion as POS"
    )


def test_weekly_endpoint_uses_costs_map():
    src = _src()
    m = re.search(
        r"async def get_weekly_low_profit_products.*?(?=\n@router\.|\nasync def |\Z)",
        src,
        re.DOTALL,
    )
    body = m.group(0)
    assert "_build_current_costs_map" in body
    assert "_by_id.get(pid_ref)" in body
    assert "_by_name.get(pid)" in body


def test_sales_report_uses_costs_map():
    src = _src()
    sales_section = src.split("# ==================== WEEKLY LOW-PROFIT ALERT")[0]
    assert "_build_current_costs_map" in sales_section, (
        "Sales report's cost_breakdown_by_product must use the unified map"
    )


def test_resolver_falls_back_to_raw_cost_when_no_links():
    """Products without manufactured_links fallback to product.cost."""
    src = _src()
    m = re.search(
        r"async def _resolve_product_unit_cost.*?(?=\nasync def |\Z)",
        src,
        re.DOTALL,
    )
    body = m.group(0)
    assert "Fallback" in body or "fallback" in body or "raw_cost" in body
