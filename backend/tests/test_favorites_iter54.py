"""
Test Favorites Feature - Iteration 54
Tests for customer favorites API endpoints
"""
import pytest
import requests
import os
import uuid

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
TEST_PHONE = "01099887766"
RESTAURANT_SLUG = "demo-maestro"
ADMIN_EMAIL = "demo@maestroegp.com"
ADMIN_PASSWORD = "demo123"


class TestFavoritesAPI:
    """Test customer favorites API endpoints"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test data"""
        self.test_favorite_id = None
        yield
        # Cleanup: Delete test favorite if created
        if self.test_favorite_id:
            try:
                requests.delete(
                    f"{BASE_URL}/api/customer/favorites/{self.test_favorite_id}",
                    params={"phone": TEST_PHONE}
                )
            except:
                pass
    
    def test_add_favorite(self):
        """Test adding a favorite order"""
        payload = {
            "tenant_id": RESTAURANT_SLUG,
            "phone": TEST_PHONE,
            "name": f"Test Favorite {uuid.uuid4().hex[:8]}",
            "items": [
                {
                    "product_id": "test-product-1",
                    "product_name": "برغر كلاسيك",
                    "quantity": 2,
                    "price": 5000,
                    "notes": ""
                },
                {
                    "product_id": "test-product-2",
                    "product_name": "كولا",
                    "quantity": 1,
                    "price": 1500,
                    "notes": ""
                }
            ]
        }
        
        response = requests.post(f"{BASE_URL}/api/customer/favorites/add", json=payload)
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "favorite" in data
        assert "id" in data["favorite"]
        assert data["favorite"]["phone"] == TEST_PHONE
        assert len(data["favorite"]["items"]) == 2
        
        # Store for cleanup
        self.test_favorite_id = data["favorite"]["id"]
        print(f"✅ Add favorite: PASSED - Created favorite {self.test_favorite_id}")
    
    def test_get_favorites(self):
        """Test getting favorites list"""
        # First add a favorite
        payload = {
            "tenant_id": RESTAURANT_SLUG,
            "phone": TEST_PHONE,
            "name": f"Test Get Favorite {uuid.uuid4().hex[:8]}",
            "items": [
                {
                    "product_id": "test-product-1",
                    "product_name": "بيتزا مارغريتا",
                    "quantity": 1,
                    "price": 8000,
                    "notes": ""
                }
            ]
        }
        
        add_response = requests.post(f"{BASE_URL}/api/customer/favorites/add", json=payload)
        assert add_response.status_code == 200
        self.test_favorite_id = add_response.json()["favorite"]["id"]
        
        # Now get favorites
        response = requests.get(
            f"{BASE_URL}/api/customer/favorites",
            params={"tenant_id": RESTAURANT_SLUG, "phone": TEST_PHONE}
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert isinstance(data, list)
        assert len(data) > 0
        
        # Verify our favorite is in the list
        favorite_ids = [f["id"] for f in data]
        assert self.test_favorite_id in favorite_ids
        
        print(f"✅ Get favorites: PASSED - Found {len(data)} favorites")
    
    def test_delete_favorite(self):
        """Test deleting a favorite"""
        # First add a favorite
        payload = {
            "tenant_id": RESTAURANT_SLUG,
            "phone": TEST_PHONE,
            "name": f"Test Delete Favorite {uuid.uuid4().hex[:8]}",
            "items": [
                {
                    "product_id": "test-product-1",
                    "product_name": "شاورما",
                    "quantity": 1,
                    "price": 3500,
                    "notes": ""
                }
            ]
        }
        
        add_response = requests.post(f"{BASE_URL}/api/customer/favorites/add", json=payload)
        assert add_response.status_code == 200
        favorite_id = add_response.json()["favorite"]["id"]
        
        # Delete the favorite
        response = requests.delete(
            f"{BASE_URL}/api/customer/favorites/{favorite_id}",
            params={"phone": TEST_PHONE}
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "message" in data
        
        # Verify it's deleted
        get_response = requests.get(
            f"{BASE_URL}/api/customer/favorites",
            params={"tenant_id": RESTAURANT_SLUG, "phone": TEST_PHONE}
        )
        favorites = get_response.json()
        favorite_ids = [f["id"] for f in favorites]
        assert favorite_id not in favorite_ids
        
        print(f"✅ Delete favorite: PASSED - Deleted favorite {favorite_id}")
    
    def test_add_favorite_without_phone(self):
        """Test adding favorite without phone should fail"""
        payload = {
            "tenant_id": RESTAURANT_SLUG,
            "phone": "",
            "name": "Test",
            "items": [
                {
                    "product_id": "test-product-1",
                    "product_name": "Test",
                    "quantity": 1,
                    "price": 1000,
                    "notes": ""
                }
            ]
        }
        
        response = requests.post(f"{BASE_URL}/api/customer/favorites/add", json=payload)
        
        assert response.status_code == 400, f"Expected 400, got {response.status_code}"
        print("✅ Add favorite without phone: PASSED - Returns 400 as expected")
    
    def test_delete_nonexistent_favorite(self):
        """Test deleting non-existent favorite should return 404"""
        response = requests.delete(
            f"{BASE_URL}/api/customer/favorites/nonexistent-id-12345",
            params={"phone": TEST_PHONE}
        )
        
        assert response.status_code == 404, f"Expected 404, got {response.status_code}"
        print("✅ Delete nonexistent favorite: PASSED - Returns 404 as expected")


class TestAdminLogin:
    """Test admin login and PWA manifest"""
    
    def test_admin_login(self):
        """Test admin login works"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "token" in data
        assert "user" in data
        assert data["user"]["email"] == ADMIN_EMAIL
        
        print(f"✅ Admin login: PASSED - Token received")
    
    def test_manifest_start_url(self):
        """Test PWA manifest has correct start_url"""
        response = requests.get(f"{BASE_URL}/manifest.json")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        assert data.get("start_url") == "/", f"Expected start_url='/', got '{data.get('start_url')}'"
        
        print(f"✅ Manifest start_url: PASSED - start_url='/'")


class TestCustomerMenu:
    """Test customer menu API"""
    
    def test_get_menu(self):
        """Test getting customer menu"""
        response = requests.get(f"{BASE_URL}/api/customer/menu/{RESTAURANT_SLUG}")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "restaurant" in data
        assert "categories" in data
        assert "products" in data
        
        print(f"✅ Get menu: PASSED - Restaurant: {data['restaurant'].get('name', 'N/A')}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
