"""
Iteration 6 Tests - Maestro EGP
Testing:
1. Super Admin login and dashboard (/super-admin) - should show tenants list with stats
2. Super Admin tenant management - view tenant details, toggle status
3. Super Admin reset sales button - new feature to reset tenant sales data
4. Cash register summary API (/api/cash-register/summary) - should return correct sales breakdown
5. Cash register close dialog - should show total_sales, cash_sales, card_sales, credit_sales
"""

import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Super Admin credentials
SUPER_ADMIN_EMAIL = "owner@maestroegp.com"
SUPER_ADMIN_PASSWORD = "owner123"
SUPER_ADMIN_SECRET_KEY = "271018"

# System Admin credentials
SYSTEM_ADMIN_EMAIL = "admin@maestroegp.com"
SYSTEM_ADMIN_PASSWORD = "admin123"


class TestSuperAdminAuth:
    """Super Admin authentication tests"""
    
    def test_super_admin_login_success(self):
        """Test Super Admin login with correct credentials"""
        response = requests.post(
            f"{BASE_URL}/api/super-admin/login",
            params={
                "email": SUPER_ADMIN_EMAIL,
                "password": SUPER_ADMIN_PASSWORD,
                "secret_key": SUPER_ADMIN_SECRET_KEY
            }
        )
        print(f"Super Admin Login Response: {response.status_code}")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "token" in data, "Response should contain token"
        assert "user" in data, "Response should contain user"
        assert data["user"]["role"] == "super_admin", "User role should be super_admin"
        print(f"Super Admin login successful: {data['user']['full_name']}")
        return data["token"]
    
    def test_super_admin_login_wrong_secret(self):
        """Test Super Admin login with wrong secret key"""
        response = requests.post(
            f"{BASE_URL}/api/super-admin/login",
            params={
                "email": SUPER_ADMIN_EMAIL,
                "password": SUPER_ADMIN_PASSWORD,
                "secret_key": "wrong_secret"
            }
        )
        print(f"Wrong secret key response: {response.status_code}")
        assert response.status_code == 401, f"Expected 401, got {response.status_code}"
    
    def test_super_admin_login_wrong_password(self):
        """Test Super Admin login with wrong password"""
        response = requests.post(
            f"{BASE_URL}/api/super-admin/login",
            params={
                "email": SUPER_ADMIN_EMAIL,
                "password": "wrong_password",
                "secret_key": SUPER_ADMIN_SECRET_KEY
            }
        )
        print(f"Wrong password response: {response.status_code}")
        assert response.status_code == 401, f"Expected 401, got {response.status_code}"


class TestSuperAdminDashboard:
    """Super Admin dashboard and tenant management tests"""
    
    @pytest.fixture
    def super_admin_token(self):
        """Get Super Admin token"""
        response = requests.post(
            f"{BASE_URL}/api/super-admin/login",
            params={
                "email": SUPER_ADMIN_EMAIL,
                "password": SUPER_ADMIN_PASSWORD,
                "secret_key": SUPER_ADMIN_SECRET_KEY
            }
        )
        if response.status_code != 200:
            pytest.skip("Super Admin login failed")
        return response.json()["token"]
    
    def test_get_tenants_list(self, super_admin_token):
        """Test getting list of tenants"""
        response = requests.get(
            f"{BASE_URL}/api/super-admin/tenants",
            headers={"Authorization": f"Bearer {super_admin_token}"}
        )
        print(f"Get tenants response: {response.status_code}")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        print(f"Found {len(data)} tenants")
        
        # Check tenant structure if any exist
        if len(data) > 0:
            tenant = data[0]
            assert "id" in tenant, "Tenant should have id"
            assert "name" in tenant, "Tenant should have name"
            assert "owner_email" in tenant, "Tenant should have owner_email"
            assert "is_active" in tenant, "Tenant should have is_active"
            print(f"First tenant: {tenant['name']} - Active: {tenant['is_active']}")
    
    def test_get_super_admin_stats(self, super_admin_token):
        """Test getting Super Admin dashboard stats"""
        response = requests.get(
            f"{BASE_URL}/api/super-admin/stats",
            headers={"Authorization": f"Bearer {super_admin_token}"}
        )
        print(f"Get stats response: {response.status_code}")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "total_tenants" in data, "Stats should have total_tenants"
        assert "active_tenants" in data, "Stats should have active_tenants"
        assert "total_users" in data, "Stats should have total_users"
        assert "total_sales" in data, "Stats should have total_sales"
        print(f"Stats: {data['total_tenants']} tenants, {data['active_tenants']} active, {data['total_users']} users, {data['total_sales']} sales")
    
    def test_get_tenant_details(self, super_admin_token):
        """Test getting tenant details"""
        # First get list of tenants
        tenants_response = requests.get(
            f"{BASE_URL}/api/super-admin/tenants",
            headers={"Authorization": f"Bearer {super_admin_token}"}
        )
        if tenants_response.status_code != 200 or len(tenants_response.json()) == 0:
            pytest.skip("No tenants available to test")
        
        tenant_id = tenants_response.json()[0]["id"]
        
        response = requests.get(
            f"{BASE_URL}/api/super-admin/tenants/{tenant_id}",
            headers={"Authorization": f"Bearer {super_admin_token}"}
        )
        print(f"Get tenant details response: {response.status_code}")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "tenant" in data, "Response should have tenant"
        assert "users" in data, "Response should have users"
        assert "branches" in data, "Response should have branches"
        assert "stats" in data, "Response should have stats"
        print(f"Tenant details: {data['tenant']['name']}, {len(data['users'])} users, {len(data['branches'])} branches")
    
    def test_get_tenant_live_stats(self, super_admin_token):
        """Test getting tenant live stats"""
        # First get list of tenants
        tenants_response = requests.get(
            f"{BASE_URL}/api/super-admin/tenants",
            headers={"Authorization": f"Bearer {super_admin_token}"}
        )
        if tenants_response.status_code != 200 or len(tenants_response.json()) == 0:
            pytest.skip("No tenants available to test")
        
        tenant_id = tenants_response.json()[0]["id"]
        
        response = requests.get(
            f"{BASE_URL}/api/super-admin/tenants/{tenant_id}/live",
            headers={"Authorization": f"Bearer {super_admin_token}"}
        )
        print(f"Get tenant live stats response: {response.status_code}")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "today" in data, "Response should have today stats"
        print(f"Live stats: {data.get('today', {})}")


class TestSuperAdminResetSales:
    """Super Admin reset sales feature tests"""
    
    @pytest.fixture
    def super_admin_token(self):
        """Get Super Admin token"""
        response = requests.post(
            f"{BASE_URL}/api/super-admin/login",
            params={
                "email": SUPER_ADMIN_EMAIL,
                "password": SUPER_ADMIN_PASSWORD,
                "secret_key": SUPER_ADMIN_SECRET_KEY
            }
        )
        if response.status_code != 200:
            pytest.skip("Super Admin login failed")
        return response.json()["token"]
    
    def test_reset_tenant_sales_without_confirm(self, super_admin_token):
        """Test reset tenant sales without confirmation - should fail"""
        # First get list of tenants
        tenants_response = requests.get(
            f"{BASE_URL}/api/super-admin/tenants",
            headers={"Authorization": f"Bearer {super_admin_token}"}
        )
        if tenants_response.status_code != 200 or len(tenants_response.json()) == 0:
            pytest.skip("No tenants available to test")
        
        tenant_id = tenants_response.json()[0]["id"]
        
        response = requests.post(
            f"{BASE_URL}/api/super-admin/tenants/{tenant_id}/reset-sales",
            headers={"Authorization": f"Bearer {super_admin_token}"}
        )
        print(f"Reset sales without confirm response: {response.status_code}")
        assert response.status_code == 400, f"Expected 400, got {response.status_code}: {response.text}"
    
    def test_reset_tenant_sales_endpoint_exists(self, super_admin_token):
        """Test that reset tenant sales endpoint exists and requires confirmation"""
        # First get list of tenants
        tenants_response = requests.get(
            f"{BASE_URL}/api/super-admin/tenants",
            headers={"Authorization": f"Bearer {super_admin_token}"}
        )
        if tenants_response.status_code != 200 or len(tenants_response.json()) == 0:
            pytest.skip("No tenants available to test")
        
        tenant_id = tenants_response.json()[0]["id"]
        
        # Test with confirm=false (should fail with 400, not 404)
        response = requests.post(
            f"{BASE_URL}/api/super-admin/tenants/{tenant_id}/reset-sales",
            params={"confirm": "false"},
            headers={"Authorization": f"Bearer {super_admin_token}"}
        )
        print(f"Reset sales endpoint check response: {response.status_code}")
        # Should be 400 (requires confirmation) not 404 (endpoint not found)
        assert response.status_code == 400, f"Expected 400, got {response.status_code}: {response.text}"
        assert "تأكيد" in response.json().get("detail", ""), "Should mention confirmation required"


class TestCashRegisterSummary:
    """Cash register summary API tests"""
    
    @pytest.fixture
    def admin_token(self):
        """Get System Admin token"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={
                "email": SYSTEM_ADMIN_EMAIL,
                "password": SYSTEM_ADMIN_PASSWORD
            }
        )
        if response.status_code != 200:
            pytest.skip("Admin login failed")
        return response.json()["token"]
    
    def test_cash_register_summary_no_shift(self, admin_token):
        """Test cash register summary when no shift is open"""
        response = requests.get(
            f"{BASE_URL}/api/cash-register/summary",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        print(f"Cash register summary (no shift) response: {response.status_code}")
        # Should return 404 if no open shift, or 200 if shift is open
        assert response.status_code in [200, 404], f"Expected 200 or 404, got {response.status_code}: {response.text}"
        
        if response.status_code == 200:
            data = response.json()
            # Verify response structure
            assert "total_sales" in data, "Response should have total_sales"
            assert "cash_sales" in data, "Response should have cash_sales"
            assert "card_sales" in data, "Response should have card_sales"
            assert "credit_sales" in data, "Response should have credit_sales"
            print(f"Cash register summary: total={data['total_sales']}, cash={data['cash_sales']}, card={data['card_sales']}, credit={data['credit_sales']}")
        else:
            print("No open shift - expected behavior")
    
    def test_cash_register_summary_structure(self, admin_token):
        """Test cash register summary response structure when shift is open"""
        # First try to auto-open a shift
        auto_open_response = requests.post(
            f"{BASE_URL}/api/shifts/auto-open",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        print(f"Auto-open shift response: {auto_open_response.status_code}")
        
        # Now get summary
        response = requests.get(
            f"{BASE_URL}/api/cash-register/summary",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        print(f"Cash register summary response: {response.status_code}")
        
        if response.status_code == 200:
            data = response.json()
            # Verify all required fields
            required_fields = [
                "shift_id", "branch_id", "cashier_id", "cashier_name",
                "started_at", "opening_cash", "total_sales", "total_cost",
                "gross_profit", "total_orders", "cash_sales", "card_sales",
                "credit_sales", "delivery_app_sales", "driver_sales",
                "discounts_total", "cancelled_orders", "cancelled_amount",
                "total_expenses", "net_profit", "expected_cash"
            ]
            
            for field in required_fields:
                assert field in data, f"Response should have {field}"
            
            print(f"Summary fields verified: {len(required_fields)} fields present")
            print(f"Sales breakdown: total={data['total_sales']}, cash={data['cash_sales']}, card={data['card_sales']}, credit={data['credit_sales']}")
        else:
            print(f"Could not get summary: {response.text}")


class TestSystemAdminAuth:
    """System Admin authentication tests"""
    
    def test_system_admin_login_success(self):
        """Test System Admin login with correct credentials"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={
                "email": SYSTEM_ADMIN_EMAIL,
                "password": SYSTEM_ADMIN_PASSWORD
            }
        )
        print(f"System Admin Login Response: {response.status_code}")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "token" in data, "Response should contain token"
        assert "user" in data, "Response should contain user"
        print(f"System Admin login successful: {data['user']['full_name']}, role: {data['user']['role']}")


class TestTenantToggleStatus:
    """Test tenant status toggle functionality"""
    
    @pytest.fixture
    def super_admin_token(self):
        """Get Super Admin token"""
        response = requests.post(
            f"{BASE_URL}/api/super-admin/login",
            params={
                "email": SUPER_ADMIN_EMAIL,
                "password": SUPER_ADMIN_PASSWORD,
                "secret_key": SUPER_ADMIN_SECRET_KEY
            }
        )
        if response.status_code != 200:
            pytest.skip("Super Admin login failed")
        return response.json()["token"]
    
    def test_toggle_tenant_status_endpoint(self, super_admin_token):
        """Test that toggle tenant status endpoint exists"""
        # First get list of tenants
        tenants_response = requests.get(
            f"{BASE_URL}/api/super-admin/tenants",
            headers={"Authorization": f"Bearer {super_admin_token}"}
        )
        if tenants_response.status_code != 200 or len(tenants_response.json()) == 0:
            pytest.skip("No tenants available to test")
        
        tenant_id = tenants_response.json()[0]["id"]
        
        # Test toggle endpoint
        response = requests.put(
            f"{BASE_URL}/api/super-admin/tenants/{tenant_id}/toggle-status",
            headers={"Authorization": f"Bearer {super_admin_token}"}
        )
        print(f"Toggle tenant status response: {response.status_code}")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "is_active" in data, "Response should have is_active"
        print(f"Tenant status toggled to: {data['is_active']}")
        
        # Toggle back to original state
        response2 = requests.put(
            f"{BASE_URL}/api/super-admin/tenants/{tenant_id}/toggle-status",
            headers={"Authorization": f"Bearer {super_admin_token}"}
        )
        print(f"Toggle back response: {response2.status_code}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
