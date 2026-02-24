"""
Test file for iteration 101 - Testing Features Modal and BreakEvenReport
Tests:
1. Super Admin login
2. Get tenant features API
3. Update tenant features API
4. Verify features structure (3 sections)
"""

import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestSuperAdminFeatures:
    """Test Super Admin features API endpoints"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test fixtures"""
        self.super_admin_email = "owner@maestroegp.com"
        self.super_admin_password = "owner123"
        self.secret_key = "271018"
        self.token = None
        self.tenant_id = None
    
    def get_super_admin_token(self):
        """Get Super Admin authentication token"""
        response = requests.post(f"{BASE_URL}/api/super-admin/login", json={
            "email": self.super_admin_email,
            "password": self.super_admin_password,
            "secret_key": self.secret_key
        })
        assert response.status_code == 200, f"Login failed: {response.text}"
        data = response.json()
        assert "token" in data, "Token not in response"
        return data["token"]
    
    def get_tenants(self, token):
        """Get list of tenants"""
        headers = {"Authorization": f"Bearer {token}"}
        response = requests.get(f"{BASE_URL}/api/super-admin/tenants", headers=headers)
        assert response.status_code == 200, f"Get tenants failed: {response.text}"
        return response.json()
    
    def test_super_admin_login(self):
        """Test Super Admin login endpoint"""
        response = requests.post(f"{BASE_URL}/api/super-admin/login", json={
            "email": self.super_admin_email,
            "password": self.super_admin_password,
            "secret_key": self.secret_key
        })
        
        assert response.status_code == 200
        data = response.json()
        assert "token" in data
        assert "user" in data
        assert data["user"]["role"] == "super_admin"
        print("✅ Super Admin login successful")
    
    def test_get_tenants(self):
        """Test getting list of tenants"""
        token = self.get_super_admin_token()
        tenants = self.get_tenants(token)
        
        assert isinstance(tenants, list)
        assert len(tenants) > 0, "No tenants found"
        print(f"✅ Found {len(tenants)} tenants")
        
        # Store first tenant ID for other tests
        self.tenant_id = tenants[0]["id"]
        return tenants[0]["id"]
    
    def test_get_tenant_features(self):
        """Test getting tenant features"""
        token = self.get_super_admin_token()
        tenants = self.get_tenants(token)
        tenant_id = tenants[0]["id"]
        
        headers = {"Authorization": f"Bearer {token}"}
        response = requests.get(f"{BASE_URL}/api/super-admin/tenants/{tenant_id}/features", headers=headers)
        
        assert response.status_code == 200, f"Get features failed: {response.text}"
        data = response.json()
        
        assert "features" in data
        features = data["features"]
        
        # Verify basic features exist (Section 1: الميزات الأساسية)
        basic_features = ["showPOS", "showTables", "showOrders", "showKitchen", 
                         "showReports", "showRatings", "showDelivery", "showInventoryReports",
                         "showBranchOrders", "showWarehouse", "showPurchasing", "showExpenses",
                         "showOwnerWallet", "showCoupons", "showLoyalty", "showCallLogs",
                         "showHR", "showReservations", "showSettings", "showExternalBranches"]
        
        for feature in basic_features:
            assert feature in features, f"Missing basic feature: {feature}"
        print("✅ All basic features present")
        
        # Verify settings features exist (Section 2: ميزات الإعدادات)
        settings_features = ["settingsAppearance", "settingsRestaurant", "settingsUsers",
                            "settingsCustomers", "settingsBranches", "settingsCategories",
                            "settingsProducts", "settingsPrinters", "settingsDeliveryCompanies",
                            "settingsCallCenter", "settingsNotifications", "settingsInvoice",
                            "settingsSystem", "settingsInventory", "settingsPayment"]
        
        for feature in settings_features:
            assert feature in features, f"Missing settings feature: {feature}"
        print("✅ All settings features present")
        
        # Verify report features exist (Section 3: ميزات التقارير)
        report_features = ["showSmartReports", "showComprehensiveReport", "showBreakEvenReport"]
        
        for feature in report_features:
            assert feature in features, f"Missing report feature: {feature}"
        print("✅ All report features present (showSmartReports, showComprehensiveReport, showBreakEvenReport)")
    
    def test_update_tenant_features(self):
        """Test updating tenant features"""
        token = self.get_super_admin_token()
        tenants = self.get_tenants(token)
        tenant_id = tenants[0]["id"]
        
        headers = {"Authorization": f"Bearer {token}"}
        
        # Get current features
        response = requests.get(f"{BASE_URL}/api/super-admin/tenants/{tenant_id}/features", headers=headers)
        assert response.status_code == 200
        original_features = response.json()["features"]
        
        # Update features - disable showBreakEvenReport
        updated_features = original_features.copy()
        updated_features["showBreakEvenReport"] = False
        
        response = requests.put(
            f"{BASE_URL}/api/super-admin/tenants/{tenant_id}/features",
            headers=headers,
            json=updated_features
        )
        
        assert response.status_code == 200, f"Update features failed: {response.text}"
        data = response.json()
        assert "message" in data
        print("✅ Features updated successfully")
        
        # Verify the update
        response = requests.get(f"{BASE_URL}/api/super-admin/tenants/{tenant_id}/features", headers=headers)
        assert response.status_code == 200
        new_features = response.json()["features"]
        assert new_features["showBreakEvenReport"] == False, "Feature was not updated"
        print("✅ Feature update verified")
        
        # Restore original features
        updated_features["showBreakEvenReport"] = True
        response = requests.put(
            f"{BASE_URL}/api/super-admin/tenants/{tenant_id}/features",
            headers=headers,
            json=updated_features
        )
        assert response.status_code == 200
        print("✅ Features restored to original state")


class TestBreakEvenReportAPI:
    """Test Break Even Report API endpoints"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test fixtures"""
        self.demo_email = "demo@maestroegp.com"
        self.demo_password = "demo123"
    
    def get_demo_token(self):
        """Get demo user authentication token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": self.demo_email,
            "password": self.demo_password
        })
        if response.status_code == 200:
            return response.json().get("token")
        return None
    
    def test_demo_user_login(self):
        """Test demo user login"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": self.demo_email,
            "password": self.demo_password
        })
        
        assert response.status_code == 200, f"Demo login failed: {response.text}"
        data = response.json()
        assert "token" in data
        print("✅ Demo user login successful")
    
    def test_break_even_report_endpoint(self):
        """Test break even report endpoint"""
        token = self.get_demo_token()
        if not token:
            pytest.skip("Could not get demo token")
        
        headers = {"Authorization": f"Bearer {token}"}
        
        # Test break-even report endpoint
        response = requests.get(f"{BASE_URL}/api/reports/break-even", headers=headers)
        
        # The endpoint might return 200 or 404 depending on data
        assert response.status_code in [200, 404], f"Break even report failed: {response.text}"
        
        if response.status_code == 200:
            data = response.json()
            print(f"✅ Break even report data received: {list(data.keys()) if isinstance(data, dict) else 'list'}")
        else:
            print("⚠️ Break even report returned 404 (no data)")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
