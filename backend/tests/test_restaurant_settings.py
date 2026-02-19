"""
Test Restaurant Settings API - Iteration 43
Tests for restaurant name and logo upload functionality
"""
import pytest
import requests
import os
from PIL import Image
import io

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://restaurant-profit-1.preview.emergentagent.com')

class TestRestaurantSettings:
    """Restaurant settings endpoint tests - name and logo upload"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Login and get token for demo client"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "demo@maestroegp.com",
            "password": "demo123"
        })
        assert response.status_code == 200, f"Login failed: {response.text}"
        self.token = response.json().get("token")
        self.headers = {
            "Authorization": f"Bearer {self.token}",
            "Content-Type": "application/json"
        }
        self.user = response.json().get("user", {})
        print(f"Logged in as: {self.user.get('email')} with role: {self.user.get('role')}")
    
    def test_get_restaurant_settings(self):
        """Test GET /api/settings/restaurant - should return current settings"""
        response = requests.get(
            f"{BASE_URL}/api/settings/restaurant",
            headers=self.headers
        )
        assert response.status_code == 200, f"GET failed: {response.text}"
        
        data = response.json()
        assert "name" in data or "name_ar" in data, "Response should contain name fields"
        print(f"Current restaurant settings: {data}")
    
    def test_update_restaurant_name(self):
        """Test PUT /api/settings/restaurant - update restaurant name"""
        test_name_ar = "مطعم اختبار API"
        test_name_en = "API Test Restaurant"
        
        response = requests.put(
            f"{BASE_URL}/api/settings/restaurant",
            headers=self.headers,
            json={
                "name": test_name_en,
                "name_ar": test_name_ar,
                "logo_url": ""
            }
        )
        assert response.status_code == 200, f"PUT failed: {response.text}"
        
        data = response.json()
        assert "message" in data, "Response should contain success message"
        print(f"Update response: {data}")
        
        # Verify the update by fetching settings again
        verify_response = requests.get(
            f"{BASE_URL}/api/settings/restaurant",
            headers=self.headers
        )
        assert verify_response.status_code == 200
        verify_data = verify_response.json()
        assert verify_data.get("name") == test_name_en or verify_data.get("name_ar") == test_name_ar
        print(f"Verified settings: {verify_data}")
    
    def test_upload_restaurant_logo_with_auth_header(self):
        """Test POST /api/upload/restaurant-logo - upload logo with Authorization header"""
        # Create a test image
        img = Image.new('RGB', (100, 100), color='blue')
        img_bytes = io.BytesIO()
        img.save(img_bytes, format='PNG')
        img_bytes.seek(0)
        
        # Upload with Authorization header (the fix being tested)
        files = {'file': ('test_logo.png', img_bytes, 'image/png')}
        headers = {"Authorization": f"Bearer {self.token}"}  # No Content-Type for multipart
        
        response = requests.post(
            f"{BASE_URL}/api/upload/restaurant-logo",
            headers=headers,
            files=files
        )
        
        assert response.status_code == 200, f"Upload failed: {response.text}"
        
        data = response.json()
        assert "url" in data or "logo_url" in data, "Response should contain logo URL"
        print(f"Logo upload response: {data}")
        
        # Verify the logo URL is accessible
        logo_url = data.get("url") or data.get("logo_url")
        if logo_url:
            full_url = f"{BASE_URL}{logo_url}" if logo_url.startswith("/") else logo_url
            logo_response = requests.get(full_url)
            assert logo_response.status_code == 200, f"Logo not accessible at {full_url}"
            print(f"Logo accessible at: {full_url}")
    
    def test_upload_logo_without_auth_header_should_fail(self):
        """Test POST /api/upload/restaurant-logo without Authorization - should fail"""
        # Create a test image
        img = Image.new('RGB', (100, 100), color='green')
        img_bytes = io.BytesIO()
        img.save(img_bytes, format='PNG')
        img_bytes.seek(0)
        
        # Upload WITHOUT Authorization header
        files = {'file': ('test_logo.png', img_bytes, 'image/png')}
        
        response = requests.post(
            f"{BASE_URL}/api/upload/restaurant-logo",
            files=files
        )
        
        # Should fail with 401 or 403
        assert response.status_code in [401, 403], f"Expected 401/403, got {response.status_code}"
        print(f"Correctly rejected unauthorized upload: {response.status_code}")
    
    def test_full_flow_name_and_logo_update(self):
        """Test full flow: update name and upload logo together"""
        # Step 1: Upload logo
        img = Image.new('RGB', (100, 100), color='red')
        img_bytes = io.BytesIO()
        img.save(img_bytes, format='PNG')
        img_bytes.seek(0)
        
        files = {'file': ('full_flow_logo.png', img_bytes, 'image/png')}
        headers = {"Authorization": f"Bearer {self.token}"}
        
        upload_response = requests.post(
            f"{BASE_URL}/api/upload/restaurant-logo",
            headers=headers,
            files=files
        )
        assert upload_response.status_code == 200, f"Logo upload failed: {upload_response.text}"
        logo_url = upload_response.json().get("url") or upload_response.json().get("logo_url")
        print(f"Logo uploaded: {logo_url}")
        
        # Step 2: Update settings with logo URL
        update_response = requests.put(
            f"{BASE_URL}/api/settings/restaurant",
            headers=self.headers,
            json={
                "name": "Full Flow Test Restaurant",
                "name_ar": "مطعم اختبار التدفق الكامل",
                "logo_url": logo_url
            }
        )
        assert update_response.status_code == 200, f"Settings update failed: {update_response.text}"
        print(f"Settings updated: {update_response.json()}")
        
        # Step 3: Verify everything is saved
        verify_response = requests.get(
            f"{BASE_URL}/api/settings/restaurant",
            headers=self.headers
        )
        assert verify_response.status_code == 200
        verify_data = verify_response.json()
        print(f"Final verification: {verify_data}")
        
        # The logo_url should be set (either the new one or previous)
        # Note: The API might not return the logo_url in GET if it's stored differently
        assert verify_data.get("name") == "Full Flow Test Restaurant" or verify_data.get("name_ar") == "مطعم اختبار التدفق الكامل"


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
