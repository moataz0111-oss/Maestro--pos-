"""
Iteration 47 - Database fixes verification tests
Tests for:
1. Customer menu API with menu_slug (demo-maestro)
2. Branch filtering (hiding default branches)
3. Tables per branch (Aljadreia: 5, Alsaydaia: 3)
4. Logo display in customer app
5. Reports search button
"""

import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://resto-master-8.preview.emergentagent.com')

class TestCustomerMenuAPI:
    """Tests for customer menu API with menu_slug"""
    
    def test_customer_menu_with_slug(self):
        """Test customer menu API returns data for demo-maestro slug"""
        response = requests.get(f"{BASE_URL}/api/customer/menu/demo-maestro")
        assert response.status_code == 200
        
        data = response.json()
        assert "restaurant" in data
        assert "branches" in data
        assert "categories" in data
        assert "products" in data
        
        # Verify restaurant info
        restaurant = data["restaurant"]
        assert restaurant["name"] == "Full Flow Test Restaurant"
        assert restaurant["menu_slug"] == "demo-maestro"
        print(f"✓ Restaurant: {restaurant['name']}")
    
    def test_customer_menu_branches_filtered(self):
        """Test that default branches are hidden in customer menu"""
        response = requests.get(f"{BASE_URL}/api/customer/menu/demo-maestro")
        assert response.status_code == 200
        
        data = response.json()
        branches = data["branches"]
        
        # Should have exactly 2 branches: Aljadreia and Alsaydaia
        branch_names = [b["name"] for b in branches]
        assert "Aljadreia" in branch_names, "Aljadreia branch should be present"
        assert "Alsaydaia" in branch_names, "Alsaydaia branch should be present"
        
        # Default branches should NOT be present
        assert "الفرع الرئيسي" not in branch_names, "Default branch should be hidden"
        assert "Main Branch" not in branch_names, "Main Branch should be hidden"
        
        print(f"✓ Branches: {branch_names}")
    
    def test_customer_menu_logo(self):
        """Test that logo URL is returned in customer menu"""
        response = requests.get(f"{BASE_URL}/api/customer/menu/demo-maestro")
        assert response.status_code == 200
        
        data = response.json()
        restaurant = data["restaurant"]
        
        # Logo should be present
        assert "logo" in restaurant
        logo = restaurant["logo"]
        assert logo is not None and logo != ""
        assert "uploads/logos" in logo
        print(f"✓ Logo URL: {logo}")


class TestAuthAndBranches:
    """Tests for authentication and branch management"""
    
    @pytest.fixture
    def auth_token(self):
        """Get authentication token for demo user"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "demo@maestroegp.com",
            "password": "demo123"
        })
        assert response.status_code == 200
        return response.json()["token"]
    
    def test_login_demo_user(self):
        """Test login with demo credentials"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "demo@maestroegp.com",
            "password": "demo123"
        })
        assert response.status_code == 200
        
        data = response.json()
        assert "token" in data
        assert "user" in data
        assert data["user"]["email"] == "demo@maestroegp.com"
        print(f"✓ Login successful for: {data['user']['email']}")
    
    def test_branches_filtered(self, auth_token):
        """Test that branches API hides default branches"""
        headers = {"Authorization": f"Bearer {auth_token}"}
        response = requests.get(f"{BASE_URL}/api/branches", headers=headers)
        assert response.status_code == 200
        
        branches = response.json()
        branch_names = [b["name"] for b in branches]
        
        # Should have Aljadreia and Alsaydaia
        assert "Aljadreia" in branch_names
        assert "Alsaydaia" in branch_names
        
        # Should NOT have default branches
        assert "الفرع الرئيسي" not in branch_names
        assert "Main Branch" not in branch_names
        
        print(f"✓ Branches: {branch_names}")


class TestTablesPerBranch:
    """Tests for tables in each branch"""
    
    @pytest.fixture
    def auth_token(self):
        """Get authentication token for demo user"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "demo@maestroegp.com",
            "password": "demo123"
        })
        assert response.status_code == 200
        return response.json()["token"]
    
    def test_tables_aljadreia_branch(self, auth_token):
        """Test tables for Aljadreia branch"""
        headers = {"Authorization": f"Bearer {auth_token}"}
        
        # Get Aljadreia branch ID
        branches_response = requests.get(f"{BASE_URL}/api/branches", headers=headers)
        branches = branches_response.json()
        aljadreia = next((b for b in branches if b["name"] == "Aljadreia"), None)
        assert aljadreia is not None, "Aljadreia branch should exist"
        
        # Get tables for Aljadreia
        tables_response = requests.get(
            f"{BASE_URL}/api/tables",
            headers=headers,
            params={"branch_id": aljadreia["id"]}
        )
        assert tables_response.status_code == 200
        
        tables = tables_response.json()
        assert len(tables) >= 5, f"Aljadreia should have at least 5 tables, found {len(tables)}"
        print(f"✓ Aljadreia tables: {len(tables)}")
    
    def test_tables_alsaydaia_branch(self, auth_token):
        """Test tables for Alsaydaia branch"""
        headers = {"Authorization": f"Bearer {auth_token}"}
        
        # Get Alsaydaia branch ID
        branches_response = requests.get(f"{BASE_URL}/api/branches", headers=headers)
        branches = branches_response.json()
        alsaydaia = next((b for b in branches if b["name"] == "Alsaydaia"), None)
        assert alsaydaia is not None, "Alsaydaia branch should exist"
        
        # Get tables for Alsaydaia
        tables_response = requests.get(
            f"{BASE_URL}/api/tables",
            headers=headers,
            params={"branch_id": alsaydaia["id"]}
        )
        assert tables_response.status_code == 200
        
        tables = tables_response.json()
        assert len(tables) >= 3, f"Alsaydaia should have at least 3 tables, found {len(tables)}"
        print(f"✓ Alsaydaia tables: {len(tables)}")


class TestReportsAPI:
    """Tests for reports API"""
    
    @pytest.fixture
    def auth_token(self):
        """Get authentication token for demo user"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "demo@maestroegp.com",
            "password": "demo123"
        })
        assert response.status_code == 200
        return response.json()["token"]
    
    def test_sales_report(self, auth_token):
        """Test sales report API"""
        headers = {"Authorization": f"Bearer {auth_token}"}
        response = requests.get(
            f"{BASE_URL}/api/reports/sales",
            headers=headers,
            params={
                "start_date": "2026-01-01",
                "end_date": "2026-12-31"
            }
        )
        assert response.status_code == 200
        
        data = response.json()
        assert "total_sales" in data
        assert "total_orders" in data
        print(f"✓ Sales report: {data['total_orders']} orders, {data['total_sales']} total")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
