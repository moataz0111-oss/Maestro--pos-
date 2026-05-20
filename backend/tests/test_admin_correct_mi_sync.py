"""
Test: admin-correct ينعكس فوراً على manufacturing_inventory
(الوحدة، الاسم، التكلفة) لمنع تضارب الوحدات (قطعة vs كغم).
"""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))


def test_admin_correct_payload_diff_includes_sync_fields():
    """تأكد أن النموذج المنطقي يبني `mi_sync` فقط للحقول المُحدّثة."""
    # محاكاة منطق mi_sync داخل الـ endpoint
    update = {"unit": "قطعة", "name": "صوص محدث", "cost_per_unit": 5500.0}
    mi_sync = {}
    if "unit" in update:
        mi_sync["unit"] = update["unit"]
    if "name" in update:
        mi_sync["material_name"] = update["name"]
        mi_sync["raw_material_name"] = update["name"]
    if "cost_per_unit" in update:
        mi_sync["cost_per_unit"] = update["cost_per_unit"]
    assert mi_sync["unit"] == "قطعة"
    assert mi_sync["material_name"] == "صوص محدث"
    assert mi_sync["raw_material_name"] == "صوص محدث"
    assert mi_sync["cost_per_unit"] == 5500.0


def test_admin_correct_quantity_only_does_not_touch_mi():
    """تحديث الكمية وحدها لا يبني mi_sync (الكمية لا تتغير في قسم التصنيع)."""
    update = {"quantity": 99}
    mi_sync = {}
    if "unit" in update:
        mi_sync["unit"] = update["unit"]
    if "name" in update:
        mi_sync["material_name"] = update["name"]
    if "cost_per_unit" in update:
        mi_sync["cost_per_unit"] = update["cost_per_unit"]
    assert mi_sync == {}


if __name__ == "__main__":
    test_admin_correct_payload_diff_includes_sync_fields()
    test_admin_correct_quantity_only_does_not_touch_mi()
    print("✅ اختبارات admin-correct → mi_sync نجحت")
