"""
Test Break-Even APIs and Branch Fixed Costs - Iteration 84
Tests:
1. GET /api/break-even/daily - Daily break-even report
2. GET /api/break-even/monthly-summary - Monthly break-even summary
3. PUT /api/branches/{id} - Update branch with fixed costs
4. POST /api/orders - Order creation (print saves order)
"""
import pytest
import requests
import os
from datetime import datetime

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials - using super_admin since admin@maestroegp.com doesn't exist
SUPER_ADMIN = {"email": "owner@maestroegp.com", "password": "owner123"}
ADMIN_USER = SUPER_ADMIN  # Use super_admin for testing
TEST_BRANCH_ID = "b45125b7-b7d3-48c6-9386-a95fcf773132"


class TestAuthentication:
    """Test authentication endpoints"""
    
    def test_health_check(self):
        """Test API health endpoint"""
        response = requests.get(f"{BASE_URL}/api/health")
        assert response.status_code == 200
        data = response.json()
        assert data.get("status") == "ok"
        print("✅ Health check passed")
    
    def test_admin_login(self):
        """Test admin login"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json=ADMIN_USER)
        assert response.status_code == 200
        data = response.json()
        assert "token" in data
        assert "user" in data
        print(f"✅ Admin login successful: {data['user'].get('email')}")
        return data["token"]


class TestBreakEvenAPIs:
    """Test Break-Even calculation APIs"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup authentication token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json=ADMIN_USER)
        if response.status_code == 200:
            self.token = response.json().get("token")
            self.headers = {"Authorization": f"Bearer {self.token}"}
        else:
            pytest.skip("Authentication failed")
    
    def test_daily_break_even_api(self):
        """Test GET /api/break-even/daily endpoint"""
        today = datetime.now().strftime("%Y-%m-%d")
        response = requests.get(
            f"{BASE_URL}/api/break-even/daily",
            params={"date": today},
            headers=self.headers
        )
        assert response.status_code == 200
        data = response.json()
        
        # Verify response structure
        assert "branches" in data
        assert "total_daily_target" in data
        assert "total_daily_profit" in data
        assert "total_coverage_percentage" in data
        assert "is_break_even_reached" in data
        
        print(f"✅ Daily break-even API works")
        print(f"   Total daily target: {data['total_daily_target']}")
        print(f"   Total daily profit: {data['total_daily_profit']}")
        print(f"   Coverage: {data['total_coverage_percentage']}%")
        print(f"   Break-even reached: {data['is_break_even_reached']}")
        
        return data
    
    def test_daily_break_even_with_branch_filter(self):
        """Test daily break-even with specific branch"""
        today = datetime.now().strftime("%Y-%m-%d")
        response = requests.get(
            f"{BASE_URL}/api/break-even/daily",
            params={"date": today, "branch_id": TEST_BRANCH_ID},
            headers=self.headers
        )
        assert response.status_code == 200
        data = response.json()
        
        # Should have branches array
        assert "branches" in data
        print(f"✅ Daily break-even with branch filter works")
        print(f"   Branches returned: {len(data['branches'])}")
        
        return data
    
    def test_monthly_break_even_summary(self):
        """Test GET /api/break-even/monthly-summary endpoint"""
        current_month = datetime.now().strftime("%Y-%m")
        response = requests.get(
            f"{BASE_URL}/api/break-even/monthly-summary",
            params={"month": current_month},
            headers=self.headers
        )
        assert response.status_code == 200
        data = response.json()
        
        # Verify response structure
        assert "branches" in data
        assert "total_monthly_target" in data
        assert "total_monthly_profit" in data
        assert "total_coverage_percentage" in data
        assert "is_break_even_reached" in data
        
        print(f"✅ Monthly break-even summary API works")
        print(f"   Total monthly target: {data['total_monthly_target']}")
        print(f"   Total monthly profit: {data['total_monthly_profit']}")
        print(f"   Coverage: {data['total_coverage_percentage']}%")
        
        return data
    
    def test_break_even_branch_details(self):
        """Test that branch details include fixed costs breakdown"""
        today = datetime.now().strftime("%Y-%m-%d")
        response = requests.get(
            f"{BASE_URL}/api/break-even/daily",
            params={"date": today},
            headers=self.headers
        )
        assert response.status_code == 200
        data = response.json()
        
        if data["branches"]:
            branch = data["branches"][0]
            
            # Verify branch structure
            assert "branch_id" in branch
            assert "branch_name" in branch
            assert "daily_target" in branch
            assert "fixed_costs" in branch
            assert "salaries" in branch
            assert "coverage_percentage" in branch
            assert "is_break_even_reached" in branch
            
            # Verify fixed costs breakdown
            fixed_costs = branch["fixed_costs"]
            assert "rent" in fixed_costs
            assert "water" in fixed_costs
            assert "electricity" in fixed_costs
            assert "generator" in fixed_costs
            
            print(f"✅ Branch details structure is correct")
            print(f"   Branch: {branch['branch_name']}")
            print(f"   Daily target: {branch['daily_target']}")
            print(f"   Fixed costs: rent={fixed_costs['rent']}, water={fixed_costs['water']}, electricity={fixed_costs['electricity']}, generator={fixed_costs['generator']}")
        else:
            print("⚠️ No branches found in response")


class TestBranchFixedCosts:
    """Test Branch fixed costs update"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup authentication token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json=ADMIN_USER)
        if response.status_code == 200:
            self.token = response.json().get("token")
            self.headers = {"Authorization": f"Bearer {self.token}"}
        else:
            pytest.skip("Authentication failed")
    
    def test_get_branches(self):
        """Test GET /api/branches endpoint"""
        response = requests.get(f"{BASE_URL}/api/branches", headers=self.headers)
        assert response.status_code == 200
        branches = response.json()
        assert isinstance(branches, list)
        print(f"✅ Get branches works - {len(branches)} branches found")
        
        if branches:
            branch = branches[0]
            print(f"   First branch: {branch.get('name')}")
            print(f"   rent_cost: {branch.get('rent_cost', 0)}")
            print(f"   electricity_cost: {branch.get('electricity_cost', 0)}")
            print(f"   water_cost: {branch.get('water_cost', 0)}")
            print(f"   generator_cost: {branch.get('generator_cost', 0)}")
        
        return branches
    
    def test_update_branch_with_fixed_costs(self):
        """Test PUT /api/branches/{id} with fixed costs"""
        # First get a branch
        response = requests.get(f"{BASE_URL}/api/branches", headers=self.headers)
        assert response.status_code == 200
        branches = response.json()
        
        if not branches:
            pytest.skip("No branches available")
        
        branch = branches[0]
        branch_id = branch["id"]
        
        # Update with fixed costs
        update_data = {
            "name": branch.get("name", "Test Branch"),
            "address": branch.get("address", "Test Address"),
            "phone": branch.get("phone", ""),
            "email": branch.get("email"),
            "rent_cost": 3000000,  # 3 million IQD
            "electricity_cost": 500000,  # 500k IQD
            "water_cost": 100000,  # 100k IQD
            "generator_cost": 400000  # 400k IQD
        }
        
        response = requests.put(
            f"{BASE_URL}/api/branches/{branch_id}",
            json=update_data,
            headers=self.headers
        )
        assert response.status_code == 200
        updated_branch = response.json()
        
        # Verify fixed costs were saved
        assert updated_branch.get("rent_cost") == 3000000
        assert updated_branch.get("electricity_cost") == 500000
        assert updated_branch.get("water_cost") == 100000
        assert updated_branch.get("generator_cost") == 400000
        
        print(f"✅ Branch fixed costs updated successfully")
        print(f"   Branch: {updated_branch.get('name')}")
        print(f"   rent_cost: {updated_branch.get('rent_cost')}")
        print(f"   electricity_cost: {updated_branch.get('electricity_cost')}")
        print(f"   water_cost: {updated_branch.get('water_cost')}")
        print(f"   generator_cost: {updated_branch.get('generator_cost')}")
        
        return updated_branch


class TestOrderCreation:
    """Test Order creation (print saves order)"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup authentication token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json=ADMIN_USER)
        if response.status_code == 200:
            self.token = response.json().get("token")
            self.headers = {"Authorization": f"Bearer {self.token}"}
        else:
            pytest.skip("Authentication failed")
    
    def test_get_products(self):
        """Test GET /api/products endpoint"""
        response = requests.get(f"{BASE_URL}/api/products", headers=self.headers)
        assert response.status_code == 200
        products = response.json()
        assert isinstance(products, list)
        print(f"✅ Get products works - {len(products)} products found")
        return products
    
    def test_create_order_for_print(self):
        """Test POST /api/orders - simulating print save"""
        # Get products first
        products_response = requests.get(f"{BASE_URL}/api/products", headers=self.headers)
        products = products_response.json()
        
        if not products:
            pytest.skip("No products available")
        
        # Get branches
        branches_response = requests.get(f"{BASE_URL}/api/branches", headers=self.headers)
        branches = branches_response.json()
        
        if not branches:
            pytest.skip("No branches available")
        
        product = products[0]
        branch = branches[0]
        
        # Create order data (simulating what POS sends when printing)
        order_data = {
            "items": [{
                "product_id": product["id"],
                "product_name": product["name"],
                "price": product["price"],
                "quantity": 1,
                "cost": product.get("cost", 0),
                "notes": ""
            }],
            "order_type": "takeaway",
            "table_id": None,
            "customer_name": "TEST_PrintOrder",
            "customer_phone": "07801234567",
            "delivery_address": None,
            "buzzer_number": None,
            "driver_id": None,
            "delivery_app": None,
            "discount": 0,
            "branch_id": branch["id"],
            "payment_method": "pending",
            "auto_ready": True
        }
        
        response = requests.post(
            f"{BASE_URL}/api/orders",
            json=order_data,
            headers=self.headers
        )
        assert response.status_code in [200, 201]
        order = response.json()
        
        # Verify order was created
        assert "id" in order
        assert "order_number" in order
        assert order.get("customer_name") == "TEST_PrintOrder"
        
        print(f"✅ Order created successfully (print save)")
        print(f"   Order ID: {order['id']}")
        print(f"   Order Number: {order['order_number']}")
        print(f"   Total: {order.get('total')}")
        
        # Verify order exists in database
        get_response = requests.get(
            f"{BASE_URL}/api/orders/{order['id']}",
            headers=self.headers
        )
        assert get_response.status_code == 200
        saved_order = get_response.json()
        assert saved_order["id"] == order["id"]
        print(f"✅ Order verified in database")
        
        return order
    
    def test_create_dine_in_order(self):
        """Test creating dine-in order with table"""
        # Get products
        products_response = requests.get(f"{BASE_URL}/api/products", headers=self.headers)
        products = products_response.json()
        
        if not products:
            pytest.skip("No products available")
        
        # Get branches
        branches_response = requests.get(f"{BASE_URL}/api/branches", headers=self.headers)
        branches = branches_response.json()
        
        if not branches:
            pytest.skip("No branches available")
        
        # Get tables
        tables_response = requests.get(f"{BASE_URL}/api/tables", headers=self.headers)
        tables = tables_response.json()
        
        product = products[0]
        branch = branches[0]
        table_id = tables[0]["id"] if tables else None
        
        order_data = {
            "items": [{
                "product_id": product["id"],
                "product_name": product["name"],
                "price": product["price"],
                "quantity": 2,
                "cost": product.get("cost", 0),
                "notes": ""
            }],
            "order_type": "dine_in",
            "table_id": table_id,
            "customer_name": None,
            "customer_phone": None,
            "delivery_address": None,
            "buzzer_number": None,
            "driver_id": None,
            "delivery_app": None,
            "discount": 0,
            "branch_id": branch["id"],
            "payment_method": "pending",
            "auto_ready": True
        }
        
        response = requests.post(
            f"{BASE_URL}/api/orders",
            json=order_data,
            headers=self.headers
        )
        assert response.status_code in [200, 201]
        order = response.json()
        
        assert "id" in order
        assert order.get("order_type") == "dine_in"
        
        print(f"✅ Dine-in order created successfully")
        print(f"   Order Number: {order['order_number']}")
        print(f"   Table ID: {order.get('table_id')}")
        
        return order


class TestBreakEvenCalculation:
    """Test break-even calculation logic"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup authentication token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json=ADMIN_USER)
        if response.status_code == 200:
            self.token = response.json().get("token")
            self.headers = {"Authorization": f"Bearer {self.token}"}
        else:
            pytest.skip("Authentication failed")
    
    def test_break_even_calculation_formula(self):
        """Test that break-even is calculated correctly:
        Daily Target = (rent + electricity + water + generator) / 30 + (total salaries / 30)
        """
        # Get daily break-even data
        today = datetime.now().strftime("%Y-%m-%d")
        response = requests.get(
            f"{BASE_URL}/api/break-even/daily",
            params={"date": today},
            headers=self.headers
        )
        assert response.status_code == 200
        data = response.json()
        
        if data["branches"]:
            branch = data["branches"][0]
            
            # Get branch fixed costs
            fixed_costs = branch["fixed_costs"]
            rent_daily = fixed_costs["rent"]["daily"] if isinstance(fixed_costs["rent"], dict) else fixed_costs["rent"] / 30
            water_daily = fixed_costs["water"]["daily"] if isinstance(fixed_costs["water"], dict) else fixed_costs["water"] / 30
            electricity_daily = fixed_costs["electricity"]["daily"] if isinstance(fixed_costs["electricity"], dict) else fixed_costs["electricity"] / 30
            generator_daily = fixed_costs["generator"]["daily"] if isinstance(fixed_costs["generator"], dict) else fixed_costs["generator"] / 30
            
            # Get salaries
            salaries = branch["salaries"]
            salaries_daily = salaries.get("daily", 0)
            
            # Calculate expected daily target
            expected_fixed_costs_daily = rent_daily + water_daily + electricity_daily + generator_daily
            expected_daily_target = expected_fixed_costs_daily + salaries_daily
            
            actual_daily_target = branch["daily_target"]
            
            print(f"✅ Break-even calculation verified")
            print(f"   Branch: {branch['branch_name']}")
            print(f"   Fixed costs daily: {expected_fixed_costs_daily}")
            print(f"   Salaries daily: {salaries_daily}")
            print(f"   Expected daily target: {expected_daily_target}")
            print(f"   Actual daily target: {actual_daily_target}")
            
            # Allow small floating point difference
            assert abs(expected_daily_target - actual_daily_target) < 1, \
                f"Daily target mismatch: expected {expected_daily_target}, got {actual_daily_target}"
        else:
            print("⚠️ No branches with fixed costs found")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
