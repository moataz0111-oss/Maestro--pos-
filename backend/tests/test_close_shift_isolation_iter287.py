"""
Test: Close-shift isolation fix (iteration 287)
Verifies that manager closing cash register targets the correct shift,
never the manager's own lazy-opened shift.
"""
import os
import requests
import pytest

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://whatsapp-pos-system.preview.emergentagent.com").rstrip("/")
BRANCH_ID = "76f56acc-6948-4a2f-bbf4-feccbddea88f"
OWNER_SHIFT = "closefix-shift-owner"
CASHIER_SHIFT = "closefix-shift-cashier"


def _login(email, password):
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": password}, timeout=30)
    assert r.status_code == 200, f"login {email} failed: {r.status_code} {r.text}"
    j = r.json()
    return j.get("token") or j.get("access_token"), j.get("user", {})


@pytest.fixture(scope="module")
def admin():
    tok, user = _login("admin@maestroegp.com", "admin123")
    return {"token": tok, "user": user, "headers": {"Authorization": f"Bearer {tok}"}}


@pytest.fixture(scope="module")
def cashier_a():
    tok, user = _login("expattr-cashier-a@maestroegp.com", "test123")
    return {"token": tok, "user": user, "headers": {"Authorization": f"Bearer {tok}"}}


def test_summary_with_cashier_shift_id(admin):
    r = requests.get(
        f"{BASE_URL}/api/cash-register/summary",
        params={"branch_id": BRANCH_ID, "shift_id": CASHIER_SHIFT},
        headers=admin["headers"], timeout=30
    )
    assert r.status_code == 200, r.text
    data = r.json()
    assert data.get("shift_id") == CASHIER_SHIFT, f"shift_id mismatch: {data.get('shift_id')}"
    assert data.get("cashier_name") == "احمد اختبار", f"cashier_name={data.get('cashier_name')}"
    assert data.get("total_sales") == 802750, f"total_sales={data.get('total_sales')}"
    assert data.get("total_orders") == 3, f"total_orders={data.get('total_orders')}"


def test_summary_with_owner_shift_id(admin):
    r = requests.get(
        f"{BASE_URL}/api/cash-register/summary",
        params={"branch_id": BRANCH_ID, "shift_id": OWNER_SHIFT},
        headers=admin["headers"], timeout=30
    )
    assert r.status_code == 200, r.text
    data = r.json()
    assert data.get("shift_id") == OWNER_SHIFT
    assert data.get("total_sales") == 79500, f"total_sales={data.get('total_sales')}"
    # cashier_name should be owner's name (the shift's owner)
    assert data.get("cashier_name") == "مدير النظام", f"cashier_name={data.get('cashier_name')}"


def test_summary_no_shift_id_manager_deprioritizes_own(admin):
    """Manager without shift_id must NOT get their own shift."""
    r = requests.get(
        f"{BASE_URL}/api/cash-register/summary",
        params={"branch_id": BRANCH_ID},
        headers=admin["headers"], timeout=30
    )
    assert r.status_code == 200, r.text
    data = r.json()
    admin_id = admin["user"].get("id")
    assert data.get("shift_id") != OWNER_SHIFT, f"Returned owner's own shift! {data}"
    assert data.get("cashier_id") != admin_id, f"Returned manager's own shift by cashier_id! {data}"


def test_close_cashier_shift_via_shift_id(admin):
    """Close closefix-shift-cashier, verify owner shift is untouched."""
    body = {
        "denominations": {"250": 0, "500": 0, "1000": 0, "5000": 0, "10000": 0, "25000": 0, "50000": 0},
        "branch_id": BRANCH_ID,
        "shift_id": CASHIER_SHIFT,
        "force_close_without_count": True,
        "force_close_with_discrepancy": True,
        "manager_email": "admin@maestroegp.com",
        "manager_password": "admin123",
    }
    r = requests.post(f"{BASE_URL}/api/cash-register/close", json=body, headers=admin["headers"], timeout=60)
    assert r.status_code == 200, f"close failed: {r.status_code} {r.text}"
    data = r.json()
    # accept id or shift_id key
    closed_id = data.get("id") or data.get("shift_id")
    assert closed_id == CASHIER_SHIFT, f"Wrong shift closed: {data}"
    assert data.get("cashier_name") == "احمد اختبار", f"cashier_name={data.get('cashier_name')}"
    assert data.get("total_sales") == 802750
    assert data.get("status") == "closed"

    # Verify owner shift still open
    r2 = requests.get(
        f"{BASE_URL}/api/cash-register/summary",
        params={"branch_id": BRANCH_ID, "shift_id": OWNER_SHIFT},
        headers=admin["headers"], timeout=30
    )
    assert r2.status_code == 200
    d2 = r2.json()
    # If open, status should not be 'closed'
    assert d2.get("status") != "closed", f"Owner shift got closed! {d2}"
    assert d2.get("total_sales") == 79500, f"Owner sales changed! {d2}"


def test_cashier_own_summary_no_params(cashier_a):
    """Cashier A own close still works — summary returns HIS shift with expenses 15000."""
    r = requests.get(
        f"{BASE_URL}/api/cash-register/summary",
        params={"branch_id": BRANCH_ID},
        headers=cashier_a["headers"], timeout=30
    )
    assert r.status_code == 200, r.text
    data = r.json()
    assert data.get("shift_id") == "expattr-shift-a", f"shift_id={data.get('shift_id')}"
    assert data.get("total_expenses") == 15000, f"total_expenses={data.get('total_expenses')} (must not mix with B's 5000)"
