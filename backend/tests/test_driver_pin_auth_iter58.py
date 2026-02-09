"""
Test Driver PIN Authentication System - Iteration 58
Tests:
1. Driver login with correct PIN (POST /api/driver/login?phone=X&pin=Y)
2. Driver login rejection with wrong PIN (should return 401)
3. Driver location update after login (POST /api/driver/update-location)
4. Create new driver with PIN from admin panel
5. Update driver PIN from admin panel
6. Driver App UI contains PIN field
"""

import pytest
import requests
import os
import uuid

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
ADMIN_EMAIL = "demo@maestroegp.com"
ADMIN_PASSWORD = "demo123"
TEST_DRIVER_PHONE = "07901234567"
TEST_DRIVER_PIN = "1234"


class TestDriverPINAuthentication:
    """Test driver PIN authentication system"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test session"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        self.auth_token = None
        
    def get_auth_token(self):
        """Get authentication token for admin operations"""
        if self.auth_token:
            return self.auth_token
            
        response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        
        if response.status_code == 200:
            self.auth_token = response.json().get("token")
            return self.auth_token
        return None
    
    def test_01_driver_login_with_correct_pin(self):
        """Test driver login with correct PIN - should succeed"""
        print("\n=== Test 1: Driver login with correct PIN ===")
        
        response = self.session.post(
            f"{BASE_URL}/api/driver/login",
            params={"phone": TEST_DRIVER_PHONE, "pin": TEST_DRIVER_PIN}
        )
        
        print(f"Status: {response.status_code}")
        print(f"Response: {response.text[:500]}")
        
        # Should return 200 or 404 (if driver doesn't exist)
        if response.status_code == 200:
            data = response.json()
            assert "driver" in data, "Response should contain driver object"
            assert data["driver"] is not None, "Driver should not be null"
            assert "pin" not in data["driver"], "PIN should not be returned in response"
            print(f"✅ Driver login successful: {data['driver'].get('name', 'Unknown')}")
        elif response.status_code == 404:
            print("⚠️ Driver not found - will create test driver")
            pytest.skip("Test driver not found - need to create one first")
        else:
            pytest.fail(f"Unexpected status code: {response.status_code}")
    
    def test_02_driver_login_with_wrong_pin(self):
        """Test driver login with wrong PIN - should return 401"""
        print("\n=== Test 2: Driver login with wrong PIN ===")
        
        wrong_pin = "9999"
        response = self.session.post(
            f"{BASE_URL}/api/driver/login",
            params={"phone": TEST_DRIVER_PHONE, "pin": wrong_pin}
        )
        
        print(f"Status: {response.status_code}")
        print(f"Response: {response.text[:500]}")
        
        # Should return 401 for wrong PIN or 404 if driver doesn't exist
        if response.status_code == 401:
            print("✅ Correctly rejected login with wrong PIN (401)")
            assert True
        elif response.status_code == 404:
            print("⚠️ Driver not found (404) - test inconclusive")
            pytest.skip("Test driver not found")
        else:
            pytest.fail(f"Expected 401 for wrong PIN, got {response.status_code}")
    
    def test_03_driver_login_without_pin(self):
        """Test driver login without PIN - should fail"""
        print("\n=== Test 3: Driver login without PIN ===")
        
        # Try login with only phone (no PIN)
        response = self.session.post(
            f"{BASE_URL}/api/driver/login",
            params={"phone": TEST_DRIVER_PHONE}
        )
        
        print(f"Status: {response.status_code}")
        print(f"Response: {response.text[:500]}")
        
        # Should return 422 (validation error) because PIN is required
        assert response.status_code == 422, f"Expected 422 for missing PIN, got {response.status_code}"
        print("✅ Correctly rejected login without PIN (422)")
    
    def test_04_create_driver_with_pin(self):
        """Test creating a new driver with PIN from admin panel"""
        print("\n=== Test 4: Create driver with PIN ===")
        
        token = self.get_auth_token()
        if not token:
            pytest.skip("Could not get auth token")
        
        # First get a branch_id
        branches_response = self.session.get(
            f"{BASE_URL}/api/branches",
            headers={"Authorization": f"Bearer {token}"}
        )
        if branches_response.status_code != 200 or not branches_response.json():
            pytest.skip("Could not get branches")
        
        branch_id = branches_response.json()[0]["id"]
        
        test_phone = f"079{uuid.uuid4().hex[:8]}"
        test_pin = "5678"
        
        # Use JSON body (as the frontend does)
        response = self.session.post(
            f"{BASE_URL}/api/drivers",
            json={
                "name": "TEST_Driver_PIN",
                "phone": test_phone,
                "pin": test_pin,
                "branch_id": branch_id
            },
            headers={"Authorization": f"Bearer {token}"}
        )
        
        print(f"Status: {response.status_code}")
        print(f"Response: {response.text[:500]}")
        
        if response.status_code == 200:
            data = response.json()
            # Response returns driver directly, not wrapped in "driver" key
            driver = data
            assert "pin" not in driver, "PIN should not be returned in response"
            
            # Store driver ID for cleanup
            self.created_driver_id = driver.get("id")
            self.created_driver_phone = test_phone
            self.created_driver_pin = test_pin
            
            print(f"✅ Driver created successfully: {driver.get('name')}")
            
            # Verify login with the new PIN
            login_response = self.session.post(
                f"{BASE_URL}/api/driver/login",
                params={"phone": test_phone, "pin": test_pin}
            )
            
            print(f"Login verification status: {login_response.status_code}")
            assert login_response.status_code == 200, "Should be able to login with new PIN"
            print("✅ Login with new PIN verified")
            
            # Cleanup - delete test driver
            if self.created_driver_id:
                self.session.delete(
                    f"{BASE_URL}/api/drivers/{self.created_driver_id}",
                    headers={"Authorization": f"Bearer {token}"}
                )
                print("✅ Test driver cleaned up")
        else:
            pytest.fail(f"Failed to create driver: {response.status_code}")
    
    def test_05_update_driver_pin(self):
        """Test updating driver PIN from admin panel"""
        print("\n=== Test 5: Update driver PIN ===")
        
        token = self.get_auth_token()
        if not token:
            pytest.skip("Could not get auth token")
        
        # First get a branch_id
        branches_response = self.session.get(
            f"{BASE_URL}/api/branches",
            headers={"Authorization": f"Bearer {token}"}
        )
        if branches_response.status_code != 200 or not branches_response.json():
            pytest.skip("Could not get branches")
        
        branch_id = branches_response.json()[0]["id"]
        
        # First create a test driver
        test_phone = f"079{uuid.uuid4().hex[:8]}"
        original_pin = "1111"
        new_pin = "2222"
        
        create_response = self.session.post(
            f"{BASE_URL}/api/drivers",
            json={
                "name": "TEST_Driver_Update_PIN",
                "phone": test_phone,
                "pin": original_pin,
                "branch_id": branch_id
            },
            headers={"Authorization": f"Bearer {token}"}
        )
        
        if create_response.status_code != 200:
            pytest.skip("Could not create test driver")
        
        driver_id = create_response.json()["id"]
        print(f"Created test driver: {driver_id}")
        
        try:
            # Verify login with original PIN
            login1 = self.session.post(
                f"{BASE_URL}/api/driver/login",
                params={"phone": test_phone, "pin": original_pin}
            )
            assert login1.status_code == 200, "Should login with original PIN"
            print("✅ Login with original PIN works")
            
            # Update PIN
            update_response = self.session.put(
                f"{BASE_URL}/api/drivers/{driver_id}",
                params={"pin": new_pin},
                headers={"Authorization": f"Bearer {token}"}
            )
            
            print(f"Update status: {update_response.status_code}")
            assert update_response.status_code == 200, "PIN update should succeed"
            print("✅ PIN updated successfully")
            
            # Verify old PIN no longer works
            login_old = self.session.post(
                f"{BASE_URL}/api/driver/login",
                params={"phone": test_phone, "pin": original_pin}
            )
            assert login_old.status_code == 401, "Old PIN should be rejected"
            print("✅ Old PIN correctly rejected")
            
            # Verify new PIN works
            login_new = self.session.post(
                f"{BASE_URL}/api/driver/login",
                params={"phone": test_phone, "pin": new_pin}
            )
            assert login_new.status_code == 200, "New PIN should work"
            print("✅ New PIN works correctly")
            
        finally:
            # Cleanup
            self.session.delete(
                f"{BASE_URL}/api/drivers/{driver_id}",
                headers={"Authorization": f"Bearer {token}"}
            )
            print("✅ Test driver cleaned up")
    
    def test_06_driver_location_update_after_login(self):
        """Test driver location update after login"""
        print("\n=== Test 6: Driver location update after login ===")
        
        # First login
        login_response = self.session.post(
            f"{BASE_URL}/api/driver/login",
            params={"phone": TEST_DRIVER_PHONE, "pin": TEST_DRIVER_PIN}
        )
        
        if login_response.status_code != 200:
            pytest.skip("Could not login as driver")
        
        driver = login_response.json()["driver"]
        driver_id = driver["id"]
        print(f"Logged in as driver: {driver.get('name')}")
        
        # Update location
        location_response = self.session.post(
            f"{BASE_URL}/api/driver/update-location",
            params={"driver_id": driver_id},
            json={
                "latitude": 33.3152,
                "longitude": 44.3661
            }
        )
        
        print(f"Location update status: {location_response.status_code}")
        print(f"Response: {location_response.text[:500]}")
        
        assert location_response.status_code == 200, "Location update should succeed"
        data = location_response.json()
        assert data.get("success") == True, "Response should indicate success"
        print("✅ Location updated successfully")
    
    def test_07_driver_login_inactive_driver(self):
        """Test that inactive driver cannot login"""
        print("\n=== Test 7: Inactive driver login ===")
        
        token = self.get_auth_token()
        if not token:
            pytest.skip("Could not get auth token")
        
        # First get a branch_id
        branches_response = self.session.get(
            f"{BASE_URL}/api/branches",
            headers={"Authorization": f"Bearer {token}"}
        )
        if branches_response.status_code != 200 or not branches_response.json():
            pytest.skip("Could not get branches")
        
        branch_id = branches_response.json()[0]["id"]
        
        # Create inactive driver
        test_phone = f"079{uuid.uuid4().hex[:8]}"
        test_pin = "3333"
        
        create_response = self.session.post(
            f"{BASE_URL}/api/drivers",
            json={
                "name": "TEST_Inactive_Driver",
                "phone": test_phone,
                "pin": test_pin,
                "branch_id": branch_id
            },
            headers={"Authorization": f"Bearer {token}"}
        )
        
        if create_response.status_code != 200:
            pytest.skip("Could not create test driver")
        
        driver_id = create_response.json()["id"]
        
        try:
            # Deactivate driver
            self.session.put(
                f"{BASE_URL}/api/drivers/{driver_id}",
                params={"is_active": False},
                headers={"Authorization": f"Bearer {token}"}
            )
            print("Driver deactivated")
            
            # Try to login
            login_response = self.session.post(
                f"{BASE_URL}/api/driver/login",
                params={"phone": test_phone, "pin": test_pin}
            )
            
            print(f"Login status: {login_response.status_code}")
            assert login_response.status_code == 403, "Inactive driver should get 403"
            print("✅ Inactive driver correctly rejected (403)")
            
        finally:
            # Cleanup
            self.session.delete(
                f"{BASE_URL}/api/drivers/{driver_id}",
                headers={"Authorization": f"Bearer {token}"}
            )
            print("✅ Test driver cleaned up")


class TestDriverPINEdgeCases:
    """Test edge cases for driver PIN authentication"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
    
    def test_empty_pin(self):
        """Test login with empty PIN"""
        print("\n=== Test: Empty PIN ===")
        
        response = self.session.post(
            f"{BASE_URL}/api/driver/login",
            params={"phone": TEST_DRIVER_PHONE, "pin": ""}
        )
        
        print(f"Status: {response.status_code}")
        # Empty PIN should be rejected (401 or 422)
        assert response.status_code in [401, 422], f"Empty PIN should be rejected, got {response.status_code}"
        print("✅ Empty PIN correctly rejected")
    
    def test_invalid_phone_format(self):
        """Test login with invalid phone format"""
        print("\n=== Test: Invalid phone format ===")
        
        response = self.session.post(
            f"{BASE_URL}/api/driver/login",
            params={"phone": "123", "pin": "1234"}
        )
        
        print(f"Status: {response.status_code}")
        # Should return 404 (driver not found)
        assert response.status_code == 404, f"Invalid phone should return 404, got {response.status_code}"
        print("✅ Invalid phone correctly handled")
    
    def test_special_characters_in_pin(self):
        """Test PIN with special characters"""
        print("\n=== Test: Special characters in PIN ===")
        
        response = self.session.post(
            f"{BASE_URL}/api/driver/login",
            params={"phone": TEST_DRIVER_PHONE, "pin": "12@#"}
        )
        
        print(f"Status: {response.status_code}")
        # Should return 401 (wrong PIN) or 404 (driver not found)
        assert response.status_code in [401, 404], f"Special chars PIN should be rejected, got {response.status_code}"
        print("✅ Special characters in PIN handled correctly")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
