"""
Auth Routes - نقاط نهاية المصادقة
"""
from fastapi import APIRouter, HTTPException, Depends
from typing import List
from datetime import datetime, timezone
import uuid

from .shared import (
    get_database, get_current_user, verify_super_admin,
    hash_password, verify_password, create_token,
    build_tenant_query, UserRole, logger
)
from ..models import (
    UserCreate, UserLogin, UserResponse, UserUpdate, PasswordReset
)

router = APIRouter(prefix="/auth", tags=["Auth"])

db = get_database()

@router.post("/register")
async def register(user: UserCreate):
    """تسجيل مستخدم جديد"""
    db = get_database()
    existing = await db.users.find_one({"$or": [{"email": user.email}, {"username": user.username}]})
    if existing:
        raise HTTPException(status_code=400, detail="المستخدم موجود بالفعل")
    
    user_doc = {
        "id": str(uuid.uuid4()),
        "username": user.username,
        "email": user.email,
        "password": hash_password(user.password),
        "full_name": user.full_name,
        "full_name_en": user.full_name_en,
        "role": user.role,
        "branch_id": user.branch_id,
        "permissions": user.permissions,
        "is_active": True,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.users.insert_one(user_doc)
    del user_doc["password"]
    if "_id" in user_doc:
        del user_doc["_id"]
    token = create_token(user_doc["id"], user_doc["role"], user_doc.get("branch_id"))
    return {"user": user_doc, "token": token}


@router.post("/login")
async def login(credentials: UserLogin):
    """تسجيل الدخول"""
    db = get_database()
    user = await db.users.find_one({"email": credentials.email}, {"_id": 0})
    
    if not user:
        raise HTTPException(status_code=401, detail="بيانات الدخول غير صحيحة")
    
    stored_hash = user.get("password_hash", user.get("password", ""))
    
    if not verify_password(credentials.password, stored_hash):
        raise HTTPException(status_code=401, detail="بيانات الدخول غير صحيحة")
    
    if not user.get("is_active", True):
        raise HTTPException(status_code=401, detail="الحساب معطل")
    
    # فحص ترخيص العميل (Tenant)
    tenant_id = user.get("tenant_id")
    if tenant_id and user.get("role") != UserRole.SUPER_ADMIN:
        tenant = await db.tenants.find_one({"id": tenant_id}, {"_id": 0})
        
        if tenant:
            if not tenant.get("is_active", True):
                raise HTTPException(
                    status_code=403, 
                    detail="حساب المطعم معطل - يرجى التواصل مع الدعم الفني"
                )
            
            expires_at = tenant.get("expires_at")
            if expires_at:
                try:
                    expiry_date = datetime.fromisoformat(expires_at.replace('Z', '+00:00'))
                    if datetime.now(timezone.utc) > expiry_date:
                        raise HTTPException(
                            status_code=403, 
                            detail="انتهى اشتراك المطعم - يرجى التجديد للاستمرار"
                        )
                except ValueError:
                    pass
    
    # إزالة كلمة المرور من الاستجابة
    if "password" in user:
        del user["password"]
    if "password_hash" in user:
        del user["password_hash"]
    
    token = create_token(user["id"], user["role"], user.get("branch_id"))
    return {"user": user, "token": token}


@router.get("/me")
async def get_me(current_user: dict = Depends(get_current_user)):
    """الحصول على بيانات المستخدم الحالي"""
    user = dict(current_user)
    if "password" in user:
        del user["password"]
    return user


@router.post("/impersonate/{user_id}")
async def impersonate_user(user_id: str, current_user: dict = Depends(get_current_user)):
    """
    تسجيل الدخول كمستخدم آخر (للمدراء فقط)
    يُستخدم لمعاينة التطبيق من منظور المستخدم
    """
    db = get_database()
    
    if current_user["role"] not in [UserRole.ADMIN, UserRole.SUPER_ADMIN]:
        raise HTTPException(status_code=403, detail="غير مصرح - هذه الميزة للمدراء فقط")
    
    query = build_tenant_query(current_user, {"id": user_id})
    target_user = await db.users.find_one(query, {"_id": 0})
    
    if not target_user:
        raise HTTPException(status_code=404, detail="المستخدم غير موجود")
    
    if target_user.get("role") in ["admin", "super_admin"]:
        raise HTTPException(status_code=403, detail="لا يمكن معاينة حساب مدير عام")
    
    if "password" in target_user:
        del target_user["password"]
    if "password_hash" in target_user:
        del target_user["password_hash"]
    
    target_user["impersonated"] = True
    target_user["impersonated_by"] = current_user.get("id")
    target_user["original_user_name"] = current_user.get("full_name") or current_user.get("username")
    
    # تسجيل حدث الانتحال
    admin_name = current_user.get("full_name") or current_user.get("name") or current_user.get("username") or current_user.get("email")
    target_name = target_user.get("full_name") or target_user.get("name") or target_user.get("username") or target_user.get("email")
    
    audit_log = {
        "id": str(uuid.uuid4()),
        "event_type": "impersonation",
        "admin_id": current_user.get("id"),
        "admin_name": admin_name,
        "admin_email": current_user.get("email"),
        "admin_role": current_user.get("role"),
        "target_user_id": target_user.get("id"),
        "target_user_name": target_name,
        "target_user_email": target_user.get("email"),
        "target_user_role": target_user.get("role"),
        "tenant_id": current_user.get("tenant_id"),
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.impersonation_logs.insert_one(audit_log)
    
    token = create_token(target_user["id"], target_user["role"], target_user.get("branch_id"))
    
    return {
        "user": target_user,
        "token": token,
        "message": f"تم تسجيل الدخول كـ {target_user.get('full_name') or target_user.get('username')}"
    }


@router.get("/impersonation-logs")
async def get_impersonation_logs(
    current_user: dict = Depends(get_current_user),
    limit: int = 20,
    page: int = 1,
    skip: int = None
):
    """جلب سجلات انتحال الشخصية (للمدراء فقط)"""
    db = get_database()
    
    if current_user["role"] not in [UserRole.ADMIN, UserRole.SUPER_ADMIN]:
        raise HTTPException(status_code=403, detail="غير مصرح")
    
    query = build_tenant_query(current_user)
    actual_skip = skip if skip is not None else (page - 1) * limit
    
    logs = await db.impersonation_logs.find(
        query, 
        {"_id": 0}
    ).sort("created_at", -1).skip(actual_skip).limit(limit).to_list(limit)
    
    total = await db.impersonation_logs.count_documents(query)
    total_pages = (total + limit - 1) // limit
    
    return {
        "logs": logs,
        "total": total,
        "total_pages": total_pages,
        "page": page,
        "limit": limit,
        "skip": actual_skip
    }
