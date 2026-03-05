"""
Sync Routes - مسارات المزامنة للعمل Offline
"""
from fastapi import APIRouter, HTTPException, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel
from typing import Optional, List, Any
from motor.motor_asyncio import AsyncIOMotorClient
import os
import jwt
import uuid
import json
import httpx
from datetime import datetime, timezone

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
    status: Optional[str] = "pending"
    order_type: Optional[str] = "dine_in"
    table_id: Optional[str] = None
    customer_id: Optional[str] = None
    customer_name: Optional[str] = None
    customer_phone: Optional[str] = None
    delivery_address: Optional[str] = None
    notes: Optional[str] = None
    payment_method: Optional[str] = "cash"
    paid_amount: Optional[float] = 0
    change_amount: Optional[float] = 0
    branch_id: Optional[str] = None
    cashier_id: Optional[str] = None
    cashier_name: Optional[str] = None
    created_at: Optional[str] = None
    is_offline_order: Optional[bool] = False

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

async def get_next_order_number(tenant_id: str) -> int:
    """الحصول على رقم الطلب التالي"""
    counter = await db.counters.find_one_and_update(
        {"_id": f"order_number_{tenant_id}"},
        {"$inc": {"seq": 1}},
        upsert=True,
        return_document=True
    )
    return counter.get("seq", 1)

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
        
        # الحصول على رقم الطلب التالي
        order_number = await get_next_order_number(tenant_id)
        
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
            "status": order.status or "pending",
            "order_type": order.order_type or "dine_in",
            "table_id": order.table_id,
            "customer_id": order.customer_id,
            "customer_name": order.customer_name,
            "customer_phone": order.customer_phone,
            "delivery_address": order.delivery_address,
            "notes": order.notes,
            "payment_method": order.payment_method or "cash",
            "paid_amount": order.paid_amount or 0,
            "change_amount": order.change_amount or 0,
            "branch_id": order.branch_id or current_user.get("branch_id"),
            "cashier_id": order.cashier_id or current_user.get("id"),
            "cashier_name": order.cashier_name or current_user.get("name") or current_user.get("full_name"),
            "tenant_id": tenant_id,
            "is_offline_order": True,
            "synced_at": datetime.now(timezone.utc).isoformat(),
            "created_at": order.created_at or datetime.now(timezone.utc).isoformat(),
            "updated_at": datetime.now(timezone.utc).isoformat()
        }
        
        # حفظ الطلب
        await db.orders.insert_one(new_order)
        
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
        
        return SyncResult(
            success=True,
            id=new_order["id"],
            order_number=order_number,
            message=f"تم حفظ الطلب برقم #{order_number}"
        )
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"خطأ في المزامنة: {str(e)}")


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
        except Exception as e:
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
        except Exception as e:
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
