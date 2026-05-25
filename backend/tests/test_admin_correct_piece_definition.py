"""Regression: Admin Correction modal must show & allow editing the
stored pack-definition (pack_quantity + pack_unit) for raw materials.

User feedback (May 25, 2026):
1. The field name in raw_materials is pack_quantity/pack_unit (NOT
   piece_weight which is for manufactured_products).
2. The pre-filled value was 0 even when the material had a stored
   pack definition — the modal must read from material.pack_quantity.
3. The section must be visible for ALL units, not only when unit=قطعة,
   so the user can read/edit the existing definition.
"""
from pathlib import Path
import re


def _src():
    return (Path(__file__).resolve().parents[1] / "routes" / "inventory_system.py").read_text(encoding="utf-8")


def _endpoint_body():
    src = _src()
    m = re.search(
        r"async def admin_correct_raw_material\b.*?(?=\n@router\.|\nasync def |\Z)",
        src,
        re.DOTALL,
    )
    assert m
    return m.group(0)


def test_endpoint_accepts_pack_quantity_and_unit():
    body = _endpoint_body()
    assert '_set_if("pack_quantity"' in body, (
        "Endpoint must accept pack_quantity (numeric) in payload — the actual field on raw_materials"
    )
    assert '_set_if("pack_unit"' in body, (
        "Endpoint must accept pack_unit (string) in payload"
    )


def test_pack_fields_synced_to_manufacturing_inventory():
    body = _endpoint_body()
    assert 'mi_sync["pack_quantity"] = update["pack_quantity"]' in body
    assert 'mi_sync["pack_unit"] = update["pack_unit"]' in body


def test_endpoint_still_accepts_legacy_piece_weight():
    """Manufactured products use piece_weight; keep backward compat."""
    body = _endpoint_body()
    assert '_set_if("piece_weight"' in body
    assert '_set_if("piece_weight_unit"' in body


def test_existing_fields_still_supported():
    body = _endpoint_body()
    for f in ['"quantity"', '"min_quantity"', '"cost_per_unit"', '"unit"', '"name"', '"name_en"']:
        assert f'_set_if({f}' in body, f"Field {f} must still be admin-correctable"
