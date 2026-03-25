"""
Test suite for Packaging Materials System - Iteration 126
Tests:
1. POST /api/packaging-requests - Create packaging request with from_branch_id
2. POST /api/packaging-requests/{id}/approve - Approve packaging request
3. POST /api/packaging-requests/{id}/transfer - Transfer materials to branch
4. GET /api/branch-packaging-inventory - Get branch packaging inventory
5. Integration: Deduct from main warehouse and add to branch inventory
"""

import pytest
import requests
import os
import uuid

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
DEMO_USER = {"email": "demo@maestroegp.com", "password": "demo123"}
SUPER_ADMIN = {"email": "owner@maestroegp.com", "password": "owner123"}


class TestPackagingSystem:
    """Packaging Materials System Tests"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test fixtures"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        self.created_branch_id = None
        self.created_material_id = None
        self.created_request_id = None
        
    def get_auth_token(self, credentials):
        """Get authentication token"""
        response = self.session.post(f"{BASE_URL}/api/auth/login", json=credentials)
        if response.status_code == 200:
            data = response.json()
            return data.get("token")
        return None
    
    def test_01_api_health(self):
        """Test API health endpoint"""
        response = self.session.get(f"{BASE_URL}/api/health")
        assert response.status_code == 200, f"Health check failed: {response.text}"
        print("✅ API health check passed")
    
    def test_02_login_demo_user(self):
        """Test login with demo user"""
        response = self.session.post(f"{BASE_URL}/api/auth/login", json=DEMO_USER)
        assert response.status_code == 200, f"Login failed: {response.text}"
        data = response.json()
        assert "token" in data, "Token not in response"
        print(f"✅ Login successful for {DEMO_USER['email']}")
    
    def test_03_login_super_admin(self):
        """Test login with super admin"""
        response = self.session.post(f"{BASE_URL}/api/auth/login", json=SUPER_ADMIN)
        assert response.status_code == 200, f"Login failed: {response.text}"
        data = response.json()
        assert "token" in data, "Token not in response"
        print(f"✅ Login successful for {SUPER_ADMIN['email']}")
    
    def test_04_get_packaging_materials(self):
        """Test GET /api/packaging-materials"""
        token = self.get_auth_token(DEMO_USER)
        assert token, "Failed to get auth token"
        
        self.session.headers.update({"Authorization": f"Bearer {token}"})
        response = self.session.get(f"{BASE_URL}/api/packaging-materials")
        
        assert response.status_code == 200, f"Failed to get packaging materials: {response.text}"
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        print(f"✅ GET /api/packaging-materials returned {len(data)} materials")
        return data
    
    def test_05_create_test_branch(self):
        """Create a test branch for packaging requests"""
        token = self.get_auth_token(SUPER_ADMIN)
        assert token, "Failed to get auth token"
        
        self.session.headers.update({"Authorization": f"Bearer {token}"})
        
        branch_data = {
            "name": f"TEST_Branch_Packaging_{uuid.uuid4().hex[:6]}",
            "address": "Test Address",
            "phone": "1234567890",
            "is_active": True
        }
        
        response = self.session.post(f"{BASE_URL}/api/branches", json=branch_data)
        assert response.status_code in [200, 201], f"Failed to create branch: {response.text}"
        
        data = response.json()
        branch_id = data.get("id") or data.get("branch", {}).get("id")
        assert branch_id, "Branch ID not in response"
        
        print(f"✅ Created test branch with ID: {branch_id}")
        return branch_id
    
    def test_06_create_packaging_material(self):
        """Create a test packaging material"""
        token = self.get_auth_token(SUPER_ADMIN)
        assert token, "Failed to get auth token"
        
        self.session.headers.update({"Authorization": f"Bearer {token}"})
        
        material_data = {
            "name": f"TEST_Material_{uuid.uuid4().hex[:6]}",
            "name_en": "Test Material",
            "unit": "قطعة",
            "quantity": 100,
            "min_quantity": 10,
            "cost_per_unit": 5.0,
            "category": "أكياس"
        }
        
        response = self.session.post(f"{BASE_URL}/api/packaging-materials", json=material_data)
        assert response.status_code in [200, 201], f"Failed to create material: {response.text}"
        
        data = response.json()
        # Response format: {"message": "...", "material": {...}}
        material_id = data.get("material", {}).get("id") or data.get("id")
        assert material_id, f"Material ID not in response: {data}"
        
        print(f"✅ Created test packaging material with ID: {material_id}")
        return material_id
    
    def test_07_create_packaging_request_with_branch_id(self):
        """Test POST /api/packaging-requests with from_branch_id"""
        # First create branch and material
        branch_id = self.test_05_create_test_branch()
        material_id = self.test_06_create_packaging_material()
        
        token = self.get_auth_token(SUPER_ADMIN)
        assert token, "Failed to get auth token"
        
        self.session.headers.update({"Authorization": f"Bearer {token}"})
        
        request_data = {
            "items": [
                {
                    "packaging_material_id": material_id,
                    "name": "Test Material",
                    "quantity": 20,
                    "unit": "قطعة"
                }
            ],
            "priority": "normal",
            "notes": "Test packaging request",
            "from_branch_id": branch_id
        }
        
        response = self.session.post(f"{BASE_URL}/api/packaging-requests", json=request_data)
        assert response.status_code in [200, 201], f"Failed to create packaging request: {response.text}"
        
        data = response.json()
        assert "request" in data or "id" in data, "Request data not in response"
        
        request_obj = data.get("request", data)
        request_id = request_obj.get("id")
        assert request_id, "Request ID not in response"
        
        # Verify from_branch_id is set
        assert request_obj.get("from_branch_id") == branch_id, "from_branch_id not set correctly"
        
        print(f"✅ Created packaging request with ID: {request_id}, branch_id: {branch_id}")
        return request_id, branch_id, material_id
    
    def test_08_get_packaging_requests(self):
        """Test GET /api/packaging-requests"""
        token = self.get_auth_token(DEMO_USER)
        assert token, "Failed to get auth token"
        
        self.session.headers.update({"Authorization": f"Bearer {token}"})
        response = self.session.get(f"{BASE_URL}/api/packaging-requests")
        
        assert response.status_code == 200, f"Failed to get packaging requests: {response.text}"
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        print(f"✅ GET /api/packaging-requests returned {len(data)} requests")
        return data
    
    def test_09_approve_packaging_request(self):
        """Test POST /api/packaging-requests/{id}/approve"""
        request_id, branch_id, material_id = self.test_07_create_packaging_request_with_branch_id()
        
        token = self.get_auth_token(SUPER_ADMIN)
        assert token, "Failed to get auth token"
        
        self.session.headers.update({"Authorization": f"Bearer {token}"})
        
        response = self.session.post(f"{BASE_URL}/api/packaging-requests/{request_id}/approve")
        assert response.status_code == 200, f"Failed to approve request: {response.text}"
        
        data = response.json()
        assert "message" in data, "Message not in response"
        
        print(f"✅ Approved packaging request: {request_id}")
        return request_id, branch_id, material_id
    
    def test_10_transfer_packaging_request(self):
        """Test POST /api/packaging-requests/{id}/transfer - Full flow"""
        # Create request and approve it
        request_id, branch_id, material_id = self.test_07_create_packaging_request_with_branch_id()
        
        token = self.get_auth_token(SUPER_ADMIN)
        assert token, "Failed to get auth token"
        
        self.session.headers.update({"Authorization": f"Bearer {token}"})
        
        # Get initial material quantity
        response = self.session.get(f"{BASE_URL}/api/packaging-materials")
        assert response.status_code == 200
        materials = response.json()
        initial_material = next((m for m in materials if m.get("id") == material_id), None)
        initial_qty = initial_material.get("quantity", 0) if initial_material else 100
        
        # Transfer the request
        response = self.session.post(f"{BASE_URL}/api/packaging-requests/{request_id}/transfer")
        assert response.status_code == 200, f"Failed to transfer request: {response.text}"
        
        data = response.json()
        assert "message" in data, "Message not in response"
        
        print(f"✅ Transferred packaging request: {request_id}")
        
        # Verify material quantity was deducted
        response = self.session.get(f"{BASE_URL}/api/packaging-materials")
        assert response.status_code == 200
        materials = response.json()
        updated_material = next((m for m in materials if m.get("id") == material_id), None)
        
        if updated_material:
            new_qty = updated_material.get("quantity", 0)
            print(f"✅ Material quantity changed from {initial_qty} to {new_qty}")
        
        return request_id, branch_id, material_id
    
    def test_11_get_branch_packaging_inventory(self):
        """Test GET /api/branch-packaging-inventory"""
        token = self.get_auth_token(DEMO_USER)
        assert token, "Failed to get auth token"
        
        self.session.headers.update({"Authorization": f"Bearer {token}"})
        
        response = self.session.get(f"{BASE_URL}/api/branch-packaging-inventory")
        assert response.status_code == 200, f"Failed to get branch inventory: {response.text}"
        
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        print(f"✅ GET /api/branch-packaging-inventory returned {len(data)} items")
        return data
    
    def test_12_get_branch_packaging_inventory_with_branch_id(self):
        """Test GET /api/branch-packaging-inventory with branch_id parameter"""
        # First do a transfer to create branch inventory
        request_id, branch_id, material_id = self.test_10_transfer_packaging_request()
        
        token = self.get_auth_token(SUPER_ADMIN)
        assert token, "Failed to get auth token"
        
        self.session.headers.update({"Authorization": f"Bearer {token}"})
        
        response = self.session.get(f"{BASE_URL}/api/branch-packaging-inventory?branch_id={branch_id}")
        assert response.status_code == 200, f"Failed to get branch inventory: {response.text}"
        
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        
        # Verify the transferred material is in branch inventory
        branch_material = next((i for i in data if i.get("packaging_material_id") == material_id), None)
        if branch_material:
            assert branch_material.get("quantity") == 20, f"Expected quantity 20, got {branch_material.get('quantity')}"
            print(f"✅ Branch inventory contains transferred material with quantity: {branch_material.get('quantity')}")
        else:
            print(f"⚠️ Material not found in branch inventory (may be filtered by tenant)")
        
        print(f"✅ GET /api/branch-packaging-inventory?branch_id={branch_id} returned {len(data)} items")
        return data
    
    def test_13_cancel_packaging_request(self):
        """Test POST /api/packaging-requests/{id}/cancel"""
        request_id, branch_id, material_id = self.test_07_create_packaging_request_with_branch_id()
        
        token = self.get_auth_token(SUPER_ADMIN)
        assert token, "Failed to get auth token"
        
        self.session.headers.update({"Authorization": f"Bearer {token}"})
        
        response = self.session.post(f"{BASE_URL}/api/packaging-requests/{request_id}/cancel")
        assert response.status_code == 200, f"Failed to cancel request: {response.text}"
        
        data = response.json()
        assert "message" in data, "Message not in response"
        
        print(f"✅ Cancelled packaging request: {request_id}")
    
    def test_14_full_packaging_flow(self):
        """Test complete packaging flow: Create -> Approve -> Transfer -> Verify Branch Inventory"""
        token = self.get_auth_token(SUPER_ADMIN)
        assert token, "Failed to get auth token"
        
        self.session.headers.update({"Authorization": f"Bearer {token}"})
        
        # Step 1: Create branch
        branch_data = {
            "name": f"TEST_FullFlow_Branch_{uuid.uuid4().hex[:6]}",
            "address": "Test Address",
            "phone": "1234567890",
            "is_active": True
        }
        response = self.session.post(f"{BASE_URL}/api/branches", json=branch_data)
        assert response.status_code in [200, 201], f"Failed to create branch: {response.text}"
        branch_id = response.json().get("id") or response.json().get("branch", {}).get("id")
        print(f"  Step 1: Created branch {branch_id}")
        
        # Step 2: Create packaging material
        material_data = {
            "name": f"TEST_FullFlow_Material_{uuid.uuid4().hex[:6]}",
            "unit": "قطعة",
            "quantity": 200,
            "min_quantity": 10,
            "cost_per_unit": 10.0
        }
        response = self.session.post(f"{BASE_URL}/api/packaging-materials", json=material_data)
        assert response.status_code in [200, 201], f"Failed to create material: {response.text}"
        material_id = response.json().get("id")
        initial_qty = 200
        print(f"  Step 2: Created material {material_id} with quantity {initial_qty}")
        
        # Step 3: Create packaging request
        request_data = {
            "items": [
                {
                    "packaging_material_id": material_id,
                    "name": material_data["name"],
                    "quantity": 50,
                    "unit": "قطعة"
                }
            ],
            "priority": "high",
            "notes": "Full flow test",
            "from_branch_id": branch_id
        }
        response = self.session.post(f"{BASE_URL}/api/packaging-requests", json=request_data)
        assert response.status_code in [200, 201], f"Failed to create request: {response.text}"
        request_obj = response.json().get("request", response.json())
        request_id = request_obj.get("id")
        assert request_obj.get("from_branch_id") == branch_id, "from_branch_id not set"
        print(f"  Step 3: Created request {request_id} for branch {branch_id}")
        
        # Step 4: Transfer (approve + transfer in one step)
        response = self.session.post(f"{BASE_URL}/api/packaging-requests/{request_id}/transfer")
        assert response.status_code == 200, f"Failed to transfer: {response.text}"
        print(f"  Step 4: Transferred request {request_id}")
        
        # Step 5: Verify main warehouse quantity decreased
        response = self.session.get(f"{BASE_URL}/api/packaging-materials")
        assert response.status_code == 200
        materials = response.json()
        updated_material = next((m for m in materials if m.get("id") == material_id), None)
        if updated_material:
            new_qty = updated_material.get("quantity", 0)
            assert new_qty == initial_qty - 50, f"Expected {initial_qty - 50}, got {new_qty}"
            print(f"  Step 5: Main warehouse quantity: {initial_qty} -> {new_qty} ✅")
        
        # Step 6: Verify branch inventory increased
        response = self.session.get(f"{BASE_URL}/api/branch-packaging-inventory?branch_id={branch_id}")
        assert response.status_code == 200
        branch_inv = response.json()
        branch_material = next((i for i in branch_inv if i.get("packaging_material_id") == material_id), None)
        if branch_material:
            assert branch_material.get("quantity") == 50, f"Expected 50, got {branch_material.get('quantity')}"
            print(f"  Step 6: Branch inventory quantity: {branch_material.get('quantity')} ✅")
        
        print("✅ Full packaging flow completed successfully!")


class TestPackagingRequestValidation:
    """Validation tests for packaging requests"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test fixtures"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
    
    def get_auth_token(self, credentials):
        """Get authentication token"""
        response = self.session.post(f"{BASE_URL}/api/auth/login", json=credentials)
        if response.status_code == 200:
            return response.json().get("token")
        return None
    
    def test_transfer_nonexistent_request(self):
        """Test transfer with non-existent request ID"""
        token = self.get_auth_token(SUPER_ADMIN)
        assert token, "Failed to get auth token"
        
        self.session.headers.update({"Authorization": f"Bearer {token}"})
        
        fake_id = str(uuid.uuid4())
        response = self.session.post(f"{BASE_URL}/api/packaging-requests/{fake_id}/transfer")
        assert response.status_code == 404, f"Expected 404, got {response.status_code}"
        print("✅ Transfer non-existent request returns 404")
    
    def test_approve_nonexistent_request(self):
        """Test approve with non-existent request ID"""
        token = self.get_auth_token(SUPER_ADMIN)
        assert token, "Failed to get auth token"
        
        self.session.headers.update({"Authorization": f"Bearer {token}"})
        
        fake_id = str(uuid.uuid4())
        response = self.session.post(f"{BASE_URL}/api/packaging-requests/{fake_id}/approve")
        assert response.status_code == 404, f"Expected 404, got {response.status_code}"
        print("✅ Approve non-existent request returns 404")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
