"""
Customer Menu API - واجهة برمجة تطبيق قائمة العملاء
روابط فريدة لكل مطعم، طلبات، دفع
"""
from fastapi import APIRouter, HTTPException, Depends
from typing import List, Optional, Dict
from datetime import datetime, timezone
from pydantic import BaseModel
import uuid
import secrets
import hashlib

router = APIRouter(prefix="/customer", tags=["Customer Menu"])


# ==================== MODELS ====================

class CustomerRegister(BaseModel):
    name: str
    phone: str
    email: Optional[str] = None
    address: Optional[str] = None
    password: Optional[str] = None

class CustomerLogin(BaseModel):
    phone: str
    password: str

class CustomerOrderItem(BaseModel):
    product_id: str
    quantity: int
    notes: Optional[str] = None
    addons: Optional[List[str]] = []

class DeliveryLocation(BaseModel):
    lat: float
    lng: float

class CustomerOrder(BaseModel):
    items: List[CustomerOrderItem]
    delivery_address: str
    delivery_notes: Optional[str] = None
    delivery_location: Optional[DeliveryLocation] = None
    payment_method: str = "cash"  # cash, card, zain_cash
    customer_phone: Optional[str] = None
    customer_name: Optional[str] = None
    branch_id: Optional[str] = None

class PaymentInfo(BaseModel):
    card_number: Optional[str] = None
    expiry: Optional[str] = None
    cvv: Optional[str] = None
    save_card: bool = False


# ==================== HELPER FUNCTIONS ====================

def generate_menu_slug(name: str) -> str:
    """إنشاء slug فريد من اسم المطعم"""
    # تحويل الاسم لـ slug
    slug = name.lower().replace(" ", "-").replace("_", "-")
    # إزالة الأحرف الخاصة
    slug = ''.join(c for c in slug if c.isalnum() or c == '-')
    return slug

def hash_password(password: str) -> str:
    """تشفير كلمة المرور"""
    return hashlib.sha256(password.encode()).hexdigest()


# ==================== PUBLIC MENU ROUTES ====================

async def get_menu_routes(db):
    """إنشاء routes لقائمة العملاء"""
    
    @router.get("/menu/{menu_slug}")
    async def get_restaurant_menu(menu_slug: str):
        """جلب قائمة المطعم بالـ slug"""
        # البحث عن المطعم
        tenant = await db.tenants.find_one({"menu_slug": menu_slug}, {"_id": 0})
        if not tenant:
            # محاولة البحث بالاسم
            tenant = await db.tenants.find_one({
                "$or": [
                    {"name": {"$regex": menu_slug, "$options": "i"}},
                    {"id": menu_slug}
                ]
            }, {"_id": 0})
        
        if not tenant:
            raise HTTPException(status_code=404, detail="المطعم غير موجود")
        
        tenant_id = tenant.get("id")
        
        # جلب الفئات
        categories = await db.categories.find(
            {"tenant_id": tenant_id, "is_active": {"$ne": False}},
            {"_id": 0}
        ).sort("sort_order", 1).to_list(100)
        
        # جلب المنتجات
        products = await db.products.find(
            {"tenant_id": tenant_id, "is_available": {"$ne": False}},
            {"_id": 0}
        ).to_list(500)
        
        # جلب إعدادات المطعم
        settings = await db.tenant_settings.find_one(
            {"tenant_id": tenant_id},
            {"_id": 0}
        ) or {}
        
        # جلب الفروع
        branches = await db.branches.find(
            {"tenant_id": tenant_id, "is_active": {"$ne": False}},
            {"_id": 0}
        ).to_list(50)
        
        # إذا لم يكن هناك فروع، أنشئ فرع افتراضي
        if not branches:
            branches = await db.branches.find(
                {"is_active": {"$ne": False}},
                {"_id": 0}
            ).to_list(50)
        
        return {
            "restaurant": {
                "id": tenant_id,
                "name": tenant.get("name", ""),
                "logo": tenant.get("logo", ""),
                "description": tenant.get("description", ""),
                "phone": tenant.get("phone", ""),
                "address": tenant.get("address", ""),
                "working_hours": settings.get("working_hours", {}),
                "delivery_fee": settings.get("delivery_fee", 0),
                "min_order": settings.get("min_order", 0),
                "accepts_online_payment": True,  # تفعيل الدفع الإلكتروني
                "payment_methods": ["cash", "card"]
            },
            "categories": categories,
            "products": products,
            "branches": branches
        }
    
    @router.get("/menu/{menu_slug}/product/{product_id}")
    async def get_product_details(menu_slug: str, product_id: str):
        """تفاصيل منتج محدد"""
        tenant = await db.tenants.find_one({"menu_slug": menu_slug}, {"_id": 0, "id": 1})
        if not tenant:
            raise HTTPException(status_code=404, detail="المطعم غير موجود")
        
        product = await db.products.find_one(
            {"id": product_id, "tenant_id": tenant["id"]},
            {"_id": 0}
        )
        
        if not product:
            raise HTTPException(status_code=404, detail="المنتج غير موجود")
        
        return product
    
    return router


# ==================== CUSTOMER AUTHENTICATION ====================

async def get_customer_auth_routes(db):
    """routes تسجيل ودخول العملاء"""
    
    @router.post("/auth/register")
    async def register_customer(data: CustomerRegister, menu_slug: str):
        """تسجيل عميل جديد"""
        tenant = await db.tenants.find_one({"menu_slug": menu_slug}, {"_id": 0, "id": 1})
        if not tenant:
            raise HTTPException(status_code=404, detail="المطعم غير موجود")
        
        # التحقق من وجود العميل
        existing = await db.customers.find_one({
            "phone": data.phone,
            "tenant_id": tenant["id"]
        })
        
        if existing:
            raise HTTPException(status_code=400, detail="رقم الهاتف مسجل بالفعل")
        
        customer = {
            "id": str(uuid.uuid4()),
            "name": data.name,
            "phone": data.phone,
            "email": data.email,
            "address": data.address,
            "password": hash_password(data.password) if data.password else None,
            "tenant_id": tenant["id"],
            "total_orders": 0,
            "total_spent": 0,
            "created_at": datetime.now(timezone.utc).isoformat()
        }
        
        await db.customers.insert_one(customer)
        del customer["password"]
        customer.pop("_id", None)
        
        # إنشاء token
        token = secrets.token_urlsafe(32)
        await db.customer_tokens.insert_one({
            "token": token,
            "customer_id": customer["id"],
            "tenant_id": tenant["id"],
            "created_at": datetime.now(timezone.utc).isoformat()
        })
        
        return {"customer": customer, "token": token}
    
    @router.post("/auth/login")
    async def login_customer(data: CustomerLogin, menu_slug: str):
        """تسجيل دخول العميل"""
        tenant = await db.tenants.find_one({"menu_slug": menu_slug}, {"_id": 0, "id": 1})
        if not tenant:
            raise HTTPException(status_code=404, detail="المطعم غير موجود")
        
        customer = await db.customers.find_one({
            "phone": data.phone,
            "tenant_id": tenant["id"]
        }, {"_id": 0})
        
        if not customer:
            raise HTTPException(status_code=401, detail="رقم الهاتف غير مسجل")
        
        if customer.get("password") and hash_password(data.password) != customer["password"]:
            raise HTTPException(status_code=401, detail="كلمة المرور غير صحيحة")
        
        # إنشاء token
        token = secrets.token_urlsafe(32)
        await db.customer_tokens.insert_one({
            "token": token,
            "customer_id": customer["id"],
            "tenant_id": tenant["id"],
            "created_at": datetime.now(timezone.utc).isoformat()
        })
        
        del customer["password"]
        return {"customer": customer, "token": token}
    
    return router


# ==================== CUSTOMER ORDERS ====================

async def get_customer_order_routes(db):
    """routes طلبات العملاء"""
    
    async def get_customer_from_token(token: str, tenant_id: str):
        """جلب العميل من token"""
        token_doc = await db.customer_tokens.find_one({
            "token": token,
            "tenant_id": tenant_id
        })
        if not token_doc:
            return None
        
        customer = await db.customers.find_one({
            "id": token_doc["customer_id"]
        }, {"_id": 0, "password": 0})
        
        return customer
    
    @router.post("/menu/{menu_slug}/order")
    async def create_customer_order(
        menu_slug: str,
        order: CustomerOrder,
        customer_token: Optional[str] = None
    ):
        """إنشاء طلب جديد من العميل"""
        tenant = await db.tenants.find_one({"menu_slug": menu_slug}, {"_id": 0})
        if not tenant:
            raise HTTPException(status_code=404, detail="المطعم غير موجود")
        
        tenant_id = tenant["id"]
        
        # جلب معلومات العميل
        customer = None
        if customer_token:
            customer = await get_customer_from_token(customer_token, tenant_id)
        
        # حساب المجموع
        total = 0
        total_cost = 0
        order_items = []
        
        for item in order.items:
            product = await db.products.find_one(
                {"id": item.product_id, "tenant_id": tenant_id},
                {"_id": 0}
            )
            if not product:
                raise HTTPException(status_code=400, detail=f"المنتج غير موجود: {item.product_id}")
            
            item_total = product.get("price", 0) * item.quantity
            item_cost = product.get("cost", 0) * item.quantity
            
            order_items.append({
                "product_id": item.product_id,
                "name": product.get("name"),
                "price": product.get("price", 0),
                "quantity": item.quantity,
                "total": item_total,
                "notes": item.notes,
                "addons": item.addons
            })
            
            total += item_total
            total_cost += item_cost
        
        # جلب رسوم التوصيل
        settings = await db.tenant_settings.find_one({"tenant_id": tenant_id}) or {}
        delivery_fee = settings.get("delivery_fee", 0)
        
        # إنشاء رقم الطلب
        counter = await db.order_counters.find_one_and_update(
            {"tenant_id": tenant_id},
            {"$inc": {"seq": 1}},
            upsert=True,
            return_document=True
        )
        order_number = counter.get("seq", 1)
        
        # إنشاء الطلب
        order_doc = {
            "id": str(uuid.uuid4()),
            "order_number": order_number,
            "tenant_id": tenant_id,
            "branch_id": order.branch_id,
            "customer_id": customer["id"] if customer else None,
            "customer_name": customer["name"] if customer else order.customer_name,
            "customer_phone": customer["phone"] if customer else order.customer_phone,
            "delivery_address": order.delivery_address,
            "delivery_notes": order.delivery_notes,
            "delivery_location": order.delivery_location.dict() if order.delivery_location else None,
            "items": order_items,
            "subtotal": total,
            "delivery_fee": delivery_fee,
            "total": total + delivery_fee,
            "total_cost": total_cost,
            "profit": total - total_cost,
            "payment_method": order.payment_method,
            "payment_status": "pending",  # pending, paid, failed
            "status": "pending",
            "source": "customer_app",
            "created_at": datetime.now(timezone.utc).isoformat()
        }
        
        await db.orders.insert_one(order_doc)
        order_doc.pop("_id", None)
        
        # تحديث إحصائيات العميل
        if customer:
            await db.customers.update_one(
                {"id": customer["id"]},
                {
                    "$inc": {
                        "total_orders": 1,
                        "total_spent": order_doc["total"]
                    }
                }
            )
        
        return {
            "success": True,
            "message": "تم إنشاء الطلب بنجاح",
            "order": order_doc
        }
    
    @router.get("/menu/{menu_slug}/orders")
    async def get_customer_orders(menu_slug: str, customer_token: str):
        """جلب طلبات العميل"""
        tenant = await db.tenants.find_one({"menu_slug": menu_slug}, {"_id": 0, "id": 1})
        if not tenant:
            raise HTTPException(status_code=404, detail="المطعم غير موجود")
        
        customer = await get_customer_from_token(customer_token, tenant["id"])
        if not customer:
            raise HTTPException(status_code=401, detail="غير مصرح")
        
        orders = await db.orders.find(
            {"customer_id": customer["id"], "tenant_id": tenant["id"]},
            {"_id": 0}
        ).sort("created_at", -1).limit(50).to_list(50)
        
        return orders
    
    @router.get("/menu/{menu_slug}/order/{order_id}")
    async def get_order_status(menu_slug: str, order_id: str):
        """تتبع حالة الطلب"""
        tenant = await db.tenants.find_one({"menu_slug": menu_slug}, {"_id": 0, "id": 1})
        if not tenant:
            raise HTTPException(status_code=404, detail="المطعم غير موجود")
        
        order = await db.orders.find_one(
            {"id": order_id, "tenant_id": tenant["id"]},
            {"_id": 0}
        )
        
        if not order:
            raise HTTPException(status_code=404, detail="الطلب غير موجود")
        
        # جلب معلومات السائق إذا كان الطلب مع سائق
        driver_info = None
        if order.get("driver_id"):
            driver = await db.drivers.find_one(
                {"id": order["driver_id"]},
                {"_id": 0, "name": 1, "phone": 1, "photo": 1}
            )
            if driver:
                driver_info = driver
        
        return {
            "order": order,
            "driver": driver_info,
            "status_timeline": [
                {"status": "pending", "label": "قيد الانتظار", "completed": True},
                {"status": "preparing", "label": "قيد التحضير", "completed": order["status"] in ["preparing", "ready", "out_for_delivery", "delivered"]},
                {"status": "ready", "label": "جاهز", "completed": order["status"] in ["ready", "out_for_delivery", "delivered"]},
                {"status": "out_for_delivery", "label": "في الطريق", "completed": order["status"] in ["out_for_delivery", "delivered"]},
                {"status": "delivered", "label": "تم التسليم", "completed": order["status"] == "delivered"}
            ]
        }
    
    return router


# ==================== MENU SLUG MANAGEMENT ====================

async def setup_menu_slugs(db):
    """إعداد slugs لجميع المطاعم"""
    tenants = await db.tenants.find({}, {"_id": 0}).to_list(100)
    
    for tenant in tenants:
        if not tenant.get("menu_slug"):
            slug = generate_menu_slug(tenant.get("name", tenant["id"]))
            # التأكد من عدم التكرار
            existing = await db.tenants.find_one({"menu_slug": slug})
            if existing:
                slug = f"{slug}-{tenant['id'][:8]}"
            
            await db.tenants.update_one(
                {"id": tenant["id"]},
                {"$set": {"menu_slug": slug}}
            )
    
    return True
