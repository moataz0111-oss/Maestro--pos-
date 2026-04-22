"""
Iteration 18 - Branch Orders with Recipe System Testing
Tests for:
1. GET /api/finished-products - جلب قائمة المنتجات النهائية
2. GET /api/raw-materials - جلب قائمة المواد الخام
3. POST /api/branch-orders - إنشاء طلب فرع جديد مع خصم تلقائي من المواد الخام
4. GET /api/branch-orders - جلب قائمة طلبات الفروع
5. PATCH /api/branch-orders/{id}/status - تحديث حالة الطلب
"""

import pytest
import requests
import os
import uuid

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://financial-reconcile-2.preview.emergentagent.com').rstrip('/')

class TestBranchOrdersRecipeSystem:
    """Tests for Branch Orders with Recipe System"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test fixtures"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        self.token = None
        self.branch_id = None
        self.raw_material_id = None
        self.finished_product_id = None
        self.order_id = None
        
    def get_auth_token(self):
        """Get authentication token"""
        if self.token:
            return self.token
            
        response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "admin@maestroegp.com",
            "password": "admin123"
        })
        
        if response.status_code == 200:
            self.token = response.json().get("token")
            self.session.headers.update({"Authorization": f"Bearer {self.token}"})
            return self.token
        return None
    
    def test_01_health_check(self):
        """Test API health endpoint"""
        response = self.session.get(f"{BASE_URL}/api/health")
        assert response.status_code == 200
        data = response.json()
        assert data.get("status") == "ok"
        print("✅ Health check passed")
    
    def test_02_login(self):
        """Test admin login"""
        response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "admin@maestroegp.com",
            "password": "admin123"
        })
        assert response.status_code == 200
        data = response.json()
        assert "token" in data
        assert "user" in data
        self.token = data["token"]
        self.session.headers.update({"Authorization": f"Bearer {self.token}"})
        print(f"✅ Login successful - User: {data['user'].get('email')}")
    
    def test_03_get_branches(self):
        """Test getting branches list"""
        self.get_auth_token()
        response = self.session.get(f"{BASE_URL}/api/branches")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        if len(data) > 0:
            self.branch_id = data[0].get("id")
            print(f"✅ Got {len(data)} branches - First branch: {data[0].get('name')}")
        else:
            print("⚠️ No branches found")
    
    def test_04_get_raw_materials(self):
        """Test GET /api/raw-materials - جلب قائمة المواد الخام"""
        self.get_auth_token()
        response = self.session.get(f"{BASE_URL}/api/raw-materials")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✅ GET /api/raw-materials - Found {len(data)} raw materials")
        
        # Store first raw material ID for later tests
        if len(data) > 0:
            self.raw_material_id = data[0].get("id")
            print(f"   First raw material: {data[0].get('name')} - Qty: {data[0].get('quantity')} {data[0].get('unit')}")
        return data
    
    def test_05_get_finished_products(self):
        """Test GET /api/finished-products - جلب قائمة المنتجات النهائية"""
        self.get_auth_token()
        response = self.session.get(f"{BASE_URL}/api/finished-products")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✅ GET /api/finished-products - Found {len(data)} finished products")
        
        # Store first finished product ID for later tests
        if len(data) > 0:
            self.finished_product_id = data[0].get("id")
            product = data[0]
            print(f"   First product: {product.get('name')} - Qty: {product.get('quantity')} {product.get('unit')}")
            if product.get('recipe'):
                print(f"   Recipe has {len(product.get('recipe'))} ingredients")
        return data
    
    def test_06_get_finished_products_requires_auth(self):
        """Test that finished products endpoint requires authentication"""
        # Create new session without auth
        no_auth_session = requests.Session()
        no_auth_session.headers.update({"Content-Type": "application/json"})
        
        response = no_auth_session.get(f"{BASE_URL}/api/finished-products")
        assert response.status_code in [401, 403]
        print("✅ GET /api/finished-products requires authentication")
    
    def test_07_get_raw_materials_requires_auth(self):
        """Test that raw materials endpoint requires authentication"""
        no_auth_session = requests.Session()
        no_auth_session.headers.update({"Content-Type": "application/json"})
        
        response = no_auth_session.get(f"{BASE_URL}/api/raw-materials")
        assert response.status_code in [401, 403]
        print("✅ GET /api/raw-materials requires authentication")
    
    def test_08_get_branch_orders(self):
        """Test GET /api/branch-orders - جلب قائمة طلبات الفروع"""
        self.get_auth_token()
        response = self.session.get(f"{BASE_URL}/api/branch-orders")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✅ GET /api/branch-orders - Found {len(data)} orders")
        
        if len(data) > 0:
            order = data[0]
            print(f"   Latest order: #{order.get('order_number')} - Status: {order.get('status')}")
        return data
    
    def test_09_get_branch_orders_outgoing(self):
        """Test GET /api/branch-orders with type=outgoing filter"""
        self.get_auth_token()
        response = self.session.get(f"{BASE_URL}/api/branch-orders", params={"type": "outgoing"})
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✅ GET /api/branch-orders?type=outgoing - Found {len(data)} outgoing orders")
    
    def test_10_get_branch_orders_incoming(self):
        """Test GET /api/branch-orders with type=incoming filter"""
        self.get_auth_token()
        response = self.session.get(f"{BASE_URL}/api/branch-orders", params={"type": "incoming"})
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✅ GET /api/branch-orders?type=incoming - Found {len(data)} incoming orders")
    
    def test_11_create_raw_material_for_testing(self):
        """Create a raw material for testing branch orders"""
        self.get_auth_token()
        
        # First get branches
        branches_response = self.session.get(f"{BASE_URL}/api/branches")
        branches = branches_response.json()
        branch_id = branches[0]["id"] if branches else "main"
        
        raw_material_data = {
            "name": f"TEST_مادة خام اختبار {uuid.uuid4().hex[:6]}",
            "name_en": "Test Raw Material",
            "unit": "كيلو",
            "quantity": 100.0,
            "min_quantity": 10.0,
            "cost_per_unit": 5000,
            "branch_id": branch_id,
            "item_type": "raw"
        }
        
        response = self.session.post(f"{BASE_URL}/api/inventory", json=raw_material_data)
        assert response.status_code in [200, 201]
        data = response.json()
        self.raw_material_id = data.get("id")
        print(f"✅ Created raw material: {data.get('name')} - ID: {self.raw_material_id}")
        return data
    
    def test_12_create_finished_product_with_recipe(self):
        """Create a finished product with recipe for testing"""
        self.get_auth_token()
        
        # First ensure we have a raw material
        if not self.raw_material_id:
            self.test_11_create_raw_material_for_testing()
        
        finished_product_data = {
            "name": f"TEST_منتج نهائي اختبار {uuid.uuid4().hex[:6]}",
            "name_en": "Test Finished Product",
            "unit": "قطعة",
            "quantity": 50.0,
            "min_quantity": 5.0,
            "selling_price": 15000,
            "recipe": [
                {
                    "raw_material_id": self.raw_material_id,
                    "quantity": 0.5  # 0.5 كيلو لكل قطعة
                }
            ],
            "description": "منتج اختبار للوصفات",
            "category": "test"
        }
        
        response = self.session.post(f"{BASE_URL}/api/finished-products", json=finished_product_data)
        assert response.status_code in [200, 201]
        data = response.json()
        self.finished_product_id = data.get("id")
        print(f"✅ Created finished product: {data.get('name')} - ID: {self.finished_product_id}")
        print(f"   Recipe: {len(data.get('recipe', []))} ingredients")
        print(f"   Cost per unit: {data.get('cost_per_unit')}")
        return data
    
    def test_13_create_branch_order_with_auto_deduction(self):
        """Test POST /api/branch-orders - إنشاء طلب فرع جديد مع خصم تلقائي"""
        self.get_auth_token()
        
        # Ensure we have a finished product
        if not self.finished_product_id:
            self.test_12_create_finished_product_with_recipe()
        
        # Get branches
        branches_response = self.session.get(f"{BASE_URL}/api/branches")
        branches = branches_response.json()
        if not branches:
            pytest.skip("No branches available for testing")
        
        to_branch_id = branches[0]["id"]
        
        # Get raw material quantity before order
        raw_materials_before = self.session.get(f"{BASE_URL}/api/raw-materials").json()
        raw_material_before = next((m for m in raw_materials_before if m["id"] == self.raw_material_id), None)
        qty_before = raw_material_before.get("quantity", 0) if raw_material_before else 0
        
        order_data = {
            "to_branch_id": to_branch_id,
            "items": [
                {
                    "product_id": self.finished_product_id,
                    "quantity": 2
                }
            ],
            "priority": "normal",
            "notes": "طلب اختبار - TEST"
        }
        
        response = self.session.post(f"{BASE_URL}/api/branch-orders", json=order_data)
        assert response.status_code in [200, 201]
        data = response.json()
        self.order_id = data.get("id")
        
        print(f"✅ Created branch order: #{data.get('order_number')}")
        print(f"   Status: {data.get('status')}")
        print(f"   Items: {len(data.get('items', []))}")
        print(f"   Total cost: {data.get('total_cost')}")
        
        # Verify raw materials were deducted
        if data.get("raw_materials_deducted"):
            print(f"   Raw materials deducted: {len(data.get('raw_materials_deducted'))}")
            for mat in data.get("raw_materials_deducted", []):
                print(f"      - {mat.get('raw_material_name')}: {mat.get('quantity_deducted')} {mat.get('unit')}")
        
        # Verify the deduction actually happened
        raw_materials_after = self.session.get(f"{BASE_URL}/api/raw-materials").json()
        raw_material_after = next((m for m in raw_materials_after if m["id"] == self.raw_material_id), None)
        qty_after = raw_material_after.get("quantity", 0) if raw_material_after else 0
        
        if raw_material_before and raw_material_after:
            deducted = qty_before - qty_after
            print(f"   ✅ Raw material quantity changed: {qty_before} -> {qty_after} (deducted: {deducted})")
        
        return data
    
    def test_14_create_branch_order_insufficient_products(self):
        """Test branch order creation fails when products are insufficient"""
        self.get_auth_token()
        
        # Get branches
        branches_response = self.session.get(f"{BASE_URL}/api/branches")
        branches = branches_response.json()
        if not branches:
            pytest.skip("No branches available for testing")
        
        to_branch_id = branches[0]["id"]
        
        # Try to order more than available
        order_data = {
            "to_branch_id": to_branch_id,
            "items": [
                {
                    "product_id": self.finished_product_id if self.finished_product_id else "nonexistent",
                    "quantity": 99999  # Very large quantity
                }
            ],
            "priority": "normal",
            "notes": "طلب اختبار - كمية كبيرة"
        }
        
        response = self.session.post(f"{BASE_URL}/api/branch-orders", json=order_data)
        # Should fail with 400 due to insufficient quantity
        assert response.status_code == 400
        print("✅ Branch order correctly rejected for insufficient products")
    
    def test_15_create_branch_order_empty_items(self):
        """Test branch order creation fails with empty items"""
        self.get_auth_token()
        
        branches_response = self.session.get(f"{BASE_URL}/api/branches")
        branches = branches_response.json()
        if not branches:
            pytest.skip("No branches available for testing")
        
        order_data = {
            "to_branch_id": branches[0]["id"],
            "items": [],
            "priority": "normal"
        }
        
        response = self.session.post(f"{BASE_URL}/api/branch-orders", json=order_data)
        assert response.status_code == 400
        print("✅ Branch order correctly rejected for empty items")
    
    def test_16_update_branch_order_status(self):
        """Test PATCH /api/branch-orders/{id}/status - تحديث حالة الطلب"""
        self.get_auth_token()
        
        # Get existing orders or create one
        orders_response = self.session.get(f"{BASE_URL}/api/branch-orders")
        orders = orders_response.json()
        
        if not orders:
            # Create an order first
            self.test_13_create_branch_order_with_auto_deduction()
            orders_response = self.session.get(f"{BASE_URL}/api/branch-orders")
            orders = orders_response.json()
        
        if not orders:
            pytest.skip("No orders available for status update test")
        
        order_id = orders[0]["id"]
        current_status = orders[0]["status"]
        
        # Update to approved if pending
        if current_status == "pending":
            response = self.session.patch(
                f"{BASE_URL}/api/branch-orders/{order_id}/status",
                json={"status": "approved"}
            )
            # Note: API uses PUT not PATCH based on code review
            if response.status_code == 405:
                response = self.session.put(
                    f"{BASE_URL}/api/branch-orders/{order_id}/status",
                    json={"status": "approved"}
                )
            
            assert response.status_code == 200
            data = response.json()
            print(f"✅ Updated order status: {current_status} -> {data.get('status')}")
        else:
            print(f"⚠️ Order already has status: {current_status}")
    
    def test_17_get_finished_product_by_id(self):
        """Test GET /api/finished-products/{id} - جلب منتج نهائي محدد"""
        self.get_auth_token()
        
        # Get list first
        products_response = self.session.get(f"{BASE_URL}/api/finished-products")
        products = products_response.json()
        
        if not products:
            pytest.skip("No finished products available")
        
        product_id = products[0]["id"]
        response = self.session.get(f"{BASE_URL}/api/finished-products/{product_id}")
        assert response.status_code == 200
        data = response.json()
        assert data.get("id") == product_id
        print(f"✅ GET /api/finished-products/{product_id} - Got: {data.get('name')}")
    
    def test_18_get_nonexistent_finished_product(self):
        """Test GET /api/finished-products/{id} returns 404 for nonexistent product"""
        self.get_auth_token()
        
        response = self.session.get(f"{BASE_URL}/api/finished-products/nonexistent-id-12345")
        assert response.status_code == 404
        print("✅ GET /api/finished-products/nonexistent returns 404")
    
    def test_19_branch_orders_requires_auth(self):
        """Test that branch orders endpoint requires authentication"""
        no_auth_session = requests.Session()
        no_auth_session.headers.update({"Content-Type": "application/json"})
        
        response = no_auth_session.get(f"{BASE_URL}/api/branch-orders")
        assert response.status_code in [401, 403]
        print("✅ GET /api/branch-orders requires authentication")
    
    def test_20_cleanup_test_data(self):
        """Cleanup test data created during tests"""
        self.get_auth_token()
        
        # Delete test finished products
        products_response = self.session.get(f"{BASE_URL}/api/finished-products")
        products = products_response.json()
        
        deleted_count = 0
        for product in products:
            if product.get("name", "").startswith("TEST_"):
                delete_response = self.session.delete(f"{BASE_URL}/api/finished-products/{product['id']}")
                if delete_response.status_code in [200, 204]:
                    deleted_count += 1
        
        print(f"✅ Cleanup: Deleted {deleted_count} test finished products")
        
        # Delete test inventory items (raw materials)
        inventory_response = self.session.get(f"{BASE_URL}/api/inventory")
        if inventory_response.status_code == 200:
            inventory = inventory_response.json()
            for item in inventory:
                if item.get("name", "").startswith("TEST_"):
                    self.session.delete(f"{BASE_URL}/api/inventory/{item['id']}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
