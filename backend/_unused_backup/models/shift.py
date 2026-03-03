"""
Shift Models
"""
from pydantic import BaseModel, ConfigDict
from typing import Optional, Dict, Any
from datetime import datetime

class ShiftCreate(BaseModel):
    opening_balance: float = 0
    branch_id: Optional[str] = None

class ShiftClose(BaseModel):
    closing_balance: float
    notes: Optional[str] = None

class CashRegisterClose(BaseModel):
    actual_cash: float
    notes: Optional[str] = None

class ShiftResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    
    id: str
    cashier_id: str
    cashier_name: str
    branch_id: Optional[str] = None
    opening_balance: float = 0
    closing_balance: Optional[float] = None
    expected_balance: float = 0
    difference: float = 0
    total_sales: float = 0
    total_cash: float = 0
    total_card: float = 0
    total_credit: float = 0
    total_delivery_apps: float = 0
    total_orders: int = 0
    total_cancelled: int = 0
    total_discounts: float = 0
    expenses: float = 0
    purchases: float = 0
    notes: Optional[str] = None
    status: str = "open"
    tenant_id: Optional[str] = None
    opened_at: Optional[datetime] = None
    closed_at: Optional[datetime] = None
    delivery_app_breakdown: Optional[Dict[str, Any]] = None
