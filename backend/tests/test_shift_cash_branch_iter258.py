"""
iter258 — Backend tests for:
  (A) BUG FIX: receive_shift_cash now resolves branch_id from shift -> closing -> cashier user/employee
      so owner_deposit (source=shift_cash) carries non-null branch_id/branch_name.
  (B) REGRESSION: supplier features (account + pay).

Run:
  pytest /app/backend/tests/test_shift_cash_branch_iter258.py -v --tb=short \
         --junitxml=/app/test_reports/pytest/iter258.xml
"""
import os
import time
import uuid
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
assert BASE_URL, "REACT_APP_BACKEND_URL not set"

ADMIN = {"email": "admin@maestroegp.com", "password": "admin123"}
CASHIER = {"email": "cashier1@maestroegp.com", "password": "cash123"}

SUPPLIER_ID = "9a383359-e6fe-4982-9df7-3eea34e181d2"


# ---------- shared helpers ----------
def _login(creds):
    r = requests.post(f"{BASE_URL}/api/auth/login", json=creds, timeout=20)
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text[:200]}"
    return r.json()["token"]


@pytest.fixture(scope="module")
def admin_token():
    return _login(ADMIN)


@pytest.fixture(scope="module")
def cashier_token():
    try:
        return _login(CASHIER)
    except AssertionError:
        pytest.skip("cashier1@maestroegp.com not seeded")


@pytest.fixture(scope="module")
def admin_h(admin_token):
    return {"Authorization": f"Bearer {admin_token}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def cashier_h(cashier_token):
    return {"Authorization": f"Bearer {cashier_token}", "Content-Type": "application/json"}


# =================================================================
# (A) Shift-cash branch attribution
# =================================================================
class TestShiftCashBranchAttribution:
    """Forward-fix: deposit must carry branch_id/branch_name."""

    def _get_branch_id(self, admin_h):
        r = requests.get(f"{BASE_URL}/api/branches", headers=admin_h, timeout=15)
        assert r.status_code == 200, r.text[:200]
        branches = r.json()
        assert branches, "no branches seeded"
        return branches[0]["id"], branches[0].get("name", "")

    def _get_cashier_id(self, admin_h, branch_id):
        # list cashiers in that branch
        r = requests.get(
            f"{BASE_URL}/api/shifts/cashiers-list?branch_id={branch_id}",
            headers=admin_h, timeout=15)
        assert r.status_code == 200, r.text[:200]
        cashiers = r.json()
        if not cashiers:
            # fallback: list all cashiers
            r2 = requests.get(f"{BASE_URL}/api/shifts/cashiers-list", headers=admin_h, timeout=15)
            assert r2.status_code == 200
            cashiers = r2.json()
        assert cashiers, "no cashier users seeded"
        # pick one without an active shift
        for c in cashiers:
            if not c.get("has_active_shift"):
                return c["id"]
        # else just return the first
        return cashiers[0]["id"]

    def test_receive_404_bogus_id(self, admin_h):
        bogus = str(uuid.uuid4())
        r = requests.post(
            f"{BASE_URL}/api/reports/cash-register-closing/{bogus}/receive",
            headers=admin_h, json={}, timeout=15)
        assert r.status_code == 404, f"expected 404, got {r.status_code} {r.text[:200]}"

    def test_receive_403_for_cashier(self, cashier_h):
        any_id = str(uuid.uuid4())
        r = requests.post(
            f"{BASE_URL}/api/reports/cash-register-closing/{any_id}/receive",
            headers=cashier_h, json={}, timeout=15)
        assert r.status_code == 403, f"expected 403, got {r.status_code} {r.text[:200]}"

    def test_full_lifecycle_branch_attribution(self, admin_h, admin_token):
        """Open shift -> close shift -> receive cash -> deposit has branch."""
        branch_id, branch_name = self._get_branch_id(admin_h)
        cashier_id = self._get_cashier_id(admin_h, branch_id)

        # Close any open shift for that cashier first (defensive)
        # (best-effort; ignore failures)
        try:
            r_curr = requests.get(
                f"{BASE_URL}/api/shifts?status=open",
                headers=admin_h, timeout=15)
            if r_curr.status_code == 200:
                for s in r_curr.json():
                    if s.get("cashier_id") == cashier_id:
                        requests.post(
                            f"{BASE_URL}/api/shifts/{s['id']}/close",
                            headers=admin_h, json={"closing_cash": 0, "notes": "cleanup"},
                            timeout=15)
        except Exception:
            pass

        # Open shift via /shifts/open-for-cashier (sets tenant_id correctly)
        open_payload = {
            "cashier_id": cashier_id,
            "branch_id": branch_id,
            "opening_cash": 100000.0,
        }
        r = requests.post(f"{BASE_URL}/api/shifts/open-for-cashier",
                          headers=admin_h, json=open_payload, timeout=15)
        assert r.status_code == 200, f"open shift failed: {r.status_code} {r.text[:300]}"
        rj = r.json()
        shift = rj.get("shift") or rj
        shift_id = shift["id"]
        # ✅ Sanity: the new shift carries the branch_id we set
        assert shift.get("branch_id") == branch_id

        # Close shift
        close_payload = {
            "closing_cash": 100000.0,
            "notes": "iter258 test close",
            "actual_cash": 100000.0,
        }
        r = requests.post(
            f"{BASE_URL}/api/shifts/{shift_id}/close",
            headers=admin_h, json=close_payload, timeout=20)
        # close may return 200 OR 400 depending on schema validation; we accept both as long as
        # the shift document moves to closed status
        if r.status_code not in (200, 201):
            # try with minimal payload
            r = requests.post(
                f"{BASE_URL}/api/shifts/{shift_id}/close",
                headers=admin_h, json={"closing_cash": 100000.0}, timeout=20)
        assert r.status_code in (200, 201), f"close shift failed: {r.status_code} {r.text[:300]}"

        # Receive cash
        receive_payload = {"received_amount": 100000.0, "external_expenses": 0.0}
        r = requests.post(
            f"{BASE_URL}/api/reports/cash-register-closing/{shift_id}/receive",
            headers=admin_h, json=receive_payload, timeout=20)
        assert r.status_code == 200, f"receive failed: {r.status_code} {r.text[:300]}"
        body = r.json()

        # 🎯 Core assertion: deposit has a non-empty branch_name
        assert body.get("branch_name"), \
            f"branch_name empty in receive response: {body}"

        deposit_id = body.get("deposit_id")
        assert deposit_id, "deposit_id not returned"

        # Cross-check by listing owner_deposits
        r = requests.get(f"{BASE_URL}/api/owner-wallet/deposits", headers=admin_h, timeout=15)
        assert r.status_code == 200, r.text[:200]
        deposits = r.json() if isinstance(r.json(), list) else r.json().get("deposits", [])
        match = [d for d in deposits if d.get("id") == deposit_id]
        assert match, f"deposit {deposit_id} not found in /api/owner-deposits"
        dep = match[0]

        # 🎯 The crux of the bug fix:
        assert dep.get("branch_id"), \
            f"owner_deposit.branch_id is empty/None — fix regression! deposit={dep}"
        assert dep.get("branch_name"), \
            f"owner_deposit.branch_name is empty — fix regression! deposit={dep}"
        assert dep.get("source") == "shift_cash"
        # branch should be the same we set on the shift
        assert dep["branch_id"] == branch_id, \
            f"branch_id mismatch: deposit={dep['branch_id']} vs shift branch={branch_id}"

    def test_receive_idempotent_400_second_call(self, admin_h):
        """If a shift was already received, a second receive returns 400."""
        # find any received shift
        r = requests.get(
            f"{BASE_URL}/api/shifts?status=closed",
            headers=admin_h, timeout=15)
        if r.status_code != 200:
            pytest.skip("cannot list shifts")
        shifts = r.json() or []
        received = next((s for s in shifts if s.get("received_at")), None)
        if not received:
            pytest.skip("no already-received shift in DB to test idempotency")
        r = requests.post(
            f"{BASE_URL}/api/reports/cash-register-closing/{received['id']}/receive",
            headers=admin_h, json={}, timeout=15)
        assert r.status_code == 400, \
            f"expected 400 on second receive, got {r.status_code}: {r.text[:200]}"


# =================================================================
# (B) Supplier regression
# =================================================================
class TestSupplierRegression:
    """Account summary + pay; cashier 403."""

    def test_account_summary(self, admin_h):
        r = requests.get(
            f"{BASE_URL}/api/suppliers/{SUPPLIER_ID}/account",
            headers=admin_h, timeout=15)
        assert r.status_code == 200, r.text[:200]
        data = r.json()
        summary = data.get("summary") or {}
        # We expect 800k total_debit OR remaining (depending on whether prior test paid)
        td = float(summary.get("total_debit", 0))
        tr = float(summary.get("total_remaining", 0))
        assert td == 800000.0, f"total_debit expected 800000 got {td}"
        # remaining should be 800000 or less if a prior partial payment is in DB
        assert tr <= 800000.0 and tr >= 0, f"unexpected total_remaining: {tr}"

    def test_pay_admin_200_and_persists(self, admin_h):
        # snapshot remaining
        r = requests.get(
            f"{BASE_URL}/api/suppliers/{SUPPLIER_ID}/account",
            headers=admin_h, timeout=15)
        assert r.status_code == 200
        before = float(r.json().get("summary", {}).get("total_remaining", 0))
        if before <= 0:
            pytest.skip("supplier already settled; skipping pay test")

        pay_amount = min(300000.0, before)
        r = requests.post(
            f"{BASE_URL}/api/suppliers/{SUPPLIER_ID}/pay",
            headers=admin_h,
            json={"amount": pay_amount, "payment_method": "cash",
                  "payment_date": "2026-06-20"},
            timeout=20)
        assert r.status_code == 200, f"pay failed: {r.status_code} {r.text[:300]}"

        # verify remaining decreased
        r = requests.get(
            f"{BASE_URL}/api/suppliers/{SUPPLIER_ID}/account",
            headers=admin_h, timeout=15)
        assert r.status_code == 200
        after = float(r.json().get("summary", {}).get("total_remaining", 0))
        assert abs((before - after) - pay_amount) < 0.5, \
            f"remaining not reduced by pay_amount: before={before} after={after} paid={pay_amount}"

    def test_pay_cashier_403(self, cashier_h):
        r = requests.post(
            f"{BASE_URL}/api/suppliers/{SUPPLIER_ID}/pay",
            headers=cashier_h,
            json={"amount": 1000.0, "payment_method": "cash",
                  "payment_date": "2026-06-20"},
            timeout=15)
        assert r.status_code == 403, f"expected 403 for cashier, got {r.status_code}: {r.text[:200]}"
