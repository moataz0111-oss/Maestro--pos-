"""
Test Order Notifications API - Iteration 105
Tests for:
1. POST /api/order-notifications - Create notification
2. GET /api/order-notifications - Get notifications
3. PUT /api/order-notifications/{id}/read - Mark as read
"""
import pytest
import requests
import os
import time

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://thermal-print-agent.preview.emergentagent.com')

class TestOrderNotificationsAPI:
    """Test Order Notifications API endpoints"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test data"""
        self.test_order_id = f"test_order_{int(time.time())}"
        self.test_branch_id = "test_branch_iter105"
        self.test_driver_id = "test_driver_iter105"
    
    def test_create_order_notification_success(self):
        """Test POST /api/order-notifications - Create notification for cashier and driver"""
        notification_data = {
            "order_id": self.test_order_id,
            "order_number": "TEST-105-001",
            "branch_id": self.test_branch_id,
            "order_type": "delivery",
            "customer_name": "Test Customer 105",
            "customer_phone": "07701234567",
            "delivery_address": "Test Address 105",
            "driver_id": self.test_driver_id,
            "total_amount": 35000,
            "items_count": 5,
            "notes": "Test notification iteration 105"
        }
        
        response = requests.post(
            f"{BASE_URL}/api/order-notifications",
            json=notification_data
        )
        
        # Status assertion
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        # Data assertions
        data = response.json()
        assert data["success"] == True
        assert "cashier_notification_id" in data
        assert "driver_notification_id" in data
        assert data["driver_notification_id"] is not None  # Should have driver notification for delivery orders
        
        print(f"✓ Created notifications - Cashier: {data['cashier_notification_id']}, Driver: {data['driver_notification_id']}")
    
    def test_create_order_notification_without_driver(self):
        """Test POST /api/order-notifications - Create notification without driver (takeaway)"""
        notification_data = {
            "order_id": f"test_takeaway_{int(time.time())}",
            "order_number": "TEST-105-002",
            "branch_id": self.test_branch_id,
            "order_type": "takeaway",
            "customer_name": "Takeaway Customer",
            "customer_phone": "07709876543",
            "total_amount": 15000,
            "items_count": 2
        }
        
        response = requests.post(
            f"{BASE_URL}/api/order-notifications",
            json=notification_data
        )
        
        assert response.status_code == 200
        data = response.json()
        assert data["success"] == True
        assert data["driver_notification_id"] is None  # No driver for takeaway
        
        print("✓ Created notification without driver (takeaway order)")
    
    def test_get_notifications_by_branch(self):
        """Test GET /api/order-notifications - Get notifications by branch"""
        # First create a notification
        notification_data = {
            "order_id": f"test_get_{int(time.time())}",
            "order_number": "TEST-105-GET",
            "branch_id": self.test_branch_id,
            "order_type": "dine_in",
            "total_amount": 20000,
            "items_count": 3
        }
        
        create_response = requests.post(
            f"{BASE_URL}/api/order-notifications",
            json=notification_data
        )
        assert create_response.status_code == 200
        
        # Now get notifications
        response = requests.get(
            f"{BASE_URL}/api/order-notifications",
            params={
                "branch_id": self.test_branch_id,
                "unread_only": "false",
                "limit": 50
            }
        )
        
        assert response.status_code == 200
        data = response.json()
        
        # Data assertions
        assert "notifications" in data
        assert "count" in data
        assert "unread_count" in data
        assert isinstance(data["notifications"], list)
        
        print(f"✓ Retrieved {data['count']} notifications, {data['unread_count']} unread")
    
    def test_get_notifications_by_driver(self):
        """Test GET /api/order-notifications - Get notifications by driver"""
        # First create a delivery notification with driver
        notification_data = {
            "order_id": f"test_driver_get_{int(time.time())}",
            "order_number": "TEST-105-DRIVER",
            "branch_id": self.test_branch_id,
            "order_type": "delivery",
            "driver_id": self.test_driver_id,
            "delivery_address": "Driver Test Address",
            "total_amount": 25000,
            "items_count": 4
        }
        
        create_response = requests.post(
            f"{BASE_URL}/api/order-notifications",
            json=notification_data
        )
        assert create_response.status_code == 200
        
        # Get driver notifications
        response = requests.get(
            f"{BASE_URL}/api/order-notifications",
            params={
                "driver_id": self.test_driver_id,
                "notification_type": "new_order_driver",
                "unread_only": "false"
            }
        )
        
        assert response.status_code == 200
        data = response.json()
        assert "notifications" in data
        
        # Check that we got driver notifications
        if data["count"] > 0:
            for notif in data["notifications"]:
                assert notif["type"] == "new_order_driver"
        
        print(f"✓ Retrieved {data['count']} driver notifications")
    
    def test_mark_notification_as_read(self):
        """Test PUT /api/order-notifications/{id}/read - Mark notification as read"""
        # First create a notification
        notification_data = {
            "order_id": f"test_read_{int(time.time())}",
            "order_number": "TEST-105-READ",
            "branch_id": self.test_branch_id,
            "order_type": "takeaway",
            "total_amount": 10000,
            "items_count": 1
        }
        
        create_response = requests.post(
            f"{BASE_URL}/api/order-notifications",
            json=notification_data
        )
        assert create_response.status_code == 200
        notification_id = create_response.json()["cashier_notification_id"]
        
        # Mark as read
        response = requests.put(
            f"{BASE_URL}/api/order-notifications/{notification_id}/read"
        )
        
        assert response.status_code == 200
        data = response.json()
        assert data["success"] == True
        
        print(f"✓ Marked notification {notification_id} as read")
    
    def test_mark_notification_as_printed(self):
        """Test PUT /api/order-notifications/{id}/printed - Mark notification as printed"""
        # First create a notification
        notification_data = {
            "order_id": f"test_print_{int(time.time())}",
            "order_number": "TEST-105-PRINT",
            "branch_id": self.test_branch_id,
            "order_type": "dine_in",
            "total_amount": 30000,
            "items_count": 6
        }
        
        create_response = requests.post(
            f"{BASE_URL}/api/order-notifications",
            json=notification_data
        )
        assert create_response.status_code == 200
        notification_id = create_response.json()["cashier_notification_id"]
        
        # Mark as printed
        response = requests.put(
            f"{BASE_URL}/api/order-notifications/{notification_id}/printed"
        )
        
        assert response.status_code == 200
        data = response.json()
        assert data["success"] == True
        
        print(f"✓ Marked notification {notification_id} as printed")
    
    def test_mark_nonexistent_notification_as_read(self):
        """Test PUT /api/order-notifications/{id}/read - Non-existent notification"""
        response = requests.put(
            f"{BASE_URL}/api/order-notifications/nonexistent_notification_id/read"
        )
        
        # Should return 404
        assert response.status_code == 404
        print("✓ Correctly returned 404 for non-existent notification")
    
    def test_mark_all_notifications_read(self):
        """Test PUT /api/order-notifications/read-all - Mark all as read"""
        # Create a few notifications first
        for i in range(3):
            notification_data = {
                "order_id": f"test_all_read_{int(time.time())}_{i}",
                "order_number": f"TEST-105-ALL-{i}",
                "branch_id": self.test_branch_id,
                "order_type": "takeaway",
                "total_amount": 5000 * (i + 1),
                "items_count": i + 1
            }
            requests.post(f"{BASE_URL}/api/order-notifications", json=notification_data)
        
        # Mark all as read
        response = requests.put(
            f"{BASE_URL}/api/order-notifications/read-all",
            params={"branch_id": self.test_branch_id}
        )
        
        assert response.status_code == 200
        data = response.json()
        assert data["success"] == True
        
        print(f"✓ Marked all notifications as read: {data['message']}")
    
    def test_cleanup_old_notifications(self):
        """Test DELETE /api/order-notifications/cleanup - Cleanup old notifications"""
        response = requests.delete(
            f"{BASE_URL}/api/order-notifications/cleanup",
            params={"hours": 24}
        )
        
        assert response.status_code == 200
        data = response.json()
        assert data["success"] == True
        
        print(f"✓ Cleanup completed: {data['message']}")


class TestNotificationDataValidation:
    """Test notification data validation"""
    
    def test_notification_structure(self):
        """Test that notification response has correct structure"""
        notification_data = {
            "order_id": f"test_structure_{int(time.time())}",
            "order_number": "TEST-STRUCT-001",
            "branch_id": "test_branch_structure",
            "order_type": "delivery",
            "customer_name": "Structure Test",
            "customer_phone": "07701111111",
            "delivery_address": "Structure Address",
            "driver_id": "driver_structure",
            "total_amount": 50000,
            "items_count": 10,
            "notes": "Structure test notes"
        }
        
        # Create notification
        create_response = requests.post(
            f"{BASE_URL}/api/order-notifications",
            json=notification_data
        )
        assert create_response.status_code == 200
        
        # Get notifications
        get_response = requests.get(
            f"{BASE_URL}/api/order-notifications",
            params={"branch_id": "test_branch_structure", "unread_only": "false"}
        )
        assert get_response.status_code == 200
        
        data = get_response.json()
        if data["count"] > 0:
            notif = data["notifications"][0]
            
            # Verify structure
            required_fields = [
                "id", "type", "order_id", "order_number", "branch_id",
                "order_type", "total_amount", "items_count", "is_read",
                "is_printed", "created_at"
            ]
            
            for field in required_fields:
                assert field in notif, f"Missing field: {field}"
            
            print("✓ Notification structure is correct")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
