"""
Test Reports Routes - تقارير المبيعات والمشتريات والمصروفات
Testing the refactored reports from /app/backend/routes/reports_routes.py
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
ADMIN_EMAIL = "admin@maestroegp.com"
ADMIN_PASSWORD = "admin123"
OWNER_EMAIL = "owner@maestroegp.com"
OWNER_PASSWORD = "owner123"


class TestAuthentication:
    """Authentication tests for reports access"""
    
    def test_admin_login(self):
        """Test admin login to get token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        assert response.status_code == 200, f"Admin login failed: {response.text}"
        data = response.json()
        assert "token" in data, "Token not in response"
        assert "user" in data, "User not in response"
        print(f"✅ Admin login successful - Role: {data['user'].get('role')}")
        return data["token"]
    
    def test_owner_login(self):
        """Test owner/super_admin login"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": OWNER_EMAIL,
            "password": OWNER_PASSWORD
        })
        assert response.status_code == 200, f"Owner login failed: {response.text}"
        data = response.json()
        assert "token" in data, "Token not in response"
        print(f"✅ Owner login successful - Role: {data['user'].get('role')}")
        return data["token"]


@pytest.fixture(scope="module")
def admin_token():
    """Get admin token for authenticated requests"""
    response = requests.post(f"{BASE_URL}/api/auth/login", json={
        "email": ADMIN_EMAIL,
        "password": ADMIN_PASSWORD
    })
    if response.status_code == 200:
        return response.json().get("token")
    pytest.skip("Admin authentication failed")


@pytest.fixture(scope="module")
def owner_token():
    """Get owner token for authenticated requests"""
    response = requests.post(f"{BASE_URL}/api/auth/login", json={
        "email": OWNER_EMAIL,
        "password": OWNER_PASSWORD
    })
    if response.status_code == 200:
        return response.json().get("token")
    pytest.skip("Owner authentication failed")


@pytest.fixture
def auth_headers(admin_token):
    """Headers with admin authentication"""
    return {"Authorization": f"Bearer {admin_token}"}


@pytest.fixture
def owner_headers(owner_token):
    """Headers with owner authentication"""
    return {"Authorization": f"Bearer {owner_token}"}


class TestSalesReport:
    """Test GET /api/reports/sales endpoint"""
    
    def test_sales_report_basic(self, auth_headers):
        """Test basic sales report without filters"""
        response = requests.get(f"{BASE_URL}/api/reports/sales", headers=auth_headers)
        assert response.status_code == 200, f"Sales report failed: {response.text}"
        data = response.json()
        
        # Verify response structure
        assert "total_sales" in data, "Missing total_sales"
        assert "total_orders" in data, "Missing total_orders"
        assert "average_order_value" in data, "Missing average_order_value"
        assert "by_payment_method" in data, "Missing by_payment_method"
        assert "by_order_type" in data, "Missing by_order_type"
        assert "by_delivery_app" in data, "Missing by_delivery_app"
        assert "delivery_summary" in data, "Missing delivery_summary"
        assert "by_date" in data, "Missing by_date"
        assert "top_products" in data, "Missing top_products"
        
        print(f"✅ Sales Report: Total Sales={data['total_sales']}, Orders={data['total_orders']}")
    
    def test_sales_report_with_date_filter(self, auth_headers):
        """Test sales report with date range filter"""
        response = requests.get(
            f"{BASE_URL}/api/reports/sales",
            params={"start_date": "2024-01-01", "end_date": "2026-12-31"},
            headers=auth_headers
        )
        assert response.status_code == 200, f"Sales report with dates failed: {response.text}"
        data = response.json()
        assert isinstance(data["total_sales"], (int, float))
        print(f"✅ Sales Report with date filter: Total={data['total_sales']}")


class TestPurchasesReport:
    """Test GET /api/reports/purchases endpoint"""
    
    def test_purchases_report_basic(self, auth_headers):
        """Test basic purchases report"""
        response = requests.get(f"{BASE_URL}/api/reports/purchases", headers=auth_headers)
        assert response.status_code == 200, f"Purchases report failed: {response.text}"
        data = response.json()
        
        # Verify response structure
        assert "total_purchases" in data, "Missing total_purchases"
        assert "total_transactions" in data, "Missing total_transactions"
        assert "by_supplier" in data, "Missing by_supplier"
        assert "by_date" in data, "Missing by_date"
        assert "by_payment_status" in data, "Missing by_payment_status"
        
        print(f"✅ Purchases Report: Total={data['total_purchases']}, Transactions={data['total_transactions']}")
    
    def test_purchases_report_with_date_filter(self, auth_headers):
        """Test purchases report with date range"""
        response = requests.get(
            f"{BASE_URL}/api/reports/purchases",
            params={"start_date": "2024-01-01", "end_date": "2026-12-31"},
            headers=auth_headers
        )
        assert response.status_code == 200, f"Purchases report with dates failed: {response.text}"
        print("✅ Purchases Report with date filter works")


class TestInventoryReport:
    """Test GET /api/reports/inventory endpoint"""
    
    def test_inventory_report_basic(self, auth_headers):
        """Test basic inventory report"""
        response = requests.get(f"{BASE_URL}/api/reports/inventory", headers=auth_headers)
        assert response.status_code == 200, f"Inventory report failed: {response.text}"
        data = response.json()
        
        # Verify response structure
        assert "total_items" in data, "Missing total_items"
        assert "raw_materials_count" in data, "Missing raw_materials_count"
        assert "finished_products_count" in data, "Missing finished_products_count"
        assert "low_stock_count" in data, "Missing low_stock_count"
        assert "low_stock_items" in data, "Missing low_stock_items"
        assert "total_inventory_value" in data, "Missing total_inventory_value"
        assert "items" in data, "Missing items"
        
        print(f"✅ Inventory Report: Total Items={data['total_items']}, Low Stock={data['low_stock_count']}")


class TestExpensesReport:
    """Test GET /api/reports/expenses endpoint"""
    
    def test_expenses_report_basic(self, auth_headers):
        """Test basic expenses report"""
        response = requests.get(f"{BASE_URL}/api/reports/expenses", headers=auth_headers)
        assert response.status_code == 200, f"Expenses report failed: {response.text}"
        data = response.json()
        
        # Verify response structure
        assert "total_expenses" in data, "Missing total_expenses"
        assert "total_transactions" in data, "Missing total_transactions"
        assert "by_category" in data, "Missing by_category"
        assert "by_date" in data, "Missing by_date"
        assert "expenses" in data, "Missing expenses list"
        
        print(f"✅ Expenses Report: Total={data['total_expenses']}, Transactions={data['total_transactions']}")
    
    def test_expenses_report_with_date_filter(self, auth_headers):
        """Test expenses report with date range"""
        response = requests.get(
            f"{BASE_URL}/api/reports/expenses",
            params={"start_date": "2024-01-01", "end_date": "2026-12-31"},
            headers=auth_headers
        )
        assert response.status_code == 200, f"Expenses report with dates failed: {response.text}"
        print("✅ Expenses Report with date filter works")


class TestProfitLossReport:
    """Test GET /api/reports/profit-loss endpoint"""
    
    def test_profit_loss_report_basic(self, auth_headers):
        """Test basic profit/loss report"""
        response = requests.get(f"{BASE_URL}/api/reports/profit-loss", headers=auth_headers)
        assert response.status_code == 200, f"Profit/Loss report failed: {response.text}"
        data = response.json()
        
        # Verify response structure
        assert "revenue" in data, "Missing revenue"
        assert "cost_of_goods_sold" in data, "Missing cost_of_goods_sold"
        assert "delivery_commissions" in data, "Missing delivery_commissions"
        assert "gross_profit" in data, "Missing gross_profit"
        assert "operating_expenses" in data, "Missing operating_expenses"
        assert "net_profit" in data, "Missing net_profit"
        
        # Verify nested structure
        assert "total_sales" in data["revenue"], "Missing revenue.total_sales"
        assert "amount" in data["gross_profit"], "Missing gross_profit.amount"
        assert "amount" in data["net_profit"], "Missing net_profit.amount"
        
        print(f"✅ Profit/Loss Report: Revenue={data['revenue']['total_sales']}, Net Profit={data['net_profit']['amount']}")
    
    def test_profit_loss_report_with_date_filter(self, auth_headers):
        """Test profit/loss report with date range"""
        response = requests.get(
            f"{BASE_URL}/api/reports/profit-loss",
            params={"start_date": "2024-01-01", "end_date": "2026-12-31"},
            headers=auth_headers
        )
        assert response.status_code == 200, f"Profit/Loss report with dates failed: {response.text}"
        print("✅ Profit/Loss Report with date filter works")


class TestDeliveryCreditsReport:
    """Test GET /api/reports/delivery-credits endpoint"""
    
    def test_delivery_credits_report_basic(self, auth_headers):
        """Test basic delivery credits report"""
        response = requests.get(f"{BASE_URL}/api/reports/delivery-credits", headers=auth_headers)
        assert response.status_code == 200, f"Delivery credits report failed: {response.text}"
        data = response.json()
        
        # Verify response structure
        assert "total_sales" in data, "Missing total_sales"
        assert "total_credit" in data, "Missing total_credit"
        assert "total_commission" in data, "Missing total_commission"
        assert "net_receivable" in data, "Missing net_receivable"
        assert "total_orders" in data, "Missing total_orders"
        assert "by_delivery_app" in data, "Missing by_delivery_app"
        
        print(f"✅ Delivery Credits Report: Total Sales={data['total_sales']}, Net Receivable={data['net_receivable']}")
    
    def test_delivery_credits_report_with_date_filter(self, auth_headers):
        """Test delivery credits report with date range"""
        response = requests.get(
            f"{BASE_URL}/api/reports/delivery-credits",
            params={"start_date": "2024-01-01", "end_date": "2026-12-31"},
            headers=auth_headers
        )
        assert response.status_code == 200, f"Delivery credits report with dates failed: {response.text}"
        print("✅ Delivery Credits Report with date filter works")


class TestProductsReport:
    """Test GET /api/reports/products endpoint"""
    
    def test_products_report_basic(self, auth_headers):
        """Test basic products report"""
        response = requests.get(f"{BASE_URL}/api/reports/products", headers=auth_headers)
        assert response.status_code == 200, f"Products report failed: {response.text}"
        data = response.json()
        
        # Verify response structure
        assert "products" in data, "Missing products"
        assert "total_products" in data, "Missing total_products"
        assert "top_selling" in data, "Missing top_selling"
        assert "low_selling" in data, "Missing low_selling"
        
        # Verify product structure if products exist
        if data["products"]:
            product = data["products"][0]
            assert "id" in product, "Missing product id"
            assert "name" in product, "Missing product name"
            assert "price" in product, "Missing product price"
            assert "quantity_sold" in product, "Missing quantity_sold"
            assert "total_revenue" in product, "Missing total_revenue"
        
        print(f"✅ Products Report: Total Products={data['total_products']}, Top Selling={len(data['top_selling'])}")
    
    def test_products_report_with_date_filter(self, auth_headers):
        """Test products report with date range"""
        response = requests.get(
            f"{BASE_URL}/api/reports/products",
            params={"start_date": "2024-01-01", "end_date": "2026-12-31"},
            headers=auth_headers
        )
        assert response.status_code == 200, f"Products report with dates failed: {response.text}"
        print("✅ Products Report with date filter works")


class TestReportsWithOwnerAuth:
    """Test reports with owner/super_admin authentication"""
    
    def test_sales_report_owner(self, owner_headers):
        """Test sales report with owner auth"""
        response = requests.get(f"{BASE_URL}/api/reports/sales", headers=owner_headers)
        assert response.status_code == 200, f"Sales report (owner) failed: {response.text}"
        print("✅ Sales Report with owner auth works")
    
    def test_profit_loss_report_owner(self, owner_headers):
        """Test profit/loss report with owner auth"""
        response = requests.get(f"{BASE_URL}/api/reports/profit-loss", headers=owner_headers)
        assert response.status_code == 200, f"Profit/Loss report (owner) failed: {response.text}"
        print("✅ Profit/Loss Report with owner auth works")


class TestReportsUnauthorized:
    """Test reports without authentication"""
    
    def test_sales_report_no_auth(self):
        """Test sales report without auth - should fail"""
        response = requests.get(f"{BASE_URL}/api/reports/sales")
        assert response.status_code in [401, 403], f"Expected 401/403, got {response.status_code}"
        print("✅ Sales Report correctly requires authentication")
    
    def test_profit_loss_report_no_auth(self):
        """Test profit/loss report without auth - should fail"""
        response = requests.get(f"{BASE_URL}/api/reports/profit-loss")
        assert response.status_code in [401, 403], f"Expected 401/403, got {response.status_code}"
        print("✅ Profit/Loss Report correctly requires authentication")


class TestStaffAPI:
    """Test Staff Management API endpoints"""
    
    def test_get_staff_list(self, auth_headers):
        """Test GET /api/staff - Get staff list"""
        response = requests.get(f"{BASE_URL}/api/staff", headers=auth_headers)
        assert response.status_code == 200, f"Get staff list failed: {response.text}"
        data = response.json()
        assert isinstance(data, list), "Staff list should be an array"
        print(f"✅ Staff List: {len(data)} staff members")
    
    def test_get_staff_roles(self, auth_headers):
        """Test GET /api/staff/roles - Get available roles"""
        response = requests.get(f"{BASE_URL}/api/staff/roles", headers=auth_headers)
        assert response.status_code == 200, f"Get staff roles failed: {response.text}"
        data = response.json()
        assert isinstance(data, dict), "Staff roles should be a dictionary"
        print(f"✅ Staff Roles: {list(data.keys())}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
