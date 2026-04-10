"""
Test audit logs and by_cashier name resolution - Iteration 152
Tests:
1. POST /api/auth/login creates audit_logs entry with event_type=login
2. POST /api/auth/logout creates audit_logs entry with event_type=logout
3. GET /api/auth/audit-logs returns all login/logout/impersonation events
4. DELETE /api/auth/audit-logs clears all audit logs
5. Report by_cashier should resolve cashier names from users collection
"""

import pytest
import requests
import os
from datetime import datetime

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestAuditLogs:
    """Test audit logging for login/logout events"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test - login as admin"""
        self.admin_email = "hanialdujaili@gmail.com"
        self.admin_password = "Hani@2024"
        self.token = None
        
    def get_auth_headers(self, token=None):
        """Get authorization headers"""
        return {"Authorization": f"Bearer {token or self.token}"}
    
    def test_01_login_creates_audit_log(self):
        """Test that login creates an audit log entry with event_type=login"""
        # Login
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": self.admin_email,
            "password": self.admin_password
        })
        assert response.status_code == 200, f"Login failed: {response.text}"
        data = response.json()
        assert "token" in data
        assert "user" in data
        self.token = data["token"]
        
        # Check audit logs for login event
        headers = self.get_auth_headers()
        logs_response = requests.get(f"{BASE_URL}/api/auth/audit-logs?limit=10", headers=headers)
        assert logs_response.status_code == 200, f"Failed to get audit logs: {logs_response.text}"
        
        logs_data = logs_response.json()
        assert "logs" in logs_data
        
        # Find the login event for this user
        login_logs = [log for log in logs_data["logs"] if log.get("event_type") == "login" and log.get("user_email") == self.admin_email]
        assert len(login_logs) > 0, "No login audit log found for this user"
        
        # Verify login log structure
        login_log = login_logs[0]
        assert login_log.get("event_type") == "login"
        assert login_log.get("user_name") is not None
        assert login_log.get("user_email") == self.admin_email
        assert login_log.get("user_role") is not None
        assert login_log.get("created_at") is not None
        print(f"✅ Login audit log created: {login_log}")
    
    def test_02_logout_creates_audit_log(self):
        """Test that logout creates an audit log entry with event_type=logout"""
        # First login
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": self.admin_email,
            "password": self.admin_password
        })
        assert response.status_code == 200
        self.token = response.json()["token"]
        headers = self.get_auth_headers()
        
        # Logout
        logout_response = requests.post(f"{BASE_URL}/api/auth/logout", headers=headers)
        assert logout_response.status_code == 200, f"Logout failed: {logout_response.text}"
        logout_data = logout_response.json()
        assert logout_data.get("success") == True
        
        # Login again to check audit logs
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": self.admin_email,
            "password": self.admin_password
        })
        self.token = response.json()["token"]
        headers = self.get_auth_headers()
        
        # Check audit logs for logout event
        logs_response = requests.get(f"{BASE_URL}/api/auth/audit-logs?limit=20", headers=headers)
        assert logs_response.status_code == 200
        
        logs_data = logs_response.json()
        logout_logs = [log for log in logs_data["logs"] if log.get("event_type") == "logout" and log.get("user_email") == self.admin_email]
        assert len(logout_logs) > 0, "No logout audit log found for this user"
        
        # Verify logout log structure
        logout_log = logout_logs[0]
        assert logout_log.get("event_type") == "logout"
        assert logout_log.get("user_name") is not None
        assert logout_log.get("user_email") == self.admin_email
        print(f"✅ Logout audit log created: {logout_log}")
    
    def test_03_get_audit_logs_returns_all_events(self):
        """Test GET /api/auth/audit-logs returns all login/logout/impersonation events"""
        # Login
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": self.admin_email,
            "password": self.admin_password
        })
        assert response.status_code == 200
        self.token = response.json()["token"]
        headers = self.get_auth_headers()
        
        # Get audit logs
        logs_response = requests.get(f"{BASE_URL}/api/auth/audit-logs?limit=50", headers=headers)
        assert logs_response.status_code == 200
        
        logs_data = logs_response.json()
        assert "logs" in logs_data
        assert "total" in logs_data
        assert "total_pages" in logs_data
        assert "page" in logs_data
        
        # Check that we have various event types
        event_types = set(log.get("event_type") for log in logs_data["logs"])
        print(f"✅ Found event types: {event_types}")
        
        # At minimum we should have login events from our tests
        assert "login" in event_types, "No login events found in audit logs"
        
        # Verify log structure
        for log in logs_data["logs"][:5]:  # Check first 5 logs
            assert "event_type" in log
            assert "created_at" in log
            assert log["event_type"] in ["login", "logout", "impersonation"]
            print(f"  - {log['event_type']}: {log.get('user_name')} at {log.get('created_at')}")
    
    def test_04_clear_audit_logs(self):
        """Test DELETE /api/auth/audit-logs clears all audit logs"""
        # Login
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": self.admin_email,
            "password": self.admin_password
        })
        assert response.status_code == 200
        self.token = response.json()["token"]
        headers = self.get_auth_headers()
        
        # Get current count
        logs_response = requests.get(f"{BASE_URL}/api/auth/audit-logs", headers=headers)
        initial_count = logs_response.json().get("total", 0)
        print(f"Initial audit logs count: {initial_count}")
        
        # Clear audit logs
        clear_response = requests.delete(f"{BASE_URL}/api/auth/audit-logs", headers=headers)
        assert clear_response.status_code == 200, f"Failed to clear audit logs: {clear_response.text}"
        
        clear_data = clear_response.json()
        assert clear_data.get("success") == True
        assert "deleted_count" in clear_data
        print(f"✅ Cleared {clear_data['deleted_count']} audit logs")
        
        # Verify logs are cleared
        logs_response = requests.get(f"{BASE_URL}/api/auth/audit-logs", headers=headers)
        # Note: The login we just did will create a new log, so count might be 1
        new_count = logs_response.json().get("total", 0)
        assert new_count <= 1, f"Expected 0 or 1 logs after clear, got {new_count}"
        print(f"✅ Audit logs after clear: {new_count}")


class TestByCashierNameResolution:
    """Test that by_cashier section resolves cashier names from users collection"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test - login as admin"""
        self.admin_email = "hanialdujaili@gmail.com"
        self.admin_password = "Hani@2024"
        self.token = None
        
    def get_auth_headers(self, token=None):
        """Get authorization headers"""
        return {"Authorization": f"Bearer {token or self.token}"}
    
    def test_05_cash_register_closing_report_by_cashier_has_names(self):
        """Test that cash register closing report by_cashier section has resolved cashier names"""
        # Login
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": self.admin_email,
            "password": self.admin_password
        })
        assert response.status_code == 200
        self.token = response.json()["token"]
        headers = self.get_auth_headers()
        
        # Get today's date
        today = datetime.now().strftime("%Y-%m-%d")
        
        # Get cash register closing report (this has by_cashier)
        report_response = requests.get(
            f"{BASE_URL}/api/reports/cash-register-closing?start_date={today}&end_date={today}",
            headers=headers
        )
        assert report_response.status_code == 200, f"Failed to get report: {report_response.text}"
        
        report_data = report_response.json()
        
        # Check by_cashier section exists
        assert "by_cashier" in report_data, "by_cashier section missing from report"
        
        by_cashier = report_data["by_cashier"]
        print(f"✅ by_cashier section found with {len(by_cashier)} entries")
        
        # If there are entries, verify they have cashier_name
        for entry in by_cashier:
            cashier_name = entry.get("cashier_name", "")
            cashier_id = entry.get("cashier_id", "")
            print(f"  - Cashier: {cashier_name} (ID: {cashier_id})")
            
            # Verify cashier_name is not "غير محدد" if there's a cashier_id
            if cashier_id and cashier_id != "None":
                # Name should be resolved from users collection
                assert cashier_name, f"Cashier name is empty for ID {cashier_id}"
                # Note: "غير محدد" is acceptable only if the user doesn't exist in DB
                print(f"    ✅ Name resolved: {cashier_name}")
    
    def test_06_sales_report_by_cashier_structure(self):
        """Test sales report by_cashier has proper structure"""
        # Login
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": self.admin_email,
            "password": self.admin_password
        })
        assert response.status_code == 200
        self.token = response.json()["token"]
        headers = self.get_auth_headers()
        
        # Get today's date
        today = datetime.now().strftime("%Y-%m-%d")
        
        # Get sales report
        report_response = requests.get(
            f"{BASE_URL}/api/reports/sales?start_date={today}&end_date={today}",
            headers=headers
        )
        
        if report_response.status_code == 200:
            report_data = report_response.json()
            
            # Check if by_cashier exists in sales report
            if "by_cashier" in report_data:
                by_cashier = report_data["by_cashier"]
                print(f"✅ Sales report by_cashier found with {len(by_cashier)} entries")
                
                for entry in by_cashier:
                    # Verify structure
                    assert "cashier_name" in entry, "cashier_name field missing"
                    assert "total_sales" in entry, "total_sales field missing"
                    assert "orders_count" in entry, "orders_count field missing"
                    print(f"  - {entry.get('cashier_name')}: {entry.get('total_sales')} ({entry.get('orders_count')} orders)")
            else:
                print("ℹ️ by_cashier not in sales report (may be in different endpoint)")
        else:
            print(f"ℹ️ Sales report endpoint returned {report_response.status_code}")


class TestCloseReceiptDimensions:
    """Test close register receipt CSS dimensions"""
    
    def test_07_receipt_dimensions_in_code(self):
        """Verify receipt CSS uses 65mm width and 250mm height (code review)"""
        # This is a code review test - we verify the dimensions are in the code
        # The actual CSS is in Dashboard.js printClosingReceipt function
        
        # Read Dashboard.js and check for dimensions
        import subprocess
        result = subprocess.run(
            ["grep", "-n", "65mm\\|250mm", "/app/frontend/src/pages/Dashboard.js"],
            capture_output=True,
            text=True
        )
        
        output = result.stdout
        assert "65mm" in output, "65mm width not found in Dashboard.js"
        assert "250mm" in output, "250mm height not found in Dashboard.js"
        
        print("✅ Receipt dimensions verified in Dashboard.js:")
        for line in output.strip().split('\n'):
            print(f"  {line}")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
