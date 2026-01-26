"""
Test Upload APIs - Iteration 40
Testing all image upload functionality with Authorization headers
"""
import pytest
import requests
import os
import io
from PIL import Image

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
SUPER_ADMIN_EMAIL = "owner@maestroegp.com"
SUPER_ADMIN_PASSWORD = "owner123"
SUPER_ADMIN_SECRET = "271018"

DEMO_CLIENT_EMAIL = "demo@maestroegp.com"
DEMO_CLIENT_PASSWORD = "demo123"


def create_test_image(width=100, height=100, color='red', format='JPEG'):
    """Create a test image in memory"""
    img = Image.new('RGB', (width, height), color=color)
    img_bytes = io.BytesIO()
    img.save(img_bytes, format=format)
    img_bytes.seek(0)
    return img_bytes


class TestSuperAdminLogin:
    """Test Super Admin authentication"""
    
    def test_super_admin_login_success(self):
        """Test super admin login with valid credentials"""
        response = requests.post(f"{BASE_URL}/api/super-admin/login", json={
            "email": SUPER_ADMIN_EMAIL,
            "password": SUPER_ADMIN_PASSWORD,
            "secret_key": SUPER_ADMIN_SECRET
        })
        
        assert response.status_code == 200, f"Login failed: {response.text}"
        data = response.json()
        assert "token" in data, "Token not in response"
        assert data["token"], "Token is empty"
        print(f"SUCCESS: Super Admin login - Token received")
        return data["token"]


class TestUploadLogoAPI:
    """Test /api/upload/logo endpoint - System logo upload"""
    
    @pytest.fixture
    def super_admin_token(self):
        """Get super admin token"""
        response = requests.post(f"{BASE_URL}/api/super-admin/login", json={
            "email": SUPER_ADMIN_EMAIL,
            "password": SUPER_ADMIN_PASSWORD,
            "secret_key": SUPER_ADMIN_SECRET
        })
        assert response.status_code == 200
        return response.json()["token"]
    
    def test_upload_logo_without_auth(self):
        """Test upload logo without authorization - should fail"""
        img = create_test_image()
        files = {'file': ('test_logo.jpg', img, 'image/jpeg')}
        
        response = requests.post(f"{BASE_URL}/api/upload/logo", files=files)
        
        # Should fail without auth
        assert response.status_code in [401, 403], f"Expected 401/403, got {response.status_code}"
        print(f"SUCCESS: Upload logo without auth correctly rejected with {response.status_code}")
    
    def test_upload_logo_with_auth(self, super_admin_token):
        """Test upload logo with authorization - should succeed"""
        img = create_test_image(200, 200, 'blue')
        files = {'file': ('test_logo.jpg', img, 'image/jpeg')}
        headers = {'Authorization': f'Bearer {super_admin_token}'}
        
        response = requests.post(f"{BASE_URL}/api/upload/logo", files=files, headers=headers)
        
        assert response.status_code == 200, f"Upload failed: {response.text}"
        data = response.json()
        assert "logo_url" in data or "url" in data, f"No logo_url in response: {data}"
        logo_url = data.get("logo_url") or data.get("url")
        assert logo_url, "Logo URL is empty"
        assert "/api/uploads/logos/" in logo_url, f"Invalid logo URL format: {logo_url}"
        print(f"SUCCESS: Upload logo with auth - URL: {logo_url}")
    
    def test_upload_logo_with_tenant_id(self, super_admin_token):
        """Test upload logo for specific tenant"""
        img = create_test_image(150, 150, 'green')
        files = {'file': ('tenant_logo.jpg', img, 'image/jpeg')}
        data = {'tenant_id': 'test-tenant-123'}
        headers = {'Authorization': f'Bearer {super_admin_token}'}
        
        response = requests.post(f"{BASE_URL}/api/upload/logo", files=files, data=data, headers=headers)
        
        assert response.status_code == 200, f"Upload failed: {response.text}"
        result = response.json()
        assert "logo_url" in result or "url" in result
        print(f"SUCCESS: Upload tenant logo - URL: {result.get('logo_url') or result.get('url')}")


class TestUploadBackgroundAPI:
    """Test /api/upload/background endpoint - Background image upload"""
    
    @pytest.fixture
    def super_admin_token(self):
        """Get super admin token"""
        response = requests.post(f"{BASE_URL}/api/super-admin/login", json={
            "email": SUPER_ADMIN_EMAIL,
            "password": SUPER_ADMIN_PASSWORD,
            "secret_key": SUPER_ADMIN_SECRET
        })
        assert response.status_code == 200
        return response.json()["token"]
    
    def test_upload_background_without_auth(self):
        """Test upload background without authorization - should fail"""
        img = create_test_image(800, 600)
        files = {'file': ('test_bg.jpg', img, 'image/jpeg')}
        data = {'title': 'Test Background', 'animation_type': 'fade'}
        
        response = requests.post(f"{BASE_URL}/api/upload/background", files=files, data=data)
        
        assert response.status_code in [401, 403], f"Expected 401/403, got {response.status_code}"
        print(f"SUCCESS: Upload background without auth correctly rejected with {response.status_code}")
    
    def test_upload_background_with_auth(self, super_admin_token):
        """Test upload background with authorization - should succeed"""
        img = create_test_image(1920, 1080, 'purple')
        files = {'file': ('test_bg.jpg', img, 'image/jpeg')}
        data = {'title': 'Test Background', 'animation_type': 'fade'}
        headers = {'Authorization': f'Bearer {super_admin_token}'}
        
        response = requests.post(f"{BASE_URL}/api/upload/background", files=files, data=data, headers=headers)
        
        assert response.status_code == 200, f"Upload failed: {response.text}"
        result = response.json()
        assert "background" in result, f"No background in response: {result}"
        assert "image_url" in result["background"], "No image_url in background"
        print(f"SUCCESS: Upload background with auth - URL: {result['background']['image_url']}")


class TestUploadLoginLogoAPI:
    """Test /api/login-backgrounds/upload-logo endpoint - Login page logo upload"""
    
    @pytest.fixture
    def super_admin_token(self):
        """Get super admin token"""
        response = requests.post(f"{BASE_URL}/api/super-admin/login", json={
            "email": SUPER_ADMIN_EMAIL,
            "password": SUPER_ADMIN_PASSWORD,
            "secret_key": SUPER_ADMIN_SECRET
        })
        assert response.status_code == 200
        return response.json()["token"]
    
    def test_upload_login_logo_without_auth(self):
        """Test upload login logo without authorization - should fail"""
        img = create_test_image(256, 256)
        files = {'file': ('login_logo.jpg', img, 'image/jpeg')}
        
        response = requests.post(f"{BASE_URL}/api/login-backgrounds/upload-logo", files=files)
        
        assert response.status_code in [401, 403], f"Expected 401/403, got {response.status_code}"
        print(f"SUCCESS: Upload login logo without auth correctly rejected with {response.status_code}")
    
    def test_upload_login_logo_with_auth(self, super_admin_token):
        """Test upload login logo with authorization - should succeed"""
        img = create_test_image(512, 512, 'orange')
        files = {'file': ('login_logo.jpg', img, 'image/jpeg')}
        headers = {'Authorization': f'Bearer {super_admin_token}'}
        
        response = requests.post(f"{BASE_URL}/api/login-backgrounds/upload-logo", files=files, headers=headers)
        
        assert response.status_code == 200, f"Upload failed: {response.text}"
        result = response.json()
        assert "logo_url" in result, f"No logo_url in response: {result}"
        assert "/api/uploads/logos/" in result["logo_url"], f"Invalid logo URL: {result['logo_url']}"
        print(f"SUCCESS: Upload login logo with auth - URL: {result['logo_url']}")


class TestUploadImageAPI:
    """Test /api/upload/image endpoint - General image upload for products/categories"""
    
    @pytest.fixture
    def demo_client_token(self):
        """Get demo client token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": DEMO_CLIENT_EMAIL,
            "password": DEMO_CLIENT_PASSWORD
        })
        if response.status_code != 200:
            pytest.skip("Demo client login failed - skipping test")
        return response.json()["token"]
    
    @pytest.fixture
    def super_admin_token(self):
        """Get super admin token for fallback"""
        response = requests.post(f"{BASE_URL}/api/super-admin/login", json={
            "email": SUPER_ADMIN_EMAIL,
            "password": SUPER_ADMIN_PASSWORD,
            "secret_key": SUPER_ADMIN_SECRET
        })
        assert response.status_code == 200
        return response.json()["token"]
    
    def test_upload_image_without_auth(self):
        """Test upload image without authorization - should fail"""
        img = create_test_image(400, 400)
        files = {'file': ('product.jpg', img, 'image/jpeg')}
        data = {'type': 'product'}
        
        response = requests.post(f"{BASE_URL}/api/upload/image", files=files, data=data)
        
        assert response.status_code in [401, 403], f"Expected 401/403, got {response.status_code}"
        print(f"SUCCESS: Upload image without auth correctly rejected with {response.status_code}")
    
    def test_upload_product_image_with_auth(self, super_admin_token):
        """Test upload product image with authorization"""
        img = create_test_image(800, 800, 'yellow')
        files = {'file': ('product.jpg', img, 'image/jpeg')}
        data = {'type': 'product'}
        headers = {'Authorization': f'Bearer {super_admin_token}'}
        
        response = requests.post(f"{BASE_URL}/api/upload/image", files=files, data=data, headers=headers)
        
        assert response.status_code == 200, f"Upload failed: {response.text}"
        result = response.json()
        assert "image_url" in result, f"No image_url in response: {result}"
        print(f"SUCCESS: Upload product image - URL: {result['image_url']}")
    
    def test_upload_category_image_with_auth(self, super_admin_token):
        """Test upload category image with authorization"""
        img = create_test_image(400, 400, 'cyan')
        files = {'file': ('category.jpg', img, 'image/jpeg')}
        data = {'type': 'category'}
        headers = {'Authorization': f'Bearer {super_admin_token}'}
        
        response = requests.post(f"{BASE_URL}/api/upload/image", files=files, data=data, headers=headers)
        
        assert response.status_code == 200, f"Upload failed: {response.text}"
        result = response.json()
        assert "image_url" in result, f"No image_url in response: {result}"
        print(f"SUCCESS: Upload category image - URL: {result['image_url']}")


class TestUploadedFilesAccessible:
    """Test that uploaded files are accessible via URL"""
    
    @pytest.fixture
    def super_admin_token(self):
        """Get super admin token"""
        response = requests.post(f"{BASE_URL}/api/super-admin/login", json={
            "email": SUPER_ADMIN_EMAIL,
            "password": SUPER_ADMIN_PASSWORD,
            "secret_key": SUPER_ADMIN_SECRET
        })
        assert response.status_code == 200
        return response.json()["token"]
    
    def test_uploaded_logo_accessible(self, super_admin_token):
        """Test that uploaded logo is accessible"""
        # Upload a logo first
        img = create_test_image(100, 100, 'red')
        files = {'file': ('access_test.jpg', img, 'image/jpeg')}
        headers = {'Authorization': f'Bearer {super_admin_token}'}
        
        upload_response = requests.post(f"{BASE_URL}/api/upload/logo", files=files, headers=headers)
        assert upload_response.status_code == 200
        
        logo_url = upload_response.json().get("logo_url") or upload_response.json().get("url")
        
        # Try to access the uploaded file
        full_url = f"{BASE_URL}{logo_url}"
        access_response = requests.get(full_url)
        
        assert access_response.status_code == 200, f"Cannot access uploaded file at {full_url}"
        assert access_response.headers.get('content-type', '').startswith('image/'), "Response is not an image"
        print(f"SUCCESS: Uploaded logo accessible at {full_url}")


class TestInvalidFileTypes:
    """Test rejection of invalid file types"""
    
    @pytest.fixture
    def super_admin_token(self):
        """Get super admin token"""
        response = requests.post(f"{BASE_URL}/api/super-admin/login", json={
            "email": SUPER_ADMIN_EMAIL,
            "password": SUPER_ADMIN_PASSWORD,
            "secret_key": SUPER_ADMIN_SECRET
        })
        assert response.status_code == 200
        return response.json()["token"]
    
    def test_reject_non_image_file(self, super_admin_token):
        """Test that non-image files are rejected"""
        # Create a fake text file
        fake_file = io.BytesIO(b"This is not an image")
        files = {'file': ('test.txt', fake_file, 'text/plain')}
        headers = {'Authorization': f'Bearer {super_admin_token}'}
        
        response = requests.post(f"{BASE_URL}/api/upload/logo", files=files, headers=headers)
        
        assert response.status_code == 400, f"Expected 400, got {response.status_code}"
        print(f"SUCCESS: Non-image file correctly rejected")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
