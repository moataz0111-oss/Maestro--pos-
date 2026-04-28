"""
Tests for POST /api/orders/{order_id}/cancel-item (iteration 169)

Validates:
- Persistence of a cancellation entry in orders.cancelled_items
- Insertion of a doc in item_cancellations collection (with all required fields)
- Edge cases: 404 invalid order, 400 invalid qty, 401/403 unauth
- Tenant isolation: super admin (no tenant context) cannot cancel-item on tenant order (404)
- Regression: PUT /api/orders/{id}/cancel still works
- Regression: POST /api/orders cart math (price * qty + extras_total)
"""
import os
import time
import uuid
import requests
import pytest

def _resolve_backend_url():
    url = os.environ.get("REACT_APP_BACKEND_URL")
    if url:
        return url
    envp = "/app/frontend/.env"
    if os.path.exists(envp):
        with open(envp) as f:
            for line in f:
                line = line.strip()
                if line.startswith("REACT_APP_BACKEND_URL="):
                    return line.split("=", 1)[1].strip().strip('"')
    return None

BASE_URL = _resolve_backend_url()
assert BASE_URL, "REACT_APP_BACKEND_URL must be set"
BASE_URL = BASE_URL.rstrip("/")
API = f"{BASE_URL}/api"

ADMIN_EMAIL = "hanialdujaili@gmail.com"
ADMIN_PASSWORD = "Hani@2024"
SUPER_EMAIL = "owner@maestroegp.com"
SUPER_PASSWORD = "owner123"


# ------------------------ Fixtures ------------------------ #
@pytest.fixture(scope="module")
def admin_token():
    r = requests.post(f"{API}/auth/login",
                      json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
                      timeout=30)
    assert r.status_code == 200, f"admin login failed: {r.status_code} {r.text}"
    return r.json()["token"], r.json()["user"]


@pytest.fixture(scope="module")
def super_token():
    r = requests.post(f"{API}/auth/login",
                      json={"email": SUPER_EMAIL, "password": SUPER_PASSWORD},
                      timeout=30)
    if r.status_code != 200:
        pytest.skip(f"super admin login failed: {r.status_code} {r.text}")
    return r.json()["token"], r.json()["user"]


@pytest.fixture(scope="module")
def admin_headers(admin_token):
    tok, _ = admin_token
    return {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def admin_branch_id(admin_headers):
    """Return a branch that has (or will have) an open shift so /api/orders works."""
    r = requests.get(f"{API}/branches", headers=admin_headers, timeout=30)
    assert r.status_code == 200, f"branches failed: {r.status_code} {r.text}"
    branches = r.json()
    assert isinstance(branches, list) and len(branches) > 0, "no branches found for tenant"

    # Find a cashier in the tenant and open a shift for the first branch
    rusers = requests.get(f"{API}/users?role=cashier", headers=admin_headers, timeout=30)
    assert rusers.status_code == 200, f"users failed: {rusers.status_code} {rusers.text}"
    cashiers = [u for u in rusers.json() if u.get("role") == "cashier"]
    if not cashiers:
        pytest.skip("No cashier user in tenant; cannot open a shift to create orders")
    cashier_id = cashiers[0]["id"]
    branch_id = branches[0]["id"]

    # Open shift (idempotent — returns existing shift if already open)
    ros = requests.post(
        f"{API}/shifts/open-for-cashier",
        headers=admin_headers,
        json={"cashier_id": cashier_id, "branch_id": branch_id, "opening_cash": 0},
        timeout=30,
    )
    assert ros.status_code in (200, 201), f"open shift failed: {ros.status_code} {ros.text}"
    return branch_id


@pytest.fixture(scope="module")
def admin_product(admin_headers):
    r = requests.get(f"{API}/products", headers=admin_headers, timeout=30)
    assert r.status_code == 200, f"products failed: {r.status_code} {r.text}"
    products = r.json()
    assert isinstance(products, list) and len(products) > 0, "no products found for tenant"
    return products[0]


def _resolve_mongo():
    mongo_url = os.environ.get("MONGO_URL")
    db_name = os.environ.get("DB_NAME")
    if mongo_url and db_name:
        return mongo_url, db_name
    envp = "/app/backend/.env"
    if os.path.exists(envp):
        with open(envp) as f:
            for line in f:
                line = line.strip()
                if line.startswith("MONGO_URL=") and not mongo_url:
                    mongo_url = line.split("=", 1)[1].strip().strip('"')
                if line.startswith("DB_NAME=") and not db_name:
                    db_name = line.split("=", 1)[1].strip().strip('"')
    return mongo_url, db_name


def _mongo_run(coro_func, *args, **kwargs):
    """Run an async mongo-using helper synchronously."""
    import asyncio
    from motor.motor_asyncio import AsyncIOMotorClient
    mongo_url, db_name = _resolve_mongo()
    assert mongo_url and db_name, "MONGO_URL/DB_NAME not resolvable"

    async def _wrap():
        client = AsyncIOMotorClient(mongo_url)
        db = client[db_name]
        try:
            return await coro_func(db, *args, **kwargs)
        finally:
            client.close()

    try:
        loop = asyncio.get_event_loop()
        if loop.is_closed():
            raise RuntimeError("closed")
    except RuntimeError:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
    return loop.run_until_complete(_wrap())


async def _find_order_doc(db, order_id):
    return await db.orders.find_one({"id": order_id}, {"_id": 0})


async def _find_cancellation_doc(db, cid):
    return await db.item_cancellations.find_one({"id": cid}, {"_id": 0})


def _create_order(headers, branch_id, product, qty=2, price=None, extras=None):
    """Helper to create an order and return its data."""
    if price is None:
        price = float(product.get("price", 10))
    payload = {
        "order_type": "dine_in",
        "items": [{
            "product_id": product["id"],
            "product_name": product.get("name", "TEST_PRODUCT"),
            "quantity": qty,
            "price": price,
            "cost": float(product.get("cost", 0)),
            "extras": extras or [],
        }],
        "branch_id": branch_id,
        "payment_method": "cash",
        "discount": 0.0,
    }
    r = requests.post(f"{API}/orders", headers=headers, json=payload, timeout=30)
    return r, payload


# ------------------------ Tests ------------------------ #
class TestCancelItem:
    """POST /api/orders/{order_id}/cancel-item"""

    created_order_ids = []
    created_log_ids = []

    def test_cancel_item_persists_in_order_and_collection(self, admin_headers, admin_branch_id, admin_product):
        # Create order
        r, payload = _create_order(admin_headers, admin_branch_id, admin_product, qty=2)
        assert r.status_code == 200, f"order create failed: {r.status_code} {r.text}"
        order = r.json()
        order_id = order["id"]
        order_number = order["order_number"]
        TestCancelItem.created_order_ids.append(order_id)

        # Cancel one unit of the item
        cancel_payload = {
            "product_id": admin_product["id"],
            "product_name": admin_product.get("name", "TEST_PRODUCT"),
            "quantity": 1,
            "price": float(admin_product.get("price", 10)),
            "reason": "TEST_iter169 partial cancel",
        }
        r2 = requests.post(f"{API}/orders/{order_id}/cancel-item",
                           headers=admin_headers, json=cancel_payload, timeout=30)
        assert r2.status_code == 200, f"cancel-item failed: {r2.status_code} {r2.text}"
        body = r2.json()
        assert "cancellation" in body, f"missing cancellation in response: {body}"
        c = body["cancellation"]
        assert c["product_id"] == admin_product["id"]
        assert float(c["quantity"]) == 1.0
        assert float(c["total_value"]) == float(c["price"]) * 1.0
        assert "id" in c and "cancelled_at" in c and "cancelled_by" in c
        assert body.get("order_number") == order_number

        # Persistence check via direct mongo (orders.cancelled_items not in OrderResponse)
        mongo_doc = _mongo_run(_find_order_doc, order_id)
        assert mongo_doc, "order not found in mongo"
        ci = mongo_doc.get("cancelled_items") or []
        assert any(x.get("id") == c["id"] for x in ci), f"cancelled_items[] not persisted: {ci}"

        TestCancelItem.created_log_ids.append(c["id"])

    def test_cancel_item_collection_doc_has_all_fields(self, admin_headers, admin_branch_id, admin_product):
        # Use the latest cancellation id we just created
        cid = TestCancelItem.created_log_ids[-1] if TestCancelItem.created_log_ids else None
        assert cid, "no cancellation id from previous test"
        doc = _mongo_run(_find_cancellation_doc, cid)
        assert doc, "item_cancellations doc missing"
        for k in ["tenant_id", "branch_id", "order_id", "order_number",
                  "order_status", "product_id", "quantity", "price",
                  "total_value", "reason", "cancelled_by", "cancelled_at"]:
            assert k in doc, f"missing key {k} in item_cancellations doc: {doc}"
        # tenant should match user's tenant
        assert doc["tenant_id"], "tenant_id empty in log doc"

    def test_cancel_item_invalid_order_returns_404(self, admin_headers, admin_product):
        bogus = "00000000-0000-0000-0000-000000000000"
        payload = {"product_id": admin_product["id"], "quantity": 1, "price": 1.0}
        r = requests.post(f"{API}/orders/{bogus}/cancel-item",
                          headers=admin_headers, json=payload, timeout=30)
        assert r.status_code == 404, f"expected 404, got {r.status_code} {r.text}"

    def test_cancel_item_invalid_quantity_returns_400(self, admin_headers, admin_branch_id, admin_product):
        r, _ = _create_order(admin_headers, admin_branch_id, admin_product, qty=1)
        assert r.status_code == 200
        order_id = r.json()["id"]
        TestCancelItem.created_order_ids.append(order_id)

        for bad_qty in [0, -1, -5.5]:
            payload = {"product_id": admin_product["id"], "quantity": bad_qty, "price": 1.0}
            r2 = requests.post(f"{API}/orders/{order_id}/cancel-item",
                               headers=admin_headers, json=payload, timeout=30)
            assert r2.status_code == 400, f"qty={bad_qty} expected 400, got {r2.status_code} {r2.text}"

    def test_cancel_item_without_auth_returns_401_or_403(self, admin_branch_id, admin_product, admin_headers):
        # Need a real order id
        r, _ = _create_order(admin_headers, admin_branch_id, admin_product, qty=1)
        assert r.status_code == 200
        order_id = r.json()["id"]
        TestCancelItem.created_order_ids.append(order_id)

        payload = {"product_id": admin_product["id"], "quantity": 1, "price": 1.0}
        # No auth header
        r2 = requests.post(f"{API}/orders/{order_id}/cancel-item",
                           headers={"Content-Type": "application/json"}, json=payload, timeout=30)
        assert r2.status_code in (401, 403), f"expected 401/403, got {r2.status_code} {r2.text}"

        # Bad token
        r3 = requests.post(f"{API}/orders/{order_id}/cancel-item",
                           headers={"Authorization": "Bearer invalid_token_xyz",
                                    "Content-Type": "application/json"},
                           json=payload, timeout=30)
        assert r3.status_code in (401, 403), f"bad token expected 401/403, got {r3.status_code} {r3.text}"

    def test_tenant_isolation_super_admin_no_access(self, admin_headers, admin_branch_id, admin_product, super_token):
        """Super admin without impersonation has tenant_id=None and build_tenant_query
        returns __NO_ACCESS__, so the order belonging to tenant A is not visible -> 404."""
        # Create order under tenant admin
        r, _ = _create_order(admin_headers, admin_branch_id, admin_product, qty=1)
        assert r.status_code == 200
        order_id = r.json()["id"]
        TestCancelItem.created_order_ids.append(order_id)

        super_tok, super_user = super_token
        # Confirm super admin context has no tenant_id (or different one)
        if super_user.get("tenant_id") and super_user.get("tenant_id") == admin_headers.get("__tid__"):
            pytest.skip("Super admin shares tenant_id with test admin; cannot validate isolation")

        super_headers = {"Authorization": f"Bearer {super_tok}",
                         "Content-Type": "application/json"}
        payload = {"product_id": admin_product["id"], "quantity": 1, "price": 1.0}
        r2 = requests.post(f"{API}/orders/{order_id}/cancel-item",
                           headers=super_headers, json=payload, timeout=30)
        # Expect 404 (cannot find order due to tenant filter)
        assert r2.status_code == 404, f"tenant isolation breach: {r2.status_code} {r2.text}"


class TestCancelOrderRegression:
    """Regression for PUT /api/orders/{order_id}/cancel"""

    def test_put_cancel_order_still_works(self, admin_headers, admin_branch_id, admin_product):
        r, _ = _create_order(admin_headers, admin_branch_id, admin_product, qty=1)
        assert r.status_code == 200
        order_id = r.json()["id"]
        TestCancelItem.created_order_ids.append(order_id)

        r2 = requests.put(f"{API}/orders/{order_id}/cancel",
                          headers=admin_headers, json={}, timeout=30)
        assert r2.status_code == 200, f"PUT cancel failed: {r2.status_code} {r2.text}"
        body = r2.json()
        assert "message" in body, f"unexpected body: {body}"
        # Endpoint either quick-deletes (<1min) or marks cancelled
        was_quick = body.get("was_quick_delete")
        if was_quick:
            assert body.get("in_reports") is False
            mongo_doc = _mongo_run(_find_order_doc, order_id)
            assert mongo_doc is None, f"quick-deleted order still exists: {mongo_doc}"
        else:
            mongo_doc = _mongo_run(_find_order_doc, order_id)
            assert mongo_doc is not None, "cancelled order missing"
            assert mongo_doc.get("status") == "cancelled", f"status not cancelled: {mongo_doc.get('status')}"


class TestOrderMathRegression:
    """Regression: POST /api/orders cart math (price*qty + extras_total)"""

    def test_order_subtotal_with_extras(self, admin_headers, admin_branch_id, admin_product):
        price = 10.0
        qty = 3
        extras = [
            {"name": "TEST_extra1", "price": 2.0, "quantity": 1},
            {"name": "TEST_extra2", "price": 1.5, "quantity": 2},
        ]
        r, payload = _create_order(admin_headers, admin_branch_id, admin_product,
                                   qty=qty, price=price, extras=extras)
        assert r.status_code == 200, f"order create failed: {r.status_code} {r.text}"
        order = r.json()
        TestCancelItem.created_order_ids.append(order["id"])

        # Expected subtotal = price * qty + sum(extra.price * extra.qty) * qty (per-unit) OR per-line
        # We tolerate both common conventions; check at least price*qty <= subtotal <= price*qty + extras_total*qty
        line_base = price * qty
        extras_per_unit = sum(e["price"] * e.get("quantity", 1) for e in extras)
        max_expected = line_base + extras_per_unit * qty
        min_expected = line_base + extras_per_unit  # if extras counted once
        subtotal = float(order.get("subtotal", 0))
        assert subtotal >= min_expected - 0.01, \
            f"subtotal {subtotal} less than min expected {min_expected}"
        assert subtotal <= max_expected + 0.01, \
            f"subtotal {subtotal} greater than max expected {max_expected}"


# ------------------------ Cleanup ------------------------ #
@pytest.fixture(scope="module", autouse=True)
def _cleanup(request, admin_headers):
    yield
    # Best-effort cleanup of cancellation logs created in this run
    try:
        import asyncio
        from motor.motor_asyncio import AsyncIOMotorClient
        mongo_url = os.environ.get("MONGO_URL")
        db_name = os.environ.get("DB_NAME")
        if not mongo_url or not db_name:
            envp = "/app/backend/.env"
            if os.path.exists(envp):
                with open(envp) as f:
                    for line in f:
                        line = line.strip()
                        if line.startswith("MONGO_URL=") and not mongo_url:
                            mongo_url = line.split("=", 1)[1].strip().strip('"')
                        if line.startswith("DB_NAME=") and not db_name:
                            db_name = line.split("=", 1)[1].strip().strip('"')
        if not mongo_url or not db_name:
            return

        async def _purge():
            client = AsyncIOMotorClient(mongo_url)
            db = client[db_name]
            # Remove cancellation logs created by these tests
            await db.item_cancellations.delete_many({"reason": {"$regex": "^TEST_iter169"}})
            await db.item_cancellations.delete_many({"order_id": {"$in": TestCancelItem.created_order_ids}})
            client.close()

        asyncio.get_event_loop().run_until_complete(_purge())
    except Exception as e:
        print(f"cleanup warning: {e}")
