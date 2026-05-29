"""Regression: produce() must deduct raw materials from manufacturing_inventory
even when records are keyed only by `material_id` (legacy) instead of
`raw_material_id`. Previously the deduction matched only `raw_material_id`,
so legacy records were silently NOT deducted (user-reported bug, Feb 2026).
"""
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[1]


def _produce_body():
    src = (BACKEND / "routes" / "inventory_system.py").read_text(encoding="utf-8")
    idx = src.find("async def produce_product")
    assert idx != -1
    return src[idx:idx + 13000]


def test_availability_check_matches_both_id_fields():
    body = _produce_body()
    # the availability find_one must use $or over raw_material_id AND material_id
    assert '"$or": [{"raw_material_id": rm_id}, {"material_id": rm_id}]' in body


def test_deduction_matches_both_id_fields():
    body = _produce_body()
    # the manufacturing_inventory deduction update_one must use $or
    assert '"$or": [' in body
    assert '{"raw_material_id": ingredient.get("raw_material_id")}' in body
    assert '{"material_id": ingredient.get("raw_material_id")}' in body
    # and still decrement quantity
    assert '"$inc": {"quantity": -needed}' in body


def _addstock_body():
    src = (BACKEND / "routes" / "inventory_system.py").read_text(encoding="utf-8")
    idx = src.find("async def add_product_stock")
    assert idx != -1
    return src[idx:idx + 8000]


def test_addstock_deducts_raw_materials_like_produce():
    body = _addstock_body()
    # consume factor (batch-aware) and deduction with $or matching
    assert "consume_factor" in body
    assert '"$or": [{"raw_material_id": ingredient.get("raw_material_id")}, {"material_id": ingredient.get("raw_material_id")}]' in body
    assert '"$inc": {"quantity": -needed}' in body


def test_addstock_checks_insufficient_and_handles_nested_products():
    body = _addstock_body()
    assert "insufficient_materials" in body
    assert "manufactured_product_id" in body
