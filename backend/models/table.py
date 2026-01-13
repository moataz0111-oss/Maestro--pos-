"""
Table Models
"""
from pydantic import BaseModel, ConfigDict
from typing import Optional
from datetime import datetime

class TableCreate(BaseModel):
    name: str
    capacity: int = 4
    branch_id: Optional[str] = None
    zone: Optional[str] = None

class TableResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    
    id: str
    name: str
    capacity: int = 4
    status: str = "available"  # available, occupied, reserved
    current_order_id: Optional[str] = None
    branch_id: Optional[str] = None
    zone: Optional[str] = None
    tenant_id: Optional[str] = None
    created_at: Optional[datetime] = None
