# User Models - نماذج المستخدمين
from pydantic import BaseModel, ConfigDict, EmailStr
from typing import List, Optional, Dict, Any
from .base_models import UserRole

# ==================== USER MODELS ====================

class UserCreate(BaseModel):
    """نموذج إنشاء مستخدم جديد"""
    username: str
    email: EmailStr
    password: str
    full_name: str
    role: str = UserRole.CASHIER
    branch_id: Optional[str] = None
    permissions: List[str] = []
    tenant_id: Optional[str] = None

class UserLogin(BaseModel):
    """نموذج تسجيل الدخول"""
    email: str
    password: str

class UserResponse(BaseModel):
    """نموذج استجابة المستخدم"""
    model_config = ConfigDict(extra="ignore")
    id: str
    username: str
    email: str
    full_name: str
    role: str
    branch_id: Optional[str] = None
    permissions: List[str] = []
    is_active: bool = True
    created_at: str
    tenant_id: Optional[str] = None

class UserUpdate(BaseModel):
    """نموذج تحديث المستخدم"""
    username: Optional[str] = None
    email: Optional[EmailStr] = None
    full_name: Optional[str] = None
    role: Optional[str] = None
    branch_id: Optional[str] = None
    permissions: Optional[List[str]] = None
    is_active: Optional[bool] = None

class PasswordReset(BaseModel):
    """نموذج إعادة تعيين كلمة المرور"""
    new_password: str

# ==================== STAFF MODELS ====================

class StaffCreate(BaseModel):
    """نموذج إنشاء موظف"""
    user_id: Optional[str] = None
    name: str
    phone: Optional[str] = None
    position: str
    branch_id: str

class StaffUpdate(BaseModel):
    """نموذج تحديث موظف"""
    name: Optional[str] = None
    phone: Optional[str] = None
    position: Optional[str] = None
    branch_id: Optional[str] = None
    is_active: Optional[bool] = None

class StaffResponse(BaseModel):
    """نموذج استجابة الموظف"""
    model_config = ConfigDict(extra="ignore")
    id: str
    user_id: Optional[str] = None
    name: str
    phone: Optional[str] = None
    position: str
    branch_id: str
    is_active: bool = True
    created_at: str
