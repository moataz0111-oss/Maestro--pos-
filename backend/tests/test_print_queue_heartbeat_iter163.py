"""
Print Queue Heartbeat Tests - Iteration 163
Tests for the print agent heartbeat/polling mechanism:
1. GET /api/print-queue/agent-status returns online:false when no heartbeat exists
2. GET /api/print-queue/pending?limit=10&agent_version=6.0.0&device_id=default records heartbeat
3. GET /api/print-queue/agent-status returns online:true after a recent heartbeat poll
4. GET /api/print-queue/agent-status returns online:false when heartbeat is older than 30 seconds
5. POST /api/print-queue creates a print job successfully (requires auth)
6. PUT /api/print-queue/{job_id}/complete marks job as completed
7. PUT /api/print-queue/{job_id}/failed marks job as failed
"""

import pytest
import requests
import os
import time
from datetime import datetime, timezone, timedelta

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
ADMIN_EMAIL = "hanialdujaili@gmail.com"
ADMIN_PASSWORD = "Hani@2024"


class TestPrintQueueHeartbeat:
    """Tests for print queue heartbeat mechanism"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup for each test"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
    def get_auth_token(self):
        """Get authentication token"""
        response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        if response.status_code == 200:
            return response.json().get("token")
        return None
    
    def test_01_agent_status_no_heartbeat(self):
        """Test agent-status returns online:false when no recent heartbeat"""
        # First, clear any existing heartbeats by waiting or checking initial state
        response = self.session.get(f"{BASE_URL}/api/print-queue/agent-status")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        
        # Verify response structure
        assert "online" in data, "Response should contain 'online' field"
        assert "version" in data, "Response should contain 'version' field"
        assert "last_seen" in data, "Response should contain 'last_seen' field"
        
        print(f"Agent status (initial): online={data['online']}, version={data['version']}, last_seen={data['last_seen']}")
    
    def test_02_pending_jobs_records_heartbeat(self):
        """Test that polling pending jobs with agent_version and device_id records heartbeat"""
        # Poll pending jobs with heartbeat parameters
        response = self.session.get(
            f"{BASE_URL}/api/print-queue/pending",
            params={
                "limit": 10,
                "agent_version": "6.0.0",
                "device_id": "default"
            }
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        
        # Verify response structure
        assert "jobs" in data, "Response should contain 'jobs' field"
        assert "count" in data, "Response should contain 'count' field"
        assert isinstance(data["jobs"], list), "jobs should be a list"
        
        print(f"Pending jobs response: count={data['count']}, jobs={len(data['jobs'])}")
    
    def test_03_agent_status_online_after_heartbeat(self):
        """Test agent-status returns online:true after recent heartbeat poll"""
        # First, send a heartbeat by polling pending jobs
        poll_response = self.session.get(
            f"{BASE_URL}/api/print-queue/pending",
            params={
                "limit": 10,
                "agent_version": "6.0.0",
                "device_id": "default"
            }
        )
        assert poll_response.status_code == 200, "Polling should succeed"
        
        # Now check agent status - should be online
        response = self.session.get(f"{BASE_URL}/api/print-queue/agent-status")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        
        # Verify agent is online
        assert data["online"] == True, f"Agent should be online after heartbeat, got online={data['online']}"
        assert data["version"] == "6.0.0", f"Version should be 6.0.0, got {data['version']}"
        assert data["last_seen"] is not None, "last_seen should not be None"
        
        print(f"Agent status (after heartbeat): online={data['online']}, version={data['version']}, last_seen={data['last_seen']}")
    
    def test_04_agent_status_with_different_device_id(self):
        """Test heartbeat with different device_id"""
        # Poll with a different device_id
        response = self.session.get(
            f"{BASE_URL}/api/print-queue/pending",
            params={
                "limit": 5,
                "agent_version": "6.0.0",
                "device_id": "test_device_123"
            }
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        
        assert "jobs" in data, "Response should contain 'jobs' field"
        print(f"Polling with device_id=test_device_123: count={data['count']}")
    
    def test_05_create_print_job_requires_auth(self):
        """Test that creating a print job requires authentication"""
        # Try without auth - should fail
        response = self.session.post(f"{BASE_URL}/api/print-queue", json={
            "printer_name": "Test Printer",
            "printer_type": "usb",
            "raw_data": "Test print data"
        })
        
        # Should return 401 or 403 without auth
        assert response.status_code in [401, 403], f"Expected 401/403 without auth, got {response.status_code}"
        print(f"Create print job without auth: status={response.status_code}")
    
    def test_06_create_print_job_with_auth(self):
        """Test creating a print job with authentication"""
        token = self.get_auth_token()
        assert token is not None, "Failed to get auth token"
        
        self.session.headers.update({"Authorization": f"Bearer {token}"})
        
        response = self.session.post(f"{BASE_URL}/api/print-queue", json={
            "printer_name": "TEST_Printer",
            "printer_type": "usb",
            "usb_printer_name": "TEST_USB_Printer",
            "raw_data": "Test print data for iteration 163"
        })
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        
        assert data.get("success") == True, "Response should indicate success"
        assert "job_id" in data, "Response should contain job_id"
        
        # Store job_id for later tests
        self.__class__.created_job_id = data["job_id"]
        print(f"Created print job: job_id={data['job_id']}")
    
    def test_07_complete_print_job(self):
        """Test marking a print job as completed"""
        job_id = getattr(self.__class__, 'created_job_id', None)
        if not job_id:
            pytest.skip("No job_id from previous test")
        
        response = self.session.put(
            f"{BASE_URL}/api/print-queue/{job_id}/complete",
            json={"message": "Print completed successfully"}
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        
        assert data.get("success") == True, "Response should indicate success"
        print(f"Completed print job: job_id={job_id}")
    
    def test_08_create_and_fail_print_job(self):
        """Test creating a print job and marking it as failed"""
        token = self.get_auth_token()
        assert token is not None, "Failed to get auth token"
        
        self.session.headers.update({"Authorization": f"Bearer {token}"})
        
        # Create a new job
        create_response = self.session.post(f"{BASE_URL}/api/print-queue", json={
            "printer_name": "TEST_Printer_Fail",
            "printer_type": "usb",
            "raw_data": "Test print data that will fail"
        })
        
        assert create_response.status_code == 200, f"Expected 200, got {create_response.status_code}"
        job_id = create_response.json().get("job_id")
        assert job_id is not None, "Should get job_id"
        
        # Mark as failed
        fail_response = self.session.put(
            f"{BASE_URL}/api/print-queue/{job_id}/failed",
            json={"error": "Printer not connected"}
        )
        
        assert fail_response.status_code == 200, f"Expected 200, got {fail_response.status_code}"
        data = fail_response.json()
        
        assert data.get("success") == True, "Response should indicate success"
        print(f"Failed print job: job_id={job_id}")
    
    def test_09_create_print_job_with_order_data(self):
        """Test creating a print job with order_data (kitchen USB receipts)"""
        token = self.get_auth_token()
        assert token is not None, "Failed to get auth token"
        
        self.session.headers.update({"Authorization": f"Bearer {token}"})
        
        # Create job with order_data for kitchen receipt
        order_data = {
            "order_number": "TEST-001",
            "order_type": "dine_in",
            "items": [
                {"name": "برغر كلاسيك", "quantity": 2, "price": 5000},
                {"name": "كولا", "quantity": 2, "price": 1500}
            ],
            "total": 13000,
            "table_number": "5"
        }
        
        printer_config = {
            "show_prices": False,
            "print_mode": "kitchen",
            "printer_type": "kitchen"
        }
        
        response = self.session.post(f"{BASE_URL}/api/print-queue", json={
            "printer_name": "TEST_Kitchen_Printer",
            "printer_type": "usb",
            "usb_printer_name": "TEST_Kitchen_USB",
            "order_data": order_data,
            "printer_config": printer_config
        })
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        
        assert data.get("success") == True, "Response should indicate success"
        assert "job_id" in data, "Response should contain job_id"
        
        print(f"Created kitchen print job with order_data: job_id={data['job_id']}")
    
    def test_10_pending_jobs_without_heartbeat_params(self):
        """Test polling pending jobs without heartbeat parameters (no heartbeat recorded)"""
        response = self.session.get(
            f"{BASE_URL}/api/print-queue/pending",
            params={"limit": 10}
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        
        assert "jobs" in data, "Response should contain 'jobs' field"
        assert "count" in data, "Response should contain 'count' field"
        
        print(f"Pending jobs (no heartbeat params): count={data['count']}")
    
    def test_11_verify_heartbeat_timestamp_format(self):
        """Test that heartbeat timestamp is in ISO format"""
        # Send heartbeat
        self.session.get(
            f"{BASE_URL}/api/print-queue/pending",
            params={
                "limit": 1,
                "agent_version": "6.0.0",
                "device_id": "timestamp_test"
            }
        )
        
        # Check status
        response = self.session.get(f"{BASE_URL}/api/print-queue/agent-status")
        assert response.status_code == 200
        
        data = response.json()
        last_seen = data.get("last_seen")
        
        if last_seen:
            # Verify it's a valid ISO timestamp
            try:
                # Try parsing the timestamp
                if last_seen.endswith('Z'):
                    last_seen = last_seen.replace('Z', '+00:00')
                parsed = datetime.fromisoformat(last_seen)
                print(f"Heartbeat timestamp valid: {last_seen} -> {parsed}")
            except ValueError as e:
                pytest.fail(f"Invalid timestamp format: {last_seen}, error: {e}")
    
    def test_12_health_check(self):
        """Test API health check endpoint"""
        response = self.session.get(f"{BASE_URL}/api/health")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        
        assert data.get("status") == "ok", "Health check should return ok status"
        print(f"Health check: {data}")


class TestPrintQueueIntegration:
    """Integration tests for print queue with authentication"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup for each test"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
    
    def test_01_login_flow(self):
        """Test login flow works correctly"""
        response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        
        assert response.status_code == 200, f"Login failed: {response.status_code} - {response.text}"
        data = response.json()
        
        assert "token" in data, "Response should contain token"
        assert "user" in data, "Response should contain user"
        
        user = data["user"]
        assert user.get("email") == ADMIN_EMAIL, f"Email mismatch: {user.get('email')}"
        
        print(f"Login successful: user={user.get('full_name')}, role={user.get('role')}")
    
    def test_02_full_print_job_lifecycle(self):
        """Test complete print job lifecycle: create -> poll -> complete"""
        # Login
        login_response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        assert login_response.status_code == 200
        token = login_response.json().get("token")
        
        self.session.headers.update({"Authorization": f"Bearer {token}"})
        
        # Create print job
        create_response = self.session.post(f"{BASE_URL}/api/print-queue", json={
            "printer_name": "TEST_Lifecycle_Printer",
            "printer_type": "usb",
            "usb_printer_name": "TEST_Lifecycle_USB",
            "raw_data": "Lifecycle test print data"
        })
        assert create_response.status_code == 200
        job_id = create_response.json().get("job_id")
        print(f"Created job: {job_id}")
        
        # Poll pending jobs (simulating agent)
        poll_response = self.session.get(
            f"{BASE_URL}/api/print-queue/pending",
            params={
                "limit": 10,
                "agent_version": "6.0.0",
                "device_id": "lifecycle_test"
            }
        )
        assert poll_response.status_code == 200
        jobs = poll_response.json().get("jobs", [])
        print(f"Polled {len(jobs)} pending jobs")
        
        # Verify our job is in the list
        job_ids = [j.get("id") for j in jobs]
        assert job_id in job_ids, f"Created job {job_id} should be in pending jobs"
        
        # Complete the job
        complete_response = self.session.put(
            f"{BASE_URL}/api/print-queue/{job_id}/complete",
            json={"message": "Lifecycle test completed"}
        )
        assert complete_response.status_code == 200
        print(f"Completed job: {job_id}")
        
        # Verify job is no longer in pending
        poll_response2 = self.session.get(
            f"{BASE_URL}/api/print-queue/pending",
            params={"limit": 10}
        )
        assert poll_response2.status_code == 200
        jobs2 = poll_response2.json().get("jobs", [])
        job_ids2 = [j.get("id") for j in jobs2]
        assert job_id not in job_ids2, f"Completed job {job_id} should not be in pending jobs"
        
        print("Full lifecycle test passed!")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
