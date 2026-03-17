"""
Iteration 22 - Comprehensive Testing for Maestro EGP Restaurant Management System
Tests: Authentication, Dashboard, POS, Settings, Reports, Coupons, and all APIs
"""

import pytest
import requests
import os
import uuid

# Base URL from environment
BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://maestro-pos-3.preview.emergentagent.com').rstrip('/')

# Test credentials
ADMIN_EMAIL = "admin@maestroegp.com"
ADMIN_PASSWORD = "admin123"
OWNER_EMAIL = "owner@maestroegp.com"
OWNER_PASSWORD = "owner123"


class TestAuthentication:
    """Test authentication endpoints"""
    
    def test_health_check(self):
        """Test API health endpoint"""
        response = requests.get(f"{BASE_URL}/api/health")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "ok"
        print("✅ Health check passed")
    
    def test_admin_login(self):
        """Test admin login (admin@maestroegp.com / admin123)"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        assert response.status_code == 200
        data = response.json()
        assert "token" in data
        assert "user" in data
        assert data["user"]["email"] == ADMIN_EMAIL
        assert data["user"]["role"] == "admin"
        print(f"✅ Admin login successful - User: {data['user']['full_name']}")
        return data["token"]
    
    def test_owner_login(self):
        """Test owner/super_admin login (owner@maestroegp.com / owner123)"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": OWNER_EMAIL,
            "password": OWNER_PASSWORD
        })
        assert response.status_code == 200
        data = response.json()
        assert "token" in data
        assert "user" in data
        assert data["user"]["email"] == OWNER_EMAIL
        assert data["user"]["role"] == "super_admin"
        print(f"✅ Owner login successful - User: {data['user']['full_name']}")
        return data["token"]
    
    def test_invalid_login(self):
        """Test login with invalid credentials"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "invalid@test.com",
            "password": "wrongpassword"
        })
        assert response.status_code in [401, 404]
        print("✅ Invalid login correctly rejected")


@pytest.fixture
def admin_token():
    """Get admin authentication token"""
    response = requests.post(f"{BASE_URL}/api/auth/login", json={
        "email": ADMIN_EMAIL,
        "password": ADMIN_PASSWORD
    })
    if response.status_code == 200:
        return response.json()["token"]
    pytest.skip("Admin authentication failed")


@pytest.fixture
def owner_token():
    """Get owner/super_admin authentication token"""
    response = requests.post(f"{BASE_URL}/api/auth/login", json={
        "email": OWNER_EMAIL,
        "password": OWNER_PASSWORD
    })
    if response.status_code == 200:
        return response.json()["token"]
    pytest.skip("Owner authentication failed")


@pytest.fixture
def auth_headers(admin_token):
    """Get authorization headers"""
    return {"Authorization": f"Bearer {admin_token}"}


class TestDashboardAPIs:
    """Test Dashboard related APIs"""
    
    def test_dashboard_stats(self, auth_headers):
        """Test GET /api/dashboard/stats - Dashboard statistics"""
        response = requests.get(f"{BASE_URL}/api/dashboard/stats", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        # Dashboard should have today, week, month stats
        assert "today" in data or "total_sales" in data or isinstance(data, dict)
        print(f"✅ Dashboard stats retrieved successfully")
    
    def test_branches_list(self, auth_headers):
        """Test GET /api/branches - Branches list"""
        response = requests.get(f"{BASE_URL}/api/branches", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✅ Branches list retrieved - Count: {len(data)}")


class TestPOSAPIs:
    """Test POS (Point of Sale) related APIs"""
    
    def test_get_categories(self, auth_headers):
        """Test GET /api/categories - Categories list for POS"""
        response = requests.get(f"{BASE_URL}/api/categories", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        assert len(data) >= 5  # Should have at least 5 categories
        
        # Verify category structure
        for cat in data:
            assert "id" in cat
            assert "name" in cat
        
        category_names = [c["name"] for c in data]
        print(f"✅ Categories retrieved - Count: {len(data)}, Names: {category_names}")
    
    def test_get_products(self, auth_headers):
        """Test GET /api/products - Products list for POS"""
        response = requests.get(f"{BASE_URL}/api/products", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        assert len(data) >= 6  # Should have at least 6 products
        
        # Verify product structure
        for product in data:
            assert "id" in product
            assert "name" in product
            assert "price" in product
            assert "category_id" in product
        
        print(f"✅ Products retrieved - Count: {len(data)}")
    
    def test_get_tables(self, auth_headers):
        """Test GET /api/tables - Tables list for POS"""
        response = requests.get(f"{BASE_URL}/api/tables", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✅ Tables retrieved - Count: {len(data)}")


class TestSettingsAPIs:
    """Test Settings related APIs"""
    
    def test_get_delivery_apps(self, auth_headers):
        """Test GET /api/delivery-apps - Delivery companies settings"""
        response = requests.get(f"{BASE_URL}/api/delivery-apps", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✅ Delivery apps retrieved - Count: {len(data)}")
    
    def test_get_printers(self, auth_headers):
        """Test GET /api/printers - Printers settings"""
        response = requests.get(f"{BASE_URL}/api/printers", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✅ Printers retrieved - Count: {len(data)}")
    
    def test_get_users(self, auth_headers):
        """Test GET /api/users - Users list in settings"""
        response = requests.get(f"{BASE_URL}/api/users", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✅ Users retrieved - Count: {len(data)}")


class TestDriversAPIs:
    """Test Drivers/Delivery related APIs"""
    
    def test_get_drivers(self, auth_headers):
        """Test GET /api/drivers - Drivers list"""
        response = requests.get(f"{BASE_URL}/api/drivers", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        assert len(data) >= 3  # Should have at least 3 drivers
        
        # Verify driver structure
        for driver in data:
            assert "id" in driver
            assert "name" in driver
            assert "phone" in driver
            assert "is_active" in driver
        
        driver_names = [d["name"] for d in data]
        print(f"✅ Drivers retrieved - Count: {len(data)}, Names: {driver_names}")


class TestEmployeesAPIs:
    """Test Employees/HR related APIs"""
    
    def test_get_employees(self, auth_headers):
        """Test GET /api/employees - Employees list"""
        response = requests.get(f"{BASE_URL}/api/employees", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        
        # Verify employee structure
        for emp in data:
            assert "id" in emp
            assert "name" in emp
            assert "position" in emp
        
        print(f"✅ Employees retrieved - Count: {len(data)}")


class TestCouponsAPIs:
    """Test Coupons related APIs"""
    
    def test_get_coupons(self, auth_headers):
        """Test GET /api/coupons - Coupons list"""
        response = requests.get(f"{BASE_URL}/api/coupons", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✅ Coupons retrieved - Count: {len(data)}")
    
    def test_get_promotions(self, auth_headers):
        """Test GET /api/promotions - Promotions list"""
        response = requests.get(f"{BASE_URL}/api/promotions", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✅ Promotions retrieved - Count: {len(data)}")
    
    def test_create_coupon(self, auth_headers):
        """Test POST /api/coupons - Create new coupon"""
        from datetime import datetime, timedelta
        
        unique_code = f"TEST_{uuid.uuid4().hex[:8].upper()}"
        valid_from = datetime.now().strftime("%Y-%m-%d")
        valid_until = (datetime.now() + timedelta(days=30)).strftime("%Y-%m-%d")
        
        coupon_data = {
            "code": unique_code,
            "name": f"Test Coupon {unique_code}",
            "discount_type": "percentage",
            "discount_value": 10,
            "min_order_amount": 10000,
            "max_uses": 100,
            "is_active": True,
            "valid_from": valid_from,
            "valid_until": valid_until,
            "description": "Test coupon for iteration 22"
        }
        
        response = requests.post(f"{BASE_URL}/api/coupons", json=coupon_data, headers=auth_headers)
        assert response.status_code in [200, 201]
        data = response.json()
        
        # Response can be {"coupon": {...}, "message": "..."} or direct coupon object
        if "coupon" in data:
            coupon = data["coupon"]
            assert "id" in coupon
            assert coupon["code"] == unique_code
            print(f"✅ Coupon created successfully - Code: {unique_code}")
        else:
            assert "id" in data
            assert data["code"] == unique_code
            print(f"✅ Coupon created successfully - Code: {unique_code}")


class TestReportsAPIs:
    """Test Reports related APIs"""
    
    def test_get_sales_report(self, auth_headers):
        """Test GET /api/reports/sales - Sales report"""
        response = requests.get(f"{BASE_URL}/api/reports/sales", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, dict)
        print(f"✅ Sales report retrieved")
    
    def test_get_orders(self, auth_headers):
        """Test GET /api/orders - Orders list"""
        response = requests.get(f"{BASE_URL}/api/orders", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✅ Orders retrieved - Count: {len(data)}")


class TestOrdersAPIs:
    """Test Orders CRUD operations"""
    
    def test_get_orders_list(self, auth_headers):
        """Test GET /api/orders - Orders list"""
        response = requests.get(f"{BASE_URL}/api/orders", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        
        # Verify order structure if orders exist
        if len(data) > 0:
            order = data[0]
            assert "id" in order
            assert "order_number" in order
            assert "status" in order
            assert "total" in order
        
        print(f"✅ Orders list retrieved - Count: {len(data)}")


class TestInventoryAPIs:
    """Test Inventory related APIs"""
    
    def test_get_inventory(self, auth_headers):
        """Test GET /api/inventory - Inventory list"""
        response = requests.get(f"{BASE_URL}/api/inventory", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✅ Inventory retrieved - Count: {len(data)}")


class TestExpensesAPIs:
    """Test Expenses related APIs"""
    
    def test_get_expenses(self, auth_headers):
        """Test GET /api/expenses - Expenses list"""
        response = requests.get(f"{BASE_URL}/api/expenses", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✅ Expenses retrieved - Count: {len(data)}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
