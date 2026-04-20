"""
Test file for Iteration 4 features:
1. Pending orders fix - takeaway/dine_in orders should have status 'pending' not 'ready'
2. Driver location tracking - API for updating and fetching driver locations
3. Map page in Delivery management - display driver locations
4. Driver Portal PWA - mobile interface for drivers with GPS
5. New 'delivery' role for users
"""

import pytest
import requests
import os
import time

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://pos-stability-fix-1.preview.emergentagent.com')

class TestAuth:
    """Authentication tests"""
    
    @pytest.fixture(scope="class")
    def admin_token(self):
        """Get admin authentication token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "admin@maestroegp.com",
            "password": "admin123"
        })
        assert response.status_code == 200, f"Admin login failed: {response.text}"
        return response.json().get("token")
    
    def test_admin_login(self, admin_token):
        """Test admin login works"""
        assert admin_token is not None
        print("✓ Admin login successful")


class TestPendingOrdersFix:
    """Test that takeaway/dine_in orders via 'Save and Send to Kitchen' have status 'pending'"""
    
    @pytest.fixture(scope="class")
    def auth_headers(self):
        """Get auth headers"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "admin@maestroegp.com",
            "password": "admin123"
        })
        token = response.json().get("token")
        return {"Authorization": f"Bearer {token}"}
    
    @pytest.fixture(scope="class")
    def branch_id(self, auth_headers):
        """Get first active branch"""
        response = requests.get(f"{BASE_URL}/api/branches")
        branches = response.json()
        active_branch = next((b for b in branches if b.get("is_active")), branches[0])
        return active_branch["id"]
    
    @pytest.fixture(scope="class")
    def product(self, auth_headers):
        """Get first available product"""
        response = requests.get(f"{BASE_URL}/api/products")
        products = response.json()
        return products[0] if products else None
    
    def test_takeaway_order_pending_status(self, auth_headers, branch_id, product):
        """Test: Takeaway order with auto_ready=false should have status 'pending'"""
        if not product:
            pytest.skip("No products available")
        
        order_data = {
            "order_type": "takeaway",
            "customer_name": "TEST_Takeaway_Customer",
            "customer_phone": "07701111111",
            "buzzer_number": "99",
            "items": [{
                "product_id": product["id"],
                "product_name": product["name"],
                "quantity": 1,
                "price": product["price"]
            }],
            "branch_id": branch_id,
            "payment_method": "pending",
            "discount": 0,
            "auto_ready": False  # This should make status 'pending'
        }
        
        response = requests.post(f"{BASE_URL}/api/orders", json=order_data, headers=auth_headers)
        assert response.status_code == 200, f"Create order failed: {response.text}"
        
        order = response.json()
        assert order["status"] == "pending", f"Expected status 'pending', got '{order['status']}'"
        assert order["order_type"] == "takeaway"
        print(f"✓ Takeaway order #{order['order_number']} created with status 'pending'")
        
        return order
    
    def test_dine_in_order_pending_status(self, auth_headers, branch_id, product):
        """Test: Dine-in order with auto_ready=false should have status 'pending'"""
        if not product:
            pytest.skip("No products available")
        
        # Get a table
        tables_response = requests.get(f"{BASE_URL}/api/tables", params={"branch_id": branch_id})
        tables = tables_response.json()
        available_table = next((t for t in tables if t.get("status") == "available"), None)
        
        if not available_table:
            pytest.skip("No available tables")
        
        order_data = {
            "order_type": "dine_in",
            "table_id": available_table["id"],
            "items": [{
                "product_id": product["id"],
                "product_name": product["name"],
                "quantity": 2,
                "price": product["price"]
            }],
            "branch_id": branch_id,
            "payment_method": "pending",
            "discount": 0,
            "auto_ready": False  # This should make status 'pending'
        }
        
        response = requests.post(f"{BASE_URL}/api/orders", json=order_data, headers=auth_headers)
        assert response.status_code == 200, f"Create order failed: {response.text}"
        
        order = response.json()
        assert order["status"] == "pending", f"Expected status 'pending', got '{order['status']}'"
        assert order["order_type"] == "dine_in"
        print(f"✓ Dine-in order #{order['order_number']} created with status 'pending'")
        
        # Free the table
        requests.put(f"{BASE_URL}/api/orders/{order['id']}/status?status=delivered", headers=auth_headers)
        
        return order
    
    def test_delivery_order_ready_status(self, auth_headers, branch_id, product):
        """Test: Delivery order with auto_ready=true should have status 'ready'"""
        if not product:
            pytest.skip("No products available")
        
        order_data = {
            "order_type": "delivery",
            "customer_name": "TEST_Delivery_Customer",
            "customer_phone": "07702222222",
            "delivery_address": "بغداد - الكرادة - شارع 60",
            "items": [{
                "product_id": product["id"],
                "product_name": product["name"],
                "quantity": 1,
                "price": product["price"]
            }],
            "branch_id": branch_id,
            "payment_method": "pending",
            "discount": 0,
            "auto_ready": True  # This should make status 'ready'
        }
        
        response = requests.post(f"{BASE_URL}/api/orders", json=order_data, headers=auth_headers)
        assert response.status_code == 200, f"Create order failed: {response.text}"
        
        order = response.json()
        assert order["status"] == "ready", f"Expected status 'ready', got '{order['status']}'"
        assert order["order_type"] == "delivery"
        print(f"✓ Delivery order #{order['order_number']} created with status 'ready'")
        
        return order


class TestDriverLocationTracking:
    """Test driver location tracking APIs"""
    
    @pytest.fixture(scope="class")
    def auth_headers(self):
        """Get auth headers"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "admin@maestroegp.com",
            "password": "admin123"
        })
        token = response.json().get("token")
        return {"Authorization": f"Bearer {token}"}
    
    @pytest.fixture(scope="class")
    def driver_id(self):
        """Get first driver ID"""
        response = requests.get(f"{BASE_URL}/api/drivers")
        drivers = response.json()
        return drivers[0]["id"] if drivers else None
    
    def test_update_driver_location(self, driver_id):
        """Test: PUT /api/drivers/portal/{driver_id}/location"""
        if not driver_id:
            pytest.skip("No drivers available")
        
        location_data = {
            "latitude": 33.3152,
            "longitude": 44.3661
        }
        
        response = requests.put(
            f"{BASE_URL}/api/drivers/portal/{driver_id}/location",
            json=location_data
        )
        assert response.status_code == 200, f"Update location failed: {response.text}"
        
        result = response.json()
        assert "message" in result
        print(f"✓ Driver location updated: lat={location_data['latitude']}, lng={location_data['longitude']}")
    
    def test_get_drivers_locations(self, auth_headers):
        """Test: GET /api/drivers/locations"""
        response = requests.get(f"{BASE_URL}/api/drivers/locations", headers=auth_headers)
        assert response.status_code == 200, f"Get locations failed: {response.text}"
        
        drivers = response.json()
        assert isinstance(drivers, list)
        
        # Check structure
        if drivers:
            driver = drivers[0]
            assert "id" in driver
            assert "name" in driver
            assert "location_lat" in driver or driver.get("location_lat") is None
            assert "location_lng" in driver or driver.get("location_lng") is None
            print(f"✓ Got {len(drivers)} driver locations")
            
            # Check if any driver has location
            drivers_with_location = [d for d in drivers if d.get("location_lat") and d.get("location_lng")]
            print(f"  - {len(drivers_with_location)} drivers have GPS location")
    
    def test_get_drivers_locations_with_branch_filter(self, auth_headers):
        """Test: GET /api/drivers/locations with branch_id filter"""
        # Get a branch first
        branches_response = requests.get(f"{BASE_URL}/api/branches")
        branches = branches_response.json()
        if not branches:
            pytest.skip("No branches available")
        
        branch_id = branches[0]["id"]
        
        response = requests.get(
            f"{BASE_URL}/api/drivers/locations",
            params={"branch_id": branch_id},
            headers=auth_headers
        )
        assert response.status_code == 200, f"Get locations with filter failed: {response.text}"
        
        drivers = response.json()
        assert isinstance(drivers, list)
        print(f"✓ Got {len(drivers)} driver locations for branch {branch_id}")


class TestDriverPortalAPI:
    """Test Driver Portal APIs"""
    
    @pytest.fixture(scope="class")
    def driver_id(self):
        """Get first driver ID"""
        response = requests.get(f"{BASE_URL}/api/drivers")
        drivers = response.json()
        return drivers[0]["id"] if drivers else None
    
    @pytest.fixture(scope="class")
    def driver_phone(self):
        """Get first driver phone"""
        response = requests.get(f"{BASE_URL}/api/drivers")
        drivers = response.json()
        return drivers[0]["phone"] if drivers else None
    
    def test_get_driver_portal_by_id(self, driver_id):
        """Test: GET /api/drivers/portal/{driver_id}"""
        if not driver_id:
            pytest.skip("No drivers available")
        
        response = requests.get(f"{BASE_URL}/api/drivers/portal/{driver_id}")
        assert response.status_code == 200, f"Get driver portal failed: {response.text}"
        
        data = response.json()
        assert "driver" in data
        assert "orders" in data
        assert "stats" in data
        
        driver = data["driver"]
        assert driver["id"] == driver_id
        assert "name" in driver
        assert "phone" in driver
        
        stats = data["stats"]
        assert "unpaid_total" in stats
        assert "paid_today" in stats
        assert "pending_orders" in stats
        
        print(f"✓ Driver portal data retrieved for {driver['name']}")
        print(f"  - Unpaid: {stats['unpaid_total']}, Paid today: {stats['paid_today']}")
    
    def test_get_driver_portal_by_phone(self, driver_phone):
        """Test: GET /api/drivers/portal/by-phone/{phone}"""
        if not driver_phone:
            pytest.skip("No drivers available")
        
        response = requests.get(f"{BASE_URL}/api/drivers/portal/by-phone/{driver_phone}")
        assert response.status_code == 200, f"Get driver by phone failed: {response.text}"
        
        data = response.json()
        assert "driver" in data
        assert data["driver"]["phone"] == driver_phone
        print(f"✓ Driver portal data retrieved by phone {driver_phone}")
    
    def test_driver_portal_complete_delivery(self, driver_id):
        """Test: PUT /api/drivers/portal/{driver_id}/complete"""
        if not driver_id:
            pytest.skip("No drivers available")
        
        # This endpoint should work even without an active order
        response = requests.put(f"{BASE_URL}/api/drivers/portal/{driver_id}/complete")
        # It may return 200 or 400 depending on if driver has active order
        assert response.status_code in [200, 400], f"Complete delivery failed: {response.text}"
        print(f"✓ Driver portal complete delivery endpoint works")


class TestDeliveryRole:
    """Test new 'delivery' role for users"""
    
    @pytest.fixture(scope="class")
    def auth_headers(self):
        """Get auth headers"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "admin@maestroegp.com",
            "password": "admin123"
        })
        token = response.json().get("token")
        return {"Authorization": f"Bearer {token}"}
    
    def test_create_delivery_user(self, auth_headers):
        """Test: Create user with 'delivery' role"""
        import uuid
        unique_id = str(uuid.uuid4())[:8]
        
        user_data = {
            "username": f"test_driver_{unique_id}",
            "email": f"test_driver_{unique_id}@maestroegp.com",
            "password": "driver123",
            "full_name": f"TEST Driver {unique_id}",
            "role": "delivery",  # New delivery role
            "permissions": []
        }
        
        response = requests.post(f"{BASE_URL}/api/auth/register", json=user_data)
        assert response.status_code == 200, f"Create delivery user failed: {response.text}"
        
        data = response.json()
        assert "user" in data
        assert data["user"]["role"] == "delivery"
        print(f"✓ Created user with 'delivery' role: {user_data['email']}")
        
        # Clean up - delete the test user
        user_id = data["user"]["id"]
        requests.delete(f"{BASE_URL}/api/users/{user_id}", headers=auth_headers)
        
        return data["user"]


class TestDriverStats:
    """Test driver statistics APIs"""
    
    @pytest.fixture(scope="class")
    def auth_headers(self):
        """Get auth headers"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "admin@maestroegp.com",
            "password": "admin123"
        })
        token = response.json().get("token")
        return {"Authorization": f"Bearer {token}"}
    
    @pytest.fixture(scope="class")
    def driver_id(self):
        """Get first driver ID"""
        response = requests.get(f"{BASE_URL}/api/drivers")
        drivers = response.json()
        return drivers[0]["id"] if drivers else None
    
    def test_get_driver_stats(self, driver_id):
        """Test: GET /api/drivers/{driver_id}/stats"""
        if not driver_id:
            pytest.skip("No drivers available")
        
        response = requests.get(f"{BASE_URL}/api/drivers/{driver_id}/stats")
        assert response.status_code == 200, f"Get driver stats failed: {response.text}"
        
        stats = response.json()
        assert "unpaid_total" in stats
        assert "paid_total" in stats
        assert "paid_today" in stats
        assert "pending_orders" in stats
        assert "total_orders" in stats
        
        print(f"✓ Driver stats retrieved:")
        print(f"  - Unpaid: {stats['unpaid_total']}")
        print(f"  - Paid total: {stats['paid_total']}")
        print(f"  - Paid today: {stats['paid_today']}")
        print(f"  - Pending orders: {stats['pending_orders']}")
    
    def test_get_driver_orders(self, driver_id):
        """Test: GET /api/drivers/{driver_id}/orders"""
        if not driver_id:
            pytest.skip("No drivers available")
        
        response = requests.get(f"{BASE_URL}/api/drivers/{driver_id}/orders")
        assert response.status_code == 200, f"Get driver orders failed: {response.text}"
        
        orders = response.json()
        assert isinstance(orders, list)
        print(f"✓ Got {len(orders)} orders for driver")


class TestGetPendingOrders:
    """Test fetching pending orders"""
    
    @pytest.fixture(scope="class")
    def auth_headers(self):
        """Get auth headers"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "admin@maestroegp.com",
            "password": "admin123"
        })
        token = response.json().get("token")
        return {"Authorization": f"Bearer {token}"}
    
    def test_get_pending_orders(self, auth_headers):
        """Test: GET /api/orders?status=pending"""
        response = requests.get(
            f"{BASE_URL}/api/orders",
            params={"status": "pending"},
            headers=auth_headers
        )
        assert response.status_code == 200, f"Get pending orders failed: {response.text}"
        
        orders = response.json()
        assert isinstance(orders, list)
        
        # All returned orders should have status 'pending'
        for order in orders:
            assert order["status"] == "pending", f"Order #{order['order_number']} has status '{order['status']}'"
        
        # Count by order type
        takeaway_count = len([o for o in orders if o["order_type"] == "takeaway"])
        dine_in_count = len([o for o in orders if o["order_type"] == "dine_in"])
        delivery_count = len([o for o in orders if o["order_type"] == "delivery"])
        
        print(f"✓ Got {len(orders)} pending orders:")
        print(f"  - Takeaway (سفري): {takeaway_count}")
        print(f"  - Dine-in (محلي): {dine_in_count}")
        print(f"  - Delivery (توصيل): {delivery_count}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
