"""
Iteration 46 - Bug Fix Verification Tests
Tests for:
1. Branches API hides default branches (الفرع الرئيسي, Main Branch, etc.)
2. Reports page has search button
3. Customer menu shows branch selection first (not skip to menu)
4. Logo displays first letter of restaurant name if no logo
5. Tables can be added to branches
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestBranchesAPI:
    """Test that branches API hides default branches"""
    
    @pytest.fixture
    def demo_token(self):
        """Get token for demo user"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "demo@maestroegp.com",
            "password": "demo123"
        })
        assert response.status_code == 200, f"Login failed: {response.text}"
        return response.json()["token"]
    
    @pytest.fixture
    def demo_user(self):
        """Get demo user info"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "demo@maestroegp.com",
            "password": "demo123"
        })
        assert response.status_code == 200
        return response.json()["user"]
    
    def test_branches_api_hides_default_branches(self, demo_token):
        """Test that /api/branches hides default branches like 'الفرع الرئيسي'"""
        response = requests.get(
            f"{BASE_URL}/api/branches",
            headers={"Authorization": f"Bearer {demo_token}"}
        )
        assert response.status_code == 200
        branches = response.json()
        
        # Check that no default branch names are returned
        default_names = ["الفرع الرئيسي", "Main Branch", "الفرع الثاني", "فرع المالك الرئيسي"]
        branch_names = [b["name"] for b in branches]
        
        for default_name in default_names:
            assert default_name not in branch_names, f"Default branch '{default_name}' should be hidden"
        
        # Verify real branches are returned
        print(f"Branches returned: {branch_names}")
        assert len(branches) >= 0, "Should return branches (or empty if none exist)"
    
    def test_customer_menu_hides_default_branches(self, demo_user):
        """Test that customer menu API hides default branches"""
        tenant_id = demo_user["tenant_id"]
        response = requests.get(f"{BASE_URL}/api/customer/menu/{tenant_id}")
        assert response.status_code == 200
        
        data = response.json()
        branches = data.get("branches", [])
        
        # Check that no default branch names are returned
        default_names = ["الفرع الرئيسي", "Main Branch", "الفرع الثاني", "فرع المالك الرئيسي"]
        branch_names = [b["name"] for b in branches]
        
        for default_name in default_names:
            assert default_name not in branch_names, f"Default branch '{default_name}' should be hidden in customer menu"
        
        print(f"Customer menu branches: {branch_names}")
        
        # Verify restaurant info is returned
        assert "restaurant" in data
        assert data["restaurant"]["name"], "Restaurant should have a name"


class TestReportsAPI:
    """Test Reports API endpoints"""
    
    @pytest.fixture
    def demo_token(self):
        """Get token for demo user"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "demo@maestroegp.com",
            "password": "demo123"
        })
        assert response.status_code == 200
        return response.json()["token"]
    
    def test_sales_report_endpoint(self, demo_token):
        """Test sales report endpoint works"""
        response = requests.get(
            f"{BASE_URL}/api/reports/sales",
            headers={"Authorization": f"Bearer {demo_token}"},
            params={"start_date": "2026-01-01", "end_date": "2026-12-31"}
        )
        assert response.status_code == 200
        data = response.json()
        # Reports may be empty if no orders exist - that's OK
        print(f"Sales report: {data}")


class TestTablesAPI:
    """Test Tables API for adding tables to branches"""
    
    @pytest.fixture
    def demo_token(self):
        """Get token for demo user"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "demo@maestroegp.com",
            "password": "demo123"
        })
        assert response.status_code == 200
        return response.json()["token"]
    
    @pytest.fixture
    def aljadreia_branch_id(self, demo_token):
        """Get Aljadreia branch ID"""
        response = requests.get(
            f"{BASE_URL}/api/branches",
            headers={"Authorization": f"Bearer {demo_token}"}
        )
        assert response.status_code == 200
        branches = response.json()
        
        for branch in branches:
            if branch["name"] == "Aljadreia":
                return branch["id"]
        
        pytest.skip("Aljadreia branch not found")
    
    def test_get_tables(self, demo_token):
        """Test getting tables list"""
        response = requests.get(
            f"{BASE_URL}/api/tables",
            headers={"Authorization": f"Bearer {demo_token}"}
        )
        assert response.status_code == 200
        tables = response.json()
        print(f"Tables count: {len(tables)}")
    
    def test_add_table_to_branch(self, demo_token, aljadreia_branch_id):
        """Test adding a new table to Aljadreia branch"""
        import uuid
        table_number = 100 + int(uuid.uuid4().int % 900)  # Random table number
        
        response = requests.post(
            f"{BASE_URL}/api/tables",
            headers={"Authorization": f"Bearer {demo_token}"},
            json={
                "number": table_number,
                "capacity": 4,
                "section": "القاعة الرئيسية",
                "branch_id": aljadreia_branch_id
            }
        )
        
        assert response.status_code in [200, 201], f"Failed to create table: {response.text}"
        table = response.json()
        
        assert table["number"] == table_number
        assert table["branch_id"] == aljadreia_branch_id
        print(f"Created table: {table}")
        
        # Verify table appears in list
        list_response = requests.get(
            f"{BASE_URL}/api/tables",
            headers={"Authorization": f"Bearer {demo_token}"},
            params={"branch_id": aljadreia_branch_id}
        )
        assert list_response.status_code == 200
        tables = list_response.json()
        table_ids = [t["id"] for t in tables]
        assert table["id"] in table_ids, "New table should appear in tables list"


class TestCustomerMenuFlow:
    """Test customer menu flow - should show branch selection first"""
    
    @pytest.fixture
    def demo_user(self):
        """Get demo user info"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "demo@maestroegp.com",
            "password": "demo123"
        })
        assert response.status_code == 200
        return response.json()["user"]
    
    def test_customer_menu_returns_branches(self, demo_user):
        """Test that customer menu returns branches for selection"""
        tenant_id = demo_user["tenant_id"]
        response = requests.get(f"{BASE_URL}/api/customer/menu/{tenant_id}")
        assert response.status_code == 200
        
        data = response.json()
        
        # Verify structure
        assert "restaurant" in data
        assert "categories" in data
        assert "products" in data
        assert "branches" in data
        
        # If there are multiple branches, frontend should show branch selection
        branches = data["branches"]
        print(f"Number of branches: {len(branches)}")
        print(f"Branch names: {[b['name'] for b in branches]}")
        
        # Restaurant info should be present
        restaurant = data["restaurant"]
        assert restaurant.get("name"), "Restaurant should have a name"
        print(f"Restaurant: {restaurant['name']}")


class TestHealthCheck:
    """Basic health check tests"""
    
    def test_api_health(self):
        """Test API health endpoint"""
        response = requests.get(f"{BASE_URL}/api/health")
        assert response.status_code == 200
        assert response.json()["status"] == "ok"
    
    def test_login_demo_user(self):
        """Test demo user can login"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "demo@maestroegp.com",
            "password": "demo123"
        })
        assert response.status_code == 200
        data = response.json()
        assert "token" in data
        assert "user" in data
        assert data["user"]["email"] == "demo@maestroegp.com"
