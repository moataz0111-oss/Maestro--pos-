"""
Customer Models
"""
from pydantic import BaseModel, ConfigDict
from typing import Optional
from datetime import datetime

class CustomerCreate(BaseModel):
    name: str
    phone: str
    phone2: Optional[str] = None
    address: Optional[str] = None
    area: Optional[str] = None
    notes: Optional[str] = None
    is_blocked: bool = False

class CustomerResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    
    id: str
    name: str
    phone: str
    phone2: Optional[str] = None
    address: Optional[str] = None
    area: Optional[str] = None
    notes: Optional[str] = None
    is_blocked: bool = False
    tenant_id: Optional[str] = None
    total_orders: int = 0
    total_spent: float = 0.0
    last_order_date: Optional[datetime] = None
    created_at: Optional[datetime] = None
