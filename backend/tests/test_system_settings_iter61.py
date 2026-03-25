"""
Test file for iteration 61 - Testing:
1. System Settings tab (إعدادات النظام) - Country/Currency/Language settings
2. Dark map design (CARTO dark tiles)
3. Driver login with phone and PIN
4. Add driver form with name+phone+PIN only
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://zero-downtime-deploy-1.preview.emergentagent.com')

class TestSystemSettings:
    """Test system settings APIs - Currency, Language, Country"""
    
    def test_01_get_system_currencies(self):
        """Test GET /api/system/currencies returns supported currencies"""
        response = requests.get(f"{BASE_URL}/api/system/currencies")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        assert "currencies" in data, "Response should contain 'currencies' key"
        
        currencies = data["currencies"]
        # Check for expected currencies
        expected_currencies = ["IQD", "USD", "SAR", "AED", "EGP"]
        for curr in expected_currencies:
            assert curr in currencies, f"Currency {curr} should be in supported currencies"
        
        # Check currency structure
        if "IQD" in currencies:
            iqd = currencies["IQD"]
            assert "name" in iqd, "Currency should have 'name'"
            assert "symbol" in iqd, "Currency should have 'symbol'"
            assert "rate_to_usd" in iqd, "Currency should have 'rate_to_usd'"
        
        print(f"✓ System currencies API works - Found {len(currencies)} currencies")
    
    def test_02_get_system_languages(self):
        """Test GET /api/system/languages returns supported languages"""
        response = requests.get(f"{BASE_URL}/api/system/languages")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        assert "languages" in data, "Response should contain 'languages' key"
        
        languages = data["languages"]
        # Check for expected languages
        expected_languages = ["ar", "en"]
        for lang in expected_languages:
            assert lang in languages, f"Language {lang} should be in supported languages"
        
        # Check language structure
        if "ar" in languages:
            ar = languages["ar"]
            assert "name" in ar, "Language should have 'name'"
            assert "dir" in ar, "Language should have 'dir' (direction)"
        
        print(f"✓ System languages API works - Found {len(languages)} languages")
    
    def test_03_get_system_countries(self):
        """Test GET /api/system/countries returns supported countries"""
        response = requests.get(f"{BASE_URL}/api/system/countries")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        assert "countries" in data, "Response should contain 'countries' key"
        
        countries = data["countries"]
        # Check for expected countries
        expected_countries = ["IQ", "SA", "AE", "EG"]
        for country in expected_countries:
            assert country in countries, f"Country {country} should be in supported countries"
        
        # Check country structure
        if "IQ" in countries:
            iq = countries["IQ"]
            assert "name" in iq, "Country should have 'name'"
            assert "currency" in iq, "Country should have 'currency'"
            assert "language" in iq, "Country should have 'language'"
        
        print(f"✓ System countries API works - Found {len(countries)} countries")


class TestRegionalSettings:
    """Test regional settings save/load"""
    
    @pytest.fixture
    def auth_token(self):
        """Get authentication token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "demo@maestroegp.com",
            "password": "demo123"
        })
        if response.status_code == 200:
            return response.json().get("token")
        pytest.skip("Authentication failed")
    
    def test_04_get_regional_settings(self, auth_token):
        """Test GET /api/tenant/regional-settings returns current settings"""
        headers = {"Authorization": f"Bearer {auth_token}"}
        response = requests.get(f"{BASE_URL}/api/tenant/regional-settings", headers=headers)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        # Check for expected fields
        expected_fields = ["country", "currency", "language"]
        for field in expected_fields:
            assert field in data, f"Regional settings should have '{field}'"
        
        print(f"✓ Regional settings GET works - Country: {data.get('country')}, Currency: {data.get('currency')}, Language: {data.get('language')}")
    
    def test_05_update_regional_settings(self, auth_token):
        """Test PUT /api/tenant/regional-settings saves settings"""
        headers = {"Authorization": f"Bearer {auth_token}"}
        
        # First get current settings
        get_response = requests.get(f"{BASE_URL}/api/tenant/regional-settings", headers=headers)
        original_settings = get_response.json() if get_response.status_code == 200 else {}
        
        # Update settings
        new_settings = {
            "country": "IQ",
            "currency": "IQD",
            "language": "ar"
        }
        
        response = requests.put(f"{BASE_URL}/api/tenant/regional-settings", 
                               json=new_settings, headers=headers)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        # Verify settings were saved
        verify_response = requests.get(f"{BASE_URL}/api/tenant/regional-settings", headers=headers)
        assert verify_response.status_code == 200
        
        saved_data = verify_response.json()
        assert saved_data.get("country") == "IQ", "Country should be saved"
        assert saved_data.get("currency") == "IQD", "Currency should be saved"
        assert saved_data.get("language") == "ar", "Language should be saved"
        
        print("✓ Regional settings PUT works - Settings saved and verified")


class TestDriverLogin:
    """Test driver login with phone and PIN"""
    
    def test_06_driver_login_success(self):
        """Test driver login with correct phone and PIN"""
        response = requests.post(f"{BASE_URL}/api/driver/login", params={
            "phone": "07901234567",
            "pin": "1234"
        })
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        assert "driver" in data, "Response should contain 'driver'"
        
        driver = data["driver"]
        assert "id" in driver, "Driver should have 'id'"
        assert "name" in driver, "Driver should have 'name'"
        assert "phone" in driver, "Driver should have 'phone'"
        
        print(f"✓ Driver login success - Driver: {driver.get('name')}")
    
    def test_07_driver_login_wrong_pin(self):
        """Test driver login with wrong PIN returns 401"""
        response = requests.post(f"{BASE_URL}/api/driver/login", params={
            "phone": "07901234567",
            "pin": "9999"
        })
        assert response.status_code == 401, f"Expected 401 for wrong PIN, got {response.status_code}"
        print("✓ Driver login with wrong PIN returns 401")
    
    def test_08_driver_login_unknown_phone(self):
        """Test driver login with unknown phone returns 404"""
        response = requests.post(f"{BASE_URL}/api/driver/login", params={
            "phone": "07000000000",
            "pin": "1234"
        })
        assert response.status_code == 404, f"Expected 404 for unknown phone, got {response.status_code}"
        print("✓ Driver login with unknown phone returns 404")
    
    def test_09_driver_login_missing_pin(self):
        """Test driver login without PIN returns 422"""
        response = requests.post(f"{BASE_URL}/api/driver/login", params={
            "phone": "07901234567"
        })
        assert response.status_code == 422, f"Expected 422 for missing PIN, got {response.status_code}"
        print("✓ Driver login without PIN returns 422")


class TestAddDriverForm:
    """Test add driver form with name+phone+PIN only"""
    
    @pytest.fixture
    def auth_token(self):
        """Get authentication token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "demo@maestroegp.com",
            "password": "demo123"
        })
        if response.status_code == 200:
            return response.json().get("token")
        pytest.skip("Authentication failed")
    
    def test_10_create_driver_with_name_phone_pin(self, auth_token):
        """Test creating driver with only name, phone, and PIN"""
        headers = {"Authorization": f"Bearer {auth_token}"}
        
        # First get a branch_id
        branches_response = requests.get(f"{BASE_URL}/api/branches", headers=headers)
        branches = branches_response.json()
        branch_id = branches[0]["id"] if branches else None
        
        if not branch_id:
            pytest.skip("No branches found")
        
        import time
        unique_phone = f"079{int(time.time()) % 10000000:07d}"
        
        # The form only requires name, phone, PIN - branch_id is auto-selected
        driver_data = {
            "name": "سائق اختبار",
            "phone": unique_phone,
            "pin": "5678",
            "branch_id": branch_id  # This is auto-selected in the UI
        }
        
        response = requests.post(f"{BASE_URL}/api/drivers", json=driver_data, headers=headers)
        assert response.status_code in [200, 201], f"Expected 200/201, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "id" in data or "driver" in data, "Response should contain driver data"
        
        driver = data.get("driver", data)
        assert driver.get("name") == "سائق اختبار", "Driver name should match"
        assert driver.get("phone") == unique_phone, "Driver phone should match"
        
        # Verify PIN works by logging in
        login_response = requests.post(f"{BASE_URL}/api/driver/login", params={
            "phone": unique_phone,
            "pin": "5678"
        })
        assert login_response.status_code == 200, "Should be able to login with the PIN"
        
        print(f"✓ Driver created with name+phone+PIN - Phone: {unique_phone}")
        
        # Cleanup - delete the test driver
        driver_id = driver.get("id")
        if driver_id:
            requests.delete(f"{BASE_URL}/api/drivers/{driver_id}", headers=headers)


class TestDarkMapTiles:
    """Test that dark map tiles are configured (CARTO dark)"""
    
    def test_11_carto_dark_tiles_in_driver_app(self):
        """Verify CARTO dark tiles URL is used in DriverApp.js"""
        # This is a code verification test - checking the frontend code
        import os
        driver_app_path = "/app/frontend/src/pages/DriverApp.js"
        
        if os.path.exists(driver_app_path):
            with open(driver_app_path, 'r') as f:
                content = f.read()
            
            # Check for CARTO dark tiles URL
            assert "basemaps.cartocdn.com/dark_all" in content, \
                "DriverApp.js should use CARTO dark tiles"
            
            print("✓ DriverApp.js uses CARTO dark tiles")
        else:
            pytest.skip("DriverApp.js not found")
    
    def test_12_carto_dark_tiles_in_customer_menu(self):
        """Verify CARTO dark tiles URL is used in CustomerMenu.js"""
        import os
        customer_menu_path = "/app/frontend/src/pages/CustomerMenu.js"
        
        if os.path.exists(customer_menu_path):
            with open(customer_menu_path, 'r') as f:
                content = f.read()
            
            # Check for CARTO dark tiles URL
            assert "basemaps.cartocdn.com/dark_all" in content, \
                "CustomerMenu.js should use CARTO dark tiles"
            
            print("✓ CustomerMenu.js uses CARTO dark tiles")
        else:
            pytest.skip("CustomerMenu.js not found")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
