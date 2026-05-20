"""
Test: Pydantic model `RecipeIngredient` يقبل المكوّن من نوع منتج مُصنّع
(manufactured_product_id) بدون raw_material_id.

يحاكي حالة المستخدم في الفورك السابق:
عند إضافة "مايونيز" (منتج مُصنّع) كمكوّن في وصفة برغر،
الفرونتند يرسل manufactured_product_id فقط، بدون raw_material_id.
كان السيرفر يرفض الطلب بـ 422 — هذا التست يضمن النجاح بعد الإصلاح.
"""
import sys
import pytest
from pathlib import Path

# مسموح: pytest باستيراد مباشر
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from routes.inventory_system import RecipeIngredient, ManufacturedProductCreate
_ = pytest  # silence unused import


def test_recipe_ingredient_accepts_manufactured_only():
    """مكوّن من نوع منتج مُصنّع — بدون raw_material_id."""
    ing = RecipeIngredient(
        manufactured_product_id="bc7dbb04-a72a-47c7-a297-3def6deb7a26",
        raw_material_name="مايونيز",
        quantity=1.5,
        unit="كغم",
        cost_per_unit=2534.18,
        waste_percentage=0,
        source="manufactured",
    )
    assert ing.manufactured_product_id == "bc7dbb04-a72a-47c7-a297-3def6deb7a26"
    assert ing.raw_material_id is None
    assert ing.source == "manufactured"


def test_recipe_ingredient_accepts_raw_material_only():
    """مكوّن من نوع مادة خام — السلوك التقليدي."""
    ing = RecipeIngredient(
        raw_material_id="rm-1",
        raw_material_name="طماطم",
        quantity=2,
        unit="كغم",
        cost_per_unit=1000,
    )
    assert ing.raw_material_id == "rm-1"
    assert ing.manufactured_product_id is None


def test_recipe_ingredient_accepts_orphan_for_legacy_compatibility():
    """⭐ يجب قبول مكوّن بدون أي معرّف (للتوافق مع البيانات القديمة).
    سيتم محاولة الربط التلقائي بالاسم في طبقة المعالجة (handler)."""
    ing = RecipeIngredient(
        raw_material_name="مايونيز قديم",
        quantity=1,
        unit="كغم",
        cost_per_unit=100,
    )
    assert ing.raw_material_id is None
    assert ing.manufactured_product_id is None


def test_manufactured_product_create_with_mixed_recipe():
    """ManufacturedProductCreate يقبل وصفة بمكونات مختلطة (raw + manufactured)."""
    payload = {
        "name": "برغر دجاج",
        "unit": "قطعة",
        "piece_weight": 80,
        "piece_weight_unit": "غرام",
        "recipe": [
            {
                "raw_material_id": "rm-bread",
                "raw_material_name": "خبز",
                "quantity": 1,
                "unit": "قطعة",
                "cost_per_unit": 500,
            },
            {
                "manufactured_product_id": "mayo-001",
                "raw_material_name": "مايونيز",
                "quantity": 0.05,
                "unit": "كغم",
                "cost_per_unit": 2534.18,
                "source": "manufactured",
            },
        ],
        "selling_price": 5000,
    }
    obj = ManufacturedProductCreate(**payload)
    assert len(obj.recipe) == 2
    assert obj.recipe[0].raw_material_id == "rm-bread"
    assert obj.recipe[1].manufactured_product_id == "mayo-001"
    assert obj.recipe[1].raw_material_id is None


if __name__ == "__main__":
    test_recipe_ingredient_accepts_manufactured_only()
    test_recipe_ingredient_accepts_raw_material_only()
    test_recipe_ingredient_accepts_orphan_for_legacy_compatibility()
    test_manufactured_product_create_with_mixed_recipe()
    print("✅ كل الاختبارات نجحت!")
