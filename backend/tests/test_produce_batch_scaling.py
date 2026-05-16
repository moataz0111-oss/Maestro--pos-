"""Test that produce() in batch mode auto-scales the recipe.

Scenario:
- Create a raw material (لحم) with sufficient stock in manufacturing inventory
- Create a manufactured product (test-burger) with piece_weight=120g and recipe of 1000g لحم
  ⇒ calculated_yield = 1000/120 = 8.333 pieces
- Call /produce?quantity=10 (more than yield)
- Expect:
  - 200 OK with recipe_scaled=True, scale_factor≈1.2
  - Recipe quantity scaled to 1200g
  - Inventory deducted by 1200g (NOT 10×1000g=10000g)
  - new_quantity = 10
"""
import pytest
import requests
import uuid

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


def test_produce_batch_mode_auto_scales_recipe(admin_headers):
    # 1. Create raw material with 2000g stock
    rm_name = f"TEST_meat_{uuid.uuid4().hex[:6]}"
    r = requests.post(
        f"{BASE_URL}/api/raw-materials-new",
        headers=admin_headers,
        json={
            "name": rm_name,
            "unit": "غرام",
            "quantity": 2000,
            "min_quantity": 0,
            "cost_per_unit": 10,
            "waste_percentage": 0,
        },
        timeout=15,
    )
    assert r.status_code in (200, 201), r.text
    rm = r.json()
    rm_id = rm["id"]

    # 2. Transfer 2000g to manufacturing
    r = requests.post(
        f"{BASE_URL}/api/warehouse-to-manufacturing",
        headers=admin_headers,
        json={"items": [{"raw_material_id": rm_id, "quantity": 2000}], "notes": "test"},
        timeout=15,
    )
    assert r.status_code in (200, 201), r.text

    # 3. Create manufactured product with piece_weight=120g, recipe needs 1000g
    mp_name = f"TEST_burger_{uuid.uuid4().hex[:6]}"
    r = requests.post(
        f"{BASE_URL}/api/manufactured-products",
        headers=admin_headers,
        json={
            "name": mp_name,
            "unit": "حبة",
            "selling_price": 5000,
            "piece_weight": 120,
            "piece_weight_unit": "غرام",
            "recipe": [{
                "raw_material_id": rm_id,
                "raw_material_name": rm_name,
                "quantity": 1000,
                "unit": "غرام",
                "cost_per_unit": 10,
                "waste_percentage": 0,
            }],
        },
        timeout=15,
    )
    assert r.status_code in (200, 201), r.text
    mp = r.json()
    mp_id = mp["id"]

    try:
        # calculated_yield should be ~8.333
        # 4. Produce 10 pieces — system should scale recipe to 1200g
        r = requests.post(
            f"{BASE_URL}/api/manufactured-products/{mp_id}/produce?quantity=10",
            headers=admin_headers,
            timeout=15,
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert data.get("batch_mode") is True
        assert data.get("recipe_scaled") is True
        # scale_factor ≈ 10 / 8.333 ≈ 1.2
        assert abs(data["scale_factor"] - 1.2) < 0.01

        # 5. Verify recipe updated
        r2 = requests.get(f"{BASE_URL}/api/manufactured-products/{mp_id}", headers=admin_headers, timeout=15)
        assert r2.status_code == 200
        updated = r2.json()
        assert len(updated["recipe"]) == 1
        # 1000 × 1.2 = 1200
        assert abs(updated["recipe"][0]["quantity"] - 1200) < 0.5
        assert abs(updated["quantity"] - 10) < 0.01

        # 6. Verify manufacturing inventory deducted by 1200g (not 10000g)
        r3 = requests.get(f"{BASE_URL}/api/manufacturing-inventory", headers=admin_headers, timeout=15)
        assert r3.status_code == 200
        inv = next((m for m in r3.json() if (m.get("material_id") == rm_id or m.get("raw_material_id") == rm_id)), None)
        assert inv is not None
        # Started with 2000, deducted ~1200 → remaining ~800
        assert abs(inv["quantity"] - 800) < 1.0
    finally:
        # Cleanup
        requests.delete(f"{BASE_URL}/api/manufactured-products/{mp_id}", headers=admin_headers, timeout=15)
        requests.delete(f"{BASE_URL}/api/raw-materials-new/{rm_id}", headers=admin_headers, timeout=15)
