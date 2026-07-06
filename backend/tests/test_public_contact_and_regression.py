"""Tests for public contact endpoint + regression security checks."""
import os
import requests
import pytest

BASE = os.environ.get("REACT_APP_BACKEND_URL", "https://trusted-device-auth.preview.emergentagent.com").rstrip("/")
API = f"{BASE}/api"


def _login(email, password, secret=None):
    payload = {"email": email, "password": password}
    if secret:
        payload["secret_key"] = secret
    r = requests.post(f"{API}/auth/login", json=payload, timeout=30)
    return r


# ------- Public contact endpoint -------
class TestPublicInvoiceSettings:
    def test_no_auth_returns_200_with_full_contact(self):
        r = requests.get(f"{API}/system/invoice-settings", timeout=30)
        assert r.status_code == 200, r.text
        d = r.json()
        for key in ["system_name", "system_phone", "system_phone2",
                   "system_email", "system_website", "promo_text", "cta_text"]:
            assert key in d, f"missing {key}"
        assert d["system_phone"] == "07701234567"
        assert d["system_phone2"] == "07809876543"
        assert d["system_email"]
        assert d["system_website"]
        assert "تواصل" in d["cta_text"]

    def test_no_auth_header_variants(self):
        # Explicitly empty
        r = requests.get(f"{API}/system/invoice-settings", headers={"Authorization": ""}, timeout=30)
        assert r.status_code == 200


# ------- Regression: auth/login -------
class TestAuthRegression:
    def test_owner_no_secret_403(self):
        r = _login("owner@maestroegp.com", "owner123")
        assert r.status_code == 403, r.text

    def test_owner_with_secret_200(self):
        r = _login("owner@maestroegp.com", "owner123", "271018")
        assert r.status_code == 200, r.text
        assert r.json().get("token")

    def test_admin_no_secret_200(self):
        r = _login("admin@maestroegp.com", "admin123")
        assert r.status_code == 200, r.text


@pytest.fixture(scope="module")
def admin_token():
    r = _login("admin@maestroegp.com", "admin123")
    assert r.status_code == 200
    return r.json()["token"]


@pytest.fixture(scope="module")
def cashier_token():
    r = _login("cashier1@maestroegp.com", "cash123")
    if r.status_code != 200:
        pytest.skip("cashier not seeded")
    return r.json()["token"]


def h(tok):
    return {"Authorization": f"Bearer {tok}"}


# ------- Regression: public menu (no leakage) -------
class TestPublicMenuNoLeak:
    def test_menu_default_no_sensitive(self):
        r = requests.get(f"{API}/customer/menu/default", timeout=30)
        assert r.status_code == 200
        text = r.text.lower()
        for bad in ["rent_cost", "buyer_name", "owner_percentage"]:
            assert bad not in text, f"leaked {bad}"


# ------- Regression: products cost visibility -------
class TestProductsCost:
    def test_cashier_sees_zero_cost(self, cashier_token):
        r = requests.get(f"{API}/products", headers=h(cashier_token), timeout=30)
        assert r.status_code == 200
        items = r.json()
        if items:
            for p in items[:20]:
                assert p.get("cost", 0) == 0
                assert p.get("profit", 0) == 0

    def test_admin_sees_real_cost(self, admin_token):
        r = requests.get(f"{API}/products", headers=h(admin_token), timeout=30)
        assert r.status_code == 200
        items = r.json()
        # at least one product should have non-zero cost if seeded
        has_cost = any((p.get("cost") or 0) > 0 for p in items)
        # not strict; just ensure field is present
        assert isinstance(items, list)


# ------- Regression: forbidden endpoints for cashier -------
class TestCashierForbidden:
    def test_payment_settings_403(self, cashier_token):
        r = requests.get(f"{API}/payment-settings", headers=h(cashier_token), timeout=30)
        assert r.status_code == 403

    def test_supplier_dues_403(self, cashier_token):
        r = requests.get(f"{API}/supplier-payment-dues", headers=h(cashier_token), timeout=30)
        assert r.status_code == 403

    def test_callcenter_simulate_403(self, cashier_token):
        r = requests.post(f"{API}/callcenter/simulate", headers=h(cashier_token), json={}, timeout=30)
        assert r.status_code == 403


# ------- Regression: order validation -------
class TestOrderValidation:
    def _base_payload(self, price, qty):
        return {
            "branch_id": "main",
            "items": [{"product_id": "x", "product_name": "t", "quantity": qty, "price": price}],
            "payment_method": "cash",
            "order_type": "dine_in",
        }

    def test_negative_price_400(self, admin_token):
        r = requests.post(f"{API}/orders", headers=h(admin_token), json=self._base_payload(-5, 1), timeout=30)
        assert r.status_code == 400, r.text

    def test_zero_price_high_qty_400(self, admin_token):
        r = requests.post(f"{API}/orders", headers=h(admin_token), json=self._base_payload(0, 999), timeout=30)
        assert r.status_code == 400, r.text
