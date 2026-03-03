"""
Category Routes - مسارات إدارة التصنيفات
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

router = APIRouter(tags=["Categories"])

# Database connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

JWT_SECRET = os.environ.get('JWT_SECRET', 'your-secret-key-here')
security = HTTPBearer()


class CategoryCreate(BaseModel):
    name: str
    name_en: Optional[str] = None
    icon: Optional[str] = None
    image: Optional[str] = None
    color: Optional[str] = "#D4AF37"
    sort_order: Optional[int] = 0
    kitchen_section_id: Optional[str] = None


class CategoryUpdate(BaseModel):
    name: Optional[str] = None
    name_en: Optional[str] = None
    icon: Optional[str] = None
    image: Optional[str] = None
    color: Optional[str] = None
    sort_order: Optional[int] = None
    kitchen_section_id: Optional[str] = None
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


@router.get("/categories")
async def get_categories(current_user: dict = Depends(get_current_user)):
    """جلب قائمة التصنيفات"""
    query = {"is_active": {"$ne": False}}
    if current_user.get("tenant_id"):
        query["tenant_id"] = current_user["tenant_id"]
    
    categories = await db.categories.find(query, {"_id": 0}).sort("sort_order", 1).to_list(100)
    return categories


@router.post("/categories")
async def create_category(category: CategoryCreate, current_user: dict = Depends(get_current_user)):
    """إنشاء تصنيف جديد"""
    if current_user["role"] not in ["admin", "super_admin", "manager"]:
        raise HTTPException(status_code=403, detail="غير مصرح")
    
    category_doc = {
        "id": str(uuid.uuid4()),
        "name": category.name,
        "name_en": category.name_en,
        "icon": category.icon,
        "image": category.image,
        "color": category.color,
        "sort_order": category.sort_order,
        "kitchen_section_id": category.kitchen_section_id,
        "tenant_id": current_user.get("tenant_id"),
        "is_active": True,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    
    await db.categories.insert_one(category_doc)
    del category_doc["_id"]
    return category_doc


@router.put("/categories/{category_id}")
async def update_category(category_id: str, update: CategoryUpdate, current_user: dict = Depends(get_current_user)):
    """تحديث تصنيف"""
    if current_user["role"] not in ["admin", "super_admin", "manager"]:
        raise HTTPException(status_code=403, detail="غير مصرح")
    
    query = {"id": category_id}
    if current_user.get("tenant_id"):
        query["tenant_id"] = current_user["tenant_id"]
    
    update_data = {k: v for k, v in update.model_dump().items() if v is not None}
    
    if update_data:
        await db.categories.update_one(query, {"$set": update_data})
    
    category = await db.categories.find_one({"id": category_id}, {"_id": 0})
    return category


@router.delete("/categories/{category_id}")
async def delete_category(category_id: str, current_user: dict = Depends(get_current_user)):
    """حذف تصنيف"""
    if current_user["role"] not in ["admin", "super_admin"]:
        raise HTTPException(status_code=403, detail="غير مصرح")
    
    query = {"id": category_id}
    if current_user.get("tenant_id"):
        query["tenant_id"] = current_user["tenant_id"]
    
    await db.categories.delete_one(query)
    return {"message": "تم حذف التصنيف"}
