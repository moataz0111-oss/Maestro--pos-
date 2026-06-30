"""Iteration 256 retest:
1) Public customer menu must NOT leak sensitive substrings (cost/profit/recipe/raw_material/margin/supplier/wholesale).
   Products must still keep 'name' and 'price'.
2) RBAC regression sanity:
   - cashier => 403 on /api/manufactured-products and /api/employees
   - admin   => 200 on /api/manufactured-products and /api/employees
   - cashier => 200 on /api/products
"""
import os
import json
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
ADMIN = {"email": "admin@maestroegp.com", "password": "admin123"}
CASHIER = {"email": "cashier1@maestroegp.com", "password": "cash123"}

SENSITIVE = ("cost", "profit", "recipe", "raw_material",
             "margin", "supplier", "wholesale")


def _login(creds):
    r = requests.post(f"{BASE_URL}/api/auth/login", json=creds, timeout=30)
    assert r.status_code == 200, f"login failed {creds['email']}: {r.status_code} {r.text[:300]}"
    data = r.json()
    tok = data.get("token") or data.get("access_token")
    assert tok, f"no token returned for {creds['email']}: {data}"
    return tok


@pytest.fixture(scope="module")
def admin_token():
    return _login(ADMIN)


@pytest.fixture(scope="module")
def cashier_token():
    return _login(CASHIER)


# -------- 1. Public menu clean ---------------------------------------------
def _scan_substrings(obj, hits, path="root"):
    """Recursively scan dict/list for sensitive substrings in KEYS only
    (values can legitimately contain e.g. arabic text)."""
    if isinstance(obj, dict):
        for k, v in obj.items():
            kl = str(k).lower()
            for s in SENSITIVE:
                if s in kl:
                    hits.append(f"{path}.{k}  (matches '{s}')")
            _scan_substrings(v, hits, f"{path}.{k}")
    elif isinstance(obj, list):
        for i, it in enumerate(obj):
            _scan_substrings(it, hits, f"{path}[{i}]")


def test_public_menu_no_sensitive_keys():
    r = requests.get(f"{BASE_URL}/api/customer/menu/default", timeout=30)
    assert r.status_code == 200, f"menu fetch failed: {r.status_code} {r.text[:300]}"
    body = r.json()

    hits = []
    _scan_substrings(body, hits)
    assert not hits, "Sensitive key(s) leaked in public menu:\n" + "\n".join(hits)


def test_public_menu_preserves_price_and_name():
    r = requests.get(f"{BASE_URL}/api/customer/menu/default", timeout=30)
    assert r.status_code == 200
    body = r.json()
    products = body.get("products") or []
    assert isinstance(products, list) and len(products) > 0, \
        f"No products returned to verify shape: keys={list(body.keys())}"
    sample = products[0]
    assert "name" in sample, f"product missing 'name' field: {sample.keys()}"
    assert "price" in sample, f"product missing 'price' field: {sample.keys()}"


def test_public_menu_raw_json_string_safe():
    """Belt & suspenders: ensure the raw serialized JSON does not contain
    sensitive substrings AS KEYS (we check '"cost"' style tokens)."""
    r = requests.get(f"{BASE_URL}/api/customer/menu/default", timeout=30)
    assert r.status_code == 200
    raw = r.text.lower()
    # We look for the JSON key form: "<substr>...":
    # (just substring "cost" alone could appear in arabic-translated text — unlikely
    #  but to be safe we look for it as a json key boundary)
    leaks = []
    for s in SENSITIVE:
        token = f'"{s}'
        # find quoted keys that START with the sensitive substring
        idx = 0
        while True:
            j = raw.find(token, idx)
            if j == -1:
                break
            # quick heuristic: is this followed by a json key terminator ": within 60 chars?
            tail = raw[j:j + 80]
            if '":' in tail:
                leaks.append(f"token {token!r} near: ...{raw[max(0,j-20):j+60]}...")
            idx = j + 1
    assert not leaks, "Sensitive JSON keys still present:\n" + "\n".join(leaks[:10])


# -------- 2. RBAC regression -----------------------------------------------
def _h(tok):
    return {"Authorization": f"Bearer {tok}"}


def test_cashier_forbidden_on_manufactured_products(cashier_token):
    r = requests.get(f"{BASE_URL}/api/manufactured-products",
                     headers=_h(cashier_token), timeout=30)
    assert r.status_code == 403, f"expected 403, got {r.status_code}: {r.text[:200]}"


def test_cashier_forbidden_on_employees(cashier_token):
    r = requests.get(f"{BASE_URL}/api/employees",
                     headers=_h(cashier_token), timeout=30)
    assert r.status_code == 403, f"expected 403, got {r.status_code}: {r.text[:200]}"


def test_admin_ok_on_manufactured_products(admin_token):
    r = requests.get(f"{BASE_URL}/api/manufactured-products",
                     headers=_h(admin_token), timeout=30)
    assert r.status_code == 200, f"expected 200, got {r.status_code}: {r.text[:200]}"


def test_admin_ok_on_employees(admin_token):
    r = requests.get(f"{BASE_URL}/api/employees",
                     headers=_h(admin_token), timeout=30)
    assert r.status_code == 200, f"expected 200, got {r.status_code}: {r.text[:200]}"


def test_cashier_ok_on_products(cashier_token):
    r = requests.get(f"{BASE_URL}/api/products",
                     headers=_h(cashier_token), timeout=30)
    assert r.status_code == 200, f"expected 200, got {r.status_code}: {r.text[:200]}"
