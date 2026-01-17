"""
سكربت تهيئة البيانات الأساسية للنظام
يتم تشغيله تلقائياً عند بدء التطبيق
"""
import asyncio
import bcrypt
import uuid
from datetime import datetime, timezone
from motor.motor_asyncio import AsyncIOMotorClient
import os

async def init_database():
    """تهيئة قاعدة البيانات بالبيانات الأساسية"""
    
    mongo_url = os.environ.get("MONGO_URL")
    db_name = os.environ.get("DB_NAME", "maestro_egp")
    
    if not mongo_url:
        print("❌ MONGO_URL not set!")
        return False
    
    client = AsyncIOMotorClient(mongo_url)
    db = client[db_name]
    
    print(f"🔗 Connected to database: {db_name}")
    
    # ==================== 1. إنشاء Super Admin ====================
    super_admin = await db.users.find_one({"role": "super_admin"})
    if not super_admin:
        super_admin_password = bcrypt.hashpw("owner123".encode('utf-8'), bcrypt.gensalt()).decode('utf-8')
        super_admin_doc = {
            "id": str(uuid.uuid4()),
            "username": "super_admin",
            "email": "owner@maestroegp.com",
            "password": super_admin_password,
            "full_name": "Owner",
            "role": "super_admin",
            "branch_id": None,
            "tenant_id": None,
            "permissions": ["all", "super_admin"],
            "is_active": True,
            "created_at": datetime.now(timezone.utc).isoformat()
        }
        await db.users.insert_one(super_admin_doc)
        print("✅ Super Admin created: owner@maestroegp.com / owner123")
    else:
        print("ℹ️ Super Admin already exists")
    
    # ==================== 2. إنشاء مستخدم النظام الرئيسي ====================
    main_admin = await db.users.find_one({"email": "admin@maestroegp.com"})
    if not main_admin:
        admin_password = bcrypt.hashpw("admin123".encode('utf-8'), bcrypt.gensalt()).decode('utf-8')
        admin_doc = {
            "id": str(uuid.uuid4()),
            "username": "admin",
            "email": "admin@maestroegp.com",
            "password": admin_password,
            "full_name": "مدير النظام",
            "role": "admin",
            "branch_id": None,
            "tenant_id": None,
            "permissions": ["all"],
            "is_active": True,
            "created_at": datetime.now(timezone.utc).isoformat()
        }
        await db.users.insert_one(admin_doc)
        print("✅ Main Admin created: admin@maestroegp.com / admin123")
    else:
        print("ℹ️ Main Admin already exists")
    
    # ==================== 3. إنشاء الفرع الرئيسي ====================
    main_branch = await db.branches.find_one({"is_main": True})
    if not main_branch:
        branch_doc = {
            "id": str(uuid.uuid4()),
            "name": "الفرع الرئيسي",
            "code": "MAIN",
            "address": "العنوان الرئيسي",
            "phone": "",
            "is_main": True,
            "is_active": True,
            "tenant_id": None,
            "created_at": datetime.now(timezone.utc).isoformat()
        }
        await db.branches.insert_one(branch_doc)
        print("✅ Main Branch created")
    else:
        print("ℹ️ Main Branch already exists")
    
    # ==================== 4. إعدادات النظام الافتراضية ====================
    system_branding = await db.settings.find_one({"type": "system_branding"})
    if not system_branding:
        branding_doc = {
            "type": "system_branding",
            "value": {
                "name": "Maestro",
                "name_ar": "Maestro",
                "name_en": "Maestro",
                "logo_url": None
            }
        }
        await db.settings.insert_one(branding_doc)
        print("✅ System branding settings created")
    else:
        print("ℹ️ System branding already exists")
    
    # ==================== 5. إعدادات خلفية تسجيل الدخول ====================
    login_bg = await db.settings.find_one({"type": "login_backgrounds"})
    if not login_bg:
        bg_doc = {
            "type": "login_backgrounds",
            "backgrounds": [
                {
                    "id": str(uuid.uuid4()),
                    "image_url": "https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=1920",
                    "title": "مطعم فاخر",
                    "is_active": True
                }
            ],
            "settings": {
                "transition_effect": "fade",
                "transition_speed": 5,
                "overlay_color": "rgba(0,0,0,0.5)",
                "text_color": "#ffffff"
            }
        }
        await db.settings.insert_one(bg_doc)
        print("✅ Login backgrounds created")
    else:
        print("ℹ️ Login backgrounds already exist")
    
    # ==================== 6. إنشاء فئة افتراضية ====================
    default_category = await db.categories.find_one({})
    if not default_category:
        category_doc = {
            "id": str(uuid.uuid4()),
            "name": "عام",
            "description": "الفئة الافتراضية",
            "tenant_id": None,
            "is_active": True,
            "created_at": datetime.now(timezone.utc).isoformat()
        }
        await db.categories.insert_one(category_doc)
        print("✅ Default category created")
    else:
        print("ℹ️ Categories already exist")
    
    # ==================== 7. إعدادات النظام الافتراضية (للجميع) ====================
    default_settings = await db.settings.find_one({"type": "default_tenant_settings"})
    if not default_settings:
        settings_doc = {
            "type": "default_tenant_settings",
            "value": {
                "auto_open_shift": True,  # فتح الوردية تلقائياً
                "default_opening_cash": 0,  # رصيد افتتاحي افتراضي
                "require_shift_for_pos": False,  # لا يتطلب وردية لفتح نقاط البيع
                "auto_create_branch": True,  # إنشاء فرع تلقائياً
                "default_currency": "IQD",
                "default_language": "ar"
            }
        }
        await db.settings.insert_one(settings_doc)
        print("✅ Default tenant settings created")
    else:
        print("ℹ️ Default tenant settings already exist")
    
    print("\n🎉 Database initialization complete!")
    print("=" * 50)
    print("📋 Login Credentials:")
    print("   Super Admin: owner@maestroegp.com / owner123")
    print("   Secret Key: 271018")
    print("   Main Admin: admin@maestroegp.com / admin123")
    print("=" * 50)
    
    return True

if __name__ == "__main__":
    asyncio.run(init_database())
