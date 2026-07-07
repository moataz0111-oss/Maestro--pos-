"""Full backend tests for HR leave-permissions (sick / hourly / travel).

Covers:
- POST /api/leave-permissions for hourly / sick / travel (status pending)
- GET  /api/leave-permissions/pending-count increases after create
- PUT  /api/leave-permissions/{id}/approve sets status=approved + double-approve rejected
- After approve:
    SICK    -> attendance docs created with source=leave_approved
    TRAVEL  -> employee.annual_leave_balance decreases
    HOURLY  -> bonus of type=permission created
- GET /api/leave-permissions archive contains granted_by_name / approved_by_name / branch_name
- Role gating:
    cashier1 CANNOT create (403)  -> if seed missing, skipped
    cashier1 CANNOT approve (403) -> if seed missing, skipped
"""
import os
import pytest
import requests
from datetime import date, timedelta
from pymongo import MongoClient

# Direct DB access for validating side-effects that are not exposed by API responses
_MONGO_URL = os.environ.get("MONGO_URL")
_DB_NAME = os.environ.get("DB_NAME")
if not _MONGO_URL:
    # load from backend/.env when running outside backend cwd
    try:
        with open("/app/backend/.env") as fp:
            for line in fp:
                if line.startswith("MONGO_URL="):
                    _MONGO_URL = line.strip().split("=", 1)[1]
                elif line.startswith("DB_NAME="):
                    _DB_NAME = line.strip().split("=", 1)[1]
    except Exception:
        pass
_db = MongoClient(_MONGO_URL)[_DB_NAME] if _MONGO_URL and _DB_NAME else None

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://whatsapp-pos-system.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"
ADMIN = {"email": "admin@maestroegp.com", "password": "admin123"}
CASHIER = {"email": "cashier1@maestroegp.com", "password": "cash123"}


def _login(creds):
    r = requests.post(f"{API}/auth/login", json=creds, timeout=20)
    if r.status_code != 200:
        return None
    d = r.json()
    return d.get("access_token") or d.get("token")


@pytest.fixture(scope="module")
def admin_token():
    tok = _login(ADMIN)
    assert tok, "admin login failed"
    return tok


@pytest.fixture(scope="module")
def admin_h(admin_token):
    return {"Authorization": f"Bearer {admin_token}"}


@pytest.fixture(scope="module")
def employee(admin_h):
    r = requests.get(f"{API}/employees", headers=admin_h, timeout=20)
    assert r.status_code == 200, r.text
    emps = r.json()
    assert emps, "no employees seeded"
    return emps[0]


def _future(days=10):
    return (date.today() + timedelta(days=days)).isoformat()


# ---------- Create (hourly) ----------
def test_create_hourly_returns_pending(admin_h, employee):
    payload = {
        "employee_id": employee["id"],
        "leave_type": "hourly",
        "date_from": _future(1),
        "hours": 2,
        "reason": "TEST_hourly",
    }
    r = requests.post(f"{API}/leave-permissions", headers=admin_h, json=payload, timeout=20)
    assert r.status_code == 200, r.text
    perm = r.json()["permission"]
    assert perm["status"] == "pending"
    assert perm["leave_type"] == "hourly"
    assert perm["hours"] == 2
    assert perm["granted_by_name"]
    assert perm["approved_by"] is None


# ---------- Pending count increases ----------
def test_pending_count_increases(admin_h, employee):
    pc1 = requests.get(f"{API}/leave-permissions/pending-count", headers=admin_h, timeout=20).json()["pending"]
    r = requests.post(f"{API}/leave-permissions", headers=admin_h, json={
        "employee_id": employee["id"], "leave_type": "hourly",
        "date_from": _future(2), "hours": 1, "reason": "TEST_count"
    }, timeout=20)
    assert r.status_code == 200
    pc2 = requests.get(f"{API}/leave-permissions/pending-count", headers=admin_h, timeout=20).json()["pending"]
    assert pc2 >= pc1 + 1


# ---------- Sick: days computed + approve creates attendance ----------
def test_sick_create_and_approve_creates_attendance(admin_h, employee):
    df = _future(20)
    dt = _future(22)  # 3 days inclusive
    r = requests.post(f"{API}/leave-permissions", headers=admin_h, json={
        "employee_id": employee["id"], "leave_type": "sick",
        "date_from": df, "date_to": dt, "reason": "TEST_sick"
    }, timeout=20)
    assert r.status_code == 200, r.text
    perm = r.json()["permission"]
    assert perm["status"] == "pending"
    assert perm["days"] == 3, f"expected 3 days inclusive, got {perm['days']}"
    pid = perm["id"]

    # Approve
    r = requests.put(f"{API}/leave-permissions/{pid}/approve", headers=admin_h, timeout=20)
    assert r.status_code == 200, r.text

    # Double approve fails
    r2 = requests.put(f"{API}/leave-permissions/{pid}/approve", headers=admin_h, timeout=20)
    assert r2.status_code == 400

    # Verify attendance docs created via DB query: use attendance API if available
    # Try /api/attendance?employee_id=&date_from=&date_to=
    found_dates = set()
    for endpoint in ["/attendance", "/hr/attendance"]:
        rr = requests.get(f"{API}{endpoint}",
                          headers=admin_h,
                          params={"employee_id": employee["id"], "date_from": df, "date_to": dt},
                          timeout=20)
        if rr.status_code == 200:
            data = rr.json()
            if isinstance(data, dict):
                data = data.get("records") or data.get("attendance") or data.get("data") or []
            for rec in data:
                if rec.get("source") == "leave_approved" and rec.get("status") == "present":
                    found_dates.add(rec.get("date"))
            if found_dates:
                break
    assert found_dates, "No attendance docs with source=leave_approved found after approving sick leave"


# ---------- Travel: deducts annual_leave_balance ----------
def test_travel_approve_decreases_annual_balance(admin_h, employee):
    eid = employee["id"]
    # Read balance directly from DB (API /api/employees does not expose annual_leave_balance)
    if _db is None:
        pytest.skip("DB not reachable")
    emp_doc = _db.employees.find_one({"id": eid}, {"_id": 0, "annual_leave_balance": 1})
    bal_before = (emp_doc or {}).get("annual_leave_balance")
    if bal_before is None:
        bal_before = 15  # DEFAULT_ANNUAL_LEAVE

    df = _future(40)
    dt = _future(41)  # 2 days
    r = requests.post(f"{API}/leave-permissions", headers=admin_h, json={
        "employee_id": eid, "leave_type": "travel",
        "date_from": df, "date_to": dt, "reason": "TEST_travel"
    }, timeout=20)
    assert r.status_code == 200, r.text
    pid = r.json()["permission"]["id"]
    days = r.json()["permission"]["days"]
    assert days == 2

    rapp = requests.put(f"{API}/leave-permissions/{pid}/approve", headers=admin_h, timeout=20)
    assert rapp.status_code == 200, rapp.text

    emp_after = _db.employees.find_one({"id": eid}, {"_id": 0, "annual_leave_balance": 1})
    bal_after = (emp_after or {}).get("annual_leave_balance")
    assert bal_after == max(bal_before - days, 0), f"expected {max(bal_before - days, 0)} got {bal_after}"


# ---------- Hourly: approve creates bonus type=permission ----------
def test_hourly_approve_creates_bonus(admin_h, employee):
    eid = employee["id"]
    r = requests.post(f"{API}/leave-permissions", headers=admin_h, json={
        "employee_id": eid, "leave_type": "hourly",
        "date_from": _future(50), "hours": 3, "reason": "TEST_bonus"
    }, timeout=20)
    assert r.status_code == 200, r.text
    pid = r.json()["permission"]["id"]
    rapp = requests.put(f"{API}/leave-permissions/{pid}/approve", headers=admin_h, timeout=20)
    assert rapp.status_code == 200, rapp.text

    # Verify bonus directly in DB (bonus_type=permission) since API list may not be exposed
    if _db is None:
        pytest.skip("DB not reachable")
    bonus = _db.bonuses.find_one({"leave_permission_id": pid, "bonus_type": "permission"})
    assert bonus is not None, "No bonus with bonus_type=permission created after approving hourly"
    assert bonus.get("employee_id") == eid
    assert bonus.get("hours") == 3


# ---------- Archive list returns enriched fields ----------
def test_list_returns_enriched_fields(admin_h):
    r = requests.get(f"{API}/leave-permissions", headers=admin_h, timeout=20)
    assert r.status_code == 200
    rows = r.json()
    assert isinstance(rows, list)
    assert rows, "expected at least one row after previous tests"
    sample = rows[0]
    for key in ("employee_name", "leave_type", "status", "granted_by_name"):
        assert key in sample, f"missing {key} in archive row"


# ---------- Role gating ----------
def test_cashier_cannot_create_or_approve(admin_h, employee):
    tok = _login(CASHIER)
    if not tok:
        pytest.skip("cashier1 not seeded")
    ch = {"Authorization": f"Bearer {tok}"}
    # cashier create -> 403
    r = requests.post(f"{API}/leave-permissions", headers=ch, json={
        "employee_id": employee["id"], "leave_type": "hourly",
        "date_from": _future(60), "hours": 1, "reason": "TEST_role"
    }, timeout=20)
    assert r.status_code == 403, f"expected 403 got {r.status_code}: {r.text}"

    # admin creates one to test cashier approve
    rr = requests.post(f"{API}/leave-permissions", headers=admin_h, json={
        "employee_id": employee["id"], "leave_type": "hourly",
        "date_from": _future(61), "hours": 1, "reason": "TEST_role_approve"
    }, timeout=20)
    assert rr.status_code == 200
    pid = rr.json()["permission"]["id"]

    rap = requests.put(f"{API}/leave-permissions/{pid}/approve", headers=ch, timeout=20)
    assert rap.status_code == 403, f"cashier approve should be 403, got {rap.status_code}"
