"""
Authentication Routes - نقاط نهاية المصادقة
"""
from fastapi import APIRouter, HTTPException, Depends
from typing import List
from datetime import datetime, timezone
import uuid

from core.database import db
from models.schemas import UserCreate, UserLogin, UserUpdate, UserResponse
from utils.auth import (
    get_current_user, hash_password, verify_password, 
    create_token, build_tenant_query, get_user_tenant_id
)
from models.enums import UserRole

router = APIRouter(prefix="/auth", tags=["Authentication"])


@router.post("/register")
async def register(user: UserCreate):
    """تسجيل مستخدم جديد"""
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


@router.post("/login")
async def login(credentials: UserLogin):
    """تسجيل الدخول"""
    user = await db.users.find_one({"email": credentials.email}, {"_id": 0})
    if not user or not verify_password(credentials.password, user["password"]):
        raise HTTPException(status_code=401, detail="بيانات الدخول غير صحيحة")
    if not user.get("is_active", True):
        raise HTTPException(status_code=401, detail="الحساب معطل")
    
    del user["password"]
    token = create_token(user["id"], user["role"], user.get("branch_id"))
    return {"user": user, "token": token}


@router.get("/me")
async def get_me(current_user: dict = Depends(get_current_user)):
    """الحصول على بيانات المستخدم الحالي"""
    user = dict(current_user)
    if "password" in user:
        del user["password"]
    return user
