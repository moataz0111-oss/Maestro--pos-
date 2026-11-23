"""Iter336: print queue speed fixes + delivery company order-id uniqueness per company + coupon prefix search."""
import os
import time
import uuid

import pytest
import requests
from pymongo import MongoClient


def _fe_url():
    for line in open("/app/frontend/.env"):
        if line.startswith("REACT_APP_BACKEND_URL="):
            return line.split("=", 1)[1].strip()


BASE_URL = (os.environ.get("REACT_APP_BACKEND_URL") or _fe_url()).rstrip("/")
PRINT_KEY = os.environ.get("PRINT_AGENT_KEY", "")
BRANCH_ID = "76f56acc-6948-4a2f-bbf4-feccbddea88f"
PRODUCT_ID = "765a9972-ec45-404d-ab20-055ecf1b2d13"
RUN = uuid.uuid4().hex[:6]


@pytest.fixture(scope="module")
def client():
    r = requests.post(f"{BASE_URL}/api/auth/login",
                      json={"email": "admin@maestroegp.com", "password": "admin123"}, timeout=20)
    if r.status_code != 200:
        pytest.skip(f"login failed {r.status_code}")
    s = requests.Session()
    s.headers.update({"Authorization": f"Bearer {r.json()['token']}"})
    return s


@pytest.fixture(scope="module")
def db():
    c = MongoClient(os.environ["MONGO_URL"])
    return c[os.environ["DB_NAME"]]


@pytest.fixture(scope="module")
def created_orders(client):
    ids = []
    yield ids
    for oid in ids:
        client.put(f"{BASE_URL}/api/orders/{oid}/cancel", timeout=20)


def agent_headers():
    return {"X-Print-Key": PRINT_KEY} if PRINT_KEY else {}


# ---- Print queue ----
class TestPrintQueue:
    def test_indexes_exist(self, db):
        names = [i["name"] for i in db.print_queue.list_indexes()]
        assert "status_1_branch_id_1_created_at_1" in names
        assert "fingerprint_1_created_at_-1" in names

    def test_pending_requires_key(self):
        if not PRINT_KEY:
            pytest.skip("no key configured")
        r = requests.get(f"{BASE_URL}/api/print-queue/pending", params={"branch_id": "x", "wait": 0}, timeout=15)
        assert r.status_code == 403

    def test_create_pull_complete_strips_payload(self, client, db):
        bid = f"TEST_branch_{RUN}"
        r = client.post(f"{BASE_URL}/api/print-queue", json={
            "branch_id": bid, "printer_name": "TEST_P", "printer_type": "network",
            "ip_address": "10.0.0.1", "raw_data": "A" * 2000, "order_data": {"id": f"TEST_{RUN}"}}, timeout=15)
        assert r.status_code == 200, r.text
        job_id = r.json()["job_id"]
        try:
            t0 = time.time()
            r = requests.get(f"{BASE_URL}/api/print-queue/pending",
                             params={"branch_id": bid, "wait": 0}, headers=agent_headers(), timeout=15)
            assert r.status_code == 200, r.text
            jobs = r.json()["jobs"]
            assert any(j["id"] == job_id for j in jobs)
            print(f"pull latency {time.time()-t0:.2f}s")
            r = requests.put(f"{BASE_URL}/api/print-queue/{job_id}/complete", json={"message": "ok"},
                             headers=agent_headers(), timeout=15)
            assert r.status_code == 200
            doc = db.print_queue.find_one({"id": job_id})
            assert doc["status"] == "completed"
            assert "raw_data" not in doc and "order_data" not in doc
        finally:
            db.print_queue.delete_one({"id": job_id})

    def test_long_poll_empty_returns_fast(self):
        t0 = time.time()
        r = requests.get(f"{BASE_URL}/api/print-queue/pending",
                         params={"branch_id": f"TEST_empty_{RUN}", "wait": 2}, headers=agent_headers(), timeout=15)
        dt = time.time() - t0
        assert r.status_code == 200 and r.json()["count"] == 0
        assert 1.8 <= dt <= 3.5, dt


# ---- Delivery duplicate per company ----
def _payload(app, app_name, ext, qty=1):
    return {
        "order_type": "delivery", "branch_id": BRANCH_ID,
        "items": [{"product_id": PRODUCT_ID, "product_name": "برغر كلاسيك", "quantity": qty, "price": 5000}],
        "payment_method": "cash", "delivery_app": app, "delivery_app_name": app_name,
        "delivery_company_order_id": ext, "offline_id": str(uuid.uuid4()),
        "customer_name": f"TEST_{app}_{uuid.uuid4().hex[:4]}", "customer_phone": "07700000000",
    }


class TestDeliveryDupPerCompany:
    EXT = f"TEST-T{RUN}"

    def test_toters_first_ok(self, client, created_orders):
        r = client.post(f"{BASE_URL}/api/orders", json=_payload("toters", "توترز", self.EXT), timeout=20)
        assert r.status_code == 200, r.text
        assert r.json()["delivery_company_order_id"] == self.EXT
        created_orders.append(r.json()["id"])

    def test_talabat_same_number_ok(self, client, created_orders):
        r = client.post(f"{BASE_URL}/api/orders", json=_payload("talabat", "طلبات", self.EXT, qty=2), timeout=20)
        assert r.status_code == 200, f"cross-company blocked: {r.status_code} {r.text}"
        created_orders.append(r.json()["id"])

    def test_toters_again_409(self, client, created_orders):
        r = client.post(f"{BASE_URL}/api/orders", json=_payload("toters", "توترز", self.EXT, qty=3), timeout=20)
        if r.status_code == 200:
            created_orders.append(r.json()["id"])
        assert r.status_code == 409, r.text
        assert r.json()["detail"]["code"] == "DUPLICATE_DELIVERY_ORDER"

    def test_persisted_get(self, client, created_orders):
        r = client.get(f"{BASE_URL}/api/orders/{created_orders[0]}", timeout=20)
        assert r.status_code == 200
        assert r.json().get("delivery_company_order_id") == self.EXT


# ---- Coupon prefix search (used by dine-in field) ----
class TestCouponPrefix:
    def test_prefix_search(self, client):
        r = client.get(f"{BASE_URL}/api/coupons/search-by-customer-prefix",
                       params={"prefix": "ز", "branch_id": BRANCH_ID}, timeout=20)
        assert r.status_code == 200
        assert isinstance(r.json()["coupons"], list)
        print("coupons:", [c.get("customer_name") or c.get("name") for c in r.json()["coupons"]])
