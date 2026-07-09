"""Order Ratings (extracted from server.py)"""
from fastapi import APIRouter
from server import *  # noqa: F401,F403

router = APIRouter()

# ==================== نظام تقييم الطلبات ====================

class OrderRating(BaseModel):
    order_id: str
    tenant_id: str
    phone: str
    rating: int  # 1-5 نجوم
    comment: Optional[str] = None
    food_quality: Optional[int] = None  # جودة الطعام 1-5
    delivery_speed: Optional[int] = None  # سرعة التوصيل 1-5
    service_quality: Optional[int] = None  # جودة الخدمة 1-5

@router.post("/customer/rate-order")
async def rate_order(rating: OrderRating, request: Request):
    """تقييم طلب من الزبون (محمي بتحديد معدّل)"""
    enforce_rate_limit(request, "rate_order", max_calls=10, window_seconds=60)
    if rating.rating < 1 or rating.rating > 5:
        raise HTTPException(status_code=400, detail="التقييم يجب أن يكون من 1 إلى 5")
    
    # التحقق من وجود الطلب
    order = await db.orders.find_one({"id": rating.order_id})
    if not order:
        raise HTTPException(status_code=404, detail="الطلب غير موجود")
    
    # التحقق من أن الطلب مكتمل
    if order.get("status") not in ["delivered", "completed"]:
        raise HTTPException(status_code=400, detail="لا يمكن تقييم طلب غير مكتمل")
    
    # التحقق من أن الرقم مطابق
    if order.get("customer_phone") != rating.phone:
        raise HTTPException(status_code=403, detail="رقم الهاتف غير مطابق")
    
    # التحقق من عدم وجود تقييم سابق
    existing = await db.order_ratings.find_one({"order_id": rating.order_id})
    if existing:
        raise HTTPException(status_code=400, detail="تم تقييم هذا الطلب مسبقاً")
    
    # حفظ التقييم
    _rd = rating.model_dump()
    _rd["comment"] = sanitize_text(_rd.get("comment"), 1000)
    rating_doc = {
        "id": str(uuid.uuid4()),
        **_rd,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    
    await db.order_ratings.insert_one(rating_doc)
    rating_doc.pop("_id", None)

    # علّم الطلب كمُقيَّم حتى لا تتكرر نافذة التقييم
    await db.orders.update_one({"id": rating.order_id}, {"$set": {"is_rated": True}})

    # تحديث متوسط تقييم الفرع
    await update_branch_rating(order.get("branch_id"))
    
    return {"message": "شكراً لتقييمك! ⭐", "rating": rating_doc}

async def update_branch_rating(branch_id: str):
    """تحديث متوسط تقييم الفرع"""
    if not branch_id:
        return
    
    pipeline = [
        {"$lookup": {
            "from": "orders",
            "localField": "order_id",
            "foreignField": "id",
            "as": "order"
        }},
        {"$unwind": "$order"},
        {"$match": {"order.branch_id": branch_id}},
        {"$group": {
            "_id": None,
            "avg_rating": {"$avg": "$rating"},
            "total_ratings": {"$sum": 1},
            "avg_food": {"$avg": "$food_quality"},
            "avg_delivery": {"$avg": "$delivery_speed"},
            "avg_service": {"$avg": "$service_quality"}
        }}
    ]
    
    result = await db.order_ratings.aggregate(pipeline).to_list(1)
    
    if result:
        await db.branches.update_one(
            {"id": branch_id},
            {"$set": {
                "rating": round(result[0].get("avg_rating", 0), 1),
                "total_ratings": result[0].get("total_ratings", 0),
                "food_rating": round(result[0].get("avg_food", 0) or 0, 1),
                "delivery_rating": round(result[0].get("avg_delivery", 0) or 0, 1),
                "service_rating": round(result[0].get("avg_service", 0) or 0, 1)
            }}
        )

@router.get("/customer/order-rating/{order_id}")
async def get_order_rating(order_id: str, phone: str = None):
    """جلب تقييم طلب معين"""
    rating = await db.order_ratings.find_one({"order_id": order_id}, {"_id": 0})
    
    if not rating:
        return {"can_rate": True, "rating": None}
    
    return {"can_rate": False, "rating": rating}

@router.get("/ratings/branch/{branch_id}")
async def get_branch_ratings(branch_id: str, limit: int = 20, current_user: dict = Depends(get_current_user)):
    """جلب تقييمات فرع معين"""
    pipeline = [
        {"$lookup": {
            "from": "orders",
            "localField": "order_id",
            "foreignField": "id",
            "as": "order"
        }},
        {"$unwind": "$order"},
        {"$match": {"order.branch_id": branch_id}},
        {"$sort": {"created_at": -1}},
        {"$limit": limit},
        {"$project": {
            "_id": 0,
            "id": 1,
            "rating": 1,
            "comment": 1,
            "food_quality": 1,
            "delivery_speed": 1,
            "service_quality": 1,
            "created_at": 1,
            "customer_name": "$order.customer_name"
        }}
    ]
    
    ratings = await db.order_ratings.aggregate(pipeline).to_list(limit)
    
    # إحصائيات
    branch = await db.branches.find_one({"id": branch_id}, {"_id": 0, "rating": 1, "total_ratings": 1, "food_rating": 1, "delivery_rating": 1, "service_rating": 1})
    
    return {
        "ratings": ratings,
        "stats": branch or {}
    }

@router.get("/ratings/tenant-summary")
async def get_tenant_ratings_summary(current_user: dict = Depends(get_current_user)):
    """ملخص تقييمات العميل (المطعم)"""
    tenant_id = get_user_tenant_id(current_user)
    
    pipeline = [
        {"$lookup": {
            "from": "orders",
            "localField": "order_id",
            "foreignField": "id",
            "as": "order"
        }},
        {"$unwind": "$order"},
        {"$match": {"order.tenant_id": tenant_id}},
        {"$group": {
            "_id": None,
            "avg_rating": {"$avg": "$rating"},
            "total_ratings": {"$sum": 1},
            "five_stars": {"$sum": {"$cond": [{"$eq": ["$rating", 5]}, 1, 0]}},
            "four_stars": {"$sum": {"$cond": [{"$eq": ["$rating", 4]}, 1, 0]}},
            "three_stars": {"$sum": {"$cond": [{"$eq": ["$rating", 3]}, 1, 0]}},
            "two_stars": {"$sum": {"$cond": [{"$eq": ["$rating", 2]}, 1, 0]}},
            "one_star": {"$sum": {"$cond": [{"$eq": ["$rating", 1]}, 1, 0]}},
            "avg_food": {"$avg": "$food_quality"},
            "avg_delivery": {"$avg": "$delivery_speed"},
            "avg_service": {"$avg": "$service_quality"}
        }}
    ]
    
    result = await db.order_ratings.aggregate(pipeline).to_list(1)
    
    if not result:
        return {
            "avg_rating": 0,
            "total_ratings": 0,
            "distribution": {"5": 0, "4": 0, "3": 0, "2": 0, "1": 0},
            "categories": {"food": 0, "delivery": 0, "service": 0}
        }
    
    data = result[0]
    return {
        "avg_rating": round(data.get("avg_rating", 0), 1),
        "total_ratings": data.get("total_ratings", 0),
        "distribution": {
            "5": data.get("five_stars", 0),
            "4": data.get("four_stars", 0),
            "3": data.get("three_stars", 0),
            "2": data.get("two_stars", 0),
            "1": data.get("one_star", 0)
        },
        "categories": {
            "food": round(data.get("avg_food", 0) or 0, 1),
            "delivery": round(data.get("avg_delivery", 0) or 0, 1),
            "service": round(data.get("avg_service", 0) or 0, 1)
        }
    }

@router.get("/super-admin/ratings-overview")
async def get_super_admin_ratings_overview(current_user: dict = Depends(verify_super_admin)):
    """ملخص تقييمات جميع العملاء للمالك"""
    pipeline = [
        {"$lookup": {
            "from": "orders",
            "localField": "order_id",
            "foreignField": "id",
            "as": "order"
        }},
        {"$unwind": "$order"},
        {"$group": {
            "_id": "$order.tenant_id",
            "avg_rating": {"$avg": "$rating"},
            "total_ratings": {"$sum": 1}
        }}
    ]
    
    tenant_ratings = await db.order_ratings.aggregate(pipeline).to_list(100)
    
    # جلب أسماء العملاء
    result = []
    for tr in tenant_ratings:
        tenant = await db.tenants.find_one({"id": tr["_id"]}, {"_id": 0, "name": 1})
        result.append({
            "tenant_id": tr["_id"],
            "tenant_name": tenant.get("name") if tenant else "Unknown",
            "avg_rating": round(tr.get("avg_rating", 0), 1),
            "total_ratings": tr.get("total_ratings", 0)
        })
    
    # الترتيب حسب التقييم
    result.sort(key=lambda x: x["avg_rating"], reverse=True)
    
    # الإحصائيات العامة
    total_pipeline = [
        {"$group": {
            "_id": None,
            "avg_rating": {"$avg": "$rating"},
            "total_ratings": {"$sum": 1}
        }}
    ]
    total = await db.order_ratings.aggregate(total_pipeline).to_list(1)
    
    return {
        "overall": {
            "avg_rating": round(total[0].get("avg_rating", 0), 1) if total else 0,
            "total_ratings": total[0].get("total_ratings", 0) if total else 0
        },
        "tenants": result
    }


@router.get("/customer/orders/{tenant_id}")
async def get_customer_orders(tenant_id: str, customer_token: str):
    """جلب طلبات العميل"""
    customer = await get_customer_from_token(customer_token)
    if not customer:
        raise HTTPException(status_code=401, detail="غير مصرح")
    
    orders = await db.orders.find(
        {"customer_id": customer["id"]},
        {"_id": 0}
    ).sort("created_at", -1).limit(50).to_list(50)
    
    return orders

@router.get("/customer/order/{tenant_id}/{order_id}")
async def track_customer_order(tenant_id: str, order_id: str):
    """تتبع حالة الطلب"""
    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    
    if not order:
        raise HTTPException(status_code=404, detail="الطلب غير موجود")
    
    # جلب معلومات السائق مع الموقع
    driver_info = None
    if order.get("driver_id"):
        driver = await db.drivers.find_one(
            {"id": order["driver_id"]},
            {"_id": 0, "id": 1, "name": 1, "phone": 1, "photo": 1, "current_location": 1, "last_location_update": 1}
        )
        if driver:
            driver_info = driver
    
    # مراحل الطلب
    status_labels = {
        "pending": "قيد الانتظار",
        "preparing": "قيد التحضير",
        "ready": "جاهز للتوصيل",
        "out_for_delivery": "السائق في الطريق",
        "delivered": "تم التسليم",
        "cancelled": "ملغي"
    }
    
    current_status_index = ["pending", "preparing", "ready", "out_for_delivery", "delivered"].index(order["status"]) if order["status"] in ["pending", "preparing", "ready", "out_for_delivery", "delivered"] else 0
    
    timeline = []
    for i, status in enumerate(["pending", "preparing", "ready", "out_for_delivery", "delivered"]):
        timeline.append({
            "status": status,
            "label": status_labels.get(status, status),
            "completed": i <= current_status_index
        })
    
    return {
        "order": order,
        "driver": driver_info,
        "status_label": status_labels.get(order["status"], order["status"]),
        "timeline": timeline
    }

@router.get("/customer/menu-link")
async def get_menu_link(request: Request, current_user: dict = Depends(get_current_user)):
    """جلب رابط القائمة للمستخدم"""
    tenant_id = get_user_tenant_id(current_user) or "default"
    
    # التحقق من وجود tenant أو إنشائه
    tenant = await db.tenants.find_one({"id": tenant_id})
    
    # التحقق من صلاحية قائمة الطعام للعملاء
    if tenant:
        enabled_features = tenant.get("enabled_features", {})
        if enabled_features.get("showCustomerMenu") == False:
            raise HTTPException(status_code=403, detail="قائمة الطعام للعملاء غير مفعلة")
    
    if not tenant:
        # جلب اسم المطعم من الإعدادات
        restaurant_settings = await db.settings.find_one({"tenant_id": tenant_id, "type": "restaurant"})
        restaurant_name = None
        if restaurant_settings:
            restaurant_name = restaurant_settings.get("value", {}).get("name")
        
        # إذا لم يوجد اسم، استخدم اسم المستخدم أو البريد الإلكتروني
        if not restaurant_name:
            restaurant_name = current_user.get("restaurant_name") or current_user.get("full_name") or current_user.get("email", "").split("@")[0]
        
        # إنشاء tenant جديد
        tenant = {
            "id": tenant_id,
            "name": restaurant_name,
            "menu_slug": generate_menu_slug(restaurant_name or tenant_id),
            "created_at": datetime.now(timezone.utc).isoformat()
        }
        await db.tenants.insert_one(tenant)
    
    # استخدام نفس النطاق الذي جاء منه الطلب
    # هذا يضمن أن رابط القائمة يعمل على أي نسخة (preview أو production)
    origin = request.headers.get("origin") or request.headers.get("referer", "")
    if origin:
        # استخراج النطاق من origin
        from urllib.parse import urlparse
        parsed = urlparse(origin)
        base_url = f"{parsed.scheme}://{parsed.netloc}"
    else:
        # fallback للـ environment variable
        base_url = os.environ.get('REACT_APP_BACKEND_URL', 'https://multi-cashier-vault.preview.emergentagent.com')
    
    menu_url = f"{base_url}/menu/{tenant.get('menu_slug', tenant_id)}"
    
    return {
        "menu_url": menu_url,
        "tenant_id": tenant_id,
        "menu_slug": tenant.get("menu_slug", tenant_id)
    }


