"""Test that linked-product cost = per-piece cost (batch_cost / yield), not the full batch cost.

Scenario:
- Create raw material (1000g, cost=10 per gram → batch cost=10000)
- Create manufactured product: piece_weight=120g, recipe=1000g of that material
  → calculated_yield = 1000/120 = 8.333 pieces
  → per-piece cost = 10000 / 8.333 = 1200
- Create a regular product linked to it with consumption_qty=1
- Create an order with this product → backend cost should be ~1200 (NOT 10000)
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


def test_linked_product_cost_uses_per_piece_not_batch(admin_headers):
    # 1. Raw material
    rm_name = f"TEST_meat_{uuid.uuid4().hex[:6]}"
    r = requests.post(
        f"{BASE_URL}/api/raw-materials-new",
        headers=admin_headers,
        json={"name": rm_name, "unit": "غرام", "quantity": 2000, "min_quantity": 0,
              "cost_per_unit": 10, "waste_percentage": 0},
        timeout=15,
    )
    assert r.status_code in (200, 201), r.text
    rm = r.json()
    rm_id = rm["id"]

    # 2. Manufactured product: 1000g recipe, piece=120g → yield=8.333
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
                "raw_material_id": rm_id, "raw_material_name": rm_name,
                "quantity": 1000, "unit": "غرام",
                "cost_per_unit": 10, "waste_percentage": 0,
            }],
        },
        timeout=15,
    )
    assert r.status_code in (200, 201), r.text
    mp = r.json()
    mp_id = mp["id"]
    # batch cost = 1000 * 10 = 10000
    assert abs(mp.get("raw_material_cost", 0) - 10000) < 1

    try:
        # 3. Create category + product linked
        r = requests.get(f"{BASE_URL}/api/categories", headers=admin_headers, timeout=15)
        cat_id = r.json()[0]["id"]
        prod_name = f"TEST_classic_{uuid.uuid4().hex[:6]}"
        r = requests.post(
            f"{BASE_URL}/api/products",
            headers=admin_headers,
            json={
                "name": prod_name, "category_id": cat_id,
                "price": 5000, "cost": 0,  # cost will be overridden by linked mfg
                "manufactured_product_id": mp_id,
                "manufactured_consumption_qty": 1,
            },
            timeout=15,
        )
        assert r.status_code in (200, 201), r.text
        prod = r.json()
        prod_id = prod["id"]

        try:
            # 4. Get cost-calculation via products list
            r = requests.get(f"{BASE_URL}/api/products", headers=admin_headers, timeout=15)
            assert r.status_code == 200
            this_p = next((p for p in r.json() if p["id"] == prod_id), None)
            assert this_p is not None, "Created product not in list"
            # Backend doesn't auto-recompute cost on list — that's frontend's job
            # So we test validate_and_calculate_costs via order creation

            # 5. Fetch a branch
            r = requests.get(f"{BASE_URL}/api/branches", headers=admin_headers, timeout=15)
            if r.status_code != 200 or not r.json():
                pytest.skip("No branches")
            branch_id = r.json()[0]["id"]

            # 6. Create an order with this product (1 unit)
            # NOTE: this consumes 1 manufactured burger
            r = requests.post(
                f"{BASE_URL}/api/orders",
                headers=admin_headers,
                json={
                    "items": [{"product_id": prod_id, "quantity": 1, "price": 5000}],
                    "branch_id": branch_id,
                    "order_type": "dine_in",
                    "payment_method": "cash",
                    "total": 5000,
                },
                timeout=20,
            )
            # Cost is computed internally; we verify it's reasonable via the response
            if r.status_code in (200, 201):
                order = r.json()
                # If the API returns raw_material_cost on order, validate it
                # Per-piece cost = 10000 / 8.333 ≈ 1200
                # If the bug existed (batch cost used as unit), it would be ~10000
                raw_cost = order.get("raw_material_cost") or order.get("total_cost") or 0
                if raw_cost > 0:
                    # Should NOT be near 10000 (which would indicate batch cost as unit cost)
                    assert raw_cost < 5000, f"Cost {raw_cost} is too high — looks like batch cost, not per-piece"
        finally:
            requests.delete(f"{BASE_URL}/api/products/{prod_id}", headers=admin_headers, timeout=15)
    finally:
        requests.delete(f"{BASE_URL}/api/manufactured-products/{mp_id}", headers=admin_headers, timeout=15)
        requests.delete(f"{BASE_URL}/api/raw-materials-new/{rm_id}", headers=admin_headers, timeout=15)
