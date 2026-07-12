"""Coupons & Promotions (extracted from server.py)"""
from fastapi import APIRouter
from server import *  # noqa: F401,F403

router = APIRouter()

# ==================== COUPONS & PROMOTIONS ROUTES - الكوبونات والعروض ====================

class CouponCreate(BaseModel):
    code: str
    name: str
    description: Optional[str] = None
    discount_type: str = "percentage"  # percentage, fixed
    discount_value: float
    min_order_amount: float = 0
    max_discount: Optional[float] = None  # للنسبة المئوية فقط
    usage_limit: Optional[int] = None  # عدد مرات الاستخدام الكلي
    usage_per_customer: int = 1  # عدد مرات الاستخدام لكل عميل
    valid_from: str
    valid_until: str
    is_active: bool = True
    applicable_to: str = "all"  # all, category, product
    applicable_ids: List[str] = []  # category_ids أو product_ids
    loyalty_tier_required: Optional[str] = None  # bronze, silver, gold, platinum
    first_order_only: bool = False
    # ===== الحقول الجديدة =====
    branch_ids: List[str] = []  # الفروع المسموح بها (فارغ = كل الفروع)
    daily_start_time: Optional[str] = None  # HH:MM وقت بدء التفعيل اليومي (None = طول اليوم)
    daily_end_time: Optional[str] = None    # HH:MM وقت انتهاء التفعيل اليومي
    customer_name: Optional[str] = None  # اسم العميل المرتبط بالكوبون (None = للجميع)

class PromotionCreate(BaseModel):
    name: str
    description: Optional[str] = None
    promotion_type: str = "buy_x_get_y"  # buy_x_get_y, bundle, happy_hour, flash_sale
    buy_quantity: int = 1
    get_quantity: int = 1
    discount_percent: float = 100  # للعنصر المجاني
    bundle_price: Optional[float] = None
    start_time: Optional[str] = None  # HH:MM للـ happy_hour
    end_time: Optional[str] = None
    valid_from: str
    valid_until: str
    applicable_products: List[str] = []
    applicable_categories: List[str] = []
    is_active: bool = True
    loyalty_tier_required: Optional[str] = None

@router.get("/coupons")
async def get_coupons(current_user: dict = Depends(get_current_user)):
    """قائمة الكوبونات"""
    query = build_tenant_query(current_user)
    coupons = await db.coupons.find(query, {"_id": 0}).sort("created_at", -1).to_list(200)
    return coupons

@router.post("/coupons")
async def create_coupon(coupon: CouponCreate, current_user: dict = Depends(get_current_user)):
    """إنشاء كوبون"""
    if current_user["role"] not in [UserRole.ADMIN, UserRole.GENERAL_MANAGER, UserRole.MANAGER, UserRole.SUPER_ADMIN]:
        raise HTTPException(status_code=403, detail="غير مصرح")
    
    # التحقق من عدم تكرار الكود
    existing = await db.coupons.find_one({"code": coupon.code.upper()})
    if existing:
        raise HTTPException(status_code=400, detail="كود الكوبون موجود مسبقاً")
    
    coupon_doc = {
        "id": str(uuid.uuid4()),
        **coupon.model_dump(),
        "code": coupon.code.upper(),
        "used_count": 0,
        "total_discount_given": 0,
        "tenant_id": get_user_tenant_id(current_user),
        "created_by": current_user["id"],
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    
    await db.coupons.insert_one(coupon_doc)
    if "_id" in coupon_doc:
        del coupon_doc["_id"]
    
    return {"message": "تم إنشاء الكوبون", "coupon": coupon_doc}

@router.put("/coupons/{coupon_id}")
async def update_coupon(coupon_id: str, coupon: CouponCreate, current_user: dict = Depends(get_current_user)):
    """تحديث كوبون"""
    if current_user["role"] not in [UserRole.ADMIN, UserRole.GENERAL_MANAGER, UserRole.MANAGER, UserRole.SUPER_ADMIN]:
        raise HTTPException(status_code=403, detail="غير مصرح")
    
    query = build_tenant_query(current_user, {"id": coupon_id})
    await db.coupons.update_one(
        query,
        {"$set": {**coupon.model_dump(), "code": coupon.code.upper(), "updated_at": datetime.now(timezone.utc).isoformat()}}
    )
    return {"message": "تم التحديث"}

@router.delete("/coupons/{coupon_id}")
async def delete_coupon(coupon_id: str, current_user: dict = Depends(get_current_user)):
    """حذف كوبون"""
    if current_user["role"] not in [UserRole.ADMIN, UserRole.SUPER_ADMIN]:
        raise HTTPException(status_code=403, detail="غير مصرح")
    
    query = build_tenant_query(current_user, {"id": coupon_id})
    await db.coupons.delete_one(query)
    return {"message": "تم الحذف"}

@router.post("/coupons/validate")
async def validate_coupon(
    code: str,
    order_total: float,
    customer_id: Optional[str] = None,
    customer_phone: Optional[str] = None,
    customer_name: Optional[str] = None,
    branch_id: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """التحقق من صلاحية الكوبون"""
    coupon = await db.coupons.find_one(
        build_tenant_query(current_user, {"code": code.upper(), "is_active": True}),
        {"_id": 0}
    )
    
    if not coupon:
        raise HTTPException(status_code=404, detail="الكوبون غير صالح")
    
    now_dt = datetime.now(timezone.utc)
    now = now_dt.isoformat()
    
    # التحقق من التاريخ
    if coupon.get("valid_from") and coupon.get("valid_from") > now:
        raise HTTPException(status_code=400, detail="الكوبون لم يبدأ بعد")
    
    if coupon.get("valid_until") and coupon.get("valid_until") < now:
        raise HTTPException(status_code=400, detail="الكوبون منتهي الصلاحية")

    # ===== التحقق من الفرع =====
    allowed_branches = coupon.get("branch_ids") or []
    target_branch = branch_id or current_user.get("branch_id")
    if allowed_branches and target_branch and target_branch not in allowed_branches:
        raise HTTPException(status_code=400, detail="الكوبون غير متاح في هذا الفرع")

    # ===== التحقق من الوقت اليومي =====
    ds = coupon.get("daily_start_time")
    de = coupon.get("daily_end_time")
    if ds and de:
        cur_hm = now_dt.strftime("%H:%M")
        # نسمح بالوقت داخل النطاق فقط (لا يدعم نطاق يعبر منتصف الليل)
        if not (ds <= cur_hm <= de):
            raise HTTPException(
                status_code=400,
                detail=f"الكوبون غير فعال في هذا الوقت — مفعل من {ds} إلى {de}"
            )

    # ===== التحقق من اسم العميل المرتبط =====
    target_name = (coupon.get("customer_name") or "").strip().lower()
    if target_name:
        provided = (customer_name or "").strip().lower()
        if not provided or provided != target_name:
            raise HTTPException(status_code=400, detail="هذا الكوبون مخصص لعميل معين")
    
    # التحقق من الحد الأدنى للطلب
    if order_total < coupon.get("min_order_amount", 0):
        raise HTTPException(
            status_code=400, 
            detail=f"الحد الأدنى للطلب {coupon.get('min_order_amount')} د.ع"
        )
    
    # التحقق من عدد الاستخدامات الكلي
    if coupon.get("usage_limit") and coupon.get("used_count", 0) >= coupon.get("usage_limit"):
        raise HTTPException(status_code=400, detail="الكوبون استُنفد")
    
    # التحقق من استخدام العميل
    if customer_phone:
        customer_uses = await db.coupon_usage.count_documents({
            "coupon_id": coupon["id"],
            "customer_phone": customer_phone
        })
        if customer_uses >= coupon.get("usage_per_customer", 1):
            raise HTTPException(status_code=400, detail="لقد استخدمت هذا الكوبون مسبقاً")
    
    # التحقق من مستوى الولاء المطلوب
    if coupon.get("loyalty_tier_required"):
        if customer_phone:
            member = await db.loyalty_members.find_one({"phone": customer_phone}, {"_id": 0})
            if not member:
                raise HTTPException(status_code=400, detail="يجب أن تكون عضواً في برنامج الولاء")
            
            tier_order = {"bronze": 1, "silver": 2, "gold": 3, "platinum": 4}
            required_tier = tier_order.get(coupon.get("loyalty_tier_required").lower(), 0)
            member_tier = tier_order.get(member.get("current_tier", "bronze").lower(), 1)
            
            if member_tier < required_tier:
                raise HTTPException(
                    status_code=400, 
                    detail=f"هذا الكوبون متاح لأعضاء {coupon.get('loyalty_tier_required')} فأعلى"
                )
    
    # التحقق من الطلب الأول
    if coupon.get("first_order_only") and customer_phone:
        previous_orders = await db.orders.count_documents({"customer_phone": customer_phone})
        if previous_orders > 0:
            raise HTTPException(status_code=400, detail="هذا الكوبون للطلب الأول فقط")
    
    # حساب الخصم
    if coupon.get("discount_type") == "percentage":
        discount = order_total * (coupon.get("discount_value", 0) / 100)
        if coupon.get("max_discount"):
            discount = min(discount, coupon.get("max_discount"))
    else:
        discount = coupon.get("discount_value", 0)
    
    return {
        "valid": True,
        "coupon": coupon,
        "discount": round(discount, 2),
        "final_total": round(order_total - discount, 2)
    }

@router.get("/coupons/search-by-customer-prefix")
async def search_coupons_by_customer_prefix(
    prefix: str = "",
    branch_id: Optional[str] = None,
    limit: int = 10,
    current_user: dict = Depends(get_current_user)
):
    """
    اقتراح الكوبونات لـPOS: يرجع كل الكوبونات النشطة المرتبطة بأسماء عملاء
    تبدأ بالنص المُدخل (لـautocomplete أثناء كتابة الكاشير).
    يفلتر على الفرع الحالي والوقت الحالي والصلاحية.
    """
    p = (prefix or "").strip()
    if not p:
        return {"coupons": []}

    target_branch = branch_id or current_user.get("branch_id")
    now_dt = datetime.now(timezone.utc)
    now_iso = now_dt.isoformat()
    cur_hm = now_dt.strftime("%H:%M")

    # نطابق على customer_name إذا موجود، وإلا نقع على name (اسم الكوبون)
    # ↳ يدعم الكوبونات القديمة بدون customer_name
    prefix_regex = f"^{re.escape(p)}"
    base = build_tenant_query(current_user, {
        "is_active": True,
        "$or": [
            {"customer_name": {"$regex": prefix_regex, "$options": "i"}},
            {
                "$and": [
                    {"$or": [
                        {"customer_name": {"$exists": False}},
                        {"customer_name": None},
                        {"customer_name": ""},
                    ]},
                    {"name": {"$regex": prefix_regex, "$options": "i"}},
                ]
            },
        ],
    })
    candidates = await db.coupons.find(base, {"_id": 0}).to_list(100)

    valid = []
    for c in candidates:
        if c.get("valid_from") and c["valid_from"] > now_iso:
            continue
        if c.get("valid_until") and c["valid_until"] < now_iso:
            continue
        if c.get("usage_limit") and c.get("used_count", 0) >= c.get("usage_limit"):
            continue
        allowed = c.get("branch_ids") or []
        if allowed and target_branch and target_branch not in allowed:
            continue
        ds, de = c.get("daily_start_time"), c.get("daily_end_time")
        if ds and de and not (ds <= cur_hm <= de):
            continue
        valid.append(c)
        if len(valid) >= limit:
            break

    return {"coupons": valid}


@router.get("/coupons/lookup-by-customer")
async def lookup_coupon_by_customer(
    customer_name: str,
    order_total: float = 0,
    branch_id: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """
    البحث عن كوبون نشط مرتبط باسم العميل في الفرع الحالي والوقت الحالي.
    يُستخدم في POS لاقتراح الخصم تلقائياً عند كتابة اسم العميل.
    يرجع أول كوبون منطبق (أعلى نسبة خصم).
    """
    name_lower = (customer_name or "").strip().lower()
    if not name_lower:
        return {"found": False}

    target_branch = branch_id or current_user.get("branch_id")
    now_dt = datetime.now(timezone.utc)
    now_iso = now_dt.isoformat()
    cur_hm = now_dt.strftime("%H:%M")

    # نبحث على customer_name أولاً، وإلا نقع على name (اسم الكوبون نفسه)
    # هذا يدعم الكوبونات القديمة التي اسم الكوبون فيها هو اسم العميل
    name_regex = f"^{re.escape(name_lower)}$"
    base = build_tenant_query(current_user, {
        "is_active": True,
        "$or": [
            {"customer_name": {"$regex": name_regex, "$options": "i"}},
            {
                "$and": [
                    {"$or": [
                        {"customer_name": {"$exists": False}},
                        {"customer_name": None},
                        {"customer_name": ""},
                    ]},
                    {"name": {"$regex": name_regex, "$options": "i"}},
                ]
            },
        ],
    })
    candidates = await db.coupons.find(base, {"_id": 0}).to_list(50)

    best = None
    best_discount = -1.0
    for c in candidates:
        # تاريخ
        if c.get("valid_from") and c["valid_from"] > now_iso:
            continue
        if c.get("valid_until") and c["valid_until"] < now_iso:
            continue
        # حد الاستخدام الكلي
        if c.get("usage_limit") and c.get("used_count", 0) >= c.get("usage_limit"):
            continue
        # الفرع
        allowed = c.get("branch_ids") or []
        if allowed and target_branch and target_branch not in allowed:
            continue
        # الوقت اليومي
        ds, de = c.get("daily_start_time"), c.get("daily_end_time")
        if ds and de and not (ds <= cur_hm <= de):
            continue
        # الحد الأدنى
        if order_total and order_total < c.get("min_order_amount", 0):
            continue

        # حساب الخصم
        if c.get("discount_type") == "percentage":
            disc = (order_total or 0) * (c.get("discount_value", 0) / 100)
            if c.get("max_discount"):
                disc = min(disc, c["max_discount"])
        else:
            disc = c.get("discount_value", 0)
        if disc > best_discount:
            best_discount = disc
            best = c

    if not best:
        return {"found": False}

    return {
        "found": True,
        "coupon": best,
        "discount": round(best_discount, 2),
        "final_total": round((order_total or 0) - best_discount, 2),
    }


@router.post("/coupons/{coupon_id}/use")
async def use_coupon(
    coupon_id: str,
    order_id: str,
    discount_amount: float,
    customer_phone: Optional[str] = None,
    customer_name: Optional[str] = None,
    branch_id: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """تسجيل استخدام كوبون"""
    # تحديث عداد الاستخدام
    await db.coupons.update_one(
        {"id": coupon_id},
        {
            "$inc": {"used_count": 1, "total_discount_given": discount_amount}
        }
    )
    
    # تسجيل الاستخدام مع تفاصيل الكاشير والفرع لتقارير الإغلاق
    # نجلب اسم الكوبون لإظهاره في التقارير دون استعلامات لاحقة
    cp = await db.coupons.find_one({"id": coupon_id}, {"_id": 0, "name": 1, "code": 1})
    usage_doc = {
        "id": str(uuid.uuid4()),
        "coupon_id": coupon_id,
        "coupon_name": (cp or {}).get("name", ""),
        "coupon_code": (cp or {}).get("code", ""),
        "order_id": order_id,
        "customer_phone": customer_phone,
        "customer_name": customer_name,
        "branch_id": branch_id or current_user.get("branch_id"),
        "tenant_id": current_user.get("tenant_id"),
        "cashier_id": current_user.get("id"),
        "cashier_name": current_user.get("full_name") or current_user.get("username") or "",
        "shift_id": current_user.get("shift_id"),  # قد يكون None
        "discount_amount": discount_amount,
        "used_at": datetime.now(timezone.utc).isoformat()
    }
    await db.coupon_usage.insert_one(usage_doc)
    
    return {"message": "تم تسجيل الاستخدام"}

# العروض الترويجية
@router.get("/promotions")
async def get_promotions(current_user: dict = Depends(get_current_user)):
    """قائمة العروض"""
    query = build_tenant_query(current_user)
    promotions = await db.promotions.find(query, {"_id": 0}).sort("created_at", -1).to_list(100)
    return promotions

@router.post("/promotions")
async def create_promotion(promotion: PromotionCreate, current_user: dict = Depends(get_current_user)):
    """إنشاء عرض"""
    if current_user["role"] not in [UserRole.ADMIN, UserRole.GENERAL_MANAGER, UserRole.MANAGER, UserRole.SUPER_ADMIN]:
        raise HTTPException(status_code=403, detail="غير مصرح")
    
    promotion_doc = {
        "id": str(uuid.uuid4()),
        **promotion.model_dump(),
        "used_count": 0,
        "tenant_id": get_user_tenant_id(current_user),
        "created_by": current_user["id"],
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    
    await db.promotions.insert_one(promotion_doc)
    if "_id" in promotion_doc:
        del promotion_doc["_id"]
    
    return {"message": "تم إنشاء العرض", "promotion": promotion_doc}

@router.put("/promotions/{promotion_id}")
async def update_promotion(promotion_id: str, promotion: PromotionCreate, current_user: dict = Depends(get_current_user)):
    """تحديث عرض"""
    await db.promotions.update_one(
        {"id": promotion_id},
        {"$set": {**promotion.model_dump(), "updated_at": datetime.now(timezone.utc).isoformat()}}
    )
    return {"message": "تم التحديث"}

@router.delete("/promotions/{promotion_id}")
async def delete_promotion(promotion_id: str, current_user: dict = Depends(get_current_user)):
    """حذف عرض"""
    await db.promotions.delete_one({"id": promotion_id})
    return {"message": "تم الحذف"}

@router.get("/promotions/active")
async def get_active_promotions(current_user: dict = Depends(get_current_user)):
    """العروض النشطة حالياً"""
    now = datetime.now(timezone.utc).isoformat()
    current_time = datetime.now(timezone.utc).strftime("%H:%M")
    
    query = build_tenant_query(current_user, {
        "is_active": True,
        "valid_from": {"$lte": now},
        "valid_until": {"$gte": now}
    })
    
    promotions = await db.promotions.find(query, {"_id": 0}).to_list(50)
    
    # تصفية Happy Hour
    active_promotions = []
    for promo in promotions:
        if promo.get("promotion_type") == "happy_hour":
            start = promo.get("start_time", "00:00")
            end = promo.get("end_time", "23:59")
            if start <= current_time <= end:
                active_promotions.append(promo)
        else:
            active_promotions.append(promo)
    
    return active_promotions

