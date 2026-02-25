"""
Customer Routes - مسارات إدارة العملاء
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

router = APIRouter(tags=["Customers"])

# Database connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

JWT_SECRET = os.environ.get('JWT_SECRET', 'your-secret-key-here')
security = HTTPBearer()


class CustomerCreate(BaseModel):
    name: str
    phone: str
    email: Optional[str] = None
    address: Optional[str] = None
    notes: Optional[str] = None


class CustomerUpdate(BaseModel):
    name: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    address: Optional[str] = None
    notes: Optional[str] = None


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


@router.get("/customers")
async def get_customers(
    search: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """جلب قائمة العملاء"""
    query = {}
    if current_user.get("tenant_id"):
        query["tenant_id"] = current_user["tenant_id"]
    if search:
        query["$or"] = [
            {"name": {"$regex": search, "$options": "i"}},
            {"phone": {"$regex": search, "$options": "i"}}
        ]
    
    customers = await db.customers.find(query, {"_id": 0}).sort("created_at", -1).to_list(500)
    return customers


@router.post("/customers")
async def create_customer(customer: CustomerCreate, current_user: dict = Depends(get_current_user)):
    """إنشاء عميل جديد"""
    # التحقق من عدم وجود عميل بنفس رقم الهاتف
    query = {"phone": customer.phone}
    if current_user.get("tenant_id"):
        query["tenant_id"] = current_user["tenant_id"]
    
    existing = await db.customers.find_one(query)
    if existing:
        raise HTTPException(status_code=400, detail="يوجد عميل بنفس رقم الهاتف")
    
    customer_doc = {
        "id": str(uuid.uuid4()),
        "name": customer.name,
        "phone": customer.phone,
        "email": customer.email,
        "address": customer.address,
        "notes": customer.notes,
        "total_orders": 0,
        "total_spent": 0,
        "tenant_id": current_user.get("tenant_id"),
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    
    await db.customers.insert_one(customer_doc)
    del customer_doc["_id"]
    return customer_doc


@router.get("/customers/{customer_id}")
async def get_customer(customer_id: str, current_user: dict = Depends(get_current_user)):
    """جلب عميل محدد"""
    query = {"id": customer_id}
    if current_user.get("tenant_id"):
        query["tenant_id"] = current_user["tenant_id"]
    
    customer = await db.customers.find_one(query, {"_id": 0})
    if not customer:
        raise HTTPException(status_code=404, detail="العميل غير موجود")
    return customer


@router.get("/customers/by-phone/{phone}")
async def get_customer_by_phone(phone: str, current_user: dict = Depends(get_current_user)):
    """جلب عميل برقم الهاتف"""
    query = {"phone": phone}
    if current_user.get("tenant_id"):
        query["tenant_id"] = current_user["tenant_id"]
    
    customer = await db.customers.find_one(query, {"_id": 0})
    if not customer:
        raise HTTPException(status_code=404, detail="العميل غير موجود")
    
    # جلب سجل الطلبات
    orders = await db.orders.find(
        {"customer_phone": phone, "tenant_id": current_user.get("tenant_id")},
        {"_id": 0}
    ).sort("created_at", -1).limit(20).to_list(20)
    
    customer["orders_history"] = orders
    return customer


@router.put("/customers/{customer_id}")
async def update_customer(customer_id: str, update: CustomerUpdate, current_user: dict = Depends(get_current_user)):
    """تحديث بيانات عميل"""
    query = {"id": customer_id}
    if current_user.get("tenant_id"):
        query["tenant_id"] = current_user["tenant_id"]
    
    update_data = {k: v for k, v in update.model_dump().items() if v is not None}
    
    if update_data:
        await db.customers.update_one(query, {"$set": update_data})
    
    customer = await db.customers.find_one({"id": customer_id}, {"_id": 0})
    return customer


@router.delete("/customers/{customer_id}")
async def delete_customer(customer_id: str, current_user: dict = Depends(get_current_user)):
    """حذف عميل"""
    if current_user["role"] not in ["admin", "super_admin", "manager"]:
        raise HTTPException(status_code=403, detail="غير مصرح")
    
    query = {"id": customer_id}
    if current_user.get("tenant_id"):
        query["tenant_id"] = current_user["tenant_id"]
    
    await db.customers.delete_one(query)
    return {"message": "تم حذف العميل"}
