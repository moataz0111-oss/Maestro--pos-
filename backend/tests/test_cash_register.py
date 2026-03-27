"""
Cash Register API Tests - Testing the cash register close bug fix
Bug: KeyError on line 557 - shift['opening_cash'] changed to shift.get('opening_cash', shift.get('opening_balance', 0))
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
ADMIN_EMAIL = "hanialdujaili@gmail.com"
ADMIN_PASSWORD = "Hani@2024"


class TestCashRegister:
    """Cash Register endpoint tests - verifying bug fix for close dialog error"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test session with auth"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        # Login as admin
        response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        assert response.status_code == 200, f"Login failed: {response.text}"
        data = response.json()
        self.token = data["token"]
        self.user = data["user"]
        self.session.headers.update({"Authorization": f"Bearer {self.token}"})
    
    def test_01_get_cash_register_summary(self):
        """GET /api/cash-register/summary - should return shift data or create new shift"""
        response = self.session.get(f"{BASE_URL}/api/cash-register/summary")
        
        assert response.status_code == 200, f"Summary failed: {response.text}"
        data = response.json()
        
        # Verify response structure
        assert "shift_id" in data, "Missing shift_id in response"
        assert "branch_id" in data, "Missing branch_id in response"
        assert "cashier_id" in data, "Missing cashier_id in response"
        assert "opening_cash" in data, "Missing opening_cash in response"
        assert "expected_cash" in data, "Missing expected_cash in response"
        assert "total_sales" in data, "Missing total_sales in response"
        
        # Store shift_id for later tests
        self.shift_id = data["shift_id"]
        print(f"✓ Cash register summary returned shift_id: {self.shift_id}")
    
    def test_02_close_cash_register_with_denominations(self):
        """POST /api/cash-register/close - should close shift with denominations (BUG FIX TEST)"""
        # First get summary to ensure we have an open shift
        summary_response = self.session.get(f"{BASE_URL}/api/cash-register/summary")
        assert summary_response.status_code == 200
        
        # Close the cash register with denominations
        close_data = {
            "denominations": {
                "1000": 5,
                "5000": 2,
                "10000": 1
            },
            "notes": "Test close from pytest"
        }
        
        response = self.session.post(f"{BASE_URL}/api/cash-register/close", json=close_data)
        
        assert response.status_code == 200, f"Close failed: {response.text}"
        data = response.json()
        
        # Verify response structure - this is where the bug was (KeyError on opening_cash)
        assert "id" in data, "Missing id in response"
        assert "status" in data, "Missing status in response"
        assert data["status"] == "closed", f"Expected status 'closed', got '{data['status']}'"
        assert "closing_cash" in data, "Missing closing_cash in response"
        assert "expected_cash" in data, "Missing expected_cash in response"
        assert "cash_difference" in data, "Missing cash_difference in response"
        assert "denominations" in data, "Missing denominations in response"
        
        # Verify closing_cash calculation: 5*1000 + 2*5000 + 1*10000 = 25000
        expected_closing = 5*1000 + 2*5000 + 1*10000
        assert data["closing_cash"] == expected_closing, f"Expected closing_cash {expected_closing}, got {data['closing_cash']}"
        
        print(f"✓ Cash register closed successfully with closing_cash: {data['closing_cash']}")
        print(f"✓ Cash difference: {data['cash_difference']}")
    
    def test_03_close_when_no_open_shift_returns_404(self):
        """POST /api/cash-register/close - should return 404 when no open shift exists"""
        # Try to close again (shift was closed in previous test)
        close_data = {
            "denominations": {"1000": 1},
            "notes": "Should fail"
        }
        
        response = self.session.post(f"{BASE_URL}/api/cash-register/close", json=close_data)
        
        assert response.status_code == 404, f"Expected 404, got {response.status_code}: {response.text}"
        data = response.json()
        assert "detail" in data, "Missing error detail"
        print(f"✓ Correctly returned 404 with message: {data['detail']}")
    
    def test_04_summary_creates_new_shift_after_close(self):
        """GET /api/cash-register/summary - should create new shift after previous was closed"""
        response = self.session.get(f"{BASE_URL}/api/cash-register/summary")
        
        assert response.status_code == 200, f"Summary failed: {response.text}"
        data = response.json()
        
        # Verify a new shift was created
        assert "shift_id" in data, "Missing shift_id in response"
        assert "opening_cash" in data, "Missing opening_cash in response"
        
        print(f"✓ New shift created with id: {data['shift_id']}")
    
    def test_05_close_with_empty_denominations(self):
        """POST /api/cash-register/close - should work with empty denominations"""
        # First ensure we have an open shift
        self.session.get(f"{BASE_URL}/api/cash-register/summary")
        
        close_data = {
            "denominations": {},
            "notes": "Empty denominations test"
        }
        
        response = self.session.post(f"{BASE_URL}/api/cash-register/close", json=close_data)
        
        assert response.status_code == 200, f"Close failed: {response.text}"
        data = response.json()
        
        assert data["closing_cash"] == 0, f"Expected closing_cash 0 for empty denominations, got {data['closing_cash']}"
        print(f"✓ Cash register closed with empty denominations, closing_cash: {data['closing_cash']}")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
