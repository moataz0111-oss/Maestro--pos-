"""
All Pydantic models for the application
"""
from pydantic import BaseModel, ConfigDict, EmailStr
from typing import Optional, List, Dict, Any


# ==================== ENUMS ====================

class UserRole:
    SUPER_ADMIN = "super_admin"
    ADMIN = "admin"
    MANAGER = "manager"
    SUPERVISOR = "supervisor"
    CASHIER = "cashier"
    DELIVERY = "delivery"

class OrderType:
    DINE_IN = "dine_in"
    TAKEAWAY = "takeaway"
    DELIVERY = "delivery"

class OrderStatus:
    PENDING = "pending"
    PREPARING = "preparing"
    READY = "ready"
    DELIVERED = "delivered"
    CANCELLED = "cancelled"

class PaymentMethod:
    CASH = "cash"
    CARD = "card"
    CREDIT = "credit"
    PENDING = "pending"


# ==================== TENANT MODELS ====================

class TenantCreate(BaseModel):
    name: str
    slug: str
    owner_name: str
    owner_email: EmailStr
    owner_phone: str
    subscription_type: str = "trial"
    max_branches: int = 1
    max_users: int = 5

class TenantResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    name: str
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


# ==================== USER MODELS ====================

class UserCreate(BaseModel):
    username: str
    email: EmailStr
    password: str
    full_name: str
    role: str = UserRole.CASHIER
    branch_id: Optional[str] = None
    permissions: List[str] = []
    tenant_id: Optional[str] = None

class UserLogin(BaseModel):
    email: str
    password: str

class UserResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    username: str
    email: str
    full_name: str
    role: str
    branch_id: Optional[str] = None
    permissions: List[str] = []
    is_active: bool = True
    created_at: str
    tenant_id: Optional[str] = None

class UserUpdate(BaseModel):
    full_name: Optional[str] = None
    role: Optional[str] = None
    branch_id: Optional[str] = None
    permissions: Optional[List[str]] = None
    is_active: Optional[bool] = None


# ==================== BRANCH MODELS ====================

class BranchCreate(BaseModel):
    name: str
    address: str
    phone: str
    email: Optional[str] = None

class BranchResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    name: str
    address: str
    phone: str
    email: Optional[str] = None
    is_active: bool = True
    created_at: str


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
    image: Optional[str] = None
    description: Optional[str] = None
    is_available: bool = True
    ingredients: List[Dict[str, Any]] = []
    barcode: Optional[str] = None

class ProductResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    name: str
    name_en: Optional[str] = None
    category_id: str
    price: float
    cost: float = 0.0
    operating_cost: float = 0.0
    profit: float = 0.0
    image: Optional[str] = None
    description: Optional[str] = None
    is_available: bool = True
    ingredients: List[Dict[str, Any]] = []
    barcode: Optional[str] = None


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


# ==================== OPERATING COST MODELS ====================

class OperatingCostCreate(BaseModel):
    name: str
    cost_type: str
    amount: float
    frequency: str
    branch_id: str


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


# ==================== ORDER MODELS ====================

class OrderItemCreate(BaseModel):
    product_id: str
    product_name: str
    quantity: int
    price: float
    cost: float = 0.0
    notes: Optional[str] = None

class OrderCreate(BaseModel):
    order_type: str = OrderType.DINE_IN
    table_id: Optional[str] = None
    customer_name: Optional[str] = None
    customer_phone: Optional[str] = None
    delivery_address: Optional[str] = None
    buzzer_number: Optional[str] = None
    items: List[OrderItemCreate]
    branch_id: str
    payment_method: str = PaymentMethod.CASH
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
    discount: float
    tax: float
    total: float
    total_cost: float = 0.0
    profit: float = 0.0
    branch_id: str
    cashier_id: str
    status: str
    payment_method: str
    payment_status: str
    delivery_app: Optional[str] = None
    delivery_app_name: Optional[str] = None
    delivery_commission: float = 0.0
    driver_id: Optional[str] = None
    notes: Optional[str] = None
    created_at: str
    updated_at: str


# ==================== SHIFT MODELS ====================

class ShiftCreate(BaseModel):
    cashier_id: str
    branch_id: str
    opening_cash: float

class ShiftClose(BaseModel):
    closing_cash: float
    notes: Optional[str] = None

class CashRegisterClose(BaseModel):
    denominations: Dict[str, int] = {}
    notes: Optional[str] = None

class ShiftResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    cashier_id: str
    cashier_name: str
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


# ==================== DRIVER MODELS ====================

class DriverCreate(BaseModel):
    name: str
    phone: str
    branch_id: str
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

class DriverLocationUpdate(BaseModel):
    latitude: float
    longitude: float


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


# ==================== SETTINGS MODELS ====================

class Currency(BaseModel):
    code: str
    name: str
    symbol: str
    exchange_rate: float


# ==================== CALL CENTER MODELS ====================

class CallCenterConfig(BaseModel):
    enabled: bool = False
    provider: str = ""
    api_url: str = ""
    api_key: str = ""
    api_secret: str = ""
    webhook_secret: str = ""
    auto_popup: bool = True
    auto_save_new_callers: bool = True
    play_sound: bool = True

class IncomingCall(BaseModel):
    phone: str
    caller_name: Optional[str] = None


# ==================== HR MODELS ====================

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
    hourly_rate: Optional[float] = None

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
    hourly_rate: Optional[float] = None

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
    hourly_rate: Optional[float] = None

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
    created_at: str

class DeductionCreate(BaseModel):
    employee_id: str
    deduction_type: str
    amount: Optional[float] = None
    hours: Optional[float] = None
    days: Optional[float] = None
    reason: str
    date: str

class DeductionResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    employee_id: str
    employee_name: Optional[str] = None
    deduction_type: str
    amount: float
    hours: Optional[float] = None
    days: Optional[float] = None
    reason: str
    date: str
    created_at: str

class BonusCreate(BaseModel):
    employee_id: str
    bonus_type: str
    amount: Optional[float] = None
    hours: Optional[float] = None
    reason: str
    date: str

class BonusResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    employee_id: str
    employee_name: Optional[str] = None
    bonus_type: str
    amount: float
    hours: Optional[float] = None
    reason: str
    date: str
    created_at: str

class PayrollResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    employee_id: str
    employee_name: Optional[str] = None
    month: str
    basic_salary: float
    total_bonuses: float
    total_deductions: float
    advance_deduction: float
    net_salary: float
    status: str
    created_at: str


class PasswordReset(BaseModel):
    new_password: str
