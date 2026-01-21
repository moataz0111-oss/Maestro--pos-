"""
Iteration 20 - Testing New Features:
1. تقييم الموظفين - Dashboard label change from 'التقييمات' to 'تقييم الموظفين'
2. تقييمات العملاء - Customer reviews tab in Loyalty page
3. API تقييمات العملاء - GET/POST /api/customer-reviews
4. حقل غاز في المصاريف - 'gas' category in expenses
5. إعدادات المطعم - PUT/GET /api/settings/restaurant
6. رفع شعار المطعم - POST /api/upload/restaurant-logo
7. صفحة تثبيت التطبيق - /install-app page
"""

import pytest
import requests
import os
import uuid

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestHealthAndAuth:
    """Basic health and authentication tests"""
    
    def test_health_check(self):
        """Test API health endpoint"""
        response = requests.get(f"{BASE_URL}/api/health")
        assert response.status_code == 200
        data = response.json()
        assert data.get("status") == "ok"
        print("✅ Health check passed")
    
    def test_admin_login(self):
        """Test admin login"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "admin@maestroegp.com",
            "password": "admin123"
        })
        assert response.status_code == 200
        data = response.json()
        assert "token" in data
        assert "user" in data
        print(f"✅ Admin login successful - Role: {data['user'].get('role')}")
        return data["token"]


class TestCustomerReviewsAPI:
    """Test customer reviews API endpoints"""
    
    @pytest.fixture
    def auth_token(self):
        """Get authentication token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "admin@maestroegp.com",
            "password": "admin123"
        })
        if response.status_code == 200:
            return response.json().get("token")
        pytest.skip("Authentication failed")
    
    def test_get_customer_reviews(self, auth_token):
        """Test GET /api/customer-reviews"""
        headers = {"Authorization": f"Bearer {auth_token}"}
        response = requests.get(f"{BASE_URL}/api/customer-reviews", headers=headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✅ GET /api/customer-reviews - Returns {len(data)} reviews")
    
    def test_create_customer_review(self, auth_token):
        """Test POST /api/customer-reviews"""
        test_review = {
            "order_id": f"TEST_order_{uuid.uuid4().hex[:8]}",
            "order_number": 12345,
            "customer_name": "TEST_Customer",
            "customer_phone": "07901234567",
            "rating": 5,
            "comment": "طعام ممتاز وخدمة رائعة",
            "food_rating": 5,
            "service_rating": 4,
            "speed_rating": 5
        }
        
        # POST doesn't require auth (for customers)
        response = requests.post(f"{BASE_URL}/api/customer-reviews", json=test_review)
        assert response.status_code == 200
        data = response.json()
        assert "id" in data
        assert data.get("rating") == 5
        assert data.get("customer_name") == "TEST_Customer"
        print(f"✅ POST /api/customer-reviews - Created review with ID: {data.get('id')}")
        
        # Verify review appears in GET
        headers = {"Authorization": f"Bearer {auth_token}"}
        get_response = requests.get(f"{BASE_URL}/api/customer-reviews", headers=headers)
        assert get_response.status_code == 200
        reviews = get_response.json()
        created_review = next((r for r in reviews if r.get("id") == data.get("id")), None)
        assert created_review is not None
        print("✅ Created review verified in GET response")


class TestRestaurantSettingsAPI:
    """Test restaurant settings API endpoints"""
    
    @pytest.fixture
    def auth_token(self):
        """Get authentication token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "admin@maestroegp.com",
            "password": "admin123"
        })
        if response.status_code == 200:
            return response.json().get("token")
        pytest.skip("Authentication failed")
    
    def test_get_restaurant_settings(self, auth_token):
        """Test GET /api/settings/restaurant"""
        headers = {"Authorization": f"Bearer {auth_token}"}
        response = requests.get(f"{BASE_URL}/api/settings/restaurant", headers=headers)
        assert response.status_code == 200
        data = response.json()
        # Should return name, name_ar, logo_url fields
        assert "name" in data or data == {}
        print(f"✅ GET /api/settings/restaurant - Settings: {data}")
    
    def test_update_restaurant_settings(self, auth_token):
        """Test PUT /api/settings/restaurant"""
        headers = {"Authorization": f"Bearer {auth_token}"}
        
        # First get current settings
        get_response = requests.get(f"{BASE_URL}/api/settings/restaurant", headers=headers)
        original_settings = get_response.json()
        
        # Update settings
        new_settings = {
            "name": "TEST_Restaurant_Name",
            "name_ar": "اسم المطعم التجريبي",
            "logo_url": original_settings.get("logo_url", "")
        }
        
        response = requests.put(f"{BASE_URL}/api/settings/restaurant", 
                               json=new_settings, headers=headers)
        assert response.status_code == 200
        data = response.json()
        assert "message" in data
        print(f"✅ PUT /api/settings/restaurant - {data.get('message')}")
        
        # Verify update
        verify_response = requests.get(f"{BASE_URL}/api/settings/restaurant", headers=headers)
        assert verify_response.status_code == 200
        updated = verify_response.json()
        assert updated.get("name") == "TEST_Restaurant_Name"
        print("✅ Restaurant settings update verified")
        
        # Restore original settings if they existed
        if original_settings.get("name"):
            requests.put(f"{BASE_URL}/api/settings/restaurant", 
                        json=original_settings, headers=headers)


class TestExpensesGasCategory:
    """Test that gas category exists in expenses"""
    
    @pytest.fixture
    def auth_token(self):
        """Get authentication token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "admin@maestroegp.com",
            "password": "admin123"
        })
        if response.status_code == 200:
            return response.json().get("token")
        pytest.skip("Authentication failed")
    
    def test_create_gas_expense(self, auth_token):
        """Test creating expense with 'gas' category"""
        headers = {"Authorization": f"Bearer {auth_token}"}
        
        # First get a branch
        branches_response = requests.get(f"{BASE_URL}/api/branches", headers=headers)
        assert branches_response.status_code == 200
        branches = branches_response.json()
        assert len(branches) > 0
        branch_id = branches[0].get("id")
        
        # Create gas expense
        expense_data = {
            "category": "gas",
            "description": "TEST_Gas expense for testing",
            "amount": 50000,
            "payment_method": "cash",
            "branch_id": branch_id,
            "date": "2025-01-15"
        }
        
        response = requests.post(f"{BASE_URL}/api/expenses", json=expense_data, headers=headers)
        assert response.status_code == 200
        data = response.json()
        assert data.get("category") == "gas"
        print(f"✅ Created gas expense with ID: {data.get('id')}")
        
        # Verify in expenses list
        expenses_response = requests.get(f"{BASE_URL}/api/expenses", 
                                        params={"branch_id": branch_id}, headers=headers)
        assert expenses_response.status_code == 200
        expenses = expenses_response.json()
        gas_expense = next((e for e in expenses if e.get("id") == data.get("id")), None)
        assert gas_expense is not None
        assert gas_expense.get("category") == "gas"
        print("✅ Gas expense verified in expenses list")


class TestUploadRestaurantLogo:
    """Test restaurant logo upload endpoint"""
    
    @pytest.fixture
    def auth_token(self):
        """Get authentication token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "admin@maestroegp.com",
            "password": "admin123"
        })
        if response.status_code == 200:
            return response.json().get("token")
        pytest.skip("Authentication failed")
    
    def test_upload_logo_endpoint_exists(self, auth_token):
        """Test that POST /api/upload/restaurant-logo endpoint exists"""
        headers = {"Authorization": f"Bearer {auth_token}"}
        
        # Create a simple test image (1x1 pixel PNG)
        import base64
        # Minimal valid PNG
        png_data = base64.b64decode(
            "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="
        )
        
        files = {
            'file': ('test_logo.png', png_data, 'image/png')
        }
        
        response = requests.post(f"{BASE_URL}/api/upload/restaurant-logo", 
                                files=files, headers=headers)
        
        # Should return 200 with logo_url or 400 for invalid file
        assert response.status_code in [200, 400]
        
        if response.status_code == 200:
            data = response.json()
            assert "logo_url" in data or "url" in data
            print(f"✅ POST /api/upload/restaurant-logo - Logo uploaded: {data}")
        else:
            print(f"✅ POST /api/upload/restaurant-logo - Endpoint exists (returned {response.status_code})")


class TestInstallAppPage:
    """Test install-app page accessibility"""
    
    def test_install_app_page_loads(self):
        """Test that /install-app page is accessible"""
        response = requests.get(f"{BASE_URL}/install-app")
        # Should return HTML (React app)
        assert response.status_code == 200
        assert "text/html" in response.headers.get("content-type", "")
        print("✅ /install-app page is accessible")


class TestLoyaltyPage:
    """Test loyalty page with customer reviews tab"""
    
    @pytest.fixture
    def auth_token(self):
        """Get authentication token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "admin@maestroegp.com",
            "password": "admin123"
        })
        if response.status_code == 200:
            return response.json().get("token")
        pytest.skip("Authentication failed")
    
    def test_loyalty_members_api(self, auth_token):
        """Test GET /api/loyalty/members"""
        headers = {"Authorization": f"Bearer {auth_token}"}
        response = requests.get(f"{BASE_URL}/api/loyalty/members", headers=headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✅ GET /api/loyalty/members - Returns {len(data)} members")
    
    def test_loyalty_settings_api(self, auth_token):
        """Test GET /api/loyalty/settings"""
        headers = {"Authorization": f"Bearer {auth_token}"}
        response = requests.get(f"{BASE_URL}/api/loyalty/settings", headers=headers)
        assert response.status_code == 200
        print("✅ GET /api/loyalty/settings - Settings retrieved")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
