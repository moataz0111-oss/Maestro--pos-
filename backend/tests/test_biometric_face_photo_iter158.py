"""
Test biometric face photo and auto-sync features for iteration 158
Tests:
1. Login with admin credentials
2. Health check endpoint
3. Biometric devices API
4. Biometric auto-sync GET/POST endpoints
5. Employee face-photo API endpoint
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestBiometricFacePhotoFeatures:
    """Test biometric and face photo features"""
    
    token = None
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup - login and get token"""
        if not TestBiometricFacePhotoFeatures.token:
            login_response = requests.post(f"{BASE_URL}/api/auth/login", json={
                "email": "hanialdujaili@gmail.com",
                "password": "Hani@2024"
            })
            if login_response.status_code == 200:
                TestBiometricFacePhotoFeatures.token = login_response.json().get("token")
            else:
                pytest.skip("Login failed - skipping tests")
    
    def get_headers(self):
        return {"Authorization": f"Bearer {TestBiometricFacePhotoFeatures.token}"}
    
    # Test 1: Login with admin credentials
    def test_01_login_with_admin_credentials(self):
        """Test login with admin credentials works"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "hanialdujaili@gmail.com",
            "password": "Hani@2024"
        })
        assert response.status_code == 200, f"Login failed: {response.text}"
        data = response.json()
        assert "token" in data, "Token not in response"
        assert "user" in data, "User not in response"
        print(f"✅ Login successful - User: {data['user'].get('full_name', data['user'].get('email'))}")
    
    # Test 2: Health check endpoint
    def test_02_health_check_endpoint(self):
        """Test backend health check endpoint works"""
        response = requests.get(f"{BASE_URL}/api/health")
        assert response.status_code == 200, f"Health check failed: {response.text}"
        data = response.json()
        assert data.get("status") == "ok", f"Health status not ok: {data}"
        print("✅ Health check passed")
    
    # Test 3: Biometric devices API returns proper response
    def test_03_biometric_devices_api(self):
        """Test biometric devices API returns proper response"""
        response = requests.get(f"{BASE_URL}/api/biometric/devices", headers=self.get_headers())
        assert response.status_code == 200, f"Biometric devices API failed: {response.text}"
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        print(f"✅ Biometric devices API works - {len(data)} devices found")
    
    # Test 4: Biometric auto-sync GET endpoint
    def test_04_biometric_auto_sync_get(self):
        """Test GET /api/biometric/auto-sync returns enabled status"""
        response = requests.get(f"{BASE_URL}/api/biometric/auto-sync", headers=self.get_headers())
        assert response.status_code == 200, f"Auto-sync GET failed: {response.text}"
        data = response.json()
        assert "enabled" in data, "Response should have 'enabled' field"
        print(f"✅ Auto-sync GET works - enabled: {data.get('enabled')}")
    
    # Test 5: Biometric auto-sync POST endpoint (enable)
    def test_05_biometric_auto_sync_post_enable(self):
        """Test POST /api/biometric/auto-sync with enabled=true"""
        response = requests.post(f"{BASE_URL}/api/biometric/auto-sync", 
            json={"enabled": True},
            headers=self.get_headers())
        assert response.status_code == 200, f"Auto-sync POST failed: {response.text}"
        data = response.json()
        assert data.get("enabled") == True or data.get("success") == True, f"Enable failed: {data}"
        print("✅ Auto-sync POST (enable) works")
    
    # Test 6: Verify auto-sync is enabled
    def test_06_verify_auto_sync_enabled(self):
        """Test GET /api/biometric/auto-sync returns enabled=true after toggle"""
        response = requests.get(f"{BASE_URL}/api/biometric/auto-sync", headers=self.get_headers())
        assert response.status_code == 200, f"Auto-sync GET failed: {response.text}"
        data = response.json()
        assert data.get("enabled") == True, f"Auto-sync should be enabled: {data}"
        print("✅ Auto-sync is enabled")
    
    # Test 7: Biometric auto-sync POST endpoint (disable)
    def test_07_biometric_auto_sync_post_disable(self):
        """Test POST /api/biometric/auto-sync with enabled=false"""
        response = requests.post(f"{BASE_URL}/api/biometric/auto-sync", 
            json={"enabled": False},
            headers=self.get_headers())
        assert response.status_code == 200, f"Auto-sync POST failed: {response.text}"
        print("✅ Auto-sync POST (disable) works")
    
    # Test 8: Get employees list
    def test_08_get_employees_list(self):
        """Test GET /api/employees returns list"""
        response = requests.get(f"{BASE_URL}/api/employees", headers=self.get_headers())
        assert response.status_code == 200, f"Employees GET failed: {response.text}"
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        print(f"✅ Employees API works - {len(data)} employees found")
        # Store first employee ID for face photo test
        if len(data) > 0:
            TestBiometricFacePhotoFeatures.test_employee_id = data[0].get("id")
            TestBiometricFacePhotoFeatures.test_employee_name = data[0].get("name")
    
    # Test 9: Employee face-photo API endpoint (POST)
    def test_09_employee_face_photo_api(self):
        """Test POST /api/employees/{id}/face-photo endpoint works"""
        employee_id = getattr(TestBiometricFacePhotoFeatures, 'test_employee_id', None)
        if not employee_id:
            pytest.skip("No employee found for face photo test")
        
        # Test with a small base64 image (1x1 pixel PNG)
        test_base64_image = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="
        
        response = requests.post(
            f"{BASE_URL}/api/employees/{employee_id}/face-photo",
            json={"face_photo": test_base64_image},
            headers=self.get_headers()
        )
        assert response.status_code == 200, f"Face photo POST failed: {response.text}"
        data = response.json()
        assert data.get("success") == True or "face_photo" in str(data), f"Face photo save failed: {data}"
        print(f"✅ Face photo API works for employee: {getattr(TestBiometricFacePhotoFeatures, 'test_employee_name', employee_id)}")
    
    # Test 10: Verify face photo was saved
    def test_10_verify_face_photo_saved(self):
        """Test GET /api/employees returns employee with face_photo"""
        employee_id = getattr(TestBiometricFacePhotoFeatures, 'test_employee_id', None)
        if not employee_id:
            pytest.skip("No employee found for verification")
        
        response = requests.get(f"{BASE_URL}/api/employees", headers=self.get_headers())
        assert response.status_code == 200, f"Employees GET failed: {response.text}"
        data = response.json()
        
        # Find the employee we updated
        employee = next((e for e in data if e.get("id") == employee_id), None)
        assert employee is not None, f"Employee {employee_id} not found"
        assert employee.get("face_photo") is not None, "Face photo should be saved"
        print(f"✅ Face photo verified for employee: {employee.get('name')}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
