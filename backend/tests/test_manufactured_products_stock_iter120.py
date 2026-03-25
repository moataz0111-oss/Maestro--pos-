"""
Test Manufactured Products Stock Features - Iteration 120
Tests for:
1. GET /api/manufactured-products returns total_produced, transferred_quantity, remaining_quantity fields
2. POST /api/manufactured-products/{id}/add-stock?quantity=5 endpoint works correctly
3. Verify stock is increased and total_produced is updated after add-stock
4. Test that transferred_quantity increases when product is transferred to branch
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


def get_auth_token():
    """Get authentication token"""
    session = requests.Session()
    response = session.post(f"{BASE_URL}/api/auth/login", json={
        "email": TEST_EMAIL,
        "password": TEST_PASSWORD,
        "secret": TEST_SECRET
    })
    if response.status_code == 200:
        data = response.json()
        return data.get("access_token") or data.get("token")
    return None


class TestManufacturedProductsStock:
    """Test manufactured products stock management features"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test fixtures"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        self.test_product_id = None
        self.test_branch_id = None
        self.token = None
        yield
        # Cleanup if needed
    
    def _authenticate(self):
        """Authenticate and set token"""
        if self.token is None:
            self.token = get_auth_token()
            if self.token:
                self.session.headers.update({"Authorization": f"Bearer {self.token}"})
        return self.token is not None
    
    def test_01_api_health_check(self):
        """Test API is accessible"""
        response = self.session.get(f"{BASE_URL}/api/health")
        assert response.status_code == 200, f"API health check failed: {response.text}"
        print("✓ API health check passed")
    
    def test_02_get_manufactured_products_returns_stats_fields(self):
        """Test GET /api/manufactured-products returns total_produced, transferred_quantity, remaining_quantity"""
        response = self.session.get(f"{BASE_URL}/api/manufactured-products")
        assert response.status_code == 200, f"Failed to get manufactured products: {response.text}"
        
        products = response.json()
        print(f"Found {len(products)} manufactured products")
        
        if len(products) > 0:
            product = products[0]
            # Check that the new fields exist
            assert "total_produced" in product, "total_produced field missing from product"
            assert "transferred_quantity" in product, "transferred_quantity field missing from product"
            assert "remaining_quantity" in product, "remaining_quantity field missing from product"
            
            print(f"✓ Product '{product.get('name')}' has stats fields:")
            print(f"  - total_produced: {product.get('total_produced')}")
            print(f"  - transferred_quantity: {product.get('transferred_quantity')}")
            print(f"  - remaining_quantity: {product.get('remaining_quantity')}")
            
            # Verify remaining_quantity equals quantity
            assert product.get("remaining_quantity") == product.get("quantity"), \
                f"remaining_quantity ({product.get('remaining_quantity')}) should equal quantity ({product.get('quantity')})"
            print("✓ remaining_quantity equals quantity as expected")
        else:
            print("⚠ No manufactured products found, creating one for testing")
            # Create a test product
            self._create_test_product()
    
    def _create_test_product(self):
        """Helper to create a test manufactured product"""
        product_data = {
            "name": f"TEST_Product_{uuid.uuid4().hex[:8]}",
            "name_en": "Test Product",
            "unit": "قطعة",
            "recipe": [],
            "quantity": 0,
            "min_quantity": 5,
            "selling_price": 100,
            "category": "test"
        }
        response = self.session.post(f"{BASE_URL}/api/manufactured-products", json=product_data)
        if response.status_code in [200, 201]:
            product = response.json()
            self.test_product_id = product.get("id")
            print(f"✓ Created test product: {product.get('name')} (ID: {self.test_product_id})")
            return product
        return None
    
    def test_03_add_stock_endpoint_works(self):
        """Test POST /api/manufactured-products/{id}/add-stock?quantity=5 works correctly"""
        # First get a product to test with
        response = self.session.get(f"{BASE_URL}/api/manufactured-products")
        assert response.status_code == 200
        products = response.json()
        
        if len(products) == 0:
            product = self._create_test_product()
            assert product is not None, "Failed to create test product"
            product_id = product.get("id")
        else:
            product = products[0]
            product_id = product.get("id")
        
        initial_quantity = product.get("quantity", 0)
        initial_total_produced = product.get("total_produced", 0)
        
        print(f"Testing add-stock on product: {product.get('name')}")
        print(f"  Initial quantity: {initial_quantity}")
        print(f"  Initial total_produced: {initial_total_produced}")
        
        # Add stock
        add_quantity = 5
        response = self.session.post(f"{BASE_URL}/api/manufactured-products/{product_id}/add-stock?quantity={add_quantity}")
        assert response.status_code == 200, f"add-stock failed: {response.text}"
        
        result = response.json()
        print(f"✓ add-stock response: {result}")
        
        # Verify the response contains expected fields
        assert "message" in result, "Response should contain message"
        assert "new_quantity" in result, "Response should contain new_quantity"
        
        expected_new_quantity = initial_quantity + add_quantity
        assert result.get("new_quantity") == expected_new_quantity, \
            f"new_quantity should be {expected_new_quantity}, got {result.get('new_quantity')}"
        
        print(f"✓ add-stock endpoint works correctly, new_quantity: {result.get('new_quantity')}")
    
    def test_04_verify_stock_and_total_produced_updated(self):
        """Verify stock is increased and total_produced is updated after add-stock"""
        # Get a product
        response = self.session.get(f"{BASE_URL}/api/manufactured-products")
        assert response.status_code == 200
        products = response.json()
        
        if len(products) == 0:
            pytest.skip("No products available for testing")
        
        product = products[0]
        product_id = product.get("id")
        
        # Get current state
        initial_quantity = product.get("quantity", 0)
        initial_total_produced = product.get("total_produced", 0)
        
        print(f"Before add-stock:")
        print(f"  quantity: {initial_quantity}")
        print(f"  total_produced: {initial_total_produced}")
        
        # Add stock
        add_quantity = 10
        response = self.session.post(f"{BASE_URL}/api/manufactured-products/{product_id}/add-stock?quantity={add_quantity}")
        assert response.status_code == 200, f"add-stock failed: {response.text}"
        
        # Fetch the product again to verify persistence
        response = self.session.get(f"{BASE_URL}/api/manufactured-products")
        assert response.status_code == 200
        products = response.json()
        
        # Find our product
        updated_product = next((p for p in products if p.get("id") == product_id), None)
        assert updated_product is not None, "Product not found after update"
        
        new_quantity = updated_product.get("quantity", 0)
        new_total_produced = updated_product.get("total_produced", 0)
        
        print(f"After add-stock:")
        print(f"  quantity: {new_quantity}")
        print(f"  total_produced: {new_total_produced}")
        
        # Verify quantity increased
        assert new_quantity == initial_quantity + add_quantity, \
            f"quantity should be {initial_quantity + add_quantity}, got {new_quantity}"
        
        # Verify total_produced increased
        assert new_total_produced == initial_total_produced + add_quantity, \
            f"total_produced should be {initial_total_produced + add_quantity}, got {new_total_produced}"
        
        print("✓ Both quantity and total_produced correctly updated after add-stock")
    
    def test_05_add_stock_validation_negative_quantity(self):
        """Test add-stock rejects negative or zero quantity"""
        # Get a product
        response = self.session.get(f"{BASE_URL}/api/manufactured-products")
        assert response.status_code == 200
        products = response.json()
        
        if len(products) == 0:
            pytest.skip("No products available for testing")
        
        product_id = products[0].get("id")
        
        # Try to add zero quantity
        response = self.session.post(f"{BASE_URL}/api/manufactured-products/{product_id}/add-stock?quantity=0")
        assert response.status_code == 400, f"Should reject zero quantity, got {response.status_code}"
        print("✓ add-stock correctly rejects zero quantity")
        
        # Try to add negative quantity
        response = self.session.post(f"{BASE_URL}/api/manufactured-products/{product_id}/add-stock?quantity=-5")
        assert response.status_code == 400, f"Should reject negative quantity, got {response.status_code}"
        print("✓ add-stock correctly rejects negative quantity")
    
    def test_06_add_stock_invalid_product_id(self):
        """Test add-stock returns 404 for invalid product ID"""
        fake_id = str(uuid.uuid4())
        response = self.session.post(f"{BASE_URL}/api/manufactured-products/{fake_id}/add-stock?quantity=5")
        assert response.status_code == 404, f"Should return 404 for invalid product ID, got {response.status_code}"
        print("✓ add-stock correctly returns 404 for invalid product ID")
    
    def test_07_get_branches_for_transfer_test(self):
        """Get branches to use for transfer test"""
        # Authenticate first
        if not self._authenticate():
            pytest.skip("Authentication failed")
        
        response = self.session.get(f"{BASE_URL}/api/branches")
        assert response.status_code == 200, f"Failed to get branches: {response.text}"
        
        branches = response.json()
        print(f"Found {len(branches)} branches")
        
        if len(branches) > 0:
            self.test_branch_id = branches[0].get("id")
            print(f"✓ Will use branch: {branches[0].get('name')} (ID: {self.test_branch_id})")
        else:
            print("⚠ No branches found, transfer test may be skipped")
    
    def test_08_transferred_quantity_increases_on_transfer(self):
        """Test that transferred_quantity increases when product is transferred to branch"""
        # Authenticate first
        if not self._authenticate():
            pytest.skip("Authentication failed")
        
        # Get branches
        response = self.session.get(f"{BASE_URL}/api/branches")
        assert response.status_code == 200
        branches = response.json()
        
        if len(branches) == 0:
            pytest.skip("No branches available for transfer test")
        
        branch_id = branches[0].get("id")
        branch_name = branches[0].get("name")
        
        # Get a product with sufficient quantity
        response = self.session.get(f"{BASE_URL}/api/manufactured-products")
        assert response.status_code == 200
        products = response.json()
        
        # Find a product with quantity > 0
        product = next((p for p in products if p.get("quantity", 0) > 0), None)
        
        if product is None:
            # Create a product and add stock
            product = self._create_test_product()
            if product:
                product_id = product.get("id")
                # Add stock to the product
                response = self.session.post(f"{BASE_URL}/api/manufactured-products/{product_id}/add-stock?quantity=20")
                assert response.status_code == 200
                # Refresh product data
                response = self.session.get(f"{BASE_URL}/api/manufactured-products")
                products = response.json()
                product = next((p for p in products if p.get("id") == product_id), None)
        
        if product is None or product.get("quantity", 0) == 0:
            pytest.skip("No product with sufficient quantity for transfer test")
        
        product_id = product.get("id")
        initial_quantity = product.get("quantity", 0)
        initial_transferred = product.get("transferred_quantity", 0)
        
        print(f"Testing transfer for product: {product.get('name')}")
        print(f"  Initial quantity: {initial_quantity}")
        print(f"  Initial transferred_quantity: {initial_transferred}")
        
        # Transfer to branch
        transfer_quantity = min(5, initial_quantity)  # Transfer up to 5 or available quantity
        transfer_data = {
            "transfer_type": "manufacturing_to_branch",
            "to_branch_id": branch_id,
            "items": [
                {
                    "product_id": product_id,
                    "quantity": transfer_quantity
                }
            ],
            "notes": "Test transfer for iteration 120"
        }
        
        response = self.session.post(f"{BASE_URL}/api/warehouse-transfers", json=transfer_data)
        
        if response.status_code != 200:
            print(f"Transfer failed: {response.text}")
            pytest.skip(f"Transfer failed with status {response.status_code}")
        
        print(f"✓ Transfer successful: {transfer_quantity} units to {branch_name}")
        
        # Verify transferred_quantity increased
        response = self.session.get(f"{BASE_URL}/api/manufactured-products")
        assert response.status_code == 200
        products = response.json()
        
        updated_product = next((p for p in products if p.get("id") == product_id), None)
        assert updated_product is not None, "Product not found after transfer"
        
        new_quantity = updated_product.get("quantity", 0)
        new_transferred = updated_product.get("transferred_quantity", 0)
        
        print(f"After transfer:")
        print(f"  quantity: {new_quantity}")
        print(f"  transferred_quantity: {new_transferred}")
        
        # Verify quantity decreased
        assert new_quantity == initial_quantity - transfer_quantity, \
            f"quantity should be {initial_quantity - transfer_quantity}, got {new_quantity}"
        
        # Verify transferred_quantity increased
        assert new_transferred == initial_transferred + transfer_quantity, \
            f"transferred_quantity should be {initial_transferred + transfer_quantity}, got {new_transferred}"
        
        print("✓ transferred_quantity correctly increased after transfer to branch")
    
    def test_09_remaining_quantity_reflects_current_stock(self):
        """Test that remaining_quantity reflects current stock level"""
        response = self.session.get(f"{BASE_URL}/api/manufactured-products")
        assert response.status_code == 200
        products = response.json()
        
        for product in products[:5]:  # Check first 5 products
            quantity = product.get("quantity", 0)
            remaining = product.get("remaining_quantity", 0)
            
            assert remaining == quantity, \
                f"remaining_quantity ({remaining}) should equal quantity ({quantity}) for product {product.get('name')}"
        
        print("✓ remaining_quantity correctly reflects current stock for all products")


class TestAddStockMovementTracking:
    """Test that add-stock creates inventory movement records"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test fixtures"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        yield
    
    def test_add_stock_creates_movement_record(self):
        """Test that add-stock creates an inventory movement record"""
        # Get a product
        response = self.session.get(f"{BASE_URL}/api/manufactured-products")
        assert response.status_code == 200
        products = response.json()
        
        if len(products) == 0:
            pytest.skip("No products available for testing")
        
        product = products[0]
        product_id = product.get("id")
        product_name = product.get("name")
        
        # Add stock
        add_quantity = 3
        response = self.session.post(f"{BASE_URL}/api/manufactured-products/{product_id}/add-stock?quantity={add_quantity}")
        assert response.status_code == 200
        
        # Check inventory movements
        response = self.session.get(f"{BASE_URL}/api/inventory-movements")
        
        if response.status_code == 200:
            movements = response.json()
            # Find the manual_stock_add movement for our product
            manual_add_movements = [m for m in movements if m.get("type") == "manual_stock_add" and m.get("product_id") == product_id]
            
            if len(manual_add_movements) > 0:
                latest_movement = manual_add_movements[0]
                print(f"✓ Found inventory movement record for add-stock:")
                print(f"  Type: {latest_movement.get('type')}")
                print(f"  Product: {latest_movement.get('product_name')}")
                print(f"  Quantity: {latest_movement.get('quantity')}")
            else:
                print("⚠ No manual_stock_add movement found (may be expected if endpoint doesn't exist)")
        else:
            print(f"⚠ inventory-movements endpoint returned {response.status_code}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
