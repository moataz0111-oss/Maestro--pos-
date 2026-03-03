"""
Delivery App Settings Models
"""
from pydantic import BaseModel
from typing import Optional

class DeliveryAppSettingCreate(BaseModel):
    name: str
    commission_type: str = "percentage"  # percentage, fixed
    commission_value: float = 0
    is_active: bool = True
    color: Optional[str] = None
    logo_url: Optional[str] = None
    notes: Optional[str] = None
    branch_id: Optional[str] = None
