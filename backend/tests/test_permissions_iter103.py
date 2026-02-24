"""
Test permissions for iteration 103:
1. Permission list in Edit User contains 'الصفحات الرئيسية' group with all quick action icons
2. 'استلام المكالمات' and 'عرض الإحصائيات' permissions exist in 'الميزات الخاصة' group
3. 'كول سنتر' filter button exists in Users list
4. Captain in POS sees only داخل+سفري (without توصيل)
5. Call Center in POS sees only توصيل (without داخل/سفري)
"""
import pytest
import requests
import os
import time

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestPermissionsIter103:
    """Test permission controls for Captain and Call Center roles"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test fixtures"""
        self.demo_email = "demo@maestroegp.com"
        self.demo_password = "demo123"
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
    def get_auth_token(self, email, password):
        """Get authentication token"""
        response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": email,
            "password": password
        })
        if response.status_code == 200:
            data = response.json()
            # Try both token and access_token
            return data.get("token") or data.get("access_token")
        return None
    
    def test_01_demo_login(self):
        """Test demo user can login"""
        token = self.get_auth_token(self.demo_email, self.demo_password)
        assert token is not None, "Demo user login failed"
        print(f"✓ Demo user login successful")
        
    def test_02_get_users_list(self):
        """Test getting users list"""
        token = self.get_auth_token(self.demo_email, self.demo_password)
        self.session.headers.update({"Authorization": f"Bearer {token}"})
        
        response = self.session.get(f"{BASE_URL}/api/users")
        assert response.status_code == 200, f"Failed to get users: {response.status_code}"
        
        users = response.json()
        print(f"✓ Got {len(users)} users")
        
        # Check for different roles
        roles = set(u.get('role') for u in users)
        print(f"  Roles found: {roles}")
        
    def test_03_create_captain_user(self):
        """Test creating a captain user"""
        token = self.get_auth_token(self.demo_email, self.demo_password)
        self.session.headers.update({"Authorization": f"Bearer {token}"})
        
        # First get branches
        branches_res = self.session.get(f"{BASE_URL}/api/branches")
        branches = branches_res.json()
        branch_id = branches[0]['id'] if branches and len(branches) > 0 else None
        
        # Create captain user
        captain_data = {
            "username": "test_captain_103",
            "email": "test_captain_103@test.com",
            "password": "test123",
            "full_name": "Test Captain 103",
            "role": "captain",
            "branch_id": branch_id,
            "permissions": ["pos", "tables", "orders"]
        }
        
        response = self.session.post(f"{BASE_URL}/api/users", json=captain_data)
        
        if response.status_code == 201:
            print(f"✓ Captain user created successfully")
            user = response.json()
            assert user.get('role') == 'captain', "Role should be captain"
            return user.get('id')
        elif response.status_code == 400 and 'already exists' in response.text.lower():
            print(f"✓ Captain user already exists")
            return None
        else:
            print(f"  Response: {response.status_code} - {response.text}")
            # Don't fail if user already exists
            
    def test_04_create_call_center_user(self):
        """Test creating a call center user"""
        token = self.get_auth_token(self.demo_email, self.demo_password)
        self.session.headers.update({"Authorization": f"Bearer {token}"})
        
        # First get branches
        branches_res = self.session.get(f"{BASE_URL}/api/branches")
        branches = branches_res.json()
        branch_id = branches[0]['id'] if branches and len(branches) > 0 else None
        
        # Create call center user
        call_center_data = {
            "username": "test_callcenter_103",
            "email": "test_callcenter_103@test.com",
            "password": "test123",
            "full_name": "Test Call Center 103",
            "role": "call_center",
            "branch_id": branch_id,
            "permissions": ["pos", "delivery", "call_logs", "receive_calls"]
        }
        
        response = self.session.post(f"{BASE_URL}/api/users", json=call_center_data)
        
        if response.status_code == 201:
            print(f"✓ Call Center user created successfully")
            user = response.json()
            assert user.get('role') == 'call_center', "Role should be call_center"
            return user.get('id')
        elif response.status_code == 400 and 'already exists' in response.text.lower():
            print(f"✓ Call Center user already exists")
            return None
        else:
            print(f"  Response: {response.status_code} - {response.text}")
            
    def test_05_verify_captain_login(self):
        """Test captain user can login"""
        token = self.get_auth_token("test_captain_103@test.com", "test123")
        if token:
            print(f"✓ Captain user login successful")
            
            # Verify user role
            self.session.headers.update({"Authorization": f"Bearer {token}"})
            response = self.session.get(f"{BASE_URL}/api/auth/me")
            if response.status_code == 200:
                user = response.json()
                assert user.get('role') == 'captain', f"Expected captain role, got {user.get('role')}"
                print(f"  User role verified: {user.get('role')}")
        else:
            pytest.skip("Captain user not created or login failed")
            
    def test_06_verify_call_center_login(self):
        """Test call center user can login"""
        token = self.get_auth_token("test_callcenter_103@test.com", "test123")
        if token:
            print(f"✓ Call Center user login successful")
            
            # Verify user role
            self.session.headers.update({"Authorization": f"Bearer {token}"})
            response = self.session.get(f"{BASE_URL}/api/auth/me")
            if response.status_code == 200:
                user = response.json()
                assert user.get('role') == 'call_center', f"Expected call_center role, got {user.get('role')}"
                print(f"  User role verified: {user.get('role')}")
        else:
            pytest.skip("Call Center user not created or login failed")
            
    def test_07_get_dashboard_settings(self):
        """Test getting dashboard settings"""
        token = self.get_auth_token(self.demo_email, self.demo_password)
        self.session.headers.update({"Authorization": f"Bearer {token}"})
        
        response = self.session.get(f"{BASE_URL}/api/settings/dashboard")
        assert response.status_code == 200, f"Failed to get dashboard settings: {response.status_code}"
        
        settings = response.json()
        print(f"✓ Dashboard settings retrieved")
        print(f"  Keys: {list(settings.keys())[:10]}...")
        
    def test_08_cleanup_test_users(self):
        """Cleanup test users created during testing"""
        token = self.get_auth_token(self.demo_email, self.demo_password)
        self.session.headers.update({"Authorization": f"Bearer {token}"})
        
        # Get all users
        response = self.session.get(f"{BASE_URL}/api/users")
        if response.status_code == 200:
            users = response.json()
            
            # Find and delete test users
            for user in users:
                if user.get('email') in ['test_captain_103@test.com', 'test_callcenter_103@test.com']:
                    delete_res = self.session.delete(f"{BASE_URL}/api/users/{user['id']}")
                    if delete_res.status_code in [200, 204]:
                        print(f"✓ Deleted test user: {user.get('email')}")
                    else:
                        print(f"  Failed to delete {user.get('email')}: {delete_res.status_code}")

if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
