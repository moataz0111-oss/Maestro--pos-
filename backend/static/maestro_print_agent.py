#!/usr/bin/env python3
"""
Maestro EGP - وسيط الطباعة المحلي
===================================
هذا البرنامج يعمل على جهاز نقطة البيع ويقوم بتوصيل
أوامر الطباعة من المتصفح إلى الطابعات المتصلة عبر الشبكة (Ethernet)

التشغيل: python3 maestro_print_agent.py
أو: python maestro_print_agent.py

سيعمل على المنفذ 9999 - لا تغلق هذه النافذة أثناء العمل
"""

import socket
import json
import sys
import time
import threading
from http.server import HTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs

AGENT_PORT = 9999
VERSION = "1.0.0"

# ESC/POS Commands
ESC = b'\x1b'
GS = b'\x1d'
INIT = ESC + b'\x40'           # Initialize printer
CUT = GS + b'\x56\x42\x00'    # Full cut
FEED = ESC + b'\x64\x05'      # Feed 5 lines
CENTER = ESC + b'\x61\x01'    # Center alignment
RIGHT = ESC + b'\x61\x02'     # Right alignment
LEFT = ESC + b'\x61\x00'      # Left alignment
BOLD_ON = ESC + b'\x45\x01'   # Bold on
BOLD_OFF = ESC + b'\x45\x00'  # Bold off
DOUBLE_HEIGHT = ESC + b'\x21\x10'  # Double height
NORMAL_SIZE = ESC + b'\x21\x00'    # Normal size
LF = b'\x0a'                  # Line feed
SEPARATOR = b'--------------------------------' + LF


def send_to_printer(ip, port, data_bytes, timeout=5):
    """Send raw bytes to a network printer via TCP socket"""
    try:
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.settimeout(timeout)
        sock.connect((ip, int(port)))
        sock.sendall(data_bytes)
        sock.close()
        return True, "OK"
    except socket.timeout:
        return False, f"Printer at {ip}:{port} timed out"
    except ConnectionRefusedError:
        return False, f"Connection refused by {ip}:{port}"
    except Exception as e:
        return False, str(e)


def build_test_page(printer_name, ip, port, branch_name=""):
    """Build ESC/POS test page"""
    now = time.strftime("%Y/%m/%d")
    now_time = time.strftime("%H:%M:%S")
    
    data = bytearray()
    data += INIT
    data += CENTER
    data += BOLD_ON + DOUBLE_HEIGHT
    data += "*** اختبار الطابعة ***".encode('utf-8') + LF
    data += NORMAL_SIZE + BOLD_OFF
    data += SEPARATOR
    data += RIGHT
    data += f"الطابعة: {printer_name}".encode('utf-8') + LF
    data += f"IP: {ip}:{port}".encode('utf-8') + LF
    if branch_name:
        data += f"الفرع: {branch_name}".encode('utf-8') + LF
    data += SEPARATOR
    data += f"التاريخ: {now}".encode('utf-8') + LF
    data += f"الوقت: {now_time}".encode('utf-8') + LF
    data += SEPARATOR
    data += CENTER
    data += BOLD_ON
    data += "الطباعة تعمل بنجاح!".encode('utf-8') + LF
    data += BOLD_OFF
    data += "Maestro EGP Print Agent".encode('utf-8') + LF
    data += f"v{VERSION}".encode('utf-8') + LF
    data += FEED + CUT
    return bytes(data)


def build_receipt(order_data, printer_config):
    """Build ESC/POS receipt from order data"""
    data = bytearray()
    data += INIT
    
    show_prices = printer_config.get('show_prices', True)
    restaurant_name = order_data.get('restaurant_name', '')
    order_number = order_data.get('order_number', '')
    items = order_data.get('items', [])
    total = order_data.get('total', 0)
    order_type = order_data.get('order_type', '')
    customer_name = order_data.get('customer_name', '')
    table_number = order_data.get('table_number', '')
    now = time.strftime("%Y/%m/%d %H:%M")
    
    # Header
    data += CENTER
    if restaurant_name:
        data += BOLD_ON + DOUBLE_HEIGHT
        data += restaurant_name.encode('utf-8') + LF
        data += NORMAL_SIZE + BOLD_OFF
    
    data += SEPARATOR
    
    # Order info
    data += RIGHT
    if order_number:
        data += BOLD_ON
        data += f"فاتورة رقم: #{order_number}".encode('utf-8') + LF
        data += BOLD_OFF
    
    data += f"التاريخ: {now}".encode('utf-8') + LF
    
    if order_type == 'dine_in' and table_number:
        data += f"طاولة: {table_number}".encode('utf-8') + LF
    elif order_type == 'takeaway':
        data += "طلب سفري".encode('utf-8') + LF
    elif order_type == 'delivery':
        data += "توصيل".encode('utf-8') + LF
    
    if customer_name:
        data += f"العميل: {customer_name}".encode('utf-8') + LF
    
    data += SEPARATOR
    
    # Items
    data += BOLD_ON
    if show_prices:
        data += "المنتج           الكمية    السعر".encode('utf-8') + LF
    else:
        data += "المنتج                    الكمية".encode('utf-8') + LF
    data += BOLD_OFF
    data += SEPARATOR
    
    for item in items:
        name = item.get('product_name', item.get('name', ''))
        qty = item.get('quantity', 1)
        price = item.get('price', 0)
        notes = item.get('notes', '')
        extras = item.get('extras', [])
        
        if show_prices:
            line = f"{name}  x{qty}  {price * qty:,.0f}".encode('utf-8')
        else:
            data += BOLD_ON + DOUBLE_HEIGHT
            line = f"{name}  x{qty}".encode('utf-8')
        
        data += line + LF
        
        if not show_prices:
            data += NORMAL_SIZE + BOLD_OFF
        
        # Extras
        for extra in extras:
            extra_name = extra.get('name', '')
            if show_prices:
                extra_price = extra.get('price', 0)
                data += f"  + {extra_name}  {extra_price:,.0f}".encode('utf-8') + LF
            else:
                data += f"  + {extra_name}".encode('utf-8') + LF
        
        # Notes
        if notes:
            data += f"  ملاحظة: {notes}".encode('utf-8') + LF
    
    data += SEPARATOR
    
    # Total (only if showing prices)
    if show_prices:
        data += BOLD_ON + DOUBLE_HEIGHT
        data += CENTER
        data += f"الإجمالي: {total:,.0f} IQD".encode('utf-8') + LF
        data += NORMAL_SIZE + BOLD_OFF
        
        discount = order_data.get('discount', 0)
        if discount > 0:
            data += f"الخصم: {discount:,.0f} IQD".encode('utf-8') + LF
            data += BOLD_ON
            data += f"المطلوب: {total - discount:,.0f} IQD".encode('utf-8') + LF
            data += BOLD_OFF
    
    data += SEPARATOR
    
    # Footer
    data += CENTER
    data += "شكراً لزيارتكم".encode('utf-8') + LF
    
    data += FEED + CUT
    return bytes(data)


def check_printer_status(ip, port, timeout=2):
    """Check if a printer is reachable"""
    try:
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.settimeout(timeout)
        sock.connect((ip, int(port)))
        sock.close()
        return True
    except:
        return False


class PrintAgentHandler(BaseHTTPRequestHandler):
    """HTTP handler for print agent requests"""
    
    def log_message(self, format, *args):
        """Override to show Arabic-friendly logs"""
        msg = format % args
        print(f"[{time.strftime('%H:%M:%S')}] {msg}")
    
    def send_cors_headers(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'POST, GET, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, Authorization')
        self.send_header('Access-Control-Max-Age', '86400')
    
    def do_OPTIONS(self):
        self.send_response(200)
        self.send_cors_headers()
        self.end_headers()
    
    def do_GET(self):
        parsed = urlparse(self.path)
        
        if parsed.path == '/status':
            # Health check
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_cors_headers()
            self.end_headers()
            response = {
                "status": "running",
                "version": VERSION,
                "agent": "Maestro Print Agent"
            }
            self.wfile.write(json.dumps(response).encode())
        
        elif parsed.path == '/check-printer':
            # Check if a specific printer is reachable
            params = parse_qs(parsed.query)
            ip = params.get('ip', [''])[0]
            port = params.get('port', ['9100'])[0]
            
            if not ip:
                self.send_response(400)
                self.send_header('Content-Type', 'application/json')
                self.send_cors_headers()
                self.end_headers()
                self.wfile.write(json.dumps({"error": "ip parameter required"}).encode())
                return
            
            is_online = check_printer_status(ip, port)
            
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_cors_headers()
            self.end_headers()
            response = {
                "ip": ip,
                "port": int(port),
                "online": is_online
            }
            self.wfile.write(json.dumps(response).encode())
        
        else:
            self.send_response(404)
            self.send_header('Content-Type', 'application/json')
            self.send_cors_headers()
            self.end_headers()
            self.wfile.write(json.dumps({"error": "not found"}).encode())
    
    def do_POST(self):
        content_length = int(self.headers.get('Content-Length', 0))
        body = json.loads(self.rfile.read(content_length)) if content_length > 0 else {}
        
        parsed = urlparse(self.path)
        
        if parsed.path == '/print-raw':
            # Send raw text to a printer
            ip = body.get('ip', '')
            port = body.get('port', 9100)
            text = body.get('text', '')
            
            if not ip or not text:
                self.send_response(400)
                self.send_header('Content-Type', 'application/json')
                self.send_cors_headers()
                self.end_headers()
                self.wfile.write(json.dumps({"error": "ip and text required"}).encode())
                return
            
            # Build raw data with ESC/POS init and cut
            raw_data = INIT + text.encode('utf-8') + FEED + CUT
            success, message = send_to_printer(ip, port, raw_data)
            
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_cors_headers()
            self.end_headers()
            response = {"success": success, "message": message, "printer": f"{ip}:{port}"}
            self.wfile.write(json.dumps(response).encode())
        
        elif parsed.path == '/print-test':
            # Send test page to a printer
            ip = body.get('ip', '')
            port = body.get('port', 9100)
            printer_name = body.get('name', 'Printer')
            branch_name = body.get('branch_name', '')
            
            if not ip:
                self.send_response(400)
                self.send_header('Content-Type', 'application/json')
                self.send_cors_headers()
                self.end_headers()
                self.wfile.write(json.dumps({"error": "ip required"}).encode())
                return
            
            test_data = build_test_page(printer_name, ip, port, branch_name)
            success, message = send_to_printer(ip, port, test_data)
            
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_cors_headers()
            self.end_headers()
            response = {"success": success, "message": message, "printer": f"{ip}:{port}"}
            self.wfile.write(json.dumps(response).encode())
        
        elif parsed.path == '/print-receipt':
            # Print a formatted receipt
            ip = body.get('ip', '')
            port = body.get('port', 9100)
            order_data = body.get('order', {})
            printer_config = body.get('printer_config', {})
            
            if not ip or not order_data:
                self.send_response(400)
                self.send_header('Content-Type', 'application/json')
                self.send_cors_headers()
                self.end_headers()
                self.wfile.write(json.dumps({"error": "ip and order required"}).encode())
                return
            
            receipt_data = build_receipt(order_data, printer_config)
            success, message = send_to_printer(ip, port, receipt_data)
            
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_cors_headers()
            self.end_headers()
            response = {"success": success, "message": message, "printer": f"{ip}:{port}"}
            self.wfile.write(json.dumps(response).encode())
        
        elif parsed.path == '/print-escpos':
            # Send raw ESC/POS bytes (as hex string or base64)
            ip = body.get('ip', '')
            port = body.get('port', 9100)
            hex_data = body.get('hex_data', '')
            
            if not ip or not hex_data:
                self.send_response(400)
                self.send_header('Content-Type', 'application/json')
                self.send_cors_headers()
                self.end_headers()
                self.wfile.write(json.dumps({"error": "ip and hex_data required"}).encode())
                return
            
            raw_bytes = bytes.fromhex(hex_data)
            success, message = send_to_printer(ip, port, raw_bytes)
            
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_cors_headers()
            self.end_headers()
            response = {"success": success, "message": message}
            self.wfile.write(json.dumps(response).encode())
        
        else:
            self.send_response(404)
            self.send_header('Content-Type', 'application/json')
            self.send_cors_headers()
            self.end_headers()
            self.wfile.write(json.dumps({"error": "not found"}).encode())


def main():
    print("=" * 50)
    print("   Maestro EGP - وسيط الطباعة المحلي")
    print(f"   الإصدار: {VERSION}")
    print("=" * 50)
    print()
    print(f"  جاري التشغيل على المنفذ {AGENT_PORT}...")
    print(f"  الرابط: http://localhost:{AGENT_PORT}")
    print()
    print("  لا تغلق هذه النافذة أثناء العمل!")
    print("  اضغط Ctrl+C للإيقاف")
    print("=" * 50)
    
    try:
        server = HTTPServer(('0.0.0.0', AGENT_PORT), PrintAgentHandler)
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n  تم إيقاف وسيط الطباعة")
        server.server_close()
    except OSError as e:
        if "Address already in use" in str(e):
            print(f"\n  خطأ: المنفذ {AGENT_PORT} مستخدم بالفعل!")
            print("  ربما يوجد نسخة أخرى من وسيط الطباعة تعمل")
        else:
            print(f"\n  خطأ: {e}")
        sys.exit(1)


if __name__ == '__main__':
    main()
