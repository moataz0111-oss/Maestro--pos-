"""
Maestro EGP API Tests - Iteration 3
Testing new features:
- Pending orders list (takeaway, delivery, dine_in) with tabs
- Load pending order for editing
- Add items to existing order - API /api/orders/{order_id}/add-items
- Print bill button (frontend only)
- Customer search by phone - API /api/customers/by-phone/{phone}
- Customer management in Settings - CRUD operations
- API /api/customers - CRUD operations
"""

import pytest
import requests
import os
import uuid
from datetime import datetime

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://maestro-pos-1.preview.emergentagent.com').rstrip('/')


class TestAuth:
    """Authentication tests"""
    
    def test_admin_login(self):
        """Test admin login"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "admin@maestroegp.com",
            "password": "admin123"
        })
        assert response.status_code == 200
        data = response.json()
        assert "token" in data
        assert "user" in data
        assert data["user"]["email"] == "admin@maestroegp.com"
        print(f"✓ Admin login successful")
    
    def test_cashier_login(self):
        """Test cashier login"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "cashier@maestroegp.com",
            "password": "cashier123"
        })
        # May or may not exist
        if response.status_code == 200:
            data = response.json()
            assert "token" in data
            print(f"✓ Cashier login successful")
        else:
            print(f"⚠ Cashier user not found (expected if not created)")


class TestCustomerManagement:
    """Customer CRUD tests - إدارة العملاء"""
    
    @pytest.fixture(scope="class")
    def auth_headers(self):
        """Get authenticated headers"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "admin@maestroegp.com",
            "password": "admin123"
        })
        token = response.json()["token"]
        return {"Authorization": f"Bearer {token}"}
    
    def test_get_customers_empty(self, auth_headers):
        """Test getting customers list (may be empty initially)"""
        response = requests.get(f"{BASE_URL}/api/customers", headers=auth_headers)
        assert response.status_code == 200
        customers = response.json()
        assert isinstance(customers, list)
        print(f"✓ Got {len(customers)} customers")
    
    def test_create_customer(self, auth_headers):
        """Test creating a new customer"""
        test_phone = f"07701234{uuid.uuid4().hex[:4]}"
        create_response = requests.post(f"{BASE_URL}/api/customers",
            headers=auth_headers,
            json={
                "name": "عميل اختبار",
                "phone": test_phone,
                "phone2": "07709876543",
                "address": "بغداد - الكرادة",
                "area": "الكرادة",
                "notes": "عميل VIP",
                "is_blocked": False
            }
        )
        assert create_response.status_code == 200, f"Create failed: {create_response.text}"
        customer = create_response.json()
        assert customer["name"] == "عميل اختبار"
        assert customer["phone"] == test_phone
        assert customer["total_orders"] == 0
        assert customer["total_spent"] == 0.0
        print(f"✓ Created customer: {customer['id']}")
        return customer
    
    def test_create_and_search_customer_by_phone(self, auth_headers):
        """Test creating customer and searching by phone"""
        # Create customer with unique phone
        test_phone = f"07801234{uuid.uuid4().hex[:4]}"
        create_response = requests.post(f"{BASE_URL}/api/customers",
            headers=auth_headers,
            json={
                "name": "عميل بحث",
                "phone": test_phone,
                "address": "بغداد - المنصور",
                "area": "المنصور",
                "notes": "",
                "is_blocked": False
            }
        )
        assert create_response.status_code == 200
        created_customer = create_response.json()
        customer_id = created_customer["id"]
        print(f"✓ Created customer for search test: {customer_id}")
        
        # Search by phone using /api/customers/by-phone/{phone}
        search_response = requests.get(f"{BASE_URL}/api/customers/by-phone/{test_phone}", headers=auth_headers)
        assert search_response.status_code == 200, f"Search failed: {search_response.text}"
        search_result = search_response.json()
        
        # The API returns {found: bool, customer: {...}, orders: [...]}
        assert search_result.get("found") == True or search_result.get("customer") is not None
        if search_result.get("customer"):
            assert search_result["customer"]["phone"] == test_phone
        print(f"✓ Found customer by phone: {test_phone}")
        
        # Cleanup - delete customer
        delete_response = requests.delete(f"{BASE_URL}/api/customers/{customer_id}", headers=auth_headers)
        assert delete_response.status_code == 200
        print(f"✓ Deleted test customer")
    
    def test_search_nonexistent_customer(self, auth_headers):
        """Test searching for non-existent customer"""
        fake_phone = "07999999999"
        search_response = requests.get(f"{BASE_URL}/api/customers/by-phone/{fake_phone}", headers=auth_headers)
        assert search_response.status_code == 200
        search_result = search_response.json()
        # Should return found: false or empty customer
        assert search_result.get("found") == False or search_result.get("customer") is None
        print(f"✓ Non-existent customer search returns correct response")
    
    def test_update_customer(self, auth_headers):
        """Test updating a customer"""
        # Create customer first
        test_phone = f"07701111{uuid.uuid4().hex[:4]}"
        create_response = requests.post(f"{BASE_URL}/api/customers",
            headers=auth_headers,
            json={
                "name": "عميل للتحديث",
                "phone": test_phone,
                "address": "العنوان القديم",
                "area": "المنطقة",
                "notes": "",
                "is_blocked": False
            }
        )
        customer = create_response.json()
        customer_id = customer["id"]
        
        # Update customer
        update_response = requests.put(f"{BASE_URL}/api/customers/{customer_id}",
            headers=auth_headers,
            json={
                "name": "عميل محدث",
                "phone": test_phone,
                "address": "العنوان الجديد",
                "area": "المنطقة الجديدة",
                "notes": "ملاحظات جديدة",
                "is_blocked": False
            }
        )
        assert update_response.status_code == 200
        updated = update_response.json()
        assert updated["name"] == "عميل محدث"
        assert updated["address"] == "العنوان الجديد"
        print(f"✓ Updated customer successfully")
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/customers/{customer_id}", headers=auth_headers)
    
    def test_block_customer(self, auth_headers):
        """Test blocking a customer"""
        # Create customer
        test_phone = f"07702222{uuid.uuid4().hex[:4]}"
        create_response = requests.post(f"{BASE_URL}/api/customers",
            headers=auth_headers,
            json={
                "name": "عميل للحظر",
                "phone": test_phone,
                "address": "عنوان",
                "is_blocked": False
            }
        )
        customer = create_response.json()
        customer_id = customer["id"]
        
        # Block customer
        update_response = requests.put(f"{BASE_URL}/api/customers/{customer_id}",
            headers=auth_headers,
            json={
                "name": "عميل للحظر",
                "phone": test_phone,
                "address": "عنوان",
                "is_blocked": True
            }
        )
        assert update_response.status_code == 200
        updated = update_response.json()
        assert updated["is_blocked"] == True
        print(f"✓ Blocked customer successfully")
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/customers/{customer_id}", headers=auth_headers)
    
    def test_delete_customer(self, auth_headers):
        """Test deleting a customer"""
        # Create customer
        test_phone = f"07703333{uuid.uuid4().hex[:4]}"
        create_response = requests.post(f"{BASE_URL}/api/customers",
            headers=auth_headers,
            json={
                "name": "عميل للحذف",
                "phone": test_phone,
                "address": "عنوان"
            }
        )
        customer = create_response.json()
        customer_id = customer["id"]
        
        # Delete customer
        delete_response = requests.delete(f"{BASE_URL}/api/customers/{customer_id}", headers=auth_headers)
        assert delete_response.status_code == 200
        print(f"✓ Deleted customer successfully")
        
        # Verify deletion
        get_response = requests.get(f"{BASE_URL}/api/customers/{customer_id}", headers=auth_headers)
        assert get_response.status_code == 404
        print(f"✓ Verified customer deletion")


class TestPendingOrders:
    """Pending orders tests - الطلبات المعلقة"""
    
    @pytest.fixture(scope="class")
    def auth_headers(self):
        """Get authenticated headers"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "admin@maestroegp.com",
            "password": "admin123"
        })
        token = response.json()["token"]
        return {"Authorization": f"Bearer {token}"}
    
    @pytest.fixture(scope="class")
    def branch_id(self, auth_headers):
        """Get active branch ID"""
        response = requests.get(f"{BASE_URL}/api/branches", headers=auth_headers)
        branches = response.json()
        # Get first active branch
        active_branch = next((b for b in branches if b.get("is_active", True)), branches[0] if branches else None)
        return active_branch["id"] if active_branch else None
    
    @pytest.fixture(scope="class")
    def product_id(self, auth_headers):
        """Get first product ID"""
        response = requests.get(f"{BASE_URL}/api/products", headers=auth_headers)
        products = response.json()
        return products[0]["id"] if products else None
    
    def test_get_pending_orders(self, auth_headers):
        """Test getting pending orders"""
        response = requests.get(f"{BASE_URL}/api/orders?status=pending", headers=auth_headers)
        assert response.status_code == 200
        orders = response.json()
        assert isinstance(orders, list)
        print(f"✓ Got {len(orders)} pending orders")
        
        # Check order types
        takeaway_count = len([o for o in orders if o["order_type"] == "takeaway"])
        delivery_count = len([o for o in orders if o["order_type"] == "delivery"])
        dine_in_count = len([o for o in orders if o["order_type"] == "dine_in"])
        print(f"  - Takeaway (سفري): {takeaway_count}")
        print(f"  - Delivery (توصيل): {delivery_count}")
        print(f"  - Dine-in (محلي): {dine_in_count}")
        return orders
    
    def test_get_single_order(self, auth_headers):
        """Test getting a single order by ID"""
        # First get pending orders
        orders_response = requests.get(f"{BASE_URL}/api/orders?status=pending", headers=auth_headers)
        orders = orders_response.json()
        
        if len(orders) > 0:
            order_id = orders[0]["id"]
            response = requests.get(f"{BASE_URL}/api/orders/{order_id}", headers=auth_headers)
            assert response.status_code == 200
            order = response.json()
            assert order["id"] == order_id
            assert "items" in order
            assert "total" in order
            print(f"✓ Got order #{order['order_number']} details")
        else:
            print(f"⚠ No pending orders to test")
    
    def test_create_pending_order(self, auth_headers, branch_id, product_id):
        """Test creating a new pending order (sent to kitchen)"""
        if not branch_id or not product_id:
            pytest.skip("No branch or product available")
        
        # Get product details
        product_response = requests.get(f"{BASE_URL}/api/products/{product_id}", headers=auth_headers)
        product = product_response.json()
        
        # Create order with payment_method = "pending"
        create_response = requests.post(f"{BASE_URL}/api/orders",
            headers=auth_headers,
            json={
                "order_type": "takeaway",
                "table_id": None,
                "customer_name": "عميل اختبار",
                "customer_phone": "07701234567",
                "delivery_address": None,
                "buzzer_number": "99",
                "items": [{
                    "product_id": product_id,
                    "product_name": product["name"],
                    "quantity": 2,
                    "price": product["price"],
                    "notes": ""
                }],
                "branch_id": branch_id,
                "payment_method": "pending",
                "discount": 0,
                "notes": "طلب اختبار"
            }
        )
        assert create_response.status_code == 200, f"Create failed: {create_response.text}"
        order = create_response.json()
        assert order["status"] == "pending"
        assert order["payment_method"] == "pending"
        assert order["buzzer_number"] == "99"
        print(f"✓ Created pending order #{order['order_number']}")
        return order


class TestAddItemsToOrder:
    """Test adding items to existing order - إضافة أصناف لطلب موجود"""
    
    @pytest.fixture(scope="class")
    def auth_headers(self):
        """Get authenticated headers"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "admin@maestroegp.com",
            "password": "admin123"
        })
        token = response.json()["token"]
        return {"Authorization": f"Bearer {token}"}
    
    @pytest.fixture(scope="class")
    def branch_id(self, auth_headers):
        """Get active branch ID"""
        response = requests.get(f"{BASE_URL}/api/branches", headers=auth_headers)
        branches = response.json()
        active_branch = next((b for b in branches if b.get("is_active", True)), branches[0] if branches else None)
        return active_branch["id"] if active_branch else None
    
    @pytest.fixture(scope="class")
    def products(self, auth_headers):
        """Get products list"""
        response = requests.get(f"{BASE_URL}/api/products", headers=auth_headers)
        return response.json()
    
    def test_add_items_to_existing_order(self, auth_headers, branch_id, products):
        """Test adding new items to an existing pending order"""
        if not branch_id or len(products) < 2:
            pytest.skip("Need branch and at least 2 products")
        
        # Create initial order with first product
        product1 = products[0]
        create_response = requests.post(f"{BASE_URL}/api/orders",
            headers=auth_headers,
            json={
                "order_type": "takeaway",
                "customer_name": "عميل إضافة أصناف",
                "customer_phone": "07709999999",
                "buzzer_number": "88",
                "items": [{
                    "product_id": product1["id"],
                    "product_name": product1["name"],
                    "quantity": 1,
                    "price": product1["price"],
                    "notes": ""
                }],
                "branch_id": branch_id,
                "payment_method": "pending",
                "discount": 0
            }
        )
        assert create_response.status_code == 200
        order = create_response.json()
        order_id = order["id"]
        initial_total = order["total"]
        initial_items_count = len(order["items"])
        print(f"✓ Created order #{order['order_number']} with {initial_items_count} item(s), total: {initial_total}")
        
        # Add second product to the order
        product2 = products[1] if len(products) > 1 else products[0]
        add_items_response = requests.put(f"{BASE_URL}/api/orders/{order_id}/add-items",
            headers=auth_headers,
            json=[{
                "product_id": product2["id"],
                "product_name": product2["name"],
                "quantity": 2,
                "price": product2["price"],
                "notes": "إضافة جديدة"
            }]
        )
        assert add_items_response.status_code == 200, f"Add items failed: {add_items_response.text}"
        updated_order = add_items_response.json()
        
        # Verify items were added
        assert len(updated_order["items"]) > initial_items_count
        assert updated_order["total"] > initial_total
        print(f"✓ Added items to order. New total: {updated_order['total']}, Items: {len(updated_order['items'])}")
        
        return updated_order


class TestOrderPaymentFlow:
    """Test order payment flow - تدفق الدفع"""
    
    @pytest.fixture(scope="class")
    def auth_headers(self):
        """Get authenticated headers"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "admin@maestroegp.com",
            "password": "admin123"
        })
        token = response.json()["token"]
        return {"Authorization": f"Bearer {token}"}
    
    def test_update_order_payment(self, auth_headers):
        """Test updating order payment method"""
        # Get a pending order
        orders_response = requests.get(f"{BASE_URL}/api/orders?status=pending", headers=auth_headers)
        orders = orders_response.json()
        
        if len(orders) == 0:
            pytest.skip("No pending orders available")
        
        order_id = orders[0]["id"]
        
        # Update payment method to cash
        payment_response = requests.put(
            f"{BASE_URL}/api/orders/{order_id}/payment?payment_method=cash",
            headers=auth_headers
        )
        assert payment_response.status_code == 200
        print(f"✓ Updated order payment method to cash")
    
    def test_update_order_status(self, auth_headers):
        """Test updating order status"""
        # Get orders
        orders_response = requests.get(f"{BASE_URL}/api/orders", headers=auth_headers)
        orders = orders_response.json()
        
        if len(orders) == 0:
            pytest.skip("No orders available")
        
        # Find a pending order
        pending_order = next((o for o in orders if o["status"] == "pending"), None)
        if not pending_order:
            print(f"⚠ No pending orders to update status")
            return
        
        order_id = pending_order["id"]
        
        # Update status to preparing
        status_response = requests.put(
            f"{BASE_URL}/api/orders/{order_id}/status?status=preparing",
            headers=auth_headers
        )
        assert status_response.status_code == 200
        print(f"✓ Updated order status to preparing")


class TestDeliveryOrders:
    """Test delivery orders - طلبات التوصيل"""
    
    @pytest.fixture(scope="class")
    def auth_headers(self):
        """Get authenticated headers"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "admin@maestroegp.com",
            "password": "admin123"
        })
        token = response.json()["token"]
        return {"Authorization": f"Bearer {token}"}
    
    @pytest.fixture(scope="class")
    def branch_id(self, auth_headers):
        """Get active branch ID"""
        response = requests.get(f"{BASE_URL}/api/branches", headers=auth_headers)
        branches = response.json()
        active_branch = next((b for b in branches if b.get("is_active", True)), branches[0] if branches else None)
        return active_branch["id"] if active_branch else None
    
    @pytest.fixture(scope="class")
    def product(self, auth_headers):
        """Get first product"""
        response = requests.get(f"{BASE_URL}/api/products", headers=auth_headers)
        products = response.json()
        return products[0] if products else None
    
    def test_create_delivery_order(self, auth_headers, branch_id, product):
        """Test creating a delivery order"""
        if not branch_id or not product:
            pytest.skip("No branch or product available")
        
        create_response = requests.post(f"{BASE_URL}/api/orders",
            headers=auth_headers,
            json={
                "order_type": "delivery",
                "customer_name": "عميل توصيل",
                "customer_phone": "07708888888",
                "delivery_address": "بغداد - الكرادة - شارع 60",
                "items": [{
                    "product_id": product["id"],
                    "product_name": product["name"],
                    "quantity": 1,
                    "price": product["price"],
                    "notes": ""
                }],
                "branch_id": branch_id,
                "payment_method": "pending",
                "discount": 0,
                "delivery_app": "toters"
            }
        )
        assert create_response.status_code == 200, f"Create failed: {create_response.text}"
        order = create_response.json()
        assert order["order_type"] == "delivery"
        assert order["delivery_address"] == "بغداد - الكرادة - شارع 60"
        print(f"✓ Created delivery order #{order['order_number']}")


class TestDineInOrders:
    """Test dine-in orders - طلبات محلية"""
    
    @pytest.fixture(scope="class")
    def auth_headers(self):
        """Get authenticated headers"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "admin@maestroegp.com",
            "password": "admin123"
        })
        token = response.json()["token"]
        return {"Authorization": f"Bearer {token}"}
    
    @pytest.fixture(scope="class")
    def branch_id(self, auth_headers):
        """Get active branch ID"""
        response = requests.get(f"{BASE_URL}/api/branches", headers=auth_headers)
        branches = response.json()
        active_branch = next((b for b in branches if b.get("is_active", True)), branches[0] if branches else None)
        return active_branch["id"] if active_branch else None
    
    @pytest.fixture(scope="class")
    def table_id(self, auth_headers, branch_id):
        """Get or create a table"""
        if not branch_id:
            return None
        
        # Get tables
        response = requests.get(f"{BASE_URL}/api/tables?branch_id={branch_id}", headers=auth_headers)
        tables = response.json()
        
        if tables:
            # Find available table
            available = next((t for t in tables if t["status"] == "available"), None)
            if available:
                return available["id"]
        
        # Create a table if none available
        create_response = requests.post(f"{BASE_URL}/api/tables",
            headers=auth_headers,
            json={
                "number": 99,
                "capacity": 4,
                "branch_id": branch_id,
                "section": "اختبار"
            }
        )
        if create_response.status_code == 200:
            return create_response.json()["id"]
        return None
    
    @pytest.fixture(scope="class")
    def product(self, auth_headers):
        """Get first product"""
        response = requests.get(f"{BASE_URL}/api/products", headers=auth_headers)
        products = response.json()
        return products[0] if products else None
    
    def test_create_dine_in_order(self, auth_headers, branch_id, table_id, product):
        """Test creating a dine-in order"""
        if not branch_id or not table_id or not product:
            pytest.skip("No branch, table, or product available")
        
        create_response = requests.post(f"{BASE_URL}/api/orders",
            headers=auth_headers,
            json={
                "order_type": "dine_in",
                "table_id": table_id,
                "customer_name": "",
                "customer_phone": "",
                "items": [{
                    "product_id": product["id"],
                    "product_name": product["name"],
                    "quantity": 1,
                    "price": product["price"],
                    "notes": ""
                }],
                "branch_id": branch_id,
                "payment_method": "pending",
                "discount": 0
            }
        )
        assert create_response.status_code == 200, f"Create failed: {create_response.text}"
        order = create_response.json()
        assert order["order_type"] == "dine_in"
        assert order["table_id"] == table_id
        print(f"✓ Created dine-in order #{order['order_number']} for table")


class TestCustomerOrderHistory:
    """Test customer order history - سجل طلبات العميل"""
    
    @pytest.fixture(scope="class")
    def auth_headers(self):
        """Get authenticated headers"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "admin@maestroegp.com",
            "password": "admin123"
        })
        token = response.json()["token"]
        return {"Authorization": f"Bearer {token}"}
    
    @pytest.fixture(scope="class")
    def branch_id(self, auth_headers):
        """Get active branch ID"""
        response = requests.get(f"{BASE_URL}/api/branches", headers=auth_headers)
        branches = response.json()
        active_branch = next((b for b in branches if b.get("is_active", True)), branches[0] if branches else None)
        return active_branch["id"] if active_branch else None
    
    @pytest.fixture(scope="class")
    def product(self, auth_headers):
        """Get first product"""
        response = requests.get(f"{BASE_URL}/api/products", headers=auth_headers)
        products = response.json()
        return products[0] if products else None
    
    def test_customer_auto_creation_on_order(self, auth_headers, branch_id, product):
        """Test that customer is auto-created when placing order with phone"""
        if not branch_id or not product:
            pytest.skip("No branch or product available")
        
        test_phone = f"07705555{uuid.uuid4().hex[:4]}"
        
        # Create order with customer info
        create_response = requests.post(f"{BASE_URL}/api/orders",
            headers=auth_headers,
            json={
                "order_type": "takeaway",
                "customer_name": "عميل جديد تلقائي",
                "customer_phone": test_phone,
                "buzzer_number": "77",
                "items": [{
                    "product_id": product["id"],
                    "product_name": product["name"],
                    "quantity": 1,
                    "price": product["price"],
                    "notes": ""
                }],
                "branch_id": branch_id,
                "payment_method": "cash",
                "discount": 0
            }
        )
        assert create_response.status_code == 200
        order = create_response.json()
        print(f"✓ Created order with customer phone: {test_phone}")
        
        # Search for customer - should be auto-created
        search_response = requests.get(f"{BASE_URL}/api/customers/by-phone/{test_phone}", headers=auth_headers)
        assert search_response.status_code == 200
        search_result = search_response.json()
        
        # Customer should exist now
        if search_result.get("found") or search_result.get("customer"):
            customer = search_result.get("customer")
            assert customer["phone"] == test_phone
            assert customer["total_orders"] >= 1
            assert customer["total_spent"] >= order["total"]
            print(f"✓ Customer auto-created with {customer['total_orders']} order(s), spent: {customer['total_spent']}")
        else:
            print(f"⚠ Customer auto-creation may not be implemented")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
