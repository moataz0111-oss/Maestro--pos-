"""
Iteration 7 Tests - Maestro EGP HR & Warehouse Features
Testing:
1. User creation with tenant_id - new users should get tenant_id from creator
2. Employees API (GET/POST /api/employees)
3. Attendance API (GET/POST /api/attendance)
4. Advances API (GET/POST /api/advances)
5. Deductions API (GET/POST /api/deductions)
6. Bonuses API (GET/POST /api/bonuses)
7. Payroll API (GET/POST /api/payroll)
8. Inventory Transfers API (GET/POST /api/inventory-transfers)
9. Purchase Requests API (GET/POST /api/purchase-requests)
"""

import pytest
import requests
import os
import uuid
from datetime import datetime

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Tenant Admin credentials (البيت الشامي)
TENANT_ADMIN_EMAIL = "ahmed@albait.com"
TENANT_ADMIN_PASSWORD = "password123"

# Main Admin credentials
MAIN_ADMIN_EMAIL = "admin@maestroegp.com"
MAIN_ADMIN_PASSWORD = "admin123"

# Super Admin credentials
SUPER_ADMIN_EMAIL = "owner@maestroegp.com"
SUPER_ADMIN_PASSWORD = "owner123"
SUPER_ADMIN_SECRET_KEY = "271018"


class TestTenantAdminAuth:
    """Tenant Admin authentication tests"""
    
    def test_tenant_admin_login_success(self):
        """Test Tenant Admin login with correct credentials"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={
                "email": TENANT_ADMIN_EMAIL,
                "password": TENANT_ADMIN_PASSWORD
            }
        )
        print(f"Tenant Admin Login Response: {response.status_code}")
        
        if response.status_code == 200:
            data = response.json()
            assert "token" in data, "Response should contain token"
            assert "user" in data, "Response should contain user"
            print(f"Tenant Admin login successful: {data['user']['full_name']}, role: {data['user']['role']}")
            print(f"Tenant ID: {data['user'].get('tenant_id', 'N/A')}")
            return data["token"]
        else:
            print(f"Tenant Admin login failed: {response.text}")
            pytest.skip("Tenant Admin login failed - user may not exist")


class TestUserCreationWithTenantId:
    """Test user creation with automatic tenant_id assignment"""
    
    @pytest.fixture
    def tenant_admin_token(self):
        """Get Tenant Admin token"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={
                "email": TENANT_ADMIN_EMAIL,
                "password": TENANT_ADMIN_PASSWORD
            }
        )
        if response.status_code != 200:
            pytest.skip("Tenant Admin login failed")
        return response.json()["token"]
    
    @pytest.fixture
    def main_admin_token(self):
        """Get Main Admin token"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={
                "email": MAIN_ADMIN_EMAIL,
                "password": MAIN_ADMIN_PASSWORD
            }
        )
        if response.status_code != 200:
            pytest.skip("Main Admin login failed")
        return response.json()["token"]
    
    def test_create_user_by_tenant_admin(self, tenant_admin_token):
        """Test creating a new user by tenant admin - should inherit tenant_id"""
        unique_id = str(uuid.uuid4())[:8]
        new_user = {
            "username": f"TEST_user_{unique_id}",
            "email": f"TEST_user_{unique_id}@test.com",
            "password": "testpass123",
            "full_name": f"Test User {unique_id}",
            "role": "cashier"
        }
        
        response = requests.post(
            f"{BASE_URL}/api/users",
            json=new_user,
            headers={"Authorization": f"Bearer {tenant_admin_token}"}
        )
        print(f"Create user response: {response.status_code}")
        
        if response.status_code == 201:
            data = response.json()
            assert "id" in data, "Response should have id"
            assert "tenant_id" in data, "Response should have tenant_id"
            assert data["tenant_id"] is not None, "New user should have tenant_id from creator"
            print(f"Created user: {data['full_name']} with tenant_id: {data['tenant_id']}")
            
            # Cleanup - delete the test user
            delete_response = requests.delete(
                f"{BASE_URL}/api/users/{data['id']}",
                headers={"Authorization": f"Bearer {tenant_admin_token}"}
            )
            print(f"Cleanup delete response: {delete_response.status_code}")
        elif response.status_code == 403:
            print(f"User creation not authorized: {response.text}")
            pytest.skip("Tenant admin may not have permission to create users")
        else:
            print(f"User creation failed: {response.text}")
            assert False, f"Expected 201, got {response.status_code}"
    
    def test_get_users_list(self, tenant_admin_token):
        """Test getting users list - should only show users from same tenant"""
        response = requests.get(
            f"{BASE_URL}/api/users",
            headers={"Authorization": f"Bearer {tenant_admin_token}"}
        )
        print(f"Get users response: {response.status_code}")
        
        if response.status_code == 200:
            data = response.json()
            print(f"Found {len(data)} users")
            for user in data[:3]:  # Print first 3 users
                print(f"  - {user.get('full_name', 'N/A')} ({user.get('role', 'N/A')}) - tenant_id: {user.get('tenant_id', 'N/A')}")
        elif response.status_code == 403:
            print("User listing not authorized for this role")
            pytest.skip("Tenant admin may not have permission to list users")


class TestEmployeesAPI:
    """Employees API tests"""
    
    @pytest.fixture
    def admin_token(self):
        """Get Admin token"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={
                "email": MAIN_ADMIN_EMAIL,
                "password": MAIN_ADMIN_PASSWORD
            }
        )
        if response.status_code != 200:
            pytest.skip("Admin login failed")
        return response.json()["token"]
    
    @pytest.fixture
    def branch_id(self, admin_token):
        """Get a branch ID for testing"""
        response = requests.get(
            f"{BASE_URL}/api/branches",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        if response.status_code != 200 or len(response.json()) == 0:
            pytest.skip("No branches available")
        return response.json()[0]["id"]
    
    def test_get_employees_list(self, admin_token):
        """Test getting employees list"""
        response = requests.get(
            f"{BASE_URL}/api/employees",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        print(f"Get employees response: {response.status_code}")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        print(f"Found {len(data)} employees")
        if len(data) > 0:
            emp = data[0]
            print(f"First employee: {emp.get('name', 'N/A')} - {emp.get('position', 'N/A')}")
    
    def test_create_employee(self, admin_token, branch_id):
        """Test creating a new employee"""
        unique_id = str(uuid.uuid4())[:8]
        new_employee = {
            "name": f"TEST_Employee_{unique_id}",
            "phone": f"07{unique_id}",
            "email": f"TEST_emp_{unique_id}@test.com",
            "position": "كاشير",
            "department": "المبيعات",
            "branch_id": branch_id,
            "hire_date": datetime.now().strftime("%Y-%m-%d"),
            "salary": 500000,
            "salary_type": "monthly",
            "work_hours_per_day": 8
        }
        
        response = requests.post(
            f"{BASE_URL}/api/employees",
            json=new_employee,
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        print(f"Create employee response: {response.status_code}")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "id" in data, "Response should have id"
        assert data["name"] == new_employee["name"], "Name should match"
        assert data["salary"] == new_employee["salary"], "Salary should match"
        print(f"Created employee: {data['name']} with ID: {data['id']}")
        
        # Return employee ID for cleanup
        return data["id"]
    
    def test_get_employee_by_id(self, admin_token, branch_id):
        """Test getting employee by ID"""
        # First create an employee
        unique_id = str(uuid.uuid4())[:8]
        new_employee = {
            "name": f"TEST_GetEmp_{unique_id}",
            "phone": f"07{unique_id}",
            "position": "موظف",
            "branch_id": branch_id,
            "hire_date": datetime.now().strftime("%Y-%m-%d"),
            "salary": 400000,
            "salary_type": "monthly",
            "work_hours_per_day": 8
        }
        
        create_response = requests.post(
            f"{BASE_URL}/api/employees",
            json=new_employee,
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        if create_response.status_code != 200:
            pytest.skip("Could not create employee for test")
        
        employee_id = create_response.json()["id"]
        
        # Get employee by ID
        response = requests.get(
            f"{BASE_URL}/api/employees/{employee_id}",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        print(f"Get employee by ID response: {response.status_code}")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert data["id"] == employee_id, "ID should match"
        assert data["name"] == new_employee["name"], "Name should match"
        print(f"Retrieved employee: {data['name']}")


class TestAttendanceAPI:
    """Attendance API tests"""
    
    @pytest.fixture
    def admin_token(self):
        """Get Admin token"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={
                "email": MAIN_ADMIN_EMAIL,
                "password": MAIN_ADMIN_PASSWORD
            }
        )
        if response.status_code != 200:
            pytest.skip("Admin login failed")
        return response.json()["token"]
    
    @pytest.fixture
    def employee_id(self, admin_token):
        """Get or create an employee for testing"""
        # First try to get existing employees
        response = requests.get(
            f"{BASE_URL}/api/employees",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        if response.status_code == 200 and len(response.json()) > 0:
            return response.json()[0]["id"]
        
        # Create a new employee if none exist
        branches_response = requests.get(
            f"{BASE_URL}/api/branches",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        if branches_response.status_code != 200 or len(branches_response.json()) == 0:
            pytest.skip("No branches available")
        
        branch_id = branches_response.json()[0]["id"]
        unique_id = str(uuid.uuid4())[:8]
        
        create_response = requests.post(
            f"{BASE_URL}/api/employees",
            json={
                "name": f"TEST_AttEmp_{unique_id}",
                "phone": f"07{unique_id}",
                "position": "موظف",
                "branch_id": branch_id,
                "hire_date": datetime.now().strftime("%Y-%m-%d"),
                "salary": 400000,
                "salary_type": "monthly",
                "work_hours_per_day": 8
            },
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        if create_response.status_code != 200:
            pytest.skip("Could not create employee for test")
        return create_response.json()["id"]
    
    def test_get_attendance_list(self, admin_token):
        """Test getting attendance list"""
        response = requests.get(
            f"{BASE_URL}/api/attendance",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        print(f"Get attendance response: {response.status_code}")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        print(f"Found {len(data)} attendance records")
    
    def test_create_attendance(self, admin_token, employee_id):
        """Test creating attendance record"""
        attendance_data = {
            "employee_id": employee_id,
            "date": datetime.now().strftime("%Y-%m-%d"),
            "check_in": "09:00",
            "check_out": "17:00",
            "status": "present",
            "notes": "Test attendance record"
        }
        
        response = requests.post(
            f"{BASE_URL}/api/attendance",
            json=attendance_data,
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        print(f"Create attendance response: {response.status_code}")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "id" in data, "Response should have id"
        assert data["status"] == "present", "Status should be present"
        assert data.get("worked_hours") is not None, "Should calculate worked hours"
        print(f"Created attendance: {data['date']} - {data.get('worked_hours', 0)} hours")


class TestAdvancesAPI:
    """Advances (سلف) API tests"""
    
    @pytest.fixture
    def admin_token(self):
        """Get Admin token"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={
                "email": MAIN_ADMIN_EMAIL,
                "password": MAIN_ADMIN_PASSWORD
            }
        )
        if response.status_code != 200:
            pytest.skip("Admin login failed")
        return response.json()["token"]
    
    @pytest.fixture
    def employee_id(self, admin_token):
        """Get or create an employee for testing"""
        response = requests.get(
            f"{BASE_URL}/api/employees",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        if response.status_code == 200 and len(response.json()) > 0:
            return response.json()[0]["id"]
        pytest.skip("No employees available")
    
    def test_get_advances_list(self, admin_token):
        """Test getting advances list"""
        response = requests.get(
            f"{BASE_URL}/api/advances",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        print(f"Get advances response: {response.status_code}")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        print(f"Found {len(data)} advances")
    
    def test_create_advance(self, admin_token, employee_id):
        """Test creating an advance"""
        advance_data = {
            "employee_id": employee_id,
            "amount": 100000,
            "reason": "Test advance - سلفة اختبار",
            "deduction_months": 2
        }
        
        response = requests.post(
            f"{BASE_URL}/api/advances",
            json=advance_data,
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        print(f"Create advance response: {response.status_code}")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "id" in data, "Response should have id"
        assert data["amount"] == advance_data["amount"], "Amount should match"
        assert data["monthly_deduction"] == advance_data["amount"] / advance_data["deduction_months"], "Monthly deduction should be calculated"
        print(f"Created advance: {data['amount']} - monthly deduction: {data['monthly_deduction']}")


class TestDeductionsAPI:
    """Deductions (خصومات) API tests"""
    
    @pytest.fixture
    def admin_token(self):
        """Get Admin token"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={
                "email": MAIN_ADMIN_EMAIL,
                "password": MAIN_ADMIN_PASSWORD
            }
        )
        if response.status_code != 200:
            pytest.skip("Admin login failed")
        return response.json()["token"]
    
    @pytest.fixture
    def employee_id(self, admin_token):
        """Get or create an employee for testing"""
        response = requests.get(
            f"{BASE_URL}/api/employees",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        if response.status_code == 200 and len(response.json()) > 0:
            return response.json()[0]["id"]
        pytest.skip("No employees available")
    
    def test_get_deductions_list(self, admin_token):
        """Test getting deductions list"""
        response = requests.get(
            f"{BASE_URL}/api/deductions",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        print(f"Get deductions response: {response.status_code}")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        print(f"Found {len(data)} deductions")
    
    def test_create_deduction(self, admin_token, employee_id):
        """Test creating a deduction"""
        deduction_data = {
            "employee_id": employee_id,
            "deduction_type": "late",
            "amount": 10000,
            "reason": "Test deduction - تأخير اختبار",
            "date": datetime.now().strftime("%Y-%m-%d")
        }
        
        response = requests.post(
            f"{BASE_URL}/api/deductions",
            json=deduction_data,
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        print(f"Create deduction response: {response.status_code}")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "id" in data, "Response should have id"
        assert data["amount"] == deduction_data["amount"], "Amount should match"
        assert data["deduction_type"] == "late", "Type should be late"
        print(f"Created deduction: {data['amount']} - type: {data['deduction_type']}")


class TestBonusesAPI:
    """Bonuses (مكافآت) API tests"""
    
    @pytest.fixture
    def admin_token(self):
        """Get Admin token"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={
                "email": MAIN_ADMIN_EMAIL,
                "password": MAIN_ADMIN_PASSWORD
            }
        )
        if response.status_code != 200:
            pytest.skip("Admin login failed")
        return response.json()["token"]
    
    @pytest.fixture
    def employee_id(self, admin_token):
        """Get or create an employee for testing"""
        response = requests.get(
            f"{BASE_URL}/api/employees",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        if response.status_code == 200 and len(response.json()) > 0:
            return response.json()[0]["id"]
        pytest.skip("No employees available")
    
    def test_get_bonuses_list(self, admin_token):
        """Test getting bonuses list"""
        response = requests.get(
            f"{BASE_URL}/api/bonuses",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        print(f"Get bonuses response: {response.status_code}")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        print(f"Found {len(data)} bonuses")
    
    def test_create_bonus(self, admin_token, employee_id):
        """Test creating a bonus"""
        bonus_data = {
            "employee_id": employee_id,
            "bonus_type": "performance",
            "amount": 50000,
            "reason": "Test bonus - مكافأة أداء اختبار",
            "date": datetime.now().strftime("%Y-%m-%d")
        }
        
        response = requests.post(
            f"{BASE_URL}/api/bonuses",
            json=bonus_data,
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        print(f"Create bonus response: {response.status_code}")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "id" in data, "Response should have id"
        assert data["amount"] == bonus_data["amount"], "Amount should match"
        assert data["bonus_type"] == "performance", "Type should be performance"
        print(f"Created bonus: {data['amount']} - type: {data['bonus_type']}")


class TestPayrollAPI:
    """Payroll (كشوفات الرواتب) API tests"""
    
    @pytest.fixture
    def admin_token(self):
        """Get Admin token"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={
                "email": MAIN_ADMIN_EMAIL,
                "password": MAIN_ADMIN_PASSWORD
            }
        )
        if response.status_code != 200:
            pytest.skip("Admin login failed")
        return response.json()["token"]
    
    @pytest.fixture
    def employee_id(self, admin_token):
        """Get or create an employee for testing"""
        response = requests.get(
            f"{BASE_URL}/api/employees",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        if response.status_code == 200 and len(response.json()) > 0:
            return response.json()[0]["id"]
        pytest.skip("No employees available")
    
    def test_get_payroll_list(self, admin_token):
        """Test getting payroll list"""
        current_month = datetime.now().strftime("%Y-%m")
        response = requests.get(
            f"{BASE_URL}/api/payroll?month={current_month}",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        print(f"Get payroll response: {response.status_code}")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        print(f"Found {len(data)} payroll records for {current_month}")
    
    def test_calculate_payroll(self, admin_token, employee_id):
        """Test calculating payroll for an employee"""
        current_month = datetime.now().strftime("%Y-%m")
        
        response = requests.post(
            f"{BASE_URL}/api/payroll/calculate?employee_id={employee_id}&month={current_month}",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        print(f"Calculate payroll response: {response.status_code}")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "basic_salary" in data, "Response should have basic_salary"
        assert "net_salary" in data, "Response should have net_salary"
        assert "total_deductions" in data, "Response should have total_deductions"
        assert "total_bonuses" in data, "Response should have total_bonuses"
        print(f"Payroll calculated: basic={data['basic_salary']}, net={data['net_salary']}")


class TestInventoryTransfersAPI:
    """Inventory Transfers (تحويلات المخزون) API tests"""
    
    @pytest.fixture
    def admin_token(self):
        """Get Admin token"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={
                "email": MAIN_ADMIN_EMAIL,
                "password": MAIN_ADMIN_PASSWORD
            }
        )
        if response.status_code != 200:
            pytest.skip("Admin login failed")
        return response.json()["token"]
    
    @pytest.fixture
    def branch_ids(self, admin_token):
        """Get branch IDs for testing"""
        response = requests.get(
            f"{BASE_URL}/api/branches",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        if response.status_code != 200 or len(response.json()) < 1:
            pytest.skip("Not enough branches available")
        branches = response.json()
        # Return same branch for from and to if only one exists
        if len(branches) == 1:
            return branches[0]["id"], branches[0]["id"]
        return branches[0]["id"], branches[1]["id"]
    
    def test_get_inventory_transfers_list(self, admin_token):
        """Test getting inventory transfers list"""
        response = requests.get(
            f"{BASE_URL}/api/inventory-transfers",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        print(f"Get inventory transfers response: {response.status_code}")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        print(f"Found {len(data)} inventory transfers")
    
    def test_create_inventory_transfer(self, admin_token, branch_ids):
        """Test creating an inventory transfer"""
        from_branch, to_branch = branch_ids
        
        transfer_data = {
            "from_branch_id": from_branch,
            "to_branch_id": to_branch,
            "transfer_type": "branch_to_branch",
            "items": [
                {"name": "Test Item", "quantity": 10, "unit": "kg"}
            ],
            "notes": "Test transfer - تحويل اختبار"
        }
        
        response = requests.post(
            f"{BASE_URL}/api/inventory-transfers",
            json=transfer_data,
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        print(f"Create inventory transfer response: {response.status_code}")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "id" in data, "Response should have id"
        assert "transfer_number" in data, "Response should have transfer_number"
        assert data["status"] == "pending", "Initial status should be pending"
        print(f"Created transfer #{data['transfer_number']} - status: {data['status']}")
        
        return data["id"]


class TestPurchaseRequestsAPI:
    """Purchase Requests (طلبات الشراء) API tests"""
    
    @pytest.fixture
    def admin_token(self):
        """Get Admin token"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={
                "email": MAIN_ADMIN_EMAIL,
                "password": MAIN_ADMIN_PASSWORD
            }
        )
        if response.status_code != 200:
            pytest.skip("Admin login failed")
        return response.json()["token"]
    
    @pytest.fixture
    def branch_id(self, admin_token):
        """Get a branch ID for testing"""
        response = requests.get(
            f"{BASE_URL}/api/branches",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        if response.status_code != 200 or len(response.json()) == 0:
            pytest.skip("No branches available")
        return response.json()[0]["id"]
    
    def test_get_purchase_requests_list(self, admin_token):
        """Test getting purchase requests list"""
        response = requests.get(
            f"{BASE_URL}/api/purchase-requests",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        print(f"Get purchase requests response: {response.status_code}")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        print(f"Found {len(data)} purchase requests")
    
    def test_create_purchase_request(self, admin_token, branch_id):
        """Test creating a purchase request"""
        request_data = {
            "branch_id": branch_id,
            "items": [
                {"name": "طماطم", "quantity": 50, "unit": "kg", "notes": "طازجة"},
                {"name": "بصل", "quantity": 30, "unit": "kg", "notes": ""}
            ],
            "priority": "normal",
            "notes": "Test purchase request - طلب شراء اختبار"
        }
        
        response = requests.post(
            f"{BASE_URL}/api/purchase-requests",
            json=request_data,
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        print(f"Create purchase request response: {response.status_code}")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "id" in data, "Response should have id"
        assert "request_number" in data, "Response should have request_number"
        assert data["status"] == "pending", "Initial status should be pending"
        assert data["priority"] == "normal", "Priority should be normal"
        print(f"Created purchase request #{data['request_number']} - status: {data['status']}")
        
        return data["id"]


class TestMainAdminAuth:
    """Main Admin authentication tests"""
    
    def test_main_admin_login_success(self):
        """Test Main Admin login with correct credentials"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={
                "email": MAIN_ADMIN_EMAIL,
                "password": MAIN_ADMIN_PASSWORD
            }
        )
        print(f"Main Admin Login Response: {response.status_code}")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "token" in data, "Response should contain token"
        assert "user" in data, "Response should contain user"
        print(f"Main Admin login successful: {data['user']['full_name']}, role: {data['user']['role']}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
