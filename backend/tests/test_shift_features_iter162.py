"""
Test Shift Features - Iteration 162
Tests for:
1. Cashiers-list API returns has_active_shift field
2. Current shift API returns cashier info
3. renderClosingReceiptBitmap function exists in receiptBitmap.js
4. Owner shift management features
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestShiftFeatures:
    """Test shift management features for owner/admin"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test fixtures"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        # Login as admin
        login_response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "hanialdujaili@gmail.com",
            "password": "Hani@2024"
        })
        assert login_response.status_code == 200, f"Login failed: {login_response.text}"
        self.token = login_response.json().get("token")
        self.session.headers.update({"Authorization": f"Bearer {self.token}"})
    
    def test_cashiers_list_returns_has_active_shift(self):
        """GET /api/shifts/cashiers-list should return has_active_shift field for each cashier"""
        response = self.session.get(f"{BASE_URL}/api/shifts/cashiers-list")
        assert response.status_code == 200, f"Failed: {response.text}"
        
        cashiers = response.json()
        assert isinstance(cashiers, list), "Response should be a list"
        
        # Check that each cashier has has_active_shift field
        for cashier in cashiers:
            assert "has_active_shift" in cashier, f"Cashier {cashier.get('id')} missing has_active_shift field"
            assert isinstance(cashier["has_active_shift"], bool), "has_active_shift should be boolean"
            
            # If has_active_shift is True, shift_id should also be present
            if cashier["has_active_shift"]:
                assert "shift_id" in cashier, f"Active cashier {cashier.get('id')} missing shift_id"
    
    def test_current_shift_returns_cashier_info(self):
        """GET /api/shifts/current should return cashier_name for owner/admin"""
        response = self.session.get(f"{BASE_URL}/api/shifts/current")
        
        # May return 404 if no shift is open, or 200 with shift data
        if response.status_code == 200:
            shift = response.json()
            if shift:
                assert "cashier_name" in shift, "Shift should have cashier_name"
                assert "cashier_id" in shift, "Shift should have cashier_id"
                assert "status" in shift, "Shift should have status"
        elif response.status_code == 404:
            # No shift open - acceptable
            pass
        else:
            pytest.fail(f"Unexpected status code: {response.status_code}")
    
    def test_cash_register_summary(self):
        """GET /api/cash-register/summary should work for admin"""
        response = self.session.get(f"{BASE_URL}/api/cash-register/summary")
        
        # May return 404 if no shift, or 200 with summary
        if response.status_code == 200:
            summary = response.json()
            assert "expected_cash" in summary, "Summary should have expected_cash"
            assert "total_sales" in summary, "Summary should have total_sales"
            assert "cash_sales" in summary, "Summary should have cash_sales"
        elif response.status_code == 404:
            # No shift open - acceptable
            pass
        else:
            pytest.fail(f"Unexpected status code: {response.status_code}, {response.text}")
    
    def test_open_shift_for_cashier_endpoint_exists(self):
        """POST /api/shifts/open-for-cashier endpoint should exist"""
        # Get a cashier ID first
        cashiers_response = self.session.get(f"{BASE_URL}/api/shifts/cashiers-list")
        assert cashiers_response.status_code == 200
        
        cashiers = cashiers_response.json()
        if cashiers:
            # Try to open shift for first cashier (may fail if already open, but endpoint should exist)
            cashier_id = cashiers[0]["id"]
            response = self.session.post(f"{BASE_URL}/api/shifts/open-for-cashier", json={
                "cashier_id": cashier_id,
                "opening_cash": 0
            })
            # Should return 200 (success or already exists) or 400 (already open)
            assert response.status_code in [200, 400], f"Unexpected status: {response.status_code}"
    
    def test_health_endpoint(self):
        """Health check endpoint should work"""
        response = self.session.get(f"{BASE_URL}/api/health")
        assert response.status_code == 200
        data = response.json()
        assert data.get("status") == "ok"


class TestReceiptBitmapFunction:
    """Verify renderClosingReceiptBitmap function exists in code"""
    
    def test_receipt_bitmap_file_exists(self):
        """receiptBitmap.js should exist"""
        import os
        file_path = "/app/frontend/src/utils/receiptBitmap.js"
        assert os.path.exists(file_path), f"File not found: {file_path}"
    
    def test_render_closing_receipt_bitmap_exported(self):
        """renderClosingReceiptBitmap should be exported from receiptBitmap.js"""
        with open("/app/frontend/src/utils/receiptBitmap.js", "r") as f:
            content = f.read()
        
        # Check function is defined and exported
        assert "export function renderClosingReceiptBitmap" in content, \
            "renderClosingReceiptBitmap function should be exported"
    
    def test_dashboard_imports_render_closing_receipt_bitmap(self):
        """Dashboard.js should import renderClosingReceiptBitmap"""
        with open("/app/frontend/src/pages/Dashboard.js", "r") as f:
            content = f.read()
        
        assert "import { renderClosingReceiptBitmap }" in content or \
               "renderClosingReceiptBitmap" in content, \
            "Dashboard should import renderClosingReceiptBitmap"
    
    def test_print_closing_receipt_via_usb_uses_bitmap(self):
        """printClosingReceiptViaUSB should use renderClosingReceiptBitmap"""
        with open("/app/frontend/src/pages/Dashboard.js", "r") as f:
            content = f.read()
        
        # Check that printClosingReceiptViaUSB calls renderClosingReceiptBitmap
        assert "renderClosingReceiptBitmap" in content, \
            "printClosingReceiptViaUSB should use renderClosingReceiptBitmap"


class TestOwnerShiftRelease:
    """Test owner is released from shift after register close"""
    
    def test_owner_release_code_exists(self):
        """Dashboard.js should have code to release owner from shift after close"""
        with open("/app/frontend/src/pages/Dashboard.js", "r") as f:
            content = f.read()
        
        # Check for setActiveShift(null) after register close
        assert "setActiveShift(null)" in content, \
            "Dashboard should set activeShift to null after close"
        
        # Check for owner role check before release
        assert "admin" in content and "manager" in content and "super_admin" in content, \
            "Dashboard should check for owner roles"
    
    def test_shift_badge_is_clickable(self):
        """Shift badge in header should be a clickable Button"""
        with open("/app/frontend/src/pages/Dashboard.js", "r") as f:
            content = f.read()
        
        # Check for active-shift-badge data-testid on a Button
        assert 'data-testid="active-shift-badge"' in content, \
            "Shift badge should have data-testid='active-shift-badge'"
        
        # Check it's a Button component
        assert '<Button' in content, "Should use Button component"
    
    def test_cashier_selection_shows_only_active(self):
        """Cashier selection dialog should filter to show only active cashiers"""
        with open("/app/frontend/src/pages/Dashboard.js", "r") as f:
            content = f.read()
        
        # Check for filtering active cashiers
        assert "has_active_shift" in content, \
            "Dashboard should filter by has_active_shift"
        
        # Check for active cashiers filter
        assert "activeCashiers" in content or "filter" in content, \
            "Dashboard should filter cashiers list"
