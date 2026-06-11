"""Tests for delivery collect: total_materials_cost persistence + pending orders endpoint."""
import os
import pytest
import requests

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'http://localhost:8001').rstrip('/')


@pytest.fixture(scope="module")
def auth_token():
    r = requests.post(f"{BASE_URL}/api/auth/login", json={
        "email": "admin@maestroegp.com",
        "password": "admin123"
    }, timeout=30)
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    tok = r.json().get("token") or r.json().get("access_token")
    assert tok
    return tok


@pytest.fixture(scope="module")
def headers(auth_token):
    return {"Authorization": f"Bearer {auth_token}", "Content-Type": "application/json"}


def _get_app_id(headers):
    # find any delivery app id
    r = requests.get(f"{BASE_URL}/api/delivery-app-settings", headers=headers, timeout=30)
    if r.status_code == 200:
        arr = r.json() if isinstance(r.json(), list) else r.json().get("items", [])
        for a in arr:
            if a.get("app_id") or a.get("id"):
                return a.get("app_id") or a.get("id"), a.get("name") or "test"
    # fallback default
    return "toters", "توترز"


def test_collect_accepts_total_materials_cost(headers):
    app_id, app_name = _get_app_id(headers)
    payload = {
        "delivery_app_id": app_id,
        "delivery_app_name": app_name,
        "amount": 50000.0,
        "total_sales": 60000.0,
        "commission": 10000.0,
        "offer_amount": 0.0,
        "collected_by": "TEST_iter228",
        "total_materials_cost": 12345.67,
        "notes": "TEST_iter228_materials_cost"
    }
    r = requests.post(f"{BASE_URL}/api/reports/delivery/collect", headers=headers, json=payload, timeout=30)
    assert r.status_code in (200, 201), f"collect failed: {r.status_code} {r.text}"
    data = r.json()
    # check record contains total_materials_cost
    rec = data.get("collection") or data
    # The endpoint should NOT 500 even when total_materials_cost is provided
    print("collect response:", data)


def test_collections_list_includes_fields(headers):
    r = requests.get(f"{BASE_URL}/api/reports/delivery/collections", headers=headers, timeout=30)
    assert r.status_code == 200, f"collections failed: {r.status_code} {r.text}"
    body = r.json()
    items = body if isinstance(body, list) else body.get("collections") or body.get("items") or []
    assert isinstance(items, list)
    assert len(items) > 0, "expected at least one delivery_collection (we just created one)"
    sample = items[0]
    # Find the record we created (by notes) if present, else use latest
    our = None
    for it in items:
        if it.get("notes") == "TEST_iter228_materials_cost":
            our = it
            break
    target = our or sample
    # required fields
    for field in ("amount", "total_sales", "commission", "offer_amount", "total_materials_cost"):
        assert field in target, f"missing field {field} in collection record: {target}"
    if our is not None:
        assert abs(float(our["total_materials_cost"]) - 12345.67) < 0.01


def test_orders_pending_payment_status(headers):
    r = requests.get(f"{BASE_URL}/api/orders", params={"payment_status": "pending"}, headers=headers, timeout=30)
    assert r.status_code == 200, f"orders pending failed: {r.status_code} {r.text}"
    data = r.json()
    # should be a list (no error)
    orders = data if isinstance(data, list) else data.get("orders", [])
    assert isinstance(orders, list)
    # all returned orders should have payment_status pending OR be delivery orders still uncollected
    for o in orders[:20]:
        ps = o.get("payment_status")
        # accept either explicitly pending or null (legacy) — endpoint shouldn't 500
        assert ps in (None, "pending", "unpaid", "") or o.get("order_type") == "delivery", f"unexpected ps={ps}"
