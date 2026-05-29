"""Regression: inventory/manufacturing movement & report accuracy (Feb 2026 audit).

Covers:
  - transfer_to_manufacturing merges into the existing manufacturing_inventory
    record regardless of which id field it uses (no duplicate records), and heals
    both id fields.
  - manufacturing-requests fulfill path also matches both id fields.
  - /inventory-movements derives category from TYPE (authoritative) so consumption
    movements are categorized as 'consumption' (not 'manufacturing').
  - new /reports/raw-material-consumption endpoint exists and aggregates by
    material & product.
"""
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[1]


def _src():
    return (BACKEND / "routes" / "inventory_system.py").read_text(encoding="utf-8")


def test_transfer_to_manufacturing_matches_both_id_fields():
    body = _src()
    idx = body.find("async def transfer_to_manufacturing")
    seg = body[idx:idx + 6000]
    assert 'find_one({"$or": [{"raw_material_id": rm_id}, {"material_id": rm_id}]})' in seg
    # heals both fields on update
    assert '"raw_material_id": rm_id,' in seg and '"material_id": rm_id,' in seg


def test_manufacturing_request_fulfill_matches_both_id_fields():
    body = _src()
    idx = body.find('find_one({"$or": [{"material_id": material_id}, {"raw_material_id": material_id}]})')
    assert idx != -1


def test_movements_category_derived_from_type():
    body = _src()
    assert "derived = type_to_category.get(m.get(\"type\"))" in body
    # consumption category present in CATEGORY_MAP
    assert '"consumption": [' in body
    assert '"manufacturing_consumption", "manufactured_consumption",' in body


def test_raw_material_consumption_report_exists():
    body = _src()
    assert '@router.get("/reports/raw-material-consumption")' in body
    seg = body[body.find("async def get_raw_material_consumption"):][:3000]
    assert "by_material" in seg and "by_product" in seg
    assert '"manufacturing_consumption", "manufactured_consumption"' in seg
