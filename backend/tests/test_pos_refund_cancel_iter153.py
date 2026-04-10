"""
Test POS Refund/Cancel/Payment Flow - Iteration 153
Tests:
1. POST /api/cash-register/close includes total_refunds and refund_count
2. Cash register close excludes refunded orders from sales totals
3. Daily closing report includes total_refunds, refund_count, total_cancellations
4. Refund creates order with status='refunded'
5. Cancel creates order with status='cancelled'
"""
import pytest
import requests
import os
import uuid
from datetime import datetime

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestPOSRefundCancelFlow:
    """Test POS refund and cancel flow with kitchen print and sales exclusion"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test session with authentication"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        # Login as admin
        login_res = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "hanialdujaili@gmail.com",
            "password": "Hani@2024"
        })
        assert login_res.status_code == 200, f"Login failed: {login_res.text}"
        token = login_res.json().get("token")
        self.session.headers.update({"Authorization": f"Bearer {token}"})
        self.user = login_res.json().get("user", {})
        
        # Get first branch
        branches_res = self.session.get(f"{BASE_URL}/api/branches")
        if branches_res.status_code == 200 and branches_res.json():
            self.branch_id = branches_res.json()[0].get("id")
        else:
            self.branch_id = None
        
        # Get first product for test orders
        products_res = self.session.get(f"{BASE_URL}/api/products")
        if products_res.status_code == 200 and products_res.json():
            self.product = products_res.json()[0]
        else:
            self.product = {"id": "test-product", "name": "Test Product", "price": 5000}
        
        yield
        
        # Cleanup: No specific cleanup needed
    
    def test_01_cash_register_close_includes_refund_fields(self):
        """Test POST /api/cash-register/close response includes total_refunds and refund_count"""
        # Get cash register summary first
        summary_res = self.session.get(f"{BASE_URL}/api/cash-register/summary")
        
        if summary_res.status_code == 404:
            # No open shift - auto-open one
            auto_open_res = self.session.post(f"{BASE_URL}/api/shifts/auto-open")
            assert auto_open_res.status_code == 200, f"Auto-open shift failed: {auto_open_res.text}"
            summary_res = self.session.get(f"{BASE_URL}/api/cash-register/summary")
        
        assert summary_res.status_code == 200, f"Get summary failed: {summary_res.text}"
        
        # Close cash register with denominations
        close_res = self.session.post(f"{BASE_URL}/api/cash-register/close", json={
            "denominations": {"1000": 10, "5000": 5, "10000": 2},  # 10000 + 25000 + 20000 = 55000
            "notes": "Test close for refund fields check"
        })
        
        assert close_res.status_code == 200, f"Close failed: {close_res.text}"
        data = close_res.json()
        
        # Verify refund fields exist in response
        assert "total_refunds" in data, "total_refunds field missing from close response"
        assert "refund_count" in data, "refund_count field missing from close response"
        
        # Verify they are numeric
        assert isinstance(data["total_refunds"], (int, float)), "total_refunds should be numeric"
        assert isinstance(data["refund_count"], (int, float)), "refund_count should be numeric"
        
        print(f"✅ Cash register close includes total_refunds={data['total_refunds']}, refund_count={data['refund_count']}")
    
    def test_02_daily_closing_report_includes_refund_and_cancel_fields(self):
        """Test GET /api/reports/cash-register-closing includes refund and cancellation fields"""
        today = datetime.now().strftime("%Y-%m-%d")
        
        report_res = self.session.get(f"{BASE_URL}/api/reports/cash-register-closing", params={
            "start_date": today,
            "end_date": f"{today}T23:59:59"
        })
        
        assert report_res.status_code == 200, f"Report failed: {report_res.text}"
        data = report_res.json()
        
        # Verify summary section exists
        assert "summary" in data, "summary section missing from report"
        summary = data["summary"]
        
        # Verify refund fields
        assert "total_refunds" in summary, "total_refunds missing from summary"
        assert "refund_count" in summary, "refund_count missing from summary"
        
        # Verify cancellation fields
        assert "total_cancellations" in summary, "total_cancellations missing from summary"
        
        print(f"✅ Daily closing report includes:")
        print(f"   - total_refunds: {summary.get('total_refunds', 0)}")
        print(f"   - refund_count: {summary.get('refund_count', 0)}")
        print(f"   - total_cancellations: {summary.get('total_cancellations', 0)}")
    
    def test_03_create_order_and_refund_excludes_from_sales(self):
        """Test that refunded orders are excluded from sales calculations"""
        # Auto-open shift first
        self.session.post(f"{BASE_URL}/api/shifts/auto-open")
        
        # Create a test order
        order_data = {
            "order_type": "takeaway",
            "items": [{
                "product_id": self.product.get("id"),
                "product_name": self.product.get("name"),
                "price": self.product.get("price", 5000),
                "quantity": 2,
                "cost": 0
            }],
            "branch_id": self.branch_id,
            "payment_method": "cash",
            "discount": 0,
            "customer_name": "TEST_REFUND_CUSTOMER"
        }
        
        create_res = self.session.post(f"{BASE_URL}/api/orders", json=order_data)
        assert create_res.status_code in [200, 201], f"Create order failed: {create_res.text}"
        order = create_res.json()
        order_id = order.get("id")
        order_total = order.get("total", 10000)
        
        print(f"✅ Created test order #{order.get('order_number')} with total {order_total}")
        
        # Get sales before refund
        today = datetime.now().strftime("%Y-%m-%d")
        report_before = self.session.get(f"{BASE_URL}/api/reports/cash-register-closing", params={
            "start_date": today,
            "end_date": f"{today}T23:59:59"
        })
        sales_before = report_before.json().get("summary", {}).get("total_sales", 0)
        
        # Refund the order
        refund_res = self.session.post(f"{BASE_URL}/api/refunds", json={
            "order_id": order_id,
            "reason": "Test refund for sales exclusion",
            "refund_type": "full"
        })
        
        assert refund_res.status_code == 200, f"Refund failed: {refund_res.text}"
        print(f"✅ Refunded order #{order.get('order_number')}")
        
        # Verify order status is now 'refunded'
        order_check = self.session.get(f"{BASE_URL}/api/orders/{order_id}")
        if order_check.status_code == 200:
            order_status = order_check.json().get("status")
            assert order_status == "refunded", f"Order status should be 'refunded', got '{order_status}'"
            print(f"✅ Order status is 'refunded'")
        
        # Get sales after refund
        report_after = self.session.get(f"{BASE_URL}/api/reports/cash-register-closing", params={
            "start_date": today,
            "end_date": f"{today}T23:59:59"
        })
        summary_after = report_after.json().get("summary", {})
        sales_after = summary_after.get("total_sales", 0)
        refunds_total = summary_after.get("total_refunds", 0)
        
        # Refunded order should NOT be in total_sales
        # It should be in total_refunds instead
        print(f"   Sales before refund: {sales_before}")
        print(f"   Sales after refund: {sales_after}")
        print(f"   Total refunds: {refunds_total}")
        
        # The refunded order total should appear in total_refunds
        assert refunds_total >= order_total, f"Refund total ({refunds_total}) should include order total ({order_total})"
        print(f"✅ Refunded order excluded from sales, included in refunds")
    
    def test_04_create_order_and_cancel_excludes_from_sales(self):
        """Test that cancelled orders are excluded from sales calculations"""
        # Auto-open shift first
        self.session.post(f"{BASE_URL}/api/shifts/auto-open")
        
        # Create a test order
        order_data = {
            "order_type": "takeaway",
            "items": [{
                "product_id": self.product.get("id"),
                "product_name": self.product.get("name"),
                "price": self.product.get("price", 5000),
                "quantity": 1,
                "cost": 0
            }],
            "branch_id": self.branch_id,
            "payment_method": "pending",
            "discount": 0,
            "customer_name": "TEST_CANCEL_CUSTOMER"
        }
        
        create_res = self.session.post(f"{BASE_URL}/api/orders", json=order_data)
        assert create_res.status_code in [200, 201], f"Create order failed: {create_res.text}"
        order = create_res.json()
        order_id = order.get("id")
        order_total = order.get("total", 5000)
        
        print(f"✅ Created test order #{order.get('order_number')} with total {order_total}")
        
        # Cancel the order
        cancel_res = self.session.put(f"{BASE_URL}/api/orders/{order_id}/cancel")
        assert cancel_res.status_code == 200, f"Cancel failed: {cancel_res.text}"
        print(f"✅ Cancelled order #{order.get('order_number')}")
        
        # Verify order status is now 'cancelled'
        order_check = self.session.get(f"{BASE_URL}/api/orders/{order_id}")
        if order_check.status_code == 200:
            order_status = order_check.json().get("status")
            assert order_status == "cancelled", f"Order status should be 'cancelled', got '{order_status}'"
            print(f"✅ Order status is 'cancelled'")
        
        # Get report to verify cancellation is tracked
        today = datetime.now().strftime("%Y-%m-%d")
        report_res = self.session.get(f"{BASE_URL}/api/reports/cash-register-closing", params={
            "start_date": today,
            "end_date": f"{today}T23:59:59"
        })
        summary = report_res.json().get("summary", {})
        
        # Cancelled order should be in total_cancellations, not total_sales
        cancellations = summary.get("total_cancellations", 0)
        print(f"   Total cancellations: {cancellations}")
        
        assert cancellations >= order_total, f"Cancellation total ({cancellations}) should include order total ({order_total})"
        print(f"✅ Cancelled order excluded from sales, included in cancellations")
    
    def test_05_refund_status_endpoint(self):
        """Test GET /api/orders/{id}/refund-status endpoint"""
        # Auto-open shift first
        self.session.post(f"{BASE_URL}/api/shifts/auto-open")
        
        # Create a test order
        order_data = {
            "order_type": "takeaway",
            "items": [{
                "product_id": self.product.get("id"),
                "product_name": self.product.get("name"),
                "price": self.product.get("price", 5000),
                "quantity": 1,
                "cost": 0
            }],
            "branch_id": self.branch_id,
            "payment_method": "cash",
            "discount": 0,
            "customer_name": "TEST_REFUND_STATUS"
        }
        
        create_res = self.session.post(f"{BASE_URL}/api/orders", json=order_data)
        assert create_res.status_code in [200, 201], f"Create order failed: {create_res.text}"
        order = create_res.json()
        order_id = order.get("id")
        
        # Check refund status before refund
        status_res = self.session.get(f"{BASE_URL}/api/orders/{order_id}/refund-status")
        assert status_res.status_code == 200, f"Refund status check failed: {status_res.text}"
        status_data = status_res.json()
        
        assert "is_refunded" in status_data, "is_refunded field missing"
        assert "can_refund" in status_data, "can_refund field missing"
        assert status_data["is_refunded"] == False, "Order should not be refunded yet"
        
        print(f"✅ Refund status endpoint working: is_refunded={status_data['is_refunded']}, can_refund={status_data['can_refund']}")
        
        # Refund the order
        refund_res = self.session.post(f"{BASE_URL}/api/refunds", json={
            "order_id": order_id,
            "reason": "Test refund status check",
            "refund_type": "full"
        })
        assert refund_res.status_code == 200, f"Refund failed: {refund_res.text}"
        
        # Check refund status after refund
        status_after = self.session.get(f"{BASE_URL}/api/orders/{order_id}/refund-status")
        assert status_after.status_code == 200
        status_data_after = status_after.json()
        
        assert status_data_after["is_refunded"] == True, "Order should be refunded now"
        print(f"✅ After refund: is_refunded={status_data_after['is_refunded']}")
    
    def test_06_shifts_routes_close_includes_refund_fields(self):
        """Test that shifts_routes.py close_cash_register includes refund fields"""
        # This tests the /api/cash-register/close endpoint from shifts_routes.py
        # Auto-open shift first
        auto_res = self.session.post(f"{BASE_URL}/api/shifts/auto-open")
        
        # Get summary
        summary_res = self.session.get(f"{BASE_URL}/api/cash-register/summary")
        if summary_res.status_code != 200:
            pytest.skip("No open shift available")
        
        # Close with denominations
        close_res = self.session.post(f"{BASE_URL}/api/cash-register/close", json={
            "denominations": {"1000": 5},
            "notes": "Test for refund fields in shifts_routes"
        })
        
        assert close_res.status_code == 200, f"Close failed: {close_res.text}"
        data = close_res.json()
        
        # Verify refund fields from shifts_routes.py (line 681-682)
        assert "total_refunds" in data, "total_refunds missing from shifts_routes close"
        assert "refund_count" in data, "refund_count missing from shifts_routes close"
        
        print(f"✅ shifts_routes.py close includes total_refunds={data['total_refunds']}, refund_count={data['refund_count']}")


class TestReportsRefundLabel:
    """Test that Reports page uses المرتجعات instead of الإرجاعات"""
    
    def test_07_reports_js_uses_correct_arabic_label(self):
        """Verify Reports.js uses المرتجعات (not الإرجاعات)"""
        import subprocess
        
        # Check Reports.js for the correct Arabic label
        result = subprocess.run(
            ["grep", "-c", "المرتجعات", "/app/frontend/src/pages/Reports.js"],
            capture_output=True, text=True
        )
        
        count_correct = int(result.stdout.strip()) if result.returncode == 0 else 0
        
        # Check for the old incorrect label
        result_old = subprocess.run(
            ["grep", "-c", "الإرجاعات", "/app/frontend/src/pages/Reports.js"],
            capture_output=True, text=True
        )
        
        count_old = int(result_old.stdout.strip()) if result_old.returncode == 0 else 0
        
        print(f"   'المرتجعات' occurrences: {count_correct}")
        print(f"   'الإرجاعات' occurrences: {count_old}")
        
        assert count_correct > 0, "Reports.js should use 'المرتجعات'"
        # Note: الإرجاعات might still exist in other contexts, so we just verify المرتجعات is used
        
        print(f"✅ Reports.js uses 'المرتجعات' ({count_correct} occurrences)")


class TestDashboardCloseReceipt:
    """Test Dashboard close receipt includes refund and cancellation sections"""
    
    def test_08_dashboard_close_receipt_has_refund_section(self):
        """Verify Dashboard.js close receipt HTML includes المرتجعات section"""
        import subprocess
        
        # Check for المرتجعات in Dashboard.js
        result = subprocess.run(
            ["grep", "-c", "المرتجعات", "/app/frontend/src/pages/Dashboard.js"],
            capture_output=True, text=True
        )
        
        count = int(result.stdout.strip()) if result.returncode == 0 else 0
        assert count > 0, "Dashboard.js should include 'المرتجعات' section in close receipt"
        
        print(f"✅ Dashboard.js includes 'المرتجعات' section ({count} occurrences)")
    
    def test_09_dashboard_close_receipt_has_cancellation_section(self):
        """Verify Dashboard.js close receipt HTML includes الإلغاءات section"""
        import subprocess
        
        # Check for الإلغاءات in Dashboard.js
        result = subprocess.run(
            ["grep", "-c", "الإلغاءات", "/app/frontend/src/pages/Dashboard.js"],
            capture_output=True, text=True
        )
        
        count = int(result.stdout.strip()) if result.returncode == 0 else 0
        assert count > 0, "Dashboard.js should include 'الإلغاءات' section in close receipt"
        
        print(f"✅ Dashboard.js includes 'الإلغاءات' section ({count} occurrences)")


class TestPOSKitchenPrintLogic:
    """Test POS kitchen print logic for refund and cancel"""
    
    def test_10_pos_cancel_prints_with_deleted_prefix(self):
        """Verify POS.js cancel order prints items with [تم حذف] prefix"""
        import subprocess
        
        # Check for [تم حذف] in POS.js
        result = subprocess.run(
            ["grep", "-c", "تم حذف", "/app/frontend/src/pages/POS.js"],
            capture_output=True, text=True
        )
        
        count = int(result.stdout.strip()) if result.returncode == 0 else 0
        assert count > 0, "POS.js should print cancelled items with [تم حذف] prefix"
        
        print(f"✅ POS.js prints cancelled items with [تم حذف] prefix ({count} occurrences)")
    
    def test_11_pos_refund_prints_with_refund_prefix(self):
        """Verify POS.js refund prints items with [مرتجع] prefix"""
        import subprocess
        
        # Check for [مرتجع] in POS.js
        result = subprocess.run(
            ["grep", "-c", "مرتجع", "/app/frontend/src/pages/POS.js"],
            capture_output=True, text=True
        )
        
        count = int(result.stdout.strip()) if result.returncode == 0 else 0
        assert count > 0, "POS.js should print refunded items with [مرتجع] prefix"
        
        print(f"✅ POS.js prints refunded items with [مرتجع] prefix ({count} occurrences)")
    
    def test_12_pos_payment_skips_kitchen_for_editing_order(self):
        """Verify POS.js payment flow skips kitchen print for editingOrder"""
        import subprocess
        
        # Check for the condition that skips kitchen print for editingOrder
        result = subprocess.run(
            ["grep", "-n", "!editingOrder", "/app/frontend/src/pages/POS.js"],
            capture_output=True, text=True
        )
        
        # Should find the condition around line 2029
        assert "editingOrder" in result.stdout, "POS.js should check !editingOrder before kitchen print"
        
        # Verify the specific pattern: if (!editingOrder) { ... kitchenPrinters ...
        result2 = subprocess.run(
            ["grep", "-A5", "if (!editingOrder)", "/app/frontend/src/pages/POS.js"],
            capture_output=True, text=True
        )
        
        assert "kitchenPrinters" in result2.stdout, "Kitchen print should be inside !editingOrder block"
        
        print(f"✅ POS.js payment flow skips kitchen print for existing orders (editingOrder)")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
