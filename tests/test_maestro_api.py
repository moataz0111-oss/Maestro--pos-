"""
Maestro EGP API Tests - Iteration 2
Testing new features:
- User management (edit, delete, permissions)
- Categories management (CRUD)
- Products management (CRUD with cost/profit)
- Reports endpoints (sales, purchases, inventory, expenses, profit-loss, products, delivery-credits)
"""

import pytest
import requests
import os
import uuid

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://zk-sync-agent.preview.emergentagent.com').rstrip('/')

class TestAuth:
    """Authentication tests"""
    
    @pytest.fixture(scope="class")
    def admin_token(self):
        """Get admin authentication token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "admin@maestroegp.com",
            "password": "admin123"
        })
        assert response.status_code == 200, f"Login failed: {response.text}"
        data = response.json()
        assert "token" in data
        return data["token"]
    
    def test_admin_login(self):
        """Test admin login"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "admin@maestroegp.com",
            "password": "admin123"
        })
        assert response.status_code == 200
        data = response.json()
        assert "token" in data
        assert "user" in data
        assert data["user"]["email"] == "admin@maestroegp.com"
        assert data["user"]["role"] == "admin"
        print(f"✓ Admin login successful")
    
    def test_invalid_login(self):
        """Test invalid login credentials"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "wrong@email.com",
            "password": "wrongpassword"
        })
        assert response.status_code == 401
        print(f"✓ Invalid login rejected correctly")


class TestUserManagement:
    """User management tests - edit, delete, permissions"""
    
    @pytest.fixture(scope="class")
    def auth_headers(self):
        """Get authenticated headers"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "admin@maestroegp.com",
            "password": "admin123"
        })
        token = response.json()["token"]
        return {"Authorization": f"Bearer {token}"}
    
    def test_get_users(self, auth_headers):
        """Test getting all users"""
        response = requests.get(f"{BASE_URL}/api/users", headers=auth_headers)
        assert response.status_code == 200
        users = response.json()
        assert isinstance(users, list)
        assert len(users) > 0
        print(f"✓ Got {len(users)} users")
    
    def test_create_and_update_user(self, auth_headers):
        """Test creating and updating a user"""
        # Create user
        test_email = f"test_{uuid.uuid4().hex[:8]}@test.com"
        create_response = requests.post(f"{BASE_URL}/api/auth/register", json={
            "username": f"testuser_{uuid.uuid4().hex[:8]}",
            "email": test_email,
            "password": "testpass123",
            "full_name": "Test User Original",
            "role": "cashier",
            "permissions": []
        })
        assert create_response.status_code == 200, f"Create failed: {create_response.text}"
        created_user = create_response.json()["user"]
        user_id = created_user["id"]
        print(f"✓ Created user: {user_id}")
        
        # Update user - change name, role, permissions
        update_response = requests.put(f"{BASE_URL}/api/users/{user_id}", 
            headers=auth_headers,
            json={
                "full_name": "Test User Updated",
                "role": "supervisor",
                "permissions": ["pos", "orders", "reports"],
                "is_active": True
            }
        )
        assert update_response.status_code == 200, f"Update failed: {update_response.text}"
        updated_user = update_response.json()
        assert updated_user["full_name"] == "Test User Updated"
        assert updated_user["role"] == "supervisor"
        assert "pos" in updated_user["permissions"]
        print(f"✓ Updated user successfully")
        
        # Delete user
        delete_response = requests.delete(f"{BASE_URL}/api/users/{user_id}", headers=auth_headers)
        assert delete_response.status_code == 200
        print(f"✓ Deleted user successfully")


class TestCategoriesManagement:
    """Categories CRUD tests"""
    
    @pytest.fixture(scope="class")
    def auth_headers(self):
        """Get authenticated headers"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "admin@maestroegp.com",
            "password": "admin123"
        })
        token = response.json()["token"]
        return {"Authorization": f"Bearer {token}"}
    
    def test_get_categories(self, auth_headers):
        """Test getting all categories"""
        response = requests.get(f"{BASE_URL}/api/categories", headers=auth_headers)
        assert response.status_code == 200
        categories = response.json()
        assert isinstance(categories, list)
        print(f"✓ Got {len(categories)} categories")
        return categories
    
    def test_create_update_delete_category(self, auth_headers):
        """Test full CRUD for categories"""
        # Create category
        create_response = requests.post(f"{BASE_URL}/api/categories", 
            headers=auth_headers,
            json={
                "name": "فئة اختبار",
                "name_en": "Test Category",
                "icon": "🧪",
                "color": "#FF5733",
                "sort_order": 99
            }
        )
        assert create_response.status_code == 200, f"Create failed: {create_response.text}"
        category = create_response.json()
        category_id = category["id"]
        assert category["name"] == "فئة اختبار"
        print(f"✓ Created category: {category_id}")
        
        # Update category
        update_response = requests.put(f"{BASE_URL}/api/categories/{category_id}",
            headers=auth_headers,
            json={
                "name": "فئة اختبار محدثة",
                "name_en": "Updated Test Category",
                "icon": "✅",
                "color": "#00FF00",
                "sort_order": 100
            }
        )
        assert update_response.status_code == 200
        updated = update_response.json()
        assert updated["name"] == "فئة اختبار محدثة"
        print(f"✓ Updated category successfully")
        
        # Delete category
        delete_response = requests.delete(f"{BASE_URL}/api/categories/{category_id}", headers=auth_headers)
        assert delete_response.status_code == 200
        print(f"✓ Deleted category successfully")


class TestProductsManagement:
    """Products CRUD tests with cost/profit calculations"""
    
    @pytest.fixture(scope="class")
    def auth_headers(self):
        """Get authenticated headers"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "admin@maestroegp.com",
            "password": "admin123"
        })
        token = response.json()["token"]
        return {"Authorization": f"Bearer {token}"}
    
    @pytest.fixture(scope="class")
    def test_category_id(self, auth_headers):
        """Create a test category for products"""
        response = requests.post(f"{BASE_URL}/api/categories",
            headers=auth_headers,
            json={
                "name": "فئة منتجات اختبار",
                "name_en": "Test Products Category",
                "icon": "📦",
                "color": "#3498db",
                "sort_order": 98
            }
        )
        category = response.json()
        yield category["id"]
        # Cleanup
        requests.delete(f"{BASE_URL}/api/categories/{category['id']}", headers=auth_headers)
    
    def test_get_products(self, auth_headers):
        """Test getting all products"""
        response = requests.get(f"{BASE_URL}/api/products", headers=auth_headers)
        assert response.status_code == 200
        products = response.json()
        assert isinstance(products, list)
        print(f"✓ Got {len(products)} products")
    
    def test_create_product_with_costs(self, auth_headers, test_category_id):
        """Test creating product with cost and operating_cost"""
        create_response = requests.post(f"{BASE_URL}/api/products",
            headers=auth_headers,
            json={
                "name": "منتج اختبار",
                "name_en": "Test Product",
                "category_id": test_category_id,
                "price": 10000,
                "cost": 4000,  # Raw material cost
                "operating_cost": 1000,  # Operating cost
                "image": "",
                "description": "منتج للاختبار",
                "is_available": True,
                "barcode": "TEST123"
            }
        )
        assert create_response.status_code == 200, f"Create failed: {create_response.text}"
        product = create_response.json()
        product_id = product["id"]
        
        # Verify profit calculation: price - cost - operating_cost = 10000 - 4000 - 1000 = 5000
        assert product["price"] == 10000
        assert product["cost"] == 4000
        assert product["operating_cost"] == 1000
        assert product["profit"] == 5000, f"Expected profit 5000, got {product['profit']}"
        print(f"✓ Created product with correct profit calculation: {product['profit']}")
        
        # Update product
        update_response = requests.put(f"{BASE_URL}/api/products/{product_id}",
            headers=auth_headers,
            json={
                "name": "منتج اختبار محدث",
                "name_en": "Updated Test Product",
                "category_id": test_category_id,
                "price": 12000,
                "cost": 5000,
                "operating_cost": 1500,
                "image": "",
                "description": "منتج محدث",
                "is_available": True,
                "barcode": "TEST123"
            }
        )
        assert update_response.status_code == 200
        updated = update_response.json()
        # New profit: 12000 - 5000 - 1500 = 5500
        assert updated["profit"] == 5500, f"Expected profit 5500, got {updated['profit']}"
        print(f"✓ Updated product with correct profit: {updated['profit']}")
        
        # Delete product
        delete_response = requests.delete(f"{BASE_URL}/api/products/{product_id}", headers=auth_headers)
        assert delete_response.status_code == 200
        print(f"✓ Deleted product successfully")


class TestReportsEndpoints:
    """Reports endpoints tests"""
    
    @pytest.fixture(scope="class")
    def auth_headers(self):
        """Get authenticated headers"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "admin@maestroegp.com",
            "password": "admin123"
        })
        token = response.json()["token"]
        return {"Authorization": f"Bearer {token}"}
    
    def test_sales_report(self, auth_headers):
        """Test sales report endpoint"""
        response = requests.get(f"{BASE_URL}/api/reports/sales", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert "total_sales" in data
        assert "total_orders" in data
        assert "by_payment_method" in data
        assert "by_order_type" in data
        print(f"✓ Sales report: {data['total_sales']} total sales, {data['total_orders']} orders")
    
    def test_purchases_report(self, auth_headers):
        """Test purchases report endpoint"""
        response = requests.get(f"{BASE_URL}/api/reports/purchases", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert "total_purchases" in data
        assert "total_transactions" in data
        print(f"✓ Purchases report: {data['total_purchases']} total purchases")
    
    def test_inventory_report(self, auth_headers):
        """Test inventory report endpoint"""
        response = requests.get(f"{BASE_URL}/api/reports/inventory", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert "total_items" in data
        assert "total_inventory_value" in data
        print(f"✓ Inventory report: {data['total_items']} items, value: {data['total_inventory_value']}")
    
    def test_expenses_report(self, auth_headers):
        """Test expenses report endpoint"""
        response = requests.get(f"{BASE_URL}/api/reports/expenses", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert "total_expenses" in data
        assert "by_category" in data
        print(f"✓ Expenses report: {data['total_expenses']} total expenses")
    
    def test_profit_loss_report(self, auth_headers):
        """Test profit/loss report endpoint"""
        response = requests.get(f"{BASE_URL}/api/reports/profit-loss", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert "revenue" in data
        assert "gross_profit" in data
        assert "net_profit" in data
        print(f"✓ Profit/Loss report: Net profit {data['net_profit']['amount']}")
    
    def test_products_report(self, auth_headers):
        """Test products report endpoint"""
        response = requests.get(f"{BASE_URL}/api/reports/products", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert "products" in data
        assert "total_products" in data
        print(f"✓ Products report: {data['total_products']} products")
    
    def test_delivery_credits_report(self, auth_headers):
        """Test delivery credits report endpoint"""
        response = requests.get(f"{BASE_URL}/api/reports/delivery-credits", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert "total_credit" in data
        assert "total_commission" in data
        assert "net_receivable" in data
        print(f"✓ Delivery credits report: {data['total_credit']} total credit")


class TestBranchesAndSettings:
    """Branches and settings tests"""
    
    @pytest.fixture(scope="class")
    def auth_headers(self):
        """Get authenticated headers"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "admin@maestroegp.com",
            "password": "admin123"
        })
        token = response.json()["token"]
        return {"Authorization": f"Bearer {token}"}
    
    def test_get_branches(self, auth_headers):
        """Test getting branches"""
        response = requests.get(f"{BASE_URL}/api/branches", headers=auth_headers)
        assert response.status_code == 200
        branches = response.json()
        assert isinstance(branches, list)
        assert len(branches) > 0
        print(f"✓ Got {len(branches)} branches")
    
    def test_get_delivery_apps(self, auth_headers):
        """Test getting delivery apps"""
        response = requests.get(f"{BASE_URL}/api/delivery-apps", headers=auth_headers)
        assert response.status_code == 200
        apps = response.json()
        assert isinstance(apps, list)
        # Should have default apps: toters, talabat, baly, alsaree3, talabati
        app_ids = [a["id"] for a in apps]
        assert "toters" in app_ids
        assert "talabat" in app_ids
        print(f"✓ Got {len(apps)} delivery apps")
    
    def test_get_printers(self, auth_headers):
        """Test getting printers"""
        response = requests.get(f"{BASE_URL}/api/printers", headers=auth_headers)
        assert response.status_code == 200
        printers = response.json()
        assert isinstance(printers, list)
        print(f"✓ Got {len(printers)} printers")
    
    def test_get_settings(self, auth_headers):
        """Test getting settings"""
        response = requests.get(f"{BASE_URL}/api/settings", headers=auth_headers)
        assert response.status_code == 200
        settings = response.json()
        assert isinstance(settings, dict)
        print(f"✓ Got settings")


class TestExpensesManagement:
    """Expenses management tests"""
    
    @pytest.fixture(scope="class")
    def auth_headers(self):
        """Get authenticated headers"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "admin@maestroegp.com",
            "password": "admin123"
        })
        token = response.json()["token"]
        return {"Authorization": f"Bearer {token}"}
    
    @pytest.fixture(scope="class")
    def branch_id(self, auth_headers):
        """Get first branch ID"""
        response = requests.get(f"{BASE_URL}/api/branches", headers=auth_headers)
        branches = response.json()
        return branches[0]["id"] if branches else None
    
    def test_get_expense_categories(self, auth_headers):
        """Test getting expense categories"""
        response = requests.get(f"{BASE_URL}/api/expenses/categories", headers=auth_headers)
        assert response.status_code == 200
        categories = response.json()
        assert isinstance(categories, list)
        # Should have: rent, utilities, salaries, maintenance, supplies, marketing, transport, other
        cat_ids = [c["id"] for c in categories]
        assert "rent" in cat_ids
        assert "salaries" in cat_ids
        print(f"✓ Got {len(categories)} expense categories")
    
    def test_create_expense(self, auth_headers, branch_id):
        """Test creating an expense"""
        if not branch_id:
            pytest.skip("No branch available")
        
        response = requests.post(f"{BASE_URL}/api/expenses",
            headers=auth_headers,
            json={
                "category": "supplies",
                "description": "مستلزمات اختبار",
                "amount": 50000,
                "payment_method": "cash",
                "branch_id": branch_id
            }
        )
        assert response.status_code == 200, f"Create expense failed: {response.text}"
        expense = response.json()
        assert expense["amount"] == 50000
        assert expense["category"] == "supplies"
        print(f"✓ Created expense: {expense['id']}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
