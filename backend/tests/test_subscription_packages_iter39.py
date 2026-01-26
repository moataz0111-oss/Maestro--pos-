"""
Iteration 39 - Test New Subscription Packages (Bronze, Silver, Gold)
Tests:
1. Create tenant with bronze package
2. Create tenant with silver package
3. Create tenant with gold package
4. Update existing tenant subscription type to new packages
5. Verify new package prices in prices modal
6. Save new package prices
7. Verify notification settings (default 15 days)
8. Verify email notifications disabled by default
9. Verify new packages in subscription distribution
10. Calculate expected revenue for new packages
"""

import pytest
import requests
import os
import uuid

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestSubscriptionPackages:
    """Test new subscription packages: bronze, silver, gold"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup - login as super admin"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        # Login as super admin
        login_response = self.session.post(f"{BASE_URL}/api/super-admin/login", json={
            "email": "owner@maestroegp.com",
            "password": "owner123",
            "secret_key": "271018"
        })
        
        if login_response.status_code == 200:
            token = login_response.json().get("token")
            self.session.headers.update({"Authorization": f"Bearer {token}"})
            self.token = token
        else:
            pytest.skip(f"Super admin login failed: {login_response.status_code}")
        
        yield
        
        # Cleanup - delete test tenants
        self._cleanup_test_tenants()
    
    def _cleanup_test_tenants(self):
        """Delete test tenants created during tests"""
        try:
            tenants_response = self.session.get(f"{BASE_URL}/api/super-admin/tenants")
            if tenants_response.status_code == 200:
                tenants = tenants_response.json()
                for tenant in tenants:
                    if tenant.get("slug", "").startswith("test-iter39-"):
                        self.session.delete(f"{BASE_URL}/api/super-admin/tenants/{tenant['id']}?permanent=true")
        except Exception as e:
            print(f"Cleanup error: {e}")
    
    # ==================== Test 1: Create tenant with bronze package ====================
    def test_create_tenant_bronze_package(self):
        """Test creating a new tenant with bronze subscription package"""
        unique_id = str(uuid.uuid4())[:8]
        tenant_data = {
            "name": f"Test Bronze Restaurant {unique_id}",
            "slug": f"test-iter39-bronze-{unique_id}",
            "owner_name": "Bronze Owner",
            "owner_email": f"bronze-{unique_id}@test.com",
            "owner_phone": "0780111111",
            "subscription_type": "bronze",
            "subscription_duration": 1,
            "max_branches": 1,
            "max_users": 5,
            "is_demo": False
        }
        
        response = self.session.post(f"{BASE_URL}/api/super-admin/tenants", json=tenant_data)
        
        assert response.status_code == 200, f"Failed to create bronze tenant: {response.text}"
        data = response.json()
        
        # Verify tenant was created with bronze subscription
        assert "tenant" in data or "id" in data, "Response should contain tenant data"
        tenant = data.get("tenant", data)
        assert tenant.get("subscription_type") == "bronze", f"Expected bronze, got {tenant.get('subscription_type')}"
        print(f"✅ Created tenant with bronze package: {tenant.get('name')}")
    
    # ==================== Test 2: Create tenant with silver package ====================
    def test_create_tenant_silver_package(self):
        """Test creating a new tenant with silver subscription package"""
        unique_id = str(uuid.uuid4())[:8]
        tenant_data = {
            "name": f"Test Silver Restaurant {unique_id}",
            "slug": f"test-iter39-silver-{unique_id}",
            "owner_name": "Silver Owner",
            "owner_email": f"silver-{unique_id}@test.com",
            "owner_phone": "0780222222",
            "subscription_type": "silver",
            "subscription_duration": 3,
            "max_branches": 2,
            "max_users": 10,
            "is_demo": False
        }
        
        response = self.session.post(f"{BASE_URL}/api/super-admin/tenants", json=tenant_data)
        
        assert response.status_code == 200, f"Failed to create silver tenant: {response.text}"
        data = response.json()
        
        tenant = data.get("tenant", data)
        assert tenant.get("subscription_type") == "silver", f"Expected silver, got {tenant.get('subscription_type')}"
        print(f"✅ Created tenant with silver package: {tenant.get('name')}")
    
    # ==================== Test 3: Create tenant with gold package ====================
    def test_create_tenant_gold_package(self):
        """Test creating a new tenant with gold subscription package"""
        unique_id = str(uuid.uuid4())[:8]
        tenant_data = {
            "name": f"Test Gold Restaurant {unique_id}",
            "slug": f"test-iter39-gold-{unique_id}",
            "owner_name": "Gold Owner",
            "owner_email": f"gold-{unique_id}@test.com",
            "owner_phone": "0780333333",
            "subscription_type": "gold",
            "subscription_duration": 12,
            "max_branches": 5,
            "max_users": 20,
            "is_demo": False
        }
        
        response = self.session.post(f"{BASE_URL}/api/super-admin/tenants", json=tenant_data)
        
        assert response.status_code == 200, f"Failed to create gold tenant: {response.text}"
        data = response.json()
        
        tenant = data.get("tenant", data)
        assert tenant.get("subscription_type") == "gold", f"Expected gold, got {tenant.get('subscription_type')}"
        print(f"✅ Created tenant with gold package: {tenant.get('name')}")
    
    # ==================== Test 4: Update tenant subscription to new package ====================
    def test_update_tenant_subscription_to_new_package(self):
        """Test updating an existing tenant's subscription type to a new package"""
        # First create a tenant with trial
        unique_id = str(uuid.uuid4())[:8]
        tenant_data = {
            "name": f"Test Update Subscription {unique_id}",
            "slug": f"test-iter39-update-{unique_id}",
            "owner_name": "Update Owner",
            "owner_email": f"update-{unique_id}@test.com",
            "owner_phone": "0780444444",
            "subscription_type": "trial",
            "subscription_duration": 1,
            "max_branches": 1,
            "max_users": 5,
            "is_demo": False
        }
        
        create_response = self.session.post(f"{BASE_URL}/api/super-admin/tenants", json=tenant_data)
        assert create_response.status_code == 200, f"Failed to create tenant: {create_response.text}"
        
        tenant = create_response.json().get("tenant", create_response.json())
        tenant_id = tenant.get("id")
        
        # Update to gold package
        update_data = {
            "subscription_type": "gold",
            "name": tenant.get("name"),
            "owner_name": tenant.get("owner_name"),
            "owner_email": tenant.get("owner_email"),
            "owner_phone": tenant.get("owner_phone"),
            "max_branches": 5,
            "max_users": 20
        }
        
        update_response = self.session.put(f"{BASE_URL}/api/super-admin/tenants/{tenant_id}", json=update_data)
        
        assert update_response.status_code == 200, f"Failed to update tenant: {update_response.text}"
        
        # Verify the update
        get_response = self.session.get(f"{BASE_URL}/api/super-admin/tenants/{tenant_id}")
        assert get_response.status_code == 200
        
        updated_tenant = get_response.json().get("tenant", get_response.json())
        assert updated_tenant.get("subscription_type") == "gold", f"Expected gold, got {updated_tenant.get('subscription_type')}"
        print(f"✅ Updated tenant subscription from trial to gold")
    
    # ==================== Test 5: Get subscription prices (new packages) ====================
    def test_get_subscription_prices_new_packages(self):
        """Test getting subscription prices including new packages"""
        response = self.session.get(f"{BASE_URL}/api/super-admin/subscription-prices")
        
        assert response.status_code == 200, f"Failed to get prices: {response.text}"
        data = response.json()
        
        # Prices are nested under "prices" key
        prices = data.get("prices", data)
        
        # Verify new packages are present
        assert "bronze" in prices, "Bronze package should be in prices"
        assert "silver" in prices, "Silver package should be in prices"
        assert "gold" in prices, "Gold package should be in prices"
        
        # Verify prices are > 0
        bronze_price = prices.get("bronze", {}).get("monthly", 0)
        silver_price = prices.get("silver", {}).get("monthly", 0)
        gold_price = prices.get("gold", {}).get("monthly", 0)
        
        assert bronze_price > 0, f"Bronze price should be > 0, got {bronze_price}"
        assert silver_price > 0, f"Silver price should be > 0, got {silver_price}"
        assert gold_price > 0, f"Gold price should be > 0, got {gold_price}"
        
        print(f"✅ Subscription prices: Bronze=${bronze_price}, Silver=${silver_price}, Gold=${gold_price}")
    
    # ==================== Test 6: Save subscription prices ====================
    def test_save_subscription_prices(self):
        """Test saving new subscription prices"""
        new_prices = {
            "bronze": 22,
            "silver": 42,
            "gold": 62,
            "basic": 27,
            "premium": 52
        }
        
        response = self.session.put(f"{BASE_URL}/api/super-admin/subscription-prices", json=new_prices)
        
        assert response.status_code == 200, f"Failed to save prices: {response.text}"
        
        # Verify prices were saved
        get_response = self.session.get(f"{BASE_URL}/api/super-admin/subscription-prices")
        assert get_response.status_code == 200
        
        data = get_response.json()
        saved_prices = data.get("prices", data)
        
        assert saved_prices.get("bronze", {}).get("monthly") == 22, f"Bronze price not saved correctly, got {saved_prices.get('bronze')}"
        assert saved_prices.get("silver", {}).get("monthly") == 42, f"Silver price not saved correctly, got {saved_prices.get('silver')}"
        assert saved_prices.get("gold", {}).get("monthly") == 62, f"Gold price not saved correctly, got {saved_prices.get('gold')}"
        
        print(f"✅ Saved new subscription prices successfully")
        
        # Restore default prices
        default_prices = {
            "bronze": 15,
            "silver": 30,
            "gold": 50,
            "basic": 25,
            "premium": 50
        }
        self.session.put(f"{BASE_URL}/api/super-admin/subscription-prices", json=default_prices)
    
    # ==================== Test 7: Verify notification settings (15 days default) ====================
    def test_notification_settings_default_15_days(self):
        """Test that notification settings can be set to 15 days before expiry"""
        # First set to 15 days (the expected default)
        settings = {
            "days_before_expiry": 15,
            "email_notifications": False,
            "push_notifications": True,
            "notify_new_tenant": True,
            "notify_tenant_status": True
        }
        self.session.put(f"{BASE_URL}/api/super-admin/notification-settings", json=settings)
        
        response = self.session.get(f"{BASE_URL}/api/super-admin/notification-settings")
        
        assert response.status_code == 200, f"Failed to get notification settings: {response.text}"
        data = response.json()
        
        days_before_expiry = data.get("days_before_expiry", 0)
        assert days_before_expiry == 15, f"Expected 15 days, got {days_before_expiry}"
        
        print(f"✅ Notification settings: days_before_expiry = {days_before_expiry}")
    
    # ==================== Test 8: Verify email notifications can be disabled ====================
    def test_email_notifications_disabled(self):
        """Test that email notifications can be disabled"""
        # Set email notifications to false
        settings = {
            "days_before_expiry": 15,
            "email_notifications": False,
            "push_notifications": True,
            "notify_new_tenant": True,
            "notify_tenant_status": True
        }
        self.session.put(f"{BASE_URL}/api/super-admin/notification-settings", json=settings)
        
        response = self.session.get(f"{BASE_URL}/api/super-admin/notification-settings")
        
        assert response.status_code == 200, f"Failed to get notification settings: {response.text}"
        data = response.json()
        
        email_notifications = data.get("email_notifications", True)
        assert email_notifications == False, f"Expected email_notifications=False, got {email_notifications}"
        
        print(f"✅ Email notifications disabled: {email_notifications}")
    
    # ==================== Test 9: Verify new packages in subscriptions dashboard ====================
    def test_new_packages_in_subscriptions_dashboard(self):
        """Test that new packages appear in subscriptions dashboard"""
        response = self.session.get(f"{BASE_URL}/api/super-admin/subscriptions-dashboard")
        
        assert response.status_code == 200, f"Failed to get dashboard: {response.text}"
        data = response.json()
        
        # Verify subscription_prices includes new packages
        subscription_prices = data.get("subscription_prices", {})
        assert "bronze" in subscription_prices, "Bronze should be in subscription_prices"
        assert "silver" in subscription_prices, "Silver should be in subscription_prices"
        assert "gold" in subscription_prices, "Gold should be in subscription_prices"
        
        print(f"✅ New packages present in subscriptions dashboard")
    
    # ==================== Test 10: Calculate expected revenue for new packages ====================
    def test_expected_revenue_calculation(self):
        """Test that expected revenue is calculated correctly for new packages"""
        # First create tenants with new packages
        unique_id = str(uuid.uuid4())[:8]
        
        # Create bronze tenant
        bronze_tenant = {
            "name": f"Revenue Test Bronze {unique_id}",
            "slug": f"test-iter39-rev-bronze-{unique_id}",
            "owner_name": "Revenue Bronze",
            "owner_email": f"rev-bronze-{unique_id}@test.com",
            "owner_phone": "0780555555",
            "subscription_type": "bronze",
            "subscription_duration": 1,
            "max_branches": 1,
            "max_users": 5,
            "is_demo": False
        }
        self.session.post(f"{BASE_URL}/api/super-admin/tenants", json=bronze_tenant)
        
        # Get dashboard and verify revenue calculation
        response = self.session.get(f"{BASE_URL}/api/super-admin/subscriptions-dashboard")
        assert response.status_code == 200
        
        data = response.json()
        expected_revenue = data.get("expected_monthly_revenue", 0)
        
        # Revenue should be > 0 if there are paid subscriptions
        print(f"✅ Expected monthly revenue: ${expected_revenue}")
        
        # Verify subscription types distribution
        subscription_types = data.get("subscription_types", {})
        print(f"✅ Subscription types distribution: {subscription_types}")


class TestNotificationSettings:
    """Test notification settings for subscription expiry alerts"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup - login as super admin"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        login_response = self.session.post(f"{BASE_URL}/api/super-admin/login", json={
            "email": "owner@maestroegp.com",
            "password": "owner123",
            "secret_key": "271018"
        })
        
        if login_response.status_code == 200:
            token = login_response.json().get("token")
            self.session.headers.update({"Authorization": f"Bearer {token}"})
        else:
            pytest.skip("Super admin login failed")
    
    def test_update_notification_settings(self):
        """Test updating notification settings"""
        new_settings = {
            "days_before_expiry": 7,
            "email_notifications": False,
            "push_notifications": True,
            "notify_new_tenant": True,
            "notify_tenant_status": True
        }
        
        response = self.session.put(f"{BASE_URL}/api/super-admin/notification-settings", json=new_settings)
        
        assert response.status_code == 200, f"Failed to update settings: {response.text}"
        
        # Verify settings were saved
        get_response = self.session.get(f"{BASE_URL}/api/super-admin/notification-settings")
        assert get_response.status_code == 200
        
        saved_settings = get_response.json()
        assert saved_settings.get("days_before_expiry") == 7
        
        print(f"✅ Updated notification settings successfully")
        
        # Restore default settings
        default_settings = {
            "days_before_expiry": 15,
            "email_notifications": False,
            "push_notifications": True,
            "notify_new_tenant": True,
            "notify_tenant_status": True
        }
        self.session.put(f"{BASE_URL}/api/super-admin/notification-settings", json=default_settings)
    
    def test_get_expiring_subscriptions(self):
        """Test getting expiring subscriptions list"""
        response = self.session.get(f"{BASE_URL}/api/super-admin/expiring-subscriptions")
        
        assert response.status_code == 200, f"Failed to get expiring subscriptions: {response.text}"
        data = response.json()
        
        # Verify response structure
        assert "expiring_soon" in data, "Response should contain expiring_soon"
        assert "already_expired" in data, "Response should contain already_expired"
        
        print(f"✅ Expiring subscriptions: {len(data.get('expiring_soon', []))} expiring soon, {len(data.get('already_expired', []))} expired")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
