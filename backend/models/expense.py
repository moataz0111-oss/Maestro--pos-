"""
Expense Models
"""
from pydantic import BaseModel, ConfigDict
from typing import Optional
from datetime import datetime

class ExpenseCreate(BaseModel):
    category: str
    amount: float
    description: Optional[str] = None
    payment_method: str = "cash"
    branch_id: Optional[str] = None
    date: Optional[str] = None
    receipt_number: Optional[str] = None

class ExpenseResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    
    id: str
    category: str
    amount: float
    description: Optional[str] = None
    payment_method: str
    branch_id: Optional[str] = None
    date: Optional[str] = None
    receipt_number: Optional[str] = None
    tenant_id: Optional[str] = None
    created_by: Optional[str] = None
    created_at: Optional[datetime] = None
