"""
Iteration 17 - Payment Settings & Notifications APIs Testing
Tests for:
1. Payment Settings APIs (GET/POST /api/payment-settings)
2. Notifications APIs (sound-alert, pending-orders, mark-seen)
3. ZainCash QR upload
"""

import pytest
import requests
import os
import time

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://dine-control-12.preview.emergentagent.com')

class TestPaymentSettingsAPI:
    """Payment Settings API Tests"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup - Login as admin"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        # Login as admin
        login_res = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "admin@maestroegp.com",
            "password": "admin123"
        })
        
        if login_res.status_code == 200:
            token = login_res.json().get("token")
            self.session.headers.update({"Authorization": f"Bearer {token}"})
            self.logged_in = True
        else:
            self.logged_in = False
            pytest.skip("Authentication failed - skipping tests")
    
    def test_get_payment_settings(self):
        """Test GET /api/payment-settings - Fetch payment settings"""
        response = self.session.get(f"{BASE_URL}/api/payment-settings")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        
        # Verify response is a dict
        assert isinstance(data, dict), "Response should be a dictionary"
        
        # Verify tenant_id exists (always present)
        assert "tenant_id" in data, "Missing tenant_id field"
        
        # Verify stripe_secret_key is hidden (should not be in response or be None)
        assert "stripe_secret_key" not in data or data.get("stripe_secret_key") is None, \
            "stripe_secret_key should be hidden"
        
        # stripe_secret_key_set should indicate if key is set
        assert "stripe_secret_key_set" in data, "Missing stripe_secret_key_set field"
        
        print(f"✅ GET /api/payment-settings - Success. Fields: {list(data.keys())}")
    
    def test_update_stripe_settings(self):
        """Test POST /api/payment-settings - Update Stripe settings"""
        payload = {
            "stripe_enabled": True,
            "stripe_publishable_key": "pk_test_example123",
            "stripe_secret_key": "sk_test_example456",
            "stripe_currency": "USD",
            "stripe_mode": "test"
        }
        
        response = self.session.post(f"{BASE_URL}/api/payment-settings", json=payload)
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert data.get("success") == True, "Expected success=True"
        
        # Verify settings were saved
        get_response = self.session.get(f"{BASE_URL}/api/payment-settings")
        assert get_response.status_code == 200
        
        settings = get_response.json()
        assert settings.get("stripe_enabled") == True
        assert settings.get("stripe_publishable_key") == "pk_test_example123"
        assert settings.get("stripe_currency") == "USD"
        assert settings.get("stripe_mode") == "test"
        
        print("✅ POST /api/payment-settings (Stripe) - Success")
    
    def test_update_zaincash_settings(self):
        """Test POST /api/payment-settings - Update ZainCash settings"""
        payload = {
            "zaincash_enabled": True,
            "zaincash_phone": "07701234567",
            "zaincash_name": "Test Restaurant"
        }
        
        response = self.session.post(f"{BASE_URL}/api/payment-settings", json=payload)
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert data.get("success") == True, "Expected success=True"
        
        # Verify settings were saved
        get_response = self.session.get(f"{BASE_URL}/api/payment-settings")
        assert get_response.status_code == 200
        
        settings = get_response.json()
        assert settings.get("zaincash_enabled") == True
        assert settings.get("zaincash_phone") == "07701234567"
        assert settings.get("zaincash_name") == "Test Restaurant"
        
        print("✅ POST /api/payment-settings (ZainCash) - Success")
    
    def test_update_delivery_settings(self):
        """Test POST /api/payment-settings - Update delivery fee settings"""
        payload = {
            "delivery_fee": 7500,
            "min_order_amount": 15000
        }
        
        response = self.session.post(f"{BASE_URL}/api/payment-settings", json=payload)
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert data.get("success") == True, "Expected success=True"
        
        # Verify settings were saved
        get_response = self.session.get(f"{BASE_URL}/api/payment-settings")
        assert get_response.status_code == 200
        
        settings = get_response.json()
        assert settings.get("delivery_fee") == 7500
        assert settings.get("min_order_amount") == 15000
        
        print("✅ POST /api/payment-settings (Delivery) - Success")
    
    def test_payment_settings_unauthorized(self):
        """Test payment settings without auth"""
        session = requests.Session()
        session.headers.update({"Content-Type": "application/json"})
        
        # Try to get settings without auth
        response = session.get(f"{BASE_URL}/api/payment-settings")
        
        # Should require authentication
        assert response.status_code in [401, 403], \
            f"Expected 401/403 for unauthorized access, got {response.status_code}"
        
        print("✅ Payment settings requires authentication")


class TestNotificationsAPI:
    """Notifications API Tests"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup - Login as admin"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        # Login as admin
        login_res = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "admin@maestroegp.com",
            "password": "admin123"
        })
        
        if login_res.status_code == 200:
            token = login_res.json().get("token")
            self.session.headers.update({"Authorization": f"Bearer {token}"})
            self.logged_in = True
        else:
            self.logged_in = False
            pytest.skip("Authentication failed - skipping tests")
    
    def test_sound_alert_api(self):
        """Test GET /api/notifications/sound-alert"""
        response = self.session.get(f"{BASE_URL}/api/notifications/sound-alert")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        
        # Verify expected fields
        assert "has_new_orders" in data, "Missing has_new_orders field"
        assert "new_orders_count" in data, "Missing new_orders_count field"
        assert "check_time" in data, "Missing check_time field"
        
        # Verify types
        assert isinstance(data["has_new_orders"], bool), "has_new_orders should be boolean"
        assert isinstance(data["new_orders_count"], int), "new_orders_count should be integer"
        
        print(f"✅ GET /api/notifications/sound-alert - Success. New orders: {data['new_orders_count']}")
    
    def test_sound_alert_with_last_check(self):
        """Test GET /api/notifications/sound-alert with last_check parameter"""
        # First call to get check_time
        first_response = self.session.get(f"{BASE_URL}/api/notifications/sound-alert")
        assert first_response.status_code == 200
        
        check_time = first_response.json().get("check_time")
        
        # Second call with last_check
        response = self.session.get(
            f"{BASE_URL}/api/notifications/sound-alert",
            params={"last_check": check_time}
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        assert "has_new_orders" in data
        assert "new_orders_count" in data
        
        print("✅ GET /api/notifications/sound-alert with last_check - Success")
    
    def test_sound_alert_with_branch_id(self):
        """Test GET /api/notifications/sound-alert with branch_id filter"""
        # Get branches first
        branches_res = self.session.get(f"{BASE_URL}/api/branches")
        
        if branches_res.status_code == 200 and branches_res.json():
            branch_id = branches_res.json()[0].get("id")
            
            response = self.session.get(
                f"{BASE_URL}/api/notifications/sound-alert",
                params={"branch_id": branch_id}
            )
            
            assert response.status_code == 200, f"Expected 200, got {response.status_code}"
            
            data = response.json()
            assert "has_new_orders" in data
            
            print(f"✅ GET /api/notifications/sound-alert with branch_id - Success")
        else:
            print("⚠️ No branches found, skipping branch filter test")
    
    def test_pending_orders_api(self):
        """Test GET /api/notifications/pending-orders"""
        response = self.session.get(f"{BASE_URL}/api/notifications/pending-orders")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        
        # Verify expected fields
        assert "orders" in data, "Missing orders field"
        assert "new_count" in data, "Missing new_count field"
        assert "total_count" in data, "Missing total_count field"
        
        # Verify types
        assert isinstance(data["orders"], list), "orders should be a list"
        assert isinstance(data["new_count"], int), "new_count should be integer"
        assert isinstance(data["total_count"], int), "total_count should be integer"
        
        print(f"✅ GET /api/notifications/pending-orders - Success. Total: {data['total_count']}, New: {data['new_count']}")
    
    def test_pending_orders_with_branch_filter(self):
        """Test GET /api/notifications/pending-orders with branch_id"""
        # Get branches first
        branches_res = self.session.get(f"{BASE_URL}/api/branches")
        
        if branches_res.status_code == 200 and branches_res.json():
            branch_id = branches_res.json()[0].get("id")
            
            response = self.session.get(
                f"{BASE_URL}/api/notifications/pending-orders",
                params={"branch_id": branch_id}
            )
            
            assert response.status_code == 200, f"Expected 200, got {response.status_code}"
            
            data = response.json()
            assert "orders" in data
            assert "new_count" in data
            
            print(f"✅ GET /api/notifications/pending-orders with branch_id - Success")
        else:
            print("⚠️ No branches found, skipping branch filter test")
    
    def test_mark_orders_as_seen(self):
        """Test POST /api/notifications/mark-seen"""
        # Test with sample order IDs
        test_order_ids = ["test-order-1", "test-order-2", "test-order-3"]
        
        response = self.session.post(
            f"{BASE_URL}/api/notifications/mark-seen",
            json=test_order_ids
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert data.get("success") == True, "Expected success=True"
        assert data.get("marked_count") == len(test_order_ids), \
            f"Expected marked_count={len(test_order_ids)}, got {data.get('marked_count')}"
        
        print(f"✅ POST /api/notifications/mark-seen - Success. Marked: {data['marked_count']}")
    
    def test_mark_seen_empty_list(self):
        """Test POST /api/notifications/mark-seen with empty list"""
        response = self.session.post(
            f"{BASE_URL}/api/notifications/mark-seen",
            json=[]
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        assert data.get("success") == True
        assert data.get("marked_count") == 0
        
        print("✅ POST /api/notifications/mark-seen (empty list) - Success")


class TestNotificationsUnauthorized:
    """Test notifications APIs without authentication"""
    
    def test_sound_alert_unauthorized(self):
        """Test sound-alert without auth"""
        session = requests.Session()
        response = session.get(f"{BASE_URL}/api/notifications/sound-alert")
        
        assert response.status_code in [401, 403], \
            f"Expected 401/403 for unauthorized, got {response.status_code}"
        
        print("✅ sound-alert requires authentication")
    
    def test_pending_orders_unauthorized(self):
        """Test pending-orders without auth"""
        session = requests.Session()
        response = session.get(f"{BASE_URL}/api/notifications/pending-orders")
        
        assert response.status_code in [401, 403], \
            f"Expected 401/403 for unauthorized, got {response.status_code}"
        
        print("✅ pending-orders requires authentication")
    
    def test_mark_seen_unauthorized(self):
        """Test mark-seen without auth"""
        session = requests.Session()
        session.headers.update({"Content-Type": "application/json"})
        response = session.post(
            f"{BASE_URL}/api/notifications/mark-seen",
            json=["test-id"]
        )
        
        assert response.status_code in [401, 403], \
            f"Expected 401/403 for unauthorized, got {response.status_code}"
        
        print("✅ mark-seen requires authentication")


class TestHealthCheck:
    """Basic health check tests"""
    
    def test_api_health(self):
        """Test API health endpoint"""
        response = requests.get(f"{BASE_URL}/api/health")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        assert data.get("status") == "ok"
        
        print("✅ API health check - OK")
    
    def test_root_endpoint(self):
        """Test root endpoint"""
        response = requests.get(f"{BASE_URL}/")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        print("✅ Root endpoint - OK")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
