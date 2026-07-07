"""Test driver + customer email fields (iteration 278)."""
import os
import time
import requests
import pytest

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://whatsapp-pos-system.preview.emergentagent.com").rstrip("/")
ADMIN = {"email": "admin@maestroegp.com", "password": "admin123"}


@pytest.fixture(scope="module")
def token():
    r = requests.post(f"{BASE_URL}/api/auth/login", json=ADMIN, timeout=15)
    assert r.status_code == 200, r.text
    return r.json().get("token") or r.json().get("access_token")


@pytest.fixture(scope="module")
def headers(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def branch_id(headers):
    r = requests.get(f"{BASE_URL}/api/branches", headers=headers, timeout=15)
    assert r.status_code == 200, r.text
    data = r.json()
    branches = data if isinstance(data, list) else data.get("branches", [])
    assert branches, "no branches"
    return branches[0]["id"]


# --- Driver email ---

def test_driver_create_update_email(headers, branch_id):
    ts = int(time.time())
    email1 = f"TEST_drv_{ts}@example.com"
    payload = {
        "name": f"TEST_Drv_{ts}",
        "phone": f"01{ts % 1000000000:09d}",
        "email": email1,
        "branch_id": branch_id,
        "pin": "1234",
    }
    r = requests.post(f"{BASE_URL}/api/drivers", headers=headers, json=payload, timeout=15)
    assert r.status_code in (200, 201), r.text
    created = r.json()
    driver_id = created.get("id") or created.get("_id")
    assert driver_id
    assert created.get("email") == email1, f"create did not return email: {created}"

    # GET list — email present for this driver
    r = requests.get(f"{BASE_URL}/api/drivers", headers=headers, timeout=15)
    assert r.status_code == 200
    lst = r.json() if isinstance(r.json(), list) else r.json().get("drivers", [])
    match = next((d for d in lst if d.get("id") == driver_id), None)
    assert match, "driver not in list"
    assert match.get("email") == email1

    # UPDATE
    email2 = f"TEST_drv_upd_{ts}@example.com"
    r = requests.put(f"{BASE_URL}/api/drivers/{driver_id}", headers=headers, json={"email": email2}, timeout=15)
    assert r.status_code in (200, 204), r.text

    r = requests.get(f"{BASE_URL}/api/drivers", headers=headers, timeout=15)
    lst = r.json() if isinstance(r.json(), list) else r.json().get("drivers", [])
    match = next((d for d in lst if d.get("id") == driver_id), None)
    assert match and match.get("email") == email2, f"email not updated: {match}"


def test_driver_create_without_email(headers, branch_id):
    ts = int(time.time()) + 1
    payload = {
        "name": f"TEST_DrvNoEmail_{ts}",
        "phone": f"02{ts % 1000000000:09d}",
        "branch_id": branch_id,
        "pin": "1234",
    }
    r = requests.post(f"{BASE_URL}/api/drivers", headers=headers, json=payload, timeout=15)
    assert r.status_code in (200, 201), r.text


# --- Customer email ---

def test_customer_create_update_email(headers):
    ts = int(time.time())
    email1 = f"TEST_cust_{ts}@example.com"
    payload = {"name": f"TEST_Cust_{ts}", "phone": f"03{ts % 1000000000:09d}", "email": email1}
    r = requests.post(f"{BASE_URL}/api/customers", headers=headers, json=payload, timeout=15)
    assert r.status_code in (200, 201), r.text
    created = r.json()
    cid = created.get("id") or created.get("_id")
    assert cid
    assert created.get("email") == email1, f"create did not return email: {created}"

    # GET list
    r = requests.get(f"{BASE_URL}/api/customers", headers=headers, timeout=15)
    assert r.status_code == 200
    lst = r.json() if isinstance(r.json(), list) else r.json().get("customers", [])
    match = next((c for c in lst if c.get("id") == cid), None)
    assert match and match.get("email") == email1

    # UPDATE
    email2 = f"TEST_cust_upd_{ts}@example.com"
    r = requests.put(f"{BASE_URL}/api/customers/{cid}", headers=headers, json={"email": email2, "name": payload["name"], "phone": payload["phone"]}, timeout=15)
    assert r.status_code in (200, 204), r.text

    r = requests.get(f"{BASE_URL}/api/customers", headers=headers, timeout=15)
    lst = r.json() if isinstance(r.json(), list) else r.json().get("customers", [])
    match = next((c for c in lst if c.get("id") == cid), None)
    assert match and match.get("email") == email2, f"email not updated: {match}"


def test_customer_create_without_email(headers):
    ts = int(time.time()) + 1
    payload = {"name": f"TEST_CustNoEmail_{ts}", "phone": f"04{ts % 1000000000:09d}"}
    r = requests.post(f"{BASE_URL}/api/customers", headers=headers, json=payload, timeout=15)
    assert r.status_code in (200, 201), r.text


def test_sanity_lists(headers):
    assert requests.get(f"{BASE_URL}/api/drivers", headers=headers, timeout=15).status_code == 200
    assert requests.get(f"{BASE_URL}/api/customers", headers=headers, timeout=15).status_code == 200
