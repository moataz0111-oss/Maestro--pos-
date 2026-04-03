"""
Iteration 10 - Testing Purchasing, Branch Orders, and Dashboard Backgrounds APIs
Tests for new features: Suppliers, Purchase Orders, Branch Orders, Dashboard Backgrounds
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://arabic-receipts.preview.emergentagent.com')

class TestPurchasingAPIs:
    """Test Purchasing and Suppliers APIs"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup - login and get token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "admin@maestroegp.com",
            "password": "admin123"
        })
        assert response.status_code == 200, f"Login failed: {response.text}"
        self.token = response.json()["token"]
        self.headers = {"Authorization": f"Bearer {self.token}"}
    
    def test_get_suppliers_empty(self):
        """Test GET /api/suppliers - returns empty list initially"""
        response = requests.get(f"{BASE_URL}/api/suppliers", headers=self.headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ GET /api/suppliers - returned {len(data)} suppliers")
    
    def test_create_supplier(self):
        """Test POST /api/suppliers - create new supplier"""
        supplier_data = {
            "name": "TEST_مورد تجريبي",
            "phone": "0501234567",
            "email": "test@supplier.com",
            "address": "بغداد - الكرادة",
            "notes": "مورد تجريبي للاختبار"
        }
        response = requests.post(f"{BASE_URL}/api/suppliers", json=supplier_data, headers=self.headers)
        assert response.status_code == 200
        data = response.json()
        assert data["name"] == supplier_data["name"]
        assert data["phone"] == supplier_data["phone"]
        assert "id" in data
        self.supplier_id = data["id"]
        print(f"✓ POST /api/suppliers - created supplier: {data['name']}")
        return data["id"]
    
    def test_get_suppliers_after_create(self):
        """Test GET /api/suppliers - returns created supplier"""
        # First create a supplier
        supplier_data = {
            "name": "TEST_مورد للتحقق",
            "phone": "0509876543"
        }
        create_response = requests.post(f"{BASE_URL}/api/suppliers", json=supplier_data, headers=self.headers)
        assert create_response.status_code == 200
        
        # Then get all suppliers
        response = requests.get(f"{BASE_URL}/api/suppliers", headers=self.headers)
        assert response.status_code == 200
        data = response.json()
        assert len(data) >= 1
        print(f"✓ GET /api/suppliers - found {len(data)} suppliers after creation")
    
    def test_get_purchase_orders_empty(self):
        """Test GET /api/purchase-orders - returns empty list initially"""
        response = requests.get(f"{BASE_URL}/api/purchase-orders", headers=self.headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ GET /api/purchase-orders - returned {len(data)} orders")
    
    def test_create_purchase_order(self):
        """Test POST /api/purchase-orders - create new purchase order"""
        # First create a supplier
        supplier_data = {"name": "TEST_مورد لأمر الشراء", "phone": "0501111111"}
        supplier_response = requests.post(f"{BASE_URL}/api/suppliers", json=supplier_data, headers=self.headers)
        assert supplier_response.status_code == 200
        supplier_id = supplier_response.json()["id"]
        
        # Create purchase order
        order_data = {
            "supplier_id": supplier_id,
            "items": [
                {"material_name": "لحم بقري", "quantity": 10, "unit": "كجم", "unit_price": 25000, "total": 250000}
            ],
            "notes": "طلب تجريبي"
        }
        response = requests.post(f"{BASE_URL}/api/purchase-orders", json=order_data, headers=self.headers)
        assert response.status_code == 200
        data = response.json()
        assert "order_number" in data
        assert data["status"] == "pending"
        print(f"✓ POST /api/purchase-orders - created order: {data['order_number']}")
        return data["id"]
    
    def test_get_raw_materials(self):
        """Test GET /api/raw-materials"""
        response = requests.get(f"{BASE_URL}/api/raw-materials", headers=self.headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ GET /api/raw-materials - returned {len(data)} materials")
    
    def test_get_low_stock_alerts(self):
        """Test GET /api/inventory/low-stock-alerts"""
        response = requests.get(f"{BASE_URL}/api/inventory/low-stock-alerts", headers=self.headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ GET /api/inventory/low-stock-alerts - returned {len(data)} alerts")


class TestBranchOrdersAPIs:
    """Test Branch Orders APIs"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup - login and get token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "admin@maestroegp.com",
            "password": "admin123"
        })
        assert response.status_code == 200
        self.token = response.json()["token"]
        self.headers = {"Authorization": f"Bearer {self.token}"}
    
    def test_get_branch_orders_empty(self):
        """Test GET /api/branch-orders - returns empty list initially"""
        response = requests.get(f"{BASE_URL}/api/branch-orders", headers=self.headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ GET /api/branch-orders - returned {len(data)} orders")
    
    def test_get_branch_orders_outgoing(self):
        """Test GET /api/branch-orders?type=outgoing"""
        response = requests.get(f"{BASE_URL}/api/branch-orders", params={"type": "outgoing"}, headers=self.headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ GET /api/branch-orders?type=outgoing - returned {len(data)} orders")
    
    def test_get_branch_orders_incoming(self):
        """Test GET /api/branch-orders?type=incoming"""
        response = requests.get(f"{BASE_URL}/api/branch-orders", params={"type": "incoming"}, headers=self.headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ GET /api/branch-orders?type=incoming - returned {len(data)} orders")
    
    def test_create_branch_order(self):
        """Test POST /api/branch-orders - create new branch order"""
        # First get branches
        branches_response = requests.get(f"{BASE_URL}/api/branches", headers=self.headers)
        assert branches_response.status_code == 200
        branches = branches_response.json()
        
        if len(branches) < 1:
            pytest.skip("No branches available for testing")
        
        # Create branch order
        order_data = {
            "to_branch_id": branches[0]["id"],
            "items": [
                {"product_name": "برجر كلاسيك", "quantity": 20, "unit": "قطعة"}
            ],
            "priority": "normal",
            "notes": "طلب تجريبي بين الفروع"
        }
        response = requests.post(f"{BASE_URL}/api/branch-orders", json=order_data, headers=self.headers)
        assert response.status_code == 200
        data = response.json()
        assert "order_number" in data
        assert data["status"] == "pending"
        print(f"✓ POST /api/branch-orders - created order: {data['order_number']}")


class TestDashboardBackgroundsAPIs:
    """Test Dashboard Backgrounds APIs"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup - login and get token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "admin@maestroegp.com",
            "password": "admin123"
        })
        assert response.status_code == 200
        self.token = response.json()["token"]
        self.headers = {"Authorization": f"Bearer {self.token}"}
    
    def test_get_dashboard_backgrounds(self):
        """Test GET /api/dashboard-backgrounds"""
        response = requests.get(f"{BASE_URL}/api/dashboard-backgrounds", headers=self.headers)
        assert response.status_code == 200
        data = response.json()
        assert "backgrounds" in data
        assert isinstance(data["backgrounds"], list)
        assert len(data["backgrounds"]) >= 6  # Default backgrounds
        print(f"✓ GET /api/dashboard-backgrounds - returned {len(data['backgrounds'])} backgrounds")
    
    def test_select_dashboard_background(self):
        """Test PUT /api/dashboard-backgrounds/select"""
        # First get available backgrounds
        get_response = requests.get(f"{BASE_URL}/api/dashboard-backgrounds", headers=self.headers)
        assert get_response.status_code == 200
        backgrounds = get_response.json()["backgrounds"]
        
        # Select a background
        select_data = {"background_url": backgrounds[0]}
        response = requests.put(f"{BASE_URL}/api/dashboard-backgrounds/select", json=select_data, headers=self.headers)
        assert response.status_code == 200
        data = response.json()
        assert "message" in data
        print(f"✓ PUT /api/dashboard-backgrounds/select - selected background successfully")


class TestSuperAdminFeatures:
    """Test Super Admin tenant features including new purchasing and branch orders"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup - login as super admin"""
        response = requests.post(
            f"{BASE_URL}/api/super-admin/login",
            params={"email": "owner@maestroegp.com", "password": "owner123", "secret_key": "271018"}
        )
        assert response.status_code == 200, f"Super Admin login failed: {response.text}"
        self.token = response.json()["token"]
        self.headers = {"Authorization": f"Bearer {self.token}"}
    
    def test_get_tenants(self):
        """Test GET /api/super-admin/tenants"""
        response = requests.get(f"{BASE_URL}/api/super-admin/tenants", headers=self.headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ GET /api/super-admin/tenants - returned {len(data)} tenants")
    
    def test_get_tenant_features(self):
        """Test GET /api/super-admin/tenants/{id}/features"""
        # First get tenants
        tenants_response = requests.get(f"{BASE_URL}/api/super-admin/tenants", headers=self.headers)
        tenants = tenants_response.json()
        
        if len(tenants) < 1:
            pytest.skip("No tenants available")
        
        # Get features for first non-main tenant
        for tenant in tenants:
            if not tenant.get("is_main_system"):
                response = requests.get(f"{BASE_URL}/api/super-admin/tenants/{tenant['id']}/features", headers=self.headers)
                assert response.status_code == 200
                data = response.json()
                # Check that new features exist in the response
                assert "showPurchasing" in data or "features" in data
                print(f"✓ GET /api/super-admin/tenants/{tenant['id']}/features - features retrieved")
                break


class TestCleanup:
    """Cleanup test data"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup - login and get token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "admin@maestroegp.com",
            "password": "admin123"
        })
        assert response.status_code == 200
        self.token = response.json()["token"]
        self.headers = {"Authorization": f"Bearer {self.token}"}
    
    def test_cleanup_test_suppliers(self):
        """Cleanup TEST_ prefixed suppliers"""
        response = requests.get(f"{BASE_URL}/api/suppliers", headers=self.headers)
        if response.status_code == 200:
            suppliers = response.json()
            for supplier in suppliers:
                if supplier.get("name", "").startswith("TEST_"):
                    requests.delete(f"{BASE_URL}/api/suppliers/{supplier['id']}", headers=self.headers)
                    print(f"  Cleaned up supplier: {supplier['name']}")
        print("✓ Cleanup completed")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
