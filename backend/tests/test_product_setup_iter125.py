"""
Test Product Setup Features - Iteration 125
Tests for:
1. POST /api/products - Create product with extras (quantity, unit)
2. POST /api/products - Create product with packaging_items
3. POST /api/products - Create product with recipe_quantities
4. PUT /api/products/{id} - Update product with new extras
5. PUT /api/products/{id} - Update product with new packaging_items
6. GET /api/products - Verify packaging_items, extras, recipe_quantities return correctly
"""

import pytest
import requests
import os
import uuid

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestProductSetup:
    """Test product setup features with extras, packaging_items, recipe_quantities"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test fixtures"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        self.auth_token = None
        self.test_product_ids = []
        self.test_category_id = None
        
    def authenticate(self):
        """Authenticate and get token"""
        response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "demo@maestroegp.com",
            "password": "demo123"
        })
        if response.status_code == 200:
            data = response.json()
            self.auth_token = data.get("token")  # API returns 'token' not 'access_token'
            self.session.headers.update({"Authorization": f"Bearer {self.auth_token}"})
            return True
        return False
    
    def get_or_create_category(self):
        """Get existing category or create one for testing"""
        # Get existing categories
        response = self.session.get(f"{BASE_URL}/api/categories")
        if response.status_code == 200:
            categories = response.json()
            if categories:
                self.test_category_id = categories[0].get("id")
                return self.test_category_id
        
        # Create a test category if none exists
        response = self.session.post(f"{BASE_URL}/api/categories", json={
            "name": "TEST_Category_" + str(uuid.uuid4())[:8],
            "name_en": "Test Category"
        })
        if response.status_code in [200, 201]:
            self.test_category_id = response.json().get("id")
        return self.test_category_id
    
    def cleanup_test_products(self):
        """Cleanup test products after tests"""
        for product_id in self.test_product_ids:
            try:
                self.session.delete(f"{BASE_URL}/api/products/{product_id}")
            except:
                pass
    
    # ==================== API Health Check ====================
    def test_01_api_health(self):
        """Test API is accessible"""
        response = self.session.get(f"{BASE_URL}/api/health")
        assert response.status_code == 200, f"API health check failed: {response.status_code}"
        print("✓ API health check passed")
    
    # ==================== Authentication ====================
    def test_02_authentication(self):
        """Test authentication with demo user"""
        assert self.authenticate(), "Authentication failed"
        assert self.auth_token is not None, "No auth token received"
        print(f"✓ Authentication successful, token: {self.auth_token[:20]}...")
    
    # ==================== Create Product with Extras (quantity, unit) ====================
    def test_03_create_product_with_extras(self):
        """Test creating product with extras containing quantity and unit"""
        assert self.authenticate(), "Authentication required"
        category_id = self.get_or_create_category()
        assert category_id, "Category required for product creation"
        
        product_data = {
            "name": "TEST_Product_Extras_" + str(uuid.uuid4())[:8],
            "name_en": "Test Product with Extras",
            "category_id": category_id,
            "price": 5000,
            "cost": 2000,
            "operating_cost": 500,
            "packaging_cost": 200,
            "is_available": True,
            "extras": [
                {
                    "id": "extra1",
                    "name": "جبنة إضافية",
                    "name_en": "Extra Cheese",
                    "price": 500,
                    "quantity": 2,
                    "unit": "شريحة"
                },
                {
                    "id": "extra2",
                    "name": "صوص حار",
                    "name_en": "Hot Sauce",
                    "price": 250,
                    "quantity": 30,
                    "unit": "غرام"
                }
            ],
            "packaging_items": [],
            "recipe_quantities": []
        }
        
        response = self.session.post(f"{BASE_URL}/api/products", json=product_data)
        assert response.status_code in [200, 201], f"Create product failed: {response.status_code} - {response.text}"
        
        created_product = response.json()
        self.test_product_ids.append(created_product.get("id"))
        
        # Verify extras were saved with quantity and unit
        assert "extras" in created_product, "extras field missing in response"
        assert len(created_product["extras"]) == 2, f"Expected 2 extras, got {len(created_product['extras'])}"
        
        # Check first extra has quantity and unit
        extra1 = created_product["extras"][0]
        assert extra1.get("quantity") == 2, f"Extra quantity mismatch: expected 2, got {extra1.get('quantity')}"
        assert extra1.get("unit") == "شريحة", f"Extra unit mismatch: expected شريحة, got {extra1.get('unit')}"
        
        # Check second extra
        extra2 = created_product["extras"][1]
        assert extra2.get("quantity") == 30, f"Extra quantity mismatch: expected 30, got {extra2.get('quantity')}"
        assert extra2.get("unit") == "غرام", f"Extra unit mismatch: expected غرام, got {extra2.get('unit')}"
        
        print(f"✓ Created product with extras: {created_product['id']}")
        print(f"  - Extra 1: {extra1['name']} - {extra1['quantity']} {extra1['unit']} @ {extra1['price']}")
        print(f"  - Extra 2: {extra2['name']} - {extra2['quantity']} {extra2['unit']} @ {extra2['price']}")
    
    # ==================== Create Product with Packaging Items ====================
    def test_04_create_product_with_packaging_items(self):
        """Test creating product with packaging_items"""
        assert self.authenticate(), "Authentication required"
        category_id = self.get_or_create_category()
        assert category_id, "Category required for product creation"
        
        product_data = {
            "name": "TEST_Product_Packaging_" + str(uuid.uuid4())[:8],
            "name_en": "Test Product with Packaging",
            "category_id": category_id,
            "price": 7500,
            "cost": 3000,
            "operating_cost": 800,
            "packaging_cost": 500,  # Should be calculated from packaging_items
            "is_available": True,
            "extras": [],
            "packaging_items": [
                {
                    "id": "pkg1",
                    "name": "علبة كرتون",
                    "quantity": 1,
                    "unit": "قطعة",
                    "cost_per_unit": 300
                },
                {
                    "id": "pkg2",
                    "name": "أكياس بلاستيك",
                    "quantity": 2,
                    "unit": "قطعة",
                    "cost_per_unit": 100
                }
            ],
            "recipe_quantities": []
        }
        
        response = self.session.post(f"{BASE_URL}/api/products", json=product_data)
        assert response.status_code in [200, 201], f"Create product failed: {response.status_code} - {response.text}"
        
        created_product = response.json()
        self.test_product_ids.append(created_product.get("id"))
        
        # Verify packaging_items were saved
        assert "packaging_items" in created_product, "packaging_items field missing in response"
        assert len(created_product["packaging_items"]) == 2, f"Expected 2 packaging items, got {len(created_product['packaging_items'])}"
        
        # Check packaging items structure
        pkg1 = created_product["packaging_items"][0]
        assert pkg1.get("name") == "علبة كرتون", f"Packaging item name mismatch"
        assert pkg1.get("quantity") == 1, f"Packaging item quantity mismatch"
        assert pkg1.get("cost_per_unit") == 300, f"Packaging item cost_per_unit mismatch"
        
        print(f"✓ Created product with packaging_items: {created_product['id']}")
        for pkg in created_product["packaging_items"]:
            print(f"  - {pkg['name']}: {pkg['quantity']} {pkg.get('unit', 'قطعة')} @ {pkg['cost_per_unit']}")
    
    # ==================== Create Product with Recipe Quantities ====================
    def test_05_create_product_with_recipe_quantities(self):
        """Test creating product with recipe_quantities"""
        assert self.authenticate(), "Authentication required"
        category_id = self.get_or_create_category()
        assert category_id, "Category required for product creation"
        
        product_data = {
            "name": "TEST_Product_Recipe_" + str(uuid.uuid4())[:8],
            "name_en": "Test Product with Recipe",
            "category_id": category_id,
            "price": 10000,
            "cost": 4500,
            "operating_cost": 1000,
            "packaging_cost": 300,
            "is_available": True,
            "extras": [],
            "packaging_items": [],
            "recipe_quantities": [
                {
                    "ingredient_id": "ing1",
                    "name": "دقيق",
                    "quantity": 500,
                    "unit": "غرام"
                },
                {
                    "ingredient_id": "ing2",
                    "name": "زيت",
                    "quantity": 100,
                    "unit": "مل"
                }
            ]
        }
        
        response = self.session.post(f"{BASE_URL}/api/products", json=product_data)
        assert response.status_code in [200, 201], f"Create product failed: {response.status_code} - {response.text}"
        
        created_product = response.json()
        self.test_product_ids.append(created_product.get("id"))
        
        # Verify recipe_quantities were saved
        assert "recipe_quantities" in created_product, "recipe_quantities field missing in response"
        assert len(created_product["recipe_quantities"]) == 2, f"Expected 2 recipe quantities, got {len(created_product['recipe_quantities'])}"
        
        print(f"✓ Created product with recipe_quantities: {created_product['id']}")
        for rq in created_product["recipe_quantities"]:
            print(f"  - {rq.get('name', 'Unknown')}: {rq['quantity']} {rq.get('unit', '')}")
    
    # ==================== Update Product with New Extras ====================
    def test_06_update_product_with_new_extras(self):
        """Test updating product with new extras"""
        assert self.authenticate(), "Authentication required"
        category_id = self.get_or_create_category()
        assert category_id, "Category required"
        
        # First create a product
        product_data = {
            "name": "TEST_Product_Update_Extras_" + str(uuid.uuid4())[:8],
            "name_en": "Test Product for Update",
            "category_id": category_id,
            "price": 6000,
            "cost": 2500,
            "operating_cost": 600,
            "packaging_cost": 250,
            "is_available": True,
            "extras": [
                {"id": "old_extra", "name": "إضافة قديمة", "price": 100, "quantity": 1, "unit": "قطعة"}
            ],
            "packaging_items": [],
            "recipe_quantities": []
        }
        
        create_response = self.session.post(f"{BASE_URL}/api/products", json=product_data)
        assert create_response.status_code in [200, 201], f"Create failed: {create_response.text}"
        
        created_product = create_response.json()
        product_id = created_product.get("id")
        self.test_product_ids.append(product_id)
        
        # Now update with new extras
        update_data = {
            **product_data,
            "extras": [
                {"id": "new_extra1", "name": "إضافة جديدة 1", "price": 300, "quantity": 2, "unit": "ملعقة"},
                {"id": "new_extra2", "name": "إضافة جديدة 2", "price": 400, "quantity": 50, "unit": "غرام"}
            ]
        }
        
        update_response = self.session.put(f"{BASE_URL}/api/products/{product_id}", json=update_data)
        assert update_response.status_code == 200, f"Update failed: {update_response.status_code} - {update_response.text}"
        
        updated_product = update_response.json()
        
        # Verify extras were updated
        assert len(updated_product["extras"]) == 2, f"Expected 2 extras after update, got {len(updated_product['extras'])}"
        
        # Verify new extras have correct quantity and unit
        new_extra1 = updated_product["extras"][0]
        assert new_extra1.get("quantity") == 2, f"Updated extra quantity mismatch"
        assert new_extra1.get("unit") == "ملعقة", f"Updated extra unit mismatch"
        
        print(f"✓ Updated product extras: {product_id}")
        for extra in updated_product["extras"]:
            print(f"  - {extra['name']}: {extra['quantity']} {extra['unit']} @ {extra['price']}")
    
    # ==================== Update Product with New Packaging Items ====================
    def test_07_update_product_with_new_packaging_items(self):
        """Test updating product with new packaging_items"""
        assert self.authenticate(), "Authentication required"
        category_id = self.get_or_create_category()
        assert category_id, "Category required"
        
        # First create a product
        product_data = {
            "name": "TEST_Product_Update_Packaging_" + str(uuid.uuid4())[:8],
            "name_en": "Test Product for Packaging Update",
            "category_id": category_id,
            "price": 8000,
            "cost": 3500,
            "operating_cost": 700,
            "packaging_cost": 400,
            "is_available": True,
            "extras": [],
            "packaging_items": [],
            "recipe_quantities": []
        }
        
        create_response = self.session.post(f"{BASE_URL}/api/products", json=product_data)
        assert create_response.status_code in [200, 201], f"Create failed: {create_response.text}"
        
        created_product = create_response.json()
        product_id = created_product.get("id")
        self.test_product_ids.append(product_id)
        
        # Now update with packaging_items
        update_data = {
            **product_data,
            "packaging_cost": 600,  # Updated cost
            "packaging_items": [
                {"id": "pkg_new1", "name": "صندوق كبير", "quantity": 1, "unit": "قطعة", "cost_per_unit": 400},
                {"id": "pkg_new2", "name": "ورق تغليف", "quantity": 3, "unit": "قطعة", "cost_per_unit": 50}
            ]
        }
        
        update_response = self.session.put(f"{BASE_URL}/api/products/{product_id}", json=update_data)
        assert update_response.status_code == 200, f"Update failed: {update_response.status_code} - {update_response.text}"
        
        updated_product = update_response.json()
        
        # Verify packaging_items were updated
        assert len(updated_product["packaging_items"]) == 2, f"Expected 2 packaging items after update"
        
        print(f"✓ Updated product packaging_items: {product_id}")
        for pkg in updated_product["packaging_items"]:
            print(f"  - {pkg['name']}: {pkg['quantity']} @ {pkg['cost_per_unit']}")
    
    # ==================== GET Products - Verify All Fields Return ====================
    def test_08_get_products_verify_fields(self):
        """Test GET /api/products returns packaging_items, extras, recipe_quantities correctly"""
        assert self.authenticate(), "Authentication required"
        
        response = self.session.get(f"{BASE_URL}/api/products")
        assert response.status_code == 200, f"GET products failed: {response.status_code}"
        
        products = response.json()
        assert isinstance(products, list), "Products should be a list"
        
        # Find test products and verify fields
        test_products_found = 0
        for product in products:
            if product.get("name", "").startswith("TEST_"):
                test_products_found += 1
                
                # Verify all required fields exist
                assert "extras" in product, f"extras field missing in product {product.get('id')}"
                assert "packaging_items" in product, f"packaging_items field missing in product {product.get('id')}"
                assert "recipe_quantities" in product, f"recipe_quantities field missing in product {product.get('id')}"
                
                # Verify extras structure if present
                for extra in product.get("extras", []):
                    assert "name" in extra, "Extra missing name"
                    assert "price" in extra, "Extra missing price"
                    # quantity and unit should be present
                    if "quantity" in extra:
                        assert isinstance(extra["quantity"], (int, float)), "Extra quantity should be numeric"
                    if "unit" in extra:
                        assert isinstance(extra["unit"], str), "Extra unit should be string"
        
        print(f"✓ GET /api/products returned {len(products)} products")
        print(f"  - Found {test_products_found} test products with correct field structure")
    
    # ==================== Verify Product by ID ====================
    def test_09_get_product_by_id_verify_fields(self):
        """Test GET /api/products/{id} returns all fields correctly"""
        assert self.authenticate(), "Authentication required"
        category_id = self.get_or_create_category()
        
        # Create a product with all fields
        product_data = {
            "name": "TEST_Product_GetById_" + str(uuid.uuid4())[:8],
            "name_en": "Test Product Get By ID",
            "category_id": category_id,
            "price": 9000,
            "cost": 4000,
            "operating_cost": 900,
            "packaging_cost": 350,
            "is_available": True,
            "extras": [
                {"id": "e1", "name": "إضافة 1", "price": 200, "quantity": 3, "unit": "كوب"}
            ],
            "packaging_items": [
                {"id": "p1", "name": "علبة", "quantity": 1, "unit": "قطعة", "cost_per_unit": 350}
            ],
            "recipe_quantities": [
                {"ingredient_id": "r1", "name": "مكون 1", "quantity": 200, "unit": "غرام"}
            ]
        }
        
        create_response = self.session.post(f"{BASE_URL}/api/products", json=product_data)
        assert create_response.status_code in [200, 201], f"Create failed: {create_response.text}"
        
        product_id = create_response.json().get("id")
        self.test_product_ids.append(product_id)
        
        # Get product by ID
        get_response = self.session.get(f"{BASE_URL}/api/products/{product_id}")
        assert get_response.status_code == 200, f"GET product by ID failed: {get_response.status_code}"
        
        product = get_response.json()
        
        # Verify all fields
        assert product.get("extras") is not None, "extras field missing"
        assert product.get("packaging_items") is not None, "packaging_items field missing"
        assert product.get("recipe_quantities") is not None, "recipe_quantities field missing"
        
        # Verify extras content
        assert len(product["extras"]) == 1, "Expected 1 extra"
        assert product["extras"][0]["quantity"] == 3, "Extra quantity mismatch"
        assert product["extras"][0]["unit"] == "كوب", "Extra unit mismatch"
        
        # Verify packaging_items content
        assert len(product["packaging_items"]) == 1, "Expected 1 packaging item"
        assert product["packaging_items"][0]["cost_per_unit"] == 350, "Packaging cost_per_unit mismatch"
        
        # Verify recipe_quantities content
        assert len(product["recipe_quantities"]) == 1, "Expected 1 recipe quantity"
        assert product["recipe_quantities"][0]["quantity"] == 200, "Recipe quantity mismatch"
        
        print(f"✓ GET /api/products/{product_id} returned all fields correctly")
        print(f"  - extras: {len(product['extras'])} items")
        print(f"  - packaging_items: {len(product['packaging_items'])} items")
        print(f"  - recipe_quantities: {len(product['recipe_quantities'])} items")
    
    # ==================== Cleanup ====================
    def test_99_cleanup(self):
        """Cleanup test products"""
        assert self.authenticate(), "Authentication required"
        
        deleted_count = 0
        for product_id in self.test_product_ids:
            try:
                response = self.session.delete(f"{BASE_URL}/api/products/{product_id}")
                if response.status_code in [200, 204]:
                    deleted_count += 1
            except Exception as e:
                print(f"  Warning: Could not delete product {product_id}: {e}")
        
        print(f"✓ Cleanup: Deleted {deleted_count}/{len(self.test_product_ids)} test products")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
