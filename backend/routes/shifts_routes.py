"""
Shifts Routes - إدارة الورديات وإغلاق الصندوق
"""
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from pydantic import BaseModel, ConfigDict
from typing import Optional, List, Dict
from datetime import datetime, timezone
import uuid
import logging

from .shared import (
    get_database, get_current_user, get_user_tenant_id,
    build_tenant_query, UserRole, OrderStatus, PaymentMethod, OrderType,
    iraq_date_from_utc, resolve_business_date
)

logger = logging.getLogger(__name__)
router = APIRouter(tags=["Shifts"])

def _safe_num(val, default=0):
    """Convert None/non-numeric values to a safe default for math operations.
    dict.get('key', 0) returns None when key exists with null value in MongoDB."""
    if val is None:
        return default
    try:
        return float(val)
    except (TypeError, ValueError):
        return default

# ==================== MODELS ====================
class ShiftCreate(BaseModel):
    cashier_id: str
    branch_id: str
    opening_cash: float

class ShiftClose(BaseModel):
    closing_cash: float
    notes: Optional[str] = None

class CashRegisterClose(BaseModel):
    denominations: Dict[str, int] = {}
    notes: Optional[str] = None
    branch_id: Optional[str] = None

class ShiftResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    cashier_id: str
    cashier_name: str = ""
    branch_id: Optional[str] = None
    opening_cash: Optional[float] = 0.0
    closing_cash: Optional[float] = None
    expected_cash: Optional[float] = None
    cash_difference: Optional[float] = None
    total_sales: float = 0.0
    total_cost: float = 0.0
    gross_profit: float = 0.0
    total_orders: int = 0
    started_at: Optional[str] = None
    card_sales: float = 0.0
    cash_sales: float = 0.0
    credit_sales: float = 0.0
    delivery_app_sales: Dict[str, float] = {}
    driver_sales: float = 0.0
    total_expenses: float = 0.0
    net_profit: float = 0.0
    started_at: str
    ended_at: Optional[str] = None
    status: str
    denominations: Optional[Dict[str, int]] = None
    cancelled_orders: int = 0
    cancelled_amount: float = 0.0
    discounts_total: float = 0.0
    business_date: Optional[str] = None

# ==================== SHIFT CRUD ====================
@router.post("/shifts", response_model=ShiftResponse)
async def open_shift(shift: ShiftCreate, current_user: dict = Depends(get_current_user)):
    """فتح وردية جديدة"""
    db = get_database()
    existing = await db.shifts.find_one({"cashier_id": shift.cashier_id, "status": "open"})
    if existing:
        raise HTTPException(status_code=400, detail="يوجد شفت مفتوح بالفعل")
    
    cashier = await db.users.find_one({"id": shift.cashier_id}, {"_id": 0, "password": 0})
    if not cashier:
        raise HTTPException(status_code=404, detail="الكاشير غير موجود")
    
    shift_doc = {
        "id": str(uuid.uuid4()),
        "cashier_id": shift.cashier_id,
        "cashier_name": cashier["full_name"],
        "branch_id": shift.branch_id,
        "opening_cash": shift.opening_cash,
        "closing_cash": None,
        "expected_cash": shift.opening_cash,
        "cash_difference": None,
        "total_sales": 0.0,
        "total_cost": 0.0,
        "gross_profit": 0.0,
        "total_orders": 0,
        "card_sales": 0.0,
        "cash_sales": 0.0,
        "credit_sales": 0.0,
        "delivery_app_sales": {},
        "total_expenses": 0.0,
        "net_profit": 0.0,
        "started_at": datetime.now(timezone.utc).isoformat(),
        "ended_at": None,
        "status": "open",
        "business_date": iraq_date_from_utc()
    }
    await db.shifts.insert_one(shift_doc)
    del shift_doc["_id"]
    return shift_doc

@router.get("/shifts/current")
async def get_current_shift(branch_id: Optional[str] = None, current_user: dict = Depends(get_current_user)):
    """جلب الوردية الحالية - المالك/المدير يرى وردية الكاشير النشط"""
    db = get_database()
    tenant_id = get_user_tenant_id(current_user)
    user_role = current_user.get("role", "")
    is_owner = user_role in ["admin", "super_admin", "manager", "branch_manager"]
    
    if is_owner:
        # المالك/المدير: البحث عن أي وردية مفتوحة للفرع المحدد
        target_branch = branch_id or current_user.get("branch_id")
        shift_query = {"status": "open"}
        if tenant_id:
            shift_query["tenant_id"] = tenant_id
        if target_branch:
            shift_query["branch_id"] = target_branch
        
        # أولاً ابحث عن وردية كاشير (ليست وردية المالك نفسه)
        cashier_shift_query = {**shift_query, "cashier_id": {"$ne": current_user["id"]}}
        shift = await db.shifts.find_one(cashier_shift_query, {"_id": 0})
        
        # إذا لم توجد وردية كاشير، ابحث عن أي وردية مفتوحة
        if not shift:
            shift = await db.shifts.find_one(shift_query, {"_id": 0})
        
        return shift
    else:
        # الكاشير: ورديته فقط
        shift_query = {"cashier_id": current_user["id"], "status": "open"}
        if tenant_id:
            shift_query["tenant_id"] = tenant_id
        shift = await db.shifts.find_one(shift_query, {"_id": 0})
        return shift

@router.get("/shifts/cashiers-list")
async def get_cashiers_list(branch_id: Optional[str] = None, current_user: dict = Depends(get_current_user)):
    """جلب قائمة الكاشيرية مع حالة ورديتهم (نشط/غير نشط) - يدعم فلتر الفرع"""
    db = get_database()
    tenant_id = get_user_tenant_id(current_user)
    
    user_role = current_user.get("role", "")
    if user_role not in ["admin", "super_admin", "manager", "branch_manager"]:
        raise HTTPException(status_code=403, detail="غير مصرح")
    
    query = {"role": "cashier", "is_active": {"$ne": False}}
    if tenant_id:
        query["tenant_id"] = tenant_id
    if branch_id:
        query["branch_id"] = branch_id
    
    cashiers = await db.users.find(query, {"_id": 0, "password": 0}).to_list(100)
    
    # جلب أسماء الفروع
    branch_ids = list(set(c.get("branch_id") for c in cashiers if c.get("branch_id")))
    branches_lookup = {}
    if branch_ids:
        branches = await db.branches.find({"id": {"$in": branch_ids}}, {"_id": 0, "id": 1, "name": 1}).to_list(50)
        branches_lookup = {b["id"]: b["name"] for b in branches}
    
    # إضافة حالة الوردية واسم الفرع لكل كاشير
    for cashier in cashiers:
        shift_query = {"cashier_id": cashier["id"], "status": "open"}
        if tenant_id:
            shift_query["tenant_id"] = tenant_id
        active_shift = await db.shifts.find_one(shift_query, {"_id": 0, "id": 1, "started_at": 1, "branch_id": 1})
        cashier["has_active_shift"] = active_shift is not None
        if active_shift:
            cashier["shift_id"] = active_shift.get("id")
        cashier["branch_name"] = branches_lookup.get(cashier.get("branch_id", ""), "")
    
    return cashiers

class OpenShiftForCashier(BaseModel):
    cashier_id: str
    branch_id: Optional[str] = None
    opening_cash: float = 0.0


class QuickOpenShift(BaseModel):
    opening_cash: float = 0.0
    branch_id: Optional[str] = None

@router.post("/shifts/open")
async def quick_open_shift(data: QuickOpenShift, current_user: dict = Depends(get_current_user)):
    """فتح وردية سريعة - للمالك أو الكاشير"""
    db = get_database()
    tenant_id = get_user_tenant_id(current_user)
    user_id = current_user["id"]
    
    branch_id = data.branch_id or current_user.get("branch_id")
    if not branch_id:
        branch_query = {"tenant_id": tenant_id} if tenant_id else {}
        branch = await db.branches.find_one(branch_query, {"_id": 0, "id": 1})
        branch_id = branch["id"] if branch else None
    
    # تحقق من عدم وجود وردية مفتوحة
    existing_query = {"cashier_id": user_id, "status": "open"}
    if tenant_id:
        existing_query["tenant_id"] = tenant_id
    existing = await db.shifts.find_one(existing_query, {"_id": 0})
    if existing:
        return {"shift": existing, "was_existing": True, "message": "وردية مفتوحة بالفعل"}
    
    shift_doc = {
        "id": str(uuid.uuid4()),
        "cashier_id": user_id,
        "cashier_name": current_user.get("full_name") or current_user.get("username", ""),
        "branch_id": branch_id,
        "opening_cash": data.opening_cash,
        "closing_cash": None,
        "expected_cash": data.opening_cash,
        "cash_difference": None,
        "total_sales": 0.0,
        "total_cost": 0.0,
        "gross_profit": 0.0,
        "total_orders": 0,
        "card_sales": 0.0,
        "cash_sales": 0.0,
        "credit_sales": 0.0,
        "delivery_app_sales": {},
        "driver_sales": 0.0,
        "total_expenses": 0.0,
        "net_profit": 0.0,
        "started_at": datetime.now(timezone.utc).isoformat(),
        "ended_at": None,
        "status": "open",
        "opened_by": user_id,
        "opened_by_name": current_user.get("full_name", ""),
        "business_date": iraq_date_from_utc()
    }
    if tenant_id:
        shift_doc["tenant_id"] = tenant_id
    
    await db.shifts.insert_one(shift_doc)
    del shift_doc["_id"]
    
    return {"shift": shift_doc, "was_existing": False, "message": "تم فتح الوردية"}

@router.post("/shifts/open-for-cashier")
async def open_shift_for_cashier(data: OpenShiftForCashier, current_user: dict = Depends(get_current_user)):
    """المالك يفتح وردية لكاشير محدد"""
    db = get_database()
    tenant_id = get_user_tenant_id(current_user)
    
    user_role = current_user.get("role", "")
    if user_role not in ["admin", "super_admin", "manager", "branch_manager"]:
        raise HTTPException(status_code=403, detail="غير مصرح - فقط المدير يمكنه فتح وردية لكاشير")
    
    # تحقق من عدم وجود وردية مفتوحة لهذا الكاشير
    existing_query = {"cashier_id": data.cashier_id, "status": "open"}
    if tenant_id:
        existing_query["tenant_id"] = tenant_id
    existing = await db.shifts.find_one(existing_query, {"_id": 0})
    if existing:
        return {"shift": existing, "was_existing": True, "message": "يوجد وردية مفتوحة بالفعل لهذا الكاشير"}
    
    cashier = await db.users.find_one({"id": data.cashier_id}, {"_id": 0, "password": 0})
    if not cashier:
        raise HTTPException(status_code=404, detail="الكاشير غير موجود")
    
    branch_id = data.branch_id or current_user.get("branch_id")
    if not branch_id:
        branch_query = {"tenant_id": tenant_id} if tenant_id else {}
        branch = await db.branches.find_one(branch_query, {"_id": 0, "id": 1})
        branch_id = branch["id"] if branch else None
    
    shift_doc = {
        "id": str(uuid.uuid4()),
        "cashier_id": data.cashier_id,
        "cashier_name": cashier.get("full_name") or cashier.get("username", ""),
        "branch_id": branch_id,
        "opening_cash": data.opening_cash,
        "closing_cash": None,
        "expected_cash": data.opening_cash,
        "cash_difference": None,
        "total_sales": 0.0,
        "total_cost": 0.0,
        "gross_profit": 0.0,
        "total_orders": 0,
        "card_sales": 0.0,
        "cash_sales": 0.0,
        "credit_sales": 0.0,
        "delivery_app_sales": {},
        "driver_sales": 0.0,
        "total_expenses": 0.0,
        "net_profit": 0.0,
        "started_at": datetime.now(timezone.utc).isoformat(),
        "ended_at": None,
        "status": "open",
        "opened_by": current_user["id"],
        "opened_by_name": current_user.get("full_name", ""),
        "business_date": iraq_date_from_utc()
    }
    if tenant_id:
        shift_doc["tenant_id"] = tenant_id
    
    await db.shifts.insert_one(shift_doc)
    del shift_doc["_id"]
    
    return {"shift": shift_doc, "was_existing": False, "message": f"تم فتح وردية باسم {cashier.get('full_name', '')}"}

@router.post("/shifts/auto-open")
async def auto_open_shift(current_user: dict = Depends(get_current_user)):
    """فتح وردية تلقائياً للكاشير عند تسجيل الدخول - المالك/المدير لا يفتح وردية تلقائياً"""
    db = get_database()
    tenant_id = get_user_tenant_id(current_user)
    user_role = current_user.get("role", "")
    is_owner = user_role in ["admin", "super_admin", "manager", "branch_manager"]
    
    if is_owner:
        # المالك: البحث عن وردية كاشير مفتوحة بدلاً من إنشاء واحدة
        shift_query = {"status": "open"}
        if tenant_id:
            shift_query["tenant_id"] = tenant_id
        branch_id = current_user.get("branch_id")
        if branch_id:
            shift_query["branch_id"] = branch_id
        
        existing = await db.shifts.find_one(
            {**shift_query, "cashier_id": {"$ne": current_user["id"]}}, 
            {"_id": 0}
        )
        if not existing:
            existing = await db.shifts.find_one(shift_query, {"_id": 0})
        
        if existing:
            return {"shift": existing, "was_existing": True, "message": "وردية مفتوحة بالفعل"}
        else:
            raise HTTPException(status_code=404, detail="لا توجد وردية مفتوحة - يرجى فتح وردية لكاشير")
    
    # كاشير عادي: فتح وردية تلقائياً
    query = {"cashier_id": current_user["id"], "status": "open"}
    if tenant_id:
        query["tenant_id"] = tenant_id
        
    existing = await db.shifts.find_one(query, {"_id": 0})
    
    if existing:
        return {"shift": existing, "was_existing": True, "message": "وردية مفتوحة بالفعل"}
    
    branch_id = current_user.get("branch_id")
    if not branch_id:
        branch_query = {"tenant_id": tenant_id} if tenant_id else {}
        branch = await db.branches.find_one(branch_query, {"_id": 0, "id": 1})
        branch_id = branch["id"] if branch else None
    
    if not branch_id:
        default_branch = {
            "id": str(uuid.uuid4()),
            "name": "الفرع الرئيسي",
            "address": "",
            "phone": "",
            "is_active": True,
            "created_at": datetime.now(timezone.utc).isoformat()
        }
        if tenant_id:
            default_branch["tenant_id"] = tenant_id
        await db.branches.insert_one(default_branch)
        branch_id = default_branch["id"]
    
    shift_doc = {
        "id": str(uuid.uuid4()),
        "cashier_id": current_user["id"],
        "cashier_name": current_user.get("full_name") or current_user.get("username"),
        "branch_id": branch_id,
        "opening_cash": 0.0,
        "closing_cash": None,
        "expected_cash": 0.0,
        "cash_difference": None,
        "total_sales": 0.0,
        "total_cost": 0.0,
        "gross_profit": 0.0,
        "total_orders": 0,
        "card_sales": 0.0,
        "cash_sales": 0.0,
        "credit_sales": 0.0,
        "delivery_app_sales": {},
        "driver_sales": 0.0,
        "total_expenses": 0.0,
        "net_profit": 0.0,
        "started_at": datetime.now(timezone.utc).isoformat(),
        "ended_at": None,
        "status": "open",
        "business_date": iraq_date_from_utc()
    }
    
    if tenant_id:
        shift_doc["tenant_id"] = tenant_id
    
    await db.shifts.insert_one(shift_doc)
    del shift_doc["_id"]
    
    return {"shift": shift_doc, "was_existing": False, "message": "تم فتح وردية جديدة تلقائياً"}

@router.post("/shifts/{shift_id}/close")
async def close_shift(shift_id: str, close_data: ShiftClose, current_user: dict = Depends(get_current_user)):
    """إغلاق الوردية"""
    db = get_database()
    shift = await db.shifts.find_one({"id": shift_id}, {"_id": 0})
    if not shift:
        raise HTTPException(status_code=404, detail="الشفت غير موجود")
    if shift.get("status") == "closed":
        raise HTTPException(status_code=400, detail="الشفت مغلق بالفعل")
    
    shift_start = shift.get("started_at") or shift.get("opened_at") or ""
    shift_cashier = shift.get("cashier_id") or ""
    shift_branch = shift.get("branch_id") or ""
    
    orders = await db.orders.find({
        "cashier_id": shift_cashier,
        "created_at": {"$gte": shift_start},
        "status": {"$ne": OrderStatus.CANCELLED}
    }).to_list(1000)
    
    total_sales = sum(_safe_num(o.get("total")) for o in orders)
    total_cost = sum(_safe_num(o.get("total_cost")) for o in orders)
    gross_profit = total_sales - total_cost
    cash_sales = sum(_safe_num(o.get("total")) for o in orders if o.get("payment_method") == PaymentMethod.CASH)
    card_sales = sum(_safe_num(o.get("total")) for o in orders if o.get("payment_method") == PaymentMethod.CARD)
    credit_sales = sum(_safe_num(o.get("total")) for o in orders if o.get("payment_method") == PaymentMethod.CREDIT and not o.get("delivery_app") and not o.get("is_delivery_company"))
    
    delivery_app_sales = {}
    for o in orders:
        if o.get("delivery_app") or o.get("delivery_app_name"):
            app_name = o.get("delivery_app_name") or o.get("delivery_app", "توصيل")
            if app_name not in delivery_app_sales:
                delivery_app_sales[app_name] = 0
            delivery_app_sales[app_name] += _safe_num(o.get("total"))
    
    expenses = await db.expenses.find({
        "branch_id": shift_branch,
        "category": {"$ne": "refund"},
        "created_at": {"$gte": shift_start}
    }).to_list(100)
    total_expenses = sum(_safe_num(e.get("amount")) for e in expenses)
    
    net_profit = gross_profit - total_expenses
    opening_cash = _safe_num(shift.get("opening_cash", shift.get("opening_balance", 0)))
    expected_cash = opening_cash + cash_sales - total_expenses
    cash_difference = close_data.closing_cash - expected_cash
    
    update_data = {
        "closing_cash": close_data.closing_cash,
        "expected_cash": expected_cash,
        "cash_difference": cash_difference,
        "total_sales": total_sales,
        "total_cost": total_cost,
        "gross_profit": gross_profit,
        "total_orders": len(orders),
        "cash_sales": cash_sales,
        "card_sales": card_sales,
        "credit_sales": credit_sales,
        "delivery_app_sales": delivery_app_sales,
        "total_expenses": total_expenses,
        "net_profit": net_profit,
        "ended_at": datetime.now(timezone.utc).isoformat(),
        "status": "closed",
        "notes": close_data.notes
    }
    
    await db.shifts.update_one({"id": shift_id}, {"$set": update_data})
    updated_shift = await db.shifts.find_one({"id": shift_id}, {"_id": 0})
    
    # حفظ سجل الإغلاق في cash_register_closings للتقارير
    closing_record = {
        "id": str(uuid.uuid4()),
        "tenant_id": shift.get("tenant_id"),
        "branch_id": shift.get("branch_id"),
        "branch_name": shift.get("branch_name", ""),
        "cashier_id": shift.get("cashier_id"),
        "cashier_name": shift.get("cashier_name", ""),
        "shift_id": shift_id,
        "shift_start": shift.get("started_at"),
        "shift_end": datetime.now(timezone.utc).isoformat(),
        "closed_at": datetime.now(timezone.utc).isoformat(),
        "total_sales": total_sales,
        "cash_sales": cash_sales,
        "card_sales": card_sales,
        "credit_sales": credit_sales,
        "delivery_sales": sum(delivery_app_sales.values()) if delivery_app_sales else 0,
        "dine_in_sales": sum(o.get("total", 0) for o in orders if o.get("order_type") == "dine_in"),
        "takeaway_sales": sum(o.get("total", 0) for o in orders if o.get("order_type") == "takeaway"),
        "total_expenses": total_expenses,
        "expected_cash": expected_cash,
        "actual_cash": close_data.closing_cash,
        "closing_cash": close_data.closing_cash,
        "counted_cash": close_data.closing_cash,
        "difference": cash_difference,
        "difference_type": "surplus" if cash_difference > 0 else "shortage" if cash_difference < 0 else "exact",
        "notes": close_data.notes or "",
        "orders_count": len(orders)
    }
    await db.cash_register_closings.insert_one(closing_record)
    del closing_record["_id"]
    
    return updated_shift

@router.get("/shifts", response_model=List[ShiftResponse])
async def get_shifts(
    branch_id: Optional[str] = None,
    date: Optional[str] = None,
    status: Optional[str] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """جلب قائمة الورديات - يدعم الفلترة بالـ business_date (اليوم التشغيلي)"""
    db = get_database()
    query = {}
    if branch_id:
        query["branch_id"] = branch_id
    if status:
        query["status"] = status
    
    # فلترة بتاريخ محدد (business_date أولاً، fallback لـ started_at للسجلات القديمة)
    if date:
        query["$or"] = [
            {"business_date": date},
            {"business_date": {"$exists": False}, "started_at": {"$regex": f"^{date}"}}
        ]
    elif date_from or date_to:
        biz_range = {}
        if date_from:
            biz_range["$gte"] = date_from
        if date_to:
            biz_range["$lte"] = date_to
        # للسجلات القديمة: استخدم started_at كنطاق
        started_range = {}
        if date_from:
            started_range["$gte"] = date_from
        if date_to:
            started_range["$lte"] = date_to + "T23:59:59"
        query["$or"] = [
            {"business_date": biz_range.copy()},
            {"business_date": {"$exists": False}, "started_at": started_range.copy()}
        ]
    
    shifts = await db.shifts.find(query, {"_id": 0}).sort("started_at", -1).to_list(100)
    
    # معالجة القيم الفارغة والحقول القديمة
    for shift in shifts:
        if shift.get("cashier_name") is None:
            shift["cashier_name"] = ""
        # دعم الشفتات القديمة: opening_balance → opening_cash, opened_at → started_at
        if "opening_cash" not in shift and "opening_balance" in shift:
            shift["opening_cash"] = shift.get("opening_balance", 0)
        if "started_at" not in shift and "opened_at" in shift:
            shift["started_at"] = shift.get("opened_at")
    
    return shifts

# ==================== CASH REGISTER ====================
@router.get("/cash-register/summary")
async def get_cash_register_summary(
    branch_id: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """جلب ملخص الصندوق الحالي للكاشير - قبل إغلاقه"""
    db = get_database()
    tenant_id = get_user_tenant_id(current_user)
    
    # استخدام branch_id المرسل من الواجهة أو الافتراضي للمستخدم
    target_branch_id = branch_id or current_user.get("branch_id")
    
    # للمدراء: السماح بإغلاق أي وردية مفتوحة للفرع المحدد
    # للكاشير: البحث عن ورديته فقط
    user_role = current_user.get("role", "")
    is_manager = user_role in ["admin", "super_admin", "manager", "branch_manager"]
    
    shift_query = {"status": "open"}
    if tenant_id:
        shift_query["tenant_id"] = tenant_id
    
    if is_manager and target_branch_id:
        # المدير يمكنه إغلاق أي وردية للفرع
        shift_query["branch_id"] = target_branch_id
    else:
        # الكاشير يغلق ورديته فقط
        shift_query["cashier_id"] = current_user["id"]
        if target_branch_id:
            shift_query["branch_id"] = target_branch_id
    
    shift = await db.shifts.find_one(shift_query, {"_id": 0})
    
    # إذا لم توجد وردية مفتوحة
    if not shift:
        # المالك/المدير: لا نُنشئ وردية تلقائياً - يجب اختيار كاشير
        if is_manager:
            raise HTTPException(status_code=404, detail="لا توجد وردية مفتوحة - يرجى فتح وردية لكاشير من نقاط البيع")
        
        # الكاشير: نُنشئ وردية تلقائياً
        new_shift = {
            "id": str(uuid.uuid4()),
            "tenant_id": tenant_id,
            "branch_id": target_branch_id,
            "cashier_id": current_user.get("id"),
            "cashier_name": current_user.get("full_name", ""),
            "started_at": datetime.now(timezone.utc).isoformat(),
            "opened_at": datetime.now(timezone.utc).isoformat(),
            "status": "open",
            "opening_balance": 0,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "business_date": iraq_date_from_utc()
        }
        await db.shifts.insert_one(new_shift)
        shift = new_shift
    
    branch = await db.branches.find_one({"id": shift.get("branch_id", "")}, {"_id": 0, "name": 1})
    
    shift_id = shift["id"]
    shift_start = shift.get("started_at") or shift.get("opened_at") or datetime.now(timezone.utc).isoformat()
    shift_cashier_id = shift.get("cashier_id") or current_user.get("id")
    
    # جلب جميع طلبات الوردية - بالـ shift_id + الطلبات بدون shift_id في نفس الفترة والفرع
    # هذا يضمن احتساب طلبات تطبيق الزبائن والطلبات غير المرتبطة بوردية
    base_status_filter = {"$nin": [OrderStatus.CANCELLED, "refunded"]}
    
    # 1. طلبات مرتبطة بالـ shift_id مباشرة
    shift_order_query = {"shift_id": shift_id, "status": base_status_filter}
    if tenant_id:
        shift_order_query["tenant_id"] = tenant_id
    
    shift_orders = await db.orders.find(shift_order_query).to_list(1000)
    
    # 2. طلبات في نفس الفرع خلال فترة الوردية بدون shift_id (طلبات تطبيق الزبائن وغيرها)
    unlinked_query = {
        "created_at": {"$gte": shift_start},
        "status": base_status_filter,
        "$or": [{"shift_id": {"$exists": False}}, {"shift_id": None}, {"shift_id": ""}]
    }
    if tenant_id:
        unlinked_query["tenant_id"] = tenant_id
    if shift.get("branch_id"):
        unlinked_query["branch_id"] = shift["branch_id"]
    
    unlinked_orders = await db.orders.find(unlinked_query).to_list(1000)
    
    # 3. دمج الطلبات مع إزالة التكرار
    seen_ids = set(o.get("id") for o in shift_orders if o.get("id"))
    for o in unlinked_orders:
        if o.get("id") and o["id"] not in seen_ids:
            shift_orders.append(o)
            seen_ids.add(o["id"])
    
    orders = shift_orders
    
    # fallback: إذا لم تُوجد أي طلبات، نبحث بـ cashier_id + وقت الوردية
    if not orders:
        fallback_query = {
            "cashier_id": shift_cashier_id,
            "created_at": {"$gte": shift_start},
            "status": base_status_filter
        }
        if tenant_id:
            fallback_query["tenant_id"] = tenant_id
        orders = await db.orders.find(fallback_query).to_list(1000)
    
    # الطلبات الملغاة لهذه الوردية (نفس المنطق: shift_id + بدون shift_id)
    cancelled_shift = {"shift_id": shift_id, "status": OrderStatus.CANCELLED}
    if tenant_id:
        cancelled_shift["tenant_id"] = tenant_id
    cancelled_orders = await db.orders.find(cancelled_shift).to_list(1000)
    
    cancelled_unlinked_query = {
        "created_at": {"$gte": shift_start},
        "status": OrderStatus.CANCELLED,
        "$or": [{"shift_id": {"$exists": False}}, {"shift_id": None}, {"shift_id": ""}]
    }
    if tenant_id:
        cancelled_unlinked_query["tenant_id"] = tenant_id
    if shift.get("branch_id"):
        cancelled_unlinked_query["branch_id"] = shift["branch_id"]
    cancelled_unlinked = await db.orders.find(cancelled_unlinked_query).to_list(1000)
    
    seen_cancelled = set(o.get("id") for o in cancelled_orders if o.get("id"))
    for o in cancelled_unlinked:
        if o.get("id") and o["id"] not in seen_cancelled:
            cancelled_orders.append(o)
            seen_cancelled.add(o["id"])
    
    # جلب المرتجعات بشكل منفصل
    refunded_shift_q = {"shift_id": shift_id, "status": "refunded"}
    if tenant_id:
        refunded_shift_q["tenant_id"] = tenant_id
    refunded_orders_list = await db.orders.find(refunded_shift_q).to_list(1000)
    
    refunded_unlinked_q = {
        "created_at": {"$gte": shift_start},
        "status": "refunded",
        "$or": [{"shift_id": {"$exists": False}}, {"shift_id": None}, {"shift_id": ""}]
    }
    if tenant_id:
        refunded_unlinked_q["tenant_id"] = tenant_id
    if shift.get("branch_id"):
        refunded_unlinked_q["branch_id"] = shift["branch_id"]
    refunded_unlinked_list = await db.orders.find(refunded_unlinked_q).to_list(1000)
    
    seen_refunded = set(o.get("id") for o in refunded_orders_list if o.get("id"))
    for o in refunded_unlinked_list:
        if o.get("id") and o["id"] not in seen_refunded:
            refunded_orders_list.append(o)
            seen_refunded.add(o["id"])
    
    total_refunds_amount = sum(_safe_num(o.get("total")) for o in refunded_orders_list)
    refund_count_val = len(refunded_orders_list)
    
    total_sales = sum(_safe_num(o.get("total")) for o in orders)
    total_cost = sum(_safe_num(o.get("total_cost")) for o in orders)
    gross_profit = total_sales - total_cost
    cash_sales = sum(_safe_num(o.get("total")) for o in orders if o.get("payment_method") == PaymentMethod.CASH)
    card_sales = sum(_safe_num(o.get("total")) for o in orders if o.get("payment_method") == PaymentMethod.CARD)
    credit_sales = sum(_safe_num(o.get("total")) for o in orders if o.get("payment_method") == PaymentMethod.CREDIT and not o.get("delivery_app") and not o.get("is_delivery_company"))
    
    delivery_app_sales = {}
    for o in orders:
        if o.get("delivery_app") or o.get("delivery_app_name"):
            app_name = o.get("delivery_app_name") or o.get("delivery_app", "توصيل")
            if app_name not in delivery_app_sales:
                delivery_app_sales[app_name] = 0
            delivery_app_sales[app_name] += _safe_num(o.get("total"))
    
    driver_sales = sum(_safe_num(o.get("total")) for o in orders if o.get("order_type") == OrderType.DELIVERY and o.get("driver_id"))
    discounts_total = sum(_safe_num(o.get("discount")) for o in orders)
    
    cancelled_by = {}
    cancelled_amount = 0
    for o in cancelled_orders:
        cancelled_amount += _safe_num(o.get("total"))
        cancelled_by_id = o.get("cancelled_by", o.get("cashier_id"))
        if cancelled_by_id and cancelled_by_id not in cancelled_by:
            user = await db.users.find_one({"id": cancelled_by_id}, {"_id": 0, "full_name": 1})
            cancelled_by[cancelled_by_id] = {
                "user_id": cancelled_by_id,
                "user_name": user.get("full_name", "غير معروف") if user else "غير معروف",
                "count": 0,
                "total": 0
            }
        if cancelled_by_id and cancelled_by_id in cancelled_by:
            cancelled_by[cancelled_by_id]["count"] += 1
            cancelled_by[cancelled_by_id]["total"] += _safe_num(o.get("total"))
    
    # جلب المصروفات خلال فترة الوردية (باستثناء المرتجعات)
    expense_query = {
        "branch_id": shift.get("branch_id"),
        "category": {"$ne": "refund"},
        "created_at": {"$gte": shift_start}
    }
    if tenant_id:
        expense_query["tenant_id"] = tenant_id
    
    expenses = await db.expenses.find(expense_query).to_list(100)
    total_expenses = sum(_safe_num(e.get("amount")) for e in expenses)
    
    opening_cash = _safe_num(shift.get("opening_cash", shift.get("opening_balance", 0)))
    net_profit = gross_profit - total_expenses
    expected_cash = opening_cash + cash_sales - total_expenses
    non_cash_amount = card_sales + credit_sales
    
    return {
        "shift_id": shift["id"],
        "branch_id": shift.get("branch_id", ""),
        "branch_name": branch["name"] if branch else "",
        "cashier_id": current_user["id"],
        "cashier_name": current_user.get("full_name", current_user.get("username", "")),
        "started_at": shift.get("started_at", shift.get("opened_at", "")),
        "opening_cash": opening_cash,
        "total_sales": total_sales,
        "total_cost": total_cost,
        "gross_profit": gross_profit,
        "total_orders": len(orders),
        "cash_sales": cash_sales,
        "card_sales": card_sales,
        "credit_sales": credit_sales,
        "non_cash_amount": non_cash_amount,
        "delivery_app_sales": delivery_app_sales,
        "driver_sales": driver_sales,
        "discounts_total": discounts_total,
        "cancelled_orders": len(cancelled_orders),
        "cancelled_amount": cancelled_amount,
        "cancelled_by": list(cancelled_by.values()),
        "total_expenses": total_expenses,
        "net_profit": net_profit,
        "expected_cash": expected_cash,
        "total_refunds": total_refunds_amount,
        "refund_count": refund_count_val
    }

@router.post("/cash-register/close")
async def close_cash_register(close_data: CashRegisterClose, current_user: dict = Depends(get_current_user)):
    """إغلاق الصندوق مع جرد فئات النقود"""
    db = get_database()
    tenant_id = get_user_tenant_id(current_user)
    
    # استخدام branch_id المرسل أو الافتراضي للمستخدم
    target_branch_id = close_data.branch_id or current_user.get("branch_id")
    
    # للمدراء: السماح بإغلاق أي وردية مفتوحة للفرع المحدد
    # للكاشير: البحث عن ورديته فقط
    user_role = current_user.get("role", "")
    is_manager = user_role in ["admin", "super_admin", "manager", "branch_manager"]
    
    shift_query = {"status": "open"}
    if tenant_id:
        shift_query["tenant_id"] = tenant_id
    
    if is_manager and target_branch_id:
        # المدير يمكنه إغلاق أي وردية للفرع
        shift_query["branch_id"] = target_branch_id
    else:
        # الكاشير يغلق ورديته فقط
        shift_query["cashier_id"] = current_user["id"]
        if target_branch_id:
            shift_query["branch_id"] = target_branch_id
    
    shift = await db.shifts.find_one(shift_query, {"_id": 0})
    
    if not shift:
        raise HTTPException(status_code=404, detail="لا يوجد وردية مفتوحة")
    
    shift_id = shift["id"]
    shift_start = shift.get("started_at") or shift.get("opened_at") or datetime.now(timezone.utc).isoformat()
    shift_cashier_id = shift.get("cashier_id") or current_user.get("id")
    branch = await db.branches.find_one({"id": shift.get("branch_id", "")}, {"_id": 0, "name": 1})
    
    denomination_values = {
        "250": 250, "500": 500, "1000": 1000, "5000": 5000,
        "10000": 10000, "25000": 25000, "50000": 50000
    }
    closing_cash = sum(
        denomination_values.get(denom, int(denom)) * count
        for denom, count in close_data.denominations.items()
    )
    
    # جلب جميع طلبات الوردية - بالـ shift_id + الطلبات بدون shift_id في نفس الفترة والفرع
    base_status_filter = {"$nin": [OrderStatus.CANCELLED, "refunded"]}
    
    shift_order_query = {"shift_id": shift_id, "status": base_status_filter}
    if tenant_id:
        shift_order_query["tenant_id"] = tenant_id
    
    shift_orders = await db.orders.find(shift_order_query).to_list(1000)
    
    unlinked_query = {
        "created_at": {"$gte": shift_start},
        "status": base_status_filter,
        "$or": [{"shift_id": {"$exists": False}}, {"shift_id": None}, {"shift_id": ""}]
    }
    if tenant_id:
        unlinked_query["tenant_id"] = tenant_id
    if shift.get("branch_id"):
        unlinked_query["branch_id"] = shift["branch_id"]
    
    unlinked_orders = await db.orders.find(unlinked_query).to_list(1000)
    
    seen_ids = set(o.get("id") for o in shift_orders if o.get("id"))
    for o in unlinked_orders:
        if o.get("id") and o["id"] not in seen_ids:
            shift_orders.append(o)
            seen_ids.add(o["id"])
    
    orders = shift_orders
    
    if not orders:
        fallback_query = {
            "cashier_id": shift_cashier_id,
            "created_at": {"$gte": shift_start},
            "status": base_status_filter
        }
        if tenant_id:
            fallback_query["tenant_id"] = tenant_id
        if shift.get("branch_id"):
            fallback_query["branch_id"] = shift["branch_id"]
        orders = await db.orders.find(fallback_query).to_list(1000)
    
    cancelled_shift = {"shift_id": shift_id, "status": OrderStatus.CANCELLED}
    if tenant_id:
        cancelled_shift["tenant_id"] = tenant_id
    cancelled_orders = await db.orders.find(cancelled_shift).to_list(1000)
    
    cancelled_unlinked_query = {
        "created_at": {"$gte": shift_start},
        "status": OrderStatus.CANCELLED,
        "$or": [{"shift_id": {"$exists": False}}, {"shift_id": None}, {"shift_id": ""}]
    }
    if tenant_id:
        cancelled_unlinked_query["tenant_id"] = tenant_id
    if shift.get("branch_id"):
        cancelled_unlinked_query["branch_id"] = shift["branch_id"]
    cancelled_unlinked = await db.orders.find(cancelled_unlinked_query).to_list(1000)
    
    seen_cancelled = set(o.get("id") for o in cancelled_orders if o.get("id"))
    for o in cancelled_unlinked:
        if o.get("id") and o["id"] not in seen_cancelled:
            cancelled_orders.append(o)
            seen_cancelled.add(o["id"])
    
    # جلب المرتجعات بشكل منفصل
    refunded_shift = {"shift_id": shift_id, "status": "refunded"}
    if tenant_id:
        refunded_shift["tenant_id"] = tenant_id
    refunded_orders = await db.orders.find(refunded_shift).to_list(1000)
    
    refunded_unlinked_query = {
        "created_at": {"$gte": shift_start},
        "status": "refunded",
        "$or": [{"shift_id": {"$exists": False}}, {"shift_id": None}, {"shift_id": ""}]
    }
    if tenant_id:
        refunded_unlinked_query["tenant_id"] = tenant_id
    if shift.get("branch_id"):
        refunded_unlinked_query["branch_id"] = shift["branch_id"]
    refunded_unlinked = await db.orders.find(refunded_unlinked_query).to_list(1000)
    
    seen_refunded = set(o.get("id") for o in refunded_orders if o.get("id"))
    for o in refunded_unlinked:
        if o.get("id") and o["id"] not in seen_refunded:
            refunded_orders.append(o)
            seen_refunded.add(o["id"])
    
    total_refunds = sum(_safe_num(o.get("total")) for o in refunded_orders)
    refund_count = len(refunded_orders)

    
    total_sales = sum(_safe_num(o.get("total")) for o in orders)
    total_cost = sum(_safe_num(o.get("total_cost")) for o in orders)
    gross_profit = total_sales - total_cost
    cash_sales = sum(_safe_num(o.get("total")) for o in orders if o.get("payment_method") == PaymentMethod.CASH)
    card_sales = sum(_safe_num(o.get("total")) for o in orders if o.get("payment_method") == PaymentMethod.CARD)
    credit_sales = sum(_safe_num(o.get("total")) for o in orders if o.get("payment_method") == PaymentMethod.CREDIT and not o.get("delivery_app") and not o.get("is_delivery_company"))
    
    delivery_app_sales = {}
    for o in orders:
        if o.get("delivery_app") or o.get("delivery_app_name"):
            app_name = o.get("delivery_app_name") or o.get("delivery_app", "توصيل")
            if app_name not in delivery_app_sales:
                delivery_app_sales[app_name] = 0
            delivery_app_sales[app_name] += _safe_num(o.get("total"))
    
    driver_sales = sum(_safe_num(o.get("total")) for o in orders if o.get("order_type") == OrderType.DELIVERY and o.get("driver_id"))
    discounts_total = sum(_safe_num(o.get("discount")) for o in orders)
    
    cancelled_by = {}
    cancelled_amount = 0
    for o in cancelled_orders:
        cancelled_amount += _safe_num(o.get("total"))
        cancelled_by_id = o.get("cancelled_by", o.get("cashier_id"))
        if cancelled_by_id and cancelled_by_id not in cancelled_by:
            user = await db.users.find_one({"id": cancelled_by_id}, {"_id": 0, "full_name": 1})
            cancelled_by[cancelled_by_id] = {
                "user_id": cancelled_by_id,
                "user_name": user.get("full_name", "غير معروف") if user else "غير معروف",
                "count": 0,
                "total": 0
            }
        if cancelled_by_id and cancelled_by_id in cancelled_by:
            cancelled_by[cancelled_by_id]["count"] += 1
            cancelled_by[cancelled_by_id]["total"] += _safe_num(o.get("total"))
    
    expenses = await db.expenses.find({
        "branch_id": shift.get("branch_id"),
        "category": {"$ne": "refund"},
        "created_at": {"$gte": shift.get("started_at", shift.get("opened_at", ""))},
        **({"tenant_id": tenant_id} if tenant_id else {})
    }, {"_id": 0}).to_list(100)
    total_expenses = sum(_safe_num(e.get("amount")) for e in expenses)
    
    net_profit = gross_profit - total_expenses
    opening_cash = _safe_num(shift.get("opening_cash", shift.get("opening_balance", 0)))
    expected_cash = opening_cash + cash_sales - total_expenses
    cash_difference = closing_cash - expected_cash
    
    update_data = {
        "closing_cash": closing_cash,
        "expected_cash": expected_cash,
        "cash_difference": cash_difference,
        "total_sales": total_sales,
        "total_cost": total_cost,
        "gross_profit": gross_profit,
        "total_orders": len(orders),
        "cash_sales": cash_sales,
        "card_sales": card_sales,
        "credit_sales": credit_sales,
        "delivery_app_sales": delivery_app_sales,
        "driver_sales": driver_sales,
        "discounts_total": discounts_total,
        "cancelled_orders": len(cancelled_orders),
        "cancelled_amount": cancelled_amount,
        "cancelled_by": list(cancelled_by.values()),
        "total_refunds": total_refunds,
        "refund_count": refund_count,
        "total_expenses": total_expenses,
        "net_profit": net_profit,
        "ended_at": datetime.now(timezone.utc).isoformat(),
        "status": "closed",
        "notes": close_data.notes,
        "denominations": close_data.denominations
    }
    
    await db.shifts.update_one({"id": shift_id}, {"$set": update_data})
    
    updated_shift = await db.shifts.find_one({"id": shift_id}, {"_id": 0})
    updated_shift["branch_name"] = branch["name"] if branch else ""
    
    return updated_shift

@router.get("/shifts/active-shift-details")
async def get_active_shift_details(shift_id: Optional[str] = None, cashier_id: Optional[str] = None, current_user: dict = Depends(get_current_user)):
    """جلب تفاصيل وردية (نشطة أو محددة) مع حساب المبيعات والمصاريف الفعلية"""
    db = get_database()
    tenant_id = get_user_tenant_id(current_user)
    
    # البحث عن الوردية
    if shift_id:
        shift_query = {"id": shift_id}
    elif cashier_id:
        shift_query = {"cashier_id": cashier_id, "status": "open"}
    else:
        shift_query = {"cashier_id": current_user["id"], "status": "open"}
    
    if tenant_id:
        shift_query["tenant_id"] = tenant_id
    
    shift = await db.shifts.find_one(shift_query, {"_id": 0})
    
    if not shift:
        return None
    
    shift_start = shift.get("started_at") or shift.get("opened_at") or ""
    shift_cashier_id = shift.get("cashier_id") or current_user.get("id")
    
    # جلب الطلبات للوردية
    order_query = {"shift_id": shift["id"], "status": {"$nin": [OrderStatus.CANCELLED, "cancelled", "canceled", "deleted"]}}
    if tenant_id:
        order_query["tenant_id"] = tenant_id
    
    orders = await db.orders.find(order_query).to_list(1000)
    
    if not orders:
        fallback_query = {
            "cashier_id": shift_cashier_id,
            "created_at": {"$gte": shift_start},
            "status": {"$nin": [OrderStatus.CANCELLED, "cancelled", "canceled", "deleted"]}
        }
        if tenant_id:
            fallback_query["tenant_id"] = tenant_id
        if shift.get("branch_id"):
            fallback_query["branch_id"] = shift["branch_id"]
        orders = await db.orders.find(fallback_query).to_list(1000)
    
    # حساب المبيعات
    total_sales = sum(_safe_num(o.get("total")) for o in orders)
    cash_sales = sum(_safe_num(o.get("total")) for o in orders if o.get("payment_method") == PaymentMethod.CASH and not o.get("delivery_app"))
    card_sales = sum(_safe_num(o.get("total")) for o in orders if o.get("payment_method") == PaymentMethod.CARD)
    # الآجل = فقط الطلبات الغير توصيل
    credit_sales = sum(_safe_num(o.get("total")) for o in orders if o.get("payment_method") == PaymentMethod.CREDIT and not o.get("delivery_app") and o.get("order_type") != "delivery")
    
    # شركات التوصيل
    delivery_app_sales = {}
    for o in orders:
        app_name = o.get("delivery_app_name") or o.get("delivery_app")
        if app_name:
            if app_name not in delivery_app_sales:
                delivery_app_sales[app_name] = 0
            delivery_app_sales[app_name] += _safe_num(o.get("total"))
    
    # جلب المصاريف (بدون المرتجعات)
    expenses_query = {
        "created_by": shift_cashier_id,
        "category": {"$ne": "refund"},
        "created_at": {"$gte": shift_start}
    }
    if tenant_id:
        expenses_query["tenant_id"] = tenant_id
    if shift.get("branch_id"):
        expenses_query["branch_id"] = shift["branch_id"]
    
    expenses = await db.expenses.find(expenses_query, {"_id": 0}).to_list(100)
    total_expenses = sum(_safe_num(e.get("amount")) for e in expenses)
    
    # جلب المرتجعات
    refund_query = {"cashier_id": shift_cashier_id, "created_at": {"$gte": shift_start}}
    if tenant_id:
        refund_query["tenant_id"] = tenant_id
    refund_orders = await db.orders.find({
        **{"status": "refunded"},
        "cashier_id": shift_cashier_id,
        "created_at": {"$gte": shift_start},
        **({"tenant_id": tenant_id} if tenant_id else {})
    }).to_list(100)
    total_refunds = sum(_safe_num(r.get("total")) for r in refund_orders)
    
    # جلب الإلغاءات
    cancelled_orders = await db.orders.find({
        "status": {"$in": ["cancelled", "canceled", "deleted"]},
        "cashier_id": shift_cashier_id,
        "created_at": {"$gte": shift_start},
        **({"tenant_id": tenant_id} if tenant_id else {})
    }).to_list(100)
    total_cancellations = sum(_safe_num(c.get("total")) for c in cancelled_orders)
    
    opening_cash = _safe_num(shift.get("opening_cash", shift.get("opening_balance", 0)))
    expected_cash = opening_cash + cash_sales - total_expenses
    
    shift["total_sales"] = total_sales
    shift["total_orders"] = len(orders)
    shift["cash_sales"] = cash_sales
    shift["card_sales"] = card_sales
    shift["credit_sales"] = credit_sales
    shift["delivery_app_sales"] = delivery_app_sales
    shift["total_expenses"] = total_expenses
    shift["total_refunds"] = total_refunds
    shift["refund_count"] = len(refund_orders)
    shift["total_cancellations"] = total_cancellations
    shift["cancelled_orders"] = len(cancelled_orders)
    shift["expected_cash"] = expected_cash
    shift["opening_cash"] = opening_cash
    
    return shift
