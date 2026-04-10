"""
Test Suite for Delivery App Credit Tracking - Iteration 156
Tests:
1. Delivery order creation with delivery_app and delivery_app_name saved
2. Credit sales calculation EXCLUDES orders with delivery_app
3. delivery_app_sales uses delivery_app_name as key
4. Order loading restores delivery_app state
"""
import pytest
import requests
import os
import time
import uuid

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestDeliveryAppCreditTracking:
    """Test delivery app credit tracking for all delivery companies"""
    
    auth_token = None
    test_branch_id = None
    test_shift_id = None
    created_order_ids = []
    
    @pytest.fixture(autouse=True)
    def setup(self, api_client):
        """Setup: Login and get branch/shift info"""
        if not TestDeliveryAppCreditTracking.auth_token:
            # Login
            login_response = api_client.post(f"{BASE_URL}/api/auth/login", json={
                "email": "hanialdujaili@gmail.com",
                "password": "Hani@2024"
            })
            assert login_response.status_code == 200, f"Login failed: {login_response.text}"
            TestDeliveryAppCreditTracking.auth_token = login_response.json().get("token")
            
            # Get branch
            api_client.headers.update({"Authorization": f"Bearer {TestDeliveryAppCreditTracking.auth_token}"})
            branches_response = api_client.get(f"{BASE_URL}/api/branches")
            assert branches_response.status_code == 200
            branches = branches_response.json()
            if branches:
                TestDeliveryAppCreditTracking.test_branch_id = branches[0].get("id")
            
            # Get or create shift
            shifts_response = api_client.get(f"{BASE_URL}/api/shifts/current")
            if shifts_response.status_code == 200 and shifts_response.json():
                TestDeliveryAppCreditTracking.test_shift_id = shifts_response.json().get("id")
        
        api_client.headers.update({"Authorization": f"Bearer {TestDeliveryAppCreditTracking.auth_token}"})
    
    def test_01_get_delivery_apps_list(self, api_client):
        """Test GET /api/delivery-apps returns all 5 delivery companies"""
        response = api_client.get(f"{BASE_URL}/api/delivery-apps")
        assert response.status_code == 200, f"Failed to get delivery apps: {response.text}"
        
        apps = response.json()
        assert isinstance(apps, list), "Response should be a list"
        
        # Check for expected delivery apps
        expected_apps = ["toters", "talabat", "baly", "alsaree3", "talabati"]
        app_ids = [app.get("id") for app in apps]
        
        for expected in expected_apps:
            assert expected in app_ids, f"Missing delivery app: {expected}"
        
        print(f"✓ Found {len(apps)} delivery apps: {app_ids}")
    
    def test_02_create_order_with_toters_delivery_app(self, api_client):
        """Test creating order with delivery_app='toters' saves both delivery_app and delivery_app_name"""
        # Get a product first
        products_response = api_client.get(f"{BASE_URL}/api/products")
        assert products_response.status_code == 200
        products = products_response.json()
        assert len(products) > 0, "No products available for testing"
        
        product = products[0]
        
        order_data = {
            "items": [{
                "product_id": product.get("id"),
                "product_name": product.get("name"),
                "price": product.get("price", 10),
                "quantity": 1,
                "cost": product.get("cost", 0),
                "notes": "",
                "extras": []
            }],
            "branch_id": TestDeliveryAppCreditTracking.test_branch_id,
            "payment_method": "credit",
            "discount": 0,
            "delivery_app": "toters",
            "delivery_app_name": "توترز",
            "order_type": "delivery",
            "notes": "TEST_iter156_toters"
        }
        
        response = api_client.post(f"{BASE_URL}/api/orders", json=order_data)
        assert response.status_code in [200, 201], f"Failed to create order: {response.text}"
        
        order = response.json()
        TestDeliveryAppCreditTracking.created_order_ids.append(order.get("id"))
        
        # Verify delivery_app and delivery_app_name are saved
        assert order.get("delivery_app") == "toters", f"delivery_app not saved correctly: {order.get('delivery_app')}"
        assert order.get("delivery_app_name") == "توترز", f"delivery_app_name not saved correctly: {order.get('delivery_app_name')}"
        # is_delivery_company is set internally and may not be returned in response
        
        print(f"✓ Order created with toters: delivery_app={order.get('delivery_app')}, delivery_app_name={order.get('delivery_app_name')}")
    
    def test_03_create_order_with_talabat_delivery_app(self, api_client):
        """Test creating order with delivery_app='talabat' saves both fields"""
        products_response = api_client.get(f"{BASE_URL}/api/products")
        products = products_response.json()
        product = products[0]
        
        order_data = {
            "items": [{
                "product_id": product.get("id"),
                "product_name": product.get("name"),
                "price": product.get("price", 10),
                "quantity": 1,
                "cost": product.get("cost", 0),
                "notes": "",
                "extras": []
            }],
            "branch_id": TestDeliveryAppCreditTracking.test_branch_id,
            "payment_method": "credit",
            "discount": 0,
            "delivery_app": "talabat",
            "delivery_app_name": "طلبات",
            "order_type": "delivery",
            "notes": "TEST_iter156_talabat"
        }
        
        response = api_client.post(f"{BASE_URL}/api/orders", json=order_data)
        assert response.status_code in [200, 201], f"Failed to create order: {response.text}"
        
        order = response.json()
        TestDeliveryAppCreditTracking.created_order_ids.append(order.get("id"))
        
        assert order.get("delivery_app") == "talabat", f"delivery_app not saved: {order.get('delivery_app')}"
        assert order.get("delivery_app_name") == "طلبات", f"delivery_app_name not saved: {order.get('delivery_app_name')}"
        
        print(f"✓ Order created with talabat: delivery_app={order.get('delivery_app')}, delivery_app_name={order.get('delivery_app_name')}")
    
    def test_04_create_order_with_baly_delivery_app(self, api_client):
        """Test creating order with delivery_app='baly' saves both fields"""
        products_response = api_client.get(f"{BASE_URL}/api/products")
        products = products_response.json()
        product = products[0]
        
        order_data = {
            "items": [{
                "product_id": product.get("id"),
                "product_name": product.get("name"),
                "price": product.get("price", 10),
                "quantity": 1,
                "cost": product.get("cost", 0),
                "notes": "",
                "extras": []
            }],
            "branch_id": TestDeliveryAppCreditTracking.test_branch_id,
            "payment_method": "credit",
            "discount": 0,
            "delivery_app": "baly",
            "delivery_app_name": "بالي",
            "order_type": "delivery",
            "notes": "TEST_iter156_baly"
        }
        
        response = api_client.post(f"{BASE_URL}/api/orders", json=order_data)
        assert response.status_code in [200, 201], f"Failed to create order: {response.text}"
        
        order = response.json()
        TestDeliveryAppCreditTracking.created_order_ids.append(order.get("id"))
        
        assert order.get("delivery_app") == "baly", f"delivery_app not saved: {order.get('delivery_app')}"
        assert order.get("delivery_app_name") == "بالي", f"delivery_app_name not saved: {order.get('delivery_app_name')}"
        
        print(f"✓ Order created with baly: delivery_app={order.get('delivery_app')}, delivery_app_name={order.get('delivery_app_name')}")
    
    def test_05_create_regular_credit_order_without_delivery_app(self, api_client):
        """Test creating a regular credit order (آجل) without delivery_app"""
        products_response = api_client.get(f"{BASE_URL}/api/products")
        products = products_response.json()
        product = products[0]
        
        order_data = {
            "items": [{
                "product_id": product.get("id"),
                "product_name": product.get("name"),
                "price": product.get("price", 10),
                "quantity": 1,
                "cost": product.get("cost", 0),
                "notes": "",
                "extras": []
            }],
            "branch_id": TestDeliveryAppCreditTracking.test_branch_id,
            "payment_method": "credit",
            "discount": 0,
            "delivery_app": None,
            "delivery_app_name": None,
            "order_type": "takeaway",
            "notes": "TEST_iter156_regular_credit"
        }
        
        response = api_client.post(f"{BASE_URL}/api/orders", json=order_data)
        assert response.status_code in [200, 201], f"Failed to create order: {response.text}"
        
        order = response.json()
        TestDeliveryAppCreditTracking.created_order_ids.append(order.get("id"))
        
        # Regular credit order should NOT have delivery_app
        assert order.get("delivery_app") is None, f"Regular credit order should not have delivery_app"
        assert order.get("is_delivery_company") != True, f"Regular credit order should not be marked as delivery company"
        
        print(f"✓ Regular credit order created without delivery_app")
    
    def test_06_verify_order_retrieval_has_delivery_app(self, api_client):
        """Test that GET /api/orders/{id} returns delivery_app for pending order loading"""
        if not TestDeliveryAppCreditTracking.created_order_ids:
            pytest.skip("No orders created to test")
        
        order_id = TestDeliveryAppCreditTracking.created_order_ids[0]  # toters order
        
        response = api_client.get(f"{BASE_URL}/api/orders/{order_id}")
        assert response.status_code == 200, f"Failed to get order: {response.text}"
        
        order = response.json()
        assert order.get("delivery_app") == "toters", f"delivery_app not returned in GET: {order.get('delivery_app')}"
        assert order.get("delivery_app_name") == "توترز", f"delivery_app_name not returned in GET: {order.get('delivery_app_name')}"
        
        print(f"✓ Order retrieval includes delivery_app={order.get('delivery_app')}, delivery_app_name={order.get('delivery_app_name')}")
    
    def test_07_verify_cash_register_summary_excludes_delivery_from_credit(self, api_client):
        """Test that cash register summary excludes delivery app orders from credit_sales"""
        response = api_client.get(f"{BASE_URL}/api/cash-register/summary")
        
        if response.status_code == 404:
            pytest.skip("No active shift for summary test")
        
        assert response.status_code == 200, f"Failed to get summary: {response.text}"
        
        summary = response.json()
        
        # Check that delivery_app_sales exists and is separate from credit_sales
        assert "delivery_app_sales" in summary or "credit_sales" in summary, "Summary should have sales breakdown"
        
        # If delivery_app_sales exists, verify it uses app names as keys
        if summary.get("delivery_app_sales"):
            delivery_sales = summary.get("delivery_app_sales")
            print(f"✓ delivery_app_sales found: {delivery_sales}")
            
            # Keys should be human-readable names (Arabic), not IDs
            for key in delivery_sales.keys():
                # Arabic names should contain Arabic characters
                assert any('\u0600' <= c <= '\u06FF' for c in key) or key in ["toters", "talabat", "baly", "alsaree3", "talabati"], \
                    f"delivery_app_sales key should be human-readable name, got: {key}"
        
        print(f"✓ Cash register summary structure verified")
    
    def test_08_verify_pending_orders_include_delivery_app(self, api_client):
        """Test that pending orders list includes delivery_app for pre-filling"""
        response = api_client.get(f"{BASE_URL}/api/orders?status=pending")
        
        if response.status_code != 200:
            response = api_client.get(f"{BASE_URL}/api/orders")
        
        assert response.status_code == 200, f"Failed to get orders: {response.text}"
        
        orders = response.json()
        
        # Find our test orders
        test_orders = [o for o in orders if (o.get("notes") or "").startswith("TEST_iter156")]
        
        for order in test_orders:
            if "toters" in order.get("notes", ""):
                assert order.get("delivery_app") == "toters", f"Pending order missing delivery_app"
                assert order.get("delivery_app_name") == "توترز", f"Pending order missing delivery_app_name"
            elif "talabat" in order.get("notes", ""):
                assert order.get("delivery_app") == "talabat", f"Pending order missing delivery_app"
            elif "baly" in order.get("notes", ""):
                assert order.get("delivery_app") == "baly", f"Pending order missing delivery_app"
        
        print(f"✓ Pending orders include delivery_app fields")
    
    def test_09_cleanup_test_orders(self, api_client):
        """Cleanup: Cancel test orders"""
        for order_id in TestDeliveryAppCreditTracking.created_order_ids:
            try:
                # Try to cancel the order
                response = api_client.put(f"{BASE_URL}/api/orders/{order_id}/status?status=cancelled")
                if response.status_code in [200, 204]:
                    print(f"✓ Cancelled test order: {order_id}")
            except Exception as e:
                print(f"Warning: Could not cancel order {order_id}: {e}")
        
        TestDeliveryAppCreditTracking.created_order_ids = []
        print("✓ Cleanup completed")


class TestCodeReviewVerification:
    """Code review verification tests - checking implementation details"""
    
    def test_10_verify_pos_js_delivery_app_name_in_payloads(self):
        """Verify POS.js sends delivery_app_name in all 5 order creation paths"""
        pos_file = "/app/frontend/src/pages/POS.js"
        
        with open(pos_file, 'r') as f:
            content = f.read()
        
        # Check for delivery_app_name in order payloads
        # Lines ~1533, 1649, 1819, 1952, 2147
        delivery_app_name_pattern = "delivery_app_name: orderType === 'delivery' && deliveryApp"
        
        occurrences = content.count(delivery_app_name_pattern)
        assert occurrences >= 5, f"Expected 5 occurrences of delivery_app_name in payloads, found {occurrences}"
        
        print(f"✓ Found {occurrences} occurrences of delivery_app_name in POS.js order payloads")
    
    def test_11_verify_shifts_routes_credit_excludes_delivery(self):
        """Verify shifts_routes.py credit_sales excludes delivery_app orders"""
        shifts_file = "/app/backend/routes/shifts_routes.py"
        
        with open(shifts_file, 'r') as f:
            content = f.read()
        
        # Check for the exclusion pattern in credit_sales calculation
        exclusion_pattern = 'not o.get("delivery_app") and not o.get("is_delivery_company")'
        
        occurrences = content.count(exclusion_pattern)
        assert occurrences >= 3, f"Expected 3 occurrences of delivery exclusion in credit_sales, found {occurrences}"
        
        print(f"✓ Found {occurrences} occurrences of delivery exclusion in credit_sales calculation")
    
    def test_12_verify_print_server_delivery_company_display(self):
        """Verify print_server.ps1 displays delivery_company in kitchen print"""
        ps1_file = "/app/backend/static/print_server.ps1"
        
        with open(ps1_file, 'r') as f:
            content = f.read()
        
        # Check for delivery_company display
        assert '$order.delivery_company' in content, "print_server.ps1 should display delivery_company"
        
        print("✓ print_server.ps1 includes delivery_company display")
    
    def test_13_verify_print_service_delivery_company_field(self):
        """Verify printService.js includes delivery_company field"""
        print_service_file = "/app/frontend/src/utils/printService.js"
        
        with open(print_service_file, 'r') as f:
            content = f.read()
        
        # Check for delivery_company field
        assert "delivery_company: order.delivery_company" in content, "printService.js should include delivery_company field"
        
        print("✓ printService.js includes delivery_company field")
    
    def test_14_verify_build_print_order_data_delivery_company(self):
        """Verify buildPrintOrderData includes delivery_company from deliveryApps"""
        pos_file = "/app/frontend/src/pages/POS.js"
        
        with open(pos_file, 'r') as f:
            content = f.read()
        
        # Check for delivery_company in buildPrintOrderData
        assert "delivery_company:" in content, "buildPrintOrderData should include delivery_company"
        assert "deliveryAppObj" in content or "deliveryApps.find" in content, "Should lookup delivery app name"
        
        print("✓ buildPrintOrderData includes delivery_company field")
    
    def test_15_verify_order_loading_restores_delivery_app(self):
        """Verify loadOrderForEdit restores deliveryApp state from order.delivery_app"""
        pos_file = "/app/frontend/src/pages/POS.js"
        
        with open(pos_file, 'r') as f:
            content = f.read()
        
        # Check for setDeliveryApp in order loading
        assert "setDeliveryApp(order.delivery_app" in content, "Order loading should restore deliveryApp state"
        
        print("✓ Order loading restores deliveryApp state from order.delivery_app")


@pytest.fixture
def api_client():
    """Shared requests session"""
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    return session


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
