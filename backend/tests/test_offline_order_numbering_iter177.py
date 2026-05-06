"""
iter177 — Offline sync order numbering fix verification
Validates:
  1. Migration `renumber_offline_orders_chronologically_v2` flagged 27 orders with
     `renumbered_reason='fix_offline_sync_drift_v2'` and both `order_number` +
     `original_order_number` populated.
  2. For the target branch+business_date, orders sorted by created_at form a
     continuous 1..N sequence with no gaps or duplicates.
  3. E2E: 5 online POSTs /api/orders + 1 POST /api/sync/orders → sync order gets
     the next sequential number (not a low counter value).
  4. Regression: online POST /api/orders still works.
"""
import os
import uuid
import pytest
import requests
from pymongo import MongoClient

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
# Fallback to read frontend/.env if env var not exported in test process
if not BASE_URL:
    with open("/app/frontend/.env") as f:
        for line in f:
            if line.startswith("REACT_APP_BACKEND_URL="):
                BASE_URL = line.split("=", 1)[1].strip().rstrip("/")
                break

MONGO_URL = os.environ.get("MONGO_URL") or "mongodb://localhost:27017"
DB_NAME = os.environ.get("DB_NAME") or "maestro_pos"

ADMIN_EMAIL = "hanialdujaili@gmail.com"
ADMIN_PASSWORD = "Hani@2024"

TARGET_BRANCH_ID = "72a06c41-5454-4383-99a5-ac13adb96336"
TARGET_BUSINESS_DATE = "2026-04-28"
TARGET_TENANT_ID = "47b57008-b561-41ab-b3b0-6f30a513f633"


# ---------- fixtures ----------

@pytest.fixture(scope="session")
def mongo_db():
    client = MongoClient(MONGO_URL)
    return client[DB_NAME]


@pytest.fixture(scope="session")
def auth_token():
    resp = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
        timeout=30,
    )
    assert resp.status_code == 200, f"Login failed: {resp.status_code} {resp.text}"
    data = resp.json()
    token = data.get("token") or data.get("access_token")
    assert token, f"No token in login response: {data}"
    return token


@pytest.fixture(scope="session")
def auth_headers(auth_token):
    return {"Authorization": f"Bearer {auth_token}", "Content-Type": "application/json"}


@pytest.fixture(scope="session")
def current_user(auth_headers):
    resp = requests.get(f"{BASE_URL}/api/auth/me", headers=auth_headers, timeout=30)
    assert resp.status_code == 200, resp.text
    return resp.json()


# ---------- Migration data assertions ----------

class TestRenumberMigration:
    def test_migration_record_exists(self, mongo_db):
        rec = mongo_db.system_migrations.find_one(
            {"key": "renumber_offline_orders_chronologically_v2"}
        )
        assert rec is not None, "Migration record not found in system_migrations"
        assert rec.get("renumbered_orders", 0) >= 1

    def test_renumbered_orders_count_and_fields(self, mongo_db):
        cur = mongo_db.orders.find({"renumbered_reason": "fix_offline_sync_drift_v2"})
        docs = list(cur)
        assert len(docs) == 27, f"Expected 27 renumbered docs, got {len(docs)}"
        for d in docs:
            assert "order_number" in d and d["order_number"] is not None
            assert "original_order_number" in d and d["original_order_number"] is not None
            assert d.get("renumbered_at")

    def test_renumbered_orders_sequence_continuous(self, mongo_db):
        cur = mongo_db.orders.find(
            {"branch_id": TARGET_BRANCH_ID, "business_date": TARGET_BUSINESS_DATE},
            {"_id": 0, "id": 1, "order_number": 1, "created_at": 1},
        ).sort("created_at", 1)
        orders = list(cur)
        assert len(orders) > 0, "No orders found for target branch+business_date"
        numbers = [o["order_number"] for o in orders]
        # Continuous 1..N
        expected = list(range(1, len(orders) + 1))
        assert numbers == expected, (
            f"Order numbers not continuous 1..N after renumber."
            f"\n  expected={expected[:10]}...\n  got     ={numbers[:10]}..."
            f"\n  total orders={len(orders)}"
        )
        # No duplicates
        assert len(set(numbers)) == len(numbers), "Duplicate order_numbers detected"


# ---------- E2E: online + sync order numbering ----------

@pytest.fixture(scope="class")
def open_shift(auth_headers, mongo_db, current_user):
    """Ensure an open shift exists for the test session; close at end."""
    tenant_id = current_user.get("tenant_id") or TARGET_TENANT_ID
    user_id = current_user.get("id")
    # Pick any branch in this tenant
    branch = mongo_db.branches.find_one({"tenant_id": tenant_id}, {"_id": 0, "id": 1})
    if not branch:
        branch = mongo_db.branches.find_one({}, {"_id": 0, "id": 1})
    branch_id = branch["id"] if branch else None
    assert branch_id, "No branch available for testing"

    r = requests.post(
        f"{BASE_URL}/api/shifts/open",
        json={"branch_id": branch_id, "opening_cash": 0},
        headers=auth_headers,
        timeout=30,
    )
    assert r.status_code == 200, f"Open shift failed: {r.status_code} {r.text[:300]}"
    shift = r.json().get("shift") or {}
    yield {"branch_id": branch_id, "shift_id": shift.get("id"), "user_id": user_id}
    # cleanup: close shift via direct DB mark to avoid side-effects
    if shift.get("id"):
        try:
            mongo_db.shifts.update_one(
                {"id": shift["id"]},
                {"$set": {"status": "closed", "ended_at": "2099-01-01T00:00:00Z"}},
            )
        except Exception:
            pass


@pytest.fixture
def test_product(mongo_db, current_user):
    tenant_id = current_user.get("tenant_id") or TARGET_TENANT_ID
    prod = mongo_db.products.find_one(
        {"tenant_id": tenant_id},
        {"_id": 0, "id": 1, "name": 1, "price": 1},
    )
    if not prod:
        prod = mongo_db.products.find_one({}, {"_id": 0, "id": 1, "name": 1, "price": 1})
    assert prod, "No product found in database for test order creation"
    return prod


class TestE2EOrderSequence:
    """Create 5 online + 1 sync order, verify the sync order number = online+1."""

    def _build_order_body(self, product, branch_id):
        return {
            "branch_id": branch_id,
            "items": [
                {
                    "product_id": product["id"],
                    "product_name": product.get("name", "Test"),
                    "quantity": 1,
                    "price": float(product.get("price") or 1000),
                    "total": float(product.get("price") or 1000),
                }
            ],
            "subtotal": float(product.get("price") or 1000),
            "total": float(product.get("price") or 1000),
            "order_type": "takeaway",
            "payment_method": "cash",
            "customer_name": f"TEST_iter177_{uuid.uuid4().hex[:6]}",
        }

    def test_online_plus_sync_get_sequential_numbers(
        self, auth_headers, current_user, test_product, mongo_db, open_shift
    ):
        branch_id = open_shift["branch_id"]

        created_numbers = []
        for i in range(5):
            body = self._build_order_body(test_product, branch_id)
            body["customer_name"] = f"TEST_iter177_online_{i}_{uuid.uuid4().hex[:6]}"
            r = requests.post(
                f"{BASE_URL}/api/orders", json=body, headers=auth_headers, timeout=30
            )
            assert r.status_code in (200, 201), f"Online order create failed: {r.status_code} {r.text[:300]}"
            data = r.json()
            num = data.get("order_number")
            assert isinstance(num, int) and num > 0, f"bad order_number in response: {data}"
            created_numbers.append(num)

        # Online numbers should be strictly increasing (gap of 1 typically)
        assert created_numbers == sorted(created_numbers), \
            f"Online numbers not monotonic: {created_numbers}"
        last_online = created_numbers[-1]

        # Now create 1 sync (offline) order
        sync_body = {
            "offline_id": f"TEST_iter177_offline_{uuid.uuid4().hex[:8]}",
            "items": [
                {
                    "product_id": test_product["id"],
                    "product_name": test_product.get("name", "Test"),
                    "quantity": 1,
                    "price": float(test_product.get("price") or 1000),
                    "total": float(test_product.get("price") or 1000),
                }
            ],
            "subtotal": float(test_product.get("price") or 1000),
            "total": float(test_product.get("price") or 1000),
            "order_type": "takeaway",
            "payment_method": "cash",
            "branch_id": branch_id,
            "customer_name": "TEST_iter177_offline_sync",
        }
        r2 = requests.post(
            f"{BASE_URL}/api/sync/orders",
            json=sync_body,
            headers=auth_headers,
            timeout=30,
        )
        assert r2.status_code == 200, f"Sync order failed: {r2.status_code} {r2.text[:400]}"
        res = r2.json()
        assert res.get("success") is True, res
        sync_num = res.get("order_number")
        assert isinstance(sync_num, int) and sync_num > 0, res

        # The CRITICAL assertion: sync order MUST receive the next sequential
        # number after the online orders (proof that both flows now share the
        # same daily counter for this branch).
        # Pre-fix bug: sync would get #1, #2, #3 (legacy global counter starting
        # from 1) while online was at #44+ — completely out of sequence.
        # Post-fix: sync should get exactly last_online + 1.
        assert sync_num == last_online + 1, (
            f"Sync order number {sync_num} is NOT immediately after the last "
            f"online number {last_online}. Expected {last_online + 1}. "
            f"This indicates offline counter is not aligned with online "
            f"daily branch sequence."
        )

    def test_sync_order_idempotent_on_same_offline_id(
        self, auth_headers, current_user, test_product, open_shift
    ):
        branch_id = open_shift["branch_id"]
        offline_id = f"TEST_iter177_idem_{uuid.uuid4().hex[:8]}"
        body = {
            "offline_id": offline_id,
            "items": [
                {
                    "product_id": test_product["id"],
                    "product_name": test_product.get("name", "Test"),
                    "quantity": 1,
                    "price": 1000,
                    "total": 1000,
                }
            ],
            "subtotal": 1000,
            "total": 1000,
            "order_type": "takeaway",
            "payment_method": "cash",
            "branch_id": branch_id,
            "customer_name": "TEST_iter177_idem",
        }
        r1 = requests.post(f"{BASE_URL}/api/sync/orders", json=body, headers=auth_headers, timeout=30)
        r2 = requests.post(f"{BASE_URL}/api/sync/orders", json=body, headers=auth_headers, timeout=30)
        assert r1.status_code == 200 and r2.status_code == 200
        d1, d2 = r1.json(), r2.json()
        assert d1.get("order_number") == d2.get("order_number"), \
            f"Sync not idempotent: first={d1}, second={d2}"


# ---------- cleanup ----------

def teardown_module(module):
    """Clean up any TEST_iter177_* orders created during the run."""
    try:
        client = MongoClient(MONGO_URL)
        db = client[DB_NAME]
        db.orders.delete_many({"customer_name": {"$regex": "^TEST_iter177_"}})
    except Exception as e:
        print(f"cleanup warning: {e}")
