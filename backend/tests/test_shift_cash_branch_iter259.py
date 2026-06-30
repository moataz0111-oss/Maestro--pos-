"""
iter259 — Backend tests for shift-cash branch attribution (FORWARD FIX RE-VERIFY).

Scenario specifically exercises the cashier_id fallback (shift has NO branch_id, NO
branch_name) — seeds a synthetic branch, cashier user, and shift directly in Mongo
via pymongo, then calls POST /api/reports/cash-register-closing/{shift_id}/receive
as admin and asserts the resulting owner_deposit was attributed to Al-Jadriya
(branch_id == 'tb-jad', branch_name == 'Al-Jadriya').

Also covers:
  - RBAC: cashier -> 403, bogus id -> 404
  - Supplier regression
  - RBAC middleware (iter255): cashier GET /api/employees -> 403, admin -> 200

Run:
  pytest /app/backend/tests/test_shift_cash_branch_iter259.py -v --tb=short \
         --junitxml=/app/test_reports/pytest/iter259.xml
"""
import os
import uuid
from datetime import datetime, timezone

import pytest
import requests
from pymongo import MongoClient

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
assert BASE_URL, "REACT_APP_BACKEND_URL not set"

MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "maestro_pos")

ADMIN = {"email": "admin@maestroegp.com", "password": "admin123"}
CASHIER = {"email": "cashier1@maestroegp.com", "password": "cash123"}

# Seed identifiers
BRANCH_ID = "tb-jad"
BRANCH_NAME = "Al-Jadriya"
CASHIER_USER_ID = "tu-c"
CASHIER_USER_NAME = "كاشير اختبار"
SHIFT_ID = "ts-1"


def _login(creds):
    r = requests.post(f"{BASE_URL}/api/auth/login", json=creds, timeout=20)
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text[:200]}"
    return r.json()["token"]


@pytest.fixture(scope="module")
def admin_h():
    tok = _login(ADMIN)
    return {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def cashier_h():
    try:
        tok = _login(CASHIER)
    except AssertionError:
        pytest.skip("cashier1 not seeded")
    return {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def mongo_db():
    cli = MongoClient(MONGO_URL)
    db = cli[DB_NAME]
    yield db
    cli.close()


@pytest.fixture(scope="module", autouse=True)
def seed_and_cleanup(mongo_db):
    """Seed minimal docs to exercise the cashier_id->branch fallback."""
    db = mongo_db

    # Cleanup any leftover docs first (in case prior run aborted)
    db.branches.delete_many({"id": BRANCH_ID})
    db.users.delete_many({"id": CASHIER_USER_ID})
    db.shifts.delete_many({"id": SHIFT_ID})
    db.cash_register_closings.delete_many({"shift_id": SHIFT_ID})
    db.owner_deposits.delete_many({"ref_closing_id": SHIFT_ID})

    now = datetime.now(timezone.utc).isoformat()

    # Branch
    db.branches.insert_one({
        "id": BRANCH_ID,
        "tenant_id": "default",
        "name": BRANCH_NAME,
        "created_at": now,
    })

    # Cashier user with branch_id set — used by the fallback chain
    db.users.insert_one({
        "id": CASHIER_USER_ID,
        "tenant_id": "default",
        "full_name": CASHIER_USER_NAME,
        "username": "test_cashier_iter259",
        "role": "cashier",
        "branch_id": BRANCH_ID,
        "created_at": now,
    })

    # Shift WITHOUT branch_id / branch_name — must resolve via cashier_id
    db.shifts.insert_one({
        "id": SHIFT_ID,
        "tenant_id": "default",
        "branch_id": None,
        "branch_name": None,
        "cashier_id": CASHIER_USER_ID,
        "cashier_name": CASHIER_USER_NAME,
        "status": "closed",
        "opening_cash": 0,
        "closing_cash": 100000,
        "actual_cash": 100000,
        "opened_at": now,
        "closed_at": now,
        "business_date": now[:10],
        "created_at": now,
    })

    yield

    # Teardown
    db.branches.delete_many({"id": BRANCH_ID})
    db.users.delete_many({"id": CASHIER_USER_ID})
    db.shifts.delete_many({"id": SHIFT_ID})
    db.cash_register_closings.delete_many({"shift_id": SHIFT_ID})
    db.owner_deposits.delete_many({"ref_closing_id": SHIFT_ID})


# ============================================================
# 1) Branch attribution via cashier_id fallback (the BUG FIX)
# ============================================================
class TestReceiveBranchAttribution:

    def test_receive_resolves_branch_via_cashier(self, admin_h, mongo_db):
        """POST /receive with a shift that has NO branch_id must resolve to Al-Jadriya."""
        r = requests.post(
            f"{BASE_URL}/api/reports/cash-register-closing/{SHIFT_ID}/receive",
            headers=admin_h,
            json={"received_amount": 100000},
            timeout=20,
        )
        assert r.status_code == 200, f"receive failed: {r.status_code} {r.text[:300]}"
        body = r.json()

        # Response must contain non-empty branch_name
        assert body.get("branch_name") == BRANCH_NAME, (
            f"expected branch_name={BRANCH_NAME!r} got {body.get('branch_name')!r}; "
            f"full body={body}"
        )

        deposit_id = body.get("deposit_id")
        assert deposit_id, f"deposit_id missing in response: {body}"

        # Verify the persisted owner_deposit
        dep = mongo_db.owner_deposits.find_one(
            {"source": "shift_cash", "ref_closing_id": SHIFT_ID}, {"_id": 0}
        )
        assert dep is not None, "owner_deposit not created for shift_cash"
        assert dep.get("branch_id") == BRANCH_ID, (
            f"owner_deposit.branch_id={dep.get('branch_id')!r} expected {BRANCH_ID!r}; "
            f"deposit={dep}"
        )
        assert dep.get("branch_name") == BRANCH_NAME, (
            f"owner_deposit.branch_name={dep.get('branch_name')!r} expected {BRANCH_NAME!r}"
        )
        assert dep.get("amount") == 100000
        assert dep.get("source") == "shift_cash"

    def test_receive_404_for_bogus_id(self, admin_h):
        bogus = str(uuid.uuid4())
        r = requests.post(
            f"{BASE_URL}/api/reports/cash-register-closing/{bogus}/receive",
            headers=admin_h, json={}, timeout=15,
        )
        assert r.status_code == 404, f"expected 404 got {r.status_code}: {r.text[:200]}"

    def test_receive_403_for_cashier(self, cashier_h):
        any_id = str(uuid.uuid4())
        r = requests.post(
            f"{BASE_URL}/api/reports/cash-register-closing/{any_id}/receive",
            headers=cashier_h, json={}, timeout=15,
        )
        assert r.status_code == 403, f"expected 403 got {r.status_code}: {r.text[:200]}"


# ============================================================
# 2) Supplier regression (best-effort)
# ============================================================
class TestSupplierRegression:

    def test_supplier_account_works(self, admin_h):
        # find any supplier
        r = requests.get(f"{BASE_URL}/api/suppliers", headers=admin_h, timeout=15)
        if r.status_code != 200:
            pytest.skip(f"/api/suppliers not available: {r.status_code}")
        suppliers = r.json()
        if not suppliers:
            pytest.skip("no suppliers in DB to regression-test")
        sid = suppliers[0]["id"]
        ra = requests.get(
            f"{BASE_URL}/api/suppliers/{sid}/account", headers=admin_h, timeout=15
        )
        assert ra.status_code == 200, f"supplier/account failed: {ra.status_code} {ra.text[:200]}"
        data = ra.json()
        # summary key exists (structure check)
        assert "summary" in data or "invoices" in data, f"unexpected shape: {data}"

    def test_supplier_pay_cashier_403(self, cashier_h, admin_h):
        r = requests.get(f"{BASE_URL}/api/suppliers", headers=admin_h, timeout=15)
        if r.status_code != 200 or not r.json():
            pytest.skip("no supplier id available")
        sid = r.json()[0]["id"]
        rp = requests.post(
            f"{BASE_URL}/api/suppliers/{sid}/pay",
            headers=cashier_h,
            json={"amount": 1.0, "payment_method": "cash", "payment_date": "2026-06-20"},
            timeout=15,
        )
        assert rp.status_code == 403, f"expected 403 got {rp.status_code}: {rp.text[:200]}"


# ============================================================
# 3) RBAC middleware (iter255) still active
# ============================================================
class TestEmployeesRBAC:

    def test_admin_can_list_employees(self, admin_h):
        r = requests.get(f"{BASE_URL}/api/employees", headers=admin_h, timeout=15)
        assert r.status_code == 200, f"admin /employees should be 200, got {r.status_code}: {r.text[:200]}"

    def test_cashier_cannot_list_employees(self, cashier_h):
        r = requests.get(f"{BASE_URL}/api/employees", headers=cashier_h, timeout=15)
        assert r.status_code == 403, f"cashier /employees should be 403, got {r.status_code}: {r.text[:200]}"
