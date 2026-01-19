"""
Base Models - النماذج الأساسية
جميع نماذج Pydantic المستخدمة في النظام
"""

from pydantic import BaseModel, EmailStr, ConfigDict
from typing import Optional, List, Dict, Any

# ==================== ENUMS ====================

class UserRole:
    SUPER_ADMIN = "super_admin"
    ADMIN = "admin"
    MANAGER = "manager"
    BRANCH_MANAGER = "branch_manager"
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
    name_ar: Optional[str] = None
    name_en: Optional[str] = None
    slug: str
    owner_name: str
    owner_email: EmailStr
    owner_phone: str
    subscription_type: str = "trial"
    max_branches: int = 1
    max_users: int = 5
    logo_url: Optional[str] = None

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
    username: Optional[str] = None
    email: Optional[EmailStr] = None
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
    finished_product_id: Optional[str] = None

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
    finished_product_id: Optional[str] = None

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

# ==================== ORDER MODELS ====================

class OrderItemCreate(BaseModel):
    product_id: str
    quantity: int
    price: float
    notes: Optional[str] = None

class OrderCreate(BaseModel):
    items: List[OrderItemCreate]
    table_id: Optional[str] = None
    customer_name: Optional[str] = None
    customer_phone: Optional[str] = None
    order_type: str = OrderType.DINE_IN
    payment_method: str = PaymentMethod.CASH
    discount: float = 0.0
    discount_type: str = "percentage"
    discount_reason: Optional[str] = None
    notes: Optional[str] = None
    branch_id: str
    delivery_address: Optional[str] = None
    delivery_app_id: Optional[str] = None

class OrderResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    order_number: int
    items: List[Dict[str, Any]]
    subtotal: float
    discount: float = 0.0
    discount_type: str = "percentage"
    discount_reason: Optional[str] = None
    total: float
    table_id: Optional[str] = None
    customer_name: Optional[str] = None
    customer_phone: Optional[str] = None
    order_type: str
    status: str
    payment_method: str
    notes: Optional[str] = None
    branch_id: str
    created_by: str
    created_at: str
    delivery_address: Optional[str] = None
    delivery_app_id: Optional[str] = None

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
    created_at: str

# ==================== SHIFT MODELS ====================

class ShiftCreate(BaseModel):
    opening_amount: float
    branch_id: str

class ShiftClose(BaseModel):
    closing_amount: float
    notes: Optional[str] = None

class ShiftResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    user_id: str
    branch_id: str
    opening_amount: float
    closing_amount: Optional[float] = None
    expected_amount: Optional[float] = None
    difference: Optional[float] = None
    status: str
    opened_at: str
    closed_at: Optional[str] = None
    notes: Optional[str] = None
    orders_count: int = 0
    total_sales: float = 0.0
    cash_sales: float = 0.0
    card_sales: float = 0.0
    expenses: float = 0.0

# ==================== DRIVER MODELS ====================

class DriverCreate(BaseModel):
    name: str
    phone: str
    vehicle_type: str = "motorcycle"
    vehicle_number: Optional[str] = None
    branch_id: Optional[str] = None

class DriverResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    name: str
    phone: str
    vehicle_type: str
    vehicle_number: Optional[str] = None
    is_active: bool = True
    is_available: bool = True
    current_orders: int = 0
    total_deliveries: int = 0
    branch_id: Optional[str] = None
    created_at: str

class DriverLocationUpdate(BaseModel):
    latitude: float
    longitude: float
    accuracy: Optional[float] = None

# ==================== FINISHED PRODUCTS MODELS ====================

class FinishedProductCreate(BaseModel):
    name: str
    name_en: Optional[str] = None
    unit: str = "قطعة"
    quantity: float = 0.0
    min_quantity: float = 0.0
    cost_per_unit: float = 0.0
    selling_price: float = 0.0
    recipe: List[Dict[str, Any]] = []
    description: Optional[str] = None
    category: str = "general"

class FinishedProductUpdate(BaseModel):
    name: Optional[str] = None
    name_en: Optional[str] = None
    unit: Optional[str] = None
    quantity: Optional[float] = None
    min_quantity: Optional[float] = None
    selling_price: Optional[float] = None
    recipe: Optional[List[Dict[str, Any]]] = None
    description: Optional[str] = None
    category: Optional[str] = None
    is_active: Optional[bool] = None

# ==================== BRANCH ORDER MODELS ====================

class BranchOrderCreate(BaseModel):
    to_branch_id: str
    items: List[Dict[str, Any]]
    priority: str = "normal"
    notes: Optional[str] = None

class BranchOrderStatusUpdate(BaseModel):
    status: str
    notes: Optional[str] = None
