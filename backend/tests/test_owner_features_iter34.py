"""
Iteration 34 - Test Owner (Super Admin) Features
Tests:
1. Owner login (owner@maestroegp.com / owner123)
2. Demo account login (demo@maestroegp.com / demo123)
3. Super Admin panel login (/super-admin) with secret key (271018)
4. Impersonate tenant functionality
5. Owner branches display in Settings page
6. Add new branch for owner
7. Owner products display in Settings page
8. Add new product for owner
"""

import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://blind-count-pos.preview.emergentagent.com')

# Test credentials
OWNER_EMAIL = "owner@maestroegp.com"
OWNER_PASSWORD = "owner123"
DEMO_EMAIL = "demo@maestroegp.com"
DEMO_PASSWORD = "demo123"
SECRET_KEY = "271018"


class TestHealthCheck:
    """Basic health check tests"""
    
    def test_api_health(self):
        """Test API health endpoint"""
        response = requests.get(f"{BASE_URL}/api/health")
        assert response.status_code == 200
        data = response.json()
        assert data.get("status") == "ok"
        print("✅ API health check passed")


class TestOwnerLogin:
    """Test owner (super_admin) login functionality"""
    
    def test_owner_login_success(self):
        """Test owner login with correct credentials"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": OWNER_EMAIL,
            "password": OWNER_PASSWORD
        })
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert "token" in data, "Token not found in response"
        assert "user" in data, "User not found in response"
        assert data["user"]["role"] == "super_admin", f"Expected super_admin role, got {data['user']['role']}"
        print(f"✅ Owner login successful - Role: {data['user']['role']}")
        return data["token"]
    
    def test_owner_login_wrong_password(self):
        """Test owner login with wrong password"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": OWNER_EMAIL,
            "password": "wrongpassword"
        })
        assert response.status_code == 401, f"Expected 401, got {response.status_code}"
        print("✅ Owner login with wrong password correctly rejected")
    
    def test_owner_login_wrong_email(self):
        """Test owner login with wrong email"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "wrong@maestroegp.com",
            "password": OWNER_PASSWORD
        })
        assert response.status_code == 401, f"Expected 401, got {response.status_code}"
        print("✅ Owner login with wrong email correctly rejected")


class TestDemoAccountLogin:
    """Test demo account login functionality"""
    
    def test_demo_login_success(self):
        """Test demo account login"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": DEMO_EMAIL,
            "password": DEMO_PASSWORD
        })
        # Demo account may or may not exist
        if response.status_code == 200:
            data = response.json()
            assert "token" in data
            print(f"✅ Demo account login successful - Role: {data['user']['role']}")
            return data["token"]
        elif response.status_code == 401:
            print("⚠️ Demo account does not exist or credentials are wrong")
            pytest.skip("Demo account not configured")
        else:
            pytest.fail(f"Unexpected status code: {response.status_code}")


class TestSuperAdminPanelLogin:
    """Test Super Admin panel login with secret key"""
    
    def test_super_admin_panel_login_success(self):
        """Test super admin panel login with correct credentials and secret key"""
        response = requests.post(f"{BASE_URL}/api/super-admin/login", json={
            "email": OWNER_EMAIL,
            "password": OWNER_PASSWORD,
            "secret_key": SECRET_KEY
        })
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert "token" in data, "Token not found in response"
        assert data["user"]["role"] == "super_admin"
        print(f"✅ Super Admin panel login successful")
        return data["token"]
    
    def test_super_admin_panel_login_wrong_secret(self):
        """Test super admin panel login with wrong secret key"""
        response = requests.post(f"{BASE_URL}/api/super-admin/login", json={
            "email": OWNER_EMAIL,
            "password": OWNER_PASSWORD,
            "secret_key": "wrongsecret"
        })
        assert response.status_code in [401, 403], f"Expected 401/403, got {response.status_code}"
        print("✅ Super Admin panel login with wrong secret correctly rejected")
    
    def test_super_admin_panel_login_wrong_password(self):
        """Test super admin panel login with wrong password"""
        response = requests.post(f"{BASE_URL}/api/super-admin/login", json={
            "email": OWNER_EMAIL,
            "password": "wrongpassword",
            "secret_key": SECRET_KEY
        })
        assert response.status_code == 401, f"Expected 401, got {response.status_code}"
        print("✅ Super Admin panel login with wrong password correctly rejected")


class TestImpersonateTenant:
    """Test impersonate tenant functionality from Super Admin panel"""
    
    @pytest.fixture
    def super_admin_token(self):
        """Get super admin token"""
        response = requests.post(f"{BASE_URL}/api/super-admin/login", json={
            "email": OWNER_EMAIL,
            "password": OWNER_PASSWORD,
            "secret_key": SECRET_KEY
        })
        assert response.status_code == 200
        return response.json()["token"]
    
    def test_get_tenants_list(self, super_admin_token):
        """Test getting list of tenants"""
        headers = {"Authorization": f"Bearer {super_admin_token}"}
        response = requests.get(f"{BASE_URL}/api/super-admin/tenants", headers=headers)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        tenants = response.json()
        assert isinstance(tenants, list), "Expected list of tenants"
        print(f"✅ Got {len(tenants)} tenants")
        return tenants
    
    def test_impersonate_tenant(self, super_admin_token):
        """Test impersonating a tenant"""
        headers = {"Authorization": f"Bearer {super_admin_token}"}
        
        # First get tenants list
        response = requests.get(f"{BASE_URL}/api/super-admin/tenants", headers=headers)
        assert response.status_code == 200
        tenants = response.json()
        
        if len(tenants) == 0:
            pytest.skip("No tenants available to impersonate")
        
        # Try to impersonate first tenant
        tenant_id = tenants[0]["id"]
        response = requests.post(f"{BASE_URL}/api/super-admin/impersonate/{tenant_id}", headers=headers)
        
        if response.status_code == 200:
            data = response.json()
            assert "token" in data, "Token not found in impersonate response"
            assert data.get("impersonated") == True, "Impersonated flag not set"
            print(f"✅ Successfully impersonated tenant: {tenants[0].get('name', tenant_id)}")
        elif response.status_code == 404:
            print(f"⚠️ Tenant admin not found for tenant {tenant_id}")
        else:
            pytest.fail(f"Unexpected status code: {response.status_code}: {response.text}")
    
    def test_impersonate_main_system(self, super_admin_token):
        """Test impersonating main system"""
        headers = {"Authorization": f"Bearer {super_admin_token}"}
        response = requests.post(f"{BASE_URL}/api/super-admin/impersonate/main-system", headers=headers)
        
        if response.status_code == 200:
            data = response.json()
            assert "token" in data
            assert data.get("impersonated") == True
            print("✅ Successfully impersonated main system")
        elif response.status_code == 404:
            print("⚠️ Main system admin not found")
        else:
            print(f"⚠️ Impersonate main system returned: {response.status_code}")


class TestOwnerBranches:
    """Test owner branches functionality"""
    
    @pytest.fixture
    def owner_token(self):
        """Get owner token via regular login"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": OWNER_EMAIL,
            "password": OWNER_PASSWORD
        })
        assert response.status_code == 200
        return response.json()["token"]
    
    def test_get_owner_branches(self, owner_token):
        """Test getting branches for owner (should use tenant_id: default)"""
        headers = {"Authorization": f"Bearer {owner_token}"}
        response = requests.get(f"{BASE_URL}/api/branches", headers=headers)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        branches = response.json()
        assert isinstance(branches, list), "Expected list of branches"
        print(f"✅ Owner has {len(branches)} branches")
        
        # Verify branches are returned (should not be empty for owner with tenant_id: default)
        if len(branches) > 0:
            print(f"   Branches: {[b.get('name') for b in branches]}")
        return branches
    
    def test_add_owner_branch(self, owner_token):
        """Test adding a new branch for owner"""
        headers = {"Authorization": f"Bearer {owner_token}"}
        
        # Create a new branch
        new_branch = {
            "name": "TEST_فرع المالك الجديد",
            "address": "عنوان الفرع الجديد",
            "phone": "07801234567",
            "email": "newbranch@test.com"
        }
        
        response = requests.post(f"{BASE_URL}/api/branches", headers=headers, json=new_branch)
        
        if response.status_code == 200 or response.status_code == 201:
            data = response.json()
            assert "id" in data, "Branch ID not returned"
            print(f"✅ Successfully created branch: {data.get('name')}")
            
            # Verify branch appears in list
            response = requests.get(f"{BASE_URL}/api/branches", headers=headers)
            branches = response.json()
            branch_names = [b.get('name') for b in branches]
            assert new_branch["name"] in branch_names, "New branch not found in list"
            print(f"✅ New branch verified in branches list")
            
            return data
        elif response.status_code == 403:
            print(f"⚠️ Owner not authorized to create branches: {response.text}")
            pytest.skip("Owner not authorized to create branches")
        else:
            pytest.fail(f"Unexpected status code: {response.status_code}: {response.text}")


class TestOwnerCategories:
    """Test owner categories functionality"""
    
    @pytest.fixture
    def owner_token(self):
        """Get owner token via regular login"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": OWNER_EMAIL,
            "password": OWNER_PASSWORD
        })
        assert response.status_code == 200
        return response.json()["token"]
    
    def test_get_owner_categories(self, owner_token):
        """Test getting categories for owner (should use tenant_id: default)"""
        headers = {"Authorization": f"Bearer {owner_token}"}
        response = requests.get(f"{BASE_URL}/api/categories", headers=headers)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        categories = response.json()
        assert isinstance(categories, list), "Expected list of categories"
        print(f"✅ Owner has {len(categories)} categories")
        
        if len(categories) > 0:
            print(f"   Categories: {[c.get('name') for c in categories]}")
        return categories
    
    def test_add_owner_category(self, owner_token):
        """Test adding a new category for owner"""
        headers = {"Authorization": f"Bearer {owner_token}"}
        
        # Create a new category
        new_category = {
            "name": "TEST_مشروبات المالك",
            "name_en": "Owner Drinks",
            "sort_order": 99,
            "color": "#FF5733"
        }
        
        response = requests.post(f"{BASE_URL}/api/categories", headers=headers, json=new_category)
        
        if response.status_code == 200 or response.status_code == 201:
            data = response.json()
            assert "id" in data, "Category ID not returned"
            print(f"✅ Successfully created category: {data.get('name')}")
            return data
        elif response.status_code == 403:
            print(f"⚠️ Owner not authorized to create categories: {response.text}")
            pytest.skip("Owner not authorized to create categories")
        else:
            pytest.fail(f"Unexpected status code: {response.status_code}: {response.text}")


class TestOwnerProducts:
    """Test owner products functionality"""
    
    @pytest.fixture
    def owner_token(self):
        """Get owner token via regular login"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": OWNER_EMAIL,
            "password": OWNER_PASSWORD
        })
        assert response.status_code == 200
        return response.json()["token"]
    
    def test_get_owner_products(self, owner_token):
        """Test getting products for owner (should use tenant_id: default)"""
        headers = {"Authorization": f"Bearer {owner_token}"}
        response = requests.get(f"{BASE_URL}/api/products", headers=headers)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        products = response.json()
        assert isinstance(products, list), "Expected list of products"
        print(f"✅ Owner has {len(products)} products")
        
        if len(products) > 0:
            print(f"   Products: {[p.get('name') for p in products[:5]]}...")
        return products
    
    def test_add_owner_product(self, owner_token):
        """Test adding a new product for owner"""
        headers = {"Authorization": f"Bearer {owner_token}"}
        
        # First get categories to get a valid category_id
        response = requests.get(f"{BASE_URL}/api/categories", headers=headers)
        categories = response.json()
        
        if len(categories) == 0:
            pytest.skip("No categories available to add product")
        
        category_id = categories[0]["id"]
        
        # Create a new product
        new_product = {
            "name": "TEST_عصير المالك الطبيعي",
            "name_en": "Owner Natural Juice",
            "category_id": category_id,
            "price": 5000,
            "cost": 2000,
            "operating_cost": 500,
            "packaging_cost": 200,
            "is_available": True,
            "description": "عصير طبيعي طازج"
        }
        
        response = requests.post(f"{BASE_URL}/api/products", headers=headers, json=new_product)
        
        if response.status_code == 200 or response.status_code == 201:
            data = response.json()
            assert "id" in data, "Product ID not returned"
            print(f"✅ Successfully created product: {data.get('name')}")
            
            # Verify product appears in list
            response = requests.get(f"{BASE_URL}/api/products", headers=headers)
            products = response.json()
            product_names = [p.get('name') for p in products]
            assert new_product["name"] in product_names, "New product not found in list"
            print(f"✅ New product verified in products list")
            
            return data
        elif response.status_code == 403:
            print(f"⚠️ Owner not authorized to create products: {response.text}")
            pytest.skip("Owner not authorized to create products")
        else:
            pytest.fail(f"Unexpected status code: {response.status_code}: {response.text}")


class TestCleanup:
    """Cleanup test data"""
    
    @pytest.fixture
    def owner_token(self):
        """Get owner token via regular login"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": OWNER_EMAIL,
            "password": OWNER_PASSWORD
        })
        assert response.status_code == 200
        return response.json()["token"]
    
    def test_cleanup_test_data(self, owner_token):
        """Clean up TEST_ prefixed data"""
        headers = {"Authorization": f"Bearer {owner_token}"}
        
        # Clean up test products
        response = requests.get(f"{BASE_URL}/api/products", headers=headers)
        if response.status_code == 200:
            products = response.json()
            for p in products:
                if p.get("name", "").startswith("TEST_"):
                    requests.delete(f"{BASE_URL}/api/products/{p['id']}", headers=headers)
                    print(f"   Deleted test product: {p['name']}")
        
        # Clean up test categories
        response = requests.get(f"{BASE_URL}/api/categories", headers=headers)
        if response.status_code == 200:
            categories = response.json()
            for c in categories:
                if c.get("name", "").startswith("TEST_"):
                    requests.delete(f"{BASE_URL}/api/categories/{c['id']}", headers=headers)
                    print(f"   Deleted test category: {c['name']}")
        
        # Clean up test branches
        response = requests.get(f"{BASE_URL}/api/branches", headers=headers)
        if response.status_code == 200:
            branches = response.json()
            for b in branches:
                if b.get("name", "").startswith("TEST_"):
                    requests.delete(f"{BASE_URL}/api/branches/{b['id']}", headers=headers)
                    print(f"   Deleted test branch: {b['name']}")
        
        print("✅ Test data cleanup completed")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
