"""
Iter 240 — tests for:
 - GET /api/reports/purchases (admin) reads purchases_new
 - GET /api/supplier-payment-dues (admin) filters paid invoices, due/overdue meta
 - GET /api/super-admin/security-log (super-admin) returns events + summary
"""
import os
import requests
import pytest

BASE_URL = (os.environ.get("REACT_APP_BACKEND_URL") or "https://inventory-accounting-11.preview.emergentagent.com").rstrip("/")
ADMIN_EMAIL = "admin@maestroegp.com"
ADMIN_PASSWORD = "admin123"
OWNER_EMAIL = "owner@maestroegp.com"
OWNER_PASSWORD = "owner123"
OWNER_SECRET = "271018"


# ---------- fixtures ----------
@pytest.fixture(scope="module")
def admin_token():
    r = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
        timeout=15,
    )
    assert r.status_code == 200, f"admin login failed: {r.status_code} {r.text}"
    tok = r.json().get("access_token") or r.json().get("token")
    assert tok, f"no access_token in admin login response: {r.json()}"
    return tok


@pytest.fixture(scope="module")
def admin_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def owner_token():
    # super-admin owner login
    for path in ("/api/super-admin/login", "/api/owner/login", "/api/auth/login"):
        try:
            r = requests.post(
                f"{BASE_URL}{path}",
                json={
                    "email": OWNER_EMAIL,
                    "password": OWNER_PASSWORD,
                    "secret_key": OWNER_SECRET,
                },
                timeout=15,
            )
            if r.status_code == 200:
                tok = r.json().get("access_token") or r.json().get("token")
                if tok:
                    return tok
        except Exception:
            continue
    pytest.skip("Owner/super-admin login endpoint not found")


@pytest.fixture(scope="module")
def owner_headers(owner_token):
    return {"Authorization": f"Bearer {owner_token}", "Content-Type": "application/json"}


# ---------- purchases report ----------
class TestPurchasesReport:
    def test_purchases_report_aggregates_from_purchases_new(self, admin_headers):
        r = requests.get(f"{BASE_URL}/api/reports/purchases", headers=admin_headers, timeout=20)
        assert r.status_code == 200, r.text
        data = r.json()

        # Required keys
        for key in ("total_purchases", "total_transactions", "total_unpaid", "by_payment_status", "by_supplier"):
            assert key in data, f"missing key {key} in {list(data.keys())}"

        assert data["total_purchases"] == 1000000, f"total_purchases={data['total_purchases']}"
        assert data["total_transactions"] == 3, f"total_transactions={data['total_transactions']}"
        assert data["total_unpaid"] == 700000, f"total_unpaid={data['total_unpaid']}"

        # by_payment_status.pending
        bps = data["by_payment_status"]
        # may be a dict {pending: amt} or list [{status, amount}]
        pending_amt = None
        if isinstance(bps, dict):
            pending_amt = bps.get("pending")
        elif isinstance(bps, list):
            for it in bps:
                if it.get("status") == "pending" or it.get("_id") == "pending":
                    pending_amt = it.get("amount") or it.get("total") or it.get("total_amount")
        assert pending_amt == 700000, f"by_payment_status.pending={pending_amt} (full={bps})"

        # by_supplier
        sup_map = {}
        bs = data["by_supplier"]
        if isinstance(bs, dict):
            sup_map = bs
        elif isinstance(bs, list):
            for it in bs:
                name = it.get("supplier_name") or it.get("name") or it.get("_id")
                amt = it.get("amount") or it.get("total") or it.get("total_amount")
                if name:
                    sup_map[name] = amt
        assert sup_map.get("مورد تجريبي أ") == 700000, f"supplier_a={sup_map.get('مورد تجريبي أ')} full={bs}"
        assert sup_map.get("مورد تجريبي ب") == 300000, f"supplier_b={sup_map.get('مورد تجريبي ب')} full={bs}"


# ---------- supplier payment dues ----------
class TestSupplierPaymentDues:
    def test_dues_excludes_paid(self, admin_headers):
        r = requests.get(f"{BASE_URL}/api/supplier-payment-dues", headers=admin_headers, timeout=20)
        assert r.status_code == 200, r.text
        data = r.json()

        # Accept either {items, total_count, ...} or list directly
        items = data.get("dues") if isinstance(data, dict) else data
        if items is None and isinstance(data, dict):
            items = data.get("items")
        assert isinstance(items, list), f"items not a list: {type(items)} -> {data}"

        # No paid status should be present
        for it in items:
            st = (it.get("payment_status") or it.get("pay_status") or it.get("status") or "").lower()
            assert st != "paid", f"paid invoice leaked: {it}"

        if isinstance(data, dict):
            assert data.get("total_count") == 2, f"total_count={data.get('total_count')}"
            assert data.get("overdue_count") == 1, f"overdue_count={data.get('overdue_count')}"
            assert data.get("total_remaining") == 700000, f"total_remaining={data.get('total_remaining')}"

        # field presence on items
        for it in items:
            for f in ("due_date", "estimated", "days_overdue", "is_overdue"):
                assert f in it, f"missing item field {f}: {it}"
            assert isinstance(it.get("estimated"), bool)
            assert isinstance(it.get("is_overdue"), bool)


# ---------- security log (super-admin) ----------
class TestSecurityLog:
    def test_security_log_shape(self, owner_headers):
        r = requests.get(f"{BASE_URL}/api/super-admin/security-log", headers=owner_headers, timeout=20)
        assert r.status_code == 200, f"{r.status_code} {r.text}"
        data = r.json()
        for k in ("events", "summary", "expiring_soon", "expired"):
            assert k in data, f"missing key {k} in {list(data.keys())}"

        assert isinstance(data["events"], list)
        summary = data["summary"]
        for sk in ("total", "active", "disabled", "expiring_soon", "expired"):
            assert sk in summary, f"missing summary.{sk}: {summary}"

        # events optional fields validation when present
        for ev in data["events"][:5]:
            for f in ("event_type", "user_name", "user_role", "tenant_name", "created_at"):
                assert f in ev, f"event missing {f}: {ev}"

    def test_security_log_forbidden_for_admin(self, admin_headers):
        r = requests.get(f"{BASE_URL}/api/super-admin/security-log", headers=admin_headers, timeout=15)
        assert r.status_code in (401, 403), f"expected 401/403, got {r.status_code} {r.text[:200]}"
