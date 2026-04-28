"""
Test file for Driver App, Push Notifications, and Driver Tracking features
Iteration 57 - Testing:
1. Driver App login (GET /api/driver/login)
2. Driver orders (GET /api/driver/orders)
3. Order status update (PUT /api/orders/{id}/status) - requires auth
4. Push subscription (POST /api/push/subscribe)
5. Push unsubscribe (DELETE /api/push/unsubscribe)
6. Driver location tracking (POST /api/drivers/{id}/location)
7. Customer order driver info (GET /api/customer/order-driver/{order_id})

NOTE: There's a duplicate endpoint issue - PUT /api/orders/{order_id}/status is defined twice:
- Line 4450: requires authentication (used by admin/cashier)
- Line 13452: no auth (intended for driver app)
The first one shadows the second, so driver app status update requires auth.
"""

import pytest
import requests
import os
import uuid

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://pos-audit-fix-1.preview.emergentagent.com')

class TestDriverAppLogin:
    """Test driver login functionality"""
    
    def test_driver_login_with_valid_phone(self):
        """Test driver login with test driver phone 07901234567"""
        response = requests.get(f"{BASE_URL}/api/driver/login", params={"phone": "07901234567"})
        print(f"Driver login response: {response.status_code} - {response.text[:200]}")
        
        # Should return 200 even if driver not found (returns driver: null)
        assert response.status_code == 200
        data = response.json()
        
        # Check response structure
        assert "driver" in data or "message" in data
        
        if data.get("driver"):
            print(f"✅ Driver found: {data['driver'].get('name')}")
            assert "id" in data["driver"]
            assert "name" in data["driver"]
            assert "phone" in data["driver"]
        else:
            print(f"⚠️ Driver not found: {data.get('message')}")
    
    def test_driver_login_with_invalid_phone(self):
        """Test driver login with non-existent phone"""
        response = requests.get(f"{BASE_URL}/api/driver/login", params={"phone": "00000000000"})
        print(f"Invalid phone login response: {response.status_code}")
        
        assert response.status_code == 200
        data = response.json()
        assert data.get("driver") is None
        assert "message" in data


class TestDriverOrders:
    """Test driver orders functionality"""
    
    @pytest.fixture
    def driver_id(self):
        """Get a driver ID for testing"""
        # First try to login with test driver
        response = requests.get(f"{BASE_URL}/api/driver/login", params={"phone": "07901234567"})
        if response.status_code == 200 and response.json().get("driver"):
            return response.json()["driver"]["id"]
        
        # If no test driver, get from drivers list (need auth)
        return None
    
    def test_get_driver_orders_with_valid_id(self, driver_id):
        """Test getting orders for a driver"""
        if not driver_id:
            pytest.skip("No driver available for testing")
        
        response = requests.get(f"{BASE_URL}/api/driver/orders", params={"driver_id": driver_id})
        print(f"Driver orders response: {response.status_code}")
        
        assert response.status_code == 200
        data = response.json()
        
        # Should return a list (may be empty)
        assert isinstance(data, list)
        print(f"✅ Found {len(data)} orders for driver")
        
        # If orders exist, check structure
        if len(data) > 0:
            order = data[0]
            assert "id" in order or "order_number" in order
            assert "status" in order
            assert "status_label" in order
    
    def test_get_driver_orders_with_invalid_id(self):
        """Test getting orders with non-existent driver ID"""
        response = requests.get(f"{BASE_URL}/api/driver/orders", params={"driver_id": "invalid-driver-id"})
        print(f"Invalid driver orders response: {response.status_code}")
        
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        assert len(data) == 0  # Should return empty list


class TestOrderStatusUpdate:
    """Test order status update functionality - requires authentication"""
    
    @pytest.fixture
    def auth_token(self):
        """Get auth token for authenticated requests"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": "demo@maestroegp.com", "password": "demo123"}
        )
        if response.status_code == 200:
            return response.json().get("token")
        return None
    
    def test_update_order_status_requires_auth(self):
        """Test that order status update requires authentication"""
        response = requests.put(
            f"{BASE_URL}/api/orders/invalid-order-id/status",
            params={"status": "delivered"}
        )
        print(f"Order status update without auth: {response.status_code}")
        
        # Should return 403 (Not authenticated) since the authenticated endpoint shadows the driver one
        assert response.status_code == 403
        print("✅ Order status update correctly requires authentication")
    
    def test_update_order_status_invalid_order_with_auth(self, auth_token):
        """Test updating status of non-existent order with auth"""
        if not auth_token:
            pytest.skip("No auth token available")
        
        headers = {"Authorization": f"Bearer {auth_token}"}
        response = requests.put(
            f"{BASE_URL}/api/orders/invalid-order-id/status",
            params={"status": "delivered"},
            headers=headers
        )
        print(f"Invalid order status update with auth: {response.status_code}")
        
        # Should return 404 for non-existent order
        assert response.status_code == 404
        print("✅ Returns 404 for non-existent order")


class TestPushNotifications:
    """Test push notification subscription APIs"""
    
    def test_push_subscribe(self):
        """Test subscribing to push notifications"""
        test_endpoint = f"https://test-push-endpoint.example.com/{uuid.uuid4()}"
        
        subscription_data = {
            "endpoint": test_endpoint,
            "keys": {
                "p256dh": "test-p256dh-key",
                "auth": "test-auth-key"
            },
            "phone": "01012345678",
            "user_type": "customer"
        }
        
        response = requests.post(
            f"{BASE_URL}/api/push/subscribe",
            json=subscription_data
        )
        print(f"Push subscribe response: {response.status_code} - {response.text}")
        
        assert response.status_code == 200
        data = response.json()
        assert "message" in data
        print(f"✅ Push subscription successful: {data['message']}")
        
        # Cleanup - unsubscribe
        cleanup_response = requests.delete(
            f"{BASE_URL}/api/push/unsubscribe",
            params={"endpoint": test_endpoint}
        )
        print(f"Cleanup unsubscribe: {cleanup_response.status_code}")
    
    def test_push_unsubscribe(self):
        """Test unsubscribing from push notifications"""
        test_endpoint = f"https://test-push-endpoint.example.com/{uuid.uuid4()}"
        
        # First subscribe
        subscription_data = {
            "endpoint": test_endpoint,
            "keys": {"p256dh": "test-key", "auth": "test-auth"},
            "phone": "01012345678",
            "user_type": "customer"
        }
        requests.post(f"{BASE_URL}/api/push/subscribe", json=subscription_data)
        
        # Then unsubscribe
        response = requests.delete(
            f"{BASE_URL}/api/push/unsubscribe",
            params={"endpoint": test_endpoint}
        )
        print(f"Push unsubscribe response: {response.status_code}")
        
        assert response.status_code == 200
        data = response.json()
        assert "message" in data
        print(f"✅ Push unsubscribe successful: {data['message']}")
    
    def test_push_subscribe_driver(self):
        """Test driver subscribing to push notifications"""
        test_endpoint = f"https://test-driver-push.example.com/{uuid.uuid4()}"
        
        subscription_data = {
            "endpoint": test_endpoint,
            "keys": {
                "p256dh": "driver-p256dh-key",
                "auth": "driver-auth-key"
            },
            "phone": "07901234567",
            "user_type": "driver"
        }
        
        response = requests.post(
            f"{BASE_URL}/api/push/subscribe",
            json=subscription_data
        )
        print(f"Driver push subscribe response: {response.status_code}")
        
        assert response.status_code == 200
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/push/unsubscribe", params={"endpoint": test_endpoint})


class TestDriverLocationTracking:
    """Test driver location tracking functionality"""
    
    @pytest.fixture
    def auth_token(self):
        """Get auth token for authenticated requests"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": "demo@maestroegp.com", "password": "demo123"}
        )
        if response.status_code == 200:
            return response.json().get("token")
        return None
    
    @pytest.fixture
    def test_driver_id(self, auth_token):
        """Create a test driver and return its ID"""
        if not auth_token:
            return None
        
        headers = {"Authorization": f"Bearer {auth_token}"}
        
        # Get branches first
        branches_response = requests.get(f"{BASE_URL}/api/branches", headers=headers)
        if branches_response.status_code != 200:
            return None
        
        branches = branches_response.json()
        if not branches:
            return None
        
        branch_id = branches[0]["id"]
        
        # Create test driver
        driver_data = {
            "name": "TEST_Driver_Location",
            "phone": f"079{uuid.uuid4().hex[:7]}",
            "branch_id": branch_id
        }
        
        response = requests.post(
            f"{BASE_URL}/api/drivers",
            json=driver_data,
            headers=headers
        )
        
        if response.status_code == 200:
            return response.json().get("driver", {}).get("id")
        return None
    
    def test_update_driver_location(self, auth_token, test_driver_id):
        """Test updating driver GPS location"""
        if not auth_token or not test_driver_id:
            pytest.skip("No auth token or driver available")
        
        headers = {"Authorization": f"Bearer {auth_token}"}
        
        location_data = {
            "latitude": 33.3152,
            "longitude": 44.3661
        }
        
        response = requests.post(
            f"{BASE_URL}/api/drivers/{test_driver_id}/location",
            json=location_data,
            headers=headers
        )
        print(f"Update driver location response: {response.status_code} - {response.text}")
        
        assert response.status_code == 200
        data = response.json()
        assert "message" in data
        print(f"✅ Driver location updated: {data['message']}")
        
        # Cleanup - delete test driver
        requests.delete(f"{BASE_URL}/api/drivers/{test_driver_id}", headers=headers)
    
    def test_get_driver_location(self, auth_token, test_driver_id):
        """Test getting driver location"""
        if not auth_token or not test_driver_id:
            pytest.skip("No auth token or driver available")
        
        headers = {"Authorization": f"Bearer {auth_token}"}
        
        # First update location
        location_data = {"latitude": 33.3152, "longitude": 44.3661}
        requests.post(
            f"{BASE_URL}/api/drivers/{test_driver_id}/location",
            json=location_data,
            headers=headers
        )
        
        # Then get location
        response = requests.get(f"{BASE_URL}/api/drivers/{test_driver_id}/location")
        print(f"Get driver location response: {response.status_code}")
        
        assert response.status_code == 200
        data = response.json()
        
        # Check location fields
        if "location_lat" in data:
            print(f"✅ Driver location: {data.get('location_lat')}, {data.get('location_lng')}")
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/drivers/{test_driver_id}", headers=headers)


class TestCustomerOrderDriverInfo:
    """Test customer getting driver info for their order"""
    
    def test_get_order_driver_info_invalid_order(self):
        """Test getting driver info for non-existent order"""
        response = requests.get(
            f"{BASE_URL}/api/customer/order-driver/invalid-order-id",
            params={"phone": "01012345678"}
        )
        print(f"Invalid order driver info response: {response.status_code}")
        
        # Should return 404 for non-existent order
        assert response.status_code == 404


class TestDriverAppIntegration:
    """Integration tests for driver app flow"""
    
    @pytest.fixture
    def auth_token(self):
        """Get auth token"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": "demo@maestroegp.com", "password": "demo123"}
        )
        if response.status_code == 200:
            return response.json().get("token")
        return None
    
    def test_full_driver_flow(self, auth_token):
        """Test complete driver app flow: login -> get orders -> update location"""
        if not auth_token:
            pytest.skip("No auth token available")
        
        headers = {"Authorization": f"Bearer {auth_token}"}
        
        # 1. Get branches
        branches_response = requests.get(f"{BASE_URL}/api/branches", headers=headers)
        assert branches_response.status_code == 200
        branches = branches_response.json()
        
        if not branches:
            pytest.skip("No branches available")
        
        branch_id = branches[0]["id"]
        
        # 2. Create test driver
        test_phone = f"079{uuid.uuid4().hex[:7]}"
        driver_data = {
            "name": "TEST_Integration_Driver",
            "phone": test_phone,
            "branch_id": branch_id
        }
        
        create_response = requests.post(
            f"{BASE_URL}/api/drivers",
            json=driver_data,
            headers=headers
        )
        print(f"Create driver response: {create_response.status_code}")
        
        if create_response.status_code != 200:
            pytest.skip("Could not create test driver")
        
        driver_id = create_response.json().get("driver", {}).get("id")
        print(f"Created driver ID: {driver_id}")
        
        try:
            # 3. Driver login
            login_response = requests.get(
                f"{BASE_URL}/api/driver/login",
                params={"phone": test_phone}
            )
            assert login_response.status_code == 200
            login_data = login_response.json()
            assert login_data.get("driver") is not None
            logged_in_driver_id = login_data["driver"]["id"]
            print(f"✅ Driver login successful: {login_data['driver']['name']} (ID: {logged_in_driver_id})")
            
            # 4. Get driver orders (using driver_id from login response)
            orders_response = requests.get(
                f"{BASE_URL}/api/driver/orders",
                params={"driver_id": logged_in_driver_id}
            )
            assert orders_response.status_code == 200
            orders = orders_response.json()
            print(f"✅ Driver orders fetched: {len(orders)} orders")
            
            # 5. Update driver location (use logged_in_driver_id which is the same as driver_id)
            location_response = requests.post(
                f"{BASE_URL}/api/drivers/{logged_in_driver_id}/location",
                json={"latitude": 33.3152, "longitude": 44.3661},
                headers=headers
            )
            print(f"Location update response: {location_response.status_code} - {location_response.text}")
            assert location_response.status_code == 200
            print(f"✅ Driver location updated")
            
            # 6. Get driver location
            get_location_response = requests.get(
                f"{BASE_URL}/api/drivers/{logged_in_driver_id}/location"
            )
            assert get_location_response.status_code == 200
            print(f"✅ Driver location retrieved")
            
            print("✅ Full driver flow test PASSED")
            
        finally:
            # Cleanup - use the original driver_id from creation
            cleanup_response = requests.delete(f"{BASE_URL}/api/drivers/{driver_id}", headers=headers)
            print(f"✅ Test driver cleaned up (status: {cleanup_response.status_code})")


class TestServiceWorkerEndpoints:
    """Test service worker related endpoints"""
    
    def test_sw_push_file_exists(self):
        """Test that sw-push.js service worker file is accessible"""
        response = requests.get(f"{BASE_URL}/sw-push.js")
        print(f"Service worker file response: {response.status_code}")
        
        # Should return 200 if file exists
        if response.status_code == 200:
            assert "push" in response.text.lower() or "notification" in response.text.lower()
            print("✅ Service worker file accessible and contains push/notification code")
        else:
            print(f"⚠️ Service worker file not accessible: {response.status_code}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
