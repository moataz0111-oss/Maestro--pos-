# Test user permission toggle persistence
# Tests the fix for stale closure bug in React state management
# Verifies PUT /api/users/{id} with permissions array saves correctly

import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestAuthentication:
    """Authentication tests"""
    
    def test_admin_login(self, api_client):
        """Test admin login"""
        response = api_client.post(f"{BASE_URL}/api/auth/login", json={
            "email": "hanialdujaili@gmail.com",
            "password": "Hani@2024"
        })
        assert response.status_code == 200, f"Login failed: {response.text}"
        data = response.json()
        assert "token" in data
        print(f"✓ Admin login successful")
        return data["token"]


class TestUserPermissions:
    """Test user permission CRUD operations"""
    
    def test_get_users_list(self, authenticated_client):
        """Test getting users list"""
        response = authenticated_client.get(f"{BASE_URL}/api/users")
        assert response.status_code == 200, f"Get users failed: {response.text}"
        users = response.json()
        assert isinstance(users, list)
        print(f"✓ Got {len(users)} users")
        return users
    
    def test_get_test_cashier_user(self, authenticated_client):
        """Test getting the test cashier user"""
        response = authenticated_client.get(f"{BASE_URL}/api/users")
        assert response.status_code == 200
        users = response.json()
        
        # Find test cashier
        test_cashier = None
        for user in users:
            if user.get("email") == "cashier@test.com":
                test_cashier = user
                break
        
        assert test_cashier is not None, "Test cashier user not found"
        print(f"✓ Found test cashier: {test_cashier.get('full_name', test_cashier.get('username'))}")
        print(f"  Current permissions: {test_cashier.get('permissions', [])}")
        return test_cashier
    
    def test_update_user_permissions_clear_all(self, authenticated_client):
        """Test clearing all permissions from test cashier"""
        # Get test cashier
        response = authenticated_client.get(f"{BASE_URL}/api/users")
        users = response.json()
        test_cashier = next((u for u in users if u.get("email") == "cashier@test.com"), None)
        assert test_cashier is not None, "Test cashier not found"
        
        user_id = test_cashier["id"]
        
        # Clear all permissions
        update_response = authenticated_client.put(f"{BASE_URL}/api/users/{user_id}", json={
            "permissions": []
        })
        assert update_response.status_code == 200, f"Update failed: {update_response.text}"
        
        # Verify permissions cleared
        updated_user = update_response.json()
        assert updated_user.get("permissions") == [], f"Permissions not cleared: {updated_user.get('permissions')}"
        print(f"✓ Cleared all permissions for test cashier")
        
        # GET to verify persistence
        get_response = authenticated_client.get(f"{BASE_URL}/api/users")
        users = get_response.json()
        test_cashier = next((u for u in users if u.get("email") == "cashier@test.com"), None)
        assert test_cashier.get("permissions") == [], "Permissions not persisted after clear"
        print(f"✓ Verified permissions cleared in database")
    
    def test_update_user_permissions_add_hide_cash_expected(self, authenticated_client):
        """Test adding hide_cash_expected permission"""
        # Get test cashier
        response = authenticated_client.get(f"{BASE_URL}/api/users")
        users = response.json()
        test_cashier = next((u for u in users if u.get("email") == "cashier@test.com"), None)
        assert test_cashier is not None
        
        user_id = test_cashier["id"]
        
        # Add hide_cash_expected permission
        update_response = authenticated_client.put(f"{BASE_URL}/api/users/{user_id}", json={
            "permissions": ["hide_cash_expected"]
        })
        assert update_response.status_code == 200, f"Update failed: {update_response.text}"
        
        updated_user = update_response.json()
        assert "hide_cash_expected" in updated_user.get("permissions", [])
        print(f"✓ Added hide_cash_expected permission")
        
        # GET to verify persistence
        get_response = authenticated_client.get(f"{BASE_URL}/api/users")
        users = get_response.json()
        test_cashier = next((u for u in users if u.get("email") == "cashier@test.com"), None)
        assert "hide_cash_expected" in test_cashier.get("permissions", [])
        print(f"✓ Verified hide_cash_expected persisted in database")
    
    def test_update_user_permissions_add_multiple(self, authenticated_client):
        """Test adding multiple permissions at once"""
        # Get test cashier
        response = authenticated_client.get(f"{BASE_URL}/api/users")
        users = response.json()
        test_cashier = next((u for u in users if u.get("email") == "cashier@test.com"), None)
        assert test_cashier is not None
        
        user_id = test_cashier["id"]
        
        # Add multiple permissions
        new_permissions = ["pos", "hide_cash_expected", "hide_recent_orders"]
        update_response = authenticated_client.put(f"{BASE_URL}/api/users/{user_id}", json={
            "permissions": new_permissions
        })
        assert update_response.status_code == 200, f"Update failed: {update_response.text}"
        
        updated_user = update_response.json()
        for perm in new_permissions:
            assert perm in updated_user.get("permissions", []), f"Permission {perm} not in response"
        print(f"✓ Added multiple permissions: {new_permissions}")
        
        # GET to verify persistence
        get_response = authenticated_client.get(f"{BASE_URL}/api/users")
        users = get_response.json()
        test_cashier = next((u for u in users if u.get("email") == "cashier@test.com"), None)
        for perm in new_permissions:
            assert perm in test_cashier.get("permissions", []), f"Permission {perm} not persisted"
        print(f"✓ Verified all permissions persisted in database")
    
    def test_rapid_permission_toggle(self, authenticated_client):
        """Test rapid toggling of permissions (simulates UI rapid clicks)"""
        # Get test cashier
        response = authenticated_client.get(f"{BASE_URL}/api/users")
        users = response.json()
        test_cashier = next((u for u in users if u.get("email") == "cashier@test.com"), None)
        assert test_cashier is not None
        
        user_id = test_cashier["id"]
        
        # Rapid toggle sequence
        permission_sequences = [
            ["pos"],
            ["pos", "hide_cash_expected"],
            ["pos", "hide_cash_expected", "hide_recent_orders"],
            ["pos", "hide_recent_orders"],  # Remove hide_cash_expected
            ["pos", "hide_recent_orders", "tables"],  # Add tables
        ]
        
        for i, perms in enumerate(permission_sequences):
            update_response = authenticated_client.put(f"{BASE_URL}/api/users/{user_id}", json={
                "permissions": perms
            })
            assert update_response.status_code == 200, f"Update {i+1} failed: {update_response.text}"
            updated_user = update_response.json()
            assert set(updated_user.get("permissions", [])) == set(perms), f"Mismatch at step {i+1}"
            print(f"✓ Rapid toggle step {i+1}: {perms}")
        
        # Final verification
        get_response = authenticated_client.get(f"{BASE_URL}/api/users")
        users = get_response.json()
        test_cashier = next((u for u in users if u.get("email") == "cashier@test.com"), None)
        expected_final = ["pos", "hide_recent_orders", "tables"]
        assert set(test_cashier.get("permissions", [])) == set(expected_final)
        print(f"✓ Final permissions verified: {expected_final}")
    
    def test_restore_original_permissions(self, authenticated_client):
        """Restore test cashier to original permissions"""
        # Get test cashier
        response = authenticated_client.get(f"{BASE_URL}/api/users")
        users = response.json()
        test_cashier = next((u for u in users if u.get("email") == "cashier@test.com"), None)
        assert test_cashier is not None
        
        user_id = test_cashier["id"]
        
        # Restore original permissions
        original_permissions = ["pos", "tables", "orders", "hide_cash_expected", "hide_recent_orders", "expenses", "delivery"]
        update_response = authenticated_client.put(f"{BASE_URL}/api/users/{user_id}", json={
            "permissions": original_permissions
        })
        assert update_response.status_code == 200
        print(f"✓ Restored original permissions: {original_permissions}")


@pytest.fixture
def api_client():
    """Shared requests session"""
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    return session


@pytest.fixture
def auth_token(api_client):
    """Get authentication token"""
    response = api_client.post(f"{BASE_URL}/api/auth/login", json={
        "email": "hanialdujaili@gmail.com",
        "password": "Hani@2024"
    })
    if response.status_code == 200:
        return response.json().get("token")
    pytest.skip("Authentication failed - skipping authenticated tests")


@pytest.fixture
def authenticated_client(api_client, auth_token):
    """Session with auth header"""
    api_client.headers.update({"Authorization": f"Bearer {auth_token}"})
    return api_client
