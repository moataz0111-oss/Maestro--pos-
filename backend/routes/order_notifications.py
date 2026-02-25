"""
نظام إشعارات الطلبات في الوقت الفعلي
- إشعارات للكاشير عند وصول طلب جديد
- إشعارات للسائق عند تعيينه على طلب
- الطباعة التلقائية للفواتير
"""
from fastapi import APIRouter, HTTPException, Depends, Query
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime, timezone, timedelta
from motor.motor_asyncio import AsyncIOMotorClient
import os

router = APIRouter(tags=["Order Notifications"])

# Database connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]


class OrderNotificationCreate(BaseModel):
    order_id: str
    order_number: str
    branch_id: str
    order_type: str  # delivery, takeaway, dine_in
    customer_name: Optional[str] = None
    customer_phone: Optional[str] = None
    delivery_address: Optional[str] = None
    driver_id: Optional[str] = None
    total_amount: float = 0
    items_count: int = 0
    notes: Optional[str] = None


class OrderNotificationResponse(BaseModel):
    id: str
    type: str  # new_order_cashier, new_order_driver
    order_id: str
    order_number: str
    branch_id: str
    order_type: str
    customer_name: Optional[str] = None
    customer_phone: Optional[str] = None
    delivery_address: Optional[str] = None
    driver_id: Optional[str] = None
    total_amount: float = 0
    items_count: int = 0
    notes: Optional[str] = None
    is_read: bool = False
    is_printed: bool = False
    created_at: str


@router.post("/order-notifications")
async def create_order_notification(notification: OrderNotificationCreate):
    """
    إنشاء إشعار طلب جديد للكاشير والسائق
    يتم استدعاؤها تلقائياً عند حفظ طلب جديد
    """
    now = datetime.now(timezone.utc)
    
    # إشعار للكاشير في الفرع
    cashier_notification = {
        "id": f"notif_{now.timestamp()}_{notification.order_id}_cashier",
        "type": "new_order_cashier",
        "order_id": notification.order_id,
        "order_number": notification.order_number,
        "branch_id": notification.branch_id,
        "order_type": notification.order_type,
        "customer_name": notification.customer_name,
        "customer_phone": notification.customer_phone,
        "delivery_address": notification.delivery_address,
        "total_amount": notification.total_amount,
        "items_count": notification.items_count,
        "notes": notification.notes,
        "is_read": False,
        "is_printed": False,
        "created_at": now.isoformat()
    }
    
    await db.order_notifications.insert_one(cashier_notification)
    
    # إشعار للسائق إذا كان محدداً
    if notification.driver_id and notification.order_type == "delivery":
        driver_notification = {
            "id": f"notif_{now.timestamp()}_{notification.order_id}_driver",
            "type": "new_order_driver",
            "order_id": notification.order_id,
            "order_number": notification.order_number,
            "branch_id": notification.branch_id,
            "order_type": notification.order_type,
            "customer_name": notification.customer_name,
            "customer_phone": notification.customer_phone,
            "delivery_address": notification.delivery_address,
            "driver_id": notification.driver_id,
            "total_amount": notification.total_amount,
            "items_count": notification.items_count,
            "notes": notification.notes,
            "is_read": False,
            "is_printed": False,
            "created_at": now.isoformat()
        }
        await db.order_notifications.insert_one(driver_notification)
    
    return {
        "success": True,
        "message": "تم إرسال الإشعارات بنجاح",
        "cashier_notification_id": cashier_notification["id"],
        "driver_notification_id": f"notif_{now.timestamp()}_{notification.order_id}_driver" if notification.driver_id else None
    }


@router.get("/order-notifications")
async def get_order_notifications(
    branch_id: Optional[str] = None,
    driver_id: Optional[str] = None,
    notification_type: Optional[str] = None,
    unread_only: bool = True,
    limit: int = 50
):
    """
    جلب إشعارات الطلبات للكاشير أو السائق
    - branch_id: لجلب إشعارات فرع معين (للكاشير)
    - driver_id: لجلب إشعارات سائق معين
    - notification_type: new_order_cashier أو new_order_driver
    - unread_only: جلب غير المقروءة فقط
    """
    query = {}
    
    if branch_id:
        query["branch_id"] = branch_id
    
    if driver_id:
        query["driver_id"] = driver_id
    
    if notification_type:
        query["type"] = notification_type
    
    if unread_only:
        query["is_read"] = False
    
    # جلب آخر 30 ثانية فقط للإشعارات الجديدة
    cutoff_time = (datetime.now(timezone.utc) - timedelta(seconds=60)).isoformat()
    query["created_at"] = {"$gt": cutoff_time}
    
    notifications = await db.order_notifications.find(
        query,
        {"_id": 0}
    ).sort("created_at", -1).limit(limit).to_list(limit)
    
    return {
        "notifications": notifications,
        "count": len(notifications),
        "unread_count": len([n for n in notifications if not n.get("is_read", False)])
    }


@router.put("/order-notifications/{notification_id}/read")
async def mark_notification_read(notification_id: str):
    """تحديد إشعار كمقروء"""
    result = await db.order_notifications.update_one(
        {"id": notification_id},
        {"$set": {"is_read": True}}
    )
    
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="الإشعار غير موجود")
    
    return {"success": True, "message": "تم تحديد الإشعار كمقروء"}


@router.put("/order-notifications/{notification_id}/printed")
async def mark_notification_printed(notification_id: str):
    """تحديد إشعار كمطبوع"""
    result = await db.order_notifications.update_one(
        {"id": notification_id},
        {"$set": {"is_printed": True, "is_read": True}}
    )
    
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="الإشعار غير موجود")
    
    return {"success": True, "message": "تم تحديد الإشعار كمطبوع"}


@router.put("/order-notifications/read-all")
async def mark_all_notifications_read(
    branch_id: Optional[str] = None,
    driver_id: Optional[str] = None
):
    """تحديد جميع الإشعارات كمقروءة"""
    query = {"is_read": False}
    
    if branch_id:
        query["branch_id"] = branch_id
    
    if driver_id:
        query["driver_id"] = driver_id
    
    result = await db.order_notifications.update_many(
        query,
        {"$set": {"is_read": True}}
    )
    
    return {
        "success": True,
        "message": f"تم تحديد {result.modified_count} إشعار كمقروء"
    }


@router.delete("/order-notifications/cleanup")
async def cleanup_old_notifications(hours: int = 24):
    """حذف الإشعارات القديمة (أكثر من عدد ساعات معين)"""
    cutoff_time = (datetime.now(timezone.utc) - timedelta(hours=hours)).isoformat()
    
    result = await db.order_notifications.delete_many({
        "created_at": {"$lt": cutoff_time}
    })
    
    return {
        "success": True,
        "message": f"تم حذف {result.deleted_count} إشعار قديم"
    }
