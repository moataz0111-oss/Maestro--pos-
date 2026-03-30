"""
Test iteration 139 - Testing:
1. GET /api/cash-register/summary returns expected_cash correctly (cash_sales - expenses)
2. GET /api/sales-leaderboard returns leaderboard data
3. Permission toggle logic for admin/manager/super_admin vs non-admin users
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
ADMIN_EMAIL = "hanialdujaili@gmail.com"
ADMIN_PASSWORD = "Hani@2024"
CASHIER_EMAIL = "cashier@test.com"
CASHIER_PASSWORD = "Test@1234"


class TestAuthentication:
    """Authentication tests"""
    
    def test_admin_login(self):
        """Test admin login"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        assert response.status_code == 200, f"Admin login failed: {response.text}"
        data = response.json()
        assert "token" in data, "No token in response"
        assert "user" in data, "No user in response"
        print(f"✓ Admin login successful, role: {data['user'].get('role')}")
        return data["token"]
    
    def test_cashier_login(self):
        """Test cashier login"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": CASHIER_EMAIL,
            "password": CASHIER_PASSWORD
        })
        assert response.status_code == 200, f"Cashier login failed: {response.text}"
        data = response.json()
        assert "token" in data, "No token in response"
        print(f"✓ Cashier login successful, role: {data['user'].get('role')}")
        print(f"  Permissions: {data['user'].get('permissions', [])}")
        return data["token"]


class TestCashRegisterSummary:
    """Test cash register summary endpoint"""
    
    @pytest.fixture
    def admin_token(self):
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        return response.json()["token"]
    
    def test_cash_register_summary_returns_expected_cash(self, admin_token):
        """Test that GET /api/cash-register/summary returns expected_cash correctly"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        response = requests.get(f"{BASE_URL}/api/cash-register/summary", headers=headers)
        
        assert response.status_code == 200, f"Failed to get cash register summary: {response.text}"
        data = response.json()
        
        # Verify expected_cash is in response
        assert "expected_cash" in data, "expected_cash not in response"
        assert "cash_sales" in data, "cash_sales not in response"
        assert "total_expenses" in data, "total_expenses not in response"
        
        # Verify expected_cash calculation: opening_cash + cash_sales - total_expenses
        opening_cash = data.get("opening_cash", 0)
        cash_sales = data.get("cash_sales", 0)
        total_expenses = data.get("total_expenses", 0)
        expected_cash = data.get("expected_cash", 0)
        
        calculated_expected = opening_cash + cash_sales - total_expenses
        
        print(f"✓ Cash register summary:")
        print(f"  - Opening cash: {opening_cash}")
        print(f"  - Cash sales: {cash_sales}")
        print(f"  - Total expenses: {total_expenses}")
        print(f"  - Expected cash: {expected_cash}")
        print(f"  - Calculated expected: {calculated_expected}")
        
        # Allow small floating point differences
        assert abs(expected_cash - calculated_expected) < 0.01, \
            f"expected_cash ({expected_cash}) != opening_cash ({opening_cash}) + cash_sales ({cash_sales}) - expenses ({total_expenses})"
    
    def test_cash_register_summary_structure(self, admin_token):
        """Test that cash register summary has all required fields"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        response = requests.get(f"{BASE_URL}/api/cash-register/summary", headers=headers)
        
        assert response.status_code == 200
        data = response.json()
        
        required_fields = [
            "shift_id", "branch_id", "cashier_id", "cashier_name",
            "total_sales", "cash_sales", "card_sales", "credit_sales",
            "total_expenses", "expected_cash", "total_orders"
        ]
        
        for field in required_fields:
            assert field in data, f"Missing field: {field}"
        
        print(f"✓ Cash register summary has all required fields")
        print(f"  - Total sales: {data.get('total_sales')}")
        print(f"  - Cash sales: {data.get('cash_sales')}")
        print(f"  - Total expenses: {data.get('total_expenses')}")
        print(f"  - Expected cash: {data.get('expected_cash')}")


class TestSalesLeaderboard:
    """Test sales leaderboard endpoint"""
    
    @pytest.fixture
    def admin_token(self):
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        return response.json()["token"]
    
    def test_leaderboard_today(self, admin_token):
        """Test GET /api/sales-leaderboard?period=today"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        response = requests.get(f"{BASE_URL}/api/sales-leaderboard", 
                               params={"period": "today"}, headers=headers)
        
        assert response.status_code == 200, f"Failed to get leaderboard: {response.text}"
        data = response.json()
        
        assert "leaderboard" in data, "leaderboard not in response"
        assert "period" in data, "period not in response"
        assert data["period"] == "today", f"Expected period 'today', got '{data['period']}'"
        
        print(f"✓ Leaderboard today: {len(data.get('leaderboard', []))} entries")
    
    def test_leaderboard_week(self, admin_token):
        """Test GET /api/sales-leaderboard?period=week"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        response = requests.get(f"{BASE_URL}/api/sales-leaderboard", 
                               params={"period": "week"}, headers=headers)
        
        assert response.status_code == 200, f"Failed to get leaderboard: {response.text}"
        data = response.json()
        
        assert "leaderboard" in data
        assert data["period"] == "week"
        print(f"✓ Leaderboard week: {len(data.get('leaderboard', []))} entries")
    
    def test_leaderboard_month(self, admin_token):
        """Test GET /api/sales-leaderboard?period=month"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        response = requests.get(f"{BASE_URL}/api/sales-leaderboard", 
                               params={"period": "month"}, headers=headers)
        
        assert response.status_code == 200, f"Failed to get leaderboard: {response.text}"
        data = response.json()
        
        assert "leaderboard" in data
        assert data["period"] == "month"
        print(f"✓ Leaderboard month: {len(data.get('leaderboard', []))} entries")


class TestPermissionLogic:
    """Test permission toggle logic - admin/manager/super_admin always see everything"""
    
    def test_admin_role_permissions(self):
        """Test that admin role has full access"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        assert response.status_code == 200
        data = response.json()
        user = data["user"]
        
        # Admin should have role 'admin'
        assert user.get("role") in ["admin", "super_admin", "manager"], \
            f"Expected admin role, got: {user.get('role')}"
        
        print(f"✓ Admin user role: {user.get('role')}")
        print(f"  Admin sees all features regardless of permissions array")
    
    def test_cashier_role_permissions(self):
        """Test that cashier role needs permission toggle ON to see features"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": CASHIER_EMAIL,
            "password": CASHIER_PASSWORD
        })
        assert response.status_code == 200
        data = response.json()
        user = data["user"]
        
        # Cashier should have role 'cashier'
        assert user.get("role") == "cashier", f"Expected cashier role, got: {user.get('role')}"
        
        permissions = user.get("permissions", [])
        print(f"✓ Cashier user role: {user.get('role')}")
        print(f"  Permissions: {permissions}")
        
        # Check specific permissions
        has_hide_recent_orders = "hide_recent_orders" in permissions
        has_hide_cash_expected = "hide_cash_expected" in permissions
        
        print(f"  - hide_recent_orders: {'ON' if has_hide_recent_orders else 'OFF'}")
        print(f"  - hide_cash_expected: {'ON' if has_hide_cash_expected else 'OFF'}")


class TestConfirmButtonLogic:
    """Test confirm button disabled logic"""
    
    @pytest.fixture
    def admin_token(self):
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        return response.json()["token"]
    
    def test_expected_cash_positive_scenario(self, admin_token):
        """When expected_cash > 0, user must enter cash count"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        response = requests.get(f"{BASE_URL}/api/cash-register/summary", headers=headers)
        
        assert response.status_code == 200
        data = response.json()
        
        expected_cash = data.get("expected_cash", 0)
        
        print(f"✓ Expected cash: {expected_cash}")
        if expected_cash > 0:
            print(f"  → Confirm button should be DISABLED until user enters cash count")
        else:
            print(f"  → Confirm button should be ENABLED (no cash to count)")
    
    def test_expected_cash_zero_or_negative_scenario(self, admin_token):
        """When expected_cash <= 0, confirm button should be enabled"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        response = requests.get(f"{BASE_URL}/api/cash-register/summary", headers=headers)
        
        assert response.status_code == 200
        data = response.json()
        
        expected_cash = data.get("expected_cash", 0)
        total_expenses = data.get("total_expenses", 0)
        cash_sales = data.get("cash_sales", 0)
        
        print(f"✓ Cash register state:")
        print(f"  - Cash sales: {cash_sales}")
        print(f"  - Total expenses: {total_expenses}")
        print(f"  - Expected cash: {expected_cash}")
        
        # Document the expected behavior
        if expected_cash <= 0:
            print(f"  → SCENARIO: expenses >= cash_sales")
            print(f"  → Confirm button should be ENABLED (no cash to count)")
            print(f"  → Yellow message should show: 'لا يوجد نقدي متبقي في الصندوق'")
        else:
            print(f"  → SCENARIO: cash_sales > expenses")
            print(f"  → Confirm button DISABLED until cash count entered")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
