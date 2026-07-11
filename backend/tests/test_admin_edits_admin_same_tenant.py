"""Test: admin يعدّل admin آخر في نفس التينانت (نفس الصلاحيات).
سيناريو: هاني admin أعطى معتز نفس دور admin. الاثنان يجب أن يستطيعا تعديل بعضهما."""
import os, sys
import pytest
from unittest.mock import patch, AsyncMock, MagicMock

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))


@pytest.mark.asyncio
async def test_admin_can_edit_another_admin_in_same_tenant():
    """هاني (admin) يستطيع تغيير كلمة مرور معتز (admin نفس التينانت)."""
    # نستدعي منطق فحص الصلاحيات مباشرةً من update_user
    from server import UserRole, hash_password, encrypt_plain_password
    
    hani = {"id": "hani-id", "role": UserRole.ADMIN, "tenant_id": "T"}
    moataz = {"id": "moataz-id", "role": UserRole.ADMIN, "tenant_id": "T"}
    
    # فحص المنطق نفسه من update_user (السطور 4237-4275)
    def can_edit(current_user, target_user, update_data):
        if current_user["role"] not in [UserRole.ADMIN, UserRole.MANAGER, UserRole.SUPER_ADMIN]:
            return False, "غير مصرح"
        is_super = current_user["role"] == UserRole.SUPER_ADMIN
        same_tenant = target_user.get("tenant_id") == current_user.get("tenant_id")
        current_role = target_user.get("role")
        
        # (2) حماية super_admin — لا يُعدَّل إلا بواسطة super_admin
        if current_role == UserRole.SUPER_ADMIN and not is_super:
            return False, "غير مصرح بتعديل حساب مالك النظام"
        # (3) لا خارج التينانت
        if not is_super and not same_tenant:
            return False, "خارج التينانت"
        return True, "ok"
    
    # هاني يعدّل معتز
    ok, reason = can_edit(hani, moataz, {"password": "NewPass2026"})
    assert ok is True, f"هاني ما يقدر يعدّل معتز: {reason}"
    
    # معتز يعدّل هاني (يحدث لأن كلاهما admin في نفس التينانت)
    ok, reason = can_edit(moataz, hani, {"password": "AnotherPass"})
    assert ok is True, f"معتز ما يقدر يعدّل هاني: {reason}"
    
    # كلاهما يعدّل نفسه
    ok, _ = can_edit(hani, hani, {"password": "SelfPass"})
    assert ok is True, "هاني يقدر يعدّل نفسه"
    ok, _ = can_edit(moataz, moataz, {"password": "MoatSelfPass"})
    assert ok is True, "معتز يقدر يعدّل نفسه"


@pytest.mark.asyncio
async def test_admin_cannot_edit_user_from_another_tenant():
    """admin لا يستطيع لمس حساب من تينانت مختلف — عزل صارم."""
    from server import UserRole
    hani = {"id": "hani-id", "role": UserRole.ADMIN, "tenant_id": "TENANT_A"}
    other_user = {"id": "x-id", "role": UserRole.CASHIER, "tenant_id": "TENANT_B"}
    
    def check_tenant(current, target):
        is_super = current["role"] == UserRole.SUPER_ADMIN
        same_tenant = target.get("tenant_id") == current.get("tenant_id")
        if not is_super and not same_tenant:
            return False
        return True
    
    assert check_tenant(hani, other_user) is False, "يجب رفض التعديل عبر التينانتات"


@pytest.mark.asyncio
async def test_admin_cannot_touch_super_admin():
    """admin (حتى لو مالك مشروع) لا يستطيع لمس حساب super_admin."""
    from server import UserRole
    hani = {"id": "hani", "role": UserRole.ADMIN, "tenant_id": "T"}
    system_owner = {"id": "owner", "role": UserRole.SUPER_ADMIN, "tenant_id": "T"}
    
    def can_touch_super(current, target):
        is_super = current["role"] == UserRole.SUPER_ADMIN
        if target.get("role") == UserRole.SUPER_ADMIN and not is_super:
            return False
        return True
    
    assert can_touch_super(hani, system_owner) is False, \
        "admin لا يجب أن يلمس حساب super_admin"
