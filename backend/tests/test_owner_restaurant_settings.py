"""
Test: Owner (super_admin) Restaurant Settings Authorization Fix
Bug: Owner was getting 'غير مصرح' (Unauthorized) when trying to modify restaurant settings
Fix: Changed role check from 'if role != ADMIN' to 'if role not in [ADMIN, SUPER_ADMIN]'
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestOwnerRestaurantSettings:
    """Test that owner (super_admin) can modify restaurant settings"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup - login as owner and get token"""
        self.owner_email = "owner@maestroegp.com"
        self.owner_password = "owner123"
        self.token = None
        
        # Login as owner
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": self.owner_email, "password": self.owner_password}
        )
        if response.status_code == 200:
            data = response.json()
            self.token = data.get("token")
            self.user = data.get("user")
        
    def test_owner_login_returns_super_admin_role(self):
        """Verify owner login returns super_admin role"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": self.owner_email, "password": self.owner_password}
        )
        assert response.status_code == 200
        data = response.json()
        assert data["user"]["role"] == "super_admin"
        assert data["user"]["email"] == self.owner_email
        print(f"✅ Owner login successful - role: {data['user']['role']}")
    
    def test_owner_can_get_restaurant_settings(self):
        """Test GET /api/settings/restaurant as owner"""
        if not self.token:
            pytest.skip("Owner login failed")
        
        response = requests.get(
            f"{BASE_URL}/api/settings/restaurant",
            headers={"Authorization": f"Bearer {self.token}"}
        )
        assert response.status_code == 200
        data = response.json()
        assert "name" in data or "name_ar" in data
        print(f"✅ GET /api/settings/restaurant - Status: {response.status_code}")
        print(f"   Response: {data}")
    
    def test_owner_can_update_restaurant_settings(self):
        """Test PUT /api/settings/restaurant as owner - THE BUG FIX"""
        if not self.token:
            pytest.skip("Owner login failed")
        
        # Update restaurant settings
        new_settings = {
            "name": "مطعم الاختبار",
            "name_ar": "مطعم الاختبار",
            "logo_url": None
        }
        
        response = requests.put(
            f"{BASE_URL}/api/settings/restaurant",
            headers={
                "Authorization": f"Bearer {self.token}",
                "Content-Type": "application/json"
            },
            json=new_settings
        )
        
        # This was returning 403 before the fix
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert "message" in data
        print(f"✅ PUT /api/settings/restaurant - Status: {response.status_code}")
        print(f"   Response: {data}")
        
        # Verify the update persisted
        get_response = requests.get(
            f"{BASE_URL}/api/settings/restaurant",
            headers={"Authorization": f"Bearer {self.token}"}
        )
        assert get_response.status_code == 200
        get_data = get_response.json()
        assert get_data.get("name") == new_settings["name"] or get_data.get("name_ar") == new_settings["name_ar"]
        print(f"✅ Verified settings persisted: {get_data}")
    
    def test_owner_can_upload_restaurant_logo(self):
        """Test POST /api/upload/restaurant-logo as owner - THE BUG FIX"""
        if not self.token:
            pytest.skip("Owner login failed")
        
        # Create a simple test image
        from PIL import Image
        import io
        
        img = Image.new('RGB', (100, 100), color='blue')
        img_bytes = io.BytesIO()
        img.save(img_bytes, format='PNG')
        img_bytes.seek(0)
        
        files = {
            'file': ('test_logo.png', img_bytes, 'image/png')
        }
        
        response = requests.post(
            f"{BASE_URL}/api/upload/restaurant-logo",
            headers={"Authorization": f"Bearer {self.token}"},
            files=files
        )
        
        # This was returning 403 before the fix
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert "url" in data or "logo_url" in data
        print(f"✅ POST /api/upload/restaurant-logo - Status: {response.status_code}")
        print(f"   Response: {data}")
    
    def test_unauthorized_without_token(self):
        """Test that requests without token return 401/403"""
        response = requests.put(
            f"{BASE_URL}/api/settings/restaurant",
            headers={"Content-Type": "application/json"},
            json={"name": "Test"}
        )
        assert response.status_code in [401, 403]
        print(f"✅ Request without token correctly rejected - Status: {response.status_code}")


class TestAdminRestaurantSettings:
    """Test that admin can also modify restaurant settings"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup - login as admin and get token"""
        self.admin_email = "admin@maestroegp.com"
        self.admin_password = "admin123"
        self.token = None
        
        # Login as admin
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": self.admin_email, "password": self.admin_password}
        )
        if response.status_code == 200:
            data = response.json()
            self.token = data.get("token")
    
    def test_admin_can_update_restaurant_settings(self):
        """Test PUT /api/settings/restaurant as admin"""
        if not self.token:
            pytest.skip("Admin login failed")
        
        new_settings = {
            "name": "مطعم الاختبار",
            "name_ar": "مطعم الاختبار",
            "logo_url": None
        }
        
        response = requests.put(
            f"{BASE_URL}/api/settings/restaurant",
            headers={
                "Authorization": f"Bearer {self.token}",
                "Content-Type": "application/json"
            },
            json=new_settings
        )
        
        assert response.status_code == 200
        print(f"✅ Admin PUT /api/settings/restaurant - Status: {response.status_code}")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
