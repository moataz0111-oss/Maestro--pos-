#!/usr/bin/env python3
"""
Maestro EGP Backend API Testing Suite
Tests all backend endpoints for the POS system
"""

import requests
import sys
import json
from datetime import datetime
from typing import Dict, List, Optional

# Use the public endpoint from frontend .env
BASE_URL = "https://food-flow-6.preview.emergentagent.com/api"

class MaestroAPITester:
    def __init__(self):
        self.base_url = BASE_URL
        self.token = None
        self.admin_user = None
        self.cashier_user = None
        self.branch_id = None
        self.tests_run = 0
        self.tests_passed = 0
        self.failed_tests = []
        self.session = requests.Session()
        
    def log(self, message: str, level: str = "INFO"):
        """Log test messages"""
        timestamp = datetime.now().strftime("%H:%M:%S")
        print(f"[{timestamp}] {level}: {message}")
        
    def make_request(self, method: str, endpoint: str, data: dict = None, params: dict = None, expected_status: int = 200) -> tuple:
        """Make HTTP request and return success status and response data"""
        url = f"{self.base_url}/{endpoint.lstrip('/')}"
        headers = {'Content-Type': 'application/json'}
        
        if self.token:
            headers['Authorization'] = f'Bearer {self.token}'
            
        self.tests_run += 1
        
        try:
            if method.upper() == 'GET':
                response = self.session.get(url, headers=headers, params=params, timeout=10)
            elif method.upper() == 'POST':
                response = self.session.post(url, headers=headers, json=data, timeout=10)
            elif method.upper() == 'PUT':
                response = self.session.put(url, headers=headers, json=data, timeout=10)
            elif method.upper() == 'DELETE':
                response = self.session.delete(url, headers=headers, timeout=10)
            else:
                raise ValueError(f"Unsupported method: {method}")
                
            success = response.status_code == expected_status
            
            if success:
                self.tests_passed += 1
                self.log(f"✅ {method} {endpoint} - Status: {response.status_code}")
            else:
                self.log(f"❌ {method} {endpoint} - Expected {expected_status}, got {response.status_code}")
                self.failed_tests.append({
                    'endpoint': endpoint,
                    'method': method,
                    'expected': expected_status,
                    'actual': response.status_code,
                    'response': response.text[:200] if response.text else None
                })
                
            try:
                return success, response.json() if response.content else {}
            except json.JSONDecodeError:
                return success, {'raw_response': response.text}
                
        except requests.exceptions.RequestException as e:
            self.log(f"❌ {method} {endpoint} - Network Error: {str(e)}", "ERROR")
            self.failed_tests.append({
                'endpoint': endpoint,
                'method': method,
                'error': str(e)
            })
            return False, {}
    
    def test_health_check(self):
        """Test basic API health"""
        self.log("Testing API health check...")
        success, data = self.make_request('GET', '/')
        return success
    
    def test_seed_data(self):
        """Initialize seed data"""
        self.log("Seeding initial data...")
        success, data = self.make_request('POST', '/seed')
        if success:
            self.log("✅ Seed data created successfully")
        return success
    
    def test_admin_login(self):
        """Test admin login"""
        self.log("Testing admin login...")
        success, data = self.make_request('POST', '/auth/login', {
            'email': 'admin@maestroegp.com',
            'password': 'admin123'
        })
        
        if success and 'token' in data:
            self.token = data['token']
            self.admin_user = data['user']
            self.log(f"✅ Admin login successful - User: {self.admin_user.get('full_name')}")
            return True
        else:
            self.log("❌ Admin login failed")
            return False
    
    def test_cashier_login(self):
        """Test cashier login"""
        self.log("Testing cashier login...")
        success, data = self.make_request('POST', '/auth/login', {
            'email': 'cashier@maestroegp.com',
            'password': 'cashier123'
        })
        
        if success and 'token' in data:
            self.cashier_user = data['user']
            self.log(f"✅ Cashier login successful - User: {self.cashier_user.get('full_name')}")
            return True
        else:
            self.log("❌ Cashier login failed")
            return False
    
    def test_auth_me(self):
        """Test current user endpoint"""
        self.log("Testing /auth/me endpoint...")
        success, data = self.make_request('GET', '/auth/me')
        if success and data.get('id'):
            self.log(f"✅ Current user: {data.get('full_name')} ({data.get('role')})")
        return success
    
    def test_branches(self):
        """Test branch management"""
        self.log("Testing branch endpoints...")
        
        # Get branches
        success, data = self.make_request('GET', '/branches')
        if success and len(data) > 0:
            self.branch_id = data[0]['id']
            self.log(f"✅ Found {len(data)} branches")
        
        # Create new branch (admin only)
        if self.admin_user:
            success, data = self.make_request('POST', '/branches', {
                'name': 'فرع تجريبي',
                'address': 'بغداد - الكرخ',
                'phone': '+964 770 999 8888',
                'email': 'test@maestroegp.com'
            }, expected_status=200)
            
        return success
    
    def test_categories_and_products(self):
        """Test categories and products"""
        self.log("Testing categories and products...")
        
        # Get categories
        success, categories = self.make_request('GET', '/categories')
        if not success:
            return False
            
        self.log(f"✅ Found {len(categories)} categories")
        
        # Get products
        success, products = self.make_request('GET', '/products')
        if success:
            self.log(f"✅ Found {len(products)} products")
            
        return success
    
    def test_tables(self):
        """Test table management"""
        self.log("Testing table management...")
        
        if not self.branch_id:
            self.log("❌ No branch ID available for table testing")
            return False
            
        # Get tables
        success, tables = self.make_request('GET', '/tables', params={'branch_id': self.branch_id})
        if success:
            self.log(f"✅ Found {len(tables)} tables")
            
        return success
    
    def test_inventory(self):
        """Test inventory management"""
        self.log("Testing inventory management...")
        
        if not self.branch_id:
            self.log("❌ No branch ID available for inventory testing")
            return False
            
        # Get inventory
        success, items = self.make_request('GET', '/inventory', params={'branch_id': self.branch_id})
        if success:
            self.log(f"✅ Found {len(items)} inventory items")
            
        return success
    
    def test_orders(self):
        """Test order management"""
        self.log("Testing order management...")
        
        if not self.branch_id:
            self.log("❌ No branch ID available for order testing")
            return False
            
        # Get today's orders
        today = datetime.now().strftime('%Y-%m-%d')
        success, orders = self.make_request('GET', '/orders', params={
            'branch_id': self.branch_id,
            'date': today
        })
        
        if success:
            self.log(f"✅ Found {len(orders)} orders for today")
            
        return success
    
    def test_create_order(self):
        """Test order creation"""
        self.log("Testing order creation...")
        
        if not self.branch_id:
            self.log("❌ No branch ID available for order creation")
            return False
            
        # Get products first
        success, products = self.make_request('GET', '/products')
        if not success or len(products) == 0:
            self.log("❌ No products available for order creation")
            return False
            
        # Create a test order
        test_product = products[0]
        order_data = {
            'order_type': 'takeaway',
            'customer_name': 'زبون تجريبي',
            'customer_phone': '+964 770 123 4567',
            'items': [{
                'product_id': test_product['id'],
                'product_name': test_product['name'],
                'quantity': 2,
                'price': test_product['price'],
                'notes': 'طلب تجريبي'
            }],
            'branch_id': self.branch_id,
            'payment_method': 'cash',
            'discount': 0
        }
        
        success, order = self.make_request('POST', '/orders', order_data)
        if success and order.get('id'):
            self.log(f"✅ Order created successfully - #{order.get('order_number')}")
            
            # Test order status update
            success, _ = self.make_request('PUT', f"/orders/{order['id']}/status?status=preparing")
            if success:
                self.log("✅ Order status updated successfully")
                
        return success
    
    def test_drivers(self):
        """Test driver management"""
        self.log("Testing driver management...")
        
        if not self.branch_id:
            self.log("❌ No branch ID available for driver testing")
            return False
            
        # Get drivers
        success, drivers = self.make_request('GET', '/drivers', params={'branch_id': self.branch_id})
        if success:
            self.log(f"✅ Found {len(drivers)} drivers")
            
        return success
    
    def test_reports(self):
        """Test reporting endpoints"""
        self.log("Testing reports...")
        
        if not self.branch_id:
            self.log("❌ No branch ID available for reports")
            return False
            
        # Sales report
        today = datetime.now().strftime('%Y-%m-%d')
        success, sales_report = self.make_request('GET', '/reports/sales', params={
            'branch_id': self.branch_id,
            'start_date': today
        })
        
        if success:
            self.log(f"✅ Sales report - Total: {sales_report.get('total_sales', 0)} IQD")
            
        # Inventory report
        success, inv_report = self.make_request('GET', '/reports/inventory', params={
            'branch_id': self.branch_id
        })
        
        if success:
            self.log(f"✅ Inventory report - {inv_report.get('total_items', 0)} items")
            
        return success
    
    def test_delivery_apps(self):
        """Test delivery apps endpoint"""
        self.log("Testing delivery apps...")
        success, apps = self.make_request('GET', '/delivery-apps')
        if success:
            self.log(f"✅ Found {len(apps)} delivery apps")
        return success
    
    def test_settings(self):
        """Test settings endpoints"""
        self.log("Testing settings...")
        success, settings = self.make_request('GET', '/settings')
        if success:
            self.log("✅ Settings retrieved successfully")
        return success
    
    def run_all_tests(self):
        """Run complete test suite"""
        self.log("🚀 Starting Maestro EGP Backend API Tests")
        self.log("=" * 50)
        
        # Core API tests
        if not self.test_health_check():
            self.log("❌ API health check failed - aborting tests", "ERROR")
            return False
            
        # Seed data
        self.test_seed_data()
        
        # Authentication tests
        if not self.test_admin_login():
            self.log("❌ Admin login failed - aborting tests", "ERROR")
            return False
            
        self.test_auth_me()
        self.test_cashier_login()
        
        # Core functionality tests
        self.test_branches()
        self.test_categories_and_products()
        self.test_tables()
        self.test_inventory()
        self.test_orders()
        self.test_create_order()
        self.test_drivers()
        self.test_reports()
        self.test_delivery_apps()
        self.test_settings()
        
        # Print results
        self.print_results()
        
        return self.tests_passed == self.tests_run
    
    def print_results(self):
        """Print test results summary"""
        self.log("=" * 50)
        self.log(f"📊 Test Results: {self.tests_passed}/{self.tests_run} passed")
        
        if self.failed_tests:
            self.log("❌ Failed Tests:")
            for test in self.failed_tests:
                error_msg = test.get('error', f"Expected {test.get('expected')}, got {test.get('actual')}")
                self.log(f"  - {test.get('method', 'N/A')} {test.get('endpoint', 'N/A')}: {error_msg}")
        
        success_rate = (self.tests_passed / self.tests_run * 100) if self.tests_run > 0 else 0
        self.log(f"✅ Success Rate: {success_rate:.1f}%")

def main():
    """Main test execution"""
    tester = MaestroAPITester()
    
    try:
        success = tester.run_all_tests()
        return 0 if success else 1
    except KeyboardInterrupt:
        tester.log("Tests interrupted by user", "WARNING")
        return 1
    except Exception as e:
        tester.log(f"Unexpected error: {str(e)}", "ERROR")
        return 1

if __name__ == "__main__":
    sys.exit(main())