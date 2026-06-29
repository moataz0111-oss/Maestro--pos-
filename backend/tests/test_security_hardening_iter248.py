"""
iter248 — NEW: order-notifications router-level auth verification + iter247 regression.

NEW change since iter247: routes/order_notifications.py router now declares
`dependencies=[Depends(get_current_user)]` so every endpoint in the file is
auth-required.

Validates:
  - GET /api/order-notifications/escalations: 401/403 anon, 200 with admin.
  - GET /api/order-notifications: 401/403 anon, 200 with admin.
  - POST /api/order-notifications: 401/403 anon.
  - PUT /api/order-notifications/{id}/read: 401/403 anon.
  - PUT /api/order-notifications/read-all: 401/403 anon.
  - PUT /api/order-notifications/{id}/printed: 401/403 anon.
  - DELETE /api/order-notifications/cleanup: 401/403 anon.
Plus iter247 regression spot-checks (register / login / inventory / webhook /
init-db / customer-menu / products / categories / orders).
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
    assert r.status_code == 200, f"admin login failed: {r.status_code} {r.text}"
    tok = r.json().get("token") or r.json().get("access_token")
    assert tok, f"no token in response: {r.json()}"
    return tok


def _h(tok):
    return {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}


# ---------- 1. NEW: order_notifications router auth ----------

class TestOrderNotificationsAnon:
    """All endpoints in routes/order_notifications.py must reject anonymous."""

    def test_get_escalations_anon_blocked(self, session):
        r = session.get(f"{BASE_URL}/api/order-notifications/escalations",
                        params={"branch_id": "any"})
        assert r.status_code in (401, 403), \
            f"escalations anon expected 401/403, got {r.status_code} body={r.text[:200]}"

    def test_get_notifications_anon_blocked(self, session):
        r = session.get(f"{BASE_URL}/api/order-notifications")
        assert r.status_code in (401, 403), \
            f"GET notifications anon expected 401/403, got {r.status_code} body={r.text[:200]}"

    def test_post_notification_anon_blocked(self, session):
        r = session.post(f"{BASE_URL}/api/order-notifications", json={
            "order_id": "x", "order_number": "x", "branch_id": "x", "order_type": "delivery"
        })
        assert r.status_code in (401, 403), \
            f"POST notification anon expected 401/403, got {r.status_code} body={r.text[:200]}"

    def test_put_mark_read_anon_blocked(self, session):
        r = session.put(f"{BASE_URL}/api/order-notifications/some-id/read")
        assert r.status_code in (401, 403), \
            f"PUT mark read anon expected 401/403, got {r.status_code} body={r.text[:200]}"

    def test_put_mark_all_read_anon_blocked(self, session):
        r = session.put(f"{BASE_URL}/api/order-notifications/read-all")
        assert r.status_code in (401, 403), \
            f"PUT read-all anon expected 401/403, got {r.status_code} body={r.text[:200]}"

    def test_put_mark_printed_anon_blocked(self, session):
        r = session.put(f"{BASE_URL}/api/order-notifications/some-id/printed")
        assert r.status_code in (401, 403), \
            f"PUT printed anon expected 401/403, got {r.status_code} body={r.text[:200]}"

    def test_delete_cleanup_anon_blocked(self, session):
        r = session.delete(f"{BASE_URL}/api/order-notifications/cleanup")
        assert r.status_code in (401, 403), \
            f"DELETE cleanup anon expected 401/403, got {r.status_code} body={r.text[:200]}"


class TestOrderNotificationsAdmin:
    """Admin token should pass router auth (not 401/403)."""

    def test_get_escalations_admin_ok(self, session, admin_token):
        r = session.get(f"{BASE_URL}/api/order-notifications/escalations",
                        params={"branch_id": "any"}, headers=_h(admin_token))
        assert r.status_code == 200, \
            f"escalations admin expected 200, got {r.status_code} body={r.text[:200]}"
        body = r.json()
        assert "escalations" in body and "count" in body, f"unexpected body: {body}"

    def test_get_notifications_admin_ok(self, session, admin_token):
        r = session.get(f"{BASE_URL}/api/order-notifications", headers=_h(admin_token))
        assert r.status_code == 200, \
            f"GET notifications admin expected 200, got {r.status_code} body={r.text[:200]}"
        body = r.json()
        assert "notifications" in body and "count" in body, f"unexpected body: {body}"

    def test_put_mark_all_read_admin_ok(self, session, admin_token):
        # idempotent — should succeed even if no unread notifs (modified_count=0)
        r = session.put(f"{BASE_URL}/api/order-notifications/read-all",
                        headers=_h(admin_token))
        assert r.status_code not in (401, 403), \
            f"PUT read-all admin unexpectedly blocked: {r.status_code} {r.text[:200]}"
        assert r.status_code < 500, f"server error: {r.status_code} {r.text[:200]}"


# ---------- 2. iter247 regression spot-checks ----------

class TestIter247Regression:
    # register
    def test_register_anonymous_rejected(self, session):
        r = session.post(f"{BASE_URL}/api/auth/register", json={
            "username": f"TEST_anon_{uuid.uuid4().hex[:6]}",
            "email": f"TEST_anon_{uuid.uuid4().hex[:6]}@x.com",
            "password": "Pwd12345!",
            "full_name": "Anon Hacker",
            "role": "super_admin",
        })
        assert r.status_code in (401, 403), f"got {r.status_code} {r.text[:200]}"

    def test_admin_create_super_admin_blocked(self, session, admin_token):
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

    def test_admin_create_cashier_ok(self, session, admin_token):
        uniq = uuid.uuid4().hex[:6]
        r = session.post(f"{BASE_URL}/api/auth/register",
                         headers=_h(admin_token),
                         json={
                             "username": f"TEST_cashier_{uniq}",
                             "email": f"TEST_cashier_{uniq}@x.com",
                             "password": "Pwd12345!",
                             "full_name": "Cashier Test",
                             "role": "cashier",
                         })
        assert r.status_code == 200, f"got {r.status_code} {r.text[:200]}"

    # login secret_key
    def test_owner_no_secret_rejected(self, session):
        r = session.post(f"{BASE_URL}/api/auth/login",
                         json={"email": OWNER_EMAIL, "password": OWNER_PASSWORD})
        assert r.status_code == 403, f"got {r.status_code} {r.text[:200]}"

    def test_owner_with_secret_ok(self, session):
        r = session.post(f"{BASE_URL}/api/auth/login",
                         json={"email": OWNER_EMAIL, "password": OWNER_PASSWORD,
                               "secret_key": OWNER_SECRET})
        assert r.status_code == 200, f"got {r.status_code} {r.text[:200]}"

    def test_admin_normal_login(self, session):
        r = session.post(f"{BASE_URL}/api/auth/login",
                         json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
        assert r.status_code == 200, f"got {r.status_code} {r.text[:200]}"

    # inventory
    @pytest.mark.parametrize("ep", [
        "/api/purchases-new", "/api/inventory-stats", "/api/manufactured-products"
    ])
    def test_inventory_anon_blocked(self, session, ep):
        r = session.get(f"{BASE_URL}{ep}")
        assert r.status_code in (401, 403), f"{ep} -> {r.status_code}"

    # callcenter webhook
    def test_callcenter_webhook_no_secret(self, session):
        r = session.post(f"{BASE_URL}/api/callcenter/webhook",
                         json={"caller": "07700000000", "event": "incoming_call"})
        assert r.status_code == 403, f"got {r.status_code} {r.text[:200]}"

    # init-db
    def test_init_db_no_key(self, session):
        r = session.get(f"{BASE_URL}/api/init-db")
        assert r.status_code == 403, f"got {r.status_code}"

    # customer/menu projection
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

    # core regression — staff can still read
    def test_admin_products(self, session, admin_token):
        r = session.get(f"{BASE_URL}/api/products", headers=_h(admin_token))
        assert r.status_code == 200

    def test_admin_categories(self, session, admin_token):
        r = session.get(f"{BASE_URL}/api/categories", headers=_h(admin_token))
        assert r.status_code == 200

    def test_admin_orders(self, session, admin_token):
        r = session.get(f"{BASE_URL}/api/orders", headers=_h(admin_token))
        assert r.status_code == 200
