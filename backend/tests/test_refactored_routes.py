"""
Test Refactored Routes - Testing drivers_routes.py, payroll_routes.py, and reports_routes.py
Iteration 24 - Testing after code refactoring (~1350 lines moved to 3 new route files)
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
ADMIN_EMAIL = "admin@maestroegp.com"
ADMIN_PASSWORD = "admin123"
OWNER_EMAIL = "owner@maestroegp.com"
OWNER_PASSWORD = "owner123"


@pytest.fixture(scope="module")
def admin_token():
    """Get admin token for authenticated requests"""
    response = requests.post(f"{BASE_URL}/api/auth/login", json={
        "email": ADMIN_EMAIL,
        "password": ADMIN_PASSWORD
    })
    if response.status_code == 200:
        return response.json().get("token")
    pytest.skip("Admin authentication failed")


@pytest.fixture(scope="module")
def owner_token():
    """Get owner token for authenticated requests"""
    response = requests.post(f"{BASE_URL}/api/auth/login", json={
        "email": OWNER_EMAIL,
        "password": OWNER_PASSWORD
    })
    if response.status_code == 200:
        return response.json().get("token")
    pytest.skip("Owner authentication failed")


@pytest.fixture
def auth_headers(admin_token):
    """Headers with admin authentication"""
    return {"Authorization": f"Bearer {admin_token}"}


@pytest.fixture
def owner_headers(owner_token):
    """Headers with owner authentication"""
    return {"Authorization": f"Bearer {owner_token}"}


# ==================== REPORTS ROUTES TESTS ====================
class TestReportsRoutes:
    """Test reports from /api/reports/* (reports_routes.py)"""
    
    def test_sales_report(self, auth_headers):
        """GET /api/reports/sales - Sales report"""
        response = requests.get(f"{BASE_URL}/api/reports/sales", headers=auth_headers)
        assert response.status_code == 200, f"Sales report failed: {response.text}"
        data = response.json()
        assert "total_sales" in data
        assert "total_orders" in data
        assert "by_payment_method" in data
        assert "by_delivery_app" in data
        assert "top_products" in data
        print(f"✅ GET /api/reports/sales - Total Sales: {data['total_sales']}, Orders: {data['total_orders']}")
    
    def test_inventory_report(self, auth_headers):
        """GET /api/reports/inventory - Inventory report"""
        response = requests.get(f"{BASE_URL}/api/reports/inventory", headers=auth_headers)
        assert response.status_code == 200, f"Inventory report failed: {response.text}"
        data = response.json()
        assert "total_items" in data
        assert "low_stock_count" in data
        assert "total_inventory_value" in data
        print(f"✅ GET /api/reports/inventory - Total Items: {data['total_items']}, Low Stock: {data['low_stock_count']}")
    
    def test_profit_loss_report(self, auth_headers):
        """GET /api/reports/profit-loss - Profit/Loss report"""
        response = requests.get(f"{BASE_URL}/api/reports/profit-loss", headers=auth_headers)
        assert response.status_code == 200, f"Profit/Loss report failed: {response.text}"
        data = response.json()
        assert "revenue" in data
        assert "gross_profit" in data
        assert "net_profit" in data
        print(f"✅ GET /api/reports/profit-loss - Revenue: {data['revenue']['total_sales']}, Net Profit: {data['net_profit']['amount']}")


# ==================== DRIVERS ROUTES TESTS ====================
class TestDriversRoutes:
    """Test drivers from /api/drivers/* (drivers_routes.py)"""
    
    def test_get_drivers_list(self, auth_headers):
        """GET /api/drivers - Get all drivers"""
        response = requests.get(f"{BASE_URL}/api/drivers", headers=auth_headers)
        assert response.status_code == 200, f"Get drivers failed: {response.text}"
        data = response.json()
        assert isinstance(data, list), "Drivers should be a list"
        print(f"✅ GET /api/drivers - Found {len(data)} drivers")
        return data
    
    def test_get_drivers_with_orders(self, auth_headers):
        """GET /api/drivers?include_orders=true - Get drivers with current orders"""
        response = requests.get(f"{BASE_URL}/api/drivers", params={"include_orders": "true"}, headers=auth_headers)
        assert response.status_code == 200, f"Get drivers with orders failed: {response.text}"
        data = response.json()
        assert isinstance(data, list)
        print(f"✅ GET /api/drivers?include_orders=true - Found {len(data)} drivers")
    
    def test_get_driver_stats(self, auth_headers):
        """GET /api/drivers/{id}/stats - Get driver statistics"""
        # First get a driver
        drivers_response = requests.get(f"{BASE_URL}/api/drivers", headers=auth_headers)
        if drivers_response.status_code == 200:
            drivers = drivers_response.json()
            if drivers:
                driver_id = drivers[0]["id"]
                response = requests.get(f"{BASE_URL}/api/drivers/{driver_id}/stats", headers=auth_headers)
                assert response.status_code == 200, f"Get driver stats failed: {response.text}"
                data = response.json()
                assert "unpaid_total" in data
                assert "paid_total" in data
                assert "pending_orders" in data
                print(f"✅ GET /api/drivers/{driver_id}/stats - Unpaid: {data['unpaid_total']}, Paid: {data['paid_total']}")
            else:
                print("⚠️ No drivers found to test stats")
        else:
            pytest.skip("Could not get drivers list")
    
    def test_get_drivers_locations(self, auth_headers):
        """GET /api/drivers/locations - Get all drivers locations for map"""
        response = requests.get(f"{BASE_URL}/api/drivers/locations", headers=auth_headers)
        assert response.status_code == 200, f"Get drivers locations failed: {response.text}"
        data = response.json()
        assert isinstance(data, list), "Locations should be a list"
        print(f"✅ GET /api/drivers/locations - Found {len(data)} driver locations")
    
    def test_driver_portal_by_phone(self):
        """GET /api/drivers/portal/by-phone/{phone} - Get driver by phone (no auth)"""
        # This endpoint doesn't require auth - test with a sample phone
        response = requests.get(f"{BASE_URL}/api/drivers/portal/by-phone/0123456789")
        # Should return 404 if driver not found, or 200 if found
        assert response.status_code in [200, 404], f"Driver portal by phone failed: {response.text}"
        if response.status_code == 200:
            data = response.json()
            assert "driver" in data
            assert "orders" in data
            assert "stats" in data
            print(f"✅ GET /api/drivers/portal/by-phone - Driver found")
        else:
            print(f"✅ GET /api/drivers/portal/by-phone - Returns 404 for unknown phone (expected)")


# ==================== PAYROLL ROUTES TESTS ====================
class TestPayrollRoutes:
    """Test payroll from /api/* (payroll_routes.py)"""
    
    def test_get_deductions(self, auth_headers):
        """GET /api/deductions - Get all deductions"""
        response = requests.get(f"{BASE_URL}/api/deductions", headers=auth_headers)
        assert response.status_code == 200, f"Get deductions failed: {response.text}"
        data = response.json()
        assert isinstance(data, list), "Deductions should be a list"
        print(f"✅ GET /api/deductions - Found {len(data)} deductions")
    
    def test_get_deductions_with_filters(self, auth_headers):
        """GET /api/deductions with date filters"""
        response = requests.get(
            f"{BASE_URL}/api/deductions",
            params={"start_date": "2024-01-01", "end_date": "2026-12-31"},
            headers=auth_headers
        )
        assert response.status_code == 200, f"Get deductions with filters failed: {response.text}"
        print(f"✅ GET /api/deductions with date filters works")
    
    def test_get_bonuses(self, auth_headers):
        """GET /api/bonuses - Get all bonuses"""
        response = requests.get(f"{BASE_URL}/api/bonuses", headers=auth_headers)
        assert response.status_code == 200, f"Get bonuses failed: {response.text}"
        data = response.json()
        assert isinstance(data, list), "Bonuses should be a list"
        print(f"✅ GET /api/bonuses - Found {len(data)} bonuses")
    
    def test_get_bonuses_with_filters(self, auth_headers):
        """GET /api/bonuses with date filters"""
        response = requests.get(
            f"{BASE_URL}/api/bonuses",
            params={"start_date": "2024-01-01", "end_date": "2026-12-31"},
            headers=auth_headers
        )
        assert response.status_code == 200, f"Get bonuses with filters failed: {response.text}"
        print(f"✅ GET /api/bonuses with date filters works")
    
    def test_get_payroll(self, auth_headers):
        """GET /api/payroll - Get all payroll records"""
        response = requests.get(f"{BASE_URL}/api/payroll", headers=auth_headers)
        assert response.status_code == 200, f"Get payroll failed: {response.text}"
        data = response.json()
        assert isinstance(data, list), "Payroll should be a list"
        print(f"✅ GET /api/payroll - Found {len(data)} payroll records")
    
    def test_get_payroll_with_month_filter(self, auth_headers):
        """GET /api/payroll with month filter"""
        response = requests.get(
            f"{BASE_URL}/api/payroll",
            params={"month": "2026-01"},
            headers=auth_headers
        )
        assert response.status_code == 200, f"Get payroll with month filter failed: {response.text}"
        print(f"✅ GET /api/payroll with month filter works")
    
    def test_payroll_summary_report(self, auth_headers):
        """GET /api/reports/payroll-summary - Payroll summary report"""
        response = requests.get(
            f"{BASE_URL}/api/reports/payroll-summary",
            params={"month": "2026-01"},
            headers=auth_headers
        )
        assert response.status_code == 200, f"Payroll summary report failed: {response.text}"
        data = response.json()
        assert "month" in data
        assert "employees" in data
        assert "summary" in data
        assert "total_employees" in data["summary"]
        assert "total_basic_salaries" in data["summary"]
        assert "total_net_salaries" in data["summary"]
        print(f"✅ GET /api/reports/payroll-summary - Employees: {data['summary']['total_employees']}, Total Net: {data['summary']['total_net_salaries']}")


# ==================== ORIGINAL APIs REGRESSION TESTS ====================
class TestOriginalAPIsRegression:
    """Test original APIs to ensure no regression after refactoring"""
    
    def test_get_products(self, auth_headers):
        """GET /api/products - Products list"""
        response = requests.get(f"{BASE_URL}/api/products", headers=auth_headers)
        assert response.status_code == 200, f"Get products failed: {response.text}"
        data = response.json()
        assert isinstance(data, list), "Products should be a list"
        print(f"✅ GET /api/products - Found {len(data)} products")
    
    def test_get_categories(self, auth_headers):
        """GET /api/categories - Categories list"""
        response = requests.get(f"{BASE_URL}/api/categories", headers=auth_headers)
        assert response.status_code == 200, f"Get categories failed: {response.text}"
        data = response.json()
        assert isinstance(data, list), "Categories should be a list"
        print(f"✅ GET /api/categories - Found {len(data)} categories")
    
    def test_get_employees(self, auth_headers):
        """GET /api/employees - Employees list"""
        response = requests.get(f"{BASE_URL}/api/employees", headers=auth_headers)
        assert response.status_code == 200, f"Get employees failed: {response.text}"
        data = response.json()
        assert isinstance(data, list), "Employees should be a list"
        print(f"✅ GET /api/employees - Found {len(data)} employees")
    
    def test_get_branches(self, auth_headers):
        """GET /api/branches - Branches list"""
        response = requests.get(f"{BASE_URL}/api/branches", headers=auth_headers)
        assert response.status_code == 200, f"Get branches failed: {response.text}"
        data = response.json()
        assert isinstance(data, list), "Branches should be a list"
        print(f"✅ GET /api/branches - Found {len(data)} branches")
    
    def test_get_orders(self, auth_headers):
        """GET /api/orders - Orders list"""
        response = requests.get(f"{BASE_URL}/api/orders", headers=auth_headers)
        assert response.status_code == 200, f"Get orders failed: {response.text}"
        data = response.json()
        assert isinstance(data, list), "Orders should be a list"
        print(f"✅ GET /api/orders - Found {len(data)} orders")
    
    def test_get_staff(self, auth_headers):
        """GET /api/staff - Staff list"""
        response = requests.get(f"{BASE_URL}/api/staff", headers=auth_headers)
        assert response.status_code == 200, f"Get staff failed: {response.text}"
        data = response.json()
        assert isinstance(data, list), "Staff should be a list"
        print(f"✅ GET /api/staff - Found {len(data)} staff members")


# ==================== AUTHENTICATION TESTS ====================
class TestAuthentication:
    """Test authentication for refactored routes"""
    
    def test_admin_login(self):
        """POST /api/auth/login - Admin login"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        assert response.status_code == 200, f"Admin login failed: {response.text}"
        data = response.json()
        assert "token" in data
        assert "user" in data
        assert data["user"]["role"] == "admin"
        print(f"✅ POST /api/auth/login - Admin login successful")
    
    def test_owner_login(self):
        """POST /api/auth/login - Owner login"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": OWNER_EMAIL,
            "password": OWNER_PASSWORD
        })
        assert response.status_code == 200, f"Owner login failed: {response.text}"
        data = response.json()
        assert "token" in data
        assert "user" in data
        print(f"✅ POST /api/auth/login - Owner login successful, Role: {data['user']['role']}")
    
    def test_reports_require_auth(self):
        """Reports should require authentication"""
        response = requests.get(f"{BASE_URL}/api/reports/sales")
        assert response.status_code in [401, 403], f"Expected 401/403, got {response.status_code}"
        print(f"✅ Reports correctly require authentication")
    
    def test_drivers_require_auth(self):
        """Drivers list should require authentication"""
        response = requests.get(f"{BASE_URL}/api/drivers")
        assert response.status_code in [401, 403], f"Expected 401/403, got {response.status_code}"
        print(f"✅ Drivers correctly require authentication")
    
    def test_payroll_require_auth(self):
        """Payroll should require authentication"""
        response = requests.get(f"{BASE_URL}/api/payroll")
        assert response.status_code in [401, 403], f"Expected 401/403, got {response.status_code}"
        print(f"✅ Payroll correctly requires authentication")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
