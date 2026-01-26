# HR Models - نماذج الموارد البشرية
from pydantic import BaseModel, ConfigDict, EmailStr
from typing import List, Optional, Dict, Any

# ==================== EMPLOYEE MODELS ====================

class EmployeeCreate(BaseModel):
    """نموذج إنشاء موظف"""
    name: str
    phone: str
    email: Optional[str] = None
    national_id: Optional[str] = None
    position: str
    department: Optional[str] = None
    branch_id: str
    hire_date: str
    salary: float
    salary_type: str = "monthly"
    work_hours_per_day: float = 8.0
    user_id: Optional[str] = None

class EmployeeResponse(BaseModel):
    """نموذج استجابة الموظف"""
    model_config = ConfigDict(extra="ignore")
    id: str
    name: str
    phone: str
    email: Optional[str] = None
    national_id: Optional[str] = None
    position: str
    department: Optional[str] = None
    branch_id: str
    hire_date: str
    salary: float
    salary_type: str
    work_hours_per_day: float
    user_id: Optional[str] = None
    is_active: bool = True
    created_at: str
    tenant_id: Optional[str] = None

class EmployeeUpdate(BaseModel):
    """نموذج تحديث الموظف"""
    name: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    national_id: Optional[str] = None
    position: Optional[str] = None
    department: Optional[str] = None
    branch_id: Optional[str] = None
    salary: Optional[float] = None
    salary_type: Optional[str] = None
    work_hours_per_day: Optional[float] = None
    is_active: Optional[bool] = None

# ==================== ATTENDANCE MODELS ====================

class AttendanceCreate(BaseModel):
    """نموذج تسجيل حضور"""
    employee_id: str
    date: str
    check_in: Optional[str] = None
    check_out: Optional[str] = None
    status: str = "present"
    notes: Optional[str] = None
    source: str = "manual"

class AttendanceResponse(BaseModel):
    """نموذج استجابة الحضور"""
    model_config = ConfigDict(extra="ignore")
    id: str
    employee_id: str
    employee_name: Optional[str] = None
    date: str
    check_in: Optional[str] = None
    check_out: Optional[str] = None
    worked_hours: Optional[float] = None
    status: str
    notes: Optional[str] = None
    source: str
    created_at: str

# ==================== ADVANCE MODELS ====================

class AdvanceCreate(BaseModel):
    """نموذج إنشاء سلفة"""
    employee_id: str
    amount: float
    reason: Optional[str] = None
    deduction_months: int = 1
    date: Optional[str] = None

class AdvanceResponse(BaseModel):
    """نموذج استجابة السلفة"""
    model_config = ConfigDict(extra="ignore")
    id: str
    employee_id: str
    employee_name: Optional[str] = None
    amount: float
    remaining_amount: float
    deducted_amount: float = 0
    deduction_months: int
    monthly_deduction: float
    reason: Optional[str] = None
    status: str
    date: str
    created_by: str
    created_at: str

# ==================== DEDUCTION MODELS ====================

class DeductionCreate(BaseModel):
    """نموذج إنشاء خصم"""
    employee_id: str
    deduction_type: str
    amount: Optional[float] = None
    hours: Optional[float] = None
    days: Optional[float] = None
    reason: str
    date: str

class DeductionResponse(BaseModel):
    """نموذج استجابة الخصم"""
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

# ==================== BONUS MODELS ====================

class BonusCreate(BaseModel):
    """نموذج إنشاء مكافأة"""
    employee_id: str
    bonus_type: str
    amount: Optional[float] = None
    hours: Optional[float] = None
    reason: str
    date: str

class BonusResponse(BaseModel):
    """نموذج استجابة المكافأة"""
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

# ==================== PAYROLL MODELS ====================

class PayrollCreate(BaseModel):
    """نموذج إنشاء كشف راتب"""
    employee_id: str
    month: str
    basic_salary: float
    total_deductions: float = 0
    total_bonuses: float = 0
    advance_deduction: float = 0
    net_salary: float
    notes: Optional[str] = None

class PayrollResponse(BaseModel):
    """نموذج استجابة كشف الراتب"""
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
    paid_at: Optional[str] = None

# ==================== SHIFT MODELS ====================

class ShiftCreate(BaseModel):
    """نموذج بدء وردية"""
    cashier_id: str
    branch_id: str
    opening_cash: float

class ShiftClose(BaseModel):
    """نموذج إغلاق وردية"""
    closing_cash: float
    notes: Optional[str] = None

class CashRegisterClose(BaseModel):
    """نموذج إغلاق صندوق مع جرد الفئات"""
    denominations: Dict[str, int] = {}
    notes: Optional[str] = None

class ShiftResponse(BaseModel):
    """نموذج استجابة الوردية"""
    model_config = ConfigDict(extra="ignore")
    id: str
    cashier_id: str
    cashier_name: str
    branch_id: str
    opening_cash: float
    closing_cash: Optional[float] = None
    expected_cash: Optional[float] = None
    cash_difference: Optional[float] = None
    total_sales: float = 0.0
    total_cost: float = 0.0
    gross_profit: float = 0.0
    total_orders: int = 0
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
    cancelled_by: List[Dict] = []
