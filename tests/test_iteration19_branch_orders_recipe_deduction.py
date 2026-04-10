"""
Iteration 19 - Branch Orders with Recipe System and Auto Raw Material Deduction Tests

Tests for:
1. POST /api/branch-orders - Create branch order with auto raw material deduction
2. Verify correct quantities are deducted from raw materials after order creation
3. Prevent order creation for products without recipe
4. Prevent order creation when raw materials are insufficient
5. Display recipe status in products list (available/no recipe)
6. Display deducted raw materials in order details
"""

import pytest
import requests
import os
import uuid
from datetime import datetime

# Get API URL from environment
BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')
if not BASE_URL:
    BASE_URL = "https://pos-closing-fixes.preview.emergentagent.com"

API_URL = f"{BASE_URL}/api"

# Test credentials
ADMIN_EMAIL = "admin@maestroegp.com"
ADMIN_PASSWORD = "admin123"


class TestBranchOrdersRecipeDeduction:
    """Test branch orders with recipe-based raw material deduction"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test session with authentication"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        self.token = None
        self.test_raw_materials = []
        self.test_finished_products = []
        self.test_orders = []
        self.branch_id = None
        
        # Login
        login_response = self.session.post(f"{API_URL}/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        assert login_response.status_code == 200, f"Login failed: {login_response.text}"
        self.token = login_response.json().get("token")
        self.session.headers.update({"Authorization": f"Bearer {self.token}"})
        
        # Get first branch
        branches_response = self.session.get(f"{API_URL}/branches")
        if branches_response.status_code == 200 and branches_response.json():
            self.branch_id = branches_response.json()[0]["id"]
        
        yield
        
        # Cleanup
        self._cleanup_test_data()
    
    def _cleanup_test_data(self):
        """Clean up test data after tests"""
        # Delete test orders
        for order_id in self.test_orders:
            try:
                self.session.delete(f"{API_URL}/branch-orders/{order_id}")
            except:
                pass
        
        # Delete test finished products
        for product_id in self.test_finished_products:
            try:
                self.session.delete(f"{API_URL}/finished-products/{product_id}")
            except:
                pass
        
        # Delete test raw materials
        for material_id in self.test_raw_materials:
            try:
                self.session.delete(f"{API_URL}/inventory/{material_id}")
            except:
                pass
    
    def _create_raw_material(self, name, quantity, unit="كغ"):
        """Helper to create a raw material using /api/inventory"""
        response = self.session.post(f"{API_URL}/inventory", json={
            "name": f"TEST_{name}_{uuid.uuid4().hex[:6]}",
            "unit": unit,
            "quantity": quantity,
            "min_quantity": 1,
            "cost_per_unit": 1000,
            "branch_id": self.branch_id or "warehouse",
            "item_type": "raw"
        })
        if response.status_code == 200:
            material = response.json()
            self.test_raw_materials.append(material["id"])
            return material
        print(f"Failed to create raw material: {response.status_code} - {response.text}")
        return None
    
    def _create_finished_product_with_recipe(self, name, recipe):
        """Helper to create a finished product with recipe using /api/finished-products"""
        response = self.session.post(f"{API_URL}/finished-products", json={
            "name": f"TEST_{name}_{uuid.uuid4().hex[:6]}",
            "unit": "قطعة",
            "quantity": 0,
            "min_quantity": 0,
            "selling_price": 10000,
            "recipe": recipe,
            "category": "test"
        })
        if response.status_code == 200:
            product = response.json()
            self.test_finished_products.append(product["id"])
            return product
        print(f"Failed to create finished product: {response.status_code} - {response.text}")
        return None
    
    def _create_finished_product_without_recipe(self, name):
        """Helper to create a finished product WITHOUT recipe using /api/inventory"""
        response = self.session.post(f"{API_URL}/inventory", json={
            "name": f"TEST_{name}_{uuid.uuid4().hex[:6]}",
            "unit": "قطعة",
            "quantity": 0,
            "min_quantity": 0,
            "cost_per_unit": 5000,
            "branch_id": self.branch_id or "warehouse",
            "item_type": "finished"
        })
        if response.status_code == 200:
            product = response.json()
            self.test_finished_products.append(product["id"])
            return product
        print(f"Failed to create finished product without recipe: {response.status_code} - {response.text}")
        return None
    
    # ==================== HEALTH CHECK ====================
    
    def test_01_health_check(self):
        """Test API health endpoint"""
        response = self.session.get(f"{API_URL}/health")
        assert response.status_code == 200
        assert response.json().get("status") == "ok"
        print("✅ Health check passed")
    
    # ==================== AUTHENTICATION ====================
    
    def test_02_branch_orders_requires_auth(self):
        """Test that branch-orders endpoint requires authentication"""
        no_auth_session = requests.Session()
        response = no_auth_session.get(f"{API_URL}/branch-orders")
        assert response.status_code in [401, 403], f"Expected 401/403, got {response.status_code}"
        print("✅ Branch orders requires authentication")
    
    # ==================== RAW MATERIALS ====================
    
    def test_03_get_raw_materials(self):
        """Test GET /api/raw-materials returns raw materials"""
        response = self.session.get(f"{API_URL}/raw-materials")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✅ GET /api/raw-materials returned {len(data)} items")
    
    # ==================== FINISHED PRODUCTS ====================
    
    def test_04_get_finished_products(self):
        """Test GET /api/finished-products returns finished products"""
        response = self.session.get(f"{API_URL}/finished-products")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✅ GET /api/finished-products returned {len(data)} items")
    
    def test_05_finished_products_show_recipe_status(self):
        """Test that finished products show recipe status (has recipe or not)"""
        # Create raw material
        raw_material = self._create_raw_material("لحم_للوصفة", 100)
        assert raw_material, "Failed to create raw material"
        
        # Create product WITH recipe using /api/finished-products
        product_with_recipe = self._create_finished_product_with_recipe("برغر_مع_وصفة", recipe=[{
            "raw_material_id": raw_material["id"],
            "quantity": 0.5
        }])
        assert product_with_recipe, "Failed to create product with recipe"
        
        # Create product WITHOUT recipe using /api/inventory
        product_without_recipe = self._create_finished_product_without_recipe("برغر_بدون_وصفة")
        assert product_without_recipe, "Failed to create product without recipe"
        
        # Get finished products
        response = self.session.get(f"{API_URL}/finished-products")
        assert response.status_code == 200
        products = response.json()
        
        # Find our test products
        with_recipe = next((p for p in products if p["id"] == product_with_recipe["id"]), None)
        without_recipe = next((p for p in products if p["id"] == product_without_recipe["id"]), None)
        
        assert with_recipe, "Product with recipe not found"
        assert without_recipe, "Product without recipe not found"
        
        # Verify recipe status
        assert with_recipe.get("recipe") and len(with_recipe["recipe"]) > 0, "Product should have recipe"
        assert not without_recipe.get("recipe") or len(without_recipe.get("recipe", [])) == 0, "Product should not have recipe"
        
        print("✅ Finished products correctly show recipe status")
    
    # ==================== BRANCH ORDERS - CREATION ====================
    
    def test_06_create_branch_order_with_recipe_deduction(self):
        """Test POST /api/branch-orders creates order and deducts raw materials"""
        # Create raw materials with known quantities
        raw_material_1 = self._create_raw_material("لحم_صب_اختبار", 50)
        raw_material_2 = self._create_raw_material("خبز_برغر_اختبار", 200, unit="قطعة")
        
        assert raw_material_1, "Failed to create raw material 1"
        assert raw_material_2, "Failed to create raw material 2"
        
        initial_qty_1 = raw_material_1["quantity"]
        initial_qty_2 = raw_material_2["quantity"]
        
        # Create finished product with recipe using /api/finished-products
        recipe = [
            {"raw_material_id": raw_material_1["id"], "quantity": 0.5},  # 0.5 kg per burger
            {"raw_material_id": raw_material_2["id"], "quantity": 2}     # 2 pieces of bread per burger
        ]
        
        finished_product = self._create_finished_product_with_recipe("برغر_لحم_اختبار", recipe=recipe)
        assert finished_product, "Failed to create finished product"
        assert finished_product.get("recipe"), "Finished product should have recipe"
        
        # Create branch order for 3 burgers
        order_qty = 3
        response = self.session.post(f"{API_URL}/branch-orders", json={
            "to_branch_id": self.branch_id,
            "items": [{"product_id": finished_product["id"], "quantity": order_qty}],
            "priority": "normal",
            "notes": "طلب اختبار للخصم التلقائي"
        })
        
        assert response.status_code == 200, f"Failed to create order: {response.text}"
        order = response.json()
        self.test_orders.append(order["id"])
        
        # Verify order was created
        assert order.get("order_number"), "Order should have order_number"
        assert order.get("status") == "pending", "Order status should be pending"
        assert order.get("items"), "Order should have items"
        
        # Verify raw_materials_deducted is in response
        assert "raw_materials_deducted" in order, "Order should have raw_materials_deducted"
        deducted = order["raw_materials_deducted"]
        assert len(deducted) == 2, f"Should have 2 deducted materials, got {len(deducted)}"
        
        print(f"✅ Branch order created: {order['order_number']}")
        print(f"   Raw materials deducted: {len(deducted)} items")
        
        # Verify quantities were deducted correctly
        response_1 = self.session.get(f"{API_URL}/inventory/{raw_material_1['id']}")
        response_2 = self.session.get(f"{API_URL}/inventory/{raw_material_2['id']}")
        
        if response_1.status_code == 200:
            updated_qty_1 = response_1.json().get("quantity", 0)
            expected_qty_1 = initial_qty_1 - (0.5 * order_qty)  # 50 - 1.5 = 48.5
            assert abs(updated_qty_1 - expected_qty_1) < 0.01, f"Raw material 1: expected {expected_qty_1}, got {updated_qty_1}"
            print(f"   ✅ {raw_material_1['name']}: {initial_qty_1} → {updated_qty_1} (خصم {0.5 * order_qty})")
        
        if response_2.status_code == 200:
            updated_qty_2 = response_2.json().get("quantity", 0)
            expected_qty_2 = initial_qty_2 - (2 * order_qty)  # 200 - 6 = 194
            assert abs(updated_qty_2 - expected_qty_2) < 0.01, f"Raw material 2: expected {expected_qty_2}, got {updated_qty_2}"
            print(f"   ✅ {raw_material_2['name']}: {initial_qty_2} → {updated_qty_2} (خصم {2 * order_qty})")
    
    def test_07_prevent_order_for_product_without_recipe(self):
        """Test that order creation fails for products without recipe"""
        # Create product WITHOUT recipe using /api/inventory
        product_no_recipe = self._create_finished_product_without_recipe("منتج_بدون_وصفة")
        assert product_no_recipe, "Failed to create product"
        
        # Try to create order
        response = self.session.post(f"{API_URL}/branch-orders", json={
            "to_branch_id": self.branch_id,
            "items": [{"product_id": product_no_recipe["id"], "quantity": 1}],
            "priority": "normal"
        })
        
        # Should fail with 400
        assert response.status_code == 400, f"Expected 400, got {response.status_code}"
        
        error_detail = response.json().get("detail", {})
        if isinstance(error_detail, dict):
            assert "products_without_recipe" in error_detail or "message" in error_detail
            print(f"✅ Order rejected for product without recipe: {error_detail.get('message', error_detail)}")
        else:
            print(f"✅ Order rejected: {error_detail}")
    
    def test_08_prevent_order_when_raw_materials_insufficient(self):
        """Test that order creation fails when raw materials are insufficient"""
        # Create raw material with LOW quantity
        raw_material = self._create_raw_material("مادة_قليلة", 1)  # Only 1 kg
        assert raw_material, "Failed to create raw material"
        
        # Create product with recipe requiring MORE than available
        recipe = [{"raw_material_id": raw_material["id"], "quantity": 2}]  # 2 kg per unit
        
        finished_product = self._create_finished_product_with_recipe("منتج_يحتاج_كثير", recipe=recipe)
        assert finished_product, "Failed to create finished product"
        
        # Try to create order for 1 unit (needs 2 kg, only 1 kg available)
        response = self.session.post(f"{API_URL}/branch-orders", json={
            "to_branch_id": self.branch_id,
            "items": [{"product_id": finished_product["id"], "quantity": 1}],
            "priority": "normal"
        })
        
        # Should fail with 400
        assert response.status_code == 400, f"Expected 400, got {response.status_code}"
        
        error_detail = response.json().get("detail", {})
        if isinstance(error_detail, dict):
            assert "insufficient_materials" in error_detail or "message" in error_detail
            print(f"✅ Order rejected for insufficient materials: {error_detail.get('message', error_detail)}")
        else:
            print(f"✅ Order rejected: {error_detail}")
    
    def test_09_reject_empty_items_order(self):
        """Test that order creation fails with empty items"""
        response = self.session.post(f"{API_URL}/branch-orders", json={
            "to_branch_id": self.branch_id,
            "items": [],
            "priority": "normal"
        })
        
        assert response.status_code == 400, f"Expected 400, got {response.status_code}"
        print("✅ Order rejected for empty items")
    
    # ==================== BRANCH ORDERS - RETRIEVAL ====================
    
    def test_10_get_branch_orders(self):
        """Test GET /api/branch-orders returns orders list"""
        response = self.session.get(f"{API_URL}/branch-orders")
        assert response.status_code == 200
        orders = response.json()
        assert isinstance(orders, list)
        print(f"✅ GET /api/branch-orders returned {len(orders)} orders")
    
    def test_11_get_outgoing_orders(self):
        """Test GET /api/branch-orders?type=outgoing"""
        response = self.session.get(f"{API_URL}/branch-orders", params={"type": "outgoing"})
        assert response.status_code == 200
        orders = response.json()
        assert isinstance(orders, list)
        print(f"✅ GET /api/branch-orders?type=outgoing returned {len(orders)} orders")
    
    def test_12_get_incoming_orders(self):
        """Test GET /api/branch-orders?type=incoming"""
        response = self.session.get(f"{API_URL}/branch-orders", params={"type": "incoming"})
        assert response.status_code == 200
        orders = response.json()
        assert isinstance(orders, list)
        print(f"✅ GET /api/branch-orders?type=incoming returned {len(orders)} orders")
    
    def test_13_order_details_show_deducted_materials(self):
        """Test that order details include raw_materials_deducted"""
        # Create raw material
        raw_material = self._create_raw_material("مادة_للتفاصيل", 100)
        assert raw_material, "Failed to create raw material"
        
        # Create product with recipe
        recipe = [{"raw_material_id": raw_material["id"], "quantity": 1}]
        
        finished_product = self._create_finished_product_with_recipe("منتج_للتفاصيل", recipe=recipe)
        assert finished_product, "Failed to create finished product"
        
        # Create order
        response = self.session.post(f"{API_URL}/branch-orders", json={
            "to_branch_id": self.branch_id,
            "items": [{"product_id": finished_product["id"], "quantity": 2}],
            "priority": "high",
            "notes": "طلب لاختبار التفاصيل"
        })
        
        assert response.status_code == 200, f"Failed to create order: {response.text}"
        order = response.json()
        self.test_orders.append(order["id"])
        
        # Verify order details
        assert "raw_materials_deducted" in order, "Order should have raw_materials_deducted"
        deducted = order["raw_materials_deducted"]
        assert len(deducted) > 0, "Should have deducted materials"
        
        # Verify deducted material structure
        for mat in deducted:
            assert "raw_material_id" in mat, "Should have raw_material_id"
            assert "raw_material_name" in mat, "Should have raw_material_name"
            assert "quantity_deducted" in mat, "Should have quantity_deducted"
            assert "unit" in mat, "Should have unit"
        
        print(f"✅ Order details show deducted materials:")
        for mat in deducted:
            print(f"   - {mat['raw_material_name']}: {mat['quantity_deducted']} {mat['unit']}")
    
    # ==================== BRANCH ORDERS - STATUS UPDATE ====================
    
    def test_14_update_order_status(self):
        """Test PUT /api/branch-orders/{id}/status"""
        # Create raw material and product
        raw_material = self._create_raw_material("مادة_للحالة", 50)
        assert raw_material, "Failed to create raw material"
        
        recipe = [{"raw_material_id": raw_material["id"], "quantity": 0.5}]
        
        finished_product = self._create_finished_product_with_recipe("منتج_للحالة", recipe=recipe)
        assert finished_product, "Failed to create finished product"
        
        # Create order
        create_response = self.session.post(f"{API_URL}/branch-orders", json={
            "to_branch_id": self.branch_id,
            "items": [{"product_id": finished_product["id"], "quantity": 1}],
            "priority": "normal"
        })
        
        assert create_response.status_code == 200, f"Failed to create order: {create_response.text}"
        order = create_response.json()
        self.test_orders.append(order["id"])
        
        # Update status to approved
        update_response = self.session.put(f"{API_URL}/branch-orders/{order['id']}/status", json={
            "status": "approved"
        })
        
        assert update_response.status_code == 200, f"Failed to update status: {update_response.text}"
        updated_order = update_response.json()
        assert updated_order.get("status") == "approved", "Status should be approved"
        
        print(f"✅ Order status updated: pending → approved")
    
    # ==================== MULTIPLE PRODUCTS ORDER ====================
    
    def test_15_order_with_multiple_products(self):
        """Test order with multiple finished products"""
        # Create raw materials
        meat = self._create_raw_material("لحم_متعدد", 100)
        bread = self._create_raw_material("خبز_متعدد", 200, unit="قطعة")
        cheese = self._create_raw_material("جبن_متعدد", 50)
        
        assert meat and bread and cheese, "Failed to create raw materials"
        
        # Create first product (burger)
        burger_recipe = [
            {"raw_material_id": meat["id"], "quantity": 0.5},
            {"raw_material_id": bread["id"], "quantity": 2}
        ]
        burger = self._create_finished_product_with_recipe("برغر_متعدد", recipe=burger_recipe)
        
        # Create second product (cheese sandwich)
        sandwich_recipe = [
            {"raw_material_id": bread["id"], "quantity": 2},
            {"raw_material_id": cheese["id"], "quantity": 0.1}
        ]
        sandwich = self._create_finished_product_with_recipe("ساندويتش_جبن", recipe=sandwich_recipe)
        
        assert burger and sandwich, "Failed to create finished products"
        
        # Create order with both products
        response = self.session.post(f"{API_URL}/branch-orders", json={
            "to_branch_id": self.branch_id,
            "items": [
                {"product_id": burger["id"], "quantity": 2},
                {"product_id": sandwich["id"], "quantity": 3}
            ],
            "priority": "high",
            "notes": "طلب متعدد المنتجات"
        })
        
        assert response.status_code == 200, f"Failed to create order: {response.text}"
        order = response.json()
        self.test_orders.append(order["id"])
        
        # Verify order has both products
        assert len(order["items"]) == 2, "Order should have 2 products"
        
        # Verify raw materials deducted
        deducted = order.get("raw_materials_deducted", [])
        assert len(deducted) >= 2, "Should have multiple deducted materials"
        
        print(f"✅ Multi-product order created: {order['order_number']}")
        print(f"   Products: {len(order['items'])}")
        print(f"   Raw materials deducted: {len(deducted)}")
        for mat in deducted:
            print(f"   - {mat['raw_material_name']}: {mat['quantity_deducted']} {mat['unit']}")


class TestBranchOrdersEdgeCases:
    """Edge case tests for branch orders"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test session"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        # Login
        login_response = self.session.post(f"{API_URL}/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        assert login_response.status_code == 200
        self.token = login_response.json().get("token")
        self.session.headers.update({"Authorization": f"Bearer {self.token}"})
        
        yield
    
    def test_order_with_zero_quantity(self):
        """Test that zero quantity items are ignored"""
        # Get any finished product with recipe
        products_response = self.session.get(f"{API_URL}/finished-products")
        if products_response.status_code == 200 and products_response.json():
            # Find a product with recipe
            products = products_response.json()
            product_with_recipe = next((p for p in products if p.get("recipe") and len(p.get("recipe", [])) > 0), None)
            
            if product_with_recipe:
                # Get branch
                branches_response = self.session.get(f"{API_URL}/branches")
                if branches_response.status_code == 200 and branches_response.json():
                    branch_id = branches_response.json()[0]["id"]
                    
                    # Try order with zero quantity
                    response = self.session.post(f"{API_URL}/branch-orders", json={
                        "to_branch_id": branch_id,
                        "items": [{"product_id": product_with_recipe["id"], "quantity": 0}],
                        "priority": "normal"
                    })
                    
                    # Should fail (no valid items)
                    assert response.status_code == 400
                    print("✅ Zero quantity items are rejected")
                    return
        
        print("⚠️ Skipped - no finished products with recipe found")
    
    def test_order_with_nonexistent_product(self):
        """Test order with non-existent product ID"""
        branches_response = self.session.get(f"{API_URL}/branches")
        if branches_response.status_code == 200 and branches_response.json():
            branch_id = branches_response.json()[0]["id"]
            
            response = self.session.post(f"{API_URL}/branch-orders", json={
                "to_branch_id": branch_id,
                "items": [{"product_id": "nonexistent-id-12345", "quantity": 1}],
                "priority": "normal"
            })
            
            # Should fail
            assert response.status_code == 400
            print("✅ Non-existent product ID rejected")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
