"""
iter255 — RBAC hardening regression tests.
Verifies that low-privilege roles (cashier) cannot access sensitive endpoints,
operational endpoints still work, management/inventory/purchasing roles see
what they need, unauth requests are blocked, branch fields are masked, and
the customer menu does not leak recipe/cost.
"""
import os
import json
import pytest
import requests

def _load_backend_url():
    url = os.environ.get("REACT_APP_BACKEND_URL")
    if not url:
        try:
            with open("/app/frontend/.env") as f:
                for line in f:
                    if line.startswith("REACT_APP_BACKEND_URL="):
                        url = line.split("=", 1)[1].strip()
                        break
        except Exception:
            pass
    if not url:
        raise RuntimeError("REACT_APP_BACKEND_URL not set")
    return url.rstrip("/")

BASE_URL = _load_backend_url()

CREDS = {
    "admin": ("admin@maestroegp.com", "admin123"),
    "cashier": ("cashier1@maestroegp.com", "cash123"),
    "wkeeper": ("wkeeper@maestroegp.com", "wkeeper123"),
    "buyer": ("buyer@maestroegp.com", "buyer123"),
}

SENSITIVE_GETS = [
    "/api/employees",
    "/api/payroll/payments",
    "/api/advances",
    "/api/deductions",
    "/api/reports/products",
    "/api/reports/sales",
    "/api/smart-reports/sales",
    "/api/dashboard/stats",
    "/api/break-even/daily",
    "/api/inventory-stats",
    "/api/inventory-settings",
    "/api/suppliers",
    "/api/purchases-new",
    "/api/purchase-requests",
    "/api/manufactured-products",
    "/api/manufacturing-requests",
    "/api/manufacturing-inventory",
    "/api/warehouse-transfers",
    "/api/raw-materials",
]

OPERATIONAL_GETS = [
    "/api/products",
    "/api/categories",
    "/api/orders",
    "/api/branches",
    "/api/drivers",
    "/api/shifts/current",
]


@pytest.fixture(scope="session")
def tokens():
    out = {}
    for k, (email, pw) in CREDS.items():
        r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": pw}, timeout=15)
        assert r.status_code == 200, f"login {k} failed: {r.status_code} {r.text[:200]}"
        body = r.json()
        tok = body.get("token") or body.get("access_token")
        assert tok, f"no token for {k}: {body}"
        out[k] = tok
    return out


def _headers(token):
    return {"Authorization": f"Bearer {token}"}


# ===== RBAC BLOCK: cashier must get 403 on sensitive endpoints =====
@pytest.mark.parametrize("path", SENSITIVE_GETS)
def test_cashier_blocked_on_sensitive(tokens, path):
    r = requests.get(f"{BASE_URL}{path}", headers=_headers(tokens["cashier"]), timeout=20)
    assert r.status_code == 403, f"cashier should be 403 on {path}, got {r.status_code}: {r.text[:200]}"


# ===== OPERATIONAL OK: cashier still gets 200 =====
@pytest.mark.parametrize("path", OPERATIONAL_GETS)
def test_cashier_operational_ok(tokens, path):
    r = requests.get(f"{BASE_URL}{path}", headers=_headers(tokens["cashier"]), timeout=20)
    assert r.status_code == 200, f"cashier should be 200 on {path}, got {r.status_code}: {r.text[:200]}"


# ===== MANAGEMENT OK: admin gets 200 on all sensitive endpoints =====
@pytest.mark.parametrize("path", SENSITIVE_GETS)
def test_admin_can_access_sensitive(tokens, path):
    r = requests.get(f"{BASE_URL}{path}", headers=_headers(tokens["admin"]), timeout=30)
    assert r.status_code == 200, f"admin must access {path}, got {r.status_code}: {r.text[:200]}"


# ===== INVENTORY ROLE OK =====
@pytest.mark.parametrize("path", [
    "/api/manufactured-products",
    "/api/manufacturing-inventory",
    "/api/warehouse-transfers",
    "/api/inventory-stats",
    "/api/raw-materials",
])
def test_warehouse_keeper_inventory_ok(tokens, path):
    r = requests.get(f"{BASE_URL}{path}", headers=_headers(tokens["wkeeper"]), timeout=20)
    assert r.status_code == 200, f"wkeeper should be 200 on {path}, got {r.status_code}: {r.text[:200]}"


# ===== PURCHASING ROLE: 200 on suppliers/purchases, 403 on employees =====
def test_buyer_can_access_suppliers(tokens):
    r = requests.get(f"{BASE_URL}/api/suppliers", headers=_headers(tokens["buyer"]), timeout=20)
    assert r.status_code == 200, f"buyer suppliers: {r.status_code} {r.text[:200]}"


def test_buyer_can_access_purchases(tokens):
    r = requests.get(f"{BASE_URL}/api/purchases-new", headers=_headers(tokens["buyer"]), timeout=20)
    assert r.status_code == 200, f"buyer purchases-new: {r.status_code} {r.text[:200]}"


def test_buyer_blocked_on_employees(tokens):
    r = requests.get(f"{BASE_URL}/api/employees", headers=_headers(tokens["buyer"]), timeout=20)
    assert r.status_code == 403, f"buyer should be 403 on employees, got {r.status_code}"


# ===== UNAUTH: no Authorization header → 401 or 403, never 200 =====
@pytest.mark.parametrize("path", [
    "/api/employees",
    "/api/manufactured-products",
    "/api/purchases-new",
    "/api/inventory-stats",
])
def test_unauth_blocked(path):
    r = requests.get(f"{BASE_URL}{path}", timeout=15)
    assert r.status_code in (401, 403), f"unauth on {path} must be 401/403, got {r.status_code}"


# ===== BRANCH FIELD MASKING =====
SENSITIVE_BRANCH_FIELDS = [
    "rent_cost", "water_cost", "electricity_cost",
    "generator_cost", "buyer_name", "owner_percentage", "monthly_fee",
]


def test_branch_fields_masked_for_cashier(tokens):
    r = requests.get(f"{BASE_URL}/api/branches", headers=_headers(tokens["cashier"]), timeout=20)
    assert r.status_code == 200, f"branches cashier: {r.status_code} {r.text[:200]}"
    data = r.json()
    assert isinstance(data, list), f"branches expected list, got {type(data)}"
    if not data:
        pytest.skip("no branches seeded")
    for b in data:
        for field in SENSITIVE_BRANCH_FIELDS:
            assert field not in b, f"cashier should NOT see {field} on branch {b.get('id')}; got {b.get(field)!r}"


def test_branch_fields_visible_to_admin(tokens):
    r = requests.get(f"{BASE_URL}/api/branches", headers=_headers(tokens["admin"]), timeout=20)
    assert r.status_code == 200, f"branches admin: {r.status_code} {r.text[:200]}"
    data = r.json()
    assert isinstance(data, list) and len(data) > 0, "expect at least one branch"
    # admin must still see rent_cost + id + name on at least one branch
    has_rent = any("rent_cost" in b for b in data)
    assert has_rent, f"admin must see rent_cost on at least one branch. Sample keys: {list(data[0].keys())}"
    for b in data:
        assert "id" in b
        assert "name" in b


# ===== PUBLIC MENU: no recipe/raw/cost leak =====
def test_public_menu_no_cost_leak():
    r = requests.get(f"{BASE_URL}/api/customer/menu/default", timeout=20)
    assert r.status_code == 200, f"public menu: {r.status_code} {r.text[:200]}"
    raw = r.text
    body_lower = raw.lower()
    for forbidden in ("recipe", "raw_material", "cost", "profit"):
        assert forbidden not in body_lower, (
            f"public menu must NOT expose substring '{forbidden}'. "
            f"Found in response. Snippet around it: ...{raw[max(0, body_lower.find(forbidden)-60):body_lower.find(forbidden)+80]}..."
        )
