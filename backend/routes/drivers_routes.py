"""
Drivers Routes - إدارة السائقين والتوصيل
"""
from fastapi import APIRouter, Depends, HTTPException, Body
from pydantic import BaseModel, ConfigDict
from typing import Optional, List, Dict, Any
from datetime import datetime, timezone
import uuid
import logging

from .shared import (
    get_database, get_current_user, get_user_tenant_id,
    build_tenant_query, UserRole, OrderStatus
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/drivers", tags=["Drivers"])

# ==================== MODELS ====================
class DriverCreate(BaseModel):
    name: str
    phone: str
    branch_id: str
    user_id: Optional[str] = None

class DriverResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    name: str
    phone: str
    branch_id: str
    is_available: bool = True
    current_order_id: Optional[str] = None
    total_deliveries: int = 0
    user_id: Optional[str] = None
    location_lat: Optional[float] = None
    location_lng: Optional[float] = None
    location_updated_at: Optional[str] = None
    current_order: Optional[Dict[str, Any]] = None
    is_active: bool = True

class DriverLocationUpdate(BaseModel):
    latitude: float
    longitude: float

# ==================== DRIVER CRUD ====================
@router.post("", response_model=DriverResponse)
async def create_driver(driver: DriverCreate, current_user: dict = Depends(get_current_user)):
    """إنشاء سائق جديد"""
    db = get_database()
    if current_user["role"] not in [UserRole.ADMIN, UserRole.MANAGER, UserRole.SUPER_ADMIN]:
        raise HTTPException(status_code=403, detail="غير مصرح")
    
    driver_doc = {
        "id": str(uuid.uuid4()),
        **driver.model_dump(),
        "tenant_id": get_user_tenant_id(current_user),
        "is_active": True,
        "is_available": True,
        "current_order_id": None,
        "total_deliveries": 0
    }
    await db.drivers.insert_one(driver_doc)
    del driver_doc["_id"]
    return driver_doc

@router.get("", response_model=List[DriverResponse])
async def get_drivers(branch_id: Optional[str] = None, include_orders: bool = False, current_user: dict = Depends(get_current_user)):
    """جلب قائمة السائقين"""
    db = get_database()
    query = build_tenant_query(current_user)
    if branch_id:
        query["branch_id"] = branch_id
    drivers = await db.drivers.find(query, {"_id": 0}).to_list(100)
    
    if include_orders:
        for driver in drivers:
            if driver.get("current_order_id"):
                order = await db.orders.find_one({"id": driver["current_order_id"]}, {"_id": 0})
                if order:
                    driver["current_order"] = {
                        "id": order.get("id"),
                        "order_number": order.get("order_number"),
                        "total": order.get("total", 0),
                        "customer_name": order.get("customer_name"),
                        "customer_phone": order.get("customer_phone"),
                        "status": order.get("status")
                    }
    return drivers

@router.put("/{driver_id}")
async def update_driver(driver_id: str, driver: DriverCreate, current_user: dict = Depends(get_current_user)):
    """تعديل بيانات السائق"""
    db = get_database()
    query = build_tenant_query(current_user, {"id": driver_id})
    existing = await db.drivers.find_one(query)
    if not existing:
        raise HTTPException(status_code=404, detail="السائق غير موجود")
    
    update_data = {"name": driver.name, "phone": driver.phone}
    if driver.user_id:
        update_data["user_id"] = driver.user_id
    
    await db.drivers.update_one({"id": driver_id}, {"$set": update_data})
    return {"message": "تم تعديل السائق"}

@router.put("/{driver_id}/link-user")
async def link_driver_to_user(driver_id: str, user_id: str, current_user: dict = Depends(get_current_user)):
    """ربط السائق بحساب مستخدم"""
    db = get_database()
    query = build_tenant_query(current_user, {"id": driver_id})
    driver = await db.drivers.find_one(query)
    if not driver:
        raise HTTPException(status_code=404, detail="السائق غير موجود")
    
    user = await db.users.find_one({"id": user_id})
    if not user:
        raise HTTPException(status_code=404, detail="المستخدم غير موجود")
    
    if user.get("role") != "delivery":
        raise HTTPException(status_code=400, detail="المستخدم ليس سائق توصيل")
    
    await db.drivers.update_one({"id": driver_id}, {"$set": {"user_id": user_id}})
    return {"message": "تم ربط السائق بالمستخدم"}

@router.delete("/{driver_id}")
async def delete_driver(driver_id: str, current_user: dict = Depends(get_current_user)):
    """حذف السائق"""
    db = get_database()
    existing = await db.drivers.find_one({"id": driver_id})
    if not existing:
        raise HTTPException(status_code=404, detail="السائق غير موجود")
    
    if existing.get("current_order_id"):
        raise HTTPException(status_code=400, detail="لا يمكن حذف سائق لديه طلب نشط")
    
    await db.drivers.delete_one({"id": driver_id})
    return {"message": "تم حذف السائق"}

@router.get("/by-user/{user_id}")
async def get_driver_by_user(user_id: str, current_user: dict = Depends(get_current_user)):
    """جلب السائق المرتبط بحساب المستخدم"""
    db = get_database()
    driver = await db.drivers.find_one({"user_id": user_id}, {"_id": 0})
    if not driver:
        raise HTTPException(status_code=404, detail="لم يتم ربط حسابك بسائق")
    return driver

@router.get("/{driver_id}/with-order")
async def get_driver_with_current_order(driver_id: str, current_user: dict = Depends(get_current_user)):
    """جلب السائق مع بيانات الطلب الحالي"""
    db = get_database()
    driver = await db.drivers.find_one({"id": driver_id}, {"_id": 0})
    if not driver:
        raise HTTPException(status_code=404, detail="السائق غير موجود")
    
    if driver.get("current_order_id"):
        order = await db.orders.find_one({"id": driver["current_order_id"]}, {"_id": 0})
        if order:
            driver["current_order"] = {
                "id": order.get("id"),
                "order_number": order.get("order_number"),
                "total": order.get("total", 0),
                "customer_name": order.get("customer_name"),
                "customer_phone": order.get("customer_phone"),
                "delivery_address": order.get("delivery_address"),
                "status": order.get("status"),
                "created_at": order.get("created_at")
            }
    return driver

# ==================== DRIVER OPERATIONS ====================
@router.put("/{driver_id}/assign")
async def assign_driver(driver_id: str, order_id: str, current_user: dict = Depends(get_current_user)):
    """تعيين سائق لطلب"""
    db = get_database()
    await db.drivers.update_one(
        {"id": driver_id},
        {"$set": {"is_available": False, "current_order_id": order_id}}
    )
    await db.orders.update_one(
        {"id": order_id},
        {"$set": {"driver_id": driver_id, "status": OrderStatus.PREPARING}}
    )
    return {"message": "تم تعيين السائق"}

@router.put("/{driver_id}/complete")
async def complete_delivery(driver_id: str, order_id: Optional[str] = None, current_user: dict = Depends(get_current_user)):
    """إكمال التوصيل"""
    db = get_database()
    driver = await db.drivers.find_one({"id": driver_id})
    if not driver:
        raise HTTPException(status_code=404, detail="السائق غير موجود")
    
    target_order_id = order_id or driver.get("current_order_id")
    
    if target_order_id:
        await db.orders.update_one(
            {"id": target_order_id},
            {"$set": {"status": OrderStatus.DELIVERED, "delivered_at": datetime.now(timezone.utc).isoformat()}}
        )
    
    await db.drivers.update_one(
        {"id": driver_id},
        {"$set": {"is_available": True, "current_order_id": None}, "$inc": {"total_deliveries": 1}}
    )
    return {"message": "تم التوصيل"}

# ==================== DRIVER STATS ====================
@router.get("/{driver_id}/stats")
async def get_driver_stats(driver_id: str):
    """جلب إحصائيات السائق"""
    db = get_database()
    driver = await db.drivers.find_one({"id": driver_id})
    if not driver:
        raise HTTPException(status_code=404, detail="السائق غير موجود")
    
    orders = await db.orders.find({
        "driver_id": driver_id,
        "status": {"$in": [OrderStatus.DELIVERED, OrderStatus.PENDING, OrderStatus.READY]}
    }, {"_id": 0}).to_list(1000)
    
    unpaid_total = sum(o.get("total", 0) for o in orders if o.get("driver_payment_status") != "paid")
    paid_total = sum(o.get("total", 0) for o in orders if o.get("driver_payment_status") == "paid")
    
    today = datetime.now(timezone.utc).date().isoformat()
    paid_today = sum(
        o.get("total", 0) for o in orders 
        if o.get("driver_payment_status") == "paid" and o.get("driver_paid_at", "").startswith(today)
    )
    
    pending_orders = len([o for o in orders if o.get("status") in [OrderStatus.PENDING, OrderStatus.READY]])
    
    return {
        "unpaid_total": unpaid_total,
        "paid_total": paid_total,
        "paid_today": paid_today,
        "pending_orders": pending_orders,
        "total_orders": len(orders)
    }

@router.get("/{driver_id}/orders")
async def get_driver_orders(driver_id: str):
    """جلب طلبات السائق"""
    db = get_database()
    driver = await db.drivers.find_one({"id": driver_id})
    if not driver:
        raise HTTPException(status_code=404, detail="السائق غير موجود")
    
    orders = await db.orders.find({
        "driver_id": driver_id,
        "status": {"$in": [OrderStatus.DELIVERED, OrderStatus.PENDING, OrderStatus.READY]}
    }, {"_id": 0}).to_list(100)
    
    orders.sort(key=lambda x: (x.get("driver_payment_status") == "paid", x.get("created_at", "")), reverse=False)
    return orders

# ==================== DRIVER PAYMENTS ====================
@router.post("/{driver_id}/collect-payment")
async def collect_driver_payment(driver_id: str, amount: float = 0, current_user: dict = Depends(get_current_user)):
    """تحصيل مبلغ من السائق"""
    db = get_database()
    driver = await db.drivers.find_one({"id": driver_id})
    if not driver:
        raise HTTPException(status_code=404, detail="السائق غير موجود")
    
    result = await db.orders.update_many(
        {"driver_id": driver_id, "driver_payment_status": {"$ne": "paid"}},
        {"$set": {
            "driver_payment_status": "paid",
            "driver_paid_at": datetime.now(timezone.utc).isoformat(),
            "driver_paid_by": current_user["id"]
        }}
    )
    
    payment_record = {
        "id": str(uuid.uuid4()),
        "driver_id": driver_id,
        "amount": amount,
        "collected_by": current_user["id"],
        "collected_at": datetime.now(timezone.utc).isoformat(),
        "orders_count": result.modified_count
    }
    await db.driver_payments.insert_one(payment_record)
    
    return {
        "message": f"تم تحصيل المبلغ وتحديث {result.modified_count} طلب",
        "orders_updated": result.modified_count
    }

# ==================== DRIVER PORTAL (No Auth) ====================
@router.get("/portal/{driver_id}")
async def get_driver_portal_data(driver_id: str):
    """جلب بيانات السائق لصفحة الهاتف - بدون مصادقة"""
    db = get_database()
    driver = await db.drivers.find_one({"id": driver_id}, {"_id": 0})
    if not driver:
        raise HTTPException(status_code=404, detail="السائق غير موجود")
    
    orders = await db.orders.find({
        "driver_id": driver_id,
        "status": {"$in": [OrderStatus.PENDING, OrderStatus.PREPARING, OrderStatus.READY, OrderStatus.DELIVERED]}
    }, {"_id": 0}).sort("created_at", -1).to_list(50)
    
    today = datetime.now(timezone.utc).date().isoformat()
    unpaid_total = sum(o.get("total", 0) for o in orders if o.get("driver_payment_status") != "paid" and o.get("status") == OrderStatus.DELIVERED)
    paid_today = sum(
        o.get("total", 0) for o in orders 
        if o.get("driver_payment_status") == "paid" and o.get("driver_paid_at", "").startswith(today)
    )
    pending_orders = len([o for o in orders if o.get("status") in [OrderStatus.PENDING, OrderStatus.PREPARING, OrderStatus.READY]])
    
    return {
        "driver": driver,
        "orders": orders,
        "stats": {
            "unpaid_total": unpaid_total,
            "paid_today": paid_today,
            "pending_orders": pending_orders
        }
    }

@router.get("/portal/by-phone/{phone}")
async def get_driver_by_phone(phone: str):
    """جلب بيانات السائق برقم الهاتف"""
    db = get_database()
    driver = await db.drivers.find_one({"phone": phone}, {"_id": 0})
    if not driver:
        raise HTTPException(status_code=404, detail="السائق غير موجود")
    
    orders = await db.orders.find({
        "driver_id": driver["id"],
        "status": {"$in": [OrderStatus.PENDING, OrderStatus.PREPARING, OrderStatus.READY, OrderStatus.DELIVERED]}
    }, {"_id": 0}).sort("created_at", -1).to_list(50)
    
    today = datetime.now(timezone.utc).date().isoformat()
    unpaid_total = sum(o.get("total", 0) for o in orders if o.get("driver_payment_status") != "paid" and o.get("status") == OrderStatus.DELIVERED)
    paid_today = sum(
        o.get("total", 0) for o in orders 
        if o.get("driver_payment_status") == "paid" and o.get("driver_paid_at", "").startswith(today)
    )
    pending_orders = len([o for o in orders if o.get("status") in [OrderStatus.PENDING, OrderStatus.PREPARING, OrderStatus.READY]])
    
    return {
        "driver": driver,
        "orders": orders,
        "stats": {
            "unpaid_total": unpaid_total,
            "paid_today": paid_today,
            "pending_orders": pending_orders
        }
    }

@router.put("/portal/{driver_id}/complete")
async def complete_delivery_portal(driver_id: str, order_id: Optional[str] = None):
    """تأكيد التوصيل من صفحة السائق - بدون مصادقة"""
    db = get_database()
    driver = await db.drivers.find_one({"id": driver_id})
    if not driver:
        raise HTTPException(status_code=404, detail="السائق غير موجود")
    
    target_order_id = order_id or driver.get("current_order_id")
    
    if target_order_id:
        await db.orders.update_one(
            {"id": target_order_id},
            {"$set": {
                "status": OrderStatus.DELIVERED,
                "delivered_at": datetime.now(timezone.utc).isoformat()
            }}
        )
    
    await db.drivers.update_one(
        {"id": driver_id},
        {"$set": {"is_available": True, "current_order_id": None}, "$inc": {"total_deliveries": 1}}
    )
    return {"message": "تم التوصيل"}

@router.put("/portal/{driver_id}/location")
async def update_driver_location(driver_id: str, location: DriverLocationUpdate):
    """تحديث موقع السائق - GPS"""
    db = get_database()
    driver = await db.drivers.find_one({"id": driver_id})
    if not driver:
        raise HTTPException(status_code=404, detail="السائق غير موجود")
    
    await db.drivers.update_one(
        {"id": driver_id},
        {"$set": {
            "location_lat": location.latitude,
            "location_lng": location.longitude,
            "location_updated_at": datetime.now(timezone.utc).isoformat()
        }}
    )
    return {"message": "تم تحديث الموقع"}

@router.get("/locations")
async def get_drivers_locations(branch_id: Optional[str] = None, current_user: dict = Depends(get_current_user)):
    """جلب مواقع جميع السائقين للخريطة"""
    db = get_database()
    query = {"branch_id": branch_id} if branch_id else {}
    
    drivers = await db.drivers.find(query, {
        "_id": 0,
        "id": 1,
        "name": 1,
        "phone": 1,
        "is_available": 1,
        "current_order_id": 1,
        "location_lat": 1,
        "location_lng": 1,
        "location_updated_at": 1
    }).to_list(100)
    
    for driver in drivers:
        if driver.get("current_order_id"):
            order = await db.orders.find_one(
                {"id": driver["current_order_id"]},
                {"_id": 0, "order_number": 1, "customer_name": 1, "delivery_address": 1, "status": 1}
            )
            driver["current_order"] = order
    
    return drivers
