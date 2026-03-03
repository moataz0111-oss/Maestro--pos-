"""
Tenant Models
"""
from pydantic import BaseModel, ConfigDict, EmailStr
from typing import Optional
from datetime import datetime

class TenantCreate(BaseModel):
    name: str
    slug: str
    owner_name: str
    owner_email: EmailStr
    owner_phone: str
    subscription_type: str = "trial"
    max_branches: int = 1
    max_users: int = 5

class TenantResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    
    id: str
    name: str
    slug: str
    owner_name: str
    owner_email: str
    owner_phone: str
    subscription_type: str
    max_branches: int
    max_users: int
    is_active: bool = True
    created_at: Optional[datetime] = None
