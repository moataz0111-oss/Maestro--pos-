"""
iter250 — DRIVER TOKEN system (IDOR remediation) + staff/driver split on shared routers
+ full iter247/248/249 regression.

NEW changes:
  - shared.py: get_current_driver (opaque token via driver_tokens collection),
    get_staff_or_driver (accepts staff JWT or driver opaque token).
  - server.py: POST /api/driver/login returns {driver, token}; /api/driver/orders,
    /api/driver/update-location, /api/driver/orders/{id}/status now Depends(get_current_driver).
    driver_id query param removed — driver derived from token (IDOR closed).
  - routes/order_notifications.py: router-level Depends(get_staff_or_driver); management
    endpoints (POST, /escalations, /read-all, /printed, /cleanup) keep extra
    Depends(get_current_user) so DRIVER tokens are rejected, STAFF tokens accepted.
  - routes/drivers_routes.py: router-level Depends(get_staff_or_driver) — /stats and
    /orders need a token; STAFF management routes keep get_current_user.
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

PRINT_AGENT_KEY = "maestro-print-9f3a2c7e1b"
CALLCENTER_SECRET = "maestro-cc-7d1e4b8a2f"

SECURITY_HEADERS = [
    "x-content-type-options", "x-frame-options",
    "referrer-policy", "strict-transport-security",
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


@pytest.fixture(scope="module")
def driver_token(session):
    # driver login takes phone + pin as query params per spec
    r = session.post(f"{BASE_URL}/api/driver/login",
                     params={"phone": DRIVER_PHONE, "pin": DRIVER_PIN})
    assert r.status_code == 200, f"driver login failed: {r.status_code} {r.text[:300]}"
    data = r.json()
    assert "driver" in data, f"missing driver: {data}"
    tok = data.get("token")
    assert tok, f"no token in driver login response: {data}"
    return tok


def _h(tok):
    return {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}


# ---------- 1. NEW: Driver login + token issuance ----------

class TestDriverLogin:
    def test_driver_login_returns_token(self, session):
        r = session.post(f"{BASE_URL}/api/driver/login",
                         params={"phone": DRIVER_PHONE, "pin": DRIVER_PIN})
        assert r.status_code == 200, f"{r.status_code} {r.text[:200]}"
        data = r.json()
        assert "token" in data and isinstance(data["token"], str) and len(data["token"]) > 10, \
            f"token missing/invalid: {data}"
        assert "driver" in data, f"driver missing: {data}"
        assert data["driver"].get("id") == DRIVER_ID, f"driver id: {data['driver']}"

    def test_driver_login_wrong_pin(self, session):
        r = session.post(f"{BASE_URL}/api/driver/login",
                         params={"phone": DRIVER_PHONE, "pin": "9999"})
        assert r.status_code in (401, 403, 404), f"{r.status_code} {r.text[:200]}"


# ---------- 2. NEW: Driver endpoints require driver token (IDOR fix) ----------

class TestDriverEndpointsAuth:
    def test_orders_no_auth_blocked(self, session):
        r = session.get(f"{BASE_URL}/api/driver/orders")
        assert r.status_code in (401, 403), f"{r.status_code} {r.text[:200]}"

    def test_orders_with_driver_token_ok(self, session, driver_token):
        r = session.get(f"{BASE_URL}/api/driver/orders", headers=_h(driver_token))
        assert r.status_code == 200, f"{r.status_code} {r.text[:200]}"

    def test_orders_query_driver_id_ignored_idor(self, session, driver_token):
        """IDOR check: passing ?driver_id=other must NOT change scope (param removed/derived from token)."""
        r = session.get(f"{BASE_URL}/api/driver/orders",
                        params={"driver_id": "some-other-driver-id"},
                        headers=_h(driver_token))
        assert r.status_code == 200, f"{r.status_code} {r.text[:200]}"
        data = r.json()
        # any returned orders must belong to the authenticated driver only
        orders = data if isinstance(data, list) else data.get("orders", [])
        for o in orders:
            drv = o.get("driver_id") or o.get("assigned_driver_id")
            if drv:
                assert drv == DRIVER_ID, f"IDOR LEAK: order assigned to '{drv}', not '{DRIVER_ID}'"

    def test_update_location_no_auth_blocked(self, session):
        r = session.post(f"{BASE_URL}/api/driver/update-location",
                         json={"latitude": 33.3, "longitude": 44.4})
        assert r.status_code in (401, 403), f"{r.status_code} {r.text[:200]}"

    def test_update_location_with_token_ok(self, session, driver_token):
        r = session.post(f"{BASE_URL}/api/driver/update-location",
                         headers=_h(driver_token),
                         json={"latitude": 33.3, "longitude": 44.4})
        assert r.status_code == 200, f"{r.status_code} {r.text[:200]}"

    def test_status_update_no_auth_blocked(self, session):
        r = session.put(f"{BASE_URL}/api/driver/orders/some-order/status",
                        params={"status": "out_for_delivery"})
        assert r.status_code in (401, 403), f"{r.status_code} {r.text[:200]}"

    def test_status_update_with_token_no_403(self, session, driver_token):
        """With valid driver token, order may not exist for driver -> 404/400, but NOT 401/403 auth."""
        r = session.put(f"{BASE_URL}/api/driver/orders/nonexistent-order-id/status",
                        params={"status": "out_for_delivery"},
                        headers=_h(driver_token))
        assert r.status_code not in (401, 403), f"auth blocked: {r.status_code} {r.text[:200]}"


# ---------- 3. order-notifications: shared GET/read, staff-only management ----------

class TestOrderNotificationsSplit:
    def test_get_with_driver_token(self, session, driver_token):
        r = session.get(f"{BASE_URL}/api/order-notifications", headers=_h(driver_token))
        assert r.status_code == 200, f"driver get: {r.status_code} {r.text[:200]}"

    def test_get_with_staff_token(self, session, admin_token):
        r = session.get(f"{BASE_URL}/api/order-notifications", headers=_h(admin_token))
        assert r.status_code == 200, f"staff get: {r.status_code} {r.text[:200]}"

    def test_get_anon_blocked(self, session):
        r = session.get(f"{BASE_URL}/api/order-notifications")
        assert r.status_code in (401, 403), f"{r.status_code}"

    # Management endpoints — staff only (driver token must be rejected)
    def test_escalations_driver_rejected(self, session, driver_token):
        r = session.get(f"{BASE_URL}/api/order-notifications/escalations",
                        headers=_h(driver_token))
        assert r.status_code in (401, 403), f"driver escalations: {r.status_code} {r.text[:200]}"

    def test_escalations_staff_ok(self, session, admin_token):
        r = session.get(f"{BASE_URL}/api/order-notifications/escalations",
                        headers=_h(admin_token))
        assert r.status_code == 200, f"staff escalations: {r.status_code} {r.text[:200]}"

    def test_create_driver_rejected(self, session, driver_token):
        r = session.post(f"{BASE_URL}/api/order-notifications",
                         headers=_h(driver_token),
                         json={"order_id": "x", "message": "y"})
        assert r.status_code in (401, 403), f"driver create: {r.status_code} {r.text[:200]}"

    def test_read_all_driver_rejected(self, session, driver_token):
        r = session.put(f"{BASE_URL}/api/order-notifications/read-all",
                        headers=_h(driver_token))
        assert r.status_code in (401, 403), f"driver read-all: {r.status_code} {r.text[:200]}"

    def test_printed_driver_rejected(self, session, driver_token):
        r = session.put(f"{BASE_URL}/api/order-notifications/some-id/printed",
                        headers=_h(driver_token))
        assert r.status_code in (401, 403), f"driver printed: {r.status_code} {r.text[:200]}"

    def test_cleanup_driver_rejected(self, session, driver_token):
        r = session.delete(f"{BASE_URL}/api/order-notifications/cleanup",
                           headers=_h(driver_token))
        assert r.status_code in (401, 403), f"driver cleanup: {r.status_code} {r.text[:200]}"


# ---------- 4. drivers router: shared auth required, staff-only management ----------

class TestDriversRouterAuth:
    def test_stats_no_auth_blocked(self, session):
        r = session.get(f"{BASE_URL}/api/drivers/{DRIVER_ID}/stats")
        assert r.status_code in (401, 403), f"{r.status_code} {r.text[:200]}"

    def test_orders_no_auth_blocked(self, session):
        r = session.get(f"{BASE_URL}/api/drivers/{DRIVER_ID}/orders")
        assert r.status_code in (401, 403), f"{r.status_code} {r.text[:200]}"

    def test_stats_admin_ok(self, session, admin_token):
        r = session.get(f"{BASE_URL}/api/drivers/{DRIVER_ID}/stats",
                        headers=_h(admin_token))
        assert r.status_code == 200, f"{r.status_code} {r.text[:200]}"

    def test_orders_admin_ok(self, session, admin_token):
        r = session.get(f"{BASE_URL}/api/drivers/{DRIVER_ID}/orders",
                        headers=_h(admin_token))
        assert r.status_code == 200, f"{r.status_code} {r.text[:200]}"

    def test_create_driver_token_rejected(self, session, driver_token):
        r = session.post(f"{BASE_URL}/api/drivers",
                         headers=_h(driver_token),
                         json={"name": "x", "phone": "0790"})
        assert r.status_code in (401, 403), f"driver create: {r.status_code} {r.text[:200]}"

    def test_update_driver_token_rejected(self, session, driver_token):
        r = session.put(f"{BASE_URL}/api/drivers/{DRIVER_ID}",
                        headers=_h(driver_token),
                        json={"name": "hacked"})
        assert r.status_code in (401, 403), f"driver update: {r.status_code} {r.text[:200]}"

    def test_delete_driver_token_rejected(self, session, driver_token):
        r = session.delete(f"{BASE_URL}/api/drivers/{DRIVER_ID}",
                           headers=_h(driver_token))
        assert r.status_code in (401, 403), f"driver delete: {r.status_code} {r.text[:200]}"


# ---------- 5. iter247/248/249 regression ----------

class TestRegression:
    def test_register_anon_rejected(self, session):
        r = session.post(f"{BASE_URL}/api/auth/register", json={
            "username": f"TEST_anon_{uuid.uuid4().hex[:6]}",
            "email": f"TEST_anon_{uuid.uuid4().hex[:6]}@x.com",
            "password": "Pwd12345!", "full_name": "Anon", "role": "super_admin",
        })
        assert r.status_code in (401, 403), f"{r.status_code}"

    def test_admin_super_admin_register_blocked(self, session, admin_token):
        uniq = uuid.uuid4().hex[:6]
        r = session.post(f"{BASE_URL}/api/auth/register", headers=_h(admin_token), json={
            "username": f"TEST_sa_{uniq}", "email": f"TEST_sa_{uniq}@x.com",
            "password": "Pwd12345!", "full_name": "Bad SA", "role": "super_admin",
        })
        assert r.status_code == 403

    def test_admin_cashier_register_ok(self, session, admin_token):
        uniq = uuid.uuid4().hex[:6]
        r = session.post(f"{BASE_URL}/api/auth/register", headers=_h(admin_token), json={
            "username": f"TEST_cash_{uniq}", "email": f"TEST_cash_{uniq}@x.com",
            "password": "Pwd12345!", "full_name": "Cashier", "role": "cashier",
        })
        assert r.status_code == 200, f"{r.status_code} {r.text[:200]}"

    def test_owner_no_secret_blocked(self, session):
        r = session.post(f"{BASE_URL}/api/auth/login",
                         json={"email": OWNER_EMAIL, "password": OWNER_PASSWORD})
        assert r.status_code == 403

    def test_owner_with_secret_ok(self, session):
        r = session.post(f"{BASE_URL}/api/auth/login",
                         json={"email": OWNER_EMAIL, "password": OWNER_PASSWORD,
                               "secret_key": OWNER_SECRET})
        assert r.status_code == 200

    def test_admin_login_ok(self, session):
        r = session.post(f"{BASE_URL}/api/auth/login",
                         json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
        assert r.status_code == 200

    @pytest.mark.parametrize("ep", [
        "/api/purchases-new", "/api/inventory-stats", "/api/manufactured-products",
    ])
    def test_anon_blocked_endpoints(self, session, ep):
        r = session.get(f"{BASE_URL}{ep}")
        assert r.status_code in (401, 403), f"{ep} -> {r.status_code}"

    def test_callcenter_webhook_no_secret(self, session):
        r = session.post(f"{BASE_URL}/api/callcenter/webhook", json={"phone": "0790"})
        assert r.status_code == 403

    def test_init_db_no_key(self, session):
        r = session.get(f"{BASE_URL}/api/init-db")
        assert r.status_code == 403

    def test_customer_menu_no_sensitive(self, session):
        r = session.get(f"{BASE_URL}/api/customer/menu/default")
        assert r.status_code == 200
        products = r.json().get("products", [])
        leaked = {}
        for p in products:
            for f in SENSITIVE_PRODUCT_FIELDS:
                if f in p:
                    leaked.setdefault(f, 0)
                    leaked[f] += 1
        assert not leaked, f"sensitive fields leaked: {leaked}"

    def test_print_queue_pending_no_key(self, session):
        r = session.get(f"{BASE_URL}/api/print-queue/pending", params={"branch_id": "any"})
        assert r.status_code == 403

    def test_print_queue_pending_with_key(self, session):
        r = session.get(f"{BASE_URL}/api/print-queue/pending",
                        params={"branch_id": "any", "key": PRINT_AGENT_KEY})
        assert r.status_code == 200

    def test_invoice_settings_anon_blocked(self, session):
        r = session.get(f"{BASE_URL}/api/system/invoice-settings")
        assert r.status_code in (401, 403)

    def test_invoice_settings_admin_ok(self, session, admin_token):
        r = session.get(f"{BASE_URL}/api/system/invoice-settings", headers=_h(admin_token))
        assert r.status_code == 200

    def test_security_headers_present(self, session):
        r = session.get(f"{BASE_URL}/api/")
        lower = {k.lower(): v for k, v in r.headers.items()}
        missing = [h for h in SECURITY_HEADERS if h not in lower]
        assert not missing, f"missing headers: {missing}"
        assert lower["x-content-type-options"].lower() == "nosniff"
        assert lower["x-frame-options"].upper() == "SAMEORIGIN"

    @pytest.mark.parametrize("ep", [
        "/api/products", "/api/categories", "/api/orders", "/api/employees",
        "/api/drivers", "/api/branches", "/api/dashboard/stats",
    ])
    def test_admin_can_read(self, session, admin_token, ep):
        r = session.get(f"{BASE_URL}{ep}", headers=_h(admin_token))
        assert r.status_code == 200, f"{ep} admin -> {r.status_code} {r.text[:200]}"
