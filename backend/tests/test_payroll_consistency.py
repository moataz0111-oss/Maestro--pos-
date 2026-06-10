"""
اختبار اتساق حساب الرواتب عبر المسارات الثلاثة:
  1) تقرير الرواتب /reports/payroll-summary  (المرجع)
  2) احتساب الراتب /payroll/calculate
  3) كشف الراتب الفردي /reports/employee-salary-slip/{id}
يجب أن يكون "صافي الراتب" متطابقاً تماماً في الثلاثة.

الصيغة الموحّدة:
  net = earned(pro-rata: daily_rate × أيام العمل) + overtime(approved×hourly×1.5)
        + bonuses - deductions - advance_installment(monthly_deduction, remaining>0)
"""
import os, json, urllib.request, urllib.error
from datetime import datetime, timezone
from pymongo import MongoClient

BASE = "http://localhost:8001/api"
MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "maestro_pos")
MONTH = "2026-06"
EMP_ID = "test-payroll-emp-001"
TENANT = "default"

client = MongoClient(MONGO_URL)
db = client[DB_NAME]


def _post(path, token=None, body=None):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(BASE + path, data=data, method="POST")
    req.add_header("Content-Type", "application/json")
    if token:
        req.add_header("Authorization", f"Bearer {token}")
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read().decode())


def _get(path, token=None):
    req = urllib.request.Request(BASE + path, method="GET")
    if token:
        req.add_header("Authorization", f"Bearer {token}")
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read().decode())


def seed():
    now = datetime.now(timezone.utc).isoformat()
    # تنظيف أي بيانات سابقة لهذا الموظف
    for col in ["employees", "attendance", "advances", "overtime_requests", "deductions", "bonuses", "salary_payments", "payroll"]:
        db[col].delete_many({"employee_id": EMP_ID})
    db.employees.delete_many({"id": EMP_ID})

    db.employees.insert_one({
        "id": EMP_ID, "tenant_id": TENANT, "name": "موظف اختبار الرواتب",
        "position": "كاشير", "branch_id": None, "salary": 600000,
        "salary_type": "monthly", "work_hours_per_day": 8,
        "is_active": True, "is_general_manager": False, "created_at": now,
    })
    # 10 أيام حضور (1..10 يونيو)
    for d in range(1, 11):
        db.attendance.insert_one({
            "id": f"att-{d}", "employee_id": EMP_ID, "tenant_id": TENANT,
            "date": f"{MONTH}-{d:02d}", "status": "present",
            "worked_hours": 8, "created_at": now,
        })
    # سلفة معتمدة: قسط شهري 50,000 ورصيد متبقٍّ 200,000
    db.advances.insert_one({
        "id": "adv-1", "employee_id": EMP_ID, "tenant_id": TENANT,
        "amount": 300000, "monthly_deduction": 50000, "remaining_amount": 200000,
        "status": "approved", "date": f"{MONTH}-01", "created_at": now,
    })
    # وقت إضافي معتمد: 5 ساعات
    db.overtime_requests.insert_one({
        "id": "ot-1", "employee_id": EMP_ID, "tenant_id": TENANT,
        "date": f"{MONTH}-05", "hours": 5, "status": "approved", "created_at": now,
    })


def expected_net():
    daily = 600000 / 30                # 20,000
    earned = round(daily * 10, 2)      # 200,000
    hourly = 600000 / (30 * 8)         # 2,500
    overtime = round(5 * hourly * 1.5, 2)  # 18,750
    advance = 50000
    return round(earned + overtime + 0 - 0 - advance, 2)  # 168,750


def main():
    seed()
    token = _post("/auth/login", body={"email": "admin@maestroegp.com", "password": "admin123"}).get("token")
    assert token, "login failed"

    exp = expected_net()

    # 1) تقرير الرواتب
    summary = _get(f"/reports/payroll-summary?month={MONTH}", token)
    emp_row = next((e for e in summary["employees"] if e["id"] == EMP_ID), None)
    assert emp_row, "employee not found in payroll-summary"
    net_table = emp_row["net_payable"]

    # 2) احتساب الراتب
    calc = _post(f"/payroll/calculate?employee_id={EMP_ID}&month={MONTH}", token)
    net_calc = calc["net_salary"]

    # 3) كشف الراتب الفردي
    slip = _get(f"/reports/employee-salary-slip/{EMP_ID}?month={MONTH}", token)
    net_slip = slip["summary"]["net_salary"]

    print(f"expected net        = {exp}")
    print(f"payroll-summary net = {net_table}")
    print(f"calculate net       = {net_calc}")
    print(f"salary-slip net     = {net_slip}")
    print(f"earned/ot table     = {emp_row.get('earned_salary')} / {emp_row.get('overtime_pay')}")
    print(f"advances table      = {emp_row.get('advances')}")

    assert abs(net_table - exp) < 0.01, f"table net {net_table} != expected {exp}"
    assert abs(net_calc - exp) < 0.01, f"calculate net {net_calc} != expected {exp}"
    assert abs(net_slip - exp) < 0.01, f"slip net {net_slip} != expected {exp}"
    assert net_table == net_calc == net_slip, "nets are not identical across the three endpoints"

    print("\n✅ PASS: net salary is IDENTICAL across all three endpoints and matches expected (168,750).")

    # تنظيف
    for col in ["employees", "attendance", "advances", "overtime_requests", "payroll"]:
        db[col].delete_many({"employee_id": EMP_ID})
    db.employees.delete_many({"id": EMP_ID})


if __name__ == "__main__":
    main()
