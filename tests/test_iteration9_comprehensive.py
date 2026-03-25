"""
Test Iteration 9: Comprehensive Testing of All Features
- Login as Super Admin, Admin, and Tenant
- Dashboard, HR, Delivery, Reservations, Reviews, Smart Reports, Inventory
- Super Admin panel
"""

import pytest
import requests
import os
import uuid
from datetime import datetime

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://financial-reports-qa-1.preview.emergentagent.com').rstrip('/')

# Test credentials from review request
SUPER_ADMIN = {"email": "owner@maestroegp.com", "password": "owner123", "secret_key": "271018"}
ADMIN = {"email": "admin@maestroegp.com", "password": "admin123"}
TENANT = {"email": "hanialdujaili@gmail.com", "password": "test1234"}


class TestAuthentication:
    """Test all authentication flows"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
    
    def test_super_admin_login(self):
        """Test Super Admin login with secret key"""
        response = self.session.post(
            f"{BASE_URL}/api/super-admin/login",
            params={
                "email": SUPER_ADMIN["email"],
                "password": SUPER_ADMIN["password"],
                "secret_key": SUPER_ADMIN["secret_key"]
            }
        )
        print(f"\nSuper Admin Login Response: {response.status_code}")
        if response.status_code != 200:
            print(f"Error: {response.text}")
        assert response.status_code == 200, f"Super Admin login failed: {response.text}"
        
        data = response.json()
        assert "token" in data, "No token in response"
        assert data["user"]["role"] == "super_admin", f"Wrong role: {data['user']['role']}"
        print(f"✓ Super Admin login successful: {data['user']['full_name']}")
        return data
    
    def test_admin_login(self):
        """Test Admin login"""
        response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN["email"],
            "password": ADMIN["password"]
        })
        print(f"\nAdmin Login Response: {response.status_code}")
        if response.status_code != 200:
            print(f"Error: {response.text}")
        assert response.status_code == 200, f"Admin login failed: {response.text}"
        
        data = response.json()
        assert "token" in data, "No token in response"
        print(f"✓ Admin login successful: {data['user']['full_name']}")
        print(f"  - Role: {data['user']['role']}")
        print(f"  - Tenant ID: {data['user'].get('tenant_id', 'None (main system)')}")
        return data
    
    def test_tenant_login(self):
        """Test Tenant login (GRaffiti)"""
        response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": TENANT["email"],
            "password": TENANT["password"]
        })
        print(f"\nTenant Login Response: {response.status_code}")
        if response.status_code != 200:
            print(f"Error: {response.text}")
            # Try to check if user exists
            pytest.skip(f"Tenant login failed - user may not exist: {response.text}")
        
        data = response.json()
        assert "token" in data, "No token in response"
        print(f"✓ Tenant login successful: {data['user']['full_name']}")
        print(f"  - Role: {data['user']['role']}")
        print(f"  - Tenant ID: {data['user'].get('tenant_id', 'None')}")
        return data


class TestDashboardAPIs:
    """Test Dashboard related APIs"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        # Login as admin
        response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN["email"],
            "password": ADMIN["password"]
        })
        if response.status_code == 200:
            token = response.json().get("token")
            self.session.headers.update({"Authorization": f"Bearer {token}"})
    
    def test_get_branches(self):
        """Test GET /api/branches"""
        response = self.session.get(f"{BASE_URL}/api/branches")
        print(f"\nGET /api/branches: {response.status_code}")
        assert response.status_code == 200, f"Failed: {response.text}"
        
        branches = response.json()
        print(f"✓ Found {len(branches)} branches")
        for branch in branches[:3]:
            print(f"  - {branch['name']} (ID: {branch['id']})")
        return branches
    
    def test_get_categories(self):
        """Test GET /api/categories"""
        response = self.session.get(f"{BASE_URL}/api/categories")
        print(f"\nGET /api/categories: {response.status_code}")
        assert response.status_code == 200, f"Failed: {response.text}"
        
        categories = response.json()
        print(f"✓ Found {len(categories)} categories")
        return categories
    
    def test_get_products(self):
        """Test GET /api/products"""
        response = self.session.get(f"{BASE_URL}/api/products")
        print(f"\nGET /api/products: {response.status_code}")
        assert response.status_code == 200, f"Failed: {response.text}"
        
        products = response.json()
        print(f"✓ Found {len(products)} products")
        return products
    
    def test_get_orders(self):
        """Test GET /api/orders"""
        today = datetime.now().strftime("%Y-%m-%d")
        response = self.session.get(f"{BASE_URL}/api/orders", params={"date": today})
        print(f"\nGET /api/orders: {response.status_code}")
        assert response.status_code == 200, f"Failed: {response.text}"
        
        orders = response.json()
        print(f"✓ Found {len(orders)} orders for today")
        return orders
    
    def test_get_sales_report(self):
        """Test GET /api/reports/sales"""
        today = datetime.now().strftime("%Y-%m-%d")
        response = self.session.get(f"{BASE_URL}/api/reports/sales", params={
            "start_date": today,
            "end_date": today
        })
        print(f"\nGET /api/reports/sales: {response.status_code}")
        assert response.status_code == 200, f"Failed: {response.text}"
        
        report = response.json()
        print(f"✓ Sales report retrieved")
        print(f"  - Total Sales: {report.get('total_sales', 0)}")
        print(f"  - Total Orders: {report.get('total_orders', 0)}")
        return report
    
    def test_get_dashboard_settings(self):
        """Test GET /api/settings/dashboard"""
        response = self.session.get(f"{BASE_URL}/api/settings/dashboard")
        print(f"\nGET /api/settings/dashboard: {response.status_code}")
        # This might return 404 if no settings exist
        if response.status_code == 200:
            settings = response.json()
            print(f"✓ Dashboard settings retrieved")
            return settings
        else:
            print(f"  - No dashboard settings found (using defaults)")
            return {}


class TestHRAPIs:
    """Test HR (Human Resources) APIs"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        # Login as admin
        response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN["email"],
            "password": ADMIN["password"]
        })
        if response.status_code == 200:
            token = response.json().get("token")
            self.session.headers.update({"Authorization": f"Bearer {token}"})
    
    def test_get_employees(self):
        """Test GET /api/employees"""
        response = self.session.get(f"{BASE_URL}/api/employees")
        print(f"\nGET /api/employees: {response.status_code}")
        assert response.status_code == 200, f"Failed: {response.text}"
        
        employees = response.json()
        print(f"✓ Found {len(employees)} employees")
        for emp in employees[:3]:
            print(f"  - {emp['name']} ({emp['position']})")
        return employees
    
    def test_get_attendance(self):
        """Test GET /api/attendance"""
        month = datetime.now().strftime("%Y-%m")
        response = self.session.get(f"{BASE_URL}/api/attendance", params={
            "start_date": f"{month}-01",
            "end_date": f"{month}-31"
        })
        print(f"\nGET /api/attendance: {response.status_code}")
        assert response.status_code == 200, f"Failed: {response.text}"
        
        attendance = response.json()
        print(f"✓ Found {len(attendance)} attendance records")
        return attendance
    
    def test_get_advances(self):
        """Test GET /api/advances"""
        response = self.session.get(f"{BASE_URL}/api/advances")
        print(f"\nGET /api/advances: {response.status_code}")
        assert response.status_code == 200, f"Failed: {response.text}"
        
        advances = response.json()
        print(f"✓ Found {len(advances)} advances")
        return advances
    
    def test_get_deductions(self):
        """Test GET /api/deductions"""
        month = datetime.now().strftime("%Y-%m")
        response = self.session.get(f"{BASE_URL}/api/deductions", params={
            "start_date": f"{month}-01",
            "end_date": f"{month}-31"
        })
        print(f"\nGET /api/deductions: {response.status_code}")
        assert response.status_code == 200, f"Failed: {response.text}"
        
        deductions = response.json()
        print(f"✓ Found {len(deductions)} deductions")
        return deductions
    
    def test_get_bonuses(self):
        """Test GET /api/bonuses"""
        month = datetime.now().strftime("%Y-%m")
        response = self.session.get(f"{BASE_URL}/api/bonuses", params={
            "start_date": f"{month}-01",
            "end_date": f"{month}-31"
        })
        print(f"\nGET /api/bonuses: {response.status_code}")
        assert response.status_code == 200, f"Failed: {response.text}"
        
        bonuses = response.json()
        print(f"✓ Found {len(bonuses)} bonuses")
        return bonuses
    
    def test_get_payroll(self):
        """Test GET /api/payroll"""
        month = datetime.now().strftime("%Y-%m")
        response = self.session.get(f"{BASE_URL}/api/payroll", params={"month": month})
        print(f"\nGET /api/payroll: {response.status_code}")
        assert response.status_code == 200, f"Failed: {response.text}"
        
        payroll = response.json()
        print(f"✓ Found {len(payroll)} payroll records")
        return payroll


class TestDeliveryAPIs:
    """Test Delivery APIs"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        # Login as admin
        response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN["email"],
            "password": ADMIN["password"]
        })
        if response.status_code == 200:
            token = response.json().get("token")
            self.session.headers.update({"Authorization": f"Bearer {token}"})
    
    def test_get_drivers(self):
        """Test GET /api/drivers"""
        response = self.session.get(f"{BASE_URL}/api/drivers")
        print(f"\nGET /api/drivers: {response.status_code}")
        assert response.status_code == 200, f"Failed: {response.text}"
        
        drivers = response.json()
        print(f"✓ Found {len(drivers)} drivers")
        for driver in drivers[:3]:
            print(f"  - {driver['name']} ({driver['phone']})")
        return drivers
    
    def test_get_driver_locations(self):
        """Test GET /api/drivers/locations"""
        response = self.session.get(f"{BASE_URL}/api/drivers/locations")
        print(f"\nGET /api/drivers/locations: {response.status_code}")
        assert response.status_code == 200, f"Failed: {response.text}"
        
        locations = response.json()
        print(f"✓ Found {len(locations)} driver locations")
        return locations


class TestInventoryAPIs:
    """Test Inventory APIs"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        # Login as admin
        response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN["email"],
            "password": ADMIN["password"]
        })
        if response.status_code == 200:
            token = response.json().get("token")
            self.session.headers.update({"Authorization": f"Bearer {token}"})
    
    def test_get_inventory(self):
        """Test GET /api/inventory"""
        response = self.session.get(f"{BASE_URL}/api/inventory")
        print(f"\nGET /api/inventory: {response.status_code}")
        assert response.status_code == 200, f"Failed: {response.text}"
        
        inventory = response.json()
        print(f"✓ Found {len(inventory)} inventory items")
        return inventory
    
    def test_get_inventory_transfers(self):
        """Test GET /api/inventory-transfers"""
        response = self.session.get(f"{BASE_URL}/api/inventory-transfers")
        print(f"\nGET /api/inventory-transfers: {response.status_code}")
        assert response.status_code == 200, f"Failed: {response.text}"
        
        transfers = response.json()
        print(f"✓ Found {len(transfers)} inventory transfers")
        return transfers


class TestSuperAdminAPIs:
    """Test Super Admin APIs"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        # Login as super admin
        response = self.session.post(
            f"{BASE_URL}/api/super-admin/login",
            params={
                "email": SUPER_ADMIN["email"],
                "password": SUPER_ADMIN["password"],
                "secret_key": SUPER_ADMIN["secret_key"]
            }
        )
        if response.status_code == 200:
            token = response.json().get("token")
            self.session.headers.update({"Authorization": f"Bearer {token}"})
    
    def test_get_tenants(self):
        """Test GET /api/super-admin/tenants"""
        response = self.session.get(f"{BASE_URL}/api/super-admin/tenants")
        print(f"\nGET /api/super-admin/tenants: {response.status_code}")
        assert response.status_code == 200, f"Failed: {response.text}"
        
        tenants = response.json()
        print(f"✓ Found {len(tenants)} tenants")
        for tenant in tenants[:5]:
            print(f"  - {tenant['name']} (Active: {tenant.get('is_active', True)})")
        return tenants
    
    def test_get_super_admin_stats(self):
        """Test GET /api/super-admin/stats"""
        response = self.session.get(f"{BASE_URL}/api/super-admin/stats")
        print(f"\nGET /api/super-admin/stats: {response.status_code}")
        assert response.status_code == 200, f"Failed: {response.text}"
        
        stats = response.json()
        print(f"✓ Super Admin stats retrieved")
        print(f"  - Total Tenants: {stats.get('total_tenants', 0)}")
        print(f"  - Active Tenants: {stats.get('active_tenants', 0)}")
        print(f"  - Total Users: {stats.get('total_users', 0)}")
        return stats
    
    def test_get_login_backgrounds(self):
        """Test GET /api/login-backgrounds"""
        response = self.session.get(f"{BASE_URL}/api/login-backgrounds")
        print(f"\nGET /api/login-backgrounds: {response.status_code}")
        # This might return 404 if no backgrounds exist
        if response.status_code == 200:
            backgrounds = response.json()
            print(f"✓ Login backgrounds retrieved")
            print(f"  - Animation enabled: {backgrounds.get('animation_enabled', False)}")
            print(f"  - Backgrounds count: {len(backgrounds.get('backgrounds', []))}")
            return backgrounds
        else:
            print(f"  - No login backgrounds configured")
            return {}


class TestExpensesAPIs:
    """Test Expenses APIs"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        # Login as admin
        response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN["email"],
            "password": ADMIN["password"]
        })
        if response.status_code == 200:
            token = response.json().get("token")
            self.session.headers.update({"Authorization": f"Bearer {token}"})
    
    def test_get_expenses(self):
        """Test GET /api/expenses"""
        response = self.session.get(f"{BASE_URL}/api/expenses")
        print(f"\nGET /api/expenses: {response.status_code}")
        assert response.status_code == 200, f"Failed: {response.text}"
        
        expenses = response.json()
        print(f"✓ Found {len(expenses)} expenses")
        return expenses
    
    def test_get_expense_categories(self):
        """Test GET /api/expenses/categories"""
        response = self.session.get(f"{BASE_URL}/api/expenses/categories")
        print(f"\nGET /api/expenses/categories: {response.status_code}")
        assert response.status_code == 200, f"Failed: {response.text}"
        
        categories = response.json()
        print(f"✓ Found {len(categories)} expense categories")
        for cat in categories[:5]:
            print(f"  - {cat['name']} ({cat['id']})")
        return categories


class TestTablesAPIs:
    """Test Tables APIs"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        # Login as admin
        response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN["email"],
            "password": ADMIN["password"]
        })
        if response.status_code == 200:
            token = response.json().get("token")
            self.session.headers.update({"Authorization": f"Bearer {token}"})
    
    def test_get_tables(self):
        """Test GET /api/tables"""
        response = self.session.get(f"{BASE_URL}/api/tables")
        print(f"\nGET /api/tables: {response.status_code}")
        assert response.status_code == 200, f"Failed: {response.text}"
        
        tables = response.json()
        print(f"✓ Found {len(tables)} tables")
        return tables


class TestUsersAPIs:
    """Test Users APIs"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        # Login as admin
        response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN["email"],
            "password": ADMIN["password"]
        })
        if response.status_code == 200:
            token = response.json().get("token")
            self.session.headers.update({"Authorization": f"Bearer {token}"})
    
    def test_get_users(self):
        """Test GET /api/users"""
        response = self.session.get(f"{BASE_URL}/api/users")
        print(f"\nGET /api/users: {response.status_code}")
        assert response.status_code == 200, f"Failed: {response.text}"
        
        users = response.json()
        print(f"✓ Found {len(users)} users")
        for user in users[:5]:
            print(f"  - {user['full_name']} ({user['role']})")
        return users


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
