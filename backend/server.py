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

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# ==================== MODELS ====================

class UserRole:
    ADMIN = "admin"
    MANAGER = "manager"
    SUPERVISOR = "supervisor"
    CASHIER = "cashier"

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

# User Models
class UserCreate(BaseModel):
    username: str
    email: EmailStr
    password: str
    full_name: str
    role: str = UserRole.CASHIER
    branch_id: Optional[str] = None
    permissions: List[str] = []

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
    color: Optional[str] = None
    sort_order: int = 0

class CategoryResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    name: str
    name_en: Optional[str] = None
    icon: Optional[str] = None
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
    items: List[OrderItemCreate]
    branch_id: str
    payment_method: str = PaymentMethod.CASH
    discount: float = 0.0
    notes: Optional[str] = None
    delivery_app: Optional[str] = None
    driver_id: Optional[str] = None

class OrderResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    order_number: int
    order_type: str
    table_id: Optional[str] = None
    customer_name: Optional[str] = None
    customer_phone: Optional[str] = None
    delivery_address: Optional[str] = None
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
    total_expenses: float = 0.0
    net_profit: float = 0.0
    started_at: str
    ended_at: Optional[str] = None
    status: str

# Delivery Driver Models
class DriverCreate(BaseModel):
    name: str
    phone: str
    branch_id: str

class DriverResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    name: str
    phone: str
    branch_id: str
    is_available: bool = True
    current_order_id: Optional[str] = None
    total_deliveries: int = 0

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

# ==================== BRANCH ROUTES ====================

@api_router.post("/branches", response_model=BranchResponse)
async def create_branch(branch: BranchCreate, current_user: dict = Depends(get_current_user)):
    if current_user["role"] != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="غير مصرح")
    
    branch_doc = {
        "id": str(uuid.uuid4()),
        **branch.model_dump(),
        "is_active": True,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.branches.insert_one(branch_doc)
    del branch_doc["_id"]
    return branch_doc

@api_router.get("/branches", response_model=List[BranchResponse])
async def get_branches():
    branches = await db.branches.find({}, {"_id": 0}).to_list(100)
    return branches

@api_router.get("/branches/{branch_id}", response_model=BranchResponse)
async def get_branch(branch_id: str):
    branch = await db.branches.find_one({"id": branch_id}, {"_id": 0})
    if not branch:
        raise HTTPException(status_code=404, detail="الفرع غير موجود")
    return branch

@api_router.put("/branches/{branch_id}")
async def update_branch(branch_id: str, branch: BranchCreate, current_user: dict = Depends(get_current_user)):
    if current_user["role"] != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="غير مصرح")
    await db.branches.update_one({"id": branch_id}, {"$set": branch.model_dump()})
    return await db.branches.find_one({"id": branch_id}, {"_id": 0})

@api_router.delete("/branches/{branch_id}")
async def delete_branch(branch_id: str, current_user: dict = Depends(get_current_user)):
    if current_user["role"] != UserRole.ADMIN:
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
    if current_user["role"] not in [UserRole.ADMIN, UserRole.MANAGER]:
        raise HTTPException(status_code=403, detail="غير مصرح")
    
    cat_doc = {
        "id": str(uuid.uuid4()),
        **category.model_dump(),
        "is_active": True
    }
    await db.categories.insert_one(cat_doc)
    del cat_doc["_id"]
    return cat_doc

@api_router.get("/categories", response_model=List[CategoryResponse])
async def get_categories():
    categories = await db.categories.find({}, {"_id": 0}).sort("sort_order", 1).to_list(100)
    return categories

@api_router.put("/categories/{category_id}")
async def update_category(category_id: str, category: CategoryCreate, current_user: dict = Depends(get_current_user)):
    if current_user["role"] not in [UserRole.ADMIN, UserRole.MANAGER]:
        raise HTTPException(status_code=403, detail="غير مصرح")
    await db.categories.update_one({"id": category_id}, {"$set": category.model_dump()})
    return await db.categories.find_one({"id": category_id}, {"_id": 0})

@api_router.delete("/categories/{category_id}")
async def delete_category(category_id: str, current_user: dict = Depends(get_current_user)):
    if current_user["role"] not in [UserRole.ADMIN, UserRole.MANAGER]:
        raise HTTPException(status_code=403, detail="غير مصرح")
    await db.categories.delete_one({"id": category_id})
    return {"message": "تم الحذف"}

# ==================== PRODUCT ROUTES ====================

@api_router.post("/products", response_model=ProductResponse)
async def create_product(product: ProductCreate, current_user: dict = Depends(get_current_user)):
    if current_user["role"] not in [UserRole.ADMIN, UserRole.MANAGER]:
        raise HTTPException(status_code=403, detail="غير مصرح")
    
    # Calculate profit
    profit = product.price - product.cost - product.operating_cost
    
    prod_doc = {
        "id": str(uuid.uuid4()),
        **product.model_dump(),
        "profit": profit
    }
    await db.products.insert_one(prod_doc)
    del prod_doc["_id"]
    return prod_doc

@api_router.get("/products", response_model=List[ProductResponse])
async def get_products(category_id: Optional[str] = None):
    query = {"category_id": category_id} if category_id else {}
    products = await db.products.find(query, {"_id": 0}).to_list(1000)
    # Calculate profit for each product
    for p in products:
        p["profit"] = p.get("price", 0) - p.get("cost", 0) - p.get("operating_cost", 0)
    return products

@api_router.get("/products/{product_id}")
async def get_product(product_id: str):
    product = await db.products.find_one({"id": product_id}, {"_id": 0})
    if not product:
        raise HTTPException(status_code=404, detail="المنتج غير موجود")
    product["profit"] = product.get("price", 0) - product.get("cost", 0) - product.get("operating_cost", 0)
    return product

@api_router.put("/products/{product_id}")
async def update_product(product_id: str, product: ProductCreate, current_user: dict = Depends(get_current_user)):
    if current_user["role"] not in [UserRole.ADMIN, UserRole.MANAGER]:
        raise HTTPException(status_code=403, detail="غير مصرح")
    
    profit = product.price - product.cost - product.operating_cost
    update_data = {**product.model_dump(), "profit": profit}
    
    await db.products.update_one({"id": product_id}, {"$set": update_data})
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
async def get_inventory(branch_id: Optional[str] = None, item_type: Optional[str] = None):
    query = {}
    if branch_id:
        query["branch_id"] = branch_id
    if item_type:
        query["item_type"] = item_type
    items = await db.inventory.find(query, {"_id": 0}).to_list(1000)
    return items

@api_router.post("/inventory/transaction")
async def inventory_transaction(transaction: InventoryTransaction, current_user: dict = Depends(get_current_user)):
    item = await db.inventory.find_one({"id": transaction.inventory_id})
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
    if current_user["role"] not in [UserRole.ADMIN, UserRole.MANAGER, UserRole.SUPERVISOR]:
        raise HTTPException(status_code=403, detail="غير مصرح")
    
    expense_doc = {
        "id": str(uuid.uuid4()),
        **expense.model_dump(),
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
    query = {}
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
        order_status = OrderStatus.PENDING
    elif order.payment_method == PaymentMethod.CREDIT:
        payment_status = "credit"
        order_status = OrderStatus.PREPARING
    else:
        payment_status = "paid"
        order_status = OrderStatus.PREPARING
    
    order_doc = {
        "id": str(uuid.uuid4()),
        "order_number": order_number,
        "order_type": order.order_type,
        "table_id": order.table_id,
        "customer_name": order.customer_name,
        "customer_phone": order.customer_phone,
        "delivery_address": order.delivery_address,
        "items": items_with_cost,
        "subtotal": subtotal,
        "discount": order.discount,
        "tax": tax,
        "total": total,
        "total_cost": total_cost,
        "profit": profit,
        "branch_id": order.branch_id,
        "cashier_id": current_user["id"],
        "status": order_status,
        "payment_method": order.payment_method,
        "payment_status": payment_status,
        "delivery_app": order.delivery_app,
        "delivery_commission": delivery_commission,
        "driver_id": order.driver_id,
        "notes": order.notes,
        "credit_transferred": False,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "updated_at": datetime.now(timezone.utc).isoformat()
    }
    
    await db.orders.insert_one(order_doc)
    del order_doc["_id"]
    
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
    current_user: dict = Depends(get_current_user)
):
    query = {}
    if branch_id:
        query["branch_id"] = branch_id
    if status:
        query["status"] = status
    if date:
        query["created_at"] = {"$regex": f"^{date}"}
    
    orders = await db.orders.find(query, {"_id": 0}).sort("created_at", -1).to_list(500)
    return orders

@api_router.get("/orders/{order_id}", response_model=OrderResponse)
async def get_order(order_id: str):
    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="الطلب غير موجود")
    return order

@api_router.put("/orders/{order_id}/status")
async def update_order_status(order_id: str, status: str, current_user: dict = Depends(get_current_user)):
    order = await db.orders.find_one({"id": order_id})
    if not order:
        raise HTTPException(status_code=404, detail="الطلب غير موجود")
    
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

# ==================== DRIVER ROUTES ====================

@api_router.post("/drivers", response_model=DriverResponse)
async def create_driver(driver: DriverCreate, current_user: dict = Depends(get_current_user)):
    if current_user["role"] not in [UserRole.ADMIN, UserRole.MANAGER]:
        raise HTTPException(status_code=403, detail="غير مصرح")
    
    driver_doc = {
        "id": str(uuid.uuid4()),
        **driver.model_dump(),
        "is_available": True,
        "current_order_id": None,
        "total_deliveries": 0
    }
    await db.drivers.insert_one(driver_doc)
    del driver_doc["_id"]
    return driver_doc

@api_router.get("/drivers", response_model=List[DriverResponse])
async def get_drivers(branch_id: Optional[str] = None):
    query = {"branch_id": branch_id} if branch_id else {}
    drivers = await db.drivers.find(query, {"_id": 0}).to_list(100)
    return drivers

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
async def complete_delivery(driver_id: str, current_user: dict = Depends(get_current_user)):
    driver = await db.drivers.find_one({"id": driver_id})
    if driver and driver.get("current_order_id"):
        await db.orders.update_one(
            {"id": driver["current_order_id"]},
            {"$set": {"status": OrderStatus.DELIVERED}}
        )
    
    await db.drivers.update_one(
        {"id": driver_id},
        {"$set": {"is_available": True, "current_order_id": None}, "$inc": {"total_deliveries": 1}}
    )
    return {"message": "تم التوصيل"}

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
    query = {"status": {"$ne": OrderStatus.CANCELLED}}
    if branch_id:
        query["branch_id"] = branch_id
    if start_date:
        query["created_at"] = {"$gte": start_date}
    if end_date:
        query.setdefault("created_at", {})["$lte"] = end_date + "T23:59:59"
    
    orders = await db.orders.find(query, {"_id": 0}).to_list(10000)
    
    total_sales = sum(o["total"] for o in orders)
    total_cost = sum(o.get("total_cost", 0) for o in orders)
    total_profit = sum(o.get("profit", 0) for o in orders)
    total_orders = len(orders)
    avg_order_value = total_sales / total_orders if total_orders > 0 else 0
    
    by_payment = {}
    by_type = {}
    by_app = {}
    by_date = {}
    by_product = {}
    
    for o in orders:
        # By payment method
        pm = o["payment_method"]
        by_payment[pm] = by_payment.get(pm, 0) + o["total"]
        
        # By order type
        ot = o["order_type"]
        by_type[ot] = by_type.get(ot, 0) + o["total"]
        
        # By delivery app
        if o.get("delivery_app"):
            app = o["delivery_app"]
            by_app[app] = by_app.get(app, 0) + o["total"]
        
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
    
    return {
        "total_sales": total_sales,
        "total_cost": total_cost,
        "total_profit": total_profit,
        "profit_margin": (total_profit / total_sales * 100) if total_sales > 0 else 0,
        "total_orders": total_orders,
        "average_order_value": avg_order_value,
        "by_payment_method": by_payment,
        "by_order_type": by_type,
        "by_delivery_app": by_app,
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
    query = {"payment_method": PaymentMethod.CREDIT, "delivery_app": {"$ne": None}}
    if delivery_app:
        query["delivery_app"] = delivery_app
    if start_date:
        query["created_at"] = {"$gte": start_date}
    if end_date:
        query.setdefault("created_at", {})["$lte"] = end_date + "T23:59:59"
    
    orders = await db.orders.find(query, {"_id": 0}).to_list(10000)
    
    by_app = {}
    for o in orders:
        app = o.get("delivery_app", "مباشر")
        if app not in by_app:
            by_app[app] = {
                "count": 0, 
                "total": 0, 
                "commission": 0,
                "net_amount": 0,
                "orders": []
            }
        by_app[app]["count"] += 1
        by_app[app]["total"] += o["total"]
        by_app[app]["commission"] += o.get("delivery_commission", 0)
        by_app[app]["net_amount"] += o["total"] - o.get("delivery_commission", 0)
        by_app[app]["orders"].append({
            "order_number": o["order_number"],
            "total": o["total"],
            "commission": o.get("delivery_commission", 0),
            "created_at": o["created_at"]
        })
    
    return {
        "total_credit": sum(o["total"] for o in orders),
        "total_commission": sum(o.get("delivery_commission", 0) for o in orders),
        "net_receivable": sum(o["total"] - o.get("delivery_commission", 0) for o in orders),
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
