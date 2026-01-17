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
    
    # ==================== 8. تفعيل السائقين الموجودين ====================
    result = await db.drivers.update_many(
        {"is_active": {"$exists": False}},
        {"$set": {"is_active": True}}
    )
    if result.modified_count > 0:
        print(f"✅ Activated {result.modified_count} existing drivers")
    
    # ==================== 9. تحديثات تلقائية لجميع العملاء ====================
    print("\n🔄 Applying automatic updates to all tenants...")
    
    # 9.1 تفعيل جميع السائقين (حتى لو is_active = false)
    drivers_activated = await db.drivers.update_many(
        {},
        {"$set": {"is_active": True}}
    )
    print(f"   ✅ All drivers activated: {drivers_activated.modified_count}")
    
    # 9.2 إضافة is_available للسائقين الذين ليس لديهم هذا الحقل
    drivers_available = await db.drivers.update_many(
        {"is_available": {"$exists": False}},
        {"$set": {"is_available": True}}
    )
    if drivers_available.modified_count > 0:
        print(f"   ✅ Set is_available for {drivers_available.modified_count} drivers")
    
    # 9.3 إنشاء فرع افتراضي لكل عميل ليس لديه فرع
    tenants = await db.tenants.find({}, {"_id": 0, "id": 1, "name": 1}).to_list(None)
    for tenant in tenants:
        tenant_branch = await db.branches.find_one({"tenant_id": tenant["id"]})
        if not tenant_branch:
            default_branch = {
                "id": str(uuid.uuid4()),
                "name": "الفرع الرئيسي",
                "address": "",
                "phone": "",
                "is_active": True,
                "is_main": True,
                "tenant_id": tenant["id"],
                "created_at": datetime.now(timezone.utc).isoformat()
            }
            await db.branches.insert_one(default_branch)
            print(f"   ✅ Created default branch for tenant: {tenant.get('name', tenant['id'][:8])}")
    
    # 9.4 تفعيل جميع الفروع
    branches_activated = await db.branches.update_many(
        {"is_active": {"$exists": False}},
        {"$set": {"is_active": True}}
    )
    if branches_activated.modified_count > 0:
        print(f"   ✅ Activated {branches_activated.modified_count} branches")
    
    # 9.5 إغلاق جميع الورديات القديمة المفتوحة (أكثر من 24 ساعة)
    from datetime import timedelta
    old_shifts_cutoff = (datetime.now(timezone.utc) - timedelta(hours=24)).isoformat()
    old_shifts = await db.shifts.update_many(
        {
            "status": "open",
            "started_at": {"$lt": old_shifts_cutoff}
        },
        {"$set": {
            "status": "auto_closed",
            "ended_at": datetime.now(timezone.utc).isoformat(),
            "auto_closed_reason": "تم الإغلاق تلقائياً بعد 24 ساعة"
        }}
    )
    if old_shifts.modified_count > 0:
        print(f"   ✅ Auto-closed {old_shifts.modified_count} old shifts")
    
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
