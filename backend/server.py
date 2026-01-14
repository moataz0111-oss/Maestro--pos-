from fastapi import FastAPI, APIRouter, HTTPException, Depends, Request, BackgroundTasks
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field, ConfigDict, EmailStr
from typing import List, Optional, Dict, Any
import uuid
from datetime import datetime, timezone, timedelta
import bcrypt
import jwt
from sendgrid import SendGridAPIClient
from sendgrid.helpers.mail import Mail

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# JWT Configuration
JWT_SECRET = os.environ.get('JWT_SECRET')
if not JWT_SECRET:
    raise ValueError("JWT_SECRET environment variable is required")
JWT_ALGORITHM = 'HS256'
JWT_EXPIRATION_HOURS = 24

# SendGrid Configuration
SENDGRID_API_KEY = os.environ.get('SENDGRID_API_KEY', '')
SENDER_EMAIL = os.environ.get('SENDER_EMAIL', 'noreply@maestroegp.com')

app = FastAPI(title="Maestro EGP API", version="2.0.0")
api_router = APIRouter(prefix="/api")
security = HTTPBearer()

# ==================== HEALTH CHECK ====================

@app.get("/")
def read_root():
    return {"status": "Server is running successfully 🚀", "app": "Maestro EGP", "version": "2.0.0"}

@app.get("/health")
def health_check():
    return {"status": "ok"}

@api_router.get("/health")
def api_health_check():
    return {"status": "ok", "api": "Maestro EGP API"}

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# ==================== MODELS ====================

class UserRole:
    SUPER_ADMIN = "super_admin"  # مالك النظام الرئيسي
    ADMIN = "admin"
    MANAGER = "manager"
    SUPERVISOR = "supervisor"
    CASHIER = "cashier"
    DELIVERY = "delivery"  # دور جديد للسائقين

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

# ==================== TENANT MODELS (Multi-tenant) ====================

class TenantCreate(BaseModel):
    name: str  # اسم المطعم/الكافيه
    slug: str  # رابط فريد (مثل: my-restaurant)
    owner_name: str  # اسم المالك
    owner_email: EmailStr
    owner_phone: str
    subscription_type: str = "trial"  # trial, basic, premium
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

# User Models
class UserCreate(BaseModel):
    username: str
    email: EmailStr
    password: str
    full_name: str
    role: str = UserRole.CASHIER
    branch_id: Optional[str] = None
    permissions: List[str] = []
    tenant_id: Optional[str] = None  # للنظام متعدد المستأجرين

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

# Branch Models
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

# Category Models
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

# Product Models with Pre-Manufacturing Cost
class ProductCreate(BaseModel):
    name: str
    name_en: Optional[str] = None
    category_id: str
    price: float
    cost: float = 0.0  # تكلفة ما قبل التصنيع
    operating_cost: float = 0.0  # تكلفة تشغيلية
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
    profit: float = 0.0  # حقل محسوب
    image: Optional[str] = None
    description: Optional[str] = None
    is_available: bool = True
    ingredients: List[Dict[str, Any]] = []
    barcode: Optional[str] = None

# Inventory Models
class InventoryItemCreate(BaseModel):
    name: str
    name_en: Optional[str] = None
    unit: str
    quantity: float = 0.0
    min_quantity: float = 0.0
    cost_per_unit: float = 0.0
    branch_id: str
    item_type: str = "raw"  # raw or finished

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
    transaction_type: str  # in or out
    quantity: float
    notes: Optional[str] = None

# Purchase Models - المشتريات
class PurchaseCreate(BaseModel):
    supplier_name: str
    invoice_number: Optional[str] = None
    items: List[Dict[str, Any]]  # [{inventory_id, quantity, cost_per_unit}]
    total_amount: float
    payment_method: str = "cash"
    payment_status: str = "paid"  # paid, pending, partial
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

# Expense Models - المصاريف اليومية
class ExpenseCreate(BaseModel):
    category: str  # rent, utilities, salaries, maintenance, supplies, other
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

# Operating Cost Models - التكاليف التشغيلية
class OperatingCostCreate(BaseModel):
    name: str
    cost_type: str  # fixed or variable
    amount: float
    frequency: str  # daily, weekly, monthly
    branch_id: str

# Table Models
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

# Customer Models - إدارة العملاء
class CustomerCreate(BaseModel):
    name: str
    phone: str
    phone2: Optional[str] = None  # رقم إضافي
    address: Optional[str] = None
    area: Optional[str] = None  # المنطقة
    notes: Optional[str] = None
    is_blocked: bool = False  # حظر العميل

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

# Order Models
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
    buzzer_number: Optional[str] = None  # رقم جهاز التنبيه للسفري
    items: List[OrderItemCreate]
    branch_id: str
    payment_method: str = PaymentMethod.CASH
    discount: float = 0.0
    notes: Optional[str] = None
    delivery_app: Optional[str] = None
    driver_id: Optional[str] = None
    auto_ready: bool = False  # الطلب جاهز تلقائياً

class OrderResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    order_number: int
    order_type: str
    table_id: Optional[str] = None
    customer_name: Optional[str] = None
    customer_phone: Optional[str] = None
    delivery_address: Optional[str] = None
    buzzer_number: Optional[str] = None  # رقم جهاز التنبيه
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
    delivery_app_name: Optional[str] = None  # اسم شركة التوصيل
    delivery_commission: float = 0.0
    driver_id: Optional[str] = None
    notes: Optional[str] = None
    created_at: str
    updated_at: str

# Shift Models
class ShiftCreate(BaseModel):
    cashier_id: str
    branch_id: str
    opening_cash: float

class ShiftClose(BaseModel):
    closing_cash: float
    notes: Optional[str] = None

# نموذج إغلاق الصندوق المتقدم مع جرد الفئات
class CashRegisterClose(BaseModel):
    denominations: Dict[str, int] = {}  # {"250": 5, "500": 10, "1000": 20, ...}
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
    driver_sales: float = 0.0  # مبيعات السائقين
    total_expenses: float = 0.0
    net_profit: float = 0.0
    started_at: str
    ended_at: Optional[str] = None
    status: str
    denominations: Optional[Dict[str, int]] = None  # تفاصيل الجرد
    cancelled_orders: int = 0  # عدد الطلبات الملغاة
    cancelled_amount: float = 0.0  # إجمالي الإلغاءات
    discounts_total: float = 0.0  # إجمالي الخصومات
    cancelled_by: List[Dict] = []  # تفاصيل من قام بالإلغاء

# Delivery Driver Models
class DriverCreate(BaseModel):
    name: str
    phone: str
    branch_id: str
    user_id: Optional[str] = None  # ربط بحساب مستخدم

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
    # معلومات الموقع
    location_lat: Optional[float] = None
    location_lng: Optional[float] = None
    location_updated_at: Optional[str] = None

class DriverLocationUpdate(BaseModel):
    latitude: float
    longitude: float

# Delivery App Settings - إعدادات شركات التوصيل
class DeliveryAppSettingCreate(BaseModel):
    app_id: str
    name: str
    name_en: Optional[str] = None
    commission_type: str = "percentage"  # percentage or fixed
    commission_rate: float = 0.0  # نسبة الاستقطاع
    is_active: bool = True
    payment_terms: str = "weekly"  # daily, weekly, monthly
    contact_info: Optional[str] = None

# Currency Models
class Currency(BaseModel):
    code: str
    name: str
    symbol: str
    exchange_rate: float

# ==================== AUTH HELPERS ====================

def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')

def verify_password(password: str, hashed: str) -> bool:
    return bcrypt.checkpw(password.encode('utf-8'), hashed.encode('utf-8'))

def create_token(user_id: str, role: str, branch_id: Optional[str] = None) -> str:
    payload = {
        "user_id": user_id,
        "role": role,
        "branch_id": branch_id,
        "exp": datetime.now(timezone.utc) + timedelta(hours=JWT_EXPIRATION_HOURS)
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)

async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    try:
        token = credentials.credentials
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        user = await db.users.find_one({"id": payload["user_id"]}, {"_id": 0})
        if not user:
            raise HTTPException(status_code=401, detail="المستخدم غير موجود")
        return user
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="انتهت صلاحية الجلسة")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="رمز غير صالح")

# دالة مساعدة للحصول على tenant_id للمستخدم
def get_user_tenant_id(user: dict) -> Optional[str]:
    """الحصول على tenant_id للمستخدم - Super Admin لا يحتاج tenant_id"""
    if user.get("role") == UserRole.SUPER_ADMIN:
        return None
    return user.get("tenant_id")

# دالة مساعدة لبناء query مع tenant_id
def build_tenant_query(user: dict, base_query: dict = None) -> dict:
    """بناء query مع فلترة tenant_id"""
    query = base_query.copy() if base_query else {}
    tenant_id = get_user_tenant_id(user)
    
    if tenant_id:
        # المستخدم العميل يرى فقط بياناته
        query["tenant_id"] = tenant_id
    else:
        # المستخدم الرئيسي (بدون tenant_id) يرى فقط البيانات الرئيسية
        if user.get("role") != UserRole.SUPER_ADMIN:
            query["$or"] = [{"tenant_id": {"$exists": False}}, {"tenant_id": None}]
    
    return query

# ==================== EMAIL SERVICE ====================

async def send_shift_report_email(shift_data: dict, recipient_emails: List[str]):
    if not SENDGRID_API_KEY or not recipient_emails:
        logger.warning("SendGrid not configured or no recipients")
        return
    
    html_content = f"""
    <html dir="rtl" style="font-family: 'Cairo', Arial, sans-serif;">
    <body style="background: #f5f5f5; padding: 20px;">
        <div style="max-width: 600px; margin: 0 auto; background: white; border-radius: 10px; padding: 30px;">
            <h1 style="color: #D4AF37; text-align: center;">تقرير إغلاق الصندوق</h1>
            <h2 style="color: #333;">Maestro EGP</h2>
            <hr style="border: 1px solid #D4AF37;">
            
            <table style="width: 100%; border-collapse: collapse;">
                <tr><td style="padding: 10px; border-bottom: 1px solid #eee;"><strong>أمين الصندوق:</strong></td><td>{shift_data.get('cashier_name', 'N/A')}</td></tr>
                <tr><td style="padding: 10px; border-bottom: 1px solid #eee;"><strong>تاريخ البدء:</strong></td><td>{shift_data.get('started_at', 'N/A')}</td></tr>
                <tr><td style="padding: 10px; border-bottom: 1px solid #eee;"><strong>تاريخ الإنتهاء:</strong></td><td>{shift_data.get('ended_at', 'N/A')}</td></tr>
                <tr><td style="padding: 10px; border-bottom: 1px solid #eee;"><strong>إجمالي المبيعات:</strong></td><td style="color: #10B981; font-weight: bold;">{shift_data.get('total_sales', 0):,.0f} د.ع</td></tr>
                <tr><td style="padding: 10px; border-bottom: 1px solid #eee;"><strong>إجمالي التكاليف:</strong></td><td>{shift_data.get('total_cost', 0):,.0f} د.ع</td></tr>
                <tr><td style="padding: 10px; border-bottom: 1px solid #eee;"><strong>الربح الإجمالي:</strong></td><td style="color: #10B981;">{shift_data.get('gross_profit', 0):,.0f} د.ع</td></tr>
                <tr><td style="padding: 10px; border-bottom: 1px solid #eee;"><strong>المصاريف:</strong></td><td style="color: #EF4444;">{shift_data.get('total_expenses', 0):,.0f} د.ع</td></tr>
                <tr><td style="padding: 10px; border-bottom: 1px solid #eee;"><strong>صافي الربح:</strong></td><td style="color: {'#10B981' if shift_data.get('net_profit', 0) >= 0 else '#EF4444'}; font-weight: bold;">{shift_data.get('net_profit', 0):,.0f} د.ع</td></tr>
                <tr><td style="padding: 10px; border-bottom: 1px solid #eee;"><strong>عدد الطلبات:</strong></td><td>{shift_data.get('total_orders', 0)}</td></tr>
                <tr><td style="padding: 10px; border-bottom: 1px solid #eee;"><strong>النقد المتوقع:</strong></td><td>{shift_data.get('expected_cash', 0):,.0f} د.ع</td></tr>
                <tr><td style="padding: 10px; border-bottom: 1px solid #eee;"><strong>النقد الفعلي:</strong></td><td>{shift_data.get('closing_cash', 0):,.0f} د.ع</td></tr>
                <tr><td style="padding: 10px;"><strong>الفرق:</strong></td><td style="color: {'#EF4444' if shift_data.get('cash_difference', 0) < 0 else '#10B981'}; font-weight: bold;">{shift_data.get('cash_difference', 0):,.0f} د.ع</td></tr>
            </table>
            
            <p style="color: #666; font-size: 12px; margin-top: 30px; text-align: center;">
                تم إرسال هذا التقرير تلقائياً من نظام Maestro EGP
            </p>
        </div>
    </body>
    </html>
    """
    
    try:
        message = Mail(
            from_email=SENDER_EMAIL,
            to_emails=recipient_emails,
            subject=f"تقرير إغلاق الصندوق - {shift_data.get('cashier_name', '')} - {datetime.now().strftime('%Y-%m-%d')}",
            html_content=html_content
        )
        sg = SendGridAPIClient(SENDGRID_API_KEY)
        sg.send(message)
        logger.info(f"Shift report email sent to {recipient_emails}")
    except Exception as e:
        logger.error(f"Failed to send email: {e}")

# ==================== HELPER FUNCTIONS ====================

async def get_delivery_app_commission(app_id: str) -> float:
    """Get commission rate for delivery app"""
    setting = await db.delivery_app_settings.find_one({"app_id": app_id}, {"_id": 0})
    if setting:
        return setting.get("commission_rate", 0)
    return 0

async def calculate_order_cost(items: List[Dict]) -> float:
    """Calculate total cost for order items"""
    total_cost = 0
    for item in items:
        product = await db.products.find_one({"id": item.get("product_id")}, {"_id": 0})
        if product:
            item_cost = (product.get("cost", 0) + product.get("operating_cost", 0)) * item.get("quantity", 1)
            total_cost += item_cost
    return total_cost

# ==================== AUTH ROUTES ====================

@api_router.post("/auth/register")
async def register(user: UserCreate):
    existing = await db.users.find_one({"$or": [{"email": user.email}, {"username": user.username}]})
    if existing:
        raise HTTPException(status_code=400, detail="المستخدم موجود بالفعل")
    
    user_doc = {
        "id": str(uuid.uuid4()),
        "username": user.username,
        "email": user.email,
        "password": hash_password(user.password),
        "full_name": user.full_name,
        "role": user.role,
        "branch_id": user.branch_id,
        "permissions": user.permissions,
        "is_active": True,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.users.insert_one(user_doc)
    del user_doc["password"]
    del user_doc["_id"]
    token = create_token(user_doc["id"], user_doc["role"], user_doc.get("branch_id"))
    return {"user": user_doc, "token": token}

@api_router.post("/auth/login")
async def login(credentials: UserLogin):
    user = await db.users.find_one({"email": credentials.email}, {"_id": 0})
    if not user or not verify_password(credentials.password, user["password"]):
        raise HTTPException(status_code=401, detail="بيانات الدخول غير صحيحة")
    if not user.get("is_active", True):
        raise HTTPException(status_code=401, detail="الحساب معطل")
    
    del user["password"]
    token = create_token(user["id"], user["role"], user.get("branch_id"))
    return {"user": user, "token": token}

@api_router.get("/auth/me")
async def get_me(current_user: dict = Depends(get_current_user)):
    user = dict(current_user)
    if "password" in user:
        del user["password"]
    return user

# ==================== USER ROUTES ====================

@api_router.get("/users", response_model=List[UserResponse])
async def get_users(current_user: dict = Depends(get_current_user)):
    if current_user["role"] not in [UserRole.ADMIN, UserRole.MANAGER]:
        raise HTTPException(status_code=403, detail="غير مصرح")
    users = await db.users.find({}, {"_id": 0, "password": 0}).to_list(1000)
    return users

@api_router.put("/users/{user_id}")
async def update_user(user_id: str, update: UserUpdate, current_user: dict = Depends(get_current_user)):
    if current_user["role"] not in [UserRole.ADMIN, UserRole.MANAGER]:
        raise HTTPException(status_code=403, detail="غير مصرح")
    
    update_data = {k: v for k, v in update.model_dump().items() if v is not None}
    if update_data:
        await db.users.update_one({"id": user_id}, {"$set": update_data})
    
    user = await db.users.find_one({"id": user_id}, {"_id": 0, "password": 0})
    return user

@api_router.delete("/users/{user_id}")
async def delete_user(user_id: str, current_user: dict = Depends(get_current_user)):
    if current_user["role"] != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="غير مصرح")
    await db.users.delete_one({"id": user_id})
    return {"message": "تم حذف المستخدم"}

class PasswordReset(BaseModel):
    new_password: str

@api_router.put("/users/{user_id}/reset-password")
async def reset_user_password(user_id: str, data: PasswordReset, current_user: dict = Depends(get_current_user)):
    """إعادة تعيين كلمة مرور المستخدم"""
    if current_user["role"] not in [UserRole.ADMIN, UserRole.MANAGER]:
        raise HTTPException(status_code=403, detail="غير مصرح")
    
    user = await db.users.find_one({"id": user_id})
    if not user:
        raise HTTPException(status_code=404, detail="المستخدم غير موجود")
    
    hashed = hash_password(data.new_password)
    await db.users.update_one({"id": user_id}, {"$set": {"password": hashed}})
    
    return {"message": "تم تغيير كلمة المرور بنجاح"}

# ==================== BRANCH ROUTES ====================

@api_router.post("/branches", response_model=BranchResponse)
async def create_branch(branch: BranchCreate, current_user: dict = Depends(get_current_user)):
    if current_user["role"] not in [UserRole.ADMIN, UserRole.SUPER_ADMIN]:
        raise HTTPException(status_code=403, detail="غير مصرح")
    
    branch_doc = {
        "id": str(uuid.uuid4()),
        **branch.model_dump(),
        "tenant_id": get_user_tenant_id(current_user),  # فصل البيانات
        "is_active": True,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.branches.insert_one(branch_doc)
    del branch_doc["_id"]
    return branch_doc

@api_router.get("/branches", response_model=List[BranchResponse])
async def get_branches(current_user: dict = Depends(get_current_user)):
    query = build_tenant_query(current_user)  # فلترة حسب tenant_id
    branches = await db.branches.find(query, {"_id": 0}).to_list(100)
    return branches

@api_router.get("/branches/{branch_id}", response_model=BranchResponse)
async def get_branch(branch_id: str, current_user: dict = Depends(get_current_user)):
    query = build_tenant_query(current_user, {"id": branch_id})
    branch = await db.branches.find_one(query, {"_id": 0})
    if not branch:
        raise HTTPException(status_code=404, detail="الفرع غير موجود")
    return branch

@api_router.put("/branches/{branch_id}")
async def update_branch(branch_id: str, branch: BranchCreate, current_user: dict = Depends(get_current_user)):
    if current_user["role"] not in [UserRole.ADMIN, UserRole.SUPER_ADMIN]:
        raise HTTPException(status_code=403, detail="غير مصرح")
    query = build_tenant_query(current_user, {"id": branch_id})
    await db.branches.update_one(query, {"$set": branch.model_dump()})
    return await db.branches.find_one({"id": branch_id}, {"_id": 0})

@api_router.delete("/branches/{branch_id}")
async def delete_branch(branch_id: str, current_user: dict = Depends(get_current_user)):
    if current_user["role"] not in [UserRole.ADMIN, UserRole.SUPER_ADMIN]:
        raise HTTPException(status_code=403, detail="غير مصرح")
    # Check if branch has users or orders
    users_count = await db.users.count_documents({"branch_id": branch_id})
    if users_count > 0:
        raise HTTPException(status_code=400, detail="لا يمكن حذف الفرع - يوجد مستخدمين مرتبطين به")
    await db.branches.update_one({"id": branch_id}, {"$set": {"is_active": False}})
    return {"message": "تم تعطيل الفرع"}

# ==================== KITCHEN SECTIONS ROUTES ====================

@api_router.post("/kitchen-sections")
async def create_kitchen_section(section: dict, current_user: dict = Depends(get_current_user)):
    if current_user["role"] not in [UserRole.ADMIN, UserRole.MANAGER]:
        raise HTTPException(status_code=403, detail="غير مصرح")
    
    section_doc = {
        "id": str(uuid.uuid4()),
        "name": section.get("name"),
        "name_en": section.get("name_en"),
        "color": section.get("color", "#D4AF37"),
        "icon": section.get("icon", "🍳"),
        "printer_id": section.get("printer_id"),
        "branch_id": section.get("branch_id"),
        "sort_order": section.get("sort_order", 0),
        "is_active": True,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.kitchen_sections.insert_one(section_doc)
    del section_doc["_id"]
    return section_doc

@api_router.get("/kitchen-sections")
async def get_kitchen_sections(branch_id: Optional[str] = None):
    query = {"branch_id": branch_id} if branch_id else {}
    sections = await db.kitchen_sections.find(query, {"_id": 0}).sort("sort_order", 1).to_list(100)
    return sections

@api_router.put("/kitchen-sections/{section_id}")
async def update_kitchen_section(section_id: str, section: dict, current_user: dict = Depends(get_current_user)):
    if current_user["role"] not in [UserRole.ADMIN, UserRole.MANAGER]:
        raise HTTPException(status_code=403, detail="غير مصرح")
    
    update_data = {k: v for k, v in section.items() if k != "id"}
    await db.kitchen_sections.update_one({"id": section_id}, {"$set": update_data})
    return await db.kitchen_sections.find_one({"id": section_id}, {"_id": 0})

@api_router.delete("/kitchen-sections/{section_id}")
async def delete_kitchen_section(section_id: str, current_user: dict = Depends(get_current_user)):
    if current_user["role"] not in [UserRole.ADMIN, UserRole.MANAGER]:
        raise HTTPException(status_code=403, detail="غير مصرح")
    await db.kitchen_sections.delete_one({"id": section_id})
    return {"message": "تم الحذف"}

@api_router.put("/categories/{category_id}/kitchen-section")
async def assign_category_to_kitchen_section(category_id: str, data: dict, current_user: dict = Depends(get_current_user)):
    """Assign a category to a kitchen section"""
    if current_user["role"] not in [UserRole.ADMIN, UserRole.MANAGER]:
        raise HTTPException(status_code=403, detail="غير مصرح")
    
    kitchen_section_id = data.get("kitchen_section_id")
    await db.categories.update_one(
        {"id": category_id}, 
        {"$set": {"kitchen_section_id": kitchen_section_id}}
    )
    return await db.categories.find_one({"id": category_id}, {"_id": 0})

# ==================== CATEGORY ROUTES ====================

@api_router.post("/categories", response_model=CategoryResponse)
async def create_category(category: CategoryCreate, current_user: dict = Depends(get_current_user)):
    if current_user["role"] not in [UserRole.ADMIN, UserRole.MANAGER, UserRole.SUPER_ADMIN]:
        raise HTTPException(status_code=403, detail="غير مصرح")
    
    cat_doc = {
        "id": str(uuid.uuid4()),
        **category.model_dump(),
        "tenant_id": get_user_tenant_id(current_user),  # فصل البيانات
        "is_active": True
    }
    await db.categories.insert_one(cat_doc)
    del cat_doc["_id"]
    return cat_doc

@api_router.get("/categories", response_model=List[CategoryResponse])
async def get_categories(current_user: dict = Depends(get_current_user)):
    query = build_tenant_query(current_user)  # فلترة حسب tenant_id
    categories = await db.categories.find(query, {"_id": 0}).sort("sort_order", 1).to_list(100)
    return categories

@api_router.put("/categories/{category_id}")
async def update_category(category_id: str, category: CategoryCreate, current_user: dict = Depends(get_current_user)):
    if current_user["role"] not in [UserRole.ADMIN, UserRole.MANAGER, UserRole.SUPER_ADMIN]:
        raise HTTPException(status_code=403, detail="غير مصرح")
    query = build_tenant_query(current_user, {"id": category_id})
    await db.categories.update_one(query, {"$set": category.model_dump()})
    return await db.categories.find_one({"id": category_id}, {"_id": 0})

@api_router.delete("/categories/{category_id}")
async def delete_category(category_id: str, current_user: dict = Depends(get_current_user)):
    if current_user["role"] not in [UserRole.ADMIN, UserRole.MANAGER, UserRole.SUPER_ADMIN]:
        raise HTTPException(status_code=403, detail="غير مصرح")
    query = build_tenant_query(current_user, {"id": category_id})
    await db.categories.delete_one(query)
    return {"message": "تم الحذف"}

# ==================== PRODUCT ROUTES ====================

@api_router.post("/products", response_model=ProductResponse)
async def create_product(product: ProductCreate, current_user: dict = Depends(get_current_user)):
    if current_user["role"] not in [UserRole.ADMIN, UserRole.MANAGER, UserRole.SUPER_ADMIN]:
        raise HTTPException(status_code=403, detail="غير مصرح")
    
    # Calculate profit
    profit = product.price - product.cost - product.operating_cost
    
    prod_doc = {
        "id": str(uuid.uuid4()),
        **product.model_dump(),
        "tenant_id": get_user_tenant_id(current_user),  # فصل البيانات
        "profit": profit
    }
    await db.products.insert_one(prod_doc)
    del prod_doc["_id"]
    return prod_doc

@api_router.get("/products", response_model=List[ProductResponse])
async def get_products(category_id: Optional[str] = None, current_user: dict = Depends(get_current_user)):
    query = build_tenant_query(current_user)  # فلترة حسب tenant_id
    if category_id:
        query["category_id"] = category_id
    products = await db.products.find(query, {"_id": 0}).to_list(1000)
    # Calculate profit for each product
    for p in products:
        p["profit"] = p.get("price", 0) - p.get("cost", 0) - p.get("operating_cost", 0)
    return products

@api_router.get("/products/{product_id}")
async def get_product(product_id: str, current_user: dict = Depends(get_current_user)):
    query = build_tenant_query(current_user, {"id": product_id})
    product = await db.products.find_one(query, {"_id": 0})
    if not product:
        raise HTTPException(status_code=404, detail="المنتج غير موجود")
    product["profit"] = product.get("price", 0) - product.get("cost", 0) - product.get("operating_cost", 0)
    return product

@api_router.put("/products/{product_id}")
async def update_product(product_id: str, product: ProductCreate, current_user: dict = Depends(get_current_user)):
    if current_user["role"] not in [UserRole.ADMIN, UserRole.MANAGER, UserRole.SUPER_ADMIN]:
        raise HTTPException(status_code=403, detail="غير مصرح")
    
    profit = product.price - product.cost - product.operating_cost
    update_data = {**product.model_dump(), "profit": profit}
    
    query = build_tenant_query(current_user, {"id": product_id})
    await db.products.update_one(query, {"$set": update_data})
    return await db.products.find_one({"id": product_id}, {"_id": 0})

@api_router.delete("/products/{product_id}")
async def delete_product(product_id: str, current_user: dict = Depends(get_current_user)):
    if current_user["role"] not in [UserRole.ADMIN, UserRole.MANAGER]:
        raise HTTPException(status_code=403, detail="غير مصرح")
    await db.products.delete_one({"id": product_id})
    return {"message": "تم الحذف"}

# ==================== INVENTORY ROUTES ====================

@api_router.post("/inventory", response_model=InventoryResponse)
async def create_inventory_item(item: InventoryItemCreate, current_user: dict = Depends(get_current_user)):
    if current_user["role"] not in [UserRole.ADMIN, UserRole.MANAGER, UserRole.SUPERVISOR]:
        raise HTTPException(status_code=403, detail="غير مصرح")
    
    inv_doc = {
        "id": str(uuid.uuid4()),
        **item.model_dump(),
        "last_updated": datetime.now(timezone.utc).isoformat()
    }
    await db.inventory.insert_one(inv_doc)
    del inv_doc["_id"]
    return inv_doc

@api_router.get("/inventory", response_model=List[InventoryResponse])
async def get_inventory(branch_id: Optional[str] = None, item_type: Optional[str] = None, current_user: dict = Depends(get_current_user)):
    query = build_tenant_query(current_user)  # فلترة حسب tenant_id
    if branch_id:
        query["branch_id"] = branch_id
    if item_type:
        query["item_type"] = item_type
    items = await db.inventory.find(query, {"_id": 0}).to_list(1000)
    return items

@api_router.post("/inventory/transaction")
async def inventory_transaction(transaction: InventoryTransaction, current_user: dict = Depends(get_current_user)):
    query = build_tenant_query(current_user, {"id": transaction.inventory_id})
    item = await db.inventory.find_one(query)
    if not item:
        raise HTTPException(status_code=404, detail="الصنف غير موجود")
    
    new_qty = item["quantity"]
    if transaction.transaction_type == "in":
        new_qty += transaction.quantity
    else:
        new_qty -= transaction.quantity
        if new_qty < 0:
            raise HTTPException(status_code=400, detail="الكمية غير كافية")
    
    await db.inventory.update_one(
        {"id": transaction.inventory_id},
        {"$set": {"quantity": new_qty, "last_updated": datetime.now(timezone.utc).isoformat()}}
    )
    
    # Log transaction
    trans_doc = {
        "id": str(uuid.uuid4()),
        "inventory_id": transaction.inventory_id,
        "transaction_type": transaction.transaction_type,
        "quantity": transaction.quantity,
        "notes": transaction.notes,
        "user_id": current_user["id"],
        "tenant_id": get_user_tenant_id(current_user),  # فصل البيانات
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.inventory_transactions.insert_one(trans_doc)
    
    return {"message": "تمت العملية بنجاح", "new_quantity": new_qty}

# ==================== PURCHASE ROUTES - المشتريات ====================

@api_router.post("/purchases")
async def create_purchase(purchase: PurchaseCreate, current_user: dict = Depends(get_current_user)):
    if current_user["role"] not in [UserRole.ADMIN, UserRole.MANAGER, UserRole.SUPERVISOR]:
        raise HTTPException(status_code=403, detail="غير مصرح")
    
    purchase_doc = {
        "id": str(uuid.uuid4()),
        **purchase.model_dump(),
        "created_by": current_user["id"],
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.purchases.insert_one(purchase_doc)
    
    # Update inventory quantities
    for item in purchase.items:
        await db.inventory.update_one(
            {"id": item.get("inventory_id")},
            {
                "$inc": {"quantity": item.get("quantity", 0)},
                "$set": {
                    "cost_per_unit": item.get("cost_per_unit", 0),
                    "last_updated": datetime.now(timezone.utc).isoformat()
                }
            }
        )
    
    del purchase_doc["_id"]
    return purchase_doc

@api_router.get("/purchases")
async def get_purchases(
    branch_id: Optional[str] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    query = {}
    if branch_id:
        query["branch_id"] = branch_id
    if start_date:
        query["created_at"] = {"$gte": start_date}
    if end_date:
        query.setdefault("created_at", {})["$lte"] = end_date + "T23:59:59"
    
    purchases = await db.purchases.find(query, {"_id": 0}).sort("created_at", -1).to_list(500)
    return purchases

# ==================== EXPENSE ROUTES - المصاريف ====================

@api_router.post("/expenses")
async def create_expense(expense: ExpenseCreate, current_user: dict = Depends(get_current_user)):
    if current_user["role"] not in [UserRole.ADMIN, UserRole.MANAGER, UserRole.SUPERVISOR, UserRole.SUPER_ADMIN]:
        raise HTTPException(status_code=403, detail="غير مصرح")
    
    expense_doc = {
        "id": str(uuid.uuid4()),
        **expense.model_dump(),
        "tenant_id": get_user_tenant_id(current_user),  # فصل البيانات
        "date": expense.date or datetime.now(timezone.utc).strftime("%Y-%m-%d"),
        "created_by": current_user["id"],
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.expenses.insert_one(expense_doc)
    del expense_doc["_id"]
    return expense_doc

@api_router.get("/expenses")
async def get_expenses(
    branch_id: Optional[str] = None,
    category: Optional[str] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    query = build_tenant_query(current_user)  # فلترة حسب tenant_id
    if branch_id:
        query["branch_id"] = branch_id
    if category:
        query["category"] = category
    if start_date:
        query["date"] = {"$gte": start_date}
    if end_date:
        query.setdefault("date", {})["$lte"] = end_date
    
    expenses = await db.expenses.find(query, {"_id": 0}).sort("date", -1).to_list(500)
    return expenses

@api_router.get("/expenses/categories")
async def get_expense_categories():
    return [
        {"id": "rent", "name": "إيجار"},
        {"id": "utilities", "name": "كهرباء وماء"},
        {"id": "salaries", "name": "رواتب"},
        {"id": "maintenance", "name": "صيانة"},
        {"id": "supplies", "name": "مستلزمات"},
        {"id": "marketing", "name": "تسويق"},
        {"id": "transport", "name": "نقل"},
        {"id": "other", "name": "أخرى"}
    ]

# ==================== OPERATING COST ROUTES - التكاليف التشغيلية ====================

@api_router.post("/operating-costs")
async def create_operating_cost(cost: OperatingCostCreate, current_user: dict = Depends(get_current_user)):
    if current_user["role"] not in [UserRole.ADMIN, UserRole.MANAGER]:
        raise HTTPException(status_code=403, detail="غير مصرح")
    
    cost_doc = {
        "id": str(uuid.uuid4()),
        **cost.model_dump(),
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.operating_costs.insert_one(cost_doc)
    del cost_doc["_id"]
    return cost_doc

@api_router.get("/operating-costs")
async def get_operating_costs(branch_id: Optional[str] = None, current_user: dict = Depends(get_current_user)):
    query = {"branch_id": branch_id} if branch_id else {}
    costs = await db.operating_costs.find(query, {"_id": 0}).to_list(100)
    return costs

# ==================== TABLE ROUTES ====================

@api_router.post("/tables", response_model=TableResponse)
async def create_table(table: TableCreate, current_user: dict = Depends(get_current_user)):
    # السماح للمدير والأدمن أو من لديه صلاحية tables
    user_permissions = current_user.get("permissions", [])
    if current_user["role"] not in [UserRole.ADMIN, UserRole.MANAGER] and "tables" not in user_permissions:
        raise HTTPException(status_code=403, detail="غير مصرح")
    
    table_doc = {
        "id": str(uuid.uuid4()),
        **table.model_dump(),
        "status": "available",
        "current_order_id": None
    }
    await db.tables.insert_one(table_doc)
    del table_doc["_id"]
    return table_doc

@api_router.get("/tables", response_model=List[TableResponse])
async def get_tables(branch_id: Optional[str] = None):
    query = {"branch_id": branch_id} if branch_id else {}
    tables = await db.tables.find(query, {"_id": 0}).sort("number", 1).to_list(100)
    return tables

@api_router.put("/tables/{table_id}/status")
async def update_table_status(table_id: str, status: str, current_user: dict = Depends(get_current_user)):
    await db.tables.update_one({"id": table_id}, {"$set": {"status": status}})
    return {"message": "تم التحديث"}

@api_router.delete("/tables/{table_id}")
async def delete_table(table_id: str, current_user: dict = Depends(get_current_user)):
    """حذف طاولة - فقط للمالك أو المدير"""
    if current_user.get("role") not in ["admin", "manager"]:
        raise HTTPException(status_code=403, detail="ليس لديك صلاحية حذف الطاولات")
    
    table = await db.tables.find_one({"id": table_id})
    if not table:
        raise HTTPException(status_code=404, detail="الطاولة غير موجودة")
    
    # التحقق من أن الطاولة ليست مشغولة
    if table.get("status") == "occupied":
        raise HTTPException(status_code=400, detail="لا يمكن حذف طاولة مشغولة")
    
    await db.tables.delete_one({"id": table_id})
    return {"message": "تم حذف الطاولة"}

# ==================== CUSTOMER ROUTES - إدارة العملاء ====================

@api_router.post("/customers", response_model=CustomerResponse)
async def create_customer(customer: CustomerCreate, current_user: dict = Depends(get_current_user)):
    # التحقق من عدم وجود العميل بنفس الرقم في نفس الـ tenant
    tenant_id = get_user_tenant_id(current_user)
    query = {"phone": customer.phone}
    if tenant_id:
        query["tenant_id"] = tenant_id
    existing = await db.customers.find_one(query)
    if existing:
        raise HTTPException(status_code=400, detail="رقم الهاتف موجود مسبقاً")
    
    customer_doc = {
        "id": str(uuid.uuid4()),
        **customer.model_dump(),
        "tenant_id": tenant_id,  # فصل البيانات
        "total_orders": 0,
        "total_spent": 0.0,
        "last_order_date": None,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.customers.insert_one(customer_doc)
    del customer_doc["_id"]
    return customer_doc

@api_router.get("/customers", response_model=List[CustomerResponse])
async def get_customers(search: Optional[str] = None, phone: Optional[str] = None, current_user: dict = Depends(get_current_user)):
    query = build_tenant_query(current_user)  # فلترة حسب tenant_id
    if phone:
        query["$or"] = [{"phone": phone}, {"phone2": phone}]
    elif search:
        query["$or"] = [
            {"name": {"$regex": search, "$options": "i"}},
            {"phone": {"$regex": search}},
            {"phone2": {"$regex": search}},
            {"area": {"$regex": search, "$options": "i"}}
        ]
    customers = await db.customers.find(query, {"_id": 0}).sort("name", 1).to_list(500)
    return customers

@api_router.get("/customers/{customer_id}", response_model=CustomerResponse)
async def get_customer(customer_id: str, current_user: dict = Depends(get_current_user)):
    query = build_tenant_query(current_user, {"id": customer_id})
    customer = await db.customers.find_one(query, {"_id": 0})
    if not customer:
        raise HTTPException(status_code=404, detail="العميل غير موجود")
    return customer

@api_router.get("/customers/by-phone/{phone}")
async def get_customer_by_phone(phone: str, current_user: dict = Depends(get_current_user)):
    """البحث عن عميل بالهاتف مع سجل الطلبات"""
    tenant_id = get_user_tenant_id(current_user)
    
    # بناء query للبحث عن العميل بالهاتف مع مراعاة tenant_id
    phone_conditions = [{"phone": phone}, {"phone2": phone}]
    
    if tenant_id:
        # المستخدم العميل يرى فقط بياناته
        query = {"$and": [{"tenant_id": tenant_id}, {"$or": phone_conditions}]}
    elif current_user.get("role") == UserRole.SUPER_ADMIN:
        # Super Admin يرى الكل
        query = {"$or": phone_conditions}
    else:
        # المستخدم الرئيسي (بدون tenant_id) يرى البيانات الرئيسية فقط
        query = {"$and": [
            {"$or": [{"tenant_id": {"$exists": False}}, {"tenant_id": None}]},
            {"$or": phone_conditions}
        ]}
    
    customer = await db.customers.find_one(query, {"_id": 0})
    
    if not customer:
        return {"found": False, "customer": None, "orders": []}
    
    # جلب آخر 10 طلبات للعميل
    orders_query = build_tenant_query(current_user, {"customer_phone": phone})
    orders = await db.orders.find(orders_query, {"_id": 0}).sort("created_at", -1).limit(10).to_list(10)
    
    return {
        "found": True,
        "customer": customer,
        "orders": orders
    }

@api_router.put("/customers/{customer_id}")
async def update_customer(customer_id: str, customer: CustomerCreate, current_user: dict = Depends(get_current_user)):
    query = build_tenant_query(current_user, {"id": customer_id})
    await db.customers.update_one(query, {"$set": customer.model_dump()})
    return await db.customers.find_one({"id": customer_id}, {"_id": 0})

@api_router.delete("/customers/{customer_id}")
async def delete_customer(customer_id: str, current_user: dict = Depends(get_current_user)):
    await db.customers.delete_one({"id": customer_id})
    return {"message": "تم الحذف"}

# ==================== ORDER ROUTES ====================

async def get_next_order_number(branch_id: str) -> int:
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    counter = await db.order_counters.find_one_and_update(
        {"branch_id": branch_id, "date": today},
        {"$inc": {"counter": 1}},
        upsert=True,
        return_document=True
    )
    return counter["counter"]

@api_router.post("/orders", response_model=OrderResponse)
async def create_order(order: OrderCreate, current_user: dict = Depends(get_current_user)):
    order_number = await get_next_order_number(order.branch_id)
    
    tenant_id = get_user_tenant_id(current_user)
    
    # البحث عن الوردية المفتوحة للكاشير
    shift_query = {
        "cashier_id": current_user["id"],
        "status": "open"
    }
    if tenant_id:
        shift_query["tenant_id"] = tenant_id
    
    current_shift = await db.shifts.find_one(shift_query, {"_id": 0, "id": 1})
    shift_id = current_shift["id"] if current_shift else None
    
    subtotal = sum(item.price * item.quantity for item in order.items)
    tax = subtotal * 0.0  # No tax for Iraq
    total = subtotal - order.discount + tax
    
    # Calculate total cost
    total_cost = 0
    items_with_cost = []
    for item in order.items:
        product = await db.products.find_one({"id": item.product_id}, {"_id": 0})
        item_cost = 0
        if product:
            item_cost = (product.get("cost", 0) + product.get("operating_cost", 0)) * item.quantity
        total_cost += item_cost
        item_dict = item.model_dump()
        item_dict["cost"] = item_cost
        items_with_cost.append(item_dict)
    
    # Calculate delivery commission if applicable
    delivery_commission = 0
    if order.delivery_app:
        commission_rate = await get_delivery_app_commission(order.delivery_app)
        delivery_commission = total * (commission_rate / 100)
    
    # Calculate profit
    profit = total - total_cost - delivery_commission
    
    # Determine payment status
    if order.payment_method == PaymentMethod.PENDING:
        payment_status = "pending"
        # الطلب جاهز تلقائياً إذا تم تحديده
        order_status = OrderStatus.READY if order.auto_ready else OrderStatus.PENDING
    elif order.payment_method == PaymentMethod.CREDIT:
        payment_status = "credit"
        order_status = OrderStatus.READY if order.auto_ready else OrderStatus.PREPARING
    else:
        payment_status = "paid"
        order_status = OrderStatus.READY if order.auto_ready else OrderStatus.PREPARING
    
    # الحصول على اسم شركة التوصيل
    delivery_app_name = None
    if order.delivery_app:
        delivery_app_doc = await db.delivery_apps.find_one({"id": order.delivery_app})
        if delivery_app_doc:
            delivery_app_name = delivery_app_doc.get("name")
    
    order_doc = {
        "id": str(uuid.uuid4()),
        "order_number": order_number,
        "order_type": order.order_type,
        "table_id": order.table_id,
        "customer_name": order.customer_name,
        "customer_phone": order.customer_phone,
        "delivery_address": order.delivery_address,
        "buzzer_number": order.buzzer_number,  # رقم جهاز التنبيه
        "items": items_with_cost,
        "subtotal": subtotal,
        "discount": order.discount,
        "tax": tax,
        "total": total,
        "total_cost": total_cost,
        "profit": profit,
        "branch_id": order.branch_id,
        "cashier_id": current_user["id"],
        "shift_id": shift_id,  # ربط الطلب بالوردية الحالية
        "tenant_id": tenant_id,  # فصل البيانات لكل عميل
        "status": order_status,
        "payment_method": order.payment_method,
        "payment_status": payment_status,
        "delivery_app": order.delivery_app,
        "delivery_app_name": delivery_app_name,  # اسم شركة التوصيل
        "delivery_commission": delivery_commission,
        "driver_id": order.driver_id,
        "notes": order.notes,
        "credit_transferred": False,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "updated_at": datetime.now(timezone.utc).isoformat()
    }
    
    await db.orders.insert_one(order_doc)
    del order_doc["_id"]
    
    # تحديث معلومات العميل إذا كان موجوداً
    if order.customer_phone:
        customer = await db.customers.find_one({"$or": [{"phone": order.customer_phone}, {"phone2": order.customer_phone}]})
        if customer:
            await db.customers.update_one(
                {"id": customer["id"]},
                {
                    "$inc": {"total_orders": 1, "total_spent": total},
                    "$set": {"last_order_date": datetime.now(timezone.utc).isoformat()}
                }
            )
        elif order.customer_name:
            # إنشاء عميل جديد تلقائياً
            new_customer = {
                "id": str(uuid.uuid4()),
                "name": order.customer_name,
                "phone": order.customer_phone,
                "phone2": None,
                "address": order.delivery_address,
                "area": None,
                "notes": None,
                "is_blocked": False,
                "total_orders": 1,
                "total_spent": total,
                "last_order_date": datetime.now(timezone.utc).isoformat(),
                "created_at": datetime.now(timezone.utc).isoformat()
            }
            await db.customers.insert_one(new_customer)
    
    # Update table status if dine-in
    if order.table_id:
        await db.tables.update_one(
            {"id": order.table_id},
            {"$set": {"status": "occupied", "current_order_id": order_doc["id"]}}
        )
    
    # Assign driver if specified
    if order.driver_id:
        await db.drivers.update_one(
            {"id": order.driver_id},
            {"$set": {"is_available": False, "current_order_id": order_doc["id"]}}
        )
    
    # Deduct inventory
    for item in order.items:
        product = await db.products.find_one({"id": item.product_id})
        if product and product.get("ingredients"):
            for ing in product["ingredients"]:
                await db.inventory.update_one(
                    {"id": ing["inventory_id"]},
                    {"$inc": {"quantity": -ing["quantity"] * item.quantity}}
                )
    
    return order_doc

@api_router.get("/orders", response_model=List[OrderResponse])
async def get_orders(
    branch_id: Optional[str] = None,
    status: Optional[str] = None,
    date: Optional[str] = None,
    payment_status: Optional[str] = None,
    order_type: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    query = build_tenant_query(current_user)  # فلترة حسب tenant_id
    if branch_id:
        query["branch_id"] = branch_id
    if status:
        # دعم حالات متعددة مفصولة بفاصلة
        statuses = [s.strip() for s in status.split(',')]
        if len(statuses) > 1:
            query["status"] = {"$in": statuses}
        else:
            query["status"] = status
    if date:
        query["created_at"] = {"$regex": f"^{date}"}
    if payment_status:
        query["payment_status"] = payment_status
    if order_type:
        query["order_type"] = order_type
    
    orders = await db.orders.find(query, {"_id": 0}).sort("created_at", -1).to_list(500)
    return orders

@api_router.get("/orders/{order_id}", response_model=OrderResponse)
async def get_order(order_id: str):
    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="الطلب غير موجود")
    return order

@api_router.put("/orders/{order_id}/add-items")
async def add_items_to_order(order_id: str, items: List[OrderItemCreate], current_user: dict = Depends(get_current_user)):
    """إضافة عناصر جديدة لطلب موجود"""
    order = await db.orders.find_one({"id": order_id})
    if not order:
        raise HTTPException(status_code=404, detail="الطلب غير موجود")
    
    # إضافة العناصر الجديدة
    new_items = []
    for item in items:
        product = await db.products.find_one({"id": item.product_id})
        new_items.append({
            "product_id": item.product_id,
            "product_name": item.product_name,
            "quantity": item.quantity,
            "price": item.price,
            "cost": product.get("cost", 0) if product else 0,
            "notes": item.notes
        })
    
    # دمج العناصر الجديدة مع القديمة
    existing_items = order.get("items", [])
    all_items = existing_items + new_items
    
    # إعادة حساب المجاميع
    subtotal = sum(i["price"] * i["quantity"] for i in all_items)
    total_cost = sum(i.get("cost", 0) * i["quantity"] for i in all_items)
    discount = order.get("discount", 0)
    tax = 0
    total = subtotal - discount + tax
    profit = total - total_cost - order.get("delivery_commission", 0)
    
    await db.orders.update_one(
        {"id": order_id},
        {"$set": {
            "items": all_items,
            "subtotal": subtotal,
            "total_cost": total_cost,
            "total": total,
            "profit": profit,
            "updated_at": datetime.now(timezone.utc).isoformat()
        }}
    )
    
    return await db.orders.find_one({"id": order_id}, {"_id": 0})

@api_router.put("/orders/{order_id}/status")
async def update_order_status(order_id: str, status: str, current_user: dict = Depends(get_current_user)):
    order = await db.orders.find_one({"id": order_id})
    if not order:
        raise HTTPException(status_code=404, detail="الطلب غير موجود")
    
    # التحقق من صلاحية الإلغاء
    if status == OrderStatus.CANCELLED:
        # فقط المالك أو المدير يمكنهم الإلغاء
        if current_user.get("role") not in ["admin", "manager"]:
            raise HTTPException(status_code=403, detail="ليس لديك صلاحية إلغاء الطلبات")
    
    await db.orders.update_one(
        {"id": order_id},
        {"$set": {"status": status, "updated_at": datetime.now(timezone.utc).isoformat()}}
    )
    
    # Free table if completed
    if status in [OrderStatus.DELIVERED, OrderStatus.CANCELLED] and order.get("table_id"):
        await db.tables.update_one(
            {"id": order["table_id"]},
            {"$set": {"status": "available", "current_order_id": None}}
        )
    
    return {"message": "تم التحديث"}

@api_router.put("/orders/{order_id}/payment")
async def update_order_payment(order_id: str, payment_method: str, current_user: dict = Depends(get_current_user)):
    order = await db.orders.find_one({"id": order_id})
    if not order:
        raise HTTPException(status_code=404, detail="الطلب غير موجود")
    
    update_data = {
        "payment_method": payment_method,
        "updated_at": datetime.now(timezone.utc).isoformat()
    }
    
    if payment_method == PaymentMethod.CREDIT:
        update_data["payment_status"] = "credit"
        if order.get("delivery_app"):
            update_data["credit_transferred"] = True
    elif payment_method in [PaymentMethod.CASH, PaymentMethod.CARD]:
        update_data["payment_status"] = "paid"
    
    await db.orders.update_one({"id": order_id}, {"$set": update_data})
    
    return {"message": "تم تحديث طريقة الدفع"}

@api_router.put("/orders/{order_id}/cancel")
async def cancel_order(order_id: str, current_user: dict = Depends(get_current_user)):
    """
    إلغاء الطلب:
    - أقل من دقيقة: يُحذف نهائياً (لا يظهر في التقارير)
    - أكثر من دقيقتين: يُسجل كطلب ملغي (يظهر في التقارير)
    - بين دقيقة ودقيقتين: يُسجل كطلب ملغي فقط للمدير/المالك
    """
    order = await db.orders.find_one({"id": order_id})
    if not order:
        raise HTTPException(status_code=404, detail="الطلب غير موجود")
    
    # حساب الفرق في الوقت بالثواني
    created_at = datetime.fromisoformat(order["created_at"].replace("Z", "+00:00"))
    time_diff = (datetime.now(timezone.utc) - created_at).total_seconds()
    
    is_within_minute = time_diff < 60  # أقل من دقيقة
    is_within_two_minutes = time_diff < 120  # أقل من دقيقتين
    is_admin_or_manager = current_user.get("role") in ["admin", "manager"]
    
    # التحقق من الصلاحيات
    if not is_within_minute and not is_admin_or_manager:
        raise HTTPException(status_code=403, detail="فقط المالك أو المدير يمكنهم إلغاء الطلبات بعد دقيقة من إنشائها")
    
    # تحرير الطاولة إذا كان الطلب على طاولة
    if order.get("table_id"):
        await db.tables.update_one(
            {"id": order["table_id"]},
            {"$set": {"status": "available", "current_order_id": None}}
        )
    
    # أقل من دقيقة: حذف نهائي
    if is_within_minute:
        await db.orders.delete_one({"id": order_id})
        return {
            "message": "تم حذف الطلب نهائياً",
            "was_quick_delete": True,
            "in_reports": False
        }
    
    # أكثر من دقيقة: تسجيل كطلب ملغي
    await db.orders.update_one(
        {"id": order_id},
        {"$set": {
            "status": OrderStatus.CANCELLED,
            "cancelled_at": datetime.now(timezone.utc).isoformat(),
            "cancelled_by": current_user["id"],
            "cancellation_reason": "إلغاء بواسطة المدير" if is_admin_or_manager else "إلغاء",
            "time_to_cancel_seconds": int(time_diff),
            "updated_at": datetime.now(timezone.utc).isoformat()
        }}
    )
    
    return {
        "message": "تم إلغاء الطلب وتسجيله في التقارير",
        "was_quick_delete": False,
        "in_reports": True
    }

# ==================== SHIFT ROUTES ====================

@api_router.post("/shifts", response_model=ShiftResponse)
async def open_shift(shift: ShiftCreate, current_user: dict = Depends(get_current_user)):
    # Check if cashier has an open shift
    existing = await db.shifts.find_one({"cashier_id": shift.cashier_id, "status": "open"})
    if existing:
        raise HTTPException(status_code=400, detail="يوجد شفت مفتوح بالفعل")
    
    cashier = await db.users.find_one({"id": shift.cashier_id}, {"_id": 0, "password": 0})
    if not cashier:
        raise HTTPException(status_code=404, detail="الكاشير غير موجود")
    
    shift_doc = {
        "id": str(uuid.uuid4()),
        "cashier_id": shift.cashier_id,
        "cashier_name": cashier["full_name"],
        "branch_id": shift.branch_id,
        "opening_cash": shift.opening_cash,
        "closing_cash": None,
        "expected_cash": shift.opening_cash,
        "cash_difference": None,
        "total_sales": 0.0,
        "total_cost": 0.0,
        "gross_profit": 0.0,
        "total_orders": 0,
        "card_sales": 0.0,
        "cash_sales": 0.0,
        "credit_sales": 0.0,
        "delivery_app_sales": {},
        "total_expenses": 0.0,
        "net_profit": 0.0,
        "started_at": datetime.now(timezone.utc).isoformat(),
        "ended_at": None,
        "status": "open"
    }
    await db.shifts.insert_one(shift_doc)
    del shift_doc["_id"]
    return shift_doc

@api_router.get("/shifts/current")
async def get_current_shift(current_user: dict = Depends(get_current_user)):
    shift = await db.shifts.find_one(
        {"cashier_id": current_user["id"], "status": "open"},
        {"_id": 0}
    )
    return shift

@api_router.post("/shifts/auto-open")
async def auto_open_shift(current_user: dict = Depends(get_current_user)):
    """فتح وردية تلقائياً للكاشير عند تسجيل الدخول"""
    
    # التحقق من وجود وردية مفتوحة
    existing = await db.shifts.find_one({
        "cashier_id": current_user["id"], 
        "status": "open"
    }, {"_id": 0})
    
    if existing:
        # إرجاع الوردية الموجودة
        return {"shift": existing, "was_existing": True, "message": "وردية مفتوحة بالفعل"}
    
    # الحصول على الفرع الافتراضي للمستخدم أو أول فرع
    branch_id = current_user.get("branch_id")
    if not branch_id:
        branch = await db.branches.find_one({}, {"_id": 0, "id": 1})
        branch_id = branch["id"] if branch else None
    
    if not branch_id:
        raise HTTPException(status_code=400, detail="لا يوجد فرع محدد")
    
    # فتح وردية جديدة برصيد افتتاحي 0
    shift_doc = {
        "id": str(uuid.uuid4()),
        "cashier_id": current_user["id"],
        "cashier_name": current_user["full_name"],
        "branch_id": branch_id,
        "opening_cash": 0.0,  # رصيد افتتاحي 0
        "closing_cash": None,
        "expected_cash": 0.0,
        "cash_difference": None,
        "total_sales": 0.0,
        "total_cost": 0.0,
        "gross_profit": 0.0,
        "total_orders": 0,
        "card_sales": 0.0,
        "cash_sales": 0.0,
        "credit_sales": 0.0,
        "delivery_app_sales": {},
        "driver_sales": 0.0,
        "total_expenses": 0.0,
        "net_profit": 0.0,
        "started_at": datetime.now(timezone.utc).isoformat(),
        "ended_at": None,
        "status": "open"
    }
    
    await db.shifts.insert_one(shift_doc)
    del shift_doc["_id"]
    
    return {"shift": shift_doc, "was_existing": False, "message": "تم فتح وردية جديدة تلقائياً"}

@api_router.post("/shifts/{shift_id}/close")
async def close_shift(shift_id: str, close_data: ShiftClose, background_tasks: BackgroundTasks, current_user: dict = Depends(get_current_user)):
    shift = await db.shifts.find_one({"id": shift_id})
    if not shift:
        raise HTTPException(status_code=404, detail="الشفت غير موجود")
    if shift["status"] == "closed":
        raise HTTPException(status_code=400, detail="الشفت مغلق بالفعل")
    
    # Calculate totals from orders during this shift
    orders = await db.orders.find({
        "cashier_id": shift["cashier_id"],
        "created_at": {"$gte": shift["started_at"]},
        "status": {"$ne": OrderStatus.CANCELLED}
    }).to_list(1000)
    
    total_sales = sum(o["total"] for o in orders)
    total_cost = sum(o.get("total_cost", 0) for o in orders)
    gross_profit = total_sales - total_cost
    cash_sales = sum(o["total"] for o in orders if o["payment_method"] == PaymentMethod.CASH)
    card_sales = sum(o["total"] for o in orders if o["payment_method"] == PaymentMethod.CARD)
    credit_sales = sum(o["total"] for o in orders if o["payment_method"] == PaymentMethod.CREDIT)
    
    # Calculate delivery app sales
    delivery_app_sales = {}
    for o in orders:
        if o.get("delivery_app"):
            app = o["delivery_app"]
            if app not in delivery_app_sales:
                delivery_app_sales[app] = 0
            delivery_app_sales[app] += o["total"]
    
    # Get expenses during shift
    expenses = await db.expenses.find({
        "branch_id": shift["branch_id"],
        "created_at": {"$gte": shift["started_at"]}
    }).to_list(100)
    total_expenses = sum(e["amount"] for e in expenses)
    
    # Calculate net profit
    net_profit = gross_profit - total_expenses
    
    expected_cash = shift["opening_cash"] + cash_sales - total_expenses
    cash_difference = close_data.closing_cash - expected_cash
    
    update_data = {
        "closing_cash": close_data.closing_cash,
        "expected_cash": expected_cash,
        "cash_difference": cash_difference,
        "total_sales": total_sales,
        "total_cost": total_cost,
        "gross_profit": gross_profit,
        "total_orders": len(orders),
        "cash_sales": cash_sales,
        "card_sales": card_sales,
        "credit_sales": credit_sales,
        "delivery_app_sales": delivery_app_sales,
        "total_expenses": total_expenses,
        "net_profit": net_profit,
        "ended_at": datetime.now(timezone.utc).isoformat(),
        "status": "closed",
        "notes": close_data.notes
    }
    
    await db.shifts.update_one({"id": shift_id}, {"$set": update_data})
    
    # Get updated shift data
    updated_shift = await db.shifts.find_one({"id": shift_id}, {"_id": 0})
    
    # Send email report
    settings = await db.settings.find_one({"type": "email_recipients"})
    if settings and settings.get("emails"):
        background_tasks.add_task(send_shift_report_email, updated_shift, settings["emails"])
    
    return updated_shift

@api_router.get("/shifts", response_model=List[ShiftResponse])
async def get_shifts(branch_id: Optional[str] = None, date: Optional[str] = None, current_user: dict = Depends(get_current_user)):
    query = {}
    if branch_id:
        query["branch_id"] = branch_id
    if date:
        query["started_at"] = {"$regex": f"^{date}"}
    
    shifts = await db.shifts.find(query, {"_id": 0}).sort("started_at", -1).to_list(100)
    return shifts

# ==================== CASH REGISTER CLOSE (إغلاق الصندوق المتقدم) ====================

@api_router.get("/cash-register/summary")
async def get_cash_register_summary(current_user: dict = Depends(get_current_user)):
    """جلب ملخص الصندوق الحالي للكاشير - قبل إغلاقه"""
    
    tenant_id = get_user_tenant_id(current_user)
    
    # Get current open shift for cashier
    shift_query = {
        "cashier_id": current_user["id"],
        "status": "open"
    }
    if tenant_id:
        shift_query["tenant_id"] = tenant_id
    
    shift = await db.shifts.find_one(shift_query, {"_id": 0})
    
    if not shift:
        raise HTTPException(status_code=404, detail="لا يوجد وردية مفتوحة")
    
    # Get branch info
    branch = await db.branches.find_one({"id": shift["branch_id"]}, {"_id": 0, "name": 1})
    
    # Build order query with tenant_id filtering
    order_query = {
        "shift_id": shift["id"],  # ربط الطلبات بالوردية مباشرة
        "status": {"$ne": OrderStatus.CANCELLED}
    }
    if tenant_id:
        order_query["tenant_id"] = tenant_id
    
    # إذا لم يكن هناك طلبات مرتبطة بالوردية، نستخدم الفلترة القديمة
    orders = await db.orders.find(order_query).to_list(1000)
    
    # إذا لم نجد طلبات بالـ shift_id، نبحث بالـ cashier_id وتاريخ الوردية
    if not orders:
        fallback_query = {
            "cashier_id": shift["cashier_id"],
            "created_at": {"$gte": shift["started_at"]},
            "status": {"$ne": OrderStatus.CANCELLED}
        }
        if tenant_id:
            fallback_query["tenant_id"] = tenant_id
        orders = await db.orders.find(fallback_query).to_list(1000)
    
    # Cancelled orders
    cancelled_query = {
        "shift_id": shift["id"],
        "status": OrderStatus.CANCELLED
    }
    if tenant_id:
        cancelled_query["tenant_id"] = tenant_id
    
    cancelled_orders = await db.orders.find(cancelled_query).to_list(1000)
    
    # Fallback for cancelled orders
    if not cancelled_orders:
        cancelled_fallback = {
            "cashier_id": shift["cashier_id"],
            "created_at": {"$gte": shift["started_at"]},
            "status": OrderStatus.CANCELLED
        }
        if tenant_id:
            cancelled_fallback["tenant_id"] = tenant_id
        cancelled_orders = await db.orders.find(cancelled_fallback).to_list(1000)
    
    total_sales = sum(o["total"] for o in orders)
    total_cost = sum(o.get("total_cost", 0) for o in orders)
    gross_profit = total_sales - total_cost
    cash_sales = sum(o["total"] for o in orders if o["payment_method"] == PaymentMethod.CASH)
    card_sales = sum(o["total"] for o in orders if o["payment_method"] == PaymentMethod.CARD)
    credit_sales = sum(o["total"] for o in orders if o["payment_method"] == PaymentMethod.CREDIT)
    
    # Calculate delivery app sales
    delivery_app_sales = {}
    for o in orders:
        if o.get("delivery_app"):
            app = o["delivery_app"]
            if app not in delivery_app_sales:
                delivery_app_sales[app] = 0
            delivery_app_sales[app] += o["total"]
    
    # Calculate driver sales
    driver_sales = sum(o["total"] for o in orders if o.get("order_type") == OrderType.DELIVERY and o.get("driver_id"))
    
    # Calculate discounts
    discounts_total = sum(o.get("discount", 0) for o in orders)
    
    # Cancelled orders details
    cancelled_by = {}
    cancelled_amount = 0
    for o in cancelled_orders:
        cancelled_amount += o["total"]
        cancelled_by_id = o.get("cancelled_by", o.get("cashier_id"))
        if cancelled_by_id not in cancelled_by:
            user = await db.users.find_one({"id": cancelled_by_id}, {"_id": 0, "full_name": 1})
            cancelled_by[cancelled_by_id] = {
                "user_id": cancelled_by_id,
                "user_name": user["full_name"] if user else "غير معروف",
                "count": 0,
                "total": 0
            }
        cancelled_by[cancelled_by_id]["count"] += 1
        cancelled_by[cancelled_by_id]["total"] += o["total"]
    
    # Get expenses during shift
    expenses = await db.expenses.find({
        "branch_id": shift["branch_id"],
        "created_at": {"$gte": shift["started_at"]}
    }).to_list(100)
    total_expenses = sum(e["amount"] for e in expenses)
    
    # Calculate net profit
    net_profit = gross_profit - total_expenses
    
    expected_cash = shift["opening_cash"] + cash_sales - total_expenses
    
    return {
        "shift_id": shift["id"],
        "branch_id": shift["branch_id"],
        "branch_name": branch["name"] if branch else "",
        "cashier_id": current_user["id"],
        "cashier_name": current_user["full_name"],
        "started_at": shift["started_at"],
        "opening_cash": shift["opening_cash"],
        "total_sales": total_sales,
        "total_cost": total_cost,
        "gross_profit": gross_profit,
        "total_orders": len(orders),
        "cash_sales": cash_sales,
        "card_sales": card_sales,
        "credit_sales": credit_sales,
        "delivery_app_sales": delivery_app_sales,
        "driver_sales": driver_sales,
        "discounts_total": discounts_total,
        "cancelled_orders": len(cancelled_orders),
        "cancelled_amount": cancelled_amount,
        "cancelled_by": list(cancelled_by.values()),
        "total_expenses": total_expenses,
        "net_profit": net_profit,
        "expected_cash": expected_cash
    }

@api_router.post("/cash-register/close")
async def close_cash_register(close_data: CashRegisterClose, background_tasks: BackgroundTasks, current_user: dict = Depends(get_current_user)):
    """إغلاق الصندوق مع جرد فئات النقود والحصول على تقرير شامل"""
    
    tenant_id = get_user_tenant_id(current_user)
    
    # Get current open shift for cashier
    shift_query = {
        "cashier_id": current_user["id"],
        "status": "open"
    }
    if tenant_id:
        shift_query["tenant_id"] = tenant_id
    
    shift = await db.shifts.find_one(shift_query)
    
    if not shift:
        raise HTTPException(status_code=404, detail="لا يوجد وردية مفتوحة")
    
    shift_id = shift["id"]
    
    # Get branch info
    branch = await db.branches.find_one({"id": shift["branch_id"]}, {"_id": 0, "name": 1})
    
    # Calculate closing cash from denominations
    denomination_values = {
        "250": 250, "500": 500, "1000": 1000, "5000": 5000, 
        "10000": 10000, "25000": 25000, "50000": 50000
    }
    closing_cash = sum(
        denomination_values.get(denom, int(denom)) * count 
        for denom, count in close_data.denominations.items()
    )
    
    # Build order query with tenant_id and shift_id
    order_query = {
        "shift_id": shift_id,
        "status": {"$ne": OrderStatus.CANCELLED}
    }
    if tenant_id:
        order_query["tenant_id"] = tenant_id
    
    orders = await db.orders.find(order_query).to_list(1000)
    
    # Fallback: إذا لم نجد طلبات بالـ shift_id، نبحث بالـ cashier_id وتاريخ الوردية
    if not orders:
        fallback_query = {
            "cashier_id": shift["cashier_id"],
            "created_at": {"$gte": shift["started_at"]},
            "status": {"$ne": OrderStatus.CANCELLED}
        }
        if tenant_id:
            fallback_query["tenant_id"] = tenant_id
        orders = await db.orders.find(fallback_query).to_list(1000)
    
    # Cancelled orders
    cancelled_query = {
        "shift_id": shift_id,
        "status": OrderStatus.CANCELLED
    }
    if tenant_id:
        cancelled_query["tenant_id"] = tenant_id
    
    cancelled_orders = await db.orders.find(cancelled_query).to_list(1000)
    
    # Fallback for cancelled orders
    if not cancelled_orders:
        cancelled_fallback = {
            "cashier_id": shift["cashier_id"],
            "created_at": {"$gte": shift["started_at"]},
            "status": OrderStatus.CANCELLED
        }
        if tenant_id:
            cancelled_fallback["tenant_id"] = tenant_id
        cancelled_orders = await db.orders.find(cancelled_fallback).to_list(1000)
    
    total_sales = sum(o["total"] for o in orders)
    total_cost = sum(o.get("total_cost", 0) for o in orders)
    gross_profit = total_sales - total_cost
    cash_sales = sum(o["total"] for o in orders if o["payment_method"] == PaymentMethod.CASH)
    card_sales = sum(o["total"] for o in orders if o["payment_method"] == PaymentMethod.CARD)
    credit_sales = sum(o["total"] for o in orders if o["payment_method"] == PaymentMethod.CREDIT)
    
    # Calculate delivery app sales
    delivery_app_sales = {}
    for o in orders:
        if o.get("delivery_app"):
            app = o["delivery_app"]
            if app not in delivery_app_sales:
                delivery_app_sales[app] = 0
            delivery_app_sales[app] += o["total"]
    
    # Calculate driver sales
    driver_sales = sum(o["total"] for o in orders if o.get("order_type") == OrderType.DELIVERY and o.get("driver_id"))
    
    # Calculate discounts
    discounts_total = sum(o.get("discount", 0) for o in orders)
    
    # Cancelled orders details
    cancelled_by = {}
    cancelled_amount = 0
    for o in cancelled_orders:
        cancelled_amount += o["total"]
        cancelled_by_id = o.get("cancelled_by", o.get("cashier_id"))
        if cancelled_by_id not in cancelled_by:
            user = await db.users.find_one({"id": cancelled_by_id}, {"_id": 0, "full_name": 1})
            cancelled_by[cancelled_by_id] = {
                "user_id": cancelled_by_id,
                "user_name": user["full_name"] if user else "غير معروف",
                "count": 0,
                "total": 0
            }
        cancelled_by[cancelled_by_id]["count"] += 1
        cancelled_by[cancelled_by_id]["total"] += o["total"]
    
    # Get expenses during shift
    expenses = await db.expenses.find({
        "branch_id": shift["branch_id"],
        "created_at": {"$gte": shift["started_at"]}
    }).to_list(100)
    total_expenses = sum(e["amount"] for e in expenses)
    
    # Calculate net profit
    net_profit = gross_profit - total_expenses
    
    expected_cash = shift["opening_cash"] + cash_sales - total_expenses
    cash_difference = closing_cash - expected_cash
    
    update_data = {
        "closing_cash": closing_cash,
        "expected_cash": expected_cash,
        "cash_difference": cash_difference,
        "total_sales": total_sales,
        "total_cost": total_cost,
        "gross_profit": gross_profit,
        "total_orders": len(orders),
        "cash_sales": cash_sales,
        "card_sales": card_sales,
        "credit_sales": credit_sales,
        "delivery_app_sales": delivery_app_sales,
        "driver_sales": driver_sales,
        "discounts_total": discounts_total,
        "cancelled_orders": len(cancelled_orders),
        "cancelled_amount": cancelled_amount,
        "cancelled_by": list(cancelled_by.values()),
        "total_expenses": total_expenses,
        "net_profit": net_profit,
        "ended_at": datetime.now(timezone.utc).isoformat(),
        "status": "closed",
        "notes": close_data.notes,
        "denominations": close_data.denominations
    }
    
    await db.shifts.update_one({"id": shift_id}, {"$set": update_data})
    
    # Get updated shift data with branch name
    updated_shift = await db.shifts.find_one({"id": shift_id}, {"_id": 0})
    updated_shift["branch_name"] = branch["name"] if branch else ""
    
    # Send email report
    settings = await db.settings.find_one({"type": "email_recipients"})
    if settings and settings.get("emails"):
        background_tasks.add_task(send_shift_report_email, updated_shift, settings["emails"])
    
    return updated_shift

# ==================== DRIVER ROUTES ====================

@api_router.post("/drivers", response_model=DriverResponse)
async def create_driver(driver: DriverCreate, current_user: dict = Depends(get_current_user)):
    if current_user["role"] not in [UserRole.ADMIN, UserRole.MANAGER, UserRole.SUPER_ADMIN]:
        raise HTTPException(status_code=403, detail="غير مصرح")
    
    driver_doc = {
        "id": str(uuid.uuid4()),
        **driver.model_dump(),
        "tenant_id": get_user_tenant_id(current_user),  # فصل البيانات
        "is_available": True,
        "current_order_id": None,
        "total_deliveries": 0
    }
    await db.drivers.insert_one(driver_doc)
    del driver_doc["_id"]
    return driver_doc

@api_router.get("/drivers", response_model=List[DriverResponse])
async def get_drivers(branch_id: Optional[str] = None, current_user: dict = Depends(get_current_user)):
    query = build_tenant_query(current_user)  # فلترة حسب tenant_id
    if branch_id:
        query["branch_id"] = branch_id
    drivers = await db.drivers.find(query, {"_id": 0}).to_list(100)
    return drivers

@api_router.put("/drivers/{driver_id}")
async def update_driver(driver_id: str, driver: DriverCreate, current_user: dict = Depends(get_current_user)):
    """تعديل بيانات السائق"""
    query = build_tenant_query(current_user, {"id": driver_id})
    existing = await db.drivers.find_one(query)
    if not existing:
        raise HTTPException(status_code=404, detail="السائق غير موجود")
    
    update_data = {
        "name": driver.name,
        "phone": driver.phone,
    }
    
    # إذا تم توفير user_id، نربط السائق بالمستخدم
    if driver.user_id:
        update_data["user_id"] = driver.user_id
    
    await db.drivers.update_one({"id": driver_id}, {"$set": update_data})
    return {"message": "تم تعديل السائق"}

@api_router.put("/drivers/{driver_id}/link-user")
async def link_driver_to_user(driver_id: str, user_id: str, current_user: dict = Depends(get_current_user)):
    """ربط السائق بحساب مستخدم"""
    query = build_tenant_query(current_user, {"id": driver_id})
    driver = await db.drivers.find_one(query)
    if not driver:
        raise HTTPException(status_code=404, detail="السائق غير موجود")
    
    user = await db.users.find_one({"id": user_id})
    if not user:
        raise HTTPException(status_code=404, detail="المستخدم غير موجود")
    
    if user.get("role") != "delivery":
        raise HTTPException(status_code=400, detail="المستخدم ليس سائق توصيل")
    
    await db.drivers.update_one({"id": driver_id}, {"$set": {"user_id": user_id}})
    return {"message": "تم ربط السائق بالمستخدم"}

@api_router.delete("/drivers/{driver_id}")
async def delete_driver(driver_id: str, current_user: dict = Depends(get_current_user)):
    """حذف السائق"""
    existing = await db.drivers.find_one({"id": driver_id})
    if not existing:
        raise HTTPException(status_code=404, detail="السائق غير موجود")
    
    # التحقق من عدم وجود طلبات نشطة
    if existing.get("current_order_id"):
        raise HTTPException(status_code=400, detail="لا يمكن حذف سائق لديه طلب نشط")
    
    await db.drivers.delete_one({"id": driver_id})
    return {"message": "تم حذف السائق"}

@api_router.get("/drivers/by-user/{user_id}")
async def get_driver_by_user(user_id: str, current_user: dict = Depends(get_current_user)):
    """جلب السائق المرتبط بحساب المستخدم"""
    driver = await db.drivers.find_one({"user_id": user_id}, {"_id": 0})
    if not driver:
        raise HTTPException(status_code=404, detail="لم يتم ربط حسابك بسائق")
    return driver

@api_router.put("/drivers/{driver_id}/assign")
async def assign_driver(driver_id: str, order_id: str, current_user: dict = Depends(get_current_user)):
    await db.drivers.update_one(
        {"id": driver_id},
        {"$set": {"is_available": False, "current_order_id": order_id}}
    )
    await db.orders.update_one(
        {"id": order_id},
        {"$set": {"driver_id": driver_id, "status": OrderStatus.PREPARING}}
    )
    return {"message": "تم تعيين السائق"}

@api_router.put("/drivers/{driver_id}/complete")
async def complete_delivery(driver_id: str, order_id: Optional[str] = None, current_user: dict = Depends(get_current_user)):
    driver = await db.drivers.find_one({"id": driver_id})
    if not driver:
        raise HTTPException(status_code=404, detail="السائق غير موجود")
    
    target_order_id = order_id or driver.get("current_order_id")
    
    if target_order_id:
        await db.orders.update_one(
            {"id": target_order_id},
            {"$set": {"status": OrderStatus.DELIVERED, "delivered_at": datetime.now(timezone.utc).isoformat()}}
        )
    
    await db.drivers.update_one(
        {"id": driver_id},
        {"$set": {"is_available": True, "current_order_id": None}, "$inc": {"total_deliveries": 1}}
    )
    return {"message": "تم التوصيل"}

@api_router.get("/drivers/{driver_id}/stats")
async def get_driver_stats(driver_id: str):
    """جلب إحصائيات السائق - المبالغ المدفوعة وغير المدفوعة"""
    driver = await db.drivers.find_one({"id": driver_id})
    if not driver:
        raise HTTPException(status_code=404, detail="السائق غير موجود")
    
    # جلب طلبات السائق
    orders = await db.orders.find({
        "driver_id": driver_id,
        "status": {"$in": [OrderStatus.DELIVERED, OrderStatus.PENDING, OrderStatus.READY]}
    }, {"_id": 0}).to_list(1000)
    
    # حساب المبالغ
    unpaid_total = sum(o.get("total", 0) for o in orders if o.get("driver_payment_status") != "paid")
    paid_total = sum(o.get("total", 0) for o in orders if o.get("driver_payment_status") == "paid")
    
    # المدفوع اليوم
    today = datetime.now(timezone.utc).date().isoformat()
    paid_today = sum(
        o.get("total", 0) for o in orders 
        if o.get("driver_payment_status") == "paid" and o.get("driver_paid_at", "").startswith(today)
    )
    
    # الطلبات المعلقة
    pending_orders = len([o for o in orders if o.get("status") in [OrderStatus.PENDING, OrderStatus.READY]])
    
    return {
        "unpaid_total": unpaid_total,
        "paid_total": paid_total,
        "paid_today": paid_today,
        "pending_orders": pending_orders,
        "total_orders": len(orders)
    }

@api_router.get("/drivers/{driver_id}/orders")
async def get_driver_orders(driver_id: str):
    """جلب طلبات السائق - غير المدفوعة أولاً"""
    driver = await db.drivers.find_one({"id": driver_id})
    if not driver:
        raise HTTPException(status_code=404, detail="السائق غير موجود")
    
    # جلب الطلبات مرتبة: غير المدفوعة أولاً، ثم حسب التاريخ
    orders = await db.orders.find({
        "driver_id": driver_id,
        "status": {"$in": [OrderStatus.DELIVERED, OrderStatus.PENDING, OrderStatus.READY]}
    }, {"_id": 0}).to_list(100)
    
    # ترتيب: غير المدفوعة أولاً
    orders.sort(key=lambda x: (x.get("driver_payment_status") == "paid", x.get("created_at", "")), reverse=False)
    
    return orders

@api_router.put("/orders/{order_id}/driver-payment")
async def update_driver_payment(order_id: str, is_paid: bool, current_user: dict = Depends(get_current_user)):
    """تحديث حالة دفع السائق للطلب"""
    order = await db.orders.find_one({"id": order_id})
    if not order:
        raise HTTPException(status_code=404, detail="الطلب غير موجود")
    
    update_data = {
        "driver_payment_status": "paid" if is_paid else "unpaid",
        "updated_at": datetime.now(timezone.utc).isoformat()
    }
    
    if is_paid:
        update_data["driver_paid_at"] = datetime.now(timezone.utc).isoformat()
        update_data["driver_paid_by"] = current_user["id"]
    
    await db.orders.update_one({"id": order_id}, {"$set": update_data})
    return {"message": "تم تحديث حالة الدفع"}

@api_router.post("/drivers/{driver_id}/collect-payment")
async def collect_driver_payment(driver_id: str, amount: float = 0, current_user: dict = Depends(get_current_user)):
    """تحصيل مبلغ من السائق - تحديد جميع طلباته كمدفوعة"""
    driver = await db.drivers.find_one({"id": driver_id})
    if not driver:
        raise HTTPException(status_code=404, detail="السائق غير موجود")
    
    # تحديث جميع الطلبات غير المدفوعة للسائق
    result = await db.orders.update_many(
        {"driver_id": driver_id, "driver_payment_status": {"$ne": "paid"}},
        {"$set": {
            "driver_payment_status": "paid",
            "driver_paid_at": datetime.now(timezone.utc).isoformat(),
            "driver_paid_by": current_user["id"]
        }}
    )
    
    # تسجيل عملية التحصيل
    payment_record = {
        "id": str(uuid.uuid4()),
        "driver_id": driver_id,
        "amount": amount,
        "collected_by": current_user["id"],
        "collected_at": datetime.now(timezone.utc).isoformat(),
        "orders_count": result.modified_count
    }
    await db.driver_payments.insert_one(payment_record)
    
    return {
        "message": f"تم تحصيل المبلغ وتحديث {result.modified_count} طلب",
        "orders_updated": result.modified_count
    }

# ==================== DRIVER PORTAL APIs - صفحة السائق على الهاتف ====================

@api_router.get("/drivers/portal/{driver_id}")
async def get_driver_portal_data(driver_id: str):
    """جلب بيانات السائق لصفحة الهاتف - بدون مصادقة"""
    driver = await db.drivers.find_one({"id": driver_id}, {"_id": 0})
    if not driver:
        raise HTTPException(status_code=404, detail="السائق غير موجود")
    
    # جلب طلبات السائق
    orders = await db.orders.find({
        "driver_id": driver_id,
        "status": {"$in": [OrderStatus.PENDING, OrderStatus.PREPARING, OrderStatus.READY, OrderStatus.DELIVERED]}
    }, {"_id": 0}).sort("created_at", -1).to_list(50)
    
    # حساب الإحصائيات
    today = datetime.now(timezone.utc).date().isoformat()
    unpaid_total = sum(o.get("total", 0) for o in orders if o.get("driver_payment_status") != "paid" and o.get("status") == OrderStatus.DELIVERED)
    paid_today = sum(
        o.get("total", 0) for o in orders 
        if o.get("driver_payment_status") == "paid" and o.get("driver_paid_at", "").startswith(today)
    )
    pending_orders = len([o for o in orders if o.get("status") in [OrderStatus.PENDING, OrderStatus.PREPARING, OrderStatus.READY]])
    
    return {
        "driver": driver,
        "orders": orders,
        "stats": {
            "unpaid_total": unpaid_total,
            "paid_today": paid_today,
            "pending_orders": pending_orders
        }
    }

@api_router.get("/drivers/portal/by-phone/{phone}")
async def get_driver_by_phone(phone: str):
    """جلب بيانات السائق برقم الهاتف"""
    driver = await db.drivers.find_one({"phone": phone}, {"_id": 0})
    if not driver:
        raise HTTPException(status_code=404, detail="السائق غير موجود")
    
    # استخدام نفس المنطق
    orders = await db.orders.find({
        "driver_id": driver["id"],
        "status": {"$in": [OrderStatus.PENDING, OrderStatus.PREPARING, OrderStatus.READY, OrderStatus.DELIVERED]}
    }, {"_id": 0}).sort("created_at", -1).to_list(50)
    
    today = datetime.now(timezone.utc).date().isoformat()
    unpaid_total = sum(o.get("total", 0) for o in orders if o.get("driver_payment_status") != "paid" and o.get("status") == OrderStatus.DELIVERED)
    paid_today = sum(
        o.get("total", 0) for o in orders 
        if o.get("driver_payment_status") == "paid" and o.get("driver_paid_at", "").startswith(today)
    )
    pending_orders = len([o for o in orders if o.get("status") in [OrderStatus.PENDING, OrderStatus.PREPARING, OrderStatus.READY]])
    
    return {
        "driver": driver,
        "orders": orders,
        "stats": {
            "unpaid_total": unpaid_total,
            "paid_today": paid_today,
            "pending_orders": pending_orders
        }
    }

@api_router.put("/drivers/portal/{driver_id}/complete")
async def complete_delivery_portal(driver_id: str, order_id: Optional[str] = None):
    """تأكيد التوصيل من صفحة السائق - بدون مصادقة"""
    driver = await db.drivers.find_one({"id": driver_id})
    if not driver:
        raise HTTPException(status_code=404, detail="السائق غير موجود")
    
    target_order_id = order_id or driver.get("current_order_id")
    
    if target_order_id:
        await db.orders.update_one(
            {"id": target_order_id},
            {"$set": {
                "status": OrderStatus.DELIVERED,
                "delivered_at": datetime.now(timezone.utc).isoformat()
            }}
        )
    
    await db.drivers.update_one(
        {"id": driver_id},
        {"$set": {"is_available": True, "current_order_id": None}, "$inc": {"total_deliveries": 1}}
    )
    return {"message": "تم التوصيل"}

@api_router.put("/drivers/portal/{driver_id}/location")
async def update_driver_location(driver_id: str, location: DriverLocationUpdate):
    """تحديث موقع السائق - GPS"""
    driver = await db.drivers.find_one({"id": driver_id})
    if not driver:
        raise HTTPException(status_code=404, detail="السائق غير موجود")
    
    await db.drivers.update_one(
        {"id": driver_id},
        {"$set": {
            "location_lat": location.latitude,
            "location_lng": location.longitude,
            "location_updated_at": datetime.now(timezone.utc).isoformat()
        }}
    )
    return {"message": "تم تحديث الموقع"}

@api_router.get("/drivers/locations")
async def get_drivers_locations(branch_id: Optional[str] = None, current_user: dict = Depends(get_current_user)):
    """جلب مواقع جميع السائقين للخريطة"""
    query = {"branch_id": branch_id} if branch_id else {}
    
    # جلب السائقين مع مواقعهم وحالة التوفر
    drivers = await db.drivers.find(query, {
        "_id": 0,
        "id": 1,
        "name": 1,
        "phone": 1,
        "is_available": 1,
        "current_order_id": 1,
        "location_lat": 1,
        "location_lng": 1,
        "location_updated_at": 1
    }).to_list(100)
    
    # إضافة معلومات الطلب الحالي لكل سائق
    for driver in drivers:
        if driver.get("current_order_id"):
            order = await db.orders.find_one(
                {"id": driver["current_order_id"]},
                {"_id": 0, "order_number": 1, "customer_name": 1, "delivery_address": 1, "status": 1}
            )
            driver["current_order"] = order
    
    return drivers

# ==================== DELIVERY APP SETTINGS ====================

@api_router.post("/delivery-app-settings")
async def create_delivery_app_setting(setting: DeliveryAppSettingCreate, current_user: dict = Depends(get_current_user)):
    if current_user["role"] != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="غير مصرح")
    
    # Check if exists
    existing = await db.delivery_app_settings.find_one({"app_id": setting.app_id})
    if existing:
        await db.delivery_app_settings.update_one({"app_id": setting.app_id}, {"$set": setting.model_dump()})
    else:
        await db.delivery_app_settings.insert_one(setting.model_dump())
    
    return {"message": "تم الحفظ"}

@api_router.get("/delivery-app-settings")
async def get_delivery_app_settings():
    settings = await db.delivery_app_settings.find({}, {"_id": 0}).to_list(20)
    return settings

@api_router.get("/delivery-apps")
async def get_delivery_apps():
    # Get default apps with their settings
    default_apps = [
        {"id": "toters", "name": "توترز", "name_en": "Toters", "icon": "Truck"},
        {"id": "talabat", "name": "طلبات", "name_en": "Talabat", "icon": "ShoppingBag"},
        {"id": "baly", "name": "بالي", "name_en": "Baly", "icon": "Package"},
        {"id": "alsaree3", "name": "عالسريع", "name_en": "Al-Sari3", "icon": "Zap"},
        {"id": "talabati", "name": "طلباتي", "name_en": "Talabati", "icon": "Box"},
    ]
    
    # Get settings for each app
    for app in default_apps:
        setting = await db.delivery_app_settings.find_one({"app_id": app["id"]}, {"_id": 0})
        if setting:
            app["commission_rate"] = setting.get("commission_rate", 0)
            app["is_active"] = setting.get("is_active", True)
        else:
            app["commission_rate"] = 0
            app["is_active"] = True
    
    return default_apps

# ==================== COMPREHENSIVE REPORTS ====================

@api_router.get("/reports/sales")
async def get_sales_report(
    branch_id: Optional[str] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    tenant_id = get_user_tenant_id(current_user)
    
    query = {"status": {"$ne": OrderStatus.CANCELLED}}
    
    # فلترة حسب tenant_id
    if tenant_id:
        query["tenant_id"] = tenant_id
    else:
        # المستخدم الرئيسي يرى فقط الطلبات بدون tenant_id
        query["$or"] = [{"tenant_id": {"$exists": False}}, {"tenant_id": None}]
    
    if branch_id:
        query["branch_id"] = branch_id
    if start_date:
        query["created_at"] = {"$gte": start_date}
    if end_date:
        query.setdefault("created_at", {})["$lte"] = end_date + "T23:59:59"
    
    orders = await db.orders.find(query, {"_id": 0}).to_list(10000)
    
    # جلب أسماء شركات التوصيل
    delivery_apps = await db.delivery_apps.find({}, {"_id": 0}).to_list(100)
    app_names = {app["id"]: app["name"] for app in delivery_apps}
    
    total_sales = sum(o["total"] for o in orders)
    total_cost = sum(o.get("total_cost", 0) for o in orders)
    total_profit = sum(o.get("profit", 0) for o in orders)
    total_orders = len(orders)
    avg_order_value = total_sales / total_orders if total_orders > 0 else 0
    
    by_payment = {}
    by_type = {}
    by_app = {}  # تفاصيل كل شركة توصيل
    by_date = {}
    by_product = {}
    
    for o in orders:
        # By payment method
        pm = o["payment_method"]
        by_payment[pm] = by_payment.get(pm, 0) + o["total"]
        
        # By order type
        ot = o["order_type"]
        by_type[ot] = by_type.get(ot, 0) + o["total"]
        
        # By delivery app - تفصيل كامل لكل شركة
        if o.get("delivery_app"):
            app_id = o["delivery_app"]
            app_name = o.get("delivery_app_name") or app_names.get(app_id, app_id)
            if app_name not in by_app:
                by_app[app_name] = {
                    "total_sales": 0,
                    "total_commission": 0,
                    "net_amount": 0,
                    "orders_count": 0,
                    "paid_orders": 0,
                    "credit_orders": 0
                }
            by_app[app_name]["total_sales"] += o["total"]
            by_app[app_name]["total_commission"] += o.get("delivery_commission", 0)
            by_app[app_name]["net_amount"] += o["total"] - o.get("delivery_commission", 0)
            by_app[app_name]["orders_count"] += 1
            if o.get("payment_status") == "paid":
                by_app[app_name]["paid_orders"] += 1
            else:
                by_app[app_name]["credit_orders"] += 1
        
        # By date
        date = o["created_at"][:10]
        if date not in by_date:
            by_date[date] = {"sales": 0, "orders": 0, "profit": 0}
        by_date[date]["sales"] += o["total"]
        by_date[date]["orders"] += 1
        by_date[date]["profit"] += o.get("profit", 0)
        
        # By product
        for item in o.get("items", []):
            pid = item.get("product_name", "Unknown")
            if pid not in by_product:
                by_product[pid] = {"quantity": 0, "revenue": 0}
            by_product[pid]["quantity"] += item.get("quantity", 0)
            by_product[pid]["revenue"] += item.get("price", 0) * item.get("quantity", 0)
    
    # حساب إجماليات التوصيل
    total_delivery_sales = sum(app["total_sales"] for app in by_app.values())
    total_delivery_commission = sum(app["total_commission"] for app in by_app.values())
    total_delivery_net = sum(app["net_amount"] for app in by_app.values())
    
    return {
        "total_sales": total_sales,
        "total_cost": total_cost,
        "total_profit": total_profit,
        "profit_margin": (total_profit / total_sales * 100) if total_sales > 0 else 0,
        "total_orders": total_orders,
        "average_order_value": avg_order_value,
        "by_payment_method": by_payment,
        "by_order_type": by_type,
        "by_delivery_app": by_app,  # تفاصيل كل شركة توصيل
        "delivery_summary": {
            "total_sales": total_delivery_sales,
            "total_commission": total_delivery_commission,
            "net_amount": total_delivery_net
        },
        "by_date": by_date,
        "top_products": dict(sorted(by_product.items(), key=lambda x: x[1]["revenue"], reverse=True)[:10])
    }

@api_router.get("/reports/purchases")
async def get_purchases_report(
    branch_id: Optional[str] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    query = {}
    if branch_id:
        query["branch_id"] = branch_id
    if start_date:
        query["created_at"] = {"$gte": start_date}
    if end_date:
        query.setdefault("created_at", {})["$lte"] = end_date + "T23:59:59"
    
    purchases = await db.purchases.find(query, {"_id": 0}).to_list(1000)
    
    total_purchases = sum(p["total_amount"] for p in purchases)
    by_supplier = {}
    by_date = {}
    by_payment_status = {"paid": 0, "pending": 0, "partial": 0}
    
    for p in purchases:
        # By supplier
        supplier = p.get("supplier_name", "Unknown")
        by_supplier[supplier] = by_supplier.get(supplier, 0) + p["total_amount"]
        
        # By date
        date = p["created_at"][:10]
        by_date[date] = by_date.get(date, 0) + p["total_amount"]
        
        # By payment status
        status = p.get("payment_status", "paid")
        by_payment_status[status] = by_payment_status.get(status, 0) + p["total_amount"]
    
    return {
        "total_purchases": total_purchases,
        "total_transactions": len(purchases),
        "by_supplier": by_supplier,
        "by_date": by_date,
        "by_payment_status": by_payment_status
    }

@api_router.get("/reports/inventory")
async def get_inventory_report(branch_id: Optional[str] = None, current_user: dict = Depends(get_current_user)):
    query = {"branch_id": branch_id} if branch_id else {}
    items = await db.inventory.find(query, {"_id": 0}).to_list(1000)
    
    low_stock = [i for i in items if i["quantity"] <= i["min_quantity"]]
    raw_materials = [i for i in items if i.get("item_type") == "raw"]
    finished_products = [i for i in items if i.get("item_type") == "finished"]
    
    total_value = sum(i["quantity"] * i["cost_per_unit"] for i in items)
    raw_value = sum(i["quantity"] * i["cost_per_unit"] for i in raw_materials)
    finished_value = sum(i["quantity"] * i["cost_per_unit"] for i in finished_products)
    
    return {
        "total_items": len(items),
        "raw_materials_count": len(raw_materials),
        "finished_products_count": len(finished_products),
        "low_stock_count": len(low_stock),
        "low_stock_items": low_stock,
        "total_inventory_value": total_value,
        "raw_materials_value": raw_value,
        "finished_products_value": finished_value,
        "items": items
    }

@api_router.get("/reports/expenses")
async def get_expenses_report(
    branch_id: Optional[str] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    query = {}
    if branch_id:
        query["branch_id"] = branch_id
    if start_date:
        query["date"] = {"$gte": start_date}
    if end_date:
        query.setdefault("date", {})["$lte"] = end_date
    
    expenses = await db.expenses.find(query, {"_id": 0}).to_list(1000)
    
    total_expenses = sum(e["amount"] for e in expenses)
    by_category = {}
    by_date = {}
    
    for e in expenses:
        # By category
        cat = e.get("category", "other")
        by_category[cat] = by_category.get(cat, 0) + e["amount"]
        
        # By date
        date = e.get("date", e["created_at"][:10])
        by_date[date] = by_date.get(date, 0) + e["amount"]
    
    return {
        "total_expenses": total_expenses,
        "total_transactions": len(expenses),
        "by_category": by_category,
        "by_date": by_date,
        "expenses": expenses
    }

@api_router.get("/reports/profit-loss")
async def get_profit_loss_report(
    branch_id: Optional[str] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    # Get sales data
    sales_query = {"status": {"$ne": OrderStatus.CANCELLED}}
    if branch_id:
        sales_query["branch_id"] = branch_id
    if start_date:
        sales_query["created_at"] = {"$gte": start_date}
    if end_date:
        sales_query.setdefault("created_at", {})["$lte"] = end_date + "T23:59:59"
    
    orders = await db.orders.find(sales_query, {"_id": 0}).to_list(10000)
    
    total_revenue = sum(o["total"] for o in orders)
    total_cost_of_goods = sum(o.get("total_cost", 0) for o in orders)
    delivery_commissions = sum(o.get("delivery_commission", 0) for o in orders)
    gross_profit = total_revenue - total_cost_of_goods - delivery_commissions
    
    # Get expenses
    expense_query = {}
    if branch_id:
        expense_query["branch_id"] = branch_id
    if start_date:
        expense_query["date"] = {"$gte": start_date}
    if end_date:
        expense_query.setdefault("date", {})["$lte"] = end_date
    
    expenses = await db.expenses.find(expense_query, {"_id": 0}).to_list(1000)
    total_expenses = sum(e["amount"] for e in expenses)
    
    # Calculate net profit
    net_profit = gross_profit - total_expenses
    
    return {
        "revenue": {
            "total_sales": total_revenue,
            "order_count": len(orders)
        },
        "cost_of_goods_sold": {
            "total": total_cost_of_goods,
            "percentage": (total_cost_of_goods / total_revenue * 100) if total_revenue > 0 else 0
        },
        "delivery_commissions": delivery_commissions,
        "gross_profit": {
            "amount": gross_profit,
            "margin": (gross_profit / total_revenue * 100) if total_revenue > 0 else 0
        },
        "operating_expenses": {
            "total": total_expenses,
            "breakdown": {}
        },
        "net_profit": {
            "amount": net_profit,
            "margin": (net_profit / total_revenue * 100) if total_revenue > 0 else 0
        }
    }

@api_router.get("/reports/delivery-credits")
async def get_delivery_credits_report(
    delivery_app: Optional[str] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    # جلب جميع الطلبات التي لها شركة توصيل (وليس فقط الآجل)
    query = {"delivery_app": {"$ne": None, "$exists": True}}
    if delivery_app:
        query["delivery_app"] = delivery_app
    if start_date:
        query["created_at"] = {"$gte": start_date}
    if end_date:
        query.setdefault("created_at", {})["$lte"] = end_date + "T23:59:59"
    
    orders = await db.orders.find(query, {"_id": 0}).to_list(10000)
    
    # جلب أسماء شركات التوصيل
    delivery_apps = await db.delivery_apps.find({}, {"_id": 0}).to_list(100)
    app_names = {app["id"]: app["name"] for app in delivery_apps}
    app_rates = {app["id"]: app["commission_rate"] for app in delivery_apps}
    
    by_app = {}
    for o in orders:
        app_id = o.get("delivery_app")
        # استخدام اسم الشركة بدلاً من الـ ID
        app_name = o.get("delivery_app_name") or app_names.get(app_id, app_id)
        
        if app_name not in by_app:
            by_app[app_name] = {
                "id": app_id,
                "commission_rate": app_rates.get(app_id, 0),
                "count": 0, 
                "total": 0, 
                "commission": 0,
                "net_amount": 0,
                "paid_count": 0,
                "credit_count": 0,
                "paid_amount": 0,
                "credit_amount": 0,
                "orders": []
            }
        
        by_app[app_name]["count"] += 1
        by_app[app_name]["total"] += o["total"]
        by_app[app_name]["commission"] += o.get("delivery_commission", 0)
        by_app[app_name]["net_amount"] += o["total"] - o.get("delivery_commission", 0)
        
        # تصنيف حسب حالة الدفع
        if o.get("payment_status") == "paid" or o.get("payment_method") != "credit":
            by_app[app_name]["paid_count"] += 1
            by_app[app_name]["paid_amount"] += o["total"]
        else:
            by_app[app_name]["credit_count"] += 1
            by_app[app_name]["credit_amount"] += o["total"]
        
        by_app[app_name]["orders"].append({
            "order_number": o["order_number"],
            "total": o["total"],
            "commission": o.get("delivery_commission", 0),
            "net": o["total"] - o.get("delivery_commission", 0),
            "payment_status": o.get("payment_status", "pending"),
            "created_at": o["created_at"]
        })
    
    # إجماليات
    total_all = sum(o["total"] for o in orders)
    total_commission = sum(o.get("delivery_commission", 0) for o in orders)
    total_credit = sum(o["total"] for o in orders if o.get("payment_method") == "credit")
    
    return {
        "total_sales": total_all,
        "total_credit": total_credit,
        "total_commission": total_commission,
        "net_receivable": total_all - total_commission,
        "total_orders": len(orders),
        "by_delivery_app": by_app
    }

@api_router.get("/reports/products")
async def get_products_report(
    branch_id: Optional[str] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    # Get all products
    products = await db.products.find({}, {"_id": 0}).to_list(1000)
    
    # Get orders for sales data
    order_query = {"status": {"$ne": OrderStatus.CANCELLED}}
    if branch_id:
        order_query["branch_id"] = branch_id
    if start_date:
        order_query["created_at"] = {"$gte": start_date}
    if end_date:
        order_query.setdefault("created_at", {})["$lte"] = end_date + "T23:59:59"
    
    orders = await db.orders.find(order_query, {"_id": 0}).to_list(10000)
    
    # Calculate sales by product
    product_sales = {}
    for o in orders:
        for item in o.get("items", []):
            pid = item.get("product_id")
            if pid not in product_sales:
                product_sales[pid] = {
                    "quantity_sold": 0,
                    "revenue": 0,
                    "cost": 0,
                    "profit": 0
                }
            qty = item.get("quantity", 0)
            product_sales[pid]["quantity_sold"] += qty
            product_sales[pid]["revenue"] += item.get("price", 0) * qty
            product_sales[pid]["cost"] += item.get("cost", 0)
    
    # Combine product info with sales
    result = []
    for p in products:
        sales = product_sales.get(p["id"], {})
        result.append({
            "id": p["id"],
            "name": p["name"],
            "category_id": p.get("category_id"),
            "price": p.get("price", 0),
            "cost": p.get("cost", 0),
            "operating_cost": p.get("operating_cost", 0),
            "profit_per_unit": p.get("price", 0) - p.get("cost", 0) - p.get("operating_cost", 0),
            "quantity_sold": sales.get("quantity_sold", 0),
            "total_revenue": sales.get("revenue", 0),
            "total_cost": sales.get("cost", 0),
            "total_profit": sales.get("revenue", 0) - sales.get("cost", 0)
        })
    
    # Sort by revenue
    result.sort(key=lambda x: x["total_revenue"], reverse=True)
    
    return {
        "products": result,
        "total_products": len(products),
        "top_selling": result[:10],
        "low_selling": sorted(result, key=lambda x: x["quantity_sold"])[:10]
    }

@api_router.get("/reports/cancellations")
async def get_cancellations_report(
    start_date: str,
    end_date: str,
    branch_id: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """تقرير الإلغاءات"""
    query = {
        "status": "cancelled",
        "created_at": {"$gte": start_date, "$lte": end_date + "T23:59:59"}
    }
    if branch_id:
        query["branch_id"] = branch_id
    
    cancelled_orders = await db.orders.find(query, {"_id": 0}).to_list(500)
    
    # حساب إجمالي الطلبات للنسبة
    total_query = {"created_at": {"$gte": start_date, "$lte": end_date + "T23:59:59"}}
    if branch_id:
        total_query["branch_id"] = branch_id
    total_orders = await db.orders.count_documents(total_query)
    
    # إلغاءات اليوم
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    today_query = {"status": "cancelled", "created_at": {"$regex": f"^{today}"}}
    if branch_id:
        today_query["branch_id"] = branch_id
    today_cancelled = await db.orders.count_documents(today_query)
    
    total_value = sum(o.get("total", 0) for o in cancelled_orders)
    cancellation_rate = (len(cancelled_orders) / total_orders * 100) if total_orders > 0 else 0
    
    return {
        "total_cancelled": len(cancelled_orders),
        "total_value": total_value,
        "cancellation_rate": cancellation_rate,
        "today_cancelled": today_cancelled,
        "orders": cancelled_orders
    }

@api_router.get("/reports/discounts")
async def get_discounts_report(
    start_date: str,
    end_date: str,
    branch_id: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """تقرير الخصومات"""
    query = {
        "discount": {"$gt": 0},
        "created_at": {"$gte": start_date, "$lte": end_date + "T23:59:59"}
    }
    if branch_id:
        query["branch_id"] = branch_id
    
    orders = await db.orders.find(query, {"_id": 0}).to_list(500)
    
    # حساب إجمالي المبيعات للنسبة
    sales_query = {"created_at": {"$gte": start_date, "$lte": end_date + "T23:59:59"}, "status": {"$ne": "cancelled"}}
    if branch_id:
        sales_query["branch_id"] = branch_id
    all_orders = await db.orders.find(sales_query, {"total": 1}).to_list(5000)
    total_sales = sum(o.get("total", 0) for o in all_orders)
    
    total_discounts = sum(o.get("discount", 0) for o in orders)
    discount_percentage = (total_discounts / total_sales * 100) if total_sales > 0 else 0
    average_discount = total_discounts / len(orders) if orders else 0
    
    return {
        "total_discounts": total_discounts,
        "orders_with_discount": len(orders),
        "average_discount": average_discount,
        "discount_percentage": discount_percentage,
        "orders": orders
    }

@api_router.get("/reports/credit")
async def get_credit_report(
    start_date: str,
    end_date: str,
    branch_id: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """تقرير الآجل"""
    query = {
        "payment_method": "credit",
        "created_at": {"$gte": start_date, "$lte": end_date + "T23:59:59"}
    }
    if branch_id:
        query["branch_id"] = branch_id
    
    orders = await db.orders.find(query, {"_id": 0}).to_list(500)
    
    total_credit = sum(o.get("total", 0) for o in orders)
    collected = sum(o.get("total", 0) for o in orders if o.get("credit_collected"))
    remaining = total_credit - collected
    
    return {
        "total_credit": total_credit,
        "total_orders": len(orders),
        "collected_amount": collected,
        "remaining_amount": remaining,
        "orders": orders
    }

# ==================== CASH REGISTER ROUTES ====================

# Note: The main cash register close endpoint is defined above at /api/cash-register/close 
# with the complete functionality including shift management

@api_router.get("/cash-register/today")
async def get_today_cash_register(current_user: dict = Depends(get_current_user)):
    """جلب بيانات صندوق اليوم"""
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    branch_id = current_user.get("branch_id")
    
    # مبيعات اليوم النقدية
    sales_query = {
        "created_at": {"$regex": f"^{today}"},
        "payment_method": "cash",
        "status": {"$ne": "cancelled"}
    }
    if branch_id:
        sales_query["branch_id"] = branch_id
    
    cash_orders = await db.orders.find(sales_query, {"_id": 0, "total": 1, "order_number": 1}).to_list(500)
    total_cash_sales = sum(o.get("total", 0) for o in cash_orders)
    
    # مبيعات البطاقة
    card_query = sales_query.copy()
    card_query["payment_method"] = "card"
    card_orders = await db.orders.find(card_query, {"total": 1}).to_list(500)
    total_card_sales = sum(o.get("total", 0) for o in card_orders)
    
    # الآجل
    credit_query = sales_query.copy()
    credit_query["payment_method"] = "credit"
    credit_orders = await db.orders.find(credit_query, {"total": 1}).to_list(500)
    total_credit = sum(o.get("total", 0) for o in credit_orders)
    
    # المصاريف
    expenses_query = {"date": today}
    if branch_id:
        expenses_query["branch_id"] = branch_id
    expenses = await db.expenses.find(expenses_query, {"_id": 0}).to_list(100)
    total_expenses = sum(e.get("amount", 0) for e in expenses)
    
    # آخر إغلاق
    last_close_query = {"branch_id": branch_id} if branch_id else {}
    last_close = await db.cash_register_closes.find_one(
        last_close_query, 
        {"_id": 0},
        sort=[("closed_at", -1)]
    )
    
    return {
        "date": today,
        "cash_sales": total_cash_sales,
        "card_sales": total_card_sales,
        "credit_sales": total_credit,
        "total_sales": total_cash_sales + total_card_sales + total_credit,
        "orders_count": len(cash_orders) + len(card_orders) + len(credit_orders),
        "expenses": expenses,
        "total_expenses": total_expenses,
        "expected_cash": total_cash_sales - total_expenses,
        "last_close": last_close
    }

# ==================== SETTINGS ROUTES ====================

@api_router.get("/settings")
async def get_settings(current_user: dict = Depends(get_current_user)):
    settings = await db.settings.find({}, {"_id": 0}).to_list(100)
    return {s["type"]: s.get("value") or s for s in settings}

@api_router.post("/settings/email-recipients")
async def set_email_recipients(emails: List[str], current_user: dict = Depends(get_current_user)):
    if current_user["role"] != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="غير مصرح")
    
    await db.settings.update_one(
        {"type": "email_recipients"},
        {"$set": {"type": "email_recipients", "emails": emails}},
        upsert=True
    )
    return {"message": "تم الحفظ"}

@api_router.post("/settings/currencies")
async def set_currencies(currencies: List[Currency], current_user: dict = Depends(get_current_user)):
    if current_user["role"] != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="غير مصرح")
    
    await db.settings.update_one(
        {"type": "currencies"},
        {"$set": {"type": "currencies", "value": [c.model_dump() for c in currencies]}},
        upsert=True
    )
    return {"message": "تم الحفظ"}

@api_router.post("/settings/general")
async def set_general_settings(settings: Dict[str, Any], current_user: dict = Depends(get_current_user)):
    if current_user["role"] != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="غير مصرح")
    
    await db.settings.update_one(
        {"type": "general"},
        {"$set": {"type": "general", "value": settings}},
        upsert=True
    )
    return {"message": "تم الحفظ"}

@api_router.get("/settings/general")
async def get_general_settings():
    settings = await db.settings.find_one({"type": "general"}, {"_id": 0})
    return settings.get("value", {}) if settings else {}

@api_router.put("/settings/dashboard")
async def set_dashboard_settings(settings: Dict[str, Any], current_user: dict = Depends(get_current_user)):
    """حفظ إعدادات الصفحة الرئيسية - التحكم في الصفحات الظاهرة"""
    if current_user["role"] not in [UserRole.ADMIN, UserRole.MANAGER]:
        raise HTTPException(status_code=403, detail="غير مصرح")
    
    await db.settings.update_one(
        {"type": "dashboard_settings"},
        {"$set": {"type": "dashboard_settings", "value": settings}},
        upsert=True
    )
    return {"message": "تم حفظ إعدادات الصفحة الرئيسية"}

@api_router.get("/settings/dashboard")
async def get_dashboard_settings():
    """جلب إعدادات الصفحة الرئيسية"""
    settings = await db.settings.find_one({"type": "dashboard_settings"}, {"_id": 0})
    return settings.get("value", {
        "showPOS": True,
        "showTables": True,
        "showOrders": True,
        "showExpenses": True,
        "showInventory": True,
        "showDelivery": True,
        "showReports": True,
        "showSettings": True
    }) if settings else {}

# ==================== PRINTER ROUTES ====================

class PrinterCreate(BaseModel):
    name: str
    ip_address: str
    port: int = 9100
    branch_id: str
    printer_type: str = "receipt"

@api_router.post("/printers")
async def create_printer(printer: PrinterCreate, current_user: dict = Depends(get_current_user)):
    if current_user["role"] not in [UserRole.ADMIN, UserRole.MANAGER]:
        raise HTTPException(status_code=403, detail="غير مصرح")
    
    printer_doc = {
        "id": str(uuid.uuid4()),
        **printer.model_dump(),
        "is_active": True
    }
    await db.printers.insert_one(printer_doc)
    del printer_doc["_id"]
    return printer_doc

@api_router.get("/printers")
async def get_printers(branch_id: Optional[str] = None):
    query = {"branch_id": branch_id} if branch_id else {}
    printers = await db.printers.find(query, {"_id": 0}).to_list(50)
    return printers

# ==================== SUPER ADMIN & TENANT MANAGEMENT ====================
# نظام إدارة المستأجرين - لوحة تحكم المالك الرئيسي

# كلمة سر خاصة للـ Super Admin - من متغيرات البيئة
SUPER_ADMIN_SECRET = os.environ.get("SUPER_ADMIN_SECRET", "271018")

# التحقق من صلاحية Super Admin
async def verify_super_admin(current_user: dict = Depends(get_current_user)):
    if current_user.get("role") != UserRole.SUPER_ADMIN:
        raise HTTPException(status_code=403, detail="صلاحيات Super Admin مطلوبة")
    return current_user

@api_router.post("/super-admin/login")
async def super_admin_login(email: str, password: str, secret_key: str):
    """تسجيل دخول Super Admin"""
    if secret_key != SUPER_ADMIN_SECRET:
        raise HTTPException(status_code=403, detail="مفتاح السر غير صحيح")
    
    user = await db.users.find_one({"email": email, "role": UserRole.SUPER_ADMIN})
    if not user:
        raise HTTPException(status_code=401, detail="المستخدم غير موجود")
    
    if not verify_password(password, user["password"]):
        raise HTTPException(status_code=401, detail="كلمة المرور غير صحيحة")
    
    token = create_token(user["id"], user["role"], user.get("branch_id"))
    
    return {
        "token": token,
        "user": {
            "id": user["id"],
            "email": user["email"],
            "full_name": user["full_name"],
            "role": user["role"]
        }
    }

@api_router.post("/super-admin/register")
async def register_super_admin(secret_key: str, email: str, password: str, full_name: str):
    """إنشاء حساب Super Admin (مرة واحدة فقط)"""
    if secret_key != SUPER_ADMIN_SECRET:
        raise HTTPException(status_code=403, detail="مفتاح السر غير صحيح")
    
    # التحقق من عدم وجود Super Admin
    existing = await db.users.find_one({"role": UserRole.SUPER_ADMIN})
    if existing:
        raise HTTPException(status_code=400, detail="يوجد Super Admin بالفعل")
    
    # التحقق من عدم وجود البريد
    email_exists = await db.users.find_one({"email": email})
    if email_exists:
        raise HTTPException(status_code=400, detail="البريد الإلكتروني مستخدم")
    
    user_doc = {
        "id": str(uuid.uuid4()),
        "username": "super_admin",
        "email": email,
        "password": hash_password(password),
        "full_name": full_name,
        "role": UserRole.SUPER_ADMIN,
        "branch_id": None,
        "tenant_id": None,
        "permissions": ["all", "super_admin"],
        "is_active": True,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    
    await db.users.insert_one(user_doc)
    
    token = create_token(user_doc["id"], user_doc["role"], None)
    
    return {
        "message": "تم إنشاء حساب Super Admin بنجاح",
        "token": token,
        "user": {
            "id": user_doc["id"],
            "email": user_doc["email"],
            "full_name": user_doc["full_name"],
            "role": user_doc["role"]
        }
    }

@api_router.get("/super-admin/tenants")
async def get_all_tenants(current_user: dict = Depends(verify_super_admin)):
    """جلب جميع المستأجرين (العملاء) بما فيهم النظام الرئيسي"""
    tenants = await db.tenants.find({}, {"_id": 0}).sort("created_at", -1).to_list(1000)
    
    # إضافة إحصائيات لكل مستأجر
    for tenant in tenants:
        tenant["users_count"] = await db.users.count_documents({"tenant_id": tenant["id"]})
        tenant["branches_count"] = await db.branches.count_documents({"tenant_id": tenant["id"]})
        tenant["orders_count"] = await db.orders.count_documents({"tenant_id": tenant["id"]})
    
    # إضافة النظام الرئيسي كـ "عميل" وهمي
    main_system_users = await db.users.count_documents({
        "$or": [{"tenant_id": {"$exists": False}}, {"tenant_id": None}],
        "role": {"$ne": UserRole.SUPER_ADMIN}
    })
    main_system_branches = await db.branches.count_documents({
        "$or": [{"tenant_id": {"$exists": False}}, {"tenant_id": None}]
    })
    main_system_orders = await db.orders.count_documents({
        "$or": [{"tenant_id": {"$exists": False}}, {"tenant_id": None}]
    })
    
    # حساب مبيعات النظام الرئيسي
    main_sales_cursor = db.orders.aggregate([
        {"$match": {"$or": [{"tenant_id": {"$exists": False}}, {"tenant_id": None}], "status": {"$ne": "cancelled"}}},
        {"$group": {"_id": None, "total": {"$sum": "$total"}}}
    ])
    main_sales_result = await main_sales_cursor.to_list(1)
    main_total_sales = main_sales_result[0]["total"] if main_sales_result else 0
    
    main_system = {
        "id": "main-system",
        "name": "🏠 النظام الرئيسي",
        "slug": "main",
        "owner_name": "المالك",
        "owner_email": "admin@maestroegp.com",
        "owner_phone": "",
        "subscription_type": "premium",
        "is_active": True,
        "is_main_system": True,  # علامة خاصة للنظام الرئيسي
        "users_count": main_system_users,
        "branches_count": main_system_branches,
        "orders_count": main_system_orders,
        "total_sales": main_total_sales,
        "created_at": "2024-01-01T00:00:00"
    }
    
    # إضافة النظام الرئيسي في أول القائمة
    return [main_system] + tenants

@api_router.post("/super-admin/tenants")
async def create_tenant(tenant: TenantCreate, current_user: dict = Depends(verify_super_admin)):
    """إنشاء مستأجر جديد (عميل جديد)"""
    
    # التحقق من عدم وجود slug مكرر
    existing = await db.tenants.find_one({"slug": tenant.slug})
    if existing:
        raise HTTPException(status_code=400, detail="الرابط المختصر مستخدم")
    
    # التحقق من عدم وجود البريد
    email_exists = await db.users.find_one({"email": tenant.owner_email})
    if email_exists:
        raise HTTPException(status_code=400, detail="البريد الإلكتروني مستخدم")
    
    tenant_id = str(uuid.uuid4())
    
    # تحديد تاريخ انتهاء الاشتراك
    if tenant.subscription_type == "trial":
        expires_at = (datetime.now(timezone.utc) + timedelta(days=14)).isoformat()
    else:
        expires_at = (datetime.now(timezone.utc) + timedelta(days=365)).isoformat()
    
    tenant_doc = {
        "id": tenant_id,
        "name": tenant.name,
        "slug": tenant.slug,
        "owner_name": tenant.owner_name,
        "owner_email": tenant.owner_email,
        "owner_phone": tenant.owner_phone,
        "subscription_type": tenant.subscription_type,
        "max_branches": tenant.max_branches,
        "max_users": tenant.max_users,
        "is_active": True,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "expires_at": expires_at,
        "created_by": current_user["id"]
    }
    
    await db.tenants.insert_one(tenant_doc)
    
    # إنشاء مستخدم admin للمستأجر
    admin_password = f"{tenant.slug}123"  # كلمة مرور افتراضية
    admin_doc = {
        "id": str(uuid.uuid4()),
        "username": f"{tenant.slug}_admin",
        "email": tenant.owner_email,
        "password": hash_password(admin_password),
        "full_name": tenant.owner_name,
        "role": UserRole.ADMIN,
        "branch_id": None,
        "tenant_id": tenant_id,
        "permissions": ["all"],
        "is_active": True,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    
    await db.users.insert_one(admin_doc)
    
    # إنشاء فرع افتراضي للمستأجر
    branch_doc = {
        "id": str(uuid.uuid4()),
        "name": "الفرع الرئيسي",
        "address": "",
        "phone": tenant.owner_phone,
        "email": tenant.owner_email,
        "tenant_id": tenant_id,
        "is_active": True,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    
    await db.branches.insert_one(branch_doc)
    
    del tenant_doc["_id"]
    
    return {
        "tenant": tenant_doc,
        "admin_credentials": {
            "email": tenant.owner_email,
            "password": admin_password,
            "message": "يرجى تغيير كلمة المرور فور تسجيل الدخول"
        },
        "access_url": f"/tenant/{tenant.slug}"
    }

@api_router.get("/super-admin/tenants/{tenant_id}")
async def get_tenant_details(tenant_id: str, current_user: dict = Depends(verify_super_admin)):
    """تفاصيل مستأجر معين"""
    
    # التحقق إذا كان النظام الرئيسي
    if tenant_id == "main-system":
        # جلب مستخدمي النظام الرئيسي (بدون tenant_id)
        users = await db.users.find({
            "$or": [{"tenant_id": {"$exists": False}}, {"tenant_id": None}],
            "role": {"$ne": UserRole.SUPER_ADMIN}
        }, {"_id": 0, "password": 0}).to_list(100)
        
        branches = await db.branches.find({
            "$or": [{"tenant_id": {"$exists": False}}, {"tenant_id": None}]
        }, {"_id": 0}).to_list(50)
        
        # إحصائيات المبيعات للنظام الرئيسي
        today = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0).isoformat()
        orders_today = await db.orders.count_documents({
            "$or": [{"tenant_id": {"$exists": False}}, {"tenant_id": None}],
            "created_at": {"$gte": today}
        })
        
        total_sales_cursor = db.orders.aggregate([
            {"$match": {"$or": [{"tenant_id": {"$exists": False}}, {"tenant_id": None}], "status": {"$ne": "cancelled"}}},
            {"$group": {"_id": None, "total": {"$sum": "$total"}}}
        ])
        total_sales_result = await total_sales_cursor.to_list(1)
        total_sales = total_sales_result[0]["total"] if total_sales_result else 0
        
        # إجمالي الطلبات
        total_orders = await db.orders.count_documents({
            "$or": [{"tenant_id": {"$exists": False}}, {"tenant_id": None}]
        })
        
        return {
            "tenant": {
                "id": "main-system",
                "name": "🏠 النظام الرئيسي",
                "slug": "main",
                "owner_name": "المالك",
                "owner_email": "admin@maestroegp.com",
                "owner_phone": "",
                "subscription_type": "premium",
                "is_active": True,
                "is_main_system": True,
                "created_at": "2024-01-01T00:00:00"
            },
            "users": users,
            "branches": branches,
            "stats": {
                "users_count": len(users),
                "branches_count": len(branches),
                "orders_today": orders_today,
                "total_sales": total_sales,
                "total_orders": total_orders
            }
        }
    
    # للعملاء العاديين
    tenant = await db.tenants.find_one({"id": tenant_id}, {"_id": 0})
    if not tenant:
        raise HTTPException(status_code=404, detail="المستأجر غير موجود")
    
    # إحصائيات تفصيلية
    users = await db.users.find({"tenant_id": tenant_id}, {"_id": 0, "password": 0}).to_list(100)
    branches = await db.branches.find({"tenant_id": tenant_id}, {"_id": 0}).to_list(50)
    
    # إحصائيات المبيعات
    today = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0).isoformat()
    orders_today = await db.orders.count_documents({
        "tenant_id": tenant_id,
        "created_at": {"$gte": today}
    })
    
    total_sales_cursor = db.orders.aggregate([
        {"$match": {"tenant_id": tenant_id, "status": {"$ne": "cancelled"}}},
        {"$group": {"_id": None, "total": {"$sum": "$total"}}}
    ])
    total_sales_result = await total_sales_cursor.to_list(1)
    total_sales = total_sales_result[0]["total"] if total_sales_result else 0
    
    return {
        "tenant": tenant,
        "users": users,
        "branches": branches,
        "stats": {
            "users_count": len(users),
            "branches_count": len(branches),
            "orders_today": orders_today,
            "total_sales": total_sales
        }
    }

@api_router.put("/super-admin/tenants/{tenant_id}")
async def update_tenant(tenant_id: str, updates: dict, current_user: dict = Depends(verify_super_admin)):
    """تحديث بيانات مستأجر"""
    tenant = await db.tenants.find_one({"id": tenant_id})
    if not tenant:
        raise HTTPException(status_code=404, detail="المستأجر غير موجود")
    
    allowed_updates = ["name", "subscription_type", "max_branches", "max_users", "is_active", "expires_at"]
    update_data = {k: v for k, v in updates.items() if k in allowed_updates}
    
    if update_data:
        await db.tenants.update_one({"id": tenant_id}, {"$set": update_data})
    
    updated = await db.tenants.find_one({"id": tenant_id}, {"_id": 0})
    return updated

@api_router.delete("/super-admin/tenants/{tenant_id}")
async def delete_tenant(tenant_id: str, current_user: dict = Depends(verify_super_admin)):
    """حذف مستأجر (تعطيل)"""
    tenant = await db.tenants.find_one({"id": tenant_id})
    if not tenant:
        raise HTTPException(status_code=404, detail="المستأجر غير موجود")
    
    # تعطيل بدلاً من الحذف
    await db.tenants.update_one({"id": tenant_id}, {"$set": {"is_active": False}})
    await db.users.update_many({"tenant_id": tenant_id}, {"$set": {"is_active": False}})
    
    return {"message": "تم تعطيل المستأجر وجميع مستخدميه"}

@api_router.post("/super-admin/tenants/{tenant_id}/reset-password")
async def reset_tenant_admin_password(tenant_id: str, new_password: str, current_user: dict = Depends(verify_super_admin)):
    """إعادة تعيين كلمة مرور مدير المستأجر"""
    
    # التحقق إذا كان النظام الرئيسي
    if tenant_id == "main-system":
        # البحث عن admin النظام الرئيسي
        admin = await db.users.find_one({
            "$or": [{"tenant_id": {"$exists": False}}, {"tenant_id": None}],
            "role": UserRole.ADMIN
        })
        if not admin:
            raise HTTPException(status_code=404, detail="مدير النظام الرئيسي غير موجود")
        
        await db.users.update_one(
            {"id": admin["id"]},
            {"$set": {"password": hash_password(new_password)}}
        )
        
        return {"message": "تم إعادة تعيين كلمة مرور مدير النظام الرئيسي", "email": admin["email"]}
    
    # للعملاء العاديين
    tenant = await db.tenants.find_one({"id": tenant_id})
    if not tenant:
        raise HTTPException(status_code=404, detail="المستأجر غير موجود")
    
    # البحث عن admin المستأجر
    admin = await db.users.find_one({"tenant_id": tenant_id, "role": UserRole.ADMIN})
    if not admin:
        raise HTTPException(status_code=404, detail="مدير المستأجر غير موجود")
    
    await db.users.update_one(
        {"id": admin["id"]},
        {"$set": {"password": hash_password(new_password)}}
    )
    
    return {"message": "تم إعادة تعيين كلمة المرور", "email": admin["email"]}

@api_router.get("/super-admin/stats")
async def get_super_admin_stats(current_user: dict = Depends(verify_super_admin)):
    """إحصائيات شاملة للـ Super Admin"""
    
    total_tenants = await db.tenants.count_documents({})
    active_tenants = await db.tenants.count_documents({"is_active": True})
    total_users = await db.users.count_documents({"role": {"$ne": UserRole.SUPER_ADMIN}})
    
    # حساب الطلبات فقط للعملاء (الذين لديهم tenant_id)
    total_orders = await db.orders.count_documents({"tenant_id": {"$exists": True, "$ne": None}})
    
    # المبيعات الإجمالية - فقط للعملاء
    sales_cursor = db.orders.aggregate([
        {"$match": {"status": {"$ne": "cancelled"}, "tenant_id": {"$exists": True, "$ne": None}}},
        {"$group": {"_id": None, "total": {"$sum": "$total"}}}
    ])
    sales_result = await sales_cursor.to_list(1)
    total_sales = sales_result[0]["total"] if sales_result else 0
    
    # المستأجرين حسب نوع الاشتراك
    subscription_stats = await db.tenants.aggregate([
        {"$group": {"_id": "$subscription_type", "count": {"$sum": 1}}}
    ]).to_list(10)
    
    # أحدث المستأجرين
    recent_tenants = await db.tenants.find({}, {"_id": 0}).sort("created_at", -1).limit(5).to_list(5)
    
    return {
        "total_tenants": total_tenants,
        "active_tenants": active_tenants,
        "inactive_tenants": total_tenants - active_tenants,
        "total_users": total_users,
        "total_orders": total_orders,
        "total_sales": total_sales,
        "subscription_stats": {item["_id"]: item["count"] for item in subscription_stats},
        "recent_tenants": recent_tenants
    }

@api_router.post("/super-admin/impersonate/{tenant_id}")
async def impersonate_tenant(tenant_id: str, current_user: dict = Depends(verify_super_admin)):
    """الدخول كعميل - للمشاهدة والتحكم المباشر"""
    
    # التحقق إذا كان النظام الرئيسي
    if tenant_id == "main-system":
        # البحث عن admin النظام الرئيسي
        admin = await db.users.find_one({
            "$or": [{"tenant_id": {"$exists": False}}, {"tenant_id": None}],
            "role": UserRole.ADMIN
        })
        if not admin:
            raise HTTPException(status_code=404, detail="مدير النظام الرئيسي غير موجود")
        
        # إنشاء token للدخول
        token = create_token(admin["id"], admin["role"], admin.get("branch_id"))
        
        return {
            "token": token,
            "user": {
                "id": admin["id"],
                "email": admin["email"],
                "full_name": admin["full_name"],
                "role": admin["role"],
                "tenant_id": None
            },
            "tenant": {
                "id": "main-system",
                "name": "🏠 النظام الرئيسي",
                "is_main_system": True
            },
            "impersonated": True,
            "original_super_admin": current_user["id"]
        }
    
    # للعملاء العاديين
    tenant = await db.tenants.find_one({"id": tenant_id}, {"_id": 0})
    if not tenant:
        raise HTTPException(status_code=404, detail="العميل غير موجود")
    
    # البحث عن admin العميل
    admin = await db.users.find_one({"tenant_id": tenant_id, "role": UserRole.ADMIN})
    if not admin:
        raise HTTPException(status_code=404, detail="مدير العميل غير موجود")
    
    # إنشاء token للدخول كالعميل مع علامة impersonation
    token = create_token(admin["id"], admin["role"], admin.get("branch_id"))
    
    return {
        "token": token,
        "user": {
            "id": admin["id"],
            "email": admin["email"],
            "full_name": admin["full_name"],
            "role": admin["role"],
            "tenant_id": tenant_id
        },
        "tenant": tenant,
        "impersonated": True,
        "original_super_admin": current_user["id"]
    }

@api_router.get("/super-admin/tenants/{tenant_id}/live-stats")
async def get_tenant_live_stats(tenant_id: str, current_user: dict = Depends(verify_super_admin)):
    """إحصائيات حية للعميل"""
    
    # التحقق إذا كان النظام الرئيسي
    if tenant_id == "main-system":
        tenant = {
            "id": "main-system",
            "name": "🏠 النظام الرئيسي",
            "is_main_system": True
        }
        tenant_query = {"$or": [{"tenant_id": {"$exists": False}}, {"tenant_id": None}]}
    else:
        tenant = await db.tenants.find_one({"id": tenant_id}, {"_id": 0})
        if not tenant:
            raise HTTPException(status_code=404, detail="العميل غير موجود")
        tenant_query = {"tenant_id": tenant_id}
    
    # إحصائيات اليوم
    today = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0).isoformat()
    
    today_query = {**tenant_query, "created_at": {"$gte": today}}
    today_orders = await db.orders.find(today_query, {"_id": 0}).to_list(500)
    
    # حساب الإحصائيات
    total_today = sum(o["total"] for o in today_orders if o.get("status") != "cancelled")
    pending_orders = len([o for o in today_orders if o.get("status") == "pending"])
    preparing_orders = len([o for o in today_orders if o.get("status") == "preparing"])
    delivered_orders = len([o for o in today_orders if o.get("status") == "delivered"])
    cancelled_orders = len([o for o in today_orders if o.get("status") == "cancelled"])
    
    # المنتجات الأكثر مبيعاً اليوم
    product_sales = {}
    for order in today_orders:
        if order.get("status") != "cancelled":
            for item in order.get("items", []):
                name = item.get("name", "غير معروف")
                if name not in product_sales:
                    product_sales[name] = {"quantity": 0, "total": 0}
                product_sales[name]["quantity"] += item.get("quantity", 0)
                product_sales[name]["total"] += item.get("subtotal", 0)
    
    top_products = sorted(product_sales.items(), key=lambda x: x[1]["total"], reverse=True)[:5]
    
    # المستخدمين النشطين (لديهم وردية مفتوحة)
    active_shifts = await db.shifts.count_documents({
        "status": "open"
    })
    
    return {
        "tenant": tenant,
        "today": {
            "total_sales": total_today,
            "total_orders": len(today_orders),
            "pending_orders": pending_orders,
            "preparing_orders": preparing_orders,
            "delivered_orders": delivered_orders,
            "cancelled_orders": cancelled_orders
        },
        "top_products": [{"name": p[0], **p[1]} for p in top_products],
        "active_shifts": active_shifts,
        "recent_orders": today_orders[:10]  # آخر 10 طلبات
    }

@api_router.get("/super-admin/tenants/{tenant_id}/orders")
async def get_tenant_orders(tenant_id: str, date: Optional[str] = None, status: Optional[str] = None, current_user: dict = Depends(verify_super_admin)):
    """جلب طلبات عميل معين"""
    
    query = {"tenant_id": tenant_id}
    if date:
        query["created_at"] = {"$regex": f"^{date}"}
    if status:
        query["status"] = status
    
    orders = await db.orders.find(query, {"_id": 0}).sort("created_at", -1).limit(100).to_list(100)
    return orders

@api_router.get("/super-admin/tenants/{tenant_id}/products")
async def get_tenant_products(tenant_id: str, current_user: dict = Depends(verify_super_admin)):
    """جلب منتجات عميل معين"""
    
    products = await db.products.find({"tenant_id": tenant_id}, {"_id": 0}).to_list(500)
    return products

@api_router.delete("/super-admin/tenants/{tenant_id}/permanent")
async def permanently_delete_tenant(tenant_id: str, confirm: bool = False, current_user: dict = Depends(verify_super_admin)):
    """حذف عميل نهائياً مع جميع بياناته"""
    
    if not confirm:
        raise HTTPException(status_code=400, detail="يجب تأكيد الحذف بإرسال confirm=true")
    
    tenant = await db.tenants.find_one({"id": tenant_id})
    if not tenant:
        raise HTTPException(status_code=404, detail="العميل غير موجود")
    
    # حذف جميع البيانات المرتبطة
    await db.users.delete_many({"tenant_id": tenant_id})
    await db.branches.delete_many({"tenant_id": tenant_id})
    await db.orders.delete_many({"tenant_id": tenant_id})
    await db.products.delete_many({"tenant_id": tenant_id})
    await db.categories.delete_many({"tenant_id": tenant_id})
    await db.inventory.delete_many({"tenant_id": tenant_id})
    await db.customers.delete_many({"tenant_id": tenant_id})
    await db.shifts.delete_many({"tenant_id": tenant_id})
    await db.expenses.delete_many({"tenant_id": tenant_id})
    await db.drivers.delete_many({"tenant_id": tenant_id})
    await db.tenants.delete_one({"id": tenant_id})
    
    return {"message": f"تم حذف العميل '{tenant['name']}' وجميع بياناته نهائياً"}

@api_router.post("/super-admin/reset-sales")
async def reset_all_sales(confirm: bool = False, current_user: dict = Depends(verify_super_admin)):
    """تصفير جميع المبيعات والطلبات - للتجربة"""
    
    if not confirm:
        raise HTTPException(status_code=400, detail="يجب تأكيد التصفير بإرسال confirm=true")
    
    # حذف جميع الطلبات
    orders_result = await db.orders.delete_many({})
    
    # حذف جميع الورديات
    shifts_result = await db.shifts.delete_many({})
    
    # إعادة تعيين إحصائيات العملاء
    await db.customers.update_many({}, {"$set": {
        "total_orders": 0,
        "total_spent": 0.0,
        "last_order_date": None
    }})
    
    # إعادة تعيين إحصائيات السائقين
    await db.drivers.update_many({}, {"$set": {
        "total_deliveries": 0,
        "is_available": True,
        "current_order_id": None
    }})
    
    return {
        "message": "تم تصفير جميع المبيعات بنجاح",
        "deleted_orders": orders_result.deleted_count,
        "deleted_shifts": shifts_result.deleted_count
    }

@api_router.post("/super-admin/tenants/{tenant_id}/reset-sales")
async def reset_tenant_sales(tenant_id: str, confirm: bool = False, current_user: dict = Depends(verify_super_admin)):
    """تصفير مبيعات عميل معين - للتجربة"""
    
    if not confirm:
        raise HTTPException(status_code=400, detail="يجب تأكيد التصفير بإرسال confirm=true")
    
    # التحقق إذا كان النظام الرئيسي
    if tenant_id == "main-system":
        # حذف طلبات النظام الرئيسي (بدون tenant_id)
        orders_result = await db.orders.delete_many({
            "$or": [{"tenant_id": {"$exists": False}}, {"tenant_id": None}]
        })
        
        # حذف ورديات النظام الرئيسي
        shifts_result = await db.shifts.delete_many({
            "$or": [{"tenant_id": {"$exists": False}}, {"tenant_id": None}]
        })
        
        # إعادة تعيين إحصائيات عملاء النظام الرئيسي
        await db.customers.update_many({
            "$or": [{"tenant_id": {"$exists": False}}, {"tenant_id": None}]
        }, {"$set": {
            "total_orders": 0,
            "total_spent": 0.0,
            "last_order_date": None
        }})
        
        return {
            "message": "تم تصفير مبيعات النظام الرئيسي بنجاح",
            "deleted_orders": orders_result.deleted_count,
            "deleted_shifts": shifts_result.deleted_count
        }
    
    # للعملاء العاديين
    tenant = await db.tenants.find_one({"id": tenant_id})
    if not tenant:
        raise HTTPException(status_code=404, detail="العميل غير موجود")
    
    # حذف طلبات العميل
    orders_result = await db.orders.delete_many({"tenant_id": tenant_id})
    
    # حذف ورديات العميل
    shifts_result = await db.shifts.delete_many({"tenant_id": tenant_id})
    
    # إعادة تعيين إحصائيات عملاء هذا العميل
    await db.customers.update_many({"tenant_id": tenant_id}, {"$set": {
        "total_orders": 0,
        "total_spent": 0.0,
        "last_order_date": None
    }})
    
    return {
        "message": f"تم تصفير مبيعات '{tenant['name']}' بنجاح",
        "deleted_orders": orders_result.deleted_count,
        "deleted_shifts": shifts_result.deleted_count
    }

# ==================== CALL CENTER / CALLER ID ====================

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
    call_id: Optional[str] = None
    direction: str = "incoming"
    timestamp: Optional[str] = None

# Store active calls in memory (in production, use Redis)
active_calls = {}

@api_router.post("/callcenter/config")
async def save_callcenter_config(config: CallCenterConfig, current_user: dict = Depends(get_current_user)):
    """حفظ إعدادات الكول سنتر"""
    tenant_id = get_user_tenant_id(current_user)
    
    config_doc = {
        "tenant_id": tenant_id,
        **config.dict(),
        "updated_at": datetime.now(timezone.utc).isoformat(),
        "updated_by": current_user["id"]
    }
    
    await db.callcenter_config.update_one(
        {"tenant_id": tenant_id},
        {"$set": config_doc},
        upsert=True
    )
    
    return {"message": "تم حفظ إعدادات الكول سنتر"}

@api_router.get("/callcenter/config")
async def get_callcenter_config(current_user: dict = Depends(get_current_user)):
    """جلب إعدادات الكول سنتر"""
    tenant_id = get_user_tenant_id(current_user)
    
    config = await db.callcenter_config.find_one({"tenant_id": tenant_id}, {"_id": 0})
    
    if not config:
        return CallCenterConfig().dict()
    
    return config

@api_router.post("/callcenter/test")
async def test_callcenter_connection(config: CallCenterConfig, current_user: dict = Depends(get_current_user)):
    """اختبار اتصال الكول سنتر"""
    
    # في الإنتاج، يجب اختبار الاتصال الفعلي مع المزود
    # حالياً نرجع نجاح للمحاكاة
    
    if not config.provider:
        raise HTTPException(status_code=400, detail="يرجى اختيار مزود الخدمة")
    
    if not config.api_url and config.provider not in ["custom"]:
        raise HTTPException(status_code=400, detail="يرجى إدخال رابط API")
    
    # محاكاة اختبار الاتصال
    return {"success": True, "message": f"تم الاتصال بـ {config.provider} بنجاح"}

@api_router.post("/callcenter/webhook")
async def callcenter_webhook(request: Request):
    """Webhook لاستقبال المكالمات من نظام الكول سنتر"""
    
    try:
        body = await request.json()
    except:
        body = {}
    
    # استخراج رقم المتصل من البيانات (يختلف حسب المزود)
    phone = body.get("phone") or body.get("caller_id") or body.get("from") or body.get("callerNumber")
    caller_name = body.get("caller_name") or body.get("name") or body.get("callerName")
    call_id = body.get("call_id") or body.get("callId") or body.get("id") or str(uuid.uuid4())
    direction = body.get("direction") or body.get("type") or "incoming"
    
    if not phone:
        return {"status": "error", "message": "No phone number provided"}
    
    # تنظيف رقم الهاتف
    phone = phone.replace(" ", "").replace("-", "").replace("+", "")
    if phone.startswith("964"):
        phone = "0" + phone[3:]
    
    # البحث عن العميل
    customer = await db.customers.find_one(
        {"$or": [{"phone": phone}, {"phone2": phone}]},
        {"_id": 0}
    )
    
    # آخر طلب للعميل
    last_order = None
    if customer:
        last_order = await db.orders.find_one(
            {"customer_phone": phone},
            {"_id": 0},
            sort=[("created_at", -1)]
        )
    
    # تخزين المكالمة النشطة
    call_data = {
        "call_id": call_id,
        "phone": phone,
        "caller_name": caller_name or (customer["name"] if customer else "عميل جديد"),
        "direction": direction,
        "customer": customer,
        "last_order": last_order,
        "is_new_customer": customer is None,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "status": "ringing"
    }
    
    active_calls[call_id] = call_data
    
    # إذا كان عميل جديد وتم تفعيل الحفظ التلقائي
    # سيتم الحفظ عند إنشاء الطلب
    
    return {
        "status": "success",
        "call_id": call_id,
        "customer_found": customer is not None,
        "customer": customer,
        "last_order": last_order
    }

@api_router.post("/callcenter/simulate")
async def simulate_incoming_call(data: dict, current_user: dict = Depends(get_current_user)):
    """محاكاة مكالمة واردة للاختبار"""
    
    phone = data.get("phone", "07801234567")
    
    # تنظيف رقم الهاتف
    phone = phone.replace(" ", "").replace("-", "").replace("+", "")
    
    # البحث عن العميل
    customer = await db.customers.find_one(
        {"$or": [{"phone": phone}, {"phone2": phone}]},
        {"_id": 0}
    )
    
    # آخر طلب للعميل
    last_order = None
    if customer:
        last_order = await db.orders.find_one(
            {"customer_phone": phone},
            {"_id": 0},
            sort=[("created_at", -1)]
        )
    
    call_id = str(uuid.uuid4())
    call_data = {
        "call_id": call_id,
        "phone": phone,
        "caller_name": customer["name"] if customer else "عميل جديد",
        "direction": "incoming",
        "customer": customer,
        "last_order": last_order,
        "is_new_customer": customer is None,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "status": "ringing",
        "simulated": True
    }
    
    active_calls[call_id] = call_data
    
    return call_data

@api_router.get("/callcenter/active-calls")
async def get_active_calls(current_user: dict = Depends(get_current_user)):
    """جلب المكالمات النشطة"""
    return list(active_calls.values())

@api_router.post("/callcenter/calls/{call_id}/answer")
async def answer_call(call_id: str, current_user: dict = Depends(get_current_user)):
    """الرد على المكالمة"""
    if call_id in active_calls:
        active_calls[call_id]["status"] = "answered"
        active_calls[call_id]["answered_by"] = current_user["id"]
        active_calls[call_id]["answered_at"] = datetime.now(timezone.utc).isoformat()
        return active_calls[call_id]
    raise HTTPException(status_code=404, detail="المكالمة غير موجودة")

@api_router.post("/callcenter/calls/{call_id}/end")
async def end_call(call_id: str, current_user: dict = Depends(get_current_user)):
    """إنهاء المكالمة"""
    if call_id in active_calls:
        call_data = active_calls.pop(call_id)
        call_data["status"] = "ended"
        call_data["ended_at"] = datetime.now(timezone.utc).isoformat()
        
        # حفظ سجل المكالمة
        await db.call_logs.insert_one({
            "_id": None,  # سيتم تجاهله
            **call_data
        })
        
        return {"message": "تم إنهاء المكالمة", "call": call_data}
    raise HTTPException(status_code=404, detail="المكالمة غير موجودة")

@api_router.get("/callcenter/call-logs")
async def get_call_logs(
    limit: int = 50,
    skip: int = 0,
    current_user: dict = Depends(get_current_user)
):
    """سجل المكالمات"""
    tenant_id = get_user_tenant_id(current_user)
    
    query = {}
    if tenant_id:
        query["tenant_id"] = tenant_id
    
    logs = await db.call_logs.find(query, {"_id": 0}).sort("timestamp", -1).skip(skip).limit(limit).to_list(limit)
    total = await db.call_logs.count_documents(query)
    
    return {
        "logs": logs,
        "total": total
    }

# ==================== SEED DATA ====================

@api_router.post("/seed")
async def seed_data():
    # Check if already seeded
    existing = await db.users.find_one({"email": "admin@maestroegp.com"})
    if existing:
        return {"message": "البيانات موجودة بالفعل"}
    
    # Create admin user
    admin_doc = {
        "id": str(uuid.uuid4()),
        "username": "admin",
        "email": "admin@maestroegp.com",
        "password": hash_password("admin123"),
        "full_name": "مدير النظام",
        "role": UserRole.ADMIN,
        "branch_id": None,
        "permissions": ["all"],
        "is_active": True,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.users.insert_one(admin_doc)
    
    # Create default branch
    branch_doc = {
        "id": str(uuid.uuid4()),
        "name": "الفرع الرئيسي",
        "address": "بغداد - الكرادة",
        "phone": "+964 770 123 4567",
        "email": "main@maestroegp.com",
        "is_active": True,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.branches.insert_one(branch_doc)
    branch_id = branch_doc["id"]
    
    # Create categories
    categories = [
        {"name": "برغر", "name_en": "Burgers", "icon": "Beef", "color": "#EF4444", "sort_order": 1},
        {"name": "بيتزا", "name_en": "Pizza", "icon": "Pizza", "color": "#F59E0B", "sort_order": 2},
        {"name": "مشروبات", "name_en": "Drinks", "icon": "Coffee", "color": "#8B5CF6", "sort_order": 3},
        {"name": "حلويات", "name_en": "Desserts", "icon": "Cake", "color": "#EC4899", "sort_order": 4},
        {"name": "سلطات", "name_en": "Salads", "icon": "Salad", "color": "#10B981", "sort_order": 5},
    ]
    
    cat_ids = {}
    for cat in categories:
        cat_doc = {"id": str(uuid.uuid4()), **cat, "is_active": True}
        await db.categories.insert_one(cat_doc)
        cat_ids[cat["name_en"]] = cat_doc["id"]
    
    # Create products with costs
    products = [
        {"name": "برغر كلاسيك", "name_en": "Classic Burger", "category_id": cat_ids["Burgers"], "price": 12000, "cost": 4000, "operating_cost": 1000, "image": "https://images.pexels.com/photos/18796078/pexels-photo-18796078.jpeg"},
        {"name": "برغر دبل", "name_en": "Double Burger", "category_id": cat_ids["Burgers"], "price": 18000, "cost": 7000, "operating_cost": 1500, "image": "https://images.pexels.com/photos/5672397/pexels-photo-5672397.jpeg"},
        {"name": "بيتزا مارغريتا", "name_en": "Margherita Pizza", "category_id": cat_ids["Pizza"], "price": 15000, "cost": 5000, "operating_cost": 1200, "image": "https://images.pexels.com/photos/35532821/pexels-photo-35532821.jpeg"},
        {"name": "بيتزا خضار", "name_en": "Veggie Pizza", "category_id": cat_ids["Pizza"], "price": 14000, "cost": 4500, "operating_cost": 1100, "image": "https://images.pexels.com/photos/34956178/pexels-photo-34956178.jpeg"},
        {"name": "قهوة عربية", "name_en": "Arabic Coffee", "category_id": cat_ids["Drinks"], "price": 3000, "cost": 500, "operating_cost": 200, "image": "https://images.pexels.com/photos/29799615/pexels-photo-29799615.jpeg"},
        {"name": "لاتيه", "name_en": "Latte", "category_id": cat_ids["Drinks"], "price": 5000, "cost": 1200, "operating_cost": 300, "image": "https://images.pexels.com/photos/15800375/pexels-photo-15800375.jpeg"},
        {"name": "كيكة شوكولاتة", "name_en": "Chocolate Cake", "category_id": cat_ids["Desserts"], "price": 8000, "cost": 2500, "operating_cost": 500, "image": "https://images.pexels.com/photos/29538417/pexels-photo-29538417.jpeg"},
        {"name": "تشيز كيك", "name_en": "Cheesecake", "category_id": cat_ids["Desserts"], "price": 9000, "cost": 3000, "operating_cost": 500, "image": "https://images.pexels.com/photos/15564368/pexels-photo-15564368.jpeg"},
    ]
    
    for prod in products:
        profit = prod["price"] - prod["cost"] - prod["operating_cost"]
        prod_doc = {"id": str(uuid.uuid4()), **prod, "profit": profit, "is_available": True, "ingredients": []}
        await db.products.insert_one(prod_doc)
    
    # Create tables
    for i in range(1, 11):
        table_doc = {
            "id": str(uuid.uuid4()),
            "number": i,
            "capacity": 4 if i <= 6 else 6,
            "branch_id": branch_id,
            "section": "داخلي" if i <= 6 else "خارجي",
            "status": "available",
            "current_order_id": None
        }
        await db.tables.insert_one(table_doc)
    
    # Create cashier user
    cashier_doc = {
        "id": str(uuid.uuid4()),
        "username": "cashier1",
        "email": "cashier@maestroegp.com",
        "password": hash_password("cashier123"),
        "full_name": "أحمد الكاشير",
        "role": UserRole.CASHIER,
        "branch_id": branch_id,
        "permissions": ["pos", "orders"],
        "is_active": True,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.users.insert_one(cashier_doc)
    
    # Set default currencies
    currencies = [
        {"code": "IQD", "name": "دينار عراقي", "symbol": "د.ع", "exchange_rate": 1.0},
        {"code": "USD", "name": "دولار أمريكي", "symbol": "$", "exchange_rate": 1460.0},
    ]
    await db.settings.insert_one({"type": "currencies", "value": currencies})
    
    # Set default delivery app settings
    delivery_apps = [
        {"app_id": "toters", "name": "توترز", "name_en": "Toters", "commission_type": "percentage", "commission_rate": 15, "is_active": True, "payment_terms": "weekly"},
        {"app_id": "talabat", "name": "طلبات", "name_en": "Talabat", "commission_type": "percentage", "commission_rate": 18, "is_active": True, "payment_terms": "weekly"},
        {"app_id": "baly", "name": "بالي", "name_en": "Baly", "commission_type": "percentage", "commission_rate": 12, "is_active": True, "payment_terms": "weekly"},
        {"app_id": "alsaree3", "name": "عالسريع", "name_en": "Al-Sari3", "commission_type": "percentage", "commission_rate": 10, "is_active": True, "payment_terms": "weekly"},
        {"app_id": "talabati", "name": "طلباتي", "name_en": "Talabati", "commission_type": "percentage", "commission_rate": 14, "is_active": True, "payment_terms": "weekly"},
    ]
    for app in delivery_apps:
        await db.delivery_app_settings.insert_one(app)
    
    return {"message": "تم إنشاء البيانات الأولية بنجاح"}

# ==================== ROOT ====================

@api_router.get("/")
async def root():
    return {"message": "Maestro EGP API", "version": "2.0.0"}

# Include router and middleware
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
