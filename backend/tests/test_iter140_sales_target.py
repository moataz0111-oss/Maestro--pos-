"""
Test iteration 140: Daily Sales Target System
Tests for:
1. POST /api/sales-target - Admin can set target, cashier gets 403
2. GET /api/sales-target - Returns target progress data
3. Cash register close button behavior
4. Leaderboard functionality
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
        """Test admin login returns token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        assert response.status_code == 200, f"Admin login failed: {response.text}"
        data = response.json()
        assert "access_token" in data or "token" in data, "No token in response"
        print(f"✅ Admin login successful")
        return data.get("access_token") or data.get("token")
    
    def test_cashier_login(self):
        """Test cashier login returns token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": CASHIER_EMAIL,
            "password": CASHIER_PASSWORD
        })
        assert response.status_code == 200, f"Cashier login failed: {response.text}"
        data = response.json()
        assert "access_token" in data or "token" in data, "No token in response"
        print(f"✅ Cashier login successful")
        return data.get("access_token") or data.get("token")


class TestSalesTargetAPI:
    """Sales Target API tests"""
    
    @pytest.fixture
    def admin_token(self):
        """Get admin token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        data = response.json()
        return data.get("access_token") or data.get("token")
    
    @pytest.fixture
    def cashier_token(self):
        """Get cashier token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": CASHIER_EMAIL,
            "password": CASHIER_PASSWORD
        })
        data = response.json()
        return data.get("access_token") or data.get("token")
    
    def test_admin_can_set_sales_target(self, admin_token):
        """Test POST /api/sales-target with admin returns success"""
        response = requests.post(
            f"{BASE_URL}/api/sales-target",
            json={"target_amount": 50000},
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert response.status_code == 200, f"Admin set target failed: {response.text}"
        data = response.json()
        assert "message" in data or "target_amount" in data, f"Unexpected response: {data}"
        print(f"✅ Admin can set sales target: {data}")
    
    def test_cashier_cannot_set_sales_target(self, cashier_token):
        """Test POST /api/sales-target with cashier returns 403"""
        response = requests.post(
            f"{BASE_URL}/api/sales-target",
            json={"target_amount": 50000},
            headers={"Authorization": f"Bearer {cashier_token}"}
        )
        assert response.status_code == 403, f"Expected 403 for cashier, got {response.status_code}: {response.text}"
        print(f"✅ Cashier correctly gets 403 forbidden when trying to set target")
    
    def test_get_sales_target_returns_progress(self, admin_token):
        """Test GET /api/sales-target returns target progress data"""
        response = requests.get(
            f"{BASE_URL}/api/sales-target",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert response.status_code == 200, f"Get sales target failed: {response.text}"
        data = response.json()
        
        # Check required fields
        assert "has_target" in data, "Missing has_target field"
        assert "target_amount" in data, "Missing target_amount field"
        assert "current_sales" in data, "Missing current_sales field"
        assert "progress" in data, "Missing progress field"
        assert "achieved" in data, "Missing achieved field"
        
        print(f"✅ GET /api/sales-target returns correct structure: has_target={data['has_target']}, target={data['target_amount']}, progress={data['progress']}%")
    
    def test_cashier_can_view_sales_target(self, cashier_token):
        """Test cashier can view (GET) sales target"""
        response = requests.get(
            f"{BASE_URL}/api/sales-target",
            headers={"Authorization": f"Bearer {cashier_token}"}
        )
        assert response.status_code == 200, f"Cashier get sales target failed: {response.text}"
        data = response.json()
        assert "has_target" in data, "Missing has_target field"
        print(f"✅ Cashier can view sales target: has_target={data['has_target']}")


class TestCashRegisterSummary:
    """Cash Register Summary tests"""
    
    @pytest.fixture
    def admin_token(self):
        """Get admin token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        data = response.json()
        return data.get("access_token") or data.get("token")
    
    def test_cash_register_summary_structure(self, admin_token):
        """Test GET /api/cash-register/summary returns correct structure"""
        response = requests.get(
            f"{BASE_URL}/api/cash-register/summary",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        # May return 404 if no shift is open, which is acceptable
        if response.status_code == 404:
            print(f"✅ No shift open - expected behavior")
            return
        
        assert response.status_code == 200, f"Cash register summary failed: {response.text}"
        data = response.json()
        
        # Check for key fields
        expected_fields = ["total_sales", "cash_sales", "total_expenses", "expected_cash"]
        for field in expected_fields:
            assert field in data, f"Missing field: {field}"
        
        print(f"✅ Cash register summary structure correct: expected_cash={data.get('expected_cash')}")


class TestSalesLeaderboard:
    """Sales Leaderboard tests"""
    
    @pytest.fixture
    def admin_token(self):
        """Get admin token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        data = response.json()
        return data.get("access_token") or data.get("token")
    
    def test_leaderboard_today(self, admin_token):
        """Test GET /api/sales-leaderboard with period=today"""
        response = requests.get(
            f"{BASE_URL}/api/sales-leaderboard",
            params={"period": "today"},
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert response.status_code == 200, f"Leaderboard failed: {response.text}"
        data = response.json()
        
        assert "period" in data, "Missing period field"
        assert "leaderboard" in data, "Missing leaderboard field"
        assert isinstance(data["leaderboard"], list), "leaderboard should be a list"
        
        print(f"✅ Leaderboard today: {len(data['leaderboard'])} cashiers")
    
    def test_leaderboard_week(self, admin_token):
        """Test GET /api/sales-leaderboard with period=week"""
        response = requests.get(
            f"{BASE_URL}/api/sales-leaderboard",
            params={"period": "week"},
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert response.status_code == 200, f"Leaderboard week failed: {response.text}"
        data = response.json()
        assert "leaderboard" in data
        print(f"✅ Leaderboard week: {len(data['leaderboard'])} cashiers")


class TestTargetCelebration:
    """Test target celebration trigger logic"""
    
    @pytest.fixture
    def admin_token(self):
        """Get admin token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        data = response.json()
        return data.get("access_token") or data.get("token")
    
    def test_achieved_flag_logic(self, admin_token):
        """Test that achieved flag is correctly calculated"""
        # First set a low target
        requests.post(
            f"{BASE_URL}/api/sales-target",
            json={"target_amount": 1},  # Very low target
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        
        # Get target status
        response = requests.get(
            f"{BASE_URL}/api/sales-target",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        data = response.json()
        
        # If there are any sales today, achieved should be true
        if data.get("current_sales", 0) >= 1:
            assert data.get("achieved") == True, "achieved should be True when current_sales >= target"
            print(f"✅ Achieved flag correctly set to True when target met")
        else:
            print(f"✅ No sales today, achieved={data.get('achieved')}")
        
        # Reset to original target
        requests.post(
            f"{BASE_URL}/api/sales-target",
            json={"target_amount": 50000},
            headers={"Authorization": f"Bearer {admin_token}"}
        )


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
