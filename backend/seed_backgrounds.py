#!/usr/bin/env python3
"""
سكريبت لإضافة الخلفيات الافتراضية إلى قاعدة البيانات
يُشغل مرة واحدة بعد الـ Deployment
"""
import asyncio
import os
from motor.motor_asyncio import AsyncIOMotorClient
from datetime import datetime, timezone
import uuid

MONGO_URL = os.environ.get('MONGO_URL', 'mongodb://localhost:27017')
DB_NAME = os.environ.get('DB_NAME', 'maestro_db')

# الخلفيات الافتراضية
DEFAULT_BACKGROUNDS = [
    {
        "id": str(uuid.uuid4()),
        "image_url": "/api/uploads/backgrounds/4064037b-da98-4ce8-99f3-7a806c9fbd09.jpg",
        "title": "مطعم 1",
        "animation_type": "fade",
        "animation_duration": 8,
        "overlay_opacity": 0.5,
        "is_active": True,
        "sort_order": 0,
        "created_at": datetime.now(timezone.utc).isoformat()
    },
    {
        "id": str(uuid.uuid4()),
        "image_url": "/api/uploads/backgrounds/583c98f8-c7ef-4f42-88e5-7f88f0143d28.jpg",
        "title": "مطعم 2",
        "animation_type": "fade",
        "animation_duration": 8,
        "overlay_opacity": 0.5,
        "is_active": True,
        "sort_order": 1,
        "created_at": datetime.now(timezone.utc).isoformat()
    },
    {
        "id": str(uuid.uuid4()),
        "image_url": "/api/uploads/backgrounds/8bb78320-f422-4153-96b2-0e736524ef7e.jpg",
        "title": "مطعم 3",
        "animation_type": "fade",
        "animation_duration": 8,
        "overlay_opacity": 0.5,
        "is_active": True,
        "sort_order": 2,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
]

async def seed_backgrounds():
    """إضافة الخلفيات الافتراضية"""
    client = AsyncIOMotorClient(MONGO_URL)
    db = client[DB_NAME]
    
    # التحقق من وجود خلفيات
    existing = await db.settings.find_one({"type": "login_backgrounds"})
    
    if existing and existing.get("value", {}).get("backgrounds"):
        print("✅ الخلفيات موجودة بالفعل")
        return
    
    # إضافة الخلفيات الافتراضية
    settings = {
        "backgrounds": DEFAULT_BACKGROUNDS,
        "animation_enabled": True,
        "transition_type": "fade",
        "transition_duration": 1.5,
        "auto_play": True,
        "show_logo": True,
        "logo_url": None,
        "logo_animation": "pulse",
        "overlay_color": "rgba(0,0,0,0.5)",
        "text_color": "#ffffff"
    }
    
    await db.settings.update_one(
        {"type": "login_backgrounds"},
        {"$set": {"type": "login_backgrounds", "value": settings}},
        upsert=True
    )
    
    print(f"✅ تمت إضافة {len(DEFAULT_BACKGROUNDS)} خلفيات افتراضية")
    
    client.close()

if __name__ == "__main__":
    asyncio.run(seed_backgrounds())
