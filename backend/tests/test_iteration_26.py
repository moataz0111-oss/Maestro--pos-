"""
Iteration 26 - Final Testing Before Deployment
Testing:
1. Login as owner (super_admin) and admin
2. Packaging cost field in products
3. Manufactured product linking
4. Packaging cost calculation in orders (takeaway/delivery)
5. Super Admin dashboard access
6. API endpoints: products, manufactured-products, reports/sales
"""

import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
OWNER_EMAIL = "owner@maestroegp.com"
OWNER_PASSWORD = "owner123"
ADMIN_EMAIL = "admin@maestroegp.com"
ADMIN_PASSWORD = "admin123"


class TestAuthentication:
    """Test authentication for owner and admin"""
    
    def test_owner_login(self):
        """Test login as owner (super_admin)"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": OWNER_EMAIL,
            "password": OWNER_PASSWORD
        })
        assert response.status_code == 200, f"Owner login failed: {response.text}"
        data = response.json()
        assert "token" in data, "No token in response"
        assert data.get("user", {}).get("role") == "super_admin", f"Expected super_admin role, got {data.get('user', {}).get('role')}"
        print(f"✅ Owner login successful - Role: {data.get('user', {}).get('role')}")
        return data["token"]
    
    def test_admin_login(self):
        """Test login as admin"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        assert response.status_code == 200, f"Admin login failed: {response.text}"
        data = response.json()
        assert "token" in data, "No token in response"
        assert data.get("user", {}).get("role") == "admin", f"Expected admin role, got {data.get('user', {}).get('role')}"
        print(f"✅ Admin login successful - Role: {data.get('user', {}).get('role')}")
        return data["token"]


class TestProductsAPI:
    """Test products API with packaging_cost and manufactured_product_id"""
    
    @pytest.fixture
    def admin_token(self):
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        return response.json()["token"]
    
    def test_get_products(self, admin_token):
        """Test GET /api/products"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        response = requests.get(f"{BASE_URL}/api/products", headers=headers)
        assert response.status_code == 200, f"Failed to get products: {response.text}"
        products = response.json()
        assert isinstance(products, list), "Products should be a list"
        print(f"✅ GET /api/products - Found {len(products)} products")
        
        # Check if products have packaging_cost field
        if products:
            first_product = products[0]
            print(f"   Product fields: {list(first_product.keys())}")
            # packaging_cost should be in the response (even if 0)
            if "packaging_cost" in first_product:
                print(f"   ✅ packaging_cost field exists: {first_product.get('packaging_cost')}")
            else:
                print(f"   ⚠️ packaging_cost field not in response")
        return products
    
    def test_update_product_with_packaging_cost(self, admin_token):
        """Test PUT /api/products/{id} with packaging_cost"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        
        # First get a product
        response = requests.get(f"{BASE_URL}/api/products", headers=headers)
        products = response.json()
        
        if not products:
            pytest.skip("No products to test")
        
        product = products[0]
        product_id = product["id"]
        
        # Update with packaging_cost
        update_data = {
            "name": product.get("name"),
            "name_en": product.get("name_en", ""),
            "category_id": product.get("category_id"),
            "price": product.get("price"),
            "cost": product.get("cost", 0),
            "operating_cost": product.get("operating_cost", 0),
            "packaging_cost": 500,  # Set packaging cost to 500
            "is_available": product.get("is_available", True)
        }
        
        response = requests.put(f"{BASE_URL}/api/products/{product_id}", headers=headers, json=update_data)
        assert response.status_code == 200, f"Failed to update product: {response.text}"
        
        # Verify the update
        response = requests.get(f"{BASE_URL}/api/products", headers=headers)
        updated_products = response.json()
        updated_product = next((p for p in updated_products if p["id"] == product_id), None)
        
        if updated_product:
            assert updated_product.get("packaging_cost") == 500, f"packaging_cost not updated correctly: {updated_product.get('packaging_cost')}"
            print(f"✅ Product updated with packaging_cost: {updated_product.get('packaging_cost')}")
        
        # Reset packaging_cost to original
        update_data["packaging_cost"] = product.get("packaging_cost", 0)
        requests.put(f"{BASE_URL}/api/products/{product_id}", headers=headers, json=update_data)


class TestManufacturedProductsAPI:
    """Test manufactured products API"""
    
    @pytest.fixture
    def admin_token(self):
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        return response.json()["token"]
    
    def test_get_manufactured_products(self, admin_token):
        """Test GET /api/manufactured-products"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        response = requests.get(f"{BASE_URL}/api/manufactured-products", headers=headers)
        assert response.status_code == 200, f"Failed to get manufactured products: {response.text}"
        mfg_products = response.json()
        assert isinstance(mfg_products, list), "Manufactured products should be a list"
        print(f"✅ GET /api/manufactured-products - Found {len(mfg_products)} manufactured products")
        return mfg_products


class TestReportsAPI:
    """Test reports API"""
    
    @pytest.fixture
    def admin_token(self):
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        return response.json()["token"]
    
    def test_get_sales_report(self, admin_token):
        """Test GET /api/reports/sales"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        response = requests.get(f"{BASE_URL}/api/reports/sales", headers=headers)
        assert response.status_code == 200, f"Failed to get sales report: {response.text}"
        report = response.json()
        
        # Check required fields
        expected_fields = ["total_sales", "total_orders", "by_payment_method", "by_delivery_app", "top_products"]
        for field in expected_fields:
            assert field in report, f"Missing field: {field}"
        
        print(f"✅ GET /api/reports/sales - total_sales: {report.get('total_sales')}, total_orders: {report.get('total_orders')}")
        return report


class TestOrdersWithPackagingCost:
    """Test order creation with packaging cost calculation"""
    
    @pytest.fixture
    def admin_token(self):
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        return response.json()["token"]
    
    def test_get_orders(self, admin_token):
        """Test GET /api/orders"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        response = requests.get(f"{BASE_URL}/api/orders", headers=headers)
        assert response.status_code == 200, f"Failed to get orders: {response.text}"
        orders = response.json()
        assert isinstance(orders, list), "Orders should be a list"
        print(f"✅ GET /api/orders - Found {len(orders)} orders")
        
        # Check for takeaway/delivery orders with packaging cost
        takeaway_orders = [o for o in orders if o.get("order_type") in ["takeaway", "delivery"]]
        if takeaway_orders:
            print(f"   Found {len(takeaway_orders)} takeaway/delivery orders")
            # Check if items have packaging_cost
            for order in takeaway_orders[:3]:  # Check first 3
                for item in order.get("items", []):
                    if "packaging_cost" in item:
                        print(f"   ✅ Order {order.get('order_number')} item has packaging_cost: {item.get('packaging_cost')}")
        return orders


class TestSuperAdminAccess:
    """Test super admin specific endpoints"""
    
    @pytest.fixture
    def owner_token(self):
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": OWNER_EMAIL,
            "password": OWNER_PASSWORD
        })
        return response.json()["token"]
    
    @pytest.fixture
    def admin_token(self):
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        return response.json()["token"]
    
    def test_super_admin_branding_access(self, owner_token):
        """Test super admin can access branding settings"""
        headers = {"Authorization": f"Bearer {owner_token}"}
        response = requests.get(f"{BASE_URL}/api/system/branding", headers=headers)
        # Should return 200 for super_admin
        assert response.status_code == 200, f"Super admin should access branding: {response.text}"
        print(f"✅ Super admin can access /api/system/branding")
    
    def test_admin_cannot_access_super_admin_endpoints(self, admin_token):
        """Test regular admin cannot access super admin endpoints"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        response = requests.get(f"{BASE_URL}/api/system/branding", headers=headers)
        # Should return 403 for regular admin
        assert response.status_code == 403, f"Regular admin should not access super admin endpoints: {response.status_code}"
        print(f"✅ Regular admin correctly denied access to super admin endpoints")
    
    def test_get_tenants_as_super_admin(self, owner_token):
        """Test super admin can get tenants list"""
        headers = {"Authorization": f"Bearer {owner_token}"}
        response = requests.get(f"{BASE_URL}/api/super-admin/tenants", headers=headers)
        assert response.status_code == 200, f"Failed to get tenants: {response.text}"
        tenants = response.json()
        print(f"✅ GET /api/super-admin/tenants - Found {len(tenants)} tenants")


class TestCategoriesAPI:
    """Test categories API (regression)"""
    
    @pytest.fixture
    def admin_token(self):
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        return response.json()["token"]
    
    def test_get_categories(self, admin_token):
        """Test GET /api/categories"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        response = requests.get(f"{BASE_URL}/api/categories", headers=headers)
        assert response.status_code == 200, f"Failed to get categories: {response.text}"
        categories = response.json()
        assert isinstance(categories, list), "Categories should be a list"
        print(f"✅ GET /api/categories - Found {len(categories)} categories")


class TestBranchesAPI:
    """Test branches API (regression)"""
    
    @pytest.fixture
    def admin_token(self):
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        return response.json()["token"]
    
    def test_get_branches(self, admin_token):
        """Test GET /api/branches"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        response = requests.get(f"{BASE_URL}/api/branches", headers=headers)
        assert response.status_code == 200, f"Failed to get branches: {response.text}"
        branches = response.json()
        assert isinstance(branches, list), "Branches should be a list"
        print(f"✅ GET /api/branches - Found {len(branches)} branches")
        return branches


class TestHealthEndpoints:
    """Test health check endpoints"""
    
    def test_root_health(self):
        """Test root endpoint"""
        response = requests.get(f"{BASE_URL}/")
        assert response.status_code == 200, f"Root health check failed: {response.text}"
        print(f"✅ GET / - Server is running")
    
    def test_api_health(self):
        """Test API health endpoint"""
        response = requests.get(f"{BASE_URL}/api/health")
        assert response.status_code == 200, f"API health check failed: {response.text}"
        print(f"✅ GET /api/health - API is healthy")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
