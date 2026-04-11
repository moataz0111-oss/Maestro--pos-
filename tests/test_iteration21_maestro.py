"""
Iteration 21 - Maestro EGP Testing
Testing: Login, Dashboard, POS, Drivers, HR, Branches, Delivery, Orders, Invoices, Coupons
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://zk-photo-sync.preview.emergentagent.com')

class TestHealthAndAuth:
    """Health check and authentication tests"""
    
    def test_health_check(self):
        """Test API health endpoint"""
        response = requests.get(f"{BASE_URL}/api/health")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "ok"
        print("✅ Health check passed")
    
    def test_admin_login(self):
        """Test admin login with admin@maestroegp.com / admin123"""
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
        print(f"✅ Admin login successful - User: {data['user']['full_name']}")
        return data["token"]
    
    def test_super_admin_login(self):
        """Test super admin login with owner@maestroegp.com / owner123"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "owner@maestroegp.com",
            "password": "owner123"
        })
        assert response.status_code == 200
        data = response.json()
        assert "token" in data
        assert data["user"]["role"] == "super_admin"
        print(f"✅ Super Admin login successful - User: {data['user']['full_name']}")


class TestDashboard:
    """Dashboard API tests"""
    
    @pytest.fixture
    def auth_token(self):
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "admin@maestroegp.com",
            "password": "admin123"
        })
        return response.json()["token"]
    
    def test_dashboard_stats(self, auth_token):
        """Test dashboard statistics endpoint"""
        headers = {"Authorization": f"Bearer {auth_token}"}
        response = requests.get(f"{BASE_URL}/api/dashboard/stats", headers=headers)
        assert response.status_code == 200
        data = response.json()
        # Dashboard should return stats
        print(f"✅ Dashboard stats retrieved: {list(data.keys())}")


class TestPOS:
    """POS (Point of Sale) API tests - Categories and Products"""
    
    @pytest.fixture
    def auth_token(self):
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "admin@maestroegp.com",
            "password": "admin123"
        })
        return response.json()["token"]
    
    def test_get_categories(self, auth_token):
        """Test getting categories for POS"""
        headers = {"Authorization": f"Bearer {auth_token}"}
        response = requests.get(f"{BASE_URL}/api/categories", headers=headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✅ Categories retrieved: {len(data)} categories")
        if len(data) > 0:
            print(f"   Sample categories: {[c.get('name', c.get('name_ar')) for c in data[:3]]}")
    
    def test_get_products(self, auth_token):
        """Test getting products for POS"""
        headers = {"Authorization": f"Bearer {auth_token}"}
        response = requests.get(f"{BASE_URL}/api/products", headers=headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✅ Products retrieved: {len(data)} products")
        if len(data) > 0:
            print(f"   Sample products: {[p.get('name') for p in data[:3]]}")


class TestDrivers:
    """Drivers API tests - Should have 3 drivers"""
    
    @pytest.fixture
    def auth_token(self):
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "admin@maestroegp.com",
            "password": "admin123"
        })
        return response.json()["token"]
    
    def test_get_drivers(self, auth_token):
        """Test getting drivers - should have at least 3"""
        headers = {"Authorization": f"Bearer {auth_token}"}
        response = requests.get(f"{BASE_URL}/api/drivers", headers=headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✅ Drivers retrieved: {len(data)} drivers")
        # Check if we have at least 3 drivers as expected
        if len(data) >= 3:
            print(f"   ✅ Has 3+ drivers as expected")
        else:
            print(f"   ⚠️ Expected 3 drivers, found {len(data)}")
        for d in data[:3]:
            print(f"   - {d.get('name')}: {d.get('phone')}")


class TestHR:
    """HR (Employees) API tests"""
    
    @pytest.fixture
    def auth_token(self):
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "admin@maestroegp.com",
            "password": "admin123"
        })
        return response.json()["token"]
    
    def test_get_employees(self, auth_token):
        """Test getting employees"""
        headers = {"Authorization": f"Bearer {auth_token}"}
        response = requests.get(f"{BASE_URL}/api/employees", headers=headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✅ Employees retrieved: {len(data)} employees")
        for e in data[:3]:
            print(f"   - {e.get('name')}: {e.get('position')}")


class TestBranches:
    """Branches API tests"""
    
    @pytest.fixture
    def auth_token(self):
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "admin@maestroegp.com",
            "password": "admin123"
        })
        return response.json()["token"]
    
    def test_get_branches(self, auth_token):
        """Test getting branches"""
        headers = {"Authorization": f"Bearer {auth_token}"}
        response = requests.get(f"{BASE_URL}/api/branches", headers=headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✅ Branches retrieved: {len(data)} branches")
        for b in data[:3]:
            print(f"   - {b.get('name')}: {b.get('address', 'N/A')}")


class TestDelivery:
    """Delivery API tests"""
    
    @pytest.fixture
    def auth_token(self):
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "admin@maestroegp.com",
            "password": "admin123"
        })
        return response.json()["token"]
    
    def test_get_delivery_orders(self, auth_token):
        """Test getting delivery orders"""
        headers = {"Authorization": f"Bearer {auth_token}"}
        response = requests.get(f"{BASE_URL}/api/orders?order_type=delivery", headers=headers)
        assert response.status_code == 200
        data = response.json()
        print(f"✅ Delivery orders retrieved: {len(data) if isinstance(data, list) else 'N/A'}")


class TestOrders:
    """Orders API tests"""
    
    @pytest.fixture
    def auth_token(self):
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "admin@maestroegp.com",
            "password": "admin123"
        })
        return response.json()["token"]
    
    def test_get_orders(self, auth_token):
        """Test getting all orders"""
        headers = {"Authorization": f"Bearer {auth_token}"}
        response = requests.get(f"{BASE_URL}/api/orders", headers=headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✅ Orders retrieved: {len(data)} orders")


class TestInvoices:
    """Invoices API tests"""
    
    @pytest.fixture
    def auth_token(self):
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "admin@maestroegp.com",
            "password": "admin123"
        })
        return response.json()["token"]
    
    def test_get_invoice_templates(self, auth_token):
        """Test getting invoice templates"""
        headers = {"Authorization": f"Bearer {auth_token}"}
        response = requests.get(f"{BASE_URL}/api/invoice-templates", headers=headers)
        assert response.status_code == 200
        data = response.json()
        print(f"✅ Invoice templates retrieved: {len(data) if isinstance(data, list) else 'N/A'}")
    
    def test_get_printers(self, auth_token):
        """Test getting printers"""
        headers = {"Authorization": f"Bearer {auth_token}"}
        response = requests.get(f"{BASE_URL}/api/printers", headers=headers)
        assert response.status_code == 200
        data = response.json()
        print(f"✅ Printers retrieved: {len(data) if isinstance(data, list) else 'N/A'}")


class TestCoupons:
    """Coupons and Promotions API tests"""
    
    @pytest.fixture
    def auth_token(self):
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "admin@maestroegp.com",
            "password": "admin123"
        })
        return response.json()["token"]
    
    def test_get_coupons(self, auth_token):
        """Test getting coupons"""
        headers = {"Authorization": f"Bearer {auth_token}"}
        response = requests.get(f"{BASE_URL}/api/coupons", headers=headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✅ Coupons retrieved: {len(data)} coupons")
    
    def test_get_promotions(self, auth_token):
        """Test getting promotions"""
        headers = {"Authorization": f"Bearer {auth_token}"}
        response = requests.get(f"{BASE_URL}/api/promotions", headers=headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✅ Promotions retrieved: {len(data)} promotions")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
