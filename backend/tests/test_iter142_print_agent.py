"""
Iteration 142 - Multi-Printer Support Tests
Tests for:
1. GET /api/download-print-agent - Download print agent Python file
2. GET /api/printers - Get printers list
3. GET /api/packaging-materials - Verify still works (regression)
"""

import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestAuthentication:
    """Authentication tests"""
    
    @pytest.fixture(scope="class")
    def auth_token(self):
        """Get admin auth token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "hanialdujaili@gmail.com",
            "password": "Hani@2024"
        })
        assert response.status_code == 200, f"Login failed: {response.text}"
        data = response.json()
        assert "token" in data, "No token in response"
        return data["token"]
    
    def test_admin_login(self, auth_token):
        """Test admin login works"""
        assert auth_token is not None
        assert len(auth_token) > 0
        print(f"✅ Admin login successful, token length: {len(auth_token)}")


class TestDownloadPrintAgent:
    """Tests for /api/download-print-agent endpoint"""
    
    def test_download_print_agent_returns_200(self):
        """Test that download-print-agent endpoint returns 200"""
        response = requests.get(f"{BASE_URL}/api/download-print-agent")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        print(f"✅ GET /api/download-print-agent returns 200")
    
    def test_download_print_agent_returns_python_file(self):
        """Test that the response is a Python file"""
        response = requests.get(f"{BASE_URL}/api/download-print-agent")
        assert response.status_code == 200
        
        # Check content-disposition header for filename
        content_disp = response.headers.get('content-disposition', '')
        assert 'maestro_print_agent.py' in content_disp, f"Expected filename in header, got: {content_disp}"
        print(f"✅ Response has correct filename: maestro_print_agent.py")
    
    def test_download_print_agent_content_is_valid_python(self):
        """Test that the downloaded content is valid Python code"""
        response = requests.get(f"{BASE_URL}/api/download-print-agent")
        assert response.status_code == 200
        
        content = response.content.decode('utf-8')
        # Check for expected Python content
        assert '#!/usr/bin/env python3' in content or 'import' in content, "Content doesn't look like Python"
        assert 'def ' in content, "No function definitions found"
        assert 'AGENT_PORT' in content or 'print' in content, "Expected print agent code markers not found"
        print(f"✅ Downloaded content is valid Python code ({len(content)} bytes)")


class TestPrintersEndpoint:
    """Tests for /api/printers endpoint"""
    
    @pytest.fixture(scope="class")
    def auth_token(self):
        """Get admin auth token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "hanialdujaili@gmail.com",
            "password": "Hani@2024"
        })
        assert response.status_code == 200
        return response.json()["token"]
    
    def test_get_printers_returns_200(self, auth_token):
        """Test that GET /api/printers returns 200"""
        headers = {"Authorization": f"Bearer {auth_token}"}
        response = requests.get(f"{BASE_URL}/api/printers", headers=headers)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        print(f"✅ GET /api/printers returns 200")
    
    def test_get_printers_returns_list(self, auth_token):
        """Test that GET /api/printers returns a list"""
        headers = {"Authorization": f"Bearer {auth_token}"}
        response = requests.get(f"{BASE_URL}/api/printers", headers=headers)
        assert response.status_code == 200
        
        data = response.json()
        assert isinstance(data, list), f"Expected list, got {type(data)}"
        print(f"✅ GET /api/printers returns list with {len(data)} printers")


class TestPackagingMaterialsRegression:
    """Regression test for packaging materials (from iteration 141)"""
    
    @pytest.fixture(scope="class")
    def auth_token(self):
        """Get admin auth token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "hanialdujaili@gmail.com",
            "password": "Hani@2024"
        })
        assert response.status_code == 200
        return response.json()["token"]
    
    def test_get_packaging_materials_returns_200(self, auth_token):
        """Test that GET /api/packaging-materials still returns 200"""
        headers = {"Authorization": f"Bearer {auth_token}"}
        response = requests.get(f"{BASE_URL}/api/packaging-materials", headers=headers)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        print(f"✅ GET /api/packaging-materials returns 200 (regression test passed)")


class TestHealthCheck:
    """Basic health check tests"""
    
    def test_api_health(self):
        """Test API health endpoint"""
        response = requests.get(f"{BASE_URL}/api/health")
        assert response.status_code == 200, f"Health check failed: {response.status_code}"
        print(f"✅ API health check passed")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
