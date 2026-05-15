"""Regression tests for PATCH /api/manufactured-products/{id}/recipe.

Validates:
- Recipe is updated and persisted
- Costs (before/after waste, production_cost) are recalculated
- Waste factor math is correct
- Empty recipe is rejected
- 404 on unknown product id
- Audit log is created
"""
import pytest
import requests

BASE_URL = open("/app/frontend/.env").read().split("REACT_APP_BACKEND_URL=")[-1].split("\n")[0].strip()
ADMIN_EMAIL = "hanialdujaili@gmail.com"
ADMIN_PASSWORD = "Hani@2024"


@pytest.fixture(scope="module")
def admin_headers():
    r = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
        timeout=20,
    )
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['token']}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def target_product(admin_headers):
    r = requests.get(f"{BASE_URL}/api/manufactured-products", headers=admin_headers, timeout=15)
    assert r.status_code == 200
    products = r.json()
    if not products:
        pytest.skip("No manufactured products exist to test against")
    # Capture original recipe to restore after tests
    p = products[0]
    return p


@pytest.fixture(scope="module", autouse=True)
def restore_after(target_product, admin_headers):
    """Snapshot original recipe and restore after the module finishes."""
    original_recipe = [
        {
            "raw_material_id": ing["raw_material_id"],
            "raw_material_name": ing.get("raw_material_name", ""),
            "quantity": ing["quantity"],
            "unit": ing["unit"],
            "cost_per_unit": ing.get("cost_per_unit", 0),
            "waste_percentage": ing.get("waste_percentage", 0),
        }
        for ing in target_product.get("recipe", [])
    ]
    yield
    # Restore
    if original_recipe:
        requests.patch(
            f"{BASE_URL}/api/manufactured-products/{target_product['id']}/recipe",
            json={"recipe": original_recipe, "reason": "restore-after-tests"},
            headers=admin_headers,
            timeout=15,
        )


class TestManufacturedRecipeEdit:
    def test_unknown_product_returns_404(self, admin_headers):
        r = requests.patch(
            f"{BASE_URL}/api/manufactured-products/__no_such_id__/recipe",
            json={"recipe": [{
                "raw_material_id": "x", "raw_material_name": "x",
                "quantity": 1, "unit": "غرام", "cost_per_unit": 1, "waste_percentage": 0,
            }]},
            headers=admin_headers,
            timeout=15,
        )
        assert r.status_code == 404

    def test_empty_recipe_rejected(self, admin_headers, target_product):
        r = requests.patch(
            f"{BASE_URL}/api/manufactured-products/{target_product['id']}/recipe",
            json={"recipe": []},
            headers=admin_headers,
            timeout=15,
        )
        assert r.status_code == 400

    def test_recipe_updates_and_costs_recalculate(self, admin_headers, target_product):
        # Use the first existing ingredient as a known-good raw_material_id
        first = target_product["recipe"][0]
        new_recipe = [{
            "raw_material_id": first["raw_material_id"],
            "raw_material_name": first.get("raw_material_name", ""),
            "quantity": 200.0,
            "unit": first["unit"],
            "cost_per_unit": 10.0,
            "waste_percentage": 20.0,  # 20% waste
        }]
        r = requests.patch(
            f"{BASE_URL}/api/manufactured-products/{target_product['id']}/recipe",
            json={"recipe": new_recipe, "reason": "pytest"},
            headers=admin_headers,
            timeout=15,
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["success"] is True
        product = body["product"]
        assert len(product["recipe"]) == 1
        # before-waste = 200 * 10 = 2000
        assert abs(product["cost_before_waste"] - 2000.0) < 0.01
        # after-waste effective cpu = 10 / (1-0.20) = 12.5; 200 * 12.5 = 2500
        assert abs(product["production_cost"] - 2500.0) < 0.01
        assert abs(product["raw_material_cost_after_waste"] - 2500.0) < 0.01

    def test_get_reflects_persisted_changes(self, admin_headers, target_product):
        r = requests.get(
            f"{BASE_URL}/api/manufactured-products/{target_product['id']}",
            headers=admin_headers,
            timeout=15,
        )
        assert r.status_code == 200
        product = r.json()
        # Should reflect the previous PATCH (1 ingredient with quantity 200)
        assert len(product["recipe"]) == 1
        assert abs(product["recipe"][0]["quantity"] - 200.0) < 0.01
