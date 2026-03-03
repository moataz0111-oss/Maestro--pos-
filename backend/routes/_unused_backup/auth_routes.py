"""
Auth Routes - مسارات المصادقة
تم فصلها من server.py لتحسين قراءة الكود
"""
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, EmailStr
from typing import Optional, List
from motor.motor_asyncio import AsyncIOMotorClient
import os
import bcrypt
import jwt
import uuid
from datetime import datetime, timezone

router = APIRouter(tags=["Authentication"])

# Database connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

JWT_SECRET = os.environ.get('JWT_SECRET', 'your-secret-key-here')


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class UserRegister(BaseModel):
    username: str
    email: EmailStr
    password: str
    full_name: str
    role: str = "cashier"
    branch_id: Optional[str] = None


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """التحقق من كلمة المرور"""
    if not hashed_password:
        return False
    return bcrypt.checkpw(plain_password.encode('utf-8'), hashed_password.encode('utf-8'))


def hash_password(password: str) -> str:
    """تشفير كلمة المرور"""
    return bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')


def create_token(user_id: str, role: str, branch_id: str = None) -> str:
    """إنشاء توكن JWT"""
    payload = {
        "user_id": user_id,
        "role": role,
        "branch_id": branch_id,
        "exp": datetime.now(timezone.utc).timestamp() + (24 * 60 * 60 * 30)  # 30 days
    }
    return jwt.encode(payload, JWT_SECRET, algorithm="HS256")


@router.post("/auth/login")
async def login(credentials: UserLogin):
    """تسجيل الدخول"""
    user = await db.users.find_one({"email": credentials.email}, {"_id": 0})
    if not user or not verify_password(credentials.password, user.get("password_hash", user.get("password", ""))):
        raise HTTPException(status_code=401, detail="بيانات الدخول غير صحيحة")
    if not user.get("is_active", True):
        raise HTTPException(status_code=401, detail="الحساب معطل")
    
    # إزالة كلمة المرور من الاستجابة
    if "password" in user:
        del user["password"]
    if "password_hash" in user:
        del user["password_hash"]
    
    token = create_token(user["id"], user["role"], user.get("branch_id"))
    return {"user": user, "token": token}


@router.post("/auth/register")
async def register(user_data: UserRegister):
    """تسجيل مستخدم جديد"""
    # التحقق من عدم وجود مستخدم بنفس البريد
    existing = await db.users.find_one({"email": user_data.email})
    if existing:
        raise HTTPException(status_code=400, detail="البريد الإلكتروني مستخدم بالفعل")
    
    # إنشاء المستخدم
    user_doc = {
        "id": str(uuid.uuid4()),
        "username": user_data.username,
        "email": user_data.email,
        "password_hash": hash_password(user_data.password),
        "full_name": user_data.full_name,
        "role": user_data.role,
        "branch_id": user_data.branch_id,
        "is_active": True,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    
    await db.users.insert_one(user_doc)
    del user_doc["password_hash"]
    del user_doc["_id"]
    
    token = create_token(user_doc["id"], user_doc["role"], user_doc.get("branch_id"))
    return {"user": user_doc, "token": token}
