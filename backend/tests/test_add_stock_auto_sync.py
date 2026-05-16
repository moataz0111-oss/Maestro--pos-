"""Test that add-stock auto-scales the recipe to match new quantity."""
import requests
import uuid
import pytest

BASE_URL = open("/app/frontend/.env").read().split("REACT_APP_BACKEND_URL=")[-1].split("\n")[0].strip()


@pytest.fixture(scope="module")
def admin_headers():
    r = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": "hanialdujaili@gmail.com", "password": "Hani@2024"},
        timeout=20,
    )
    assert r.status_code == 200
    return {"Authorization": f"Bearer {r.json()['token']}", "Content-Type": "application/json"}


def test_add_stock_auto_scales_recipe(admin_headers):
    rm_name = f"TEST_meat_{uuid.uuid4().hex[:6]}"
    r = requests.post(
        f"{BASE_URL}/api/raw-materials-new",
        headers=admin_headers,
        json={"name": rm_name, "unit": "غرام", "quantity": 1000, "min_quantity": 0,
              "cost_per_unit": 10, "waste_percentage": 0},
        timeout=15,
    )
    rm_id = r.json()["id"]

    mp_name = f"TEST_burger_{uuid.uuid4().hex[:6]}"
    r = requests.post(
        f"{BASE_URL}/api/manufactured-products",
        headers=admin_headers,
        json={
            "name": mp_name, "unit": "حبة", "selling_price": 5000,
            "piece_weight": 120, "piece_weight_unit": "غرام",
            "recipe": [{
                "raw_material_id": rm_id, "raw_material_name": rm_name,
                "quantity": 1000, "unit": "غرام",  # yields 8.333
                "cost_per_unit": 10, "waste_percentage": 0,
            }],
        },
        timeout=15,
    )
    mp_id = r.json()["id"]
    try:
        # Manually add 10 pieces (recipe yields ~8.333, target=10)
        r = requests.post(
            f"{BASE_URL}/api/manufactured-products/{mp_id}/add-stock?quantity=10",
            headers=admin_headers,
            timeout=15,
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert data.get("recipe_scaled") is True
        # scale = 10 / 8.333 ≈ 1.2
        assert abs(data["scale_factor"] - 1.2) < 0.02

        # Verify recipe in DB updated
        r2 = requests.get(f"{BASE_URL}/api/manufactured-products/{mp_id}", headers=admin_headers, timeout=15)
        product = r2.json()
        # ingredient quantity should be ~1200 (1000 * 1.2)
        assert abs(product["recipe"][0]["quantity"] - 1200) < 0.5
        assert abs(product["quantity"] - 10) < 0.01
    finally:
        requests.delete(f"{BASE_URL}/api/manufactured-products/{mp_id}", headers=admin_headers, timeout=15)
        requests.delete(f"{BASE_URL}/api/raw-materials-new/{rm_id}", headers=admin_headers, timeout=15)
