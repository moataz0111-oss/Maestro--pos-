"""
Test new features for iteration 88:
1. Branch name display in cash register close dialog
2. API /api/cash-register/summary with branch_id parameter
3. Comprehensive report button in Reports page
4. Print report functionality
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestCashRegisterSummaryWithBranchId:
    """Test cash register summary API with branch_id parameter"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Login and get auth token"""
        login_response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": "demo@maestroegp.com", "password": "demo123"}
        )
        assert login_response.status_code == 200, f"Login failed: {login_response.text}"
        self.token = login_response.json()["token"]
        self.headers = {"Authorization": f"Bearer {self.token}"}
    
    def test_cash_register_summary_with_aljadreia_branch(self):
        """Test cash register summary returns branch_name for Aljadreia branch"""
        branch_id = "b45125b7-b7d3-48c6-9386-a95fcf773132"  # Aljadreia
        
        response = requests.get(
            f"{BASE_URL}/api/cash-register/summary",
            params={"branch_id": branch_id},
            headers=self.headers
        )
        
        # May return 404 if no open shift for this branch
        if response.status_code == 200:
            data = response.json()
            
            # Verify branch_name is returned
            assert "branch_name" in data, "branch_name field missing in response"
            assert data["branch_name"] == "Aljadreia", f"Expected 'Aljadreia', got '{data['branch_name']}'"
            
            # Verify branch_id matches
            assert data["branch_id"] == branch_id, f"branch_id mismatch"
            
            # Verify expected_cash is calculated
            assert "expected_cash" in data, "expected_cash field missing"
            assert isinstance(data["expected_cash"], (int, float)), "expected_cash should be numeric"
            
            print(f"✅ Cash register summary for Aljadreia: branch_name={data['branch_name']}, expected_cash={data['expected_cash']}")
        elif response.status_code == 404:
            # No open shift - this is acceptable
            print("⚠️ No open shift for Aljadreia branch (404)")
        else:
            pytest.fail(f"Unexpected status code: {response.status_code}, response: {response.text}")
    
    def test_cash_register_summary_with_alsaydaia_branch(self):
        """Test cash register summary for Alsaydaia branch"""
        branch_id = "8ce2fa26-fb8f-4f32-b562-3129ab031466"  # Alsaydaia
        
        response = requests.get(
            f"{BASE_URL}/api/cash-register/summary",
            params={"branch_id": branch_id},
            headers=self.headers
        )
        
        if response.status_code == 200:
            data = response.json()
            assert "branch_name" in data, "branch_name field missing"
            assert data["branch_name"] == "Alsaydaia", f"Expected 'Alsaydaia', got '{data['branch_name']}'"
            print(f"✅ Cash register summary for Alsaydaia: branch_name={data['branch_name']}")
        elif response.status_code == 404:
            # No open shift - this is acceptable
            print("⚠️ No open shift for Alsaydaia branch (404)")
        else:
            pytest.fail(f"Unexpected status code: {response.status_code}")
    
    def test_cash_register_summary_without_branch_id(self):
        """Test cash register summary without branch_id parameter"""
        response = requests.get(
            f"{BASE_URL}/api/cash-register/summary",
            headers=self.headers
        )
        
        if response.status_code == 200:
            data = response.json()
            # Should still return branch_name from the open shift
            assert "branch_name" in data, "branch_name field missing"
            assert "expected_cash" in data, "expected_cash field missing"
            print(f"✅ Cash register summary (no branch_id): branch_name={data['branch_name']}")
        elif response.status_code == 404:
            print("⚠️ No open shift found (404)")
        else:
            pytest.fail(f"Unexpected status code: {response.status_code}")


class TestReportsAPI:
    """Test reports API endpoints"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Login and get auth token"""
        login_response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": "demo@maestroegp.com", "password": "demo123"}
        )
        assert login_response.status_code == 200
        self.token = login_response.json()["token"]
        self.headers = {"Authorization": f"Bearer {self.token}"}
    
    def test_sales_report_with_branch_id(self):
        """Test sales report API with branch_id parameter"""
        branch_id = "b45125b7-b7d3-48c6-9386-a95fcf773132"
        
        response = requests.get(
            f"{BASE_URL}/api/reports/sales",
            params={
                "branch_id": branch_id,
                "start_date": "2026-01-01",
                "end_date": "2026-12-31"
            },
            headers=self.headers
        )
        
        assert response.status_code == 200, f"Sales report failed: {response.text}"
        data = response.json()
        
        # Verify response structure
        assert "total_sales" in data, "total_sales missing"
        assert "total_orders" in data, "total_orders missing"
        assert "total_profit" in data, "total_profit missing"
        
        print(f"✅ Sales report: total_sales={data['total_sales']}, total_orders={data['total_orders']}")
    
    def test_profit_loss_report(self):
        """Test profit/loss report API"""
        response = requests.get(
            f"{BASE_URL}/api/reports/profit-loss",
            params={
                "start_date": "2026-01-01",
                "end_date": "2026-12-31"
            },
            headers=self.headers
        )
        
        assert response.status_code == 200, f"Profit/loss report failed: {response.text}"
        data = response.json()
        
        # Verify response structure for comprehensive report
        assert "revenue" in data or "gross_profit" in data, "Revenue/gross_profit missing"
        
        print(f"✅ Profit/loss report loaded successfully")
    
    def test_products_report(self):
        """Test products report API"""
        response = requests.get(
            f"{BASE_URL}/api/reports/products",
            params={
                "start_date": "2026-01-01",
                "end_date": "2026-12-31"
            },
            headers=self.headers
        )
        
        assert response.status_code == 200, f"Products report failed: {response.text}"
        data = response.json()
        
        # Verify response structure
        assert "products" in data, "products field missing"
        
        print(f"✅ Products report: {len(data.get('products', []))} products")
    
    def test_delivery_credits_report(self):
        """Test delivery credits report API"""
        response = requests.get(
            f"{BASE_URL}/api/reports/delivery-credits",
            params={
                "start_date": "2026-01-01",
                "end_date": "2026-12-31"
            },
            headers=self.headers
        )
        
        assert response.status_code == 200, f"Delivery credits report failed: {response.text}"
        data = response.json()
        
        print(f"✅ Delivery credits report loaded successfully")
    
    def test_cancellations_report(self):
        """Test cancellations report API"""
        response = requests.get(
            f"{BASE_URL}/api/reports/cancellations",
            params={
                "start_date": "2026-01-01",
                "end_date": "2026-12-31"
            },
            headers=self.headers
        )
        
        assert response.status_code == 200, f"Cancellations report failed: {response.text}"
        
        print(f"✅ Cancellations report loaded successfully")
    
    def test_discounts_report(self):
        """Test discounts report API"""
        response = requests.get(
            f"{BASE_URL}/api/reports/discounts",
            params={
                "start_date": "2026-01-01",
                "end_date": "2026-12-31"
            },
            headers=self.headers
        )
        
        assert response.status_code == 200, f"Discounts report failed: {response.text}"
        
        print(f"✅ Discounts report loaded successfully")
    
    def test_credit_report(self):
        """Test credit report API"""
        response = requests.get(
            f"{BASE_URL}/api/reports/credit",
            params={
                "start_date": "2026-01-01",
                "end_date": "2026-12-31"
            },
            headers=self.headers
        )
        
        assert response.status_code == 200, f"Credit report failed: {response.text}"
        
        print(f"✅ Credit report loaded successfully")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
