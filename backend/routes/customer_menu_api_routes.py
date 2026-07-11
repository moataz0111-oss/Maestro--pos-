"""Customer Menu App APIs (extracted from server.py)"""
from fastapi import APIRouter
from server import *  # noqa: F401,F403
from server import (_client_ip, _phone_to_e164, _wa_free, _distance_fee_for, _get_welcome_config, _resolve_business_date, _sn)

router = APIRouter()

# ==================== CUSTOMER MENU APP APIs ====================

class CustomerRegister(BaseModel):
    name: str
    phone: str
    email: Optional[str] = None
    address: Optional[str] = None
    password: Optional[str] = None

class CustomerLogin(BaseModel):
    phone: str
    password: Optional[str] = None

class CustomerOrderItem(BaseModel):
    product_id: str
    quantity: int
    notes: Optional[str] = None

class DeliveryLocation(BaseModel):
    lat: float
    lng: float

class CustomerOrderCreate(BaseModel):
    items: List[CustomerOrderItem]
    delivery_address: str
    delivery_notes: Optional[str] = None
    delivery_location: Optional[DeliveryLocation] = None
    payment_method: str = "cash"
    customer_name: Optional[str] = None
    customer_phone: Optional[str] = None
    branch_id: Optional[str] = None

def generate_menu_slug(name: str) -> str:
    """إنشاء slug من اسم المطعم"""
    import re
    slug = name.lower().replace(" ", "-").replace("_", "-")
    slug = re.sub(r'[^a-z0-9\-]', '', slug)
    return slug or "menu"

def hash_customer_password(password: str) -> str:
    """تشفير كلمة مرور العميل"""
    import hashlib
    return hashlib.sha256(password.encode()).hexdigest()


@router.get("/customer/restaurants")
async def get_customer_restaurants():
    """جلب قائمة المطاعم المتاحة للعملاء"""
    # جلب جميع المستأجرين النشطين الذين لديهم menu_slug
    tenants = await db.tenants.find(
        {"menu_slug": {"$ne": None, "$exists": True}},
        {"_id": 0}
    ).to_list(100)
    
    restaurants = []
    for tenant in tenants:
        # التحقق من أن ميزة قائمة الطعام مفعلة
        enabled_features = tenant.get("enabled_features", {})
        if enabled_features.get("showCustomerMenu") == False:
            continue  # تخطي هذا المطعم
        
        # جلب إعدادات المطعم
        settings = await db.settings.find_one(
            {"tenant_id": tenant.get("id"), "type": "restaurant"},
            {"_id": 0}
        )
        
        # جلب عدد الفروع
        branches_count = await db.branches.count_documents({"tenant_id": tenant.get("id")})
        
        restaurant_data = settings.get("value", {}) if settings else {}
        
        restaurants.append({
            "id": tenant.get("id"),
            "name": restaurant_data.get("name") or tenant.get("name", "مطعم"),
            "menu_slug": tenant.get("menu_slug"),
            "logo": restaurant_data.get("logo"),
            "description": restaurant_data.get("description"),
            "address": restaurant_data.get("address"),
            "branches_count": branches_count
        })
    
    return restaurants


@router.get("/manifest/menu/{tenant_id}")
async def get_menu_manifest(tenant_id: str):
    """مانيفست PWA ديناميكي لقائمة الزبون.
    start_url يحمل معرف المطعم نفسه — يحل مشكلة iOS:
    1) التطبيق المثبّت كان يفتح على "/" (صفحة دخول الموظفين)
    2) التخزين المعزول في standalone لا يعرف المطعم المحفوظ
    """
    tenant = await db.tenants.find_one({"id": tenant_id}, {"_id": 0, "name": 1, "name_ar": 1}) or {}
    settings = await db.tenant_settings.find_one({"tenant_id": tenant_id}, {"_id": 0, "restaurant_name": 1}) or {}
    name = tenant.get("name") or tenant.get("name_ar") or settings.get("restaurant_name") or "قائمة الطعام"
    from fastapi.responses import Response as FastAPIResponse
    import json as _json
    manifest = {
        "short_name": name[:20],
        "name": f"{name} - اطلب الآن",
        "description": "اطلب طعامك المفضل بسهولة",
        "icons": [
            {"src": "/icons/customer-icon-192.png", "sizes": "192x192", "type": "image/png", "purpose": "any"},
            {"src": "/icons/customer-icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any"},
            {"src": "/icons/customer-icon-192.png", "sizes": "192x192", "type": "image/png", "purpose": "maskable"},
            {"src": "/icons/customer-icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable"}
        ],
        "id": f"/menu/{tenant_id}",
        "start_url": f"/menu.html?r={tenant_id}",
        "scope": "/menu",
        "display": "standalone",
        "orientation": "any",
        "theme_color": "#f97316",
        "background_color": "#fff7ed",
        "lang": "ar",
        "dir": "rtl"
    }
    return FastAPIResponse(
        content=_json.dumps(manifest, ensure_ascii=False),
        media_type="application/manifest+json",
        headers={"Cache-Control": "no-cache, no-store, must-revalidate"}
    )


@router.get("/customer/menu/{tenant_id}")
async def get_customer_menu(tenant_id: str):
    """جلب قائمة الطعام للعملاء - بدون توثيق"""
    # البحث عن tenant
    tenant = await db.tenants.find_one(
        {"$or": [{"id": tenant_id}, {"menu_slug": tenant_id}]},
        {"_id": 0}
    )
    
    if not tenant:
        # إذا لم يوجد tenant، نستخدم tenant_id كـ query للمنتجات
        # هذا للتوافق مع الأنظمة التي لا تستخدم tenants
        tenant = {"id": tenant_id, "name": "المطعم"}
    
    # التحقق من أن ميزة قائمة الطعام مفعلة
    enabled_features = tenant.get("enabled_features", {})
    if enabled_features.get("showCustomerMenu") == False:
        raise HTTPException(status_code=403, detail="قائمة الطعام غير متاحة لهذا المطعم")
    
    tid = tenant.get("id", tenant_id)
    
    # جلب الفئات - فقط للعميل المحدد
    categories = await db.categories.find(
        {"tenant_id": tid},
        {"_id": 0}
    ).sort("sort_order", 1).to_list(100)
    
    # جلب المنتجات - فقط للعميل المحدد (مع إخفاء الحقول الحساسة: التكلفة/الربح/الوصفة)
    products = await db.products.find(
        {"tenant_id": tid, "is_available": {"$ne": False}},
        {
            "_id": 0, "cost": 0, "operating_cost": 0, "recipe": 0,
            "recipe_quantities": 0, "ingredients": 0, "raw_materials": 0, "bom": 0,
            "raw_material_cost": 0, "raw_material_cost_after_waste": 0,
            "production_cost": 0, "cost_before_waste": 0, "cost_after_waste": 0,
            "unit_cost": 0, "mfg_links": 0, "manufactured_product_links": 0,
            "profit": 0, "profit_margin": 0, "cost_breakdown": 0,
            "supplier_id": 0, "supplier": 0, "wholesale_price": 0,
            "purchase_price": 0, "margin": 0
        }
    ).to_list(500)

    # تنظيف شامل دفاعي: حذف أي حقل حسّاس قد يكشف الكلفة/الربح/الوصفة/المورّد للزبون العام
    _SENSITIVE_SUBSTR = ("cost", "profit", "recipe", "raw_material", "ingredient",
                         "margin", "supplier", "wholesale", "purchase_price", "bom")
    for _p in products:
        for _k in list(_p.keys()):
            kl = _k.lower()
            if any(s in kl for s in _SENSITIVE_SUBSTR):
                _p.pop(_k, None)

    # المطبخ المركزي/المخزن/قسم المشتريات — هذه ليست فروعاً يطلب منها الزبون)
    branches = await db.branches.find(
        {
            "tenant_id": tid, 
            "is_active": {"$ne": False},
            "branch_type": {"$nin": ["central_kitchen", "warehouse", "purchasing"]}
        },
        # 🔒 للعميل العام: فقط الحقول الآمنة (الاسم/العنوان/الهاتف/الموقع) — إخفاء الإيجار/الفواتير/نسبة الشراكة/بيانات المشتري (تقرير الأمان #1)
        {"_id": 0, "id": 1, "name": 1, "address": 1, "phone": 1,
         "latitude": 1, "longitude": 1, "is_active": 1, "branch_type": 1}
    ).to_list(50)
    
    # إذا لم توجد فروع حقيقية، لا نُنشئ فرع افتراضي للعملاء
    # بل نعرض رسالة أنه لا توجد فروع متاحة
    
    # جلب الإعدادات - للحصول على الشعار والاسم
    settings = await db.tenant_settings.find_one({"tenant_id": tid}, {"_id": 0}) or {}
    
    # جلب إعدادات المطعم الرئيسية (fallback)
    main_settings = await db.settings.find_one({"tenant_id": tid}, {"_id": 0}) or {}
    
    # تحديد الشعار والاسم - الأولوية: tenant -> settings -> main_settings
    # ملاحظة: في جدول tenants الحقل هو logo_url وليس logo
    restaurant_logo = tenant.get("logo_url") or tenant.get("logo") or settings.get("restaurant_logo") or main_settings.get("restaurant_logo", "")
    restaurant_name = tenant.get("name") or tenant.get("name_ar") or settings.get("restaurant_name") or main_settings.get("restaurant_name", "المطعم")
    
    return {
        "restaurant": {
            "id": tid,
            "name": restaurant_name,
            "logo": restaurant_logo,
            "description": tenant.get("description", ""),
            "phone": tenant.get("phone", ""),
            "address": tenant.get("address", ""),
            "delivery_fee": _sn(settings.get("delivery_fee")),
            "min_order": settings.get("min_order", 0),
            "payment_methods": settings.get("payment_methods", ["cash"]),
            "menu_slug": tenant.get("menu_slug", tid)
        },
        "categories": categories,
        "products": products,
        "branches": branches
    }

@router.post("/customer/auth/register/{tenant_id}")
async def register_customer(tenant_id: str, data: CustomerRegister, request: Request):
    """تسجيل عميل جديد (محمي بتحديد معدّل وتحقق المستأجر)"""
    enforce_rate_limit(request, "customer_register", max_calls=8, window_seconds=300)
    # رفض التسجيل لمستأجر غير موجود (منع حقن حسابات)
    _t = await db.tenants.find_one({"$or": [{"id": tenant_id}, {"menu_slug": tenant_id}]}, {"_id": 0, "id": 1})
    if not _t:
        raise HTTPException(status_code=404, detail="المطعم غير موجود")
    tenant_id = _t["id"]
    # التحقق من عدم وجود العميل
    existing = await db.customers.find_one({
        "phone": data.phone,
        "$or": [{"tenant_id": tenant_id}, {"tenant_id": {"$exists": False}}]
    })
    
    if existing:
        raise HTTPException(status_code=400, detail="رقم الهاتف مسجل بالفعل")
    
    customer = {
        "id": str(uuid.uuid4()),
        "name": sanitize_text(data.name, 120),
        "phone": sanitize_text(data.phone, 30),
        "email": sanitize_text(data.email, 120),
        "address": sanitize_text(data.address, 300),
        "password": hash_customer_password(data.password) if data.password else None,
        "tenant_id": tenant_id,
        "total_orders": 0,
        "total_spent": 0,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    
    await db.customers.insert_one(customer)
    customer.pop("_id", None)
    customer.pop("password", None)
    
    # إنشاء token
    import secrets
    token = secrets.token_urlsafe(32)
    await db.customer_tokens.insert_one({
        "token": token,
        "customer_id": customer["id"],
        "tenant_id": tenant_id,
        "created_at": datetime.now(timezone.utc).isoformat()
    })
    
    return {"customer": customer, "token": token}

@router.post("/customer/auth/login/{tenant_id}")
async def login_customer(tenant_id: str, data: CustomerLogin, request: Request):
    """تسجيل دخول العميل (محمي ضد التخمين بتحديد معدّل)"""
    enforce_rate_limit(request, "customer_login", max_calls=10, window_seconds=300)
    customer = await db.customers.find_one({
        "phone": data.phone,
        "$or": [{"tenant_id": tenant_id}, {"tenant_id": {"$exists": False}}]
    }, {"_id": 0})
    
    if not customer:
        raise HTTPException(status_code=401, detail="رقم الهاتف غير مسجل")
    
    # التحقق من كلمة المرور إذا كانت موجودة
    if customer.get("password") and data.password:
        if hash_customer_password(data.password) != customer["password"]:
            raise HTTPException(status_code=401, detail="كلمة المرور غير صحيحة")
    
    # إنشاء token
    import secrets
    token = secrets.token_urlsafe(32)
    await db.customer_tokens.insert_one({
        "token": token,
        "customer_id": customer["id"],
        "tenant_id": tenant_id,
        "created_at": datetime.now(timezone.utc).isoformat()
    })
    
    customer.pop("password", None)
    return {"customer": customer, "token": token}

async def get_customer_from_token(token: str):
    """جلب العميل من token"""
    if not token:
        return None
    
    token_doc = await db.customer_tokens.find_one({"token": token})
    if not token_doc:
        return None
    
    customer = await db.customers.find_one(
        {"id": token_doc["customer_id"]},
        {"_id": 0, "password": 0}
    )
    return customer


async def _is_customer_phone_verified(tenant_id: str, phone: str) -> bool:
    """هل وُثِّق رقم هاتف العميل مسبقاً (لهذا المستأجر)؟ — يُستخدم لبوابة تحقق أول طلب."""
    e164 = await _phone_to_e164(phone)
    doc = await db.verified_customer_phones.find_one({"tenant_id": tenant_id, "phone": e164}, {"_id": 0, "phone": 1})
    return bool(doc)


@router.post("/customer/order/{tenant_id}/request-otp")
async def customer_order_request_otp(tenant_id: str, payload: dict = Body(...), request: Request = None):
    """إرسال رمز تحقق واتساب للعميل قبل تأكيد أول طلب (محمي بتحديد معدّل)."""
    enforce_rate_limit(request, "customer_otp", max_calls=6, window_seconds=300)
    tenant = await db.tenants.find_one({"$or": [{"id": tenant_id}, {"menu_slug": tenant_id}]}, {"_id": 0, "id": 1})
    if not tenant:
        raise HTTPException(status_code=404, detail="المطعم غير موجود")
    tenant_id = tenant["id"]
    phone = sanitize_text(payload.get("phone"), 30)
    name = sanitize_text(payload.get("name"), 120) or "عميل"
    if not phone:
        raise HTTPException(status_code=400, detail="رقم الهاتف مطلوب")
    _ip = _client_ip(request)
    resp = await start_2fa_verification("customer", None, name, tenant_id, "whatsapp", phone,
                                        None, _ip, request, extra={"purpose": "customer_first_order", "phone": phone})
    return resp


@router.post("/customer/order/{tenant_id}/verify-otp")
async def customer_order_verify_otp(tenant_id: str, payload: Verify2FARequest, request: Request = None):
    """التحقق من رمز العميل وتوثيق رقم هاتفه (يُسمح له بعدها بتأكيد الطلب)."""
    _ip = _client_ip(request)
    ok, sess, err = await verify_2fa_code(payload.verification_id, payload.code, _ip)
    if not ok:
        raise HTTPException(status_code=401, detail=err or "رمز التحقق غير صحيح")
    if sess.get("subject_type") != "customer":
        raise HTTPException(status_code=400, detail="جلسة تحقق غير صالحة")
    phone = (sess.get("extra") or {}).get("phone") or sess.get("destination")
    e164 = await _phone_to_e164(phone)
    t = await db.tenants.find_one({"$or": [{"id": tenant_id}, {"menu_slug": tenant_id}]}, {"_id": 0, "id": 1})
    real_tenant = t["id"] if t else tenant_id
    await db.verified_customer_phones.update_one(
        {"tenant_id": real_tenant, "phone": e164},
        {"$set": {"tenant_id": real_tenant, "phone": e164, "verified_at": datetime.now(timezone.utc).isoformat()}},
        upsert=True
    )
    return {"success": True, "verified": True, "message": "تم توثيق رقم هاتفك بنجاح"}

@router.post("/customer/order/{tenant_id}")
async def create_customer_order(
    tenant_id: str,
    order: CustomerOrderCreate,
    request: Request,
    customer_token: Optional[str] = None
):
    """إنشاء طلب من تطبيق العميل (محمي بتحديد معدّل وتحقق المستأجر)"""
    enforce_rate_limit(request, "customer_order", max_calls=15, window_seconds=60)
    # Resolve menu_slug to actual tenant_id if needed
    tenant = await db.tenants.find_one(
        {"$or": [{"id": tenant_id}, {"menu_slug": tenant_id}]},
        {"_id": 0, "id": 1, "is_active": 1}
    )
    # رفض الطلبات لمستأجر غير موجود/غير نشط (منع حقن طلبات وهمية)
    if not tenant:
        raise HTTPException(status_code=404, detail="المطعم غير موجود")
    if tenant.get("is_active") is False:
        raise HTTPException(status_code=403, detail="هذا الحساب غير نشط")
    tenant_id = tenant["id"]
    # حد أقصى لعدد الأصناف لمنع طلبات تخريبية ضخمة
    if not order.items or len(order.items) > 100:
        raise HTTPException(status_code=400, detail="عدد الأصناف غير صالح")
    
    # جلب العميل
    customer = None
    if customer_token:
        customer = await get_customer_from_token(customer_token)
    
    # 🔒 بوابة تحقق أول طلب للعميل (حين تفعيل الحماية): يجب توثيق رقم الهاتف عبر واتساب مرة واحدة
    _cust_phone = (customer.get("phone") if customer else order.customer_phone) or ""
    if await two_fa_enabled() and _cust_phone:
        if not await _is_customer_phone_verified(tenant_id, _cust_phone):
            raise HTTPException(status_code=403, detail={
                "code": "CUSTOMER_PHONE_VERIFICATION_REQUIRED",
                "message": "يرجى توثيق رقم هاتفك عبر رمز واتساب قبل تأكيد أول طلب",
                "phone": _cust_phone
            })
    
    # حساب المجموع
    total = 0
    total_cost = 0
    order_items = []
    
    for item in order.items:
        product = await db.products.find_one({"id": item.product_id, "tenant_id": tenant_id}, {"_id": 0})
        if not product:
            raise HTTPException(status_code=400, detail=f"المنتج غير موجود: {item.product_id}")
        
        item_total = _sn(product.get("price")) * item.quantity
        item_cost = _sn(product.get("cost")) * item.quantity
        
        order_items.append({
            "product_id": item.product_id,
            "product_name": product.get("name"),
            "name": product.get("name"),
            "name_en": product.get("name_en"),
            "price": _sn(product.get("price")),
            "quantity": item.quantity,
            "total": item_total,
            "notes": item.notes
        })
        
        total += item_total
        total_cost += item_cost
    
    # جلب رسوم التوصيل
    settings = await db.tenant_settings.find_one({"tenant_id": tenant_id}) or {}
    delivery_fee = _sn(settings.get("delivery_fee"))
    
    # إنشاء رقم الطلب
    today = datetime.now(timezone.utc).strftime('%Y%m%d')
    count = await db.orders.count_documents({"created_at": {"$gte": datetime.now(timezone.utc).strftime('%Y-%m-%d')}})
    order_number = int(f"{today[-4:]}{count + 1:04d}")
    
    # تحديد الفرع
    branch_id = order.branch_id
    if not branch_id:
        # استخدام أول فرع نشط
        branch = await db.branches.find_one({"is_active": {"$ne": False}}, {"id": 1})
        branch_id = branch["id"] if branch else None
    
    # أجور توصيل حسب المسافة (إن مفعلة وتوفر موقع الزبون وموقع الفرع)
    try:
        _cust_loc = order.delivery_location.model_dump() if getattr(order, 'delivery_location', None) else None
        _df = await _distance_fee_for(tenant_id, branch_id, _cust_loc)
        if _df is not None:
            if _df["out_of_range"]:
                raise HTTPException(
                    status_code=400,
                    detail=f"عذراً، موقعك خارج نطاق التوصيل (المسافة {_df['km']} كم والحد الأقصى {int(_df['max_km'])} كم)"
                )
            delivery_fee = _df["fee"]
    except HTTPException:
        raise
    except Exception as _e:
        logger.warning(f"distance fee calc failed: {_e}")
    
    # إنشاء الطلب
    order_doc = {
        "id": str(uuid.uuid4()),
        "order_number": order_number,
        "tenant_id": tenant_id,
        "branch_id": branch_id,
        "customer_id": customer["id"] if customer else None,
        "customer_name": customer["name"] if customer else order.customer_name,
        "customer_phone": customer["phone"] if customer else order.customer_phone,
        "delivery_address": order.delivery_address,
        "delivery_notes": order.delivery_notes,
        "delivery_location": order.delivery_location.model_dump() if hasattr(order, 'delivery_location') and order.delivery_location else None,
        "items": order_items,
        "subtotal": total,
        "delivery_fee": delivery_fee,
        "discount": 0,
        "tax": 0,
        "total": total + delivery_fee,
        "total_cost": total_cost,
        "profit": total - total_cost,
        "payment_method": order.payment_method,
        "payment_status": "paid" if order.payment_method in ["card", "zain_cash"] else "pending",
        "status": "pending",
        "order_type": "delivery",
        "source": "customer_app",
        "business_date": await _resolve_business_date(tenant_id, order.branch_id, None),
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    
    await db.orders.insert_one(order_doc)
    order_doc.pop("_id", None)
    
    # 🧾 حفظ/تحديث سجل الزبون تلقائياً حسب رقم هاتفه (يظهر لصاحب المطعم بلا تعديل يدوي) + كشف أول طلب
    is_first_order = False
    now_iso = datetime.now(timezone.utc).isoformat()
    _phone = order_doc.get("customer_phone")
    if _phone:
        existing_c = await db.customers.find_one(
            {"tenant_id": tenant_id, "phone": _phone},
            {"_id": 0, "id": 1, "total_orders": 1, "welcome_status": 1}
        )
        _welcome_pending_new = False
        if existing_c:
            is_first_order = int(existing_c.get("total_orders") or 0) == 0
            _set = {"last_order_date": now_iso}
            if is_first_order and existing_c.get("welcome_status") != "granted":
                _set["welcome_status"] = "pending"
                _welcome_pending_new = True
            await db.customers.update_one(
                {"id": existing_c["id"]},
                {"$inc": {"total_orders": 1, "total_spent": order_doc["total"]}, "$set": _set}
            )
            _cust_id = existing_c["id"]
        else:
            is_first_order = True
            _welcome_pending_new = True
            _cust_id = str(uuid.uuid4())
            await db.customers.insert_one({
                "id": _cust_id,
                "name": order_doc.get("customer_name") or "عميل",
                "phone": _phone,
                "address": order.delivery_address,
                "tenant_id": tenant_id,
                "total_orders": 1,
                "total_spent": order_doc["total"],
                "last_order_date": now_iso,
                "source": "auto_order",
                "welcome_status": "pending",  # بانتظار منح خصم الترحيب من صاحب المطعم/المدير
                "created_at": now_iso,
            })
        if order_doc.get("customer_id") != _cust_id:
            order_doc["customer_id"] = _cust_id
            await db.orders.update_one({"id": order_doc["id"]}, {"$set": {"customer_id": _cust_id, "is_first_order": is_first_order}})
        else:
            await db.orders.update_one({"id": order_doc["id"]}, {"$set": {"is_first_order": is_first_order}})

        # 🎁 أول طلب لزبون جديد → إشعار نظام + واتساب لصاحب المطعم للموافقة على كوبون الترحيب
        if _welcome_pending_new:
            try:
                _wcfg = await _get_welcome_config(tenant_id)
                if _wcfg.get("enabled", True):
                    _cname = order_doc.get("customer_name") or "زبون"
                    await db.notifications.insert_one({
                        "id": str(uuid.uuid4()),
                        "type": "welcome_approval",
                        "title": "زبون جديد ينتظر خصم الترحيب 🎁",
                        "message": f"الزبون {_cname} ({_phone}) أكمل أول طلب — بانتظار موافقتك لمنح كوبون الترحيب باسمه",
                        "tenant_id": tenant_id,
                        "data": {"customer_id": _cust_id, "customer_name": _cname, "customer_phone": _phone, "order_total": order_doc["total"]},
                        "is_read": False,
                        "created_at": now_iso,
                    })
                    _tn = await db.tenants.find_one({"id": tenant_id}, {"_id": 0, "owner_phone": 1, "name": 1}) or {}
                    if _tn.get("owner_phone"):
                        _owner_msg = (
                            f"زبون جديد أكمل أول طلب له:\n"
                            f"👤 الاسم: {_cname}\n"
                            f"📱 الهاتف: {_phone}\n"
                            f"💰 قيمة الطلب: {order_doc['total']:,.0f} د.ع\n\n"
                            f"ادخل إلى لوحة التحكم للموافقة على منح كوبون الترحيب باسمه وتحديد عدد مرات الاستخدام والفروع 🎁"
                        )
                        asyncio.create_task(_wa_free.send_message(
                            _tn["owner_phone"], _owner_msg,
                            purpose="welcome_approval", tenant_id=tenant_id,
                            title=f"🎁 زبون جديد — {_tn.get('name', 'مطعمك')}",
                        ))
            except Exception as _we:
                logger.warning(f"welcome approval notify failed: {_we}")
    order_doc["is_first_order"] = is_first_order
    
    # ⭐ إشعار "مكالمة واردة" للكاشير (شاشة قبول/رفض + اسم الزبون والعنوان والمنتجات والمبلغ)
    # كان مفقوداً هنا فكان الطلب يظهر في "المعلّق" فقط بلا مكالمة. IncomingOrderCall يستطلع هذا الإشعار.
    try:
        notification_doc = {
            "id": str(uuid.uuid4()),
            "type": "new_order_cashier",
            "order_id": order_doc["id"],
            "order_number": str(order_number),
            "branch_id": branch_id or "",
            "order_type": "delivery",
            "customer_name": order_doc.get("customer_name", ""),
            "customer_phone": order_doc.get("customer_phone", ""),
            "delivery_address": order.delivery_address,
            "total_amount": order_doc["total"],
            "items_count": len(order_items),
            "payment_method": order.payment_method,
            "source": "customer_app",
            "notes": order.delivery_notes,
            "tenant_id": tenant_id,
            "is_first_order": is_first_order,
            "customer_id": order_doc.get("customer_id"),
            "is_read": False,
            "is_printed": False,
            "created_at": datetime.now(timezone.utc).isoformat()
        }
        await db.order_notifications.insert_one(notification_doc)
    except Exception as _ne:
        logger.warning(f"order notification create failed: {_ne}")
    
    return {
        "success": True,
        "message": "تم إنشاء الطلب بنجاح! سيتم التواصل معك قريباً",
        "order": order_doc
    }


@router.get("/customer/orders/history")
async def get_customer_order_history(
    tenant_id: str = None,
    phone: str = None
):
    """جلب سجل طلبات العميل بناءً على رقم الهاتف"""
    if not phone:
        return []
    
    query = {"customer_phone": phone}
    if tenant_id:
        # تحويل menu_slug إلى tenant_id إذا لزم الأمر
        tenant = await db.tenants.find_one({"menu_slug": tenant_id})
        if tenant:
            query["tenant_id"] = tenant.get("id")
        else:
            query["tenant_id"] = tenant_id
    
    orders = await db.orders.find(
        query,
        {"_id": 0, "id": 1, "order_number": 1, "items": 1, "total": 1, 
         "status": 1, "created_at": 1, "order_type": 1}
    ).sort("created_at", -1).limit(20).to_list(20)
    
    # إضافة تسميات الحالة بالعربية
    status_labels = {
        "pending": "قيد الانتظار",
        "preparing": "قيد التحضير",
        "ready": "جاهز",
        "out_for_delivery": "في الطريق",
        "delivered": "تم التوصيل",
        "completed": "مكتمل",
        "cancelled": "ملغي"
    }
    
    for order in orders:
        order["status_label"] = status_labels.get(order.get("status"), order.get("status"))
        order["items_count"] = len(order.get("items", []))
    
    return orders



