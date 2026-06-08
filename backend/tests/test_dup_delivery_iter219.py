"""
Iteration 219 — Anti-Duplicate System (delivery + offline_id + business duplicate detection).
Covers BACKEND DUP-1..DUP-5 from review_request.

Pre-req: open cashier shift seeded via /app/backend/seed_captain_test_data.py
"""
import os
import uuid
import time

import pytest
import requests


def _read_frontend_env_url():
    p = "/app/frontend/.env"
    if os.path.exists(p):
        for line in open(p):
            if line.startswith("REACT_APP_BACKEND_URL="):
                return line.split("=", 1)[1].strip()
    raise RuntimeError("REACT_APP_BACKEND_URL not found")


BASE_URL = (os.environ.get("REACT_APP_BACKEND_URL") or _read_frontend_env_url()).rstrip("/")
BRANCH_ID = "76f56acc-6948-4a2f-bbf4-feccbddea88f"
DELIVERY_APP = "talabat"
PRODUCT_ID = "765a9972-ec45-404d-ab20-055ecf1b2d13"  # برغر كلاسيك 5000
PRODUCT_PRICE = 5000.0

# unique run suffix so different test sessions don't collide
RUN = uuid.uuid4().hex[:8]


@pytest.fixture(scope="module")
def admin_token():
    r = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": "admin@maestroegp.com", "password": "admin123"},
        timeout=15,
    )
    assert r.status_code == 200, r.text
    return r.json()["token"]


@pytest.fixture(scope="module")
def admin_client(admin_token):
    s = requests.Session()
    s.headers.update({"Authorization": f"Bearer {admin_token}", "Content-Type": "application/json"})
    return s


def _make_item(qty=1):
    return {
        "product_id": PRODUCT_ID,
        "product_name": "برغر كلاسيك",
        "quantity": qty,
        "price": PRODUCT_PRICE,
    }


def _delivery_payload(ext_ref, items=None, offline_id=None, extras=None):
    p = {
        "order_type": "delivery",
        "branch_id": BRANCH_ID,
        "items": items or [_make_item(1)],
        "payment_method": "cash",
        "delivery_app": DELIVERY_APP,
        "delivery_app_name": "طلبات",
        "delivery_company_id": DELIVERY_APP,
        "delivery_company_name": "طلبات",
        "delivery_company_order_id": ext_ref,
        "offline_id": offline_id or str(uuid.uuid4()),
        # include RUN+ext_ref in customer to make content fingerprint unique per test
        "customer_name": f"TEST_dup_{ext_ref}",
        "customer_phone": f"077{uuid.uuid4().hex[:8]}",
    }
    if extras:
        p.update(extras)
    return p


# ---------- DUP-1: external ref hard block on ONLINE POST /api/orders ----------
_SHARED = {}


class TestDup1ExternalRefBlockOnline:
    def test_first_delivery_order_succeeds(self, admin_client):
        ext_ref = f"TEST-DUP1-{RUN}"
        payload = _delivery_payload(ext_ref)
        r = admin_client.post(f"{BASE_URL}/api/orders", json=payload, timeout=20)
        assert r.status_code == 200, f"Expected 200, got {r.status_code}: {r.text}"
        data = r.json()
        assert "order_number" in data and data["order_number"] is not None
        assert data.get("delivery_company_order_id") == ext_ref
        _SHARED["first_order_number"] = data["order_number"]
        _SHARED["first_ext_ref"] = ext_ref

    def test_second_delivery_same_ext_ref_blocked_409(self, admin_client):
        ext_ref = _SHARED["first_ext_ref"]
        # DIFFERENT items + DIFFERENT offline_id so we bypass offline_id idempotency AND content fingerprint
        payload = _delivery_payload(
            ext_ref,
            items=[_make_item(3)],
            offline_id=str(uuid.uuid4()),
        )
        r = admin_client.post(f"{BASE_URL}/api/orders", json=payload, timeout=20)
        assert r.status_code == 409, f"Expected 409, got {r.status_code}: {r.text}"
        body = r.json()
        detail = body.get("detail") or body
        assert detail.get("code") == "DUPLICATE_DELIVERY_ORDER", detail
        msg = detail.get("message", "")
        assert str(_SHARED["first_order_number"]) in msg, msg
        assert "رقم" in msg or "طلب" in msg, msg


# ---------- DUP-2: external ref idempotent on SYNC ----------
class TestDup2ExternalRefIdempotentSync:
    def test_sync_same_ext_ref_returns_existing(self, admin_client):
        ext_ref = f"TEST-DUP2-{RUN}"
        # 1) Create via online POST first
        first = admin_client.post(
            f"{BASE_URL}/api/orders", json=_delivery_payload(ext_ref), timeout=20
        )
        assert first.status_code == 200, first.text
        existing_number = first.json()["order_number"]

        # 2) Now sync the SAME ext_ref but with DIFFERENT offline_id and items
        sync_payload = _delivery_payload(
            ext_ref,
            items=[_make_item(2)],
            offline_id=str(uuid.uuid4()),
        )
        # /api/sync/orders requires total/subtotal because it represents an offline-finalized order
        sync_payload["total"] = 10000.0
        sync_payload["subtotal"] = 10000.0
        r = admin_client.post(f"{BASE_URL}/api/sync/orders", json=sync_payload, timeout=20)
        assert r.status_code == 200, f"sync failed: {r.status_code} {r.text}"
        result = r.json()
        assert result.get("success") is True, result
        assert result.get("order_number") == existing_number, result
        msg = (result.get("message") or "")
        assert "موجود" in msg or "تكرار" in msg or "مسبق" in msg, msg


# ---------- DUP-3: offline_id idempotency still works ----------
class TestDup3OfflineIdIdempotent:
    def test_same_offline_id_returns_same_order(self, admin_client):
        oid = str(uuid.uuid4())
        payload = {
            "order_type": "dine_in",
            "branch_id": BRANCH_ID,
            "items": [_make_item(1)],
            "payment_method": "cash",
            "offline_id": oid,
        }
        r1 = admin_client.post(f"{BASE_URL}/api/orders", json=payload, timeout=20)
        assert r1.status_code == 200, r1.text
        num1 = r1.json()["order_number"]

        # Slightly different items/total but SAME offline_id -> must return existing
        payload2 = dict(payload)
        payload2["items"] = [_make_item(5)]
        r2 = admin_client.post(f"{BASE_URL}/api/orders", json=payload2, timeout=20)
        assert r2.status_code == 200, r2.text
        num2 = r2.json()["order_number"]
        assert num1 == num2, f"offline_id idempotency broken: {num1} vs {num2}"


# ---------- DUP-4: non-delivery order without ext_ref is NOT blocked ----------
class TestDup4NonDeliveryUnaffected:
    def test_dine_in_two_orders_not_blocked(self, admin_client):
        # First
        p1 = {
            "order_type": "dine_in",
            "branch_id": BRANCH_ID,
            "items": [_make_item(1)],
            "payment_method": "cash",
            "offline_id": str(uuid.uuid4()),
        }
        r1 = admin_client.post(f"{BASE_URL}/api/orders", json=p1, timeout=20)
        assert r1.status_code == 200, r1.text
        # Sleep > 30s would be needed to bypass content fingerprint;
        # use different items to bypass fingerprint immediately
        p2 = dict(p1)
        p2["offline_id"] = str(uuid.uuid4())
        p2["items"] = [_make_item(7)]
        r2 = admin_client.post(f"{BASE_URL}/api/orders", json=p2, timeout=20)
        assert r2.status_code == 200, f"non-delivery order erroneously blocked: {r2.status_code} {r2.text}"
        assert r2.json()["order_number"] != r1.json()["order_number"]

    def test_takeaway_order_creates_normally(self, admin_client):
        p = {
            "order_type": "takeaway",
            "branch_id": BRANCH_ID,
            "items": [_make_item(2)],
            "payment_method": "cash",
            "offline_id": str(uuid.uuid4()),
        }
        r = admin_client.post(f"{BASE_URL}/api/orders", json=p, timeout=20)
        assert r.status_code == 200, r.text
        assert r.json().get("order_type") == "takeaway"


# ---------- DUP-5: business duplicate detection + cleanup ----------
class TestDup5BusinessDuplicateDetection:
    def test_detect_endpoint_returns_structure(self, admin_client):
        r = admin_client.get(f"{BASE_URL}/api/sync/business-duplicate-orders", timeout=20)
        assert r.status_code == 200, r.text
        data = r.json()
        assert "duplicate_groups" in data
        assert "extra_orders_to_remove" in data
        assert "groups" in data
        assert isinstance(data["groups"], list)

    def test_cleanup_endpoint_works(self, admin_client):
        # Seed a duplicate directly via DB by inserting then forcing a dup via sync_routes idempotency bypass
        # We just hit the cleanup endpoint; it should run without crashing and return a structured response.
        r = admin_client.post(f"{BASE_URL}/api/sync/cleanup-business-duplicates", timeout=30)
        assert r.status_code == 200, r.text
        data = r.json()
        assert "duplicate_groups" in data
        assert "removed_orders" in data
        assert isinstance(data["removed_orders"], int)


if __name__ == "__main__":
    raise SystemExit(pytest.main([__file__, "-v", "--tb=short"]))
