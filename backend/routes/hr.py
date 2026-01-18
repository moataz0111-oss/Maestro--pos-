"""
HR Routes - نقاط نهاية الموارد البشرية
الموظفين، الحضور، السلف، الخصومات، المكافآت، الرواتب
"""
from fastapi import APIRouter, HTTPException, Depends
from typing import List, Optional
from datetime import datetime, timezone
import uuid

from core.database import db
from models.schemas import (
    EmployeeCreate, EmployeeUpdate, EmployeeResponse,
    AttendanceCreate, AttendanceResponse,
    AdvanceCreate, AdvanceResponse,
    DeductionCreate, DeductionResponse,
    BonusCreate, BonusResponse,
    PayrollResponse
)
from utils.auth import get_current_user, build_tenant_query, get_user_tenant_id
from models.enums import UserRole

router = APIRouter(prefix="/hr", tags=["Human Resources"])

# ==================== الموظفين ====================

@router.post("/employees", response_model=EmployeeResponse)
async def create_employee(employee: EmployeeCreate, current_user: dict = Depends(get_current_user)):
    """إنشاء موظف جديد"""
    if current_user["role"] not in [UserRole.ADMIN, UserRole.MANAGER, UserRole.SUPER_ADMIN]:
        raise HTTPException(status_code=403, detail="غير مصرح")
    
    employee_doc = {
        "id": str(uuid.uuid4()),
        **employee.model_dump(),
        "tenant_id": get_user_tenant_id(current_user),
        "is_active": True,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.employees.insert_one(employee_doc)
    del employee_doc["_id"]
    return employee_doc


@router.get("/employees", response_model=List[EmployeeResponse])
async def get_employees(
    branch_id: Optional[str] = None,
    department: Optional[str] = None,
    is_active: Optional[bool] = None,
    current_user: dict = Depends(get_current_user)
):
    """جلب قائمة الموظفين"""
    query = build_tenant_query(current_user)
    if branch_id:
        query["branch_id"] = branch_id
    if department:
        query["department"] = department
    if is_active is not None:
        query["is_active"] = is_active
    
    employees = await db.employees.find(query, {"_id": 0}).to_list(1000)
    return employees


@router.get("/employees/{employee_id}", response_model=EmployeeResponse)
async def get_employee(employee_id: str, current_user: dict = Depends(get_current_user)):
    """جلب موظف محدد"""
    query = build_tenant_query(current_user, {"id": employee_id})
    employee = await db.employees.find_one(query, {"_id": 0})
    if not employee:
        raise HTTPException(status_code=404, detail="الموظف غير موجود")
    return employee


@router.put("/employees/{employee_id}")
async def update_employee(employee_id: str, update: EmployeeUpdate, current_user: dict = Depends(get_current_user)):
    """تحديث بيانات موظف"""
    if current_user["role"] not in [UserRole.ADMIN, UserRole.MANAGER, UserRole.SUPER_ADMIN]:
        raise HTTPException(status_code=403, detail="غير مصرح")
    
    query = build_tenant_query(current_user, {"id": employee_id})
    employee = await db.employees.find_one(query)
    if not employee:
        raise HTTPException(status_code=404, detail="الموظف غير موجود")
    
    update_data = {k: v for k, v in update.model_dump().items() if v is not None}
    if update_data:
        await db.employees.update_one({"id": employee_id}, {"$set": update_data})
    
    return await db.employees.find_one({"id": employee_id}, {"_id": 0})


@router.delete("/employees/{employee_id}")
async def delete_employee(employee_id: str, current_user: dict = Depends(get_current_user)):
    """حذف/تعطيل موظف"""
    if current_user["role"] not in [UserRole.ADMIN, UserRole.SUPER_ADMIN]:
        raise HTTPException(status_code=403, detail="غير مصرح")
    
    query = build_tenant_query(current_user, {"id": employee_id})
    employee = await db.employees.find_one(query)
    if not employee:
        raise HTTPException(status_code=404, detail="الموظف غير موجود")
    
    await db.employees.update_one({"id": employee_id}, {"$set": {"is_active": False}})
    return {"message": "تم تعطيل الموظف"}


# ==================== الحضور والانصراف ====================

@router.post("/attendance", response_model=AttendanceResponse)
async def create_attendance(attendance: AttendanceCreate, current_user: dict = Depends(get_current_user)):
    """تسجيل حضور/انصراف"""
    if current_user["role"] not in [UserRole.ADMIN, UserRole.MANAGER, UserRole.SUPERVISOR, UserRole.SUPER_ADMIN]:
        raise HTTPException(status_code=403, detail="غير مصرح")
    
    employee = await db.employees.find_one({"id": attendance.employee_id}, {"_id": 0})
    if not employee:
        raise HTTPException(status_code=404, detail="الموظف غير موجود")
    
    worked_hours = None
    if attendance.check_in and attendance.check_out:
        try:
            check_in = datetime.strptime(attendance.check_in, "%H:%M")
            check_out = datetime.strptime(attendance.check_out, "%H:%M")
            worked_hours = (check_out - check_in).seconds / 3600
        except:
            pass
    
    attendance_doc = {
        "id": str(uuid.uuid4()),
        **attendance.model_dump(),
        "employee_name": employee.get("name"),
        "worked_hours": worked_hours,
        "tenant_id": get_user_tenant_id(current_user),
        "created_by": current_user["id"],
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.attendance.insert_one(attendance_doc)
    del attendance_doc["_id"]
    return attendance_doc


@router.get("/attendance")
async def get_attendance(
    employee_id: Optional[str] = None,
    branch_id: Optional[str] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """جلب سجلات الحضور"""
    query = build_tenant_query(current_user)
    if employee_id:
        query["employee_id"] = employee_id
    if branch_id:
        employees = await db.employees.find({"branch_id": branch_id}, {"id": 1}).to_list(1000)
        emp_ids = [e["id"] for e in employees]
        query["employee_id"] = {"$in": emp_ids}
    if start_date:
        query["date"] = {"$gte": start_date}
    if end_date:
        query.setdefault("date", {})["$lte"] = end_date
    
    records = await db.attendance.find(query, {"_id": 0}).sort("date", -1).to_list(1000)
    return records


@router.put("/attendance/{attendance_id}")
async def update_attendance(attendance_id: str, update: dict, current_user: dict = Depends(get_current_user)):
    """تحديث سجل حضور"""
    if current_user["role"] not in [UserRole.ADMIN, UserRole.MANAGER, UserRole.SUPERVISOR, UserRole.SUPER_ADMIN]:
        raise HTTPException(status_code=403, detail="غير مصرح")
    
    query = build_tenant_query(current_user, {"id": attendance_id})
    record = await db.attendance.find_one(query)
    if not record:
        raise HTTPException(status_code=404, detail="السجل غير موجود")
    
    check_in = update.get("check_in", record.get("check_in"))
    check_out = update.get("check_out", record.get("check_out"))
    worked_hours = record.get("worked_hours")
    
    if check_in and check_out:
        try:
            ci = datetime.strptime(check_in, "%H:%M")
            co = datetime.strptime(check_out, "%H:%M")
            worked_hours = (co - ci).seconds / 3600
        except:
            pass
    
    update["worked_hours"] = worked_hours
    await db.attendance.update_one({"id": attendance_id}, {"$set": update})
    return await db.attendance.find_one({"id": attendance_id}, {"_id": 0})


# ==================== السلف ====================

@router.post("/advances", response_model=AdvanceResponse)
async def create_advance(advance: AdvanceCreate, current_user: dict = Depends(get_current_user)):
    """تسجيل سلفة"""
    if current_user["role"] not in [UserRole.ADMIN, UserRole.MANAGER, UserRole.SUPER_ADMIN]:
        raise HTTPException(status_code=403, detail="غير مصرح")
    
    employee = await db.employees.find_one({"id": advance.employee_id}, {"_id": 0})
    if not employee:
        raise HTTPException(status_code=404, detail="الموظف غير موجود")
    
    monthly_deduction = advance.amount / advance.deduction_months
    
    advance_doc = {
        "id": str(uuid.uuid4()),
        **advance.model_dump(),
        "employee_name": employee.get("name"),
        "monthly_deduction": monthly_deduction,
        "remaining_amount": advance.amount,
        "paid_months": 0,
        "status": "active",
        "tenant_id": get_user_tenant_id(current_user),
        "approved_by": current_user["full_name"],
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.advances.insert_one(advance_doc)
    del advance_doc["_id"]
    return advance_doc


@router.get("/advances")
async def get_advances(
    employee_id: Optional[str] = None,
    status: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """جلب السلف"""
    query = build_tenant_query(current_user)
    if employee_id:
        query["employee_id"] = employee_id
    if status:
        query["status"] = status
    
    advances = await db.advances.find(query, {"_id": 0}).sort("created_at", -1).to_list(1000)
    return advances


# ==================== الخصومات ====================

@router.post("/deductions", response_model=DeductionResponse)
async def create_deduction(deduction: DeductionCreate, current_user: dict = Depends(get_current_user)):
    """تسجيل خصم"""
    if current_user["role"] not in [UserRole.ADMIN, UserRole.MANAGER, UserRole.SUPERVISOR, UserRole.SUPER_ADMIN]:
        raise HTTPException(status_code=403, detail="غير مصرح")
    
    employee = await db.employees.find_one({"id": deduction.employee_id}, {"_id": 0})
    if not employee:
        raise HTTPException(status_code=404, detail="الموظف غير موجود")
    
    # حساب مبلغ الخصم إذا كان بالساعات أو الأيام
    amount = deduction.amount or 0
    if deduction.hours and employee.get("hourly_rate"):
        amount += deduction.hours * employee["hourly_rate"]
    if deduction.days and employee.get("salary"):
        daily_rate = employee["salary"] / 30
        amount += deduction.days * daily_rate
    
    deduction_doc = {
        "id": str(uuid.uuid4()),
        **deduction.model_dump(),
        "amount": amount,
        "employee_name": employee.get("name"),
        "tenant_id": get_user_tenant_id(current_user),
        "created_by": current_user["full_name"],
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
    """جلب الخصومات"""
    query = build_tenant_query(current_user)
    if employee_id:
        query["employee_id"] = employee_id
    if start_date:
        query["date"] = {"$gte": start_date}
    if end_date:
        query.setdefault("date", {})["$lte"] = end_date
    
    deductions = await db.deductions.find(query, {"_id": 0}).sort("date", -1).to_list(1000)
    return deductions


# ==================== المكافآت ====================

@router.post("/bonuses", response_model=BonusResponse)
async def create_bonus(bonus: BonusCreate, current_user: dict = Depends(get_current_user)):
    """تسجيل مكافأة"""
    if current_user["role"] not in [UserRole.ADMIN, UserRole.MANAGER, UserRole.SUPER_ADMIN]:
        raise HTTPException(status_code=403, detail="غير مصرح")
    
    employee = await db.employees.find_one({"id": bonus.employee_id}, {"_id": 0})
    if not employee:
        raise HTTPException(status_code=404, detail="الموظف غير موجود")
    
    amount = bonus.amount or 0
    if bonus.hours and employee.get("hourly_rate"):
        amount += bonus.hours * employee["hourly_rate"]
    
    bonus_doc = {
        "id": str(uuid.uuid4()),
        **bonus.model_dump(),
        "amount": amount,
        "employee_name": employee.get("name"),
        "tenant_id": get_user_tenant_id(current_user),
        "approved_by": current_user["full_name"],
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
    """جلب المكافآت"""
    query = build_tenant_query(current_user)
    if employee_id:
        query["employee_id"] = employee_id
    if start_date:
        query["date"] = {"$gte": start_date}
    if end_date:
        query.setdefault("date", {})["$lte"] = end_date
    
    bonuses = await db.bonuses.find(query, {"_id": 0}).sort("date", -1).to_list(1000)
    return bonuses
