"""
Product Routes - مسارات إدارة المنتجات
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

router = APIRouter(tags=["Products"])

# Database connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

JWT_SECRET = os.environ.get('JWT_SECRET', 'your-secret-key-here')
security = HTTPBearer()


class ProductCreate(BaseModel):
    name: str
    name_en: Optional[str] = None
    category_id: str
    price: float
    cost: Optional[float] = 0
    description: Optional[str] = None
    description_en: Optional[str] = None
    image: Optional[str] = None
    is_available: Optional[bool] = True
    preparation_time: Optional[int] = 10
    packaging_cost: Optional[float] = 0


class ProductUpdate(BaseModel):
    name: Optional[str] = None
    name_en: Optional[str] = None
    category_id: Optional[str] = None
    price: Optional[float] = None
    cost: Optional[float] = None
    description: Optional[str] = None
    description_en: Optional[str] = None
    image: Optional[str] = None
    is_available: Optional[bool] = None
    preparation_time: Optional[int] = None
    packaging_cost: Optional[float] = None


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


@router.get("/products")
async def get_products(
    category_id: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """جلب قائمة المنتجات"""
    query = {}
    if current_user.get("tenant_id"):
        query["tenant_id"] = current_user["tenant_id"]
    if category_id:
        query["category_id"] = category_id
    
    products = await db.products.find(query, {"_id": 0}).to_list(1000)
    return products


@router.post("/products")
async def create_product(product: ProductCreate, current_user: dict = Depends(get_current_user)):
    """إنشاء منتج جديد"""
    if current_user["role"] not in ["admin", "super_admin", "manager"]:
        raise HTTPException(status_code=403, detail="غير مصرح")
    
    product_doc = {
        "id": str(uuid.uuid4()),
        "name": product.name,
        "name_en": product.name_en,
        "category_id": product.category_id,
        "price": product.price,
        "cost": product.cost,
        "description": product.description,
        "description_en": product.description_en,
        "image": product.image,
        "is_available": product.is_available,
        "preparation_time": product.preparation_time,
        "packaging_cost": product.packaging_cost,
        "tenant_id": current_user.get("tenant_id"),
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    
    await db.products.insert_one(product_doc)
    del product_doc["_id"]
    return product_doc


@router.get("/products/{product_id}")
async def get_product(product_id: str, current_user: dict = Depends(get_current_user)):
    """جلب منتج محدد"""
    query = {"id": product_id}
    if current_user.get("tenant_id"):
        query["tenant_id"] = current_user["tenant_id"]
    
    product = await db.products.find_one(query, {"_id": 0})
    if not product:
        raise HTTPException(status_code=404, detail="المنتج غير موجود")
    return product


@router.put("/products/{product_id}")
async def update_product(product_id: str, update: ProductUpdate, current_user: dict = Depends(get_current_user)):
    """تحديث منتج"""
    if current_user["role"] not in ["admin", "super_admin", "manager"]:
        raise HTTPException(status_code=403, detail="غير مصرح")
    
    query = {"id": product_id}
    if current_user.get("tenant_id"):
        query["tenant_id"] = current_user["tenant_id"]
    
    update_data = {k: v for k, v in update.model_dump().items() if v is not None}
    
    if update_data:
        await db.products.update_one(query, {"$set": update_data})
    
    product = await db.products.find_one({"id": product_id}, {"_id": 0})
    return product


@router.delete("/products/{product_id}")
async def delete_product(product_id: str, current_user: dict = Depends(get_current_user)):
    """حذف منتج"""
    if current_user["role"] not in ["admin", "super_admin"]:
        raise HTTPException(status_code=403, detail="غير مصرح")
    
    query = {"id": product_id}
    if current_user.get("tenant_id"):
        query["tenant_id"] = current_user["tenant_id"]
    
    await db.products.delete_one(query)
    return {"message": "تم حذف المنتج"}
