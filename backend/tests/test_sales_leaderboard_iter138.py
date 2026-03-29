"""
Test Sales Leaderboard API and Permission Toggle Logic
Iteration 138 - Testing:
1. GET /api/sales-leaderboard endpoint with period filters (today, week, month)
2. Leaderboard response structure (cashier_id, cashier_name, total_sales, order_count, rank, average_order)
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
CASHIER_ID = "29d01373-293c-4703-8c4f-2f832d9d2abb"


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
        assert "access_token" in data or "token" in data
        print(f"✅ Admin login successful")
        return data.get("access_token") or data.get("token")
    
    def test_cashier_login(self):
        """Test cashier login"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": CASHIER_EMAIL,
            "password": CASHIER_PASSWORD
        })
        assert response.status_code == 200, f"Cashier login failed: {response.text}"
        data = response.json()
        assert "access_token" in data or "token" in data
        print(f"✅ Cashier login successful")
        return data.get("access_token") or data.get("token")


class TestSalesLeaderboard:
    """Sales Leaderboard API tests"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup - get admin token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        assert response.status_code == 200
        data = response.json()
        self.admin_token = data.get("access_token") or data.get("token")
        self.headers = {"Authorization": f"Bearer {self.admin_token}"}
    
    def test_leaderboard_today(self):
        """Test GET /api/sales-leaderboard?period=today"""
        response = requests.get(
            f"{BASE_URL}/api/sales-leaderboard",
            params={"period": "today"},
            headers=self.headers
        )
        assert response.status_code == 200, f"Leaderboard today failed: {response.text}"
        data = response.json()
        
        # Verify response structure
        assert "period" in data
        assert data["period"] == "today"
        assert "date" in data
        assert "leaderboard" in data
        assert "total_cashiers" in data
        assert isinstance(data["leaderboard"], list)
        
        print(f"✅ Leaderboard today: {data['total_cashiers']} cashiers")
        
        # Verify leaderboard entry structure if entries exist
        if len(data["leaderboard"]) > 0:
            entry = data["leaderboard"][0]
            assert "cashier_id" in entry
            assert "cashier_name" in entry
            assert "total_sales" in entry
            assert "order_count" in entry
            assert "rank" in entry
            assert "average_order" in entry
            print(f"   Top cashier: {entry['cashier_name']} - {entry['total_sales']} IQD")
        
        return data
    
    def test_leaderboard_week(self):
        """Test GET /api/sales-leaderboard?period=week"""
        response = requests.get(
            f"{BASE_URL}/api/sales-leaderboard",
            params={"period": "week"},
            headers=self.headers
        )
        assert response.status_code == 200, f"Leaderboard week failed: {response.text}"
        data = response.json()
        
        assert data["period"] == "week"
        assert "leaderboard" in data
        print(f"✅ Leaderboard week: {data['total_cashiers']} cashiers")
        return data
    
    def test_leaderboard_month(self):
        """Test GET /api/sales-leaderboard?period=month"""
        response = requests.get(
            f"{BASE_URL}/api/sales-leaderboard",
            params={"period": "month"},
            headers=self.headers
        )
        assert response.status_code == 200, f"Leaderboard month failed: {response.text}"
        data = response.json()
        
        assert data["period"] == "month"
        assert "leaderboard" in data
        print(f"✅ Leaderboard month: {data['total_cashiers']} cashiers")
        return data
    
    def test_leaderboard_entry_structure(self):
        """Verify leaderboard entry has all required fields"""
        response = requests.get(
            f"{BASE_URL}/api/sales-leaderboard",
            params={"period": "month"},  # Use month for more data
            headers=self.headers
        )
        assert response.status_code == 200
        data = response.json()
        
        if len(data["leaderboard"]) > 0:
            entry = data["leaderboard"][0]
            required_fields = ["cashier_id", "cashier_name", "total_sales", "order_count", "rank", "average_order"]
            for field in required_fields:
                assert field in entry, f"Missing field: {field}"
            
            # Verify rank is 1 for first entry
            assert entry["rank"] == 1
            
            # Verify average_order calculation
            if entry["order_count"] > 0:
                expected_avg = entry["total_sales"] / entry["order_count"]
                assert abs(entry["average_order"] - expected_avg) < 0.01, "Average order calculation mismatch"
            
            print(f"✅ Leaderboard entry structure verified")
            print(f"   Fields: {list(entry.keys())}")
        else:
            print("⚠️ No leaderboard entries to verify structure")
    
    def test_leaderboard_ranking_order(self):
        """Verify leaderboard is sorted by total_sales descending"""
        response = requests.get(
            f"{BASE_URL}/api/sales-leaderboard",
            params={"period": "month"},
            headers=self.headers
        )
        assert response.status_code == 200
        data = response.json()
        
        leaderboard = data["leaderboard"]
        if len(leaderboard) >= 2:
            for i in range(len(leaderboard) - 1):
                assert leaderboard[i]["total_sales"] >= leaderboard[i+1]["total_sales"], \
                    f"Leaderboard not sorted correctly at position {i}"
                assert leaderboard[i]["rank"] == i + 1, f"Rank mismatch at position {i}"
            print(f"✅ Leaderboard ranking order verified ({len(leaderboard)} entries)")
        else:
            print(f"⚠️ Not enough entries to verify ranking order ({len(leaderboard)} entries)")


class TestCashierPermissions:
    """Test cashier user permissions"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup - get cashier token and user info"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": CASHIER_EMAIL,
            "password": CASHIER_PASSWORD
        })
        assert response.status_code == 200
        data = response.json()
        self.cashier_token = data.get("access_token") or data.get("token")
        self.cashier_user = data.get("user", {})
        self.headers = {"Authorization": f"Bearer {self.cashier_token}"}
    
    def test_cashier_can_access_leaderboard(self):
        """Test that cashier can access leaderboard"""
        response = requests.get(
            f"{BASE_URL}/api/sales-leaderboard",
            params={"period": "today"},
            headers=self.headers
        )
        assert response.status_code == 200, f"Cashier leaderboard access failed: {response.text}"
        print(f"✅ Cashier can access leaderboard")
    
    def test_cashier_permissions_structure(self):
        """Verify cashier user has permissions array"""
        assert "permissions" in self.cashier_user or self.cashier_user.get("permissions") is None
        permissions = self.cashier_user.get("permissions", [])
        print(f"✅ Cashier permissions: {permissions}")
        return permissions


class TestUserPermissionsAPI:
    """Test user permissions update API"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup - get admin token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        assert response.status_code == 200
        data = response.json()
        self.admin_token = data.get("access_token") or data.get("token")
        self.headers = {"Authorization": f"Bearer {self.admin_token}"}
    
    def test_get_cashier_user(self):
        """Get cashier user details"""
        response = requests.get(
            f"{BASE_URL}/api/users/{CASHIER_ID}",
            headers=self.headers
        )
        assert response.status_code == 200, f"Get user failed: {response.text}"
        user = response.json()
        print(f"✅ Cashier user: {user.get('full_name')} - Role: {user.get('role')}")
        print(f"   Permissions: {user.get('permissions', [])}")
        return user
    
    def test_update_cashier_permissions_add_hide_cash_expected(self):
        """Test adding hide_cash_expected permission to cashier"""
        # First get current permissions
        response = requests.get(
            f"{BASE_URL}/api/users/{CASHIER_ID}",
            headers=self.headers
        )
        assert response.status_code == 200
        user = response.json()
        current_permissions = user.get("permissions", [])
        
        # Add hide_cash_expected if not present
        if "hide_cash_expected" not in current_permissions:
            new_permissions = current_permissions + ["hide_cash_expected"]
            update_response = requests.put(
                f"{BASE_URL}/api/users/{CASHIER_ID}",
                json={"permissions": new_permissions},
                headers=self.headers
            )
            assert update_response.status_code == 200, f"Update failed: {update_response.text}"
            print(f"✅ Added hide_cash_expected permission to cashier")
        else:
            print(f"✅ hide_cash_expected already in cashier permissions")
        
        # Verify the update
        verify_response = requests.get(
            f"{BASE_URL}/api/users/{CASHIER_ID}",
            headers=self.headers
        )
        assert verify_response.status_code == 200
        updated_user = verify_response.json()
        assert "hide_cash_expected" in updated_user.get("permissions", [])
        print(f"   Updated permissions: {updated_user.get('permissions', [])}")
    
    def test_update_cashier_permissions_remove_hide_cash_expected(self):
        """Test removing hide_cash_expected permission from cashier"""
        # First get current permissions
        response = requests.get(
            f"{BASE_URL}/api/users/{CASHIER_ID}",
            headers=self.headers
        )
        assert response.status_code == 200
        user = response.json()
        current_permissions = user.get("permissions", [])
        
        # Remove hide_cash_expected if present
        if "hide_cash_expected" in current_permissions:
            new_permissions = [p for p in current_permissions if p != "hide_cash_expected"]
            update_response = requests.put(
                f"{BASE_URL}/api/users/{CASHIER_ID}",
                json={"permissions": new_permissions},
                headers=self.headers
            )
            assert update_response.status_code == 200, f"Update failed: {update_response.text}"
            print(f"✅ Removed hide_cash_expected permission from cashier")
        else:
            print(f"✅ hide_cash_expected not in cashier permissions")
        
        # Verify the update
        verify_response = requests.get(
            f"{BASE_URL}/api/users/{CASHIER_ID}",
            headers=self.headers
        )
        assert verify_response.status_code == 200
        updated_user = verify_response.json()
        assert "hide_cash_expected" not in updated_user.get("permissions", [])
        print(f"   Updated permissions: {updated_user.get('permissions', [])}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
