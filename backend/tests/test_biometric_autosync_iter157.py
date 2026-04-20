"""
Test biometric auto-sync endpoints and receipt formatting changes
Iteration 157 - Testing:
1. GET /api/biometric/auto-sync returns {enabled: bool}
2. POST /api/biometric/auto-sync with {enabled: true} saves to database
3. GET /api/biometric/auto-sync returns enabled:true after toggle
4. POST /api/biometric/auto-sync with {enabled: false} disables
5. Verify receiptBitmap.js delivery_company rendering (code review)
6. Verify receiptBitmap.js dashed lines use lineWidth=2 (code review)
"""

import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')
if not BASE_URL:
    BASE_URL = "https://pos-stability-fix-1.preview.emergentagent.com"

# Test credentials from test_credentials.md
ADMIN_EMAIL = "hanialdujaili@gmail.com"
ADMIN_PASSWORD = "Hani@2024"


class TestBiometricAutoSync:
    """Test biometric auto-sync endpoints"""
    
    token = None
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Login and get token before tests"""
        if TestBiometricAutoSync.token is None:
            response = requests.post(f"{BASE_URL}/api/auth/login", json={
                "email": ADMIN_EMAIL,
                "password": ADMIN_PASSWORD
            })
            assert response.status_code == 200, f"Login failed: {response.text}"
            data = response.json()
            TestBiometricAutoSync.token = data.get("token") or data.get("access_token")
            assert TestBiometricAutoSync.token, "No token in login response"
    
    def get_headers(self):
        return {"Authorization": f"Bearer {TestBiometricAutoSync.token}"}
    
    def test_01_get_auto_sync_status_initial(self):
        """Test GET /api/biometric/auto-sync returns enabled status"""
        response = requests.get(
            f"{BASE_URL}/api/biometric/auto-sync",
            headers=self.get_headers()
        )
        assert response.status_code == 200, f"GET auto-sync failed: {response.text}"
        data = response.json()
        # Should have 'enabled' field (bool)
        assert "enabled" in data, f"Response missing 'enabled' field: {data}"
        assert isinstance(data["enabled"], bool), f"'enabled' should be bool: {data}"
        print(f"✅ GET /api/biometric/auto-sync returned: {data}")
    
    def test_02_enable_auto_sync(self):
        """Test POST /api/biometric/auto-sync with enabled=true"""
        response = requests.post(
            f"{BASE_URL}/api/biometric/auto-sync",
            headers=self.get_headers(),
            json={"enabled": True}
        )
        assert response.status_code == 200, f"POST auto-sync failed: {response.text}"
        data = response.json()
        assert data.get("success") == True, f"Expected success=true: {data}"
        assert data.get("enabled") == True, f"Expected enabled=true: {data}"
        print(f"✅ POST /api/biometric/auto-sync enabled=true: {data}")
    
    def test_03_verify_auto_sync_enabled(self):
        """Test GET /api/biometric/auto-sync returns enabled=true after toggle"""
        response = requests.get(
            f"{BASE_URL}/api/biometric/auto-sync",
            headers=self.get_headers()
        )
        assert response.status_code == 200, f"GET auto-sync failed: {response.text}"
        data = response.json()
        assert data.get("enabled") == True, f"Expected enabled=true after toggle: {data}"
        # Should also have enabled_at and enabled_by
        assert "enabled_at" in data, f"Missing enabled_at: {data}"
        print(f"✅ GET /api/biometric/auto-sync after enable: {data}")
    
    def test_04_disable_auto_sync(self):
        """Test POST /api/biometric/auto-sync with enabled=false"""
        response = requests.post(
            f"{BASE_URL}/api/biometric/auto-sync",
            headers=self.get_headers(),
            json={"enabled": False}
        )
        assert response.status_code == 200, f"POST auto-sync failed: {response.text}"
        data = response.json()
        assert data.get("success") == True, f"Expected success=true: {data}"
        assert data.get("enabled") == False, f"Expected enabled=false: {data}"
        print(f"✅ POST /api/biometric/auto-sync enabled=false: {data}")
    
    def test_05_verify_auto_sync_disabled(self):
        """Test GET /api/biometric/auto-sync returns enabled=false after disable"""
        response = requests.get(
            f"{BASE_URL}/api/biometric/auto-sync",
            headers=self.get_headers()
        )
        assert response.status_code == 200, f"GET auto-sync failed: {response.text}"
        data = response.json()
        assert data.get("enabled") == False, f"Expected enabled=false after disable: {data}"
        print(f"✅ GET /api/biometric/auto-sync after disable: {data}")


class TestReceiptBitmapCodeReview:
    """Code review tests for receiptBitmap.js changes"""
    
    def test_06_delivery_company_no_label(self):
        """Verify delivery_company shows name only without 'شركة التوصيل:' label"""
        with open("/app/frontend/src/utils/receiptBitmap.js", "r") as f:
            content = f.read()
        
        # Check that delivery_company is rendered without the label
        # Line 217-219 should show: drawC(x, order.delivery_company, y, 22, true)
        # NOT: drawC(x, `شركة التوصيل: ${order.delivery_company}`, ...)
        
        # Find the delivery_company rendering section
        assert "if (order.delivery_company)" in content, "Missing delivery_company check"
        
        # Verify it does NOT have the label
        assert "شركة التوصيل:" not in content, "Found 'شركة التوصيل:' label - should be removed"
        
        # Verify it uses drawC for centered text
        assert "drawC(x, order.delivery_company" in content, "delivery_company should use drawC for centered text"
        
        print("✅ receiptBitmap.js: delivery_company shows name only (no label), centered")
    
    def test_07_dashed_lines_linewidth_2(self):
        """Verify dashed lines use lineWidth=2 (not 1)"""
        with open("/app/frontend/src/utils/receiptBitmap.js", "r") as f:
            content = f.read()
        
        # Check the dash function (line 78-82)
        # Should have: ctx.lineWidth=2
        assert "function dash(ctx, y)" in content, "Missing dash function"
        
        # Find the dash function and verify lineWidth=2
        dash_func_start = content.find("function dash(ctx, y)")
        dash_func_end = content.find("return 12;", dash_func_start) + 15
        dash_func = content[dash_func_start:dash_func_end]
        
        assert "lineWidth=2" in dash_func, f"dash function should have lineWidth=2: {dash_func}"
        assert "lineWidth=1" not in dash_func, f"dash function should NOT have lineWidth=1: {dash_func}"
        
        print("✅ receiptBitmap.js: dash function uses lineWidth=2")
    
    def test_08_dbl_function_linewidth_2(self):
        """Verify double line function uses lineWidth=2"""
        with open("/app/frontend/src/utils/receiptBitmap.js", "r") as f:
            content = f.read()
        
        # Check the dbl function (line 85-90)
        assert "function dbl(ctx, y)" in content, "Missing dbl function"
        
        dbl_func_start = content.find("function dbl(ctx, y)")
        dbl_func_end = content.find("return 14;", dbl_func_start) + 15
        dbl_func = content[dbl_func_start:dbl_func_end]
        
        assert "lineWidth=2" in dbl_func, f"dbl function should have lineWidth=2: {dbl_func}"
        
        print("✅ receiptBitmap.js: dbl function uses lineWidth=2")


class TestAutoSyncHookCodeReview:
    """Code review tests for useAutoSync hook and App.js integration"""
    
    def test_09_app_imports_autosync(self):
        """Verify App.js imports useAutoSync hook"""
        with open("/app/frontend/src/App.js", "r") as f:
            content = f.read()
        
        assert "import { useAutoSync }" in content, "App.js should import useAutoSync"
        assert "from './hooks/useAutoSync'" in content or 'from "./hooks/useAutoSync"' in content, \
            "useAutoSync should be imported from hooks/useAutoSync"
        
        print("✅ App.js imports useAutoSync hook")
    
    def test_10_app_uses_autosync_runner(self):
        """Verify App.js uses AutoSyncRunner component"""
        with open("/app/frontend/src/App.js", "r") as f:
            content = f.read()
        
        # Check AutoSyncRunner component definition
        assert "function AutoSyncRunner()" in content, "Missing AutoSyncRunner component"
        assert "useAutoSync()" in content, "AutoSyncRunner should call useAutoSync()"
        
        # Check it's used in the App component
        assert "<AutoSyncRunner" in content, "AutoSyncRunner should be used in App"
        
        print("✅ App.js uses AutoSyncRunner component")
    
    def test_11_useautosync_checks_backend(self):
        """Verify useAutoSync hook checks backend auto-sync status"""
        with open("/app/frontend/src/hooks/useAutoSync.js", "r") as f:
            content = f.read()
        
        # Check it calls the backend endpoint
        assert "/biometric/auto-sync" in content, "useAutoSync should call /biometric/auto-sync endpoint"
        
        # Check it checks enabled status
        assert "statusRes.data?.enabled" in content or "statusRes.data.enabled" in content, \
            "useAutoSync should check enabled status from response"
        
        print("✅ useAutoSync hook checks backend auto-sync status")
    
    def test_12_biometric_devices_loads_from_backend(self):
        """Verify BiometricDevices.js loads auto-sync state from backend on mount"""
        with open("/app/frontend/src/components/BiometricDevices.js", "r") as f:
            content = f.read()
        
        # Check it loads state from backend on mount
        assert "/biometric/auto-sync" in content, "BiometricDevices should call /biometric/auto-sync"
        
        # Check it has useEffect to load on mount
        assert "useEffect" in content, "BiometricDevices should use useEffect"
        
        # Check it saves to backend when toggling
        assert "axios.post" in content and "auto-sync" in content, \
            "BiometricDevices should POST to auto-sync endpoint"
        
        print("✅ BiometricDevices.js loads/saves auto-sync state from backend")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
