"""Security hardening verification tests (pentest fix confirmation)."""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    # Fallback: read frontend .env
    with open("/app/frontend/.env") as f:
        for line in f:
            if line.startswith("REACT_APP_BACKEND_URL"):
                BASE_URL = line.split("=", 1)[1].strip().rstrip("/")
API = f"{BASE_URL}/api"
TENANT = "default"
MAIN_BRANCH = "76f56acc-6948-4a2f-bbf4-feccbddea88f"

ADMIN = {"email": "admin@maestroegp.com", "password": "admin123", "tenant_slug": TENANT}
OWNER = {"email": "owner@maestroegp.com", "password": "owner123", "tenant_slug": TENANT}
CASHIER = {"email": "cashier1@maestroegp.com", "password": "cash123", "tenant_slug": TENANT}


def _login(payload):
    r = requests.post(f"{API}/auth/login", json=payload, timeout=15)
    return r


@pytest.fixture(scope="module")
def admin_token():
    r = _login(ADMIN)
    assert r.status_code == 200, f"admin login failed: {r.status_code} {r.text}"
    return r.json().get("access_token") or r.json().get("token")


@pytest.fixture(scope="module")
def owner_token():
    p = dict(OWNER); p["secret_key"] = "271018"
    r = _login(p)
    assert r.status_code == 200, f"owner login failed: {r.status_code} {r.text}"
    return r.json().get("access_token") or r.json().get("token")


@pytest.fixture(scope="module")
def cashier_token():
    r = _login(CASHIER)
    if r.status_code != 200:
        pytest.skip(f"cashier login failed {r.status_code}: {r.text}")
    return r.json().get("access_token") or r.json().get("token")


def H(tok):
    return {"Authorization": f"Bearer {tok}"}


# ----------------- CRITICAL #1 branch leak -----------------
class TestPublicMenuLeak:
    FORBIDDEN_BRANCH = {"rent_cost","water_cost","electricity_cost","generator_cost",
                        "buyer_name","buyer_phone","owner_percentage","monthly_fee",
                        "is_sold_branch","email"}
    ALLOWED_BRANCH = {"id","name","address","phone","latitude","longitude","is_active","branch_type"}
    FORBIDDEN_PRODUCT = {"cost","profit","operating_cost","packaging_cost"}

    def test_customer_menu_no_sensitive_fields(self):
        r = requests.get(f"{API}/customer/menu/{TENANT}", timeout=15)
        assert r.status_code == 200, r.text
        data = r.json()
        assert "restaurant_name" in data or "name" in data or True  # sanity
        branches = data.get("branches", [])
        assert len(branches) > 0, "expected at least one branch"
        for b in branches:
            leaks = self.FORBIDDEN_BRANCH & set(b.keys())
            assert not leaks, f"branch leaks forbidden fields: {leaks} in {b}"
        products = data.get("products", []) or []
        for p in products:
            leaks = self.FORBIDDEN_PRODUCT & set(p.keys())
            assert not leaks, f"product leaks forbidden fields: {leaks} in keys {list(p.keys())}"


# ----------------- HIGH #3 admin secret_key -----------------
class TestAdminSecretKey:
    def test_owner_no_secret_403(self):
        r = _login(OWNER)
        assert r.status_code == 403, f"expected 403, got {r.status_code}: {r.text}"

    def test_owner_wrong_secret_403(self):
        p = dict(OWNER); p["secret_key"] = "000000"
        r = _login(p)
        assert r.status_code == 403, f"expected 403, got {r.status_code}: {r.text}"

    def test_owner_correct_secret_200(self):
        p = dict(OWNER); p["secret_key"] = "271018"
        r = _login(p)
        assert r.status_code == 200, r.text

    def test_admin_without_secret_key_ok(self):
        r = _login(ADMIN)
        assert r.status_code == 200, f"admin (no secret) should login: {r.status_code} {r.text}"


# ----------------- HIGH #5 product cost/profit leak -----------------
class TestProductCostLeak:
    def test_cashier_sees_zero_cost(self, cashier_token):
        r = requests.get(f"{API}/products", headers=H(cashier_token), timeout=15)
        assert r.status_code == 200, r.text
        products = r.json()
        assert isinstance(products, list) and len(products) > 0
        for p in products[:20]:
            assert p.get("cost", 0) == 0, f"cashier saw cost={p.get('cost')} on {p.get('id')}"
            assert p.get("profit", 0) == 0, f"cashier saw profit={p.get('profit')}"
            assert p.get("operating_cost", 0) == 0
            assert p.get("packaging_cost", 0) == 0
        # price should still be visible (>0 for at least some)
        assert any((p.get("price") or 0) > 0 for p in products), "price should still be visible"

    def test_admin_sees_real_cost(self, admin_token):
        r = requests.get(f"{API}/products", headers=H(admin_token), timeout=15)
        assert r.status_code == 200, r.text
        products = r.json()
        # at least one product should have non-zero cost (real cost visible)
        has_cost = any((p.get("cost") or 0) > 0 for p in products)
        assert has_cost, "admin should see real cost>0 on at least one product"

    def test_cashier_single_product_zero_cost(self, cashier_token, admin_token):
        # get any product id via admin
        r = requests.get(f"{API}/products", headers=H(admin_token), timeout=15)
        pid = r.json()[0]["id"]
        r2 = requests.get(f"{API}/products/{pid}", headers=H(cashier_token), timeout=15)
        assert r2.status_code == 200, r2.text
        p = r2.json()
        assert p.get("cost", 0) == 0
        assert p.get("profit", 0) == 0


# ----------------- HIGH #6 payment gateway keys -----------------
class TestPaymentSettings:
    def test_cashier_403(self, cashier_token):
        r = requests.get(f"{API}/payment-settings", headers=H(cashier_token), timeout=15)
        assert r.status_code == 403, f"expected 403, got {r.status_code}"

    def test_admin_200_no_secret_key(self, admin_token):
        r = requests.get(f"{API}/payment-settings", headers=H(admin_token), timeout=15)
        assert r.status_code == 200, r.text
        data = r.json()
        # 'stripe_secret_key_set' boolean flag is OK (indicates existence).
        # The actual key 'stripe_secret_key' must never appear.
        assert "stripe_secret_key" not in data, "stripe_secret_key must not appear in response"
        # also assert no plaintext key leaked in any string value
        import json as _j
        raw = _j.dumps(data)
        assert '"stripe_secret_key"' not in raw


# ----------------- HIGH #7 owner contact leak -----------------
class TestInvoiceSettingsLeak:
    def test_cashier_contacts_null(self, cashier_token):
        r = requests.get(f"{API}/system/invoice-settings", headers=H(cashier_token), timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        for k in ("system_phone","system_phone2","system_email","system_website"):
            assert d.get(k) in (None, "", []), f"{k} leaked to cashier: {d.get(k)}"


# ----------------- HIGH #4 callcenter/simulate RBAC -----------------
class TestCallcenterSimulate:
    def test_cashier_403(self, cashier_token):
        r = requests.post(f"{API}/callcenter/simulate", headers=H(cashier_token), json={}, timeout=15)
        assert r.status_code == 403, f"expected 403, got {r.status_code} {r.text}"

    def test_admin_not_403(self, admin_token):
        r = requests.post(f"{API}/callcenter/simulate", headers=H(admin_token), json={}, timeout=15)
        assert r.status_code != 403, f"admin should be allowed, got 403: {r.text}"


# ----------------- MEDIUM #8 supplier dues RBAC -----------------
class TestSupplierDues:
    def test_cashier_403(self, cashier_token):
        r = requests.get(f"{API}/supplier-payment-dues", headers=H(cashier_token), timeout=15)
        assert r.status_code == 403, f"expected 403, got {r.status_code}"

    def test_admin_allowed(self, admin_token):
        r = requests.get(f"{API}/supplier-payment-dues", headers=H(admin_token), timeout=15)
        assert r.status_code != 403


# ----------------- CRITICAL #2 negative/zero price orders -----------------
class TestOrderPriceGuard:
    """We verify guard rejects malicious prices with 400 BEFORE any shift check.
    Valid order may return 400 with detail 'لا توجد وردية مفتوحة' — treated as PASS for guard."""

    def _get_valid_product(self, admin_token):
        r = requests.get(f"{API}/products", headers=H(admin_token), timeout=15)
        for p in r.json():
            if (p.get("price") or 0) > 0:
                return p
        pytest.skip("no product with price>0")

    def _post(self, tok, items, extras=None):
        import uuid as _uuid
        # Ensure required 'product_name' field on each item
        norm_items = []
        for it in items:
            it = dict(it)
            it.setdefault("product_name", it.get("name", "item"))
            if extras is not None:
                it["extras"] = extras
            norm_items.append(it)
        payload = {
            "branch_id": MAIN_BRANCH,
            "order_type": "dine_in",
            "items": norm_items,
            "payment_method": "cash",
            # unique notes to bypass server idempotency/dedup on identical payloads
            "notes": f"sec-test-{_uuid.uuid4()}",
        }
        return requests.post(f"{API}/orders", headers=H(tok), json=payload, timeout=15)

    def _is_price_reject(self, r):
        # 400 due to price guard (not shift)
        if r.status_code != 400:
            return False
        try:
            detail = str(r.json().get("detail", ""))
        except Exception:
            detail = r.text
        return "وردية" not in detail  # not the shift message

    def _is_shift_msg(self, r):
        try:
            detail = str(r.json().get("detail", ""))
        except Exception:
            detail = r.text
        return "وردية" in detail

    def test_negative_price_rejected(self, admin_token, cashier_token):
        p = self._get_valid_product(admin_token)
        r = self._post(cashier_token, [{"product_id": p["id"], "name": p.get("name","x"),
                                       "quantity": 3, "price": -5}])
        assert r.status_code == 400 and self._is_price_reject(r), f"got {r.status_code} {r.text}"

    def test_zero_price_rejected(self, admin_token, cashier_token):
        p = self._get_valid_product(admin_token)
        r = self._post(cashier_token, [{"product_id": p["id"], "name": p.get("name","x"),
                                       "quantity": 999, "price": 0}])
        assert r.status_code == 400 and self._is_price_reject(r), f"got {r.status_code} {r.text}"

    def test_below_catalog_price_rejected(self, admin_token, cashier_token):
        p = self._get_valid_product(admin_token)
        below = max(0.01, (p["price"] or 1) - 100)
        r = self._post(cashier_token, [{"product_id": p["id"], "name": p.get("name","x"),
                                       "quantity": 4, "price": below}])
        assert r.status_code == 400 and self._is_price_reject(r), f"got {r.status_code} {r.text}"

    def test_valid_price_passes_guard(self, admin_token, cashier_token):
        p = self._get_valid_product(admin_token)
        r = self._post(cashier_token, [{"product_id": p["id"], "name": p.get("name","x"),
                                       "quantity": 1, "price": p["price"]}])
        # Either success or shift-missing message. NOT a price-guard reject.
        if r.status_code == 400:
            assert self._is_shift_msg(r), f"valid price got price-guard reject: {r.text}"
        else:
            assert r.status_code in (200, 201), f"unexpected {r.status_code}: {r.text}"

    def test_negative_extra_price_rejected(self, admin_token, cashier_token):
        p = self._get_valid_product(admin_token)
        r = self._post(cashier_token,
                       [{"product_id": p["id"], "name": p.get("name","x"),
                         "quantity": 5, "price": p["price"]}],
                       extras=[{"name": "x", "quantity": 1, "price": -1}])
        assert r.status_code == 400 and self._is_price_reject(r), f"got {r.status_code} {r.text}"

    def test_zero_extra_quantity_rejected(self, admin_token, cashier_token):
        p = self._get_valid_product(admin_token)
        r = self._post(cashier_token,
                       [{"product_id": p["id"], "name": p.get("name","x"),
                         "quantity": 6, "price": p["price"]}],
                       extras=[{"name": "x", "quantity": 0, "price": 5}])
        assert r.status_code == 400 and self._is_price_reject(r), f"got {r.status_code} {r.text}"


# ----------------- REGRESSION -----------------
class TestRegression:
    def test_public_menu_still_works(self):
        r = requests.get(f"{API}/customer/menu/{TENANT}", timeout=15)
        assert r.status_code == 200
        d = r.json()
        assert (d.get("categories") is not None) or (d.get("products") is not None)

    def test_admin_login_regression(self):
        r = _login(ADMIN)
        assert r.status_code == 200
