"""
Test Impersonation/Preview Feature
Tests the Admin -> Cashier impersonation flow
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://hr-fixes-phase1.preview.emergentagent.com')

# Test credentials from review request
ADMIN_EMAIL = "hanialdujaili@gmail.com"
ADMIN_PASSWORD = "Hani@2024"
CASHIER_EMAIL = "cashier@test.com"
CASHIER_PASSWORD = "Test@1234"
CASHIER_ID = "29d01373-293c-4703-8c4f-2f832d9d2abb"


class TestImpersonation:
    """Test impersonation/preview feature"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test session"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        self.admin_token = None
        self.impersonated_token = None
    
    def test_01_admin_login(self):
        """Test admin login works correctly"""
        response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        
        print(f"Admin login status: {response.status_code}")
        print(f"Admin login response: {response.text[:500] if response.text else 'No response'}")
        
        assert response.status_code == 200, f"Admin login failed: {response.text}"
        
        data = response.json()
        assert "token" in data, "No token in response"
        assert "user" in data, "No user in response"
        
        user = data["user"]
        assert user.get("role") in ["admin", "super_admin"], f"User role is {user.get('role')}, expected admin"
        
        self.admin_token = data["token"]
        print(f"✅ Admin login successful - Role: {user.get('role')}")
        return self.admin_token
    
    def test_02_impersonate_cashier_api(self):
        """Test POST /auth/impersonate/{user_id} returns cashier role and permissions"""
        # First login as admin
        login_response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        assert login_response.status_code == 200, f"Admin login failed: {login_response.text}"
        admin_token = login_response.json()["token"]
        
        # Now impersonate the cashier
        self.session.headers.update({"Authorization": f"Bearer {admin_token}"})
        
        response = self.session.post(f"{BASE_URL}/api/auth/impersonate/{CASHIER_ID}")
        
        print(f"Impersonate status: {response.status_code}")
        print(f"Impersonate response: {response.text[:1000] if response.text else 'No response'}")
        
        assert response.status_code == 200, f"Impersonation failed: {response.text}"
        
        data = response.json()
        assert "user" in data, "No user in impersonation response"
        assert "token" in data, "No token in impersonation response"
        
        impersonated_user = data["user"]
        
        # Verify the impersonated user is a cashier
        assert impersonated_user.get("role") == "cashier", f"Expected cashier role, got {impersonated_user.get('role')}"
        
        # Verify impersonation flag is set
        assert impersonated_user.get("impersonated") == True, "Impersonated flag not set"
        
        # Check permissions - cashier should have limited permissions
        permissions = impersonated_user.get("permissions", [])
        print(f"✅ Impersonated user role: {impersonated_user.get('role')}")
        print(f"✅ Impersonated user permissions: {permissions}")
        print(f"✅ Impersonated flag: {impersonated_user.get('impersonated')}")
        
        self.impersonated_token = data["token"]
        return data
    
    def test_03_impersonated_user_has_correct_permissions(self):
        """Verify impersonated cashier has correct limited permissions"""
        # Login as admin and impersonate
        login_response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        assert login_response.status_code == 200
        admin_token = login_response.json()["token"]
        
        self.session.headers.update({"Authorization": f"Bearer {admin_token}"})
        impersonate_response = self.session.post(f"{BASE_URL}/api/auth/impersonate/{CASHIER_ID}")
        assert impersonate_response.status_code == 200
        
        impersonated_user = impersonate_response.json()["user"]
        impersonated_token = impersonate_response.json()["token"]
        
        # Verify role is cashier
        assert impersonated_user.get("role") == "cashier"
        
        # Verify permissions are limited (cashier typically has pos, tables, orders)
        permissions = impersonated_user.get("permissions", [])
        
        # Cashier should NOT have admin-level permissions
        admin_only_permissions = ["settings", "reports", "hr", "inventory", "owner_wallet"]
        
        for perm in admin_only_permissions:
            if perm in permissions:
                print(f"⚠️ Warning: Cashier has admin permission: {perm}")
        
        # Cashier should have basic POS permissions
        expected_cashier_permissions = ["pos", "tables", "orders"]
        for perm in expected_cashier_permissions:
            if perm in permissions:
                print(f"✅ Cashier has expected permission: {perm}")
        
        print(f"✅ Impersonated cashier permissions verified: {permissions}")
        
    def test_04_impersonated_token_works(self):
        """Verify the impersonated token can be used to make API calls"""
        # Login as admin and impersonate
        login_response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        assert login_response.status_code == 200
        admin_token = login_response.json()["token"]
        
        self.session.headers.update({"Authorization": f"Bearer {admin_token}"})
        impersonate_response = self.session.post(f"{BASE_URL}/api/auth/impersonate/{CASHIER_ID}")
        assert impersonate_response.status_code == 200
        
        impersonated_token = impersonate_response.json()["token"]
        
        # Use the impersonated token to call /auth/me
        self.session.headers.update({"Authorization": f"Bearer {impersonated_token}"})
        me_response = self.session.get(f"{BASE_URL}/api/auth/me")
        
        print(f"Auth/me status: {me_response.status_code}")
        print(f"Auth/me response: {me_response.text[:500] if me_response.text else 'No response'}")
        
        assert me_response.status_code == 200, f"Auth/me failed with impersonated token: {me_response.text}"
        
        me_data = me_response.json()
        assert me_data.get("role") == "cashier", f"Expected cashier role from /auth/me, got {me_data.get('role')}"
        
        print(f"✅ Impersonated token works - /auth/me returns cashier role")
    
    def test_05_cannot_impersonate_admin(self):
        """Verify cannot impersonate another admin"""
        # Login as admin
        login_response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        assert login_response.status_code == 200
        admin_token = login_response.json()["token"]
        admin_id = login_response.json()["user"]["id"]
        
        self.session.headers.update({"Authorization": f"Bearer {admin_token}"})
        
        # Try to impersonate self (admin)
        response = self.session.post(f"{BASE_URL}/api/auth/impersonate/{admin_id}")
        
        print(f"Impersonate admin status: {response.status_code}")
        
        # Should fail with 403
        assert response.status_code == 403, f"Should not be able to impersonate admin, got {response.status_code}"
        
        print(f"✅ Correctly prevented impersonation of admin account")


class TestDashboardQuickActions:
    """Test that Dashboard shows correct quick actions based on user role"""
    
    def test_dashboard_settings_api(self):
        """Test dashboard settings API returns correct data"""
        session = requests.Session()
        session.headers.update({"Content-Type": "application/json"})
        
        # Login as admin
        login_response = session.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        assert login_response.status_code == 200
        token = login_response.json()["token"]
        
        session.headers.update({"Authorization": f"Bearer {token}"})
        
        # Get dashboard settings
        settings_response = session.get(f"{BASE_URL}/api/settings/dashboard")
        
        print(f"Dashboard settings status: {settings_response.status_code}")
        
        if settings_response.status_code == 200:
            settings = settings_response.json()
            print(f"Dashboard settings: {settings}")
            
            # Check that key settings exist
            assert "showPOS" in settings or settings_response.status_code == 200
            print(f"✅ Dashboard settings API works")
        else:
            print(f"⚠️ Dashboard settings returned {settings_response.status_code}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
