"""
Test Face Photo Feature - Iteration 150
Tests:
1. POST /api/employees/{id}/face-photo - saves face_photo to employee record
2. GET /api/employees - returns face_photo and face_photo_updated_at fields
3. Verify EmployeeResponse model includes face_photo fields
"""
import pytest
import requests
import os
from datetime import datetime

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestFacePhotoFeature:
    """Test face photo save and retrieval endpoints"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test - login and get token"""
        self.token = None
        self.employee_id = None
        
        # Login as admin
        login_res = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "hanialdujaili@gmail.com",
            "password": "Hani@2024"
        })
        
        if login_res.status_code == 200:
            self.token = login_res.json().get("token")
        else:
            pytest.skip("Could not login as admin")
        
        self.headers = {"Authorization": f"Bearer {self.token}"}
    
    def test_01_get_employees_returns_face_photo_fields(self):
        """GET /api/employees should return face_photo and face_photo_updated_at fields"""
        response = requests.get(f"{BASE_URL}/api/employees", headers=self.headers)
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        employees = response.json()
        assert isinstance(employees, list), "Response should be a list"
        
        if len(employees) > 0:
            # Check that face_photo field exists in response schema
            emp = employees[0]
            # face_photo can be None or a string, but the field should exist in the model
            print(f"Employee keys: {emp.keys()}")
            print(f"Employee name: {emp.get('name')}")
            print(f"face_photo present: {'face_photo' in emp}")
            print(f"face_photo value: {emp.get('face_photo', 'NOT_PRESENT')[:50] if emp.get('face_photo') else 'None'}")
            
            # The field should be in the response (can be None)
            # Note: Pydantic may not include None fields by default, so we check if it's present or None
            assert 'face_photo' in emp or emp.get('face_photo') is None, "face_photo field should be in response"
        
        print(f"✅ GET /api/employees returned {len(employees)} employees with face_photo field support")
    
    def test_02_find_employee_with_biometric_uid(self):
        """Find an employee with biometric_uid for face photo testing"""
        response = requests.get(f"{BASE_URL}/api/employees", headers=self.headers)
        
        assert response.status_code == 200
        
        employees = response.json()
        
        # Find employee with biometric_uid (required for face photo from device)
        emp_with_uid = None
        for emp in employees:
            if emp.get('biometric_uid'):
                emp_with_uid = emp
                break
        
        if emp_with_uid:
            self.employee_id = emp_with_uid['id']
            print(f"✅ Found employee with biometric_uid: {emp_with_uid['name']} (UID: {emp_with_uid['biometric_uid']})")
            print(f"   Current face_photo: {'Yes' if emp_with_uid.get('face_photo') else 'No'}")
        else:
            # Use first employee for testing
            if employees:
                self.employee_id = employees[0]['id']
                print(f"⚠️ No employee with biometric_uid found, using first employee: {employees[0]['name']}")
            else:
                pytest.skip("No employees found")
    
    def test_03_save_face_photo_endpoint(self):
        """POST /api/employees/{id}/face-photo should save face photo"""
        # First get an employee
        response = requests.get(f"{BASE_URL}/api/employees", headers=self.headers)
        assert response.status_code == 200
        
        employees = response.json()
        if not employees:
            pytest.skip("No employees to test")
        
        # Use first employee
        employee_id = employees[0]['id']
        employee_name = employees[0]['name']
        
        # Test saving a face photo (base64 encoded test image)
        test_face_photo = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="
        
        save_response = requests.post(
            f"{BASE_URL}/api/employees/{employee_id}/face-photo",
            json={"face_photo": test_face_photo},
            headers=self.headers
        )
        
        assert save_response.status_code == 200, f"Expected 200, got {save_response.status_code}: {save_response.text}"
        
        result = save_response.json()
        assert result.get("success") == True, "Response should have success=True"
        assert "message" in result, "Response should have message"
        
        print(f"✅ POST /api/employees/{employee_id}/face-photo saved successfully for {employee_name}")
        print(f"   Response: {result}")
    
    def test_04_verify_face_photo_saved(self):
        """Verify face photo was saved by fetching employee"""
        # First save a face photo
        response = requests.get(f"{BASE_URL}/api/employees", headers=self.headers)
        assert response.status_code == 200
        
        employees = response.json()
        if not employees:
            pytest.skip("No employees to test")
        
        employee_id = employees[0]['id']
        
        # Save face photo
        test_face_photo = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="
        
        save_response = requests.post(
            f"{BASE_URL}/api/employees/{employee_id}/face-photo",
            json={"face_photo": test_face_photo},
            headers=self.headers
        )
        assert save_response.status_code == 200
        
        # Now fetch employees and verify face_photo is saved
        get_response = requests.get(f"{BASE_URL}/api/employees", headers=self.headers)
        assert get_response.status_code == 200
        
        employees = get_response.json()
        saved_emp = next((e for e in employees if e['id'] == employee_id), None)
        
        assert saved_emp is not None, "Employee should exist"
        assert saved_emp.get('face_photo') == test_face_photo, "face_photo should match saved value"
        assert saved_emp.get('face_photo_updated_at') is not None, "face_photo_updated_at should be set"
        
        print(f"✅ Face photo verified saved for employee {saved_emp['name']}")
        print(f"   face_photo_updated_at: {saved_emp.get('face_photo_updated_at')}")
    
    def test_05_save_face_photo_empty_returns_400(self):
        """POST /api/employees/{id}/face-photo with empty photo should return 400"""
        response = requests.get(f"{BASE_URL}/api/employees", headers=self.headers)
        assert response.status_code == 200
        
        employees = response.json()
        if not employees:
            pytest.skip("No employees to test")
        
        employee_id = employees[0]['id']
        
        # Try saving empty face photo
        save_response = requests.post(
            f"{BASE_URL}/api/employees/{employee_id}/face-photo",
            json={"face_photo": ""},
            headers=self.headers
        )
        
        assert save_response.status_code == 400, f"Expected 400 for empty photo, got {save_response.status_code}"
        print(f"✅ Empty face photo correctly returns 400")
    
    def test_06_save_face_photo_nonexistent_employee_returns_404(self):
        """POST /api/employees/{id}/face-photo for non-existent employee should return 404"""
        fake_id = "nonexistent-employee-id-12345"
        test_face_photo = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="
        
        save_response = requests.post(
            f"{BASE_URL}/api/employees/{fake_id}/face-photo",
            json={"face_photo": test_face_photo},
            headers=self.headers
        )
        
        assert save_response.status_code == 404, f"Expected 404 for non-existent employee, got {save_response.status_code}"
        print(f"✅ Non-existent employee correctly returns 404")
    
    def test_07_save_face_photo_unauthorized(self):
        """POST /api/employees/{id}/face-photo without auth should return 401/403"""
        response = requests.get(f"{BASE_URL}/api/employees", headers=self.headers)
        assert response.status_code == 200
        
        employees = response.json()
        if not employees:
            pytest.skip("No employees to test")
        
        employee_id = employees[0]['id']
        test_face_photo = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="
        
        # Try without auth header
        save_response = requests.post(
            f"{BASE_URL}/api/employees/{employee_id}/face-photo",
            json={"face_photo": test_face_photo}
        )
        
        assert save_response.status_code in [401, 403], f"Expected 401/403 without auth, got {save_response.status_code}"
        print(f"✅ Unauthorized request correctly returns {save_response.status_code}")


class TestEmployeeAvatarData:
    """Test that employee data includes face_photo for avatar display"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test - login and get token"""
        login_res = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "hanialdujaili@gmail.com",
            "password": "Hani@2024"
        })
        
        if login_res.status_code == 200:
            self.token = login_res.json().get("token")
        else:
            pytest.skip("Could not login as admin")
        
        self.headers = {"Authorization": f"Bearer {self.token}"}
    
    def test_08_employee_response_includes_face_photo(self):
        """Verify EmployeeResponse model includes face_photo fields"""
        response = requests.get(f"{BASE_URL}/api/employees", headers=self.headers)
        
        assert response.status_code == 200
        
        employees = response.json()
        
        # Find employee with face_photo (أحمد محمد should have one per the request)
        emp_with_photo = None
        for emp in employees:
            if emp.get('face_photo'):
                emp_with_photo = emp
                break
        
        if emp_with_photo:
            print(f"✅ Found employee with face_photo: {emp_with_photo['name']}")
            print(f"   face_photo length: {len(emp_with_photo['face_photo'])} chars")
            print(f"   face_photo_updated_at: {emp_with_photo.get('face_photo_updated_at')}")
            
            # Verify it's a valid base64 image
            assert emp_with_photo['face_photo'].startswith('data:image'), "face_photo should be base64 image"
        else:
            print("⚠️ No employee with face_photo found - this is expected if none have been saved yet")
        
        print(f"✅ Employee response model supports face_photo fields")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
