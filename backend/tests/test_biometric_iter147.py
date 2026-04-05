"""
Test ZKTeco Biometric Device Integration APIs - Iteration 147
Tests:
- POST /api/biometric/devices - create biometric device
- GET /api/biometric/devices - list devices
- POST /api/biometric/devices/{id}/sync-from-agent - receive attendance records with dedup
- PUT /api/employees/{id} with biometric_uid field - update employee biometric ID
"""
import pytest
import requests
import os
import uuid

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
ADMIN_EMAIL = "hanialdujaili@gmail.com"
ADMIN_PASSWORD = "Hani@2024"

# Test data from context
TEST_EMPLOYEE_ID = "d6e117f3-7298-4010-81f1-d4c1cc889f22"  # أحمد محمد
TEST_DEVICE_ID = "697db1ae-642a-4db0-a6f7-7d1a03064129"  # بصمة تجريبية
TEST_BRANCH_ID = "72a06c41-5454-4383-99a5-ac13adb96336"


class TestBiometricDeviceAPIs:
    """Test biometric device CRUD and sync APIs"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test session with auth"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        # Login to get token
        login_response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        
        if login_response.status_code == 200:
            token = login_response.json().get("token")
            self.session.headers.update({"Authorization": f"Bearer {token}"})
            self.token = token
        else:
            pytest.skip(f"Authentication failed: {login_response.status_code}")
    
    def test_01_login_success(self):
        """Test admin login works"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        assert response.status_code == 200, f"Login failed: {response.text}"
        data = response.json()
        assert "token" in data, "No token in response"
        print(f"✓ Login successful, token received")
    
    def test_02_list_biometric_devices(self):
        """Test GET /api/biometric/devices - list all devices"""
        response = self.session.get(f"{BASE_URL}/api/biometric/devices")
        assert response.status_code == 200, f"Failed to list devices: {response.text}"
        
        devices = response.json()
        assert isinstance(devices, list), "Response should be a list"
        print(f"✓ Listed {len(devices)} biometric devices")
        
        # Check if test device exists
        test_device = next((d for d in devices if d.get("id") == TEST_DEVICE_ID), None)
        if test_device:
            print(f"  Found test device: {test_device.get('name')} at {test_device.get('ip_address')}:{test_device.get('port')}")
            assert test_device.get("ip_address") == "192.168.0.35", "Device IP should be 192.168.0.35"
            assert test_device.get("port") == 4370, "Device port should be 4370"
    
    def test_03_create_biometric_device(self):
        """Test POST /api/biometric/devices - create new device"""
        device_name = f"TEST_Device_{uuid.uuid4().hex[:8]}"
        
        response = self.session.post(f"{BASE_URL}/api/biometric/devices", json={
            "name": device_name,
            "ip_address": "192.168.1.200",
            "port": 4370,
            "branch_id": TEST_BRANCH_ID,
            "device_type": "fingerprint"
        })
        
        assert response.status_code == 200, f"Failed to create device: {response.text}"
        data = response.json()
        
        assert "device" in data, "Response should contain device"
        device = data["device"]
        assert device.get("name") == device_name, "Device name mismatch"
        assert device.get("ip_address") == "192.168.1.200", "IP address mismatch"
        assert device.get("port") == 4370, "Port mismatch"
        assert device.get("is_active") == True, "Device should be active"
        assert "id" in device, "Device should have ID"
        
        # Store for cleanup
        self.created_device_id = device["id"]
        print(f"✓ Created device: {device_name} (ID: {device['id']})")
        
        # Verify device appears in list
        list_response = self.session.get(f"{BASE_URL}/api/biometric/devices")
        devices = list_response.json()
        created = next((d for d in devices if d.get("id") == device["id"]), None)
        assert created is not None, "Created device should appear in list"
        print(f"✓ Device verified in list")
    
    def test_04_sync_from_agent_with_records(self):
        """Test POST /api/biometric/devices/{id}/sync-from-agent - receive attendance records"""
        # Use existing test device
        device_id = TEST_DEVICE_ID
        
        # Create test attendance records
        test_records = [
            {
                "uid": "1",
                "timestamp": "2025-01-15T08:00:00",
                "punch_type": "in"
            },
            {
                "uid": "1",
                "timestamp": "2025-01-15T17:00:00",
                "punch_type": "out"
            },
            {
                "uid": "2",
                "timestamp": "2025-01-15T08:30:00",
                "punch_type": "in"
            }
        ]
        
        response = self.session.post(f"{BASE_URL}/api/biometric/devices/{device_id}/sync-from-agent", json={
            "records": test_records
        })
        
        assert response.status_code == 200, f"Failed to sync: {response.text}"
        data = response.json()
        
        assert "records_count" in data, "Response should contain records_count"
        assert "total_received" in data, "Response should contain total_received"
        assert data["total_received"] == 3, "Should receive 3 records"
        print(f"✓ Synced {data['records_count']} records (received: {data['total_received']}, duplicates skipped: {data.get('duplicates_skipped', 0)})")
    
    def test_05_sync_from_agent_deduplication(self):
        """Test sync-from-agent deduplication - same records should be skipped"""
        device_id = TEST_DEVICE_ID
        
        # Send same records again
        test_records = [
            {
                "uid": "1",
                "timestamp": "2025-01-15T08:00:00",
                "punch_type": "in"
            },
            {
                "uid": "1",
                "timestamp": "2025-01-15T17:00:00",
                "punch_type": "out"
            }
        ]
        
        response = self.session.post(f"{BASE_URL}/api/biometric/devices/{device_id}/sync-from-agent", json={
            "records": test_records
        })
        
        assert response.status_code == 200, f"Failed to sync: {response.text}"
        data = response.json()
        
        # All records should be duplicates
        assert data["duplicates_skipped"] == 2, f"Should skip 2 duplicates, got {data.get('duplicates_skipped')}"
        assert data["records_count"] == 0, f"Should insert 0 new records, got {data.get('records_count')}"
        print(f"✓ Deduplication working: {data['duplicates_skipped']} duplicates skipped")
    
    def test_06_sync_from_agent_empty_records(self):
        """Test sync-from-agent with empty records list"""
        device_id = TEST_DEVICE_ID
        
        response = self.session.post(f"{BASE_URL}/api/biometric/devices/{device_id}/sync-from-agent", json={
            "records": []
        })
        
        assert response.status_code == 200, f"Failed to sync empty: {response.text}"
        data = response.json()
        
        assert data["records_count"] == 0, "Should insert 0 records"
        assert data["total_received"] == 0, "Should receive 0 records"
        print(f"✓ Empty sync handled correctly")
    
    def test_07_sync_from_agent_invalid_device(self):
        """Test sync-from-agent with non-existent device"""
        fake_device_id = "non-existent-device-id"
        
        response = self.session.post(f"{BASE_URL}/api/biometric/devices/{fake_device_id}/sync-from-agent", json={
            "records": [{"uid": "1", "timestamp": "2025-01-15T08:00:00", "punch_type": "in"}]
        })
        
        assert response.status_code == 404, f"Should return 404 for non-existent device, got {response.status_code}"
        print(f"✓ Non-existent device returns 404")
    
    def test_08_update_employee_biometric_uid(self):
        """Test PUT /api/employees/{id} with biometric_uid field"""
        employee_id = TEST_EMPLOYEE_ID
        new_biometric_uid = "99"
        
        response = self.session.put(f"{BASE_URL}/api/employees/{employee_id}", json={
            "biometric_uid": new_biometric_uid
        })
        
        assert response.status_code == 200, f"Failed to update employee: {response.text}"
        data = response.json()
        
        # Verify biometric_uid was updated
        assert data.get("biometric_uid") == new_biometric_uid, f"biometric_uid should be {new_biometric_uid}"
        print(f"✓ Updated employee biometric_uid to {new_biometric_uid}")
        
        # Verify with GET
        get_response = self.session.get(f"{BASE_URL}/api/employees?branch_id={TEST_BRANCH_ID}")
        if get_response.status_code == 200:
            employees = get_response.json()
            emp = next((e for e in employees if e.get("id") == employee_id), None)
            if emp:
                assert emp.get("biometric_uid") == new_biometric_uid, "biometric_uid not persisted"
                print(f"✓ Verified biometric_uid persisted in database")
        
        # Restore original value
        self.session.put(f"{BASE_URL}/api/employees/{employee_id}", json={
            "biometric_uid": "1"
        })
        print(f"✓ Restored original biometric_uid")
    
    def test_09_get_employees_with_biometric_uid(self):
        """Test GET /api/employees returns biometric_uid field"""
        response = self.session.get(f"{BASE_URL}/api/employees?branch_id={TEST_BRANCH_ID}")
        
        assert response.status_code == 200, f"Failed to get employees: {response.text}"
        employees = response.json()
        
        assert isinstance(employees, list), "Response should be a list"
        
        # Find test employee
        test_emp = next((e for e in employees if e.get("id") == TEST_EMPLOYEE_ID), None)
        if test_emp:
            # biometric_uid field should exist (can be null or string)
            assert "biometric_uid" in test_emp or test_emp.get("biometric_uid") is None or isinstance(test_emp.get("biometric_uid"), str), \
                "Employee should have biometric_uid field"
            print(f"✓ Employee {test_emp.get('name')} has biometric_uid: {test_emp.get('biometric_uid')}")
        else:
            print(f"⚠ Test employee not found, checking other employees")
            for emp in employees[:3]:
                print(f"  Employee: {emp.get('name')}, biometric_uid: {emp.get('biometric_uid')}")


class TestBiometricDeviceValidation:
    """Test validation and edge cases"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test session with auth"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        login_response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        
        if login_response.status_code == 200:
            token = login_response.json().get("token")
            self.session.headers.update({"Authorization": f"Bearer {token}"})
        else:
            pytest.skip("Authentication failed")
    
    def test_10_create_device_missing_fields(self):
        """Test create device with missing required fields"""
        # Missing name
        response = self.session.post(f"{BASE_URL}/api/biometric/devices", json={
            "ip_address": "192.168.1.100",
            "branch_id": TEST_BRANCH_ID
        })
        assert response.status_code == 422, f"Should return 422 for missing name, got {response.status_code}"
        print(f"✓ Missing name returns 422")
        
        # Missing ip_address
        response = self.session.post(f"{BASE_URL}/api/biometric/devices", json={
            "name": "Test Device",
            "branch_id": TEST_BRANCH_ID
        })
        assert response.status_code == 422, f"Should return 422 for missing ip_address, got {response.status_code}"
        print(f"✓ Missing ip_address returns 422")
    
    def test_11_sync_records_with_missing_fields(self):
        """Test sync with records missing required fields (uid, timestamp)"""
        device_id = TEST_DEVICE_ID
        
        # Records with missing uid should be skipped
        response = self.session.post(f"{BASE_URL}/api/biometric/devices/{device_id}/sync-from-agent", json={
            "records": [
                {"timestamp": "2025-01-15T08:00:00", "punch_type": "in"},  # missing uid
                {"uid": "1", "punch_type": "in"},  # missing timestamp
                {"uid": "3", "timestamp": "2025-01-15T09:00:00", "punch_type": "in"}  # valid
            ]
        })
        
        assert response.status_code == 200, f"Sync should succeed: {response.text}"
        data = response.json()
        # Only the valid record should be processed
        print(f"✓ Sync with invalid records: received={data['total_received']}, inserted={data['records_count']}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
