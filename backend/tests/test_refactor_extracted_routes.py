"""
Regression tests for routes extracted from server.py during modular refactor.
Covers: sales_target_routes, break_even_routes.
Run: cd /app/backend && python -m pytest tests/test_refactor_extracted_routes.py -v
"""
import os
import requests
import pytest

API = os.environ.get("TEST_API_URL") or "http://localhost:8001"
ADMIN_EMAIL = "admin@maestroegp.com"
ADMIN_PASSWORD = "admin123"


@pytest.fixture(scope="module")
def token():
    r = requests.post(f"{API}/api/auth/login",
                      json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=15)
    assert r.status_code == 200, r.text
    return r.json()["token"]


def _headers(token):
    return {"Authorization": f"Bearer {token}"}


def test_sales_target_get_and_set(token):
    h = _headers(token)
    # set
    r = requests.post(f"{API}/api/sales-target", json={"target_amount": 750000,
                      "motivational_message": "test"}, headers=h, timeout=15)
    assert r.status_code == 200, r.text
    assert r.json()["target_amount"] == 750000
    # get reflects it
    r = requests.get(f"{API}/api/sales-target", headers=h, timeout=15)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["has_target"] is True
    assert body["target_amount"] == 750000.0


def test_sales_target_rejects_non_positive(token):
    h = _headers(token)
    r = requests.post(f"{API}/api/sales-target", json={"target_amount": 0}, headers=h, timeout=15)
    assert r.status_code == 400


@pytest.mark.parametrize("ep", [
    "break-even/daily",
    "break-even/daily-range",
    "break-even/monthly-summary",
    "break-even/alerts",
])
def test_break_even_endpoints_ok(token, ep):
    r = requests.get(f"{API}/api/{ep}", headers=_headers(token), timeout=20)
    assert r.status_code == 200, f"{ep} -> {r.status_code}: {r.text[:200]}"


def test_core_endpoints_unbroken(token):
    """Ensure removing lines from server.py didn't break neighbouring routes."""
    h = _headers(token)
    for ep in ["products", "orders", "branches", "smart-reports/sales", "reports/sales"]:
        r = requests.get(f"{API}/api/{ep}", headers=h, timeout=20)
        assert r.status_code == 200, f"{ep} -> {r.status_code}"


@pytest.mark.parametrize("ep", [
    "reservations", "reservations/stats",
    "reviews", "reviews/stats",
    "suppliers",
])
def test_reservations_reviews_suppliers_ok(token, ep):
    r = requests.get(f"{API}/api/{ep}", headers=_headers(token), timeout=20)
    assert r.status_code == 200, f"{ep} -> {r.status_code}: {r.text[:200]}"


def test_supplier_create(token):
    h = _headers(token)
    r = requests.post(f"{API}/api/suppliers",
                      json={"name": "مورد بايتست", "phone": "0770000000"}, headers=h, timeout=15)
    assert r.status_code == 200, r.text
    assert r.json().get("name") == "مورد بايتست"


def test_purchase_orders_still_in_server(token):
    """purchase-orders left in server.py uses Supplier models — must still work."""
    r = requests.get(f"{API}/api/purchase-orders", headers=_headers(token), timeout=20)
    assert r.status_code == 200
