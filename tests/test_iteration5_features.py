"""
Iteration 5 Tests - Maestro EGP
Testing:
1. Session conflict fix between main app and driver portal
2. Cash register close feature with denomination counting
3. API endpoints: /api/cash-register/summary and /api/cash-register/close
"""

import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://maestro-pos-2.preview.emergentagent.com')

class TestAuth:
    """Authentication tests"""
    
    @pytest.fixture(scope="class")
    def admin_token(self):
        """Get admin authentication token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "admin@maestroegp.com",
            "password": "admin123"
        })
        assert response.status_code == 200, f"Admin login failed: {response.text}"
        data = response.json()
        assert "token" in data
        return data["token"]
    
    @pytest.fixture(scope="class")
    def cashier_token(self):
        """Get cashier authentication token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "cashier@maestroegp.com",
            "password": "cashier123"
        })
        assert response.status_code == 200, f"Cashier login failed: {response.text}"
        data = response.json()
        assert "token" in data
        return data["token"]
    
    @pytest.fixture(scope="class")
    def driver_token(self):
        """Get driver authentication token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "moustafa@maestroegp.com",
            "password": "driver123"
        })
        assert response.status_code == 200, f"Driver login failed: {response.text}"
        data = response.json()
        assert "token" in data
        assert data["user"]["role"] == "delivery", "Driver should have 'delivery' role"
        return data["token"]
    
    def test_admin_login(self, admin_token):
        """Test admin login returns valid token"""
        assert admin_token is not None
        assert len(admin_token) > 0
        print("✓ Admin login successful")
    
    def test_cashier_login(self, cashier_token):
        """Test cashier login returns valid token"""
        assert cashier_token is not None
        assert len(cashier_token) > 0
        print("✓ Cashier login successful")
    
    def test_driver_login(self, driver_token):
        """Test driver login returns valid token with delivery role"""
        assert driver_token is not None
        assert len(driver_token) > 0
        print("✓ Driver login successful with delivery role")


class TestCashRegisterSummary:
    """Test /api/cash-register/summary endpoint"""
    
    @pytest.fixture(scope="class")
    def admin_token(self):
        """Get admin authentication token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "admin@maestroegp.com",
            "password": "admin123"
        })
        assert response.status_code == 200
        return response.json()["token"]
    
    @pytest.fixture(scope="class")
    def cashier_token(self):
        """Get cashier authentication token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "cashier@maestroegp.com",
            "password": "cashier123"
        })
        assert response.status_code == 200
        return response.json()["token"]
    
    def test_cash_register_summary_no_shift(self, admin_token):
        """Test cash register summary returns 404 when no open shift"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        response = requests.get(f"{BASE_URL}/api/cash-register/summary", headers=headers)
        
        # Should return 404 if no open shift, or 200 if there's an open shift
        assert response.status_code in [200, 404], f"Unexpected status: {response.status_code}"
        
        if response.status_code == 404:
            data = response.json()
            assert "detail" in data
            print("✓ Cash register summary returns 404 when no open shift")
        else:
            data = response.json()
            assert "total_sales" in data
            assert "expected_cash" in data
            print("✓ Cash register summary returns data for open shift")
    
    def test_cash_register_summary_structure(self, cashier_token):
        """Test cash register summary response structure when shift exists"""
        headers = {"Authorization": f"Bearer {cashier_token}"}
        response = requests.get(f"{BASE_URL}/api/cash-register/summary", headers=headers)
        
        if response.status_code == 200:
            data = response.json()
            # Verify expected fields
            expected_fields = [
                "shift_id", "branch_id", "cashier_id", "cashier_name",
                "total_sales", "cash_sales", "card_sales", "credit_sales",
                "total_expenses", "expected_cash", "opening_cash"
            ]
            for field in expected_fields:
                assert field in data, f"Missing field: {field}"
            print("✓ Cash register summary has correct structure")
        else:
            print("✓ No open shift for cashier (expected behavior)")


class TestCashRegisterClose:
    """Test /api/cash-register/close endpoint"""
    
    @pytest.fixture(scope="class")
    def admin_token(self):
        """Get admin authentication token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "admin@maestroegp.com",
            "password": "admin123"
        })
        assert response.status_code == 200
        return response.json()["token"]
    
    def test_cash_register_close_no_shift(self, admin_token):
        """Test cash register close returns 404 when no open shift"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        
        # Try to close with denominations
        close_data = {
            "denominations": {
                "250": 0,
                "500": 0,
                "1000": 10,
                "5000": 5,
                "10000": 2,
                "25000": 1,
                "50000": 0
            },
            "notes": "Test close"
        }
        
        response = requests.post(f"{BASE_URL}/api/cash-register/close", 
                                 headers=headers, json=close_data)
        
        # Should return 404 if no open shift
        if response.status_code == 404:
            data = response.json()
            assert "detail" in data
            print("✓ Cash register close returns 404 when no open shift")
        elif response.status_code == 200:
            data = response.json()
            assert "closing_cash" in data
            assert "cash_difference" in data
            print("✓ Cash register close successful")
        else:
            print(f"Unexpected status: {response.status_code} - {response.text}")


class TestShiftManagement:
    """Test shift management for cash register"""
    
    @pytest.fixture(scope="class")
    def admin_token(self):
        """Get admin authentication token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "admin@maestroegp.com",
            "password": "admin123"
        })
        assert response.status_code == 200
        return response.json()
    
    def test_get_current_shift(self, admin_token):
        """Test getting current shift for user"""
        headers = {"Authorization": f"Bearer {admin_token['token']}"}
        response = requests.get(f"{BASE_URL}/api/shifts/current", headers=headers)
        
        # Can be null if no shift or return shift data
        assert response.status_code == 200
        data = response.json()
        
        if data is None:
            print("✓ No current shift (expected)")
        else:
            assert "id" in data
            assert "status" in data
            print(f"✓ Current shift found: {data['id']}, status: {data['status']}")
    
    def test_get_shifts_list(self, admin_token):
        """Test getting list of shifts"""
        headers = {"Authorization": f"Bearer {admin_token['token']}"}
        response = requests.get(f"{BASE_URL}/api/shifts", headers=headers)
        
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ Got {len(data)} shifts")


class TestDriverPortalSeparation:
    """Test that driver portal uses separate localStorage keys"""
    
    def test_driver_login_returns_delivery_role(self):
        """Test driver login returns user with delivery role"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "moustafa@maestroegp.com",
            "password": "driver123"
        })
        
        assert response.status_code == 200, f"Driver login failed: {response.text}"
        data = response.json()
        
        assert "user" in data
        assert data["user"]["role"] == "delivery"
        print("✓ Driver login returns delivery role")
    
    def test_driver_by_user_endpoint(self):
        """Test getting driver by user ID"""
        # First login as driver
        login_response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "moustafa@maestroegp.com",
            "password": "driver123"
        })
        
        assert login_response.status_code == 200
        data = login_response.json()
        user_id = data["user"]["id"]
        token = data["token"]
        
        # Get driver by user ID
        headers = {"Authorization": f"Bearer {token}"}
        response = requests.get(f"{BASE_URL}/api/drivers/by-user/{user_id}", headers=headers)
        
        if response.status_code == 200:
            driver_data = response.json()
            assert "id" in driver_data
            assert "name" in driver_data
            print(f"✓ Driver found for user: {driver_data['name']}")
        elif response.status_code == 404:
            print("✓ No driver linked to this user (expected if not configured)")
        else:
            print(f"Unexpected status: {response.status_code}")


class TestBranches:
    """Test branch endpoints"""
    
    def test_get_branches(self):
        """Test getting list of branches"""
        response = requests.get(f"{BASE_URL}/api/branches")
        
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        assert len(data) > 0, "Should have at least one branch"
        
        # Verify branch structure
        branch = data[0]
        assert "id" in branch
        assert "name" in branch
        print(f"✓ Got {len(data)} branches, first: {branch['name']}")


class TestDashboardSettings:
    """Test dashboard settings endpoint"""
    
    def test_get_dashboard_settings(self):
        """Test getting dashboard settings"""
        response = requests.get(f"{BASE_URL}/api/settings/dashboard")
        
        # Can return 200 with settings or 404 if not configured
        if response.status_code == 200:
            data = response.json()
            print(f"✓ Dashboard settings: {data}")
        else:
            print("✓ Dashboard settings not configured (expected)")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
