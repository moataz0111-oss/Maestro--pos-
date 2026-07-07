"""Iteration 279: Welcome coupon approval flow tests."""
import os
import random
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://whatsapp-pos-system.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

TENANT = "default"
BRANCH_ID = "76f56acc-6948-4a2f-bbf4-feccbddea88f"
PRODUCT_ID = "765a9972-ec45-404d-ab20-055ecf1b2d13"


@pytest.fixture(scope="module")
def admin_token():
    r = requests.post(f"{API}/auth/login", json={"email": "admin@maestroegp.com", "password": "admin123"}, timeout=30)
    assert r.status_code == 200, r.text
    d = r.json()
    tok = d.get("token") or d.get("access_token")
    assert tok
    return tok


@pytest.fixture(scope="module")
def auth_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}"}


def _fresh_phone():
    return "0770" + "".join(str(random.randint(0, 9)) for _ in range(7))


def _place_first_order(phone, name="زبون اختبار 279"):
    payload = {
        "items": [{"product_id": PRODUCT_ID, "quantity": 1}],
        "delivery_address": "بغداد - اختبار",
        "payment_method": "cash",
        "customer_name": name,
        "customer_phone": phone,
        "branch_id": BRANCH_ID,
    }
    r = requests.post(f"{API}/customer/order/{TENANT}", json=payload, timeout=30)
    return r


class TestFirstOrderNotification:
    def test_first_order_creates_pending_customer_and_notification(self, auth_headers):
        phone = _fresh_phone()
        name = f"TEST_ترحيب {phone[-4:]}"
        r = _place_first_order(phone, name=name)
        assert r.status_code == 200, r.text
        resp = r.json()
        order = resp.get("order") or resp
        assert order.get("id")

        # Verify customer welcome_status pending via admin listing
        wa = requests.get(f"{API}/welcome-approvals", headers=auth_headers, timeout=30)
        assert wa.status_code == 200, wa.text
        data = wa.json()
        assert "pending" in data and "count" in data
        phones = [c.get("phone") for c in data["pending"]]
        assert phone in phones, f"Customer {phone} not in pending list: {phones[:5]}"
        cust = next(c for c in data["pending"] if c.get("phone") == phone)
        assert cust.get("welcome_status") == "pending"
        assert cust.get("name") == name


class TestWelcomeApprovalsAccess:
    def test_get_welcome_approvals_admin_ok(self, auth_headers):
        r = requests.get(f"{API}/welcome-approvals", headers=auth_headers, timeout=30)
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data.get("pending"), list)
        assert isinstance(data.get("count"), int)

    def test_get_welcome_approvals_unauth(self):
        r = requests.get(f"{API}/welcome-approvals", timeout=30)
        assert r.status_code in (401, 403)


class TestGrantWelcomeDiscount:
    def test_grant_with_full_payload(self, auth_headers):
        # create new pending
        phone = _fresh_phone()
        name = f"TEST_grant {phone[-4:]}"
        r0 = _place_first_order(phone, name=name)
        assert r0.status_code == 200

        wa = requests.get(f"{API}/welcome-approvals", headers=auth_headers, timeout=30).json()
        cust = next(c for c in wa["pending"] if c.get("phone") == phone)
        cid = cust["id"]

        body = {
            "usage_limit": 3,
            "discount_type": "percentage",
            "discount_value": 15,
            "valid_days": 10,
            "min_order_amount": 0,
            "branch_ids": [BRANCH_ID],
        }
        r = requests.post(f"{API}/customers/{cid}/grant-welcome-discount", headers=auth_headers, json=body, timeout=30)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["success"] is True
        code = data["coupon_code"]
        assert code.startswith("WLC")
        assert data["usage_limit"] == 3
        assert isinstance(data.get("branches"), list) and len(data["branches"]) >= 1
        # WhatsApp expected to fail gracefully
        assert data.get("whatsapp_sent") is False

        # Verify coupon exists and personalized
        cl = requests.get(f"{API}/coupons", headers=auth_headers, timeout=30)
        assert cl.status_code == 200
        coupons = cl.json()
        c = next((x for x in coupons if x.get("code") == code), None)
        assert c is not None, "coupon not persisted"
        assert c.get("usage_limit") == 3
        assert c.get("usage_per_customer") == 3
        assert c.get("is_welcome") is True
        assert BRANCH_ID in (c.get("branch_ids") or [])
        assert c.get("customer_name") == name
        assert name in (c.get("name") or "")

        # Verify customer moved to granted
        wa2 = requests.get(f"{API}/welcome-approvals", headers=auth_headers, timeout=30).json()
        assert cid not in [x["id"] for x in wa2["pending"]]

        # Second grant should 400
        r2 = requests.post(f"{API}/customers/{cid}/grant-welcome-discount", headers=auth_headers, json=body, timeout=30)
        assert r2.status_code == 400

    def test_grant_with_empty_body_defaults(self, auth_headers):
        phone = _fresh_phone()
        name = f"TEST_empty {phone[-4:]}"
        r0 = _place_first_order(phone, name=name)
        assert r0.status_code == 200

        wa = requests.get(f"{API}/welcome-approvals", headers=auth_headers, timeout=30).json()
        cust = next(c for c in wa["pending"] if c.get("phone") == phone)
        cid = cust["id"]

        r = requests.post(f"{API}/customers/{cid}/grant-welcome-discount", headers=auth_headers, json={}, timeout=30)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["success"] is True
        assert data["usage_limit"] == 1


class TestRegularCouponRegression:
    def test_create_regular_coupon_ok(self, auth_headers):
        import time
        code = f"TEST{int(time.time()) % 100000}"
        payload = {
            "code": code,
            "name": "TEST regression",
            "discount_type": "percentage",
            "discount_value": 10,
            "min_order_amount": 0,
            "usage_limit": 100,
            "usage_per_customer": 1,
            "valid_from": "2026-01-01T00:00:00Z",
            "valid_until": "2027-01-01T00:00:00Z",
            "is_active": True,
            "applicable_to": "all",
        }
        r = requests.post(f"{API}/coupons", headers=auth_headers, json=payload, timeout=30)
        assert r.status_code in (200, 201), r.text
