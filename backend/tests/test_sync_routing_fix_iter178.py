"""
iter178 — Offline sync order routing preservation + fix-routing endpoint
Validates:
  1. POST /api/sync/orders preserves ALL routing/payment fields
     (order_type, payment_method, payment_status, customer_type,
      delivery_company_* , driver_id, driver_name, delivery_fee).
  2. Auto-inference:
     - No payment_status but delivery_company_* → 'unpaid' + customer_type='delivery_company'.
     - payment_method='cash' & paid_amount >= total → 'paid' + customer_type='regular'.
  3. PATCH /api/sync/orders/{id}/fix-routing:
     - Admin only (403 for non-admin/non-manager).
     - 404 for missing order, 400 for empty body.
     - Preserves order_number. Appends (not overwrites) routing_fix_history.
  4. Regression: POST /api/orders still works after changes.
"""
import os
import uuid
import pytest
import requests
from pymongo import MongoClient

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
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


# ---------- fixtures ----------

@pytest.fixture(scope="session")
def mongo_db():
    return MongoClient(MONGO_URL)[DB_NAME]


@pytest.fixture(scope="session")
def auth_token():
    r = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
        timeout=30,
    )
    assert r.status_code == 200, f"Login failed: {r.status_code} {r.text[:300]}"
    data = r.json()
    tok = data.get("token") or data.get("access_token")
    assert tok, f"No token in response: {data}"
    return tok


@pytest.fixture(scope="session")
def auth_headers(auth_token):
    return {"Authorization": f"Bearer {auth_token}", "Content-Type": "application/json"}


@pytest.fixture(scope="session")
def current_user(auth_headers):
    r = requests.get(f"{BASE_URL}/api/auth/me", headers=auth_headers, timeout=30)
    assert r.status_code == 200, r.text
    return r.json()


@pytest.fixture(scope="session")
def branch_id(mongo_db, current_user):
    tenant_id = current_user.get("tenant_id")
    br = mongo_db.branches.find_one({"tenant_id": tenant_id}, {"_id": 0, "id": 1}) \
        or mongo_db.branches.find_one({}, {"_id": 0, "id": 1})
    assert br and br.get("id"), "No branch available"
    return br["id"]


@pytest.fixture(scope="session")
def test_product(mongo_db, current_user):
    tenant_id = current_user.get("tenant_id")
    p = mongo_db.products.find_one({"tenant_id": tenant_id}, {"_id": 0, "id": 1, "name": 1, "price": 1}) \
        or mongo_db.products.find_one({}, {"_id": 0, "id": 1, "name": 1, "price": 1})
    assert p, "No product in DB"
    return p


def _items(p, qty=1):
    price = float(p.get("price") or 1000)
    return [{
        "product_id": p["id"],
        "product_name": p.get("name") or "Test",
        "quantity": qty,
        "price": price,
        "total": price * qty,
    }], price * qty


# Track created order ids for teardown
_CREATED_IDS: list[str] = []


def teardown_module(module):
    try:
        db = MongoClient(MONGO_URL)[DB_NAME]
        if _CREATED_IDS:
            db.orders.delete_many({"id": {"$in": _CREATED_IDS}})
    except Exception as e:
        print(f"teardown cleanup error: {e}")


# ---------- Sync preservation tests ----------

class TestSyncPreserveDeliveryCompanyFields:
    def test_full_delivery_company_payload_preserved(
        self, auth_headers, mongo_db, branch_id, test_product
    ):
        items, total = _items(test_product)
        body = {
            "offline_id": f"TEST_iter178_dc_{uuid.uuid4().hex[:8]}",
            "items": items,
            "subtotal": total,
            "total": total + 2000,  # + delivery fee
            "delivery_fee": 2000,
            "order_type": "delivery",
            "payment_method": "delivery_company",
            "payment_status": "unpaid",
            "customer_type": "delivery_company",
            "delivery_company_id": "dc-test-001",
            "delivery_company_name": "طلباتي",
            "delivery_company_order_id": "ABC123",
            "delivery_address": "Baghdad - Karrada",
            "customer_name": "TEST_iter178_dc_customer",
            "customer_phone": "+9647700000000",
            "branch_id": branch_id,
        }
        r = requests.post(f"{BASE_URL}/api/sync/orders", json=body, headers=auth_headers, timeout=30)
        assert r.status_code == 200, f"sync failed: {r.status_code} {r.text[:400]}"
        res = r.json()
        assert res.get("success") is True
        oid = res["id"]
        _CREATED_IDS.append(oid)

        doc = mongo_db.orders.find_one({"id": oid}, {"_id": 0})
        assert doc is not None, "order not persisted"
        # Verify ALL routing fields preserved
        assert doc["order_type"] == "delivery"
        assert doc["payment_method"] == "delivery_company"
        assert doc["payment_status"] == "unpaid"
        assert doc["customer_type"] == "delivery_company"
        assert doc["delivery_company_id"] == "dc-test-001"
        assert doc["delivery_company_name"] == "طلباتي"
        assert doc["delivery_company_order_id"] == "ABC123"
        assert float(doc["delivery_fee"]) == 2000.0
        assert doc["delivery_address"] == "Baghdad - Karrada"
        assert doc["customer_name"] == "TEST_iter178_dc_customer"
        assert doc["customer_phone"] == "+9647700000000"
        assert doc.get("is_offline_order") is True
        assert isinstance(doc.get("order_number"), int) and doc["order_number"] > 0

    def test_autoinfer_unpaid_and_delivery_company_customer_type(
        self, auth_headers, mongo_db, branch_id, test_product
    ):
        items, total = _items(test_product)
        body = {
            "offline_id": f"TEST_iter178_inferdc_{uuid.uuid4().hex[:8]}",
            "items": items,
            "subtotal": total,
            "total": total,
            "order_type": "delivery",
            "delivery_company_id": "dc-infer-999",
            "delivery_company_name": "طلبات",
            # payment_method omitted, payment_status omitted, customer_type omitted
            "branch_id": branch_id,
            "customer_name": "TEST_iter178_infer_dc",
        }
        r = requests.post(f"{BASE_URL}/api/sync/orders", json=body, headers=auth_headers, timeout=30)
        assert r.status_code == 200, r.text[:400]
        oid = r.json()["id"]
        _CREATED_IDS.append(oid)
        doc = mongo_db.orders.find_one({"id": oid}, {"_id": 0})
        assert doc["payment_status"] == "unpaid", f"got {doc.get('payment_status')}"
        assert doc["customer_type"] == "delivery_company"
        assert doc["delivery_company_id"] == "dc-infer-999"

    def test_autoinfer_paid_and_regular_customer(
        self, auth_headers, mongo_db, branch_id, test_product
    ):
        items, total = _items(test_product)
        body = {
            "offline_id": f"TEST_iter178_cashpaid_{uuid.uuid4().hex[:8]}",
            "items": items,
            "subtotal": total,
            "total": total,
            "paid_amount": total,
            "payment_method": "cash",
            # no payment_status / customer_type → should infer paid + regular
            "order_type": "takeaway",
            "branch_id": branch_id,
            "customer_name": "TEST_iter178_cash_paid",
        }
        r = requests.post(f"{BASE_URL}/api/sync/orders", json=body, headers=auth_headers, timeout=30)
        assert r.status_code == 200, r.text[:400]
        oid = r.json()["id"]
        _CREATED_IDS.append(oid)
        doc = mongo_db.orders.find_one({"id": oid}, {"_id": 0})
        assert doc["payment_status"] == "paid"
        assert doc["customer_type"] == "regular"
        assert doc["payment_method"] == "cash"

    def test_driver_fields_preserved(
        self, auth_headers, mongo_db, branch_id, test_product
    ):
        items, total = _items(test_product)
        body = {
            "offline_id": f"TEST_iter178_driver_{uuid.uuid4().hex[:8]}",
            "items": items,
            "subtotal": total,
            "total": total,
            "order_type": "delivery",
            "payment_method": "cash",
            "driver_id": "drv-xyz-1",
            "driver_name": "Ahmed Driver TEST",
            "branch_id": branch_id,
            "customer_name": "TEST_iter178_driver_customer",
        }
        r = requests.post(f"{BASE_URL}/api/sync/orders", json=body, headers=auth_headers, timeout=30)
        assert r.status_code == 200, r.text[:400]
        oid = r.json()["id"]
        _CREATED_IDS.append(oid)
        doc = mongo_db.orders.find_one({"id": oid}, {"_id": 0})
        assert doc["driver_id"] == "drv-xyz-1"
        assert doc["driver_name"] == "Ahmed Driver TEST"
        assert doc["order_type"] == "delivery"


# ---------- Fix-routing endpoint tests ----------

@pytest.fixture(scope="class")
def wrongly_routed_order(auth_headers, branch_id, test_product):
    """Create a sync order that simulates WRONG routing (dine_in/cash when it
    should have been delivery_company). We'll fix it via PATCH."""
    items, total = _items(test_product)
    body = {
        "offline_id": f"TEST_iter178_wrong_{uuid.uuid4().hex[:8]}",
        "items": items,
        "subtotal": total,
        "total": total,
        "order_type": "dine_in",
        "payment_method": "cash",
        "payment_status": "paid",
        "paid_amount": total,
        "customer_type": "regular",
        "branch_id": branch_id,
        "customer_name": "TEST_iter178_wrong_customer",
    }
    r = requests.post(f"{BASE_URL}/api/sync/orders", json=body, headers=auth_headers, timeout=30)
    assert r.status_code == 200, r.text[:400]
    oid = r.json()["id"]
    _CREATED_IDS.append(oid)
    return {"id": oid, "order_number": r.json().get("order_number")}


class TestFixRoutingEndpoint:
    def test_404_for_missing_order(self, auth_headers):
        r = requests.patch(
            f"{BASE_URL}/api/sync/orders/does-not-exist-xyz/fix-routing",
            json={"order_type": "delivery"},
            headers=auth_headers,
            timeout=30,
        )
        assert r.status_code == 404, f"expected 404 got {r.status_code} {r.text[:200]}"

    def test_400_on_empty_body(self, auth_headers, wrongly_routed_order):
        r = requests.patch(
            f"{BASE_URL}/api/sync/orders/{wrongly_routed_order['id']}/fix-routing",
            json={},
            headers=auth_headers,
            timeout=30,
        )
        assert r.status_code == 400, f"expected 400 got {r.status_code} {r.text[:200]}"

    def test_admin_can_fix_and_order_number_preserved(
        self, auth_headers, mongo_db, wrongly_routed_order
    ):
        oid = wrongly_routed_order["id"]
        orig_num = wrongly_routed_order["order_number"]
        before = mongo_db.orders.find_one({"id": oid}, {"_id": 0})
        assert before["order_type"] == "dine_in"
        assert before["payment_method"] == "cash"

        fix_payload = {
            "order_type": "delivery",
            "payment_method": "delivery_company",
            "payment_status": "unpaid",
            "customer_type": "delivery_company",
            "delivery_company_id": "dc-fixed-001",
            "delivery_company_name": "طلباتي",
            "delivery_company_order_id": "FIX-ABC-1",
            "delivery_fee": 1500,
        }
        r = requests.patch(
            f"{BASE_URL}/api/sync/orders/{oid}/fix-routing",
            json=fix_payload,
            headers=auth_headers,
            timeout=30,
        )
        assert r.status_code == 200, f"{r.status_code} {r.text[:400]}"
        res = r.json()
        assert res.get("success") is True
        assert res.get("order_number") == orig_num

        after = mongo_db.orders.find_one({"id": oid}, {"_id": 0})
        # order_number preserved
        assert after["order_number"] == orig_num
        # new values applied
        assert after["order_type"] == "delivery"
        assert after["payment_method"] == "delivery_company"
        assert after["payment_status"] == "unpaid"
        assert after["customer_type"] == "delivery_company"
        assert after["delivery_company_id"] == "dc-fixed-001"
        assert after["delivery_company_name"] == "طلباتي"
        assert after["delivery_company_order_id"] == "FIX-ABC-1"
        assert float(after["delivery_fee"]) == 1500.0
        # audit fields populated
        assert after.get("routing_fixed_at")
        assert after.get("routing_fixed_by")
        # history captured OLD values
        hist = after.get("routing_fix_history") or []
        assert len(hist) >= 1
        last = hist[-1]
        assert last["old_values"].get("order_type") == "dine_in"
        assert last["old_values"].get("payment_method") == "cash"
        assert last["old_values"].get("customer_type") == "regular"
        # new_values snapshot
        assert last["new_values"].get("order_type") == "delivery"
        assert last["new_values"].get("payment_method") == "delivery_company"

    def test_routing_fix_history_accumulates(
        self, auth_headers, mongo_db, wrongly_routed_order
    ):
        oid = wrongly_routed_order["id"]
        # Apply a second fix (switch company). history length should grow.
        before = mongo_db.orders.find_one({"id": oid}, {"_id": 0})
        before_len = len(before.get("routing_fix_history") or [])

        r = requests.patch(
            f"{BASE_URL}/api/sync/orders/{oid}/fix-routing",
            json={"delivery_company_name": "طلبات", "delivery_company_order_id": "FIX-ABC-2"},
            headers=auth_headers,
            timeout=30,
        )
        assert r.status_code == 200, r.text[:300]
        after = mongo_db.orders.find_one({"id": oid}, {"_id": 0})
        hist = after.get("routing_fix_history") or []
        assert len(hist) == before_len + 1, \
            f"history should accumulate, before={before_len} after={len(hist)}"
        # latest entry old_values reflect what was there BEFORE this second edit
        last = hist[-1]
        assert last["old_values"].get("delivery_company_name") == "طلباتي"
        assert last["new_values"].get("delivery_company_name") == "طلبات"
        # final state applied
        assert after["delivery_company_name"] == "طلبات"
        assert after["delivery_company_order_id"] == "FIX-ABC-2"


class TestFixRoutingAuth:
    @pytest.fixture(scope="class")
    def cashier_token(self, mongo_db, auth_headers, current_user):
        """Create a cashier-role user in the same tenant and return their token.
        If creation fails, skip the test."""
        tenant_id = current_user.get("tenant_id")
        suffix = uuid.uuid4().hex[:6]
        email = f"test_iter178_cashier_{suffix}@test.local"
        password = "Cashier@123"
        payload = {
            "email": email,
            "password": password,
            "full_name": f"TEST iter178 Cashier {suffix}",
            "role": "cashier",
            "tenant_id": tenant_id,
        }
        created_user_id = None
        # Try typical admin-create-user endpoint
        for url in [f"{BASE_URL}/api/users", f"{BASE_URL}/api/auth/register"]:
            r = requests.post(url, json=payload, headers=auth_headers, timeout=30)
            if r.status_code in (200, 201):
                try:
                    data = r.json()
                    created_user_id = data.get("id") or (data.get("user") or {}).get("id")
                except Exception:
                    pass
                break
        if not created_user_id:
            # Insert directly for test — mimics a real cashier
            import bcrypt
            hashed = bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()
            created_user_id = str(uuid.uuid4())
            mongo_db.users.insert_one({
                "id": created_user_id,
                "email": email,
                "username": email,
                "password_hash": hashed,
                "password": hashed,
                "full_name": f"TEST iter178 Cashier {suffix}",
                "name": f"TEST iter178 Cashier {suffix}",
                "role": "cashier",
                "tenant_id": tenant_id,
                "is_active": True,
            })

        # Login as cashier
        tok = None
        r = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": email, "password": password},
            timeout=30,
        )
        if r.status_code == 200:
            d = r.json()
            tok = d.get("token") or d.get("access_token")

        yield {"token": tok, "user_id": created_user_id, "email": email}

        # teardown
        try:
            mongo_db.users.delete_one({"id": created_user_id})
        except Exception:
            pass

    def test_non_admin_gets_403(self, cashier_token, wrongly_routed_order):
        if not cashier_token.get("token"):
            pytest.skip("Could not provision cashier test user")
        headers = {
            "Authorization": f"Bearer {cashier_token['token']}",
            "Content-Type": "application/json",
        }
        r = requests.patch(
            f"{BASE_URL}/api/sync/orders/{wrongly_routed_order['id']}/fix-routing",
            json={"order_type": "delivery"},
            headers=headers,
            timeout=30,
        )
        assert r.status_code == 403, f"expected 403 for cashier, got {r.status_code} {r.text[:200]}"


# ---------- Regression: online /api/orders still works ----------

class TestOnlineRegression:
    @pytest.fixture(scope="class")
    def open_shift(self, auth_headers, branch_id, mongo_db):
        r = requests.post(
            f"{BASE_URL}/api/shifts/open",
            json={"branch_id": branch_id, "opening_cash": 0},
            headers=auth_headers,
            timeout=30,
        )
        # 200 if opened; if already open, any 4xx — we proceed anyway
        shift = {}
        if r.status_code == 200:
            shift = r.json().get("shift") or {}
        yield shift
        if shift.get("id"):
            try:
                mongo_db.shifts.update_one(
                    {"id": shift["id"]},
                    {"$set": {"status": "closed", "ended_at": "2099-01-01T00:00:00Z"}},
                )
            except Exception:
                pass

    def test_online_order_create_succeeds(self, auth_headers, branch_id, test_product, open_shift):
        items, total = _items(test_product)
        body = {
            "branch_id": branch_id,
            "items": items,
            "subtotal": total,
            "total": total,
            "order_type": "takeaway",
            "payment_method": "cash",
            "customer_name": f"TEST_iter178_online_{uuid.uuid4().hex[:6]}",
        }
        r = requests.post(f"{BASE_URL}/api/orders", json=body, headers=auth_headers, timeout=30)
        assert r.status_code in (200, 201), f"online order create failed: {r.status_code} {r.text[:300]}"
        data = r.json()
        assert isinstance(data.get("order_number"), int) and data["order_number"] > 0
        oid = data.get("id") or data.get("order_id")
        if oid:
            _CREATED_IDS.append(oid)
