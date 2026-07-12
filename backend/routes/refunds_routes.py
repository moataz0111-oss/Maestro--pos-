"""Refund/Return Routes (extracted from server.py)"""
from fastapi import APIRouter
from server import *  # noqa: F401,F403
from server import (_sn)

router = APIRouter()

# ==================== REFUND/RETURN ROUTES - إرجاع الطلبات ====================

class RefundCreate(BaseModel):
    """نموذج إنشاء إرجاع"""
    order_id: str  # رقم الطلب (يمكن أن يكون order_number أو id)
    reason: str  # سبب الإرجاع (مطلوب)
    refund_type: str = "full"  # full أو partial
    refund_amount: Optional[float] = None  # المبلغ المسترد (للإرجاع الجزئي)
    items_to_refund: Optional[List[Dict[str, Any]]] = None  # العناصر المسترجعة (للإرجاع الجزئي)
    notes: Optional[str] = None

class RefundResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    refund_number: int
    order_id: str
    order_number: int
    order_type: str
    original_total: float
    refund_amount: float
    refund_type: str
    reason: str
    items_refunded: List[Dict[str, Any]] = []
    refunded_by: str
    refunded_by_name: str
    branch_id: str
    status: str  # pending, approved, completed, rejected
    notes: Optional[str] = None
    created_at: str
    completed_at: Optional[str] = None

async def get_next_refund_number(branch_id: str) -> int:
    """الحصول على رقم الإرجاع التالي"""
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    counter = await db.refund_counters.find_one_and_update(
        {"branch_id": branch_id, "date": today},
        {"$inc": {"counter": 1}},
        upsert=True,
        return_document=True
    )
    return counter["counter"]

@router.post("/refunds")
async def create_refund(refund: RefundCreate, current_user: dict = Depends(get_current_user)):
    """إنشاء طلب إرجاع - يتطلب صلاحية can_refund"""
    
    # التحقق من الصلاحية
    user_permissions = current_user.get("permissions", [])
    user_role = current_user.get("role", "")
    
    # المدير والمالك لديهم صلاحية كاملة، أو المستخدم لديه صلاحية can_refund
    if user_role not in [UserRole.ADMIN, UserRole.GENERAL_MANAGER, UserRole.SUPER_ADMIN, UserRole.MANAGER] and "can_refund" not in user_permissions:
        raise HTTPException(status_code=403, detail="ليس لديك صلاحية إرجاع الطلبات")
    
    # التحقق من وجود سبب الإرجاع (شرط إلزامي)
    if not refund.reason or len(refund.reason.strip()) < 3:
        raise HTTPException(status_code=400, detail="يجب كتابة سبب الإرجاع (3 أحرف على الأقل)")
    
    tenant_id = get_user_tenant_id(current_user)
    
    # البحث عن الطلب برقم الفاتورة أو الـ ID
    order_query = {"$or": [{"id": refund.order_id}]}
    
    # محاولة تحويل order_id إلى رقم للبحث برقم الفاتورة
    try:
        order_number = int(refund.order_id)
        order_query["$or"].append({"order_number": order_number})
    except ValueError:
        pass
    
    if tenant_id:
        order_query["tenant_id"] = tenant_id
    
    # جلب آخر طلب بهذا الرقم
    orders = await db.orders.find(order_query, {"_id": 0}).sort("created_at", -1).to_list(1)
    
    if not orders:
        raise HTTPException(status_code=404, detail="الطلب غير موجود. تأكد من رقم الفاتورة")
    
    order = orders[0]
    
    # التحقق من أن الطلب من نفس اليوم
    order_date = order.get("created_at", "")
    if order_date:
        if isinstance(order_date, str):
            order_datetime = datetime.fromisoformat(order_date.replace("Z", "+00:00"))
        else:
            order_datetime = order_date
        
        today = datetime.now(timezone.utc).date()
        order_day = order_datetime.date()
        
        if order_day != today:
            raise HTTPException(
                status_code=400, 
                detail=f"لا يمكن إرجاع هذا الطلب. الإرجاع متاح فقط لطلبات اليوم. تاريخ الطلب: {order_day.strftime('%Y-%m-%d')}"
            )
    
    # التحقق من أن الطلب مدفوع
    if order.get("payment_status") not in ["paid", "credit"]:
        raise HTTPException(status_code=400, detail="لا يمكن إرجاع طلب غير مدفوع")
    
    # التحقق من عدم وجود إرجاع سابق لنفس الطلب (إرجاع كامل)
    existing_refund = await db.refunds.find_one({
        "order_id": order["id"],
        "refund_type": "full",
        "status": {"$in": ["pending", "approved", "completed"]}
    })
    if existing_refund:
        raise HTTPException(status_code=400, detail="تم إرجاع هذا الطلب مسبقاً")
    
    # حساب مبلغ الإرجاع
    original_total = _sn(order.get("total"))
    
    if refund.refund_type == "full":
        refund_amount = original_total
        items_refunded = order.get("items", [])
    else:
        # إرجاع جزئي
        if not refund.refund_amount and not refund.items_to_refund:
            raise HTTPException(status_code=400, detail="يجب تحديد المبلغ أو العناصر للإرجاع الجزئي")
        refund_amount = refund.refund_amount or 0
        items_refunded = refund.items_to_refund or []
    
    # إنشاء سجل الإرجاع
    refund_number = await get_next_refund_number(order.get("branch_id", ""))
    
    refund_doc = {
        "id": str(uuid.uuid4()),
        "refund_number": refund_number,
        "order_id": order["id"],
        "order_number": order.get("order_number", 0),
        "order_type": order.get("order_type", ""),
        "original_total": original_total,
        "refund_amount": refund_amount,
        "refund_type": refund.refund_type,
        "reason": refund.reason.strip(),
        "items_refunded": items_refunded,
        "refunded_by": current_user["id"],
        "refunded_by_name": current_user.get("full_name", current_user.get("username", "")),
        "branch_id": order.get("branch_id", ""),
        "tenant_id": tenant_id,
        "status": "completed",  # يتم الإرجاع مباشرة
        "notes": refund.notes,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "completed_at": datetime.now(timezone.utc).isoformat(),
        # معلومات إضافية للتقارير
        "customer_name": order.get("customer_name"),
        "customer_phone": order.get("customer_phone"),
        "original_payment_method": order.get("payment_method"),
        "shift_id": order.get("shift_id")
    }
    
    await db.refunds.insert_one(refund_doc)
    
    # تحديث حالة الطلب الأصلي
    update_data = {
        "is_refunded": True,
        "refund_id": refund_doc["id"],
        "refund_amount": refund_amount,
        "refund_reason": refund.reason,
        "refunded_at": datetime.now(timezone.utc).isoformat(),
        "refunded_by": current_user["id"]
    }
    
    if refund.refund_type == "full":
        update_data["status"] = "refunded"
    
    await db.orders.update_one({"id": order["id"]}, {"$set": update_data})
    
    if "_id" in refund_doc:
        del refund_doc["_id"]
    return refund_doc

@router.get("/refunds")
async def get_refunds(
    branch_id: Optional[str] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    status: Optional[str] = None,
    skip: int = Query(0, ge=0, description="عدد العناصر للتخطي"),
    limit: int = Query(100, ge=1, le=500, description="الحد الأقصى للعناصر"),
    current_user: dict = Depends(get_current_user)
):
    """جلب قائمة الإرجاعات مع pagination"""
    query = build_tenant_query(current_user)
    
    if branch_id:
        query["branch_id"] = branch_id
    
    if status:
        query["status"] = status
    
    if date_from:
        query["created_at"] = {"$gte": date_from}
    
    if date_to:
        if "created_at" in query:
            query["created_at"]["$lte"] = date_to + "T23:59:59"
        else:
            query["created_at"] = {"$lte": date_to + "T23:59:59"}
    
    refunds = await db.refunds.find(query, {"_id": 0}).sort("created_at", -1).skip(skip).limit(limit).to_list(limit)
    return refunds

@router.get("/refunds/{refund_id}")
async def get_refund(refund_id: str, current_user: dict = Depends(get_current_user)):
    """جلب تفاصيل إرجاع محدد"""
    query = build_tenant_query(current_user, {"id": refund_id})
    refund = await db.refunds.find_one(query, {"_id": 0})
    
    if not refund:
        raise HTTPException(status_code=404, detail="الإرجاع غير موجود")
    
    return refund

@router.get("/orders/{order_id}/refund-status")
async def check_order_refund_status(order_id: str, branch_id: Optional[str] = None, current_user: dict = Depends(get_current_user)):
    """التحقق من حالة إرجاع طلب معين"""
    tenant_id = get_user_tenant_id(current_user)
    
    # البحث عن الطلب برقم الفاتورة أو الـ ID
    or_conditions = [{"id": order_id}]
    try:
        order_number = int(order_id)
        or_conditions.append({"order_number": order_number})
    except ValueError:
        pass
    
    # ⭐ فلترة صارمة على الفرع — أرقام الفواتير تتكرر بين الفروع
    # نُحدّد الفرع من المعامل أو من فرع المستخدم الحالي
    effective_branch_id = branch_id or current_user.get("branch_id")

    # بناء الاستعلام مع tenant_id + branch_id (إن وُجد)
    and_clauses = [{"$or": or_conditions}]
    if tenant_id:
        and_clauses.append({"tenant_id": tenant_id})
    if effective_branch_id:
        and_clauses.append({"branch_id": effective_branch_id})
    order_query = {"$and": and_clauses}
    
    # جلب آخر طلب بهذا الرقم (الأحدث)
    orders = await db.orders.find(order_query, {"_id": 0}).sort("created_at", -1).to_list(1)
    
    if not orders:
        raise HTTPException(status_code=404, detail="الطلب غير موجود في هذا الفرع. تأكد من رقم الفاتورة")
    
    order = orders[0]
    
    # التحقق من تاريخ الطلب
    order_date = order.get("created_at", "")
    is_today = False
    order_date_str = ""
    
    if order_date:
        if isinstance(order_date, str):
            order_datetime = datetime.fromisoformat(order_date.replace("Z", "+00:00"))
        else:
            order_datetime = order_date
        
        today = datetime.now(timezone.utc).date()
        order_day = order_datetime.date()
        is_today = (order_day == today)
        order_date_str = order_day.strftime('%Y-%m-%d')
    
    # البحث عن إرجاعات لهذا الطلب
    refunds = await db.refunds.find({"order_id": order["id"]}, {"_id": 0}).to_list(10)
    
    # تحديد إمكانية الإرجاع
    can_refund = (
        order.get("payment_status") in ["paid", "credit"] 
        and not order.get("is_refunded") 
        and is_today
    )
    
    # رسالة توضيحية إذا لم يكن قابل للإرجاع
    refund_message = None
    if not can_refund:
        if order.get("is_refunded"):
            refund_message = "تم إرجاع هذا الطلب مسبقاً"
        elif order.get("payment_status") not in ["paid", "credit"]:
            refund_message = "الطلب غير مدفوع"
        elif not is_today:
            refund_message = f"لا يمكن إرجاع طلبات الأيام السابقة. تاريخ الطلب: {order_date_str}"
    
    return {
        "order_id": order["id"],
        "order_number": order.get("order_number"),
        "order_type": order.get("order_type"),
        "total": _sn(order.get("total")),
        "payment_status": order.get("payment_status"),
        "customer_name": order.get("customer_name"),
        "created_at": order.get("created_at"),
        "order_date": order_date_str,
        "is_today": is_today,
        "is_refunded": order.get("is_refunded", False),
        "can_refund": can_refund,
        "refund_message": refund_message,
        "refunds": refunds
    }

