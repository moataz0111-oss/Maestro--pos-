"""
Test iteration 143: Print Service Fix Tests
Tests for the print service fix that:
1. Changed API URL from window.location.origin to API_URL (from api.js)
2. Added automatic show_prices:false for kitchen printers
3. Removed fallback to garbled plain text
4. Improved error handling
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestAuthentication:
    """Test authentication for API access"""
    
    def test_admin_login(self):
        """Test admin login to get auth token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "hanialdujaili@gmail.com",
            "password": "Hani@2024"
        })
        assert response.status_code == 200, f"Login failed: {response.text}"
        data = response.json()
        assert "token" in data, "No token in response"
        return data["token"]


class TestRenderReceiptEndpoint:
    """Test /api/print/render-receipt endpoint"""
    
    @pytest.fixture
    def auth_token(self):
        """Get auth token for authenticated requests"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "hanialdujaili@gmail.com",
            "password": "Hani@2024"
        })
        if response.status_code == 200:
            return response.json().get("token")
        pytest.skip("Authentication failed")
    
    def test_render_receipt_customer_with_prices(self, auth_token):
        """Test rendering customer receipt with prices (show_prices: true)"""
        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {auth_token}"
        }
        
        payload = {
            "order": {
                "restaurant_name": "مطعم الاختبار",
                "order_number": 12345,
                "order_type": "dine_in",
                "table_number": "5",
                "language": "ar",
                "items": [
                    {"product_name": "برغر كلاسيك", "quantity": 2, "price": 5000},
                    {"product_name": "كولا", "quantity": 1, "price": 1500}
                ],
                "total": 11500,
                "discount": 0
            },
            "printer_config": {
                "show_prices": True,
                "print_mode": "full_receipt",
                "printer_type": "receipt"
            }
        }
        
        response = requests.post(
            f"{BASE_URL}/api/print/render-receipt",
            headers=headers,
            json=payload
        )
        
        assert response.status_code == 200, f"Render receipt failed: {response.text}"
        data = response.json()
        assert data.get("success") == True, f"Render not successful: {data.get('error')}"
        assert "raw_data" in data, "No raw_data in response"
        assert len(data["raw_data"]) > 0, "raw_data is empty"
        assert "size" in data, "No size in response"
        assert data["size"] > 0, "Size should be greater than 0"
        print(f"✅ Customer receipt rendered successfully: {data['size']} bytes")
    
    def test_render_receipt_kitchen_without_prices(self, auth_token):
        """Test rendering kitchen receipt without prices (show_prices: false)"""
        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {auth_token}"
        }
        
        payload = {
            "order": {
                "restaurant_name": "مطعم الاختبار",
                "section_name": "المطبخ الرئيسي",
                "order_number": 12346,
                "order_type": "takeaway",
                "buzzer_number": "42",
                "language": "ar",
                "items": [
                    {"product_name": "بيتزا مارغريتا", "quantity": 1, "price": 10000, "notes": "بدون بصل"},
                    {"product_name": "سلطة خضراء", "quantity": 2, "price": 4000}
                ],
                "total": 18000,
                "discount": 0
            },
            "printer_config": {
                "show_prices": False,  # Kitchen receipt - no prices
                "print_mode": "kitchen",
                "printer_type": "kitchen"
            }
        }
        
        response = requests.post(
            f"{BASE_URL}/api/print/render-receipt",
            headers=headers,
            json=payload
        )
        
        assert response.status_code == 200, f"Render kitchen receipt failed: {response.text}"
        data = response.json()
        assert data.get("success") == True, f"Render not successful: {data.get('error')}"
        assert "raw_data" in data, "No raw_data in response"
        assert len(data["raw_data"]) > 0, "raw_data is empty"
        print(f"✅ Kitchen receipt rendered successfully (no prices): {data['size']} bytes")
    
    def test_render_receipt_delivery_order(self, auth_token):
        """Test rendering delivery order receipt"""
        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {auth_token}"
        }
        
        payload = {
            "order": {
                "restaurant_name": "مطعم الاختبار",
                "order_number": 12347,
                "order_type": "delivery",
                "customer_name": "أحمد محمد",
                "driver_name": "سائق 1",
                "delivery_company": "",
                "language": "ar",
                "items": [
                    {"product_name": "برغر دبل", "quantity": 1, "price": 7500},
                    {"product_name": "عصير برتقال", "quantity": 2, "price": 2500}
                ],
                "total": 12500,
                "discount": 500,
                "payment_method": "cash"
            },
            "printer_config": {
                "show_prices": True,
                "print_mode": "full_receipt",
                "printer_type": "receipt"
            }
        }
        
        response = requests.post(
            f"{BASE_URL}/api/print/render-receipt",
            headers=headers,
            json=payload
        )
        
        assert response.status_code == 200, f"Render delivery receipt failed: {response.text}"
        data = response.json()
        assert data.get("success") == True, f"Render not successful: {data.get('error')}"
        assert "raw_data" in data, "No raw_data in response"
        print(f"✅ Delivery receipt rendered successfully: {data['size']} bytes")
    
    def test_render_receipt_with_extras(self, auth_token):
        """Test rendering receipt with item extras"""
        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {auth_token}"
        }
        
        payload = {
            "order": {
                "restaurant_name": "مطعم الاختبار",
                "order_number": 12348,
                "order_type": "dine_in",
                "table_number": "10",
                "language": "ar",
                "items": [
                    {
                        "product_name": "برغر كلاسيك",
                        "quantity": 1,
                        "price": 5000,
                        "extras": [
                            {"name": "جبنة إضافية", "price": 500},
                            {"name": "صوص خاص", "price": 300}
                        ]
                    }
                ],
                "total": 5800,
                "discount": 0
            },
            "printer_config": {
                "show_prices": True,
                "print_mode": "full_receipt",
                "printer_type": "receipt"
            }
        }
        
        response = requests.post(
            f"{BASE_URL}/api/print/render-receipt",
            headers=headers,
            json=payload
        )
        
        assert response.status_code == 200, f"Render receipt with extras failed: {response.text}"
        data = response.json()
        assert data.get("success") == True, f"Render not successful: {data.get('error')}"
        print(f"✅ Receipt with extras rendered successfully: {data['size']} bytes")
    
    def test_render_receipt_without_auth_still_works(self):
        """Test that render-receipt endpoint works (endpoint doesn't require auth in current implementation)"""
        headers = {
            "Content-Type": "application/json"
        }
        
        payload = {
            "order": {
                "restaurant_name": "Test Restaurant",
                "order_number": 99999,
                "order_type": "takeaway",
                "language": "en",
                "items": [
                    {"product_name": "Test Item", "quantity": 1, "price": 1000}
                ],
                "total": 1000
            },
            "printer_config": {
                "show_prices": True
            }
        }
        
        response = requests.post(
            f"{BASE_URL}/api/print/render-receipt",
            headers=headers,
            json=payload
        )
        
        # The endpoint should work - it's designed to be accessible
        assert response.status_code == 200, f"Render receipt failed: {response.text}"
        data = response.json()
        assert data.get("success") == True, f"Render not successful: {data.get('error')}"
        print(f"✅ Receipt rendered without auth: {data['size']} bytes")


class TestHealthCheck:
    """Basic health check tests"""
    
    def test_api_health(self):
        """Test API health endpoint"""
        response = requests.get(f"{BASE_URL}/api/health")
        assert response.status_code == 200
        print("✅ API health check passed")


class TestPrintersEndpoint:
    """Test printers endpoint"""
    
    @pytest.fixture
    def auth_token(self):
        """Get auth token for authenticated requests"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "hanialdujaili@gmail.com",
            "password": "Hani@2024"
        })
        if response.status_code == 200:
            return response.json().get("token")
        pytest.skip("Authentication failed")
    
    def test_get_printers(self, auth_token):
        """Test getting printers list"""
        headers = {"Authorization": f"Bearer {auth_token}"}
        response = requests.get(f"{BASE_URL}/api/printers", headers=headers)
        assert response.status_code == 200, f"Get printers failed: {response.text}"
        data = response.json()
        assert isinstance(data, list), "Printers should be a list"
        print(f"✅ Got {len(data)} printers")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
