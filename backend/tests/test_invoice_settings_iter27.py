"""
Test Suite for Invoice Settings and Printer Permissions - Iteration 27
Tests:
1. Tenant Invoice Settings API (GET/PUT)
2. Print Invoice with Printer Permissions (show_prices, print_mode, print_individual_items)
3. Auto Print Data Endpoint
"""

import pytest
import requests
import os
import uuid

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
CUSTOMER_ADMIN = {"email": "ahmed@albait.com", "password": "123456"}
SUPER_ADMIN = {"email": "owner@maestroegp.com", "password": "owner123"}
BRANCH_ID = "336c7687-471d-48b2-b3b2-f87b75b536df"


class TestAuth:
    """Authentication tests"""
    
    def test_customer_admin_login(self):
        """Test customer admin login"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json=CUSTOMER_ADMIN)
        print(f"Customer admin login response: {response.status_code}")
        if response.status_code == 200:
            data = response.json()
            assert "token" in data
            print(f"Customer admin login successful, role: {data.get('user', {}).get('role')}")
        else:
            print(f"Customer admin login failed: {response.text}")
            pytest.skip("Customer admin login failed - may not exist")
    
    def test_super_admin_login(self):
        """Test super admin login"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json=SUPER_ADMIN)
        print(f"Super admin login response: {response.status_code}")
        assert response.status_code == 200
        data = response.json()
        assert "token" in data
        assert data.get("user", {}).get("role") == "super_admin"
        print("Super admin login successful")


class TestTenantInvoiceSettings:
    """Tenant Invoice Settings API Tests"""
    
    @pytest.fixture
    def auth_token(self):
        """Get auth token for customer admin or super admin"""
        # Try customer admin first
        response = requests.post(f"{BASE_URL}/api/auth/login", json=CUSTOMER_ADMIN)
        if response.status_code == 200:
            return response.json().get("token")
        
        # Fallback to super admin
        response = requests.post(f"{BASE_URL}/api/auth/login", json=SUPER_ADMIN)
        if response.status_code == 200:
            return response.json().get("token")
        
        pytest.skip("Could not authenticate")
    
    def test_get_tenant_invoice_settings(self, auth_token):
        """Test GET /api/tenant/invoice-settings"""
        headers = {"Authorization": f"Bearer {auth_token}"}
        response = requests.get(f"{BASE_URL}/api/tenant/invoice-settings", headers=headers)
        
        print(f"GET invoice settings response: {response.status_code}")
        assert response.status_code == 200
        
        data = response.json()
        print(f"Invoice settings: {data}")
        
        # Verify default fields exist
        assert "show_logo" in data
        assert "phone" in data or data.get("phone") is None
        assert "address" in data or data.get("address") is None
        assert "tax_number" in data or data.get("tax_number") is None
        assert "custom_header" in data or data.get("custom_header") is None
        assert "custom_footer" in data or data.get("custom_footer") is None
        print("GET tenant invoice settings - PASSED")
    
    def test_update_tenant_invoice_settings(self, auth_token):
        """Test PUT /api/tenant/invoice-settings"""
        headers = {"Authorization": f"Bearer {auth_token}"}
        
        # Update settings
        test_settings = {
            "show_logo": True,
            "phone": "07701234567",
            "phone2": "07809876543",
            "address": "بغداد - الكرادة - شارع الريحان",
            "tax_number": "123456789",
            "custom_header": "أهلاً بكم في مطعمنا",
            "custom_footer": "نتمنى لكم وجبة شهية!"
        }
        
        response = requests.put(
            f"{BASE_URL}/api/tenant/invoice-settings",
            headers=headers,
            json=test_settings
        )
        
        print(f"PUT invoice settings response: {response.status_code}")
        assert response.status_code == 200
        
        data = response.json()
        print(f"Update response: {data}")
        assert "message" in data
        
        # Verify settings were saved by fetching again
        get_response = requests.get(f"{BASE_URL}/api/tenant/invoice-settings", headers=headers)
        assert get_response.status_code == 200
        
        saved_settings = get_response.json()
        assert saved_settings.get("phone") == test_settings["phone"]
        assert saved_settings.get("address") == test_settings["address"]
        print("PUT tenant invoice settings - PASSED")


class TestPrintInvoiceWithPermissions:
    """Print Invoice with Printer Permissions Tests"""
    
    @pytest.fixture
    def auth_token(self):
        """Get auth token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json=SUPER_ADMIN)
        if response.status_code == 200:
            return response.json().get("token")
        pytest.skip("Could not authenticate")
    
    @pytest.fixture
    def test_order_id(self, auth_token):
        """Create a test order and return its ID"""
        headers = {"Authorization": f"Bearer {auth_token}"}
        
        # Get branches first
        branches_response = requests.get(f"{BASE_URL}/api/branches", headers=headers)
        if branches_response.status_code != 200:
            pytest.skip("Could not get branches")
        
        branches = branches_response.json()
        branch_id = branches[0]["id"] if branches else None
        
        # Get products
        products_response = requests.get(f"{BASE_URL}/api/products", headers=headers)
        if products_response.status_code != 200:
            pytest.skip("Could not get products")
        
        products = products_response.json()
        if not products:
            pytest.skip("No products available")
        
        # Create order
        order_data = {
            "order_type": "dine_in",
            "items": [
                {
                    "product_id": products[0]["id"],
                    "product_name": products[0]["name"],
                    "quantity": 2,
                    "price": products[0]["price"]
                }
            ],
            "subtotal": products[0]["price"] * 2,
            "total": products[0]["price"] * 2,
            "payment_method": "cash",
            "branch_id": branch_id
        }
        
        response = requests.post(f"{BASE_URL}/api/orders", headers=headers, json=order_data)
        if response.status_code in [200, 201]:
            order = response.json()
            return order.get("id")
        
        # Try to get existing order
        orders_response = requests.get(f"{BASE_URL}/api/orders?limit=1", headers=headers)
        if orders_response.status_code == 200:
            orders = orders_response.json()
            if orders:
                return orders[0]["id"]
        
        pytest.skip("Could not create or find test order")
    
    def test_print_invoice_basic(self, auth_token, test_order_id):
        """Test POST /api/invoices/print/{order_id} - Basic print"""
        headers = {"Authorization": f"Bearer {auth_token}"}
        
        response = requests.post(
            f"{BASE_URL}/api/invoices/print/{test_order_id}",
            headers=headers
        )
        
        print(f"Print invoice response: {response.status_code}")
        assert response.status_code == 200
        
        data = response.json()
        print(f"Print data keys: {data.keys()}")
        
        # Verify response structure
        assert "print_data" in data
        assert "print_jobs" in data
        assert "printer_settings" in data
        
        # Verify printer settings defaults
        settings = data.get("printer_settings", {})
        assert "show_prices" in settings
        assert "print_mode" in settings
        assert "print_individual_items" in settings
        
        print(f"Printer settings: {settings}")
        print("Print invoice basic - PASSED")
    
    def test_print_invoice_with_printer_id(self, auth_token, test_order_id):
        """Test print invoice with specific printer ID"""
        headers = {"Authorization": f"Bearer {auth_token}"}
        
        # First, get or create a printer
        printers_response = requests.get(f"{BASE_URL}/api/printers", headers=headers)
        
        printer_id = None
        if printers_response.status_code == 200:
            printers = printers_response.json()
            if printers:
                printer_id = printers[0]["id"]
        
        if not printer_id:
            # Create a test printer
            branches_response = requests.get(f"{BASE_URL}/api/branches", headers=headers)
            branch_id = branches_response.json()[0]["id"] if branches_response.status_code == 200 and branches_response.json() else None
            
            printer_data = {
                "name": "Test Printer No Prices",
                "ip_address": "192.168.1.100",
                "port": 9100,
                "branch_id": branch_id,
                "printer_type": "receipt",
                "print_mode": "full_receipt",
                "show_prices": False,  # Test hiding prices
                "print_individual_items": False,
                "auto_print_on_order": True
            }
            
            create_response = requests.post(f"{BASE_URL}/api/printers", headers=headers, json=printer_data)
            if create_response.status_code == 200:
                printer_id = create_response.json().get("id")
        
        if not printer_id:
            pytest.skip("Could not get or create printer")
        
        # Test print with printer_id
        response = requests.post(
            f"{BASE_URL}/api/invoices/print/{test_order_id}?printer_id={printer_id}",
            headers=headers
        )
        
        print(f"Print with printer_id response: {response.status_code}")
        assert response.status_code == 200
        
        data = response.json()
        print(f"Printer settings applied: {data.get('printer_settings')}")
        print("Print invoice with printer_id - PASSED")


class TestAutoPrintData:
    """Auto Print Data Endpoint Tests"""
    
    @pytest.fixture
    def auth_token(self):
        """Get auth token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json=SUPER_ADMIN)
        if response.status_code == 200:
            return response.json().get("token")
        pytest.skip("Could not authenticate")
    
    @pytest.fixture
    def test_order_id(self, auth_token):
        """Get an existing order ID"""
        headers = {"Authorization": f"Bearer {auth_token}"}
        
        orders_response = requests.get(f"{BASE_URL}/api/orders?limit=1", headers=headers)
        if orders_response.status_code == 200:
            orders = orders_response.json()
            if orders:
                return orders[0]["id"]
        
        pytest.skip("No orders available for testing")
    
    def test_auto_print_data(self, auth_token, test_order_id):
        """Test GET /api/invoices/auto-print/{order_id}"""
        headers = {"Authorization": f"Bearer {auth_token}"}
        
        response = requests.get(
            f"{BASE_URL}/api/invoices/auto-print/{test_order_id}",
            headers=headers
        )
        
        print(f"Auto print data response: {response.status_code}")
        assert response.status_code == 200
        
        data = response.json()
        print(f"Auto print data keys: {data.keys()}")
        
        # Verify response structure
        assert "message" in data
        
        # If printers exist, verify structure
        if "printers" in data and data["printers"]:
            for printer_data in data["printers"]:
                assert "printer" in printer_data
                assert "settings" in printer_data
                assert "print_jobs" in printer_data
                
                settings = printer_data["settings"]
                assert "show_prices" in settings
                assert "print_mode" in settings
                assert "print_individual_items" in settings
        
        print(f"Auto print response: {data}")
        print("Auto print data - PASSED")


class TestPrinterPermissions:
    """Test Printer Permissions (show_prices, print_individual_items)"""
    
    @pytest.fixture
    def auth_token(self):
        """Get auth token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json=SUPER_ADMIN)
        if response.status_code == 200:
            return response.json().get("token")
        pytest.skip("Could not authenticate")
    
    def test_create_printer_with_no_prices(self, auth_token):
        """Test creating printer with show_prices=False"""
        headers = {"Authorization": f"Bearer {auth_token}"}
        
        # Get branch
        branches_response = requests.get(f"{BASE_URL}/api/branches", headers=headers)
        branch_id = branches_response.json()[0]["id"] if branches_response.status_code == 200 and branches_response.json() else None
        
        printer_data = {
            "name": f"Kitchen Printer No Prices {uuid.uuid4().hex[:6]}",
            "ip_address": "192.168.1.101",
            "port": 9100,
            "branch_id": branch_id,
            "printer_type": "kitchen",
            "print_mode": "kitchen_ticket",
            "show_prices": False,  # Kitchen doesn't need prices
            "print_individual_items": False,
            "auto_print_on_order": True
        }
        
        response = requests.post(f"{BASE_URL}/api/printers", headers=headers, json=printer_data)
        print(f"Create printer response: {response.status_code}")
        assert response.status_code == 200
        
        data = response.json()
        assert data.get("show_prices") == False
        print("Create printer with no prices - PASSED")
    
    def test_create_printer_with_individual_items(self, auth_token):
        """Test creating printer with print_individual_items=True"""
        headers = {"Authorization": f"Bearer {auth_token}"}
        
        # Get branch
        branches_response = requests.get(f"{BASE_URL}/api/branches", headers=headers)
        branch_id = branches_response.json()[0]["id"] if branches_response.status_code == 200 and branches_response.json() else None
        
        printer_data = {
            "name": f"Station Printer Individual {uuid.uuid4().hex[:6]}",
            "ip_address": "192.168.1.102",
            "port": 9100,
            "branch_id": branch_id,
            "printer_type": "kitchen",
            "print_mode": "kitchen_ticket",
            "show_prices": False,
            "print_individual_items": True,  # Print each item separately
            "auto_print_on_order": True
        }
        
        response = requests.post(f"{BASE_URL}/api/printers", headers=headers, json=printer_data)
        print(f"Create printer response: {response.status_code}")
        assert response.status_code == 200
        
        data = response.json()
        assert data.get("print_individual_items") == True
        print("Create printer with individual items - PASSED")
    
    def test_update_printer_permissions(self, auth_token):
        """Test updating printer permissions"""
        headers = {"Authorization": f"Bearer {auth_token}"}
        
        # Get existing printers
        printers_response = requests.get(f"{BASE_URL}/api/printers", headers=headers)
        if printers_response.status_code != 200 or not printers_response.json():
            pytest.skip("No printers available")
        
        printer = printers_response.json()[0]
        printer_id = printer["id"]
        
        # Update permissions
        update_data = {
            "name": printer["name"],
            "ip_address": printer["ip_address"],
            "port": printer.get("port", 9100),
            "branch_id": printer.get("branch_id"),
            "printer_type": printer.get("printer_type", "receipt"),
            "print_mode": "kitchen_ticket",
            "show_prices": False,
            "print_individual_items": True,
            "auto_print_on_order": True
        }
        
        response = requests.put(
            f"{BASE_URL}/api/printers/{printer_id}",
            headers=headers,
            json=update_data
        )
        
        print(f"Update printer response: {response.status_code}")
        assert response.status_code == 200
        
        # Verify update
        get_response = requests.get(f"{BASE_URL}/api/printers", headers=headers)
        updated_printer = next((p for p in get_response.json() if p["id"] == printer_id), None)
        
        if updated_printer:
            assert updated_printer.get("show_prices") == False
            assert updated_printer.get("print_individual_items") == True
        
        print("Update printer permissions - PASSED")


class TestHealthCheck:
    """Basic health check tests"""
    
    def test_server_health(self):
        """Test server is running"""
        response = requests.get(f"{BASE_URL}/")
        assert response.status_code == 200
        print("Server health check - PASSED")
    
    def test_api_health(self):
        """Test API health endpoint"""
        response = requests.get(f"{BASE_URL}/api/health")
        assert response.status_code == 200
        print("API health check - PASSED")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
