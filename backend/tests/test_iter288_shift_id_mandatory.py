"""Iter 288 tests: shift_id MANDATORY on summary/close + WhatsApp status/logout + Lazy Shift.

Verifies:
1. GET /api/cash-register/summary WITHOUT shift_id → 400 with Arabic "shift_id إلزامي"
2. POST /api/cash-register/close   WITHOUT shift_id → 400 with same phrase
3. Summary with fake shift_id → 404
4. Summary with real shift_id → correct totals & cashier_name
5. Cashier cannot see another cashier's shift (403/404)
6. Lazy Shift Opening on POST /api/orders creates shift for cashier w/o open shift
7. Super-admin WhatsApp status returns qr/connected/error fields
8. Super-admin WhatsApp logout returns ok:true
"""
import os, subprocess, uuid, time
import pytest
import requests

BASE = os.environ.get("BACKEND_URL", "http://localhost:8001").rstrip("/")
API = f"{BASE}/api"
BRANCH_ID = "76f56acc-6948-4a2f-bbf4-feccbddea88f"


# ---------- fixtures ----------
@pytest.fixture(scope="module")
def seeded():
    script = os.path.join(os.path.dirname(__file__), "..", "seed_owner_cashier_close_test.py")
    subprocess.run(["python3", script], check=True, capture_output=True)
    time.sleep(0.5)
    return {"owner": "closefix-shift-owner", "cashier": "closefix-shift-cashier"}


@pytest.fixture(scope="module")
def admin_token():
    r = requests.post(f"{API}/auth/login",
                      json={"email": "admin@maestroegp.com", "password": "admin123"},
                      timeout=15)
    assert r.status_code == 200, r.text
    return r.json()["token"]


@pytest.fixture(scope="module")
def cashier_token():
    r = requests.post(f"{API}/auth/login",
                      json={"email": "closefix-cashier@maestroegp.com", "password": "test1234"},
                      timeout=15)
    if r.status_code != 200:
        pytest.skip(f"cashier login failed: {r.text}")
    return r.json()["token"]


@pytest.fixture(scope="module")
def super_admin_token():
    r = requests.post(f"{API}/super-admin/login",
                      json={"email": "owner@maestroegp.com",
                            "password": "owner123",
                            "secret_key": "271018",
                            "device_id": "iter288-tester"},
                      timeout=15)
    if r.status_code != 200:
        pytest.skip(f"super_admin login failed: {r.status_code} {r.text}")
    j = r.json()
    if "token" not in j:
        # 2FA challenge path
        pytest.skip(f"super_admin login returned 2FA challenge: {j}")
    return j["token"]


def _H(t): return {"Authorization": f"Bearer {t}"}


# ---------- 1) shift_id mandatory: summary ----------
def test_summary_without_shift_id_returns_400(admin_token):
    r = requests.get(f"{API}/cash-register/summary", headers=_H(admin_token), timeout=10)
    assert r.status_code == 400, f"expected 400, got {r.status_code}: {r.text}"
    detail = r.json().get("detail", "")
    assert "shift_id" in detail and "إلزامي" in detail, f"Arabic mandatory msg missing: {detail}"


# ---------- 2) shift_id mandatory: close ----------
def test_close_without_shift_id_returns_400(admin_token):
    payload = {"denominations": {}, "actual_cash": 0}  # no shift_id
    r = requests.post(f"{API}/cash-register/close", json=payload,
                      headers=_H(admin_token), timeout=10)
    assert r.status_code == 400, f"expected 400, got {r.status_code}: {r.text}"
    detail = r.json().get("detail", "")
    assert "shift_id" in detail and "إلزامي" in detail, f"Arabic mandatory msg missing: {detail}"


# ---------- 3) fake shift_id → 404 ----------
def test_summary_fake_shift_id_returns_404(admin_token):
    r = requests.get(f"{API}/cash-register/summary",
                     params={"shift_id": f"nonexistent-{uuid.uuid4()}"},
                     headers=_H(admin_token), timeout=10)
    assert r.status_code == 404, f"expected 404, got {r.status_code}: {r.text}"


# ---------- 4) real shift_id → correct totals ----------
def test_summary_cashier_shift_totals(seeded, admin_token):
    r = requests.get(f"{API}/cash-register/summary",
                     params={"shift_id": seeded["cashier"]},
                     headers=_H(admin_token), timeout=10)
    assert r.status_code == 200, r.text
    d = r.json()
    total = float(d.get("total_sales") or d.get("cash_sales") or 0)
    assert total == 802750.0, f"expected 802750.0, got {total}"
    name = d.get("cashier_name", "")
    assert "احمد" in name, f"expected cashier name 'احمد اختبار', got {name!r}"


def test_summary_owner_shift_totals(seeded, admin_token):
    r = requests.get(f"{API}/cash-register/summary",
                     params={"shift_id": seeded["owner"]},
                     headers=_H(admin_token), timeout=10)
    assert r.status_code == 200, r.text
    d = r.json()
    total = float(d.get("total_sales") or d.get("cash_sales") or 0)
    assert total == 79500.0, f"expected 79500.0, got {total}"
    name = d.get("cashier_name", "")
    # مدير النظام or admin's full_name
    assert name, f"cashier_name should not be empty"


# ---------- 5) cashier isolation ----------
def test_cashier_cannot_access_owner_shift(seeded, cashier_token):
    r = requests.get(f"{API}/cash-register/summary",
                     params={"shift_id": seeded["owner"]},
                     headers=_H(cashier_token), timeout=10)
    assert r.status_code in (403, 404), f"expected 403/404, got {r.status_code}: {r.text}"


def test_cashier_cannot_close_owner_shift(seeded, cashier_token):
    r = requests.post(f"{API}/cash-register/close",
                      json={"shift_id": seeded["owner"], "denominations": {}, "actual_cash": 0},
                      headers=_H(cashier_token), timeout=10)
    assert r.status_code in (403, 404), f"expected 403/404, got {r.status_code}: {r.text}"


# ---------- 6) Lazy Shift Opening ----------
def test_lazy_shift_opening_on_order(admin_token):
    """Create fresh cashier without open shift → POST order → shift auto-created."""
    from pymongo import MongoClient
    from dotenv import load_dotenv
    load_dotenv("/app/backend/.env")
    mc = MongoClient(os.environ["MONGO_URL"])
    db = mc[os.environ["DB_NAME"]]

    import bcrypt
    email = f"lazy-{uuid.uuid4().hex[:8]}@maestroegp.com"
    user_id = str(uuid.uuid4())
    db.users.insert_one({
        "id": user_id, "username": f"lazy_{user_id[:6]}", "email": email,
        "password": bcrypt.hashpw(b"lazy1234", bcrypt.gensalt()).decode(),
        "full_name": f"كاشير اختبار {uuid.uuid4().hex[:4]}", "role": "cashier",
        "branch_id": BRANCH_ID, "tenant_id": "default", "is_active": True, "permissions": [],
    })
    # make sure no shift open for this user
    db.shifts.delete_many({"cashier_id": user_id})

    login = requests.post(f"{API}/auth/login",
                          json={"email": email, "password": "lazy1234"}, timeout=10)
    assert login.status_code == 200, login.text
    tok = login.json()["token"]

    # submit an order (empty items to keep simple)
    order = {
        "items": [],
        "total": 0,
        "order_type": "takeaway",
        "payment_method": "cash",
        "branch_id": BRANCH_ID,
        "status": "completed",
    }
    r = requests.post(f"{API}/orders", json=order, headers=_H(tok), timeout=15)
    # even if 400 (empty items), the lazy-shift logic runs after find; check DB directly
    # Actually validation may reject empty items. Try with a minimal item.
    if r.status_code >= 400:
        # try with dummy item
        order["items"] = [{"product_id": "test", "product_name": "test", "quantity": 1, "price": 0, "total": 0}]
        r = requests.post(f"{API}/orders", json=order, headers=_H(tok), timeout=15)

    # Whether or not order succeeds, if it reached shift-creation branch, we'll see a shift
    time.sleep(0.5)
    shift = db.shifts.find_one({"cashier_id": user_id, "status": "open"}, {"_id": 0})

    # cleanup
    db.users.delete_one({"id": user_id})
    if shift:
        db.shifts.delete_many({"cashier_id": user_id})

    assert r.status_code == 200, f"order failed: {r.status_code} {r.text}"
    assert shift is not None, "Lazy shift not created for cashier without open shift"
    assert shift.get("opening_balance") == 0
    assert shift.get("status") == "open"


# ---------- 7 & 8) WhatsApp super-admin endpoints ----------
def test_wa_status_shape(super_admin_token):
    r = requests.get(f"{API}/super-admin/whatsapp/status",
                     headers=_H(super_admin_token), timeout=15)
    assert r.status_code == 200, r.text
    d = r.json()
    # per playbook: qr, connected, error fields present
    for k in ("qr", "connected", "error"):
        assert k in d, f"missing key {k} in whatsapp/status: {list(d.keys())}"


def test_wa_logout_ok(super_admin_token):
    r = requests.post(f"{API}/super-admin/whatsapp/logout",
                      headers=_H(super_admin_token), timeout=20)
    assert r.status_code == 200, r.text
    d = r.json()
    # accept either {ok:true} or {success:true}
    assert d.get("ok") is True or d.get("success") is True, f"expected ok/success true: {d}"


if __name__ == "__main__":
    pytest.main([__file__, "-xvs"])
