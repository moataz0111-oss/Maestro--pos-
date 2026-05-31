"""Iter195: Verify POST /api/manufactured-products accepts and persists
piece_def_value (float) and piece_def_unit (str) sent from the Create dialog.

Mirrors the Edit-recipe behavior already covered by test_piece_definition_iter194.
"""
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://cogs-calc-system.preview.emergentagent.com").rstrip("/")
ADMIN_EMAIL = "admin@maestroegp.com"
ADMIN_PASS = "admin123"


@pytest.fixture(scope="module")
def auth_token():
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASS}, timeout=15)
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    tok = r.json().get("access_token") or r.json().get("token")
    assert tok, f"no token in {r.json()}"
    return tok


@pytest.fixture(scope="module")
def headers(auth_token):
    return {"Authorization": f"Bearer {auth_token}", "Content-Type": "application/json"}


def test_create_manufactured_product_with_piece_definition_persists(headers):
    unique = f"TEST_pd_{uuid.uuid4().hex[:8]}"
    payload = {
        "name": unique,
        "unit": "قطعة",
        "piece_weight": 1,
        "piece_weight_unit": "قطعة",     # count-based -> requires piece_def
        "piece_def_value": 120,
        "piece_def_unit": "غرام",
        "recipe": [
            {
                "raw_material_id": "manual",
                "raw_material_name": "لحم تجربة",
                "quantity": 1,
                "unit": "كغم",
            }
        ],
        "quantity": 0,
        "min_quantity": 0,
        "selling_price": 0,
    }
    # CREATE
    r = requests.post(f"{BASE_URL}/api/manufactured-products", json=payload, headers=headers, timeout=20)
    assert r.status_code in (200, 201), f"create failed: {r.status_code} {r.text}"
    created = r.json()
    pid = created.get("id")
    assert pid, f"no id in response: {created}"

    try:
        # Verify directly on create response
        assert created.get("name") == unique
        assert float(created.get("piece_def_value")) == 120.0, created
        assert created.get("piece_def_unit") == "غرام", created

        # GET back to verify persistence
        r2 = requests.get(f"{BASE_URL}/api/manufactured-products", headers=headers, timeout=15)
        assert r2.status_code == 200, r2.text
        items = r2.json()
        match = next((p for p in items if p.get("id") == pid), None)
        assert match is not None, f"product {pid} not found in GET list"
        assert float(match.get("piece_def_value")) == 120.0, match
        assert match.get("piece_def_unit") == "غرام", match
        assert match.get("piece_weight_unit") == "قطعة"
    finally:
        # Cleanup
        requests.delete(f"{BASE_URL}/api/manufactured-products/{pid}", headers=headers, timeout=15)


def test_create_without_piece_definition_works(headers):
    """Real weight unit -> piece_def_value/unit can be omitted; no 422."""
    unique = f"TEST_pd_none_{uuid.uuid4().hex[:8]}"
    payload = {
        "name": unique,
        "unit": "قطعة",
        "piece_weight": 120,
        "piece_weight_unit": "غرام",
        "recipe": [
            {"raw_material_id": "manual", "raw_material_name": "لحم تجربة", "quantity": 1, "unit": "كغم"}
        ],
        "quantity": 0,
    }
    r = requests.post(f"{BASE_URL}/api/manufactured-products", json=payload, headers=headers, timeout=20)
    assert r.status_code in (200, 201), f"create failed: {r.status_code} {r.text}"
    pid = r.json().get("id")
    try:
        assert pid
    finally:
        requests.delete(f"{BASE_URL}/api/manufactured-products/{pid}", headers=headers, timeout=15)
