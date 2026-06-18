"""
اختبار حقل "كمية إنتاج الوصفة الفعلية" (actual_recipe_yield).
يتحقق أن العائد وتكلفة الوحدة تُحسب من القيمة الفعلية المُدخلة (تمدّد/انكماش الطبخ)
بدلاً من مجموع أوزان المكونات — مع بقاء الوصفات القديمة (بلا الحقل) كما هي.
"""
import os
import requests

API = os.environ.get("REACT_APP_BACKEND_URL", "https://pwa-driver-track.preview.emergentagent.com").rstrip("/") + "/api"
ADMIN = {"email": "admin@maestroegp.com", "password": "admin123"}


def _login():
    r = requests.post(f"{API}/auth/login", json=ADMIN, timeout=30)
    r.raise_for_status()
    data = r.json()
    return data.get("access_token") or data.get("token")


def _headers():
    return {"Authorization": f"Bearer {_login()}"}


def test_actual_recipe_yield_overrides_ingredients_sum():
    h = _headers()
    # مادة خام: نشأ (نستخدم وحدة وزنية مباشرة في الوصفة لتجنّب الاعتماد على مخزون)
    recipe = [
        {"raw_material_name": "نشأ", "quantity": 6000, "unit": "غرام", "cost_per_unit": 2.0, "waste_percentage": 0},
        {"raw_material_name": "زيت", "quantity": 795, "unit": "غرام", "cost_per_unit": 5.0, "waste_percentage": 0},
    ]
    # المجموع = 6795 غرام = 6.795 كغم. الوحدة الرئيسية كغم. العائد الافتراضي = 6.795
    # لكن الناتج الفعلي بعد إضافة الماء = 7 كغم.
    payload = {
        "name": "مايونيز اختبار العائد الفعلي",
        "unit": "كغم",
        "recipe": recipe,
        "actual_recipe_yield": 7.0,
    }
    r = requests.post(f"{API}/manufactured-products", json=payload, headers=h, timeout=30)
    assert r.status_code == 200, r.text
    pid = r.json()["id"]

    try:
        # اجلب المنتج المُثرى
        g = requests.get(f"{API}/manufactured-products/{pid}", headers=h, timeout=30)
        assert g.status_code == 200, g.text
        prod = g.json()
        assert abs(float(prod.get("actual_recipe_yield") or 0) - 7.0) < 1e-6
        # العائد المحسوب يجب أن يساوي 7 (الفعلي) وليس 6.795 (مجموع المكونات)
        assert abs(float(prod["computed_yield"]) - 7.0) < 1e-3, prod["computed_yield"]
        # التكلفة قبل الهدر = 6000*2 + 795*5 = 12000 + 3975 = 15975 ÷ 7 = 2282.14
        expected_unit_before = 15975.0 / 7.0
        assert abs(float(prod["unit_cost_before_waste"]) - expected_unit_before) < 0.5, prod["unit_cost_before_waste"]
    finally:
        requests.delete(f"{API}/manufactured-products/{pid}", headers=h, timeout=30)


def test_no_actual_yield_falls_back_to_ingredients_sum():
    """تأكيد عدم التعارض مع الوصفات القديمة: بدون الحقل، العائد = مجموع المكونات."""
    h = _headers()
    recipe = [
        {"raw_material_name": "نشأ", "quantity": 6000, "unit": "غرام", "cost_per_unit": 2.0, "waste_percentage": 0},
        {"raw_material_name": "زيت", "quantity": 795, "unit": "غرام", "cost_per_unit": 5.0, "waste_percentage": 0},
    ]
    payload = {
        "name": "مايونيز بدون عائد فعلي",
        "unit": "كغم",
        "recipe": recipe,
        # لا actual_recipe_yield
    }
    r = requests.post(f"{API}/manufactured-products", json=payload, headers=h, timeout=30)
    assert r.status_code == 200, r.text
    pid = r.json()["id"]
    try:
        g = requests.get(f"{API}/manufactured-products/{pid}", headers=h, timeout=30)
        prod = g.json()
        # العائد = 6795 غرام ÷ 1000 = 6.795 كغم (السلوك القديم)
        assert abs(float(prod["computed_yield"]) - 6.795) < 1e-3, prod["computed_yield"]
    finally:
        requests.delete(f"{API}/manufactured-products/{pid}", headers=h, timeout=30)


def test_patch_recipe_sets_and_clears_actual_yield():
    h = _headers()
    recipe = [
        {"raw_material_name": "نشأ", "quantity": 6000, "unit": "غرام", "cost_per_unit": 2.0, "waste_percentage": 0},
    ]
    r = requests.post(f"{API}/manufactured-products", json={"name": "اختبار تعديل العائد", "unit": "كغم", "recipe": recipe}, headers=h, timeout=30)
    pid = r.json()["id"]
    try:
        # عيّن العائد الفعلي عبر PATCH
        patch = {"recipe": recipe, "actual_recipe_yield": 8.5}
        p = requests.patch(f"{API}/manufactured-products/{pid}/recipe", json=patch, headers=h, timeout=30)
        assert p.status_code == 200, p.text
        prod = requests.get(f"{API}/manufactured-products/{pid}", headers=h, timeout=30).json()
        assert abs(float(prod.get("actual_recipe_yield") or 0) - 8.5) < 1e-6
        assert abs(float(prod["computed_yield"]) - 8.5) < 1e-3
    finally:
        requests.delete(f"{API}/manufactured-products/{pid}", headers=h, timeout=30)


if __name__ == "__main__":
    test_actual_recipe_yield_overrides_ingredients_sum()
    test_no_actual_yield_falls_back_to_ingredients_sum()
    test_patch_recipe_sets_and_clears_actual_yield()
    print("ALL TESTS PASSED")
