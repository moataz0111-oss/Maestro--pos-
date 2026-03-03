"""
Invoice Customization & Printing System
نظام تخصيص الفواتير والطباعة
"""
from fastapi import APIRouter, HTTPException, Depends, Response
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
from datetime import datetime, timezone
import uuid
import base64

router = APIRouter(prefix="/invoices", tags=["Invoices & Printing"])

# ==================== MODELS ====================

class PrinterConfig(BaseModel):
    """إعدادات الطابعة"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    printer_type: str = "thermal"  # thermal, laser, inkjet
    paper_width: int = 80  # 58mm, 80mm, A4
    connection_type: str = "usb"  # usb, network, bluetooth
    ip_address: Optional[str] = None
    port: int = 9100
    branch_id: str
    is_default: bool = False
    is_active: bool = True
    tenant_id: Optional[str] = None
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

class PrinterCreate(BaseModel):
    """إنشاء طابعة"""
    name: str
    printer_type: str = "thermal"
    paper_width: int = 80
    connection_type: str = "usb"
    ip_address: Optional[str] = None
    port: int = 9100
    branch_id: str
    is_default: bool = False

class InvoiceTemplate(BaseModel):
    """قالب الفاتورة"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    template_type: str = "receipt"  # receipt, invoice, kitchen, delivery
    
    # Header Settings
    show_logo: bool = True
    logo_url: Optional[str] = None
    logo_width: int = 150  # بالبكسل
    business_name: str = ""
    business_name_en: Optional[str] = None
    address: Optional[str] = None
    phone: Optional[str] = None
    tax_number: Optional[str] = None
    
    # Content Settings
    show_customer_info: bool = True
    show_order_number: bool = True
    show_table_number: bool = True
    show_waiter_name: bool = False
    show_item_notes: bool = True
    show_item_prices: bool = True
    show_subtotal: bool = True
    show_discount: bool = True
    show_tax: bool = True
    show_service_charge: bool = False
    service_charge_percent: float = 0
    
    # Footer Settings
    footer_text: Optional[str] = None
    footer_text_en: Optional[str] = None
    show_qr_code: bool = False
    qr_code_data: Optional[str] = None  # رابط أو نص
    show_social_media: bool = False
    social_links: Dict[str, str] = {}
    
    # Style Settings
    font_size: str = "medium"  # small, medium, large
    text_alignment: str = "center"  # left, center, right
    language: str = "ar"  # ar, en, both
    
    # Advanced
    paper_width: int = 80
    margin_top: int = 5
    margin_bottom: int = 10
    line_spacing: float = 1.2
    
    branch_id: Optional[str] = None
    tenant_id: Optional[str] = None
    is_default: bool = False
    is_active: bool = True
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    updated_at: Optional[str] = None

class InvoiceTemplateCreate(BaseModel):
    """إنشاء قالب فاتورة"""
    name: str
    template_type: str = "receipt"
    show_logo: bool = True
    logo_url: Optional[str] = None
    business_name: str = ""
    business_name_en: Optional[str] = None
    address: Optional[str] = None
    phone: Optional[str] = None
    tax_number: Optional[str] = None
    footer_text: Optional[str] = None
    show_qr_code: bool = False
    paper_width: int = 80
    branch_id: Optional[str] = None
    is_default: bool = False

class PrintJob(BaseModel):
    """مهمة طباعة"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    printer_id: str
    template_id: str
    order_id: str
    print_type: str  # customer, kitchen, delivery
    copies: int = 1
    status: str = "pending"  # pending, printing, completed, failed
    error_message: Optional[str] = None
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    completed_at: Optional[str] = None

class PrintRequest(BaseModel):
    """طلب طباعة"""
    order_id: str
    print_type: str = "customer"  # customer, kitchen, delivery
    printer_id: Optional[str] = None
    copies: int = 1

# ==================== ESC/POS COMMANDS ====================

class ESCPOSCommands:
    """أوامر ESC/POS للطابعات الحرارية"""
    
    # Initialize printer
    INIT = b'\x1b\x40'
    
    # Text formatting
    BOLD_ON = b'\x1b\x45\x01'
    BOLD_OFF = b'\x1b\x45\x00'
    UNDERLINE_ON = b'\x1b\x2d\x01'
    UNDERLINE_OFF = b'\x1b\x2d\x00'
    DOUBLE_HEIGHT = b'\x1b\x21\x10'
    DOUBLE_WIDTH = b'\x1b\x21\x20'
    DOUBLE_SIZE = b'\x1b\x21\x30'
    NORMAL_SIZE = b'\x1b\x21\x00'
    
    # Alignment
    ALIGN_LEFT = b'\x1b\x61\x00'
    ALIGN_CENTER = b'\x1b\x61\x01'
    ALIGN_RIGHT = b'\x1b\x61\x02'
    
    # Feed & Cut
    FEED_LINE = b'\x0a'
    FEED_LINES = lambda n: b'\x1b\x64' + bytes([n])
    PARTIAL_CUT = b'\x1d\x56\x01'
    FULL_CUT = b'\x1d\x56\x00'
    
    # Cash drawer
    OPEN_DRAWER = b'\x1b\x70\x00\x19\xfa'
    
    # Arabic support
    ARABIC_MODE = b'\x1b\x52\x15'  # Code page Arabic
    
    # Line separator
    LINE_SEPARATOR = b'-' * 32 + b'\n'
    DOUBLE_LINE = b'=' * 32 + b'\n'

# ==================== RECEIPT GENERATOR ====================

def generate_thermal_receipt(order: Dict, template: Dict, paper_width: int = 80) -> bytes:
    """توليد بيانات الفاتورة للطابعة الحرارية"""
    esc = ESCPOSCommands
    
    # حساب عرض السطر (حروف)
    chars_per_line = 32 if paper_width == 58 else 48
    
    receipt = bytearray()
    
    # Initialize
    receipt.extend(esc.INIT)
    receipt.extend(esc.ARABIC_MODE)
    receipt.extend(esc.ALIGN_CENTER)
    
    # Header - Business Name
    if template.get("business_name"):
        receipt.extend(esc.DOUBLE_SIZE)
        receipt.extend(template["business_name"].encode('utf-8'))
        receipt.extend(esc.FEED_LINE)
        receipt.extend(esc.NORMAL_SIZE)
    
    if template.get("business_name_en"):
        receipt.extend(template["business_name_en"].encode('utf-8'))
        receipt.extend(esc.FEED_LINE)
    
    # Address & Phone
    if template.get("address"):
        receipt.extend(template["address"].encode('utf-8'))
        receipt.extend(esc.FEED_LINE)
    
    if template.get("phone"):
        receipt.extend(f"هاتف: {template['phone']}".encode('utf-8'))
        receipt.extend(esc.FEED_LINE)
    
    # Tax Number
    if template.get("tax_number"):
        receipt.extend(f"الرقم الضريبي: {template['tax_number']}".encode('utf-8'))
        receipt.extend(esc.FEED_LINE)
    
    # Separator
    receipt.extend(esc.DOUBLE_LINE)
    
    # Order Info
    receipt.extend(esc.ALIGN_RIGHT)
    receipt.extend(f"رقم الطلب: {order.get('order_number', '')}".encode('utf-8'))
    receipt.extend(esc.FEED_LINE)
    receipt.extend(f"التاريخ: {order.get('date', '')}".encode('utf-8'))
    receipt.extend(esc.FEED_LINE)
    
    if order.get("table_number") and template.get("show_table_number"):
        receipt.extend(f"الطاولة: {order['table_number']}".encode('utf-8'))
        receipt.extend(esc.FEED_LINE)
    
    if order.get("customer_name") and template.get("show_customer_info"):
        receipt.extend(f"العميل: {order['customer_name']}".encode('utf-8'))
        receipt.extend(esc.FEED_LINE)
    
    # Separator
    receipt.extend(esc.LINE_SEPARATOR)
    
    # Items Header
    receipt.extend(esc.BOLD_ON)
    header = "الصنف".ljust(20) + "الكمية".center(6) + "السعر".ljust(8)
    receipt.extend(header.encode('utf-8'))
    receipt.extend(esc.FEED_LINE)
    receipt.extend(esc.BOLD_OFF)
    receipt.extend(esc.LINE_SEPARATOR)
    
    # Items
    for item in order.get("items", []):
        name = item.get("name", "")[:20].ljust(20)
        qty = str(item.get("quantity", 1)).center(6)
        price = f"{item.get('total', 0):.2f}".ljust(8)
        line = f"{name}{qty}{price}"
        receipt.extend(line.encode('utf-8'))
        receipt.extend(esc.FEED_LINE)
        
        # Item notes
        if item.get("notes") and template.get("show_item_notes"):
            receipt.extend(f"  ملاحظة: {item['notes']}".encode('utf-8'))
            receipt.extend(esc.FEED_LINE)
    
    # Separator
    receipt.extend(esc.LINE_SEPARATOR)
    
    # Totals
    receipt.extend(esc.ALIGN_LEFT)
    
    if template.get("show_subtotal"):
        subtotal = order.get("subtotal", 0)
        receipt.extend(f"المجموع الفرعي: {subtotal:.2f}".encode('utf-8'))
        receipt.extend(esc.FEED_LINE)
    
    if template.get("show_discount") and order.get("discount", 0) > 0:
        discount = order.get("discount", 0)
        receipt.extend(f"الخصم: -{discount:.2f}".encode('utf-8'))
        receipt.extend(esc.FEED_LINE)
    
    if template.get("show_tax") and order.get("tax", 0) > 0:
        tax = order.get("tax", 0)
        receipt.extend(f"الضريبة: {tax:.2f}".encode('utf-8'))
        receipt.extend(esc.FEED_LINE)
    
    if template.get("show_service_charge") and order.get("service_charge", 0) > 0:
        service = order.get("service_charge", 0)
        receipt.extend(f"رسوم الخدمة: {service:.2f}".encode('utf-8'))
        receipt.extend(esc.FEED_LINE)
    
    # Total
    receipt.extend(esc.DOUBLE_LINE)
    receipt.extend(esc.BOLD_ON)
    receipt.extend(esc.DOUBLE_SIZE)
    total = order.get("total", 0)
    receipt.extend(f"الإجمالي: {total:.2f} د.ع".encode('utf-8'))
    receipt.extend(esc.FEED_LINE)
    receipt.extend(esc.NORMAL_SIZE)
    receipt.extend(esc.BOLD_OFF)
    
    # Payment method
    payment_method = order.get("payment_method", "cash")
    payment_names = {"cash": "نقداً", "card": "بطاقة", "wallet": "محفظة"}
    receipt.extend(f"طريقة الدفع: {payment_names.get(payment_method, payment_method)}".encode('utf-8'))
    receipt.extend(esc.FEED_LINE)
    
    # Footer
    receipt.extend(esc.DOUBLE_LINE)
    receipt.extend(esc.ALIGN_CENTER)
    
    if template.get("footer_text"):
        receipt.extend(template["footer_text"].encode('utf-8'))
        receipt.extend(esc.FEED_LINE)
    
    if template.get("footer_text_en"):
        receipt.extend(template["footer_text_en"].encode('utf-8'))
        receipt.extend(esc.FEED_LINE)
    
    # Default thank you message
    receipt.extend("شكراً لزيارتكم".encode('utf-8'))
    receipt.extend(esc.FEED_LINE)
    receipt.extend("Thank you for visiting".encode('utf-8'))
    receipt.extend(esc.FEED_LINE)
    
    # Feed and cut
    receipt.extend(esc.FEED_LINES(3))
    receipt.extend(esc.PARTIAL_CUT)
    
    return bytes(receipt)

def generate_kitchen_ticket(order: Dict, paper_width: int = 80) -> bytes:
    """توليد تذكرة المطبخ"""
    esc = ESCPOSCommands
    
    ticket = bytearray()
    
    # Initialize
    ticket.extend(esc.INIT)
    ticket.extend(esc.ARABIC_MODE)
    ticket.extend(esc.ALIGN_CENTER)
    
    # Header
    ticket.extend(esc.DOUBLE_SIZE)
    ticket.extend(esc.BOLD_ON)
    ticket.extend("طلب مطبخ".encode('utf-8'))
    ticket.extend(esc.FEED_LINE)
    ticket.extend(esc.NORMAL_SIZE)
    ticket.extend(esc.BOLD_OFF)
    
    # Order info
    ticket.extend(esc.DOUBLE_LINE)
    ticket.extend(esc.DOUBLE_HEIGHT)
    ticket.extend(f"رقم: {order.get('order_number', '')}".encode('utf-8'))
    ticket.extend(esc.FEED_LINE)
    
    order_type = order.get("order_type", "dine_in")
    type_names = {"dine_in": "محلي", "takeaway": "سفري", "delivery": "توصيل"}
    ticket.extend(f"النوع: {type_names.get(order_type, order_type)}".encode('utf-8'))
    ticket.extend(esc.FEED_LINE)
    
    if order.get("table_number"):
        ticket.extend(esc.BOLD_ON)
        ticket.extend(f"الطاولة: {order['table_number']}".encode('utf-8'))
        ticket.extend(esc.BOLD_OFF)
        ticket.extend(esc.FEED_LINE)
    
    ticket.extend(esc.NORMAL_SIZE)
    ticket.extend(f"الوقت: {order.get('time', '')}".encode('utf-8'))
    ticket.extend(esc.FEED_LINE)
    
    # Items
    ticket.extend(esc.DOUBLE_LINE)
    ticket.extend(esc.ALIGN_RIGHT)
    
    for item in order.get("items", []):
        ticket.extend(esc.BOLD_ON)
        ticket.extend(esc.DOUBLE_HEIGHT)
        ticket.extend(f"{item.get('quantity', 1)}x {item.get('name', '')}".encode('utf-8'))
        ticket.extend(esc.FEED_LINE)
        ticket.extend(esc.NORMAL_SIZE)
        ticket.extend(esc.BOLD_OFF)
        
        if item.get("notes"):
            ticket.extend(f"   *** {item['notes']} ***".encode('utf-8'))
            ticket.extend(esc.FEED_LINE)
        
        if item.get("modifiers"):
            for mod in item["modifiers"]:
                ticket.extend(f"   + {mod}".encode('utf-8'))
                ticket.extend(esc.FEED_LINE)
    
    # Special notes
    if order.get("notes"):
        ticket.extend(esc.DOUBLE_LINE)
        ticket.extend(esc.BOLD_ON)
        ticket.extend(f"ملاحظات: {order['notes']}".encode('utf-8'))
        ticket.extend(esc.BOLD_OFF)
        ticket.extend(esc.FEED_LINE)
    
    # Feed and cut
    ticket.extend(esc.FEED_LINES(3))
    ticket.extend(esc.PARTIAL_CUT)
    
    return bytes(ticket)

# ==================== DEFAULT TEMPLATE ====================

DEFAULT_TEMPLATE = InvoiceTemplate(
    name="القالب الافتراضي",
    template_type="receipt",
    show_logo=True,
    business_name="",
    footer_text="شكراً لزيارتكم - نتمنى لكم يوماً سعيداً",
    footer_text_en="Thank you for your visit",
    paper_width=80,
    is_default=True
)
