"""
Test POS Refund Flow - Iteration 154
Tests the complete refund flow:
1. Create credit order → refund → credit_sales drops to 0 in summary
2. After refund, total_refunds shows the refunded amount
3. Cash register summary includes total_refunds and refund_count fields
4. Refunded orders excluded from cash_sales, card_sales, credit_sales
5. GET /api/cash-register/summary response has total_refunds field
6. Credit report endpoint excludes refunded orders
7. POS payment for existing order skips kitchen print (code structure check)
8. Frontend Reports page uses 'المرتجعات' text
"""
import pytest
import requests
import os
import uuid
from datetime import datetime

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')
BRANCH_ID = "72a06c41-5454-4383-99a5-ac13adb96336"
PRODUCT_ID = "058301c2-9c08-4db0-ad7c-263335f03e32"
PRODUCT_PRICE = 5000


class TestRefundFlowComplete:
    """Test complete refund flow: create credit order → refund → verify exclusion from sales"""
    
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
        
        yield
    
    def test_01_create_credit_order_refund_verify_summary(self):
        """
        Test: Create credit order → refund → credit_sales should drop to 0 in summary
        This is the main test case from the problem statement
        """
        # Auto-open shift first
        self.session.post(f"{BASE_URL}/api/shifts/auto-open")
        
        # Get initial summary
        initial_summary = self.session.get(f"{BASE_URL}/api/cash-register/summary", params={
            "branch_id": BRANCH_ID
        })
        assert initial_summary.status_code == 200, f"Get initial summary failed: {initial_summary.text}"
        initial_data = initial_summary.json()
        initial_credit = initial_data.get("credit_sales", 0)
        initial_refunds = initial_data.get("total_refunds", 0)
        
        print(f"Initial credit_sales: {initial_credit}")
        print(f"Initial total_refunds: {initial_refunds}")
        
        # Create a credit order with known amount
        test_amount = PRODUCT_PRICE
        order_data = {
            "order_type": "takeaway",
            "items": [{
                "product_id": PRODUCT_ID,
                "product_name": "Test Product",
                "price": test_amount,
                "quantity": 1,
                "cost": 0
            }],
            "branch_id": BRANCH_ID,
            "payment_method": "credit",  # Credit payment
            "discount": 0,
            "customer_name": "TEST_CREDIT_REFUND_154"
        }
        
        create_res = self.session.post(f"{BASE_URL}/api/orders", json=order_data)
        assert create_res.status_code in [200, 201], f"Create order failed: {create_res.text}"
        order = create_res.json()
        order_id = order.get("id")
        order_total = order.get("total", test_amount)
        
        print(f"✅ Created credit order #{order.get('order_number')} with total {order_total}")
        
        # Verify credit_sales increased
        after_create_summary = self.session.get(f"{BASE_URL}/api/cash-register/summary", params={
            "branch_id": BRANCH_ID
        })
        after_create_data = after_create_summary.json()
        after_create_credit = after_create_data.get("credit_sales", 0)
        
        print(f"Credit sales after order creation: {after_create_credit}")
        
        # Now refund the order
        refund_res = self.session.post(f"{BASE_URL}/api/refunds", json={
            "order_id": order_id,
            "reason": "Test refund for credit sales exclusion",
            "refund_type": "full"
        })
        
        assert refund_res.status_code == 200, f"Refund failed: {refund_res.text}"
        print(f"✅ Refunded order #{order.get('order_number')}")
        
        # Verify order status is 'refunded'
        order_check = self.session.get(f"{BASE_URL}/api/orders/{order_id}")
        if order_check.status_code == 200:
            order_status = order_check.json().get("status")
            assert order_status == "refunded", f"Order status should be 'refunded', got '{order_status}'"
            print(f"✅ Order status is 'refunded'")
        
        # Get summary after refund
        after_refund_summary = self.session.get(f"{BASE_URL}/api/cash-register/summary", params={
            "branch_id": BRANCH_ID
        })
        assert after_refund_summary.status_code == 200
        after_refund_data = after_refund_summary.json()
        
        after_refund_credit = after_refund_data.get("credit_sales", 0)
        after_refund_total_refunds = after_refund_data.get("total_refunds", 0)
        
        print(f"Credit sales after refund: {after_refund_credit}")
        print(f"Total refunds after refund: {after_refund_total_refunds}")
        
        # The refunded order should NOT be in credit_sales
        # credit_sales should be back to initial (or less than after_create)
        assert after_refund_credit <= after_create_credit - order_total + 1, \
            f"Credit sales ({after_refund_credit}) should exclude refunded order ({order_total})"
        
        # total_refunds should include the refunded amount
        assert after_refund_total_refunds >= initial_refunds + order_total - 1, \
            f"Total refunds ({after_refund_total_refunds}) should include refunded order ({order_total})"
        
        print(f"✅ Refunded order excluded from credit_sales, included in total_refunds")
    
    def test_02_cash_register_summary_has_refund_fields(self):
        """Test GET /api/cash-register/summary response has total_refunds field"""
        # Auto-open shift
        self.session.post(f"{BASE_URL}/api/shifts/auto-open")
        
        summary_res = self.session.get(f"{BASE_URL}/api/cash-register/summary", params={
            "branch_id": BRANCH_ID
        })
        
        assert summary_res.status_code == 200, f"Get summary failed: {summary_res.text}"
        data = summary_res.json()
        
        # Verify required fields exist
        assert "total_refunds" in data, "total_refunds field missing from summary"
        assert "refund_count" in data, "refund_count field missing from summary"
        
        # Verify they are numeric
        assert isinstance(data["total_refunds"], (int, float)), "total_refunds should be numeric"
        assert isinstance(data["refund_count"], (int, float)), "refund_count should be numeric"
        
        print(f"✅ Cash register summary includes total_refunds={data['total_refunds']}, refund_count={data['refund_count']}")
    
    def test_03_refunded_orders_excluded_from_all_sales_types(self):
        """Test refunded orders excluded from cash_sales, card_sales, credit_sales"""
        # Auto-open shift
        self.session.post(f"{BASE_URL}/api/shifts/auto-open")
        
        # Create and refund a cash order
        cash_order = {
            "order_type": "takeaway",
            "items": [{"product_id": PRODUCT_ID, "product_name": "Test", "price": 3000, "quantity": 1, "cost": 0}],
            "branch_id": BRANCH_ID,
            "payment_method": "cash",
            "customer_name": "TEST_CASH_REFUND_154"
        }
        
        cash_res = self.session.post(f"{BASE_URL}/api/orders", json=cash_order)
        assert cash_res.status_code in [200, 201]
        cash_order_id = cash_res.json().get("id")
        cash_total = cash_res.json().get("total", 3000)
        
        # Get summary before refund
        before_summary = self.session.get(f"{BASE_URL}/api/cash-register/summary", params={"branch_id": BRANCH_ID})
        before_cash = before_summary.json().get("cash_sales", 0)
        
        # Refund the cash order
        refund_res = self.session.post(f"{BASE_URL}/api/refunds", json={
            "order_id": cash_order_id,
            "reason": "Test cash refund exclusion",
            "refund_type": "full"
        })
        assert refund_res.status_code == 200
        
        # Get summary after refund
        after_summary = self.session.get(f"{BASE_URL}/api/cash-register/summary", params={"branch_id": BRANCH_ID})
        after_cash = after_summary.json().get("cash_sales", 0)
        
        # Cash sales should decrease by the refunded amount
        assert after_cash <= before_cash - cash_total + 1, \
            f"Cash sales ({after_cash}) should exclude refunded order ({cash_total})"
        
        print(f"✅ Refunded cash order excluded from cash_sales")
    
    def test_04_credit_report_excludes_refunded_orders(self):
        """Test credit report endpoint excludes refunded orders from credit order list"""
        today = datetime.now().strftime("%Y-%m-%d")
        
        # Get credit report
        credit_report = self.session.get(f"{BASE_URL}/api/reports/credit", params={
            "start_date": today,
            "end_date": f"{today}T23:59:59",
            "branch_id": BRANCH_ID
        })
        
        assert credit_report.status_code == 200, f"Credit report failed: {credit_report.text}"
        data = credit_report.json()
        
        # Check that no refunded orders are in the list
        orders = data.get("orders", [])
        for order in orders:
            status = order.get("status", "")
            assert status != "refunded", f"Found refunded order in credit report: {order.get('id')}"
        
        print(f"✅ Credit report excludes refunded orders ({len(orders)} orders in report)")
    
    def test_05_cash_register_close_includes_refund_fields(self):
        """Test POST /api/cash-register/close includes total_refunds and refund_count"""
        # Auto-open shift
        self.session.post(f"{BASE_URL}/api/shifts/auto-open")
        
        # Close cash register
        close_res = self.session.post(f"{BASE_URL}/api/cash-register/close", json={
            "denominations": {"1000": 5, "5000": 2},
            "notes": "Test close for refund fields - iter154",
            "branch_id": BRANCH_ID
        })
        
        assert close_res.status_code == 200, f"Close failed: {close_res.text}"
        data = close_res.json()
        
        # Verify refund fields exist
        assert "total_refunds" in data, "total_refunds missing from close response"
        assert "refund_count" in data, "refund_count missing from close response"
        
        print(f"✅ Cash register close includes total_refunds={data['total_refunds']}, refund_count={data['refund_count']}")


class TestCodeStructureVerification:
    """Verify code structure for kitchen print logic and Arabic labels"""
    
    def test_06_pos_payment_skips_kitchen_for_editing_order(self):
        """Verify POS.js payment for existing order has condition to skip kitchen print"""
        import subprocess
        
        # Check for the !editingOrder condition before kitchen print
        result = subprocess.run(
            ["grep", "-A10", "if (!editingOrder)", "/app/frontend/src/pages/POS.js"],
            capture_output=True, text=True
        )
        
        assert "kitchenPrinters" in result.stdout, \
            "Kitchen print should be inside !editingOrder block"
        
        print(f"✅ POS.js payment skips kitchen print for editingOrder (existing orders)")
    
    def test_07_reports_page_uses_arabic_refunds_label(self):
        """Verify Reports.js uses 'المرتجعات' text instead of 'الإرجاعات'"""
        import subprocess
        
        # Count occurrences of المرتجعات
        result = subprocess.run(
            ["grep", "-c", "المرتجعات", "/app/frontend/src/pages/Reports.js"],
            capture_output=True, text=True
        )
        
        count = int(result.stdout.strip()) if result.returncode == 0 else 0
        assert count > 0, "Reports.js should use 'المرتجعات'"
        
        print(f"✅ Reports.js uses 'المرتجعات' ({count} occurrences)")
    
    def test_08_pos_refund_prints_with_refund_prefix(self):
        """Verify POS.js refund prints items with [مرتجع] prefix"""
        import subprocess
        
        result = subprocess.run(
            ["grep", "-c", "\\[مرتجع\\]", "/app/frontend/src/pages/POS.js"],
            capture_output=True, text=True
        )
        
        count = int(result.stdout.strip()) if result.returncode == 0 else 0
        assert count > 0, "POS.js should print refunded items with [مرتجع] prefix"
        
        print(f"✅ POS.js prints refunded items with [مرتجع] prefix ({count} occurrences)")
    
    def test_09_pos_cancel_prints_with_deleted_prefix(self):
        """Verify POS.js cancel prints items with [تم حذف] prefix"""
        import subprocess
        
        result = subprocess.run(
            ["grep", "-c", "\\[تم حذف\\]", "/app/frontend/src/pages/POS.js"],
            capture_output=True, text=True
        )
        
        count = int(result.stdout.strip()) if result.returncode == 0 else 0
        assert count > 0, "POS.js should print cancelled items with [تم حذف] prefix"
        
        print(f"✅ POS.js prints cancelled items with [تم حذف] prefix ({count} occurrences)")


class TestShiftsRoutesRefundExclusion:
    """Test shifts_routes.py properly excludes refunded orders"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test session"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        login_res = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "hanialdujaili@gmail.com",
            "password": "Hani@2024"
        })
        assert login_res.status_code == 200
        token = login_res.json().get("token")
        self.session.headers.update({"Authorization": f"Bearer {token}"})
        
        yield
    
    def test_10_summary_uses_nin_filter_for_refunded(self):
        """
        Verify cash-register/summary uses $nin filter to exclude refunded orders
        This is verified by checking that refunded orders don't appear in sales totals
        """
        # Auto-open shift
        self.session.post(f"{BASE_URL}/api/shifts/auto-open")
        
        # Create an order
        order_data = {
            "order_type": "takeaway",
            "items": [{"product_id": PRODUCT_ID, "product_name": "Test", "price": 7000, "quantity": 1, "cost": 0}],
            "branch_id": BRANCH_ID,
            "payment_method": "cash",
            "customer_name": "TEST_NIN_FILTER_154"
        }
        
        create_res = self.session.post(f"{BASE_URL}/api/orders", json=order_data)
        assert create_res.status_code in [200, 201]
        order_id = create_res.json().get("id")
        order_total = create_res.json().get("total", 7000)
        
        # Get summary with the order
        summary_with = self.session.get(f"{BASE_URL}/api/cash-register/summary", params={"branch_id": BRANCH_ID})
        total_with = summary_with.json().get("total_sales", 0)
        
        # Refund the order
        self.session.post(f"{BASE_URL}/api/refunds", json={
            "order_id": order_id,
            "reason": "Test $nin filter",
            "refund_type": "full"
        })
        
        # Get summary without the order (should be excluded)
        summary_without = self.session.get(f"{BASE_URL}/api/cash-register/summary", params={"branch_id": BRANCH_ID})
        total_without = summary_without.json().get("total_sales", 0)
        
        # Total sales should decrease
        assert total_without < total_with, \
            f"Total sales should decrease after refund: {total_without} < {total_with}"
        
        print(f"✅ Summary correctly excludes refunded orders using $nin filter")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
