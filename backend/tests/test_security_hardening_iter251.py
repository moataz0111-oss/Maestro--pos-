"""
iter251 — Final pen-test remediation round.

NEW changes since iter250:
  1. PUT /api/orders/{order_id}/status now Depends(get_staff_or_driver)
     (was unauthenticated). Accepts staff JWT OR driver opaque token.
  2. /api/biometric-queue/pending, /api/biometric-queue/{job_id}/result,
     /api/biometric/push now gated by verify_device_agent
     (BIOMETRIC_AGENT_KEY via ?key= query or X-Agent-Key header).
  3. GET /api/calls/incoming?driver_id=... now requires matching driver token
     (IDOR fix).  ?order_id=... remains open (customer guest path).

Plus regression of iter247/248/249/250 critical anonymous-blocked endpoints.
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

DRIVER_PHONE = "07801111111"
DRIVER_PIN = "1234"
DRIVER_ID = "demo-drv-1"

BIO_KEY = "maestro-bio-3c9f1a6d4e"
PRINT_AGENT_KEY = "maestro-print-9f3a2c7e1b"
CALLCENTER_SECRET = "maestro-cc-7d1e4b8a2f"


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
    assert tok
    return tok


@pytest.fixture(scope="module")
def owner_token(session):
    r = session.post(f"{BASE_URL}/api/auth/login",
                     json={"email": OWNER_EMAIL, "password": OWNER_PASSWORD,
                           "secret_key": OWNER_SECRET})
    assert r.status_code == 200, f"owner login failed: {r.status_code} {r.text[:300]}"
    return r.json().get("token") or r.json().get("access_token")


@pytest.fixture(scope="module")
def driver_token(session):
    r = session.post(f"{BASE_URL}/api/driver/login",
                     params={"phone": DRIVER_PHONE, "pin": DRIVER_PIN})
    assert r.status_code == 200, f"driver login failed: {r.status_code} {r.text[:300]}"
    data = r.json()
    tok = data.get("token")
    assert tok
    return tok


def _auth(token):
    return {"Authorization": f"Bearer {token}"}


# ========== 1. NEW: PUT /orders/{id}/status now requires auth ==========

class TestOrderStatusAuth:
    """server.py L21840 — PUT /api/orders/{order_id}/status Depends(get_staff_or_driver)"""

    def test_no_auth_returns_401_or_403(self, session):
        fake_id = f"nonexistent-{uuid.uuid4()}"
        r = session.put(f"{BASE_URL}/api/orders/{fake_id}/status",
                        params={"status": "delivered"})
        assert r.status_code in (401, 403), \
            f"expected 401/403 unauth, got {r.status_code} {r.text[:300]}"

    def test_admin_auth_passes_to_handler_then_404(self, session, admin_token):
        # auth succeeds => reaches handler => 404 because order does not exist
        fake_id = f"nonexistent-{uuid.uuid4()}"
        r = session.put(f"{BASE_URL}/api/orders/{fake_id}/status",
                        params={"status": "delivered"},
                        headers=_auth(admin_token))
        assert r.status_code == 404, \
            f"expected 404 (auth passed), got {r.status_code} {r.text[:300]}"

    def test_driver_token_accepted_not_401_403(self, session, driver_token):
        fake_id = f"nonexistent-{uuid.uuid4()}"
        r = session.put(f"{BASE_URL}/api/orders/{fake_id}/status",
                        params={"status": "delivered"},
                        headers=_auth(driver_token))
        # driver token must be accepted by get_staff_or_driver
        assert r.status_code not in (401, 403), \
            f"driver token rejected: {r.status_code} {r.text[:300]}"


# ========== 2. NEW: biometric endpoints require BIOMETRIC_AGENT_KEY ==========

class TestBiometricAgentKey:
    """server.py L17677/17697/17756 — verify_device_agent gate"""

    def test_pending_no_key_403(self, session):
        r = session.get(f"{BASE_URL}/api/biometric-queue/pending")
        assert r.status_code == 403, f"got {r.status_code} {r.text[:200]}"

    def test_pending_with_query_key_200(self, session):
        r = session.get(f"{BASE_URL}/api/biometric-queue/pending",
                        params={"key": BIO_KEY})
        assert r.status_code == 200, f"got {r.status_code} {r.text[:300]}"

    def test_pending_with_header_key_200(self, session):
        r = session.get(f"{BASE_URL}/api/biometric-queue/pending",
                        headers={"X-Agent-Key": BIO_KEY})
        assert r.status_code == 200, f"got {r.status_code} {r.text[:300]}"

    def test_pending_wrong_key_403(self, session):
        r = session.get(f"{BASE_URL}/api/biometric-queue/pending",
                        params={"key": "wrong-key"})
        assert r.status_code == 403

    def test_job_result_no_key_403(self, session):
        r = session.post(f"{BASE_URL}/api/biometric-queue/some-job-id/result",
                        json={"status": "done"})
        assert r.status_code == 403, f"got {r.status_code} {r.text[:200]}"

    def test_biometric_push_no_key_403(self, session):
        r = session.post(f"{BASE_URL}/api/biometric/push", json={})
        assert r.status_code == 403, f"got {r.status_code} {r.text[:200]}"

    def test_biometric_push_with_key_not_403(self, session):
        r = session.post(f"{BASE_URL}/api/biometric/push",
                        params={"key": BIO_KEY}, json={})
        assert r.status_code != 403, f"got {r.status_code} {r.text[:300]}"

    def test_biometric_push_header_key_not_403(self, session):
        r = session.post(f"{BASE_URL}/api/biometric/push",
                        headers={"X-Agent-Key": BIO_KEY}, json={})
        assert r.status_code != 403


# ========== 3. NEW: /calls/incoming IDOR fix ==========

class TestCallsIncomingIDOR:
    """routes/call_routes.py L114 — driver_id requires matching driver token"""

    def test_driver_id_no_token_403(self, session):
        r = session.get(f"{BASE_URL}/api/calls/incoming",
                        params={"driver_id": DRIVER_ID})
        assert r.status_code == 403, f"got {r.status_code} {r.text[:200]}"

    def test_driver_id_matching_token_200(self, session, driver_token):
        r = session.get(f"{BASE_URL}/api/calls/incoming",
                        params={"driver_id": DRIVER_ID},
                        headers=_auth(driver_token))
        assert r.status_code == 200, f"got {r.status_code} {r.text[:300]}"

    def test_driver_id_wrong_driver_token_403(self, session, driver_token):
        # use real driver token but a different driver_id
        r = session.get(f"{BASE_URL}/api/calls/incoming",
                        params={"driver_id": "some-other-driver-xyz"},
                        headers=_auth(driver_token))
        assert r.status_code == 403, f"got {r.status_code} {r.text[:300]}"

    def test_driver_id_with_admin_jwt_403(self, session, admin_token):
        # admin JWT is not a driver opaque token => must be rejected
        r = session.get(f"{BASE_URL}/api/calls/incoming",
                        params={"driver_id": DRIVER_ID},
                        headers=_auth(admin_token))
        assert r.status_code == 403

    def test_order_id_customer_path_open_200(self, session):
        r = session.get(f"{BASE_URL}/api/calls/incoming",
                        params={"order_id": "some-order-guest"})
        assert r.status_code == 200, f"customer guest path should be open, got {r.status_code}"


# ========== Regression: anon-blocked endpoints (iter247/248/249/250) ==========

class TestRegressionAnonBlocked:
    def test_driver_orders_no_token_403(self, session):
        r = session.get(f"{BASE_URL}/api/driver/orders")
        assert r.status_code in (401, 403)

    def test_driver_orders_with_driver_token_200(self, session, driver_token):
        r = session.get(f"{BASE_URL}/api/driver/orders", headers=_auth(driver_token))
        assert r.status_code == 200

    def test_register_anon_blocked(self, session):
        u = uuid.uuid4().hex[:8]
        r = session.post(f"{BASE_URL}/api/auth/register", json={
            "username": f"TEST_u_{u}",
            "email": f"TEST_anon_{u}@x.com",
            "password": "Passw0rd!",
            "full_name": "TEST x",
            "role": "cashier",
        })
        assert r.status_code in (401, 403)

    def test_admin_cannot_create_super_admin(self, session, admin_token):
        u = uuid.uuid4().hex[:8]
        r = session.post(f"{BASE_URL}/api/auth/register",
                        json={
                            "username": f"TEST_su_{u}",
                            "email": f"TEST_su_{u}@x.com",
                            "password": "Passw0rd!",
                            "full_name": "TEST su",
                            "role": "super_admin",
                        },
                        headers=_auth(admin_token))
        assert r.status_code == 403, f"got {r.status_code} {r.text[:300]}"

    def test_owner_login_without_secret_403(self, session):
        r = session.post(f"{BASE_URL}/api/auth/login",
                        json={"email": OWNER_EMAIL, "password": OWNER_PASSWORD})
        assert r.status_code == 403

    def test_owner_login_with_secret_200(self, owner_token):
        assert owner_token  # fixture validated

    def test_inventory_anon_403(self, session):
        for ep in ("/api/products", "/api/categories", "/api/orders",
                   "/api/employees", "/api/drivers", "/api/branches",
                   "/api/dashboard/stats"):
            r = session.get(f"{BASE_URL}{ep}")
            assert r.status_code in (401, 403), f"{ep} => {r.status_code}"

    def test_callcenter_webhook_no_secret_403(self, session):
        r = session.post(f"{BASE_URL}/api/callcenter/webhook", json={})
        assert r.status_code == 403

    def test_init_db_no_key_403(self, session):
        # init-db is GET in this codebase; POST returns 405. Verify GET without key denied.
        r = session.get(f"{BASE_URL}/api/init-db")
        assert r.status_code in (401, 403), f"got {r.status_code} {r.text[:200]}"

    def test_print_queue_no_key_403(self, session):
        r = session.get(f"{BASE_URL}/api/print-queue/pending")
        assert r.status_code == 403

    def test_print_queue_with_key_200(self, session):
        r = session.get(f"{BASE_URL}/api/print-queue/pending",
                       params={"key": PRINT_AGENT_KEY})
        assert r.status_code == 200

    def test_invoice_settings_no_token_403(self, session):
        r = session.get(f"{BASE_URL}/api/system/invoice-settings")
        assert r.status_code in (401, 403)

    def test_security_headers_present(self, session):
        r = session.get(f"{BASE_URL}/api/")
        assert r.status_code == 200
        for h in ("x-content-type-options", "x-frame-options",
                  "referrer-policy", "strict-transport-security"):
            assert h in {k.lower() for k in r.headers.keys()}, f"missing {h}"

    def test_escalations_driver_blocked(self, session, driver_token):
        r = session.get(f"{BASE_URL}/api/order-notifications/escalations",
                       headers=_auth(driver_token))
        assert r.status_code in (401, 403)

    def test_order_notifications_accepts_staff(self, session, admin_token):
        r = session.get(f"{BASE_URL}/api/order-notifications",
                       headers=_auth(admin_token))
        assert r.status_code == 200

    def test_order_notifications_accepts_driver(self, session, driver_token):
        r = session.get(f"{BASE_URL}/api/order-notifications",
                       headers=_auth(driver_token))
        assert r.status_code == 200


# ========== Regression: admin token => 200 on management endpoints ==========

class TestRegressionAdminEndpoints:
    @pytest.mark.parametrize("ep", [
        "/api/products", "/api/categories", "/api/orders",
        "/api/employees", "/api/drivers", "/api/branches",
        "/api/dashboard/stats",
    ])
    def test_admin_200(self, session, admin_token, ep):
        r = session.get(f"{BASE_URL}{ep}", headers=_auth(admin_token))
        assert r.status_code == 200, f"{ep} => {r.status_code} {r.text[:200]}"


# ========== Customer menu does not leak cost/profit/recipe ==========

class TestCustomerMenuNoLeak:
    SENSITIVE = {"cost", "operating_cost", "recipe", "ingredients", "profit",
                 "profit_margin", "cost_breakdown", "supplier_id",
                 "wholesale_price", "purchase_price", "margin",
                 "raw_materials", "bom", "supplier"}

    def test_customer_menu(self, session):
        r = session.get(f"{BASE_URL}/api/customer/menu/default")
        if r.status_code != 200:
            pytest.skip(f"customer menu unavailable: {r.status_code}")
        data = r.json()
        items = data.get("products") or data.get("items") or data
        if isinstance(items, dict):
            items = items.get("products") or []
        leaked = set()
        for p in (items or []):
            if not isinstance(p, dict):
                continue
            leaked |= (self.SENSITIVE & set(p.keys()))
        assert not leaked, f"sensitive fields leaked: {leaked}"
