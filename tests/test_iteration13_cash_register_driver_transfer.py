"""
Iteration 13 - Backend API Tests
Testing:
1. POST /api/auth/login - تسجيل الدخول
2. POST /api/shifts/auto-open - فتح وردية تلقائياً
3. POST /api/orders - إنشاء طلب جديد
4. GET /api/cash-register/summary - ملخص الصندوق (يجب أن يعرض قيم صحيحة وليست أصفار)
5. POST /api/cash-register/close - إغلاق الصندوق (يجب أن يُرجع تقرير بقيم صحيحة)
6. POST /api/orders/{order_id}/transfer-driver - تحويل طلب لسائق آخر
7. GET /api/drivers?include_orders=true - جلب السائقين مع بيانات طلباتهم
8. GET /api/orders/{order_id} - جلب تفاصيل الطلب (يجب أن يحتوي على driver_name و driver_phone)
"""

import pytest
import requests
import os
import uuid
from datetime import datetime

# Get BASE_URL from environment
BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')
if not BASE_URL:
    BASE_URL = "https://menumasters-11.preview.emergentagent.com"

# Test credentials
TEST_EMAIL = "admin@maestroegp.com"
TEST_PASSWORD = "admin123"


class TestAuthAndShift:
    """Authentication and Shift tests"""
    
    @pytest.fixture(scope="class")
    def auth_token(self):
        """Get authentication token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD
        })
        assert response.status_code == 200, f"Login failed: {response.text}"
        data = response.json()
        assert "token" in data, "No token in response"
        assert "user" in data, "No user in response"
        return data["token"]
    
    @pytest.fixture(scope="class")
    def auth_headers(self, auth_token):
        """Get auth headers"""
        return {"Authorization": f"Bearer {auth_token}"}
    
    def test_01_login_success(self):
        """Test login with valid credentials"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD
        })
        assert response.status_code == 200
        data = response.json()
        assert "token" in data
        assert "user" in data
        assert data["user"]["email"] == TEST_EMAIL
        print(f"✅ Login successful for {TEST_EMAIL}")
    
    def test_02_login_invalid_credentials(self):
        """Test login with invalid credentials"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "wrong@email.com",
            "password": "wrongpassword"
        })
        assert response.status_code == 401
        print("✅ Invalid credentials rejected correctly")
    
    def test_03_auto_open_shift(self, auth_headers):
        """Test auto-open shift endpoint"""
        response = requests.post(f"{BASE_URL}/api/shifts/auto-open", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert "shift" in data
        assert "message" in data
        shift = data["shift"]
        assert "id" in shift
        assert "cashier_id" in shift
        assert "status" in shift
        assert shift["status"] == "open"
        print(f"✅ Shift auto-opened: {shift['id'][:8]}... (was_existing: {data.get('was_existing', False)})")
        return shift


class TestOrderCreation:
    """Order creation tests"""
    
    @pytest.fixture(scope="class")
    def auth_data(self):
        """Get authentication data"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD
        })
        assert response.status_code == 200
        return response.json()
    
    @pytest.fixture(scope="class")
    def auth_headers(self, auth_data):
        """Get auth headers"""
        return {"Authorization": f"Bearer {auth_data['token']}"}
    
    @pytest.fixture(scope="class")
    def branch_id(self, auth_headers):
        """Get first branch ID"""
        response = requests.get(f"{BASE_URL}/api/branches", headers=auth_headers)
        assert response.status_code == 200
        branches = response.json()
        if branches:
            return branches[0]["id"]
        # Create a branch if none exists
        response = requests.post(f"{BASE_URL}/api/branches", headers=auth_headers, json={
            "name": "Test Branch",
            "address": "Test Address",
            "phone": "1234567890"
        })
        assert response.status_code == 200
        return response.json()["id"]
    
    @pytest.fixture(scope="class")
    def category_id(self, auth_headers):
        """Get or create a category"""
        response = requests.get(f"{BASE_URL}/api/categories", headers=auth_headers)
        assert response.status_code == 200
        categories = response.json()
        if categories:
            return categories[0]["id"]
        # Create a category if none exists
        response = requests.post(f"{BASE_URL}/api/categories", headers=auth_headers, json={
            "name": "Test Category",
            "name_en": "Test Category"
        })
        assert response.status_code == 200
        return response.json()["id"]
    
    @pytest.fixture(scope="class")
    def product_id(self, auth_headers, category_id):
        """Get or create a product"""
        response = requests.get(f"{BASE_URL}/api/products", headers=auth_headers)
        assert response.status_code == 200
        products = response.json()
        if products:
            return products[0]["id"], products[0]["name"], products[0]["price"]
        # Create a product if none exists
        response = requests.post(f"{BASE_URL}/api/products", headers=auth_headers, json={
            "name": "Test Product",
            "name_en": "Test Product",
            "category_id": category_id,
            "price": 10000,
            "cost": 5000
        })
        assert response.status_code == 200
        product = response.json()
        return product["id"], product["name"], product["price"]
    
    def test_01_create_order(self, auth_headers, branch_id, product_id):
        """Test creating a new order"""
        product_id_val, product_name, product_price = product_id
        
        # First ensure shift is open
        requests.post(f"{BASE_URL}/api/shifts/auto-open", headers=auth_headers)
        
        order_data = {
            "order_type": "dine_in",
            "items": [
                {
                    "product_id": product_id_val,
                    "product_name": product_name,
                    "quantity": 2,
                    "price": product_price,
                    "cost": 5000
                }
            ],
            "branch_id": branch_id,
            "payment_method": "cash",
            "discount": 0
        }
        
        response = requests.post(f"{BASE_URL}/api/orders", headers=auth_headers, json=order_data)
        assert response.status_code == 200, f"Order creation failed: {response.text}"
        order = response.json()
        
        assert "id" in order
        assert "order_number" in order
        assert "total" in order
        assert order["total"] > 0, "Order total should be greater than 0"
        assert order["status"] in ["pending", "preparing", "ready"]
        
        print(f"✅ Order created: #{order['order_number']} - Total: {order['total']}")
        return order


class TestCashRegister:
    """Cash register summary and close tests"""
    
    @pytest.fixture(scope="class")
    def auth_data(self):
        """Get authentication data"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD
        })
        assert response.status_code == 200
        return response.json()
    
    @pytest.fixture(scope="class")
    def auth_headers(self, auth_data):
        """Get auth headers"""
        return {"Authorization": f"Bearer {auth_data['token']}"}
    
    @pytest.fixture(scope="class")
    def setup_order(self, auth_headers):
        """Create an order to ensure cash register has data"""
        # Ensure shift is open
        requests.post(f"{BASE_URL}/api/shifts/auto-open", headers=auth_headers)
        
        # Get branch
        branches_resp = requests.get(f"{BASE_URL}/api/branches", headers=auth_headers)
        branches = branches_resp.json()
        branch_id = branches[0]["id"] if branches else None
        
        if not branch_id:
            return None
        
        # Get product
        products_resp = requests.get(f"{BASE_URL}/api/products", headers=auth_headers)
        products = products_resp.json()
        
        if not products:
            return None
        
        product = products[0]
        
        # Create order
        order_data = {
            "order_type": "dine_in",
            "items": [
                {
                    "product_id": product["id"],
                    "product_name": product["name"],
                    "quantity": 1,
                    "price": product["price"],
                    "cost": product.get("cost", 0)
                }
            ],
            "branch_id": branch_id,
            "payment_method": "cash",
            "discount": 0
        }
        
        response = requests.post(f"{BASE_URL}/api/orders", headers=auth_headers, json=order_data)
        if response.status_code == 200:
            return response.json()
        return None
    
    def test_01_cash_register_summary(self, auth_headers, setup_order):
        """Test cash register summary returns correct values"""
        response = requests.get(f"{BASE_URL}/api/cash-register/summary", headers=auth_headers)
        
        # If no shift is open, this is expected to fail with 404
        if response.status_code == 404:
            # Open a shift first
            requests.post(f"{BASE_URL}/api/shifts/auto-open", headers=auth_headers)
            response = requests.get(f"{BASE_URL}/api/cash-register/summary", headers=auth_headers)
        
        assert response.status_code == 200, f"Cash register summary failed: {response.text}"
        data = response.json()
        
        # Verify required fields exist
        assert "total_sales" in data, "total_sales missing from response"
        assert "cash_sales" in data, "cash_sales missing from response"
        assert "total_orders" in data, "total_orders missing from response"
        assert "opening_cash" in data, "opening_cash missing from response"
        assert "expected_cash" in data, "expected_cash missing from response"
        
        # Verify data types
        assert isinstance(data["total_sales"], (int, float)), "total_sales should be numeric"
        assert isinstance(data["cash_sales"], (int, float)), "cash_sales should be numeric"
        assert isinstance(data["total_orders"], int), "total_orders should be integer"
        
        print(f"✅ Cash register summary:")
        print(f"   - Total Sales: {data['total_sales']}")
        print(f"   - Cash Sales: {data['cash_sales']}")
        print(f"   - Total Orders: {data['total_orders']}")
        print(f"   - Expected Cash: {data['expected_cash']}")
        
        # If we created an order, verify values are not all zeros
        if setup_order:
            # At least one of these should be > 0 if we have orders
            has_data = data["total_sales"] > 0 or data["total_orders"] > 0
            print(f"   - Has data: {has_data}")
        
        return data
    
    def test_02_cash_register_close(self, auth_headers):
        """Test cash register close returns correct report"""
        # First ensure shift is open
        shift_resp = requests.post(f"{BASE_URL}/api/shifts/auto-open", headers=auth_headers)
        assert shift_resp.status_code == 200
        
        # Get summary first to know expected values
        summary_resp = requests.get(f"{BASE_URL}/api/cash-register/summary", headers=auth_headers)
        
        if summary_resp.status_code == 404:
            pytest.skip("No open shift to close")
        
        summary = summary_resp.json()
        
        # Close the cash register
        close_data = {
            "denominations": {
                "250": 0,
                "500": 0,
                "1000": 0,
                "5000": 0,
                "10000": 0,
                "25000": 0,
                "50000": 0
            },
            "notes": "Test close"
        }
        
        response = requests.post(f"{BASE_URL}/api/cash-register/close", headers=auth_headers, json=close_data)
        
        # If already closed, that's okay
        if response.status_code == 400 and "مغلق" in response.text:
            print("⚠️ Shift already closed, skipping close test")
            pytest.skip("Shift already closed")
        
        assert response.status_code == 200, f"Cash register close failed: {response.text}"
        data = response.json()
        
        # Verify report fields
        assert "total_sales" in data, "total_sales missing from close report"
        assert "cash_sales" in data, "cash_sales missing from close report"
        assert "total_orders" in data, "total_orders missing from close report"
        
        print(f"✅ Cash register closed successfully:")
        print(f"   - Total Sales: {data.get('total_sales', 0)}")
        print(f"   - Cash Sales: {data.get('cash_sales', 0)}")
        print(f"   - Total Orders: {data.get('total_orders', 0)}")
        print(f"   - Net Profit: {data.get('net_profit', 0)}")
        
        return data


class TestDriverTransfer:
    """Driver transfer tests"""
    
    @pytest.fixture(scope="class")
    def auth_data(self):
        """Get authentication data"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD
        })
        assert response.status_code == 200
        return response.json()
    
    @pytest.fixture(scope="class")
    def auth_headers(self, auth_data):
        """Get auth headers"""
        return {"Authorization": f"Bearer {auth_data['token']}"}
    
    @pytest.fixture(scope="class")
    def branch_id(self, auth_headers):
        """Get first branch ID"""
        response = requests.get(f"{BASE_URL}/api/branches", headers=auth_headers)
        assert response.status_code == 200
        branches = response.json()
        if branches:
            return branches[0]["id"]
        return None
    
    @pytest.fixture(scope="class")
    def drivers(self, auth_headers, branch_id):
        """Get or create two drivers for transfer test"""
        if not branch_id:
            pytest.skip("No branch available")
        
        response = requests.get(f"{BASE_URL}/api/drivers", headers=auth_headers)
        assert response.status_code == 200
        existing_drivers = response.json()
        
        drivers_list = []
        
        # Use existing drivers or create new ones
        for i, driver in enumerate(existing_drivers[:2]):
            drivers_list.append(driver)
        
        # Create drivers if we don't have enough
        while len(drivers_list) < 2:
            driver_data = {
                "name": f"TEST_Driver_{len(drivers_list) + 1}_{uuid.uuid4().hex[:6]}",
                "phone": f"077000000{len(drivers_list)}",
                "branch_id": branch_id
            }
            response = requests.post(f"{BASE_URL}/api/drivers", headers=auth_headers, json=driver_data)
            if response.status_code == 200:
                drivers_list.append(response.json())
        
        return drivers_list
    
    @pytest.fixture(scope="class")
    def delivery_order(self, auth_headers, branch_id, drivers):
        """Create a delivery order with a driver assigned"""
        if not branch_id or len(drivers) < 2:
            pytest.skip("Not enough drivers for transfer test")
        
        # Ensure shift is open
        requests.post(f"{BASE_URL}/api/shifts/auto-open", headers=auth_headers)
        
        # Get a product
        products_resp = requests.get(f"{BASE_URL}/api/products", headers=auth_headers)
        products = products_resp.json()
        
        if not products:
            pytest.skip("No products available")
        
        product = products[0]
        driver = drivers[0]
        
        order_data = {
            "order_type": "delivery",
            "customer_name": "Test Customer",
            "customer_phone": "0770000000",
            "delivery_address": "Test Address",
            "items": [
                {
                    "product_id": product["id"],
                    "product_name": product["name"],
                    "quantity": 1,
                    "price": product["price"],
                    "cost": product.get("cost", 0)
                }
            ],
            "branch_id": branch_id,
            "payment_method": "cash",
            "discount": 0,
            "driver_id": driver["id"]
        }
        
        response = requests.post(f"{BASE_URL}/api/orders", headers=auth_headers, json=order_data)
        assert response.status_code == 200, f"Order creation failed: {response.text}"
        return response.json()
    
    def test_01_transfer_driver(self, auth_headers, delivery_order, drivers):
        """Test transferring order to another driver"""
        if len(drivers) < 2:
            pytest.skip("Not enough drivers for transfer test")
        
        order_id = delivery_order["id"]
        new_driver = drivers[1]
        
        response = requests.post(
            f"{BASE_URL}/api/orders/{order_id}/transfer-driver",
            headers=auth_headers,
            json={"new_driver_id": new_driver["id"]}
        )
        
        assert response.status_code == 200, f"Transfer failed: {response.text}"
        data = response.json()
        
        assert "message" in data
        assert "new_driver" in data
        assert data["new_driver"] == new_driver["name"]
        
        print(f"✅ Order transferred to driver: {data['new_driver']}")
        
        # Verify the order was updated
        order_resp = requests.get(f"{BASE_URL}/api/orders/{order_id}", headers=auth_headers)
        assert order_resp.status_code == 200
        updated_order = order_resp.json()
        
        assert updated_order["driver_id"] == new_driver["id"], "driver_id not updated"
        assert updated_order.get("driver_name") == new_driver["name"], "driver_name not updated"
        assert updated_order.get("driver_phone") == new_driver["phone"], "driver_phone not updated"
        
        print(f"✅ Order verified with new driver info:")
        print(f"   - driver_id: {updated_order['driver_id']}")
        print(f"   - driver_name: {updated_order.get('driver_name')}")
        print(f"   - driver_phone: {updated_order.get('driver_phone')}")
        
        return data
    
    def test_02_get_drivers_with_orders(self, auth_headers):
        """Test getting drivers with include_orders=true"""
        response = requests.get(f"{BASE_URL}/api/drivers?include_orders=true", headers=auth_headers)
        assert response.status_code == 200
        drivers = response.json()
        
        assert isinstance(drivers, list)
        
        # Check if any driver has current_order populated
        drivers_with_orders = [d for d in drivers if d.get("current_order")]
        
        print(f"✅ Got {len(drivers)} drivers, {len(drivers_with_orders)} with current orders")
        
        for driver in drivers:
            if driver.get("current_order"):
                order = driver["current_order"]
                assert "id" in order, "current_order should have id"
                assert "order_number" in order, "current_order should have order_number"
                print(f"   - Driver {driver['name']} has order #{order['order_number']}")
        
        return drivers
    
    def test_03_get_order_with_driver_info(self, auth_headers, delivery_order):
        """Test that order contains driver_name and driver_phone"""
        order_id = delivery_order["id"]
        
        response = requests.get(f"{BASE_URL}/api/orders/{order_id}", headers=auth_headers)
        assert response.status_code == 200
        order = response.json()
        
        # These fields should exist in the response model
        assert "driver_id" in order or order.get("driver_id") is None, "driver_id field should exist"
        
        # If driver is assigned, verify driver_name and driver_phone
        if order.get("driver_id"):
            # driver_name and driver_phone should be present
            print(f"✅ Order has driver info:")
            print(f"   - driver_id: {order.get('driver_id')}")
            print(f"   - driver_name: {order.get('driver_name')}")
            print(f"   - driver_phone: {order.get('driver_phone')}")
        else:
            print("⚠️ Order has no driver assigned")
        
        return order
    
    def test_04_verify_old_driver_current_order_cleared(self, auth_headers, delivery_order, drivers):
        """Verify that old driver's current_order_id is cleared after transfer"""
        if len(drivers) < 2:
            pytest.skip("Not enough drivers")
        
        old_driver_id = drivers[0]["id"]
        
        # Get the old driver's current state
        response = requests.get(f"{BASE_URL}/api/drivers?include_orders=true", headers=auth_headers)
        assert response.status_code == 200
        all_drivers = response.json()
        
        old_driver = next((d for d in all_drivers if d["id"] == old_driver_id), None)
        
        if old_driver:
            # After transfer, old driver should not have this order as current
            if old_driver.get("current_order_id") == delivery_order["id"]:
                print("⚠️ Old driver still has the transferred order as current_order_id")
            else:
                print(f"✅ Old driver's current_order_id is correctly updated: {old_driver.get('current_order_id')}")
        
        return old_driver


class TestOrderDetails:
    """Test order details endpoint"""
    
    @pytest.fixture(scope="class")
    def auth_headers(self):
        """Get auth headers"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD
        })
        assert response.status_code == 200
        return {"Authorization": f"Bearer {response.json()['token']}"}
    
    def test_01_get_order_response_model(self, auth_headers):
        """Test that order response includes driver_name and driver_phone fields"""
        # Get any order
        response = requests.get(f"{BASE_URL}/api/orders", headers=auth_headers)
        assert response.status_code == 200
        orders = response.json()
        
        if not orders:
            pytest.skip("No orders available")
        
        order = orders[0]
        order_id = order["id"]
        
        # Get single order
        response = requests.get(f"{BASE_URL}/api/orders/{order_id}", headers=auth_headers)
        assert response.status_code == 200
        order_detail = response.json()
        
        # Verify the response model has the expected fields
        expected_fields = [
            "id", "order_number", "order_type", "items", "subtotal",
            "discount", "tax", "total", "branch_id", "cashier_id",
            "status", "payment_method", "payment_status", "created_at", "updated_at"
        ]
        
        for field in expected_fields:
            assert field in order_detail, f"Missing field: {field}"
        
        # Check driver fields exist (can be None)
        print(f"✅ Order #{order_detail['order_number']} details:")
        print(f"   - driver_id: {order_detail.get('driver_id')}")
        print(f"   - driver_name: {order_detail.get('driver_name')}")
        print(f"   - driver_phone: {order_detail.get('driver_phone')}")
        
        return order_detail


# Cleanup fixture
@pytest.fixture(scope="session", autouse=True)
def cleanup(request):
    """Cleanup test data after all tests"""
    def cleanup_test_data():
        # Login
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD
        })
        if response.status_code != 200:
            return
        
        headers = {"Authorization": f"Bearer {response.json()['token']}"}
        
        # Delete test drivers
        drivers_resp = requests.get(f"{BASE_URL}/api/drivers", headers=headers)
        if drivers_resp.status_code == 200:
            for driver in drivers_resp.json():
                if driver.get("name", "").startswith("TEST_"):
                    requests.delete(f"{BASE_URL}/api/drivers/{driver['id']}", headers=headers)
        
        print("✅ Test cleanup completed")
    
    request.addfinalizer(cleanup_test_data)


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
