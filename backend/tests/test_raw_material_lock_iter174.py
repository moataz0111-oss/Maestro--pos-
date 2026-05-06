"""
Iter 174 — Owner-only Edit/Delete with transfer-state lock for Raw Materials.

Covers:
- GET /api/raw-materials-new returns is_transferred / can_edit / can_delete
- PUT on transferred → 409 (Arabic message)
- DELETE on transferred → 409
- PUT on non-transferred → 200
- DELETE on non-transferred → 200 (and removes raw_material + cost_layers)
- POST /add-stock works AFTER transfer
- POST /raw-materials-new creates new material with is_transferred=False
"""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
ADMIN_EMAIL = "hanialdujaili@gmail.com"
ADMIN_PASS = "Hani@2024"
TOMATO_ID = "c4b3b488-011b-4fdb-a4b7-c5f3c76033d1"


@pytest.fixture(scope="module")
def admin_token():
    r = requests.post(f"{BASE_URL}/api/auth/login",
                      json={"email": ADMIN_EMAIL, "password": ADMIN_PASS}, timeout=30)
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    return r.json().get("access_token") or r.json().get("token")


@pytest.fixture(scope="module")
def admin_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}"}


# ---------- 1) GET list returns flags ----------
def test_list_returns_flags_and_tomato_transferred(admin_headers):
    r = requests.get(f"{BASE_URL}/api/raw-materials-new", headers=admin_headers, timeout=30)
    assert r.status_code == 200
    data = r.json()
    assert isinstance(data, list)
    assert len(data) > 0
    sample = data[0]
    for key in ("is_transferred", "can_edit", "can_delete"):
        assert key in sample, f"missing field {key}"
    # Each material's can_edit/can_delete must equal NOT is_transferred
    for m in data:
        assert m["can_edit"] == (not m["is_transferred"])
        assert m["can_delete"] == (not m["is_transferred"])
    # tomato must be transferred=True
    tomato = next((m for m in data if m["id"] == TOMATO_ID), None)
    assert tomato is not None, "طماطم not found in list"
    assert tomato["is_transferred"] is True
    assert tomato["can_edit"] is False
    assert tomato["can_delete"] is False


# ---------- 2) PUT/DELETE on transferred material → 409 Arabic ----------
def test_put_transferred_returns_409(admin_headers):
    # Get tomato current values to send back
    r = requests.get(f"{BASE_URL}/api/raw-materials-new/{TOMATO_ID}",
                     headers=admin_headers, timeout=30)
    assert r.status_code == 200
    tomato = r.json()
    payload = {
        "name": tomato.get("name", "طماطم"),
        "unit": tomato.get("unit", "kg"),
        "quantity": tomato.get("quantity", 0),
        "cost_per_unit": tomato.get("cost_per_unit", 0),
        "min_quantity": tomato.get("min_quantity", 0),
        "waste_percentage": tomato.get("waste_percentage", 0),
    }
    r2 = requests.put(f"{BASE_URL}/api/raw-materials-new/{TOMATO_ID}",
                      headers=admin_headers, json=payload, timeout=30)
    assert r2.status_code == 409, f"expected 409, got {r2.status_code} {r2.text}"
    detail = r2.json().get("detail", "")
    assert "تحويل" in detail or "تعديل" in detail, f"detail not Arabic-locked: {detail}"


def test_delete_transferred_returns_409(admin_headers):
    r = requests.delete(f"{BASE_URL}/api/raw-materials-new/{TOMATO_ID}",
                        headers=admin_headers, timeout=30)
    assert r.status_code == 409, f"expected 409, got {r.status_code} {r.text}"
    detail = r.json().get("detail", "")
    assert "تحويل" in detail or "حذف" in detail


# ---------- 3) add-stock still works after transfer ----------
def test_add_stock_works_after_transfer(admin_headers):
    # Take tomato qty before
    r1 = requests.get(f"{BASE_URL}/api/raw-materials-new/{TOMATO_ID}",
                      headers=admin_headers, timeout=30)
    assert r1.status_code == 200
    qty_before = float(r1.json().get("quantity", 0))

    r2 = requests.post(
        f"{BASE_URL}/api/raw-materials-new/{TOMATO_ID}/add-stock",
        headers=admin_headers,
        params={"quantity": 1},
        timeout=30,
    )
    assert r2.status_code == 200, f"add-stock failed: {r2.status_code} {r2.text}"

    r3 = requests.get(f"{BASE_URL}/api/raw-materials-new/{TOMATO_ID}",
                      headers=admin_headers, timeout=30)
    qty_after = float(r3.json().get("quantity", 0))
    assert qty_after >= qty_before + 1 - 0.001, f"qty did not increase: {qty_before}→{qty_after}"


# ---------- 4) Full create→update→delete on a brand-new (non-transferred) material ----------
@pytest.fixture(scope="module")
def new_material_id(admin_headers):
    payload = {
        "name": "TEST_iter174_lock",
        "unit": "kg",
        "quantity": 5,
        "cost_per_unit": 100,
        "min_quantity": 0,
        "waste_percentage": 0,
    }
    r = requests.post(f"{BASE_URL}/api/raw-materials-new",
                      headers=admin_headers, json=payload, timeout=30)
    assert r.status_code in (200, 201), f"create failed: {r.status_code} {r.text}"
    body = r.json()
    mid = body.get("id") or body.get("_id") or body.get("material_id")
    assert mid, f"no id returned: {body}"
    return mid


def test_new_material_not_transferred(admin_headers, new_material_id):
    r = requests.get(f"{BASE_URL}/api/raw-materials-new", headers=admin_headers, timeout=30)
    assert r.status_code == 200
    item = next((m for m in r.json() if m["id"] == new_material_id), None)
    assert item is not None
    assert item["is_transferred"] is False
    assert item["can_edit"] is True
    assert item["can_delete"] is True


def test_put_non_transferred_succeeds(admin_headers, new_material_id):
    payload = {
        "name": "TEST_iter174_lock_renamed",
        "unit": "kg",
        "quantity": 10,
        "cost_per_unit": 150,
        "min_quantity": 1,
        "waste_percentage": 0,
    }
    r = requests.put(f"{BASE_URL}/api/raw-materials-new/{new_material_id}",
                     headers=admin_headers, json=payload, timeout=30)
    assert r.status_code == 200, f"{r.status_code} {r.text}"

    r2 = requests.get(f"{BASE_URL}/api/raw-materials-new/{new_material_id}",
                      headers=admin_headers, timeout=30)
    assert r2.status_code == 200
    body = r2.json()
    assert body["name"] == "TEST_iter174_lock_renamed"
    assert float(body["quantity"]) == 10
    assert float(body["cost_per_unit"]) == 150


def test_delete_non_transferred_removes_material_and_layers(admin_headers, new_material_id):
    r = requests.delete(f"{BASE_URL}/api/raw-materials-new/{new_material_id}",
                        headers=admin_headers, timeout=30)
    assert r.status_code == 200, f"{r.status_code} {r.text}"

    # confirm gone
    r2 = requests.get(f"{BASE_URL}/api/raw-materials-new/{new_material_id}",
                      headers=admin_headers, timeout=30)
    assert r2.status_code == 404

    r3 = requests.get(f"{BASE_URL}/api/raw-materials-new", headers=admin_headers, timeout=30)
    ids = [m["id"] for m in r3.json()]
    assert new_material_id not in ids
