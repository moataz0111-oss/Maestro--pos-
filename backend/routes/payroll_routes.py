"""
Payroll Routes - إدارة الرواتب والخصومات والمكافآت
"""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict
from typing import Optional, List
from datetime import datetime, timezone, timedelta
import uuid
import logging
import calendar

from .shared import (
    get_database, get_current_user, get_user_tenant_id,
    build_tenant_query, UserRole, resolve_business_date
)

logger = logging.getLogger(__name__)
router = APIRouter(tags=["Payroll"])

# ==================== MODELS ====================
class DeductionCreate(BaseModel):
    employee_id: str
    deduction_type: str  # absence, late, advance, penalty, other
    amount: Optional[float] = None
    hours: Optional[float] = None
    days: Optional[float] = None
    reason: str
    date: str

class DeductionResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    employee_id: str
    employee_name: Optional[str] = None
    deduction_type: str
    amount: float
    hours: Optional[float] = None
    days: Optional[float] = None
    reason: str
    date: str
    created_by: str
    created_at: str

class BonusCreate(BaseModel):
    employee_id: str
    bonus_type: str  # performance, overtime, holiday, other
    amount: Optional[float] = None
    hours: Optional[float] = None
    reason: str
    date: str

class BonusResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    employee_id: str
    employee_name: Optional[str] = None
    bonus_type: str
    amount: float
    hours: Optional[float] = None
    reason: str
    date: str
    created_by: str
    created_at: str

class PayrollCreate(BaseModel):
    employee_id: str
    month: str
    basic_salary: float
    earned_salary: float = 0      # الراتب المستحق (pro-rata حسب أيام العمل) — لتطابق الكشف المطبوع مع الصافي
    worked_days: int = 0
    overtime_pay: float = 0
    total_deductions: float = 0
    total_bonuses: float = 0
    advance_deduction: float = 0
    net_salary: float
    notes: Optional[str] = None

class PayrollResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    employee_id: str
    employee_name: Optional[str] = None
    month: str
    basic_salary: float
    worked_days: int = 0
    absent_days: int = 0
    late_hours: float = 0
    overtime_hours: float = 0
    total_deductions: float
    total_bonuses: float
    advance_deduction: float
    net_salary: float
    status: str
    notes: Optional[str] = None
    created_by: str
    created_at: str

# ==================== DEDUCTIONS ====================
@router.post("/deductions", response_model=DeductionResponse)
async def create_deduction(deduction: DeductionCreate, current_user: dict = Depends(get_current_user)):
    """إنشاء خصم"""
    db = get_database()
    if current_user["role"] not in [UserRole.ADMIN, UserRole.MANAGER, UserRole.SUPERVISOR, UserRole.SUPER_ADMIN]:
        raise HTTPException(status_code=403, detail="غير مصرح")
    
    employee = await db.employees.find_one({"id": deduction.employee_id}, {"_id": 0})
    if not employee:
        raise HTTPException(status_code=404, detail="الموظف غير موجود")
    
    amount = deduction.amount or 0
    if not amount:
        hourly_rate = employee.get("salary", 0) / (30 * employee.get("work_hours_per_day", 8))
        daily_rate = employee.get("salary", 0) / 30
        
        if deduction.hours:
            amount = deduction.hours * hourly_rate
        elif deduction.days:
            amount = deduction.days * daily_rate
    
    deduction_tenant = get_user_tenant_id(current_user)
    deduction_biz_date = await resolve_business_date(deduction_tenant, employee.get("branch_id"))
    deduction_doc = {
        "id": str(uuid.uuid4()),
        **deduction.model_dump(),
        "employee_name": employee.get("name"),
        "amount": amount,
        "tenant_id": deduction_tenant,
        "business_date": deduction_biz_date,
        "created_by": current_user["id"],
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.deductions.insert_one(deduction_doc)
    del deduction_doc["_id"]
    return deduction_doc

@router.get("/deductions")
async def get_deductions(
    employee_id: Optional[str] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """جلب قائمة الخصومات"""
    db = get_database()
    query = build_tenant_query(current_user)
    if employee_id:
        query["employee_id"] = employee_id
    if start_date:
        query["date"] = {"$gte": start_date}
    if end_date:
        query.setdefault("date", {})["$lte"] = end_date
    
    deductions = await db.deductions.find(query, {"_id": 0}).sort("date", -1).to_list(500)
    
    # تحديث أسماء الموظفين من البيانات الحالية
    if deductions:
        emp_ids = list(set(d.get("employee_id") for d in deductions if d.get("employee_id")))
        if emp_ids:
            emps = await db.employees.find({"id": {"$in": emp_ids}}, {"_id": 0, "id": 1, "name": 1}).to_list(500)
            name_map = {e["id"]: e.get("name", "") for e in emps}
            for d in deductions:
                eid = d.get("employee_id")
                if eid and eid in name_map:
                    d["employee_name"] = name_map[eid]
    
    return deductions

@router.post("/deductions/cleanup-duplicates")
async def cleanup_duplicate_deductions(current_user: dict = Depends(get_current_user)):
    """تنظيف الخصومات التلقائية المكررة (نفس الموظف+اليوم+النوع) — يبقي الأقدم ويحذف الباقي.
    إصلاح بيانات قديمة نتجت قبل جعل مزامنة البصمة idempotent."""
    db = get_database()
    if current_user["role"] not in [UserRole.ADMIN, UserRole.MANAGER, UserRole.SUPER_ADMIN]:
        raise HTTPException(status_code=403, detail="غير مصرح")

    query = build_tenant_query(current_user)
    query["created_by"] = "system"
    deductions = await db.deductions.find(query).sort("created_at", 1).to_list(10000)

    seen = {}
    to_delete = []
    for d in deductions:
        key = (d.get("employee_id"), d.get("date"), d.get("deduction_type"))
        if key in seen:
            to_delete.append(d["id"])
        else:
            seen[key] = d["id"]

    removed = 0
    if to_delete:
        res = await db.deductions.delete_many({"id": {"$in": to_delete}})
        removed = res.deleted_count

    return {"removed": removed, "kept": len(seen), "message": f"تم حذف {removed} خصم مكرر"}


@router.get("/deductions/reset-eligibility")
async def check_deductions_reset_eligibility(current_user: dict = Depends(get_current_user)):
    """فحص إذا كان المالك يستطيع تصفير الخصومات الآن"""
    db = get_database()
    if current_user["role"] not in [UserRole.ADMIN, UserRole.SUPER_ADMIN]:
        raise HTTPException(status_code=403, detail="هذه العملية متاحة للمالك فقط")
    
    tenant_id = get_user_tenant_id(current_user)
    now = datetime.now(timezone.utc)
    today = now.date()
    
    # جلب آخر تصفير لهذا المستأجر
    last_reset = await db.deductions_resets.find_one(
        {"tenant_id": tenant_id},
        {"_id": 0},
        sort=[("created_at", -1)]
    )
    
    # الشرط 1: يجب أن يكون اليوم بعد الـ 15 من الشهر
    is_after_15th = today.day >= 15
    
    # الشرط 2: لم يتم التصفير في هذا الشهر من قبل
    can_reset_this_month = True
    last_reset_date = None
    if last_reset:
        try:
            last_dt = datetime.fromisoformat(last_reset["created_at"].replace("Z", "+00:00"))
            last_reset_date = last_dt.date()
            # إذا كان التصفير السابق في نفس السنة-الشهر، لا يمكن التصفير مرة أخرى
            if last_reset_date.year == today.year and last_reset_date.month == today.month:
                can_reset_this_month = False
        except Exception:
            pass
    
    can_reset = is_after_15th and can_reset_this_month
    
    # رسالة واضحة للمستخدم
    if not is_after_15th:
        reason = f"التصفير متاح فقط بعد الـ 15 من الشهر (اليوم: {today.day})"
    elif not can_reset_this_month:
        reason = f"تم التصفير في هذا الشهر بالفعل في {last_reset_date.isoformat() if last_reset_date else 'تاريخ سابق'}"
    else:
        reason = "يمكن التصفير الآن"
    
    return {
        "can_reset": can_reset,
        "is_after_15th": is_after_15th,
        "can_reset_this_month": can_reset_this_month,
        "reason": reason,
        "today": today.isoformat(),
        "last_reset_date": last_reset_date.isoformat() if last_reset_date else None
    }

@router.post("/deductions/reset")
async def reset_all_deductions(current_user: dict = Depends(get_current_user)):
    """تصفير (حذف نهائي) جميع الخصومات. للمالك فقط، مرة واحدة شهرياً بعد الـ 15"""
    db = get_database()
    if current_user["role"] not in [UserRole.ADMIN, UserRole.SUPER_ADMIN]:
        raise HTTPException(status_code=403, detail="هذه العملية متاحة للمالك فقط")
    
    tenant_id = get_user_tenant_id(current_user)
    now = datetime.now(timezone.utc)
    today = now.date()
    
    # تحقق من الشروط
    if today.day < 15:
        raise HTTPException(
            status_code=400,
            detail=f"التصفير متاح فقط بعد الـ 15 من الشهر. اليوم: {today.day}"
        )
    
    last_reset = await db.deductions_resets.find_one(
        {"tenant_id": tenant_id},
        {"_id": 0},
        sort=[("created_at", -1)]
    )
    if last_reset:
        try:
            last_dt = datetime.fromisoformat(last_reset["created_at"].replace("Z", "+00:00"))
            if last_dt.date().year == today.year and last_dt.date().month == today.month:
                raise HTTPException(
                    status_code=400,
                    detail=f"تم التصفير في هذا الشهر بالفعل في {last_dt.date().isoformat()}"
                )
        except HTTPException:
            raise
        except Exception:
            pass
    
    # تنفيذ التصفير (حذف نهائي)
    result = await db.deductions.delete_many({"tenant_id": tenant_id})
    deleted_count = result.deleted_count
    
    # تسجيل عملية التصفير في سجل منفصل (للتدقيق)
    reset_log = {
        "id": str(uuid.uuid4()),
        "tenant_id": tenant_id,
        "deleted_count": deleted_count,
        "reset_by": current_user["id"],
        "reset_by_name": current_user.get("name") or current_user.get("email"),
        "created_at": now.isoformat()
    }
    await db.deductions_resets.insert_one(reset_log)
    
    return {
        "success": True,
        "deleted_count": deleted_count,
        "message": f"تم تصفير {deleted_count} خصم بنجاح",
        "reset_date": today.isoformat()
    }

# ==================== BONUSES ====================
@router.post("/bonuses", response_model=BonusResponse)
async def create_bonus(bonus: BonusCreate, current_user: dict = Depends(get_current_user)):
    """إنشاء مكافأة"""
    db = get_database()
    if current_user["role"] not in [UserRole.ADMIN, UserRole.MANAGER, UserRole.SUPER_ADMIN]:
        raise HTTPException(status_code=403, detail="غير مصرح")
    
    employee = await db.employees.find_one({"id": bonus.employee_id}, {"_id": 0})
    if not employee:
        raise HTTPException(status_code=404, detail="الموظف غير موجود")
    
    amount = bonus.amount or 0
    if not amount and bonus.hours:
        hourly_rate = employee.get("salary", 0) / (30 * employee.get("work_hours_per_day", 8))
        overtime_rate = hourly_rate * 1.5
        amount = bonus.hours * overtime_rate
    
    bonus_tenant = get_user_tenant_id(current_user)
    bonus_biz_date = await resolve_business_date(bonus_tenant, employee.get("branch_id"))
    bonus_doc = {
        "id": str(uuid.uuid4()),
        **bonus.model_dump(),
        "employee_name": employee.get("name"),
        "amount": amount,
        "tenant_id": bonus_tenant,
        "business_date": bonus_biz_date,
        "created_by": current_user["id"],
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.bonuses.insert_one(bonus_doc)
    del bonus_doc["_id"]
    return bonus_doc

@router.get("/bonuses")
async def get_bonuses(
    employee_id: Optional[str] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """جلب قائمة المكافآت"""
    db = get_database()
    query = build_tenant_query(current_user)
    if employee_id:
        query["employee_id"] = employee_id
    if start_date:
        query["date"] = {"$gte": start_date}
    if end_date:
        query.setdefault("date", {})["$lte"] = end_date
    
    bonuses = await db.bonuses.find(query, {"_id": 0}).sort("date", -1).to_list(500)
    
    # تحديث أسماء الموظفين من البيانات الحالية
    if bonuses:
        emp_ids = list(set(b.get("employee_id") for b in bonuses if b.get("employee_id")))
        if emp_ids:
            emps = await db.employees.find({"id": {"$in": emp_ids}}, {"_id": 0, "id": 1, "name": 1}).to_list(500)
            name_map = {e["id"]: e.get("name", "") for e in emps}
            for b in bonuses:
                eid = b.get("employee_id")
                if eid and eid in name_map:
                    b["employee_name"] = name_map[eid]
    
    return bonuses

# ==================== OVERTIME APPROVAL ====================
class OvertimeRequestResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    employee_id: str
    employee_name: Optional[str] = None
    date: str
    hours: float
    status: str  # pending, approved, rejected
    approved_by: Optional[str] = None
    approved_at: Optional[str] = None
    notes: Optional[str] = None
    created_at: str

@router.get("/overtime-requests")
async def get_overtime_requests(
    status: Optional[str] = None,
    employee_id: Optional[str] = None,
    month: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """جلب طلبات الوقت الإضافي"""
    db = get_database()
    query = build_tenant_query(current_user)
    if status:
        query["status"] = status
    if employee_id:
        query["employee_id"] = employee_id
    if month:
        query["date"] = {"$regex": f"^{month}"}
    requests = await db.overtime_requests.find(query, {"_id": 0}).sort("created_at", -1).to_list(500)
    
    # تحديث أسماء الموظفين من البيانات الحالية
    if requests:
        emp_ids = list(set(r.get("employee_id") for r in requests if r.get("employee_id")))
        if emp_ids:
            emps = await db.employees.find({"id": {"$in": emp_ids}}, {"_id": 0, "id": 1, "name": 1}).to_list(500)
            name_map = {e["id"]: e.get("name", "") for e in emps}
            for r in requests:
                eid = r.get("employee_id")
                if eid and eid in name_map:
                    r["employee_name"] = name_map[eid]
    
    return requests

@router.put("/overtime-requests/{request_id}/approve")
async def approve_overtime(request_id: str, current_user: dict = Depends(get_current_user)):
    """موافقة على الوقت الإضافي"""
    db = get_database()
    if current_user["role"] not in [UserRole.ADMIN, UserRole.MANAGER, UserRole.SUPER_ADMIN]:
        raise HTTPException(status_code=403, detail="غير مصرح")
    req = await db.overtime_requests.find_one({"id": request_id})
    if not req:
        raise HTTPException(status_code=404, detail="الطلب غير موجود")
    await db.overtime_requests.update_one(
        {"id": request_id},
        {"$set": {"status": "approved", "approved_by": current_user["id"], "approved_at": datetime.now(timezone.utc).isoformat()}}
    )
    return {"message": "تمت الموافقة على الوقت الإضافي"}

@router.put("/overtime-requests/{request_id}/reject")
async def reject_overtime(request_id: str, current_user: dict = Depends(get_current_user)):
    """رفض الوقت الإضافي"""
    db = get_database()
    if current_user["role"] not in [UserRole.ADMIN, UserRole.MANAGER, UserRole.SUPER_ADMIN]:
        raise HTTPException(status_code=403, detail="غير مصرح")
    req = await db.overtime_requests.find_one({"id": request_id})
    if not req:
        raise HTTPException(status_code=404, detail="الطلب غير موجود")
    await db.overtime_requests.update_one(
        {"id": request_id},
        {"$set": {"status": "rejected", "approved_by": current_user["id"], "approved_at": datetime.now(timezone.utc).isoformat()}}
    )
    return {"message": "تم رفض الوقت الإضافي"}

# ==================== PAYROLL CALCULATION ====================
@router.post("/payroll/calculate")
async def calculate_payroll(
    employee_id: str,
    month: str,  # YYYY-MM
    current_user: dict = Depends(get_current_user)
):
    """حساب الراتب للموظف بناء على نوع الراتب وبيانات البصمة"""
    db = get_database()
    employee = await db.employees.find_one({"id": employee_id}, {"_id": 0})
    if not employee:
        raise HTTPException(status_code=404, detail="الموظف غير موجود")
    
    basic_salary = employee.get("salary", 0)
    salary_type = employee.get("salary_type", "monthly")
    work_hours_per_day = employee.get("work_hours_per_day", 8)
    work_days = employee.get("work_days", [0, 1, 2, 3, 4, 5])
    
    hourly_rate = basic_salary / (30 * work_hours_per_day) if work_hours_per_day > 0 else 0
    daily_rate = basic_salary / 30
    
    # جلب سجلات الحضور للشهر
    attendance = await db.attendance.find({
        "employee_id": employee_id,
        "date": {"$regex": f"^{month}"}
    }, {"_id": 0}).to_list(31)
    
    worked_days = len([a for a in attendance if a.get("status") in ["present", "late", "early_leave"]])
    absent_days = len([a for a in attendance if a.get("status") == "absent"])
    total_worked_hours = sum(a.get("worked_hours", 0) for a in attendance)
    late_hours = round(sum(a.get("late_minutes", 0) for a in attendance) / 60, 2)
    total_overtime_hours = sum(a.get("overtime_hours", 0) for a in attendance)
    
    # حساب الراتب الأساسي المستحق حسب نوع الراتب
    # القاعدة الموحّدة: pro-rata حسب أيام العمل الفعلية
    # مثال: راتب 600 شهري، يومي = 20. عمل 10 أيام → مستحق = 200
    # صافي الراتب قد يكون سالباً (مثال: عمل يوم واحد = 20، خصومات 30 → صافي = -10)
    # هذا مقصود للدقة: الموظف يكون مديناً للشركة بـ 10
    if salary_type == "hourly":
        earned_salary = round(total_worked_hours * hourly_rate, 2)
    elif salary_type == "daily":
        earned_salary = round(worked_days * daily_rate, 2)
    else:
        # شهري: يُحسب بالتناسب مع أيام العمل الفعلية
        earned_salary = round(daily_rate * worked_days, 2)
    
    # جلب الوقت الإضافي الموافق عليه فقط
    approved_overtime = await db.overtime_requests.find({
        "employee_id": employee_id,
        "date": {"$regex": f"^{month}"},
        "status": "approved"
    }, {"_id": 0}).to_list(100)
    approved_ot_hours = sum(o.get("hours", 0) for o in approved_overtime)
    overtime_pay = round(approved_ot_hours * hourly_rate * 1.5, 2)
    
    # جلب الخصومات (عقابية + تأخير + غياب)
    deductions = await db.deductions.find({
        "employee_id": employee_id,
        "date": {"$regex": f"^{month}"}
    }, {"_id": 0}).to_list(100)
    total_deductions = sum(d.get("amount", 0) for d in deductions)
    
    # جلب المكافآت
    bonuses = await db.bonuses.find({
        "employee_id": employee_id,
        "date": {"$regex": f"^{month}"}
    }, {"_id": 0}).to_list(100)
    total_bonuses = sum(b.get("amount", 0) for b in bonuses)
    
    # جلب السلف المعتمدة التي ما زال لها رصيد متبقٍّ — نخصم القسط الشهري فقط
    # (موحّد تماماً مع تقرير الرواتب /reports/payroll-summary)
    advances = await db.advances.find({
        "employee_id": employee_id,
        "status": "approved",
        "remaining_amount": {"$gt": 0}
    }, {"_id": 0}).to_list(100)
    advance_deduction = sum(a.get("monthly_deduction", 0) for a in advances)
    
    # صافي الراتب = الراتب المستحق + وقت إضافي موافق + مكافآت - خصومات - سلف
    net_salary = round(earned_salary + overtime_pay + total_bonuses - total_deductions - advance_deduction, 2)
    
    # 💰 الدفعات النقدية المصروفة من الكشف اليومي (لا تمسّ آلية خزينة المالك)
    month_start = f"{month}-01"
    month_end = f"{month}-31"
    payments = await db.salary_payments.find({
        "employee_id": employee_id,
        "payment_date": {"$gte": month_start, "$lte": month_end}
    }, {"_id": 0}).to_list(2000)
    paid_amount = round(sum(p.get("amount", 0) or 0 for p in payments), 2)
    remaining = round(net_salary - paid_amount, 2)
    
    return {
        "employee_id": employee_id,
        "employee_name": employee.get("name"),
        "month": month,
        "salary_type": salary_type,
        "basic_salary": basic_salary,
        "earned_salary": earned_salary,
        "worked_days": worked_days,
        "absent_days": absent_days,
        "total_worked_hours": total_worked_hours,
        "late_hours": late_hours,
        "overtime_hours_total": total_overtime_hours,
        "overtime_hours_approved": approved_ot_hours,
        "overtime_hours_pending": round(total_overtime_hours - approved_ot_hours, 2),
        "overtime_pay": overtime_pay,
        "total_deductions": total_deductions,
        "deductions_breakdown": deductions,
        "total_bonuses": total_bonuses,
        "bonuses_breakdown": bonuses,
        "advance_deduction": advance_deduction,
        "net_salary": net_salary,
        "paid_amount": paid_amount,
        "remaining": remaining
    }

# ==================== PAYROLL CRUD ====================
@router.post("/payroll", response_model=PayrollResponse)
async def create_payroll(payroll: PayrollCreate, current_user: dict = Depends(get_current_user)):
    """إنشاء كشف راتب"""
    db = get_database()
    if current_user["role"] not in [UserRole.ADMIN, UserRole.MANAGER, UserRole.SUPER_ADMIN]:
        raise HTTPException(status_code=403, detail="غير مصرح")
    
    employee = await db.employees.find_one({"id": payroll.employee_id}, {"_id": 0})
    if not employee:
        raise HTTPException(status_code=404, detail="الموظف غير موجود")
    
    payroll_doc = {
        "id": str(uuid.uuid4()),
        **payroll.model_dump(),
        "employee_name": employee.get("name"),
        "status": "draft",
        "tenant_id": get_user_tenant_id(current_user),
        "created_by": current_user["id"],
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.payroll.insert_one(payroll_doc)
    del payroll_doc["_id"]
    return payroll_doc

@router.get("/payroll")
async def get_payroll(
    employee_id: Optional[str] = None,
    month: Optional[str] = None,
    status: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """جلب كشوف الرواتب"""
    db = get_database()
    query = build_tenant_query(current_user)
    if employee_id:
        query["employee_id"] = employee_id
    if month:
        query["month"] = month
    if status:
        query["status"] = status
    
    payrolls = await db.payroll.find(query, {"_id": 0}).sort("created_at", -1).to_list(500)
    
    # تحديث أسماء الموظفين من البيانات الحالية + إرفاق الدفعات النقدية المصروفة
    if payrolls:
        emp_ids = list(set(p.get("employee_id") for p in payrolls if p.get("employee_id")))
        if emp_ids:
            emps = await db.employees.find({"id": {"$in": emp_ids}}, {"_id": 0, "id": 1, "name": 1}).to_list(500)
            name_map = {e["id"]: e.get("name", "") for e in emps}
            for p in payrolls:
                eid = p.get("employee_id")
                if eid and eid in name_map:
                    p["employee_name"] = name_map[eid]
        # 💰 إجمالي الدفعات النقدية المصروفة لكل (موظف+شهر) من الكشف اليومي
        for p in payrolls:
            eid = p.get("employee_id")
            pmonth = p.get("month")
            paid_amount = 0
            if eid and pmonth:
                pays = await db.salary_payments.find({
                    "employee_id": eid,
                    "payment_date": {"$gte": f"{pmonth}-01", "$lte": f"{pmonth}-31"}
                }, {"_id": 0}).to_list(2000)
                paid_amount = round(sum(x.get("amount", 0) or 0 for x in pays), 2)
            p["paid_amount"] = paid_amount
            p["remaining"] = round((p.get("net_salary", 0) or 0) - paid_amount, 2)
    
    return payrolls

@router.put("/payroll/{payroll_id}/pay")
async def pay_payroll(payroll_id: str, current_user: dict = Depends(get_current_user)):
    """صرف الراتب — يُخصم المبلغ المتبقي من **خزينة المالك حسب فرع الموظف**.
    يتجنّب الازدواج: يخصم (صافي الراتب − ما صُرف نقداً مسبقاً لنفس الشهر) فقط."""
    db = get_database()
    if current_user["role"] not in [UserRole.ADMIN, UserRole.SUPER_ADMIN]:
        raise HTTPException(status_code=403, detail="غير مصرح")

    payroll = await db.payroll.find_one({"id": payroll_id})
    if not payroll:
        raise HTTPException(status_code=404, detail="كشف الراتب غير موجود")
    if payroll.get("status") == "paid":
        raise HTTPException(status_code=400, detail="تم صرف هذا الراتب مسبقاً")

    tenant_id = get_user_tenant_id(current_user)
    month = payroll.get("month")
    net_salary = round(float(payroll.get("net_salary") or 0), 2)

    # فرع الموظف (المقيَّد في بطاقة الموظف)
    emp = await db.employees.find_one({"id": payroll.get("employee_id")}, {"_id": 0, "branch_id": 1, "name": 1})
    emp_branch_id = (emp or {}).get("branch_id")
    emp_branch_name = None
    if emp_branch_id:
        br = await db.branches.find_one({"id": emp_branch_id}, {"_id": 0, "name": 1})
        emp_branch_name = (br or {}).get("name")

    # ما صُرف نقداً مسبقاً لنفس الموظف/الشهر (دفعات على الراتب) لتجنّب الخصم المزدوج
    already_paid = 0.0
    if month:
        prev_payments = await db.salary_payments.find(
            {"employee_id": payroll.get("employee_id"), "salary_month": month},
            {"_id": 0, "amount": 1},
        ).to_list(1000)
        already_paid = round(sum(p.get("amount", 0) for p in prev_payments), 2)

    amount_to_withdraw = round(max(net_salary - already_paid, 0), 2)

    withdrawal_id = None
    if amount_to_withdraw > 0 and emp_branch_id:
        # تحقّق من رصيد الفرع المتاح في خزينة المالك (إيداعات الفرع − سحوباته − تحويلاته)
        branch_q = {"branch_id": emp_branch_id}
        if tenant_id:
            branch_q["tenant_id"] = tenant_id
        br_deposits = await db.owner_deposits.find(branch_q, {"_id": 0, "amount": 1}).to_list(5000)
        br_withdrawals = await db.owner_withdrawals.find(branch_q, {"_id": 0, "amount": 1}).to_list(5000)
        br_transfers = await db.owner_profit_transfers.find(branch_q, {"_id": 0, "amount": 1}).to_list(5000)
        branch_balance = (
            sum(d.get("amount", 0) for d in br_deposits)
            - sum(w.get("amount", 0) for w in br_withdrawals)
            - sum(t.get("amount", 0) for t in br_transfers)
        )
        if amount_to_withdraw > branch_balance:
            raise HTTPException(
                status_code=400,
                detail=f"رصيد فرع \"{emp_branch_name or emp_branch_id}\" غير كافٍ في خزينة المالك. المتاح: {branch_balance:,.0f} IQD، المطلوب: {amount_to_withdraw:,.0f} IQD",
            )
        # سحب من خزينة المالك مرتبط بالفرع
        withdrawal_id = str(uuid.uuid4())
        await db.owner_withdrawals.insert_one({
            "id": withdrawal_id,
            "tenant_id": tenant_id,
            "amount": amount_to_withdraw,
            "date": f"{month}-28" if month else datetime.now(timezone.utc).date().isoformat(),
            "salary_month": month,
            "actual_payment_date": datetime.now(timezone.utc).date().isoformat(),
            "beneficiary": f"راتب: {payroll.get('employee_name') or (emp or {}).get('name')}",
            "description": f"صرف راتب شهر {month}" if month else "صرف راتب",
            "category": "salary_payment",
            "branch_id": emp_branch_id,
            "branch_name": emp_branch_name,
            "linked_payroll_id": payroll_id,
            "created_by": current_user.get("full_name") or current_user.get("username"),
            "created_at": datetime.now(timezone.utc).isoformat(),
        })

    await db.payroll.update_one(
        {"id": payroll_id},
        {"$set": {
            "status": "paid",
            "paid_at": datetime.now(timezone.utc).isoformat(),
            "paid_by": current_user["id"],
            "paid_amount": amount_to_withdraw,
            "branch_id": emp_branch_id,
            "branch_name": emp_branch_name,
            "linked_owner_withdrawal_id": withdrawal_id,
        }},
    )
    return {
        "message": "تم صرف الراتب وخصمه من خزينة المالك" if withdrawal_id else "تم صرف الراتب",
        "amount_withdrawn": amount_to_withdraw,
        "branch_name": emp_branch_name,
    }


# ==================== END OF SERVICE / TERMINATION (إنهاء خدمات) ====================
async def _compute_employee_net(db, employee: dict, month: str) -> dict:
    """يحسب صافي راتب الموظف للشهر حسب أيام العمل الفعلية + المتبقي بعد ما صُرف نقداً.
    (نفس منطق /payroll/calculate)."""
    employee_id = employee["id"]
    basic_salary = employee.get("salary", 0)
    salary_type = employee.get("salary_type", "monthly")
    work_hours_per_day = employee.get("work_hours_per_day", 8) or 8
    hourly_rate = basic_salary / (30 * work_hours_per_day) if work_hours_per_day > 0 else 0
    daily_rate = basic_salary / 30

    attendance = await db.attendance.find({"employee_id": employee_id, "date": {"$regex": f"^{month}"}}, {"_id": 0}).to_list(31)
    worked_days = len([a for a in attendance if a.get("status") in ["present", "late", "early_leave"]])
    total_worked_hours = sum(a.get("worked_hours", 0) for a in attendance)

    if salary_type == "hourly":
        earned_salary = round(total_worked_hours * hourly_rate, 2)
    elif salary_type == "daily":
        earned_salary = round(worked_days * daily_rate, 2)
    else:
        earned_salary = round(daily_rate * worked_days, 2)

    approved_overtime = await db.overtime_requests.find({"employee_id": employee_id, "date": {"$regex": f"^{month}"}, "status": "approved"}, {"_id": 0}).to_list(100)
    overtime_pay = round(sum(o.get("hours", 0) for o in approved_overtime) * hourly_rate * 1.5, 2)
    deductions = await db.deductions.find({"employee_id": employee_id, "date": {"$regex": f"^{month}"}}, {"_id": 0}).to_list(100)
    total_deductions = sum(d.get("amount", 0) for d in deductions)
    bonuses = await db.bonuses.find({"employee_id": employee_id, "date": {"$regex": f"^{month}"}}, {"_id": 0}).to_list(100)
    total_bonuses = sum(b.get("amount", 0) for b in bonuses)
    # عند إنهاء الخدمة: نخصم كامل رصيد السلف المتبقي (وليس القسط الشهري فقط)
    advances = await db.advances.find({"employee_id": employee_id, "status": "approved", "remaining_amount": {"$gt": 0}}, {"_id": 0}).to_list(100)
    advance_remaining = sum(a.get("remaining_amount", 0) for a in advances)

    net_salary = round(earned_salary + overtime_pay + total_bonuses - total_deductions - advance_remaining, 2)
    payments = await db.salary_payments.find({"employee_id": employee_id, "salary_month": month}, {"_id": 0, "amount": 1}).to_list(2000)
    paid_amount = round(sum(p.get("amount", 0) or 0 for p in payments), 2)
    remaining = round(net_salary - paid_amount, 2)
    return {
        "worked_days": worked_days, "earned_salary": earned_salary, "overtime_pay": overtime_pay,
        "total_bonuses": total_bonuses, "total_deductions": total_deductions,
        "advance_remaining": advance_remaining, "net_salary": net_salary,
        "paid_amount": paid_amount, "remaining": remaining,
    }


def _end_of_next_month_iso(date_str: str) -> str:
    """نهاية الشهر الذي يلي شهر تاريخ الإنهاء (موعد الحذف من الأرشيف)."""
    d = datetime.fromisoformat(date_str[:10])
    y, m = (d.year + (1 if d.month == 12 else 0), 1 if d.month == 12 else d.month + 1)
    last_day = calendar.monthrange(y, m)[1]
    return datetime(y, m, last_day, 23, 59, 59, tzinfo=timezone.utc).isoformat()


async def process_terminations(db, tenant_id: Optional[str] = None):
    """يُنهي/يؤرشف ويحذف الموظفين المنتهية خدماتهم تلقائياً (يُستدعى عند جلب الموظفين).
    - بعد 24 ساعة من الطلب: terminated_pending → terminated (يُخفى من القائمة + يُزال من البصمة).
    - بعد نهاية الشهر التالي لتاريخ الإنهاء: حذف نهائي من الأرشيف.
    """
    now = datetime.now(timezone.utc)
    now_iso = now.isoformat()
    base = {"tenant_id": tenant_id} if tenant_id else {}
    # 1) الإنهاء النهائي بعد 24 ساعة
    pending = await db.employees.find({**base, "employment_status": "terminated_pending", "auto_finalize_at": {"$lte": now_iso}}, {"_id": 0, "id": 1, "termination_date": 1}).to_list(500)
    for e in pending:
        await db.employees.update_one({"id": e["id"]}, {"$set": {
            "employment_status": "terminated",
            "is_active": False,
            "pending_device_removal": True,  # يُزال من جهاز البصمة عبر المزامنة
            "archive_purge_at": _end_of_next_month_iso(e.get("termination_date") or now_iso),
        }})
    # 2) الحذف النهائي من الأرشيف بعد نهاية الشهر التالي
    to_purge = await db.employees.find({**base, "employment_status": "terminated", "archive_purge_at": {"$lte": now_iso}}, {"_id": 0, "id": 1}).to_list(500)
    for e in to_purge:
        await db.employees.delete_one({"id": e["id"]})


@router.post("/employees/{employee_id}/terminate")
async def terminate_employee(employee_id: str, current_user: dict = Depends(get_current_user)):
    """إنهاء خدمات موظف: خط أحمر + جدولة حذف بعد 24 ساعة + معاينة المستحقات."""
    db = get_database()
    if current_user["role"] not in [UserRole.ADMIN, UserRole.SUPER_ADMIN]:
        raise HTTPException(status_code=403, detail="غير مصرح")
    emp = await db.employees.find_one({"id": employee_id}, {"_id": 0})
    if not emp:
        raise HTTPException(status_code=404, detail="الموظف غير موجود")
    if emp.get("employment_status") in ("terminated_pending", "terminated"):
        raise HTTPException(status_code=400, detail="خدمات هذا الموظف منتهية بالفعل")

    now = datetime.now(timezone.utc)
    term_date = now.date().isoformat()
    month = term_date[:7]
    calc = await _compute_employee_net(db, emp, month)
    await db.employees.update_one({"id": employee_id}, {"$set": {
        "employment_status": "terminated_pending",
        "termination_date": term_date,
        "termination_month": month,
        "termination_requested_at": now.isoformat(),
        "auto_finalize_at": (now + timedelta(hours=24)).isoformat(),
        "settlement_paid": False,
        "settlement_preview": calc["remaining"],
    }})
    return {"message": "تم إنهاء خدمات الموظف — يمكن صرف المستحقات أو الإرجاع خلال 24 ساعة", "settlement_preview": calc["remaining"], "details": calc}


class SettlementPayout(BaseModel):
    amount: Optional[float] = None
    payment_method: str = "cash"
    payment_date: Optional[str] = None
    notes: Optional[str] = None


@router.post("/employees/{employee_id}/terminate-payout")
async def terminate_payout(employee_id: str, payload: Optional[SettlementPayout] = None, current_user: dict = Depends(get_current_user)):
    """صرف مستحقات إنهاء الخدمة من خزينة المالك حسب فرع الموظف."""
    db = get_database()
    payload = payload or SettlementPayout()
    if current_user["role"] not in [UserRole.ADMIN, UserRole.SUPER_ADMIN]:
        raise HTTPException(status_code=403, detail="غير مصرح")
    emp = await db.employees.find_one({"id": employee_id}, {"_id": 0})
    if not emp:
        raise HTTPException(status_code=404, detail="الموظف غير موجود")
    if emp.get("employment_status") != "terminated_pending":
        raise HTTPException(status_code=400, detail="يجب إنهاء خدمات الموظف أولاً")
    if emp.get("settlement_paid"):
        raise HTTPException(status_code=400, detail="تم صرف المستحقات مسبقاً")

    tenant_id = get_user_tenant_id(current_user)
    month = emp.get("termination_month") or (emp.get("termination_date") or "")[:7]
    calc = await _compute_employee_net(db, emp, month)
    computed = round(max(calc["remaining"], 0), 2)
    # السماح بتعديل المبلغ من النموذج (لا يتجاوز المستحق المحسوب)
    if payload.amount is not None and float(payload.amount) > 0:
        amount = round(min(float(payload.amount), computed), 2)
    else:
        amount = computed
    pay_date = (payload.payment_date or datetime.now(timezone.utc).date().isoformat())[:10]
    emp_branch_id = emp.get("branch_id")
    emp_branch_name = None
    if emp_branch_id:
        br = await db.branches.find_one({"id": emp_branch_id}, {"_id": 0, "name": 1})
        emp_branch_name = (br or {}).get("name")

    withdrawal_id = None
    if amount > 0 and emp_branch_id:
        branch_q = {"branch_id": emp_branch_id}
        if tenant_id:
            branch_q["tenant_id"] = tenant_id
        deps = await db.owner_deposits.find(branch_q, {"_id": 0, "amount": 1}).to_list(5000)
        wds = await db.owner_withdrawals.find(branch_q, {"_id": 0, "amount": 1}).to_list(5000)
        trs = await db.owner_profit_transfers.find(branch_q, {"_id": 0, "amount": 1}).to_list(5000)
        balance = sum(d.get("amount", 0) for d in deps) - sum(w.get("amount", 0) for w in wds) - sum(t.get("amount", 0) for t in trs)
        if amount > balance:
            raise HTTPException(status_code=400, detail=f"رصيد فرع \"{emp_branch_name or emp_branch_id}\" غير كافٍ في خزينة المالك. المتاح: {balance:,.0f} IQD، المطلوب: {amount:,.0f} IQD")
        withdrawal_id = str(uuid.uuid4())
        await db.owner_withdrawals.insert_one({
            "id": withdrawal_id, "tenant_id": tenant_id, "amount": amount,
            "date": pay_date, "actual_payment_date": pay_date,
            "salary_month": month, "beneficiary": f"إنهاء خدمات: {emp.get('name')}",
            "description": f"صرف مستحقات إنهاء خدمة — {emp.get('name')}",
            "category": "end_of_service", "payment_method": payload.payment_method,
            "branch_id": emp_branch_id, "branch_name": emp_branch_name,
            "linked_employee_id": employee_id, "notes": payload.notes,
            "created_by": current_user.get("full_name") or current_user.get("username"),
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
    await db.employees.update_one({"id": employee_id}, {"$set": {
        "settlement_paid": True, "settlement_amount": amount,
        "settlement_withdrawal_id": withdrawal_id,
        "settlement_payment_method": payload.payment_method,
        "settlement_paid_at": datetime.now(timezone.utc).isoformat(),
    }})
    return {
        "message": "تم صرف المستحقات وخصمها من خزينة المالك" if withdrawal_id else "تم صرف المستحقات",
        "amount": amount,
        "branch_name": emp_branch_name,
        "details": calc,
        "month": month,
        "paid_at": datetime.now(timezone.utc).isoformat(),
        "employee": {
            "name": emp.get("name"),
            "position": emp.get("position"),
            "phone": emp.get("phone"),
            "hire_date": emp.get("hire_date"),
            "termination_date": emp.get("termination_date"),
            "branch_name": emp_branch_name,
            "basic_salary": emp.get("salary") or emp.get("basic_salary"),
        },
    }


@router.get("/employees/{employee_id}/settlement-receipt")
async def get_settlement_receipt(employee_id: str, current_user: dict = Depends(get_current_user)):
    """بيانات إيصال المخالصة النهائية (لإعادة الطباعة) — يعمل للموظف المنتهي/المصروف."""
    db = get_database()
    if current_user["role"] not in [UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.MANAGER]:
        raise HTTPException(status_code=403, detail="غير مصرح")
    emp = await db.employees.find_one({"id": employee_id}, {"_id": 0})
    if not emp:
        raise HTTPException(status_code=404, detail="الموظف غير موجود")
    month = emp.get("termination_month") or (emp.get("termination_date") or "")[:7]
    calc = await _compute_employee_net(db, emp, month)
    emp_branch_name = None
    if emp.get("branch_id"):
        br = await db.branches.find_one({"id": emp["branch_id"]}, {"_id": 0, "name": 1})
        emp_branch_name = (br or {}).get("name")
    amount = emp.get("settlement_amount")
    if amount is None:
        amount = round(max(calc["remaining"], 0), 2)
    return {
        "amount": amount,
        "branch_name": emp_branch_name,
        "details": calc,
        "month": month,
        "paid_at": emp.get("settlement_paid_at"),
        "settlement_paid": bool(emp.get("settlement_paid")),
        "employee": {
            "name": emp.get("name"),
            "position": emp.get("position"),
            "phone": emp.get("phone"),
            "hire_date": emp.get("hire_date"),
            "termination_date": emp.get("termination_date"),
            "branch_name": emp_branch_name,
            "basic_salary": emp.get("salary") or emp.get("basic_salary"),
        },
    }



@router.post("/employees/{employee_id}/reinstate")
async def reinstate_employee(employee_id: str, current_user: dict = Depends(get_current_user)):
    """إرجاع الموظف للعمل (خلال 24 ساعة فقط) — يعكس الصرف ويعيد الرصيد للخزينة."""
    db = get_database()
    if current_user["role"] not in [UserRole.ADMIN, UserRole.SUPER_ADMIN]:
        raise HTTPException(status_code=403, detail="غير مصرح")
    emp = await db.employees.find_one({"id": employee_id}, {"_id": 0})
    if not emp:
        raise HTTPException(status_code=404, detail="الموظف غير موجود")
    if emp.get("employment_status") != "terminated_pending":
        raise HTTPException(status_code=400, detail="لا يمكن الإرجاع — انتهت مهلة الـ24 ساعة أو الموظف غير منتهٍ")
    auto_finalize_at = emp.get("auto_finalize_at")
    if auto_finalize_at and datetime.now(timezone.utc).isoformat() >= auto_finalize_at:
        raise HTTPException(status_code=400, detail="انتهت مهلة الـ24 ساعة — لا يمكن الإرجاع")

    # عكس الصرف: حذف السحب من خزينة المالك (يعيد الرصيد للخزينة تلقائياً)
    wid = emp.get("settlement_withdrawal_id")
    if wid:
        await db.owner_withdrawals.delete_one({"id": wid})
    await db.employees.update_one({"id": employee_id}, {"$unset": {
        "termination_date": "", "termination_month": "", "termination_requested_at": "",
        "auto_finalize_at": "", "settlement_paid": "", "settlement_amount": "",
        "settlement_withdrawal_id": "", "settlement_paid_at": "", "settlement_preview": "",
    }, "$set": {"employment_status": "active", "is_active": True}})
    return {"message": "تمت إعادة الموظف للعمل وإلغاء الصرف وإرجاع الرصيد للخزينة"}


@router.post("/payroll/generate-all")
async def generate_all_payrolls(month: str, current_user: dict = Depends(get_current_user)):
    """إنشاء كشوف الرواتب لجميع الموظفين بناء على بيانات الحضور"""
    db = get_database()
    if current_user["role"] not in [UserRole.ADMIN, UserRole.SUPER_ADMIN]:
        raise HTTPException(status_code=403, detail="غير مصرح")
    
    tenant_id = get_user_tenant_id(current_user)
    query = {"tenant_id": tenant_id, "is_active": True} if tenant_id else {"is_active": True}
    
    employees = await db.employees.find(query, {"_id": 0}).to_list(1000)
    
    generated = 0
    for emp in employees:
        existing = await db.payroll.find_one({
            "employee_id": emp["id"],
            "month": month
        })
        
        if not existing:
            basic_salary = emp.get("salary", 0)
            salary_type = emp.get("salary_type", "monthly")
            work_hours_per_day = emp.get("work_hours_per_day", 8)
            hourly_rate = basic_salary / (30 * work_hours_per_day) if work_hours_per_day > 0 else 0
            daily_rate = basic_salary / 30
            
            # جلب الحضور
            attendance = await db.attendance.find({
                "employee_id": emp["id"],
                "date": {"$regex": f"^{month}"}
            }, {"_id": 0}).to_list(31)
            
            worked_days = len([a for a in attendance if a.get("status") in ["present", "late", "early_leave"]])
            absent_days = len([a for a in attendance if a.get("status") == "absent"])
            total_worked_hours = sum(a.get("worked_hours", 0) for a in attendance)
            late_hours = round(sum(a.get("late_minutes", 0) for a in attendance) / 60, 2)
            total_overtime = sum(a.get("overtime_hours", 0) for a in attendance)
            
            # حساب الراتب المستحق
            if salary_type == "hourly":
                earned_salary = round(total_worked_hours * hourly_rate, 2)
            elif salary_type == "daily":
                earned_salary = round(worked_days * daily_rate, 2)
            else:
                # شهري: pro-rata حسب أيام العمل الفعلية (موحّد مع تقرير الرواتب)
                earned_salary = round(daily_rate * worked_days, 2)
            
            # وقت إضافي موافق عليه فقط
            approved_ot = await db.overtime_requests.find({
                "employee_id": emp["id"],
                "date": {"$regex": f"^{month}"},
                "status": "approved"
            }, {"_id": 0}).to_list(100)
            approved_ot_hours = sum(o.get("hours", 0) for o in approved_ot)
            overtime_pay = round(approved_ot_hours * hourly_rate * 1.5, 2)
            
            # خصومات
            deductions = await db.deductions.find({
                "employee_id": emp["id"],
                "date": {"$regex": f"^{month}"}
            }).to_list(100)
            total_deductions = sum(d.get("amount", 0) for d in deductions)
            
            # مكافآت
            bonuses = await db.bonuses.find({
                "employee_id": emp["id"],
                "date": {"$regex": f"^{month}"}
            }).to_list(100)
            total_bonuses = sum(b.get("amount", 0) for b in bonuses)
            
            # سلف: القسط الشهري للسلف التي لها رصيد متبقٍّ (موحّد مع تقرير الرواتب)
            advances = await db.advances.find({
                "employee_id": emp["id"],
                "status": "approved",
                "remaining_amount": {"$gt": 0}
            }).to_list(100)
            advance_deduction = sum(a.get("monthly_deduction", 0) for a in advances)
            
            net_salary = round(earned_salary + overtime_pay + total_bonuses - total_deductions - advance_deduction, 2)
            
            payroll_doc = {
                "id": str(uuid.uuid4()),
                "employee_id": emp["id"],
                "employee_name": emp.get("name"),
                "month": month,
                "salary_type": salary_type,
                "basic_salary": basic_salary,
                "earned_salary": earned_salary,
                "worked_days": worked_days,
                "absent_days": absent_days,
                "total_worked_hours": total_worked_hours,
                "late_hours": late_hours,
                "overtime_hours": total_overtime,
                "approved_overtime_hours": approved_ot_hours,
                "overtime_pay": overtime_pay,
                "total_deductions": total_deductions,
                "total_bonuses": total_bonuses,
                "advance_deduction": advance_deduction,
                "net_salary": net_salary,
                "status": "draft",
                "tenant_id": tenant_id,
                "created_by": current_user["id"],
                "created_at": datetime.now(timezone.utc).isoformat()
            }
            await db.payroll.insert_one(payroll_doc)
            generated += 1
    
    return {"message": f"تم إنشاء {generated} كشف راتب"}



@router.get("/payroll/{payroll_id}/print")
async def get_payroll_print_data(payroll_id: str, current_user: dict = Depends(get_current_user)):
    """جلب بيانات طباعة كشف الراتب"""
    db = get_database()
    tenant_id = get_user_tenant_id(current_user)
    query = build_tenant_query(current_user, {"id": payroll_id})
    payroll = await db.payroll.find_one(query, {"_id": 0})

    if not payroll:
        raise HTTPException(status_code=404, detail="كشف الراتب غير موجود")

    emp_q = {"id": payroll["employee_id"]}
    if tenant_id:
        emp_q["tenant_id"] = tenant_id
    employee = await db.employees.find_one(emp_q, {"_id": 0})

    branch = None
    if employee and employee.get("branch_id"):
        branch = await db.branches.find_one({"id": employee["branch_id"]}, {"_id": 0})

    month = payroll.get("month", "")
    start_date = f"{month}-01"
    end_date = f"{month}-31"

    sub_q = {"employee_id": payroll["employee_id"]}
    if tenant_id:
        sub_q["tenant_id"] = tenant_id

    deductions = await db.deductions.find(
        {**sub_q, "date": {"$gte": start_date, "$lte": end_date}}, {"_id": 0}
    ).to_list(200)

    bonuses = await db.bonuses.find(
        {**sub_q, "date": {"$gte": start_date, "$lte": end_date}}, {"_id": 0}
    ).to_list(200)

    advances = await db.advances.find(
        {**sub_q, "status": {"$in": ["approved", "paid"]}}, {"_id": 0}
    ).to_list(200)

    return {
        "payroll": payroll,
        "employee": employee,
        "branch": branch,
        "deductions": deductions,
        "bonuses": bonuses,
        "advances": advances,
        "print_date": datetime.now(timezone.utc).isoformat()
    }


@router.get("/employees/{employee_id}/account-statement")
async def get_employee_account_statement(
    employee_id: str,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """كشف حساب الموظف الكامل: خصومات، مكافآت، سلف، رواتب"""
    db = get_database()
    tenant_id = get_user_tenant_id(current_user)

    employee_query = {"id": employee_id}
    if tenant_id:
        employee_query["tenant_id"] = tenant_id
    employee = await db.employees.find_one(employee_query, {"_id": 0})
    if not employee:
        raise HTTPException(status_code=404, detail="الموظف غير موجود")

    branch = None
    if employee.get("branch_id"):
        branch = await db.branches.find_one({"id": employee["branch_id"]}, {"_id": 0})

    sub_q = {"employee_id": employee_id}
    if tenant_id:
        sub_q["tenant_id"] = tenant_id

    date_filter = {}
    if start_date and end_date:
        date_filter = {"date": {"$gte": start_date, "$lte": end_date}}

    deductions = await db.deductions.find(
        {**sub_q, **date_filter}, {"_id": 0}
    ).sort("date", -1).to_list(1000)

    bonuses = await db.bonuses.find(
        {**sub_q, **date_filter}, {"_id": 0}
    ).sort("date", -1).to_list(1000)

    advances = await db.advances.find(sub_q, {"_id": 0}).sort("created_at", -1).to_list(1000)

    payroll_query = dict(sub_q)
    if start_date and end_date:
        payroll_query["month"] = {"$gte": start_date[:7], "$lte": end_date[:7]}
    payrolls = await db.payroll.find(payroll_query, {"_id": 0}).sort("month", -1).to_list(500)

    attendance = await db.attendance.find(
        {**sub_q, **date_filter}, {"_id": 0}
    ).sort("date", -1).to_list(2000)

    # الدفعات المصروفة (دفعات الكشف اليومي النقدية)
    payments_q = dict(sub_q)
    if start_date and end_date:
        payments_q["payment_date"] = {"$gte": start_date, "$lte": end_date}
    salary_payments = await db.salary_payments.find(
        payments_q, {"_id": 0}
    ).sort("payment_date", -1).to_list(2000)

    totals = {
        "total_deductions": sum(d.get("amount", 0) or 0 for d in deductions),
        "total_bonuses": sum(b.get("amount", 0) or 0 for b in bonuses),
        "total_advances": sum(a.get("amount", 0) or 0 for a in advances if a.get("status") in ["approved", "paid"]),
        "remaining_advances": sum(a.get("remaining_amount", 0) or 0 for a in advances if a.get("status") in ["approved", "paid"]),
        "total_paid_payrolls": sum(p.get("net_salary", 0) or 0 for p in payrolls if p.get("status") == "paid"),
        "total_pending_payrolls": sum(p.get("net_salary", 0) or 0 for p in payrolls if p.get("status") != "paid"),
        "total_salary_payments": round(sum(p.get("amount", 0) or 0 for p in salary_payments), 2),
        "attendance_days": len([a for a in attendance if a.get("status") in ["present", "late"]]),
        "absent_days": len([a for a in attendance if a.get("status") == "absent"]),
    }

    return {
        "employee": employee,
        "branch": branch,
        "deductions": deductions,
        "bonuses": bonuses,
        "advances": advances,
        "payrolls": payrolls,
        "attendance": attendance,
        "salary_payments": salary_payments,
        "totals": totals,
        "generated_at": datetime.now(timezone.utc).isoformat()
    }



# ==================== أذونات وإجازات الموظفين (موافقة المالك) ====================
# 3 أنواع: عطلة مرضية (sick) | إذن زمني/ساعات (hourly) | إجازة سفر (travel)
# يُدخلها المدير → بانتظار موافقة المالك → عند الموافقة تُحتسب للموظف (مدفوعة، بلا خصم)
# مع سجل/أرشيف كامل وإشعار للمالك.

LEAVE_GRANT_ROLES = [UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.MANAGER, UserRole.SUPERVISOR]
LEAVE_APPROVE_ROLES = [UserRole.ADMIN, UserRole.SUPER_ADMIN]  # المالك فقط
DEFAULT_ANNUAL_LEAVE = 21  # رصيد الإجازة السنوية الافتراضي (أيام)


class LeavePermissionCreate(BaseModel):
    employee_id: str
    leave_type: str  # sick | hourly | travel
    date_from: str   # YYYY-MM-DD
    date_to: Optional[str] = None   # للمرضية/السفر (نطاق). للزمني = نفس اليوم
    hours: Optional[float] = None   # للإذن الزمني
    reason: Optional[str] = None


def _days_inclusive(date_from: str, date_to: str) -> int:
    a = datetime.fromisoformat(date_from[:10])
    b = datetime.fromisoformat(date_to[:10])
    return max((b - a).days + 1, 1)


@router.post("/leave-permissions")
async def create_leave_permission(payload: LeavePermissionCreate, current_user: dict = Depends(get_current_user)):
    """المدير يُنشئ إذناً/إجازة → بانتظار موافقة المالك (لا تُحتسب على الموظف حتى يوافق المالك)."""
    db = get_database()
    if current_user["role"] not in LEAVE_GRANT_ROLES:
        raise HTTPException(status_code=403, detail="غير مصرح بمنح الأذونات")
    if payload.leave_type not in ("sick", "hourly", "travel"):
        raise HTTPException(status_code=400, detail="نوع الإذن غير صحيح")

    employee = await db.employees.find_one({"id": payload.employee_id}, {"_id": 0})
    if not employee:
        raise HTTPException(status_code=404, detail="الموظف غير موجود")

    tenant_id = get_user_tenant_id(current_user)
    branch_id = employee.get("branch_id")
    branch_name = None
    if branch_id:
        br = await db.branches.find_one({"id": branch_id}, {"_id": 0, "name": 1})
        branch_name = (br or {}).get("name")

    # حساب التفاصيل حسب النوع
    date_to = payload.date_to or payload.date_from
    days = 0
    hours = None
    if payload.leave_type == "hourly":
        hours = float(payload.hours or 0)
        if hours <= 0:
            raise HTTPException(status_code=400, detail="أدخل عدد الساعات للإذن الزمني")
        date_to = payload.date_from
    else:
        days = _days_inclusive(payload.date_from, date_to)

    # للسفر: تحقق من رصيد الإجازة السنوية
    annual_balance = employee.get("annual_leave_balance")
    if annual_balance is None:
        annual_balance = DEFAULT_ANNUAL_LEAVE
    if payload.leave_type == "travel" and days > annual_balance:
        raise HTTPException(status_code=400, detail=f"رصيد الإجازة السنوية غير كافٍ. المتبقي: {annual_balance} يوم، المطلوب: {days} يوم")

    manager_name = current_user.get("full_name") or current_user.get("name") or current_user.get("username") or current_user.get("email") or "المدير"
    now_iso = datetime.now(timezone.utc).isoformat()
    doc = {
        "id": str(uuid.uuid4()),
        "tenant_id": tenant_id,
        "employee_id": payload.employee_id,
        "employee_name": employee.get("name"),
        "branch_id": branch_id,
        "branch_name": branch_name,
        "leave_type": payload.leave_type,
        "date_from": payload.date_from,
        "date_to": date_to,
        "days": days,
        "hours": hours,
        "reason": (payload.reason or "").strip(),
        "status": "pending",  # pending | approved | rejected
        # توقيع المدير الذي منح الإذن
        "granted_by": current_user["id"],
        "granted_by_name": manager_name,
        "granted_at": now_iso,
        # الموافقة (المالك)
        "approved_by": None,
        "approved_by_name": None,
        "approved_at": None,
        "review_note": None,
        "created_at": now_iso,
    }
    await db.leave_permissions.insert_one(doc)
    doc.pop("_id", None)
    return {"message": "تم إرسال الطلب — بانتظار موافقة المالك", "permission": doc}


@router.get("/leave-permissions")
async def list_leave_permissions(
    status: Optional[str] = None,
    employee_id: Optional[str] = None,
    leave_type: Optional[str] = None,
    branch_id: Optional[str] = None,
    month: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """سجل/أرشيف الأذونات والإجازات (مع الفلاتر)."""
    db = get_database()
    query = build_tenant_query(current_user)
    if status:
        query["status"] = status
    if employee_id:
        query["employee_id"] = employee_id
    if leave_type:
        query["leave_type"] = leave_type
    if branch_id:
        query["branch_id"] = branch_id
    if month:
        query["date_from"] = {"$regex": f"^{month}"}
    rows = await db.leave_permissions.find(query, {"_id": 0}).sort("created_at", -1).to_list(1000)
    return rows


@router.get("/leave-permissions/pending-count")
async def leave_permissions_pending_count(current_user: dict = Depends(get_current_user)):
    """عدد الأذونات بانتظار موافقة المالك (لشارة الإشعار)."""
    db = get_database()
    query = build_tenant_query(current_user)
    query["status"] = "pending"
    count = await db.leave_permissions.count_documents(query)
    return {"pending": count}


@router.put("/leave-permissions/{permission_id}/approve")
async def approve_leave_permission(permission_id: str, current_user: dict = Depends(get_current_user)):
    """موافقة المالك → تُحتسب للموظف (مدفوعة بلا خصم)."""
    db = get_database()
    if current_user["role"] not in LEAVE_APPROVE_ROLES:
        raise HTTPException(status_code=403, detail="الموافقة متاحة للمالك فقط")
    perm = await db.leave_permissions.find_one({"id": permission_id}, {"_id": 0})
    if not perm:
        raise HTTPException(status_code=404, detail="الطلب غير موجود")
    if perm.get("status") != "pending":
        raise HTTPException(status_code=400, detail="تمت معالجة هذا الطلب مسبقاً")

    employee = await db.employees.find_one({"id": perm["employee_id"]}, {"_id": 0})
    if not employee:
        raise HTTPException(status_code=404, detail="الموظف غير موجود")

    work_hours_per_day = employee.get("work_hours_per_day", 8) or 8
    basic_salary = employee.get("salary", 0) or 0
    hourly_rate = basic_salary / (30 * work_hours_per_day) if work_hours_per_day > 0 else 0
    daily_rate = basic_salary / 30
    leave_type = perm["leave_type"]
    now_iso = datetime.now(timezone.utc).isoformat()

    if leave_type in ("sick", "travel"):
        # المرضية تُسجَّل كحضور مدفوع ضمن راتب الشهر؛ السفر/السنوية تُدفع كاملة من خزينة المالك (لا تُحتسب بالراتب الشهري لتفادي الدفع المزدوج)
        att_status = "present" if leave_type == "sick" else "annual_leave"
        a = datetime.fromisoformat(perm["date_from"][:10])
        b = datetime.fromisoformat((perm.get("date_to") or perm["date_from"])[:10])
        d = a
        while d <= b:
            ds = d.date().isoformat()
            await db.attendance.update_one(
                {"employee_id": perm["employee_id"], "date": ds},
                {"$set": {
                    "id": str(uuid.uuid4()),
                    "employee_id": perm["employee_id"],
                    "employee_name": employee.get("name"),
                    "date": ds,
                    "status": att_status,
                    "worked_hours": work_hours_per_day,
                    "source": "leave_approved",
                    "leave_type": leave_type,
                    "leave_permission_id": perm["id"],
                    "notes": ("إجازة مرضية معتمدة" if leave_type == "sick" else "إجازة سنوية/سفر معتمدة (مدفوعة من الخزينة)"),
                    "tenant_id": perm.get("tenant_id"),
                }},
                upsert=True
            )
            # إزالة خصومات الغياب التلقائية لذلك اليوم
            await db.deductions.delete_many({
                "employee_id": perm["employee_id"],
                "date": ds,
                "deduction_type": {"$in": ["absence", "absent"]}
            })
            d += timedelta(days=1)
        # السفر/السنوية: خصم من رصيد الإجازة + دفع راتب الإجازة كسحب من خزينة المالك بخصمه من رصيد فرع الموظف
        if leave_type == "travel":
            cur_bal = employee.get("annual_leave_balance")
            if cur_bal is None:
                cur_bal = DEFAULT_ANNUAL_LEAVE
            days = perm.get("days") or 0
            new_bal = max(cur_bal - days, 0)
            await db.employees.update_one({"id": perm["employee_id"]}, {"$set": {"annual_leave_balance": new_bal}})

            # سحب راتب الإجازة السنوية من خزينة المالك باسم الموظف وخصمه من رصيد الفرع
            leave_amount = round(days * daily_rate, 2)
            withdrawal = {
                "id": str(uuid.uuid4()),
                "tenant_id": perm.get("tenant_id"),
                "amount": leave_amount,
                "date": now_iso[:10],
                "beneficiary": employee.get("name"),
                "description": f"إجازة سنوية مدفوعة — راتب كامل ({days} يوم) — {perm['date_from']} ← {perm.get('date_to')}",
                "category": "payment",
                "payment_method": "cash",
                "branch_id": perm.get("branch_id"),
                "branch_name": perm.get("branch_name"),
                "external_source": None,
                "source": "annual_leave_payout",
                "leave_permission_id": perm["id"],
                "created_by": current_user.get("username") or current_user.get("full_name"),
                "created_at": now_iso,
            }
            await db.owner_withdrawals.insert_one(withdrawal)
            await db.leave_permissions.update_one(
                {"id": permission_id},
                {"$set": {"payout_amount": leave_amount, "payout_withdrawal_id": withdrawal["id"]}}
            )

    elif leave_type == "hourly":
        # الإذن الزمني: تُحتسب الساعات كعمل بلا خصم — نضيف مكافأة معادِلة تُلغي أي خصم انصراف مبكر لتلك الساعات
        hrs = float(perm.get("hours") or 0)
        amount = round(hrs * hourly_rate, 2)
        await db.bonuses.insert_one({
            "id": str(uuid.uuid4()),
            "employee_id": perm["employee_id"],
            "employee_name": employee.get("name"),
            "bonus_type": "permission",
            "amount": amount,
            "hours": hrs,
            "reason": f"إذن زمني معتمد ({hrs} ساعة) — {perm.get('reason') or ''}".strip(),
            "date": perm["date_from"],
            "tenant_id": perm.get("tenant_id"),
            "leave_permission_id": perm["id"],
            "created_by": current_user["id"],
            "created_at": now_iso,
        })

    await db.leave_permissions.update_one(
        {"id": permission_id},
        {"$set": {
            "status": "approved",
            "approved_by": current_user["id"],
            "approved_by_name": current_user.get("full_name") or current_user.get("username") or current_user.get("email"),
            "approved_at": now_iso,
        }}
    )
    return {"message": "تمت الموافقة — تم احتساب الإذن للموظف"}


@router.put("/leave-permissions/{permission_id}/reject")
async def reject_leave_permission(permission_id: str, note: Optional[str] = None, current_user: dict = Depends(get_current_user)):
    """رفض المالك للطلب."""
    db = get_database()
    if current_user["role"] not in LEAVE_APPROVE_ROLES:
        raise HTTPException(status_code=403, detail="الرفض متاح للمالك فقط")
    perm = await db.leave_permissions.find_one({"id": permission_id}, {"_id": 0})
    if not perm:
        raise HTTPException(status_code=404, detail="الطلب غير موجود")
    if perm.get("status") != "pending":
        raise HTTPException(status_code=400, detail="تمت معالجة هذا الطلب مسبقاً")
    await db.leave_permissions.update_one(
        {"id": permission_id},
        {"$set": {
            "status": "rejected",
            "approved_by": current_user["id"],
            "approved_by_name": current_user.get("full_name") or current_user.get("username") or current_user.get("email"),
            "approved_at": datetime.now(timezone.utc).isoformat(),
            "review_note": (note or "").strip() or None,
        }}
    )
    return {"message": "تم رفض الطلب"}
