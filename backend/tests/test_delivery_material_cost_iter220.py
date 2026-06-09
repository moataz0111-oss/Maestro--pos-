"""
iter220 — كلفة المواد لكل شركة توصيل في تقرير delivery-credits.
يتحقق أن endpoint يُعيد materials_cost / total_materials_cost لكل شركة
+ cost_breakdown_by_product للـ drill-down.
"""
import os
import requests

API = os.environ.get("REACT_APP_BACKEND_URL", "http://localhost:8001").rstrip("/") + "/api"


def _login():
    r = requests.post(f"{API}/auth/login", json={"email": "admin@maestroegp.com", "password": "admin123"}, timeout=30)
    r.raise_for_status()
    d = r.json()
    return d.get("token") or d.get("access_token")


def test_delivery_credits_has_material_cost_fields():
    token = _login()
    r = requests.get(f"{API}/reports/delivery-credits", headers={"Authorization": f"Bearer {token}"}, timeout=60)
    assert r.status_code == 200, r.text
    data = r.json()
    # حقول الإجمالي الجديدة موجودة
    assert "total_materials_cost" in data
    assert "total_packaging_cost" in data
    # كل شركة لها كلفة مواد + تفصيل المنتجات
    by_app = data.get("by_delivery_app", {})
    for name, v in by_app.items():
        assert "materials_cost" in v, f"{name} missing materials_cost"
        assert "total_materials_cost" in v, f"{name} missing total_materials_cost"
        assert "cost_breakdown_by_product" in v, f"{name} missing cost_breakdown_by_product"
        # كل منتج في التفصيل به الحقول المطلوبة
        for pname, pv in v["cost_breakdown_by_product"].items():
            assert "quantity" in pv and "revenue" in pv and "materials_cost" in pv


if __name__ == "__main__":
    test_delivery_credits_has_material_cost_fields()
    print("PASS: delivery material cost fields present")
