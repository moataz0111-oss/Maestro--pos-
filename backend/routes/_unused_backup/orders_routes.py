"""
Order Routes - مسارات الطلبات
تم فصلها من server.py لتحسين قراءة الكود
"""
from fastapi import APIRouter, HTTPException, Depends, Query, Body
from pydantic import BaseModel, ConfigDict
from typing import Optional, List
from motor.motor_asyncio import AsyncIOMotorClient
from datetime import datetime, timezone
import os
import uuid

router = APIRouter(tags=["Orders"])

# Database connection
mongo_url = os.environ.get('MONGO_URL')
if mongo_url:
    client = AsyncIOMotorClient(mongo_url)
    db = client[os.environ.get('DB_NAME', 'maestro')]
else:
    db = None

# JWT imports
from routes.shared import get_current_user, get_user_tenant_id

# Enums
class OrderType:
    DINE_IN = "dine_in"
    TAKEAWAY = "takeaway"
    DELIVERY = "delivery"

class OrderStatus:
    PENDING = "pending"
    PREPARING = "preparing"
    READY = "ready"
    DELIVERED = "delivered"
    CANCELLED = "cancelled"

class PaymentMethod:
    CASH = "cash"
    CARD = "card"
    CREDIT = "credit"
    PENDING = "pending"


# Models
class OrderItemCreate(BaseModel):
    product_id: str
    product_name: str
    quantity: int
    price: float
    notes: Optional[str] = None


class OrderCreate(BaseModel):
    order_type: str
    table_id: Optional[str] = None
    customer_name: Optional[str] = None
    customer_phone: Optional[str] = None
    delivery_address: Optional[str] = None
    buzzer_number: Optional[str] = None
    items: List[OrderItemCreate]
    discount: float = 0
    payment_method: str
    delivery_app: Optional[str] = None
    driver_id: Optional[str] = None
    notes: Optional[str] = None
    branch_id: str
    auto_ready: bool = False


class OrderResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    order_number: int
    order_type: str
    table_id: Optional[str] = None
    customer_name: Optional[str] = None
    customer_phone: Optional[str] = None
    delivery_address: Optional[str] = None
    buzzer_number: Optional[str] = None
    items: List[dict]
    subtotal: float
    discount: float
    tax: float
    total: float
    total_cost: Optional[float] = None
    profit: Optional[float] = None
    packaging_cost: Optional[float] = None
    branch_id: str
    cashier_id: Optional[str] = None
    shift_id: Optional[str] = None
    tenant_id: Optional[str] = None
    status: str
    payment_method: str
    payment_status: Optional[str] = None
    delivery_app: Optional[str] = None
    delivery_app_name: Optional[str] = None
    delivery_commission: Optional[float] = None
    driver_id: Optional[str] = None
    driver_name: Optional[str] = None
    notes: Optional[str] = None
    created_at: str
    updated_at: Optional[str] = None


# Helper functions
async def get_next_order_number(branch_id: str) -> int:
    """Get next order number for today"""
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    counter = await db.order_counters.find_one_and_update(
        {"branch_id": branch_id, "date": today},
        {"$inc": {"counter": 1}},
        upsert=True,
        return_document=True
    )
    return counter["counter"]


async def get_delivery_app_commission(delivery_app_id: str) -> float:
    """Get delivery app commission rate"""
    app = await db.delivery_apps.find_one({"id": delivery_app_id})
    return app.get("commission_rate", 0) if app else 0


# Routes - These are imported and used from server.py
# The actual endpoints remain in server.py for now to maintain stability
# This file serves as a reference for the modular structure
