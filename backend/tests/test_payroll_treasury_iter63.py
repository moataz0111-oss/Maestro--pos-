"""Regression: payroll disbursement withdraws from owner treasury by employee branch. iter63."""
import os
import requests
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


def _token():
    r = requests.post(f"{BASE}/auth/login", json={"email": "admin@maestroegp.com", "password": "admin123"}, timeout=10)
    return r.json()["token"]


def _seed(net, deposit):
    _clean()
    db.employees.insert_one({"id": "EMP-PYT", "name": "موظف اختبار", "branch_id": BRANCH, "salary": 600000, "is_active": True, "tenant_id": "default"})
    db.payroll.insert_one({"id": "PYT-1", "employee_id": "EMP-PYT", "employee_name": "موظف اختبار", "month": "2026-06", "net_salary": net, "status": "draft", "tenant_id": "default"})
    db.owner_deposits.insert_one({"id": "DEP-PYT", "branch_id": BRANCH, "tenant_id": "default", "amount": deposit, "date": "2026-06-01"})


def _clean():
    db.employees.delete_many({"id": "EMP-PYT"})
    db.payroll.delete_many({"id": {"$in": ["PYT-1"]}})
    db.owner_deposits.delete_many({"id": "DEP-PYT"})
    db.owner_withdrawals.delete_many({"linked_payroll_id": "PYT-1"})


def test_payroll_pay_withdraws_from_owner_treasury_by_branch():
    _seed(net=500000, deposit=800000)
    try:
        h = {"Authorization": f"Bearer {_token()}"}
        r = requests.put(f"{BASE}/payroll/PYT-1/pay", headers=h, timeout=15)
        assert r.status_code == 200, r.text
        assert r.json()["amount_withdrawn"] == 500000
        # an owner withdrawal of 500k was created for the employee's branch
        w = db.owner_withdrawals.find_one({"linked_payroll_id": "PYT-1"})
        assert w and w["amount"] == 500000 and w["branch_id"] == BRANCH and w["category"] == "salary_payment"
        # payroll marked paid
        assert db.payroll.find_one({"id": "PYT-1"})["status"] == "paid"
        # double-pay is blocked
        r2 = requests.put(f"{BASE}/payroll/PYT-1/pay", headers=h, timeout=15)
        assert r2.status_code == 400
    finally:
        _clean()


def test_payroll_pay_blocked_on_insufficient_branch_balance():
    _seed(net=5000000, deposit=300000)
    try:
        h = {"Authorization": f"Bearer {_token()}"}
        r = requests.put(f"{BASE}/payroll/PYT-1/pay", headers=h, timeout=15)
        assert r.status_code == 400
        assert "غير كافٍ" in r.json()["detail"]
        # payroll NOT marked paid, no withdrawal created
        assert db.payroll.find_one({"id": "PYT-1"})["status"] == "draft"
        assert db.owner_withdrawals.find_one({"linked_payroll_id": "PYT-1"}) is None
    finally:
        _clean()
