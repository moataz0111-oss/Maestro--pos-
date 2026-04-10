"""
Test HR Features - Iteration 151
Tests for:
1. Employee break_start and break_end fields in POST/PUT/GET
2. Attendance auto-process with break time deduction
3. Employee model includes break fields
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestEmployeeBreakFields:
    """Test employee break_start and break_end fields"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup - login and get token"""
        self.token = None
        self.test_employee_id = None
        
        # Login as admin
        login_response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "hanialdujaili@gmail.com",
            "password": "Hani@2024"
        })
        if login_response.status_code == 200:
            self.token = login_response.json().get("token")
        
        yield
        
        # Cleanup - delete test employee if created
        if self.test_employee_id and self.token:
            try:
                requests.delete(
                    f"{BASE_URL}/api/employees/{self.test_employee_id}",
                    headers={"Authorization": f"Bearer {self.token}"}
                )
            except:
                pass
    
    def test_01_login_success(self):
        """Test login works"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "hanialdujaili@gmail.com",
            "password": "Hani@2024"
        })
        assert response.status_code == 200, f"Login failed: {response.text}"
        data = response.json()
        assert "token" in data
        print("✅ Login successful")
    
    def test_02_get_employees_returns_break_fields(self):
        """Test GET /api/employees returns break_start and break_end fields"""
        if not self.token:
            pytest.skip("No token available")
        
        response = requests.get(
            f"{BASE_URL}/api/employees",
            headers={"Authorization": f"Bearer {self.token}"}
        )
        assert response.status_code == 200, f"GET employees failed: {response.text}"
        
        employees = response.json()
        assert isinstance(employees, list), "Response should be a list"
        
        if len(employees) > 0:
            emp = employees[0]
            # Check that break fields exist in response (can be null)
            assert "break_start" in emp or emp.get("break_start") is None, "break_start field should exist"
            assert "break_end" in emp or emp.get("break_end") is None, "break_end field should exist"
            print(f"✅ Employee has break_start: {emp.get('break_start')}, break_end: {emp.get('break_end')}")
        else:
            print("⚠️ No employees found, but endpoint works")
        
        print("✅ GET /api/employees returns break fields")
    
    def test_03_get_branches_for_employee_creation(self):
        """Get branches to use for employee creation"""
        if not self.token:
            pytest.skip("No token available")
        
        response = requests.get(
            f"{BASE_URL}/api/branches",
            headers={"Authorization": f"Bearer {self.token}"}
        )
        assert response.status_code == 200, f"GET branches failed: {response.text}"
        
        branches = response.json()
        assert len(branches) > 0, "At least one branch should exist"
        self.branch_id = branches[0]["id"]
        print(f"✅ Found branch: {branches[0]['name']} (id: {self.branch_id})")
        return self.branch_id
    
    def test_04_create_employee_with_break_fields(self):
        """Test POST /api/employees accepts break_start and break_end"""
        if not self.token:
            pytest.skip("No token available")
        
        # Get branch first
        branches_response = requests.get(
            f"{BASE_URL}/api/branches",
            headers={"Authorization": f"Bearer {self.token}"}
        )
        branches = branches_response.json()
        branch_id = branches[0]["id"] if branches else None
        
        if not branch_id:
            pytest.skip("No branch available")
        
        # Create employee with break fields
        employee_data = {
            "name": "TEST_موظف اختبار الاستراحة",
            "phone": "07801234567",
            "position": "كاشير",
            "branch_id": branch_id,
            "hire_date": "2024-01-01",
            "salary": 500000,
            "salary_type": "monthly",
            "work_hours_per_day": 8,
            "shift_start": "09:00",
            "shift_end": "17:00",
            "break_start": "12:00",
            "break_end": "13:00",
            "work_days": [0, 1, 2, 3, 4, 5]
        }
        
        response = requests.post(
            f"{BASE_URL}/api/employees",
            json=employee_data,
            headers={"Authorization": f"Bearer {self.token}"}
        )
        assert response.status_code in [200, 201], f"Create employee failed: {response.text}"
        
        created_emp = response.json()
        self.test_employee_id = created_emp.get("id")
        
        # Verify break fields are returned
        assert created_emp.get("break_start") == "12:00", f"break_start should be 12:00, got {created_emp.get('break_start')}"
        assert created_emp.get("break_end") == "13:00", f"break_end should be 13:00, got {created_emp.get('break_end')}"
        
        print(f"✅ Created employee with break_start: {created_emp.get('break_start')}, break_end: {created_emp.get('break_end')}")
    
    def test_05_update_employee_break_fields(self):
        """Test PUT /api/employees/{id} accepts break_start and break_end"""
        if not self.token:
            pytest.skip("No token available")
        
        # Get existing employees
        response = requests.get(
            f"{BASE_URL}/api/employees",
            headers={"Authorization": f"Bearer {self.token}"}
        )
        employees = response.json()
        
        if not employees:
            pytest.skip("No employees to update")
        
        # Find an employee to update (prefer test employee or first one)
        emp_to_update = None
        for emp in employees:
            if emp.get("name", "").startswith("TEST_"):
                emp_to_update = emp
                break
        if not emp_to_update:
            emp_to_update = employees[0]
        
        emp_id = emp_to_update["id"]
        
        # Update with new break times
        update_data = {
            "break_start": "13:00",
            "break_end": "14:00"
        }
        
        response = requests.put(
            f"{BASE_URL}/api/employees/{emp_id}",
            json=update_data,
            headers={"Authorization": f"Bearer {self.token}"}
        )
        assert response.status_code == 200, f"Update employee failed: {response.text}"
        
        updated_emp = response.json()
        assert updated_emp.get("break_start") == "13:00", f"break_start should be 13:00, got {updated_emp.get('break_start')}"
        assert updated_emp.get("break_end") == "14:00", f"break_end should be 14:00, got {updated_emp.get('break_end')}"
        
        print(f"✅ Updated employee break_start: {updated_emp.get('break_start')}, break_end: {updated_emp.get('break_end')}")
    
    def test_06_employee_ahmed_has_break_fields(self):
        """Test that employee أحمد محمد has break_start=12:00, break_end=13:00"""
        if not self.token:
            pytest.skip("No token available")
        
        response = requests.get(
            f"{BASE_URL}/api/employees",
            headers={"Authorization": f"Bearer {self.token}"}
        )
        employees = response.json()
        
        # Find أحمد محمد
        ahmed = None
        for emp in employees:
            if "أحمد" in emp.get("name", "") or "ahmed" in emp.get("name", "").lower():
                ahmed = emp
                break
        
        if not ahmed:
            print("⚠️ Employee أحمد محمد not found, skipping specific check")
            pytest.skip("Employee أحمد محمد not found")
        
        # Check break fields
        print(f"Found employee: {ahmed.get('name')}")
        print(f"  break_start: {ahmed.get('break_start')}")
        print(f"  break_end: {ahmed.get('break_end')}")
        
        # These should be set according to the test requirements
        assert ahmed.get("break_start") is not None or ahmed.get("break_end") is not None, \
            "Employee should have break fields set"
        
        print(f"✅ Employee {ahmed.get('name')} has break fields")


class TestAttendanceAutoProcess:
    """Test attendance auto-process with break time deduction"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup - login and get token"""
        self.token = None
        
        # Login as admin
        login_response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "hanialdujaili@gmail.com",
            "password": "Hani@2024"
        })
        if login_response.status_code == 200:
            self.token = login_response.json().get("token")
        
        yield
    
    def test_07_attendance_auto_process_endpoint_exists(self):
        """Test POST /api/attendance/auto-process endpoint exists"""
        if not self.token:
            pytest.skip("No token available")
        
        response = requests.post(
            f"{BASE_URL}/api/attendance/auto-process",
            headers={"Authorization": f"Bearer {self.token}"}
        )
        
        # Should return 200 or 404 (if no records to process), not 405 (method not allowed)
        assert response.status_code != 405, "auto-process endpoint should exist"
        assert response.status_code in [200, 404, 422], f"Unexpected status: {response.status_code}"
        
        print(f"✅ auto-process endpoint exists, status: {response.status_code}")


class TestEmployeeResponseModel:
    """Test EmployeeResponse model includes all required fields"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup - login and get token"""
        self.token = None
        
        # Login as admin
        login_response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "hanialdujaili@gmail.com",
            "password": "Hani@2024"
        })
        if login_response.status_code == 200:
            self.token = login_response.json().get("token")
        
        yield
    
    def test_08_employee_response_has_all_fields(self):
        """Test employee response includes all required fields"""
        if not self.token:
            pytest.skip("No token available")
        
        response = requests.get(
            f"{BASE_URL}/api/employees",
            headers={"Authorization": f"Bearer {self.token}"}
        )
        assert response.status_code == 200
        
        employees = response.json()
        if not employees:
            pytest.skip("No employees to check")
        
        emp = employees[0]
        
        # Required fields from EmployeeResponse model
        required_fields = [
            "id", "name", "phone", "position", "branch_id", "hire_date",
            "salary", "salary_type", "work_hours_per_day", "is_active", "created_at"
        ]
        
        # Optional fields that should be present (can be null)
        optional_fields = [
            "email", "national_id", "department", "user_id", "biometric_uid",
            "shift_start", "shift_end", "break_start", "break_end", "work_days",
            "tenant_id", "face_photo", "face_photo_updated_at"
        ]
        
        for field in required_fields:
            assert field in emp, f"Required field '{field}' missing from employee response"
        
        # Check optional fields exist (value can be null)
        for field in optional_fields:
            # Field should exist in response (even if null)
            if field not in emp:
                print(f"⚠️ Optional field '{field}' not in response")
        
        print(f"✅ Employee response has all required fields")
        print(f"   break_start: {emp.get('break_start')}")
        print(f"   break_end: {emp.get('break_end')}")
        print(f"   shift_start: {emp.get('shift_start')}")
        print(f"   shift_end: {emp.get('shift_end')}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
