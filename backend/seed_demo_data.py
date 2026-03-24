#!/usr/bin/env python3
"""
سكريبت إضافة بيانات تجريبية كاملة لـ Graffiti Burger
"""

import os
import uuid
from datetime import datetime, timezone
from pymongo import MongoClient

# الاتصال بقاعدة البيانات
MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017/maestro_db")
DB_NAME = os.environ.get("DB_NAME", "maestro_db")

client = MongoClient(MONGO_URL)
db = client[DB_NAME]

def generate_id():
    return str(uuid.uuid4())

def get_current_time():
    return datetime.now(timezone.utc).isoformat()

# معرف Graffiti Burger
TENANT_ID = "1382e47a-7416-40ed-b367-760b6584bef7"

def seed_branches():
    """إضافة الفروع"""
    print("📍 إضافة الفروع...")
    
    # التحقق من وجود فروع مسبقاً - لا نحذف البيانات الموجودة
    existing_branches = list(db.branches.find({"tenant_id": TENANT_ID}))
    if existing_branches:
        print(f"✅ الفروع موجودة مسبقاً ({len(existing_branches)} فرع) - تخطي")
        return existing_branches
    
    # إضافة الفروع فقط إذا لم تكن موجودة
    
    branches = [
        {
            "id": generate_id(),
            "tenant_id": TENANT_ID,
            "name": "الفرع الرئيسي - التجمع الخامس",
            "name_en": "Main Branch - 5th Settlement",
            "address": "شارع التسعين، التجمع الخامس، القاهرة الجديدة",
            "phone": "01001234567",
            "is_main": True,
            "is_active": True,
            "working_hours": {"open": "10:00", "close": "23:00"},
            "created_at": get_current_time(),
            "updated_at": get_current_time()
        },
        {
            "id": generate_id(),
            "tenant_id": TENANT_ID,
            "name": "فرع مدينة نصر",
            "name_en": "Nasr City Branch",
            "address": "شارع عباس العقاد، مدينة نصر، القاهرة",
            "phone": "01001234568",
            "is_main": False,
            "is_active": True,
            "working_hours": {"open": "11:00", "close": "24:00"},
            "created_at": get_current_time(),
            "updated_at": get_current_time()
        },
        {
            "id": generate_id(),
            "tenant_id": TENANT_ID,
            "name": "فرع المعادي",
            "name_en": "Maadi Branch",
            "address": "شارع 9، المعادي، القاهرة",
            "phone": "01001234569",
            "is_main": False,
            "is_active": True,
            "working_hours": {"open": "10:00", "close": "23:00"},
            "created_at": get_current_time(),
            "updated_at": get_current_time()
        }
    ]
    
    db.branches.insert_many(branches)
    print(f"✅ تم إضافة {len(branches)} فروع")
    return branches

def seed_categories():
    """إضافة الفئات"""
    print("📂 إضافة الفئات...")
    
    # التحقق من وجود فئات مسبقاً - لا نحذف البيانات الموجودة
    existing_categories = list(db.categories.find({"tenant_id": TENANT_ID}))
    if existing_categories:
        print(f"✅ الفئات موجودة مسبقاً ({len(existing_categories)} فئة) - تخطي")
        return existing_categories
    
    # إضافة الفئات فقط إذا لم تكن موجودة
    
    categories = [
        {
            "id": generate_id(),
            "tenant_id": TENANT_ID,
            "name": "البرجر الكلاسيكي",
            "name_en": "Classic Burgers",
            "description": "تشكيلة من البرجر الكلاسيكي اللذيذ",
            "image": "https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=400",
            "sort_order": 1,
            "is_active": True,
            "created_at": get_current_time(),
            "updated_at": get_current_time()
        },
        {
            "id": generate_id(),
            "tenant_id": TENANT_ID,
            "name": "البرجر المميز",
            "name_en": "Premium Burgers",
            "description": "برجر فاخر بمكونات مميزة",
            "image": "https://images.unsplash.com/photo-1550317138-10000687a72b?w=400",
            "sort_order": 2,
            "is_active": True,
            "created_at": get_current_time(),
            "updated_at": get_current_time()
        },
        {
            "id": generate_id(),
            "tenant_id": TENANT_ID,
            "name": "الوجبات",
            "name_en": "Meals",
            "description": "وجبات كاملة مع البطاطس والمشروب",
            "image": "https://images.unsplash.com/photo-1594212699903-ec8a3eca50f5?w=400",
            "sort_order": 3,
            "is_active": True,
            "created_at": get_current_time(),
            "updated_at": get_current_time()
        },
        {
            "id": generate_id(),
            "tenant_id": TENANT_ID,
            "name": "المقبلات",
            "name_en": "Appetizers",
            "description": "مقبلات شهية",
            "image": "https://images.unsplash.com/photo-1630384060421-cb20d0e0649d?w=400",
            "sort_order": 4,
            "is_active": True,
            "created_at": get_current_time(),
            "updated_at": get_current_time()
        },
        {
            "id": generate_id(),
            "tenant_id": TENANT_ID,
            "name": "المشروبات",
            "name_en": "Drinks",
            "description": "مشروبات باردة وساخنة",
            "image": "https://images.unsplash.com/photo-1437418747212-8d9709afab22?w=400",
            "sort_order": 5,
            "is_active": True,
            "created_at": get_current_time(),
            "updated_at": get_current_time()
        },
        {
            "id": generate_id(),
            "tenant_id": TENANT_ID,
            "name": "الحلويات",
            "name_en": "Desserts",
            "description": "حلويات لذيذة",
            "image": "https://images.unsplash.com/photo-1551024601-bec78aea704b?w=400",
            "sort_order": 6,
            "is_active": True,
            "created_at": get_current_time(),
            "updated_at": get_current_time()
        }
    ]
    
    db.categories.insert_many(categories)
    print(f"✅ تم إضافة {len(categories)} فئات")
    return categories

def seed_products(categories):
    """إضافة المنتجات"""
    print("🍔 إضافة المنتجات...")
    
    # التحقق من وجود منتجات مسبقاً - لا نحذف البيانات الموجودة
    existing_products = db.products.count_documents({"tenant_id": TENANT_ID})
    if existing_products > 0:
        print(f"✅ المنتجات موجودة مسبقاً ({existing_products} منتج) - تخطي")
        return
    
    # الحصول على معرفات الفئات
    cat_ids = {cat["name"]: cat["id"] for cat in categories}
    
    products = [
        # البرجر الكلاسيكي
        {
            "id": generate_id(),
            "tenant_id": TENANT_ID,
            "category_id": cat_ids["البرجر الكلاسيكي"],
            "name": "تشيز برجر",
            "name_en": "Cheese Burger",
            "description": "برجر لحم مع جبنة شيدر",
            "price": 75,
            "image": "https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=400",
            "is_active": True,
            "sort_order": 1,
            "created_at": get_current_time(),
            "updated_at": get_current_time()
        },
        {
            "id": generate_id(),
            "tenant_id": TENANT_ID,
            "category_id": cat_ids["البرجر الكلاسيكي"],
            "name": "دبل تشيز برجر",
            "name_en": "Double Cheese Burger",
            "description": "قطعتين برجر لحم مع جبنة شيدر مزدوجة",
            "price": 120,
            "image": "https://images.unsplash.com/photo-1553979459-d2229ba7433b?w=400",
            "is_active": True,
            "sort_order": 2,
            "created_at": get_current_time(),
            "updated_at": get_current_time()
        },
        {
            "id": generate_id(),
            "tenant_id": TENANT_ID,
            "category_id": cat_ids["البرجر الكلاسيكي"],
            "name": "تشيكن برجر",
            "name_en": "Chicken Burger",
            "description": "برجر دجاج مقرمش",
            "price": 70,
            "image": "https://images.unsplash.com/photo-1606755962773-d324e0a13086?w=400",
            "is_active": True,
            "sort_order": 3,
            "created_at": get_current_time(),
            "updated_at": get_current_time()
        },
        
        # البرجر المميز
        {
            "id": generate_id(),
            "tenant_id": TENANT_ID,
            "category_id": cat_ids["البرجر المميز"],
            "name": "جرافيتي سبيشال",
            "name_en": "Graffiti Special",
            "description": "برجر لحم واجيو مع صوص خاص وجبنة بلو تشيز",
            "price": 180,
            "image": "https://images.unsplash.com/photo-1550317138-10000687a72b?w=400",
            "is_active": True,
            "sort_order": 1,
            "created_at": get_current_time(),
            "updated_at": get_current_time()
        },
        {
            "id": generate_id(),
            "tenant_id": TENANT_ID,
            "category_id": cat_ids["البرجر المميز"],
            "name": "سموكي BBQ",
            "name_en": "Smoky BBQ",
            "description": "برجر مدخن مع صوص باربكيو وبصل مكرمل",
            "price": 150,
            "image": "https://images.unsplash.com/photo-1594212699903-ec8a3eca50f5?w=400",
            "is_active": True,
            "sort_order": 2,
            "created_at": get_current_time(),
            "updated_at": get_current_time()
        },
        {
            "id": generate_id(),
            "tenant_id": TENANT_ID,
            "category_id": cat_ids["البرجر المميز"],
            "name": "ماشروم سويس",
            "name_en": "Mushroom Swiss",
            "description": "برجر مع مشروم سوتيه وجبنة سويسرية",
            "price": 140,
            "image": "https://images.unsplash.com/photo-1572802419224-296b0aeee0d9?w=400",
            "is_active": True,
            "sort_order": 3,
            "created_at": get_current_time(),
            "updated_at": get_current_time()
        },
        
        # الوجبات
        {
            "id": generate_id(),
            "tenant_id": TENANT_ID,
            "category_id": cat_ids["الوجبات"],
            "name": "وجبة تشيز برجر",
            "name_en": "Cheese Burger Meal",
            "description": "تشيز برجر + بطاطس + مشروب",
            "price": 110,
            "image": "https://images.unsplash.com/photo-1594212699903-ec8a3eca50f5?w=400",
            "is_active": True,
            "sort_order": 1,
            "created_at": get_current_time(),
            "updated_at": get_current_time()
        },
        {
            "id": generate_id(),
            "tenant_id": TENANT_ID,
            "category_id": cat_ids["الوجبات"],
            "name": "وجبة جرافيتي سبيشال",
            "name_en": "Graffiti Special Meal",
            "description": "جرافيتي سبيشال + بطاطس كبير + مشروب كبير",
            "price": 220,
            "image": "https://images.unsplash.com/photo-1550317138-10000687a72b?w=400",
            "is_active": True,
            "sort_order": 2,
            "created_at": get_current_time(),
            "updated_at": get_current_time()
        },
        
        # المقبلات
        {
            "id": generate_id(),
            "tenant_id": TENANT_ID,
            "category_id": cat_ids["المقبلات"],
            "name": "بطاطس مقلية",
            "name_en": "French Fries",
            "description": "بطاطس مقلية مقرمشة",
            "price": 35,
            "image": "https://images.unsplash.com/photo-1630384060421-cb20d0e0649d?w=400",
            "is_active": True,
            "sort_order": 1,
            "created_at": get_current_time(),
            "updated_at": get_current_time()
        },
        {
            "id": generate_id(),
            "tenant_id": TENANT_ID,
            "category_id": cat_ids["المقبلات"],
            "name": "حلقات البصل",
            "name_en": "Onion Rings",
            "description": "حلقات بصل مقرمشة",
            "price": 40,
            "image": "https://images.unsplash.com/photo-1639024471283-03518883512d?w=400",
            "is_active": True,
            "sort_order": 2,
            "created_at": get_current_time(),
            "updated_at": get_current_time()
        },
        {
            "id": generate_id(),
            "tenant_id": TENANT_ID,
            "category_id": cat_ids["المقبلات"],
            "name": "ناجتس دجاج",
            "name_en": "Chicken Nuggets",
            "description": "8 قطع ناجتس دجاج",
            "price": 55,
            "image": "https://images.unsplash.com/photo-1562967914-608f82629710?w=400",
            "is_active": True,
            "sort_order": 3,
            "created_at": get_current_time(),
            "updated_at": get_current_time()
        },
        {
            "id": generate_id(),
            "tenant_id": TENANT_ID,
            "category_id": cat_ids["المقبلات"],
            "name": "موزاريلا ستيكس",
            "name_en": "Mozzarella Sticks",
            "description": "6 قطع موزاريلا مقلية",
            "price": 60,
            "image": "https://images.unsplash.com/photo-1548340748-6d2b7d7da280?w=400",
            "is_active": True,
            "sort_order": 4,
            "created_at": get_current_time(),
            "updated_at": get_current_time()
        },
        
        # المشروبات
        {
            "id": generate_id(),
            "tenant_id": TENANT_ID,
            "category_id": cat_ids["المشروبات"],
            "name": "بيبسي",
            "name_en": "Pepsi",
            "description": "بيبسي عادي",
            "price": 15,
            "image": "https://images.unsplash.com/photo-1629203851122-3726ecdf080e?w=400",
            "is_active": True,
            "sort_order": 1,
            "created_at": get_current_time(),
            "updated_at": get_current_time()
        },
        {
            "id": generate_id(),
            "tenant_id": TENANT_ID,
            "category_id": cat_ids["المشروبات"],
            "name": "ميرندا",
            "name_en": "Miranda",
            "description": "ميرندا برتقال",
            "price": 15,
            "image": "https://images.unsplash.com/photo-1624552184280-9e9631bbeee9?w=400",
            "is_active": True,
            "sort_order": 2,
            "created_at": get_current_time(),
            "updated_at": get_current_time()
        },
        {
            "id": generate_id(),
            "tenant_id": TENANT_ID,
            "category_id": cat_ids["المشروبات"],
            "name": "مياه معدنية",
            "name_en": "Water",
            "description": "مياه معدنية",
            "price": 10,
            "image": "https://images.unsplash.com/photo-1548839140-29a749e1cf4d?w=400",
            "is_active": True,
            "sort_order": 3,
            "created_at": get_current_time(),
            "updated_at": get_current_time()
        },
        {
            "id": generate_id(),
            "tenant_id": TENANT_ID,
            "category_id": cat_ids["المشروبات"],
            "name": "ميلك شيك شوكولاتة",
            "name_en": "Chocolate Milkshake",
            "description": "ميلك شيك شوكولاتة كريمي",
            "price": 45,
            "image": "https://images.unsplash.com/photo-1572490122747-3968b75cc699?w=400",
            "is_active": True,
            "sort_order": 4,
            "created_at": get_current_time(),
            "updated_at": get_current_time()
        },
        {
            "id": generate_id(),
            "tenant_id": TENANT_ID,
            "category_id": cat_ids["المشروبات"],
            "name": "ميلك شيك فراولة",
            "name_en": "Strawberry Milkshake",
            "description": "ميلك شيك فراولة طازج",
            "price": 45,
            "image": "https://images.unsplash.com/photo-1579954115545-a95591f28bfc?w=400",
            "is_active": True,
            "sort_order": 5,
            "created_at": get_current_time(),
            "updated_at": get_current_time()
        },
        
        # الحلويات
        {
            "id": generate_id(),
            "tenant_id": TENANT_ID,
            "category_id": cat_ids["الحلويات"],
            "name": "براوني بالشوكولاتة",
            "name_en": "Chocolate Brownie",
            "description": "براوني دافئ مع آيس كريم فانيليا",
            "price": 55,
            "image": "https://images.unsplash.com/photo-1564355808539-22fda35bed7e?w=400",
            "is_active": True,
            "sort_order": 1,
            "created_at": get_current_time(),
            "updated_at": get_current_time()
        },
        {
            "id": generate_id(),
            "tenant_id": TENANT_ID,
            "category_id": cat_ids["الحلويات"],
            "name": "تشيز كيك",
            "name_en": "Cheesecake",
            "description": "تشيز كيك نيويورك",
            "price": 60,
            "image": "https://images.unsplash.com/photo-1524351199678-941a58a3df50?w=400",
            "is_active": True,
            "sort_order": 2,
            "created_at": get_current_time(),
            "updated_at": get_current_time()
        },
        {
            "id": generate_id(),
            "tenant_id": TENANT_ID,
            "category_id": cat_ids["الحلويات"],
            "name": "آيس كريم",
            "name_en": "Ice Cream",
            "description": "3 سكوب آيس كريم متنوع",
            "price": 40,
            "image": "https://images.unsplash.com/photo-1551024601-bec78aea704b?w=400",
            "is_active": True,
            "sort_order": 3,
            "created_at": get_current_time(),
            "updated_at": get_current_time()
        }
    ]
    
    db.products.insert_many(products)
    print(f"✅ تم إضافة {len(products)} منتج")
    return products

def seed_tables(branches):
    """إضافة الطاولات"""
    print("🪑 إضافة الطاولات...")
    
    # التحقق من وجود طاولات مسبقاً - لا نحذف البيانات الموجودة
    existing_tables = db.tables.count_documents({"tenant_id": TENANT_ID})
    if existing_tables > 0:
        print(f"✅ الطاولات موجودة مسبقاً ({existing_tables} طاولة) - تخطي")
        return
    
    tables = []
    for branch in branches:
        for i in range(1, 11):  # 10 طاولات لكل فرع
            tables.append({
                "id": generate_id(),
                "tenant_id": TENANT_ID,
                "branch_id": branch["id"],
                "number": i,
                "name": f"طاولة {i}",
                "capacity": 4 if i <= 6 else 6,
                "status": "available",
                "is_active": True,
                "created_at": get_current_time(),
                "updated_at": get_current_time()
            })
    
    db.tables.insert_many(tables)
    print(f"✅ تم إضافة {len(tables)} طاولة")

def seed_customers():
    """إضافة عملاء تجريبيين"""
    print("👥 إضافة العملاء...")
    
    # التحقق من وجود عملاء مسبقاً - لا نحذف البيانات الموجودة
    existing_customers = db.customers.count_documents({"tenant_id": TENANT_ID})
    if existing_customers > 0:
        print(f"✅ العملاء موجودون مسبقاً ({existing_customers} عميل) - تخطي")
        return
    
    customers = [
        {
            "id": generate_id(),
            "tenant_id": TENANT_ID,
            "name": "أحمد محمد",
            "phone": "01012345678",
            "email": "ahmed@example.com",
            "address": "شارع التسعين، التجمع الخامس",
            "total_orders": 15,
            "total_spent": 2500,
            "loyalty_points": 250,
            "created_at": get_current_time(),
            "updated_at": get_current_time()
        },
        {
            "id": generate_id(),
            "tenant_id": TENANT_ID,
            "name": "سارة أحمد",
            "phone": "01098765432",
            "email": "sara@example.com",
            "address": "شارع عباس العقاد، مدينة نصر",
            "total_orders": 8,
            "total_spent": 1200,
            "loyalty_points": 120,
            "created_at": get_current_time(),
            "updated_at": get_current_time()
        },
        {
            "id": generate_id(),
            "tenant_id": TENANT_ID,
            "name": "محمد علي",
            "phone": "01123456789",
            "email": "mohamed@example.com",
            "address": "شارع 9، المعادي",
            "total_orders": 22,
            "total_spent": 3800,
            "loyalty_points": 380,
            "created_at": get_current_time(),
            "updated_at": get_current_time()
        },
        {
            "id": generate_id(),
            "tenant_id": TENANT_ID,
            "name": "فاطمة حسن",
            "phone": "01234567890",
            "email": "fatma@example.com",
            "address": "شارع الهرم، الجيزة",
            "total_orders": 5,
            "total_spent": 750,
            "loyalty_points": 75,
            "created_at": get_current_time(),
            "updated_at": get_current_time()
        },
        {
            "id": generate_id(),
            "tenant_id": TENANT_ID,
            "name": "يوسف إبراهيم",
            "phone": "01156789012",
            "email": "youssef@example.com",
            "address": "شارع مصطفى النحاس، مدينة نصر",
            "total_orders": 12,
            "total_spent": 1800,
            "loyalty_points": 180,
            "created_at": get_current_time(),
            "updated_at": get_current_time()
        }
    ]
    
    db.customers.insert_many(customers)
    print(f"✅ تم إضافة {len(customers)} عميل")

def seed_users(branches):
    """إضافة مستخدمين للفروع"""
    print("👤 إضافة المستخدمين...")
    
    import bcrypt
    
    def hash_password(password):
        return bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')
    
    # التحقق من وجود مستخدمين إضافيين (غير الأدمن) - لا نحذف البيانات الموجودة
    existing_users = db.users.count_documents({
        "tenant_id": TENANT_ID,
        "email": {"$ne": "hanialdujaili@gmail.com"}
    })
    if existing_users > 0:
        print(f"✅ المستخدمون موجودون مسبقاً ({existing_users} مستخدم) - تخطي")
        return
    
    users = []
    password_hash = hash_password("123456")
    
    for i, branch in enumerate(branches):
        # كاشير
        users.append({
            "id": generate_id(),
            "username": f"cashier_{generate_id()[:8]}",
            "tenant_id": TENANT_ID,
            "branch_id": branch["id"],
            "email": f"cashier{i+1}@graffiti.com",
            "password_hash": password_hash,
            "password": password_hash,
            "name": f"كاشير {i+1}",
            "full_name": f"كاشير فرع {branch['name']}",
            "role": "cashier",
            "is_active": True,
            "created_at": get_current_time(),
            "updated_at": get_current_time()
        })
        
        # مدير فرع
        users.append({
            "id": generate_id(),
            "username": f"manager_{generate_id()[:8]}",
            "tenant_id": TENANT_ID,
            "branch_id": branch["id"],
            "email": f"manager{i+1}@graffiti.com",
            "password_hash": password_hash,
            "password": password_hash,
            "name": f"مدير {i+1}",
            "full_name": f"مدير فرع {branch['name']}",
            "role": "manager",
            "is_active": True,
            "created_at": get_current_time(),
            "updated_at": get_current_time()
        })
    
    if users:
        db.users.insert_many(users)
    print(f"✅ تم إضافة {len(users)} مستخدم")

def main():
    print("=" * 50)
    print("🚀 بدء إضافة البيانات التجريبية لـ Graffiti Burger")
    print("=" * 50)
    
    branches = seed_branches()
    categories = seed_categories()
    seed_products(categories)
    seed_tables(branches)
    seed_customers()
    seed_users(branches)
    
    print("=" * 50)
    print("✅ تم إضافة جميع البيانات التجريبية بنجاح!")
    print("=" * 50)

if __name__ == "__main__":
    main()
