"""
Login Backgrounds Routes
إدارة خلفيات صفحة تسجيل الدخول
"""
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import List, Dict, Any, Optional
import uuid
from datetime import datetime, timezone

router = APIRouter(prefix="/login-backgrounds", tags=["Login Backgrounds"])

# ==================== MODELS ====================

class LoginBackgroundCreate(BaseModel):
    image_url: str
    title: Optional[str] = None
    animation_type: str = "fade"  # fade, slide, zoom, kenburns, parallax
    animation_duration: int = 8  # بالثواني
    overlay_opacity: float = 0.5
    is_active: bool = True
    sort_order: int = 0

class LoginBackgroundSettings(BaseModel):
    backgrounds: List[Dict[str, Any]] = []
    animation_enabled: bool = True
    transition_type: str = "fade"  # fade, slide, crossfade
    transition_duration: float = 1.5  # بالثواني
    auto_play: bool = True
    show_logo: bool = True
    logo_url: Optional[str] = None
    logo_animation: str = "pulse"  # pulse, bounce, glow, none
    overlay_color: str = "rgba(0,0,0,0.5)"
    text_color: str = "#ffffff"


# Note: هذا الملف هو نموذج لإعادة الهيكلة
# للتفعيل الكامل، يجب:
# 1. نقل دوال verify_super_admin و db إلى ملف مشترك
# 2. استيرادها هنا
# 3. تسجيل هذا الـ router في __init__.py

# Default settings structure
DEFAULT_SETTINGS = {
    "backgrounds": [],
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


# ==================== ROUTES ====================
# Note: هذه الـ routes لن تعمل حتى يتم التكامل الكامل مع server.py
# تم إنشاء هذا الملف كنموذج لإعادة الهيكلة

"""
Example routes (to be uncommented after full integration):

@router.get("")
async def get_login_backgrounds(db = Depends(get_db)):
    settings = await db.settings.find_one({"type": "login_backgrounds"}, {"_id": 0})
    
    if settings and settings.get("value"):
        return {**DEFAULT_SETTINGS, **settings.get("value", {})}
    return DEFAULT_SETTINGS

@router.put("")
async def update_login_backgrounds(
    settings: LoginBackgroundSettings, 
    current_user: dict = Depends(verify_super_admin),
    db = Depends(get_db)
):
    await db.settings.update_one(
        {"type": "login_backgrounds"},
        {"$set": {"type": "login_backgrounds", "value": settings.model_dump()}},
        upsert=True
    )
    return {"message": "تم حفظ إعدادات الخلفيات"}

@router.post("/upload")
async def upload_login_background(
    file_url: str,
    title: Optional[str] = None,
    animation_type: str = "fade",
    current_user: dict = Depends(verify_super_admin),
    db = Depends(get_db)
):
    # جلب الإعدادات الحالية
    settings = await db.settings.find_one({"type": "login_backgrounds"}, {"_id": 0})
    current_backgrounds = []
    current_value = {}
    
    if settings and settings.get("value"):
        current_value = settings["value"]
        current_backgrounds = current_value.get("backgrounds", [])
    
    # إضافة الخلفية الجديدة
    new_background = {
        "id": str(uuid.uuid4()),
        "image_url": file_url,
        "title": title,
        "animation_type": animation_type,
        "animation_duration": 8,
        "overlay_opacity": 0.5,
        "is_active": True,
        "sort_order": len(current_backgrounds),
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    
    current_backgrounds.append(new_background)
    
    updated_settings = {
        **DEFAULT_SETTINGS,
        **current_value,
        "backgrounds": current_backgrounds
    }
    
    await db.settings.update_one(
        {"type": "login_backgrounds"},
        {"$set": {"type": "login_backgrounds", "value": updated_settings}},
        upsert=True
    )
    
    return {"message": "تم إضافة الخلفية", "background": new_background}

@router.delete("/{background_id}")
async def delete_login_background(
    background_id: str, 
    current_user: dict = Depends(verify_super_admin),
    db = Depends(get_db)
):
    settings = await db.settings.find_one({"type": "login_backgrounds"}, {"_id": 0})
    if not settings or not settings.get("value"):
        raise HTTPException(status_code=404, detail="لا توجد خلفيات")
    
    backgrounds = settings["value"].get("backgrounds", [])
    backgrounds = [b for b in backgrounds if b.get("id") != background_id]
    
    await db.settings.update_one(
        {"type": "login_backgrounds"},
        {"$set": {"value.backgrounds": backgrounds}}
    )
    
    return {"message": "تم حذف الخلفية"}
"""
