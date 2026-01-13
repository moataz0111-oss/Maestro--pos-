"""
Branch Models
"""
from pydantic import BaseModel, ConfigDict
from typing import Optional
from datetime import datetime

class BranchCreate(BaseModel):
    name: str
    address: Optional[str] = None
    phone: Optional[str] = None
    manager_id: Optional[str] = None
    is_main: bool = False

class BranchResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    
    id: str
    name: str
    address: Optional[str] = None
    phone: Optional[str] = None
    manager_id: Optional[str] = None
    is_main: bool = False
    is_active: bool = True
    tenant_id: Optional[str] = None
    created_at: Optional[datetime] = None
