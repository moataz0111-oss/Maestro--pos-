"""Regression: Admin Correction modal must allow editing the piece-definition
(piece_weight + piece_weight_unit) for raw materials whose unit is "قطعة".

User request (May 25, 2026): "يجب أن يظهر تعريف القطعة لكي يتمكن من تعديل
التعريف في هذا النموذج". When the user makes admin corrections on a piece-
based material, they need to set/correct "1 piece = X grams/kg" so the
recipe unit-conversion stays accurate.
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
    assert m, "admin_correct_raw_material endpoint not found"
    return m.group(0)


def test_endpoint_accepts_piece_weight_fields():
    body = _endpoint_body()
    assert '_set_if("piece_weight", float)' in body, (
        "Endpoint must accept piece_weight (numeric) in payload"
    )
    assert '_set_if("piece_weight_unit"' in body, (
        "Endpoint must accept piece_weight_unit (string) in payload"
    )


def test_piece_weight_synced_to_manufacturing_inventory():
    """When piece_weight or its unit changes, the linked manufacturing_inventory
    rows must reflect that change immediately (to keep recipe conversions correct)."""
    body = _endpoint_body()
    assert 'mi_sync["piece_weight"] = update["piece_weight"]' in body
    assert 'mi_sync["piece_weight_unit"] = update["piece_weight_unit"]' in body


def test_existing_fields_still_supported():
    """Pin that we didn't accidentally remove any other admin-correctable field."""
    body = _endpoint_body()
    for f in ['"quantity"', '"min_quantity"', '"cost_per_unit"', '"unit"', '"name"', '"name_en"']:
        assert f'_set_if({f}' in body, f"Field {f} must still be admin-correctable"
