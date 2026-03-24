#!/usr/bin/env python3
"""
سكريبت لإدخال البيانات الأساسية في قاعدة البيانات
يتضمن: Super Admin + Hani Client + Demo Client
"""

import os
from datetime import datetime, timezone
from pymongo import MongoClient
import bcrypt
import uuid

def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')

# الاتصال بقاعدة البيانات
MONGO_URL = os.environ.get("MONGO_URL", "mongodb://maestro_admin:Maestro%402024Secure@mongodb:27017/maestro_db?authSource=admin")
DB_NAME = os.environ.get("DB_NAME", "maestro_db")

client = MongoClient(MONGO_URL)
db = client[DB_NAME]

def generate_id():
    return str(uuid.uuid4())

def seed_super_admin():
    """إنشاء حساب Super Admin"""
    
    # التحقق من وجود Super Admin - لا نحذف البيانات الموجودة
    existing_admin = db.users.find_one({"email": "owner@maestroegp.com"})
    if existing_admin:
        print("✅ Super Admin موجود مسبقاً - تخطي")
        return existing_admin.get("id")
    
    # إنشاء hash واحد فقط
    password_hashed = hash_password("owner123")
    
    super_admin = {
        "id": generate_id(),
        "email": "owner@maestroegp.com",
        "password_hash": password_hashed,
        "password": password_hashed,
        "name": "مالك النظام",
        "full_name": "مالك النظام",
        "role": "super_admin",
        "is_active": True,
        "super_admin_secret": "271018",
        "created_at": datetime.now(timezone.utc).isoformat(),
        "updated_at": datetime.now(timezone.utc).isoformat()
    }
    
    db.users.insert_one(super_admin)
    print("✅ Super Admin created: owner@maestroegp.com / owner123")
    return super_admin["id"]

def seed_hani_tenant():
    """إنشاء عميل هاني (Graffiti Burger)"""
    
    tenant_id = generate_id()
    
    # إنشاء Tenant
    tenant = {
        "id": tenant_id,
        "name": "Graffiti Burger",
        "slug": "graffiti-burger",
        "owner_name": "هاني الدجيلي",
        "owner_email": "hanialdujaili@gmail.com",
        "owner_phone": "",
        "is_active": True,
        "features": {
            "tables": True,
            "kitchen_display": True,
            "call_center": True,
            "delivery": True,
            "inventory": True,
            "hr": True,
            "reservations": True,
            "loyalty": True,
            "coupons": True,
            "purchases": True,
            "expenses": True,
            "external_branches": True
        },
        "created_at": datetime.now(timezone.utc).isoformat(),
        "updated_at": datetime.now(timezone.utc).isoformat()
    }
    
    # تحقق من عدم وجود Tenant مسبقاً
    existing_tenant = db.tenants.find_one({"slug": "graffiti-burger"})
    if existing_tenant:
        print("✅ Hani tenant already exists")
        tenant_id = existing_tenant["id"]
    else:
        db.tenants.insert_one(tenant)
        print("✅ Hani tenant created: Graffiti Burger")
    
    # التحقق من وجود المستخدم - لا نحذف البيانات الموجودة
    existing_user = db.users.find_one({"email": "hanialdujaili@gmail.com"})
    if existing_user:
        print("✅ Hani admin موجود مسبقاً - تخطي")
    else:
        # إنشاء hash واحد فقط
        password_hashed = hash_password("Hani@2024")
        
        admin_user = {
            "id": generate_id(),
            "username": f"hani_{generate_id()[:8]}",
            "email": "hanialdujaili@gmail.com",
            "password_hash": password_hashed,
            "password": password_hashed,
            "name": "هاني الدجيلي",
            "full_name": "هاني الدجيلي",
            "role": "admin",
            "tenant_id": tenant_id,
            "is_active": True,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "updated_at": datetime.now(timezone.utc).isoformat()
        }
        
        db.users.insert_one(admin_user)
        print("✅ Hani admin created: hanialdujaili@gmail.com / Hani@2024")
    
    # إنشاء فرع رئيسي لهاني
    branch = {
        "id": generate_id(),
        "tenant_id": tenant_id,
        "name": "الفرع الرئيسي",
        "address": "بغداد، العراق",
        "phone": "",
        "is_active": True,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    
    existing_branch = db.branches.find_one({"tenant_id": tenant_id})
    if not existing_branch:
        db.branches.insert_one(branch)
        print("✅ Hani main branch created")
    
    return tenant_id

def seed_demo_tenant():
    """إنشاء عميل Demo"""
    
    tenant_id = generate_id()
    
    tenant = {
        "id": tenant_id,
        "name": "Demo Restaurant",
        "slug": "demo-restaurant",
        "owner_name": "Demo User",
        "owner_email": "demo@maestroegp.com",
        "owner_phone": "",
        "is_active": True,
        "features": {
            "tables": True,
            "kitchen_display": True,
            "call_center": True,
            "delivery": True,
            "inventory": True,
            "hr": True,
            "reservations": True,
            "loyalty": True,
            "coupons": True,
            "purchases": True,
            "expenses": True,
            "external_branches": True
        },
        "created_at": datetime.now(timezone.utc).isoformat(),
        "updated_at": datetime.now(timezone.utc).isoformat()
    }
    
    existing_tenant = db.tenants.find_one({"slug": "demo-restaurant"})
    if existing_tenant:
        print("✅ Demo tenant already exists")
        tenant_id = existing_tenant["id"]
    else:
        db.tenants.insert_one(tenant)
        print("✅ Demo tenant created")
    
    # التحقق من وجود المستخدم - لا نحذف البيانات الموجودة
    existing_user = db.users.find_one({"email": "demo@maestroegp.com"})
    if existing_user:
        print("✅ Demo admin موجود مسبقاً - تخطي")
    else:
        # إنشاء hash واحد فقط
        password_hashed = hash_password("Demo@2024")
        
        admin_user = {
            "id": generate_id(),
            "username": f"demo_{generate_id()[:8]}",
            "email": "demo@maestroegp.com",
            "password_hash": password_hashed,
            "password": password_hashed,
            "name": "Demo User",
            "full_name": "Demo User",
            "role": "admin",
            "tenant_id": tenant_id,
            "is_active": True,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "updated_at": datetime.now(timezone.utc).isoformat()
        }
        
        db.users.insert_one(admin_user)
        print("✅ Demo admin created: demo@maestroegp.com / Demo@2024")
    
    # إنشاء فرع رئيسي للـ Demo
    branch = {
        "id": generate_id(),
        "tenant_id": tenant_id,
        "name": "Main Branch",
        "address": "Demo Location",
        "phone": "",
        "is_active": True,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    
    existing_branch = db.branches.find_one({"tenant_id": tenant_id})
    if not existing_branch:
        db.branches.insert_one(branch)
        print("✅ Demo main branch created")
    
    return tenant_id

def main():
    print("=" * 50)
    print("🚀 بدء إدخال البيانات الأساسية...")
    print("=" * 50)
    
    # إنشاء الفهارس
    db.users.create_index("email", unique=True)
    db.users.create_index("tenant_id")
    db.tenants.create_index("slug", unique=True)
    db.branches.create_index("tenant_id")
    print("✅ Database indexes created")
    
    # إدخال البيانات
    seed_super_admin()
    seed_hani_tenant()
    seed_demo_tenant()
    
    print("=" * 50)
    print("✅ تم إدخال جميع البيانات بنجاح!")
    print("=" * 50)
    print("\n📋 بيانات الدخول:")
    print("-" * 50)
    print("Super Admin:")
    print("  Email: owner@maestroegp.com")
    print("  Password: owner123")
    print("  Secret: 271018")
    print("-" * 50)
    print("Hani (Graffiti Burger):")
    print("  Email: hanialdujaili@gmail.com")
    print("  Password: Hani@2024")
    print("-" * 50)
    print("Demo:")
    print("  Email: demo@maestroegp.com")
    print("  Password: Demo@2024")
    print("-" * 50)

if __name__ == "__main__":
    main()
