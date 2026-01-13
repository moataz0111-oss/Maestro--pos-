"""
Inventory Models
"""
from pydantic import BaseModel, ConfigDict
from typing import Optional
from datetime import datetime

class InventoryItemCreate(BaseModel):
    name: str
    unit: str
    quantity: float = 0
    min_quantity: float = 0
    cost_per_unit: float = 0
    category: Optional[str] = None
    branch_id: Optional[str] = None
    supplier: Optional[str] = None
    barcode: Optional[str] = None

class InventoryResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    
    id: str
    name: str
    unit: str
    quantity: float = 0
    min_quantity: float = 0
    cost_per_unit: float = 0
    category: Optional[str] = None
    branch_id: Optional[str] = None
    supplier: Optional[str] = None
    barcode: Optional[str] = None
    tenant_id: Optional[str] = None
    created_at: Optional[datetime] = None

class InventoryTransaction(BaseModel):
    item_id: str
    type: str  # in, out, adjustment
    quantity: float
    notes: Optional[str] = None
    branch_id: Optional[str] = None
