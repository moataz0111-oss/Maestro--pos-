"""
Test iteration 141: Packaging Materials and Sales Target Motivational Message
- GET /api/packaging-materials returns 200 (was 500 before fix)
- POST /api/sales-target accepts motivational_message field
- GET /api/sales-target returns motivational_message field
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestAuthentication:
    """Authentication tests"""
    
    def test_admin_login(self):
        """Test admin login"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "hanialdujaili@gmail.com",
            "password": "Hani@2024"
        })
        assert response.status_code == 200, f"Admin login failed: {response.text}"
        data = response.json()
        assert "token" in data, "No token in response"
        return data["token"]


class TestPackagingMaterials:
    """Test packaging materials endpoint - was returning 500 before fix"""
    
    @pytest.fixture
    def admin_token(self):
        """Get admin auth token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "hanialdujaili@gmail.com",
            "password": "Hani@2024"
        })
        assert response.status_code == 200
        return response.json()["token"]
    
    def test_get_packaging_materials_returns_200(self, admin_token):
        """GET /api/packaging-materials should return 200 (was 500 before fix)"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        response = requests.get(f"{BASE_URL}/api/packaging-materials", headers=headers)
        
        # This was returning 500 before the fix due to duplicate route
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        # Response should be a list
        data = response.json()
        assert isinstance(data, list), f"Expected list, got {type(data)}"
        print(f"Packaging materials count: {len(data)}")
    
    def test_packaging_materials_data_structure(self, admin_token):
        """Verify packaging materials response structure"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        response = requests.get(f"{BASE_URL}/api/packaging-materials", headers=headers)
        
        assert response.status_code == 200
        data = response.json()
        
        # If there are materials, check structure
        if len(data) > 0:
            material = data[0]
            expected_fields = ["id", "name", "unit", "quantity"]
            for field in expected_fields:
                assert field in material, f"Missing field: {field}"
            print(f"Sample material: {material.get('name')}")


class TestSalesTargetMotivationalMessage:
    """Test sales target with motivational_message field"""
    
    @pytest.fixture
    def admin_token(self):
        """Get admin auth token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "hanialdujaili@gmail.com",
            "password": "Hani@2024"
        })
        assert response.status_code == 200
        return response.json()["token"]
    
    def test_post_sales_target_with_motivational_message(self, admin_token):
        """POST /api/sales-target accepts motivational_message field"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        
        test_message = "خلونا نكسر الرقم القياسي اليوم!"
        payload = {
            "target_amount": 75000,
            "motivational_message": test_message
        }
        
        response = requests.post(f"{BASE_URL}/api/sales-target", json=payload, headers=headers)
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert "target_amount" in data, "Missing target_amount in response"
        assert data["target_amount"] == 75000, f"Expected 75000, got {data['target_amount']}"
        print(f"Target set successfully: {data}")
    
    def test_get_sales_target_returns_motivational_message(self, admin_token):
        """GET /api/sales-target returns motivational_message field"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        
        # First set a target with message
        test_message = "هيا نحقق الهدف معاً!"
        payload = {
            "target_amount": 80000,
            "motivational_message": test_message
        }
        post_response = requests.post(f"{BASE_URL}/api/sales-target", json=payload, headers=headers)
        assert post_response.status_code == 200
        
        # Now get the target
        response = requests.get(f"{BASE_URL}/api/sales-target", headers=headers)
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        
        # Verify response structure
        assert "has_target" in data, "Missing has_target"
        assert data["has_target"] == True, "Expected has_target=True"
        assert "target_amount" in data, "Missing target_amount"
        assert "motivational_message" in data, "Missing motivational_message field"
        
        # Verify the message was saved
        assert data["motivational_message"] == test_message, f"Expected '{test_message}', got '{data['motivational_message']}'"
        print(f"Motivational message retrieved: {data['motivational_message']}")
    
    def test_get_sales_target_response_structure(self, admin_token):
        """Verify complete sales target response structure"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        
        response = requests.get(f"{BASE_URL}/api/sales-target", headers=headers)
        assert response.status_code == 200
        
        data = response.json()
        expected_fields = ["has_target", "target_amount", "current_sales", "progress", "achieved"]
        
        for field in expected_fields:
            assert field in data, f"Missing field: {field}"
        
        # If target exists, check additional fields
        if data["has_target"]:
            assert "motivational_message" in data, "Missing motivational_message when target exists"
            assert "date" in data, "Missing date when target exists"
            print(f"Target data: amount={data['target_amount']}, progress={data['progress']}%, message='{data.get('motivational_message', '')}'")
    
    def test_post_sales_target_without_message(self, admin_token):
        """POST /api/sales-target works without motivational_message (optional field)"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        
        payload = {
            "target_amount": 60000
        }
        
        response = requests.post(f"{BASE_URL}/api/sales-target", json=payload, headers=headers)
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        print("Target set without motivational message - OK")
    
    def test_post_sales_target_with_empty_message(self, admin_token):
        """POST /api/sales-target handles empty motivational_message"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        
        payload = {
            "target_amount": 65000,
            "motivational_message": ""
        }
        
        response = requests.post(f"{BASE_URL}/api/sales-target", json=payload, headers=headers)
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        print("Target set with empty motivational message - OK")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
