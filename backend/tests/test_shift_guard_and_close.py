"""
Regression tests for the shift-open duplicate-name guard and shift close totals.

Covers:
  - GUARD block on POST /api/shifts/open-for-cashier for duplicate same-name cashier.
  - Own shift returns was_existing=true (not blocked).
  - Different-name cashier in same branch is still allowed (multi-cashier branches unaffected).
  - GUARD on POST /api/shifts (open_shift) => HTTP 400 with Arabic detail.
  - GUARD on POST /api/shifts/open (quick_open_shift) => blocked=True in body.
  - CLOSE totals: /api/shifts/{shift_id}/close counts orders by shift_id only.
"""

import os
import uuid
import pytest
import requests
import pymongo
import bcrypt
from datetime import datetime, timezone

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "http://localhost:8001").rstrip("/")
API = f"{BASE_URL}/api"
MONGO = pymongo.MongoClient(os.environ.get("MONGO_URL", "mongodb://localhost:27017"))
DB = MONGO[os.environ.get("DB_NAME", "maestro_pos")]

TEST_PREFIX = "qa-guard-"


def _bcrypt(pw: str) -> str:
    return bcrypt.hashpw(pw.encode(), bcrypt.gensalt()).decode()


@pytest.fixture(scope="module")
def admin_token():
    r = requests.post(f"{API}/auth/login", json={"email": "admin@maestroegp.com", "password": "admin123"}, timeout=30)
    assert r.status_code == 200, f"admin login failed: {r.status_code} {r.text[:200]}"
    j = r.json()
    tok = j.get("token") or j.get("access_token")
    assert tok, f"no token in response: {j}"
    return tok


@pytest.fixture(scope="module")
def H(admin_token):
    return {"Authorization": f"Bearer {admin_token}"}


@pytest.fixture(scope="module")
def branch_id():
    br = DB.branches.find_one({"tenant_id": "default"}, {"_id": 0, "id": 1}) or DB.branches.find_one({}, {"_id": 0, "id": 1})
    assert br, "no branch found in DB"
    return br["id"]


def _mk_cashier(name: str, password: str = "cashpass123"):
    cid = TEST_PREFIX + uuid.uuid4().hex[:8]
    pw = _bcrypt(password)
    DB.users.insert_one({
        "id": cid,
        "tenant_id": "default",
        "full_name": name,
        "email": f"{cid}@t.local",
        "username": cid,
        "password_hash": pw,
        "password": pw,
        "branch_id": None,
        "role": "cashier",
        "is_active": True,
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    return cid


@pytest.fixture(scope="module", autouse=True)
def _cleanup():
    # pre-clean
    DB.users.delete_many({"id": {"$regex": f"^{TEST_PREFIX}"}})
    DB.shifts.delete_many({"cashier_id": {"$regex": f"^{TEST_PREFIX}"}})
    DB.orders.delete_many({"id": {"$regex": f"^{TEST_PREFIX}"}})
    yield
    DB.users.delete_many({"id": {"$regex": f"^{TEST_PREFIX}"}})
    DB.shifts.delete_many({"cashier_id": {"$regex": f"^{TEST_PREFIX}"}})
    DB.orders.delete_many({"id": {"$regex": f"^{TEST_PREFIX}"}})


# --- open-for-cashier guard tests ---

class TestOpenForCashierGuard:
    def test_full_flow_block_own_diff(self, H, branch_id):
        name_dup = "كاشير مكرر QA"
        name_diff = "كاشير مختلف QA"
        c1 = _mk_cashier(name_dup)
        c2 = _mk_cashier(name_dup)
        c3 = _mk_cashier(name_diff)

        # ensure branch on each (some code paths need it)
        DB.users.update_many({"id": {"$in": [c1, c2, c3]}}, {"$set": {"branch_id": branch_id}})

        def open_for(cid):
            return requests.post(f"{API}/shifts/open-for-cashier", headers=H,
                                 json={"cashier_id": cid, "branch_id": branch_id, "opening_cash": 0}, timeout=30)

        # 1) open shift for cashier1 succeeds
        r1 = open_for(c1); assert r1.status_code == 200, r1.text
        j1 = r1.json()
        assert j1.get("shift") and j1["shift"].get("id"), j1
        assert j1.get("blocked") in (None, False)
        s1_id = j1["shift"]["id"]

        # 2) open shift for cashier2 (same name, diff id) -> blocked
        r2 = open_for(c2); assert r2.status_code == 200, r2.text
        j2 = r2.json()
        assert j2.get("blocked") is True, j2
        assert j2.get("shift") is None
        assert "يوجد وردية مفتوحة" in (j2.get("message") or "")
        # verify NO shift created in DB for c2
        assert DB.shifts.count_documents({"cashier_id": c2, "status": "open"}) == 0

        # 3) open again for cashier1 -> was_existing
        r3 = open_for(c1); assert r3.status_code == 200, r3.text
        j3 = r3.json()
        assert j3.get("was_existing") is True, j3
        assert j3["shift"]["id"] == s1_id

        # 4) different-name cashier3 in same branch -> allowed
        r4 = open_for(c3); assert r4.status_code == 200, r4.text
        j4 = r4.json()
        assert j4.get("shift") and j4["shift"].get("id"), j4
        assert j4.get("blocked") in (None, False)


# --- POST /shifts (open_shift) HTTP 400 guard test ---

class TestOpenShift400:
    def test_open_shift_returns_400_for_same_name(self, H, branch_id):
        name = "كاشير 400 QA"
        c1 = _mk_cashier(name)
        c2 = _mk_cashier(name)
        DB.users.update_many({"id": {"$in": [c1, c2]}}, {"$set": {"branch_id": branch_id}})

        # open for c1 via POST /shifts
        r1 = requests.post(f"{API}/shifts", headers=H,
                           json={"cashier_id": c1, "branch_id": branch_id, "opening_cash": 0}, timeout=30)
        assert r1.status_code == 200, r1.text

        # attempt to open for c2 via POST /shifts -> expect 400 with Arabic msg
        r2 = requests.post(f"{API}/shifts", headers=H,
                           json={"cashier_id": c2, "branch_id": branch_id, "opening_cash": 0}, timeout=30)
        assert r2.status_code == 400, f"expected 400 got {r2.status_code}: {r2.text}"
        detail = (r2.json().get("detail") or "")
        assert "يوجد وردية مفتوحة" in detail, detail


# --- POST /shifts/open (quick_open_shift) test ---

class TestQuickOpenBlocked:
    def test_quick_open_returns_blocked(self, H, branch_id):
        # Create two cashiers with same name; open a shift for one via admin,
        # then login as the OTHER cashier and call POST /shifts/open (quick).
        name = "كاشير كويك QA"
        c1 = _mk_cashier(name)
        c2 = _mk_cashier(name, password="cashpass123")
        DB.users.update_many({"id": {"$in": [c1, c2]}}, {"$set": {"branch_id": branch_id}})

        r_open = requests.post(f"{API}/shifts/open-for-cashier", headers=H,
                               json={"cashier_id": c1, "branch_id": branch_id, "opening_cash": 0}, timeout=30)
        assert r_open.status_code == 200 and r_open.json().get("shift"), r_open.text

        # login as c2 via email
        u = DB.users.find_one({"id": c2}, {"email": 1})
        login = requests.post(f"{API}/auth/login", json={"email": u["email"], "password": "cashpass123"}, timeout=30)
        if login.status_code != 200:
            pytest.skip(f"cannot login as cashier via API ({login.status_code}) - skipping quick-open test")
        tok2 = login.json().get("token") or login.json().get("access_token")
        assert tok2

        r = requests.post(f"{API}/shifts/open", headers={"Authorization": f"Bearer {tok2}"},
                          json={"opening_cash": 0, "branch_id": branch_id}, timeout=30)
        assert r.status_code == 200, r.text
        j = r.json()
        assert j.get("blocked") is True, j
        assert j.get("shift") is None
        assert "يوجد وردية مفتوحة" in (j.get("message") or "")


# --- Close shift totals test ---

class TestCloseShiftTotals:
    def test_close_totals_match_shift_orders_only(self, H, branch_id):
        name = "كاشير كلوز QA"
        c1 = _mk_cashier(name)
        DB.users.update_many({"id": c1}, {"$set": {"branch_id": branch_id}})

        # open shift
        r = requests.post(f"{API}/shifts/open-for-cashier", headers=H,
                          json={"cashier_id": c1, "branch_id": branch_id, "opening_cash": 0}, timeout=30)
        assert r.status_code == 200 and r.json().get("shift"), r.text
        shift = r.json()["shift"]
        shift_id = shift["id"]

        # Insert 3 orders tagged with shift_id directly into DB
        totals = [123.5, 250.0, 76.25]
        now = datetime.now(timezone.utc).isoformat()
        for t in totals:
            oid = TEST_PREFIX + uuid.uuid4().hex[:8]
            DB.orders.insert_one({
                "id": oid,
                "tenant_id": "default",
                "branch_id": branch_id,
                "cashier_id": c1,
                "cashier_name": name,
                "shift_id": shift_id,
                "status": "completed",
                "payment_method": "cash",
                "total": t,
                "total_cost": 0,
                "items": [],
                "created_at": now,
            })

        # Insert an UNRELATED order (different shift/cashier) to prove exclusion
        other_cashier = _mk_cashier("أخرى QA")
        DB.users.update_many({"id": other_cashier}, {"$set": {"branch_id": branch_id}})
        r_o = requests.post(f"{API}/shifts/open-for-cashier", headers=H,
                            json={"cashier_id": other_cashier, "branch_id": branch_id, "opening_cash": 0}, timeout=30)
        assert r_o.status_code == 200 and r_o.json().get("shift"), r_o.text
        other_shift_id = r_o.json()["shift"]["id"]
        DB.orders.insert_one({
            "id": TEST_PREFIX + uuid.uuid4().hex[:8],
            "tenant_id": "default",
            "branch_id": branch_id,
            "cashier_id": other_cashier,
            "cashier_name": "أخرى QA",
            "shift_id": other_shift_id,
            "status": "completed",
            "payment_method": "cash",
            "total": 9999.0,
            "total_cost": 0,
            "items": [],
            "created_at": now,
        })

        # close first shift
        rc = requests.post(f"{API}/shifts/{shift_id}/close", headers=H,
                           json={"closing_cash": 0}, timeout=60)
        assert rc.status_code == 200, rc.text

        # verify in DB
        closed = DB.shifts.find_one({"id": shift_id}, {"_id": 0})
        assert closed is not None
        assert closed.get("status") == "closed"
        expected_total = sum(totals)
        actual_total = float(closed.get("total_sales") or 0)
        assert abs(actual_total - expected_total) < 0.01, (
            f"total_sales={actual_total} expected={expected_total} (must NOT include unrelated 9999)"
        )
        assert closed.get("total_orders") == len(totals), closed.get("total_orders")
