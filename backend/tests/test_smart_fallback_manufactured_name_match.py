"""Regression: _resolve_product_unit_cost must auto-resolve cost from a
matching manufactured_product when the product has NO manufactured_links.

User report (May 24, 2026): "Mushroom Burger" had `product.cost = 8017`
stored but no `manufactured_links` set. There IS a manufactured product
with matching name and `unit_cost_after_waste = 1016`. Reports kept
showing 8017 because the fallback used raw product.cost.

Fix: smart fallback — search manufactured_products by exact name first,
then by regex partial match.
"""
from pathlib import Path
import re


def _src():
    return (Path(__file__).resolve().parents[1] / "routes" / "reports_routes.py").read_text(encoding="utf-8")


def _resolver_body():
    src = _src()
    m = re.search(
        r"async def _resolve_product_unit_cost.*?(?=\nasync def |\Z)",
        src,
        re.DOTALL,
    )
    assert m
    return m.group(0)


def test_smart_fallback_searches_manufactured_products_by_name():
    body = _resolver_body()
    assert "manufactured_products.find_one" in body, (
        "Must search manufactured_products collection for matching name"
    )


def test_smart_fallback_tries_partial_match_too():
    body = _resolver_body()
    assert "$regex" in body, (
        "Must try partial (regex) match as second attempt for non-identical names"
    )


def test_smart_fallback_uses_enrich_unit_cost_fields():
    body = _resolver_body()
    # Must enrich the matched manufactured product before reading the cost
    enrich_count = body.count("_enrich_unit_cost_fields")
    assert enrich_count >= 2, (
        "Must call _enrich_unit_cost_fields both for linked path and smart-fallback path"
    )


def test_resolver_keeps_last_resort_raw_cost_fallback():
    """If neither manufactured_links nor matching name found, use raw product.cost."""
    body = _resolver_body()
    assert "Last-resort" in body or "last-resort" in body
    assert "raw_cost = _f(product.get(\"cost\"))" in body
