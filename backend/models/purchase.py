"""
Purchase Models
"""
from pydantic import BaseModel, ConfigDict
from typing import Optional, List, Dict, Any
from datetime import datetime

class PurchaseCreate(BaseModel):
    supplier: str
    items: List[Dict[str, Any]]
    total_amount: float
    payment_method: str = "cash"
    notes: Optional[str] = None
    invoice_number: Optional[str] = None
    branch_id: Optional[str] = None

class PurchaseResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    
    id: str
    supplier: str
    items: List[Dict[str, Any]]
    total_amount: float
    payment_method: str
    notes: Optional[str] = None
    invoice_number: Optional[str] = None
    branch_id: Optional[str] = None
    tenant_id: Optional[str] = None
    created_by: Optional[str] = None
    created_at: Optional[datetime] = None
