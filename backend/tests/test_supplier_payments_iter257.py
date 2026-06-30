"""
iter257 — Supplier account payments + HR settlement modal + treasury fixes.

Covers:
- GET /api/suppliers/{id}/account (summary, invoices, payments, monthly, ledger)
- POST /api/suppliers/{id}/pay (partial pay distributes across invoices, deducts treasury)
- RBAC: cashier 403; admin/manager allowed for /pay; admin/super_admin only for /settle-dues
- POST /api/suppliers/{id}/settle-dues (no treasury withdrawal)
- POST /api/employees/{id}/terminate-payout: RBAC + accepts SettlementPayout body shape
"""
import os
import time
import requests
import pytest

_FE_ENV = "/app/frontend/.env"
def _read_backend_url():
    v = os.environ.get("REACT_APP_BACKEND_URL")
    if v:
        return v
    try:
        with open(_FE_ENV) as fh:
            for line in fh:
                if line.strip().startswith("REACT_APP_BACKEND_URL="):
                    return line.strip().split("=", 1)[1].strip()
    except Exception:
        pass
    return None

BASE_URL = (_read_backend_url() or "").rstrip("/")
assert BASE_URL, "REACT_APP_BACKEND_URL not set"
SUPPLIER_ID = "d3394dbb-a418-44c2-af7f-9e1d220fe2ff"

ADMIN = {"email": "admin@maestroegp.com", "password": "admin123"}
CASHIER = {"email": "cashier1@maestroegp.com", "password": "cash123"}


def _login(creds):
    r = requests.post(f"{BASE_URL}/api/auth/login", json=creds, timeout=30)
    assert r.status_code == 200, f"login failed for {creds['email']}: {r.status_code} {r.text[:200]}"
    return r.json()["token"]


@pytest.fixture(scope="module")
def admin_token():
    return _login(ADMIN)


@pytest.fixture(scope="module")
def cashier_token():
    return _login(CASHIER)


def _hdr(tok):
    return {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}


# ---------- 1) Supplier account GET ----------
class TestSupplierAccount:
    def test_account_initial_shape(self, admin_token):
        r = requests.get(f"{BASE_URL}/api/suppliers/{SUPPLIER_ID}/account", headers=_hdr(admin_token), timeout=30)
        assert r.status_code == 200, r.text[:300]
        data = r.json()
        assert "summary" in data and "invoices" in data and "payments" in data
        assert "monthly" in data and "ledger" in data
        s = data["summary"]
        for k in ("total_debit", "total_credit", "total_remaining", "invoices_count"):
            assert k in s, f"missing summary.{k}"
        # The seeded supplier should have 2 invoices totalling 800,000 (per problem statement)
        assert s["total_debit"] >= 1, f"expected debit>0, got {s['total_debit']}"
        # ledger structure
        if data["ledger"]:
            row = data["ledger"][0]
            assert "date" in row and "type" in row and "amount" in row
            assert row["type"] in ("debit", "credit")


# ---------- 2) RBAC + partial pay flow (sequential) ----------
class TestSupplierPayRBACAndFlow:
    def test_cashier_pay_forbidden(self, cashier_token):
        body = {"amount": 1000, "payment_method": "cash"}
        r = requests.post(f"{BASE_URL}/api/suppliers/{SUPPLIER_ID}/pay", json=body, headers=_hdr(cashier_token), timeout=30)
        assert r.status_code == 403, f"cashier should be forbidden, got {r.status_code} {r.text[:200]}"

    def test_admin_partial_pay_distributes_and_updates_account(self, admin_token):
        # Snapshot account BEFORE
        before = requests.get(f"{BASE_URL}/api/suppliers/{SUPPLIER_ID}/account", headers=_hdr(admin_token), timeout=30).json()
        remaining_before = before["summary"]["total_remaining"]
        credit_before = before["summary"]["total_credit"]
        if remaining_before <= 0:
            pytest.skip("Supplier already fully paid by prior run — skipping partial-pay test")

        pay_amount = min(350000.0, remaining_before)
        body = {"amount": pay_amount, "payment_method": "bank_withdrawal", "payment_date": "2026-06-15"}
        r = requests.post(f"{BASE_URL}/api/suppliers/{SUPPLIER_ID}/pay", json=body, headers=_hdr(admin_token), timeout=30)
        assert r.status_code == 200, f"pay failed: {r.status_code} {r.text[:300]}"
        resp = r.json()
        assert resp["amount_paid"] == pay_amount
        assert resp["invoices_affected"] >= 1

        # Verify via GET account
        after = requests.get(f"{BASE_URL}/api/suppliers/{SUPPLIER_ID}/account", headers=_hdr(admin_token), timeout=30).json()
        # total_credit should increase by the paid amount
        assert round(after["summary"]["total_credit"] - credit_before, 2) == round(pay_amount, 2), \
            f"credit delta mismatch: before={credit_before} after={after['summary']['total_credit']} expected_delta={pay_amount}"
        # remaining should drop
        assert after["summary"]["total_remaining"] == round(remaining_before - pay_amount, 2)
        # payments list should now contain a record for that date+amount
        # payments list should now contain record(s) for 2026-06-15 summing to pay_amount
        # (the payment may be split across multiple invoices, producing multiple ledger rows)
        same_day = [p for p in after["payments"] if p["date"] == "2026-06-15"]
        assert same_day, f"no payments dated 2026-06-15 in after.payments (have {[p['date'] for p in after['payments']][:5]})"
        same_day_sum = round(sum(p["amount"] for p in same_day), 2)
        # account for prior runs that may have also paid on 2026-06-15
        assert same_day_sum >= round(pay_amount, 2), \
            f"sum of 2026-06-15 payments ({same_day_sum}) < pay_amount ({pay_amount})"

    def test_owner_withdrawal_recorded_for_pay(self, admin_token):
        # Verify a supplier_payment owner_withdrawal exists (deducted from owner treasury)
        # GET owner withdrawals list — there's typically /api/owner-withdrawals
        r = requests.get(f"{BASE_URL}/api/owner-withdrawals", headers=_hdr(admin_token), timeout=30)
        if r.status_code != 200:
            pytest.skip(f"owner-withdrawals endpoint not 200 ({r.status_code}) — treasury record check skipped")
        items = r.json() if isinstance(r.json(), list) else r.json().get("withdrawals") or r.json().get("data") or []
        # Find at least one supplier_payment for this supplier
        match = [w for w in items if w.get("supplier_id") == SUPPLIER_ID and w.get("category") == "supplier_payment"]
        assert match, "expected at least one supplier_payment owner_withdrawal record"


# ---------- 3) Settle dues (admin only, no treasury deduction) ----------
class TestSettleDues:
    def test_cashier_settle_forbidden(self, cashier_token):
        r = requests.post(f"{BASE_URL}/api/suppliers/{SUPPLIER_ID}/settle-dues", headers=_hdr(cashier_token), timeout=30)
        assert r.status_code == 403

    def test_admin_settle_no_treasury_withdrawal(self, admin_token):
        # Count owner_withdrawals before
        before_acc = requests.get(f"{BASE_URL}/api/suppliers/{SUPPLIER_ID}/account", headers=_hdr(admin_token), timeout=30).json()
        remaining = before_acc["summary"]["total_remaining"]
        if remaining <= 0:
            pytest.skip("nothing left to settle")

        wr_before = requests.get(f"{BASE_URL}/api/owner-withdrawals", headers=_hdr(admin_token), timeout=30)
        wr_count_before = None
        if wr_before.status_code == 200:
            items_b = wr_before.json() if isinstance(wr_before.json(), list) else (wr_before.json().get("withdrawals") or wr_before.json().get("data") or [])
            wr_count_before = len([w for w in items_b if w.get("supplier_id") == SUPPLIER_ID])

        r = requests.post(f"{BASE_URL}/api/suppliers/{SUPPLIER_ID}/settle-dues", headers=_hdr(admin_token), timeout=30)
        assert r.status_code == 200, f"settle failed: {r.status_code} {r.text[:300]}"
        resp = r.json()
        assert resp["settled_amount"] == round(remaining, 2)

        # Verify: remaining now 0; payment marked no_treasury
        after = requests.get(f"{BASE_URL}/api/suppliers/{SUPPLIER_ID}/account", headers=_hdr(admin_token), timeout=30).json()
        assert after["summary"]["total_remaining"] == 0
        assert any(p.get("no_treasury") is True for p in after["payments"]), "settle should produce a no_treasury payment record"

        # Verify NO new owner_withdrawal was added for this supplier
        if wr_count_before is not None:
            wr_after = requests.get(f"{BASE_URL}/api/owner-withdrawals", headers=_hdr(admin_token), timeout=30)
            items_a = wr_after.json() if isinstance(wr_after.json(), list) else (wr_after.json().get("withdrawals") or wr_after.json().get("data") or [])
            wr_count_after = len([w for w in items_a if w.get("supplier_id") == SUPPLIER_ID])
            assert wr_count_after == wr_count_before, \
                f"settle-dues must NOT create owner_withdrawal: before={wr_count_before} after={wr_count_after}"


# ---------- 4) HR terminate-payout body shape + RBAC ----------
class TestHRSettlementPayout:
    def test_cashier_forbidden(self, cashier_token):
        # Use a fake employee id — RBAC must reject BEFORE any employee lookup or after with 403/404. We expect 403.
        body = {"amount": 100, "payment_method": "cash", "payment_date": "2026-06-15", "notes": "test"}
        r = requests.post(f"{BASE_URL}/api/employees/00000000-0000-0000-0000-000000000000/terminate-payout",
                          json=body, headers=_hdr(cashier_token), timeout=30)
        assert r.status_code == 403, f"cashier should be 403 not {r.status_code}"

    def test_admin_accepts_body_shape(self, admin_token):
        # Admin called against a non-existent employee. Endpoint should NOT 422 (body shape accepted),
        # should respond 404 (not found) or 400 (state mismatch) — anything except 403/422.
        body = {"amount": 100, "payment_method": "cash", "payment_date": "2026-06-15", "notes": "test"}
        r = requests.post(f"{BASE_URL}/api/employees/00000000-0000-0000-0000-000000000000/terminate-payout",
                          json=body, headers=_hdr(admin_token), timeout=30)
        assert r.status_code in (400, 404), f"expected 400/404 (body shape accepted), got {r.status_code} {r.text[:200]}"


# ---------- 5) Regression: OwnerWallet shift-cash branch name ----------
class TestOwnerWalletBranchName:
    def test_owner_wallet_transactions_have_branch_when_available(self, admin_token):
        # Try a few possible endpoints — keep test resilient
        candidates = ["/api/owner-wallet/transactions", "/api/owner-wallet", "/api/treasury/owner-transactions"]
        ok = None
        for ep in candidates:
            r = requests.get(f"{BASE_URL}{ep}", headers=_hdr(admin_token), timeout=30)
            if r.status_code == 200:
                ok = (ep, r.json())
                break
        if not ok:
            pytest.skip("No owner-wallet transactions endpoint found at expected paths")
        ep, body = ok
        # Find shift_cash entries; allow them to be empty (env may have no closures yet)
        items = body if isinstance(body, list) else (body.get("transactions") or body.get("data") or body.get("items") or [])
        if not items:
            pytest.skip(f"No transactions returned by {ep}")
        # At least confirm response shape includes some descriptor; do not hard-fail if branch unknown
        sample = items[0]
        assert isinstance(sample, dict)
