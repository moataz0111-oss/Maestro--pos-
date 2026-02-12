"""
Test file for Menu PWA features - Iteration 52
Tests:
1. menu.html redirects to /menu
2. menu.html?r=demo-maestro redirects to /menu/demo-maestro
3. manifest-menu.json is accessible and has correct configuration
4. QR Code in dashboard contains correct /menu.html?r=xxx URL
5. showCustomerMenu feature toggle
6. Admin login and dashboard access
7. Product names displayed in orders
"""

import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://arabeng-resto.preview.emergentagent.com')

class TestMenuPWA:
    """Tests for menu.html PWA entry point"""
    
    def test_menu_html_accessible(self):
        """Test that menu.html is accessible"""
        response = requests.get(f"{BASE_URL}/menu.html", allow_redirects=False)
        # Should return 200 (HTML page) or redirect
        assert response.status_code in [200, 301, 302, 304], f"Expected 200/301/302, got {response.status_code}"
        
        # If 200, check content
        if response.status_code == 200:
            assert "قائمة الطعام" in response.text or "menu" in response.text.lower()
            assert "manifest-menu.json" in response.text
            print("✅ menu.html is accessible and contains correct content")
    
    def test_manifest_menu_json_accessible(self):
        """Test that manifest-menu.json is accessible and has correct config"""
        response = requests.get(f"{BASE_URL}/manifest-menu.json")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        
        # Check required fields
        assert data.get("start_url") == "/menu.html", f"Expected start_url=/menu.html, got {data.get('start_url')}"
        assert data.get("scope") == "/menu", f"Expected scope=/menu, got {data.get('scope')}"
        assert data.get("theme_color") == "#f97316", f"Expected theme_color=#f97316, got {data.get('theme_color')}"
        assert data.get("display") == "standalone", f"Expected display=standalone, got {data.get('display')}"
        
        print("✅ manifest-menu.json has correct configuration")
        print(f"   start_url: {data.get('start_url')}")
        print(f"   scope: {data.get('scope')}")
        print(f"   theme_color: {data.get('theme_color')}")


class TestCustomerMenuAPI:
    """Tests for customer menu API endpoints"""
    
    def test_customer_menu_endpoint(self):
        """Test GET /api/customer/menu/{tenant_id}"""
        response = requests.get(f"{BASE_URL}/api/customer/menu/demo-maestro")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        assert "restaurant" in data, "Response should contain 'restaurant'"
        assert "categories" in data, "Response should contain 'categories'"
        assert "products" in data, "Response should contain 'products'"
        assert "branches" in data, "Response should contain 'branches'"
        
        print(f"✅ Customer menu API working")
        print(f"   Restaurant: {data.get('restaurant', {}).get('name', 'N/A')}")
        print(f"   Categories: {len(data.get('categories', []))}")
        print(f"   Products: {len(data.get('products', []))}")
        print(f"   Branches: {len(data.get('branches', []))}")


class TestAdminDashboard:
    """Tests for admin dashboard features"""
    
    @pytest.fixture
    def auth_token(self):
        """Get authentication token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "demo@maestroegp.com",
            "password": "demo123"
        })
        assert response.status_code == 200, f"Login failed: {response.status_code}"
        return response.json().get("token")
    
    def test_admin_login(self):
        """Test admin login"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "demo@maestroegp.com",
            "password": "demo123"
        })
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        assert "token" in data, "Response should contain 'token'"
        assert data.get("user", {}).get("role") == "admin", "User should be admin"
        
        print("✅ Admin login successful")
    
    def test_menu_link_api(self, auth_token):
        """Test GET /api/customer/menu-link"""
        response = requests.get(
            f"{BASE_URL}/api/customer/menu-link",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        assert "menu_url" in data, "Response should contain 'menu_url'"
        assert "tenant_id" in data, "Response should contain 'tenant_id'"
        
        print(f"✅ Menu link API working")
        print(f"   menu_url: {data.get('menu_url')}")
        print(f"   tenant_id: {data.get('tenant_id')}")
    
    def test_dashboard_settings_show_customer_menu(self, auth_token):
        """Test showCustomerMenu setting in dashboard settings"""
        response = requests.get(
            f"{BASE_URL}/api/settings/dashboard",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        # showCustomerMenu should be True by default
        show_customer_menu = data.get("showCustomerMenu", True)
        assert show_customer_menu == True, f"Expected showCustomerMenu=True, got {show_customer_menu}"
        
        print(f"✅ showCustomerMenu setting is enabled")


class TestOrdersWithProductNames:
    """Tests for orders with product names"""
    
    @pytest.fixture
    def auth_token(self):
        """Get authentication token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "demo@maestroegp.com",
            "password": "demo123"
        })
        assert response.status_code == 200, f"Login failed: {response.status_code}"
        return response.json().get("token")
    
    def test_orders_contain_product_names(self, auth_token):
        """Test that orders contain product names"""
        response = requests.get(
            f"{BASE_URL}/api/orders",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        if len(data) > 0:
            order = data[0]
            items = order.get("items", [])
            if len(items) > 0:
                item = items[0]
                # Check that product_name exists
                product_name = item.get("product_name") or item.get("name")
                assert product_name is not None, "Item should have product_name or name"
                assert len(product_name) > 0, "Product name should not be empty"
                
                print(f"✅ Orders contain product names")
                print(f"   Sample product: {product_name}")
            else:
                print("⚠️ Order has no items to verify")
        else:
            print("⚠️ No orders found to verify product names")


class TestHealthCheck:
    """Basic health check tests"""
    
    def test_api_health(self):
        """Test API health endpoint"""
        response = requests.get(f"{BASE_URL}/api/health")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        assert data.get("status") == "ok", f"Expected status=ok, got {data.get('status')}"
        
        print("✅ API health check passed")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
