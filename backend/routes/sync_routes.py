"""
Sync Routes - مسارات المزامنة للعمل Offline
"""
from fastapi import APIRouter, HTTPException, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel
from typing import Optional, List, Any
from motor.motor_asyncio import AsyncIOMotorClient
from pymongo.errors import DuplicateKeyError
import os
import jwt
import uuid
import json
import httpx
from datetime import datetime, timezone, timedelta

from .shared import resolve_business_date

router = APIRouter(prefix="/sync", tags=["Sync"])

# Database connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

JWT_SECRET = os.environ.get('JWT_SECRET', 'your-secret-key-here')
VAPID_PUBLIC_KEY = os.environ.get('VAPID_PUBLIC_KEY', '')
VAPID_PRIVATE_KEY = os.environ.get('VAPID_PRIVATE_KEY', '')
security = HTTPBearer()

# ==================== MODELS ====================

class OfflineOrder(BaseModel):
    id: Optional[str] = None
    offline_id: Optional[str] = None
    items: List[Any]
    total: float
    subtotal: Optional[float] = None
    discount: Optional[float] = 0
    discount_type: Optional[str] = None
    discount_value: Optional[float] = 0
    tax: Optional[float] = 0
    tax_amount: Optional[float] = 0
    service_charge: Optional[float] = 0
    delivery_fee: Optional[float] = 0
    status: Optional[str] = "pending"
    order_type: Optional[str] = "dine_in"  # dine_in | takeaway | delivery
    table_id: Optional[str] = None
    customer_id: Optional[str] = None
    customer_name: Optional[str] = None
    customer_phone: Optional[str] = None
    customer_type: Optional[str] = None  # regular | delivery_company | credit
    delivery_address: Optional[str] = None
    notes: Optional[str] = None
    # === حقول الدفع الكاملة ===
    payment_method: Optional[str] = "cash"  # cash | card | credit | deferred | delivery_company
    payment_status: Optional[str] = None  # paid | unpaid | partial | deferred
    paid_amount: Optional[float] = 0
    change_amount: Optional[float] = 0
    # === حقول شركات التوصيل (طلبات/طلباتي/Uber/...) ===
    delivery_app: Optional[str] = None
    delivery_app_name: Optional[str] = None
    is_delivery_company: Optional[bool] = False
    delivery_company: Optional[str] = None
    delivery_company_id: Optional[str] = None
    delivery_company_name: Optional[str] = None
    delivery_company_order_id: Optional[str] = None
    # === حقول السائق (التوصيل الداخلي) ===
    driver_id: Optional[str] = None
    driver_name: Optional[str] = None
    # === باقي الحقول ===
    branch_id: Optional[str] = None
    cashier_id: Optional[str] = None
    cashier_name: Optional[str] = None
    shift_id: Optional[str] = None
    created_at: Optional[str] = None
    is_offline_order: Optional[bool] = False
    original_order_number: Optional[int] = None  # للأوفلاين: الرقم المحلي الأصلي قبل المزامنة

class OfflineCustomer(BaseModel):
    id: Optional[str] = None
    name: str
    phone: Optional[str] = None
    email: Optional[str] = None
    address: Optional[str] = None
    notes: Optional[str] = None

class SyncResult(BaseModel):
    success: bool
    id: str
    order_number: Optional[int] = None
    message: Optional[str] = None

# ==================== HELPERS ====================

async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    try:
        token = credentials.credentials
        payload = jwt.decode(token, JWT_SECRET, algorithms=["HS256"])
        user_id = payload.get("user_id")
        if not user_id:
            raise HTTPException(status_code=401, detail="توكن غير صالح")
        
        user = await db.users.find_one({"id": user_id}, {"_id": 0, "password": 0, "password_hash": 0})
        if not user:
            raise HTTPException(status_code=401, detail="المستخدم غير موجود")
        
        return user
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="انتهت صلاحية الجلسة")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="توكن غير صالح")

def get_user_tenant_id(user: dict) -> str:
    return user.get("tenant_id")


async def _get_company_commission_rate(tenant_id: Optional[str], app_id: Optional[str]) -> float:
    """جلب نسبة عمولة شركة التوصيل الحالية من delivery_app_settings (مفتاحها app_id)."""
    if not app_id:
        return 0
    q = {"app_id": app_id}
    if tenant_id:
        q["tenant_id"] = tenant_id
    s = await db.delivery_app_settings.find_one(q, {"_id": 0})
    if not s:
        s = await db.delivery_app_settings.find_one({"app_id": app_id}, {"_id": 0})
    return (s or {}).get("commission_rate", 0) or 0

async def get_next_order_number(tenant_id: str, branch_id: Optional[str] = None, business_date: Optional[str] = None) -> int:
    """الحصول على رقم الطلب التالي — يستخدم نفس عدّاد online orders (يومي حسب الفرع)
    
    حلّ مشكلة الترقيم: قبل هذا الإصلاح كان الأوفلاين يستخدم عدّاد عام يبدأ من 1 ويُسبّب
    أرقام مثل #13 #14 وسط أرقام #47 #48 الصحيحة. الآن نستخدم نفس العدّاد اليومي للفرع.
    """
    counter_date = business_date or datetime.now(timezone.utc).strftime("%Y-%m-%d")
    counter_key = {"branch_id": branch_id, "date": counter_date} if branch_id else {"_id": f"order_number_{tenant_id}", "date": counter_date}
    counter = await db.order_counters.find_one_and_update(
        counter_key,
        {"$inc": {"counter": 1}},
        upsert=True,
        return_document=True
    )
    return counter.get("counter", 1)

# ==================== ROUTES ====================

@router.post("/orders", response_model=SyncResult)
async def sync_order(order: OfflineOrder, current_user: dict = Depends(get_current_user)):
    """
    مزامنة طلب من الـ Offline
    يستقبل طلب محلي ويحفظه في قاعدة البيانات مع رقم رسمي
    """
    try:
        tenant_id = get_user_tenant_id(current_user)
        
        # التحقق من عدم وجود الطلب مسبقاً (بناءً على offline_id)
        if order.offline_id:
            existing = await db.orders.find_one({
                "offline_id": order.offline_id,
                "tenant_id": tenant_id
            })
            if existing:
                return SyncResult(
                    success=True,
                    id=existing.get("id"),
                    order_number=existing.get("order_number"),
                    message="الطلب موجود مسبقاً"
                )

        # ⭐⭐ منع تكرار طلبات شركات التوصيل بنفس رقم الطلب الخارجي (مثل رقم طلبات/مزاجك)
        ext_ref = (order.delivery_company_order_id or "").strip() if getattr(order, "delivery_company_order_id", None) else ""
        if ext_ref:
            company_keys = [k for k in [
                order.delivery_app, order.delivery_company_id, order.delivery_company,
                order.delivery_app_name, order.delivery_company_name,
            ] if k]
            ext_q = {
                "delivery_company_order_id": ext_ref,
                "status": {"$nin": ["cancelled", "canceled", "deleted", "refunded"]},
                "tenant_id": tenant_id,
            }
            if company_keys:
                ext_q["$or"] = [
                    {"delivery_app": {"$in": company_keys}},
                    {"delivery_company_id": {"$in": company_keys}},
                    {"delivery_company": {"$in": company_keys}},
                    {"delivery_app_name": {"$in": company_keys}},
                    {"delivery_company_name": {"$in": company_keys}},
                ]
            existing_ext = await db.orders.find_one(ext_q, {"_id": 0})
            if existing_ext:
                return SyncResult(
                    success=True,
                    id=existing_ext.get("id"),
                    order_number=existing_ext.get("order_number"),
                    message=f"طلب التوصيل #{existing_ext.get('order_number')} موجود مسبقاً (منع تكرار)"
                )
        
        # الحصول على رقم الطلب التالي — يستخدم نفس عدّاد الأونلاين (branch_id + business_date)
        order_branch_id = order.branch_id or current_user.get("branch_id")
        biz_date = await resolve_business_date(tenant_id, order_branch_id)
        order_number = await get_next_order_number(tenant_id, order_branch_id, biz_date)
        
        # === تحديد حالة الدفع التلقائية إن لم تُمرَّر ===
        # القاعدة: إن كان طلب لشركة توصيل أو ائتمان أو "deferred" → unpaid افتراضياً
        # وإلا (cash/card مع paid_amount >= total) → paid
        inferred_payment_status = order.payment_status
        if not inferred_payment_status:
            pm = (order.payment_method or "cash").lower()
            if pm in ("delivery_company", "deferred", "credit") or order.delivery_company_id or order.delivery_company:
                inferred_payment_status = "unpaid"
            elif (order.paid_amount or 0) >= (order.total or 0):
                inferred_payment_status = "paid"
            else:
                inferred_payment_status = "partial"

        # === تحديد customer_type التلقائي إن لم يُمرَّر ===
        inferred_customer_type = order.customer_type
        if not inferred_customer_type:
            if order.delivery_company_id or order.delivery_company:
                inferred_customer_type = "delivery_company"
            elif (order.payment_method or "").lower() in ("credit", "deferred"):
                inferred_customer_type = "credit"
            else:
                inferred_customer_type = "regular"

        # === تحديد شركة التوصيل + عمولتها (نفس سلوك الأونلاين) ===
        # ⭐ إصلاح: الأوفلاين كان يحفظ delivery_company_* فقط دون delivery_app/is_delivery_company
        # فتختفي الطلبات من تقرير شركات التوصيل وتظهر كـ "delivery_company" عامة في طرق الدفع.
        da_id = order.delivery_app or order.delivery_company_id
        da_name = order.delivery_app_name or order.delivery_company_name or order.delivery_company
        is_dc = bool(
            order.is_delivery_company or da_id or da_name
            or (order.customer_type == "delivery_company")
            or ((order.payment_method or "").lower() == "delivery_company")
        )
        delivery_commission = 0
        if is_dc and da_id:
            _rate = await _get_company_commission_rate(tenant_id, da_id)
            delivery_commission = round((order.total or 0) * _rate / 100, 2)

        # إنشاء الطلب الجديد
        new_order = {
            "id": str(uuid.uuid4()),
            "order_number": order_number,
            "offline_id": order.offline_id,
            "items": order.items,
            "total": order.total,
            "subtotal": order.subtotal or order.total,
            "discount": order.discount or 0,
            "discount_type": order.discount_type,
            "discount_value": order.discount_value or 0,
            "tax": order.tax or 0,
            "tax_amount": order.tax_amount or order.tax or 0,
            "service_charge": order.service_charge or 0,
            "delivery_fee": order.delivery_fee or 0,
            "status": order.status or "pending",
            "order_type": order.order_type or "dine_in",
            "table_id": order.table_id,
            "customer_id": order.customer_id,
            "customer_name": order.customer_name,
            "customer_phone": order.customer_phone,
            "customer_type": inferred_customer_type,
            "delivery_address": order.delivery_address,
            "notes": order.notes,
            # === الدفع الكامل ===
            "payment_method": order.payment_method or "cash",
            "payment_status": inferred_payment_status,
            "paid_amount": order.paid_amount or 0,
            "change_amount": order.change_amount or 0,
            # === شركات التوصيل ===
            "delivery_app": da_id,
            "delivery_app_name": da_name,
            "is_delivery_company": is_dc,
            "delivery_commission": delivery_commission,
            "delivery_company": order.delivery_company,
            "delivery_company_id": order.delivery_company_id,
            "delivery_company_name": order.delivery_company_name,
            "delivery_company_order_id": order.delivery_company_order_id,
            # === السائق ===
            "driver_id": order.driver_id,
            "driver_name": order.driver_name,
            # === باقي ===
            "branch_id": order.branch_id or current_user.get("branch_id"),
            "cashier_id": order.cashier_id or current_user.get("id"),
            "cashier_name": order.cashier_name or current_user.get("name") or current_user.get("full_name"),
            "shift_id": order.shift_id,
            "tenant_id": tenant_id,
            "is_offline_order": True,
            "original_order_number": order.original_order_number,
            "synced_at": datetime.now(timezone.utc).isoformat(),
            "created_at": order.created_at or datetime.now(timezone.utc).isoformat(),
            "updated_at": datetime.now(timezone.utc).isoformat(),
            "business_date": biz_date
        }
        
        # حفظ الطلب
        try:
            await db.orders.insert_one(new_order)
        except DuplicateKeyError:
            # سباق مزامنة: طلب بنفس offline_id موجود بالفعل (قفل قاعدة البيانات) — نُعيد الموجود بلا تكرار
            existing = await db.orders.find_one(
                {"offline_id": order.offline_id, "tenant_id": tenant_id}, {"_id": 0}
            )
            if existing:
                return SyncResult(
                    success=True,
                    id=existing.get("id"),
                    order_number=existing.get("order_number"),
                    message="الطلب موجود مسبقاً (منع تكرار)"
                )
            raise
        
        # تحديث المخزون (إذا كان هناك منتجات)
        for item in order.items:
            if item.get("product_id"):
                await db.products.update_one(
                    {"id": item["product_id"], "tenant_id": tenant_id},
                    {"$inc": {"quantity": -item.get("quantity", 1)}}
                )
        
        # تحديث إحصائيات اليوم
        today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        await db.daily_stats.update_one(
            {"date": today, "tenant_id": tenant_id},
            {
                "$inc": {
                    "total_orders": 1,
                    "total_sales": order.total,
                    "offline_orders": 1
                }
            },
            upsert=True
        )
        
        # إرسال إشعار للأجهزة الأخرى
        try:
            cashier_name = order.cashier_name or current_user.get("name") or "كاشير"
            order_type_ar = {
                "dine_in": "داخلي",
                "takeaway": "سفري", 
                "delivery": "توصيل"
            }.get(order.order_type, order.order_type)
            
            await notify_other_devices(
                tenant_id=tenant_id,
                current_device_endpoint="",  # سيتم تحديثه لاحقاً
                title="🔄 طلب جديد تم مزامنته",
                body=f"طلب #{order_number} ({order_type_ar}) - {cashier_name}",
                data={
                    "type": "sync_order",
                    "order_id": new_order["id"],
                    "order_number": order_number,
                    "url": f"/orders?highlight={new_order['id']}"
                }
            )
        except Exception as notify_err:
            print(f"Error sending sync notification: {notify_err}")
        
        return SyncResult(
            success=True,
            id=new_order["id"],
            order_number=order_number,
            message=f"تم حفظ الطلب برقم #{order_number}"
        )
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"خطأ في المزامنة: {str(e)}")


# ==================== أداة تنظيف الطلبات المكررة ====================
@router.get("/duplicate-orders")
async def list_duplicate_orders(current_user: dict = Depends(get_current_user)):
    """عرض مجموعات الطلبات المكررة (نفس offline_id) للمراجعة قبل الحذف. للمالك/المدير فقط."""
    if current_user.get("role", "") not in ["admin", "general_manager", "super_admin", "manager", "branch_manager", "owner"]:
        raise HTTPException(status_code=403, detail="غير مصرح")
    tenant_id = get_user_tenant_id(current_user)
    match = {"offline_id": {"$type": "string", "$ne": ""}}
    if tenant_id:
        match["tenant_id"] = tenant_id
    pipeline = [
        {"$match": match},
        {"$group": {"_id": "$offline_id", "count": {"$sum": 1},
                    "orders": {"$push": {"id": "$id", "order_number": "$order_number",
                                         "total": "$total", "created_at": "$created_at",
                                         "status": "$status"}}}},
        {"$match": {"count": {"$gt": 1}}},
        {"$sort": {"count": -1}},
        {"$limit": 500},
    ]
    groups = await db.orders.aggregate(pipeline).to_list(500)
    total_dups = sum(g["count"] - 1 for g in groups)
    return {"duplicate_groups": len(groups), "extra_orders_to_remove": total_dups, "groups": groups}


@router.post("/cleanup-duplicate-orders")
async def cleanup_duplicate_orders(current_user: dict = Depends(get_current_user)):
    """حذف الطلبات المكررة (نفس offline_id) مع الإبقاء على نسخة واحدة لكل مجموعة،
    ثم إنشاء الفهرس الفريد لمنع التكرار مستقبلاً. للمالك/المدير فقط.
    قاعدة الإبقاء: نُبقي الطلب صاحب أصغر رقم طلب رسمي (أو الأقدم إن تساوَوا)."""
    if current_user.get("role", "") not in ["admin", "general_manager", "super_admin", "manager", "branch_manager", "owner"]:
        raise HTTPException(status_code=403, detail="غير مصرح")
    tenant_id = get_user_tenant_id(current_user)
    match = {"offline_id": {"$type": "string", "$ne": ""}}
    if tenant_id:
        match["tenant_id"] = tenant_id
    pipeline = [
        {"$match": match},
        {"$group": {"_id": "$offline_id", "count": {"$sum": 1},
                    "orders": {"$push": {"id": "$id", "order_number": "$order_number", "created_at": "$created_at"}}}},
        {"$match": {"count": {"$gt": 1}}},
    ]
    groups = await db.orders.aggregate(pipeline).to_list(5000)

    deleted_ids = []
    for g in groups:
        orders = g["orders"]
        # رتّب: صاحب رقم طلب رسمي أولاً، ثم الأصغر رقماً، ثم الأقدم
        def sort_key(o):
            num = o.get("order_number")
            return (0 if num is not None else 1, num if num is not None else 1e18, o.get("created_at") or "")
        orders_sorted = sorted(orders, key=sort_key)
        keep = orders_sorted[0]
        for o in orders_sorted[1:]:
            if o.get("id") and o["id"] != keep.get("id"):
                deleted_ids.append(o["id"])

    removed = 0
    if deleted_ids:
        res = await db.orders.delete_many({"id": {"$in": deleted_ids}})
        removed = res.deleted_count

    # محاولة إنشاء الفهرس الفريد الآن بعد إزالة التكرارات
    index_created = False
    index_msg = ""
    try:
        await db.orders.create_index(
            [("tenant_id", 1), ("offline_id", 1)],
            unique=True,
            partialFilterExpression={"offline_id": {"$type": "string"}},
            name="uniq_tenant_offline_id",
        )
        index_created = True
    except Exception as e:
        index_msg = str(e)

    return {
        "duplicate_groups": len(groups),
        "removed_orders": removed,
        "unique_index_created": index_created,
        "index_note": index_msg,
        "message": f"تم حذف {removed} طلباً مكرراً" + (" وتفعيل قفل منع التكرار ✅" if index_created else " (تعذّر إنشاء الفهرس — راجع index_note)")
    }


@router.get("/business-duplicate-orders")
async def detect_business_duplicate_orders(current_user: dict = Depends(get_current_user)):
    """كشف التكرارات على مستوى العمل (وليس فقط offline_id):
    1) نفس رقم طلب شركة التوصيل (delivery_company_order_id) لنفس الشركة.
    2) بصمة محتوى متطابقة (فرع+نوع+إجمالي+عدد أصناف+دفع) خلال 10 دقائق.
    للمالك/المدير فقط — للمراجعة قبل التنظيف."""
    if current_user.get("role", "") not in ["admin", "general_manager", "super_admin", "manager", "branch_manager", "owner"]:
        raise HTTPException(status_code=403, detail="غير مصرح")
    tenant_id = get_user_tenant_id(current_user)
    base = {"status": {"$nin": ["cancelled", "canceled", "deleted", "refunded"]}}
    if tenant_id:
        base["tenant_id"] = tenant_id

    groups = []
    # (1) نفس رقم طلب شركة التوصيل لنفس الشركة
    ext_pipeline = [
        {"$match": {**base, "delivery_company_order_id": {"$type": "string", "$ne": ""}}},
        {"$group": {"_id": {"ref": "$delivery_company_order_id",
                            "company": {"$ifNull": ["$delivery_app_name", {"$ifNull": ["$delivery_company_name", "$delivery_app"]}]}},
                    "count": {"$sum": 1},
                    "orders": {"$push": {"id": "$id", "order_number": "$order_number", "total": "$total",
                                          "created_at": "$created_at", "delivery_company_order_id": "$delivery_company_order_id"}}}},
        {"$match": {"count": {"$gt": 1}}},
        {"$limit": 500},
    ]
    for g in await db.orders.aggregate(ext_pipeline).to_list(500):
        groups.append({"type": "external_ref", "key": g["_id"], "count": g["count"], "orders": g["orders"]})

    # (2) بصمة محتوى متطابقة خلال 10 دقائق (يلتقط التكرارات القديمة بلا رقم خارجي)
    fp_pipeline = [
        {"$match": base},
        {"$project": {"id": 1, "order_number": 1, "total": 1, "created_at": 1, "branch_id": 1,
                      "order_type": 1, "payment_method": 1,
                      "bucket": {"$substr": [{"$ifNull": ["$created_at", ""]}, 0, 15]},  # دقّة دقيقة تقريباً (YYYY-MM-DDTHH:M)
                      "items_count": {"$size": {"$ifNull": ["$items", []]}}}},
        {"$group": {"_id": {"b": "$branch_id", "t": "$order_type", "tot": "$total",
                            "ic": "$items_count", "pm": "$payment_method", "win": "$bucket"},
                    "count": {"$sum": 1},
                    "orders": {"$push": {"id": "$id", "order_number": "$order_number", "total": "$total", "created_at": "$created_at"}}}},
        {"$match": {"count": {"$gt": 1}}},
        {"$limit": 500},
    ]
    seen_ids = set()
    for g in groups:
        for o in g["orders"]:
            seen_ids.add(o.get("id"))
    for g in await db.orders.aggregate(fp_pipeline).to_list(500):
        if all(o.get("id") in seen_ids for o in g["orders"]):
            continue
        groups.append({"type": "content_fingerprint", "key": g["_id"], "count": g["count"], "orders": g["orders"]})

    total_extra = sum(g["count"] - 1 for g in groups)
    return {"duplicate_groups": len(groups), "extra_orders_to_remove": total_extra, "groups": groups}


@router.post("/cleanup-business-duplicates")
async def cleanup_business_duplicate_orders(current_user: dict = Depends(get_current_user)):
    """حذف التكرارات على مستوى العمل (رقم طلب الشركة + بصمة المحتوى) مع الإبقاء على نسخة واحدة
    (الأقدم/أصغر رقم طلب). للمالك/المدير فقط."""
    if current_user.get("role", "") not in ["admin", "general_manager", "super_admin", "manager", "branch_manager", "owner"]:
        raise HTTPException(status_code=403, detail="غير مصرح")
    detection = await detect_business_duplicate_orders(current_user)

    def sort_key(o):
        num = o.get("order_number")
        return (0 if num is not None else 1, num if num is not None else 1e18, o.get("created_at") or "")

    deleted_ids = []
    for g in detection["groups"]:
        orders_sorted = sorted(g["orders"], key=sort_key)
        keep = orders_sorted[0]
        for o in orders_sorted[1:]:
            if o.get("id") and o["id"] != keep.get("id"):
                deleted_ids.append(o["id"])

    deleted_ids = list(set(deleted_ids))
    removed = 0
    if deleted_ids:
        res = await db.orders.delete_many({"id": {"$in": deleted_ids}})
        removed = res.deleted_count
    return {"duplicate_groups": detection["duplicate_groups"], "removed_orders": removed,
            "message": f"تم حذف {removed} طلباً مكرراً (على مستوى العمل) ✅"}





class OrderRoutingFix(BaseModel):
    """تحديث مسار الطلب (للطلبات الأوفلاين التي رُكِّب لها مسار خاطئ)."""
    order_type: Optional[str] = None  # dine_in | takeaway | delivery
    payment_method: Optional[str] = None
    payment_status: Optional[str] = None
    customer_type: Optional[str] = None
    customer_name: Optional[str] = None
    customer_phone: Optional[str] = None
    delivery_company_id: Optional[str] = None
    delivery_company_name: Optional[str] = None
    delivery_company_order_id: Optional[str] = None
    driver_id: Optional[str] = None
    driver_name: Optional[str] = None
    delivery_address: Optional[str] = None
    delivery_fee: Optional[float] = None
    notes: Optional[str] = None


@router.patch("/orders/{order_id}/fix-routing", response_model=SyncResult)
async def fix_order_routing(
    order_id: str,
    payload: OrderRoutingFix,
    current_user: dict = Depends(get_current_user)
):
    """تصحيح مسار الطلب (للمالك/المدير) — مفيد للطلبات الأوفلاين التي ظهرت بمسار خاطئ
    مثل: طلب لشركة توصيل ظهر كـ dine_in/cash. يحتفظ بـ order_number كما هو.
    """
    if current_user.get("role") not in ["admin", "general_manager", "super_admin", "manager"]:
        raise HTTPException(status_code=403, detail="غير مسموح — للمالك/المدير فقط")

    tenant_id = get_user_tenant_id(current_user)
    q = {"id": order_id}
    if tenant_id:
        q["tenant_id"] = tenant_id
    existing = await db.orders.find_one(q, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="الطلب غير موجود")

    # حماية: الطلب يجب أن يكون من الطلبات المعطوبة التي أعادت المهاجرة ترقيمها
    # ولم يُصلَّح بعد — الأيقونة/الإصلاح يعمل لمرة واحدة فقط لكل طلب.
    if existing.get("renumbered_reason") != "fix_offline_sync_drift_v2":
        raise HTTPException(
            status_code=400,
            detail="هذا الطلب غير مؤهل لتصحيح المسار (ليس من الطلبات المعطوبة)"
        )
    if existing.get("routing_fixed_at"):
        raise HTTPException(
            status_code=409,
            detail="تم تصحيح مسار هذا الطلب مسبقاً — لا يمكن تعديله مرة أخرى"
        )

    update_set = {}
    audit_old = {}
    fields_to_check = [
        "order_type", "payment_method", "payment_status", "customer_type",
        "customer_name", "customer_phone", "delivery_company_id",
        "delivery_company_name", "delivery_company_order_id",
        "driver_id", "driver_name", "delivery_address", "delivery_fee", "notes",
    ]
    for f in fields_to_check:
        new_val = getattr(payload, f, None)
        if new_val is not None:
            update_set[f] = new_val
            audit_old[f] = existing.get(f)

    if not update_set:
        raise HTTPException(status_code=400, detail="لا توجد حقول لتحديثها")

    # ⭐ توجيه شركة التوصيل: عيّن الحقول التي يعتمد عليها تقرير شركات التوصيل
    # (delivery_app / delivery_app_name / is_delivery_company / delivery_commission)
    _is_dc = (
        (payload.payment_method or "").lower() == "delivery_company"
        or payload.customer_type == "delivery_company"
        or bool(payload.delivery_company_id)
    )
    if _is_dc:
        _app_id = payload.delivery_company_id
        _name = payload.delivery_company_name or existing.get("delivery_company_name")
        # محاولة مطابقة الاسم بشركة معروفة لجلب المعرف والنسبة عند عدم تمرير المعرف
        if not _app_id and _name:
            match = await db.delivery_app_settings.find_one(
                {"name": _name, **({"tenant_id": tenant_id} if tenant_id else {})}, {"_id": 0}
            ) or await db.delivery_apps.find_one(
                {"name": _name, **({"tenant_id": tenant_id} if tenant_id else {})}, {"_id": 0}
            )
            if match:
                _app_id = match.get("app_id") or match.get("id")
        update_set["delivery_app"] = _app_id
        update_set["delivery_app_name"] = _name
        update_set["is_delivery_company"] = True
        _rate = await _get_company_commission_rate(tenant_id, _app_id)
        update_set["delivery_commission"] = round((existing.get("total", 0) or 0) * _rate / 100, 2)

    update_set["routing_fixed_at"] = datetime.now(timezone.utc).isoformat()
    update_set["routing_fixed_by"] = current_user.get("id")
    update_set["routing_fixed_by_name"] = current_user.get("full_name") or current_user.get("username")
    update_set["updated_at"] = datetime.now(timezone.utc).isoformat()

    history_entry = {
        "fixed_at": datetime.now(timezone.utc).isoformat(),
        "fixed_by": current_user.get("id"),
        "fixed_by_name": current_user.get("full_name") or current_user.get("username"),
        "old_values": audit_old,
        "new_values": {k: v for k, v in update_set.items() if k in fields_to_check},
    }

    # $push آمن من race conditions (atomic append)
    await db.orders.update_one(
        {"id": order_id},
        {"$set": update_set, "$push": {"routing_fix_history": history_entry}}
    )

    return SyncResult(
        success=True,
        id=order_id,
        order_number=existing.get("order_number"),
        message=f"تم تصحيح مسار الطلب #{existing.get('order_number')}"
    )




class AssignDeliveryCompanyPayload(BaseModel):
    delivery_company_id: str
    delivery_company_name: Optional[str] = None
    note: Optional[str] = None


@router.patch("/orders/{order_id}/assign-delivery-company", response_model=SyncResult)
async def assign_delivery_company(
    order_id: str,
    payload: AssignDeliveryCompanyPayload,
    current_user: dict = Depends(get_current_user)
):
    """نقل طلب موجود (آجل عادي أو نقدي) إلى حساب شركة توصيل/ائتمان معيّنة.

    حالة الاستخدام الأساسية:
    - الكاشير سجّل طلباً أوفلاين كـ "آجل عدي" بسبب انقطاع الإنترنت، رغم أن
      العميل من شركة (مثل توترز). هذا endpoint ينقله إلى حساب الشركة دون
      المساس بـ order_number أو totals.

    صلاحية: المالك / المدير العام / المدير فقط.
    """
    if current_user.get("role") not in ["admin", "general_manager", "super_admin", "manager"]:
        raise HTTPException(status_code=403, detail="غير مسموح — للمالك/المدير فقط")

    tenant_id = get_user_tenant_id(current_user)
    q = {"id": order_id}
    if tenant_id:
        q["tenant_id"] = tenant_id
    existing = await db.orders.find_one(q, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="الطلب غير موجود")

    # تأكد أن الشركة موجودة (delivery_apps) واجلب الاسم لو لم يُمرَّر
    company_name = (payload.delivery_company_name or "").strip()
    if not company_name:
        app_q = {"id": payload.delivery_company_id}
        if tenant_id:
            app_q["tenant_id"] = tenant_id
        app_doc = await db.delivery_apps.find_one(app_q, {"_id": 0, "name": 1})
        company_name = (app_doc or {}).get("name") or payload.delivery_company_id

    old_snapshot = {
        "customer_type": existing.get("customer_type"),
        "delivery_company_id": existing.get("delivery_company_id"),
        "delivery_company": existing.get("delivery_company"),
        "delivery_company_name": existing.get("delivery_company_name"),
        "payment_method": existing.get("payment_method"),
        "payment_status": existing.get("payment_status"),
        "order_type": existing.get("order_type"),
    }

    # نسبة العمولة الحالية للشركة (لتظهر في تقرير شركات التوصيل بشكل صحيح)
    _rate = await _get_company_commission_rate(tenant_id, payload.delivery_company_id)
    _commission = round((existing.get("total", 0) or 0) * _rate / 100, 2)

    update_set = {
        "customer_type": "delivery_company",
        "delivery_company_id": payload.delivery_company_id,
        "delivery_company": company_name,
        "delivery_company_name": company_name,
        # ⭐ إصلاح: تعيين حقول التوصيل التي يعتمد عليها التقرير لتوجيه قيمة الطلب لشركته
        "delivery_app": payload.delivery_company_id,
        "delivery_app_name": company_name,
        "is_delivery_company": True,
        "delivery_commission": _commission,
        "order_type": "delivery",
        # الدفع ينتقل إلى ذمة الشركة — يبقى unpaid حتى تحصيل من الشركة
        "payment_method": "delivery_company",
        "payment_status": existing.get("payment_status") or "unpaid",
        "company_assigned_at": datetime.now(timezone.utc).isoformat(),
        "company_assigned_by": current_user.get("id"),
        "company_assigned_by_name": current_user.get("full_name") or current_user.get("username"),
        "company_assignment_note": payload.note,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }

    history_entry = {
        "assigned_at": datetime.now(timezone.utc).isoformat(),
        "assigned_by": current_user.get("id"),
        "assigned_by_name": current_user.get("full_name") or current_user.get("username"),
        "old_values": old_snapshot,
        "new_company_id": payload.delivery_company_id,
        "new_company_name": company_name,
        "note": payload.note,
    }

    await db.orders.update_one(
        {"id": order_id},
        {"$set": update_set, "$push": {"company_assignment_history": history_entry}}
    )

    return SyncResult(
        success=True,
        id=order_id,
        order_number=existing.get("order_number"),
        message=f"تم نقل الطلب #{existing.get('order_number')} إلى شركة {company_name}"
    )





@router.post("/customers", response_model=SyncResult)
async def sync_customer(customer: OfflineCustomer, current_user: dict = Depends(get_current_user)):
    """
    مزامنة عميل من الـ Offline
    """
    try:
        tenant_id = get_user_tenant_id(current_user)
        
        # التحقق من عدم وجود العميل مسبقاً (بناءً على الهاتف)
        if customer.phone:
            existing = await db.customers.find_one({
                "phone": customer.phone,
                "tenant_id": tenant_id
            })
            if existing:
                return SyncResult(
                    success=True,
                    id=existing.get("id"),
                    message="العميل موجود مسبقاً"
                )
        
        # إنشاء العميل الجديد
        new_customer = {
            "id": customer.id or str(uuid.uuid4()),
            "name": customer.name,
            "phone": customer.phone,
            "email": customer.email,
            "address": customer.address,
            "notes": customer.notes,
            "tenant_id": tenant_id,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "synced_at": datetime.now(timezone.utc).isoformat()
        }
        
        await db.customers.insert_one(new_customer)
        
        return SyncResult(
            success=True,
            id=new_customer["id"],
            message="تم حفظ العميل"
        )
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"خطأ في المزامنة: {str(e)}")


@router.post("/batch")
async def sync_batch(
    orders: List[OfflineOrder] = [],
    customers: List[OfflineCustomer] = [],
    current_user: dict = Depends(get_current_user)
):
    """
    مزامنة مجموعة من الطلبات والعملاء دفعة واحدة
    """
    results = {
        "orders": {"synced": 0, "failed": 0, "details": []},
        "customers": {"synced": 0, "failed": 0, "details": []}
    }
    
    # مزامنة الطلبات
    for order in orders:
        try:
            result = await sync_order(order, current_user)
            if result.success:
                results["orders"]["synced"] += 1
                results["orders"]["details"].append({
                    "offline_id": order.offline_id,
                    "server_id": result.id,
                    "order_number": result.order_number
                })
            else:
                results["orders"]["failed"] += 1
        except Exception:
            results["orders"]["failed"] += 1
    
    # مزامنة العملاء
    for customer in customers:
        try:
            result = await sync_customer(customer, current_user)
            if result.success:
                results["customers"]["synced"] += 1
                results["customers"]["details"].append({
                    "id": result.id
                })
            else:
                results["customers"]["failed"] += 1
        except Exception:
            results["customers"]["failed"] += 1
    
    return results


@router.get("/status")
async def get_sync_status(current_user: dict = Depends(get_current_user)):
    """
    الحصول على حالة المزامنة
    """
    tenant_id = get_user_tenant_id(current_user)
    
    # عدد الطلبات Offline اليوم
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    stats = await db.daily_stats.find_one({
        "date": today,
        "tenant_id": tenant_id
    })
    
    return {
        "server_time": datetime.now(timezone.utc).isoformat(),
        "offline_orders_today": stats.get("offline_orders", 0) if stats else 0,
        "total_orders_today": stats.get("total_orders", 0) if stats else 0
    }


# ==================== TABLE SYNC ====================

class TableUpdate(BaseModel):
    id: str
    status: Optional[str] = None
    current_order_id: Optional[str] = None
    offline_id: Optional[str] = None


@router.post("/tables")
async def sync_table_update(update: TableUpdate, current_user: dict = Depends(get_current_user)):
    """
    مزامنة تحديث طاولة من الـ Offline
    """
    try:
        tenant_id = get_user_tenant_id(current_user)
        
        # البحث عن الطاولة
        table = await db.tables.find_one({
            "id": update.id,
            "tenant_id": tenant_id
        })
        
        if not table:
            raise HTTPException(status_code=404, detail="الطاولة غير موجودة")
        
        # تحديث الطاولة
        update_data = {
            "updated_at": datetime.now(timezone.utc).isoformat()
        }
        
        if update.status:
            update_data["status"] = update.status
        if update.current_order_id:
            update_data["current_order_id"] = update.current_order_id
        
        await db.tables.update_one(
            {"id": update.id, "tenant_id": tenant_id},
            {"$set": update_data}
        )
        
        return {"success": True, "id": update.id, "message": "تم تحديث الطاولة"}
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"خطأ في المزامنة: {str(e)}")


# ==================== ATTENDANCE SYNC ====================

class OfflineAttendance(BaseModel):
    id: Optional[str] = None
    offline_id: Optional[str] = None
    employee_id: str
    date: str
    check_in: Optional[str] = None
    check_out: Optional[str] = None
    status: Optional[str] = "present"
    notes: Optional[str] = None
    branch_id: Optional[str] = None


@router.post("/attendance")
async def sync_attendance(attendance: OfflineAttendance, current_user: dict = Depends(get_current_user)):
    """
    مزامنة سجل حضور من الـ Offline
    """
    try:
        tenant_id = get_user_tenant_id(current_user)
        
        # التحقق من عدم وجود سجل مسبق (نفس الموظف ونفس التاريخ)
        existing = await db.attendance.find_one({
            "employee_id": attendance.employee_id,
            "date": attendance.date,
            "tenant_id": tenant_id
        })
        
        if existing:
            # تحديث السجل الموجود
            update_data = {
                "updated_at": datetime.now(timezone.utc).isoformat()
            }
            if attendance.check_in:
                update_data["check_in"] = attendance.check_in
            if attendance.check_out:
                update_data["check_out"] = attendance.check_out
            if attendance.status:
                update_data["status"] = attendance.status
            if attendance.notes:
                update_data["notes"] = attendance.notes
                
            await db.attendance.update_one(
                {"id": existing["id"]},
                {"$set": update_data}
            )
            
            return {
                "success": True,
                "id": existing["id"],
                "message": "تم تحديث سجل الحضور"
            }
        
        # إنشاء سجل جديد
        new_attendance = {
            "id": attendance.id or str(uuid.uuid4()),
            "offline_id": attendance.offline_id,
            "employee_id": attendance.employee_id,
            "date": attendance.date,
            "check_in": attendance.check_in,
            "check_out": attendance.check_out,
            "status": attendance.status or "present",
            "notes": attendance.notes,
            "branch_id": attendance.branch_id or current_user.get("branch_id"),
            "tenant_id": tenant_id,
            "is_offline": True,
            "synced_at": datetime.now(timezone.utc).isoformat(),
            "created_at": datetime.now(timezone.utc).isoformat()
        }
        
        await db.attendance.insert_one(new_attendance)
        
        return {
            "success": True,
            "id": new_attendance["id"],
            "message": "تم حفظ سجل الحضور"
        }
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"خطأ في المزامنة: {str(e)}")


# ==================== INVENTORY SYNC ====================

class OfflineInventoryTransaction(BaseModel):
    id: Optional[str] = None
    offline_id: Optional[str] = None
    item_id: str
    item_name: Optional[str] = None
    transaction_type: str  # add, remove, adjust
    quantity: float
    notes: Optional[str] = None
    branch_id: Optional[str] = None
    created_at: Optional[str] = None


class PushSubscription(BaseModel):
    endpoint: str
    keys: dict
    device_name: Optional[str] = None


# ==================== PUSH NOTIFICATION HELPERS ====================

async def send_push_notification(subscription: dict, title: str, body: str, data: dict = None):
    """
    إرسال إشعار Push لمشترك واحد
    """
    try:
        # تخزين الإشعار في قاعدة البيانات للاسترجاع لاحقاً
        # في الإنتاج يُفضل استخدام pywebpush لإرسال push فعلي
        notification_data = {
            "title": title,
            "body": body,
            "icon": "/icons/admin-icon-192.png",
            "badge": "/icons/admin-icon-192.png",
            "data": data or {},
            "tag": "sync-notification",
            "requireInteraction": False
        }
        
        await db.notifications.insert_one({
            "id": str(uuid.uuid4()),
            "subscription_endpoint": subscription.get("endpoint"),
            "title": title,
            "body": body,
            "data": data,
            "notification_payload": notification_data,
            "status": "pending",
            "created_at": datetime.now(timezone.utc).isoformat()
        })
        
        return True
    except Exception as e:
        print(f"Error sending push notification: {e}")
        return False


async def notify_other_devices(tenant_id: str, current_device_endpoint: str, title: str, body: str, data: dict = None):
    """
    إرسال إشعارات لجميع الأجهزة الأخرى في نفس المستأجر
    """
    try:
        # جلب جميع اشتراكات المستأجر (ما عدا الجهاز الحالي)
        subscriptions = await db.push_subscriptions.find({
            "tenant_id": tenant_id,
            "endpoint": {"$ne": current_device_endpoint},
            "is_active": True
        }).to_list(100)
        
        sent_count = 0
        for sub in subscriptions:
            if await send_push_notification(sub, title, body, data):
                sent_count += 1
        
        return sent_count
    except Exception as e:
        print(f"Error notifying other devices: {e}")
        return 0


@router.post("/inventory")
async def sync_inventory_transaction(
    transaction: OfflineInventoryTransaction,
    current_user: dict = Depends(get_current_user)
):
    """
    مزامنة حركة مخزون من الـ Offline
    """
    try:
        tenant_id = get_user_tenant_id(current_user)
        
        # التحقق من عدم وجود الحركة مسبقاً (بناءً على offline_id)
        if transaction.offline_id:
            existing = await db.inventory_transactions.find_one({
                "offline_id": transaction.offline_id,
                "tenant_id": tenant_id
            })
            if existing:
                return {
                    "success": True,
                    "id": existing.get("id"),
                    "message": "الحركة موجودة مسبقاً"
                }
        
        # إنشاء سجل الحركة
        new_transaction = {
            "id": transaction.id or str(uuid.uuid4()),
            "offline_id": transaction.offline_id,
            "item_id": transaction.item_id,
            "item_name": transaction.item_name,
            "transaction_type": transaction.transaction_type,
            "quantity": transaction.quantity,
            "notes": transaction.notes,
            "branch_id": transaction.branch_id or current_user.get("branch_id"),
            "user_id": current_user.get("id"),
            "user_name": current_user.get("name") or current_user.get("full_name"),
            "tenant_id": tenant_id,
            "is_offline": True,
            "synced_at": datetime.now(timezone.utc).isoformat(),
            "created_at": transaction.created_at or datetime.now(timezone.utc).isoformat()
        }
        
        await db.inventory_transactions.insert_one(new_transaction)
        
        # تحديث كمية المخزون
        quantity_change = transaction.quantity
        if transaction.transaction_type == "remove":
            quantity_change = -transaction.quantity
        
        await db.inventory.update_one(
            {"id": transaction.item_id, "tenant_id": tenant_id},
            {"$inc": {"quantity": quantity_change}}
        )
        
        return {
            "success": True,
            "id": new_transaction["id"],
            "message": "تم حفظ حركة المخزون"
        }
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"خطأ في المزامنة: {str(e)}")



# ==================== PUSH SUBSCRIPTION ROUTES ====================

@router.post("/push/subscribe")
async def subscribe_push(subscription: PushSubscription, current_user: dict = Depends(get_current_user)):
    """
    تسجيل اشتراك Push لجهاز جديد
    """
    try:
        tenant_id = get_user_tenant_id(current_user)
        
        # التحقق من عدم وجود الاشتراك مسبقاً
        existing = await db.push_subscriptions.find_one({
            "endpoint": subscription.endpoint,
            "tenant_id": tenant_id
        })
        
        if existing:
            # تحديث الاشتراك الموجود
            await db.push_subscriptions.update_one(
                {"endpoint": subscription.endpoint},
                {
                    "$set": {
                        "keys": subscription.keys,
                        "device_name": subscription.device_name,
                        "is_active": True,
                        "updated_at": datetime.now(timezone.utc).isoformat()
                    }
                }
            )
            return {"success": True, "message": "تم تحديث الاشتراك"}
        
        # إنشاء اشتراك جديد
        new_subscription = {
            "id": str(uuid.uuid4()),
            "endpoint": subscription.endpoint,
            "keys": subscription.keys,
            "device_name": subscription.device_name,
            "user_id": current_user.get("id"),
            "user_name": current_user.get("name") or current_user.get("full_name"),
            "tenant_id": tenant_id,
            "is_active": True,
            "created_at": datetime.now(timezone.utc).isoformat()
        }
        
        await db.push_subscriptions.insert_one(new_subscription)
        
        return {"success": True, "message": "تم تسجيل الاشتراك بنجاح"}
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"خطأ في تسجيل الاشتراك: {str(e)}")


@router.post("/push/unsubscribe")
async def unsubscribe_push(subscription: PushSubscription, current_user: dict = Depends(get_current_user)):
    """
    إلغاء اشتراك Push
    """
    try:
        tenant_id = get_user_tenant_id(current_user)
        
        await db.push_subscriptions.update_one(
            {"endpoint": subscription.endpoint, "tenant_id": tenant_id},
            {"$set": {"is_active": False, "updated_at": datetime.now(timezone.utc).isoformat()}}
        )
        
        return {"success": True, "message": "تم إلغاء الاشتراك"}
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"خطأ في إلغاء الاشتراك: {str(e)}")


@router.get("/push/subscriptions")
async def get_push_subscriptions(current_user: dict = Depends(get_current_user)):
    """
    الحصول على قائمة الأجهزة المشتركة
    """
    try:
        tenant_id = get_user_tenant_id(current_user)
        
        subscriptions = await db.push_subscriptions.find(
            {"tenant_id": tenant_id, "is_active": True},
            {"_id": 0, "keys": 0}  # لا نرسل المفاتيح
        ).to_list(100)
        
        return {
            "count": len(subscriptions),
            "devices": subscriptions
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"خطأ في جلب الاشتراكات: {str(e)}")


@router.get("/push/notifications")
async def get_pending_notifications(current_user: dict = Depends(get_current_user)):
    """
    الحصول على الإشعارات المعلقة للجهاز الحالي
    """
    try:
        tenant_id = get_user_tenant_id(current_user)
        
        # جلب آخر 20 إشعار
        notifications = await db.notifications.find(
            {"tenant_id": tenant_id},
            {"_id": 0}
        ).sort("created_at", -1).limit(20).to_list(20)
        
        return {"notifications": notifications}
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"خطأ في جلب الإشعارات: {str(e)}")
