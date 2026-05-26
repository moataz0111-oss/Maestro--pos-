"""Regression: 4th department `manufactured_products` for monthly stocktake.

User request (May 25, 2026): Split the manufacturing tab stocktake into two
buttons:
  1. مخزن المصنع (مواد خام) — already exists as `manufacturing` (manufacturing_inventory)
  2. المنتجات المصنعة الجاهزة — NEW (`manufactured_products` collection)
"""
from pathlib import Path
import re


def _src():
    return (Path(__file__).resolve().parents[1] / "routes" / "department_stock_count.py").read_text(encoding="utf-8")


def test_manufactured_products_in_department_collections():
    src = _src()
    assert '"manufactured_products": "manufactured_products"' in src, (
        "manufactured_products must be a registered department"
    )


def test_manufactured_products_has_arabic_label():
    src = _src()
    assert '"manufactured_products": "المنتجات المصنعة الجاهزة"' in src


def test_template_builder_supports_manufactured_products_cost_field():
    """Manufactured products use unit_cost_after_waste / unit_cost_before_waste,
    not cost_per_unit. The template builder must read these correctly."""
    src = _src()
    body_match = re.search(r"async def _build_template.*?(?=\n@router\.|\nasync def |\Z)", src, re.DOTALL)
    body = body_match.group(0)
    assert "unit_cost_after_waste" in body
    assert "unit_cost_before_waste" in body


def test_template_builder_handles_computed_yield_fallback():
    """Some manufactured product records use `computed_yield` instead of `quantity`."""
    src = _src()
    body_match = re.search(r"async def _build_template.*?(?=\n@router\.|\nasync def |\Z)", src, re.DOTALL)
    body = body_match.group(0)
    assert "computed_yield" in body


def test_existing_departments_unchanged():
    src = _src()
    assert '"manufacturing": "manufacturing_inventory"' in src
    assert '"warehouse_raw": "raw_materials"' in src
    assert '"packaging": "packaging_materials"' in src


def test_manufacturing_label_now_clarifies_it_is_raw_materials():
    """The user wanted "مخزن المصنع" to make it clear it's the raw-materials
    storage inside the factory (not the manufactured outputs)."""
    src = _src()
    assert '"manufacturing": "مخزن المصنع (مواد خام)"' in src
