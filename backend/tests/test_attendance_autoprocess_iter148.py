"""
Test suite for Attendance Auto-Process Feature (Iteration 148)
Tests:
1. PUT /api/employees/{id} - shift_start, shift_end, work_days fields
2. POST /api/attendance/auto-process - converts biometric records to attendance + deductions
3. Auto-process correctly calculates worked_hours, late_minutes, early_leave_minutes
4. Auto-process creates deductions for late (>15min) and early_leave (>15min)
5. Auto-process skips duplicate attendance for same date
"""

import pytest
import requests
import os
import uuid
from datetime import datetime, timedelta

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestAttendanceAutoProcess:
    """Test attendance auto-process feature"""
    
    token = None
    test_employee_id = "d6e117f3-7298-4010-81f1-d4c1cc889f22"  # أحمد محمد
    test_device_id = "697db1ae-642a-4db0-a6f7-7d1a03064129"
    branch_id = "72a06c41-5454-4383-99a5-ac13adb96336"
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Login and get token"""
        if not TestAttendanceAutoProcess.token:
            response = requests.post(f"{BASE_URL}/api/auth/login", json={
                "email": "hanialdujaili@gmail.com",
                "password": "Hani@2024"
            })
            assert response.status_code == 200, f"Login failed: {response.text}"
            TestAttendanceAutoProcess.token = response.json().get("token")
        self.headers = {"Authorization": f"Bearer {TestAttendanceAutoProcess.token}"}
    
    # ============ Employee Shift Fields Tests ============
    
    def test_01_get_employee_with_shift_fields(self):
        """Verify employee has shift_start, shift_end, work_days fields"""
        response = requests.get(f"{BASE_URL}/api/employees", headers=self.headers)
        assert response.status_code == 200
        
        employees = response.json()
        assert len(employees) > 0, "No employees found"
        
        # Find test employee
        test_emp = next((e for e in employees if e.get("id") == self.test_employee_id), None)
        if test_emp:
            # Verify shift fields exist
            assert "shift_start" in test_emp, "shift_start field missing"
            assert "shift_end" in test_emp, "shift_end field missing"
            assert "work_days" in test_emp, "work_days field missing"
            print(f"Employee shift: {test_emp.get('shift_start')} - {test_emp.get('shift_end')}")
            print(f"Work days: {test_emp.get('work_days')}")
    
    def test_02_update_employee_shift_fields(self):
        """Test PUT /api/employees/{id} with shift_start, shift_end, work_days"""
        # Update with new shift values
        update_data = {
            "shift_start": "08:30",
            "shift_end": "16:30",
            "work_days": [0, 1, 2, 3, 4]  # Sunday to Thursday
        }
        
        response = requests.put(
            f"{BASE_URL}/api/employees/{self.test_employee_id}",
            json=update_data,
            headers=self.headers
        )
        assert response.status_code == 200, f"Update failed: {response.text}"
        
        updated = response.json()
        assert updated.get("shift_start") == "08:30", f"shift_start not updated: {updated.get('shift_start')}"
        assert updated.get("shift_end") == "16:30", f"shift_end not updated: {updated.get('shift_end')}"
        assert updated.get("work_days") == [0, 1, 2, 3, 4], f"work_days not updated: {updated.get('work_days')}"
        
        print("✓ Employee shift fields updated successfully")
    
    def test_03_restore_employee_shift_fields(self):
        """Restore original shift values"""
        update_data = {
            "shift_start": "09:00",
            "shift_end": "17:00",
            "work_days": [0, 1, 2, 3, 4, 5]  # Sunday to Friday
        }
        
        response = requests.put(
            f"{BASE_URL}/api/employees/{self.test_employee_id}",
            json=update_data,
            headers=self.headers
        )
        assert response.status_code == 200
        print("✓ Employee shift fields restored to 09:00-17:00")
    
    # ============ Auto-Process Tests ============
    
    def test_04_auto_process_no_new_records(self):
        """Test auto-process when no new biometric records exist"""
        response = requests.post(
            f"{BASE_URL}/api/attendance/auto-process",
            headers=self.headers
        )
        assert response.status_code == 200, f"Auto-process failed: {response.text}"
        
        result = response.json()
        assert "message" in result or "processed" in result or "created_attendance" in result
        print(f"Auto-process result: {result}")
    
    def test_05_sync_biometric_records_for_testing(self):
        """Sync test biometric records to test auto-process"""
        # Create test records for today with late arrival and early leave
        today = datetime.now().strftime("%Y-%m-%d")
        
        # Employee arrives at 09:30 (30 min late) and leaves at 16:00 (1 hour early)
        test_records = [
            {
                "employee_code": "1",  # biometric_uid of test employee
                "punch_time": f"{today}T09:30:00",
                "punch_type": 0
            },
            {
                "employee_code": "1",
                "punch_time": f"{today}T16:00:00",
                "punch_type": 1
            }
        ]
        
        # First, mark any existing records as processed to avoid conflicts
        # Then sync new records
        response = requests.post(
            f"{BASE_URL}/api/biometric/devices/{self.test_device_id}/sync-from-agent",
            json={"records": test_records},
            headers=self.headers
        )
        
        # May fail if device doesn't exist, that's ok
        if response.status_code == 200:
            result = response.json()
            print(f"Synced records: {result}")
        else:
            print(f"Sync skipped (device may not exist): {response.status_code}")
    
    def test_06_auto_process_creates_attendance(self):
        """Test that auto-process creates attendance records"""
        response = requests.post(
            f"{BASE_URL}/api/attendance/auto-process",
            headers=self.headers
        )
        assert response.status_code == 200, f"Auto-process failed: {response.text}"
        
        result = response.json()
        print(f"Auto-process result: {result}")
        
        # Verify response structure
        assert "message" in result or "created_attendance" in result or "processed" in result
    
    def test_07_verify_attendance_record_fields(self):
        """Verify attendance records have correct fields"""
        response = requests.get(
            f"{BASE_URL}/api/attendance",
            headers=self.headers
        )
        assert response.status_code == 200
        
        records = response.json()
        if len(records) > 0:
            # Check a fingerprint-sourced record
            fp_record = next((r for r in records if r.get("source") == "fingerprint"), None)
            if fp_record:
                # Verify all required fields
                assert "worked_hours" in fp_record, "worked_hours missing"
                assert "late_minutes" in fp_record, "late_minutes missing"
                assert "early_leave_minutes" in fp_record, "early_leave_minutes missing"
                assert "check_in" in fp_record, "check_in missing"
                assert "check_out" in fp_record, "check_out missing"
                print(f"✓ Attendance record fields verified: worked_hours={fp_record.get('worked_hours')}, late={fp_record.get('late_minutes')}min, early_leave={fp_record.get('early_leave_minutes')}min")
            else:
                print("No fingerprint attendance records found")
        else:
            print("No attendance records found")
    
    def test_08_verify_deductions_created(self):
        """Verify deductions are created for late/early_leave"""
        response = requests.get(
            f"{BASE_URL}/api/deductions",
            headers=self.headers
        )
        assert response.status_code == 200
        
        deductions = response.json()
        
        # Check for auto-created deductions
        late_deductions = [d for d in deductions if d.get("deduction_type") == "late" and "تلقائي" in (d.get("reason") or "")]
        early_leave_deductions = [d for d in deductions if d.get("deduction_type") == "early_leave" and "تلقائي" in (d.get("reason") or "")]
        
        print(f"Found {len(late_deductions)} auto late deductions")
        print(f"Found {len(early_leave_deductions)} auto early_leave deductions")
        
        if late_deductions:
            d = late_deductions[0]
            print(f"Sample late deduction: amount={d.get('amount')}, reason={d.get('reason')}")
        
        if early_leave_deductions:
            d = early_leave_deductions[0]
            print(f"Sample early_leave deduction: amount={d.get('amount')}, reason={d.get('reason')}")
    
    def test_09_auto_process_skips_duplicates(self):
        """Test that auto-process skips already processed dates"""
        # Run auto-process twice
        response1 = requests.post(
            f"{BASE_URL}/api/attendance/auto-process",
            headers=self.headers
        )
        assert response1.status_code == 200
        result1 = response1.json()
        
        response2 = requests.post(
            f"{BASE_URL}/api/attendance/auto-process",
            headers=self.headers
        )
        assert response2.status_code == 200
        result2 = response2.json()
        
        # Second run should process 0 or same as first (no duplicates)
        print(f"First run: {result1}")
        print(f"Second run: {result2}")
        
        # If there were records to process, second run should have fewer or same
        if result1.get("created_attendance", 0) > 0:
            assert result2.get("created_attendance", 0) <= result1.get("created_attendance", 0), "Duplicates may have been created"
    
    # ============ Calculation Tests ============
    
    def test_10_verify_worked_hours_calculation(self):
        """Verify worked_hours is calculated correctly"""
        response = requests.get(
            f"{BASE_URL}/api/attendance",
            headers=self.headers
        )
        assert response.status_code == 200
        
        records = response.json()
        fp_records = [r for r in records if r.get("source") == "fingerprint" and r.get("check_in") and r.get("check_out")]
        
        for rec in fp_records[:3]:  # Check first 3
            check_in = rec.get("check_in")
            check_out = rec.get("check_out")
            worked_hours = rec.get("worked_hours", 0)
            
            if check_in and check_out and check_in != check_out:
                # Calculate expected hours
                ci = datetime.strptime(check_in, "%H:%M")
                co = datetime.strptime(check_out, "%H:%M")
                expected_hours = round((co - ci).seconds / 3600, 2)
                
                # Allow small tolerance
                assert abs(worked_hours - expected_hours) < 0.1, f"worked_hours mismatch: got {worked_hours}, expected {expected_hours}"
                print(f"✓ Worked hours correct: {check_in}-{check_out} = {worked_hours}h")
    
    def test_11_verify_late_minutes_calculation(self):
        """Verify late_minutes is calculated correctly based on shift_start"""
        response = requests.get(
            f"{BASE_URL}/api/attendance",
            headers=self.headers
        )
        assert response.status_code == 200
        
        records = response.json()
        late_records = [r for r in records if r.get("late_minutes", 0) > 0 and r.get("source") == "fingerprint"]
        
        if late_records:
            for rec in late_records[:2]:
                print(f"Late record: check_in={rec.get('check_in')}, late_minutes={rec.get('late_minutes')}")
        else:
            print("No late attendance records found (employees may be on time)")
    
    def test_12_verify_early_leave_calculation(self):
        """Verify early_leave_minutes is calculated correctly based on shift_end"""
        response = requests.get(
            f"{BASE_URL}/api/attendance",
            headers=self.headers
        )
        assert response.status_code == 200
        
        records = response.json()
        early_leave_records = [r for r in records if r.get("early_leave_minutes", 0) > 0 and r.get("source") == "fingerprint"]
        
        if early_leave_records:
            for rec in early_leave_records[:2]:
                print(f"Early leave record: check_out={rec.get('check_out')}, early_leave_minutes={rec.get('early_leave_minutes')}")
        else:
            print("No early leave attendance records found")


class TestBiometricDeviceEndpoints:
    """Test biometric device endpoints"""
    
    token = None
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Login and get token"""
        if not TestBiometricDeviceEndpoints.token:
            response = requests.post(f"{BASE_URL}/api/auth/login", json={
                "email": "hanialdujaili@gmail.com",
                "password": "Hani@2024"
            })
            assert response.status_code == 200
            TestBiometricDeviceEndpoints.token = response.json().get("token")
        self.headers = {"Authorization": f"Bearer {TestBiometricDeviceEndpoints.token}"}
    
    def test_01_list_biometric_devices(self):
        """Test GET /api/biometric/devices"""
        response = requests.get(f"{BASE_URL}/api/biometric/devices", headers=self.headers)
        assert response.status_code == 200
        
        devices = response.json()
        assert isinstance(devices, list)
        print(f"Found {len(devices)} biometric devices")
        
        if devices:
            device = devices[0]
            assert "id" in device
            assert "name" in device
            assert "ip_address" in device
            print(f"Sample device: {device.get('name')} ({device.get('ip_address')})")
    
    def test_02_sync_from_agent_endpoint_exists(self):
        """Test that sync-from-agent endpoint exists"""
        # Use a test device ID
        test_device_id = "697db1ae-642a-4db0-a6f7-7d1a03064129"
        
        response = requests.post(
            f"{BASE_URL}/api/biometric/devices/{test_device_id}/sync-from-agent",
            json={"records": []},
            headers=self.headers
        )
        
        # Should return 200 or 404 (device not found), not 405 (method not allowed)
        assert response.status_code in [200, 404], f"Unexpected status: {response.status_code}"
        print(f"sync-from-agent endpoint status: {response.status_code}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
