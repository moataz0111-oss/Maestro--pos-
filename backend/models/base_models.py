# Base Models - الثوابت والنماذج الأساسية
from pydantic import BaseModel, ConfigDict, EmailStr
from typing import List, Optional, Dict, Any

# ==================== CONSTANTS ====================

class UserRole:
    """أدوار المستخدمين في النظام"""
    SUPER_ADMIN = "super_admin"  # مالك النظام الرئيسي
    ADMIN = "admin"
    MANAGER = "manager"
    SUPERVISOR = "supervisor"
    CASHIER = "cashier"
    DELIVERY = "delivery"  # دور السائقين

class OrderType:
    """أنواع الطلبات"""
    DINE_IN = "dine_in"
    TAKEAWAY = "takeaway"
    DELIVERY = "delivery"

class OrderStatus:
    """حالات الطلب"""
    PENDING = "pending"
    PREPARING = "preparing"
    READY = "ready"
    DELIVERED = "delivered"
    CANCELLED = "cancelled"

class PaymentMethod:
    """طرق الدفع"""
    CASH = "cash"
    CARD = "card"
    CREDIT = "credit"
    PENDING = "pending"

# ==================== CURRENCY MODEL ====================

class Currency(BaseModel):
    """نموذج العملة"""
    code: str
    name: str
    symbol: str
    exchange_rate: float
