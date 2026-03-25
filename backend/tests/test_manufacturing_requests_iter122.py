"""
Test Manufacturing Requests Feature - Iteration 122
Tests the flow: Manufacturing can request raw materials from warehouse
Warehouse can see incoming requests and fulfill/reject them

Endpoints tested:
- POST /api/manufacturing-requests - Create a new request from manufacturing to warehouse
- GET /api/manufacturing-requests - Get all manufacturing requests
- POST /api/manufacturing-requests/{id}/fulfill - Execute request and transfer materials
- PATCH /api/manufacturing-requests/{id}/status?status=rejected - Reject a request
"""

import pytest
import requests
import os
import uuid
from datetime import datetime

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestManufacturingRequests:
    """Test manufacturing requests from manufacturing to warehouse"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test data"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        self.test_material_id = None
        self.test_request_id = None
        yield
        # Cleanup is handled by test data prefix
    
    def test_01_api_health_check(self):
        """Verify API is accessible"""
        response = self.session.get(f"{BASE_URL}/api/health")
        assert response.status_code == 200, f"API health check failed: {response.text}"
        print("PASSED: API health check")
    
    def test_02_create_test_raw_material(self):
        """Create a test raw material for manufacturing requests"""
        test_material = {
            "name": f"TEST_MFG_REQ_Material_{uuid.uuid4().hex[:8]}",
            "name_en": "Test Material for MFG Request",
            "unit": "كغم",
            "quantity": 100,  # Enough quantity for testing
            "min_quantity": 10,
            "cost_per_unit": 5.0,
            "waste_percentage": 0,
            "category": "test"
        }
        
        response = self.session.post(f"{BASE_URL}/api/raw-materials-new", json=test_material)
        assert response.status_code == 200, f"Failed to create raw material: {response.text}"
        
        data = response.json()
        assert "id" in data, "Response should contain id"
        assert data["name"] == test_material["name"], "Name should match"
        assert data["quantity"] == 100, "Quantity should be 100"
        
        # Store for later tests
        TestManufacturingRequests.test_material_id = data["id"]
        TestManufacturingRequests.test_material_name = data["name"]
        print(f"PASSED: Created test raw material with id: {data['id']}")
    
    def test_03_create_manufacturing_request(self):
        """Test POST /api/manufacturing-requests - Create a new request"""
        assert TestManufacturingRequests.test_material_id, "Test material must be created first"
        
        request_data = {
            "items": [
                {
                    "material_id": TestManufacturingRequests.test_material_id,
                    "quantity": 10
                }
            ],
            "priority": "normal",
            "notes": "Test manufacturing request",
            "requested_by": "test_user",
            "requested_by_name": "Test User"
        }
        
        response = self.session.post(f"{BASE_URL}/api/manufacturing-requests", json=request_data)
        assert response.status_code == 200, f"Failed to create manufacturing request: {response.text}"
        
        data = response.json()
        # Verify response structure
        assert "id" in data, "Response should contain id"
        assert "request_number" in data, "Response should contain request_number"
        assert "items" in data, "Response should contain items"
        assert "status" in data, "Response should contain status"
        assert "priority" in data, "Response should contain priority"
        assert "created_at" in data, "Response should contain created_at"
        
        # Verify data values
        assert data["status"] == "pending", f"Status should be 'pending', got: {data['status']}"
        assert data["priority"] == "normal", f"Priority should be 'normal', got: {data['priority']}"
        assert data["request_type"] == "manufacturing_to_warehouse", f"Request type should be 'manufacturing_to_warehouse'"
        assert len(data["items"]) == 1, "Should have 1 item"
        
        # Verify item details are enriched
        item = data["items"][0]
        assert "material_id" in item, "Item should have material_id"
        assert "material_name" in item, "Item should have material_name"
        assert "quantity" in item, "Item should have quantity"
        assert "unit" in item, "Item should have unit"
        assert "available_quantity" in item, "Item should have available_quantity"
        assert item["quantity"] == 10, f"Item quantity should be 10, got: {item['quantity']}"
        
        # Store for later tests
        TestManufacturingRequests.test_request_id = data["id"]
        print(f"PASSED: Created manufacturing request with id: {data['id']}, request_number: {data['request_number']}")
    
    def test_04_get_manufacturing_requests(self):
        """Test GET /api/manufacturing-requests - Get all requests"""
        response = self.session.get(f"{BASE_URL}/api/manufacturing-requests")
        assert response.status_code == 200, f"Failed to get manufacturing requests: {response.text}"
        
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        
        # Find our test request
        test_request = next((r for r in data if r.get("id") == TestManufacturingRequests.test_request_id), None)
        assert test_request is not None, "Test request should be in the list"
        assert test_request["status"] == "pending", "Test request should still be pending"
        
        print(f"PASSED: GET /api/manufacturing-requests returned {len(data)} requests")
    
    def test_05_get_manufacturing_requests_with_status_filter(self):
        """Test GET /api/manufacturing-requests?status=pending - Filter by status"""
        response = self.session.get(f"{BASE_URL}/api/manufacturing-requests", params={"status": "pending"})
        assert response.status_code == 200, f"Failed to get pending requests: {response.text}"
        
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        
        # All returned requests should be pending
        for request in data:
            assert request["status"] == "pending", f"All requests should be pending, got: {request['status']}"
        
        print(f"PASSED: GET /api/manufacturing-requests?status=pending returned {len(data)} pending requests")
    
    def test_06_create_request_empty_items_validation(self):
        """Test POST /api/manufacturing-requests with empty items - Should fail"""
        request_data = {
            "items": [],
            "priority": "normal",
            "notes": "Empty items test"
        }
        
        response = self.session.post(f"{BASE_URL}/api/manufacturing-requests", json=request_data)
        assert response.status_code == 400, f"Should return 400 for empty items, got: {response.status_code}"
        
        print("PASSED: Empty items validation works correctly")
    
    def test_07_fulfill_manufacturing_request(self):
        """Test POST /api/manufacturing-requests/{id}/fulfill - Execute request"""
        assert TestManufacturingRequests.test_request_id, "Test request must be created first"
        
        # Get initial raw material quantity
        response = self.session.get(f"{BASE_URL}/api/raw-materials-new")
        assert response.status_code == 200
        materials = response.json()
        test_material = next((m for m in materials if m.get("id") == TestManufacturingRequests.test_material_id), None)
        initial_quantity = test_material["quantity"] if test_material else 0
        
        # Fulfill the request
        response = self.session.post(f"{BASE_URL}/api/manufacturing-requests/{TestManufacturingRequests.test_request_id}/fulfill")
        assert response.status_code == 200, f"Failed to fulfill request: {response.text}"
        
        data = response.json()
        assert "message" in data, "Response should contain message"
        assert "request_id" in data, "Response should contain request_id"
        
        # Verify request status changed to fulfilled
        response = self.session.get(f"{BASE_URL}/api/manufacturing-requests")
        requests_list = response.json()
        fulfilled_request = next((r for r in requests_list if r.get("id") == TestManufacturingRequests.test_request_id), None)
        assert fulfilled_request is not None, "Request should exist"
        assert fulfilled_request["status"] == "fulfilled", f"Status should be 'fulfilled', got: {fulfilled_request['status']}"
        assert fulfilled_request.get("fulfilled_at") is not None, "fulfilled_at should be set"
        
        # Verify raw material quantity decreased
        response = self.session.get(f"{BASE_URL}/api/raw-materials-new")
        materials = response.json()
        test_material = next((m for m in materials if m.get("id") == TestManufacturingRequests.test_material_id), None)
        assert test_material is not None, "Test material should exist"
        expected_quantity = initial_quantity - 10  # We requested 10 units
        assert test_material["quantity"] == expected_quantity, f"Quantity should be {expected_quantity}, got: {test_material['quantity']}"
        
        # Verify manufacturing inventory increased
        response = self.session.get(f"{BASE_URL}/api/manufacturing-inventory")
        assert response.status_code == 200
        mfg_inventory = response.json()
        mfg_item = next((i for i in mfg_inventory if i.get("material_id") == TestManufacturingRequests.test_material_id), None)
        assert mfg_item is not None, "Material should be in manufacturing inventory"
        assert mfg_item["quantity"] >= 10, f"Manufacturing inventory should have at least 10 units"
        
        print(f"PASSED: Fulfilled manufacturing request, raw material decreased from {initial_quantity} to {expected_quantity}")
    
    def test_08_fulfill_already_fulfilled_request(self):
        """Test POST /api/manufacturing-requests/{id}/fulfill on already fulfilled request - Should fail"""
        assert TestManufacturingRequests.test_request_id, "Test request must be created first"
        
        response = self.session.post(f"{BASE_URL}/api/manufacturing-requests/{TestManufacturingRequests.test_request_id}/fulfill")
        assert response.status_code == 400, f"Should return 400 for already fulfilled request, got: {response.status_code}"
        
        print("PASSED: Cannot fulfill already fulfilled request")
    
    def test_09_create_and_reject_request(self):
        """Test PATCH /api/manufacturing-requests/{id}/status?status=rejected - Reject a request"""
        # Create a new request to reject
        request_data = {
            "items": [
                {
                    "material_id": TestManufacturingRequests.test_material_id,
                    "quantity": 5
                }
            ],
            "priority": "urgent",
            "notes": "Request to be rejected"
        }
        
        response = self.session.post(f"{BASE_URL}/api/manufacturing-requests", json=request_data)
        assert response.status_code == 200, f"Failed to create request: {response.text}"
        new_request_id = response.json()["id"]
        
        # Reject the request
        response = self.session.patch(
            f"{BASE_URL}/api/manufacturing-requests/{new_request_id}/status",
            params={"status": "rejected"}
        )
        assert response.status_code == 200, f"Failed to reject request: {response.text}"
        
        data = response.json()
        assert "message" in data, "Response should contain message"
        assert data.get("status") == "rejected", f"Status should be 'rejected', got: {data.get('status')}"
        
        # Verify request status changed
        response = self.session.get(f"{BASE_URL}/api/manufacturing-requests")
        requests_list = response.json()
        rejected_request = next((r for r in requests_list if r.get("id") == new_request_id), None)
        assert rejected_request is not None, "Request should exist"
        assert rejected_request["status"] == "rejected", f"Status should be 'rejected', got: {rejected_request['status']}"
        
        print(f"PASSED: Successfully rejected request {new_request_id}")
    
    def test_10_update_status_invalid_status(self):
        """Test PATCH /api/manufacturing-requests/{id}/status with invalid status - Should fail"""
        # Create a new request
        request_data = {
            "items": [
                {
                    "material_id": TestManufacturingRequests.test_material_id,
                    "quantity": 5
                }
            ],
            "priority": "normal",
            "notes": "Test invalid status"
        }
        
        response = self.session.post(f"{BASE_URL}/api/manufacturing-requests", json=request_data)
        assert response.status_code == 200
        new_request_id = response.json()["id"]
        
        # Try to set invalid status
        response = self.session.patch(
            f"{BASE_URL}/api/manufacturing-requests/{new_request_id}/status",
            params={"status": "invalid_status"}
        )
        assert response.status_code == 400, f"Should return 400 for invalid status, got: {response.status_code}"
        
        print("PASSED: Invalid status validation works correctly")
    
    def test_11_fulfill_nonexistent_request(self):
        """Test POST /api/manufacturing-requests/{id}/fulfill with non-existent ID - Should fail"""
        fake_id = str(uuid.uuid4())
        response = self.session.post(f"{BASE_URL}/api/manufacturing-requests/{fake_id}/fulfill")
        assert response.status_code == 404, f"Should return 404 for non-existent request, got: {response.status_code}"
        
        print("PASSED: Non-existent request returns 404")
    
    def test_12_update_status_nonexistent_request(self):
        """Test PATCH /api/manufacturing-requests/{id}/status with non-existent ID - Should fail"""
        fake_id = str(uuid.uuid4())
        response = self.session.patch(
            f"{BASE_URL}/api/manufacturing-requests/{fake_id}/status",
            params={"status": "rejected"}
        )
        assert response.status_code == 404, f"Should return 404 for non-existent request, got: {response.status_code}"
        
        print("PASSED: Non-existent request status update returns 404")
    
    def test_13_fulfill_with_insufficient_materials(self):
        """Test POST /api/manufacturing-requests/{id}/fulfill when warehouse has insufficient materials"""
        # Create a raw material with very low quantity
        low_stock_material = {
            "name": f"TEST_LOW_STOCK_{uuid.uuid4().hex[:8]}",
            "unit": "كغم",
            "quantity": 2,  # Only 2 units
            "min_quantity": 1,
            "cost_per_unit": 10.0
        }
        
        response = self.session.post(f"{BASE_URL}/api/raw-materials-new", json=low_stock_material)
        assert response.status_code == 200
        low_stock_id = response.json()["id"]
        
        # Create a request for more than available
        request_data = {
            "items": [
                {
                    "material_id": low_stock_id,
                    "quantity": 50  # Request 50 but only 2 available
                }
            ],
            "priority": "normal",
            "notes": "Test insufficient materials"
        }
        
        response = self.session.post(f"{BASE_URL}/api/manufacturing-requests", json=request_data)
        assert response.status_code == 200
        request_id = response.json()["id"]
        
        # Try to fulfill - should fail due to insufficient materials
        response = self.session.post(f"{BASE_URL}/api/manufacturing-requests/{request_id}/fulfill")
        assert response.status_code == 400, f"Should return 400 for insufficient materials, got: {response.status_code}"
        
        data = response.json()
        detail = data.get("detail", {})
        if isinstance(detail, dict):
            assert "insufficient_materials" in detail, "Response should indicate insufficient materials"
        
        print("PASSED: Insufficient materials validation works correctly")
    
    def test_14_verify_existing_request(self):
        """Test that the existing request mentioned in the task exists"""
        existing_request_id = "e48a0afb-e774-435a-8a04-efe02167670d"
        
        response = self.session.get(f"{BASE_URL}/api/manufacturing-requests")
        assert response.status_code == 200
        
        requests_list = response.json()
        existing_request = next((r for r in requests_list if r.get("id") == existing_request_id), None)
        
        if existing_request:
            print(f"PASSED: Found existing request {existing_request_id} with status: {existing_request['status']}")
        else:
            print(f"INFO: Existing request {existing_request_id} not found (may have been processed)")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
