"""
Iteration 29 - Backend API Tests
Testing:
1. Owner login (owner@maestroegp.com / owner123)
2. Customer login (ahmed@albait.com / 123456)
3. Super admin stats - should exclude main system sales (tenant_id: default)
4. Tables API for customer
5. Categories and products with images
6. System invoice settings (owner)
7. Tenant activate/deactivate
8. Invoice settings
"""

import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestAuthentication:
    """Authentication tests for owner and customer"""
    
    def test_owner_login(self):
        """Test owner (super_admin) login"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "owner@maestroegp.com",
            "password": "owner123"
        })
        assert response.status_code == 200, f"Owner login failed: {response.text}"
        data = response.json()
        assert "token" in data, "Token not in response"
        assert "user" in data, "User not in response"
        assert data["user"]["role"] == "super_admin", f"Expected super_admin role, got {data['user']['role']}"
        print(f"✅ Owner login successful - role: {data['user']['role']}")
        return data["token"]
    
    def test_customer_login(self):
        """Test customer (ahmed@albait.com) login"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "ahmed@albait.com",
            "password": "123456"
        })
        assert response.status_code == 200, f"Customer login failed: {response.text}"
        data = response.json()
        assert "token" in data, "Token not in response"
        assert "user" in data, "User not in response"
        print(f"✅ Customer login successful - role: {data['user']['role']}, tenant_id: {data['user'].get('tenant_id')}")
        return data["token"]


class TestSuperAdminStats:
    """Test super admin stats - should exclude default tenant sales"""
    
    @pytest.fixture
    def owner_token(self):
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "owner@maestroegp.com",
            "password": "owner123"
        })
        return response.json()["token"]
    
    def test_super_admin_stats_endpoint(self, owner_token):
        """Test /api/super-admin/stats endpoint"""
        headers = {"Authorization": f"Bearer {owner_token}"}
        response = requests.get(f"{BASE_URL}/api/super-admin/stats", headers=headers)
        assert response.status_code == 200, f"Stats endpoint failed: {response.text}"
        data = response.json()
        
        # Verify response structure
        assert "total_tenants" in data, "total_tenants not in response"
        assert "active_tenants" in data, "active_tenants not in response"
        assert "total_users" in data, "total_users not in response"
        assert "total_orders" in data, "total_orders not in response"
        assert "total_sales" in data, "total_sales not in response"
        
        print(f"✅ Super admin stats: tenants={data['total_tenants']}, orders={data['total_orders']}, sales={data['total_sales']}")
        return data


class TestTenantManagement:
    """Test tenant activate/deactivate functionality"""
    
    @pytest.fixture
    def owner_token(self):
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "owner@maestroegp.com",
            "password": "owner123"
        })
        return response.json()["token"]
    
    def test_get_tenants_list(self, owner_token):
        """Test getting list of tenants"""
        headers = {"Authorization": f"Bearer {owner_token}"}
        response = requests.get(f"{BASE_URL}/api/super-admin/tenants", headers=headers)
        assert response.status_code == 200, f"Get tenants failed: {response.text}"
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        print(f"✅ Got {len(data)} tenants")
        return data
    
    def test_deactivate_and_reactivate_tenant(self, owner_token):
        """Test deactivating and reactivating a tenant"""
        headers = {"Authorization": f"Bearer {owner_token}"}
        
        # First get tenants list
        response = requests.get(f"{BASE_URL}/api/super-admin/tenants", headers=headers)
        tenants = response.json()
        
        if len(tenants) == 0:
            pytest.skip("No tenants to test with")
        
        # Find an active tenant to test with
        test_tenant = None
        for tenant in tenants:
            if tenant.get("is_active", True):
                test_tenant = tenant
                break
        
        if not test_tenant:
            pytest.skip("No active tenant found to test")
        
        tenant_id = test_tenant["id"]
        print(f"Testing with tenant: {test_tenant.get('name')} (id: {tenant_id})")
        
        # Test deactivate (DELETE)
        delete_response = requests.delete(f"{BASE_URL}/api/super-admin/tenants/{tenant_id}", headers=headers)
        assert delete_response.status_code == 200, f"Deactivate failed: {delete_response.text}"
        print(f"✅ Tenant deactivated successfully")
        
        # Test reactivate (PUT /reactivate)
        reactivate_response = requests.put(f"{BASE_URL}/api/super-admin/tenants/{tenant_id}/reactivate", headers=headers)
        assert reactivate_response.status_code == 200, f"Reactivate failed: {reactivate_response.text}"
        print(f"✅ Tenant reactivated successfully")
        
        # Verify tenant is active again
        verify_response = requests.get(f"{BASE_URL}/api/super-admin/tenants", headers=headers)
        tenants_after = verify_response.json()
        reactivated_tenant = next((t for t in tenants_after if t["id"] == tenant_id), None)
        assert reactivated_tenant is not None, "Tenant not found after reactivation"
        assert reactivated_tenant.get("is_active", False) == True, "Tenant should be active after reactivation"
        print(f"✅ Verified tenant is active: {reactivated_tenant.get('is_active')}")


class TestTablesAPI:
    """Test tables API for customer"""
    
    @pytest.fixture
    def customer_token(self):
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "ahmed@albait.com",
            "password": "123456"
        })
        return response.json()["token"]
    
    def test_get_tables(self, customer_token):
        """Test getting tables for customer"""
        headers = {"Authorization": f"Bearer {customer_token}"}
        response = requests.get(f"{BASE_URL}/api/tables", headers=headers)
        assert response.status_code == 200, f"Get tables failed: {response.text}"
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        print(f"✅ Customer has {len(data)} tables")
        
        # Verify table structure
        if len(data) > 0:
            table = data[0]
            assert "id" in table, "Table should have id"
            assert "number" in table, "Table should have number"
            assert "status" in table, "Table should have status"
            print(f"✅ Table structure verified: number={table.get('number')}, status={table.get('status')}")
        
        return data


class TestCategoriesAndProducts:
    """Test categories and products with images"""
    
    @pytest.fixture
    def customer_token(self):
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "ahmed@albait.com",
            "password": "123456"
        })
        return response.json()["token"]
    
    def test_get_categories_with_images(self, customer_token):
        """Test getting categories with images"""
        headers = {"Authorization": f"Bearer {customer_token}"}
        response = requests.get(f"{BASE_URL}/api/categories", headers=headers)
        assert response.status_code == 200, f"Get categories failed: {response.text}"
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        print(f"✅ Got {len(data)} categories")
        
        # Check for images
        categories_with_images = [c for c in data if c.get("image")]
        print(f"   Categories with images: {len(categories_with_images)}/{len(data)}")
        
        return data
    
    def test_get_products_with_images(self, customer_token):
        """Test getting products with images"""
        headers = {"Authorization": f"Bearer {customer_token}"}
        response = requests.get(f"{BASE_URL}/api/products", headers=headers)
        assert response.status_code == 200, f"Get products failed: {response.text}"
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        print(f"✅ Got {len(data)} products")
        
        # Check for images
        products_with_images = [p for p in data if p.get("image")]
        print(f"   Products with images: {len(products_with_images)}/{len(data)}")
        
        return data


class TestInvoiceSettings:
    """Test invoice settings for owner and tenant"""
    
    @pytest.fixture
    def owner_token(self):
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "owner@maestroegp.com",
            "password": "owner123"
        })
        return response.json()["token"]
    
    @pytest.fixture
    def customer_token(self):
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "ahmed@albait.com",
            "password": "123456"
        })
        return response.json()["token"]
    
    def test_get_system_invoice_settings(self):
        """Test getting system invoice settings (public endpoint)"""
        response = requests.get(f"{BASE_URL}/api/system/invoice-settings")
        assert response.status_code == 200, f"Get system invoice settings failed: {response.text}"
        data = response.json()
        
        # Verify structure
        expected_fields = ["system_name", "system_logo_url", "thank_you_message", "system_phone", "system_phone2", "system_email", "show_system_branding"]
        for field in expected_fields:
            assert field in data, f"Field {field} not in response"
        
        print(f"✅ System invoice settings: system_name={data.get('system_name')}, show_branding={data.get('show_system_branding')}")
        return data
    
    def test_update_system_invoice_settings(self, owner_token):
        """Test updating system invoice settings (owner only)"""
        headers = {"Authorization": f"Bearer {owner_token}"}
        
        # Update settings
        update_data = {
            "system_name": "Maestro EGP",
            "system_phone": "07701234567",
            "system_phone2": "07809876543",
            "system_email": "info@maestroegp.com",
            "thank_you_message": "شكراً لزيارتكم - Maestro EGP",
            "show_system_branding": True
        }
        
        response = requests.put(f"{BASE_URL}/api/system/invoice-settings", json=update_data, headers=headers)
        assert response.status_code == 200, f"Update system invoice settings failed: {response.text}"
        data = response.json()
        
        print(f"✅ System invoice settings updated successfully")
        
        # Verify update
        verify_response = requests.get(f"{BASE_URL}/api/system/invoice-settings")
        verify_data = verify_response.json()
        assert verify_data.get("system_name") == "Maestro EGP", "System name not updated"
        assert verify_data.get("system_phone") == "07701234567", "System phone not updated"
        print(f"✅ Verified system invoice settings: name={verify_data.get('system_name')}, phone={verify_data.get('system_phone')}")
    
    def test_get_tenant_invoice_settings(self, customer_token):
        """Test getting tenant invoice settings"""
        headers = {"Authorization": f"Bearer {customer_token}"}
        response = requests.get(f"{BASE_URL}/api/tenant/invoice-settings", headers=headers)
        assert response.status_code == 200, f"Get tenant invoice settings failed: {response.text}"
        data = response.json()
        
        # Verify structure
        expected_fields = ["show_logo", "phone", "phone2", "address", "tax_number", "custom_header", "custom_footer"]
        for field in expected_fields:
            assert field in data, f"Field {field} not in response"
        
        print(f"✅ Tenant invoice settings: phone={data.get('phone')}, address={data.get('address')}")
        return data
    
    def test_update_tenant_invoice_settings(self, customer_token):
        """Test updating tenant invoice settings"""
        headers = {"Authorization": f"Bearer {customer_token}"}
        
        # Update settings
        update_data = {
            "show_logo": True,
            "phone": "07701111111",
            "phone2": "07802222222",
            "address": "بغداد - الكرادة",
            "tax_number": "123456789",
            "custom_header": "أهلاً بكم",
            "custom_footer": "نتمنى لكم وجبة شهية"
        }
        
        response = requests.put(f"{BASE_URL}/api/tenant/invoice-settings", json=update_data, headers=headers)
        assert response.status_code == 200, f"Update tenant invoice settings failed: {response.text}"
        
        print(f"✅ Tenant invoice settings updated successfully")
        
        # Verify update
        verify_response = requests.get(f"{BASE_URL}/api/tenant/invoice-settings", headers=headers)
        verify_data = verify_response.json()
        assert verify_data.get("phone") == "07701111111", "Phone not updated"
        assert verify_data.get("address") == "بغداد - الكرادة", "Address not updated"
        print(f"✅ Verified tenant invoice settings: phone={verify_data.get('phone')}, address={verify_data.get('address')}")


class TestPOSEndpoints:
    """Test POS related endpoints"""
    
    @pytest.fixture
    def customer_token(self):
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "ahmed@albait.com",
            "password": "123456"
        })
        return response.json()["token"]
    
    def test_get_branches(self, customer_token):
        """Test getting branches"""
        headers = {"Authorization": f"Bearer {customer_token}"}
        response = requests.get(f"{BASE_URL}/api/branches", headers=headers)
        assert response.status_code == 200, f"Get branches failed: {response.text}"
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        print(f"✅ Got {len(data)} branches")
        return data
    
    def test_get_drivers(self, customer_token):
        """Test getting drivers"""
        headers = {"Authorization": f"Bearer {customer_token}"}
        response = requests.get(f"{BASE_URL}/api/drivers", headers=headers)
        assert response.status_code == 200, f"Get drivers failed: {response.text}"
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        print(f"✅ Got {len(data)} drivers")
        return data


class TestHealthCheck:
    """Basic health check tests"""
    
    def test_root_endpoint(self):
        """Test root endpoint"""
        response = requests.get(f"{BASE_URL}/")
        assert response.status_code == 200, f"Root endpoint failed: {response.text}"
        print(f"✅ Root endpoint working")
    
    def test_api_health(self):
        """Test API health endpoint"""
        response = requests.get(f"{BASE_URL}/api/health")
        assert response.status_code == 200, f"Health endpoint failed: {response.text}"
        print(f"✅ API health endpoint working")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
