"""
Driver Models
"""
from pydantic import BaseModel, ConfigDict
from typing import Optional
from datetime import datetime

class DriverCreate(BaseModel):
    name: str
    phone: str
    vehicle_type: Optional[str] = None
    vehicle_number: Optional[str] = None
    branch_id: Optional[str] = None

class DriverResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    
    id: str
    name: str
    phone: str
    vehicle_type: Optional[str] = None
    vehicle_number: Optional[str] = None
    branch_id: Optional[str] = None
    is_available: bool = True
    current_order_id: Optional[str] = None
    total_deliveries: int = 0
    total_earnings: float = 0
    tenant_id: Optional[str] = None
    user_id: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    last_location_update: Optional[datetime] = None
    created_at: Optional[datetime] = None

class DriverLocationUpdate(BaseModel):
    latitude: float
    longitude: float
