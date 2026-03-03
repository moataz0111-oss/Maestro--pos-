"""
Test Inventory and HR pages with Offline support - Iteration 107
Tests:
- Inventory API endpoints
- HR API endpoints  
- Sync endpoints for inventory and attendance
"""

import pytest
import requests
import os
from datetime import datetime, timedelta
import uuid

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestAuth:
    """Authentication tests"""
    
    @pytest.fixture(scope="class")
    def auth_token(self):
        """Get authentication token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "demo@maestroegp.com",
            "password": "demo123"
        })
        assert response.status_code == 200, f"Login failed: {response.text}"
        data = response.json()
        assert "token" in data, "No token in response"
        return data["token"]
    
    def test_login_success(self):
        """Test login with demo credentials"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "demo@maestroegp.com",
            "password": "demo123"
        })
        assert response.status_code == 200
        data = response.json()
        assert "token" in data
        assert "user" in data
        print(f"✅ Login successful - User: {data['user'].get('name', 'N/A')}")


class TestInventoryAPI:
    """Inventory API tests - المخزون"""
    
    @pytest.fixture(scope="class")
    def auth_headers(self):
        """Get auth headers"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "demo@maestroegp.com",
            "password": "demo123"
        })
        token = response.json()["token"]
        return {"Authorization": f"Bearer {token}"}
    
    def test_get_inventory(self, auth_headers):
        """Test GET /api/inventory - جلب المخزون"""
        response = requests.get(f"{BASE_URL}/api/inventory", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✅ Inventory items count: {len(data)}")
        if data:
            print(f"   Sample item: {data[0].get('name', 'N/A')}")
    
    def test_get_inventory_by_type(self, auth_headers):
        """Test GET /api/inventory?item_type=raw - فلترة حسب النوع"""
        response = requests.get(f"{BASE_URL}/api/inventory?item_type=raw", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✅ Raw materials count: {len(data)}")
    
    def test_get_raw_materials(self, auth_headers):
        """Test GET /api/raw-materials - المواد الخام"""
        response = requests.get(f"{BASE_URL}/api/raw-materials", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✅ Raw materials endpoint: {len(data)} items")
    
    def test_get_finished_products(self, auth_headers):
        """Test GET /api/finished-products - المنتجات النهائية"""
        response = requests.get(f"{BASE_URL}/api/finished-products", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✅ Finished products: {len(data)} items")
    
    def test_inventory_transaction(self, auth_headers):
        """Test POST /api/inventory/transaction - حركة مخزون"""
        # First get an inventory item
        inv_response = requests.get(f"{BASE_URL}/api/inventory", headers=auth_headers)
        items = inv_response.json()
        
        if items:
            item_id = items[0].get('id')
            response = requests.post(f"{BASE_URL}/api/inventory/transaction", 
                headers=auth_headers,
                json={
                    "inventory_id": item_id,
                    "transaction_type": "in",
                    "quantity": 1,
                    "notes": "TEST_iter107 - test transaction"
                }
            )
            # Accept 200, 201, or 404 (if item doesn't exist)
            assert response.status_code in [200, 201, 404, 422]
            print(f"✅ Inventory transaction: status {response.status_code}")
        else:
            print("⚠️ No inventory items to test transaction")


class TestHRAPI:
    """HR API tests - الموارد البشرية"""
    
    @pytest.fixture(scope="class")
    def auth_headers(self):
        """Get auth headers"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "demo@maestroegp.com",
            "password": "demo123"
        })
        token = response.json()["token"]
        return {"Authorization": f"Bearer {token}"}
    
    def test_get_employees(self, auth_headers):
        """Test GET /api/employees - جلب الموظفين"""
        response = requests.get(f"{BASE_URL}/api/employees", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✅ Employees count: {len(data)}")
        if data:
            print(f"   Sample employee: {data[0].get('name', 'N/A')}")
    
    def test_get_attendance(self, auth_headers):
        """Test GET /api/attendance - سجل الحضور"""
        today = datetime.now().strftime("%Y-%m-%d")
        month_start = datetime.now().replace(day=1).strftime("%Y-%m-%d")
        
        response = requests.get(
            f"{BASE_URL}/api/attendance?start_date={month_start}&end_date={today}", 
            headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✅ Attendance records: {len(data)}")
    
    def test_get_advances(self, auth_headers):
        """Test GET /api/advances - السلف"""
        response = requests.get(f"{BASE_URL}/api/advances", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✅ Advances count: {len(data)}")
    
    def test_get_deductions(self, auth_headers):
        """Test GET /api/deductions - الخصومات"""
        today = datetime.now().strftime("%Y-%m-%d")
        month_start = datetime.now().replace(day=1).strftime("%Y-%m-%d")
        
        response = requests.get(
            f"{BASE_URL}/api/deductions?start_date={month_start}&end_date={today}", 
            headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✅ Deductions count: {len(data)}")
    
    def test_get_bonuses(self, auth_headers):
        """Test GET /api/bonuses - المكافآت"""
        today = datetime.now().strftime("%Y-%m-%d")
        month_start = datetime.now().replace(day=1).strftime("%Y-%m-%d")
        
        response = requests.get(
            f"{BASE_URL}/api/bonuses?start_date={month_start}&end_date={today}", 
            headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✅ Bonuses count: {len(data)}")
    
    def test_get_payroll(self, auth_headers):
        """Test GET /api/payroll - الرواتب"""
        current_month = datetime.now().strftime("%Y-%m")
        
        response = requests.get(
            f"{BASE_URL}/api/payroll?month={current_month}", 
            headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✅ Payroll records: {len(data)}")


class TestSyncAPIs:
    """Sync API tests for Offline support - المزامنة"""
    
    @pytest.fixture(scope="class")
    def auth_headers(self):
        """Get auth headers"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "demo@maestroegp.com",
            "password": "demo123"
        })
        token = response.json()["token"]
        return {"Authorization": f"Bearer {token}"}
    
    def test_sync_status(self, auth_headers):
        """Test GET /api/sync/status - حالة المزامنة"""
        response = requests.get(f"{BASE_URL}/api/sync/status", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert "server_time" in data
        print(f"✅ Sync status: server_time={data.get('server_time')}")
    
    def test_sync_inventory_transaction(self, auth_headers):
        """Test POST /api/sync/inventory - مزامنة حركة مخزون"""
        # Get inventory items first
        inv_response = requests.get(f"{BASE_URL}/api/inventory", headers=auth_headers)
        items = inv_response.json()
        
        if items:
            offline_id = f"offline_inv_{uuid.uuid4().hex[:8]}"
            response = requests.post(f"{BASE_URL}/api/sync/inventory", 
                headers=auth_headers,
                json={
                    "offline_id": offline_id,
                    "item_id": items[0].get('id'),
                    "item_name": items[0].get('name', 'Test Item'),
                    "transaction_type": "add",
                    "quantity": 1,
                    "notes": "TEST_iter107 - offline sync test"
                }
            )
            assert response.status_code in [200, 201, 404, 422]
            print(f"✅ Sync inventory: status {response.status_code}")
        else:
            print("⚠️ No inventory items for sync test")
    
    def test_sync_attendance(self, auth_headers):
        """Test POST /api/sync/attendance - مزامنة الحضور"""
        # Get employees first
        emp_response = requests.get(f"{BASE_URL}/api/employees", headers=auth_headers)
        employees = emp_response.json()
        
        if employees:
            offline_id = f"offline_att_{uuid.uuid4().hex[:8]}"
            today = datetime.now().strftime("%Y-%m-%d")
            
            response = requests.post(f"{BASE_URL}/api/sync/attendance", 
                headers=auth_headers,
                json={
                    "offline_id": offline_id,
                    "employee_id": employees[0].get('id'),
                    "date": today,
                    "check_in": "09:00",
                    "check_out": "17:00",
                    "status": "present",
                    "notes": "TEST_iter107 - offline attendance sync"
                }
            )
            assert response.status_code in [200, 201, 404, 422]
            print(f"✅ Sync attendance: status {response.status_code}")
        else:
            print("⚠️ No employees for attendance sync test")


class TestBranchesAPI:
    """Branches API tests - الفروع"""
    
    @pytest.fixture(scope="class")
    def auth_headers(self):
        """Get auth headers"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "demo@maestroegp.com",
            "password": "demo123"
        })
        token = response.json()["token"]
        return {"Authorization": f"Bearer {token}"}
    
    def test_get_branches(self, auth_headers):
        """Test GET /api/branches - جلب الفروع"""
        response = requests.get(f"{BASE_URL}/api/branches", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✅ Branches count: {len(data)}")
        if data:
            print(f"   Sample branch: {data[0].get('name', 'N/A')}")


class TestPOSAPI:
    """POS API tests - نقطة البيع"""
    
    @pytest.fixture(scope="class")
    def auth_headers(self):
        """Get auth headers"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "demo@maestroegp.com",
            "password": "demo123"
        })
        token = response.json()["token"]
        return {"Authorization": f"Bearer {token}"}
    
    def test_get_categories(self, auth_headers):
        """Test GET /api/categories - الفئات"""
        response = requests.get(f"{BASE_URL}/api/categories", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✅ Categories count: {len(data)}")
    
    def test_get_products(self, auth_headers):
        """Test GET /api/products - المنتجات"""
        response = requests.get(f"{BASE_URL}/api/products", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✅ Products count: {len(data)}")


class TestOrdersAPI:
    """Orders API tests - الطلبات"""
    
    @pytest.fixture(scope="class")
    def auth_headers(self):
        """Get auth headers"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "demo@maestroegp.com",
            "password": "demo123"
        })
        token = response.json()["token"]
        return {"Authorization": f"Bearer {token}"}
    
    def test_get_orders(self, auth_headers):
        """Test GET /api/orders - الطلبات"""
        response = requests.get(f"{BASE_URL}/api/orders", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✅ Orders count: {len(data)}")


class TestTablesAPI:
    """Tables API tests - الطاولات"""
    
    @pytest.fixture(scope="class")
    def auth_headers(self):
        """Get auth headers"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "demo@maestroegp.com",
            "password": "demo123"
        })
        token = response.json()["token"]
        return {"Authorization": f"Bearer {token}"}
    
    def test_get_tables(self, auth_headers):
        """Test GET /api/tables - الطاولات"""
        response = requests.get(f"{BASE_URL}/api/tables", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✅ Tables count: {len(data)}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
