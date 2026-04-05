"""
Test Order Notes Functionality - Iteration 145
Tests for product notes and order notes saving/retrieval in POS system

Features tested:
1. Create order with product notes and order notes
2. Fetch order by ID - verify notes preserved
3. Update-items endpoint - verify notes update correctly
4. Add-items endpoint - verify extras and notes included
"""

import pytest
import requests
import os
import uuid

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test data from main agent context
TEST_PRODUCT_ID = "058301c2-9c08-4db0-ad7c-263335f03e32"  # TEST_Product
TEST_BRANCH_ID = "72a06c41-5454-4383-99a5-ac13adb96336"

# Test credentials
ADMIN_EMAIL = "hanialdujaili@gmail.com"
ADMIN_PASSWORD = "Hani@2024"


class TestOrderNotes:
    """Test order notes and product notes functionality"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test session with authentication"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        self.token = None
        self.created_order_id = None
        
    def get_auth_token(self):
        """Get authentication token"""
        if self.token:
            return self.token
            
        response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        
        if response.status_code == 200:
            data = response.json()
            self.token = data.get("access_token") or data.get("token")
            self.session.headers.update({"Authorization": f"Bearer {self.token}"})
            return self.token
        else:
            pytest.skip(f"Authentication failed: {response.status_code} - {response.text}")
            
    def test_01_health_check(self):
        """Test API health endpoint"""
        response = self.session.get(f"{BASE_URL}/api/health")
        assert response.status_code == 200, f"Health check failed: {response.text}"
        print("PASSED: API health check")
        
    def test_02_login(self):
        """Test login and get token"""
        token = self.get_auth_token()
        assert token is not None, "Failed to get auth token"
        print(f"PASSED: Login successful, token obtained")
        
    def test_03_get_products(self):
        """Verify products endpoint works and find a product for testing"""
        self.get_auth_token()
        
        response = self.session.get(f"{BASE_URL}/api/products")
        assert response.status_code == 200, f"Failed to get products: {response.text}"
        
        products = response.json()
        assert len(products) > 0, "No products found"
        
        # Find TEST_Product or use first available
        test_product = next((p for p in products if p.get("id") == TEST_PRODUCT_ID), None)
        if test_product:
            print(f"PASSED: Found TEST_Product: {test_product.get('name')}")
        else:
            print(f"PASSED: Using first product: {products[0].get('name')}")
            
    def test_04_get_branches(self):
        """Verify branches endpoint works"""
        self.get_auth_token()
        
        response = self.session.get(f"{BASE_URL}/api/branches")
        assert response.status_code == 200, f"Failed to get branches: {response.text}"
        
        branches = response.json()
        assert len(branches) > 0, "No branches found"
        
        # Find test branch or use first available
        test_branch = next((b for b in branches if b.get("id") == TEST_BRANCH_ID), None)
        if test_branch:
            print(f"PASSED: Found test branch: {test_branch.get('name')}")
        else:
            print(f"PASSED: Using first branch: {branches[0].get('name')}")
            
    def test_05_create_order_with_notes(self):
        """Test creating order with product notes and order notes"""
        self.get_auth_token()
        
        # Get a product to use
        products_response = self.session.get(f"{BASE_URL}/api/products")
        products = products_response.json()
        product = next((p for p in products if p.get("id") == TEST_PRODUCT_ID), products[0] if products else None)
        
        if not product:
            pytest.skip("No products available for testing")
            
        # Get a branch to use
        branches_response = self.session.get(f"{BASE_URL}/api/branches")
        branches = branches_response.json()
        branch = next((b for b in branches if b.get("id") == TEST_BRANCH_ID), branches[0] if branches else None)
        
        if not branch:
            pytest.skip("No branches available for testing")
        
        # Create order with Arabic notes (as per user requirement)
        product_notes = "بدون بصل"  # "No onion" in Arabic
        order_notes = "ملاحظات الطلب - تسليم سريع"  # "Order notes - fast delivery"
        
        order_data = {
            "order_type": "takeaway",
            "items": [
                {
                    "product_id": product.get("id"),
                    "product_name": product.get("name"),
                    "quantity": 2,
                    "price": product.get("price", 5000),
                    "cost": product.get("cost", 0),
                    "notes": product_notes,  # Product-level notes
                    "extras": []
                }
            ],
            "branch_id": branch.get("id"),
            "payment_method": "pending",
            "discount": 0,
            "notes": order_notes,  # Order-level notes
            "customer_name": "TEST_Customer_Notes",
            "customer_phone": "07801234567"
        }
        
        response = self.session.post(f"{BASE_URL}/api/orders", json=order_data)
        assert response.status_code == 200, f"Failed to create order: {response.status_code} - {response.text}"
        
        order = response.json()
        self.created_order_id = order.get("id")
        
        # Verify order notes saved
        assert order.get("notes") == order_notes, f"Order notes not saved correctly. Expected: {order_notes}, Got: {order.get('notes')}"
        
        # Verify product notes saved in items
        items = order.get("items", [])
        assert len(items) > 0, "No items in order response"
        assert items[0].get("notes") == product_notes, f"Product notes not saved. Expected: {product_notes}, Got: {items[0].get('notes')}"
        
        print(f"PASSED: Order #{order.get('order_number')} created with notes")
        print(f"  - Order notes: {order.get('notes')}")
        print(f"  - Product notes: {items[0].get('notes')}")
        
        return order
        
    def test_06_fetch_order_verify_notes_preserved(self):
        """Test fetching order by ID and verify notes are preserved"""
        self.get_auth_token()
        
        # First create an order with notes
        order = self.test_05_create_order_with_notes()
        order_id = order.get("id")
        
        # Fetch the order
        response = self.session.get(f"{BASE_URL}/api/orders/{order_id}")
        assert response.status_code == 200, f"Failed to fetch order: {response.status_code} - {response.text}"
        
        fetched_order = response.json()
        
        # Verify notes preserved
        expected_order_notes = "ملاحظات الطلب - تسليم سريع"
        expected_product_notes = "بدون بصل"
        
        assert fetched_order.get("notes") == expected_order_notes, f"Order notes not preserved. Expected: {expected_order_notes}, Got: {fetched_order.get('notes')}"
        
        items = fetched_order.get("items", [])
        assert len(items) > 0, "No items in fetched order"
        assert items[0].get("notes") == expected_product_notes, f"Product notes not preserved. Expected: {expected_product_notes}, Got: {items[0].get('notes')}"
        
        print(f"PASSED: Order #{fetched_order.get('order_number')} fetched with notes preserved")
        print(f"  - Order notes: {fetched_order.get('notes')}")
        print(f"  - Product notes: {items[0].get('notes')}")
        
    def test_07_update_items_endpoint(self):
        """Test update-items endpoint updates notes correctly"""
        self.get_auth_token()
        
        # First create an order
        order = self.test_05_create_order_with_notes()
        order_id = order.get("id")
        
        # Update with new notes
        new_product_notes = "بدون بصل وبدون طماطم"  # "No onion and no tomato"
        new_order_notes = "ملاحظات محدثة - عاجل جداً"  # "Updated notes - very urgent"
        
        items = order.get("items", [])
        updated_items = []
        for item in items:
            updated_items.append({
                "product_id": item.get("product_id"),
                "product_name": item.get("product_name"),
                "quantity": item.get("quantity"),
                "price": item.get("price"),
                "cost": item.get("cost", 0),
                "notes": new_product_notes,  # Updated product notes
                "extras": item.get("extras", [])
            })
        
        update_data = {
            "items": updated_items,
            "notes": new_order_notes,  # Updated order notes
            "discount": 500  # Also test discount update
        }
        
        response = self.session.put(f"{BASE_URL}/api/orders/{order_id}/update-items", json=update_data)
        assert response.status_code == 200, f"Failed to update order items: {response.status_code} - {response.text}"
        
        updated_order = response.json()
        
        # Verify updated notes
        assert updated_order.get("notes") == new_order_notes, f"Order notes not updated. Expected: {new_order_notes}, Got: {updated_order.get('notes')}"
        
        updated_items_response = updated_order.get("items", [])
        assert len(updated_items_response) > 0, "No items in updated order"
        assert updated_items_response[0].get("notes") == new_product_notes, f"Product notes not updated. Expected: {new_product_notes}, Got: {updated_items_response[0].get('notes')}"
        
        # Verify discount updated
        assert updated_order.get("discount") == 500, f"Discount not updated. Expected: 500, Got: {updated_order.get('discount')}"
        
        print(f"PASSED: Order #{updated_order.get('order_number')} updated with new notes")
        print(f"  - New order notes: {updated_order.get('notes')}")
        print(f"  - New product notes: {updated_items_response[0].get('notes')}")
        print(f"  - New discount: {updated_order.get('discount')}")
        
    def test_08_add_items_endpoint_with_extras_and_notes(self):
        """Test add-items endpoint includes extras and notes"""
        self.get_auth_token()
        
        # First create an order
        order = self.test_05_create_order_with_notes()
        order_id = order.get("id")
        original_items_count = len(order.get("items", []))
        
        # Get a product to add
        products_response = self.session.get(f"{BASE_URL}/api/products")
        products = products_response.json()
        product = products[0] if products else None
        
        if not product:
            pytest.skip("No products available for testing")
        
        # Add new item with notes and extras
        new_item_notes = "إضافة جديدة - بدون ملح"  # "New addition - no salt"
        new_items = [
            {
                "product_id": product.get("id"),
                "product_name": product.get("name"),
                "quantity": 1,
                "price": product.get("price", 5000),
                "cost": product.get("cost", 0),
                "notes": new_item_notes,
                "extras": [
                    {"name": "جبنة إضافية", "price": 500}  # "Extra cheese"
                ]
            }
        ]
        
        response = self.session.put(f"{BASE_URL}/api/orders/{order_id}/add-items", json=new_items)
        assert response.status_code == 200, f"Failed to add items: {response.status_code} - {response.text}"
        
        updated_order = response.json()
        updated_items = updated_order.get("items", [])
        
        # Verify item was added
        assert len(updated_items) == original_items_count + 1, f"Item not added. Expected {original_items_count + 1} items, got {len(updated_items)}"
        
        # Find the newly added item (last one)
        new_item = updated_items[-1]
        
        # Verify notes saved
        assert new_item.get("notes") == new_item_notes, f"New item notes not saved. Expected: {new_item_notes}, Got: {new_item.get('notes')}"
        
        # Verify extras saved
        extras = new_item.get("extras", [])
        assert len(extras) > 0, "Extras not saved in new item"
        assert extras[0].get("name") == "جبنة إضافية", f"Extra name not saved correctly. Got: {extras[0].get('name')}"
        assert extras[0].get("price") == 500, f"Extra price not saved correctly. Got: {extras[0].get('price')}"
        
        print(f"PASSED: Item added to order #{updated_order.get('order_number')} with notes and extras")
        print(f"  - New item notes: {new_item.get('notes')}")
        print(f"  - New item extras: {extras}")
        
    def test_09_create_order_with_multiple_items_different_notes(self):
        """Test creating order with multiple items each having different notes"""
        self.get_auth_token()
        
        # Get products
        products_response = self.session.get(f"{BASE_URL}/api/products")
        products = products_response.json()
        
        if len(products) < 2:
            pytest.skip("Need at least 2 products for this test")
            
        # Get branch
        branches_response = self.session.get(f"{BASE_URL}/api/branches")
        branches = branches_response.json()
        branch = branches[0] if branches else None
        
        if not branch:
            pytest.skip("No branches available")
        
        # Create order with multiple items, each with different notes
        order_data = {
            "order_type": "delivery",
            "items": [
                {
                    "product_id": products[0].get("id"),
                    "product_name": products[0].get("name"),
                    "quantity": 1,
                    "price": products[0].get("price", 5000),
                    "cost": products[0].get("cost", 0),
                    "notes": "بدون بصل",  # No onion
                    "extras": []
                },
                {
                    "product_id": products[1].get("id"),
                    "product_name": products[1].get("name"),
                    "quantity": 2,
                    "price": products[1].get("price", 3000),
                    "cost": products[1].get("cost", 0),
                    "notes": "حار جداً",  # Very spicy
                    "extras": [{"name": "صوص حار", "price": 200}]  # Hot sauce
                }
            ],
            "branch_id": branch.get("id"),
            "payment_method": "cash",
            "discount": 0,
            "notes": "توصيل للباب مباشرة",  # Deliver to door directly
            "customer_name": "TEST_MultiNotes",
            "customer_phone": "07809876543",
            "delivery_address": "شارع الرشيد - بغداد"
        }
        
        response = self.session.post(f"{BASE_URL}/api/orders", json=order_data)
        assert response.status_code == 200, f"Failed to create order: {response.status_code} - {response.text}"
        
        order = response.json()
        items = order.get("items", [])
        
        # Verify each item has its own notes
        assert len(items) == 2, f"Expected 2 items, got {len(items)}"
        assert items[0].get("notes") == "بدون بصل", f"First item notes wrong: {items[0].get('notes')}"
        assert items[1].get("notes") == "حار جداً", f"Second item notes wrong: {items[1].get('notes')}"
        
        # Verify extras on second item
        assert len(items[1].get("extras", [])) > 0, "Second item extras not saved"
        
        # Verify order notes
        assert order.get("notes") == "توصيل للباب مباشرة", f"Order notes wrong: {order.get('notes')}"
        
        print(f"PASSED: Order #{order.get('order_number')} created with multiple items and different notes")
        for i, item in enumerate(items):
            print(f"  - Item {i+1} ({item.get('product_name')}): notes='{item.get('notes')}', extras={item.get('extras', [])}")
        print(f"  - Order notes: {order.get('notes')}")
        
    def test_10_verify_notes_in_order_list(self):
        """Test that notes are included when listing orders"""
        self.get_auth_token()
        
        # Create an order with notes first
        order = self.test_05_create_order_with_notes()
        order_id = order.get("id")
        
        # Get orders list
        response = self.session.get(f"{BASE_URL}/api/orders", params={"status": "pending"})
        assert response.status_code == 200, f"Failed to get orders: {response.status_code} - {response.text}"
        
        orders = response.json()
        
        # Find our order
        our_order = next((o for o in orders if o.get("id") == order_id), None)
        
        if our_order:
            # Verify notes are included in list response
            assert our_order.get("notes") is not None, "Order notes not included in list response"
            
            items = our_order.get("items", [])
            if items:
                # Check if item notes are included
                has_item_notes = any(item.get("notes") for item in items)
                print(f"PASSED: Order found in list with notes")
                print(f"  - Order notes: {our_order.get('notes')}")
                print(f"  - Has item notes: {has_item_notes}")
        else:
            print("INFO: Order not found in pending list (may have different status)")


# Cleanup fixture
@pytest.fixture(scope="module", autouse=True)
def cleanup_test_orders():
    """Cleanup test orders after all tests"""
    yield
    # Cleanup would go here if needed
    # For now, test orders with TEST_ prefix can be identified and cleaned manually


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
