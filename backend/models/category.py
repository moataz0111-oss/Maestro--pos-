"""
Category Models
"""
from pydantic import BaseModel, ConfigDict
from typing import Optional
from datetime import datetime

class CategoryCreate(BaseModel):
    name: str
    name_en: Optional[str] = None
    description: Optional[str] = None
    image_url: Optional[str] = None
    display_order: int = 0
    kitchen_section_id: Optional[str] = None

class CategoryResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    
    id: str
    name: str
    name_en: Optional[str] = None
    description: Optional[str] = None
    image_url: Optional[str] = None
    display_order: int = 0
    kitchen_section_id: Optional[str] = None
    tenant_id: Optional[str] = None
    created_at: Optional[datetime] = None
