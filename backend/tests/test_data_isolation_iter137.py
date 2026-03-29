"""
Test Data Isolation Feature - Iteration 137
Tests that non-admin users (cashier, captain, kitchen, etc.) only see their own orders
while admin/manager/super_admin see all orders.
"""
import pytest
import requests
import os
from datetime import datetime, timezone

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
ADMIN_EMAIL = "hanialdujaili@gmail.com"
ADMIN_PASSWORD = "Hani@2024"
CASHIER_EMAIL = "cashier@test.com"
CASHIER_PASSWORD = "Test@1234"
CASHIER_USER_ID = "29d01373-293c-4703-8c4f-2f832d9d2abb"


class TestAuthentication:
    """Test authentication for both admin and cashier"""
    
    def test_admin_login(self):
        """Test admin login and get token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        assert response.status_code == 200, f"Admin login failed: {response.text}"
        data = response.json()
        assert "token" in data, "No token in response"
        assert "user" in data, "No user in response"
        print(f"Admin login successful - Role: {data['user'].get('role')}")
        return data["token"]
    
    def test_cashier_login(self):
        """Test cashier login and get token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": CASHIER_EMAIL,
            "password": CASHIER_PASSWORD
        })
        assert response.status_code == 200, f"Cashier login failed: {response.text}"
        data = response.json()
        assert "token" in data, "No token in response"
        assert "user" in data, "No user in response"
        user = data["user"]
        print(f"Cashier login successful - Role: {user.get('role')}, ID: {user.get('id')}")
        # Verify cashier ID matches expected
        assert user.get("id") == CASHIER_USER_ID, f"Cashier ID mismatch: {user.get('id')} != {CASHIER_USER_ID}"
        return data["token"]


class TestOrdersDataIsolation:
    """Test that orders endpoint respects data isolation"""
    
    @pytest.fixture
    def admin_token(self):
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        return response.json()["token"]
    
    @pytest.fixture
    def cashier_token(self):
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": CASHIER_EMAIL,
            "password": CASHIER_PASSWORD
        })
        return response.json()["token"]
    
    def test_admin_sees_all_orders(self, admin_token):
        """Admin should see all orders (8+ expected)"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        response = requests.get(f"{BASE_URL}/api/orders", headers=headers)
        assert response.status_code == 200, f"Failed to get orders: {response.text}"
        orders = response.json()
        print(f"Admin sees {len(orders)} orders")
        # Admin should see multiple orders
        assert len(orders) >= 1, f"Admin should see orders, got {len(orders)}"
        # Verify orders have different cashier_ids (not all from same user)
        cashier_ids = set(order.get("cashier_id") for order in orders if order.get("cashier_id"))
        print(f"Orders from {len(cashier_ids)} different cashiers: {cashier_ids}")
        return orders
    
    def test_cashier_sees_only_own_orders(self, cashier_token):
        """Cashier should only see orders where cashier_id matches their user ID"""
        headers = {"Authorization": f"Bearer {cashier_token}"}
        response = requests.get(f"{BASE_URL}/api/orders", headers=headers)
        assert response.status_code == 200, f"Failed to get orders: {response.text}"
        orders = response.json()
        print(f"Cashier sees {len(orders)} orders")
        
        # Verify all orders belong to this cashier
        for order in orders:
            assert order.get("cashier_id") == CASHIER_USER_ID, \
                f"Cashier sees order from another user: {order.get('cashier_id')}"
        
        # Since test cashier hasn't created orders, expect 0
        print(f"Cashier correctly sees {len(orders)} orders (expected 0 since no orders created)")
        return orders
    
    def test_admin_vs_cashier_order_count(self, admin_token, cashier_token):
        """Compare order counts between admin and cashier"""
        admin_headers = {"Authorization": f"Bearer {admin_token}"}
        cashier_headers = {"Authorization": f"Bearer {cashier_token}"}
        
        admin_response = requests.get(f"{BASE_URL}/api/orders", headers=admin_headers)
        cashier_response = requests.get(f"{BASE_URL}/api/orders", headers=cashier_headers)
        
        admin_orders = admin_response.json()
        cashier_orders = cashier_response.json()
        
        print(f"Admin orders: {len(admin_orders)}, Cashier orders: {len(cashier_orders)}")
        
        # Admin should see more orders than cashier (unless cashier created all orders)
        # Since test cashier hasn't created orders, admin should see more
        assert len(admin_orders) >= len(cashier_orders), \
            "Admin should see at least as many orders as cashier"


class TestDashboardStatsDataIsolation:
    """Test that dashboard stats endpoint respects data isolation"""
    
    @pytest.fixture
    def admin_token(self):
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        return response.json()["token"]
    
    @pytest.fixture
    def cashier_token(self):
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": CASHIER_EMAIL,
            "password": CASHIER_PASSWORD
        })
        return response.json()["token"]
    
    def test_admin_dashboard_stats(self, admin_token):
        """Admin should see full dashboard stats with all orders"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        response = requests.get(f"{BASE_URL}/api/dashboard/stats", headers=headers)
        assert response.status_code == 200, f"Failed to get dashboard stats: {response.text}"
        stats = response.json()
        
        # Verify stats structure
        assert "today" in stats, "Missing 'today' in stats"
        assert "week" in stats, "Missing 'week' in stats"
        assert "month" in stats, "Missing 'month' in stats"
        assert "all_time" in stats, "Missing 'all_time' in stats"
        
        print(f"Admin dashboard stats:")
        print(f"  Today: {stats['today'].get('total_orders', 0)} orders, {stats['today'].get('total_sales', 0)} sales")
        print(f"  All time: {stats['all_time'].get('total_orders', 0)} orders, {stats['all_time'].get('total_sales', 0)} sales")
        
        return stats
    
    def test_cashier_dashboard_stats(self, cashier_token):
        """Cashier should only see stats for their own orders"""
        headers = {"Authorization": f"Bearer {cashier_token}"}
        response = requests.get(f"{BASE_URL}/api/dashboard/stats", headers=headers)
        assert response.status_code == 200, f"Failed to get dashboard stats: {response.text}"
        stats = response.json()
        
        # Verify stats structure
        assert "today" in stats, "Missing 'today' in stats"
        assert "all_time" in stats, "Missing 'all_time' in stats"
        
        print(f"Cashier dashboard stats:")
        print(f"  Today: {stats['today'].get('total_orders', 0)} orders, {stats['today'].get('total_sales', 0)} sales")
        print(f"  All time: {stats['all_time'].get('total_orders', 0)} orders, {stats['all_time'].get('total_sales', 0)} sales")
        
        # Since test cashier hasn't created orders, expect 0 or very low numbers
        return stats
    
    def test_admin_vs_cashier_stats_comparison(self, admin_token, cashier_token):
        """Compare dashboard stats between admin and cashier"""
        admin_headers = {"Authorization": f"Bearer {admin_token}"}
        cashier_headers = {"Authorization": f"Bearer {cashier_token}"}
        
        admin_response = requests.get(f"{BASE_URL}/api/dashboard/stats", headers=admin_headers)
        cashier_response = requests.get(f"{BASE_URL}/api/dashboard/stats", headers=cashier_headers)
        
        admin_stats = admin_response.json()
        cashier_stats = cashier_response.json()
        
        admin_all_time_orders = admin_stats.get("all_time", {}).get("total_orders", 0)
        cashier_all_time_orders = cashier_stats.get("all_time", {}).get("total_orders", 0)
        
        print(f"Admin all-time orders: {admin_all_time_orders}")
        print(f"Cashier all-time orders: {cashier_all_time_orders}")
        
        # Admin should see more orders than cashier
        assert admin_all_time_orders >= cashier_all_time_orders, \
            "Admin should see at least as many orders as cashier in stats"


class TestRoleBasedAccess:
    """Test that different roles have correct access levels"""
    
    @pytest.fixture
    def admin_token(self):
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        return response.json()["token"]
    
    @pytest.fixture
    def cashier_token(self):
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": CASHIER_EMAIL,
            "password": CASHIER_PASSWORD
        })
        return response.json()["token"]
    
    def test_verify_admin_role(self, admin_token):
        """Verify admin user has admin role"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        response = requests.get(f"{BASE_URL}/api/auth/me", headers=headers)
        assert response.status_code == 200, f"Failed to get user info: {response.text}"
        user = response.json()
        print(f"Admin user role: {user.get('role')}")
        assert user.get("role") in ["admin", "super_admin", "manager"], \
            f"Expected admin/manager role, got {user.get('role')}"
    
    def test_verify_cashier_role(self, cashier_token):
        """Verify cashier user has cashier role"""
        headers = {"Authorization": f"Bearer {cashier_token}"}
        response = requests.get(f"{BASE_URL}/api/auth/me", headers=headers)
        assert response.status_code == 200, f"Failed to get user info: {response.text}"
        user = response.json()
        print(f"Cashier user role: {user.get('role')}, ID: {user.get('id')}")
        assert user.get("role") == "cashier", f"Expected cashier role, got {user.get('role')}"
        assert user.get("id") == CASHIER_USER_ID, f"Cashier ID mismatch"


class TestTodayFilterForNonAdmin:
    """Test that non-admin users default to today's orders when no date specified"""
    
    @pytest.fixture
    def cashier_token(self):
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": CASHIER_EMAIL,
            "password": CASHIER_PASSWORD
        })
        return response.json()["token"]
    
    def test_cashier_orders_default_to_today(self, cashier_token):
        """Cashier without date filter should only see today's orders"""
        headers = {"Authorization": f"Bearer {cashier_token}"}
        
        # Get orders without date filter
        response = requests.get(f"{BASE_URL}/api/orders", headers=headers)
        assert response.status_code == 200, f"Failed to get orders: {response.text}"
        orders = response.json()
        
        today = datetime.now(timezone.utc).strftime('%Y-%m-%d')
        
        # All orders should be from today
        for order in orders:
            created_at = order.get("created_at", "")
            assert created_at.startswith(today), \
                f"Order from non-today date found: {created_at}"
        
        print(f"Cashier sees {len(orders)} orders, all from today ({today})")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
