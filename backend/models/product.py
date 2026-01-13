"""
Product Models
"""
from pydantic import BaseModel, ConfigDict
from typing import Optional
from datetime import datetime

class ProductCreate(BaseModel):
    name: str
    name_en: Optional[str] = None
    description: Optional[str] = None
    price: float
    cost: float = 0
    category_id: str
    image_url: Optional[str] = None
    is_available: bool = True
    branch_id: Optional[str] = None
    barcode: Optional[str] = None
    preparation_time: int = 0
    calories: Optional[int] = None

class ProductResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    
    id: str
    name: str
    name_en: Optional[str] = None
    description: Optional[str] = None
    price: float
    cost: float = 0
    category_id: str
    image_url: Optional[str] = None
    is_available: bool = True
    branch_id: Optional[str] = None
    barcode: Optional[str] = None
    preparation_time: int = 0
    calories: Optional[int] = None
    tenant_id: Optional[str] = None
    created_at: Optional[datetime] = None
