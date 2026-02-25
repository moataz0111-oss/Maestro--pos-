"""
Branch Routes - مسارات إدارة الفروع
تم نقل هذا الكود من server.py
"""
from fastapi import APIRouter, HTTPException, Depends, Query
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel
from typing import Optional, List
from motor.motor_asyncio import AsyncIOMotorClient
import os
import jwt
import uuid
from datetime import datetime, timezone
from enum import Enum

router = APIRouter(tags=["Branches"])

# Database connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

JWT_SECRET = os.environ.get('JWT_SECRET', 'your-secret-key-here')
security = HTTPBearer()

# ==================== ENUMS ====================
class UserRole:
    ADMIN = "admin"
    MANAGER = "manager"
    CASHIER = "cashier"
    WAITER = "waiter"
    KITCHEN = "kitchen"
    DRIVER = "driver"
    SUPER_ADMIN = "super_admin"
    CALL_CENTER = "call_center"

# ==================== MODELS ====================
class BranchCreate(BaseModel):
    name: str
    address: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None

class BranchUpdate(BaseModel):
    name: Optional[str] = None
    address: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    is_active: Optional[bool] = None

class BranchResponse(BaseModel):
    id: str
    name: str
    address: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    tenant_id: Optional[str] = None
    is_active: Optional[bool] = True
    created_at: Optional[str] = None

# ==================== HELPERS ====================
def get_user_tenant_id(user: dict) -> str:
    """الحصول على tenant_id للمستخدم"""
    return user.get("tenant_id")

def build_tenant_query(user: dict, extra_query: dict = None) -> dict:
    """بناء query مع فلتر tenant_id"""
    query = extra_query.copy() if extra_query else {}
    tenant_id = get_user_tenant_id(user)
    if tenant_id:
        query["tenant_id"] = tenant_id
    return query

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
        
        return user
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="انتهت صلاحية الجلسة")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="توكن غير صالح")

# ==================== ROUTES ====================

@router.post("/branches", response_model=BranchResponse)
async def create_branch(branch: BranchCreate, current_user: dict = Depends(get_current_user)):
    """إنشاء فرع جديد"""
    if current_user["role"] not in [UserRole.ADMIN, UserRole.SUPER_ADMIN]:
        raise HTTPException(status_code=403, detail="غير مصرح")
    
    tenant_id = get_user_tenant_id(current_user)
    
    # التحقق من الحد الأقصى للفروع
    if tenant_id and current_user["role"] != UserRole.SUPER_ADMIN:
        tenant = await db.tenants.find_one({"id": tenant_id})
        if tenant:
            max_branches = tenant.get("max_branches", 1)
            current_branches_count = await db.branches.count_documents({
                "tenant_id": tenant_id, 
                "is_active": {"$ne": False},
                "name": {"$nin": ["الفرع الرئيسي", "Main Branch", "الفرع الثاني", "فرع المالك الرئيسي"]}
            })
            if current_branches_count >= max_branches:
                raise HTTPException(
                    status_code=403, 
                    detail=f"تم الوصول للحد الأقصى من الفروع ({max_branches}). يرجى مراجعة مسؤول النظام لرفع الحد"
                )
    
    branch_doc = {
        "id": str(uuid.uuid4()),
        **branch.model_dump(),
        "tenant_id": tenant_id,
        "is_active": True,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.branches.insert_one(branch_doc)
    del branch_doc["_id"]
    return branch_doc


@router.get("/branches", response_model=List[BranchResponse])
async def get_branches(
    current_user: dict = Depends(get_current_user), 
    include_inactive: bool = Query(False, description="تضمين الفروع المعطّلة")
):
    """جلب قائمة الفروع"""
    # Super Admin يرى الفروع الخاصة به
    if current_user.get("role") == UserRole.SUPER_ADMIN:
        owner_tenant_id = current_user.get("tenant_id") or "default"
        query = {"tenant_id": owner_tenant_id}
    else:
        query = build_tenant_query(current_user)
    
    # المستخدمون المرتبطون بفرع معين يرون فقط فرعهم
    user_branch_id = current_user.get("branch_id")
    user_role = current_user.get("role")
    
    if user_branch_id and user_role not in [UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.MANAGER]:
        query["id"] = user_branch_id
    
    # إخفاء الفروع المعطّلة إلا إذا طُلب عرضها
    if not include_inactive:
        query["is_active"] = {"$ne": False}
    
    # إخفاء الفروع الافتراضية
    default_branch_names = ["الفرع الرئيسي", "Main Branch", "الفرع الثاني", "فرع المالك الرئيسي"]
    query["name"] = {"$nin": default_branch_names}
    
    branches = await db.branches.find(query, {"_id": 0}).to_list(100)
    return branches


@router.get("/branches/{branch_id}", response_model=BranchResponse)
async def get_branch(branch_id: str, current_user: dict = Depends(get_current_user)):
    """جلب فرع محدد"""
    query = build_tenant_query(current_user, {"id": branch_id})
    branch = await db.branches.find_one(query, {"_id": 0})
    if not branch:
        raise HTTPException(status_code=404, detail="الفرع غير موجود")
    return branch


@router.put("/branches/{branch_id}", response_model=BranchResponse)
async def update_branch(branch_id: str, branch: BranchCreate, current_user: dict = Depends(get_current_user)):
    """تحديث فرع"""
    if current_user["role"] not in [UserRole.ADMIN, UserRole.SUPER_ADMIN]:
        raise HTTPException(status_code=403, detail="غير مصرح")
    
    query = build_tenant_query(current_user, {"id": branch_id})
    
    existing_branch = await db.branches.find_one(query, {"_id": 0})
    if not existing_branch:
        raise HTTPException(status_code=404, detail="الفرع غير موجود")
    
    await db.branches.update_one(query, {"$set": branch.model_dump()})
    updated = await db.branches.find_one({"id": branch_id}, {"_id": 0})
    return updated


@router.delete("/branches/{branch_id}")
async def delete_branch(branch_id: str, current_user: dict = Depends(get_current_user)):
    """حذف (تعطيل) فرع"""
    if current_user["role"] not in [UserRole.ADMIN, UserRole.SUPER_ADMIN]:
        raise HTTPException(status_code=403, detail="غير مصرح")
    
    # Check if branch has users or orders
    users_count = await db.users.count_documents({"branch_id": branch_id})
    if users_count > 0:
        raise HTTPException(status_code=400, detail="لا يمكن حذف الفرع - يوجد مستخدمين مرتبطين به")
    
    query = build_tenant_query(current_user, {"id": branch_id})
    result = await db.branches.update_one(query, {"$set": {"is_active": False}})
    
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="الفرع غير موجود")
    
    return {"message": "تم تعطيل الفرع"}
