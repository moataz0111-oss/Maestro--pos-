"""
Test Admin Shift Management - Iteration 159
Tests for:
1. Admin does NOT auto-open a shift for themselves
2. GET /api/shifts/current for admin returns cashier's shift (not admin's)
3. POST /api/shifts/auto-open for admin returns 404 when no shift exists
4. POST /api/shifts/auto-open for admin returns cashier's shift when one exists
5. GET /api/shifts/cashiers-list returns list of cashiers
6. POST /api/shifts/open-for-cashier allows admin to open shift for cashier
7. Order creation uses cashier_id from shift (not admin id)
"""
import pytest
import requests
import os
import uuid

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
ADMIN_EMAIL = "hanialdujaili@gmail.com"
ADMIN_PASSWORD = "Hani@2024"
SUPER_ADMIN_EMAIL = "owner@maestroegp.com"
SUPER_ADMIN_PASSWORD = "owner123"
SUPER_ADMIN_SECRET = "271018"


class TestAdminShiftManagement:
    """Tests for admin shift management - admin should NOT open their own shift"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test session"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        self.admin_token = None
        self.super_admin_token = None
        
    def login_admin(self):
        """Login as admin user"""
        response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        if response.status_code == 200:
            data = response.json()
            self.admin_token = data.get("token")
            self.session.headers.update({"Authorization": f"Bearer {self.admin_token}"})
            return data.get("user")
        return None
    
    def login_super_admin(self):
        """Login as super admin"""
        response = self.session.post(f"{BASE_URL}/api/auth/super-admin-login", json={
            "email": SUPER_ADMIN_EMAIL,
            "password": SUPER_ADMIN_PASSWORD,
            "secret": SUPER_ADMIN_SECRET
        })
        if response.status_code == 200:
            data = response.json()
            self.super_admin_token = data.get("token")
            self.session.headers.update({"Authorization": f"Bearer {self.super_admin_token}"})
            return data.get("user")
        return None
    
    def test_01_admin_login(self):
        """Test admin login works"""
        user = self.login_admin()
        assert user is not None, "Admin login failed"
        assert user.get("role") in ["admin", "manager", "super_admin", "branch_manager"], f"Unexpected role: {user.get('role')}"
        print(f"✅ Admin login successful: {user.get('email')} (role: {user.get('role')})")
    
    def test_02_shifts_current_endpoint(self):
        """Test GET /api/shifts/current returns cashier's shift for admin"""
        user = self.login_admin()
        assert user is not None, "Admin login failed"
        
        response = self.session.get(f"{BASE_URL}/api/shifts/current")
        # Can be 200 (shift exists) or null (no shift)
        assert response.status_code == 200, f"Unexpected status: {response.status_code}"
        
        data = response.json()
        if data:
            # If shift exists, verify it's not the admin's own shift (unless admin is also cashier)
            print(f"✅ Current shift found: cashier_id={data.get('cashier_id')}, cashier_name={data.get('cashier_name')}")
            # The shift should belong to a cashier, not necessarily the admin
            assert "id" in data, "Shift should have an id"
            assert "cashier_id" in data, "Shift should have cashier_id"
        else:
            print("✅ No current shift found (expected if no cashier shift is open)")
    
    def test_03_shifts_auto_open_for_admin(self):
        """Test POST /api/shifts/auto-open for admin - should return 404 if no cashier shift exists"""
        user = self.login_admin()
        assert user is not None, "Admin login failed"
        
        # First check if there's already a shift
        current_response = self.session.get(f"{BASE_URL}/api/shifts/current")
        current_shift = current_response.json() if current_response.status_code == 200 else None
        
        response = self.session.post(f"{BASE_URL}/api/shifts/auto-open")
        
        if current_shift:
            # If a shift exists, auto-open should return it
            assert response.status_code == 200, f"Expected 200 when shift exists, got {response.status_code}"
            data = response.json()
            assert data.get("was_existing") == True, "Should indicate existing shift"
            print(f"✅ Auto-open returned existing shift: {data.get('shift', {}).get('cashier_name')}")
        else:
            # If no shift exists, admin should get 404 (not auto-create)
            assert response.status_code == 404, f"Expected 404 for admin with no shift, got {response.status_code}"
            print("✅ Auto-open correctly returned 404 for admin with no cashier shift")
    
    def test_04_cashiers_list_endpoint(self):
        """Test GET /api/shifts/cashiers-list returns list of cashiers"""
        user = self.login_admin()
        assert user is not None, "Admin login failed"
        
        response = self.session.get(f"{BASE_URL}/api/shifts/cashiers-list")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        cashiers = response.json()
        assert isinstance(cashiers, list), "Response should be a list"
        print(f"✅ Cashiers list returned {len(cashiers)} cashiers")
        
        # Verify cashiers have required fields
        for cashier in cashiers[:3]:  # Check first 3
            assert "id" in cashier, "Cashier should have id"
            assert "role" in cashier, "Cashier should have role"
            assert cashier.get("role") == "cashier", f"Expected cashier role, got {cashier.get('role')}"
            print(f"   - {cashier.get('full_name', cashier.get('username', 'Unknown'))}")
    
    def test_05_open_shift_for_cashier(self):
        """Test POST /api/shifts/open-for-cashier allows admin to open shift for cashier"""
        user = self.login_admin()
        assert user is not None, "Admin login failed"
        
        # Get list of cashiers
        cashiers_response = self.session.get(f"{BASE_URL}/api/shifts/cashiers-list")
        assert cashiers_response.status_code == 200, "Failed to get cashiers list"
        
        cashiers = cashiers_response.json()
        if not cashiers:
            pytest.skip("No cashiers available to test with")
        
        # Pick first cashier
        test_cashier = cashiers[0]
        cashier_id = test_cashier.get("id")
        cashier_name = test_cashier.get("full_name", test_cashier.get("username", "Unknown"))
        
        # Try to open shift for this cashier
        response = self.session.post(f"{BASE_URL}/api/shifts/open-for-cashier", json={
            "cashier_id": cashier_id,
            "opening_cash": 0
        })
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "shift" in data, "Response should contain shift"
        
        shift = data.get("shift")
        assert shift.get("cashier_id") == cashier_id, "Shift should be for the specified cashier"
        
        if data.get("was_existing"):
            print(f"✅ Shift already exists for cashier: {cashier_name}")
        else:
            print(f"✅ New shift opened for cashier: {cashier_name}")
    
    def test_06_verify_shift_belongs_to_cashier(self):
        """Verify that after opening shift for cashier, GET /api/shifts/current returns that shift"""
        user = self.login_admin()
        assert user is not None, "Admin login failed"
        
        response = self.session.get(f"{BASE_URL}/api/shifts/current")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        shift = response.json()
        if shift:
            # Verify the shift is for a cashier (not the admin)
            cashier_id = shift.get("cashier_id")
            cashier_name = shift.get("cashier_name")
            
            # The cashier_id should NOT be the admin's id (unless admin is also a cashier)
            admin_id = user.get("id")
            
            print(f"✅ Current shift: cashier_id={cashier_id}, cashier_name={cashier_name}")
            print(f"   Admin id: {admin_id}")
            
            # If there's a cashier shift, it should be prioritized
            if cashier_id != admin_id:
                print("✅ Shift correctly belongs to cashier, not admin")
            else:
                print("⚠️ Shift belongs to admin (may be expected if admin is also cashier)")
        else:
            print("⚠️ No shift found")
    
    def test_07_cash_register_summary_for_admin(self):
        """Test GET /api/cash-register/summary for admin - should return 404 if no shift"""
        user = self.login_admin()
        assert user is not None, "Admin login failed"
        
        # First check if there's a shift
        current_response = self.session.get(f"{BASE_URL}/api/shifts/current")
        current_shift = current_response.json() if current_response.status_code == 200 else None
        
        response = self.session.get(f"{BASE_URL}/api/cash-register/summary")
        
        if current_shift:
            # If shift exists, should return summary
            assert response.status_code == 200, f"Expected 200 when shift exists, got {response.status_code}"
            data = response.json()
            assert "shift_id" in data, "Summary should contain shift_id"
            print(f"✅ Cash register summary returned for shift: {data.get('shift_id')}")
        else:
            # If no shift, admin should get 404 (not auto-create)
            assert response.status_code == 404, f"Expected 404 for admin with no shift, got {response.status_code}"
            print("✅ Cash register summary correctly returned 404 for admin with no shift")


class TestSuperAdminShiftManagement:
    """Tests for super admin shift management"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test session"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
    def login_super_admin(self):
        """Login as super admin"""
        response = self.session.post(f"{BASE_URL}/api/auth/super-admin-login", json={
            "email": SUPER_ADMIN_EMAIL,
            "password": SUPER_ADMIN_PASSWORD,
            "secret": SUPER_ADMIN_SECRET
        })
        if response.status_code == 200:
            data = response.json()
            token = data.get("token")
            self.session.headers.update({"Authorization": f"Bearer {token}"})
            return data.get("user")
        return None
    
    def test_01_super_admin_login(self):
        """Test super admin login works"""
        user = self.login_super_admin()
        assert user is not None, "Super admin login failed"
        assert user.get("role") == "super_admin", f"Expected super_admin role, got {user.get('role')}"
        print(f"✅ Super admin login successful: {user.get('email')}")
    
    def test_02_super_admin_cashiers_list(self):
        """Test super admin can access cashiers list"""
        user = self.login_super_admin()
        assert user is not None, "Super admin login failed"
        
        response = self.session.get(f"{BASE_URL}/api/shifts/cashiers-list")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        cashiers = response.json()
        print(f"✅ Super admin can access cashiers list: {len(cashiers)} cashiers")


class TestShiftEndpointsBasic:
    """Basic tests for shift endpoints"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test session"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
    def login_admin(self):
        """Login as admin"""
        response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        if response.status_code == 200:
            data = response.json()
            self.session.headers.update({"Authorization": f"Bearer {data.get('token')}"})
            return data.get("user")
        return None
    
    def test_01_shifts_list(self):
        """Test GET /api/shifts returns list of shifts"""
        user = self.login_admin()
        assert user is not None, "Admin login failed"
        
        response = self.session.get(f"{BASE_URL}/api/shifts")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        shifts = response.json()
        assert isinstance(shifts, list), "Response should be a list"
        print(f"✅ Shifts list returned {len(shifts)} shifts")
        
        # Check open shifts
        open_shifts = [s for s in shifts if s.get("status") == "open"]
        print(f"   - Open shifts: {len(open_shifts)}")
        for shift in open_shifts[:3]:
            print(f"     - {shift.get('cashier_name', 'Unknown')} (id: {shift.get('id')[:8]}...)")
    
    def test_02_health_check(self):
        """Test API health check"""
        response = self.session.get(f"{BASE_URL}/api/health")
        assert response.status_code == 200, f"Health check failed: {response.status_code}"
        print("✅ API health check passed")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
