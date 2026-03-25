"""
Test Reports Credit & Delivery Collection Features - Iteration 124
Tests for:
1. POST /api/reports/credit/collect - تسجيل تحصيل آجل
2. GET /api/reports/credit - جلب تقرير الآجل مع بيانات التحصيل
3. POST /api/reports/delivery/collect - تسجيل تحصيل من شركة توصيل
4. GET /api/reports/delivery-credits - جلب تقرير التوصيل مع المبالغ الجديدة
5. GET /api/reports/sales - التحقق من وجود total_packaging_cost و total_materials_cost
"""

import pytest
import requests
import os
from datetime import datetime

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestReportsCreditDeliveryFeatures:
    """Test suite for credit and delivery collection features"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test fixtures"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        self.token = None
        self.today = datetime.now().strftime("%Y-%m-%d")
        
    def get_auth_token(self):
        """Get authentication token"""
        if self.token:
            return self.token
            
        # Try demo credentials
        response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "demo@maestroegp.com",
            "password": "demo123"
        })
        
        if response.status_code == 200:
            data = response.json()
            self.token = data.get("token")
            self.session.headers.update({"Authorization": f"Bearer {self.token}"})
            return self.token
        
        # Try owner credentials
        response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "owner@maestroegp.com",
            "password": "owner123"
        })
        
        if response.status_code == 200:
            data = response.json()
            self.token = data.get("token")
            self.session.headers.update({"Authorization": f"Bearer {self.token}"})
            return self.token
            
        pytest.skip("Authentication failed - skipping tests")
        
    # ==================== API Health Check ====================
    def test_api_health(self):
        """Test API is accessible"""
        response = self.session.get(f"{BASE_URL}/api/health")
        assert response.status_code == 200, f"API health check failed: {response.status_code}"
        print("✅ API health check passed")
        
    def test_authentication(self):
        """Test authentication works"""
        token = self.get_auth_token()
        assert token is not None, "Failed to get auth token"
        print(f"✅ Authentication successful, token: {token[:20]}...")
        
    # ==================== Sales Report Tests ====================
    def test_sales_report_has_packaging_cost(self):
        """Test GET /api/reports/sales returns total_packaging_cost field"""
        self.get_auth_token()
        
        response = self.session.get(f"{BASE_URL}/api/reports/sales", params={
            "start_date": self.today,
            "end_date": self.today
        })
        
        assert response.status_code == 200, f"Sales report failed: {response.status_code}"
        data = response.json()
        
        # Check for new fields
        assert "total_packaging_cost" in data, "Missing total_packaging_cost field in sales report"
        assert "total_materials_cost" in data, "Missing total_materials_cost field in sales report"
        
        print(f"✅ Sales report has packaging cost fields:")
        print(f"   - total_packaging_cost: {data.get('total_packaging_cost', 0)}")
        print(f"   - total_materials_cost: {data.get('total_materials_cost', 0)}")
        print(f"   - total_cost: {data.get('total_cost', 0)}")
        
    def test_sales_report_cost_calculation(self):
        """Test that total_materials_cost + total_packaging_cost = total_cost"""
        self.get_auth_token()
        
        response = self.session.get(f"{BASE_URL}/api/reports/sales", params={
            "start_date": self.today,
            "end_date": self.today
        })
        
        assert response.status_code == 200
        data = response.json()
        
        total_cost = data.get("total_cost", 0)
        materials_cost = data.get("total_materials_cost", 0)
        packaging_cost = data.get("total_packaging_cost", 0)
        
        # Verify calculation: materials + packaging should equal total
        # Note: Due to floating point, we use approximate comparison
        calculated_total = materials_cost + packaging_cost
        assert abs(calculated_total - total_cost) < 0.01, \
            f"Cost calculation mismatch: {materials_cost} + {packaging_cost} != {total_cost}"
        
        print(f"✅ Cost calculation verified: {materials_cost} + {packaging_cost} = {total_cost}")
        
    # ==================== Credit Report Tests ====================
    def test_credit_report_endpoint(self):
        """Test GET /api/reports/credit returns credit report with collection data"""
        self.get_auth_token()
        
        response = self.session.get(f"{BASE_URL}/api/reports/credit", params={
            "start_date": self.today,
            "end_date": self.today
        })
        
        assert response.status_code == 200, f"Credit report failed: {response.status_code}"
        data = response.json()
        
        # Check required fields
        assert "total_credit" in data, "Missing total_credit field"
        assert "total_orders" in data, "Missing total_orders field"
        assert "collected_amount" in data, "Missing collected_amount field"
        assert "remaining_amount" in data, "Missing remaining_amount field"
        assert "orders" in data, "Missing orders field"
        assert "collections" in data, "Missing collections field"
        
        print(f"✅ Credit report structure verified:")
        print(f"   - total_credit: {data.get('total_credit', 0)}")
        print(f"   - collected_amount: {data.get('collected_amount', 0)}")
        print(f"   - remaining_amount: {data.get('remaining_amount', 0)}")
        print(f"   - orders count: {len(data.get('orders', []))}")
        
    def test_credit_report_orders_have_collection_fields(self):
        """Test that credit orders have collected_amount and remaining_amount fields"""
        self.get_auth_token()
        
        response = self.session.get(f"{BASE_URL}/api/reports/credit", params={
            "start_date": "2024-01-01",  # Use wider date range to find orders
            "end_date": self.today
        })
        
        assert response.status_code == 200
        data = response.json()
        
        orders = data.get("orders", [])
        if orders:
            order = orders[0]
            assert "collected_amount" in order, "Order missing collected_amount field"
            assert "remaining_amount" in order, "Order missing remaining_amount field"
            assert "is_fully_collected" in order, "Order missing is_fully_collected field"
            print(f"✅ Credit orders have collection tracking fields")
        else:
            print("⚠️ No credit orders found to verify fields (this is OK if no credit orders exist)")
            
    # ==================== Credit Collection Tests ====================
    def test_credit_collect_endpoint_exists(self):
        """Test POST /api/reports/credit/collect endpoint exists"""
        self.get_auth_token()
        
        # Test with invalid data to verify endpoint exists
        response = self.session.post(f"{BASE_URL}/api/reports/credit/collect", json={
            "order_id": "fake_order_id",
            "amount": 100,
            "collected_by": "Test User"
        })
        
        # Should return 404 (order not found) or 422 (validation error), not 405 (method not allowed)
        assert response.status_code in [404, 422, 400], \
            f"Credit collect endpoint not working: {response.status_code}"
        
        print(f"✅ Credit collect endpoint exists (returned {response.status_code} for invalid order)")
        
    def test_credit_collect_validation(self):
        """Test credit collection validates required fields"""
        self.get_auth_token()
        
        # Test missing amount
        response = self.session.post(f"{BASE_URL}/api/reports/credit/collect", json={
            "order_id": "test_order",
            "collected_by": "Test User"
        })
        assert response.status_code in [422, 400], "Should validate missing amount"
        
        # Test missing collected_by
        response = self.session.post(f"{BASE_URL}/api/reports/credit/collect", json={
            "order_id": "test_order",
            "amount": 100
        })
        assert response.status_code in [422, 400], "Should validate missing collected_by"
        
        print("✅ Credit collection validates required fields")
        
    def test_credit_collections_list_endpoint(self):
        """Test GET /api/reports/credit/collections endpoint"""
        self.get_auth_token()
        
        response = self.session.get(f"{BASE_URL}/api/reports/credit/collections", params={
            "start_date": self.today,
            "end_date": self.today
        })
        
        assert response.status_code == 200, f"Credit collections list failed: {response.status_code}"
        data = response.json()
        
        assert "collections" in data, "Missing collections field"
        assert "total_collected" in data, "Missing total_collected field"
        assert "count" in data, "Missing count field"
        
        print(f"✅ Credit collections list endpoint works:")
        print(f"   - collections count: {data.get('count', 0)}")
        print(f"   - total_collected: {data.get('total_collected', 0)}")
        
    # ==================== Delivery Credits Report Tests ====================
    def test_delivery_credits_report_endpoint(self):
        """Test GET /api/reports/delivery-credits returns delivery report with new fields"""
        self.get_auth_token()
        
        response = self.session.get(f"{BASE_URL}/api/reports/delivery-credits", params={
            "start_date": self.today,
            "end_date": self.today
        })
        
        assert response.status_code == 200, f"Delivery credits report failed: {response.status_code}"
        data = response.json()
        
        # Check required fields for new 5-card display
        assert "total_sales" in data, "Missing total_sales field (قبل الاستقطاع)"
        assert "total_commission" in data, "Missing total_commission field (العمولة المستقطعة)"
        assert "net_receivable" in data, "Missing net_receivable field (بعد الاستقطاع)"
        assert "total_collected" in data, "Missing total_collected field (تم التحصيل)"
        assert "total_remaining" in data, "Missing total_remaining field (المتبقي)"
        assert "by_delivery_app" in data, "Missing by_delivery_app field"
        
        print(f"✅ Delivery credits report has all 5 required fields:")
        print(f"   - total_sales (قبل الاستقطاع): {data.get('total_sales', 0)}")
        print(f"   - total_commission (العمولة): {data.get('total_commission', 0)}")
        print(f"   - net_receivable (بعد الاستقطاع): {data.get('net_receivable', 0)}")
        print(f"   - total_collected (تم التحصيل): {data.get('total_collected', 0)}")
        print(f"   - total_remaining (المتبقي): {data.get('total_remaining', 0)}")
        
    def test_delivery_credits_by_app_structure(self):
        """Test delivery credits by_delivery_app has collection tracking fields"""
        self.get_auth_token()
        
        response = self.session.get(f"{BASE_URL}/api/reports/delivery-credits", params={
            "start_date": "2024-01-01",
            "end_date": self.today
        })
        
        assert response.status_code == 200
        data = response.json()
        
        by_app = data.get("by_delivery_app", {})
        if by_app:
            app_name = list(by_app.keys())[0]
            app_data = by_app[app_name]
            
            # Check for collection tracking fields
            assert "collected_amount" in app_data, "App data missing collected_amount"
            assert "remaining_amount" in app_data, "App data missing remaining_amount"
            assert "net_amount" in app_data, "App data missing net_amount"
            
            print(f"✅ Delivery app '{app_name}' has collection tracking fields")
        else:
            print("⚠️ No delivery apps found (this is OK if no delivery orders exist)")
            
    # ==================== Delivery Collection Tests ====================
    def test_delivery_collect_endpoint_exists(self):
        """Test POST /api/reports/delivery/collect endpoint exists"""
        self.get_auth_token()
        
        response = self.session.post(f"{BASE_URL}/api/reports/delivery/collect", json={
            "delivery_app_id": "test_app",
            "delivery_app_name": "Test App",
            "amount": 100,
            "collected_by": "Test User"
        })
        
        # Should return 200 (success) since delivery collection doesn't require existing order
        assert response.status_code in [200, 201], \
            f"Delivery collect endpoint failed: {response.status_code} - {response.text}"
        
        data = response.json()
        assert "message" in data, "Response missing message field"
        assert "collection" in data, "Response missing collection field"
        
        print(f"✅ Delivery collect endpoint works")
        print(f"   - message: {data.get('message')}")
        
    def test_delivery_collect_validation(self):
        """Test delivery collection validates required fields"""
        self.get_auth_token()
        
        # Test missing delivery_app_id
        response = self.session.post(f"{BASE_URL}/api/reports/delivery/collect", json={
            "delivery_app_name": "Test App",
            "amount": 100,
            "collected_by": "Test User"
        })
        assert response.status_code in [422, 400], "Should validate missing delivery_app_id"
        
        # Test missing amount
        response = self.session.post(f"{BASE_URL}/api/reports/delivery/collect", json={
            "delivery_app_id": "test_app",
            "delivery_app_name": "Test App",
            "collected_by": "Test User"
        })
        assert response.status_code in [422, 400], "Should validate missing amount"
        
        print("✅ Delivery collection validates required fields")
        
    def test_delivery_collections_list_endpoint(self):
        """Test GET /api/reports/delivery/collections endpoint"""
        self.get_auth_token()
        
        response = self.session.get(f"{BASE_URL}/api/reports/delivery/collections", params={
            "start_date": self.today,
            "end_date": self.today
        })
        
        assert response.status_code == 200, f"Delivery collections list failed: {response.status_code}"
        data = response.json()
        
        assert "collections" in data, "Missing collections field"
        assert "total_collected" in data, "Missing total_collected field"
        assert "count" in data, "Missing count field"
        
        print(f"✅ Delivery collections list endpoint works:")
        print(f"   - collections count: {data.get('count', 0)}")
        print(f"   - total_collected: {data.get('total_collected', 0)}")
        
    # ==================== Integration Tests ====================
    def test_delivery_collection_flow(self):
        """Test complete delivery collection flow"""
        self.get_auth_token()
        
        # 1. Get initial delivery credits report
        response = self.session.get(f"{BASE_URL}/api/reports/delivery-credits", params={
            "start_date": self.today,
            "end_date": self.today
        })
        assert response.status_code == 200
        initial_data = response.json()
        initial_collected = initial_data.get("total_collected", 0)
        
        # 2. Create a delivery collection
        collection_amount = 50.0
        response = self.session.post(f"{BASE_URL}/api/reports/delivery/collect", json={
            "delivery_app_id": "test_integration_app",
            "delivery_app_name": "Integration Test App",
            "amount": collection_amount,
            "collected_by": "Integration Test",
            "notes": "Test collection for iteration 124"
        })
        assert response.status_code in [200, 201], f"Collection failed: {response.text}"
        
        # 3. Verify collection appears in list
        response = self.session.get(f"{BASE_URL}/api/reports/delivery/collections", params={
            "start_date": self.today,
            "end_date": self.today
        })
        assert response.status_code == 200
        collections_data = response.json()
        
        # Find our test collection
        test_collections = [c for c in collections_data.get("collections", []) 
                          if c.get("delivery_app_id") == "test_integration_app"]
        assert len(test_collections) > 0, "Test collection not found in list"
        
        print("✅ Delivery collection flow works end-to-end")


# Run tests if executed directly
if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
