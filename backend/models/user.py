"""
User Models
"""
from pydantic import BaseModel, ConfigDict, EmailStr
from typing import Optional
from datetime import datetime

class UserCreate(BaseModel):
    email: EmailStr
    password: str
    name: str
    role: str = "cashier"
    branch_id: Optional[str] = None
    can_apply_discount: bool = False
    can_cancel_orders: bool = False
    can_view_reports: bool = False

class UserLogin(BaseModel):
    email: EmailStr
    password: str

class UserResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    
    id: str
    email: str
    name: str
    role: str
    branch_id: Optional[str] = None
    can_apply_discount: bool = False
    can_cancel_orders: bool = False
    can_view_reports: bool = False
    is_active: bool = True
    tenant_id: Optional[str] = None

class UserUpdate(BaseModel):
    name: Optional[str] = None
    role: Optional[str] = None
    branch_id: Optional[str] = None
    can_apply_discount: Optional[bool] = None
    can_cancel_orders: Optional[bool] = None
    can_view_reports: Optional[bool] = None

class PasswordReset(BaseModel):
    new_password: str
