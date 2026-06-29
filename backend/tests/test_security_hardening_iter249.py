"""
iter249 — NEW: print-queue agent-key gate, system/invoice-settings auth, global security headers,
plus iter247/248 regression spot-checks.

NEW changes:
  - routes/print_queue.py: verify_print_agent dependency on get_pending_jobs, get_agent_status,
    complete_print_job, fail_print_job (accept ?key= or X-Print-Key header).
  - server.py: GET /api/system/invoice-settings now requires get_current_user.
  - server.py: add_no_cache_headers middleware now also sets security headers
    (X-Content-Type-Options, X-Frame-Options, Referrer-Policy, Strict-Transport-Security,
    Permissions-Policy) on all API responses.
  - backend/.env: PRINT_AGENT_KEY, CALLCENTER_WEBHOOK_SECRET, SUPER_ADMIN_SECRET set.
"""

import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "http://localhost:8001").rstrip("/")

ADMIN_EMAIL = "admin@maestroegp.com"
ADMIN_PASSWORD = "admin123"
OWNER_EMAIL = "owner@maestroegp.com"
OWNER_PASSWORD = "owner123"
OWNER_SECRET = "271018"

PRINT_AGENT_KEY = "maestro-print-9f3a2c7e1b"
CALLCENTER_SECRET = "maestro-cc-7d1e4b8a2f"

SECURITY_HEADERS = [
    "x-content-type-options",
    "x-frame-options",
    "referrer-policy",
    "strict-transport-security",
    "permissions-policy",
]

SENSITIVE_PRODUCT_FIELDS = {
    "cost", "operating_cost", "recipe", "ingredients", "profit",
    "profit_margin", "cost_breakdown", "supplier_id", "wholesale_price",
    "purchase_price", "margin", "raw_materials", "bom", "supplier",
}


# ---------- fixtures ----------

@pytest.fixture(scope="module")
def session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def admin_token(session):
    r = session.post(f"{BASE_URL}/api/auth/login",
                     json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    assert r.status_code == 200, f"admin login failed: {r.status_code} {r.text[:300]}"
    tok = r.json().get("token") or r.json().get("access_token")
    assert tok, f"no token in response: {r.json()}"
    return tok


def _h(tok):
    return {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}


# ---------- 1. NEW: print-queue agent-key gate ----------

class TestPrintQueueAgentKey:
    """All targeted print-queue endpoints require the print agent key."""

    def test_pending_no_key_blocked(self, session):
        r = session.get(f"{BASE_URL}/api/print-queue/pending",
                        params={"branch_id": "any"})
        assert r.status_code == 403, f"pending no key: {r.status_code} {r.text[:200]}"

    def test_pending_with_key_query_ok(self, session):
        r = session.get(f"{BASE_URL}/api/print-queue/pending",
                        params={"branch_id": "any", "key": PRINT_AGENT_KEY})
        assert r.status_code == 200, f"pending key: {r.status_code} {r.text[:200]}"

    def test_pending_with_key_header_ok(self, session):
        r = session.get(f"{BASE_URL}/api/print-queue/pending",
                        params={"branch_id": "any"},
                        headers={"X-Print-Key": PRINT_AGENT_KEY})
        assert r.status_code == 200, f"pending header key: {r.status_code} {r.text[:200]}"

    def test_agent_status_no_key_blocked(self, session):
        r = session.get(f"{BASE_URL}/api/print-queue/agent-status")
        assert r.status_code == 403, f"agent-status no key: {r.status_code} {r.text[:200]}"

    def test_agent_status_with_key_ok(self, session):
        r = session.get(f"{BASE_URL}/api/print-queue/agent-status",
                        params={"key": PRINT_AGENT_KEY})
        assert r.status_code == 200, f"agent-status key: {r.status_code} {r.text[:200]}"

    def test_complete_no_key_blocked(self, session):
        r = session.put(f"{BASE_URL}/api/print-queue/some-id/complete")
        assert r.status_code == 403, f"complete no key: {r.status_code} {r.text[:200]}"

    def test_complete_with_key_not_403(self, session):
        # job id won't exist but auth must pass; expect 404 or 200, NOT 403
        r = session.put(f"{BASE_URL}/api/print-queue/nonexistent-job/complete",
                        headers={"X-Print-Key": PRINT_AGENT_KEY})
        assert r.status_code != 403, f"complete key blocked: {r.status_code} {r.text[:200]}"

    def test_failed_no_key_blocked(self, session):
        r = session.put(f"{BASE_URL}/api/print-queue/some-id/failed")
        assert r.status_code == 403, f"failed no key: {r.status_code} {r.text[:200]}"

    def test_failed_with_key_not_403(self, session):
        r = session.put(f"{BASE_URL}/api/print-queue/nonexistent-job/failed",
                        headers={"X-Print-Key": PRINT_AGENT_KEY})
        assert r.status_code != 403, f"failed key blocked: {r.status_code} {r.text[:200]}"


# ---------- 2. NEW: system/invoice-settings auth ----------

class TestInvoiceSettingsAuth:
    def test_invoice_settings_anon_blocked(self, session):
        r = session.get(f"{BASE_URL}/api/system/invoice-settings")
        assert r.status_code in (401, 403), \
            f"invoice-settings anon: {r.status_code} {r.text[:200]}"

    def test_invoice_settings_admin_ok(self, session, admin_token):
        r = session.get(f"{BASE_URL}/api/system/invoice-settings",
                        headers=_h(admin_token))
        assert r.status_code == 200, \
            f"invoice-settings admin: {r.status_code} {r.text[:200]}"


# ---------- 3. NEW: global security headers ----------

class TestSecurityHeaders:
    def _check_headers(self, headers):
        lower = {k.lower(): v for k, v in headers.items()}
        missing = [h for h in SECURITY_HEADERS if h not in lower]
        return missing, lower

    def test_headers_on_root(self, session):
        r = session.get(f"{BASE_URL}/api/")
        missing, lower = self._check_headers(r.headers)
        assert not missing, f"missing headers on /api/: {missing} (have {list(lower.keys())})"
        # spot-check specific values
        assert lower["x-content-type-options"].lower() == "nosniff"
        assert lower["x-frame-options"].upper() == "SAMEORIGIN"

    def test_headers_on_authed(self, session, admin_token):
        r = session.get(f"{BASE_URL}/api/products", headers=_h(admin_token))
        missing, lower = self._check_headers(r.headers)
        assert not missing, f"missing headers on /api/products: {missing}"


# ---------- 4. NEW: callcenter webhook secret (iter249 explicit) ----------

class TestCallcenterWebhookSecret:
    def test_webhook_no_secret_blocked(self, session):
        r = session.post(f"{BASE_URL}/api/callcenter/webhook",
                         json={"phone": "0790"})
        assert r.status_code == 403, f"webhook no secret: {r.status_code} {r.text[:200]}"

    def test_webhook_with_header_ok(self, session):
        r = session.post(f"{BASE_URL}/api/callcenter/webhook",
                         json={"phone": "0790"},
                         headers={"X-Webhook-Secret": CALLCENTER_SECRET})
        assert r.status_code in (200, 201), \
            f"webhook with secret: {r.status_code} {r.text[:200]}"


# ---------- 5. iter247/248 regression ----------

class TestIter247248Regression:
    def test_register_anonymous_rejected(self, session):
        r = session.post(f"{BASE_URL}/api/auth/register", json={
            "username": f"TEST_anon_{uuid.uuid4().hex[:6]}",
            "email": f"TEST_anon_{uuid.uuid4().hex[:6]}@x.com",
            "password": "Pwd12345!",
            "full_name": "Anon",
            "role": "super_admin",
        })
        assert r.status_code in (401, 403), f"got {r.status_code} {r.text[:200]}"

    def test_admin_super_admin_register_blocked(self, session, admin_token):
        uniq = uuid.uuid4().hex[:6]
        r = session.post(f"{BASE_URL}/api/auth/register",
                         headers=_h(admin_token),
                         json={
                             "username": f"TEST_sa_{uniq}",
                             "email": f"TEST_sa_{uniq}@x.com",
                             "password": "Pwd12345!",
                             "full_name": "Bad SA",
                             "role": "super_admin",
                         })
        assert r.status_code == 403, f"got {r.status_code} {r.text[:200]}"

    def test_admin_cashier_register_ok(self, session, admin_token):
        uniq = uuid.uuid4().hex[:6]
        r = session.post(f"{BASE_URL}/api/auth/register",
                         headers=_h(admin_token),
                         json={
                             "username": f"TEST_cash_{uniq}",
                             "email": f"TEST_cash_{uniq}@x.com",
                             "password": "Pwd12345!",
                             "full_name": "Cashier",
                             "role": "cashier",
                         })
        assert r.status_code == 200, f"got {r.status_code} {r.text[:200]}"

    def test_owner_no_secret_blocked(self, session):
        r = session.post(f"{BASE_URL}/api/auth/login",
                         json={"email": OWNER_EMAIL, "password": OWNER_PASSWORD})
        assert r.status_code == 403, f"got {r.status_code} {r.text[:200]}"

    def test_owner_with_secret_ok(self, session):
        r = session.post(f"{BASE_URL}/api/auth/login",
                         json={"email": OWNER_EMAIL, "password": OWNER_PASSWORD,
                               "secret_key": OWNER_SECRET})
        assert r.status_code == 200, f"got {r.status_code} {r.text[:200]}"

    def test_admin_login_ok(self, session):
        r = session.post(f"{BASE_URL}/api/auth/login",
                         json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
        assert r.status_code == 200, f"got {r.status_code} {r.text[:200]}"

    @pytest.mark.parametrize("ep", [
        "/api/purchases-new",
        "/api/inventory-stats",
        "/api/manufactured-products",
        "/api/order-notifications",
        "/api/order-notifications/escalations",
    ])
    def test_anon_blocked_endpoints(self, session, ep):
        params = {"branch_id": "any"} if ep.endswith("escalations") else None
        r = session.get(f"{BASE_URL}{ep}", params=params)
        assert r.status_code in (401, 403), f"{ep} -> {r.status_code}"

    def test_init_db_no_key(self, session):
        r = session.get(f"{BASE_URL}/api/init-db")
        assert r.status_code == 403, f"got {r.status_code}"

    def test_customer_menu_no_sensitive(self, session):
        r = session.get(f"{BASE_URL}/api/customer/menu/default")
        assert r.status_code == 200, f"got {r.status_code} {r.text[:200]}"
        products = r.json().get("products", [])
        leaked = {}
        for p in products:
            for f in SENSITIVE_PRODUCT_FIELDS:
                if f in p:
                    leaked.setdefault(f, 0)
                    leaked[f] += 1
        assert not leaked, f"sensitive fields leaked: {leaked}"

    @pytest.mark.parametrize("ep", [
        "/api/products", "/api/categories", "/api/orders", "/api/employees",
        "/api/drivers", "/api/branches", "/api/dashboard/stats",
    ])
    def test_admin_can_read(self, session, admin_token, ep):
        r = session.get(f"{BASE_URL}{ep}", headers=_h(admin_token))
        assert r.status_code == 200, f"{ep} admin -> {r.status_code} {r.text[:200]}"
