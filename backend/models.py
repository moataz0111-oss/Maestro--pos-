"""
Shared Models for Maestro POS API
النماذج المشتركة لنظام نقاط البيع
"""
from pydantic import BaseModel, Field, ConfigDict, EmailStr
from typing import List, Optional, Dict, Any
from enum import Enum

# ==================== ENUMS ====================

class UserRole(str, Enum):
    SUPER_ADMIN = "super_admin"
    ADMIN = "admin"
    MANAGER = "manager"
    SUPERVISOR = "supervisor"
    CASHIER = "cashier"
    DELIVERY = "delivery"
    CALL_CENTER = "call_center"
    KITCHEN = "kitchen"
    WAITER = "waiter"

class OrderType(str, Enum):
    DINE_IN = "dine_in"
    TAKEAWAY = "takeaway"
    DELIVERY = "delivery"

class OrderStatus(str, Enum):
    PENDING = "pending"
    PREPARING = "preparing"
    READY = "ready"
    DELIVERED = "delivered"
    CANCELLED = "cancelled"
    ON_WAY = "on_way"
    COMPLETED = "completed"

class PaymentMethod(str, Enum):
    CASH = "cash"
    CARD = "card"
    CREDIT = "credit"
    PENDING = "pending"

class PaymentStatus(str, Enum):
    PENDING = "pending"
    PAID = "paid"
    PARTIAL = "partial"
    REFUNDED = "refunded"

class NotificationType(str, Enum):
    NEW_TENANT = "new_tenant"
    SUBSCRIPTION_EXPIRING = "subscription_expiring"
    SUBSCRIPTION_EXPIRED = "subscription_expired"
    TENANT_ACTIVATED = "tenant_activated"
    TENANT_DEACTIVATED = "tenant_deactivated"
    SYSTEM = "system"
    NEW_ORDER_CASHIER = "new_order_cashier"
    NEW_ORDER_DRIVER = "new_order_driver"
    ORDER_READY = "order_ready"

# ==================== USER MODELS ====================

class UserCreate(BaseModel):
    username: str
    email: EmailStr
    password: str
    full_name: str
    full_name_en: Optional[str] = None
    role: str = "cashier"
    branch_id: Optional[str] = None
    permissions: List[str] = []
    tenant_id: Optional[str] = None

class UserLogin(BaseModel):
    email: str
    password: str

class UserResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    username: Optional[str] = ""
    email: str
    full_name: Optional[str] = ""
    full_name_en: Optional[str] = None
    role: str
    branch_id: Optional[str] = None
    permissions: List[str] = []
    is_active: bool = True
    created_at: str
    tenant_id: Optional[str] = None

class UserUpdate(BaseModel):
    username: Optional[str] = None
    email: Optional[EmailStr] = None
    full_name: Optional[str] = None
    full_name_en: Optional[str] = None
    role: Optional[str] = None
    branch_id: Optional[str] = None
    permissions: Optional[List[str]] = None
    is_active: Optional[bool] = None

class PasswordReset(BaseModel):
    new_password: str

# ==================== TENANT MODELS ====================

class TenantCreate(BaseModel):
    name: str
    name_ar: Optional[str] = None
    name_en: Optional[str] = None
    slug: str
    owner_name: str
    owner_email: EmailStr
    owner_phone: Optional[str] = ""
    subscription_type: str = "trial"
    subscription_duration: int = 1
    max_branches: int = 1
    max_users: int = 5
    logo_url: Optional[str] = None
    is_demo: bool = False

class TenantFeatures(BaseModel):
    showPOS: bool = True
    showTables: bool = True
    showOrders: bool = True
    showExpenses: bool = True
    showInventory: bool = True
    showDelivery: bool = True
    showReports: bool = True
    showSettings: bool = True
    showHR: bool = False
    showWarehouse: bool = False
    showCallLogs: bool = False
    showCallCenter: bool = False
    showKitchen: bool = False
    showLoyalty: bool = True
    showCoupons: bool = True
    showRecipes: bool = True
    showReservations: bool = True
    showReviews: bool = True
    showRatings: bool = True
    showSmartReports: bool = True

class TenantResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    name: str
    name_ar: Optional[str] = None
    name_en: Optional[str] = None
    slug: str
    owner_name: str
    owner_email: str
    owner_phone: str
    subscription_type: str
    max_branches: int
    max_users: int
    is_active: bool
    created_at: str
    expires_at: Optional[str] = None
    logo_url: Optional[str] = None
    subscription_duration: Optional[int] = None

# ==================== BRANCH MODELS ====================

class BranchCreate(BaseModel):
    name: str
    address: str
    phone: str
    email: Optional[str] = None
    rent_cost: float = 0.0
    water_cost: float = 0.0
    electricity_cost: float = 0.0
    generator_cost: float = 0.0
    is_sold_branch: bool = False
    buyer_name: Optional[str] = None
    buyer_phone: Optional[str] = None
    owner_percentage: float = 0.0
    monthly_fee: float = 0.0

class BranchResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    name: str
    address: str
    phone: str
    email: Optional[str] = None
    is_active: bool = True
    created_at: str
    rent_cost: float = 0.0
    water_cost: float = 0.0
    electricity_cost: float = 0.0
    generator_cost: float = 0.0
    is_sold_branch: bool = False
    buyer_name: Optional[str] = None
    buyer_phone: Optional[str] = None
    owner_percentage: float = 0.0
    monthly_fee: float = 0.0

# ==================== CATEGORY MODELS ====================

class CategoryCreate(BaseModel):
    name: str
    name_en: Optional[str] = None
    icon: Optional[str] = None
    image: Optional[str] = None
    color: Optional[str] = None
    sort_order: int = 0

class CategoryResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    name: str
    name_en: Optional[str] = None
    icon: Optional[str] = None
    image: Optional[str] = None
    color: Optional[str] = None
    sort_order: int = 0
    is_active: bool = True

# ==================== PRODUCT MODELS ====================

class ProductCreate(BaseModel):
    name: str
    name_en: Optional[str] = None
    category_id: str
    price: float
    cost: float = 0.0
    operating_cost: float = 0.0
    packaging_cost: float = 0.0
    image: Optional[str] = None
    description: Optional[str] = None
    is_available: bool = True
    ingredients: List[Dict[str, Any]] = []
    barcode: Optional[str] = None
    finished_product_id: Optional[str] = None
    manufactured_product_id: Optional[str] = None
    printer_ids: List[str] = []

class ProductResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    name: str
    name_en: Optional[str] = None
    category_id: str
    price: float
    cost: float = 0.0
    operating_cost: float = 0.0
    packaging_cost: float = 0.0
    profit: float = 0.0
    image: Optional[str] = None
    description: Optional[str] = None
    is_available: bool = True
    ingredients: List[Dict[str, Any]] = []
    barcode: Optional[str] = None
    finished_product_id: Optional[str] = None
    manufactured_product_id: Optional[str] = None
    printer_ids: List[str] = []

# ==================== ORDER MODELS ====================

class OrderItemCreate(BaseModel):
    product_id: str
    product_name: str
    quantity: int
    price: float
    cost: float = 0.0
    notes: Optional[str] = None

class OrderCreate(BaseModel):
    order_type: str = "dine_in"
    table_id: Optional[str] = None
    customer_name: Optional[str] = None
    customer_phone: Optional[str] = None
    delivery_address: Optional[str] = None
    buzzer_number: Optional[str] = None
    items: List[OrderItemCreate]
    branch_id: str
    payment_method: str = "cash"
    discount: float = 0.0
    notes: Optional[str] = None
    delivery_app: Optional[str] = None
    driver_id: Optional[str] = None
    auto_ready: bool = False

class OrderResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    order_number: int
    order_type: str
    table_id: Optional[str] = None
    customer_name: Optional[str] = None
    customer_phone: Optional[str] = None
    delivery_address: Optional[str] = None
    buzzer_number: Optional[str] = None
    items: List[Dict[str, Any]]
    subtotal: float
    discount: float = 0.0
    tax: float = 0.0
    total: float
    total_cost: float = 0.0
    profit: float = 0.0
    branch_id: Optional[str] = None
    cashier_id: Optional[str] = None
    status: str = "pending"
    payment_method: str = "cash"
    payment_status: str = "pending"
    delivery_app: Optional[str] = None
    delivery_app_name: Optional[str] = None
    delivery_commission: float = 0.0
    driver_id: Optional[str] = None
    driver_name: Optional[str] = None
    driver_phone: Optional[str] = None
    notes: Optional[str] = None
    created_at: Optional[str] = None
    updated_at: Optional[str] = None
    tenant_id: Optional[str] = None

# ==================== TABLE MODELS ====================

class TableCreate(BaseModel):
    number: int
    capacity: int
    branch_id: str
    section: Optional[str] = None

class TableResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    number: int
    capacity: int
    branch_id: str
    section: Optional[str] = None
    status: str = "available"
    current_order_id: Optional[str] = None

# ==================== CUSTOMER MODELS ====================

class CustomerCreate(BaseModel):
    name: str
    phone: str
    phone2: Optional[str] = None
    address: Optional[str] = None
    area: Optional[str] = None
    notes: Optional[str] = None
    is_blocked: bool = False

class CustomerResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    name: str
    phone: str
    phone2: Optional[str] = None
    address: Optional[str] = None
    area: Optional[str] = None
    notes: Optional[str] = None
    is_blocked: bool = False
    total_orders: int = 0
    total_spent: float = 0.0
    last_order_date: Optional[str] = None
    created_at: str

# ==================== EMPLOYEE MODELS ====================

class EmployeeCreate(BaseModel):
    name: str
    phone: str
    email: Optional[str] = None
    national_id: Optional[str] = None
    position: str
    department: Optional[str] = None
    branch_id: str
    hire_date: str
    salary: float
    salary_type: str = "monthly"
    work_hours_per_day: float = 8.0
    user_id: Optional[str] = None

class EmployeeResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    name: str
    phone: str
    email: Optional[str] = None
    national_id: Optional[str] = None
    position: str
    department: Optional[str] = None
    branch_id: str
    hire_date: str
    salary: float
    salary_type: str
    work_hours_per_day: float
    user_id: Optional[str] = None
    is_active: bool = True
    created_at: str
    tenant_id: Optional[str] = None

class EmployeeUpdate(BaseModel):
    name: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    national_id: Optional[str] = None
    position: Optional[str] = None
    department: Optional[str] = None
    branch_id: Optional[str] = None
    salary: Optional[float] = None
    salary_type: Optional[str] = None
    work_hours_per_day: Optional[float] = None
    is_active: Optional[bool] = None

# ==================== EXPENSE MODELS ====================

class ExpenseCreate(BaseModel):
    category: str
    description: str
    amount: float
    payment_method: str = "cash"
    reference_number: Optional[str] = None
    branch_id: str
    date: Optional[str] = None

class ExpenseResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    category: str
    description: str
    amount: float
    payment_method: str
    reference_number: Optional[str] = None
    branch_id: str
    created_by: str
    date: str
    created_at: str

# ==================== COUPON MODELS ====================

class CouponCreate(BaseModel):
    code: str
    discount_type: str = "percentage"
    discount_value: float
    min_order_amount: float = 0
    max_uses: int = 0
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    is_active: bool = True

class CouponResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    code: str
    discount_type: str
    discount_value: float
    min_order_amount: float
    max_uses: int
    used_count: int = 0
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    is_active: bool
    created_at: str

# ==================== DRIVER MODELS ====================

class DriverCreate(BaseModel):
    name: str
    phone: str
    branch_id: str
    pin: str = "1234"
    user_id: Optional[str] = None

class DriverResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    name: str
    phone: str
    branch_id: str
    is_available: bool = True
    current_order_id: Optional[str] = None
    total_deliveries: int = 0
    user_id: Optional[str] = None
    location_lat: Optional[float] = None
    location_lng: Optional[float] = None
    location_updated_at: Optional[str] = None
    current_order: Optional[Dict[str, Any]] = None
    is_active: bool = True

class DriverLocationUpdate(BaseModel):
    latitude: float
    longitude: float

# ==================== NOTIFICATION MODELS ====================

class NotificationCreate(BaseModel):
    type: str
    title: str
    message: str
    tenant_id: Optional[str] = None
    data: Optional[dict] = None

class NotificationResponse(BaseModel):
    id: str
    type: str
    title: str
    message: str
    tenant_id: Optional[str] = None
    data: Optional[dict] = None
    is_read: bool = False
    created_at: str

class NotificationSettings(BaseModel):
    days_before_expiry: int = 15
    email_notifications: bool = False
    push_notifications: bool = True
    notify_new_tenant: bool = True
    notify_tenant_status: bool = True

# ==================== STAFF MODELS ====================

class StaffCreate(BaseModel):
    username: str
    email: EmailStr
    password: str
    full_name: str
    full_name_en: Optional[str] = None
    role: str
    branch_id: Optional[str] = None
    permissions: List[str] = []

class StaffResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    username: Optional[str] = ""
    email: str
    full_name: Optional[str] = ""
    full_name_en: Optional[str] = None
    role: str
    branch_id: Optional[str] = None
    permissions: List[str] = []
    is_active: bool = True
    created_at: str
    tenant_id: Optional[str] = None

# ==================== ATTENDANCE MODELS ====================

class AttendanceCreate(BaseModel):
    employee_id: str
    date: str
    check_in: Optional[str] = None
    check_out: Optional[str] = None
    status: str = "present"
    notes: Optional[str] = None
    source: str = "manual"

class AttendanceResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    employee_id: str
    employee_name: Optional[str] = None
    date: str
    check_in: Optional[str] = None
    check_out: Optional[str] = None
    worked_hours: Optional[float] = None
    status: str
    notes: Optional[str] = None
    source: str
    created_at: str

# ==================== ADVANCE MODELS ====================

class AdvanceCreate(BaseModel):
    employee_id: str
    amount: float
    reason: Optional[str] = None
    deduction_months: int = 1
    date: Optional[str] = None

class AdvanceResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    employee_id: str
    employee_name: Optional[str] = None
    amount: float
    remaining_amount: float
    deducted_amount: float = 0
    deduction_months: int
    monthly_deduction: float
    reason: Optional[str] = None
    status: str
    date: str
    created_by: str
    created_at: str

# ==================== INVENTORY MODELS ====================

class InventoryItemCreate(BaseModel):
    name: str
    name_en: Optional[str] = None
    unit: str
    quantity: float = 0.0
    min_quantity: float = 0.0
    cost_per_unit: float = 0.0
    branch_id: str
    item_type: str = "raw"

class InventoryResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    name: str
    name_en: Optional[str] = None
    unit: str
    quantity: float
    min_quantity: float
    cost_per_unit: float
    branch_id: str
    item_type: str
    last_updated: str

class InventoryTransaction(BaseModel):
    inventory_id: str
    transaction_type: str
    quantity: float
    notes: Optional[str] = None

# ==================== PURCHASE MODELS ====================

class PurchaseCreate(BaseModel):
    supplier_name: str
    invoice_number: Optional[str] = None
    items: List[Dict[str, Any]]
    total_amount: float
    payment_method: str = "cash"
    payment_status: str = "paid"
    notes: Optional[str] = None
    branch_id: str

class PurchaseResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    supplier_name: str
    invoice_number: Optional[str] = None
    items: List[Dict[str, Any]]
    total_amount: float
    payment_method: str
    payment_status: str
    notes: Optional[str] = None
    branch_id: str
    created_by: str
    created_at: str

# ==================== SHIFT MODELS ====================

class ShiftCreate(BaseModel):
    cashier_id: str
    branch_id: str
    opening_cash: float

class ShiftClose(BaseModel):
    closing_cash: float
    notes: Optional[str] = None

class ShiftResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    cashier_id: str
    cashier_name: Optional[str] = ""
    branch_id: str
    opening_cash: float
    closing_cash: Optional[float] = None
    expected_cash: Optional[float] = None
    cash_difference: Optional[float] = None
    total_sales: float = 0.0
    total_cost: float = 0.0
    gross_profit: float = 0.0
    total_orders: int = 0
    card_sales: float = 0.0
    cash_sales: float = 0.0
    credit_sales: float = 0.0
    delivery_app_sales: Dict[str, float] = {}
    driver_sales: float = 0.0
    total_expenses: float = 0.0
    net_profit: float = 0.0
    started_at: str
    ended_at: Optional[str] = None
    status: str
    denominations: Optional[Dict[str, int]] = None
    cancelled_orders: int = 0
    cancelled_amount: float = 0.0
    discounts_total: float = 0.0
    cancelled_by: List[Dict] = []

# ==================== OPERATING COST MODELS ====================

class OperatingCostCreate(BaseModel):
    name: str
    cost_type: str
    amount: float
    frequency: str
    branch_id: str

# ==================== DELIVERY APP SETTINGS ====================

class DeliveryAppSettingCreate(BaseModel):
    app_id: str
    name: str
    name_en: Optional[str] = None
    commission_type: str = "percentage"
    commission_rate: float = 0.0
    is_active: bool = True
    payment_terms: str = "weekly"
    contact_info: Optional[str] = None

# ==================== INVENTORY TRANSFER MODELS ====================

class InventoryTransferCreate(BaseModel):
    from_branch_id: str
    to_branch_id: str
    items: List[Dict[str, Any]]
    transfer_type: str = "warehouse_to_branch"
    notes: Optional[str] = None

class InventoryTransferResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    transfer_number: int
    from_branch_id: str
    from_branch_name: Optional[str] = None
    to_branch_id: str
    to_branch_name: Optional[str] = None
    items: List[Dict[str, Any]]
    transfer_type: str
    status: str
    notes: Optional[str] = None
    created_by: str
    created_at: str
    approved_by: Optional[str] = None
    approved_at: Optional[str] = None
    received_by: Optional[str] = None
    received_at: Optional[str] = None

# ==================== PURCHASE REQUEST MODELS ====================

class PurchaseRequestCreate(BaseModel):
    branch_id: str
    items: List[Dict[str, Any]]
    priority: str = "normal"
    notes: Optional[str] = None

class PurchaseRequestResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    request_number: int
    branch_id: str
    branch_name: Optional[str] = None
    items: List[Dict[str, Any]]
    priority: str
    status: str
    notes: Optional[str] = None
    created_by: str
    created_at: str
    approved_by: Optional[str] = None
    approved_at: Optional[str] = None

# ==================== PROMOTION MODELS ====================

class PromotionCreate(BaseModel):
    name: str
    description: Optional[str] = None
    discount_type: str = "percentage"
    discount_value: float
    applies_to: str = "all"
    product_ids: List[str] = []
    category_ids: List[str] = []
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    is_active: bool = True

class PromotionResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    name: str
    description: Optional[str] = None
    discount_type: str
    discount_value: float
    applies_to: str
    product_ids: List[str] = []
    category_ids: List[str] = []
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    is_active: bool
    created_at: str

# ==================== PRINTER MODELS ====================

class PrinterCreate(BaseModel):
    name: str
    type: str = "thermal"
    ip_address: Optional[str] = None
    port: int = 9100
    is_default: bool = False
    branch_id: Optional[str] = None

class PrinterResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    name: str
    type: str
    ip_address: Optional[str] = None
    port: int
    is_default: bool
    branch_id: Optional[str] = None
    is_active: bool = True

# ==================== INVOICE TEMPLATE MODELS ====================

class InvoiceTemplateCreate(BaseModel):
    name: str
    template_type: str = "customer"
    header_text: Optional[str] = None
    footer_text: Optional[str] = None
    show_logo: bool = True
    show_qr: bool = False
    font_size: int = 12

class InvoiceTemplateResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    name: str
    template_type: str
    header_text: Optional[str] = None
    footer_text: Optional[str] = None
    show_logo: bool
    show_qr: bool
    font_size: int
    is_default: bool = False

# ==================== FCM MODELS ====================

class FCMTokenCreate(BaseModel):
    token: str
    device_type: str = "web"

class SendNotificationRequest(BaseModel):
    user_id: Optional[str] = None
    title: str
    body: str
    data: Optional[Dict[str, Any]] = None

# ==================== DAY MANAGEMENT MODELS ====================

class DayCloseResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    date: str
    branch_id: str
    total_sales: float
    total_cost: float
    gross_profit: float
    total_expenses: float
    net_profit: float
    total_orders: int
    closed_at: str
    closed_by: str

# ==================== RAW MATERIAL MODELS ====================

class RawMaterialCreate(BaseModel):
    name: str
    name_en: Optional[str] = None
    category: str
    unit: str
    cost_per_unit: float = 0.0
    quantity: float = 0.0
    min_quantity: float = 0.0

# ==================== RECIPE MODELS ====================

class RecipeCreate(BaseModel):
    product_id: str
    ingredients: List[Dict[str, Any]]
    yield_quantity: float = 1.0
    notes: Optional[str] = None

# ==================== PUSH SUBSCRIPTION ====================

class PushSubscription(BaseModel):
    endpoint: str
    keys: Dict[str, str]
    phone: Optional[str] = None
    user_type: Optional[str] = None

# ==================== ORDER RATING ====================

class OrderRating(BaseModel):
    order_id: str
    rating: int
    comment: Optional[str] = None
    phone: Optional[str] = None

# ==================== CUSTOMER AUTH ====================

class CustomerRegister(BaseModel):
    name: str
    phone: str
    password: str
    address: Optional[str] = None

class CustomerLogin(BaseModel):
    phone: str
    password: str

# ==================== FAVORITES ====================

class AddFavoriteRequest(BaseModel):
    product_id: str
    tenant_id: str
    customer_token: str
