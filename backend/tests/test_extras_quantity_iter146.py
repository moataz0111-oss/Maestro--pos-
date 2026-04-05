"""
Test extras quantity functionality for POS system
Tests:
1. Create order with extras that have quantity field
2. Verify extras_total is calculated correctly as price*quantity
3. Update order items with extras quantity - verify totals recalculate
4. Verify subtotal calculation includes extras quantity
"""
import pytest
import requests
import os
import uuid

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test data
ADMIN_EMAIL = "hanialdujaili@gmail.com"
ADMIN_PASSWORD = "Hani@2024"
BRANCH_ID = "72a06c41-5454-4383-99a5-ac13adb96336"
TEST_PRODUCT_ID = "058301c2-9c08-4db0-ad7c-263335f03e32"


class TestExtrasQuantity:
    """Test extras quantity feature in orders"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test session with auth"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        self.token = None
        self.created_order_ids = []
        
        # Login
        response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        if response.status_code == 200:
            self.token = response.json().get("token")  # API returns 'token' not 'access_token'
            self.session.headers.update({"Authorization": f"Bearer {self.token}"})
        
        yield
        
        # Cleanup - delete test orders
        for order_id in self.created_order_ids:
            try:
                self.session.delete(f"{BASE_URL}/api/orders/{order_id}")
            except:
                pass
    
    def test_01_login_success(self):
        """Verify login works"""
        assert self.token is not None, "Login failed - no token received"
        print(f"Login successful, token received")
    
    def test_02_create_order_with_extras_quantity(self):
        """Create order with extras that have quantity > 1"""
        order_data = {
            "branch_id": BRANCH_ID,
            "order_type": "dine_in",
            "payment_method": "cash",
            "items": [
                {
                    "product_id": TEST_PRODUCT_ID,
                    "product_name": "TEST_Product_Extras",
                    "quantity": 1,
                    "price": 10000,
                    "notes": "Test order with extras quantity",
                    "extras": [
                        {"id": "ext1", "name": "Extra Cheese", "price": 2000, "quantity": 2},
                        {"id": "ext2", "name": "Extra Sauce", "price": 1000, "quantity": 3}
                    ]
                }
            ],
            "notes": "TEST_Order_Extras_Quantity"
        }
        
        response = self.session.post(f"{BASE_URL}/api/orders", json=order_data)
        assert response.status_code in [200, 201], f"Create order failed: {response.status_code} - {response.text}"
        
        order = response.json()
        self.created_order_ids.append(order["id"])
        
        # Verify order structure
        assert "items" in order, "Order should have items"
        assert len(order["items"]) == 1, "Order should have 1 item"
        
        item = order["items"][0]
        
        # Verify extras_total calculation: (2000*2) + (1000*3) = 4000 + 3000 = 7000
        expected_extras_total = (2000 * 2) + (1000 * 3)  # 7000
        assert item.get("extras_total") == expected_extras_total, \
            f"extras_total should be {expected_extras_total}, got {item.get('extras_total')}"
        
        # Verify subtotal: (10000 + 7000) * 1 = 17000
        expected_subtotal = (10000 + 7000) * 1
        assert order.get("subtotal") == expected_subtotal, \
            f"subtotal should be {expected_subtotal}, got {order.get('subtotal')}"
        
        print(f"Order created with extras_total={item.get('extras_total')}, subtotal={order.get('subtotal')}")
    
    def test_03_create_order_multiple_items_with_extras(self):
        """Create order with multiple items, each with extras quantity"""
        order_data = {
            "branch_id": BRANCH_ID,
            "order_type": "dine_in",
            "payment_method": "cash",
            "items": [
                {
                    "product_id": TEST_PRODUCT_ID,
                    "product_name": "TEST_Product_1",
                    "quantity": 2,  # 2 items
                    "price": 5000,
                    "extras": [
                        {"id": "ext1", "name": "Extra A", "price": 1000, "quantity": 2}
                    ]
                },
                {
                    "product_id": TEST_PRODUCT_ID,
                    "product_name": "TEST_Product_2",
                    "quantity": 1,
                    "price": 8000,
                    "extras": [
                        {"id": "ext2", "name": "Extra B", "price": 500, "quantity": 4}
                    ]
                }
            ],
            "notes": "TEST_Multiple_Items_Extras"
        }
        
        response = self.session.post(f"{BASE_URL}/api/orders", json=order_data)
        assert response.status_code in [200, 201], f"Create order failed: {response.status_code} - {response.text}"
        
        order = response.json()
        self.created_order_ids.append(order["id"])
        
        # Item 1: extras_total = 1000*2 = 2000, item_total = (5000+2000)*2 = 14000
        # Item 2: extras_total = 500*4 = 2000, item_total = (8000+2000)*1 = 10000
        # Total subtotal = 14000 + 10000 = 24000
        
        item1 = order["items"][0]
        item2 = order["items"][1]
        
        assert item1.get("extras_total") == 2000, f"Item 1 extras_total should be 2000, got {item1.get('extras_total')}"
        assert item2.get("extras_total") == 2000, f"Item 2 extras_total should be 2000, got {item2.get('extras_total')}"
        
        expected_subtotal = 24000
        assert order.get("subtotal") == expected_subtotal, \
            f"subtotal should be {expected_subtotal}, got {order.get('subtotal')}"
        
        print(f"Multiple items order: subtotal={order.get('subtotal')}")
    
    def test_04_update_order_items_with_extras_quantity(self):
        """Update order items and verify extras quantity recalculation"""
        # First create an order
        order_data = {
            "branch_id": BRANCH_ID,
            "order_type": "dine_in",
            "payment_method": "cash",
            "items": [
                {
                    "product_id": TEST_PRODUCT_ID,
                    "product_name": "TEST_Product_Update",
                    "quantity": 1,
                    "price": 10000,
                    "extras": [
                        {"id": "ext1", "name": "Extra 1", "price": 1000, "quantity": 1}
                    ]
                }
            ],
            "notes": "TEST_Update_Extras"
        }
        
        response = self.session.post(f"{BASE_URL}/api/orders", json=order_data)
        assert response.status_code in [200, 201], f"Create order failed: {response.status_code}"
        
        order = response.json()
        order_id = order["id"]
        self.created_order_ids.append(order_id)
        
        # Initial extras_total should be 1000
        assert order["items"][0].get("extras_total") == 1000
        
        # Now update with increased extras quantity
        update_data = {
            "items": [
                {
                    "product_id": TEST_PRODUCT_ID,
                    "product_name": "TEST_Product_Update",
                    "quantity": 1,
                    "price": 10000,
                    "extras": [
                        {"id": "ext1", "name": "Extra 1", "price": 1000, "quantity": 5}  # Increased to 5
                    ]
                }
            ],
            "notes": "Updated extras quantity",
            "discount": 0
        }
        
        response = self.session.put(f"{BASE_URL}/api/orders/{order_id}/update-items", json=update_data)
        assert response.status_code == 200, f"Update order failed: {response.status_code} - {response.text}"
        
        updated_order = response.json()
        
        # Verify extras_total recalculated: 1000*5 = 5000
        assert updated_order["items"][0].get("extras_total") == 5000, \
            f"Updated extras_total should be 5000, got {updated_order['items'][0].get('extras_total')}"
        
        # Verify subtotal: (10000+5000)*1 = 15000
        assert updated_order.get("subtotal") == 15000, \
            f"Updated subtotal should be 15000, got {updated_order.get('subtotal')}"
        
        print(f"Order updated: extras_total={updated_order['items'][0].get('extras_total')}, subtotal={updated_order.get('subtotal')}")
    
    def test_05_add_items_with_extras_quantity(self):
        """Add items to existing order with extras quantity"""
        # First create an order
        order_data = {
            "branch_id": BRANCH_ID,
            "order_type": "dine_in",
            "payment_method": "cash",
            "items": [
                {
                    "product_id": TEST_PRODUCT_ID,
                    "product_name": "TEST_Initial_Item",
                    "quantity": 1,
                    "price": 5000,
                    "extras": []
                }
            ],
            "notes": "TEST_Add_Items"
        }
        
        response = self.session.post(f"{BASE_URL}/api/orders", json=order_data)
        assert response.status_code in [200, 201], f"Create order failed: {response.status_code}"
        
        order = response.json()
        order_id = order["id"]
        self.created_order_ids.append(order_id)
        
        initial_subtotal = order.get("subtotal")
        assert initial_subtotal == 5000, f"Initial subtotal should be 5000, got {initial_subtotal}"
        
        # Add new item with extras quantity - endpoint expects list directly
        add_items_data = [
            {
                "product_id": TEST_PRODUCT_ID,
                "product_name": "TEST_Added_Item",
                "quantity": 2,
                "price": 3000,
                "extras": [
                    {"id": "ext1", "name": "Extra Add", "price": 500, "quantity": 3}
                ]
            }
        ]
        
        response = self.session.put(f"{BASE_URL}/api/orders/{order_id}/add-items", json=add_items_data)
        assert response.status_code == 200, f"Add items failed: {response.status_code} - {response.text}"
        
        updated_order = response.json()
        
        # Verify 2 items now
        assert len(updated_order["items"]) == 2, f"Should have 2 items, got {len(updated_order['items'])}"
        
        # New item extras_total: 500*3 = 1500
        new_item = updated_order["items"][1]
        assert new_item.get("extras_total") == 1500, \
            f"New item extras_total should be 1500, got {new_item.get('extras_total')}"
        
        # Total subtotal: 5000 + (3000+1500)*2 = 5000 + 9000 = 14000
        expected_subtotal = 5000 + (3000 + 1500) * 2
        assert updated_order.get("subtotal") == expected_subtotal, \
            f"Updated subtotal should be {expected_subtotal}, got {updated_order.get('subtotal')}"
        
        print(f"Items added: new extras_total={new_item.get('extras_total')}, total subtotal={updated_order.get('subtotal')}")
    
    def test_06_extras_with_default_quantity(self):
        """Test extras without explicit quantity (should default to 1)"""
        order_data = {
            "branch_id": BRANCH_ID,
            "order_type": "dine_in",
            "payment_method": "cash",
            "items": [
                {
                    "product_id": TEST_PRODUCT_ID,
                    "product_name": "TEST_Default_Qty",
                    "quantity": 1,
                    "price": 10000,
                    "extras": [
                        {"id": "ext1", "name": "Extra No Qty", "price": 2000}  # No quantity field
                    ]
                }
            ],
            "notes": "TEST_Default_Quantity"
        }
        
        response = self.session.post(f"{BASE_URL}/api/orders", json=order_data)
        assert response.status_code in [200, 201], f"Create order failed: {response.status_code}"
        
        order = response.json()
        self.created_order_ids.append(order["id"])
        
        # extras_total should be 2000*1 = 2000 (default quantity 1)
        assert order["items"][0].get("extras_total") == 2000, \
            f"extras_total should be 2000 (default qty 1), got {order['items'][0].get('extras_total')}"
        
        print(f"Default quantity test passed: extras_total={order['items'][0].get('extras_total')}")
    
    def test_07_fetch_order_preserves_extras_quantity(self):
        """Verify fetching order preserves extras with quantity"""
        # Create order with extras quantity
        order_data = {
            "branch_id": BRANCH_ID,
            "order_type": "dine_in",
            "payment_method": "cash",
            "items": [
                {
                    "product_id": TEST_PRODUCT_ID,
                    "product_name": "TEST_Fetch_Extras",
                    "quantity": 1,
                    "price": 10000,
                    "extras": [
                        {"id": "ext1", "name": "Extra Fetch", "price": 1500, "quantity": 3}
                    ]
                }
            ],
            "notes": "TEST_Fetch_Order"
        }
        
        response = self.session.post(f"{BASE_URL}/api/orders", json=order_data)
        assert response.status_code in [200, 201]
        
        order = response.json()
        order_id = order["id"]
        self.created_order_ids.append(order_id)
        
        # Fetch the order
        response = self.session.get(f"{BASE_URL}/api/orders/{order_id}")
        assert response.status_code == 200, f"Fetch order failed: {response.status_code}"
        
        fetched_order = response.json()
        
        # Verify extras preserved with quantity
        extras = fetched_order["items"][0].get("extras", [])
        assert len(extras) == 1, "Should have 1 extra"
        assert extras[0].get("quantity") == 3, f"Extra quantity should be 3, got {extras[0].get('quantity')}"
        assert extras[0].get("price") == 1500, f"Extra price should be 1500, got {extras[0].get('price')}"
        
        # Verify extras_total preserved
        assert fetched_order["items"][0].get("extras_total") == 4500, \
            f"extras_total should be 4500, got {fetched_order['items'][0].get('extras_total')}"
        
        print(f"Fetch order preserves extras: quantity={extras[0].get('quantity')}, extras_total={fetched_order['items'][0].get('extras_total')}")
    
    def test_08_zero_quantity_extras(self):
        """Test that extras with quantity 0 are handled correctly"""
        order_data = {
            "branch_id": BRANCH_ID,
            "order_type": "dine_in",
            "payment_method": "cash",
            "items": [
                {
                    "product_id": TEST_PRODUCT_ID,
                    "product_name": "TEST_Zero_Qty",
                    "quantity": 1,
                    "price": 10000,
                    "extras": [
                        {"id": "ext1", "name": "Extra Zero", "price": 2000, "quantity": 0}
                    ]
                }
            ],
            "notes": "TEST_Zero_Quantity"
        }
        
        response = self.session.post(f"{BASE_URL}/api/orders", json=order_data)
        assert response.status_code in [200, 201], f"Create order failed: {response.status_code}"
        
        order = response.json()
        self.created_order_ids.append(order["id"])
        
        # extras_total should be 0 (2000*0 = 0)
        assert order["items"][0].get("extras_total") == 0, \
            f"extras_total should be 0 for quantity 0, got {order['items'][0].get('extras_total')}"
        
        print(f"Zero quantity test passed: extras_total={order['items'][0].get('extras_total')}")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
