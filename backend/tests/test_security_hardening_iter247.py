"""
iter247 — Penetration-test mitigation verification

Validates:
  - /api/auth/register requires admin/super_admin token (no anonymous registration).
  - Authenticated admin can NOT create role=super_admin / role=admin (cashier OK).
  - PUT /api/users/{id} cannot escalate role to super_admin.
  - /api/auth/login enforces secret_key for super_admin owner account.
  - Previously-unauth inventory_system GET endpoints now require auth (401/403 anon, 200 with admin).
  - /api/callcenter/webhook rejects without X-Webhook-Secret.
  - /api/init-db rejects without ?key=, /api/seed rejects without super_admin token.
  - Public /api/customer/menu/default leaks NO cost/profit/recipe/supplier fields.
  - Regression: admin can still list /api/products, /api/categories, /api/orders.
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

# Inventory_system router endpoints (router-level auth dependency)
INVENTORY_GETS = [
    "/api/purchases-new",
    "/api/inventory-stats",
    "/api/manufactured-products",
    "/api/manufacturing-inventory",
    "/api/manufacturing-requests",
    "/api/warehouse-transfers",
    "/api/inventory-settings",
    "/api/warehouse-notifications",
    "/api/purchase-requests",
    "/api/warehouse-transactions",
    "/api/branch-orders-new",
]

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


@pytest.fixture(scope="module")
def owner_token(session):
    r = session.post(f"{BASE_URL}/api/auth/login",
                     json={"email": OWNER_EMAIL, "password": OWNER_PASSWORD,
                           "secret_key": OWNER_SECRET})
    if r.status_code != 200:
        pytest.skip(f"owner login failed: {r.status_code} {r.text}")
    return r.json().get("token") or r.json().get("access_token")


def _h(tok):
    return {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}


# ---------- 1. /auth/register hardening ----------

class TestRegisterEndpoint:
    def test_register_anonymous_rejected(self, session):
        r = session.post(f"{BASE_URL}/api/auth/register", json={
            "username": f"TEST_anon_{uuid.uuid4().hex[:6]}",
            "email": f"TEST_anon_{uuid.uuid4().hex[:6]}@x.com",
            "password": "Pwd12345!",
            "full_name": "Anon Hacker",
            "role": "super_admin",
        })
        assert r.status_code in (401, 403), f"expected 401/403, got {r.status_code} {r.text}"

    def test_admin_can_create_cashier(self, session, admin_token):
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
        assert r.status_code == 200, f"admin->cashier failed: {r.status_code} {r.text}"
        data = r.json().get("user") or r.json()
        assert data.get("role") == "cashier"

    def test_admin_cannot_create_super_admin(self, session, admin_token):
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
        assert r.status_code == 403, f"expected 403, got {r.status_code} {r.text}"

    def test_admin_cannot_create_admin(self, session, admin_token):
        uniq = uuid.uuid4().hex[:6]
        r = session.post(f"{BASE_URL}/api/auth/register",
                         headers=_h(admin_token),
                         json={
                             "username": f"TEST_admin_{uniq}",
                             "email": f"TEST_admin_{uniq}@x.com",
                             "password": "Pwd12345!",
                             "full_name": "Bad Admin",
                             "role": "admin",
                         })
        assert r.status_code == 403, f"expected 403, got {r.status_code} {r.text}"


# ---------- 2. /auth/login secret_key ----------

class TestLoginSecretKey:
    def test_super_admin_without_secret_rejected(self, session):
        r = session.post(f"{BASE_URL}/api/auth/login",
                         json={"email": OWNER_EMAIL, "password": OWNER_PASSWORD})
        assert r.status_code == 403, f"expected 403, got {r.status_code} {r.text}"

    def test_super_admin_with_secret_ok(self, session):
        r = session.post(f"{BASE_URL}/api/auth/login",
                         json={"email": OWNER_EMAIL,
                               "password": OWNER_PASSWORD,
                               "secret_key": OWNER_SECRET})
        assert r.status_code == 200, f"expected 200, got {r.status_code} {r.text}"
        assert (r.json().get("token") or r.json().get("access_token"))

    def test_normal_admin_login_no_secret(self, session):
        r = session.post(f"{BASE_URL}/api/auth/login",
                         json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
        assert r.status_code == 200, f"expected 200, got {r.status_code} {r.text}"


# ---------- 3. POST/PUT /users role guard ----------

class TestUsersCRUDRoleGuard:
    def test_create_user_super_admin_blocked(self, session, admin_token):
        uniq = uuid.uuid4().hex[:6]
        r = session.post(f"{BASE_URL}/api/users",
                         headers=_h(admin_token),
                         json={
                             "username": f"TEST_u_sa_{uniq}",
                             "email": f"TEST_u_sa_{uniq}@x.com",
                             "password": "Pwd12345!",
                             "full_name": "X",
                             "role": "super_admin",
                         })
        assert r.status_code == 403, f"expected 403, got {r.status_code} {r.text}"

    def test_create_user_admin_blocked(self, session, admin_token):
        uniq = uuid.uuid4().hex[:6]
        r = session.post(f"{BASE_URL}/api/users",
                         headers=_h(admin_token),
                         json={
                             "username": f"TEST_u_ad_{uniq}",
                             "email": f"TEST_u_ad_{uniq}@x.com",
                             "password": "Pwd12345!",
                             "full_name": "X",
                             "role": "admin",
                         })
        assert r.status_code == 403, f"expected 403, got {r.status_code} {r.text}"

    def test_create_user_cashier_ok_then_block_role_escalation(self, session, admin_token):
        uniq = uuid.uuid4().hex[:6]
        r = session.post(f"{BASE_URL}/api/users",
                         headers=_h(admin_token),
                         json={
                             "username": f"TEST_u_c_{uniq}",
                             "email": f"TEST_u_c_{uniq}@x.com",
                             "password": "Pwd12345!",
                             "full_name": "Cashier U",
                             "role": "cashier",
                         })
        assert r.status_code == 200, f"create cashier failed: {r.status_code} {r.text}"
        data = r.json().get("user") or r.json()
        uid = data.get("id")
        assert uid

        # try to escalate to super_admin via PUT
        r2 = session.put(f"{BASE_URL}/api/users/{uid}",
                         headers=_h(admin_token),
                         json={"role": "super_admin"})
        assert r2.status_code == 403, f"expected 403 on escalation, got {r2.status_code} {r2.text}"


# ---------- 4. inventory_system endpoints auth ----------

class TestInventorySystemAuth:
    @pytest.mark.parametrize("ep", INVENTORY_GETS)
    def test_anon_blocked(self, session, ep):
        r = session.get(f"{BASE_URL}{ep}")
        assert r.status_code in (401, 403), f"{ep} -> {r.status_code} {r.text[:120]}"

    @pytest.mark.parametrize("ep", INVENTORY_GETS)
    def test_admin_allowed(self, session, admin_token, ep):
        r = session.get(f"{BASE_URL}{ep}", headers=_h(admin_token))
        # Allow 200/204; treat 422 as still authenticated (filters), but reject 401/403/5xx.
        assert r.status_code not in (401, 403), f"{ep} unexpectedly blocked: {r.status_code} {r.text[:120]}"
        assert r.status_code < 500, f"{ep} server error: {r.status_code} {r.text[:120]}"

    def test_suppliers_id_anon_blocked(self, session):
        r = session.get(f"{BASE_URL}/api/suppliers/some-nonexistent-id")
        assert r.status_code in (401, 403), f"/suppliers/{{id}} anon -> {r.status_code}"

    def test_branch_inventory_anon_blocked(self, session):
        r = session.get(f"{BASE_URL}/api/branch-inventory/some-branch-id")
        assert r.status_code in (401, 403), f"/branch-inventory/{{id}} anon -> {r.status_code}"

    def test_purchases_new_id_anon_blocked(self, session):
        r = session.get(f"{BASE_URL}/api/purchases-new/nonexistent-id")
        assert r.status_code in (401, 403), f"/purchases-new/{{id}} anon -> {r.status_code}"


# ---------- 5. callcenter webhook ----------

class TestCallCenterWebhook:
    def test_webhook_anon_rejected(self, session):
        r = session.post(f"{BASE_URL}/api/callcenter/webhook",
                         json={"caller": "07700000000", "event": "incoming_call"})
        assert r.status_code == 403, f"expected 403, got {r.status_code} {r.text[:200]}"

    def test_webhook_wrong_secret_rejected(self, session):
        r = session.post(f"{BASE_URL}/api/callcenter/webhook",
                         json={"caller": "07700000000"},
                         headers={"X-Webhook-Secret": "wrong"})
        assert r.status_code == 403, f"expected 403, got {r.status_code} {r.text[:200]}"


# ---------- 6. init-db & seed ----------

class TestInitDbAndSeed:
    def test_init_db_no_key(self, session):
        r = session.get(f"{BASE_URL}/api/init-db")
        assert r.status_code == 403, f"expected 403, got {r.status_code}"

    def test_seed_anon(self, session):
        r = session.post(f"{BASE_URL}/api/seed")
        assert r.status_code in (401, 403), f"expected 401/403, got {r.status_code}"

    def test_seed_admin_blocked(self, session, admin_token):
        # an admin (not super_admin) should also be blocked from /seed
        r = session.post(f"{BASE_URL}/api/seed", headers=_h(admin_token))
        assert r.status_code in (401, 403), f"admin /seed expected 401/403, got {r.status_code} {r.text[:200]}"


# ---------- 7. customer/menu data-leak guard ----------

class TestCustomerMenuLeak:
    def test_menu_no_sensitive_fields(self, session):
        r = session.get(f"{BASE_URL}/api/customer/menu/default")
        assert r.status_code == 200, f"menu fetch failed: {r.status_code} {r.text[:200]}"
        body = r.json()
        products = body.get("products", [])
        assert isinstance(products, list)
        # Need at least 1 product to actually validate projection
        leaked = {}
        for p in products:
            for f in SENSITIVE_PRODUCT_FIELDS:
                if f in p:
                    leaked.setdefault(f, 0)
                    leaked[f] += 1
        assert not leaked, f"sensitive fields leaked in menu: {leaked}"
        # name/price still present
        if products:
            sample = products[0]
            assert "name" in sample, f"product missing name: {sample.keys()}"
            assert "price" in sample, f"product missing price: {sample.keys()}"


# ---------- 8. Regression: admin core flows ----------

class TestAdminRegression:
    def test_products(self, session, admin_token):
        r = session.get(f"{BASE_URL}/api/products", headers=_h(admin_token))
        assert r.status_code == 200, f"/products -> {r.status_code} {r.text[:120]}"

    def test_categories(self, session, admin_token):
        r = session.get(f"{BASE_URL}/api/categories", headers=_h(admin_token))
        assert r.status_code == 200, f"/categories -> {r.status_code} {r.text[:120]}"

    def test_orders(self, session, admin_token):
        r = session.get(f"{BASE_URL}/api/orders", headers=_h(admin_token))
        assert r.status_code == 200, f"/orders -> {r.status_code} {r.text[:120]}"
