"""
Test file for iteration 96 - Testing new features:
1. Settings page -> Users section - should be single section without sub-tabs (no employees tab)
2. Settings page -> Branches section - should show "limit reached" alert when customer reaches limit
3. Super Admin panel -> Edit tenant features - should show new features: Owner Wallet, External Branches, Comprehensive Report
4. API /api/settings/dashboard - should return new features (showOwnerWallet, showExternalBranches, showComprehensiveReport)
5. API /api/super-admin/tenants/{id}/features GET - should return new features
"""

import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://invoice-snap-11.preview.emergentagent.com')

# Test credentials
SUPER_ADMIN_EMAIL = "owner@maestroegp.com"
SUPER_ADMIN_PASSWORD = "owner123"
SUPER_ADMIN_SECRET = "271018"

DEMO_USER_EMAIL = "demo@maestroegp.com"
DEMO_USER_PASSWORD = "demo123"


class TestNewFeatures:
    """Test new features for iteration 96"""
    
    @pytest.fixture(scope="class")
    def super_admin_token(self):
        """Get super admin token"""
        response = requests.post(f"{BASE_URL}/api/super-admin/login", json={
            "email": SUPER_ADMIN_EMAIL,
            "password": SUPER_ADMIN_PASSWORD,
            "secret_key": SUPER_ADMIN_SECRET
        })
        assert response.status_code == 200, f"Super admin login failed: {response.text}"
        return response.json()["token"]
    
    @pytest.fixture(scope="class")
    def demo_user_token(self):
        """Get demo user token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": DEMO_USER_EMAIL,
            "password": DEMO_USER_PASSWORD
        })
        assert response.status_code == 200, f"Demo user login failed: {response.text}"
        return response.json()["token"]
    
    @pytest.fixture(scope="class")
    def demo_tenant_id(self, super_admin_token):
        """Get demo tenant ID"""
        headers = {"Authorization": f"Bearer {super_admin_token}"}
        response = requests.get(f"{BASE_URL}/api/super-admin/tenants", headers=headers)
        assert response.status_code == 200, f"Failed to get tenants: {response.text}"
        
        tenants = response.json()
        demo_tenant = next((t for t in tenants if t.get("owner_email") == DEMO_USER_EMAIL), None)
        
        if demo_tenant:
            return demo_tenant["id"]
        
        # If no demo tenant, use first tenant
        if tenants:
            return tenants[0]["id"]
        
        pytest.skip("No tenants found")
    
    # ==================== Test 4: API /api/settings/dashboard ====================
    
    def test_dashboard_settings_returns_new_features(self, demo_user_token):
        """
        Test 4: API /api/settings/dashboard - should return new features
        (showOwnerWallet, showExternalBranches, showComprehensiveReport)
        """
        headers = {"Authorization": f"Bearer {demo_user_token}"}
        response = requests.get(f"{BASE_URL}/api/settings/dashboard", headers=headers)
        
        assert response.status_code == 200, f"Failed to get dashboard settings: {response.text}"
        
        data = response.json()
        
        # Check that new features are present in response
        assert "showOwnerWallet" in data, "showOwnerWallet not found in dashboard settings"
        assert "showExternalBranches" in data, "showExternalBranches not found in dashboard settings"
        assert "showComprehensiveReport" in data, "showComprehensiveReport not found in dashboard settings"
        
        # Verify they are boolean values
        assert isinstance(data["showOwnerWallet"], bool), "showOwnerWallet should be boolean"
        assert isinstance(data["showExternalBranches"], bool), "showExternalBranches should be boolean"
        assert isinstance(data["showComprehensiveReport"], bool), "showComprehensiveReport should be boolean"
        
        print(f"✅ Dashboard settings contains new features:")
        print(f"   - showOwnerWallet: {data['showOwnerWallet']}")
        print(f"   - showExternalBranches: {data['showExternalBranches']}")
        print(f"   - showComprehensiveReport: {data['showComprehensiveReport']}")
    
    # ==================== Test 5: API /api/super-admin/tenants/{id}/features GET ====================
    
    def test_tenant_features_returns_new_features(self, super_admin_token, demo_tenant_id):
        """
        Test 5: API /api/super-admin/tenants/{id}/features GET - should return new features
        """
        headers = {"Authorization": f"Bearer {super_admin_token}"}
        response = requests.get(f"{BASE_URL}/api/super-admin/tenants/{demo_tenant_id}/features", headers=headers)
        
        assert response.status_code == 200, f"Failed to get tenant features: {response.text}"
        
        data = response.json()
        features = data.get("features", data)  # Handle both {features: {...}} and direct {...}
        
        # Check that new features are present
        assert "showOwnerWallet" in features, "showOwnerWallet not found in tenant features"
        assert "showExternalBranches" in features, "showExternalBranches not found in tenant features"
        assert "showComprehensiveReport" in features, "showComprehensiveReport not found in tenant features"
        
        print(f"✅ Tenant features contains new features:")
        print(f"   - showOwnerWallet: {features.get('showOwnerWallet')}")
        print(f"   - showExternalBranches: {features.get('showExternalBranches')}")
        print(f"   - showComprehensiveReport: {features.get('showComprehensiveReport')}")
    
    # ==================== Test: Tenant limits for branches ====================
    
    def test_tenant_limits_api(self, demo_user_token):
        """
        Test: API /api/tenant/limits - should return current limits
        """
        headers = {"Authorization": f"Bearer {demo_user_token}"}
        response = requests.get(f"{BASE_URL}/api/tenant/limits", headers=headers)
        
        assert response.status_code == 200, f"Failed to get tenant limits: {response.text}"
        
        data = response.json()
        
        # Check required fields
        assert "max_branches" in data, "max_branches not found"
        assert "current_branches" in data, "current_branches not found"
        assert "branches_remaining" in data, "branches_remaining not found"
        
        print(f"✅ Tenant limits:")
        print(f"   - max_branches: {data.get('max_branches')}")
        print(f"   - current_branches: {data.get('current_branches')}")
        print(f"   - branches_remaining: {data.get('branches_remaining')}")
        
        return data
    
    def test_branch_creation_blocked_when_limit_reached(self, demo_user_token):
        """
        Test 2: POST /api/branches - should fail with error message if customer reached limit
        """
        # First check if limit is reached
        headers = {"Authorization": f"Bearer {demo_user_token}"}
        limits_response = requests.get(f"{BASE_URL}/api/tenant/limits", headers=headers)
        
        if limits_response.status_code != 200:
            pytest.skip("Could not get tenant limits")
        
        limits = limits_response.json()
        
        if limits.get("branches_remaining", 1) > 0:
            print(f"⚠️ Branch limit not reached yet (remaining: {limits.get('branches_remaining')})")
            print("   Skipping branch creation block test")
            pytest.skip("Branch limit not reached - cannot test blocking")
        
        # Try to create a branch when limit is reached
        response = requests.post(f"{BASE_URL}/api/branches", 
            headers=headers,
            json={
                "name": "TEST_Branch_Should_Fail",
                "address": "Test Address",
                "phone": "1234567890"
            }
        )
        
        # Should return 403 Forbidden
        assert response.status_code == 403, f"Expected 403 when branch limit reached, got {response.status_code}"
        
        error_detail = response.json().get("detail", "")
        # Check for Arabic limit message or English limit message
        has_limit_message = (
            "الحد" in error_detail or 
            "limit" in error_detail.lower() or
            "الأقصى" in error_detail or
            "تم الوصول" in error_detail
        )
        assert has_limit_message, f"Error message should mention limit: {error_detail}"
        
        print(f"✅ Branch creation correctly blocked when limit reached")
        print(f"   Error message: {error_detail}")


class TestSuperAdminFeatures:
    """Test Super Admin features management"""
    
    @pytest.fixture(scope="class")
    def super_admin_token(self):
        """Get super admin token"""
        response = requests.post(f"{BASE_URL}/api/super-admin/login", json={
            "email": SUPER_ADMIN_EMAIL,
            "password": SUPER_ADMIN_PASSWORD,
            "secret_key": SUPER_ADMIN_SECRET
        })
        assert response.status_code == 200, f"Super admin login failed: {response.text}"
        return response.json()["token"]
    
    @pytest.fixture(scope="class")
    def tenant_id(self, super_admin_token):
        """Get a tenant ID for testing"""
        headers = {"Authorization": f"Bearer {super_admin_token}"}
        response = requests.get(f"{BASE_URL}/api/super-admin/tenants", headers=headers)
        assert response.status_code == 200, f"Failed to get tenants: {response.text}"
        
        tenants = response.json()
        if not tenants:
            pytest.skip("No tenants found")
        
        return tenants[0]["id"]
    
    def test_update_tenant_features_with_new_features(self, super_admin_token, tenant_id):
        """
        Test: PUT /api/super-admin/tenants/{id}/features - should accept new features
        """
        headers = {"Authorization": f"Bearer {super_admin_token}"}
        
        # Update features including new ones
        new_features = {
            "showPOS": True,
            "showTables": True,
            "showOrders": True,
            "showOwnerWallet": True,
            "showExternalBranches": True,
            "showComprehensiveReport": True
        }
        
        response = requests.put(
            f"{BASE_URL}/api/super-admin/tenants/{tenant_id}/features",
            headers=headers,
            json=new_features
        )
        
        assert response.status_code == 200, f"Failed to update tenant features: {response.text}"
        
        # Verify the features were saved
        get_response = requests.get(
            f"{BASE_URL}/api/super-admin/tenants/{tenant_id}/features",
            headers=headers
        )
        
        assert get_response.status_code == 200
        saved_features = get_response.json().get("features", get_response.json())
        
        assert saved_features.get("showOwnerWallet") == True, "showOwnerWallet not saved correctly"
        assert saved_features.get("showExternalBranches") == True, "showExternalBranches not saved correctly"
        assert saved_features.get("showComprehensiveReport") == True, "showComprehensiveReport not saved correctly"
        
        print(f"✅ Tenant features updated successfully with new features")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
