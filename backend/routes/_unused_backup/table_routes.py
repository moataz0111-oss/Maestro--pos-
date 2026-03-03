"""
Table Routes - مسارات إدارة الطاولات
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

router = APIRouter(tags=["Tables"])

# Database connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

JWT_SECRET = os.environ.get('JWT_SECRET', 'your-secret-key-here')
security = HTTPBearer()


class TableCreate(BaseModel):
    name: str
    capacity: Optional[int] = 4
    branch_id: Optional[str] = None
    section: Optional[str] = None


class TableUpdate(BaseModel):
    name: Optional[str] = None
    capacity: Optional[int] = None
    branch_id: Optional[str] = None
    section: Optional[str] = None
    status: Optional[str] = None
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


@router.get("/tables")
async def get_tables(
    branch_id: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """جلب قائمة الطاولات"""
    query = {"is_active": {"$ne": False}}
    if current_user.get("tenant_id"):
        query["tenant_id"] = current_user["tenant_id"]
    if branch_id:
        query["branch_id"] = branch_id
    
    tables = await db.tables.find(query, {"_id": 0}).to_list(100)
    return tables


@router.post("/tables")
async def create_table(table: TableCreate, current_user: dict = Depends(get_current_user)):
    """إنشاء طاولة جديدة"""
    if current_user["role"] not in ["admin", "super_admin", "manager"]:
        raise HTTPException(status_code=403, detail="غير مصرح")
    
    table_doc = {
        "id": str(uuid.uuid4()),
        "name": table.name,
        "capacity": table.capacity,
        "branch_id": table.branch_id,
        "section": table.section,
        "status": "available",
        "tenant_id": current_user.get("tenant_id"),
        "is_active": True,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    
    await db.tables.insert_one(table_doc)
    del table_doc["_id"]
    return table_doc


@router.get("/tables/{table_id}")
async def get_table(table_id: str, current_user: dict = Depends(get_current_user)):
    """جلب طاولة محددة"""
    query = {"id": table_id}
    if current_user.get("tenant_id"):
        query["tenant_id"] = current_user["tenant_id"]
    
    table = await db.tables.find_one(query, {"_id": 0})
    if not table:
        raise HTTPException(status_code=404, detail="الطاولة غير موجودة")
    return table


@router.put("/tables/{table_id}")
async def update_table(table_id: str, update: TableUpdate, current_user: dict = Depends(get_current_user)):
    """تحديث طاولة"""
    if current_user["role"] not in ["admin", "super_admin", "manager", "captain"]:
        raise HTTPException(status_code=403, detail="غير مصرح")
    
    query = {"id": table_id}
    if current_user.get("tenant_id"):
        query["tenant_id"] = current_user["tenant_id"]
    
    update_data = {k: v for k, v in update.model_dump().items() if v is not None}
    
    if update_data:
        await db.tables.update_one(query, {"$set": update_data})
    
    table = await db.tables.find_one({"id": table_id}, {"_id": 0})
    return table


@router.put("/tables/{table_id}/status")
async def update_table_status(
    table_id: str,
    status: str,
    current_user: dict = Depends(get_current_user)
):
    """تحديث حالة الطاولة"""
    valid_statuses = ["available", "occupied", "reserved", "cleaning"]
    if status not in valid_statuses:
        raise HTTPException(status_code=400, detail=f"الحالة يجب أن تكون: {', '.join(valid_statuses)}")
    
    query = {"id": table_id}
    if current_user.get("tenant_id"):
        query["tenant_id"] = current_user["tenant_id"]
    
    update_data = {"status": status}
    if status == "available":
        update_data["current_order_id"] = None
    
    await db.tables.update_one(query, {"$set": update_data})
    
    table = await db.tables.find_one({"id": table_id}, {"_id": 0})
    return table


@router.delete("/tables/{table_id}")
async def delete_table(table_id: str, current_user: dict = Depends(get_current_user)):
    """حذف طاولة"""
    if current_user["role"] not in ["admin", "super_admin"]:
        raise HTTPException(status_code=403, detail="غير مصرح")
    
    query = {"id": table_id}
    if current_user.get("tenant_id"):
        query["tenant_id"] = current_user["tenant_id"]
    
    await db.tables.update_one(query, {"$set": {"is_active": False}})
    return {"message": "تم حذف الطاولة"}
