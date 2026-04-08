"""
Iteration 25 - Test Suite for Refactored Routes
Testing after duplicate code removal from server.py (13,697 -> 11,549 lines)

Tests:
1. Authentication (admin login)
2. Reports APIs (sales, inventory, profit-loss)
3. Drivers APIs (list, locations)
4. Payroll APIs (deductions, bonuses, payroll)
5. Shifts APIs (list, current, cash-register/summary)
6. Original APIs (products, categories, employees, orders)
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://zk-face-photo.preview.emergentagent.com')

class TestAuthentication:
    """Test authentication endpoints"""
    
    @pytest.fixture(scope="class")
    def admin_token(self):
        """Get admin token for authenticated requests"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "admin@maestroegp.com",
            "password": "admin123"
        })
        assert response.status_code == 200, f"Login failed: {response.text}"
        data = response.json()
        assert "token" in data, "No token in response"
        return data["token"]
    
    def test_admin_login(self):
        """Test admin login"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "admin@maestroegp.com",
            "password": "admin123"
        })
        assert response.status_code == 200
        data = response.json()
        assert "token" in data
        assert "user" in data
        assert data["user"]["email"] == "admin@maestroegp.com"
        assert data["user"]["role"] == "admin"
        print("✅ Admin login successful")


class TestReportsAPIs:
    """Test Reports APIs from reports_routes.py"""
    
    @pytest.fixture(scope="class")
    def auth_headers(self):
        """Get auth headers"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "admin@maestroegp.com",
            "password": "admin123"
        })
        token = response.json()["token"]
        return {"Authorization": f"Bearer {token}"}
    
    def test_sales_report(self, auth_headers):
        """GET /api/reports/sales"""
        response = requests.get(f"{BASE_URL}/api/reports/sales", headers=auth_headers)
        assert response.status_code == 200, f"Sales report failed: {response.text}"
        data = response.json()
        # Verify response structure
        assert "total_sales" in data
        assert "total_orders" in data
        assert "by_payment_method" in data
        assert "by_order_type" in data
        assert "by_delivery_app" in data
        assert "top_products" in data
        print(f"✅ Sales report: total_sales={data['total_sales']}, total_orders={data['total_orders']}")
    
    def test_inventory_report(self, auth_headers):
        """GET /api/reports/inventory"""
        response = requests.get(f"{BASE_URL}/api/reports/inventory", headers=auth_headers)
        assert response.status_code == 200, f"Inventory report failed: {response.text}"
        data = response.json()
        # Verify response structure
        assert "total_items" in data
        assert "low_stock_count" in data
        assert "total_inventory_value" in data
        assert "items" in data
        print(f"✅ Inventory report: total_items={data['total_items']}, low_stock={data['low_stock_count']}")
    
    def test_profit_loss_report(self, auth_headers):
        """GET /api/reports/profit-loss"""
        response = requests.get(f"{BASE_URL}/api/reports/profit-loss", headers=auth_headers)
        assert response.status_code == 200, f"Profit-loss report failed: {response.text}"
        data = response.json()
        # Verify response structure
        assert "revenue" in data
        assert "gross_profit" in data
        assert "net_profit" in data
        assert "cost_of_goods_sold" in data
        print(f"✅ Profit-loss report: revenue={data['revenue']['total_sales']}, net_profit={data['net_profit']['amount']}")


class TestDriversAPIs:
    """Test Drivers APIs from drivers_routes.py"""
    
    @pytest.fixture(scope="class")
    def auth_headers(self):
        """Get auth headers"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "admin@maestroegp.com",
            "password": "admin123"
        })
        token = response.json()["token"]
        return {"Authorization": f"Bearer {token}"}
    
    def test_get_drivers(self, auth_headers):
        """GET /api/drivers"""
        response = requests.get(f"{BASE_URL}/api/drivers", headers=auth_headers)
        assert response.status_code == 200, f"Get drivers failed: {response.text}"
        data = response.json()
        assert isinstance(data, list)
        print(f"✅ Drivers list: {len(data)} drivers found")
        if data:
            driver = data[0]
            assert "id" in driver
            assert "name" in driver
            assert "phone" in driver
    
    def test_get_drivers_locations(self, auth_headers):
        """GET /api/drivers/locations"""
        response = requests.get(f"{BASE_URL}/api/drivers/locations", headers=auth_headers)
        assert response.status_code == 200, f"Get drivers locations failed: {response.text}"
        data = response.json()
        assert isinstance(data, list)
        print(f"✅ Drivers locations: {len(data)} drivers with location data")


class TestPayrollAPIs:
    """Test Payroll APIs from payroll_routes.py"""
    
    @pytest.fixture(scope="class")
    def auth_headers(self):
        """Get auth headers"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "admin@maestroegp.com",
            "password": "admin123"
        })
        token = response.json()["token"]
        return {"Authorization": f"Bearer {token}"}
    
    def test_get_deductions(self, auth_headers):
        """GET /api/deductions"""
        response = requests.get(f"{BASE_URL}/api/deductions", headers=auth_headers)
        assert response.status_code == 200, f"Get deductions failed: {response.text}"
        data = response.json()
        assert isinstance(data, list)
        print(f"✅ Deductions list: {len(data)} deductions found")
    
    def test_get_bonuses(self, auth_headers):
        """GET /api/bonuses"""
        response = requests.get(f"{BASE_URL}/api/bonuses", headers=auth_headers)
        assert response.status_code == 200, f"Get bonuses failed: {response.text}"
        data = response.json()
        assert isinstance(data, list)
        print(f"✅ Bonuses list: {len(data)} bonuses found")
    
    def test_get_payroll(self, auth_headers):
        """GET /api/payroll"""
        response = requests.get(f"{BASE_URL}/api/payroll", headers=auth_headers)
        assert response.status_code == 200, f"Get payroll failed: {response.text}"
        data = response.json()
        assert isinstance(data, list)
        print(f"✅ Payroll list: {len(data)} payroll records found")


class TestShiftsAPIs:
    """Test Shifts APIs from shifts_routes.py"""
    
    @pytest.fixture(scope="class")
    def auth_headers(self):
        """Get auth headers"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "admin@maestroegp.com",
            "password": "admin123"
        })
        token = response.json()["token"]
        return {"Authorization": f"Bearer {token}"}
    
    def test_get_shifts(self, auth_headers):
        """GET /api/shifts"""
        response = requests.get(f"{BASE_URL}/api/shifts", headers=auth_headers)
        assert response.status_code == 200, f"Get shifts failed: {response.text}"
        data = response.json()
        assert isinstance(data, list)
        print(f"✅ Shifts list: {len(data)} shifts found")
    
    def test_get_current_shift(self, auth_headers):
        """GET /api/shifts/current"""
        response = requests.get(f"{BASE_URL}/api/shifts/current", headers=auth_headers)
        # Can be 200 (shift exists) or null (no open shift)
        assert response.status_code == 200, f"Get current shift failed: {response.text}"
        data = response.json()
        print(f"✅ Current shift: {'Open shift found' if data else 'No open shift'}")
    
    def test_cash_register_summary(self, auth_headers):
        """GET /api/cash-register/summary"""
        response = requests.get(f"{BASE_URL}/api/cash-register/summary", headers=auth_headers)
        # Can be 200 (shift exists) or 404 (no open shift)
        if response.status_code == 200:
            data = response.json()
            assert "total_sales" in data
            assert "expected_cash" in data
            print(f"✅ Cash register summary: total_sales={data['total_sales']}")
        elif response.status_code == 404:
            print("✅ Cash register summary: No open shift (expected 404)")
        else:
            pytest.fail(f"Unexpected status code: {response.status_code}")


class TestOriginalAPIs:
    """Test Original APIs that should still work (regression tests)"""
    
    @pytest.fixture(scope="class")
    def auth_headers(self):
        """Get auth headers"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "admin@maestroegp.com",
            "password": "admin123"
        })
        token = response.json()["token"]
        return {"Authorization": f"Bearer {token}"}
    
    def test_get_products(self, auth_headers):
        """GET /api/products"""
        response = requests.get(f"{BASE_URL}/api/products", headers=auth_headers)
        assert response.status_code == 200, f"Get products failed: {response.text}"
        data = response.json()
        assert isinstance(data, list)
        print(f"✅ Products list: {len(data)} products found")
    
    def test_get_categories(self, auth_headers):
        """GET /api/categories"""
        response = requests.get(f"{BASE_URL}/api/categories", headers=auth_headers)
        assert response.status_code == 200, f"Get categories failed: {response.text}"
        data = response.json()
        assert isinstance(data, list)
        print(f"✅ Categories list: {len(data)} categories found")
    
    def test_get_employees(self, auth_headers):
        """GET /api/employees"""
        response = requests.get(f"{BASE_URL}/api/employees", headers=auth_headers)
        assert response.status_code == 200, f"Get employees failed: {response.text}"
        data = response.json()
        assert isinstance(data, list)
        print(f"✅ Employees list: {len(data)} employees found")
    
    def test_get_orders(self, auth_headers):
        """GET /api/orders"""
        response = requests.get(f"{BASE_URL}/api/orders", headers=auth_headers)
        assert response.status_code == 200, f"Get orders failed: {response.text}"
        data = response.json()
        assert isinstance(data, list)
        print(f"✅ Orders list: {len(data)} orders found")


class TestAuthenticationRequired:
    """Test that APIs require authentication"""
    
    def test_reports_require_auth(self):
        """Reports should require authentication"""
        response = requests.get(f"{BASE_URL}/api/reports/sales")
        assert response.status_code in [401, 403], f"Expected 401/403, got {response.status_code}"
        print("✅ Reports require authentication")
    
    def test_drivers_require_auth(self):
        """Drivers should require authentication"""
        response = requests.get(f"{BASE_URL}/api/drivers")
        assert response.status_code in [401, 403], f"Expected 401/403, got {response.status_code}"
        print("✅ Drivers require authentication")
    
    def test_payroll_require_auth(self):
        """Payroll should require authentication"""
        response = requests.get(f"{BASE_URL}/api/payroll")
        assert response.status_code in [401, 403], f"Expected 401/403, got {response.status_code}"
        print("✅ Payroll requires authentication")
    
    def test_shifts_require_auth(self):
        """Shifts should require authentication"""
        response = requests.get(f"{BASE_URL}/api/shifts")
        assert response.status_code in [401, 403], f"Expected 401/403, got {response.status_code}"
        print("✅ Shifts require authentication")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
