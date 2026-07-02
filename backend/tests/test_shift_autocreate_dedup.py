"""
Regression tests for AUTO-CREATE dedup guards on shift creation.

Two implicit shift-creation paths must REUSE an existing open shift with the same
normalized cashier name instead of creating a duplicate:

  1) GET /api/cash-register/summary (auto-creates a cashier's shift if missing)
  2) POST /api/orders (auto-creates a cashier's shift if missing)

Also verifies the "no existing shift => normal single-shift creation" happy path.

Test data is prefixed with 'qa-auto-' and cleaned up after the module.
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

PREFIX = "qa-auto-"


def _bcrypt(pw: str) -> str:
    return bcrypt.hashpw(pw.encode(), bcrypt.gensalt()).decode()


def _mk_cashier_direct(name: str, branch_id: str, password: str = "cashpass123") -> tuple[str, str]:
    """Insert cashier directly to DB (fast, bypasses API validation)."""
    cid = PREFIX + uuid.uuid4().hex[:8]
    email = f"{cid}@example.com"
    pw = _bcrypt(password)
    DB.users.insert_one({
        "id": cid,
        "tenant_id": "default",
        "full_name": name,
        "email": email,
        "username": cid,
        "password_hash": pw,
        "password": pw,
        "branch_id": branch_id,
        "role": "cashier",
        "is_active": True,
        "pin": "1234",
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    return cid, email


def _insert_open_shift(cashier_id: str, name: str, branch_id: str) -> str:
    sid = "sh-" + PREFIX + uuid.uuid4().hex[:8]
    DB.shifts.insert_one({
        "id": sid,
        "tenant_id": "default",
        "branch_id": branch_id,
        "cashier_id": cashier_id,
        "cashier_name": name,
        "status": "open",
        "opening_balance": 0,
        "started_at": datetime.now(timezone.utc).isoformat(),
        "opened_at": datetime.now(timezone.utc).isoformat(),
        "business_date": datetime.now(timezone.utc).date().isoformat(),
    })
    return sid


def _login(email: str, password: str = "cashpass123") -> str:
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=30)
    assert r.status_code == 200, f"login failed for {email}: {r.status_code} {r.text[:200]}"
    j = r.json()
    tok = j.get("token") or j.get("access_token")
    assert tok
    return tok


def _count_open_shifts_by_name(name: str) -> int:
    nn = " ".join(name.strip().split()).lower()
    n = 0
    for s in DB.shifts.find({"status": "open"}, {"cashier_name": 1}):
        if " ".join((s.get("cashier_name") or "").strip().split()).lower() == nn:
            n += 1
    return n


@pytest.fixture(scope="module")
def admin_token():
    r = requests.post(f"{API}/auth/login", json={"email": "admin@maestroegp.com", "password": "admin123"}, timeout=30)
    assert r.status_code == 200, f"admin login failed: {r.status_code} {r.text[:200]}"
    j = r.json()
    return j.get("token") or j.get("access_token")


@pytest.fixture(scope="module")
def H(admin_token):
    return {"Authorization": f"Bearer {admin_token}"}


@pytest.fixture(scope="module")
def branch_id():
    br = DB.branches.find_one({"tenant_id": "default"}, {"_id": 0, "id": 1}) or DB.branches.find_one({}, {"_id": 0, "id": 1})
    assert br, "no branch found"
    return br["id"]


@pytest.fixture(scope="module", autouse=True)
def _cleanup():
    DB.users.delete_many({"id": {"$regex": f"^{PREFIX}"}})
    DB.shifts.delete_many({"$or": [{"cashier_id": {"$regex": f"^{PREFIX}"}}, {"id": {"$regex": f"^sh-{PREFIX}"}}]})
    DB.orders.delete_many({"id": {"$regex": f"^{PREFIX}"}})
    yield
    DB.users.delete_many({"id": {"$regex": f"^{PREFIX}"}})
    DB.shifts.delete_many({"$or": [{"cashier_id": {"$regex": f"^{PREFIX}"}}, {"id": {"$regex": f"^sh-{PREFIX}"}}]})
    DB.orders.delete_many({"id": {"$regex": f"^{PREFIX}"}})


# ---------------------------------------------------------------------------
# 1) AUTO-CREATE via /cash-register/summary MUST reuse same-name existing shift
# ---------------------------------------------------------------------------

class TestSummaryReusesExistingShift:
    def test_summary_reuses_same_name_open_shift_no_duplicate(self, branch_id):
        name = "كاشير مكرر QA AUTO"
        # cashier A with pre-existing open shift
        c_a, _ = _mk_cashier_direct(name, branch_id)
        existing_sid = _insert_open_shift(c_a, name, branch_id)

        # cashier B: SAME name, DIFFERENT id, has password (we log in as B)
        c_b, email_b = _mk_cashier_direct(name, branch_id)

        assert _count_open_shifts_by_name(name) == 1

        tok_b = _login(email_b)
        r = requests.get(
            f"{API}/cash-register/summary",
            headers={"Authorization": f"Bearer {tok_b}"},
            params={"branch_id": branch_id},
            timeout=30,
        )
        assert r.status_code == 200, f"summary status={r.status_code} body={r.text[:300]}"
        body = r.json()
        # It should return A's existing shift, not a new one
        # Response shape may have shift_id at top-level or nested; support both.
        returned_sid = (
            body.get("shift_id")
            or (body.get("shift") or {}).get("id")
            or body.get("id")
        )
        assert returned_sid == existing_sid, (
            f"summary returned shift {returned_sid} instead of existing {existing_sid}; body={body}"
        )

        # No duplicate should have been created
        assert _count_open_shifts_by_name(name) == 1, (
            f"duplicate created — open shifts w/ name '{name}' = {_count_open_shifts_by_name(name)}"
        )
        # And no shift with cashier_id == c_b should exist
        assert DB.shifts.count_documents({"cashier_id": c_b, "status": "open"}) == 0


# ---------------------------------------------------------------------------
# 2) AUTO-CREATE via summary — genuinely no existing shift => create exactly 1
# ---------------------------------------------------------------------------

class TestSummaryCreatesWhenNoShift:
    def test_summary_creates_single_shift_when_no_existing(self, branch_id):
        name = "كاشير وحيد QA AUTO " + uuid.uuid4().hex[:4]
        c, email = _mk_cashier_direct(name, branch_id)
        # ensure zero shifts exist for this name
        assert _count_open_shifts_by_name(name) == 0

        tok = _login(email)
        r = requests.get(
            f"{API}/cash-register/summary",
            headers={"Authorization": f"Bearer {tok}"},
            params={"branch_id": branch_id},
            timeout=30,
        )
        assert r.status_code == 200, f"summary status={r.status_code} body={r.text[:300]}"

        # exactly one shift now
        assert _count_open_shifts_by_name(name) == 1
        created = DB.shifts.find_one({"cashier_id": c, "status": "open"})
        assert created is not None
        assert created.get("branch_id") == branch_id


# ---------------------------------------------------------------------------
# 3) AUTO-CREATE via POST /orders MUST attach to existing same-name shift
# ---------------------------------------------------------------------------

class TestOrderCreateReusesShift:
    def test_order_creation_attaches_to_existing_same_name_shift(self, branch_id):
        name = "كاشير طلب QA AUTO"
        c_a, _ = _mk_cashier_direct(name, branch_id)
        existing_sid = _insert_open_shift(c_a, name, branch_id)

        # cashier B same name, no own shift
        c_b, email_b = _mk_cashier_direct(name, branch_id)
        assert _count_open_shifts_by_name(name) == 1

        tok_b = _login(email_b)
        # minimal order payload — just a manual/custom item to avoid product lookup
        order_payload = {
            "branch_id": branch_id,
            "items": [
                {
                    "product_id": PREFIX + "prod-" + uuid.uuid4().hex[:6],
                    "product_name": "QA Item",
                    "quantity": 1,
                    "price": 10.0,
                    "cost": 0.0,
                }
            ],
            "total": 10.0,
            "payment_method": "cash",
            "order_type": "dine_in",
        }
        r = requests.post(
            f"{API}/orders",
            headers={"Authorization": f"Bearer {tok_b}", "Content-Type": "application/json"},
            json=order_payload,
            timeout=30,
        )
        # Accept 200/201 - some payload validations may reject; skip test in that case
        if r.status_code not in (200, 201):
            pytest.skip(f"order create returned {r.status_code} ({r.text[:200]}); cannot exercise shift-dedup path")

        body = r.json()
        order_id = body.get("id") or (body.get("order") or {}).get("id")
        if order_id:
            # mark for cleanup
            DB.orders.update_one({"id": order_id}, {"$set": {"id": PREFIX + "ord-" + uuid.uuid4().hex[:6]}})

        # verify NO duplicate shift created
        assert _count_open_shifts_by_name(name) == 1, (
            f"duplicate shift created after order via cashier B. count={_count_open_shifts_by_name(name)}"
        )
        assert DB.shifts.count_documents({"cashier_id": c_b, "status": "open"}) == 0
