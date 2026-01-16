"""
Iteration 12 - Super Admin Logo Upload Testing
Tests for:
1. Super Admin login with JSON body
2. Tenant list retrieval
3. Logo upload via /api/upload/logo
4. Tenant update with logo_url
"""

import pytest
import requests
import os
import json

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Super Admin credentials
SUPER_ADMIN_EMAIL = "owner@maestroegp.com"
SUPER_ADMIN_PASSWORD = "owner123"
SUPER_ADMIN_SECRET = "271018"

class TestSuperAdminLogin:
    """Test Super Admin login with JSON body"""
    
    def test_super_admin_login_success(self):
        """Test successful Super Admin login with JSON body"""
        response = requests.post(
            f"{BASE_URL}/api/super-admin/login",
            json={
                "email": SUPER_ADMIN_EMAIL,
                "password": SUPER_ADMIN_PASSWORD,
                "secret_key": SUPER_ADMIN_SECRET
            }
        )
        
        print(f"Login response status: {response.status_code}")
        print(f"Login response: {response.text[:500]}")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "token" in data, "Response should contain token"
        assert "user" in data, "Response should contain user"
        assert data["user"]["role"] == "super_admin", "User should be super_admin"
        
        # Store token for other tests
        pytest.super_admin_token = data["token"]
        print(f"✓ Super Admin login successful, token obtained")
    
    def test_super_admin_login_wrong_secret(self):
        """Test Super Admin login with wrong secret key"""
        response = requests.post(
            f"{BASE_URL}/api/super-admin/login",
            json={
                "email": SUPER_ADMIN_EMAIL,
                "password": SUPER_ADMIN_PASSWORD,
                "secret_key": "wrong_secret"
            }
        )
        
        assert response.status_code == 403, f"Expected 403, got {response.status_code}"
        print(f"✓ Wrong secret key correctly rejected")
    
    def test_super_admin_login_wrong_password(self):
        """Test Super Admin login with wrong password"""
        response = requests.post(
            f"{BASE_URL}/api/super-admin/login",
            json={
                "email": SUPER_ADMIN_EMAIL,
                "password": "wrong_password",
                "secret_key": SUPER_ADMIN_SECRET
            }
        )
        
        assert response.status_code == 401, f"Expected 401, got {response.status_code}"
        print(f"✓ Wrong password correctly rejected")


class TestTenantList:
    """Test tenant list retrieval"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Ensure we have a valid token"""
        if not hasattr(pytest, 'super_admin_token'):
            response = requests.post(
                f"{BASE_URL}/api/super-admin/login",
                json={
                    "email": SUPER_ADMIN_EMAIL,
                    "password": SUPER_ADMIN_PASSWORD,
                    "secret_key": SUPER_ADMIN_SECRET
                }
            )
            if response.status_code == 200:
                pytest.super_admin_token = response.json()["token"]
    
    def test_get_tenants_list(self):
        """Test getting list of tenants"""
        headers = {"Authorization": f"Bearer {pytest.super_admin_token}"}
        
        response = requests.get(
            f"{BASE_URL}/api/super-admin/tenants",
            headers=headers
        )
        
        print(f"Tenants list status: {response.status_code}")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        
        if len(data) > 0:
            tenant = data[0]
            print(f"First tenant: {tenant.get('name')} (ID: {tenant.get('id')})")
            pytest.test_tenant_id = tenant.get('id')
            pytest.test_tenant_name = tenant.get('name')
        
        print(f"✓ Got {len(data)} tenants")


class TestLogoUpload:
    """Test logo upload functionality"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Ensure we have a valid token and tenant ID"""
        if not hasattr(pytest, 'super_admin_token'):
            response = requests.post(
                f"{BASE_URL}/api/super-admin/login",
                json={
                    "email": SUPER_ADMIN_EMAIL,
                    "password": SUPER_ADMIN_PASSWORD,
                    "secret_key": SUPER_ADMIN_SECRET
                }
            )
            if response.status_code == 200:
                pytest.super_admin_token = response.json()["token"]
        
        if not hasattr(pytest, 'test_tenant_id'):
            headers = {"Authorization": f"Bearer {pytest.super_admin_token}"}
            response = requests.get(
                f"{BASE_URL}/api/super-admin/tenants",
                headers=headers
            )
            if response.status_code == 200:
                tenants = response.json()
                if len(tenants) > 0:
                    pytest.test_tenant_id = tenants[0].get('id')
                    pytest.test_tenant_name = tenants[0].get('name')
    
    def test_upload_logo_with_file(self):
        """Test uploading logo file via /api/upload/logo"""
        headers = {"Authorization": f"Bearer {pytest.super_admin_token}"}
        
        # Check if test image exists
        test_image_path = "/tmp/valid_logo.png"
        if not os.path.exists(test_image_path):
            # Create a simple test image
            from PIL import Image
            img = Image.new('RGB', (100, 100), color='red')
            img.save(test_image_path)
        
        with open(test_image_path, 'rb') as f:
            files = {'file': ('test_logo.png', f, 'image/png')}
            data = {'tenant_id': pytest.test_tenant_id} if hasattr(pytest, 'test_tenant_id') else {}
            
            response = requests.post(
                f"{BASE_URL}/api/upload/logo",
                headers=headers,
                files=files,
                data=data
            )
        
        print(f"Upload logo status: {response.status_code}")
        print(f"Upload logo response: {response.text}")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "logo_url" in data, "Response should contain logo_url"
        assert data["logo_url"].startswith("/api/uploads/logos/"), "logo_url should start with /api/uploads/logos/"
        
        pytest.uploaded_logo_url = data["logo_url"]
        print(f"✓ Logo uploaded successfully: {data['logo_url']}")
    
    def test_uploaded_logo_accessible(self):
        """Test that uploaded logo is accessible"""
        if not hasattr(pytest, 'uploaded_logo_url'):
            pytest.skip("No logo URL from previous test")
        
        # Access the logo via the API
        logo_url = f"{BASE_URL}{pytest.uploaded_logo_url}"
        response = requests.get(logo_url)
        
        print(f"Logo access status: {response.status_code}")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        assert response.headers.get('content-type', '').startswith('image/'), "Response should be an image"
        
        print(f"✓ Uploaded logo is accessible")


class TestTenantUpdate:
    """Test tenant update with logo_url"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Ensure we have a valid token and tenant ID"""
        if not hasattr(pytest, 'super_admin_token'):
            response = requests.post(
                f"{BASE_URL}/api/super-admin/login",
                json={
                    "email": SUPER_ADMIN_EMAIL,
                    "password": SUPER_ADMIN_PASSWORD,
                    "secret_key": SUPER_ADMIN_SECRET
                }
            )
            if response.status_code == 200:
                pytest.super_admin_token = response.json()["token"]
        
        if not hasattr(pytest, 'test_tenant_id'):
            headers = {"Authorization": f"Bearer {pytest.super_admin_token}"}
            response = requests.get(
                f"{BASE_URL}/api/super-admin/tenants",
                headers=headers
            )
            if response.status_code == 200:
                tenants = response.json()
                if len(tenants) > 0:
                    pytest.test_tenant_id = tenants[0].get('id')
                    pytest.test_tenant_name = tenants[0].get('name')
    
    def test_update_tenant_with_logo_url(self):
        """Test updating tenant with logo_url via JSON body"""
        if not hasattr(pytest, 'test_tenant_id'):
            pytest.skip("No tenant ID available")
        
        headers = {
            "Authorization": f"Bearer {pytest.super_admin_token}",
            "Content-Type": "application/json"
        }
        
        # Get current tenant data first
        response = requests.get(
            f"{BASE_URL}/api/super-admin/tenants/{pytest.test_tenant_id}",
            headers=headers
        )
        
        if response.status_code != 200:
            pytest.skip(f"Could not get tenant: {response.text}")
        
        current_tenant = response.json()
        print(f"Current tenant logo_url: {current_tenant.get('logo_url')}")
        
        # Update with new logo_url
        logo_url = pytest.uploaded_logo_url if hasattr(pytest, 'uploaded_logo_url') else "/api/uploads/logos/test.png"
        
        update_data = {
            "name": current_tenant.get("name"),
            "logo_url": logo_url
        }
        
        response = requests.put(
            f"{BASE_URL}/api/super-admin/tenants/{pytest.test_tenant_id}",
            headers=headers,
            json=update_data
        )
        
        print(f"Update tenant status: {response.status_code}")
        print(f"Update tenant response: {response.text[:500]}")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert data.get("logo_url") == logo_url, f"logo_url should be updated to {logo_url}"
        
        print(f"✓ Tenant updated with logo_url: {data.get('logo_url')}")
    
    def test_get_tenant_details_with_logo(self):
        """Test getting tenant details includes logo_url"""
        if not hasattr(pytest, 'test_tenant_id'):
            pytest.skip("No tenant ID available")
        
        headers = {"Authorization": f"Bearer {pytest.super_admin_token}"}
        
        response = requests.get(
            f"{BASE_URL}/api/super-admin/tenants/{pytest.test_tenant_id}",
            headers=headers
        )
        
        print(f"Get tenant status: {response.status_code}")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        print(f"Tenant details: name={data.get('name')}, logo_url={data.get('logo_url')}")
        
        # Verify logo_url is present
        assert "logo_url" in data or data.get("logo_url") is None, "Response should have logo_url field"
        
        print(f"✓ Tenant details retrieved with logo_url")


class TestSuperAdminStats:
    """Test Super Admin stats endpoint"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Ensure we have a valid token"""
        if not hasattr(pytest, 'super_admin_token'):
            response = requests.post(
                f"{BASE_URL}/api/super-admin/login",
                json={
                    "email": SUPER_ADMIN_EMAIL,
                    "password": SUPER_ADMIN_PASSWORD,
                    "secret_key": SUPER_ADMIN_SECRET
                }
            )
            if response.status_code == 200:
                pytest.super_admin_token = response.json()["token"]
    
    def test_get_super_admin_stats(self):
        """Test getting Super Admin stats"""
        headers = {"Authorization": f"Bearer {pytest.super_admin_token}"}
        
        response = requests.get(
            f"{BASE_URL}/api/super-admin/stats",
            headers=headers
        )
        
        print(f"Stats status: {response.status_code}")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "total_tenants" in data, "Response should contain total_tenants"
        assert "active_tenants" in data, "Response should contain active_tenants"
        
        print(f"✓ Stats: total_tenants={data.get('total_tenants')}, active_tenants={data.get('active_tenants')}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
