"""
Branch Routes - مسارات إدارة الفروع
"""
from fastapi import APIRouter, HTTPException, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel
from typing import Optional, List
from motor.motor_asyncio import AsyncIOMotorClient
import os
import jwt
import uuid
from datetime import datetime, timezone

router = APIRouter(tags=["Branches"])

# Database connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

JWT_SECRET = os.environ.get('JWT_SECRET', 'your-secret-key-here')
security = HTTPBearer()


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


@router.get("/branches")
async def get_branches(current_user: dict = Depends(get_current_user)):
    """جلب قائمة الفروع"""
    query = {"is_active": {"$ne": False}}
    if current_user.get("tenant_id"):
        query["tenant_id"] = current_user["tenant_id"]
    
    branches = await db.branches.find(query, {"_id": 0}).to_list(100)
    return branches


@router.post("/branches")
async def create_branch(branch: BranchCreate, current_user: dict = Depends(get_current_user)):
    """إنشاء فرع جديد"""
    if current_user["role"] not in ["admin", "super_admin"]:
        raise HTTPException(status_code=403, detail="غير مصرح")
    
    tenant_id = current_user.get("tenant_id")
    
    # التحقق من حد الفروع
    if tenant_id:
        tenant = await db.tenants.find_one({"id": tenant_id}, {"_id": 0})
        if tenant:
            max_branches = tenant.get("max_branches", 5)
            current_count = await db.branches.count_documents({"tenant_id": tenant_id, "is_active": {"$ne": False}})
            if current_count >= max_branches:
                raise HTTPException(status_code=400, detail=f"تم الوصول للحد الأقصى من الفروع ({max_branches})")
    
    branch_doc = {
        "id": str(uuid.uuid4()),
        "name": branch.name,
        "address": branch.address,
        "phone": branch.phone,
        "email": branch.email,
        "tenant_id": tenant_id,
        "is_active": True,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    
    await db.branches.insert_one(branch_doc)
    del branch_doc["_id"]
    return branch_doc


@router.get("/branches/{branch_id}")
async def get_branch(branch_id: str, current_user: dict = Depends(get_current_user)):
    """جلب فرع محدد"""
    query = {"id": branch_id}
    if current_user.get("tenant_id"):
        query["tenant_id"] = current_user["tenant_id"]
    
    branch = await db.branches.find_one(query, {"_id": 0})
    if not branch:
        raise HTTPException(status_code=404, detail="الفرع غير موجود")
    return branch


@router.put("/branches/{branch_id}")
async def update_branch(branch_id: str, update: BranchUpdate, current_user: dict = Depends(get_current_user)):
    """تحديث فرع"""
    if current_user["role"] not in ["admin", "super_admin", "manager"]:
        raise HTTPException(status_code=403, detail="غير مصرح")
    
    query = {"id": branch_id}
    if current_user.get("tenant_id"):
        query["tenant_id"] = current_user["tenant_id"]
    
    update_data = {k: v for k, v in update.model_dump().items() if v is not None}
    
    if update_data:
        await db.branches.update_one(query, {"$set": update_data})
    
    branch = await db.branches.find_one({"id": branch_id}, {"_id": 0})
    return branch


@router.delete("/branches/{branch_id}")
async def delete_branch(branch_id: str, current_user: dict = Depends(get_current_user)):
    """حذف (تعطيل) فرع"""
    if current_user["role"] not in ["admin", "super_admin"]:
        raise HTTPException(status_code=403, detail="غير مصرح")
    
    # التحقق من عدم وجود مستخدمين مرتبطين
    users_count = await db.users.count_documents({"branch_id": branch_id})
    if users_count > 0:
        raise HTTPException(status_code=400, detail="لا يمكن حذف الفرع - يوجد مستخدمين مرتبطين به")
    
    query = {"id": branch_id}
    if current_user.get("tenant_id"):
        query["tenant_id"] = current_user["tenant_id"]
    
    await db.branches.update_one(query, {"$set": {"is_active": False}})
    return {"message": "تم تعطيل الفرع"}
