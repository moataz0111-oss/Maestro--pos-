"""
Enums and Constants
"""

class UserRole:
    SUPER_ADMIN = "super_admin"
    ADMIN = "admin"
    MANAGER = "manager"
    SUPERVISOR = "supervisor"
    CASHIER = "cashier"
    DELIVERY = "delivery"

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
