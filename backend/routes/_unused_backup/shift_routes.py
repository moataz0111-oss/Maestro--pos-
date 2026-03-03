"""
Shift Routes - مسارات إدارة الورديات (Cash Register)
"""
from fastapi import APIRouter, HTTPException, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
from motor.motor_asyncio import AsyncIOMotorClient
import os
import jwt
import uuid
from datetime import datetime, timezone

router = APIRouter(tags=["Shifts"])

# Database connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

JWT_SECRET = os.environ.get('JWT_SECRET', 'your-secret-key-here')
security = HTTPBearer()


class ShiftOpen(BaseModel):
    opening_cash: float = 0
    branch_id: Optional[str] = None


class ShiftClose(BaseModel):
    closing_cash: float
    denominations: Optional[Dict[str, int]] = None
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


@router.get("/shifts")
async def get_shifts(
    branch_id: Optional[str] = None,
    status: Optional[str] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """جلب قائمة الورديات"""
    query = {}
    if current_user.get("tenant_id"):
        query["tenant_id"] = current_user["tenant_id"]
    if branch_id:
        query["branch_id"] = branch_id
    if status:
        query["status"] = status
    if start_date:
        query["opened_at"] = {"$gte": start_date}
    if end_date:
        if "opened_at" in query:
            query["opened_at"]["$lte"] = end_date + "T23:59:59"
        else:
            query["opened_at"] = {"$lte": end_date + "T23:59:59"}
    
    shifts = await db.shifts.find(query, {"_id": 0}).sort("opened_at", -1).to_list(100)
    return shifts


@router.post("/shifts/open")
async def open_shift(shift_data: ShiftOpen, current_user: dict = Depends(get_current_user)):
    """فتح وردية جديدة"""
    # التحقق من عدم وجود وردية مفتوحة
    existing = await db.shifts.find_one({
        "cashier_id": current_user["id"],
        "status": "open"
    })
    
    if existing:
        raise HTTPException(status_code=400, detail="يوجد وردية مفتوحة بالفعل")
    
    now = datetime.now(timezone.utc)
    shift_doc = {
        "id": str(uuid.uuid4()),
        "cashier_id": current_user["id"],
        "cashier_name": current_user.get("full_name") or current_user.get("username"),
        "branch_id": shift_data.branch_id or current_user.get("branch_id"),
        "opening_cash": shift_data.opening_cash,
        "closing_cash": None,
        "expected_cash": shift_data.opening_cash,
        "status": "open",
        "tenant_id": current_user.get("tenant_id"),
        "opened_at": now.isoformat(),
        "closed_at": None
    }
    
    await db.shifts.insert_one(shift_doc)
    del shift_doc["_id"]
    return shift_doc


@router.post("/shifts/auto-open")
async def auto_open_shift(current_user: dict = Depends(get_current_user)):
    """فتح وردية تلقائياً إذا لم تكن موجودة"""
    # التحقق من وجود وردية مفتوحة
    existing = await db.shifts.find_one({
        "cashier_id": current_user["id"],
        "status": "open"
    }, {"_id": 0})
    
    if existing:
        return {"shift": existing, "was_existing": True}
    
    # فتح وردية جديدة
    now = datetime.now(timezone.utc)
    shift_doc = {
        "id": str(uuid.uuid4()),
        "cashier_id": current_user["id"],
        "cashier_name": current_user.get("full_name") or current_user.get("username"),
        "branch_id": current_user.get("branch_id"),
        "opening_cash": 0,
        "closing_cash": None,
        "expected_cash": 0,
        "status": "open",
        "tenant_id": current_user.get("tenant_id"),
        "opened_at": now.isoformat(),
        "closed_at": None
    }
    
    await db.shifts.insert_one(shift_doc)
    del shift_doc["_id"]
    return {"shift": shift_doc, "was_existing": False}


@router.get("/shifts/current")
async def get_current_shift(current_user: dict = Depends(get_current_user)):
    """جلب الوردية الحالية"""
    shift = await db.shifts.find_one({
        "cashier_id": current_user["id"],
        "status": "open"
    }, {"_id": 0})
    
    if not shift:
        raise HTTPException(status_code=404, detail="لا توجد وردية مفتوحة")
    
    return shift


@router.post("/shifts/{shift_id}/close")
async def close_shift(shift_id: str, close_data: ShiftClose, current_user: dict = Depends(get_current_user)):
    """إغلاق وردية"""
    query = {"id": shift_id, "status": "open"}
    if current_user.get("tenant_id"):
        query["tenant_id"] = current_user["tenant_id"]
    
    shift = await db.shifts.find_one(query)
    if not shift:
        raise HTTPException(status_code=404, detail="الوردية غير موجودة أو مغلقة")
    
    # حساب المبيعات النقدية خلال الوردية
    cash_sales = await db.orders.aggregate([
        {
            "$match": {
                "shift_id": shift_id,
                "payment_method": "cash",
                "status": {"$ne": "cancelled"}
            }
        },
        {"$group": {"_id": None, "total": {"$sum": "$total_amount"}}}
    ]).to_list(1)
    
    cash_total = cash_sales[0]["total"] if cash_sales else 0
    expected_cash = shift.get("opening_cash", 0) + cash_total
    
    now = datetime.now(timezone.utc)
    update_data = {
        "closing_cash": close_data.closing_cash,
        "expected_cash": expected_cash,
        "difference": close_data.closing_cash - expected_cash,
        "denominations": close_data.denominations,
        "notes": close_data.notes,
        "status": "closed",
        "closed_at": now.isoformat(),
        "closed_by": current_user["id"],
        "closed_by_name": current_user.get("full_name") or current_user.get("username")
    }
    
    await db.shifts.update_one({"id": shift_id}, {"$set": update_data})
    
    shift = await db.shifts.find_one({"id": shift_id}, {"_id": 0})
    return shift


@router.get("/shifts/{shift_id}")
async def get_shift(shift_id: str, current_user: dict = Depends(get_current_user)):
    """جلب وردية محددة"""
    query = {"id": shift_id}
    if current_user.get("tenant_id"):
        query["tenant_id"] = current_user["tenant_id"]
    
    shift = await db.shifts.find_one(query, {"_id": 0})
    if not shift:
        raise HTTPException(status_code=404, detail="الوردية غير موجودة")
    return shift
