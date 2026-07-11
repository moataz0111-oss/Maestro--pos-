"""Test حاسم: عزل بين مالك المشروع (admin) والمدير العام (manager) — سيناريو هاني/معتز.

الوضع:
- هاني: role=admin, email=hani@resto.com → المالك الفعلي، email مطابق لـ tenant.owner_email
- معتز: role=manager, email=moataz@resto.com → مدير عام، يعمل تحت هاني

Super_admin يرى معتز كمستخدم (وليس مالك). عند الضغط على زر الترحيب من لوحة SuperAdmin:
- الرسالة تُرسَل لهاني فقط (owner)
- معتز لا يستقبل شيئاً (هو ليس المالك)
- إذا أراد هاني أن يرسل ترحيب لمعتز → يستخدم زر الترحيب في صفحة إدارة المستخدمين (Settings)
"""
import os, sys
import pytest
from unittest.mock import patch, AsyncMock

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))


@pytest.mark.asyncio
async def test_super_admin_welcome_targets_only_tenant_admin_not_manager():
    """super_admin يضغط زر ترحيب المطعم → يستهدف هاني (admin) فقط، لا معتز (manager)."""
    from routes.super_admin_routes import send_welcome_to_tenant_owner
    from server import UserRole, encrypt_plain_password
    
    HANI_PW = "HaniOwnerPass2026"
    MOATAZ_PW = "MoatazManagerPass2026"
    tenant_id = "tenant_graffiti"
    tenant = {
        "id": tenant_id, "name": "GRaffiti BURGER",
        "owner_email": "hani@graffiti.com",
        "owner_phone": "+9647701111111",
    }
    hani = {
        "id": "hani-uuid", "tenant_id": tenant_id, "role": UserRole.ADMIN,
        "email": "hani@graffiti.com", "phone": "+9647701111111",
        "full_name": "هاني الدجيلي",
        "password_vault": encrypt_plain_password(HANI_PW),
    }
    moataz = {
        "id": "moataz-uuid", "tenant_id": tenant_id, "role": UserRole.MANAGER,
        "email": "moataz@graffiti.com", "phone": "+9647702222222",
        "full_name": "معتز مهنا",
        "password_vault": encrypt_plain_password(MOATAZ_PW),
    }
    
    # نتتبّع من استُدعي في send_welcome_email + wa
    email_captured = {"recipients": [], "passwords": []}
    async def _spy_email(recipient_email, tenant_name, owner_name, username, password):
        email_captured["recipients"].append(recipient_email)
        email_captured["passwords"].append(password)
        return True
    wa_captured = {"phones": [], "messages": []}
    async def _spy_wa(phone, message, **kw):
        wa_captured["phones"].append(phone)
        wa_captured["messages"].append(message)
        return True, None
    
    async def _mock_find_one(query, projection=None):
        if "id" in query and query["id"] == tenant_id:
            return tenant
        # find_one for user: match by tenant_id + role + optional email
        if query.get("tenant_id") == tenant_id and query.get("role") == UserRole.ADMIN:
            if query.get("email") == "hani@graffiti.com":
                return hani
            if "email" not in query:
                return hani  # fallback returns hani (only admin)
        return None
    
    fake_super_admin = {"id": "super", "role": UserRole.SUPER_ADMIN}
    
    with patch("routes.super_admin_routes.db") as mock_db, \
         patch("routes.super_admin_routes.hash_password", return_value="H"), \
         patch("routes.super_admin_routes.send_welcome_email", side_effect=_spy_email), \
         patch("routes.super_admin_routes.email_transport_configured", new=AsyncMock(return_value=True)), \
         patch("routes.super_admin_routes._phone_to_e164", new=AsyncMock(side_effect=lambda p, **kw: p)), \
         patch("routes.super_admin_routes._wa_free") as mock_wa, \
         patch("routes.super_admin_routes.record_audit", new=AsyncMock(return_value=None)):
        mock_db.tenants.find_one = AsyncMock(side_effect=_mock_find_one)
        mock_db.users.find_one = AsyncMock(side_effect=_mock_find_one)
        mock_db.users.update_one = AsyncMock(return_value=None)
        mock_wa.is_connected = AsyncMock(return_value=True)
        mock_wa.send_message = AsyncMock(side_effect=_spy_wa)
        
        res = await send_welcome_to_tenant_owner(tenant_id, payload=None, current_user=fake_super_admin)
    
    # ✅ التحققات الحاسمة:
    # 1) البريد ذهب فقط لهاني (لا معتز)
    assert email_captured["recipients"] == ["hani@graffiti.com"], \
        f"البريد يجب أن يذهب لهاني فقط، لكن ذهب لـ: {email_captured['recipients']}"
    # 2) البريد يحتوي كلمة هاني (ليس كلمة معتز)
    assert email_captured["passwords"] == [HANI_PW], \
        f"البريد يجب أن يحتوي كلمة هاني، لكن يحتوي: {email_captured['passwords']}"
    assert MOATAZ_PW not in email_captured["passwords"], "لا يجب إرسال كلمة معتز"
    # 3) الواتساب لرقم هاني فقط
    assert wa_captured["phones"] == ["+9647701111111"], \
        f"الواتساب يجب أن يذهب لرقم هاني فقط، لكن ذهب لـ: {wa_captured['phones']}"
    assert "+9647702222222" not in wa_captured["phones"], "لا يجب إرسال لرقم معتز"
    # 4) نص الواتساب يحتوي كلمة هاني
    assert HANI_PW in wa_captured["messages"][0]
    assert MOATAZ_PW not in wa_captured["messages"][0]
    # 5) استجابة API صحيحة
    assert res["success"] is True
    assert res["tenant_name"] == "GRaffiti BURGER"
    assert res["owner"]["name"] == "هاني الدجيلي"
    assert res["owner"]["email"] == "hani@graffiti.com"
