"""
Test Cash Register Features - Iteration 158
Tests for:
1. Cash register summary API (GET /api/cash-register/summary)
2. Cash register close API (POST /api/cash-register/close)
3. Login with admin credentials
4. Dashboard loads after login
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials from test_credentials.md
ADMIN_EMAIL = "hanialdujaili@gmail.com"
ADMIN_PASSWORD = "Hani@2024"
SUPER_ADMIN_EMAIL = "owner@maestroegp.com"
SUPER_ADMIN_PASSWORD = "owner123"


class TestCashRegisterFeatures:
    """Cash Register API Tests"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test session"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        self.token = None
        self.user = None
    
    def test_01_health_check(self):
        """Test API health endpoint"""
        response = self.session.get(f"{BASE_URL}/api/health")
        assert response.status_code == 200, f"Health check failed: {response.text}"
        data = response.json()
        assert data.get("status") == "ok"
        print("✅ Health check passed")
    
    def test_02_admin_login(self):
        """Test admin login with provided credentials"""
        response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        
        # If admin doesn't exist, try super admin
        if response.status_code != 200:
            print(f"Admin login failed ({response.status_code}), trying super admin...")
            response = self.session.post(f"{BASE_URL}/api/auth/login", json={
                "email": SUPER_ADMIN_EMAIL,
                "password": SUPER_ADMIN_PASSWORD
            })
        
        assert response.status_code == 200, f"Login failed: {response.text}"
        data = response.json()
        assert "token" in data, "No token in response"
        assert "user" in data, "No user in response"
        
        self.token = data["token"]
        self.user = data["user"]
        self.session.headers.update({"Authorization": f"Bearer {self.token}"})
        
        print(f"✅ Login successful as: {self.user.get('email')} (role: {self.user.get('role')})")
        return self.token
    
    def test_03_get_cash_register_summary(self):
        """Test GET /api/cash-register/summary endpoint"""
        # First login
        self.test_02_admin_login()
        
        response = self.session.get(f"{BASE_URL}/api/cash-register/summary")
        
        # 200 = success, 404 = no open shift (acceptable)
        assert response.status_code in [200, 404], f"Summary failed: {response.status_code} - {response.text}"
        
        if response.status_code == 200:
            data = response.json()
            # Verify expected fields exist
            expected_fields = [
                "shift_id", "branch_id", "cashier_id", "total_sales",
                "cash_sales", "card_sales", "expected_cash", "total_expenses"
            ]
            for field in expected_fields:
                assert field in data, f"Missing field: {field}"
            
            print(f"✅ Cash register summary retrieved successfully")
            print(f"   - Total sales: {data.get('total_sales', 0)}")
            print(f"   - Cash sales: {data.get('cash_sales', 0)}")
            print(f"   - Expected cash: {data.get('expected_cash', 0)}")
            print(f"   - Total expenses: {data.get('total_expenses', 0)}")
        else:
            print("ℹ️ No open shift found (404) - this is acceptable")
    
    def test_04_open_shift_auto(self):
        """Test auto-opening a shift"""
        # First login
        self.test_02_admin_login()
        
        response = self.session.post(f"{BASE_URL}/api/shifts/auto-open")
        
        assert response.status_code == 200, f"Auto-open shift failed: {response.status_code} - {response.text}"
        data = response.json()
        
        assert "shift" in data, "No shift in response"
        print(f"✅ Shift auto-opened: {data.get('message')}")
        print(f"   - Shift ID: {data['shift'].get('id')}")
        print(f"   - Was existing: {data.get('was_existing')}")
    
    def test_05_get_summary_after_shift_open(self):
        """Test getting summary after ensuring shift is open"""
        # First login and open shift
        self.test_02_admin_login()
        self.session.post(f"{BASE_URL}/api/shifts/auto-open")
        
        response = self.session.get(f"{BASE_URL}/api/cash-register/summary")
        
        assert response.status_code == 200, f"Summary failed after shift open: {response.status_code} - {response.text}"
        data = response.json()
        
        # Verify all required fields for the closing dialog
        required_fields = [
            "shift_id", "branch_id", "branch_name", "cashier_id", "cashier_name",
            "started_at", "opening_cash", "total_sales", "total_cost", "gross_profit",
            "total_orders", "cash_sales", "card_sales", "credit_sales", "non_cash_amount",
            "delivery_app_sales", "driver_sales", "discounts_total", "cancelled_orders",
            "cancelled_amount", "total_expenses", "net_profit", "expected_cash"
        ]
        
        missing_fields = [f for f in required_fields if f not in data]
        assert len(missing_fields) == 0, f"Missing fields: {missing_fields}"
        
        print("✅ Cash register summary has all required fields")
        print(f"   - Branch: {data.get('branch_name')}")
        print(f"   - Cashier: {data.get('cashier_name')}")
        print(f"   - Total sales: {data.get('total_sales')}")
        print(f"   - Expected cash: {data.get('expected_cash')}")
        print(f"   - Total expenses: {data.get('total_expenses')}")
        print(f"   - Refunds: {data.get('total_refunds', 0)} ({data.get('refund_count', 0)} orders)")
    
    def test_06_close_cash_register_no_cash(self):
        """Test closing cash register with no cash (zero denominations)"""
        # First login and open shift
        self.test_02_admin_login()
        self.session.post(f"{BASE_URL}/api/shifts/auto-open")
        
        # Close with zero denominations (no cash mode)
        close_data = {
            "denominations": {
                "250": 0, "500": 0, "1000": 0, "5000": 0,
                "10000": 0, "25000": 0, "50000": 0
            },
            "notes": "Test close - no cash mode"
        }
        
        response = self.session.post(f"{BASE_URL}/api/cash-register/close", json=close_data)
        
        assert response.status_code == 200, f"Close failed: {response.status_code} - {response.text}"
        data = response.json()
        
        # Verify closing data
        assert data.get("status") == "closed", f"Shift not closed: {data.get('status')}"
        assert data.get("closing_cash") == 0, f"Closing cash should be 0: {data.get('closing_cash')}"
        
        print("✅ Cash register closed successfully with no cash mode")
        print(f"   - Closing cash: {data.get('closing_cash')}")
        print(f"   - Expected cash: {data.get('expected_cash')}")
        print(f"   - Cash difference: {data.get('cash_difference')}")
    
    def test_07_close_cash_register_with_denominations(self):
        """Test closing cash register with actual denominations"""
        # First login and open a new shift
        self.test_02_admin_login()
        self.session.post(f"{BASE_URL}/api/shifts/auto-open")
        
        # Close with some denominations
        close_data = {
            "denominations": {
                "250": 2,    # 500
                "500": 3,    # 1500
                "1000": 5,   # 5000
                "5000": 2,   # 10000
                "10000": 1,  # 10000
                "25000": 0,
                "50000": 0
            },
            "notes": "Test close with denominations"
        }
        
        expected_total = 500 + 1500 + 5000 + 10000 + 10000  # 27000
        
        response = self.session.post(f"{BASE_URL}/api/cash-register/close", json=close_data)
        
        assert response.status_code == 200, f"Close failed: {response.status_code} - {response.text}"
        data = response.json()
        
        assert data.get("status") == "closed", f"Shift not closed: {data.get('status')}"
        assert data.get("closing_cash") == expected_total, f"Closing cash mismatch: expected {expected_total}, got {data.get('closing_cash')}"
        
        print("✅ Cash register closed successfully with denominations")
        print(f"   - Closing cash: {data.get('closing_cash')} (expected: {expected_total})")
        print(f"   - Denominations saved: {data.get('denominations')}")
    
    def test_08_verify_receipt_fields(self):
        """Test that closing response has all fields needed for receipt"""
        # First login and open a new shift
        self.test_02_admin_login()
        self.session.post(f"{BASE_URL}/api/shifts/auto-open")
        
        # Close the shift
        close_data = {
            "denominations": {"250": 0, "500": 0, "1000": 0, "5000": 0, "10000": 0, "25000": 0, "50000": 0},
            "notes": ""
        }
        
        response = self.session.post(f"{BASE_URL}/api/cash-register/close", json=close_data)
        assert response.status_code == 200, f"Close failed: {response.status_code}"
        data = response.json()
        
        # Fields needed for receipt printing
        receipt_fields = [
            "branch_name", "cashier_name", "total_sales", "total_orders",
            "cash_sales", "card_sales", "credit_sales", "delivery_app_sales",
            "total_expenses", "discounts_total", "total_refunds", "refund_count",
            "cancelled_orders", "cancelled_amount", "expected_cash", "closing_cash"
        ]
        
        missing = [f for f in receipt_fields if f not in data]
        assert len(missing) == 0, f"Missing receipt fields: {missing}"
        
        print("✅ All receipt fields present in closing response")
        print(f"   - Total sales: {data.get('total_sales')}")
        print(f"   - Total expenses: {data.get('total_expenses')}")
        print(f"   - Refunds: {data.get('total_refunds')} ({data.get('refund_count')} orders)")
        print(f"   - Cancelled: {data.get('cancelled_amount')} ({data.get('cancelled_orders')} orders)")


class TestDashboardAccess:
    """Test Dashboard page access"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test session"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
    
    def test_01_dashboard_stats_api(self):
        """Test dashboard stats API"""
        # Login first
        response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        
        if response.status_code != 200:
            response = self.session.post(f"{BASE_URL}/api/auth/login", json={
                "email": SUPER_ADMIN_EMAIL,
                "password": SUPER_ADMIN_PASSWORD
            })
        
        assert response.status_code == 200, f"Login failed: {response.text}"
        token = response.json()["token"]
        self.session.headers.update({"Authorization": f"Bearer {token}"})
        
        # Get dashboard stats
        response = self.session.get(f"{BASE_URL}/api/dashboard/stats")
        assert response.status_code == 200, f"Dashboard stats failed: {response.status_code} - {response.text}"
        
        data = response.json()
        print("✅ Dashboard stats API working")
        print(f"   - Today sales: {data.get('today', {}).get('total_sales', 0)}")
        print(f"   - Today orders: {data.get('today', {}).get('total_orders', 0)}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
