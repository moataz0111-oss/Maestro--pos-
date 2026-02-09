"""
Test Driver App APIs and Push Notifications - Iteration 58
Tests:
1. Driver login via phone number
2. Driver orders list
3. Driver location update (POST /api/driver/update-location)
4. Get driver info for order (GET /api/driver/order-driver-info/{order_id})
5. Order status update (PUT /api/orders/{order_id}/status)
6. Push notification subscribe (POST /api/push/subscribe)
"""

import pytest
import requests
import os
import uuid

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestDriverLogin:
    """Test driver login via phone number"""
    
    def test_driver_login_valid_phone(self):
        """Test driver login with valid phone number"""
        # First, let's check if there are any drivers in the system
        response = requests.get(f"{BASE_URL}/api/driver/login", params={"phone": "07901234567"})
        assert response.status_code == 200
        data = response.json()
        # Should return driver object or null
        assert "driver" in data or "message" in data
        print(f"Driver login response: {data}")
    
    def test_driver_login_invalid_phone(self):
        """Test driver login with invalid phone number"""
        response = requests.get(f"{BASE_URL}/api/driver/login", params={"phone": "00000000000"})
        assert response.status_code == 200
        data = response.json()
        # Should return null driver for invalid phone
        assert data.get("driver") is None or "message" in data
        print(f"Invalid phone response: {data}")
    
    def test_driver_login_empty_phone(self):
        """Test driver login with empty phone"""
        response = requests.get(f"{BASE_URL}/api/driver/login", params={"phone": ""})
        assert response.status_code == 200
        data = response.json()
        assert data.get("driver") is None
        print(f"Empty phone response: {data}")


class TestDriverOrders:
    """Test driver orders API"""
    
    def test_get_driver_orders_valid_id(self):
        """Test getting orders for a valid driver ID"""
        # Use a random UUID as driver_id
        driver_id = str(uuid.uuid4())
        response = requests.get(f"{BASE_URL}/api/driver/orders", params={"driver_id": driver_id})
        assert response.status_code == 200
        data = response.json()
        # Should return a list (possibly empty)
        assert isinstance(data, list)
        print(f"Driver orders count: {len(data)}")
    
    def test_get_driver_orders_empty_id(self):
        """Test getting orders with empty driver ID"""
        response = requests.get(f"{BASE_URL}/api/driver/orders", params={"driver_id": ""})
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"Empty driver_id orders: {len(data)}")


class TestDriverLocationUpdate:
    """Test driver location update API (POST /api/driver/update-location)"""
    
    def test_update_location_invalid_driver(self):
        """Test updating location for non-existent driver"""
        driver_id = str(uuid.uuid4())
        response = requests.post(
            f"{BASE_URL}/api/driver/update-location",
            params={"driver_id": driver_id},
            json={"latitude": 33.3152, "longitude": 44.3661}
        )
        # Should return 404 for non-existent driver
        assert response.status_code == 404
        print(f"Invalid driver location update: {response.json()}")
    
    def test_update_location_valid_format(self):
        """Test location update with valid format (even if driver doesn't exist)"""
        driver_id = str(uuid.uuid4())
        response = requests.post(
            f"{BASE_URL}/api/driver/update-location",
            params={"driver_id": driver_id},
            json={"latitude": 33.3152, "longitude": 44.3661}
        )
        # Either 404 (driver not found) or 200 (success)
        assert response.status_code in [200, 404]
        print(f"Location update response: {response.status_code}")


class TestDriverInfoForOrder:
    """Test GET /api/driver/order-driver-info/{order_id}"""
    
    def test_get_driver_info_invalid_order(self):
        """Test getting driver info for non-existent order"""
        order_id = str(uuid.uuid4())
        response = requests.get(f"{BASE_URL}/api/driver/order-driver-info/{order_id}")
        assert response.status_code == 404
        print(f"Invalid order driver info: {response.json()}")
    
    def test_get_driver_info_endpoint_exists(self):
        """Test that the endpoint exists and responds"""
        order_id = "test-order-id"
        response = requests.get(f"{BASE_URL}/api/driver/order-driver-info/{order_id}")
        # Should return 404 for invalid order, not 405 (method not allowed)
        assert response.status_code in [200, 404]
        print(f"Driver info endpoint status: {response.status_code}")


class TestOrderStatusUpdate:
    """Test PUT /api/orders/{order_id}/status - requires authentication"""
    
    def test_update_status_requires_auth(self):
        """Test that order status update requires authentication"""
        order_id = str(uuid.uuid4())
        response = requests.put(
            f"{BASE_URL}/api/orders/{order_id}/status",
            params={"status": "delivered"}
        )
        # Should return 403 (forbidden) without authentication
        assert response.status_code == 403
        print(f"Order status update requires auth: {response.status_code}")
    
    def test_update_status_with_auth(self):
        """Test order status update with authentication"""
        # First login to get token
        login_response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": "demo@maestroegp.com", "password": "demo123"}
        )
        
        if login_response.status_code != 200:
            pytest.skip("Could not login with demo credentials")
        
        token = login_response.json().get("token")
        headers = {"Authorization": f"Bearer {token}"}
        
        # Try to update a non-existent order
        order_id = str(uuid.uuid4())
        response = requests.put(
            f"{BASE_URL}/api/orders/{order_id}/status",
            params={"status": "delivered"},
            headers=headers
        )
        # Should return 404 (order not found) with valid auth
        assert response.status_code == 404
        print(f"Authenticated order status update: {response.status_code}")
    
    def test_endpoint_exists(self):
        """Test that the endpoint exists"""
        order_id = str(uuid.uuid4())
        response = requests.put(
            f"{BASE_URL}/api/orders/{order_id}/status",
            params={"status": "delivered"}
        )
        # Should not return 405 (method not allowed)
        assert response.status_code != 405
        print(f"Order status endpoint exists: {response.status_code}")


class TestPushNotifications:
    """Test Push Notification APIs"""
    
    def test_push_subscribe(self):
        """Test subscribing to push notifications"""
        subscription_data = {
            "endpoint": f"https://test-push-endpoint.com/{uuid.uuid4()}",
            "keys": {
                "p256dh": "test-p256dh-key",
                "auth": "test-auth-key"
            },
            "phone": "07901234567",
            "user_type": "driver"
        }
        
        response = requests.post(f"{BASE_URL}/api/push/subscribe", json=subscription_data)
        assert response.status_code == 200
        data = response.json()
        assert "message" in data
        print(f"Push subscribe response: {data}")
    
    def test_push_subscribe_customer(self):
        """Test subscribing as customer"""
        subscription_data = {
            "endpoint": f"https://test-push-endpoint.com/{uuid.uuid4()}",
            "keys": {
                "p256dh": "test-p256dh-key-customer",
                "auth": "test-auth-key-customer"
            },
            "phone": "01012345678",
            "user_type": "customer"
        }
        
        response = requests.post(f"{BASE_URL}/api/push/subscribe", json=subscription_data)
        assert response.status_code == 200
        print(f"Customer push subscribe: {response.json()}")
    
    def test_push_unsubscribe(self):
        """Test unsubscribing from push notifications"""
        # First subscribe
        endpoint = f"https://test-push-endpoint.com/{uuid.uuid4()}"
        subscription_data = {
            "endpoint": endpoint,
            "keys": {"p256dh": "test", "auth": "test"},
            "phone": "07901234567",
            "user_type": "driver"
        }
        requests.post(f"{BASE_URL}/api/push/subscribe", json=subscription_data)
        
        # Then unsubscribe
        response = requests.delete(f"{BASE_URL}/api/push/unsubscribe", params={"endpoint": endpoint})
        assert response.status_code == 200
        data = response.json()
        assert "message" in data
        print(f"Push unsubscribe response: {data}")


class TestCustomerOrderDriverInfo:
    """Test GET /api/customer/order-driver/{order_id}"""
    
    def test_customer_get_driver_info_invalid_order(self):
        """Test customer getting driver info for invalid order"""
        order_id = str(uuid.uuid4())
        response = requests.get(
            f"{BASE_URL}/api/customer/order-driver/{order_id}",
            params={"phone": "01012345678"}
        )
        assert response.status_code == 404
        print(f"Customer driver info (invalid order): {response.json()}")
    
    def test_customer_endpoint_exists(self):
        """Test that customer driver endpoint exists"""
        order_id = "test-order"
        response = requests.get(f"{BASE_URL}/api/customer/order-driver/{order_id}")
        # Should return 404 (not found) not 405 (method not allowed)
        assert response.status_code in [200, 403, 404]
        print(f"Customer driver endpoint status: {response.status_code}")


class TestHealthAndBasicAPIs:
    """Test basic health and API endpoints"""
    
    def test_health_check(self):
        """Test health endpoint"""
        response = requests.get(f"{BASE_URL}/api/health")
        assert response.status_code == 200
        print(f"Health check: {response.json()}")
    
    def test_root_endpoint(self):
        """Test root endpoint returns HTML (frontend)"""
        response = requests.get(f"{BASE_URL}/")
        assert response.status_code == 200
        # Root returns HTML, not JSON
        assert "html" in response.text.lower()
        print(f"Root endpoint returns HTML: {response.status_code}")


class TestIntegrationFlow:
    """Test complete driver flow integration"""
    
    def test_driver_login_and_orders_flow(self):
        """Test driver login followed by orders fetch"""
        # Step 1: Login with test phone
        login_response = requests.get(
            f"{BASE_URL}/api/driver/login",
            params={"phone": "07901234567"}
        )
        assert login_response.status_code == 200
        login_data = login_response.json()
        
        if login_data.get("driver"):
            driver_id = login_data["driver"]["id"]
            print(f"Driver logged in: {login_data['driver'].get('name')}")
            
            # Step 2: Fetch orders
            orders_response = requests.get(
                f"{BASE_URL}/api/driver/orders",
                params={"driver_id": driver_id}
            )
            assert orders_response.status_code == 200
            orders = orders_response.json()
            print(f"Driver has {len(orders)} orders")
            
            # Step 3: Test location update
            location_response = requests.post(
                f"{BASE_URL}/api/driver/update-location",
                params={"driver_id": driver_id},
                json={"latitude": 33.3152, "longitude": 44.3661}
            )
            assert location_response.status_code == 200
            print(f"Location updated: {location_response.json()}")
        else:
            print("No driver found with test phone - skipping flow test")
            pytest.skip("Test driver not found")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
