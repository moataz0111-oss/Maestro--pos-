"""
Expense Routes - مسارات إدارة المصاريف
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

router = APIRouter(tags=["Expenses"])

# Database connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

JWT_SECRET = os.environ.get('JWT_SECRET', 'your-secret-key-here')
security = HTTPBearer()


class ExpenseCreate(BaseModel):
    amount: float
    category: str
    description: Optional[str] = None
    branch_id: Optional[str] = None
    date: Optional[str] = None


class ExpenseUpdate(BaseModel):
    amount: Optional[float] = None
    category: Optional[str] = None
    description: Optional[str] = None
    branch_id: Optional[str] = None


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


@router.get("/expenses")
async def get_expenses(
    branch_id: Optional[str] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """جلب قائمة المصاريف"""
    query = {}
    if current_user.get("tenant_id"):
        query["tenant_id"] = current_user["tenant_id"]
    if branch_id:
        query["branch_id"] = branch_id
    if start_date:
        query["date"] = {"$gte": start_date}
    if end_date:
        if "date" in query:
            query["date"]["$lte"] = end_date
        else:
            query["date"] = {"$lte": end_date}
    
    expenses = await db.expenses.find(query, {"_id": 0}).sort("created_at", -1).to_list(1000)
    return expenses


@router.post("/expenses")
async def create_expense(expense: ExpenseCreate, current_user: dict = Depends(get_current_user)):
    """إنشاء مصروف جديد"""
    if current_user["role"] not in ["admin", "super_admin", "manager", "cashier"]:
        raise HTTPException(status_code=403, detail="غير مصرح")
    
    now = datetime.now(timezone.utc)
    expense_doc = {
        "id": str(uuid.uuid4()),
        "amount": expense.amount,
        "category": expense.category,
        "description": expense.description,
        "branch_id": expense.branch_id or current_user.get("branch_id"),
        "date": expense.date or now.strftime("%Y-%m-%d"),
        "created_by": current_user["id"],
        "created_by_name": current_user.get("full_name") or current_user.get("username"),
        "tenant_id": current_user.get("tenant_id"),
        "created_at": now.isoformat()
    }
    
    await db.expenses.insert_one(expense_doc)
    del expense_doc["_id"]
    return expense_doc


@router.get("/expenses/{expense_id}")
async def get_expense(expense_id: str, current_user: dict = Depends(get_current_user)):
    """جلب مصروف محدد"""
    query = {"id": expense_id}
    if current_user.get("tenant_id"):
        query["tenant_id"] = current_user["tenant_id"]
    
    expense = await db.expenses.find_one(query, {"_id": 0})
    if not expense:
        raise HTTPException(status_code=404, detail="المصروف غير موجود")
    return expense


@router.put("/expenses/{expense_id}")
async def update_expense(expense_id: str, update: ExpenseUpdate, current_user: dict = Depends(get_current_user)):
    """تحديث مصروف"""
    if current_user["role"] not in ["admin", "super_admin", "manager"]:
        raise HTTPException(status_code=403, detail="غير مصرح")
    
    query = {"id": expense_id}
    if current_user.get("tenant_id"):
        query["tenant_id"] = current_user["tenant_id"]
    
    update_data = {k: v for k, v in update.model_dump().items() if v is not None}
    
    if update_data:
        await db.expenses.update_one(query, {"$set": update_data})
    
    expense = await db.expenses.find_one({"id": expense_id}, {"_id": 0})
    return expense


@router.delete("/expenses/{expense_id}")
async def delete_expense(expense_id: str, current_user: dict = Depends(get_current_user)):
    """حذف مصروف"""
    if current_user["role"] not in ["admin", "super_admin"]:
        raise HTTPException(status_code=403, detail="غير مصرح")
    
    query = {"id": expense_id}
    if current_user.get("tenant_id"):
        query["tenant_id"] = current_user["tenant_id"]
    
    await db.expenses.delete_one(query)
    return {"message": "تم حذف المصروف"}


@router.get("/expense-categories")
async def get_expense_categories(current_user: dict = Depends(get_current_user)):
    """جلب فئات المصاريف"""
    # فئات افتراضية
    default_categories = [
        {"id": "rent", "name": "إيجار", "name_en": "Rent"},
        {"id": "utilities", "name": "مرافق", "name_en": "Utilities"},
        {"id": "salaries", "name": "رواتب", "name_en": "Salaries"},
        {"id": "supplies", "name": "مستلزمات", "name_en": "Supplies"},
        {"id": "maintenance", "name": "صيانة", "name_en": "Maintenance"},
        {"id": "marketing", "name": "تسويق", "name_en": "Marketing"},
        {"id": "transport", "name": "نقل", "name_en": "Transport"},
        {"id": "other", "name": "أخرى", "name_en": "Other"}
    ]
    
    # جلب فئات مخصصة
    query = {}
    if current_user.get("tenant_id"):
        query["tenant_id"] = current_user["tenant_id"]
    
    custom_categories = await db.expense_categories.find(query, {"_id": 0}).to_list(50)
    
    return default_categories + custom_categories
