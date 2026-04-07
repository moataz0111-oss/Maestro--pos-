"""
Payroll Routes - إدارة الرواتب والخصومات والمكافآت
"""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict
from typing import Optional, List
from datetime import datetime, timezone
import uuid
import logging

from .shared import (
    get_database, get_current_user, get_user_tenant_id,
    build_tenant_query, UserRole
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
    
    deduction_doc = {
        "id": str(uuid.uuid4()),
        **deduction.model_dump(),
        "employee_name": employee.get("name"),
        "amount": amount,
        "tenant_id": get_user_tenant_id(current_user),
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
    return deductions

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
    
    bonus_doc = {
        "id": str(uuid.uuid4()),
        **bonus.model_dump(),
        "employee_name": employee.get("name"),
        "amount": amount,
        "tenant_id": get_user_tenant_id(current_user),
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
    
    worked_days = len([a for a in attendance if a.get("status") in ["present", "late"]])
    absent_days = len([a for a in attendance if a.get("status") == "absent"])
    total_worked_hours = sum(a.get("worked_hours", 0) for a in attendance)
    late_hours = round(sum(a.get("late_minutes", 0) for a in attendance) / 60, 2)
    total_overtime_hours = sum(a.get("overtime_hours", 0) for a in attendance)
    
    # حساب الراتب الأساسي المستحق حسب نوع الراتب
    if salary_type == "hourly":
        earned_salary = round(total_worked_hours * hourly_rate, 2)
    elif salary_type == "daily":
        earned_salary = round(worked_days * daily_rate, 2)
    else:
        # شهري: الراتب كامل - خصم أيام الغياب
        earned_salary = round(basic_salary - (absent_days * daily_rate), 2)
    
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
    
    # جلب السلف المعتمدة
    advances = await db.advances.find({
        "employee_id": employee_id,
        "date": {"$regex": f"^{month}"},
        "status": "approved"
    }, {"_id": 0}).to_list(100)
    advance_deduction = sum(a.get("amount", 0) for a in advances)
    
    # صافي الراتب = الراتب المستحق + وقت إضافي موافق + مكافآت - خصومات - سلف
    net_salary = round(earned_salary + overtime_pay + total_bonuses - total_deductions - advance_deduction, 2)
    
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
        "net_salary": net_salary
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
    return payrolls

@router.put("/payroll/{payroll_id}/pay")
async def pay_payroll(payroll_id: str, current_user: dict = Depends(get_current_user)):
    """صرف الراتب"""
    db = get_database()
    if current_user["role"] not in [UserRole.ADMIN, UserRole.SUPER_ADMIN]:
        raise HTTPException(status_code=403, detail="غير مصرح")
    
    payroll = await db.payroll.find_one({"id": payroll_id})
    if not payroll:
        raise HTTPException(status_code=404, detail="كشف الراتب غير موجود")
    
    await db.payroll.update_one(
        {"id": payroll_id},
        {"$set": {
            "status": "paid",
            "paid_at": datetime.now(timezone.utc).isoformat(),
            "paid_by": current_user["id"]
        }}
    )
    return {"message": "تم صرف الراتب"}

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
            
            worked_days = len([a for a in attendance if a.get("status") in ["present", "late"]])
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
                earned_salary = round(basic_salary - (absent_days * daily_rate), 2)
            
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
            
            # سلف
            advances = await db.advances.find({
                "employee_id": emp["id"],
                "date": {"$regex": f"^{month}"},
                "status": "approved"
            }).to_list(100)
            advance_deduction = sum(a.get("amount", 0) for a in advances)
            
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

# ==================== PAYROLL REPORTS ====================
@router.get("/reports/payroll-summary")
async def get_payroll_summary_report(
    month: str,
    branch_id: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """تقرير ملخص الرواتب"""
    db = get_database()
    tenant_id = get_user_tenant_id(current_user)
    
    emp_query = {}
    if tenant_id:
        emp_query["tenant_id"] = tenant_id
    if branch_id:
        emp_query["branch_id"] = branch_id
    
    employees = await db.employees.find(emp_query, {"_id": 0}).to_list(1000)
    
    payroll_query = {"month": month}
    if tenant_id:
        payroll_query["tenant_id"] = tenant_id
    
    payrolls = await db.payroll.find(payroll_query, {"_id": 0}).to_list(1000)
    payroll_by_emp = {p["employee_id"]: p for p in payrolls}
    
    result = []
    total_basic = 0
    total_deductions = 0
    total_bonuses = 0
    total_advances = 0
    total_net = 0
    
    for emp in employees:
        payroll = payroll_by_emp.get(emp["id"], {})
        
        basic = payroll.get("basic_salary", emp.get("salary", 0))
        deductions = payroll.get("total_deductions", 0)
        bonuses = payroll.get("total_bonuses", 0)
        advances = payroll.get("advance_deduction", 0)
        net = payroll.get("net_salary", basic + bonuses - deductions - advances)
        status = payroll.get("status", "not_generated")
        
        total_basic += basic
        total_deductions += deductions
        total_bonuses += bonuses
        total_advances += advances
        total_net += net
        
        result.append({
            "employee_id": emp["id"],
            "employee_name": emp.get("name"),
            "department": emp.get("department"),
            "job_title": emp.get("job_title"),
            "basic_salary": basic,
            "total_deductions": deductions,
            "total_bonuses": bonuses,
            "advance_deduction": advances,
            "net_salary": net,
            "status": status
        })
    
    return {
        "month": month,
        "employees": result,
        "summary": {
            "total_employees": len(employees),
            "total_basic_salaries": total_basic,
            "total_deductions": total_deductions,
            "total_bonuses": total_bonuses,
            "total_advances": total_advances,
            "total_net_salaries": total_net
        }
    }

@router.get("/reports/employee-salary-slip/{employee_id}")
async def get_employee_salary_slip(
    employee_id: str,
    month: str,
    current_user: dict = Depends(get_current_user)
):
    """كشف راتب موظف"""
    db = get_database()
    employee = await db.employees.find_one({"id": employee_id}, {"_id": 0})
    if not employee:
        raise HTTPException(status_code=404, detail="الموظف غير موجود")
    
    # جلب الحضور
    attendance = await db.attendance.find({
        "employee_id": employee_id,
        "date": {"$regex": f"^{month}"}
    }).to_list(31)
    
    worked_days = len([a for a in attendance if a.get("status") == "present"])
    absent_days = len([a for a in attendance if a.get("status") == "absent"])
    late_count = len([a for a in attendance if a.get("late_minutes", 0) > 0])
    late_minutes = sum(a.get("late_minutes", 0) for a in attendance)
    overtime_hours = sum(a.get("overtime_hours", 0) for a in attendance)
    
    # جلب الخصومات
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
    
    # جلب السلف
    advances = await db.advances.find({
        "employee_id": employee_id,
        "date": {"$regex": f"^{month}"},
        "status": "approved"
    }, {"_id": 0}).to_list(100)
    advance_deduction = sum(a.get("amount", 0) for a in advances)
    
    basic_salary = employee.get("salary", 0)
    salary_type = employee.get("salary_type", "monthly")
    work_hours_per_day = employee.get("work_hours_per_day", 8)
    hourly_rate = basic_salary / (30 * work_hours_per_day) if work_hours_per_day > 0 else 0
    daily_rate = basic_salary / 30
    total_worked_hours = sum(a.get("worked_hours", 0) for a in attendance)
    
    # حساب الراتب المستحق حسب النوع
    if salary_type == "hourly":
        earned_salary = round(total_worked_hours * hourly_rate, 2)
    elif salary_type == "daily":
        earned_salary = round(worked_days * daily_rate, 2)
    else:
        earned_salary = round(basic_salary - (absent_days * daily_rate), 2)
    
    # وقت إضافي موافق عليه فقط
    approved_overtime = await db.overtime_requests.find({
        "employee_id": employee_id,
        "date": {"$regex": f"^{month}"},
        "status": "approved"
    }, {"_id": 0}).to_list(100)
    approved_ot_hours = sum(o.get("hours", 0) for o in approved_overtime)
    overtime_pay = round(approved_ot_hours * hourly_rate * 1.5, 2)
    
    net_salary = round(earned_salary + overtime_pay + total_bonuses - total_deductions - advance_deduction, 2)
    
    return {
        "employee": employee,
        "month": month,
        "salary_type": salary_type,
        "attendance_summary": {
            "worked_days": worked_days,
            "absent_days": absent_days,
            "total_worked_hours": total_worked_hours,
            "late_count": late_count,
            "late_minutes": late_minutes,
            "overtime_hours": overtime_hours,
            "approved_overtime_hours": approved_ot_hours,
            "overtime_pay": overtime_pay
        },
        "earnings": {
            "basic_salary": basic_salary,
            "earned_salary": earned_salary,
            "bonuses": bonuses,
            "total_bonuses": total_bonuses
        },
        "deductions": {
            "items": deductions,
            "total_deductions": total_deductions,
            "advance_deduction": advance_deduction
        },
        "net_salary": net_salary
    }
