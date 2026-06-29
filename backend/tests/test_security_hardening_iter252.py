"""
iter252 — Public-write endpoint hardening + Dashboard super-admin button removal.

NEW changes since iter251:
  1. POST /api/push/test                  -> requires staff auth (401/403)
  2. GET  /api/notifications/{phone}      -> requires staff auth (401/403)
  3. POST /api/order-chat/{order_id}      -> 404 for fake order_id; rate-limit 429 after >20 req/min
  4. POST /api/customer/order/{tenant_id} -> 404/422 for fake tenant; legitimate active tenant must still work
  5. POST /api/customer-reviews           -> 404 for fake order_id (cannot inject fake reviews)
  6. POST /api/calls/initiate             -> 400 on bad payload; 429 after >10 req/min

Regression:
  - Supplier/Inventory write endpoints anon-blocked (401/403)
  - Admin login still works + GET /api/products /api/orders OK
"""

import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "http://localhost:8001").rstrip("/")

ADMIN_EMAIL = "admin@maestroegp.com"
ADMIN_PASSWORD = "admin123"

ACTIVE_TENANT_ID = "f107d422-3195-434c-93e6-5a4739097237"


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


def _auth(token):
    return {"Authorization": f"Bearer {token}"}


# ========== 1. /api/push/test requires staff auth ==========

class TestPushTestAuth:
    def test_anon_blocked(self, session):
        r = session.post(f"{BASE_URL}/api/push/test", json={"message": "hi"})
        assert r.status_code in (401, 403), f"got {r.status_code} {r.text[:200]}"

    def test_admin_not_blocked(self, session, admin_token):
        r = session.post(f"{BASE_URL}/api/push/test",
                         json={"message": "hi"},
                         headers=_auth(admin_token))
        # auth passed -> should NOT be 401/403
        assert r.status_code not in (401, 403), f"got {r.status_code} {r.text[:300]}"


# ========== 2. /api/notifications/{phone} requires staff auth ==========

class TestNotificationsByPhoneAuth:
    def test_anon_blocked(self, session):
        r = session.get(f"{BASE_URL}/api/notifications/07801111111")
        assert r.status_code in (401, 403), f"got {r.status_code} {r.text[:200]}"

    def test_admin_passes_auth(self, session, admin_token):
        r = session.get(f"{BASE_URL}/api/notifications/07801111111",
                        headers=_auth(admin_token))
        assert r.status_code not in (401, 403), f"got {r.status_code} {r.text[:300]}"


# ========== 3. /api/order-chat/{order_id} — 404 fake + rate limit ==========

class TestOrderChatRateLimit:
    def test_fake_order_returns_404(self, session):
        fake = f"nonexistent-{uuid.uuid4()}"
        r = session.post(f"{BASE_URL}/api/order-chat/{fake}",
                         json={"sender": "customer", "text": "hi"})
        assert r.status_code == 404, f"got {r.status_code} {r.text[:300]}"

    def test_rate_limit_429_after_burst(self, session):
        fake = f"nonexistent-{uuid.uuid4()}"
        statuses = []
        for _ in range(25):
            r = session.post(f"{BASE_URL}/api/order-chat/{fake}",
                             json={"sender": "customer", "text": "spam"})
            statuses.append(r.status_code)
            if r.status_code == 429:
                break
        assert 429 in statuses, f"expected 429 in burst, got distribution: {statuses}"


# ========== 4. /api/customer/order/{tenant_id} ==========

class TestCustomerOrderTenantValidation:
    def test_fake_tenant_rejected(self, session):
        fake = f"nonexistent-tenant-{uuid.uuid4()}"
        r = session.post(f"{BASE_URL}/api/customer/order/{fake}",
                         json={
                             "customer_name": "TEST_cust",
                             "customer_phone": "07801234567",
                             "items": [{"product_id": "x", "quantity": 1, "price": 1.0}],
                             "total": 1.0,
                             "order_type": "delivery",
                         })
        assert r.status_code in (404, 422, 400), \
            f"expected 404/422/400 for fake tenant, got {r.status_code} {r.text[:300]}"

    def test_active_tenant_does_not_404(self, session):
        # Sending a possibly-bad body to an active tenant.
        # We assert it is NOT 404 (tenant exists). 4xx for body validation is acceptable;
        # 200/201 is fine if products exist. 404 would mean tenant rejected — fail.
        r = session.post(f"{BASE_URL}/api/customer/order/{ACTIVE_TENANT_ID}",
                         json={
                             "customer_name": "TEST_cust",
                             "customer_phone": "07801234567",
                             "items": [{"product_id": "nonexistent-prod",
                                        "quantity": 1, "price": 1.0}],
                             "total": 1.0,
                             "order_type": "delivery",
                         })
        # Acceptable: 200, 201, 400 (bad product), 422 (validation). NOT 404.
        assert r.status_code != 404, \
            f"active tenant should be reachable, got 404: {r.text[:300]}"


# ========== 5. /api/customer-reviews — fake order rejected ==========

class TestCustomerReviewsFakeOrder:
    def test_fake_order_rejected(self, session):
        fake = f"nonexistent-order-{uuid.uuid4()}"
        r = session.post(f"{BASE_URL}/api/customer-reviews",
                         json={
                             "order_id": fake,
                             "rating": 5,
                             "comment": "TEST_fake",
                             "customer_name": "TEST",
                             "customer_phone": "07801234567",
                         })
        assert r.status_code in (404, 400, 422), \
            f"expected rejection, got {r.status_code} {r.text[:300]}"


# ========== 6. /api/calls/initiate — bad payload + rate limit ==========

class TestCallsInitiate:
    def test_bad_payload_400_or_422(self, session):
        r = session.post(f"{BASE_URL}/api/calls/initiate", json={})
        assert r.status_code in (400, 422), \
            f"expected 400/422 on empty payload, got {r.status_code} {r.text[:300]}"

    def test_rate_limit_429_after_burst(self, session):
        statuses = []
        # send 15 quickly with a minimally-shaped payload
        for i in range(15):
            r = session.post(f"{BASE_URL}/api/calls/initiate", json={
                "from_phone": "07801234567",
                "to_phone": "07807654321",
                "order_id": f"x-{i}",
            })
            statuses.append(r.status_code)
            if r.status_code == 429:
                break
        assert 429 in statuses, f"expected 429 in burst, got: {statuses}"


# ========== Regression: anon writes blocked on management endpoints ==========

class TestRegressionAnonWritesBlocked:
    @pytest.mark.parametrize("ep,payload", [
        ("/api/purchases-new", {"supplier_id": "x", "items": []}),
        ("/api/inventory", {"name": "TEST_x", "quantity": 1}),
        ("/api/suppliers", {"name": "TEST_sup"}),
        ("/api/expenses", {"amount": 1, "description": "TEST"}),
        ("/api/products", {"name": "TEST_p", "price": 1}),
    ])
    def test_anon_write_blocked(self, session, ep, payload):
        r = session.post(f"{BASE_URL}{ep}", json=payload)
        assert r.status_code in (401, 403), f"{ep} => {r.status_code} {r.text[:200]}"


# ========== Regression: legitimate admin GETs work ==========

class TestRegressionAdminReads:
    def test_admin_can_get_products(self, session, admin_token):
        r = session.get(f"{BASE_URL}/api/products", headers=_auth(admin_token))
        assert r.status_code == 200, f"{r.status_code} {r.text[:200]}"

    def test_admin_can_get_orders(self, session, admin_token):
        r = session.get(f"{BASE_URL}/api/orders", headers=_auth(admin_token))
        assert r.status_code == 200, f"{r.status_code} {r.text[:200]}"
