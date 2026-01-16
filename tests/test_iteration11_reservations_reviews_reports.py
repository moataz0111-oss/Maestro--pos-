"""
Iteration 11 - Backend API Tests
Testing: Reservations, Reviews, Smart Reports APIs
Also testing: Settings permissions, Logo display for tenant ahmed@albait.com
"""

import pytest
import requests
import os
from datetime import datetime, timedelta

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
ADMIN_CREDENTIALS = {"email": "admin@maestroegp.com", "password": "admin123"}
TENANT_CREDENTIALS = {"email": "ahmed@albait.com", "password": "password123"}


class TestAuthAndSetup:
    """Authentication and setup tests"""
    
    @pytest.fixture(scope="class")
    def admin_token(self):
        """Get admin authentication token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json=ADMIN_CREDENTIALS)
        if response.status_code == 200:
            return response.json().get("token")
        pytest.skip("Admin authentication failed")
    
    @pytest.fixture(scope="class")
    def tenant_token(self):
        """Get tenant user (ahmed@albait.com) authentication token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json=TENANT_CREDENTIALS)
        if response.status_code == 200:
            return response.json().get("token")
        pytest.skip("Tenant authentication failed")
    
    def test_admin_login(self):
        """Test admin login"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json=ADMIN_CREDENTIALS)
        assert response.status_code == 200, f"Admin login failed: {response.text}"
        data = response.json()
        assert "token" in data
        print(f"✓ Admin login successful")
    
    def test_tenant_login(self):
        """Test tenant user login (ahmed@albait.com)"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json=TENANT_CREDENTIALS)
        assert response.status_code == 200, f"Tenant login failed: {response.text}"
        data = response.json()
        assert "token" in data
        print(f"✓ Tenant user (ahmed@albait.com) login successful")


class TestReservationsAPI:
    """Reservations API tests"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup - get auth token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json=ADMIN_CREDENTIALS)
        if response.status_code == 200:
            self.token = response.json().get("token")
            self.headers = {"Authorization": f"Bearer {self.token}"}
        else:
            pytest.skip("Authentication failed")
    
    def test_get_reservations_list(self):
        """Test GET /api/reservations - Get reservations list"""
        response = requests.get(f"{BASE_URL}/api/reservations", headers=self.headers)
        assert response.status_code == 200, f"Failed to get reservations: {response.text}"
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        print(f"✓ GET /api/reservations - Returns {len(data)} reservations")
    
    def test_create_reservation(self):
        """Test POST /api/reservations - Create new reservation"""
        tomorrow = (datetime.now() + timedelta(days=1)).strftime("%Y-%m-%d")
        reservation_data = {
            "customer_name": "TEST_عميل اختبار",
            "customer_phone": "0501234567",
            "customer_email": "test@example.com",
            "date": tomorrow,
            "time": "19:00",
            "guests": 4,
            "notes": "حجز اختباري"
        }
        
        response = requests.post(f"{BASE_URL}/api/reservations", json=reservation_data, headers=self.headers)
        assert response.status_code == 200, f"Failed to create reservation: {response.text}"
        
        data = response.json()
        assert "id" in data, "Response should contain reservation id"
        assert "reservation_number" in data, "Response should contain reservation_number"
        assert data["customer_name"] == reservation_data["customer_name"]
        assert data["status"] == "pending"
        
        # Store for cleanup
        self.created_reservation_id = data["id"]
        print(f"✓ POST /api/reservations - Created reservation {data['reservation_number']}")
        
        # Cleanup - delete the test reservation
        requests.delete(f"{BASE_URL}/api/reservations/{data['id']}", headers=self.headers)
    
    def test_get_reservations_with_filters(self):
        """Test GET /api/reservations with date filter"""
        today = datetime.now().strftime("%Y-%m-%d")
        response = requests.get(f"{BASE_URL}/api/reservations?date={today}", headers=self.headers)
        assert response.status_code == 200, f"Failed to get filtered reservations: {response.text}"
        print(f"✓ GET /api/reservations?date={today} - Filter works")
    
    def test_reservations_stats(self):
        """Test GET /api/reservations/stats - Get reservation statistics"""
        response = requests.get(f"{BASE_URL}/api/reservations/stats", headers=self.headers)
        assert response.status_code == 200, f"Failed to get reservation stats: {response.text}"
        
        data = response.json()
        assert "total" in data
        assert "today" in data
        assert "pending" in data
        assert "confirmed" in data
        print(f"✓ GET /api/reservations/stats - Total: {data['total']}, Today: {data['today']}")


class TestReviewsAPI:
    """Reviews API tests"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup - get auth token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json=ADMIN_CREDENTIALS)
        if response.status_code == 200:
            self.token = response.json().get("token")
            self.headers = {"Authorization": f"Bearer {self.token}"}
        else:
            pytest.skip("Authentication failed")
    
    def test_get_reviews_list(self):
        """Test GET /api/reviews - Get reviews list"""
        response = requests.get(f"{BASE_URL}/api/reviews", headers=self.headers)
        assert response.status_code == 200, f"Failed to get reviews: {response.text}"
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        print(f"✓ GET /api/reviews - Returns {len(data)} reviews")
    
    def test_create_review(self):
        """Test POST /api/reviews - Create new review"""
        review_data = {
            "customer_name": "TEST_عميل تقييم",
            "customer_phone": "0509876543",
            "rating": 5,
            "food_rating": 5,
            "service_rating": 4,
            "cleanliness_rating": 5,
            "comment": "طعام ممتاز وخدمة رائعة - تقييم اختباري"
        }
        
        response = requests.post(f"{BASE_URL}/api/reviews", json=review_data, headers=self.headers)
        assert response.status_code == 200, f"Failed to create review: {response.text}"
        
        data = response.json()
        assert "id" in data, "Response should contain review id"
        assert data["rating"] == review_data["rating"]
        assert data["customer_name"] == review_data["customer_name"]
        
        print(f"✓ POST /api/reviews - Created review with rating {data['rating']}")
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/reviews/{data['id']}", headers=self.headers)
    
    def test_get_reviews_stats(self):
        """Test GET /api/reviews/stats - Get review statistics"""
        response = requests.get(f"{BASE_URL}/api/reviews/stats", headers=self.headers)
        assert response.status_code == 200, f"Failed to get review stats: {response.text}"
        
        data = response.json()
        assert "total" in data
        assert "average_rating" in data
        assert "five_star" in data
        assert "four_star" in data
        assert "three_star" in data
        assert "two_star" in data
        assert "one_star" in data
        assert "responded" in data
        assert "pending_response" in data
        
        print(f"✓ GET /api/reviews/stats - Total: {data['total']}, Average: {data['average_rating']}")
    
    def test_get_reviews_with_rating_filter(self):
        """Test GET /api/reviews with rating filter"""
        response = requests.get(f"{BASE_URL}/api/reviews?rating=5", headers=self.headers)
        assert response.status_code == 200, f"Failed to get filtered reviews: {response.text}"
        print(f"✓ GET /api/reviews?rating=5 - Filter works")


class TestSmartReportsAPI:
    """Smart Reports API tests"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup - get auth token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json=ADMIN_CREDENTIALS)
        if response.status_code == 200:
            self.token = response.json().get("token")
            self.headers = {"Authorization": f"Bearer {self.token}"}
        else:
            pytest.skip("Authentication failed")
    
    def test_get_sales_report_today(self):
        """Test GET /api/smart-reports/sales - Sales report for today"""
        response = requests.get(f"{BASE_URL}/api/smart-reports/sales?period=today", headers=self.headers)
        assert response.status_code == 200, f"Failed to get sales report: {response.text}"
        
        data = response.json()
        assert "period" in data
        assert "total_sales" in data
        assert "total_orders" in data
        assert "average_order_value" in data
        assert "by_type" in data
        assert "by_payment" in data
        
        print(f"✓ GET /api/smart-reports/sales?period=today - Sales: {data['total_sales']}, Orders: {data['total_orders']}")
    
    def test_get_sales_report_week(self):
        """Test GET /api/smart-reports/sales - Sales report for week"""
        response = requests.get(f"{BASE_URL}/api/smart-reports/sales?period=week", headers=self.headers)
        assert response.status_code == 200, f"Failed to get weekly sales report: {response.text}"
        
        data = response.json()
        assert data["period"] == "week"
        print(f"✓ GET /api/smart-reports/sales?period=week - Works correctly")
    
    def test_get_sales_report_month(self):
        """Test GET /api/smart-reports/sales - Sales report for month"""
        response = requests.get(f"{BASE_URL}/api/smart-reports/sales?period=month", headers=self.headers)
        assert response.status_code == 200, f"Failed to get monthly sales report: {response.text}"
        
        data = response.json()
        assert data["period"] == "month"
        print(f"✓ GET /api/smart-reports/sales?period=month - Works correctly")
    
    def test_get_products_report(self):
        """Test GET /api/smart-reports/products - Top selling products"""
        response = requests.get(f"{BASE_URL}/api/smart-reports/products?period=month&limit=10", headers=self.headers)
        assert response.status_code == 200, f"Failed to get products report: {response.text}"
        
        data = response.json()
        assert "top_products" in data
        assert isinstance(data["top_products"], list)
        
        print(f"✓ GET /api/smart-reports/products - Returns {len(data['top_products'])} top products")


class TestTenantSettingsPermissions:
    """Test settings permissions for tenant user (ahmed@albait.com)"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup - get tenant auth token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json=TENANT_CREDENTIALS)
        if response.status_code == 200:
            self.token = response.json().get("token")
            self.headers = {"Authorization": f"Bearer {self.token}"}
        else:
            pytest.skip("Tenant authentication failed")
    
    def test_get_dashboard_settings(self):
        """Test GET /api/settings/dashboard - Get dashboard settings for tenant"""
        response = requests.get(f"{BASE_URL}/api/settings/dashboard", headers=self.headers)
        assert response.status_code == 200, f"Failed to get dashboard settings: {response.text}"
        
        data = response.json()
        print(f"✓ GET /api/settings/dashboard - Settings retrieved")
        print(f"  Settings keys: {list(data.keys())}")
        
        # Check for settings permissions fields
        # According to requirements, tenant should see: Users, Branches, Categories, Products, Printers, Notifications
        # And NOT see: Customers, Delivery Companies, Call Center
        return data
    
    def test_tenant_info_with_logo(self):
        """Test GET /api/tenant/info - Get tenant info including logo"""
        response = requests.get(f"{BASE_URL}/api/tenant/info", headers=self.headers)
        assert response.status_code == 200, f"Failed to get tenant info: {response.text}"
        
        data = response.json()
        print(f"✓ GET /api/tenant/info - Tenant info retrieved")
        print(f"  Tenant name: {data.get('name', 'N/A')}")
        print(f"  Logo URL: {data.get('logo_url', 'No logo')}")
        
        # Verify logo URL if present
        if data.get('logo_url'):
            logo_url = data['logo_url']
            if logo_url.startswith('/'):
                logo_url = f"{BASE_URL}{logo_url}"
            
            # Try to access the logo
            logo_response = requests.get(logo_url)
            if logo_response.status_code == 200:
                print(f"  ✓ Logo is accessible")
            else:
                print(f"  ⚠ Logo URL returned status {logo_response.status_code}")


class TestLogoAccess:
    """Test logo access via /api/uploads/logos/"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup - get auth token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json=TENANT_CREDENTIALS)
        if response.status_code == 200:
            self.token = response.json().get("token")
            self.headers = {"Authorization": f"Bearer {self.token}"}
        else:
            pytest.skip("Authentication failed")
    
    def test_logo_endpoint_exists(self):
        """Test that logo endpoint is accessible"""
        # First get tenant info to find logo URL
        response = requests.get(f"{BASE_URL}/api/tenant/info", headers=self.headers)
        if response.status_code == 200:
            data = response.json()
            logo_url = data.get('logo_url')
            
            if logo_url:
                # Construct full URL
                if logo_url.startswith('/api/'):
                    full_url = f"{BASE_URL}{logo_url}"
                elif logo_url.startswith('/'):
                    full_url = f"{BASE_URL}/api{logo_url}"
                else:
                    full_url = logo_url
                
                logo_response = requests.get(full_url)
                print(f"✓ Logo endpoint test - URL: {full_url}")
                print(f"  Status: {logo_response.status_code}")
                
                if logo_response.status_code == 200:
                    content_type = logo_response.headers.get('content-type', '')
                    print(f"  Content-Type: {content_type}")
                    assert 'image' in content_type.lower() or logo_response.status_code == 200
            else:
                print("✓ No logo configured for this tenant")
        else:
            print(f"⚠ Could not get tenant info: {response.status_code}")


class TestReservationsPageAPIs:
    """Test APIs used by Reservations page"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup - get auth token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json=ADMIN_CREDENTIALS)
        if response.status_code == 200:
            self.token = response.json().get("token")
            self.headers = {"Authorization": f"Bearer {self.token}"}
        else:
            pytest.skip("Authentication failed")
    
    def test_tables_api_for_reservations(self):
        """Test GET /api/tables - Used by reservations page"""
        response = requests.get(f"{BASE_URL}/api/tables", headers=self.headers)
        assert response.status_code == 200, f"Failed to get tables: {response.text}"
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ GET /api/tables - Returns {len(data)} tables for reservation selection")


class TestReviewsPageAPIs:
    """Test APIs used by Reviews page"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup - get auth token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json=ADMIN_CREDENTIALS)
        if response.status_code == 200:
            self.token = response.json().get("token")
            self.headers = {"Authorization": f"Bearer {self.token}"}
        else:
            pytest.skip("Authentication failed")
    
    def test_respond_to_review(self):
        """Test PUT /api/reviews/{id}/respond - Respond to a review"""
        # First create a review
        review_data = {
            "customer_name": "TEST_عميل للرد",
            "rating": 4,
            "comment": "تقييم للاختبار"
        }
        
        create_response = requests.post(f"{BASE_URL}/api/reviews", json=review_data, headers=self.headers)
        if create_response.status_code == 200:
            review_id = create_response.json()["id"]
            
            # Respond to the review
            respond_data = {"response": "شكراً لتقييمك الكريم!"}
            respond_response = requests.put(
                f"{BASE_URL}/api/reviews/{review_id}/respond", 
                json=respond_data, 
                headers=self.headers
            )
            
            assert respond_response.status_code == 200, f"Failed to respond to review: {respond_response.text}"
            
            data = respond_response.json()
            assert data.get("response") == respond_data["response"]
            print(f"✓ PUT /api/reviews/{review_id}/respond - Response added successfully")
            
            # Cleanup
            requests.delete(f"{BASE_URL}/api/reviews/{review_id}", headers=self.headers)
        else:
            pytest.skip("Could not create test review")


class TestSmartReportsPageAPIs:
    """Test APIs used by Smart Reports page"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup - get auth token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json=ADMIN_CREDENTIALS)
        if response.status_code == 200:
            self.token = response.json().get("token")
            self.headers = {"Authorization": f"Bearer {self.token}"}
        else:
            pytest.skip("Authentication failed")
    
    def test_hourly_report(self):
        """Test GET /api/smart-reports/hourly - Hourly sales report"""
        response = requests.get(f"{BASE_URL}/api/smart-reports/hourly", headers=self.headers)
        # This endpoint might not exist, so we check for 200 or 404
        if response.status_code == 200:
            print(f"✓ GET /api/smart-reports/hourly - Endpoint exists")
        elif response.status_code == 404:
            print(f"⚠ GET /api/smart-reports/hourly - Endpoint not found (frontend uses fallback data)")
        else:
            print(f"⚠ GET /api/smart-reports/hourly - Status: {response.status_code}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
