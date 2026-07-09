"""Tests for iteration_276: WhatsApp pairing code + Customer first-order OTP verification."""
import os
import re
import requests
import pytest
from datetime import datetime, timezone
from pymongo import MongoClient

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://multi-cashier-vault.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

MONGO_URL = "mongodb://localhost:27017"
DB_NAME = "maestro_pos"

OWNER_EMAIL = "owner@maestroegp.com"
OWNER_PASSWORD = "owner123"
SECRET_KEY = "271018"

TEST_PHONE_LOCAL = "07705551234"
TEST_PHONE_E164 = "+9647705551234"


@pytest.fixture(scope="module")
def super_admin_token():
    r = requests.post(f"{API}/super-admin/login", json={
        "email": OWNER_EMAIL, "password": OWNER_PASSWORD, "secret_key": SECRET_KEY
    }, timeout=30)
    assert r.status_code == 200, f"Owner login failed: {r.status_code} {r.text}"
    token = r.json().get("token") or r.json().get("access_token")
    assert token, f"No token in login response: {r.json()}"
    return token


@pytest.fixture(scope="module")
def db():
    client = MongoClient(MONGO_URL)
    return client[DB_NAME]


@pytest.fixture(scope="module")
def default_product_id():
    r = requests.get(f"{API}/customer/menu/default", timeout=30)
    assert r.status_code == 200, f"menu fetch failed: {r.status_code}"
    data = r.json()
    products = data.get("products") if isinstance(data, dict) else None
    assert products and isinstance(products, list) and len(products) > 0, \
        f"No products in menu: keys={list(data.keys()) if isinstance(data, dict) else type(data)}"
    pid = products[0].get("id")
    assert pid, f"First product has no id: {products[0]}"
    print(f"Using product id: {pid} ({products[0].get('name')})")
    return pid


# ============ WhatsApp Pairing ============

class TestWhatsAppPair:
    def test_pair_requires_auth(self):
        r = requests.post(f"{API}/super-admin/whatsapp/pair", json={"phone": "07701234567"}, timeout=30)
        assert r.status_code in (401, 403), f"Expected 401/403 without auth, got {r.status_code}: {r.text}"

    def test_pair_with_super_admin(self, super_admin_token):
        r = requests.post(
            f"{API}/super-admin/whatsapp/pair",
            headers={"Authorization": f"Bearer {super_admin_token}"},
            json={"phone": "07701234567"},
            timeout=60,
        )
        # wa_service may not be linked/available in preview; accept either success or a controlled error
        print(f"pair status={r.status_code} body={r.text[:400]}")
        if r.status_code == 200 and r.json().get("ok") is True:
            data = r.json()
            code = data.get("code", "")
            assert re.match(r"^[A-Z0-9]{4}-[A-Z0-9]{4}$", code) or len(code.replace("-", "")) == 8, \
                f"Invalid code format: {code}"
        else:
            # wa_service unable to reach WhatsApp WebSocket in preview env
            pytest.skip(f"wa_service pairing unavailable in preview: status={r.status_code} body={r.text[:200]}")


# ============ Customer OTP request ============

class TestCustomerOtpRequest:
    def test_request_otp_returns_no_dev_code(self):
        r = requests.post(
            f"{API}/customer/order/default/request-otp",
            json={"phone": "07709998877", "name": "عميل جديد"},
            timeout=30,
        )
        assert r.status_code == 200, f"request-otp failed: {r.status_code} {r.text}"
        data = r.json()
        print(f"request-otp response: {data}")
        assert data.get("requires_2fa") is True
        assert "verification_id" in data
        assert "destination_masked" in data
        # MUST NOT leak dev_code / plaintext code
        body_str = str(data).lower()
        assert "dev_code" not in body_str, f"dev_code leaked: {data}"
        assert "plaintext" not in body_str
        # pending_delivery True is acceptable in preview
        return data

    def test_verify_otp_rejects_wrong_code(self):
        # first request
        r1 = requests.post(
            f"{API}/customer/order/default/request-otp",
            json={"phone": "07709998878", "name": "عميل جديد"},
            timeout=30,
        )
        assert r1.status_code == 200
        vid = r1.json().get("verification_id")
        assert vid
        r2 = requests.post(
            f"{API}/customer/order/default/verify-otp",
            json={"verification_id": vid, "code": "000000"},
            timeout=30,
        )
        assert r2.status_code == 401, f"Expected 401 for wrong code, got {r2.status_code}: {r2.text}"


# ============ First-order gate ============

class TestFirstOrderGate:
    def test_gate_enforcement_and_verified_phone_bypass(self, super_admin_token, db, default_product_id):
        headers = {"Authorization": f"Bearer {super_admin_token}"}
        # Enable global 2FA
        r_on = requests.post(f"{API}/super-admin/security-2fa-toggle",
                             headers=headers, json={"enabled": True}, timeout=30)
        assert r_on.status_code == 200, f"toggle on failed: {r_on.status_code} {r_on.text}"

        try:
            # Cleanup any pre-existing verified entry
            db.verified_customer_phones.delete_many({"tenant_id": "default", "phone": TEST_PHONE_E164})

            order_payload = {
                "items": [{"product_id": default_product_id, "quantity": 1}],
                "delivery_address": "حي الاختبار",
                "payment_method": "cash",
                "customer_name": "عميل غير موثق",
                "customer_phone": TEST_PHONE_LOCAL,
            }
            r_blocked = requests.post(f"{API}/customer/order/default", json=order_payload, timeout=30)
            print(f"blocked status={r_blocked.status_code} body={r_blocked.text[:400]}")
            assert r_blocked.status_code == 403, f"Expected 403, got {r_blocked.status_code}: {r_blocked.text}"
            body = r_blocked.json()
            # detail may be dict {code:..} or nested
            detail = body.get("detail") if isinstance(body, dict) else None
            code = None
            if isinstance(detail, dict):
                code = detail.get("code")
            elif isinstance(body, dict):
                code = body.get("code")
            assert code == "CUSTOMER_PHONE_VERIFICATION_REQUIRED", f"Wrong code: {body}"

            # Insert verified phone directly
            db.verified_customer_phones.insert_one({
                "tenant_id": "default",
                "phone": TEST_PHONE_E164,
                "verified_at": datetime.now(timezone.utc).isoformat(),
            })

            r_ok = requests.post(f"{API}/customer/order/default", json=order_payload, timeout=30)
            print(f"retry status={r_ok.status_code} body={r_ok.text[:400]}")
            assert r_ok.status_code == 200, f"Expected 200 after verification, got {r_ok.status_code}: {r_ok.text}"
            j = r_ok.json()
            assert j.get("id") or j.get("order_id") or j.get("order"), f"No order id in response: {j}"

        finally:
            # ALWAYS restore state
            db.verified_customer_phones.delete_many({"tenant_id": "default", "phone": TEST_PHONE_E164})
            r_off = requests.post(f"{API}/super-admin/security-2fa-toggle",
                                  headers=headers, json={"enabled": False}, timeout=30)
            print(f"toggle off status={r_off.status_code}")
            if r_off.status_code != 200:
                # Session invalidated by enabling 2FA. Force-disable at DB level
                # (login now requires 2FA which we can't complete in preview).
                db.security_config.update_one(
                    {"id": "global"},
                    {"$set": {"two_fa_enabled": False, "sessions_valid_after": None,
                              "updated_at": datetime.now(timezone.utc).isoformat()}},
                    upsert=True,
                )
                print("Force-disabled 2FA via MongoDB direct write")


# ============ Regression: no OTP when 2FA disabled ============

class TestRegressionNoOtpWhenDisabled:
    def test_order_succeeds_without_otp(self, default_product_id, db):
        # Wait for 2FA config cache (15s TTL) to expire after prior test toggled it off
        import time
        time.sleep(17)
        # Ensure 2FA is off (best-effort — TestFirstOrderGate already restores)
        phone_local = "07706661234"
        phone_e164 = "+9647706661234"
        db.verified_customer_phones.delete_many({"tenant_id": "default", "phone": phone_e164})
        order_payload = {
            "items": [{"product_id": default_product_id, "quantity": 1}],
            "delivery_address": "حي الاختبار الرجعي",
            "payment_method": "cash",
            "customer_name": "عميل عادي",
            "customer_phone": phone_local,
        }
        r = requests.post(f"{API}/customer/order/default", json=order_payload, timeout=30)
        print(f"regression order status={r.status_code} body={r.text[:400]}")
        assert r.status_code == 200, f"Order without 2FA should succeed, got {r.status_code}: {r.text}"
