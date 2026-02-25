"""
User Routes - مسارات إدارة المستخدمين
تم فصلها من server.py لتحسين قراءة الكود
"""
from fastapi import APIRouter, HTTPException, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel, EmailStr
from typing import Optional, List
from motor.motor_asyncio import AsyncIOMotorClient
import os
import jwt
import uuid
import bcrypt
from datetime import datetime, timezone

router = APIRouter(tags=["Users"])

# Database connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

JWT_SECRET = os.environ.get('JWT_SECRET', 'your-secret-key-here')
security = HTTPBearer()


class UserUpdate(BaseModel):
    username: Optional[str] = None
    email: Optional[EmailStr] = None
    full_name: Optional[str] = None
    role: Optional[str] = None
    branch_id: Optional[str] = None
    permissions: Optional[List[str]] = None
    is_active: Optional[bool] = None


class UserCreate(BaseModel):
    username: str
    email: EmailStr
    password: str
    full_name: str
    role: str = "cashier"
    branch_id: Optional[str] = None
    permissions: Optional[List[str]] = []


async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    """الحصول على المستخدم الحالي من التوكن"""
    try:
        token = credentials.credentials
        payload = jwt.decode(token, JWT_SECRET, algorithms=["HS256"])
        user_id = payload.get("user_id")
        if not user_id:
            raise HTTPException(status_code=401, detail="توكن غير صالح")
        
        user = await db.users.find_one({"id": user_id}, {"_id": 0, "password": 0, "password_hash": 0})
        if not user:
            raise HTTPException(status_code=401, detail="المستخدم غير موجود")
        
        # جلب بيانات العميل (tenant)
        if user.get("tenant_id"):
            tenant = await db.tenants.find_one({"id": user["tenant_id"]}, {"_id": 0})
            if tenant:
                user["tenant"] = tenant
        
        return user
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="انتهت صلاحية الجلسة")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="توكن غير صالح")


def hash_password(password: str) -> str:
    """تشفير كلمة المرور"""
    return bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')


@router.get("/users")
async def get_users(current_user: dict = Depends(get_current_user)):
    """جلب قائمة المستخدمين"""
    if current_user["role"] not in ["admin", "manager", "super_admin"]:
        raise HTTPException(status_code=403, detail="غير مصرح")
    
    query = {}
    if current_user.get("tenant_id"):
        query["tenant_id"] = current_user["tenant_id"]
    
    users = await db.users.find(query, {"_id": 0, "password": 0, "password_hash": 0}).to_list(1000)
    return users


@router.post("/users")
async def create_user(user_data: UserCreate, current_user: dict = Depends(get_current_user)):
    """إنشاء مستخدم جديد"""
    if current_user["role"] not in ["admin", "super_admin"]:
        raise HTTPException(status_code=403, detail="غير مصرح")
    
    # التحقق من عدم وجود مستخدم بنفس البريد
    existing = await db.users.find_one({"email": user_data.email})
    if existing:
        raise HTTPException(status_code=400, detail="البريد الإلكتروني مستخدم بالفعل")
    
    user_doc = {
        "id": str(uuid.uuid4()),
        "username": user_data.username,
        "email": user_data.email,
        "password_hash": hash_password(user_data.password),
        "full_name": user_data.full_name,
        "role": user_data.role,
        "branch_id": user_data.branch_id,
        "permissions": user_data.permissions or [],
        "tenant_id": current_user.get("tenant_id"),
        "is_active": True,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    
    await db.users.insert_one(user_doc)
    del user_doc["password_hash"]
    if "_id" in user_doc:
        del user_doc["_id"]
    
    return user_doc


@router.put("/users/{user_id}")
async def update_user(user_id: str, update: UserUpdate, current_user: dict = Depends(get_current_user)):
    """تحديث بيانات مستخدم"""
    if current_user["role"] not in ["admin", "manager", "super_admin"]:
        raise HTTPException(status_code=403, detail="غير مصرح")
    
    query = {"id": user_id}
    if current_user.get("tenant_id"):
        query["tenant_id"] = current_user["tenant_id"]
    
    user = await db.users.find_one(query)
    if not user:
        raise HTTPException(status_code=404, detail="المستخدم غير موجود")
    
    update_data = {k: v for k, v in update.model_dump().items() if v is not None}
    
    if update_data:
        await db.users.update_one({"id": user_id}, {"$set": update_data})
    
    user = await db.users.find_one({"id": user_id}, {"_id": 0, "password": 0, "password_hash": 0})
    return user


@router.delete("/users/{user_id}")
async def delete_user(user_id: str, current_user: dict = Depends(get_current_user)):
    """حذف مستخدم"""
    if current_user["role"] not in ["admin", "super_admin"]:
        raise HTTPException(status_code=403, detail="غير مصرح")
    
    # لا يمكن حذف المستخدم نفسه
    if user_id == current_user.get("id"):
        raise HTTPException(status_code=400, detail="لا يمكن حذف حسابك")
    
    query = {"id": user_id}
    if current_user.get("tenant_id"):
        query["tenant_id"] = current_user["tenant_id"]
    
    result = await db.users.delete_one(query)
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="المستخدم غير موجود")
    
    return {"message": "تم حذف المستخدم بنجاح"}


@router.put("/users/{user_id}/reset-password")
async def reset_password(user_id: str, data: dict, current_user: dict = Depends(get_current_user)):
    """إعادة تعيين كلمة المرور"""
    if current_user["role"] not in ["admin", "super_admin"]:
        raise HTTPException(status_code=403, detail="غير مصرح")
    
    new_password = data.get("new_password")
    if not new_password or len(new_password) < 4:
        raise HTTPException(status_code=400, detail="كلمة المرور يجب أن تكون 4 أحرف على الأقل")
    
    query = {"id": user_id}
    if current_user.get("tenant_id"):
        query["tenant_id"] = current_user["tenant_id"]
    
    result = await db.users.update_one(
        query,
        {"$set": {"password_hash": hash_password(new_password)}}
    )
    
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="المستخدم غير موجود")
    
    return {"message": "تم تغيير كلمة المرور بنجاح"}
