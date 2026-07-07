"""Regression tests for iter100 refactor: extracted routes, cookie auth, password policy,
welcome-discount stats, shift expense attribution."""
import os
import time
import requests
import pytest

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://whatsapp-pos-system.preview.emergentagent.com').rstrip('/')
API = f"{BASE_URL}/api"


@pytest.fixture(scope="module")
def admin_session():
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"email": "admin@maestroegp.com", "password": "admin123"})
    assert r.status_code == 200, f"admin login failed: {r.status_code} {r.text[:200]}"
    data = r.json()
    assert "token" in data and "user" in data
    token = data["token"]
    s.headers.update({"Authorization": f"Bearer {token}"})
    # Save the cookie session too
    return {"session": s, "token": token, "cookies": s.cookies}


@pytest.fixture(scope="module")
def super_admin_token():
    r = requests.post(f"{API}/super-admin/login", json={
        "email": "owner@maestroegp.com", "password": "owner123", "secret_key": "271018"
    })
    assert r.status_code == 200, f"super admin login failed: {r.status_code} {r.text[:200]}"
    return r.json().get("token")


# ---------- Auth + Cookie ----------
class TestAuthCookie:
    def test_login_sets_cookie(self):
        r = requests.post(f"{API}/auth/login", json={"email": "admin@maestroegp.com", "password": "admin123"})
        assert r.status_code == 200
        data = r.json()
        assert "token" in data and "user" in data
        # Check cookie set
        set_cookie = r.headers.get("set-cookie", "")
        assert "access_token" in set_cookie.lower(), f"access_token cookie missing: {set_cookie}"

    def test_me_with_bearer(self, admin_session):
        r = requests.get(f"{API}/auth/me", headers={"Authorization": f"Bearer {admin_session['token']}"})
        assert r.status_code == 200
        assert r.json().get("email") == "admin@maestroegp.com"

    def test_me_with_cookie_only(self):
        # Login to get cookie
        s = requests.Session()
        s.post(f"{API}/auth/login", json={"email": "admin@maestroegp.com", "password": "admin123"})
        # Explicitly clear any Authorization header (there is none) - request /me with only cookie jar
        r = s.get(f"{API}/auth/me")
        assert r.status_code == 200, f"cookie auth failed: {r.status_code} {r.text[:200]}"
        assert r.json().get("email") == "admin@maestroegp.com"

    def test_me_no_auth_returns_401(self):
        r = requests.get(f"{API}/auth/me")
        assert r.status_code == 401, f"expected 401 got {r.status_code}"

    def test_logout_clears_cookie(self):
        s = requests.Session()
        s.post(f"{API}/auth/login", json={"email": "admin@maestroegp.com", "password": "admin123"})
        r = s.post(f"{API}/auth/logout")
        assert r.status_code in (200, 204)
        set_cookie = r.headers.get("set-cookie", "")
        # cookie should be cleared (empty value or expired)
        assert "access_token" in set_cookie.lower()
        # After logout /me should be 401
        r2 = s.get(f"{API}/auth/me")
        assert r2.status_code == 401


# ---------- Super Admin ----------
class TestSuperAdmin:
    def test_stats(self, super_admin_token):
        r = requests.get(f"{API}/super-admin/stats", headers={"Authorization": f"Bearer {super_admin_token}"})
        assert r.status_code == 200

    def test_tenants(self, super_admin_token):
        r = requests.get(f"{API}/super-admin/tenants", headers={"Authorization": f"Bearer {super_admin_token}"})
        assert r.status_code == 200

    def test_security_status(self, super_admin_token):
        r = requests.get(f"{API}/super-admin/security-status", headers={"Authorization": f"Bearer {super_admin_token}"})
        assert r.status_code == 200

    def test_blocked_ips(self, super_admin_token):
        r = requests.get(f"{API}/super-admin/blocked-ips", headers={"Authorization": f"Bearer {super_admin_token}"})
        assert r.status_code == 200

    def test_trusted_devices(self, super_admin_token):
        r = requests.get(f"{API}/super-admin/trusted-devices", headers={"Authorization": f"Bearer {super_admin_token}"})
        assert r.status_code == 200


# ---------- Extracted route modules ----------
class TestExtractedRoutes:
    @pytest.mark.parametrize("endpoint,acceptable", [
        ("/reports/cash-register-closings", (200,)),
        ("/biometric/devices", (200,)),
        ("/smart-reports/sales", (200,)),
        ("/printers", (200,)),
        ("/coupons", (200,)),
        ("/promotions", (200,)),
        ("/refunds", (200,)),
        ("/employees", (200,)),
        ("/payroll/payments", (200, 422)),
    ])
    def test_endpoint_ok(self, admin_session, endpoint, acceptable):
        r = admin_session["session"].get(f"{API}{endpoint}")
        assert r.status_code in acceptable, f"{endpoint} -> {r.status_code} {r.text[:200]}"

    def test_customer_menu_default_public(self):
        r = requests.get(f"{API}/customer/menu/default")
        assert r.status_code == 200


# ---------- Core POS regression ----------
class TestCorePOS:
    @pytest.mark.parametrize("endpoint", ["/products", "/categories", "/branches", "/orders", "/customers"])
    def test_core_endpoint(self, admin_session, endpoint):
        r = admin_session["session"].get(f"{API}{endpoint}")
        assert r.status_code == 200, f"{endpoint} -> {r.status_code} {r.text[:200]}"


# ---------- Password policy ----------
class TestPasswordPolicy:
    def test_create_user_weak_password_rejected(self, admin_session):
        import uuid
        u = uuid.uuid4().hex[:6]
        payload = {"username": f"TEST_weak_{u}", "email": f"TEST_weak_{u}@maestroegp.com", "password": "123", "full_name": "TestWeak", "role": "cashier"}
        r = admin_session["session"].post(f"{API}/users", json=payload)
        assert r.status_code == 400, f"expected 400 got {r.status_code}: {r.text[:200]}"

    def test_create_user_strong_password_ok(self, admin_session):
        import uuid
        u = uuid.uuid4().hex[:6]
        email = f"TEST_pwdok_{u}@maestroegp.com"
        payload = {"username": f"TEST_pwdok_{u}", "email": email, "password": "abc12345", "full_name": "TestOk", "role": "cashier"}
        r = admin_session["session"].post(f"{API}/users", json=payload)
        assert r.status_code in (200, 201), f"expected success got {r.status_code}: {r.text[:300]}"
        # Verify created user can login and gets cookie
        s2 = requests.Session()
        r2 = s2.post(f"{API}/auth/login", json={"email": email, "password": "abc12345"})
        assert r2.status_code == 200
        assert "access_token" in r2.headers.get("set-cookie", "").lower()
        # cleanup
        user_id = r.json().get("id") or r.json().get("user", {}).get("id")
        if user_id:
            admin_session["session"].delete(f"{API}/users/{user_id}")

    def test_reset_password_weak_rejected(self, admin_session):
        import uuid
        u = uuid.uuid4().hex[:6]
        email = f"TEST_reset_{u}@maestroegp.com"
        r = admin_session["session"].post(f"{API}/users", json={"username": f"TEST_reset_{u}", "email": email, "password": "abc12345", "full_name": "R", "role": "cashier"})
        if r.status_code not in (200, 201):
            pytest.skip("could not create user")
        uid = r.json().get("id") or r.json().get("user", {}).get("id")
        try:
            r_bad = admin_session["session"].put(f"{API}/users/{uid}/reset-password", json={"new_password": "111"})
            assert r_bad.status_code == 400
            r_ok = admin_session["session"].put(f"{API}/users/{uid}/reset-password", json={"new_password": "test1234"})
            assert r_ok.status_code == 200, f"{r_ok.status_code} {r_ok.text[:200]}"
        finally:
            admin_session["session"].delete(f"{API}/users/{uid}")


# ---------- Welcome discount stats ----------
class TestWelcomeDiscountStats:
    def test_stats_admin(self, admin_session):
        r = admin_session["session"].get(f"{API}/welcome-discount/stats")
        assert r.status_code == 200
        data = r.json()
        for k in ["pending_customers", "granted_customers", "total_coupons", "conversion_rate"]:
            assert k in data, f"missing field {k}: {list(data.keys())}"

    def test_stats_cashier_forbidden(self):
        s = requests.Session()
        r = s.post(f"{API}/auth/login", json={"email": "cashier1@maestroegp.com", "password": "cash123"})
        if r.status_code != 200:
            pytest.skip("cashier account not available")
        token = r.json().get("token")
        r2 = requests.get(f"{API}/welcome-discount/stats", headers={"Authorization": f"Bearer {token}"})
        assert r2.status_code == 403, f"expected 403 got {r2.status_code}"


# ---------- Shift expense attribution ----------
class TestShiftExpenseAttribution:
    @staticmethod
    def _seed_if_needed():
        # Try login first; only run seed if either cashier fails
        r = requests.post(f"{API}/auth/login", json={"email": "expattr-cashier-a@maestroegp.com", "password": "test123"})
        if r.status_code == 200:
            return
        import subprocess
        subprocess.run(["python3", "/app/backend/seed_expense_attribution_test.py"], capture_output=True, timeout=60)

    def test_cashier_a_isolated(self):
        self._seed_if_needed()
        r = requests.post(f"{API}/auth/login", json={"email": "expattr-cashier-a@maestroegp.com", "password": "test123"})
        assert r.status_code == 200, f"cashier A login failed: {r.text[:200]}"
        token = r.json().get("token")
        r2 = requests.get(f"{API}/cash-register/summary", headers={"Authorization": f"Bearer {token}"})
        assert r2.status_code == 200, f"summary failed: {r2.text[:300]}"
        data = r2.json()
        exp = data.get("total_expenses") or data.get("expenses") or data.get("expenses_total") or 0
        # accept nested search
        if isinstance(exp, dict):
            exp = exp.get("total", 0)
        assert float(exp) == 15000, f"cashier A expected 15000, got {exp}. keys={list(data.keys())}"

    def test_cashier_b_isolated(self):
        r = requests.post(f"{API}/auth/login", json={"email": "expattr-cashier-b@maestroegp.com", "password": "test123"})
        assert r.status_code == 200, f"cashier B login failed: {r.text[:200]}"
        token = r.json().get("token")
        r2 = requests.get(f"{API}/cash-register/summary", headers={"Authorization": f"Bearer {token}"})
        assert r2.status_code == 200
        data = r2.json()
        exp = data.get("total_expenses") or data.get("expenses") or data.get("expenses_total") or 0
        if isinstance(exp, dict):
            exp = exp.get("total", 0)
        assert float(exp) == 5000, f"cashier B expected 5000, got {exp}. keys={list(data.keys())}"


# ---------- Expenses POST regression ----------
class TestExpensesCreate:
    def test_create_expense(self, admin_session):
        # Get a branch first
        br = admin_session["session"].get(f"{API}/branches").json()
        branch_id = br[0]["id"] if br else "76f56acc-6948-4a2f-bbf4-feccbddea88f"
        payload = {"description": "TEST_expense_iter100", "amount": 1000, "category": "أخرى", "branch_id": branch_id}
        r = admin_session["session"].post(f"{API}/expenses", json=payload)
        assert r.status_code in (200, 201), f"{r.status_code} {r.text[:300]}"
