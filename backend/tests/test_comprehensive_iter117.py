"""
Comprehensive Backend API Tests for Iteration 117
Testing: Authentication, POS, Orders, Tables, Reports, Products, Categories
"""
import pytest
import requests
import os
from datetime import datetime

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://paid-order-removal.preview.emergentagent.com')

# Test credentials
TEST_EMAIL = "hanialdujaili@gmail.com"
TEST_PASSWORD = "Hani@2024"


class TestHealthAndAuth:
    """Health check and authentication tests"""
    
    def test_health_check(self):
        """Test API health endpoint"""
        response = requests.get(f"{BASE_URL}/api/health")
        assert response.status_code == 200
        data = response.json()
        assert data.get("status") == "ok"
        print("✅ Health check passed")
    
    def test_login_success(self):
        """Test login with valid credentials"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD
        })
        assert response.status_code == 200
        data = response.json()
        assert "token" in data
        assert "user" in data
        assert data["user"]["email"] == TEST_EMAIL
        print(f"✅ Login successful for {TEST_EMAIL}")
        return data["token"]
    
    def test_login_invalid_credentials(self):
        """Test login with invalid credentials"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "invalid@test.com",
            "password": "wrongpassword"
        })
        assert response.status_code in [401, 404]
        print("✅ Invalid login rejected correctly")
    
    def test_get_current_user(self):
        """Test getting current user info"""
        token = self.test_login_success()
        headers = {"Authorization": f"Bearer {token}"}
        response = requests.get(f"{BASE_URL}/api/auth/me", headers=headers)
        assert response.status_code == 200
        data = response.json()
        assert data["email"] == TEST_EMAIL
        print(f"✅ Current user retrieved: {data.get('full_name', data.get('email'))}")


class TestBranches:
    """Branch management tests"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup authentication"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD
        })
        self.token = response.json()["token"]
        self.headers = {"Authorization": f"Bearer {self.token}"}
    
    def test_get_branches(self):
        """Test getting all branches"""
        response = requests.get(f"{BASE_URL}/api/branches", headers=self.headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✅ Retrieved {len(data)} branches")
        if data:
            print(f"   First branch: {data[0].get('name', 'N/A')}")
        return data


class TestCategories:
    """Category management tests"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup authentication"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD
        })
        self.token = response.json()["token"]
        self.headers = {"Authorization": f"Bearer {self.token}"}
    
    def test_get_categories(self):
        """Test getting all categories"""
        response = requests.get(f"{BASE_URL}/api/categories", headers=self.headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✅ Retrieved {len(data)} categories")
        for cat in data[:3]:
            print(f"   - {cat.get('name', 'N/A')}")
        return data


class TestProducts:
    """Product management tests"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup authentication"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD
        })
        self.token = response.json()["token"]
        self.headers = {"Authorization": f"Bearer {self.token}"}
    
    def test_get_products(self):
        """Test getting all products"""
        response = requests.get(f"{BASE_URL}/api/products", headers=self.headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✅ Retrieved {len(data)} products")
        for prod in data[:3]:
            print(f"   - {prod.get('name', 'N/A')} - {prod.get('price', 0)} IQD")
        return data


class TestTables:
    """Table management tests"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup authentication"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD
        })
        self.token = response.json()["token"]
        self.headers = {"Authorization": f"Bearer {self.token}"}
    
    def test_get_tables(self):
        """Test getting all tables"""
        response = requests.get(f"{BASE_URL}/api/tables", headers=self.headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✅ Retrieved {len(data)} tables")
        for table in data[:5]:
            print(f"   - Table {table.get('number', 'N/A')} - Status: {table.get('status', 'N/A')}")
        return data


class TestOrders:
    """Order management tests"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup authentication"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD
        })
        self.token = response.json()["token"]
        self.headers = {"Authorization": f"Bearer {self.token}"}
    
    def test_get_orders(self):
        """Test getting orders"""
        response = requests.get(f"{BASE_URL}/api/orders", headers=self.headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✅ Retrieved {len(data)} orders")
        return data
    
    def test_get_pending_orders(self):
        """Test getting pending orders"""
        response = requests.get(f"{BASE_URL}/api/orders", headers=self.headers, params={"status": "pending,preparing,ready"})
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✅ Retrieved {len(data)} pending orders")
        return data
    
    def test_create_order(self):
        """Test creating a new order"""
        # First get products and branches
        products_res = requests.get(f"{BASE_URL}/api/products", headers=self.headers)
        branches_res = requests.get(f"{BASE_URL}/api/branches", headers=self.headers)
        
        products = products_res.json()
        branches = branches_res.json()
        
        if not products or not branches:
            pytest.skip("No products or branches available")
        
        product = products[0]
        branch = branches[0]
        
        order_data = {
            "order_type": "takeaway",
            "items": [{
                "product_id": product["id"],
                "product_name": product.get("name", "Test Product"),
                "quantity": 1,
                "price": product.get("price", 5000),
                "cost": product.get("cost", 2000)
            }],
            "branch_id": branch["id"],
            "payment_method": "cash",
            "discount": 0,
            "customer_name": "TEST_Customer",
            "customer_phone": "07801234567"
        }
        
        response = requests.post(f"{BASE_URL}/api/orders", headers=self.headers, json=order_data)
        assert response.status_code in [200, 201]
        data = response.json()
        assert "id" in data or "order_number" in data
        print(f"✅ Order created: #{data.get('order_number', data.get('id', 'N/A'))}")
        return data


class TestShifts:
    """Shift management tests"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup authentication"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD
        })
        self.token = response.json()["token"]
        self.headers = {"Authorization": f"Bearer {self.token}"}
    
    def test_get_current_shift(self):
        """Test getting current shift"""
        response = requests.get(f"{BASE_URL}/api/shifts/current", headers=self.headers)
        # Can be 200 (shift exists) or 404 (no shift)
        assert response.status_code in [200, 404]
        if response.status_code == 200:
            data = response.json()
            print(f"✅ Current shift: {data.get('id', 'N/A')[:8]}...")
        else:
            print("✅ No current shift (expected)")
    
    def test_auto_open_shift(self):
        """Test auto-opening a shift"""
        response = requests.post(f"{BASE_URL}/api/shifts/auto-open", headers=self.headers)
        assert response.status_code in [200, 201]
        data = response.json()
        assert "shift" in data
        print(f"✅ Shift auto-opened: {data['shift'].get('id', 'N/A')[:8]}...")


class TestReports:
    """Reports API tests"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup authentication"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD
        })
        self.token = response.json()["token"]
        self.headers = {"Authorization": f"Bearer {self.token}"}
    
    def test_sales_report(self):
        """Test sales report"""
        today = datetime.now().strftime("%Y-%m-%d")
        params = {"start_date": today, "end_date": today}
        response = requests.get(f"{BASE_URL}/api/reports/sales", headers=self.headers, params=params)
        assert response.status_code == 200
        data = response.json()
        print(f"✅ Sales report: Total sales = {data.get('total_sales', 0)} IQD")
        return data
    
    def test_products_report(self):
        """Test products report"""
        today = datetime.now().strftime("%Y-%m-%d")
        params = {"start_date": today, "end_date": today}
        response = requests.get(f"{BASE_URL}/api/reports/products", headers=self.headers, params=params)
        assert response.status_code == 200
        data = response.json()
        print(f"✅ Products report: {len(data.get('products', []))} products")
        return data
    
    def test_expenses_report(self):
        """Test expenses report"""
        today = datetime.now().strftime("%Y-%m-%d")
        params = {"start_date": today, "end_date": today}
        response = requests.get(f"{BASE_URL}/api/reports/expenses", headers=self.headers, params=params)
        assert response.status_code == 200
        data = response.json()
        print(f"✅ Expenses report: Total = {data.get('total_expenses', 0)} IQD")
        return data
    
    def test_profit_loss_report(self):
        """Test profit/loss report"""
        today = datetime.now().strftime("%Y-%m-%d")
        params = {"start_date": today, "end_date": today}
        response = requests.get(f"{BASE_URL}/api/reports/profit-loss", headers=self.headers, params=params)
        assert response.status_code == 200
        data = response.json()
        print(f"✅ Profit/Loss report: Net profit = {data.get('net_profit', {}).get('amount', 0)} IQD")
        return data


class TestDashboard:
    """Dashboard API tests"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup authentication"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD
        })
        self.token = response.json()["token"]
        self.headers = {"Authorization": f"Bearer {self.token}"}
    
    def test_dashboard_stats(self):
        """Test dashboard statistics"""
        response = requests.get(f"{BASE_URL}/api/dashboard/stats", headers=self.headers)
        assert response.status_code == 200
        data = response.json()
        print(f"✅ Dashboard stats retrieved")
        if "today" in data:
            print(f"   Today: {data['today'].get('total_sales', 0)} IQD, {data['today'].get('total_orders', 0)} orders")
        return data


class TestDrivers:
    """Driver management tests"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup authentication"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD
        })
        self.token = response.json()["token"]
        self.headers = {"Authorization": f"Bearer {self.token}"}
    
    def test_get_drivers(self):
        """Test getting all drivers"""
        response = requests.get(f"{BASE_URL}/api/drivers", headers=self.headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✅ Retrieved {len(data)} drivers")
        return data


class TestDeliveryApps:
    """Delivery apps tests"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup authentication"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD
        })
        self.token = response.json()["token"]
        self.headers = {"Authorization": f"Bearer {self.token}"}
    
    def test_get_delivery_apps(self):
        """Test getting delivery apps"""
        response = requests.get(f"{BASE_URL}/api/delivery-apps", headers=self.headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✅ Retrieved {len(data)} delivery apps")
        return data


class TestCashRegister:
    """Cash register tests"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup authentication"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD
        })
        self.token = response.json()["token"]
        self.headers = {"Authorization": f"Bearer {self.token}"}
    
    def test_cash_register_summary(self):
        """Test cash register summary"""
        response = requests.get(f"{BASE_URL}/api/cash-register/summary", headers=self.headers)
        # Can be 200 (shift exists) or 404 (no shift)
        assert response.status_code in [200, 404]
        if response.status_code == 200:
            data = response.json()
            print(f"✅ Cash register summary: Expected cash = {data.get('expected_cash', 0)} IQD")
        else:
            print("✅ No active shift for cash register (expected)")


class TestAPIResponseTimes:
    """API response time tests"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup authentication"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD
        })
        self.token = response.json()["token"]
        self.headers = {"Authorization": f"Bearer {self.token}"}
    
    def test_api_response_times(self):
        """Test API response times are acceptable"""
        import time
        
        endpoints = [
            ("/api/health", "GET"),
            ("/api/categories", "GET"),
            ("/api/products", "GET"),
            ("/api/branches", "GET"),
            ("/api/tables", "GET"),
            ("/api/orders", "GET"),
        ]
        
        results = []
        for endpoint, method in endpoints:
            start = time.time()
            if method == "GET":
                response = requests.get(f"{BASE_URL}{endpoint}", headers=self.headers)
            elapsed = (time.time() - start) * 1000  # Convert to ms
            results.append((endpoint, elapsed, response.status_code))
            
        print("✅ API Response Times:")
        all_fast = True
        for endpoint, elapsed, status in results:
            status_icon = "✓" if elapsed < 2000 else "⚠"
            if elapsed >= 2000:
                all_fast = False
            print(f"   {status_icon} {endpoint}: {elapsed:.0f}ms (status: {status})")
        
        # Assert all responses are under 5 seconds
        for endpoint, elapsed, status in results:
            assert elapsed < 5000, f"{endpoint} took too long: {elapsed}ms"
        
        return results


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
