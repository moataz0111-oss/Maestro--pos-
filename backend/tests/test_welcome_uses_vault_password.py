"""Test حاسم: زر الترحيب يجب أن يرسل كلمة المرور الأصلية (من password_vault) بلا تغيير.
لا نُولّد كلمة عشوائية إلا للمستخدمين القدامى (قبل التحديث) الذين لا يملكون vault."""
import os, sys
import pytest
from unittest.mock import AsyncMock, patch, MagicMock

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))


def test_password_vault_roundtrip():
    """كلمة المرور المشفَّرة يجب أن تُفكّ بنفس القيمة الأصلية."""
    from server import encrypt_plain_password, decrypt_plain_password
    for pw in ["MyP@ssw0rd", "1234", "restaurant_owner_123", "خاص", "!@#$%^&*()"]:
        token = encrypt_plain_password(pw)
        assert token, f"فشل التشفير لـ: {pw}"
        assert decrypt_plain_password(token) == pw, f"فشل فك التشفير لـ: {pw}"


@pytest.mark.asyncio
async def test_welcome_uses_original_password_from_vault():
    """زر الترحيب يرسل كلمة المرور من password_vault — لا يولّد جديدة."""
    from server import encrypt_plain_password
    from routes.super_admin_routes import _send_welcome_bundle_to_user
    
    ORIGINAL_PW = "MySecretPass2026!"
    vault_token = encrypt_plain_password(ORIGINAL_PW)
    assert vault_token, "PASSWORD_VAULT_KEY غير مضبوط"
    
    tenant = {"id": "t1", "name": "مطعم أ"}
    user = {
        "id": "u1", "tenant_id": "t1", "role": "admin",
        "email": "a@x.com", "phone": "+9647701234567",
        "full_name": "أحمد",
        "password_vault": vault_token,  # ⚡ الكلمة الأصلية محفوظة
    }
    
    captured_password_in_email = {}
    async def _spy_email(recipient_email, tenant_name, owner_name, username, password):
        captured_password_in_email["pw"] = password
        return True
    
    captured_password_in_wa = {}
    async def _spy_wa(phone, message, **kwargs):
        # نتحقق أن الكلمة الأصلية موجودة في نص الواتساب
        captured_password_in_wa["msg"] = message
        return True, None
    
    with patch("routes.super_admin_routes.db") as mock_db, \
         patch("routes.super_admin_routes.hash_password", return_value="H"), \
         patch("routes.super_admin_routes.send_welcome_email", side_effect=_spy_email), \
         patch("routes.super_admin_routes.email_transport_configured", new=AsyncMock(return_value=True)), \
         patch("routes.super_admin_routes._phone_to_e164", new=AsyncMock(return_value="+9647701234567")), \
         patch("routes.super_admin_routes._wa_free") as mock_wa:
        mock_db.users.update_one = AsyncMock(return_value=None)
        mock_wa.is_connected = AsyncMock(return_value=True)
        mock_wa.send_message = AsyncMock(side_effect=_spy_wa)
        r = await _send_welcome_bundle_to_user(user, tenant)
    
    assert r["password_source"] == "vault", f"يجب أن يُقرأ من vault لا generated: {r['password_source']}"
    assert r["temp_password_reset"] is False, "لا يجب تصفير كلمة المرور — الأصلية أُرسلت"
    assert captured_password_in_email.get("pw") == ORIGINAL_PW, \
        f"البريد يجب أن يحتوي الكلمة الأصلية {ORIGINAL_PW}، لكن أُرسل: {captured_password_in_email.get('pw')}"
    assert ORIGINAL_PW in captured_password_in_wa.get("msg", ""), \
        f"الواتساب يجب أن يحتوي الكلمة الأصلية {ORIGINAL_PW}"


@pytest.mark.asyncio
async def test_welcome_fallback_generates_when_no_vault():
    """للمستخدمين القدامى بلا vault → يُولّد كلمة جديدة ويحفظ vault."""
    from routes.super_admin_routes import _send_welcome_bundle_to_user
    
    tenant = {"id": "t1", "name": "T"}
    user_old = {
        "id": "u_old", "tenant_id": "t1", "role": "cashier",
        "email": "old@x.com", "phone": "+9647701234567",
        "full_name": "قديم",
        # ملاحظة: لا يوجد password_vault
    }
    
    with patch("routes.super_admin_routes.db") as mock_db, \
         patch("routes.super_admin_routes.hash_password", return_value="H"), \
         patch("routes.super_admin_routes.encrypt_plain_password", return_value="ENC"), \
         patch("routes.super_admin_routes.send_welcome_email", new=AsyncMock(return_value=True)), \
         patch("routes.super_admin_routes.email_transport_configured", new=AsyncMock(return_value=True)), \
         patch("routes.super_admin_routes._phone_to_e164", new=AsyncMock(return_value="+9647701234567")), \
         patch("routes.super_admin_routes._wa_free") as mock_wa:
        mock_db.users.update_one = AsyncMock(return_value=None)
        mock_wa.is_connected = AsyncMock(return_value=True)
        mock_wa.send_message = AsyncMock(return_value=(True, None))
        r = await _send_welcome_bundle_to_user(user_old, tenant)
    
    assert r["password_source"] == "generated_fallback"
    assert r["temp_password_reset"] is True, "يجب حفظ الكلمة الجديدة للمستخدم القديم"
