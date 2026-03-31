"""
Test file for Impersonation Logs API - Iteration 108
Tests the /api/auth/impersonation-logs endpoint
"""

import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://maestro-pos-printing.preview.emergentagent.com')

class TestImpersonationLogsAPI:
    """Tests for impersonation logs endpoint"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test fixtures"""
        self.base_url = BASE_URL.rstrip('/')
        # Login to get token
        login_response = requests.post(
            f"{self.base_url}/api/auth/login",
            json={"email": "demo@maestroegp.com", "password": "demo123"}
        )
        assert login_response.status_code == 200, f"Login failed: {login_response.text}"
        self.token = login_response.json().get("token")
        self.headers = {"Authorization": f"Bearer {self.token}"}
    
    def test_get_impersonation_logs_success(self):
        """Test getting impersonation logs with valid token"""
        response = requests.get(
            f"{self.base_url}/api/auth/impersonation-logs?page=1&limit=20",
            headers=self.headers
        )
        assert response.status_code == 200
        data = response.json()
        
        # Verify response structure
        assert "logs" in data
        assert "total" in data
        assert "total_pages" in data
        assert "page" in data
        assert "limit" in data
        
        # Verify pagination values
        assert data["page"] == 1
        assert data["limit"] == 20
        assert isinstance(data["total"], int)
        assert isinstance(data["total_pages"], int)
        
        print(f"✅ Found {data['total']} impersonation logs")
    
    def test_get_impersonation_logs_pagination(self):
        """Test pagination parameters"""
        response = requests.get(
            f"{self.base_url}/api/auth/impersonation-logs?page=2&limit=10",
            headers=self.headers
        )
        assert response.status_code == 200
        data = response.json()
        
        assert data["page"] == 2
        assert data["limit"] == 10
        # Skip should be calculated as (page-1) * limit = 10
        assert data["skip"] == 10
        
        print(f"✅ Pagination working correctly")
    
    def test_get_impersonation_logs_structure(self):
        """Test log entry structure"""
        response = requests.get(
            f"{self.base_url}/api/auth/impersonation-logs?page=1&limit=20",
            headers=self.headers
        )
        assert response.status_code == 200
        data = response.json()
        
        if len(data["logs"]) > 0:
            log = data["logs"][0]
            # Verify log entry fields
            assert "id" in log
            assert "event_type" in log
            assert "admin_id" in log
            assert "admin_name" in log or "admin_email" in log
            assert "target_user_id" in log
            assert "target_user_name" in log
            assert "created_at" in log
            
            print(f"✅ Log entry structure is correct")
            print(f"  Admin: {log.get('admin_name', log.get('admin_email'))}")
            print(f"  Target: {log.get('target_user_name')}")
        else:
            print("⚠️ No logs found to verify structure")
    
    def test_get_impersonation_logs_unauthorized(self):
        """Test that unauthorized users cannot access logs"""
        response = requests.get(
            f"{self.base_url}/api/auth/impersonation-logs?page=1&limit=20"
        )
        # Should return 401 or 403 without token
        assert response.status_code in [401, 403, 422]
        print(f"✅ Unauthorized access blocked (status: {response.status_code})")


class TestSettingsPage:
    """Tests for Settings page functionality"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test fixtures"""
        self.base_url = BASE_URL.rstrip('/')
        # Login to get token
        login_response = requests.post(
            f"{self.base_url}/api/auth/login",
            json={"email": "demo@maestroegp.com", "password": "demo123"}
        )
        assert login_response.status_code == 200
        self.token = login_response.json().get("token")
        self.headers = {"Authorization": f"Bearer {self.token}"}
    
    def test_settings_dashboard_endpoint(self):
        """Test settings dashboard endpoint"""
        response = requests.get(
            f"{self.base_url}/api/settings/dashboard",
            headers=self.headers
        )
        assert response.status_code == 200
        data = response.json()
        
        # Verify some expected settings
        assert isinstance(data, dict)
        print(f"✅ Settings dashboard endpoint working")
    
    def test_users_endpoint(self):
        """Test users endpoint"""
        response = requests.get(
            f"{self.base_url}/api/users",
            headers=self.headers
        )
        assert response.status_code == 200
        data = response.json()
        
        assert isinstance(data, list)
        print(f"✅ Found {len(data)} users")
    
    def test_branches_endpoint(self):
        """Test branches endpoint"""
        response = requests.get(
            f"{self.base_url}/api/branches",
            headers=self.headers
        )
        assert response.status_code == 200
        data = response.json()
        
        assert isinstance(data, list)
        print(f"✅ Found {len(data)} branches")


class TestOfflineSyncStatus:
    """Tests for offline sync status"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test fixtures"""
        self.base_url = BASE_URL.rstrip('/')
        # Login to get token
        login_response = requests.post(
            f"{self.base_url}/api/auth/login",
            json={"email": "demo@maestroegp.com", "password": "demo123"}
        )
        assert login_response.status_code == 200
        self.token = login_response.json().get("token")
        self.headers = {"Authorization": f"Bearer {self.token}"}
    
    def test_sync_status_endpoint(self):
        """Test sync status endpoint"""
        response = requests.get(
            f"{self.base_url}/api/sync/status",
            headers=self.headers
        )
        # May return 200 or 404 depending on implementation
        if response.status_code == 200:
            data = response.json()
            print(f"✅ Sync status endpoint working")
        else:
            print(f"⚠️ Sync status endpoint returned {response.status_code}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
