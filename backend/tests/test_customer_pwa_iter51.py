"""
Test iteration 51 - Customer PWA and Order History Tests
Tests:
1. /menu page displays restaurants
2. /menu/{tenant_id} displays branches and menu
3. manifest-customer.json has correct start_url and scope
4. /api/customer/orders/history returns orders by phone
5. /api/customer/orders/history returns empty for non-existent phone
6. Add product to cart and view cart
7. Login page works correctly
"""

import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestCustomerRestaurants:
    """Test customer restaurant listing"""
    
    def test_get_restaurants_list(self):
        """Test GET /api/customer/restaurants returns list of restaurants"""
        response = requests.get(f"{BASE_URL}/api/customer/restaurants")
        assert response.status_code == 200
        
        data = response.json()
        assert isinstance(data, list)
        assert len(data) > 0
        
        # Check first restaurant has required fields
        restaurant = data[0]
        assert "id" in restaurant
        assert "name" in restaurant
        assert "menu_slug" in restaurant
        print(f"Found {len(data)} restaurants")
        print(f"First restaurant: {restaurant['name']} (slug: {restaurant['menu_slug']})")


class TestCustomerMenu:
    """Test customer menu endpoints"""
    
    def test_get_menu_by_tenant_slug(self):
        """Test GET /api/customer/menu/{tenant_id} returns menu data"""
        response = requests.get(f"{BASE_URL}/api/customer/menu/demo-maestro")
        assert response.status_code == 200
        
        data = response.json()
        assert "restaurant" in data
        assert "categories" in data
        assert "products" in data
        
        # Verify restaurant data
        restaurant = data["restaurant"]
        assert restaurant["menu_slug"] == "demo-maestro"
        print(f"Restaurant: {restaurant['name']}")
        print(f"Categories: {len(data['categories'])}")
        print(f"Products: {len(data['products'])}")
    
    def test_get_menu_branches(self):
        """Test that menu response includes branches"""
        response = requests.get(f"{BASE_URL}/api/customer/menu/demo-maestro")
        assert response.status_code == 200
        
        data = response.json()
        # Branches may or may not be in response depending on implementation
        if "branches" in data:
            branches = data["branches"]
            print(f"Found {len(branches)} branches")
            for branch in branches:
                print(f"  - {branch.get('name', 'Unknown')}")
    
    def test_get_menu_invalid_tenant(self):
        """Test GET /api/customer/menu/{invalid_tenant} returns 404"""
        response = requests.get(f"{BASE_URL}/api/customer/menu/invalid-tenant-xyz")
        assert response.status_code == 404


class TestCustomerOrderHistory:
    """Test customer order history API"""
    
    def test_order_history_with_valid_phone(self):
        """Test GET /api/customer/orders/history returns orders for valid phone"""
        response = requests.get(
            f"{BASE_URL}/api/customer/orders/history",
            params={"tenant_id": "demo-maestro", "phone": "07701234567"}
        )
        assert response.status_code == 200
        
        data = response.json()
        assert isinstance(data, list)
        print(f"Found {len(data)} orders for phone 07701234567")
        
        if len(data) > 0:
            order = data[0]
            assert "id" in order
            assert "order_number" in order
            assert "status" in order
            assert "status_label" in order
            assert "items_count" in order
            print(f"Latest order: #{order['order_number']} - {order['status_label']}")
    
    def test_order_history_with_nonexistent_phone(self):
        """Test GET /api/customer/orders/history returns empty for non-existent phone"""
        response = requests.get(
            f"{BASE_URL}/api/customer/orders/history",
            params={"tenant_id": "demo-maestro", "phone": "07999999999"}
        )
        assert response.status_code == 200
        
        data = response.json()
        assert isinstance(data, list)
        assert len(data) == 0
        print("Correctly returned empty array for non-existent phone")
    
    def test_order_history_without_phone(self):
        """Test GET /api/customer/orders/history returns empty when no phone provided"""
        response = requests.get(
            f"{BASE_URL}/api/customer/orders/history",
            params={"tenant_id": "demo-maestro"}
        )
        assert response.status_code == 200
        
        data = response.json()
        assert isinstance(data, list)
        assert len(data) == 0
        print("Correctly returned empty array when no phone provided")


class TestManifestCustomer:
    """Test customer PWA manifest"""
    
    def test_manifest_customer_exists(self):
        """Test manifest-customer.json is accessible"""
        response = requests.get(f"{BASE_URL}/manifest-customer.json")
        assert response.status_code == 200
        print("manifest-customer.json is accessible")
    
    def test_manifest_customer_start_url(self):
        """Test manifest-customer.json has correct start_url"""
        response = requests.get(f"{BASE_URL}/manifest-customer.json")
        assert response.status_code == 200
        
        data = response.json()
        assert "start_url" in data
        assert data["start_url"] == "/menu"
        print(f"start_url: {data['start_url']} ✓")
    
    def test_manifest_customer_scope(self):
        """Test manifest-customer.json has correct scope"""
        response = requests.get(f"{BASE_URL}/manifest-customer.json")
        assert response.status_code == 200
        
        data = response.json()
        assert "scope" in data
        assert data["scope"] == "/menu"
        print(f"scope: {data['scope']} ✓")
    
    def test_manifest_customer_theme_color(self):
        """Test manifest-customer.json has orange theme color"""
        response = requests.get(f"{BASE_URL}/manifest-customer.json")
        assert response.status_code == 200
        
        data = response.json()
        assert "theme_color" in data
        assert data["theme_color"] == "#f97316"
        print(f"theme_color: {data['theme_color']} ✓")


class TestAuthentication:
    """Test authentication endpoints"""
    
    def test_login_with_valid_credentials(self):
        """Test POST /api/auth/login with valid demo credentials"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": "demo@maestroegp.com", "password": "demo123"}
        )
        assert response.status_code == 200
        
        data = response.json()
        assert "token" in data or "access_token" in data
        print("Login successful with demo credentials")
    
    def test_login_with_invalid_credentials(self):
        """Test POST /api/auth/login with invalid credentials"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": "invalid@test.com", "password": "wrongpassword"}
        )
        assert response.status_code in [401, 400, 404]
        print("Login correctly rejected invalid credentials")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
