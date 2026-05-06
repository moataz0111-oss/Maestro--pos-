"""
Iteration 170 - HR Fixes Phase 1
Tests:
  1. GET /api/employees/{employee_id}/account-statement (new)
  2. GET /api/payroll/{payroll_id}/print (new)
  3. Regressions for /api/payroll, /api/payroll/calculate, /api/payroll/{id}/pay,
     /api/biometric/devices, /api/employees
"""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://hr-fixes-phase1.preview.emergentagent.com").rstrip("/")
ADMIN_EMAIL = "hanialdujaili@gmail.com"
ADMIN_PASSWORD = "Hani@2024"


# ---------- Fixtures ----------
@pytest.fixture(scope="module")
def auth_headers():
    r = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
        timeout=30,
    )
    assert r.status_code == 200, f"Login failed: {r.status_code} {r.text}"
    token = r.json().get("access_token") or r.json().get("token")
    assert token, f"No token in response: {r.json()}"
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def employees(auth_headers):
    r = requests.get(f"{BASE_URL}/api/employees", headers=auth_headers, timeout=30)
    assert r.status_code == 200, f"/api/employees failed: {r.status_code} {r.text}"
    data = r.json()
    assert isinstance(data, list)
    return data


@pytest.fixture(scope="module")
def sample_employee(employees):
    if not employees:
        pytest.skip("No employees in tenant")
    return employees[0]


# ---------- Account Statement (new) ----------
class TestAccountStatement:
    def test_account_statement_success(self, auth_headers, sample_employee):
        emp_id = sample_employee["id"]
        r = requests.get(
            f"{BASE_URL}/api/employees/{emp_id}/account-statement",
            headers=auth_headers, timeout=30,
        )
        assert r.status_code == 200, f"{r.status_code} {r.text}"
        data = r.json()

        # Top-level shape
        for key in ["employee", "branch", "deductions", "bonuses", "advances",
                    "payrolls", "attendance", "totals", "generated_at"]:
            assert key in data, f"missing key: {key}"

        # Employee echo
        assert data["employee"]["id"] == emp_id

        # Collections are lists
        for key in ["deductions", "bonuses", "advances", "payrolls", "attendance"]:
            assert isinstance(data[key], list), f"{key} must be list"

        # Totals shape
        totals = data["totals"]
        for key in ["total_deductions", "total_bonuses", "remaining_advances",
                    "total_paid_payrolls", "attendance_days", "absent_days"]:
            assert key in totals, f"totals missing: {key}"
            assert isinstance(totals[key], (int, float)), f"totals.{key} must be numeric"

    def test_account_statement_404(self, auth_headers):
        r = requests.get(
            f"{BASE_URL}/api/employees/nonexistent-xyz-000/account-statement",
            headers=auth_headers, timeout=30,
        )
        assert r.status_code == 404, f"expected 404 got {r.status_code} {r.text}"

    def test_account_statement_unauthenticated(self):
        r = requests.get(
            f"{BASE_URL}/api/employees/any/account-statement",
            timeout=30,
        )
        assert r.status_code in (401, 403), f"{r.status_code} {r.text}"

    def test_account_statement_date_filter(self, auth_headers, sample_employee):
        emp_id = sample_employee["id"]
        r = requests.get(
            f"{BASE_URL}/api/employees/{emp_id}/account-statement",
            params={"start_date": "2025-01-01", "end_date": "2025-12-31"},
            headers=auth_headers, timeout=30,
        )
        assert r.status_code == 200
        data = r.json()
        assert "totals" in data


# ---------- Payroll print (new) ----------
class TestPayrollPrint:
    def test_payroll_print_404(self, auth_headers):
        r = requests.get(
            f"{BASE_URL}/api/payroll/fake-id-xyz-999/print",
            headers=auth_headers, timeout=30,
        )
        assert r.status_code == 404, f"expected 404 got {r.status_code} {r.text}"

    def test_payroll_print_success_if_data_exists(self, auth_headers):
        r = requests.get(f"{BASE_URL}/api/payroll", headers=auth_headers, timeout=30)
        assert r.status_code == 200
        payrolls = r.json()
        if not payrolls:
            pytest.skip("no payrolls to print")
        pid = payrolls[0]["id"]
        r2 = requests.get(
            f"{BASE_URL}/api/payroll/{pid}/print",
            headers=auth_headers, timeout=30,
        )
        assert r2.status_code == 200, f"{r2.status_code} {r2.text}"
        data = r2.json()
        for key in ["payroll", "employee", "branch", "deductions", "bonuses", "advances"]:
            assert key in data, f"missing key: {key}"
        assert data["payroll"]["id"] == pid
        assert isinstance(data["deductions"], list)
        assert isinstance(data["bonuses"], list)
        assert isinstance(data["advances"], list)


# ---------- Regressions ----------
class TestRegressions:
    def test_employees_list(self, auth_headers):
        r = requests.get(f"{BASE_URL}/api/employees", headers=auth_headers, timeout=30)
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_payroll_list(self, auth_headers):
        r = requests.get(f"{BASE_URL}/api/payroll", headers=auth_headers, timeout=30)
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_payroll_calculate(self, auth_headers, sample_employee):
        emp_id = sample_employee["id"]
        r = requests.post(
            f"{BASE_URL}/api/payroll/calculate",
            params={"employee_id": emp_id, "month": "2026-01"},
            headers=auth_headers, timeout=30,
        )
        assert r.status_code == 200, f"{r.status_code} {r.text}"
        data = r.json()
        for key in ["employee_id", "basic_salary", "net_salary",
                    "total_deductions", "total_bonuses", "advance_deduction"]:
            assert key in data

    def test_payroll_pay_404(self, auth_headers):
        r = requests.put(
            f"{BASE_URL}/api/payroll/nonexistent-xyz/pay",
            headers=auth_headers, timeout=30,
        )
        assert r.status_code == 404

    def test_biometric_devices(self, auth_headers):
        r = requests.get(f"{BASE_URL}/api/biometric/devices",
                         headers=auth_headers, timeout=30)
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_branches(self, auth_headers):
        r = requests.get(f"{BASE_URL}/api/branches",
                         headers=auth_headers, timeout=30)
        assert r.status_code == 200
        assert isinstance(r.json(), list)
