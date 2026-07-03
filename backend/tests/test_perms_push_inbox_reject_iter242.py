"""
Tests for: inbox sync graceful response, web push vapid + subscribe,
and order reject sets cancellation fields surfaced by customer order endpoint.
fork iter242 (perms+push+reject).
"""
import os
import time
import uuid
import requests
import pytest

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://inventory-accounting-11.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"


@pytest.fixture(scope="module")
def session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def admin_token(session):
    r = session.post(f"{API}/auth/login", json={
        "email": "admin@maestroegp.com",
        "password": "admin123"
    }, timeout=30)
    assert r.status_code == 200, f"admin login failed: {r.status_code} {r.text[:200]}"
    data = r.json()
    token = data.get("token") or data.get("access_token")
    assert token, f"no token in admin login: {data}"
    return token


# ---------------- Push notifications ----------------
class TestPush:
    def test_vapid_public_key(self, session):
        r = session.get(f"{API}/push/vapid-public-key", timeout=15)
        assert r.status_code == 200, r.text[:200]
        data = r.json()
        assert "publicKey" in data
        assert isinstance(data["publicKey"], str)
        assert len(data["publicKey"]) > 20

    def test_subscribe_driver(self, session):
        payload = {
            "endpoint": f"https://fcm.googleapis.com/fcm/send/TEST_{uuid.uuid4().hex}",
            "keys": {"p256dh": "TEST_p256dh_key_dummy", "auth": "TEST_auth_dummy"},
            "phone": "07801111111",
            "user_type": "driver"
        }
        r = session.post(f"{API}/push/subscribe", json=payload, timeout=15)
        assert r.status_code in (200, 201), f"{r.status_code} {r.text[:200]}"
        data = r.json()
        # tolerate {ok:true}, {status:'subscribed'}, {message:'...'} etc.
        assert any(k in data for k in ("ok", "status", "id", "success", "subscribed", "message"))

    def test_subscribe_customer(self, session):
        payload = {
            "endpoint": f"https://fcm.googleapis.com/fcm/send/TEST_{uuid.uuid4().hex}",
            "keys": {"p256dh": "TEST_p256dh_key_dummy2", "auth": "TEST_auth_dummy2"},
            "phone": "07701234567",
            "user_type": "customer"
        }
        r = session.post(f"{API}/push/subscribe", json=payload, timeout=15)
        assert r.status_code in (200, 201), f"{r.status_code} {r.text[:200]}"


# ---------------- Inbox sync ----------------
class TestInboxSync:
    def test_inbox_sync_graceful(self, session, admin_token):
        headers = {"Authorization": f"Bearer {admin_token}"}
        r = session.get(f"{API}/system/inbox/sync", headers=headers, timeout=30)
        # Must NOT 500. Accept 200 with configured:false OR 200 success OR 4xx for missing creds (NOT 5xx).
        assert r.status_code < 500, f"inbox sync 5xx: {r.status_code} {r.text[:300]}"
        # Should be parseable JSON when 200
        if r.status_code == 200:
            data = r.json()
            assert isinstance(data, dict)


# ---------------- Reject Order flow ----------------
class TestOrderRejectFlow:
    def test_reject_sets_cancellation_fields(self, session, admin_token):
        headers = {"Authorization": f"Bearer {admin_token}"}

        # 1. Get a real product id from the public menu
        menu_resp = session.get(f"{API}/customer/menu/default", timeout=20)
        assert menu_resp.status_code == 200, f"menu: {menu_resp.status_code} {menu_resp.text[:200]}"
        menu = menu_resp.json()
        products = menu.get("products") if isinstance(menu, dict) else menu
        if not products:
            pytest.skip("No products in tenant 'default' menu")
        product_id = products[0]["id"]

        # 2. Create order via public customer endpoint (does not require cashier shift)
        order_payload = {
            "items": [{"product_id": product_id, "quantity": 1}],
            "customer_name": "TEST_REJECT",
            "customer_phone": "07700000099",
            "delivery_address": "TEST addr",
            "order_type": "delivery",
            "payment_method": "cash"
        }
        cr = session.post(f"{API}/customer/order/default", json=order_payload, timeout=30)
        assert cr.status_code == 200, f"create: {cr.status_code} {cr.text[:300]}"
        created = cr.json().get("order") or cr.json()
        order_id = created.get("id")
        tenant_id = created.get("tenant_id") or "default"
        assert order_id, f"no order id: {created}"

        # 3. Reject the order (admin auth)
        reject_reason = "TEST_reject_reason_by_admin"
        rj = session.put(
            f"{API}/orders/{order_id}/reject",
            json={"reason": reject_reason},
            headers=headers,
            timeout=30
        )
        assert rj.status_code in (200, 204), f"reject failed: {rj.status_code} {rj.text[:300]}"

        # 4. Customer order endpoint should expose cancelled/rejected fields
        time.sleep(0.5)
        co = session.get(f"{API}/customer/order/{tenant_id}/{order_id}", timeout=20)
        assert co.status_code == 200, f"customer order fetch: {co.status_code} {co.text[:200]}"
        raw = co.json()
        data = raw.get("order") if isinstance(raw, dict) and "order" in raw else raw

        status = (data.get("status") or "").lower()
        assert status in ("cancelled", "canceled", "rejected"), f"unexpected status: {status} | data={data}"
        assert data.get("is_rejected") in (True, "true", 1), f"is_rejected missing/false: {data.get('is_rejected')}"
        reason = data.get("cancellation_reason") or data.get("reject_reason") or data.get("rejection_reason")
        assert reason, f"cancellation_reason missing: {data}"
