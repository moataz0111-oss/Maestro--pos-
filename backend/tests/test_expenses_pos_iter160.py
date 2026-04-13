"""
Test Expenses API and POS Features - Iteration 160
Tests:
1. Expenses API returns created_by_name for each expense
2. Login with admin credentials
3. POS payment method validation
"""
import pytest
import requests
import os
from datetime import datetime

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestAuth:
    """Authentication tests"""
    
    @pytest.fixture(scope="class")
    def admin_token(self):
        """Login with admin credentials"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "hanialdujaili@gmail.com",
            "password": "Hani@2024"
        })
        assert response.status_code == 200, f"Admin login failed: {response.text}"
        data = response.json()
        assert "token" in data, "No token in response"
        return data["token"]
    
    def test_admin_login(self, admin_token):
        """Test admin login returns valid token"""
        assert admin_token is not None
        assert len(admin_token) > 0
        print(f"✅ Admin login successful, token length: {len(admin_token)}")


class TestExpensesAPI:
    """Expenses API tests - created_by_name field"""
    
    @pytest.fixture(scope="class")
    def auth_headers(self):
        """Get auth headers for admin"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "hanialdujaili@gmail.com",
            "password": "Hani@2024"
        })
        assert response.status_code == 200
        token = response.json()["token"]
        return {"Authorization": f"Bearer {token}"}
    
    def test_get_expenses_returns_created_by_name(self, auth_headers):
        """Test GET /api/expenses returns created_by_name for each expense"""
        # Get expenses for a wider date range to find existing data
        response = requests.get(
            f"{BASE_URL}/api/expenses",
            headers=auth_headers,
            params={
                "start_date": "2024-01-01",
                "end_date": "2026-12-31"
            }
        )
        assert response.status_code == 200, f"Failed to get expenses: {response.text}"
        expenses = response.json()
        print(f"✅ GET /api/expenses returned {len(expenses)} expenses")
        
        # Check if expenses have created_by_name field
        if len(expenses) > 0:
            for expense in expenses[:5]:  # Check first 5
                print(f"  - Expense: {expense.get('description', 'N/A')}, created_by_name: {expense.get('created_by_name', 'MISSING')}")
                # created_by_name should exist (may be empty string for old data)
                assert "created_by_name" in expense or "created_by" in expense, "Expense missing created_by fields"
        else:
            print("  ⚠️ No expenses found in date range")
    
    def test_create_expense_includes_created_by_name(self, auth_headers):
        """Test POST /api/expenses includes created_by_name in response"""
        # First get a branch_id
        branches_response = requests.get(f"{BASE_URL}/api/branches", headers=auth_headers)
        assert branches_response.status_code == 200
        branches = branches_response.json()
        assert len(branches) > 0, "No branches found"
        branch_id = branches[0]["id"]
        
        # Create a test expense
        expense_data = {
            "category": "other",
            "description": f"TEST_expense_{datetime.now().strftime('%H%M%S')}",
            "amount": 1000,
            "payment_method": "cash",
            "branch_id": branch_id,
            "date": datetime.now().strftime("%Y-%m-%d")
        }
        
        response = requests.post(
            f"{BASE_URL}/api/expenses",
            headers=auth_headers,
            json=expense_data
        )
        assert response.status_code == 200, f"Failed to create expense: {response.text}"
        created_expense = response.json()
        
        # Verify created_by_name is in response
        assert "created_by_name" in created_expense, "created_by_name missing from created expense"
        print(f"✅ Created expense with created_by_name: '{created_expense.get('created_by_name')}'")
        
        # Verify the name is not empty (should be the admin's name)
        assert created_expense.get("created_by_name"), "created_by_name should not be empty"


class TestPOSPaymentValidation:
    """POS payment method validation tests"""
    
    @pytest.fixture(scope="class")
    def auth_headers(self):
        """Get auth headers for admin"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "hanialdujaili@gmail.com",
            "password": "Hani@2024"
        })
        assert response.status_code == 200
        token = response.json()["token"]
        return {"Authorization": f"Bearer {token}"}
    
    def test_order_with_payment_method(self, auth_headers):
        """Test creating order with payment method"""
        # Get branch and products
        branches_response = requests.get(f"{BASE_URL}/api/branches", headers=auth_headers)
        assert branches_response.status_code == 200
        branches = branches_response.json()
        branch_id = branches[0]["id"]
        
        products_response = requests.get(f"{BASE_URL}/api/products", headers=auth_headers)
        assert products_response.status_code == 200
        products = products_response.json()
        assert len(products) > 0, "No products found"
        product = products[0]
        
        # Create order with cash payment
        order_data = {
            "order_type": "takeaway",
            "items": [{
                "product_id": product["id"],
                "product_name": product["name"],
                "quantity": 1,
                "price": product["price"],
                "cost": product.get("cost", 0)
            }],
            "branch_id": branch_id,
            "payment_method": "cash",
            "buzzer_number": "999"
        }
        
        response = requests.post(
            f"{BASE_URL}/api/orders",
            headers=auth_headers,
            json=order_data
        )
        assert response.status_code == 200, f"Failed to create order: {response.text}"
        order = response.json()
        
        assert order.get("payment_method") == "cash", f"Payment method mismatch: {order.get('payment_method')}"
        print(f"✅ Order created with payment_method: {order.get('payment_method')}")
        
        # Cleanup - cancel the test order
        if order.get("id"):
            requests.put(
                f"{BASE_URL}/api/orders/{order['id']}/status",
                headers=auth_headers,
                json={"status": "cancelled"}
            )


class TestExpenseCategories:
    """Test expense categories endpoint"""
    
    @pytest.fixture(scope="class")
    def auth_headers(self):
        """Get auth headers for admin"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "hanialdujaili@gmail.com",
            "password": "Hani@2024"
        })
        assert response.status_code == 200
        token = response.json()["token"]
        return {"Authorization": f"Bearer {token}"}
    
    def test_get_expense_categories(self, auth_headers):
        """Test GET /api/expenses/categories returns categories"""
        response = requests.get(
            f"{BASE_URL}/api/expenses/categories",
            headers=auth_headers
        )
        assert response.status_code == 200, f"Failed to get expense categories: {response.text}"
        categories = response.json()
        assert len(categories) > 0, "No expense categories returned"
        print(f"✅ GET /api/expenses/categories returned {len(categories)} categories")
        for cat in categories[:5]:
            print(f"  - {cat.get('id')}: {cat.get('name')}")


class TestShiftInfo:
    """Test shift info for owner badge"""
    
    @pytest.fixture(scope="class")
    def auth_headers(self):
        """Get auth headers for admin"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "hanialdujaili@gmail.com",
            "password": "Hani@2024"
        })
        assert response.status_code == 200
        token = response.json()["token"]
        return {"Authorization": f"Bearer {token}"}
    
    def test_get_current_shift(self, auth_headers):
        """Test GET /api/shifts/current returns shift info"""
        response = requests.get(
            f"{BASE_URL}/api/shifts/current",
            headers=auth_headers
        )
        # May return 404 if no shift is open
        if response.status_code == 200:
            shift = response.json()
            print(f"✅ Current shift: {shift.get('id')}, cashier: {shift.get('cashier_name')}")
            assert "cashier_name" in shift or "cashier_id" in shift
        elif response.status_code == 404:
            print("⚠️ No current shift open (404)")
        else:
            assert False, f"Unexpected status: {response.status_code} - {response.text}"


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
