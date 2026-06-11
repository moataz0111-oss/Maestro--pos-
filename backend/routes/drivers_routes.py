"""
Drivers Routes - إدارة السائقين والتوصيل
"""
from fastapi import APIRouter, Depends, HTTPException, Body
from pydantic import BaseModel, ConfigDict
from typing import Optional, List, Dict, Any
from datetime import datetime, timezone, timedelta
import uuid
import logging
import math

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
    pin: str = "1234"  # الرمز السري للسائق
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
        "name": driver.name,
        "phone": driver.phone,
        "branch_id": driver.branch_id,
        "pin": driver.pin,  # حفظ الرمز السري
        "user_id": driver.user_id,
        "tenant_id": get_user_tenant_id(current_user),
        "is_active": True,
        "is_available": True,
        "current_order_id": None,
        "total_deliveries": 0,
        "current_location": None,
        "last_location_update": None,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.drivers.insert_one(driver_doc)
    del driver_doc["_id"]
    del driver_doc["pin"]  # لا ترجع PIN في الاستجابة
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


@router.get("/performance")
async def drivers_performance(period: str = "today", branch_id: Optional[str] = None, current_user: dict = Depends(get_current_user)):
    """تقرير أداء السائقين: عدد التوصيلات، الأجور المحققة، متوسط زمن التوصيل، المسافة التقديرية"""
    db = get_database()

    now = datetime.now(timezone.utc)
    if period == "week":
        start = now - timedelta(days=7)
    elif period == "month":
        start = now - timedelta(days=30)
    else:  # today
        start = now.replace(hour=0, minute=0, second=0, microsecond=0)

    def _sn(v):
        try:
            return float(v) if v is not None else 0.0
        except (TypeError, ValueError):
            return 0.0

    # طلبات التوصيل الداخلية (سائقي المطعم) خلال الفترة
    oq = build_tenant_query(current_user, {
        "order_type": "delivery",
        "driver_id": {"$nin": [None, ""]},
        "created_at": {"$gte": start.isoformat()},
        "status": {"$nin": ["cancelled", "refunded"]},
    })
    if branch_id:
        oq["branch_id"] = branch_id
    orders = await db.orders.find(oq, {
        "_id": 0, "driver_id": 1, "driver_name": 1, "status": 1, "total": 1, "delivery_fee": 1,
        "created_at": 1, "delivered_at": 1, "out_for_delivery_at": 1, "delivery_location": 1,
        "branch_id": 1, "is_delivery_company": 1, "delivery_app": 1, "delivery_app_name": 1
    }).to_list(10000)

    # إحداثيات الفروع (للمسافة التقديرية فرع→زبون)
    branches = await db.branches.find({}, {"_id": 0, "id": 1, "latitude": 1, "longitude": 1}).to_list(200)
    bmap = {b["id"]: b for b in branches if b.get("latitude") is not None and b.get("longitude") is not None}

    # كل سائقي المطعم (حتى من ليس له طلبات في الفترة)
    dq = build_tenant_query(current_user)
    if branch_id:
        dq["branch_id"] = branch_id
    drivers = await db.drivers.find(dq, {"_id": 0, "id": 1, "name": 1, "phone": 1, "is_active": 1, "is_available": 1}).to_list(500)

    perf = {}
    def _row(did, name, phone="", is_active=True, is_available=True):
        return {
            "driver_id": did, "name": name, "phone": phone,
            "is_active": is_active, "is_available": is_available,
            "deliveries": 0, "active_orders": 0,
            "total_fees": 0.0, "total_collected": 0.0,
            "_times": [], "distance_km": 0.0
        }
    for d in drivers:
        perf[d["id"]] = _row(d["id"], d.get("name") or "سائق", d.get("phone") or "", d.get("is_active", True), d.get("is_available", True))

    for o in orders:
        # استبعاد شركات التوصيل
        if o.get("is_delivery_company") or o.get("delivery_app") or o.get("delivery_app_name"):
            continue
        did = o["driver_id"]
        if did not in perf:
            perf[did] = _row(did, o.get("driver_name") or "سائق محذوف", is_active=False)
        p = perf[did]
        if o.get("status") == "delivered":
            p["deliveries"] += 1
            p["total_fees"] += _sn(o.get("delivery_fee"))
            p["total_collected"] += _sn(o.get("total"))
            # متوسط زمن التوصيل: من الانطلاق (أو إنشاء الطلب) حتى التسليم
            end_ts = o.get("delivered_at")
            start_ts = o.get("out_for_delivery_at") or o.get("created_at")
            if end_ts and start_ts:
                try:
                    mins = (datetime.fromisoformat(end_ts) - datetime.fromisoformat(start_ts)).total_seconds() / 60
                    if 0 < mins < 24 * 60:
                        p["_times"].append(mins)
                except (ValueError, TypeError):
                    pass
            # مسافة تقديرية: فرع → موقع الزبون
            loc = o.get("delivery_location") or {}
            lat = loc.get("latitude", loc.get("lat"))
            lng = loc.get("longitude", loc.get("lng"))
            br = bmap.get(o.get("branch_id"))
            if br and lat is not None and lng is not None:
                try:
                    p["distance_km"] += _haversine_km(float(br["latitude"]), float(br["longitude"]), float(lat), float(lng))
                except (ValueError, TypeError):
                    pass
        elif o.get("status") in ("preparing", "ready", "out_for_delivery"):
            p["active_orders"] += 1

    rows = []
    for p in perf.values():
        times = p.pop("_times")
        p["avg_delivery_minutes"] = round(sum(times) / len(times), 1) if times else None
        p["distance_km"] = round(p["distance_km"], 1)
        p["total_fees"] = round(p["total_fees"])
        p["total_collected"] = round(p["total_collected"])
        rows.append(p)
    rows.sort(key=lambda r: (r["deliveries"], r["total_fees"]), reverse=True)

    all_times = [r["avg_delivery_minutes"] for r in rows if r["avg_delivery_minutes"] is not None]
    return {
        "period": period,
        "start": start.isoformat(),
        "drivers": rows,
        "totals": {
            "deliveries": sum(r["deliveries"] for r in rows),
            "total_fees": sum(r["total_fees"] for r in rows),
            "total_collected": sum(r["total_collected"] for r in rows),
            "distance_km": round(sum(r["distance_km"] for r in rows), 1),
            "avg_delivery_minutes": round(sum(all_times) / len(all_times), 1) if all_times else None
        }
    }


class DriverUpdate(BaseModel):
    name: Optional[str] = None
    phone: Optional[str] = None
    pin: Optional[str] = None
    is_active: Optional[bool] = None
    is_available: Optional[bool] = None
    current_order_id: Optional[str] = None
    user_id: Optional[str] = None

@router.put("/{driver_id}")
async def update_driver(driver_id: str, driver: DriverUpdate, current_user: dict = Depends(get_current_user)):
    """تعديل بيانات السائق"""
    db = get_database()
    query = build_tenant_query(current_user, {"id": driver_id})
    existing = await db.drivers.find_one(query)
    if not existing:
        raise HTTPException(status_code=404, detail="السائق غير موجود")
    
    update_data = {"updated_at": datetime.now(timezone.utc).isoformat()}
    if driver.name:
        update_data["name"] = driver.name
    if driver.phone:
        update_data["phone"] = driver.phone
    if driver.pin:
        update_data["pin"] = driver.pin  # تحديث الرمز السري
    if driver.is_active is not None:
        update_data["is_active"] = driver.is_active
    if driver.is_available is not None:
        update_data["is_available"] = driver.is_available  # حالة التوفّر
    if driver.current_order_id is not None:
        # سلسلة فارغة = تفريغ الطلب الحالي (إلى null)
        update_data["current_order_id"] = driver.current_order_id or None
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
def _haversine_km(lat1, lng1, lat2, lng2):
    """المسافة بالكيلومتر بين نقطتين (Haversine)"""
    try:
        R = 6371.0
        dlat = math.radians(lat2 - lat1)
        dlng = math.radians(lng2 - lng1)
        a = math.sin(dlat / 2) ** 2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlng / 2) ** 2
        return 2 * R * math.asin(math.sqrt(a))
    except Exception:
        return 9999.0

NEAR_RADIUS_KM = 2.0  # نصف القطر الذي يُعتبر "قريباً/على نفس المسار"

@router.put("/{driver_id}/assign")
async def assign_driver(driver_id: str, order_id: str, force: bool = False, delivery_fee: Optional[float] = None, current_user: dict = Depends(get_current_user)):
    """تعيين سائق لطلب — مع دعم تجميع عدة طلبات على نفس السائق.
    القواعد:
    - إذا لم يغادر السائق المطعم بعد (لا يوجد طلب out_for_delivery): يُسمح بالإضافة دائماً.
    - إذا غادر: لا يُسمح إلا إذا كان الطلب الجديد قريباً (ضمن NEAR_RADIUS_KM) من أحد طلباته الحالية / مساره.
    - force=true يتجاوز القيود (للمالك/المدير).
    - delivery_fee: أجور التوصيل (اختياري) — تُضاف لفاتورة الطلب وتظهر للزبون.
    """
    db = get_database()
    driver = await db.drivers.find_one({"id": driver_id})
    if not driver:
        raise HTTPException(status_code=404, detail="السائق غير موجود")
    new_order = await db.orders.find_one({"id": order_id})
    if not new_order:
        raise HTTPException(status_code=404, detail="الطلب غير موجود")

    active = await db.orders.find(
        {"driver_id": driver_id, "status": {"$in": [OrderStatus.PENDING, OrderStatus.PREPARING, OrderStatus.READY, "out_for_delivery"]}},
        {"_id": 0, "id": 1, "status": 1, "delivery_location": 1}
    ).to_list(100)
    # استبعد الطلب نفسه إن كان موجوداً
    active = [o for o in active if o.get("id") != order_id]
    departed = any(o.get("status") == "out_for_delivery" for o in active)

    new_loc = new_order.get("delivery_location") or {}

    def _near_existing():
        if not (new_loc.get("latitude") and new_loc.get("longitude")):
            return False
        for o in active:
            ol = o.get("delivery_location") or {}
            if ol.get("latitude") and ol.get("longitude"):
                if _haversine_km(new_loc["latitude"], new_loc["longitude"], ol["latitude"], ol["longitude"]) <= NEAR_RADIUS_KM:
                    return True
        return False

    if active and not force and departed and not _near_existing():
        raise HTTPException(
            status_code=409,
            detail="السائق غادر المطعم ولا يوجد طلب قريب من مساره — لا يمكن إضافة هذا الطلب إليه"
        )

    await db.drivers.update_one(
        {"id": driver_id},
        {"$set": {"is_available": False, "current_order_id": driver.get("current_order_id") or order_id}}
    )
    order_update = {
        "driver_id": driver_id,
        "driver_name": driver.get("name", ""),
        "driver_phone": driver.get("phone", ""),
        "status": OrderStatus.PREPARING,
    }
    # ⭐ تسجيل وقت القبول وحساب تأخّر القبول (عتبة دقيقتين = 120 ثانية)
    if not new_order.get("accepted_at"):
        accepted_dt = datetime.now(timezone.utc)
        order_update["accepted_at"] = accepted_dt.isoformat()
        try:
            created_raw = new_order.get("created_at")
            created_dt = datetime.fromisoformat(created_raw.replace("Z", "+00:00")) if isinstance(created_raw, str) else created_raw
            if created_dt and created_dt.tzinfo is None:
                created_dt = created_dt.replace(tzinfo=timezone.utc)
            delay_sec = (accepted_dt - created_dt).total_seconds() if created_dt else 0
        except Exception:
            delay_sec = 0
        order_update["acceptance_delay_seconds"] = int(max(0, delay_sec))
        order_update["acceptance_late"] = bool(delay_sec > 120)
    # أجور التوصيل: تُضاف لإجمالي الفاتورة (مع الحفاظ على عدم التكرار إن أُعيد التعيين)
    if delivery_fee is not None and delivery_fee >= 0:
        old_fee = float(new_order.get("delivery_fee") or 0)
        new_total = float(new_order.get("total") or 0) - old_fee + float(delivery_fee)
        order_update["delivery_fee"] = float(delivery_fee)
        order_update["total"] = new_total
    await db.orders.update_one({"id": order_id}, {"$set": order_update})

    # ⭐ إشعار فوري للسائق: طلب جديد على اسمه قيد التحضير في المطبخ
    if new_order.get("order_type") == "delivery":
        try:
            now = datetime.now(timezone.utc)
            driver_notification = {
                "id": f"notif_{now.timestamp()}_{order_id}_driver",
                "type": "new_order_driver",
                "order_id": order_id,
                "order_number": str(new_order.get("order_number", "")),
                "branch_id": new_order.get("branch_id", ""),
                "order_type": new_order.get("order_type", "delivery"),
                "customer_name": new_order.get("customer_name"),
                "customer_phone": new_order.get("customer_phone"),
                "delivery_address": new_order.get("delivery_address"),
                "driver_id": driver_id,
                "total_amount": float(order_update.get("total") or new_order.get("total") or 0),
                "items_count": len(new_order.get("items") or []),
                "tenant_id": new_order.get("tenant_id"),
                "is_read": False,
                "is_printed": False,
                "created_at": now.isoformat(),
            }
            await db.order_notifications.insert_one(driver_notification)
            try:
                from services.websocket_service import notify_driver_new_order
                await notify_driver_new_order(driver_id, {
                    "order_id": order_id,
                    "order_number": str(new_order.get("order_number", "")),
                    "customer_name": new_order.get("customer_name"),
                    "customer_phone": new_order.get("customer_phone"),
                    "delivery_address": new_order.get("delivery_address"),
                    "total_amount": float(order_update.get("total") or new_order.get("total") or 0),
                    "branch_id": new_order.get("branch_id", ""),
                })
            except Exception as _e:
                logger.warning(f"driver websocket notify failed: {_e}")
        except Exception as _e:
            logger.warning(f"driver notification insert failed: {_e}")

    return {
        "message": "تم تعيين السائق",
        "batched": len(active) > 0,
        "departed": departed,
        "active_orders": len(active) + 1,
        "delivery_fee": order_update.get("delivery_fee"),
        "new_total": order_update.get("total")
    }

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
    
    # ==== FIX: حدّث حالة الدفع في الطلبات المحصّلة كي تظهر "نقدي" في تقرير الصندوق ====
    # الطلبات التي الآن تم تسليم فلوسها للمطعم من السائق → يجب تصنيفها مدفوعة نقداً
    # (تُستبعد الطلبات المدفوعة ببطاقة لأنها محسوبة كبطاقة فعلاً)
    cash_settle = await db.orders.update_many(
        {
            "driver_id": driver_id,
            "driver_payment_status": "paid",
            "$or": [
                {"payment_status": {"$in": [None, "", "pending", "unpaid"]}},
                {"payment_status": {"$exists": False}},
            ],
            "payment_method": {"$nin": ["card", "credit"]},
        },
        {"$set": {
            "payment_status": "paid",
            "payment_method": "cash",
            "payment_source": "internal_delivery",  # صفة "توصيل داخلي" في التقارير
            "payment_settled_from_driver_at": datetime.now(timezone.utc).isoformat(),
        }}
    )
    
    payment_record = {
        "id": str(uuid.uuid4()),
        "driver_id": driver_id,
        "amount": amount,
        "collected_by": current_user["id"],
        "collected_at": datetime.now(timezone.utc).isoformat(),
        "orders_count": result.modified_count,
        "orders_cash_settled": cash_settle.modified_count,
    }
    await db.driver_payments.insert_one(payment_record)
    
    return {
        "message": f"تم تحصيل المبلغ وتحديث {result.modified_count} طلب",
        "orders_updated": result.modified_count,
        "orders_cash_settled": cash_settle.modified_count,
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
