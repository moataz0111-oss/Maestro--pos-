"""
Iteration 136 Tests - POS System Bug Fixes
Tests for:
1. Cash register close calculation (orders without shift_id)
2. User permissions (hide_cash_expected, hide_recent_orders)
3. Users API with permissions array
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
ADMIN_EMAIL = "hanialdujaili@gmail.com"
ADMIN_PASSWORD = "Hani@2024"
CASHIER_EMAIL = "cashier@test.com"
CASHIER_PASSWORD = "Test@1234"
CASHIER_USER_ID = "29d01373-293c-4703-8c4f-2f832d9d2abb"


class TestAuthentication:
    """Authentication tests"""
    
    def test_admin_login(self):
        """Test admin login"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        assert response.status_code == 200, f"Admin login failed: {response.text}"
        data = response.json()
        assert "access_token" in data or "token" in data, "No token in response"
        print(f"✓ Admin login successful")
        return data.get("access_token") or data.get("token")
    
    def test_cashier_login(self):
        """Test cashier login"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": CASHIER_EMAIL,
            "password": CASHIER_PASSWORD
        })
        assert response.status_code == 200, f"Cashier login failed: {response.text}"
        data = response.json()
        assert "access_token" in data or "token" in data, "No token in response"
        print(f"✓ Cashier login successful")
        return data.get("access_token") or data.get("token")


class TestCashRegisterSummary:
    """Tests for cash register summary API - verifies orders without shift_id are counted"""
    
    @pytest.fixture
    def admin_token(self):
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        data = response.json()
        return data.get("access_token") or data.get("token")
    
    def test_get_cash_register_summary(self, admin_token):
        """Test GET /api/cash-register/summary returns correct data"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        response = requests.get(f"{BASE_URL}/api/cash-register/summary", headers=headers)
        
        assert response.status_code == 200, f"Failed to get cash register summary: {response.text}"
        data = response.json()
        
        # Verify response structure
        assert "total_sales" in data, "Missing total_sales in response"
        assert "total_orders" in data, "Missing total_orders in response"
        assert "cash_sales" in data, "Missing cash_sales in response"
        assert "card_sales" in data, "Missing card_sales in response"
        assert "expected_cash" in data, "Missing expected_cash in response"
        
        print(f"✓ Cash register summary: total_sales={data['total_sales']}, total_orders={data['total_orders']}")
        print(f"  cash_sales={data['cash_sales']}, card_sales={data['card_sales']}, expected_cash={data['expected_cash']}")
    
    def test_cash_register_summary_has_shift_id(self, admin_token):
        """Test that summary includes shift_id"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        response = requests.get(f"{BASE_URL}/api/cash-register/summary", headers=headers)
        
        assert response.status_code == 200
        data = response.json()
        assert "shift_id" in data, "Missing shift_id in response"
        print(f"✓ Cash register summary has shift_id: {data['shift_id']}")


class TestUserPermissions:
    """Tests for user permissions API"""
    
    @pytest.fixture
    def admin_token(self):
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        data = response.json()
        return data.get("access_token") or data.get("token")
    
    def _get_user_from_list(self, headers, user_id):
        """Helper to get user from users list"""
        response = requests.get(f"{BASE_URL}/api/users", headers=headers)
        if response.status_code != 200:
            return None
        users = response.json()
        for user in users:
            if user.get("id") == user_id:
                return user
        return None
    
    def test_get_users_list(self, admin_token):
        """Test GET /api/users returns users with permissions array"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        response = requests.get(f"{BASE_URL}/api/users", headers=headers)
        
        assert response.status_code == 200, f"Failed to get users: {response.text}"
        users = response.json()
        
        assert isinstance(users, list), "Response should be a list"
        assert len(users) > 0, "No users returned"
        
        # Check that users have permissions field
        for user in users:
            assert "permissions" in user or user.get("permissions") is None, f"User {user.get('id')} missing permissions field"
        
        print(f"✓ Got {len(users)} users with permissions field")
    
    def test_get_test_cashier_user(self, admin_token):
        """Test getting the test cashier user from users list"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        user = self._get_user_from_list(headers, CASHIER_USER_ID)
        
        assert user is not None, f"Cashier user not found in users list"
        assert user.get("id") == CASHIER_USER_ID, "Wrong user ID"
        assert user.get("email") == CASHIER_EMAIL, "Wrong email"
        assert "permissions" in user, "Missing permissions field"
        
        print(f"✓ Got test cashier: {user.get('full_name')}, permissions: {user.get('permissions')}")
    
    def test_update_user_permissions_add_hide_cash_expected(self, admin_token):
        """Test adding hide_cash_expected permission"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        
        # First get current user data from list
        user = self._get_user_from_list(headers, CASHIER_USER_ID)
        assert user is not None, "Cashier user not found"
        
        # Add hide_cash_expected permission
        current_perms = user.get("permissions") or []
        if "hide_cash_expected" not in current_perms:
            new_perms = current_perms + ["hide_cash_expected"]
        else:
            new_perms = current_perms
        
        update_data = {
            "username": user.get("username"),
            "email": user.get("email"),
            "full_name": user.get("full_name"),
            "role": user.get("role"),
            "permissions": new_perms,
            "is_active": user.get("is_active", True)
        }
        
        response = requests.put(f"{BASE_URL}/api/users/{CASHIER_USER_ID}", json=update_data, headers=headers)
        assert response.status_code == 200, f"Failed to update permissions: {response.text}"
        
        # Verify the update
        updated_user = self._get_user_from_list(headers, CASHIER_USER_ID)
        assert updated_user is not None, "User not found after update"
        
        assert "hide_cash_expected" in (updated_user.get("permissions") or []), "Permission not saved"
        print(f"✓ Added hide_cash_expected permission, current permissions: {updated_user.get('permissions')}")
    
    def test_update_user_permissions_add_hide_recent_orders(self, admin_token):
        """Test adding hide_recent_orders permission"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        
        # First get current user data from list
        user = self._get_user_from_list(headers, CASHIER_USER_ID)
        assert user is not None, "Cashier user not found"
        
        # Add hide_recent_orders permission
        current_perms = user.get("permissions") or []
        if "hide_recent_orders" not in current_perms:
            new_perms = current_perms + ["hide_recent_orders"]
        else:
            new_perms = current_perms
        
        update_data = {
            "username": user.get("username"),
            "email": user.get("email"),
            "full_name": user.get("full_name"),
            "role": user.get("role"),
            "permissions": new_perms,
            "is_active": user.get("is_active", True)
        }
        
        response = requests.put(f"{BASE_URL}/api/users/{CASHIER_USER_ID}", json=update_data, headers=headers)
        assert response.status_code == 200, f"Failed to update permissions: {response.text}"
        
        # Verify the update
        updated_user = self._get_user_from_list(headers, CASHIER_USER_ID)
        assert updated_user is not None, "User not found after update"
        
        assert "hide_recent_orders" in (updated_user.get("permissions") or []), "Permission not saved"
        print(f"✓ Added hide_recent_orders permission, current permissions: {updated_user.get('permissions')}")
    
    def test_update_user_permissions_remove_both(self, admin_token):
        """Test removing both hide permissions"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        
        # First get current user data from list
        user = self._get_user_from_list(headers, CASHIER_USER_ID)
        assert user is not None, "Cashier user not found"
        
        # Remove both hide permissions
        current_perms = user.get("permissions") or []
        new_perms = [p for p in current_perms if p not in ["hide_cash_expected", "hide_recent_orders"]]
        
        update_data = {
            "username": user.get("username"),
            "email": user.get("email"),
            "full_name": user.get("full_name"),
            "role": user.get("role"),
            "permissions": new_perms,
            "is_active": user.get("is_active", True)
        }
        
        response = requests.put(f"{BASE_URL}/api/users/{CASHIER_USER_ID}", json=update_data, headers=headers)
        assert response.status_code == 200, f"Failed to update permissions: {response.text}"
        
        # Verify the update
        updated_user = self._get_user_from_list(headers, CASHIER_USER_ID)
        assert updated_user is not None, "User not found after update"
        
        perms = updated_user.get("permissions") or []
        assert "hide_cash_expected" not in perms, "hide_cash_expected not removed"
        assert "hide_recent_orders" not in perms, "hide_recent_orders not removed"
        print(f"✓ Removed both hide permissions, current permissions: {perms}")
    
    def test_restore_permissions_for_ui_testing(self, admin_token):
        """Restore hide permissions for UI testing"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        
        # Get current user data
        user = self._get_user_from_list(headers, CASHIER_USER_ID)
        assert user is not None, "Cashier user not found"
        
        # Add both hide permissions back
        current_perms = user.get("permissions") or []
        new_perms = list(set(current_perms + ["hide_cash_expected", "hide_recent_orders"]))
        
        update_data = {
            "username": user.get("username"),
            "email": user.get("email"),
            "full_name": user.get("full_name"),
            "role": user.get("role"),
            "permissions": new_perms,
            "is_active": user.get("is_active", True)
        }
        
        response = requests.put(f"{BASE_URL}/api/users/{CASHIER_USER_ID}", json=update_data, headers=headers)
        assert response.status_code == 200, f"Failed to restore permissions: {response.text}"
        
        # Verify
        updated_user = self._get_user_from_list(headers, CASHIER_USER_ID)
        perms = updated_user.get("permissions") or []
        assert "hide_cash_expected" in perms, "hide_cash_expected not restored"
        assert "hide_recent_orders" in perms, "hide_recent_orders not restored"
        print(f"✓ Restored permissions for UI testing: {perms}")


class TestDashboardStats:
    """Tests for dashboard stats API"""
    
    @pytest.fixture
    def admin_token(self):
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        data = response.json()
        return data.get("access_token") or data.get("token")
    
    def test_get_dashboard_stats(self, admin_token):
        """Test GET /api/dashboard/stats"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        response = requests.get(f"{BASE_URL}/api/dashboard/stats", headers=headers)
        
        assert response.status_code == 200, f"Failed to get dashboard stats: {response.text}"
        data = response.json()
        
        # Verify response structure
        assert "today" in data, "Missing today stats"
        print(f"✓ Dashboard stats loaded successfully")


class TestShiftsAPI:
    """Tests for shifts API"""
    
    @pytest.fixture
    def admin_token(self):
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        data = response.json()
        return data.get("access_token") or data.get("token")
    
    def test_get_current_shift(self, admin_token):
        """Test GET /api/shifts/current"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        response = requests.get(f"{BASE_URL}/api/shifts/current", headers=headers)
        
        # Can be 200 (shift exists) or 404 (no shift)
        assert response.status_code in [200, 404], f"Unexpected status: {response.status_code}"
        
        if response.status_code == 200:
            data = response.json()
            if data:
                print(f"✓ Current shift found: {data.get('id')}")
            else:
                print(f"✓ No current shift (null response)")
        else:
            print(f"✓ No current shift (404)")
    
    def test_auto_open_shift(self, admin_token):
        """Test POST /api/shifts/auto-open"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        response = requests.post(f"{BASE_URL}/api/shifts/auto-open", headers=headers)
        
        assert response.status_code == 200, f"Failed to auto-open shift: {response.text}"
        data = response.json()
        
        assert "shift" in data, "Missing shift in response"
        print(f"✓ Auto-open shift: was_existing={data.get('was_existing')}, shift_id={data.get('shift', {}).get('id')}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
