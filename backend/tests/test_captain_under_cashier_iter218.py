"""
Backend tests for the "Captain works under Cashier shift" feature.
Re-seed before running: cd /app/backend && set -a && source .env && set +a && python3 seed_captain_test_data.py
"""
import os
import requests
import pytest

BASE = os.environ["REACT_APP_BACKEND_URL"].rstrip("/") if os.environ.get("REACT_APP_BACKEND_URL") else None
if not BASE:
    # fall back to reading frontend .env
    with open("/app/frontend/.env") as f:
        for line in f:
            if line.startswith("REACT_APP_BACKEND_URL="):
                BASE = line.split("=", 1)[1].strip().rstrip("/")
                break

API = f"{BASE}/api"


def login(email, password):
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=20)
    assert r.status_code == 200, f"login failed for {email}: {r.status_code} {r.text}"
    return r.json().get("access_token") or r.json()["token"]


@pytest.fixture(scope="module")
def admin_token():
    return login("admin@maestroegp.com", "admin123")


@pytest.fixture(scope="module")
def captain_token():
    return login("cap1@maestroegp.com", "cap123")


@pytest.fixture(scope="module", autouse=True)
def ensure_link(admin_token, captain_token):
    """Seed inserts captain_shift_links without tenant_id, which the API filters out.
    Re-link via API so my-shift returns linked=true. Also picks up the seeded shift."""
    # Find the seeded open shift (cashier1)
    r = requests.get(f"{API}/shifts", params={"status": "open"}, headers=H(admin_token), timeout=15)
    assert r.status_code == 200, r.text
    shifts = [s for s in r.json() if (s.get("cashier_name") or "").startswith("كاشير")]
    assert shifts, f"No seeded cashier shift found in {r.json()}"
    shift_id = shifts[0]["id"]
    # Find captain user id
    caps = requests.get(f"{API}/shifts/available-captains", headers=H(admin_token), timeout=15).json()
    cap = next((c for c in caps if c["email"] == "cap1@maestroegp.com"), None)
    assert cap, f"captain user not found: {caps}"
    # Link
    rlink = requests.post(f"{API}/shifts/{shift_id}/link-captain",
                          json={"captain_id": cap["id"]}, headers=H(admin_token), timeout=15)
    assert rlink.status_code == 200, f"link failed: {rlink.status_code} {rlink.text}"
    return {"shift_id": shift_id, "captain_id": cap["id"]}


@pytest.fixture(scope="module")
def wkeeper_token():
    return login("wkeeper@maestroegp.com", "wkeeper123")


def H(t):
    return {"Authorization": f"Bearer {t}"}


# --- Shift block tests ----------------------------------------------------

def test_captain_blocked_from_open_shift(captain_token):
    r = requests.post(f"{API}/shifts/open", json={"opening_cash": 0}, headers=H(captain_token), timeout=15)
    # Either 200 with blocked=true, or 400/403
    body = r.json() if r.headers.get("content-type", "").startswith("application/json") else {}
    assert r.status_code in (200, 400, 403), f"unexpected {r.status_code}: {r.text}"
    if r.status_code == 200:
        assert body.get("blocked") is True, f"expected blocked=true, got {body}"
        assert any(ch in (body.get("message") or "") for ch in ["كاشير", "وردية", "كابتن"]), body


def test_captain_blocked_from_auto_open(captain_token):
    r = requests.post(f"{API}/shifts/auto-open", json={}, headers=H(captain_token), timeout=15)
    body = r.json() if r.headers.get("content-type", "").startswith("application/json") else {}
    assert r.status_code in (200, 400, 403)
    if r.status_code == 200:
        assert body.get("blocked") is True, body


def test_wkeeper_blocked_from_open_shift(wkeeper_token):
    r = requests.post(f"{API}/shifts/open", json={"opening_cash": 0}, headers=H(wkeeper_token), timeout=15)
    body = r.json() if r.headers.get("content-type", "").startswith("application/json") else {}
    assert r.status_code in (200, 400, 403)
    if r.status_code == 200:
        assert body.get("blocked") is True, body


# --- Available captains + my-shift ---------------------------------------

def test_available_captains_admin(admin_token):
    r = requests.get(f"{API}/shifts/available-captains", headers=H(admin_token), timeout=15)
    assert r.status_code == 200, r.text
    arr = r.json()
    assert isinstance(arr, list)
    assert len(arr) >= 1
    # Each item should expose linked_shift_id and linked_cashier_name keys (may be null)
    for item in arr:
        assert "linked_shift_id" in item
        assert "linked_cashier_name" in item


def test_captain_my_shift_linked(captain_token):
    r = requests.get(f"{API}/captain/my-shift", headers=H(captain_token), timeout=15)
    assert r.status_code == 200, r.text
    data = r.json()
    assert data.get("linked") is True, data
    shift = data.get("shift") or {}
    assert shift.get("id"), f"no shift id in {data}"
    return data


# --- Order attribution ----------------------------------------------------

def get_seeded_shift_id(captain_token):
    r = requests.get(f"{API}/captain/my-shift", headers=H(captain_token), timeout=15)
    return r.json()["shift"]["id"], r.json()["shift"].get("cashier_id")


def get_any_product(admin_token):
    r = requests.get(f"{API}/products", headers=H(admin_token), timeout=15)
    assert r.status_code == 200
    products = r.json()
    assert len(products) > 0
    p = products[0]
    return {"product_id": p["id"], "product_name": p.get("name"),
            "quantity": 1, "price": p.get("price", 1000), "unit_price": p.get("price", 1000)}


def get_branch_id(admin_token):
    r = requests.get(f"{API}/branches", headers=H(admin_token), timeout=15)
    if r.status_code == 200 and r.json():
        return r.json()[0]["id"]
    return None


def test_captain_creates_dinein_attributed(admin_token, captain_token):
    shift_id, cashier_id = get_seeded_shift_id(captain_token)
    item = get_any_product(admin_token)
    branch_id = get_branch_id(admin_token)
    payload = {
        "order_type": "dine_in",
        "payment_method": "cash",
        "items": [item],
        "table_number": "T1",
        "branch_id": branch_id,
        "subtotal": item["price"],
        "total": item["price"],
    }
    r = requests.post(f"{API}/orders", json=payload, headers=H(captain_token), timeout=20)
    assert r.status_code in (200, 201), f"{r.status_code} {r.text}"
    o = r.json()
    assert o.get("shift_id") == shift_id, f"shift mismatch: {o.get('shift_id')} vs {shift_id}"
    assert o.get("cashier_id") == cashier_id, f"cashier mismatch: {o.get('cashier_id')} vs {cashier_id}"
    assert o.get("captain_id"), f"captain_id missing: {o}"
    assert o.get("captain_cash_status") == "held", f"expected held, got {o.get('captain_cash_status')}"


def test_captain_delivery_rejected(admin_token, captain_token):
    item = get_any_product(admin_token)
    branch_id = get_branch_id(admin_token)
    payload = {"order_type": "delivery", "payment_method": "cash", "items": [item],
               "branch_id": branch_id, "subtotal": item["price"], "total": item["price"]}
    r = requests.post(f"{API}/orders", json=payload, headers=H(captain_token), timeout=15)
    assert r.status_code == 400, f"expected 400, got {r.status_code}: {r.text}"
    assert "التوصيل" in r.text or "كاشير" in r.text


# --- Shift summary --------------------------------------------------------

def test_shift_summary_shows_held(admin_token, captain_token):
    shift_id, _ = get_seeded_shift_id(captain_token)
    r = requests.get(f"{API}/captains/shift-summary", params={"shift_id": shift_id}, headers=H(admin_token), timeout=15)
    assert r.status_code == 200, r.text
    data = r.json()
    assert "captains" in data or "rows" in data or isinstance(data, dict)
    # find totals
    totals = data.get("totals") or {}
    pending = totals.get("pending") or totals.get("total_pending") or 0
    assert pending > 0, f"expected pending>0, got totals={totals} data={data}"


# --- Close shift blocked then collect then close --------------------------

def test_close_blocked_then_collect_then_close(admin_token, captain_token):
    shift_id, _ = get_seeded_shift_id(captain_token)
    # 1) attempt close → 409 with CAPTAIN_CASH_PENDING
    r = requests.post(f"{API}/shifts/{shift_id}/close", json={"closing_cash": 0}, headers=H(admin_token), timeout=15)
    assert r.status_code == 409, f"expected 409, got {r.status_code} {r.text}"
    body = r.json()
    detail = body.get("detail") if isinstance(body, dict) else None
    code = (detail or {}).get("code") if isinstance(detail, dict) else None
    assert code == "CAPTAIN_CASH_PENDING", f"expected code CAPTAIN_CASH_PENDING, got {body}"

    # 2) get captain_id from summary then collect
    summary = requests.get(f"{API}/captains/shift-summary", params={"shift_id": shift_id}, headers=H(admin_token), timeout=15).json()
    captains = summary.get("captains") or summary.get("rows") or []
    captain_with_pending = None
    for c in captains:
        if (c.get("pending") or 0) > 0:
            captain_with_pending = c
            break
    assert captain_with_pending, f"no captain with pending in {summary}"
    captain_id = captain_with_pending.get("captain_id") or captain_with_pending.get("id")

    rc = requests.post(f"{API}/captains/collect", json={"shift_id": shift_id, "captain_id": captain_id},
                       headers=H(admin_token), timeout=15)
    assert rc.status_code == 200, f"collect failed: {rc.status_code} {rc.text}"
    collected = rc.json().get("collected_amount") or rc.json().get("amount") or 0
    assert collected > 0, rc.json()

    # 3) verify pending=0
    summary2 = requests.get(f"{API}/captains/shift-summary", params={"shift_id": shift_id}, headers=H(admin_token), timeout=15).json()
    totals2 = summary2.get("totals") or {}
    pending2 = totals2.get("pending") or totals2.get("total_pending") or 0
    handed2 = totals2.get("handed") or totals2.get("total_handed") or 0
    assert pending2 == 0, f"pending should be 0, got {pending2}"
    assert handed2 > 0, f"handed should be >0, got {handed2}"

    # 4) close shift now OK
    rclose = requests.post(f"{API}/shifts/{shift_id}/close", json={"closing_cash": 0}, headers=H(admin_token), timeout=15)
    assert rclose.status_code == 200, f"close still failing: {rclose.status_code} {rclose.text}"


# --- Regression: cashiers_only filter & delivery company attribution ------

def test_shifts_cashiers_only_excludes_non_cashier(admin_token):
    r = requests.get(f"{API}/shifts", params={"status": "open", "cashiers_only": "true"},
                     headers=H(admin_token), timeout=15)
    assert r.status_code == 200, r.text
    shifts = r.json()
    for s in shifts:
        role = (s.get("cashier_role") or s.get("user_role") or "").lower()
        # Role string may not be present, but if it is, it must not be a non-cashier role
        assert role not in ("warehouse_keeper", "captain"), f"non-cashier shift returned: {s}"
