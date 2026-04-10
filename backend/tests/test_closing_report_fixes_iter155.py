"""
Test Closing Report Bug Fixes - Iteration 155
Tests for:
1. closing_cash field returned by backend (not counted_cash)
2. delivery_app_sales uses delivery_app_name as key (human-readable name)
3. Receipt CSS dimensions (70mm width, 66mm body - verified in frontend code review)
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestClosingReportFixes:
    """Tests for closing report bug fixes"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test session with auth"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        # Login as admin
        login_response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "hanialdujaili@gmail.com",
            "password": "Hani@2024"
        })
        assert login_response.status_code == 200, f"Login failed: {login_response.text}"
        token = login_response.json().get("token")
        assert token, f"No token returned: {login_response.json()}"
        self.session.headers.update({"Authorization": f"Bearer {token}"})
        self.token = token
        yield
    
    def test_01_cash_register_summary_returns_delivery_app_sales(self):
        """Verify /api/cash-register/summary returns delivery_app_sales field"""
        response = self.session.get(f"{BASE_URL}/api/cash-register/summary")
        assert response.status_code == 200, f"Failed to get summary: {response.text}"
        
        data = response.json()
        # Verify delivery_app_sales field exists
        assert "delivery_app_sales" in data, "delivery_app_sales field missing from response"
        assert isinstance(data["delivery_app_sales"], dict), "delivery_app_sales should be a dict"
        print(f"✓ delivery_app_sales field present: {data['delivery_app_sales']}")
    
    def test_02_cash_register_close_returns_closing_cash(self):
        """Verify /api/cash-register/close returns closing_cash field (not counted_cash)"""
        # First get summary to ensure shift is open
        summary_response = self.session.get(f"{BASE_URL}/api/cash-register/summary")
        assert summary_response.status_code == 200, f"Failed to get summary: {summary_response.text}"
        
        # Close with test denominations
        close_response = self.session.post(f"{BASE_URL}/api/cash-register/close", json={
            "denominations": {
                "250": 0,
                "500": 0,
                "1000": 10,  # 10,000 IQD
                "5000": 2,   # 10,000 IQD
                "10000": 1,  # 10,000 IQD
                "25000": 0,
                "50000": 0
            },
            "notes": "Test closing for iteration 155"
        })
        assert close_response.status_code == 200, f"Failed to close register: {close_response.text}"
        
        data = close_response.json()
        
        # Verify closing_cash field exists (this was the bug - frontend was reading counted_cash)
        assert "closing_cash" in data, "closing_cash field missing from response"
        
        # Verify the value is calculated correctly from denominations
        expected_closing_cash = (10 * 1000) + (2 * 5000) + (1 * 10000)  # 30,000 IQD
        assert data["closing_cash"] == expected_closing_cash, f"closing_cash mismatch: expected {expected_closing_cash}, got {data['closing_cash']}"
        
        # Verify delivery_app_sales is in response
        assert "delivery_app_sales" in data, "delivery_app_sales field missing from close response"
        
        print(f"✓ closing_cash field present with correct value: {data['closing_cash']}")
        print(f"✓ delivery_app_sales in close response: {data['delivery_app_sales']}")
    
    def test_03_delivery_app_sales_uses_app_name_as_key(self):
        """Verify delivery_app_sales uses human-readable app name as key (not ID)"""
        # Get summary
        response = self.session.get(f"{BASE_URL}/api/cash-register/summary")
        assert response.status_code == 200, f"Failed to get summary: {response.text}"
        
        data = response.json()
        delivery_app_sales = data.get("delivery_app_sales", {})
        
        # If there are delivery app sales, verify keys are human-readable names (not UUIDs)
        for key in delivery_app_sales.keys():
            # UUID pattern check - keys should NOT be UUIDs
            is_uuid = len(key) == 36 and key.count('-') == 4
            assert not is_uuid, f"delivery_app_sales key '{key}' appears to be a UUID, should be human-readable name"
            print(f"✓ delivery_app_sales key is human-readable: '{key}'")
        
        if not delivery_app_sales:
            print("✓ No delivery app sales in current shift (expected if no delivery orders)")
    
    def test_04_verify_backend_aggregation_logic(self):
        """Verify backend uses delivery_app_name for aggregation"""
        # This test verifies the backend code logic by checking the response structure
        response = self.session.get(f"{BASE_URL}/api/cash-register/summary")
        assert response.status_code == 200
        
        data = response.json()
        
        # Verify all expected fields are present
        required_fields = [
            "shift_id", "branch_id", "cashier_id", "total_sales", 
            "cash_sales", "card_sales", "credit_sales", "delivery_app_sales",
            "expected_cash", "total_expenses"
        ]
        
        for field in required_fields:
            assert field in data, f"Required field '{field}' missing from summary"
        
        print(f"✓ All required fields present in cash-register/summary response")
        print(f"  - total_sales: {data['total_sales']}")
        print(f"  - cash_sales: {data['cash_sales']}")
        print(f"  - card_sales: {data['card_sales']}")
        print(f"  - credit_sales: {data['credit_sales']}")
        print(f"  - delivery_app_sales: {data['delivery_app_sales']}")
    
    def test_05_reopen_shift_after_close(self):
        """Reopen shift for subsequent tests"""
        # Auto-open shift
        response = self.session.post(f"{BASE_URL}/api/shifts/auto-open")
        # Accept both 200 (new shift) and 200 with existing shift
        assert response.status_code == 200, f"Failed to auto-open shift: {response.text}"
        
        data = response.json()
        print(f"✓ Shift status: {data.get('message', 'opened')}")


class TestFrontendCodeReview:
    """Code review verification for frontend fixes"""
    
    def test_06_verify_frontend_uses_closing_cash(self):
        """Verify frontend code uses closing_cash (code review)"""
        # Read Dashboard.js and verify the fix
        dashboard_path = "/app/frontend/src/pages/Dashboard.js"
        
        with open(dashboard_path, 'r') as f:
            content = f.read()
        
        # Check printClosingReceipt uses closing_cash
        assert "data.closing_cash || data.counted_cash" in content, \
            "printClosingReceipt should use 'data.closing_cash || data.counted_cash'"
        
        # Check printClosingReceiptViaUSB uses closing_cash
        usb_pattern = "const countedCash = data.closing_cash || data.counted_cash"
        assert usb_pattern in content, \
            "printClosingReceiptViaUSB should use 'data.closing_cash || data.counted_cash'"
        
        # Check UI displays closingResult.closing_cash
        assert "closingResult.closing_cash" in content, \
            "UI should display closingResult.closing_cash"
        
        print("✓ Frontend uses closing_cash field correctly")
    
    def test_07_verify_receipt_css_dimensions(self):
        """Verify receipt CSS uses 70mm width (code review)"""
        dashboard_path = "/app/frontend/src/pages/Dashboard.js"
        
        with open(dashboard_path, 'r') as f:
            content = f.read()
        
        # Check @page size is 70mm auto
        assert "size: 70mm auto" in content, \
            "Receipt @page size should be '70mm auto'"
        
        # Check html width is 70mm
        assert "html { width: 70mm" in content, \
            "Receipt html width should be 70mm"
        
        # Check body width is 66mm
        assert "width: 66mm" in content, \
            "Receipt body width should be 66mm"
        
        # Verify old values are NOT present
        assert "size: 65mm 250mm" not in content, \
            "Old receipt size '65mm 250mm' should be removed"
        
        print("✓ Receipt CSS dimensions are correct (70mm page, 66mm body)")
    
    def test_08_verify_delivery_app_html_section(self):
        """Verify deliveryAppHtml section exists in printClosingReceipt"""
        dashboard_path = "/app/frontend/src/pages/Dashboard.js"
        
        with open(dashboard_path, 'r') as f:
            content = f.read()
        
        # Check deliveryAppHtml variable is created
        assert "let deliveryAppHtml = ''" in content, \
            "deliveryAppHtml variable should be initialized"
        
        # Check delivery app section title in Arabic
        assert "مبيعات تطبيقات التوصيل" in content, \
            "Delivery app section title should be in Arabic"
        
        # Check deliveryAppHtml is used in the receipt
        assert "${deliveryAppHtml}" in content, \
            "deliveryAppHtml should be interpolated in receipt HTML"
        
        print("✓ Delivery app HTML section exists in printClosingReceipt")
    
    def test_09_verify_usb_receipt_delivery_section(self):
        """Verify USB receipt includes delivery app sales section"""
        dashboard_path = "/app/frontend/src/pages/Dashboard.js"
        
        with open(dashboard_path, 'r') as f:
            content = f.read()
        
        # Check USB receipt has delivery app sales section
        assert "data.delivery_app_sales && Object.keys(data.delivery_app_sales).length > 0" in content, \
            "USB receipt should check for delivery_app_sales"
        
        # Check USB receipt maps delivery app entries
        assert "Object.entries(data.delivery_app_sales).map" in content, \
            "USB receipt should map delivery_app_sales entries"
        
        print("✓ USB receipt includes delivery app sales section")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
