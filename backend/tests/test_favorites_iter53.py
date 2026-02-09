"""
Iteration 53 - Customer Favorites API Tests
Tests for:
- POST /api/customer/favorites/add - Add favorite order
- GET /api/customer/favorites - Get customer favorites
- DELETE /api/customer/favorites/{id} - Remove favorite
- Manifest files verification (admin and customer PWA)
"""

import pytest
import requests
import os
import uuid

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestManifestFiles:
    """Test PWA manifest files configuration"""
    
    def test_admin_manifest_start_url(self):
        """Admin manifest.json should have start_url='/'"""
        response = requests.get(f"{BASE_URL}/manifest.json")
        assert response.status_code == 200, f"Failed to get manifest.json: {response.status_code}"
        
        data = response.json()
        assert data.get("start_url") == "/", f"Admin manifest start_url should be '/', got: {data.get('start_url')}"
        assert data.get("scope") == "/", f"Admin manifest scope should be '/', got: {data.get('scope')}"
        print(f"✓ Admin manifest.json: start_url='{data.get('start_url')}', scope='{data.get('scope')}'")
    
    def test_customer_manifest_start_url(self):
        """Customer manifest-menu.json should have start_url='/menu.html'"""
        response = requests.get(f"{BASE_URL}/manifest-menu.json")
        assert response.status_code == 200, f"Failed to get manifest-menu.json: {response.status_code}"
        
        data = response.json()
        assert data.get("start_url") == "/menu.html", f"Customer manifest start_url should be '/menu.html', got: {data.get('start_url')}"
        assert data.get("scope") == "/menu", f"Customer manifest scope should be '/menu', got: {data.get('scope')}"
        print(f"✓ Customer manifest-menu.json: start_url='{data.get('start_url')}', scope='{data.get('scope')}'")


class TestCustomerFavoritesAPI:
    """Test Customer Favorites CRUD operations"""
    
    @pytest.fixture
    def test_phone(self):
        return "01012345678"
    
    @pytest.fixture
    def tenant_id(self):
        return "demo-maestro"
    
    @pytest.fixture
    def sample_items(self):
        return [
            {
                "product_id": "test-product-1",
                "product_name": "قهوة عربية",
                "quantity": 2,
                "price": 25.0,
                "notes": "بدون سكر"
            },
            {
                "product_id": "test-product-2",
                "product_name": "عصير برتقال",
                "quantity": 1,
                "price": 15.0,
                "notes": ""
            }
        ]
    
    def test_add_favorite_success(self, test_phone, tenant_id, sample_items):
        """Test adding a favorite order"""
        payload = {
            "tenant_id": tenant_id,
            "phone": test_phone,
            "name": f"TEST_طلب اختبار_{uuid.uuid4().hex[:6]}",
            "items": sample_items
        }
        
        response = requests.post(f"{BASE_URL}/api/customer/favorites/add", json=payload)
        assert response.status_code == 200, f"Failed to add favorite: {response.status_code} - {response.text}"
        
        data = response.json()
        assert "message" in data, "Response should contain message"
        assert "favorite" in data, "Response should contain favorite object"
        assert data["favorite"]["phone"] == test_phone, "Phone should match"
        assert len(data["favorite"]["items"]) == 2, "Should have 2 items"
        
        print(f"✓ Added favorite: {data['favorite']['name']} with {len(data['favorite']['items'])} items")
        return data["favorite"]["id"]
    
    def test_add_favorite_missing_phone(self, tenant_id, sample_items):
        """Test adding favorite without phone should fail"""
        payload = {
            "tenant_id": tenant_id,
            "phone": "",
            "items": sample_items
        }
        
        response = requests.post(f"{BASE_URL}/api/customer/favorites/add", json=payload)
        assert response.status_code == 400, f"Should fail with 400, got: {response.status_code}"
        print("✓ Correctly rejected favorite without phone")
    
    def test_add_favorite_missing_items(self, test_phone, tenant_id):
        """Test adding favorite without items should fail"""
        payload = {
            "tenant_id": tenant_id,
            "phone": test_phone,
            "items": []
        }
        
        response = requests.post(f"{BASE_URL}/api/customer/favorites/add", json=payload)
        assert response.status_code == 400, f"Should fail with 400, got: {response.status_code}"
        print("✓ Correctly rejected favorite without items")
    
    def test_get_favorites_success(self, test_phone, tenant_id):
        """Test getting customer favorites"""
        response = requests.get(
            f"{BASE_URL}/api/customer/favorites",
            params={"tenant_id": tenant_id, "phone": test_phone}
        )
        assert response.status_code == 200, f"Failed to get favorites: {response.status_code}"
        
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        print(f"✓ Got {len(data)} favorites for phone {test_phone}")
        return data
    
    def test_get_favorites_without_phone(self, tenant_id):
        """Test getting favorites without phone returns empty list"""
        response = requests.get(
            f"{BASE_URL}/api/customer/favorites",
            params={"tenant_id": tenant_id}
        )
        assert response.status_code == 200, f"Should return 200, got: {response.status_code}"
        
        data = response.json()
        assert data == [], "Should return empty list when no phone provided"
        print("✓ Correctly returned empty list without phone")
    
    def test_delete_favorite_success(self, test_phone, tenant_id, sample_items):
        """Test deleting a favorite"""
        # First create a favorite
        payload = {
            "tenant_id": tenant_id,
            "phone": test_phone,
            "name": f"TEST_للحذف_{uuid.uuid4().hex[:6]}",
            "items": sample_items
        }
        
        create_response = requests.post(f"{BASE_URL}/api/customer/favorites/add", json=payload)
        assert create_response.status_code == 200, "Failed to create favorite for deletion test"
        
        favorite_id = create_response.json()["favorite"]["id"]
        
        # Now delete it
        delete_response = requests.delete(
            f"{BASE_URL}/api/customer/favorites/{favorite_id}",
            params={"phone": test_phone}
        )
        assert delete_response.status_code == 200, f"Failed to delete favorite: {delete_response.status_code}"
        
        data = delete_response.json()
        assert "message" in data, "Response should contain message"
        print(f"✓ Successfully deleted favorite {favorite_id}")
    
    def test_delete_favorite_not_found(self, test_phone):
        """Test deleting non-existent favorite returns 404"""
        fake_id = str(uuid.uuid4())
        
        response = requests.delete(
            f"{BASE_URL}/api/customer/favorites/{fake_id}",
            params={"phone": test_phone}
        )
        assert response.status_code == 404, f"Should return 404, got: {response.status_code}"
        print("✓ Correctly returned 404 for non-existent favorite")
    
    def test_delete_favorite_missing_phone(self):
        """Test deleting favorite without phone should fail"""
        fake_id = str(uuid.uuid4())
        
        response = requests.delete(f"{BASE_URL}/api/customer/favorites/{fake_id}")
        assert response.status_code == 400, f"Should return 400, got: {response.status_code}"
        print("✓ Correctly rejected delete without phone")


class TestCustomerMenuAPI:
    """Test Customer Menu API"""
    
    def test_get_menu_success(self):
        """Test getting customer menu for demo-maestro"""
        response = requests.get(f"{BASE_URL}/api/customer/menu/demo-maestro")
        assert response.status_code == 200, f"Failed to get menu: {response.status_code}"
        
        data = response.json()
        assert "restaurant" in data, "Response should contain restaurant"
        assert "categories" in data, "Response should contain categories"
        assert "products" in data, "Response should contain products"
        assert "branches" in data, "Response should contain branches"
        
        print(f"✓ Got menu: {data['restaurant']['name']} with {len(data['categories'])} categories, {len(data['products'])} products")


class TestAdminLogin:
    """Test Admin Login"""
    
    def test_admin_login_success(self):
        """Test admin login with demo credentials"""
        payload = {
            "email": "demo@maestroegp.com",
            "password": "demo123"
        }
        
        response = requests.post(f"{BASE_URL}/api/auth/login", json=payload)
        assert response.status_code == 200, f"Failed to login: {response.status_code} - {response.text}"
        
        data = response.json()
        assert "token" in data, "Response should contain token"
        assert "user" in data, "Response should contain user"
        
        print(f"✓ Admin login successful: {data['user']['email']}")
        return data["token"]


class TestCleanup:
    """Cleanup test data"""
    
    def test_cleanup_test_favorites(self):
        """Clean up TEST_ prefixed favorites"""
        test_phone = "01012345678"
        
        # Get all favorites
        response = requests.get(
            f"{BASE_URL}/api/customer/favorites",
            params={"tenant_id": "demo-maestro", "phone": test_phone}
        )
        
        if response.status_code == 200:
            favorites = response.json()
            deleted_count = 0
            for fav in favorites:
                if fav.get("name", "").startswith("TEST_"):
                    del_response = requests.delete(
                        f"{BASE_URL}/api/customer/favorites/{fav['id']}",
                        params={"phone": test_phone}
                    )
                    if del_response.status_code == 200:
                        deleted_count += 1
            
            print(f"✓ Cleaned up {deleted_count} test favorites")
