# Order Models - نماذج الطلبات والعملاء
from pydantic import BaseModel, ConfigDict, EmailStr
from typing import List, Optional, Dict, Any
from .base_models import OrderType, PaymentMethod

# ==================== BRANCH MODELS ====================

class BranchCreate(BaseModel):
    """نموذج إنشاء فرع"""
    name: str
    address: str
    phone: str
    email: Optional[str] = None

class BranchResponse(BaseModel):
    """نموذج استجابة الفرع"""
    model_config = ConfigDict(extra="ignore")
    id: str
    name: str
    address: str
    phone: str
    email: Optional[str] = None
    is_active: bool = True
    created_at: str

# ==================== CATEGORY & PRODUCT MODELS ====================

class CategoryCreate(BaseModel):
    """نموذج إنشاء فئة"""
    name: str
    name_en: Optional[str] = None
    icon: Optional[str] = None
    image: Optional[str] = None
    color: Optional[str] = None
    sort_order: int = 0

class CategoryResponse(BaseModel):
    """نموذج استجابة الفئة"""
    model_config = ConfigDict(extra="ignore")
    id: str
    name: str
    name_en: Optional[str] = None
    icon: Optional[str] = None
    image: Optional[str] = None
    color: Optional[str] = None
    sort_order: int = 0
    is_active: bool = True

class ProductCreate(BaseModel):
    """نموذج إنشاء منتج"""
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
    """نموذج استجابة المنتج"""
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

# ==================== TABLE MODELS ====================

class TableCreate(BaseModel):
    """نموذج إنشاء طاولة"""
    number: int
    capacity: int
    branch_id: str
    section: Optional[str] = None

class TableResponse(BaseModel):
    """نموذج استجابة الطاولة"""
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
    """نموذج إنشاء عميل"""
    name: str
    phone: str
    phone2: Optional[str] = None
    address: Optional[str] = None
    area: Optional[str] = None
    notes: Optional[str] = None
    is_blocked: bool = False

class CustomerResponse(BaseModel):
    """نموذج استجابة العميل"""
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
    """نموذج عنصر الطلب"""
    product_id: str
    product_name: str
    quantity: int
    price: float
    cost: float = 0.0
    notes: Optional[str] = None

class OrderCreate(BaseModel):
    """نموذج إنشاء طلب"""
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
    """نموذج استجابة الطلب"""
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
    cashier_id: Optional[str] = None
    status: str
    payment_method: str
    payment_status: str
    delivery_app: Optional[str] = None
    delivery_app_name: Optional[str] = None
    delivery_commission: float = 0.0
    driver_id: Optional[str] = None
    driver_name: Optional[str] = None
    driver_phone: Optional[str] = None
    notes: Optional[str] = None
    created_at: str
    updated_at: Optional[str] = None

# ==================== DRIVER MODELS ====================

class DriverCreate(BaseModel):
    """نموذج إنشاء سائق"""
    name: str
    phone: str
    branch_id: str
    user_id: Optional[str] = None

class DriverResponse(BaseModel):
    """نموذج استجابة السائق"""
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
    """نموذج تحديث موقع السائق"""
    latitude: float
    longitude: float

# ==================== DELIVERY APP SETTINGS ====================

class DeliveryAppSettingCreate(BaseModel):
    """نموذج إعدادات شركات التوصيل"""
    app_id: str
    name: str
    name_en: Optional[str] = None
    commission_type: str = "percentage"
    commission_rate: float = 0.0
    is_active: bool = True
    payment_terms: str = "weekly"
    contact_info: Optional[str] = None
