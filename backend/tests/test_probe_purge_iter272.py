"""Iteration 272: Automatic RW Probe cleanup + admin purge endpoint + iter271 security regression."""
import os
import uuid
import time
import asyncio
import subprocess
import pytest
import requests
from datetime import datetime, timezone
from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient

load_dotenv("/app/backend/.env")

BASE = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE:
    # fallback for tests context
    with open("/app/frontend/.env") as f:
        for line in f:
            if line.startswith("REACT_APP_BACKEND_URL="):
                BASE = line.split("=", 1)[1].strip().rstrip("/")
API = f"{BASE}/api"

MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ["DB_NAME"]


# ---------- helpers ----------
def _login(email, password, secret=None):
    body = {"email": email, "password": password}
    if secret:
        body["secret_key"] = secret
    r = requests.post(f"{API}/auth/login", json=body, timeout=15)
    return r


def _admin_token():
    r = _login("admin@maestroegp.com", "admin123")
    assert r.status_code == 200, f"admin login failed: {r.status_code} {r.text}"
    return r.json().get("token") or r.json().get("access_token")


def _cashier_token():
    r = _login("cashier1@maestroegp.com", "cash123")
    if r.status_code != 200:
        # try seeding
        subprocess.run(["python3", "/app/backend/seed_captain_test_data.py"], capture_output=True, timeout=60)
        r = _login("cashier1@maestroegp.com", "cash123")
    if r.status_code != 200:
        pytest.skip(f"cashier login unavailable: {r.status_code} {r.text[:200]}")
    return r.json().get("token") or r.json().get("access_token")


def _hdr(tok):
    return {"Authorization": f"Bearer {tok}"}


# ---------- Mongo helpers (sync via short async runs) ----------
def _run(coro):
    return asyncio.get_event_loop().run_until_complete(coro) if not asyncio.get_event_loop().is_running() else asyncio.run(coro)


async def _seed_probe():
    client = AsyncIOMotorClient(MONGO_URL)
    db = client[DB_NAME]
    shift_id = f"TEST_probe_{uuid.uuid4().hex[:8]}"
    await db.shifts.insert_one({
        "id": shift_id,
        "cashier_name": "RW Probe",
        "cashier_id": "probe_c1",
        "started_at": datetime.now(timezone.utc).isoformat(),
        "status": "open",
        "tenant_id": None,
    })
    order_ids = []
    for i in range(2):
        oid = f"TEST_order_{uuid.uuid4().hex[:8]}"
        order_ids.append(oid)
        await db.orders.insert_one({
            "id": oid,
            "order_number": f"TESTP-{i}",
            "cashier_name": "RW Probe",
            "shift_id": shift_id,
            "total": 0,
            "status": "completed",
            "tenant_id": None,
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
    # legitimate shift/order that should survive
    legit_shift = f"TEST_legit_{uuid.uuid4().hex[:8]}"
    await db.shifts.insert_one({
        "id": legit_shift,
        "cashier_name": "أحمد",
        "cashier_id": "legit_c1",
        "started_at": datetime.now(timezone.utc).isoformat(),
        "status": "open",
        "tenant_id": None,
    })
    client.close()
    return shift_id, order_ids, legit_shift


async def _count_probe():
    client = AsyncIOMotorClient(MONGO_URL)
    db = client[DB_NAME]
    rx = {"$regex": r"(rw\s*probe|read.?write\s*probe|pentest|sqlmap|burpsuite|nikto|<script)", "$options": "i"}
    s = await db.shifts.count_documents({"cashier_name": rx})
    o = await db.orders.count_documents({"cashier_name": rx})
    audit = await db.audit_logs.find_one({"action": "auto_purge_pentest_probe"}, sort=[("deleted_at", -1)])
    client.close()
    return s, o, audit


async def _shift_exists(sid):
    client = AsyncIOMotorClient(MONGO_URL)
    db = client[DB_NAME]
    doc = await db.shifts.find_one({"id": sid}, {"_id": 0, "id": 1, "cashier_name": 1})
    client.close()
    return doc


async def _cleanup_legit(sid):
    client = AsyncIOMotorClient(MONGO_URL)
    db = client[DB_NAME]
    await db.shifts.delete_many({"id": sid})
    client.close()


def _restart_backend_and_wait():
    subprocess.run(["sudo", "supervisorctl", "restart", "backend"], capture_output=True, timeout=60)
    # wait for /api/health
    for _ in range(40):
        try:
            r = requests.get(f"{API}/health", timeout=3)
            if r.status_code == 200:
                break
        except Exception:
            pass
        time.sleep(1)
    # deferred tasks sleep 2s before running; wait additional ~15s
    time.sleep(15)


# ================ Tests ================

class TestAutoProbeCleanup:
    def test_auto_purge_on_startup(self):
        shift_id, order_ids, legit_shift = asyncio.run(_seed_probe())
        # verify seeded
        s, o, _ = asyncio.run(_count_probe())
        assert s >= 1 and o >= 2, f"seed failed s={s} o={o}"

        _restart_backend_and_wait()

        s2, o2, audit = asyncio.run(_count_probe())
        assert s2 == 0, f"probe shifts still present: {s2}"
        assert o2 == 0, f"probe orders still present: {o2}"
        assert audit is not None, "no audit log auto_purge_pentest_probe found"
        assert audit.get("deleted_shifts", 0) >= 1
        assert audit.get("deleted_orders", 0) >= 2

        # legit shift survives
        legit = asyncio.run(_shift_exists(legit_shift))
        assert legit is not None and legit.get("cashier_name") == "أحمد", "legit Arabic shift got wrongly deleted"

        # cleanup our legit shift
        asyncio.run(_cleanup_legit(legit_shift))

    def test_idempotent_second_restart(self):
        # no probe data now; restart should not error
        _restart_backend_and_wait()
        s, o, _ = asyncio.run(_count_probe())
        assert s == 0 and o == 0
        # backend still healthy
        r = requests.get(f"{API}/health", timeout=5)
        assert r.status_code == 200


# ================ Admin purge endpoint ================

class TestAdminPurgeEndpoint:
    def test_dry_run_preview(self):
        # seed some probe data
        shift_id, order_ids, legit_shift = asyncio.run(_seed_probe())
        try:
            tok = _admin_token()
            r = requests.post(f"{API}/reports/purge-shift",
                              headers=_hdr(tok),
                              json={"cashier_name": "RW Probe", "dry_run": True},
                              timeout=15)
            assert r.status_code == 200, r.text
            data = r.json()
            assert data.get("dry_run") is True
            assert data.get("shifts_matched", 0) >= 1
            assert data.get("orders_matched", 0) >= 2
            # not actually deleted
            s, o, _ = asyncio.run(_count_probe())
            assert s >= 1 and o >= 2
        finally:
            # actual delete for cleanup
            tok = _admin_token()
            requests.post(f"{API}/reports/purge-shift",
                          headers=_hdr(tok),
                          json={"cashier_name": "RW Probe", "dry_run": False},
                          timeout=15)
            asyncio.run(_cleanup_legit(legit_shift))

    def test_actual_delete(self):
        shift_id, order_ids, legit_shift = asyncio.run(_seed_probe())
        try:
            tok = _admin_token()
            r = requests.post(f"{API}/reports/purge-shift",
                              headers=_hdr(tok),
                              json={"cashier_name": "RW Probe", "dry_run": False},
                              timeout=15)
            assert r.status_code == 200, r.text
            data = r.json()
            assert "message" in data
            assert data.get("deleted_shifts", 0) >= 1
            assert data.get("deleted_orders", 0) >= 2
            # Arabic message
            assert any(c in data["message"] for c in "تم"), data["message"]
            s, o, _ = asyncio.run(_count_probe())
            assert s == 0 and o == 0
        finally:
            asyncio.run(_cleanup_legit(legit_shift))

    def test_cashier_forbidden(self):
        tok = _cashier_token()
        r = requests.post(f"{API}/reports/purge-shift",
                          headers=_hdr(tok),
                          json={"cashier_name": "RW Probe", "dry_run": True},
                          timeout=15)
        assert r.status_code == 403, f"expected 403 got {r.status_code} {r.text}"

    def test_missing_params_400(self):
        tok = _admin_token()
        r = requests.post(f"{API}/reports/purge-shift",
                          headers=_hdr(tok),
                          json={"dry_run": True},
                          timeout=15)
        assert r.status_code == 400, f"expected 400 got {r.status_code} {r.text}"


# ================ iter271 security regression ================

class TestIter271Regression:
    def test_public_customer_menu_no_secrets(self):
        r = requests.get(f"{API}/customer/menu/default", timeout=15)
        assert r.status_code == 200, r.text
        text = r.text.lower()
        for banned in ["rent_cost", "buyer_name", "owner_percentage"]:
            assert banned not in text, f"leak: {banned} in public menu"

    def test_owner_login_requires_secret(self):
        r = _login("owner@maestroegp.com", "owner123")
        assert r.status_code == 403, f"owner without secret should be 403, got {r.status_code}"
        r2 = _login("owner@maestroegp.com", "owner123", secret="271018")
        assert r2.status_code == 200, r2.text

    def test_admin_login_no_secret_required(self):
        r = _login("admin@maestroegp.com", "admin123")
        assert r.status_code == 200, r.text

    def test_cashier_products_cost_hidden(self):
        tok = _cashier_token()
        r = requests.get(f"{API}/products", headers=_hdr(tok), timeout=15)
        assert r.status_code == 200, r.text
        items = r.json()
        if isinstance(items, list) and items:
            for p in items[:20]:
                # cost/profit must be zero for cashier
                if "cost" in p:
                    assert (p.get("cost") or 0) == 0, f"cashier saw cost {p.get('cost')}"
                if "profit" in p:
                    assert (p.get("profit") or 0) == 0, f"cashier saw profit {p.get('profit')}"

    def test_admin_products_cost_visible(self):
        tok = _admin_token()
        r = requests.get(f"{API}/products", headers=_hdr(tok), timeout=15)
        assert r.status_code == 200
        items = r.json()
        if isinstance(items, list) and items:
            # at least one product should have a non-null cost field (real cost)
            has_cost_field = any(("cost" in p) for p in items)
            assert has_cost_field, "admin should see cost field"

    def test_cashier_forbidden_endpoints(self):
        tok = _cashier_token()
        for path, method, body in [
            ("/payment-settings", "GET", None),
            ("/supplier-payment-dues", "GET", None),
            ("/callcenter/simulate", "POST", {}),
        ]:
            if method == "GET":
                r = requests.get(f"{API}{path}", headers=_hdr(tok), timeout=15)
            else:
                r = requests.post(f"{API}{path}", headers=_hdr(tok), json=body, timeout=15)
            assert r.status_code == 403, f"{method} {path} expected 403 got {r.status_code} {r.text[:150]}"

    def test_cashier_invoice_settings_masked(self):
        tok = _cashier_token()
        r = requests.get(f"{API}/system/invoice-settings", headers=_hdr(tok), timeout=15)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data.get("system_phone") in (None, ""), f"phone leak: {data.get('system_phone')}"
        assert data.get("system_email") in (None, ""), f"email leak: {data.get('system_email')}"

    def _branch_id(self, tok):
        r = requests.get(f"{API}/branches", headers=_hdr(tok), timeout=15)
        arr = r.json() if r.status_code == 200 else []
        return arr[0]["id"] if arr else "default"

    def _real_product(self, tok):
        r = requests.get(f"{API}/products", headers=_hdr(tok), timeout=15)
        arr = r.json() if r.status_code == 200 else []
        for p in arr:
            if (p.get("price") or 0) > 0:
                return p
        return None

    def test_order_price_guard_negative(self):
        tok = _cashier_token()
        bid = self._branch_id(tok)
        prod = self._real_product(tok)
        if not prod:
            pytest.skip("no product with price > 0")
        # try posting order with negative price on a real product
        payload = {
            "branch_id": bid,
            "items": [{"product_id": prod["id"], "product_name": prod.get("name", "x"), "name": prod.get("name", "x"), "quantity": 1, "price": -50}],
            "total": -50,
            "order_type": "dine_in",
        }
        r = requests.post(f"{API}/orders", headers=_hdr(tok), json=payload, timeout=15)
        assert r.status_code == 400, f"neg price expected 400 got {r.status_code} {r.text[:200]}"

    def test_order_price_guard_zero_high_qty(self):
        tok = _cashier_token()
        bid = self._branch_id(tok)
        prod = self._real_product(tok)
        if not prod:
            pytest.skip("no product with price > 0")
        payload = {
            "branch_id": bid,
            "items": [{"product_id": prod["id"], "product_name": prod.get("name", "x"), "name": prod.get("name", "x"), "quantity": 999, "price": 0}],
            "total": 0,
            "order_type": "dine_in",
        }
        r = requests.post(f"{API}/orders", headers=_hdr(tok), json=payload, timeout=15)
        assert r.status_code == 400, f"zero price qty999 (real product) expected 400 got {r.status_code} {r.text[:200]}"
