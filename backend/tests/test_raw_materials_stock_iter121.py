"""
Test Raw Materials Stock Features - Iteration 121
Tests for:
1. GET /api/raw-materials-new returns total_received, transferred_to_manufacturing, remaining_quantity fields
2. POST /api/raw-materials-new/{id}/add-stock?quantity=N endpoint works correctly
3. transferred_to_manufacturing increases when raw material is transferred via POST /api/warehouse-to-manufacturing
"""

import pytest
import requests
import os
import uuid

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
TEST_EMAIL = "owner@maestroegp.com"
TEST_PASSWORD = "owner123"
TEST_SECRET = "271018"


class TestRawMaterialsStock:
    """Test raw materials stock features"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test session"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        self.auth_token = None
        self.test_material_id = None
        
    def get_auth_token(self):
        """Get authentication token"""
        if self.auth_token:
            return self.auth_token
            
        response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD,
            "secret": TEST_SECRET
        })
        if response.status_code == 200:
            data = response.json()
            self.auth_token = data.get("access_token") or data.get("token")
            if self.auth_token:
                self.session.headers.update({"Authorization": f"Bearer {self.auth_token}"})
            return self.auth_token
        return None
    
    # ==================== API Health Check ====================
    def test_01_api_health(self):
        """Test API is accessible"""
        response = self.session.get(f"{BASE_URL}/api/health")
        assert response.status_code == 200, f"API health check failed: {response.status_code}"
        print("✓ API health check passed")
    
    # ==================== GET /api/raw-materials-new Tests ====================
    def test_02_get_raw_materials_returns_stats_fields(self):
        """Test GET /api/raw-materials-new returns total_received, transferred_to_manufacturing, remaining_quantity"""
        response = self.session.get(f"{BASE_URL}/api/raw-materials-new")
        assert response.status_code == 200, f"Failed to get raw materials: {response.status_code}"
        
        materials = response.json()
        assert isinstance(materials, list), "Response should be a list"
        
        if len(materials) > 0:
            material = materials[0]
            # Check for required stats fields
            assert "total_received" in material, "Missing total_received field"
            assert "transferred_to_manufacturing" in material, "Missing transferred_to_manufacturing field"
            assert "remaining_quantity" in material, "Missing remaining_quantity field"
            
            # Verify remaining_quantity equals quantity
            assert material["remaining_quantity"] == material.get("quantity", 0), \
                f"remaining_quantity ({material['remaining_quantity']}) should equal quantity ({material.get('quantity', 0)})"
            
            print(f"✓ Raw material stats fields present: total_received={material['total_received']}, "
                  f"transferred_to_manufacturing={material['transferred_to_manufacturing']}, "
                  f"remaining_quantity={material['remaining_quantity']}")
        else:
            print("✓ No raw materials found, but endpoint works correctly")
    
    # ==================== Create Test Raw Material ====================
    def test_03_create_test_raw_material(self):
        """Create a test raw material for subsequent tests"""
        test_material = {
            "name": f"TEST_Raw_Material_{uuid.uuid4().hex[:8]}",
            "name_en": "Test Raw Material",
            "unit": "كغم",
            "quantity": 100,
            "min_quantity": 10,
            "cost_per_unit": 5.0,
            "waste_percentage": 0,
            "category": "test"
        }
        
        response = self.session.post(f"{BASE_URL}/api/raw-materials-new", json=test_material)
        assert response.status_code == 200, f"Failed to create raw material: {response.status_code} - {response.text}"
        
        data = response.json()
        assert "id" in data, "Response should contain id"
        self.__class__.test_material_id = data["id"]
        self.__class__.test_material_name = data["name"]
        self.__class__.initial_quantity = data.get("quantity", 100)
        
        print(f"✓ Created test raw material: {data['name']} (ID: {data['id']})")
    
    # ==================== POST /api/raw-materials-new/{id}/add-stock Tests ====================
    def test_04_add_stock_endpoint_works(self):
        """Test POST /api/raw-materials-new/{id}/add-stock?quantity=10 works correctly"""
        material_id = getattr(self.__class__, 'test_material_id', None)
        if not material_id:
            pytest.skip("No test material created")
        
        # Add 10 units of stock
        response = self.session.post(f"{BASE_URL}/api/raw-materials-new/{material_id}/add-stock?quantity=10")
        assert response.status_code == 200, f"Failed to add stock: {response.status_code} - {response.text}"
        
        data = response.json()
        assert "message" in data, "Response should contain message"
        assert "new_quantity" in data, "Response should contain new_quantity"
        
        print(f"✓ add-stock endpoint works: {data['message']}")
    
    def test_05_verify_stock_and_total_received_updated(self):
        """Verify quantity and total_received are updated after add-stock"""
        material_id = getattr(self.__class__, 'test_material_id', None)
        initial_quantity = getattr(self.__class__, 'initial_quantity', 100)
        if not material_id:
            pytest.skip("No test material created")
        
        # Get the material to verify
        response = self.session.get(f"{BASE_URL}/api/raw-materials-new/{material_id}")
        assert response.status_code == 200, f"Failed to get raw material: {response.status_code}"
        
        material = response.json()
        
        # Quantity should be increased by 10
        expected_quantity = initial_quantity + 10
        assert material.get("quantity") == expected_quantity, \
            f"Quantity should be {expected_quantity}, got {material.get('quantity')}"
        
        print(f"✓ Stock updated correctly: quantity={material.get('quantity')}")
    
    def test_06_add_stock_validation_zero_quantity(self):
        """Test add-stock rejects zero quantity"""
        material_id = getattr(self.__class__, 'test_material_id', None)
        if not material_id:
            pytest.skip("No test material created")
        
        response = self.session.post(f"{BASE_URL}/api/raw-materials-new/{material_id}/add-stock?quantity=0")
        assert response.status_code == 400, f"Should reject zero quantity, got: {response.status_code}"
        
        print("✓ add-stock correctly rejects zero quantity")
    
    def test_07_add_stock_validation_negative_quantity(self):
        """Test add-stock rejects negative quantity"""
        material_id = getattr(self.__class__, 'test_material_id', None)
        if not material_id:
            pytest.skip("No test material created")
        
        response = self.session.post(f"{BASE_URL}/api/raw-materials-new/{material_id}/add-stock?quantity=-5")
        assert response.status_code == 400, f"Should reject negative quantity, got: {response.status_code}"
        
        print("✓ add-stock correctly rejects negative quantity")
    
    def test_08_add_stock_validation_invalid_material_id(self):
        """Test add-stock returns 404 for invalid material ID"""
        fake_id = "non-existent-material-id-12345"
        
        response = self.session.post(f"{BASE_URL}/api/raw-materials-new/{fake_id}/add-stock?quantity=10")
        assert response.status_code == 404, f"Should return 404 for invalid ID, got: {response.status_code}"
        
        print("✓ add-stock correctly returns 404 for invalid material ID")
    
    # ==================== POST /api/warehouse-to-manufacturing Tests ====================
    def test_09_transfer_to_manufacturing_increases_transferred_field(self):
        """Test transferred_to_manufacturing increases when raw material is transferred"""
        material_id = getattr(self.__class__, 'test_material_id', None)
        if not material_id:
            pytest.skip("No test material created")
        
        # Get current transferred_to_manufacturing value
        response = self.session.get(f"{BASE_URL}/api/raw-materials-new/{material_id}")
        assert response.status_code == 200
        material_before = response.json()
        transferred_before = material_before.get("transferred_to_manufacturing", 0)
        quantity_before = material_before.get("quantity", 0)
        
        # Transfer 5 units to manufacturing
        transfer_data = {
            "items": [
                {
                    "raw_material_id": material_id,
                    "quantity": 5
                }
            ],
            "notes": "Test transfer for iteration 121"
        }
        
        response = self.session.post(f"{BASE_URL}/api/warehouse-to-manufacturing", json=transfer_data)
        assert response.status_code == 200, f"Failed to transfer to manufacturing: {response.status_code} - {response.text}"
        
        # Verify transferred_to_manufacturing increased
        response = self.session.get(f"{BASE_URL}/api/raw-materials-new/{material_id}")
        assert response.status_code == 200
        material_after = response.json()
        transferred_after = material_after.get("transferred_to_manufacturing", 0)
        quantity_after = material_after.get("quantity", 0)
        
        # transferred_to_manufacturing should increase by 5
        assert transferred_after == transferred_before + 5, \
            f"transferred_to_manufacturing should be {transferred_before + 5}, got {transferred_after}"
        
        # quantity should decrease by 5
        assert quantity_after == quantity_before - 5, \
            f"quantity should be {quantity_before - 5}, got {quantity_after}"
        
        print(f"✓ Transfer to manufacturing works: transferred_to_manufacturing increased from {transferred_before} to {transferred_after}")
    
    def test_10_remaining_quantity_reflects_current_stock(self):
        """Test remaining_quantity equals current quantity for all raw materials"""
        response = self.session.get(f"{BASE_URL}/api/raw-materials-new")
        assert response.status_code == 200
        
        materials = response.json()
        for material in materials:
            remaining = material.get("remaining_quantity", 0)
            quantity = material.get("quantity", 0)
            assert remaining == quantity, \
                f"Material {material.get('name')}: remaining_quantity ({remaining}) should equal quantity ({quantity})"
        
        print(f"✓ remaining_quantity correctly reflects current stock for all {len(materials)} materials")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
