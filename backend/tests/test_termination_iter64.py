"""Regression: employee end-of-service (termination) lifecycle. iter64.

Covers: terminate -> settlement preview, payout from owner treasury by branch,
reinstate reversal (returns balance), 24h auto-finalize -> archived + removed from active list.
"""
import os
import requests
from datetime import datetime, timezone, timedelta
from pymongo import MongoClient
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))

API = ""
with open(os.path.join(os.path.dirname(__file__), "..", "..", "frontend", ".env")) as f:
    for line in f:
        if line.startswith("REACT_APP_BACKEND_URL"):
            API = line.split("=", 1)[1].strip()
BASE = f"{API}/api"
BRANCH = "76f56acc-6948-4a2f-bbf4-feccbddea88f"
db = MongoClient(os.environ["MONGO_URL"])[os.environ["DB_NAME"]]
MONTH = datetime.now(timezone.utc).strftime("%Y-%m")


def _token():
    return requests.post(f"{BASE}/auth/login", json={"email": "admin@maestroegp.com", "password": "admin123"}, timeout=10).json()["token"]


def _clean():
    db.employees.delete_many({"id": "EMP-T64"})
    db.attendance.delete_many({"employee_id": "EMP-T64"})
    db.owner_deposits.delete_many({"id": "DEP-T64"})
    db.owner_withdrawals.delete_many({"linked_employee_id": "EMP-T64"})


def _seed(worked_days=10, deposit=1000000):
    _clean()
    db.employees.insert_one({"id": "EMP-T64", "name": "موظف اختبار64", "phone": "0770", "position": "كاشير",
                             "branch_id": BRANCH, "hire_date": "2026-01-01", "salary": 600000, "salary_type": "monthly",
                             "work_hours_per_day": 8, "is_active": True, "employment_status": "active", "tenant_id": "default"})
    for d in range(1, worked_days + 1):
        db.attendance.insert_one({"employee_id": "EMP-T64", "date": f"{MONTH}-{d:02d}", "status": "present", "worked_hours": 8})
    db.owner_deposits.insert_one({"id": "DEP-T64", "branch_id": BRANCH, "tenant_id": "default", "amount": deposit, "date": f"{MONTH}-01"})


def test_terminate_payout_and_reinstate_reversal():
    _seed()
    try:
        h = {"Authorization": f"Bearer {_token()}"}
        # terminate -> preview = 600000/30*10 = 200000
        r = requests.post(f"{BASE}/employees/EMP-T64/terminate", headers=h, timeout=15)
        assert r.status_code == 200 and r.json()["settlement_preview"] == 200000
        assert db.employees.find_one({"id": "EMP-T64"})["employment_status"] == "terminated_pending"
        # payout -> withdraw 200000 from owner treasury for the branch
        r2 = requests.post(f"{BASE}/employees/EMP-T64/terminate-payout", headers=h, timeout=15)
        assert r2.status_code == 200 and r2.json()["amount"] == 200000
        w = db.owner_withdrawals.find_one({"linked_employee_id": "EMP-T64"})
        assert w and w["amount"] == 200000 and w["category"] == "end_of_service" and w["branch_id"] == BRANCH
        # reinstate within 24h -> withdrawal removed, employee active again
        r3 = requests.post(f"{BASE}/employees/EMP-T64/reinstate", headers=h, timeout=15)
        assert r3.status_code == 200
        assert db.owner_withdrawals.find_one({"linked_employee_id": "EMP-T64"}) is None
        emp = db.employees.find_one({"id": "EMP-T64"})
        assert emp["employment_status"] == "active" and emp["is_active"] is True
    finally:
        _clean()


def test_auto_finalize_after_24h_archives_and_hides():
    _seed()
    try:
        h = {"Authorization": f"Bearer {_token()}"}
        requests.post(f"{BASE}/employees/EMP-T64/terminate", headers=h, timeout=15)
        # force the 24h window to be in the past
        db.employees.update_one({"id": "EMP-T64"}, {"$set": {"auto_finalize_at": (datetime.now(timezone.utc) - timedelta(minutes=1)).isoformat()}})
        # GET /employees triggers process_terminations
        active = requests.get(f"{BASE}/employees", headers=h, timeout=15).json()
        assert not any(e["id"] == "EMP-T64" for e in active), "finalized employee must be hidden from active list"
        archived = requests.get(f"{BASE}/employees?status=archived", headers=h, timeout=15).json()
        assert any(e["id"] == "EMP-T64" for e in archived), "finalized employee must appear in archive"
        emp = db.employees.find_one({"id": "EMP-T64"})
        assert emp["employment_status"] == "terminated" and emp["is_active"] is False and emp.get("pending_device_removal") is True
    finally:
        _clean()
