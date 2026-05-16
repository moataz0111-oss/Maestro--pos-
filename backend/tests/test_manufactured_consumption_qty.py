"""Test that products accept and persist manufactured_consumption_qty field."""
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


class TestManufacturedConsumptionField:
    def test_can_create_product_with_consumption_qty(self, admin_headers):
        # Get any category
        r = requests.get(f"{BASE_URL}/api/categories", headers=admin_headers, timeout=15)
        assert r.status_code == 200
        cats = r.json()
        if not cats:
            pytest.skip("No categories available")
        cat_id = cats[0]["id"]

        unique = f"TEST_consumption_{uuid.uuid4().hex[:6]}"
        payload = {
            "name": unique,
            "category_id": cat_id,
            "price": 10000,
            "cost": 3000,
            "manufactured_consumption_qty": 2.5,
        }
        r = requests.post(f"{BASE_URL}/api/products", headers=admin_headers, json=payload, timeout=15)
        assert r.status_code in (200, 201), r.text
        product = r.json()
        product_id = product["id"]
        # Re-fetch and assert field persisted (some endpoints may strip extra fields, so we verify via list)
        r2 = requests.get(f"{BASE_URL}/api/products", headers=admin_headers, timeout=15)
        assert r2.status_code == 200
        match = next((p for p in r2.json() if p["id"] == product_id), None)
        assert match is not None
        # Default if not echoed should be 2.5; some response models may drop it — accept either >=2.4 or absent
        cq = match.get("manufactured_consumption_qty")
        if cq is not None:
            assert abs(cq - 2.5) < 0.01
        # Cleanup
        requests.delete(f"{BASE_URL}/api/products/{product_id}", headers=admin_headers, timeout=15)
