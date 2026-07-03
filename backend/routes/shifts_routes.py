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

# الأدوار التي لا تتعامل مع نقد المبيعات — رؤساء أقسام لا يجوز فتح وردية كاشير لهم
# (أمين مخزن، تصنيع/مطبخ، مشتريات، كول سنتر، محاسب). يمنع ظهور فروقات نقد وهمية في تقرير الورديات.
NON_CASHIER_ROLES = {
    "warehouse_keeper", "manufacturer", "purchasing",
    "call_center", "kitchen", "chef", "accountant",
}

# الكابتن يعمل تحت وردية الكاشير المرتبط به ولا يفتح وردية منفصلة
CAPTAIN_ROLES = {"captain"}

# الأدوار التي لا تظهر ورديتها في تقرير إغلاق الصندوق (تُعرض ورديات الكاشير حصراً)
NON_CASHIER_SHIFT_ROLES = NON_CASHIER_ROLES | CAPTAIN_ROLES

def _can_open_shift(role: str) -> bool:
    """يُسمح بفتح وردية للأدوار التي تتعامل مع نقد المبيعات فقط (كاشير/مشرف...).
    رؤساء الأقسام (مخزن/تصنيع/مطبخ/مشتريات) والكابتن مستثنون."""
    r = (role or "").strip().lower()
    return r not in NON_CASHIER_ROLES and r not in CAPTAIN_ROLES

def _shift_open_block_reason(role: str):
    """سبب منع فتح وردية (أو None إن كان مسموحاً). الكابتن يعمل تحت وردية الكاشير."""
    r = (role or "").strip().lower()
    if r in CAPTAIN_ROLES:
        return "الكابتن يعمل تحت وردية الكاشير المرتبط به — لا تُفتح له وردية منفصلة"
    if r in NON_CASHIER_ROLES:
        return "هذا الحساب رئيس قسم ولا يتعامل مع نقد المبيعات — لا تُفتح له وردية"
    return None

def _norm_name(n: str) -> str:
    """توحيد اسم الكاشير للمقارنة (إزالة الفراغات الزائدة + توحيد الحالة)."""
    return " ".join((n or "").strip().split()).lower()

def _conflict_msg(other: dict) -> str:
    return (
        f"يوجد وردية مفتوحة بالفعل في هذا الفرع باسم «{other.get('cashier_name') or ''}» — "
        "يجب إغلاق صندوقها أولاً قبل فتح وردية جديدة."
    )

async def _open_shift_conflict(db, tenant_id, branch_id, cashier_id, cashier_name):
    """يمنع ازدواج الورديات: لا تُفتح وردية جديدة إذا وُجدت وردية مفتوحة بنفس الاسم.
    آمن على العمل الجاري: لا يمسّ أي شفت/طلب/مبيعة قائمة — يتحقق فقط لحظة فتح شفت جديد.
    يُرجع (own, other):
      - own: وردية مفتوحة لنفس الكاشير (نفس المعرّف) — ليست تعارضاً، تُعاد كـ was_existing.
      - other: وردية مفتوحة بنفس الاسم لكن بمعرّف مختلف (السبب الجذري للازدواج) — تمنع الفتح.
    ملاحظة: لا نحظر حسب الفرع وحده حتى لا نعطّل الفروع التي تشغّل أكثر من كاشير باسم مختلف.
    """
    q = {"status": "open"}
    if tenant_id:
        q["tenant_id"] = tenant_id
    open_shifts = await db.shifts.find(
        q, {"_id": 0, "id": 1, "cashier_id": 1, "cashier_name": 1, "branch_id": 1, "started_at": 1}
    ).to_list(1000)
    own = None
    other = None
    nn = _norm_name(cashier_name)
    for s in open_shifts:
        if cashier_id and s.get("cashier_id") == cashier_id:
            own = own or s
            continue
        if nn and _norm_name(s.get("cashier_name")) == nn:
            other = other or s
    return own, other

async def _get_pending_captain_cash(db, shift_id, tenant_id):
    """يُرجع تجميع نقد الكباتن غير المُسلَّم (held) لوردية معيّنة: قائمة لكل كابتن + الإجمالي."""
    q = {"shift_id": shift_id, "captain_id": {"$ne": None}, "captain_cash_status": "held"}
    if tenant_id:
        q["tenant_id"] = tenant_id
    held = await db.orders.find(
        q, {"_id": 0, "captain_id": 1, "captain_name": 1, "total": 1}).to_list(5000)
    by_cap = {}
    for o in held:
        cid = o.get("captain_id")
        if cid not in by_cap:
            by_cap[cid] = {"captain_id": cid, "captain_name": o.get("captain_name"), "amount": 0.0, "count": 0}
        by_cap[cid]["amount"] += float(o.get("total") or 0)
        by_cap[cid]["count"] += 1
    return list(by_cap.values()), sum(c["amount"] for c in by_cap.values())

async def _ensure_captains_settled(db, shift_id, tenant_id):
    """يمنع إغلاق وردية الكاشير إذا بقي نقد كابتن غير مُسلَّم (HTTP 409)."""
    captains, total = await _get_pending_captain_cash(db, shift_id, tenant_id)
    if captains:
        raise HTTPException(status_code=409, detail={
            "code": "CAPTAIN_CASH_PENDING",
            "message": "لا يمكن إغلاق الوردية — يوجد كباتن لم يسلّموا نقدهم بعد. حصّل المبالغ أولاً من قسم إدارة الطلبات والكابتن.",
            "captains": captains,
            "total_pending": total,
        })


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
    force_close_without_count: Optional[bool] = False  # تجاوز فحص الجرد (للمالك/المدير)

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
    # استلام نقد الشفت (إيداع تلقائي في الخزينة)
    received_at: Optional[str] = None
    received_by: Optional[str] = None
    received_amount: Optional[float] = None
    received_external_expenses: Optional[float] = None
    received_net_deposit: Optional[float] = None

# ==================== SHIFT CRUD ====================
@router.post("/shifts", response_model=ShiftResponse)
async def open_shift(shift: ShiftCreate, current_user: dict = Depends(get_current_user)):
    """فتح وردية جديدة"""
    db = get_database()
    tenant_id = get_user_tenant_id(current_user)
    cashier = await db.users.find_one({"id": shift.cashier_id}, {"_id": 0, "password": 0})
    if not cashier:
        raise HTTPException(status_code=404, detail="الكاشير غير موجود")

    _block = _shift_open_block_reason(cashier.get("role", ""))
    if _block:
        raise HTTPException(status_code=400, detail=_block)

    # 🚫 منع ازدواج الورديات: وردية واحدة مفتوحة لكل فرع/كاشير (يمنع مضاعفة المبيعات في التقارير)
    own, other = await _open_shift_conflict(db, tenant_id, shift.branch_id, shift.cashier_id, cashier.get("full_name"))
    if own:
        raise HTTPException(status_code=400, detail="يوجد شفت مفتوح بالفعل لهذا الكاشير")
    if other:
        raise HTTPException(status_code=400, detail=_conflict_msg(other))
    
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
    if tenant_id:
        shift_doc["tenant_id"] = tenant_id
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

    # 🚫 رؤساء الأقسام والكابتن لا يفتح لهم وردية كاشير منفصلة
    _block = _shift_open_block_reason(current_user.get("role", ""))
    if _block:
        return {"shift": None, "was_existing": False, "blocked": True, "message": _block}
    
    branch_id = data.branch_id or current_user.get("branch_id")
    if not branch_id:
        branch_query = {"tenant_id": tenant_id} if tenant_id else {}
        branch = await db.branches.find_one(branch_query, {"_id": 0, "id": 1})
        branch_id = branch["id"] if branch else None
    
    # 🚫 منع ازدواج الورديات: لا تُفتح وردية بنفس اسم كاشير له وردية مفتوحة
    own, other = await _open_shift_conflict(db, tenant_id, branch_id, user_id, current_user.get("full_name") or current_user.get("username", ""))
    if own:
        return {"shift": own, "was_existing": True, "message": "وردية مفتوحة بالفعل"}
    if other:
        return {"shift": None, "was_existing": False, "blocked": True, "message": _conflict_msg(other)}
    
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
    
    cashier = await db.users.find_one({"id": data.cashier_id}, {"_id": 0, "password": 0})
    if not cashier:
        raise HTTPException(status_code=404, detail="الكاشير غير موجود")

    # 🚫 لا يمكن فتح وردية لرئيس قسم أو لكابتن
    _block = _shift_open_block_reason(cashier.get("role", ""))
    if _block:
        raise HTTPException(status_code=400, detail=_block)

    branch_id = data.branch_id or current_user.get("branch_id")
    if not branch_id:
        branch_query = {"tenant_id": tenant_id} if tenant_id else {}
        branch = await db.branches.find_one(branch_query, {"_id": 0, "id": 1})
        branch_id = branch["id"] if branch else None

    # 🚫 منع ازدواج الورديات: لا تُفتح وردية بنفس اسم كاشير له وردية مفتوحة
    own, other = await _open_shift_conflict(db, tenant_id, branch_id, data.cashier_id, cashier.get("full_name") or cashier.get("username", ""))
    if own:
        return {"shift": own, "was_existing": True, "message": "يوجد وردية مفتوحة بالفعل لهذا الكاشير"}
    if other:
        return {"shift": None, "was_existing": False, "blocked": True, "message": _conflict_msg(other)}
    
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
    # 🚫 رؤساء الأقسام والكابتن لا تُفتح لهم وردية تلقائياً
    _block = _shift_open_block_reason(user_role)
    if _block:
        return {"shift": None, "was_existing": False, "blocked": True, "message": _block}

    branch_id = current_user.get("branch_id")
    if not branch_id:
        branch_query = {"tenant_id": tenant_id} if tenant_id else {}
        branch = await db.branches.find_one(branch_query, {"_id": 0, "id": 1})
        branch_id = branch["id"] if branch else None

    # 🚫 منع ازدواج الورديات: لا تُفتح وردية بنفس اسم كاشير له وردية مفتوحة
    own, other = await _open_shift_conflict(db, tenant_id, branch_id, current_user["id"], current_user.get("full_name") or current_user.get("username", ""))
    if own:
        return {"shift": own, "was_existing": True, "message": "وردية مفتوحة بالفعل"}
    if other:
        return {"shift": None, "was_existing": False, "blocked": True, "message": _conflict_msg(other)}
    
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

# ==================== ربط الكابتن بوردية الكاشير ====================
class CaptainLinkPayload(BaseModel):
    captain_id: str

@router.get("/shifts/available-captains")
async def get_available_captains(branch_id: Optional[str] = None, current_user: dict = Depends(get_current_user)):
    """قائمة مستخدمي دور الكابتن (للكاشير/المدير لربطهم بالوردية) مع حالة الربط الحالية."""
    db = get_database()
    tenant_id = get_user_tenant_id(current_user)
    q = {"role": "captain", "is_active": {"$ne": False}}
    if tenant_id:
        q["tenant_id"] = tenant_id
    captains = await db.users.find(q, {"_id": 0, "password": 0}).to_list(200)
    target_branch = branch_id or current_user.get("branch_id")
    if target_branch:
        captains = [c for c in captains if not c.get("branch_id") or c.get("branch_id") == target_branch]
    links = await db.captain_shift_links.find(
        {"active": True, **({"tenant_id": tenant_id} if tenant_id else {})}, {"_id": 0}
    ).to_list(500)
    linked_map = {lk["captain_id"]: lk for lk in links}
    for c in captains:
        link = linked_map.get(c["id"])
        c["linked_shift_id"] = link.get("shift_id") if link else None
        c["linked_cashier_name"] = link.get("cashier_name") if link else None
    return captains

@router.post("/shifts/{shift_id}/link-captain")
async def link_captain_to_shift(shift_id: str, payload: CaptainLinkPayload, current_user: dict = Depends(get_current_user)):
    """ربط كابتن بوردية كاشير مفتوحة — يقوم به الكاشير صاحب الوردية أو المدير."""
    db = get_database()
    tenant_id = get_user_tenant_id(current_user)
    shift = await db.shifts.find_one({"id": shift_id}, {"_id": 0})
    if not shift or shift.get("status") != "open":
        raise HTTPException(status_code=404, detail="الوردية غير موجودة أو مغلقة")
    role = current_user.get("role", "")
    is_manager = role in ["admin", "super_admin", "manager", "branch_manager", "owner"]
    if not is_manager and shift.get("cashier_id") != current_user["id"]:
        raise HTTPException(status_code=403, detail="يمكن فقط لصاحب الوردية أو المدير ربط كابتن")
    captain = await db.users.find_one({"id": payload.captain_id}, {"_id": 0, "password": 0})
    if not captain:
        raise HTTPException(status_code=404, detail="الكابتن غير موجود")
    if (captain.get("role") or "").strip().lower() != "captain":
        raise HTTPException(status_code=400, detail="هذا المستخدم ليس كابتن")
    captain_name = captain.get("full_name") or captain.get("username", "")
    now = datetime.now(timezone.utc).isoformat()
    # إلغاء أي ربط سابق نشط لهذا الكابتن + إزالته من أي وردية أخرى
    await db.captain_shift_links.update_many(
        {"captain_id": payload.captain_id, "active": True, **({"tenant_id": tenant_id} if tenant_id else {})},
        {"$set": {"active": False, "unlinked_at": now}})
    await db.shifts.update_many(
        {"id": {"$ne": shift_id}}, {"$pull": {"linked_captains": {"captain_id": payload.captain_id}}})
    link_doc = {
        "id": str(uuid.uuid4()), "captain_id": payload.captain_id, "captain_name": captain_name,
        "shift_id": shift_id, "cashier_id": shift.get("cashier_id"), "cashier_name": shift.get("cashier_name"),
        "branch_id": shift.get("branch_id"), "active": True, "linked_at": now, "linked_by": current_user["id"],
    }
    if tenant_id:
        link_doc["tenant_id"] = tenant_id
    await db.captain_shift_links.insert_one(link_doc)
    await db.shifts.update_one({"id": shift_id}, {"$pull": {"linked_captains": {"captain_id": payload.captain_id}}})
    await db.shifts.update_one(
        {"id": shift_id},
        {"$push": {"linked_captains": {"captain_id": payload.captain_id, "captain_name": captain_name, "linked_at": now}}})
    return {"success": True, "message": f"تم ربط الكابتن {captain_name} بالوردية",
            "captain_id": payload.captain_id, "captain_name": captain_name}

@router.post("/shifts/{shift_id}/unlink-captain")
async def unlink_captain_from_shift(shift_id: str, payload: CaptainLinkPayload, current_user: dict = Depends(get_current_user)):
    """فصل كابتن عن وردية كاشير."""
    db = get_database()
    shift = await db.shifts.find_one({"id": shift_id}, {"_id": 0})
    if not shift:
        raise HTTPException(status_code=404, detail="الوردية غير موجودة")
    role = current_user.get("role", "")
    is_manager = role in ["admin", "super_admin", "manager", "branch_manager", "owner"]
    if not is_manager and shift.get("cashier_id") != current_user["id"]:
        raise HTTPException(status_code=403, detail="غير مصرح")
    now = datetime.now(timezone.utc).isoformat()
    await db.captain_shift_links.update_many(
        {"captain_id": payload.captain_id, "shift_id": shift_id, "active": True},
        {"$set": {"active": False, "unlinked_at": now}})
    await db.shifts.update_one(
        {"id": shift_id}, {"$pull": {"linked_captains": {"captain_id": payload.captain_id}}})
    return {"success": True, "message": "تم فصل الكابتن عن الوردية"}

@router.get("/captain/my-shift")
async def get_my_captain_shift(current_user: dict = Depends(get_current_user)):
    """للكابتن: جلب وردية الكاشير المرتبط بها حالياً (لإنشاء الطلبات عليها)."""
    db = get_database()
    tenant_id = get_user_tenant_id(current_user)
    link = await db.captain_shift_links.find_one(
        {"captain_id": current_user["id"], "active": True, **({"tenant_id": tenant_id} if tenant_id else {})},
        {"_id": 0})
    if not link:
        return {"linked": False, "shift": None, "message": "لم يربطك أي كاشير بورديته بعد"}
    shift = await db.shifts.find_one({"id": link["shift_id"]}, {"_id": 0})
    if not shift or shift.get("status") != "open":
        await db.captain_shift_links.update_one({"id": link["id"]}, {"$set": {"active": False}})
        return {"linked": False, "shift": None, "message": "وردية الكاشير المرتبط أُغلقت"}
    return {"linked": True, "shift": shift, "cashier_name": shift.get("cashier_name"),
            "cashier_id": shift.get("cashier_id")}

# ==================== إدارة الطلبات والكابتن (التحصيل) ====================
class CaptainCollectPayload(BaseModel):
    shift_id: str
    captain_id: str

@router.get("/captains/shift-summary")
async def get_captains_shift_summary(shift_id: Optional[str] = None, branch_id: Optional[str] = None,
                                     current_user: dict = Depends(get_current_user)):
    """ملخص الكباتن لوردية مفتوحة: لكل كابتن كم باع / كم سلّم (مُحصّل) / كم متبقٍ معه (نقد غير مُسلَّم)."""
    db = get_database()
    tenant_id = get_user_tenant_id(current_user)
    # حلّ الوردية: المُمرَّرة، أو وردية الكاشير الحالي، أو أحدث وردية مفتوحة في الفرع
    if not shift_id:
        sq = {"status": "open"}
        if tenant_id:
            sq["tenant_id"] = tenant_id
        role = current_user.get("role", "")
        if role not in ["admin", "super_admin", "manager", "branch_manager", "owner"]:
            sq["cashier_id"] = current_user["id"]
        elif branch_id:
            sq["branch_id"] = branch_id
        sh = await db.shifts.find_one(sq, {"_id": 0, "id": 1}, sort=[("started_at", -1)])
        shift_id = sh["id"] if sh else None
    if not shift_id:
        return {"shift_id": None, "captains": [], "totals": {"sold": 0, "handed": 0, "pending": 0}}

    q = {"shift_id": shift_id, "captain_id": {"$ne": None},
         "status": {"$nin": ["cancelled", "canceled", "deleted", "refunded"]}}
    if tenant_id:
        q["tenant_id"] = tenant_id
    orders = await db.orders.find(
        q, {"_id": 0, "captain_id": 1, "captain_name": 1, "total": 1, "payment_method": 1,
            "captain_cash_status": 1, "order_number": 1, "order_type": 1, "created_at": 1}).to_list(10000)

    by_cap = {}
    for o in orders:
        cid = o.get("captain_id")
        if cid not in by_cap:
            by_cap[cid] = {"captain_id": cid, "captain_name": o.get("captain_name"),
                           "sold": 0.0, "handed": 0.0, "pending": 0.0,
                           "orders_count": 0, "pending_count": 0, "orders": []}
        c = by_cap[cid]
        amt = float(o.get("total") or 0)
        c["sold"] += amt
        c["orders_count"] += 1
        is_cash = o.get("payment_method") == "cash"
        if is_cash and o.get("captain_cash_status") == "held":
            c["pending"] += amt
            c["pending_count"] += 1
        elif is_cash and o.get("captain_cash_status") == "collected":
            c["handed"] += amt
        c["orders"].append({
            "order_number": o.get("order_number"), "order_type": o.get("order_type"),
            "total": amt, "payment_method": o.get("payment_method"),
            "captain_cash_status": o.get("captain_cash_status"), "created_at": o.get("created_at")})
    captains = list(by_cap.values())
    totals = {
        "sold": sum(c["sold"] for c in captains),
        "handed": sum(c["handed"] for c in captains),
        "pending": sum(c["pending"] for c in captains),
    }
    return {"shift_id": shift_id, "captains": captains, "totals": totals}

@router.post("/captains/collect")
async def collect_captain_cash(payload: CaptainCollectPayload, current_user: dict = Depends(get_current_user)):
    """الكاشير يؤكّد استلام نقد الكابتن → تُعلَّم طلباته النقدية 'مُحصّلة' (تدخل ضمن درج الكاشير عند الإغلاق)."""
    db = get_database()
    tenant_id = get_user_tenant_id(current_user)
    shift = await db.shifts.find_one({"id": payload.shift_id}, {"_id": 0})
    if not shift or shift.get("status") != "open":
        raise HTTPException(status_code=404, detail="الوردية غير موجودة أو مغلقة")
    role = current_user.get("role", "")
    is_manager = role in ["admin", "super_admin", "manager", "branch_manager", "owner"]
    if not is_manager and shift.get("cashier_id") != current_user["id"]:
        raise HTTPException(status_code=403, detail="فقط كاشير الوردية أو المدير يؤكّد الاستلام")
    q = {"shift_id": payload.shift_id, "captain_id": payload.captain_id,
         "payment_method": "cash", "captain_cash_status": "held"}
    if tenant_id:
        q["tenant_id"] = tenant_id
    held = await db.orders.find(q, {"_id": 0, "total": 1}).to_list(5000)
    collected_amount = sum(float(o.get("total") or 0) for o in held)
    now = datetime.now(timezone.utc).isoformat()
    res = await db.orders.update_many(q, {"$set": {
        "captain_cash_status": "collected",
        "captain_cash_collected_by": current_user["id"],
        "captain_cash_collected_by_name": current_user.get("full_name") or current_user.get("username", ""),
        "captain_cash_collected_at": now,
    }})
    return {"success": True, "collected_orders": res.modified_count, "collected_amount": collected_amount,
            "message": f"تم تأكيد استلام {collected_amount:,.0f} د.ع من الكابتن ({res.modified_count} طلب)"}

@router.post("/shifts/cleanup-non-cashier")
async def cleanup_non_cashier_shifts(current_user: dict = Depends(get_current_user)):
    """حذف الورديات التي فُتحت خطأً لرؤساء الأقسام (مخزن/تصنيع/مطبخ/مشتريات) — للمالك/المدير فقط.
    تُزيل الفروقات النقدية الوهمية من تقرير الورديات."""
    db = get_database()
    tenant_id = get_user_tenant_id(current_user)
    if current_user.get("role", "") not in ["admin", "super_admin", "manager", "branch_manager", "owner"]:
        raise HTTPException(status_code=403, detail="غير مصرح")

    user_query = {"role": {"$in": list(NON_CASHIER_ROLES)}}
    if tenant_id:
        user_query["tenant_id"] = tenant_id
    non_cashier_users = await db.users.find(user_query, {"_id": 0, "id": 1, "full_name": 1, "role": 1}).to_list(1000)
    non_cashier_ids = [u["id"] for u in non_cashier_users]

    if not non_cashier_ids:
        return {"deleted": 0, "users": [], "message": "لا توجد ورديات لرؤساء أقسام"}

    del_query = {"cashier_id": {"$in": non_cashier_ids}}
    if tenant_id:
        del_query["tenant_id"] = tenant_id
    # عيّنة قبل الحذف لإظهارها في الرد
    affected = await db.shifts.find(del_query, {"_id": 0, "cashier_name": 1, "role": 1}).to_list(1000)
    result = await db.shifts.delete_many(del_query)
    # ⭐ حذف سجلات الإغلاق (cash_register_closings) لرؤساء الأقسام أيضاً —
    # لأن بطاقات تقرير الإغلاق تُقرأ من هذه المجموعة وليست من shifts،
    # فبقاؤها يُبقي فروقات الزيادة/النقص الوهمية ويُفسد الإجمالي.
    closings_result = await db.cash_register_closings.delete_many(del_query)
    return {
        "deleted": result.deleted_count,
        "deleted_closings": closings_result.deleted_count,
        "users": [{"name": u.get("full_name"), "role": u.get("role")} for u in non_cashier_users],
        "affected_shifts": len(affected),
        "message": f"تم حذف {result.deleted_count} وردية و{closings_result.deleted_count} سجل إغلاق فُتحت خطأً لرؤساء الأقسام"
    }


class ReceiveShiftCash(BaseModel):
    received_amount: Optional[float] = None  # المبلغ الفعلي المُستلم (افتراضياً النقد المعدود)
    external_expenses: float = 0.0  # مصاريف خارجية صُرفت بعد إغلاق الشفت
    external_expenses_note: Optional[str] = None
    received_by: Optional[str] = None

@router.post("/reports/cash-register-closing/{closing_id}/receive")
async def receive_shift_cash(closing_id: str, data: ReceiveShiftCash, current_user: dict = Depends(get_current_user)):
    """استلام نقد الشفت وإيداعه تلقائياً في خزينة المالك (إيداعات الفرع) بتاريخ الشفت الفعلي.
    المبلغ المُودَع = (النقد المُستلم − المصاريف الخارجية بعد الإغلاق). يُسمح بالاستلام مرة واحدة فقط.
    يقبل المعرّف سواء كان معرّف الوردية (shift_id) أو معرّف سجل الإغلاق."""
    db = get_database()
    tenant_id = get_user_tenant_id(current_user)
    if current_user.get("role", "") not in ["admin", "super_admin", "manager", "branch_manager", "owner"]:
        raise HTTPException(status_code=403, detail="غير مصرح")

    tq = {"tenant_id": tenant_id} if tenant_id else {}
    # المعرّف القادم من الواجهة غالباً معرّف الوردية (البطاقات تُبنى من shifts)
    shift = await db.shifts.find_one({"id": closing_id, **tq}, {"_id": 0})
    closing = await db.cash_register_closings.find_one(
        {"$or": [{"id": closing_id}, {"shift_id": closing_id}], **tq}, {"_id": 0})
    source = shift or closing
    if not source:
        raise HTTPException(status_code=404, detail="سجل الشفت غير موجود")
    if (shift and shift.get("received_at")) or (closing and closing.get("received_at")):
        raise HTTPException(status_code=400, detail="تم استلام هذا الشفت مسبقاً")

    counted = _safe_num(source.get("closing_cash") if source.get("closing_cash") is not None
                        else (source.get("counted_cash") if source.get("counted_cash") is not None else source.get("actual_cash")))
    received = _safe_num(data.received_amount) if data.received_amount is not None else counted
    ext = _safe_num(data.external_expenses)
    net_deposit = round(received - ext, 2)

    now = datetime.now(timezone.utc)
    deposit_date = source.get("business_date") or (source.get("closed_at") or source.get("ended_at") or now.isoformat())[:10]
    # تحديد الفرع بقوة (لمنع "غير محدد"): الشفت ← الإغلاق ← اسم الفرع المخزّن ← فرع الكاشير (id ثم الاسم)
    branch_id = (shift or {}).get("branch_id") or (closing or {}).get("branch_id")
    branch_name = source.get("branch_name") or ""
    cashier_id = source.get("cashier_id")
    cashier_name = source.get("cashier_name")
    if not branch_id and branch_name:
        _bn = await db.branches.find_one({"name": branch_name, **tq}, {"_id": 0, "id": 1})
        branch_id = (_bn or {}).get("id")
    if not branch_id and cashier_id:
        _u = await db.users.find_one({"id": cashier_id}, {"_id": 0, "branch_id": 1})
        branch_id = (_u or {}).get("branch_id")
        if not branch_id:
            _e = await db.employees.find_one({"id": cashier_id}, {"_id": 0, "branch_id": 1})
            branch_id = (_e or {}).get("branch_id")
    if not branch_id and cashier_name:
        _u = await db.users.find_one({"full_name": cashier_name, **tq}, {"_id": 0, "branch_id": 1})
        branch_id = (_u or {}).get("branch_id")
        if not branch_id:
            _e = await db.employees.find_one({"name": cashier_name, **tq}, {"_id": 0, "branch_id": 1})
            branch_id = (_e or {}).get("branch_id")
    if branch_id and not branch_name:
        _br = await db.branches.find_one({"id": branch_id}, {"_id": 0, "name": 1})
        branch_name = (_br or {}).get("name") or ""

    # 🚫 حارس صارم: لا يُسمح بأي إيداع نقدي لشفت بدون فرع محدد (id + اسم)
    # يمنع تجميع الإيداعات تحت "غير محدد" ويحافظ على دقة محاسبة خزينة المالك.
    if not branch_id or not branch_name:
        raise HTTPException(
            status_code=400,
            detail="تعذّر تحديد الفرع الخاص بهذا الشفت، لذا لا يمكن استلام النقد أو إيداعه. الرجاء ربط الكاشير/الشفت بفرع صحيح أولاً ثم إعادة المحاولة."
        )

    receiver = data.received_by or current_user.get("full_name") or current_user.get("username")

    deposit_id = None
    if net_deposit > 0:
        deposit_id = str(uuid.uuid4())
        await db.owner_deposits.insert_one({
            "id": deposit_id,
            "tenant_id": tenant_id,
            "amount": net_deposit,
            "date": deposit_date,
            "description": f"استلام نقد شفت — {source.get('cashier_name', '')}" + (f" | مصاريف خارجية: {ext:,.0f}" if ext else ""),
            "source": "shift_cash",
            "payment_method": "cash",
            "branch_id": branch_id,
            "branch_name": branch_name,
            "external_source": None,
            "ref_closing_id": closing_id,
            "created_by": receiver,
            "created_at": now.isoformat(),
        })

    received_fields = {
        "received_at": now.isoformat(),
        "received_by": receiver,
        "received_amount": received,
        "received_external_expenses": ext,
        "received_external_expenses_note": data.external_expenses_note,
        "received_net_deposit": net_deposit,
        "received_deposit_id": deposit_id,
    }
    if shift:
        await db.shifts.update_one({"id": shift["id"]}, {"$set": received_fields})
    if closing:
        await db.cash_register_closings.update_one({"id": closing["id"]}, {"$set": received_fields})

    return {
        "closing_id": closing_id,
        "received_amount": received,
        "external_expenses": ext,
        "net_deposit": net_deposit,
        "deposit_date": deposit_date,
        "branch_name": branch_name,
        "deposit_id": deposit_id,
        "message": f"تم استلام {received:,.0f} وإيداع {net_deposit:,.0f} في خزينة فرع {branch_name} بتاريخ {deposit_date}"
    }



@router.post("/shifts/{shift_id}/close")
async def close_shift(shift_id: str, close_data: ShiftClose, current_user: dict = Depends(get_current_user)):
    """إغلاق الوردية"""
    db = get_database()
    shift = await db.shifts.find_one({"id": shift_id}, {"_id": 0})
    if not shift:
        raise HTTPException(status_code=404, detail="الشفت غير موجود")
    if shift.get("status") == "closed":
        raise HTTPException(status_code=400, detail="الشفت مغلق بالفعل")
    
    # 🚫 منع الإغلاق إذا بقي نقد كابتن غير مُسلَّم
    await _ensure_captains_settled(db, shift_id, shift.get("tenant_id") or get_user_tenant_id(current_user))
    
    shift_start = shift.get("started_at") or shift.get("opened_at") or ""
    shift_cashier = shift.get("cashier_id") or ""
    shift_branch = shift.get("branch_id") or ""
    shift_tenant = shift.get("tenant_id") or get_user_tenant_id(current_user)
    shift_end_time = datetime.now(timezone.utc).isoformat()  # حد علوي = الآن
    
    # === جلب الطلبات: المصدر الموثوق هو shift_id (كل طلب يُحسب في وردية واحدة فقط) ===
    # هذا يضمن أن إجمالي الإغلاق = المبيعات الحقيقية، ويمنع ازدواج الحساب عند تداخل الورديات.
    # توافق خلفي: الطلبات القديمة بلا shift_id تُحسب بالفترة الزمنية + الكاشير كما السابق.
    orders_query = {
        "status": {"$nin": [OrderStatus.CANCELLED, "canceled", "deleted"]},
        "$or": [
            {"shift_id": shift_id},
            {
                "shift_id": {"$in": [None, ""]},
                "cashier_id": shift_cashier,
                "created_at": {"$gte": shift_start, "$lte": shift_end_time},
            },
        ],
    }
    if shift_tenant:
        orders_query["tenant_id"] = shift_tenant
    if shift_branch:
        orders_query["branch_id"] = shift_branch  # منع خلط فروع
    
    all_orders_raw = await db.orders.find(orders_query).to_list(5000)
    
    # فصل المرتجعات (لا تُحسب في المبيعات لكن نقدها يُخصم من expected_cash)
    orders = []
    refunded_orders = []
    for o in all_orders_raw:
        if o.get("status") == "refunded":
            refunded_orders.append(o)
        else:
            orders.append(o)
    
    total_sales = sum(_safe_num(o.get("total")) for o in orders)
    
    # حساب التكلفة بشكل دقيق: من items إذا total_cost ناقص أو null
    def _calc_order_cost(o):
        tc = o.get("total_cost")
        if tc is not None and _safe_num(tc) > 0:
            return _safe_num(tc)
        # احسب من items: cost × quantity
        items = o.get("items", []) or []
        return sum(_safe_num(it.get("cost", it.get("product_cost", 0))) * _safe_num(it.get("quantity", 1)) for it in items)
    
    total_cost = sum(_calc_order_cost(o) for o in orders)
    gross_profit = total_sales - total_cost
    cash_sales = sum(_safe_num(o.get("total")) for o in orders if o.get("payment_method") == PaymentMethod.CASH)
    card_sales = sum(_safe_num(o.get("total")) for o in orders if o.get("payment_method") == PaymentMethod.CARD)
    credit_sales = sum(_safe_num(o.get("total")) for o in orders if o.get("payment_method") == PaymentMethod.CREDIT and not o.get("delivery_app") and not o.get("is_delivery_company"))
    
    # المرتجعات النقدية - تُخصم من expected_cash
    cash_refunds = sum(_safe_num(o.get("total")) for o in refunded_orders if o.get("payment_method") == PaymentMethod.CASH)
    
    delivery_app_sales = {}
    for o in orders:
        if o.get("delivery_app") or o.get("delivery_app_name"):
            app_name = o.get("delivery_app_name") or o.get("delivery_app", "توصيل")
            if app_name not in delivery_app_sales:
                delivery_app_sales[app_name] = 0
            delivery_app_sales[app_name] += _safe_num(o.get("total"))
    
    # === جلب المصروفات بفلاتر دقيقة ===
    expenses_query = {
        "branch_id": shift_branch,
        "category": {"$ne": "refund"},
        "created_at": {"$gte": shift_start, "$lte": shift_end_time}
    }
    if shift_tenant:
        expenses_query["tenant_id"] = shift_tenant
    # إضافة فلتر الكاشير إذا كان مسجلاً (يمنع double-count بين كاشيرين بنفس الفرع)
    expenses_query["$or"] = [
        {"cashier_id": shift_cashier},
        {"created_by": shift_cashier},
        {"cashier_id": {"$exists": False}, "created_by": {"$exists": False}}  # المصاريف القديمة بدون cashier
    ]
    
    expenses = await db.expenses.find(expenses_query, {"_id": 0}).to_list(500)
    total_expenses = sum(_safe_num(e.get("amount")) for e in expenses)
    
    # === جلب استخدامات الكوبونات في هذه الوردية ===
    coupon_usage_query = {
        "used_at": {"$gte": shift_start, "$lte": shift_end_time},
        "cashier_id": shift_cashier,
    }
    if shift_tenant:
        coupon_usage_query["tenant_id"] = shift_tenant
    if shift_branch:
        coupon_usage_query["branch_id"] = shift_branch
    
    coupon_usages = await db.coupon_usage.find(coupon_usage_query, {"_id": 0}).to_list(500)
    # تجميع حسب الكوبون
    coupons_summary_map = {}
    for cu in coupon_usages:
        cid = cu.get("coupon_id") or "_unknown"
        if cid not in coupons_summary_map:
            coupons_summary_map[cid] = {
                "coupon_id": cid,
                "coupon_name": cu.get("coupon_name", ""),
                "coupon_code": cu.get("coupon_code", ""),
                "used_count": 0,
                "total_discount": 0.0,
                "cashier_name": cu.get("cashier_name", ""),
                "customers": [],
            }
        coupons_summary_map[cid]["used_count"] += 1
        coupons_summary_map[cid]["total_discount"] += _safe_num(cu.get("discount_amount", 0))
        cust = cu.get("customer_name") or ""
        if cust and cust not in coupons_summary_map[cid]["customers"]:
            coupons_summary_map[cid]["customers"].append(cust)
    coupons_summary = list(coupons_summary_map.values())
    total_coupon_discount = sum(c["total_discount"] for c in coupons_summary)
    
    net_profit = gross_profit - total_expenses
    opening_cash = _safe_num(shift.get("opening_cash", shift.get("opening_balance", 0)))
    # ✅ خصم المرتجعات النقدية من expected_cash
    expected_cash = opening_cash + cash_sales - total_expenses - cash_refunds
    cash_difference = close_data.closing_cash - expected_cash
    
    update_data = {
        "closing_cash": close_data.closing_cash,
        "expected_cash": expected_cash,
        "cash_difference": cash_difference,
        "cash_refunds": cash_refunds,
        "total_sales": total_sales,
        "total_cost": total_cost,
        "gross_profit": gross_profit,
        "total_orders": len(orders),
        "cash_sales": cash_sales,
        "card_sales": card_sales,
        "credit_sales": credit_sales,
        "delivery_app_sales": delivery_app_sales,
        "total_expenses": total_expenses,
        "coupons_summary": coupons_summary,
        "total_coupon_discount": total_coupon_discount,
        "net_profit": net_profit,
        "ended_at": shift_end_time,
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
        "orders_count": len(orders),
        "coupons_summary": coupons_summary,
        "total_coupon_discount": total_coupon_discount,
    }
    await db.cash_register_closings.insert_one(closing_record)
    del closing_record["_id"]
    
    return updated_shift

async def _dedupe_closed_cashier_shifts(db, shifts):
    """يدمج الورديات المغلقة المكررة لنفس الكاشير/اليوم (باغ فتح شفتين متزامنين) مرتكزاً على مبيعات الطلبات الفعلية.
    منطقة محاسبية حساسة: يُبقي الصف المطابق للمبيعات الحقيقية ويستبعد المضخّم، ولا يدمج الورديات المتتابعة المشروعة
    (التي يساوي مجموعها المبيعات الحقيقية). لا يحذف من القاعدة — يصفّي الاستجابة فقط. النشطة تبقى كما هي.
    مطبَّق على استجابة /api (غير مخزَّنة في الـ Service Worker) فيعمل فوراً حتى مع واجهة قديمة في الكاش."""
    def _num(v):
        try:
            return float(v)
        except Exception:
            return 0.0
    def _day(s):
        bd = s.get("business_date")
        if bd:
            return str(bd)[:10]
        st = s.get("started_at") or s.get("opened_at") or ""
        return str(st)[:10]
    def _norm(n):
        return (n or "").strip().lower()

    STATUS_EXCLUDE = ["cancelled", "canceled", "refunded", "deleted", "void", "voided"]
    # نعالج كل الورديات (مفتوحة/مغلقة) كمرشحين للتكرار — الكاشير الواحد لا يملك ورديتين متزامنتين لنفس اليوم
    candidates = list(shifts or [])
    if len(candidates) < 2:
        return shifts

    groups = {}
    for s in candidates:
        key = (s.get("branch_id") or "", _norm(s.get("cashier_name")) or (s.get("cashier_id") or ""), _day(s))
        groups.setdefault(key, []).append(s)

    dup_groups = {k: g for k, g in groups.items() if len(g) >= 2}
    if not dup_groups:
        return shifts

    cashiers_per_bd = {}
    for (branch, cashier, day) in groups.keys():
        cashiers_per_bd[(branch, day)] = cashiers_per_bd.get((branch, day), 0) + 1

    branch_day_truth = {}
    cashier_day_truth = {}
    bd_pairs = {(k[0], k[2]) for k in dup_groups.keys()}
    for (branch, day) in bd_pairs:
        oq = {
            "branch_id": branch,
            "status": {"$nin": STATUS_EXCLUDE},
            "$or": [
                {"business_date": day},
                {"business_date": {"$in": [None, ""]}, "created_at": {"$regex": f"^{day}"}},
                {"business_date": {"$exists": False}, "created_at": {"$regex": f"^{day}"}},
            ],
        }
        total = 0.0
        per_cashier = {}
        async for o in db.orders.find(oq, {"_id": 0, "total": 1, "cashier_name": 1, "created_by_name": 1}):
            t = _num(o.get("total"))
            total += t
            for nm in {_norm(o.get("cashier_name")), _norm(o.get("created_by_name"))}:
                if nm:
                    per_cashier[nm] = per_cashier.get(nm, 0.0) + t
        branch_day_truth[(branch, day)] = total
        for nm, v in per_cashier.items():
            cashier_day_truth[(branch, nm, day)] = v

    kept_closed = []
    for key, group in groups.items():
        if len(group) < 2:
            kept_closed.extend(group)
            continue
        branch, cashier, day = key
        truth = None
        if cashiers_per_bd.get((branch, day), 0) == 1:
            truth = branch_day_truth.get((branch, day))
        if truth is None:
            truth = cashier_day_truth.get((branch, cashier, day))
        if truth is None:
            truth = branch_day_truth.get((branch, day))
        if not truth:  # لا مرجع موثوق (None أو 0) → أبقِ الكل (آمن، لا نخاطر بحذف مبيعات)
            kept_closed.extend(group)
            continue
        sum_sales = sum(_num(s.get("total_sales")) for s in group)
        tol = max(1.0, abs(truth) * 0.01)
        if abs(sum_sales - truth) <= tol:
            kept_closed.extend(group)  # ورديات منفصلة مشروعة (مجموعها = المبيعات الحقيقية)
            continue
        best = min(group, key=lambda s: abs(_num(s.get("total_sales")) - truth))
        kept_closed.append(best)

    result = kept_closed
    result.sort(key=lambda s: str(s.get("started_at") or s.get("opened_at") or ""), reverse=True)
    return result



@router.get("/shifts", response_model=List[ShiftResponse])
async def get_shifts(
    branch_id: Optional[str] = None,
    date: Optional[str] = None,
    status: Optional[str] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    cashiers_only: bool = False,
    current_user: dict = Depends(get_current_user)
):
    """جلب قائمة الورديات - يدعم الفلترة بالـ business_date (اليوم التشغيلي).
    cashiers_only=True يستبعد ورديات رؤساء الأقسام (مخزن/تصنيع/مطبخ/مشتريات) — تظهر ورديات الكاشير حصراً."""
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

    # ⭐ استبعاد ورديات رؤساء الأقسام (مخزن/تصنيع/مطبخ/مشتريات) — تظهر ورديات الكاشير حصراً.
    # نحدّد الدور من المستخدم الحالي (مصدر موثوق) ثم من حقل role المخزّن على الوردية كاحتياط.
    if cashiers_only and shifts:
        cashier_ids = list({s.get("cashier_id") for s in shifts if s.get("cashier_id")})
        role_by_id = {}
        if cashier_ids:
            users = await db.users.find(
                {"id": {"$in": cashier_ids}}, {"_id": 0, "id": 1, "role": 1}
            ).to_list(1000)
            role_by_id = {u["id"]: (u.get("role") or "").strip().lower() for u in users}

        def _is_non_cashier(s):
            r = role_by_id.get(s.get("cashier_id"))
            if r is None:
                r = (s.get("role") or "").strip().lower()
            return r in NON_CASHIER_SHIFT_ROLES

        shifts = [s for s in shifts if not _is_non_cashier(s)]

        # ⭐ دمج الورديات المغلقة المكررة تلقائياً على الخادم (يظهر فوراً حتى مع كاش واجهة قديم)
        try:
            shifts = await _dedupe_closed_cashier_shifts(db, shifts)
        except Exception as _e:
            logger.warning(f"[shifts dedupe] skipped due to error: {_e}")
    
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
async def _resolve_open_shift_for_close(db, shift_query, tenant_id):
    """يحل مشكلة تعدّد الورديات المفتوحة (باغ الفتح المزدوج) عند الإغلاق/الملخص.

    بدل اختيار وردية مفتوحة عشوائية (كان يُظهر مبيعات جزئية فقط)، نختار الوردية **الأقدم بدءاً**
    كمرساة ونجمع كل الورديات المفتوحة لنفس (الفرع + الكاشير + اليوم التشغيلي) — فتُحسب المبيعات
    من بداية أقدم وردية وتشمل طلبات كل تلك الورديات، فيطابق الإغلاق كامل مبيعات اليوم كما في التقرير.

    يُعيد: (anchor_shift, consolidated_ids, earliest_start). للحالة العادية (وردية واحدة) لا يتغيّر السلوك."""
    opens = await db.shifts.find(shift_query, {"_id": 0}).to_list(200)
    if not opens:
        return None, [], None

    def _st(s):
        return s.get("started_at") or s.get("opened_at") or ""

    def _day(s):
        bd = s.get("business_date")
        return str(bd)[:10] if bd else str(_st(s))[:10]

    def _norm(n):
        return (n or "").strip().lower()

    opens.sort(key=lambda s: str(_st(s)))
    anchor = opens[0]
    a_branch = anchor.get("branch_id")
    a_cashier = _norm(anchor.get("cashier_name")) or (anchor.get("cashier_id") or "")
    a_day = _day(anchor)

    group = [
        s for s in opens
        if s.get("branch_id") == a_branch
        and ((_norm(s.get("cashier_name")) or (s.get("cashier_id") or "")) == a_cashier)
        and _day(s) == a_day
    ]
    consolidated_ids = [s["id"] for s in group if s.get("id")]
    if anchor.get("id") and anchor["id"] not in consolidated_ids:
        consolidated_ids.append(anchor["id"])
    return anchor, consolidated_ids, _st(anchor)



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
    
    shift, consolidated_ids, earliest_start = await _resolve_open_shift_for_close(db, shift_query, tenant_id)
    
    # إذا لم توجد وردية مفتوحة
    if not shift:
        # المالك/المدير: لا نُنشئ وردية تلقائياً - يجب اختيار كاشير
        if is_manager:
            raise HTTPException(status_code=404, detail="لا توجد وردية مفتوحة - يرجى فتح وردية لكاشير من نقاط البيع")
        
        # الكاشير: نُنشئ وردية تلقائياً — لكن أولاً امنع الازدواج (وردية مفتوحة بنفس الاسم)
        _own, _other = await _open_shift_conflict(db, tenant_id, target_branch_id, current_user.get("id"), current_user.get("full_name", ""))
        if _own or _other:
            _existing_id = (_own or _other)["id"]
            shift = await db.shifts.find_one({"id": _existing_id}, {"_id": 0}) or (_own or _other)
        else:
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
    if not consolidated_ids:
        consolidated_ids = [shift_id]
    shift_start = earliest_start or shift.get("started_at") or shift.get("opened_at") or datetime.now(timezone.utc).isoformat()
    shift_cashier_id = shift.get("cashier_id") or current_user.get("id")
    
    # جلب جميع طلبات الوردية - بالـ shift_id + الطلبات بدون shift_id في نفس الفترة والفرع
    # هذا يضمن احتساب طلبات تطبيق الزبائن والطلبات غير المرتبطة بوردية
    base_status_filter = {"$nin": [OrderStatus.CANCELLED, "refunded"]}
    
    # 1. طلبات مرتبطة بأي من ورديات الكاشير المفتوحة (دمج الفتح المزدوج)
    shift_order_query = {"shift_id": {"$in": consolidated_ids}, "status": base_status_filter}
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
    cancelled_shift = {"shift_id": {"$in": consolidated_ids}, "status": OrderStatus.CANCELLED}
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
    refunded_shift_q = {"shift_id": {"$in": consolidated_ids}, "status": "refunded"}
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
        "refund_count": refund_count_val,
        "merged_shifts_count": max(0, len(consolidated_ids) - 1)
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
    
    shift, consolidated_ids, earliest_start = await _resolve_open_shift_for_close(db, shift_query, tenant_id)
    
    if not shift:
        raise HTTPException(status_code=404, detail="لا يوجد وردية مفتوحة")
    
    shift_id = shift["id"]
    if not consolidated_ids:
        consolidated_ids = [shift_id]
    shift_start = earliest_start or shift.get("started_at") or shift.get("opened_at") or datetime.now(timezone.utc).isoformat()
    shift_cashier_id = shift.get("cashier_id") or current_user.get("id")
    branch = await db.branches.find_one({"id": shift.get("branch_id", "")}, {"_id": 0, "name": 1})

    # 🚫 منع الإغلاق إذا بقي نقد كابتن غير مُسلَّم
    await _ensure_captains_settled(db, shift_id, tenant_id)
    
    # ====== فحص الجرد اليومي للفرع (لا يُسمح بالإغلاق قبل تسجيل الجرد إن كان هناك مخزون) ======
    # المالك/المدير يمكنه التجاوز عبر علم force_close_without_count
    bypass_count = bool(getattr(close_data, "force_close_without_count", False)) and is_manager
    if not bypass_count and target_branch_id:
        from datetime import datetime as _dt, timezone as _tz, timedelta as _td
        # ⭐ اليوم التشغيلي = business_date للوردية المفتوحة (يطابق الشفت الليلي حتى بعد منتصف الليل)
        biz_date = shift.get("business_date") or await resolve_business_date(tenant_id, target_branch_id)
        # هل في الفرع مخزون منتجات؟
        inv_q = {"branch_id": target_branch_id, "quantity": {"$gt": 0}}
        if tenant_id:
            inv_q["$or"] = [
                {"tenant_id": tenant_id},
                {"tenant_id": {"$exists": False}},
                {"tenant_id": None},
            ]
        has_inv = await db.branch_inventory.count_documents(inv_q, limit=1) > 0
        had_received = False
        if not has_inv:
            # نافذة ±يوم حول اليوم التشغيلي ثم مطابقة بتاريخ العراق (يدعم التسليم بعد منتصف الليل)
            _bd = _dt.fromisoformat(biz_date).date()
            s_iso = (_bd - _td(days=1)).isoformat() + "T00:00:00"
            e_iso = (_bd + _td(days=1)).isoformat() + "T23:59:59"
            bo_q = {
                "to_branch_id": target_branch_id,
                "status": "delivered",
                "delivered_at": {"$gte": s_iso, "$lte": e_iso},
            }
            if tenant_id:
                bo_q["tenant_id"] = tenant_id
            async for _bo in db.branch_orders_new.find(bo_q, {"_id": 0, "delivered_at": 1}):
                if iraq_date_from_utc(_bo.get("delivered_at")) == biz_date:
                    had_received = True
                    break
        
        if has_inv or had_received:
            count_q = {"branch_id": target_branch_id, "business_date": biz_date, "status": "submitted"}
            if tenant_id:
                count_q["tenant_id"] = tenant_id
            submitted = await db.branch_stock_counts.find_one(count_q, {"_id": 0, "id": 1})
            if not submitted:
                raise HTTPException(
                    status_code=409,
                    detail={
                        "code": "STOCK_COUNT_REQUIRED",
                        "message": "يجب إدخال الجرد اليومي للمنتجات قبل إغلاق الصندوق. اطلب من مسؤول المطبخ تسجيل الجرد.",
                        "branch_id": target_branch_id,
                        "business_date": biz_date,
                    },
                )
    
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
    
    shift_order_query = {"shift_id": {"$in": consolidated_ids}, "status": base_status_filter}
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
    
    cancelled_shift = {"shift_id": {"$in": consolidated_ids}, "status": OrderStatus.CANCELLED}
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
    refunded_shift = {"shift_id": {"$in": consolidated_ids}, "status": "refunded"}
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
    
    # دمج الورديات المفتوحة المكررة الأخرى لنفس الكاشير/اليوم (باغ الفتح المزدوج): تُغلق كـ"merged"
    # حتى لا تبقى مفتوحة ولا تُضاعف المبيعات — طلباتها محتسبة بالفعل في هذه الوردية.
    other_ids = [sid for sid in consolidated_ids if sid and sid != shift_id]
    if other_ids:
        await db.shifts.update_many(
            {"id": {"$in": other_ids}, "status": "open"},
            {"$set": {"status": "merged", "merged_into": shift_id, "ended_at": datetime.now(timezone.utc).isoformat()}}
        )
    
    updated_shift = await db.shifts.find_one({"id": shift_id}, {"_id": 0})
    updated_shift["branch_name"] = branch["name"] if branch else ""
    updated_shift["merged_shifts_count"] = len(other_ids)
    
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
