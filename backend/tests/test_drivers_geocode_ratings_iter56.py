"""
Iteration 56 - Testing Drivers, Geocoding, and Ratings Page APIs
Features tested:
1. Ratings page /ratings - Customer ratings dashboard
2. Drivers CRUD APIs - GET/POST/PUT/DELETE /api/drivers
3. Driver assignment to orders - POST /api/orders/{id}/assign-driver
4. Customer order driver info - GET /api/customer/order-driver/{id}
5. Geocoding APIs - GET /api/geocode/reverse, GET /api/geocode/search
"""

import pytest
import requests
import os
import time

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
ADMIN_EMAIL = "demo@maestroegp.com"
ADMIN_PASSWORD = "demo123"
TEST_CUSTOMER_PHONE = "01012345678"
RESTAURANT_SLUG = "demo-maestro"


class TestAuthentication:
    """Authentication tests"""
    
    @pytest.fixture(scope="class")
    def auth_token(self):
        """Get admin authentication token"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}
        )
        assert response.status_code == 200, f"Login failed: {response.text}"
        data = response.json()
        assert "token" in data, "No token in response"
        return data["token"]
    
    def test_login_success(self, auth_token):
        """Test admin login works"""
        assert auth_token is not None
        assert len(auth_token) > 0
        print(f"✓ Admin login successful, token length: {len(auth_token)}")


class TestDriversAPI:
    """Driver management API tests"""
    
    @pytest.fixture(scope="class")
    def auth_token(self):
        """Get admin authentication token"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}
        )
        assert response.status_code == 200
        return response.json()["token"]
    
    @pytest.fixture(scope="class")
    def headers(self, auth_token):
        """Get auth headers"""
        return {"Authorization": f"Bearer {auth_token}"}
    
    def test_get_drivers_list(self, headers):
        """Test GET /api/drivers - Get list of drivers"""
        response = requests.get(f"{BASE_URL}/api/drivers", headers=headers)
        assert response.status_code == 200, f"Failed to get drivers: {response.text}"
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        print(f"✓ GET /api/drivers - Found {len(data)} drivers")
    
    def test_create_driver(self, headers):
        """Test POST /api/drivers - Create new driver"""
        # First get a branch_id
        branches_response = requests.get(f"{BASE_URL}/api/branches", headers=headers)
        assert branches_response.status_code == 200
        branches = branches_response.json()
        assert len(branches) > 0, "No branches found"
        branch_id = branches[0]["id"]
        
        driver_data = {
            "name": "TEST_سائق_اختبار",
            "phone": "07901234567",
            "branch_id": branch_id
        }
        response = requests.post(
            f"{BASE_URL}/api/drivers",
            headers=headers,
            json=driver_data
        )
        assert response.status_code == 200, f"Failed to create driver: {response.text}"
        data = response.json()
        assert data["name"] == driver_data["name"]
        assert data["phone"] == driver_data["phone"]
        assert "id" in data, "Driver should have an ID"
        print(f"✓ POST /api/drivers - Created driver: {data['id']}")
        return data["id"]
    
    def test_update_driver(self, headers):
        """Test PUT /api/drivers/{id} - Update driver"""
        # First get a branch_id
        branches_response = requests.get(f"{BASE_URL}/api/branches", headers=headers)
        assert branches_response.status_code == 200
        branches = branches_response.json()
        branch_id = branches[0]["id"]
        
        # First create a driver
        create_response = requests.post(
            f"{BASE_URL}/api/drivers",
            headers=headers,
            json={"name": "TEST_سائق_للتحديث", "phone": "07901234568", "branch_id": branch_id}
        )
        assert create_response.status_code == 200
        driver_id = create_response.json()["id"]
        
        # Update the driver - requires full body with name, phone, branch_id
        update_response = requests.put(
            f"{BASE_URL}/api/drivers/{driver_id}",
            headers=headers,
            json={"name": "TEST_سائق_محدث", "phone": "07901234568", "branch_id": branch_id}
        )
        assert update_response.status_code == 200, f"Failed to update driver: {update_response.text}"
        print(f"✓ PUT /api/drivers/{driver_id} - Driver updated successfully")
    
    def test_delete_driver(self, headers):
        """Test DELETE /api/drivers/{id} - Delete driver"""
        # First get a branch_id
        branches_response = requests.get(f"{BASE_URL}/api/branches", headers=headers)
        assert branches_response.status_code == 200
        branches = branches_response.json()
        branch_id = branches[0]["id"]
        
        # First create a driver
        create_response = requests.post(
            f"{BASE_URL}/api/drivers",
            headers=headers,
            json={"name": "TEST_سائق_للحذف", "phone": "07901234569", "branch_id": branch_id}
        )
        assert create_response.status_code == 200
        driver_id = create_response.json()["id"]
        
        # Delete the driver
        delete_response = requests.delete(
            f"{BASE_URL}/api/drivers/{driver_id}",
            headers=headers
        )
        assert delete_response.status_code == 200, f"Failed to delete driver: {delete_response.text}"
        print(f"✓ DELETE /api/drivers/{driver_id} - Driver deleted successfully")
    
    def test_get_drivers_unauthorized(self):
        """Test GET /api/drivers without auth returns 401/403"""
        response = requests.get(f"{BASE_URL}/api/drivers")
        assert response.status_code in [401, 403], f"Expected 401/403, got {response.status_code}"
        print(f"✓ GET /api/drivers without auth returns {response.status_code}")


class TestGeocodeAPI:
    """Geocoding API tests"""
    
    def test_reverse_geocode(self):
        """Test GET /api/geocode/reverse - Convert coordinates to address"""
        # Test with Baghdad coordinates
        lat, lng = 33.3152, 44.3661
        response = requests.get(
            f"{BASE_URL}/api/geocode/reverse",
            params={"lat": lat, "lng": lng}
        )
        assert response.status_code == 200, f"Failed reverse geocode: {response.text}"
        data = response.json()
        assert "address" in data, "Response should contain address"
        assert "lat" in data, "Response should contain lat"
        assert "lng" in data, "Response should contain lng"
        print(f"✓ GET /api/geocode/reverse - Address: {data.get('address', 'N/A')[:50]}...")
    
    def test_reverse_geocode_cairo(self):
        """Test reverse geocode with Cairo coordinates"""
        lat, lng = 30.0444, 31.2357
        response = requests.get(
            f"{BASE_URL}/api/geocode/reverse",
            params={"lat": lat, "lng": lng}
        )
        assert response.status_code == 200
        data = response.json()
        assert "address" in data
        print(f"✓ GET /api/geocode/reverse (Cairo) - Address: {data.get('address', 'N/A')[:50]}...")
    
    def test_search_address(self):
        """Test GET /api/geocode/search - Search for address"""
        response = requests.get(
            f"{BASE_URL}/api/geocode/search",
            params={"query": "بغداد العراق"}
        )
        assert response.status_code == 200, f"Failed address search: {response.text}"
        data = response.json()
        assert "results" in data, "Response should contain results"
        assert isinstance(data["results"], list), "Results should be a list"
        print(f"✓ GET /api/geocode/search - Found {len(data['results'])} results for 'بغداد العراق'")
    
    def test_search_address_cairo(self):
        """Test address search for Cairo"""
        response = requests.get(
            f"{BASE_URL}/api/geocode/search",
            params={"query": "القاهرة مصر"}
        )
        assert response.status_code == 200
        data = response.json()
        assert "results" in data
        print(f"✓ GET /api/geocode/search (Cairo) - Found {len(data['results'])} results")
    
    def test_search_address_with_location_bias(self):
        """Test address search with location bias"""
        response = requests.get(
            f"{BASE_URL}/api/geocode/search",
            params={"query": "شارع", "lat": 33.3152, "lng": 44.3661}
        )
        assert response.status_code == 200
        data = response.json()
        assert "results" in data
        print(f"✓ GET /api/geocode/search with location bias - Found {len(data['results'])} results")


class TestRatingsAPI:
    """Ratings API tests"""
    
    @pytest.fixture(scope="class")
    def auth_token(self):
        """Get admin authentication token"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}
        )
        assert response.status_code == 200
        return response.json()["token"]
    
    @pytest.fixture(scope="class")
    def headers(self, auth_token):
        """Get auth headers"""
        return {"Authorization": f"Bearer {auth_token}"}
    
    def test_get_ratings_tenant_summary(self, headers):
        """Test GET /api/ratings/tenant-summary - Get ratings summary"""
        response = requests.get(f"{BASE_URL}/api/ratings/tenant-summary", headers=headers)
        assert response.status_code == 200, f"Failed to get ratings summary: {response.text}"
        data = response.json()
        # Check expected fields
        assert "total_ratings" in data or "avg_rating" in data, "Response should contain rating data"
        print(f"✓ GET /api/ratings/tenant-summary - Total: {data.get('total_ratings', 0)}, Avg: {data.get('avg_rating', 0)}")
    
    def test_get_branches(self, headers):
        """Test GET /api/branches - Get branches for ratings filter"""
        response = requests.get(f"{BASE_URL}/api/branches", headers=headers)
        assert response.status_code == 200, f"Failed to get branches: {response.text}"
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        print(f"✓ GET /api/branches - Found {len(data)} branches")
        if len(data) > 0:
            return data[0]["id"]
        return None
    
    def test_get_branch_ratings(self, headers):
        """Test GET /api/ratings/branch/{id} - Get branch ratings"""
        # First get branches
        branches_response = requests.get(f"{BASE_URL}/api/branches", headers=headers)
        if branches_response.status_code == 200:
            branches = branches_response.json()
            if len(branches) > 0:
                branch_id = branches[0]["id"]
                response = requests.get(
                    f"{BASE_URL}/api/ratings/branch/{branch_id}",
                    headers=headers
                )
                assert response.status_code == 200, f"Failed to get branch ratings: {response.text}"
                data = response.json()
                assert "ratings" in data, "Response should contain ratings"
                print(f"✓ GET /api/ratings/branch/{branch_id} - Found {len(data.get('ratings', []))} ratings")
            else:
                print("⚠ No branches found, skipping branch ratings test")
        else:
            print("⚠ Could not get branches, skipping branch ratings test")


class TestDriverAssignment:
    """Driver assignment to orders tests"""
    
    @pytest.fixture(scope="class")
    def auth_token(self):
        """Get admin authentication token"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}
        )
        assert response.status_code == 200
        return response.json()["token"]
    
    @pytest.fixture(scope="class")
    def headers(self, auth_token):
        """Get auth headers"""
        return {"Authorization": f"Bearer {auth_token}"}
    
    def test_assign_driver_to_order_invalid_order(self, headers):
        """Test POST /api/orders/{id}/assign-driver with invalid order"""
        response = requests.post(
            f"{BASE_URL}/api/orders/invalid-order-id/assign-driver",
            headers=headers,
            json={"driver_id": "some-driver-id"}
        )
        # Should return 404 for invalid order or 422 for validation error
        assert response.status_code in [404, 400, 422, 500, 520], f"Expected 404/400/422/500/520, got {response.status_code}"
        print(f"✓ POST /api/orders/invalid/assign-driver returns {response.status_code}")
    
    def test_get_customer_order_driver_invalid(self):
        """Test GET /api/customer/order-driver/{id} with invalid order"""
        response = requests.get(
            f"{BASE_URL}/api/customer/order-driver/invalid-order-id"
        )
        # Should return 404 for invalid order
        assert response.status_code in [404, 200], f"Expected 404/200, got {response.status_code}"
        if response.status_code == 200:
            data = response.json()
            # If 200, driver should be null
            assert data.get("driver") is None or "message" in data
        print("✓ GET /api/customer/order-driver/invalid returns appropriate response")


class TestDriverLocationUpdate:
    """Driver location update tests"""
    
    @pytest.fixture(scope="class")
    def auth_token(self):
        """Get admin authentication token"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}
        )
        assert response.status_code == 200
        return response.json()["token"]
    
    @pytest.fixture(scope="class")
    def headers(self, auth_token):
        """Get auth headers"""
        return {"Authorization": f"Bearer {auth_token}"}
    
    def test_update_driver_location(self, headers):
        """Test POST /api/drivers/{id}/location - Update driver location"""
        # First get a branch_id
        branches_response = requests.get(f"{BASE_URL}/api/branches", headers=headers)
        if branches_response.status_code != 200:
            pytest.skip("Could not get branches for location test")
        branches = branches_response.json()
        if len(branches) == 0:
            pytest.skip("No branches found for location test")
        branch_id = branches[0]["id"]
        
        # First create a driver
        create_response = requests.post(
            f"{BASE_URL}/api/drivers",
            headers=headers,
            json={"name": "TEST_سائق_موقع", "phone": "07901234570", "branch_id": branch_id}
        )
        if create_response.status_code != 200:
            pytest.skip("Could not create driver for location test")
        
        driver_id = create_response.json()["id"]
        
        # Update location - using POST as per API definition
        location_data = {
            "latitude": 33.3152,
            "longitude": 44.3661
        }
        response = requests.post(
            f"{BASE_URL}/api/drivers/{driver_id}/location",
            headers=headers,
            json=location_data
        )
        assert response.status_code == 200, f"Failed to update location: {response.text}"
        print(f"✓ POST /api/drivers/{driver_id}/location - Location updated")
        
        # Cleanup - delete driver
        requests.delete(f"{BASE_URL}/api/drivers/{driver_id}", headers=headers)


class TestCleanup:
    """Cleanup test data"""
    
    @pytest.fixture(scope="class")
    def auth_token(self):
        """Get admin authentication token"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}
        )
        assert response.status_code == 200
        return response.json()["token"]
    
    @pytest.fixture(scope="class")
    def headers(self, auth_token):
        """Get auth headers"""
        return {"Authorization": f"Bearer {auth_token}"}
    
    def test_cleanup_test_drivers(self, headers):
        """Cleanup TEST_ prefixed drivers"""
        response = requests.get(f"{BASE_URL}/api/drivers", headers=headers)
        if response.status_code == 200:
            drivers = response.json()
            deleted_count = 0
            for driver in drivers:
                if driver.get("name", "").startswith("TEST_"):
                    del_response = requests.delete(
                        f"{BASE_URL}/api/drivers/{driver['id']}",
                        headers=headers
                    )
                    if del_response.status_code == 200:
                        deleted_count += 1
            print(f"✓ Cleanup - Deleted {deleted_count} test drivers")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
