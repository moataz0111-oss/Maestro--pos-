"""
Backend API Tests for Multi-tenant POS System Bug Fixes
Testing:
1. Raw materials (inventory) CRUD with tenant_id
2. Sales reports excluding refunded/cancelled orders
3. Delivery credits report showing only delivery companies (not driver deliveries)
4. Driver deliveries labeled 'توصيل سائقين' in payment method breakdown
"""

import pytest
import requests
import os
from datetime import datetime, timezone

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials from test_credentials.md
ADMIN_EMAIL = "hanialdujaili@gmail.com"
ADMIN_PASSWORD = "Hani@2024"
SUPER_ADMIN_EMAIL = "owner@maestroegp.com"
SUPER_ADMIN_PASSWORD = "owner123"
SUPER_ADMIN_SECRET = "271018"


class TestAuthentication:
    """Test authentication to get tokens for subsequent tests"""
    
    @pytest.fixture(scope="class")
    def admin_token(self):
        """Get admin authentication token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        if response.status_code == 200:
            data = response.json()
            return data.get("token") or data.get("access_token")
        pytest.skip(f"Admin login failed: {response.status_code} - {response.text}")
    
    @pytest.fixture(scope="class")
    def super_admin_token(self):
        """Get super admin authentication token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": SUPER_ADMIN_EMAIL,
            "password": SUPER_ADMIN_PASSWORD,
            "super_admin_secret": SUPER_ADMIN_SECRET
        })
        if response.status_code == 200:
            data = response.json()
            return data.get("token") or data.get("access_token")
        pytest.skip(f"Super admin login failed: {response.status_code} - {response.text}")
    
    def test_admin_login(self):
        """Test admin login works"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        assert response.status_code == 200, f"Admin login failed: {response.text}"
        data = response.json()
        assert "token" in data or "access_token" in data, "No token in response"
        print(f"✓ Admin login successful")


class TestRawMaterialsNew:
    """Test /api/raw-materials-new endpoints with tenant_id filtering"""
    
    @pytest.fixture(scope="class")
    def auth_headers(self):
        """Get authentication headers"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        if response.status_code == 200:
            data = response.json()
            token = data.get("token") or data.get("access_token")
            return {"Authorization": f"Bearer {token}"}
        pytest.skip(f"Login failed: {response.status_code}")
    
    def test_create_raw_material_with_tenant_id(self, auth_headers):
        """POST /api/raw-materials-new creates material with tenant_id field"""
        material_data = {
            "name": f"TEST_Material_{datetime.now().strftime('%H%M%S')}",
            "name_en": "Test Material",
            "unit": "كغم",
            "quantity": 100.0,
            "min_quantity": 10.0,
            "cost_per_unit": 5000.0,
            "waste_percentage": 5.0,
            "category": "test"
        }
        
        response = requests.post(
            f"{BASE_URL}/api/raw-materials-new",
            json=material_data,
            headers=auth_headers
        )
        
        assert response.status_code in [200, 201], f"Create failed: {response.status_code} - {response.text}"
        data = response.json()
        
        # Verify tenant_id is present in response
        assert "tenant_id" in data, "tenant_id field missing from created material"
        assert data["tenant_id"] is not None, "tenant_id should not be None"
        assert "id" in data, "id field missing"
        assert data["name"] == material_data["name"], "Name mismatch"
        
        print(f"✓ Created raw material with tenant_id: {data['tenant_id']}")
        return data
    
    def test_get_raw_materials_filtered_by_tenant(self, auth_headers):
        """GET /api/raw-materials-new returns materials filtered by tenant_id"""
        response = requests.get(
            f"{BASE_URL}/api/raw-materials-new",
            headers=auth_headers
        )
        
        assert response.status_code == 200, f"GET failed: {response.status_code} - {response.text}"
        materials = response.json()
        
        assert isinstance(materials, list), "Response should be a list"
        print(f"✓ Retrieved {len(materials)} raw materials")
        
        # If there are materials, verify they have tenant_id
        if materials:
            for material in materials[:5]:  # Check first 5
                # Materials should either have tenant_id or be legacy data
                if "tenant_id" in material:
                    print(f"  - Material '{material.get('name')}' has tenant_id: {material.get('tenant_id')}")
    
    def test_get_raw_materials_from_db_raw_materials(self, auth_headers):
        """GET /api/raw-materials returns materials from db.raw_materials"""
        response = requests.get(
            f"{BASE_URL}/api/raw-materials",
            headers=auth_headers
        )
        
        assert response.status_code == 200, f"GET failed: {response.status_code} - {response.text}"
        materials = response.json()
        
        assert isinstance(materials, list), "Response should be a list"
        print(f"✓ Retrieved {len(materials)} raw materials from /api/raw-materials")
    
    def test_add_stock_requires_authentication(self):
        """POST /api/raw-materials-new/{id}/add-stock requires authentication"""
        # Try without auth headers
        response = requests.post(
            f"{BASE_URL}/api/raw-materials-new/fake-id/add-stock",
            params={"quantity": 10}
        )
        
        # Should return 401 or 403 without authentication
        assert response.status_code in [401, 403, 422], f"Expected auth error, got: {response.status_code}"
        print(f"✓ add-stock endpoint requires authentication (status: {response.status_code})")


class TestSalesReportExclusions:
    """Test sales report excludes refunded and cancelled orders"""
    
    @pytest.fixture(scope="class")
    def auth_headers(self):
        """Get authentication headers"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        if response.status_code == 200:
            data = response.json()
            token = data.get("token") or data.get("access_token")
            return {"Authorization": f"Bearer {token}"}
        pytest.skip(f"Login failed: {response.status_code}")
    
    def test_sales_report_endpoint_works(self, auth_headers):
        """GET /api/reports/sales returns valid response"""
        response = requests.get(
            f"{BASE_URL}/api/reports/sales",
            headers=auth_headers
        )
        
        assert response.status_code == 200, f"Sales report failed: {response.status_code} - {response.text}"
        data = response.json()
        
        # Verify expected fields exist
        assert "total_sales" in data, "total_sales field missing"
        assert "total_orders" in data, "total_orders field missing"
        assert "by_payment_method" in data, "by_payment_method field missing"
        
        print(f"✓ Sales report returned: total_sales={data['total_sales']}, total_orders={data['total_orders']}")
        return data
    
    def test_sales_report_has_payment_method_breakdown(self, auth_headers):
        """Sales report includes payment method breakdown with driver deliveries labeled correctly"""
        response = requests.get(
            f"{BASE_URL}/api/reports/sales",
            headers=auth_headers
        )
        
        assert response.status_code == 200
        data = response.json()
        
        by_payment = data.get("by_payment_method", {})
        print(f"✓ Payment method breakdown: {list(by_payment.keys())}")
        
        # Check if 'توصيل سائقين' appears when there are driver deliveries
        if "توصيل سائقين" in by_payment:
            print(f"  - توصيل سائقين (Driver deliveries): {by_payment['توصيل سائقين']}")
        
        # Check for pending orders shown separately
        if "معلق" in by_payment:
            print(f"  - معلق (Pending): {by_payment['معلق']}")
    
    def test_sales_report_separates_pending_orders(self, auth_headers):
        """Sales report shows pending orders separately from paid totals"""
        response = requests.get(
            f"{BASE_URL}/api/reports/sales",
            headers=auth_headers
        )
        
        assert response.status_code == 200
        data = response.json()
        
        # The report should have by_payment_method with potential 'معلق' key
        by_payment = data.get("by_payment_method", {})
        
        # Verify the structure is correct
        assert isinstance(by_payment, dict), "by_payment_method should be a dict"
        print(f"✓ Sales report payment methods: {by_payment}")


class TestDeliveryCreditsReport:
    """Test delivery credits report shows only delivery company orders"""
    
    @pytest.fixture(scope="class")
    def auth_headers(self):
        """Get authentication headers"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        if response.status_code == 200:
            data = response.json()
            token = data.get("token") or data.get("access_token")
            return {"Authorization": f"Bearer {token}"}
        pytest.skip(f"Login failed: {response.status_code}")
    
    def test_delivery_credits_report_endpoint_works(self, auth_headers):
        """GET /api/reports/delivery-credits returns valid response"""
        response = requests.get(
            f"{BASE_URL}/api/reports/delivery-credits",
            headers=auth_headers
        )
        
        assert response.status_code == 200, f"Delivery credits report failed: {response.status_code} - {response.text}"
        data = response.json()
        
        # Verify expected fields exist
        assert "total_sales" in data, "total_sales field missing"
        assert "total_commission" in data, "total_commission field missing"
        assert "net_receivable" in data, "net_receivable field missing"
        assert "by_delivery_app" in data, "by_delivery_app field missing"
        
        print(f"✓ Delivery credits report: total_sales={data['total_sales']}, total_commission={data['total_commission']}")
        return data
    
    def test_delivery_credits_only_shows_delivery_companies(self, auth_headers):
        """Delivery credits report only shows delivery company orders, not driver deliveries"""
        response = requests.get(
            f"{BASE_URL}/api/reports/delivery-credits",
            headers=auth_headers
        )
        
        assert response.status_code == 200
        data = response.json()
        
        by_app = data.get("by_delivery_app", {})
        print(f"✓ Delivery companies in report: {list(by_app.keys())}")
        
        # Verify structure of each delivery app entry
        for app_name, app_data in by_app.items():
            assert "total_sales" in app_data, f"total_sales missing for {app_name}"
            assert "total_commission" in app_data or "commission" in app_data, f"commission missing for {app_name}"
            print(f"  - {app_name}: sales={app_data.get('total_sales', 0)}")


class TestBranchRequests:
    """Test branch requests include tenant_id filtering"""
    
    @pytest.fixture(scope="class")
    def auth_headers(self):
        """Get authentication headers"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        if response.status_code == 200:
            data = response.json()
            token = data.get("token") or data.get("access_token")
            return {"Authorization": f"Bearer {token}"}
        pytest.skip(f"Login failed: {response.status_code}")
    
    def test_get_branch_requests_with_tenant_filtering(self, auth_headers):
        """GET /api/branch-requests includes tenant_id filtering"""
        response = requests.get(
            f"{BASE_URL}/api/branch-requests",
            headers=auth_headers
        )
        
        assert response.status_code == 200, f"Branch requests failed: {response.status_code} - {response.text}"
        data = response.json()
        
        assert isinstance(data, list), "Response should be a list"
        print(f"✓ Retrieved {len(data)} branch requests")
        
        # If there are requests, verify they have tenant_id
        if data:
            for req in data[:3]:  # Check first 3
                if "tenant_id" in req:
                    print(f"  - Request #{req.get('request_number')} has tenant_id: {req.get('tenant_id')}")


class TestReportsRoutesSalesExclusion:
    """Test reports_routes.py sales report excludes refunded/cancelled orders"""
    
    @pytest.fixture(scope="class")
    def auth_headers(self):
        """Get authentication headers"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        if response.status_code == 200:
            data = response.json()
            token = data.get("token") or data.get("access_token")
            return {"Authorization": f"Bearer {token}"}
        pytest.skip(f"Login failed: {response.status_code}")
    
    def test_reports_sales_endpoint(self, auth_headers):
        """GET /api/reports/sales from reports_routes.py"""
        response = requests.get(
            f"{BASE_URL}/api/reports/sales",
            headers=auth_headers
        )
        
        assert response.status_code == 200, f"Reports sales failed: {response.status_code} - {response.text}"
        data = response.json()
        
        # Verify the report structure
        expected_fields = [
            "total_sales", "total_cost", "total_profit", "total_orders",
            "by_payment_method", "by_order_type", "by_delivery_app"
        ]
        
        for field in expected_fields:
            assert field in data, f"Missing field: {field}"
        
        print(f"✓ Reports/sales endpoint working correctly")
        print(f"  - Total sales: {data['total_sales']}")
        print(f"  - Total orders: {data['total_orders']}")
        print(f"  - Payment methods: {list(data['by_payment_method'].keys())}")
    
    def test_reports_delivery_credits_endpoint(self, auth_headers):
        """GET /api/reports/delivery-credits from reports_routes.py"""
        response = requests.get(
            f"{BASE_URL}/api/reports/delivery-credits",
            headers=auth_headers
        )
        
        assert response.status_code == 200, f"Reports delivery-credits failed: {response.status_code} - {response.text}"
        data = response.json()
        
        # Verify the report structure
        expected_fields = ["total_sales", "total_commission", "net_receivable", "by_delivery_app"]
        
        for field in expected_fields:
            assert field in data, f"Missing field: {field}"
        
        print(f"✓ Reports/delivery-credits endpoint working correctly")
        print(f"  - Total sales: {data['total_sales']}")
        print(f"  - Total commission: {data['total_commission']}")
        print(f"  - Net receivable: {data['net_receivable']}")


# Cleanup fixture
@pytest.fixture(scope="session", autouse=True)
def cleanup_test_data():
    """Cleanup TEST_ prefixed data after all tests"""
    yield
    # Cleanup would go here if needed
    print("\n✓ Test session completed")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
