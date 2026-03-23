"""
Shared dependencies for all routes
ملف المشتركات لجميع نقاط النهاية
"""
from fastapi import Depends, HTTPException
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from motor.motor_asyncio import AsyncIOMotorClient
from typing import Optional, List, Dict, Any
from datetime import datetime, timezone, timedelta
import os
import jwt
import bcrypt
import uuid
import logging

# Logger
logger = logging.getLogger(__name__)

# MongoDB connection - singleton
_db = None
_client = None

def get_database():
    """Get database instance"""
    global _db, _client
    if _db is None:
        mongo_url = os.environ['MONGO_URL']
        _client = AsyncIOMotorClient(mongo_url)
        _db = _client[os.environ['DB_NAME']]
    return _db

def get_client():
    """Get MongoDB client"""
    global _client
    if _client is None:
        get_database()
    return _client

# JWT Configuration
JWT_SECRET = os.environ.get('JWT_SECRET')
JWT_ALGORITHM = 'HS256'
JWT_EXPIRATION_HOURS = 24

security = HTTPBearer()

# ==================== USER ROLES ====================
class UserRole:
    SUPER_ADMIN = "super_admin"
    ADMIN = "admin"
    MANAGER = "manager"
    SUPERVISOR = "supervisor"
    CASHIER = "cashier"
    DELIVERY = "delivery"
    CALL_CENTER = "call_center"
    KITCHEN = "kitchen"
    WAITER = "waiter"

# ==================== ORDER STATUS ====================
class OrderStatus:
    PENDING = "pending"
    PREPARING = "preparing"
    READY = "ready"
    DELIVERED = "delivered"
    COMPLETED = "completed"
    CANCELLED = "cancelled"
    ON_THE_WAY = "on_the_way"

# ==================== PAYMENT METHOD ====================
class PaymentMethod:
    CASH = "cash"
    CARD = "card"
    WALLET = "wallet"
    ONLINE = "online"
    MIXED = "mixed"

# ==================== ORDER TYPE ====================
class OrderType:
    DINE_IN = "dine_in"
    TAKEAWAY = "takeaway"
    DELIVERY = "delivery"
    CALL_CENTER = "call_center"

# ==================== AUTH HELPERS ====================
def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')

def verify_password(password: str, hashed: str) -> bool:
    return bcrypt.checkpw(password.encode('utf-8'), hashed.encode('utf-8'))

def create_token(user_id: str, role: str, branch_id: Optional[str] = None, tenant_id: Optional[str] = None) -> str:
    payload = {
        "user_id": user_id,
        "role": role,
        "branch_id": branch_id,
        "tenant_id": tenant_id,
        "exp": datetime.now(timezone.utc) + timedelta(hours=JWT_EXPIRATION_HOURS)
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)

async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    db = get_database()
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

async def verify_super_admin(credentials: HTTPAuthorizationCredentials = Depends(security)):
    """التحقق من أن المستخدم هو Super Admin"""
    user = await get_current_user(credentials)
    if user.get("role") != UserRole.SUPER_ADMIN:
        raise HTTPException(status_code=403, detail="هذه الوظيفة متاحة فقط لمالك النظام")
    return user

# ==================== TENANT HELPERS ====================
def get_user_tenant_id(user: dict) -> Optional[str]:
    """الحصول على tenant_id للمستخدم - Super Admin يستخدم tenant النظام"""
    if user.get("role") == UserRole.SUPER_ADMIN:
        return user.get("tenant_id") or "system"
    return user.get("tenant_id") or "default"

def build_tenant_query(user: dict, base_query: dict = None) -> dict:
    """بناء query مع فلترة tenant_id"""
    query = base_query.copy() if base_query else {}
    
    # Super Admin يرى كل شيء
    if user.get("role") == UserRole.SUPER_ADMIN:
        return query
    
    tenant_id = get_user_tenant_id(user)
    if tenant_id:
        query["tenant_id"] = tenant_id
    
    return query

def build_branch_query(user: dict, base_query: dict = None) -> dict:
    """بناء query مع فلترة الفرع للمستخدمين المقيدين بفرع معين"""
    query = build_tenant_query(user, base_query)
    
    user_branch_id = user.get("branch_id")
    user_role = user.get("role")
    
    # المستخدمون العاديون (cashier, supervisor, delivery) يرون فقط فرعهم
    if user_branch_id and user_role not in [UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.MANAGER]:
        query["branch_id"] = user_branch_id
    
    return query

def user_can_access_branch(user: dict, branch_id: str) -> bool:
    """التحقق من صلاحية المستخدم للوصول لفرع معين"""
    if user.get("role") in [UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.MANAGER]:
        return True
    return user.get("branch_id") == branch_id

def has_role(user: dict, roles: list) -> bool:
    """التحقق من صلاحية المستخدم"""
    user_role = user.get("role", "")
    return user_role in roles or "super_admin" in roles and user_role == "super_admin"

def generate_id() -> str:
    """توليد معرف فريد"""
    return str(uuid.uuid4())

def get_current_timestamp() -> str:
    """الحصول على الوقت الحالي بصيغة ISO"""
    return datetime.now(timezone.utc).isoformat()
