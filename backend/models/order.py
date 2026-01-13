"""
Order Models
"""
from pydantic import BaseModel, ConfigDict
from typing import Optional, List, Dict, Any
from datetime import datetime

class OrderItemCreate(BaseModel):
    product_id: str
    product_name: str
    price: float
    quantity: int
    notes: Optional[str] = None
    modifiers: Optional[List[Dict[str, Any]]] = None

class OrderCreate(BaseModel):
    order_type: str = "dine_in"
    table_id: Optional[str] = None
    customer_name: Optional[str] = None
    customer_phone: Optional[str] = None
    delivery_address: Optional[str] = None
    delivery_app: Optional[str] = None
    buzzer_number: Optional[str] = None
    items: List[OrderItemCreate]
    payment_method: str = "pending"
    discount: float = 0
    notes: Optional[str] = None
    branch_id: Optional[str] = None
    driver_id: Optional[str] = None

class OrderResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    
    id: str
    order_number: int
    order_type: str
    table_id: Optional[str] = None
    table_name: Optional[str] = None
    customer_name: Optional[str] = None
    customer_phone: Optional[str] = None
    delivery_address: Optional[str] = None
    delivery_app: Optional[str] = None
    buzzer_number: Optional[str] = None
    items: List[Dict[str, Any]]
    subtotal: float
    discount: float = 0
    discount_reason: Optional[str] = None
    total: float
    status: str = "pending"
    payment_method: str = "pending"
    payment_status: str = "pending"
    notes: Optional[str] = None
    branch_id: Optional[str] = None
    cashier_id: Optional[str] = None
    cashier_name: Optional[str] = None
    shift_id: Optional[str] = None
    driver_id: Optional[str] = None
    driver_name: Optional[str] = None
    driver_payment_status: str = "not_collected"
    tenant_id: Optional[str] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
