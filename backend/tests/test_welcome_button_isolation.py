"""Test: زر ترحيب للعميل والمستخدمين — يتحقق من:
- عزل بيانات كل تينانت (لا يتم لمس مستخدمين خارج tenant_id)
- إعادة تعيين كلمة مرور مؤقتة + إرسال بريد + محاولة واتساب
- الاستجابة توضح بدقة ما تم إرساله ولمن (شفافية كاملة)
"""
import os
import sys
import pytest
from unittest.mock import AsyncMock, patch, MagicMock

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))


@pytest.mark.asyncio
async def test_send_welcome_to_owner_uses_only_tenant_admin():
    """يجب أن يجلب فقط admin التينانت المحدد — لا admin آخر من تينانت مختلف."""
    from routes.super_admin_routes import _send_welcome_bundle_to_user

    tenant = {"id": "tenant_A", "name": "مطعم أ", "slug": "restaurant-a"}
    user_tenant_a = {
        "id": "u1", "tenant_id": "tenant_A", "role": "admin",
        "email": "owner-a@test.com", "phone": "+9647701234567",
        "full_name": "مالك أ",
    }

    with patch("routes.super_admin_routes.db") as mock_db, \
         patch("routes.super_admin_routes.hash_password", return_value="HASHED"), \
         patch("routes.super_admin_routes.send_welcome_email", new=AsyncMock(return_value=True)), \
         patch("routes.super_admin_routes.email_transport_configured", new=AsyncMock(return_value=True)), \
         patch("routes.super_admin_routes._phone_to_e164", new=AsyncMock(return_value="+9647701234567")), \
         patch("routes.super_admin_routes._wa_free") as mock_wa:
        mock_db.users.update_one = AsyncMock(return_value=None)
        mock_wa.is_connected = AsyncMock(return_value=True)
        mock_wa.send_message = AsyncMock(return_value=(True, None))

        result = await _send_welcome_bundle_to_user(user_tenant_a, tenant)

    assert result["ok"] is True
    assert result["email_sent"] is True
    assert result["whatsapp_sent"] is True
    assert result["email"] == "owner-a@test.com"
    assert result["phone"] == "+9647701234567"
    assert result["temp_password_reset"] is True


@pytest.mark.asyncio
async def test_helper_rejects_user_from_different_tenant():
    """عزل صارم: لو المستخدم ينتمي لتينانت آخر → يُرفض."""
    from routes.super_admin_routes import _send_welcome_bundle_to_user

    tenant = {"id": "tenant_A", "name": "مطعم أ"}
    user_wrong = {
        "id": "u2", "tenant_id": "tenant_B", "role": "admin",
        "email": "x@x.com", "phone": "+9647701234567",
    }

    with patch("routes.super_admin_routes.db"):
        result = await _send_welcome_bundle_to_user(user_wrong, tenant)

    assert result["ok"] is False
    assert result["reason"] == "tenant_mismatch"


@pytest.mark.asyncio
async def test_helper_reports_missing_email_and_phone():
    """لو المستخدم بلا بريد وبلا هاتف → الاستجابة توضح ذلك بدقة."""
    from routes.super_admin_routes import _send_welcome_bundle_to_user

    tenant = {"id": "T", "name": "T"}
    user = {"id": "u", "tenant_id": "T", "role": "admin",
            "email": "", "phone": "", "full_name": "بلا اتصال"}

    with patch("routes.super_admin_routes.db") as mock_db, \
         patch("routes.super_admin_routes.hash_password", return_value="H"), \
         patch("routes.super_admin_routes.email_transport_configured", new=AsyncMock(return_value=True)):
        mock_db.users.update_one = AsyncMock(return_value=None)
        r = await _send_welcome_bundle_to_user(user, tenant)

    assert r["ok"] is False
    assert r["email_error"] == "no_email"
    assert r["whatsapp_error"] == "no_phone"
    assert r["temp_password_reset"] is True  # كلمة المرور تُعاد تعيينها حتى لو فشل الإرسال


@pytest.mark.asyncio
async def test_helper_reports_wa_not_connected():
    """لو الواتساب غير مربوط → whatsapp_error='wa_not_connected'."""
    from routes.super_admin_routes import _send_welcome_bundle_to_user

    tenant = {"id": "T", "name": "T"}
    user = {"id": "u", "tenant_id": "T", "role": "admin",
            "email": "a@a.com", "phone": "+9647701234567", "full_name": "N"}

    with patch("routes.super_admin_routes.db") as mock_db, \
         patch("routes.super_admin_routes.hash_password", return_value="H"), \
         patch("routes.super_admin_routes.send_welcome_email", new=AsyncMock(return_value=True)), \
         patch("routes.super_admin_routes.email_transport_configured", new=AsyncMock(return_value=True)), \
         patch("routes.super_admin_routes._phone_to_e164", new=AsyncMock(return_value="+9647701234567")), \
         patch("routes.super_admin_routes._wa_free") as mock_wa:
        mock_db.users.update_one = AsyncMock(return_value=None)
        mock_wa.is_connected = AsyncMock(return_value=False)
        r = await _send_welcome_bundle_to_user(user, tenant)

    assert r["email_sent"] is True
    assert r["whatsapp_sent"] is False
    assert r["whatsapp_error"] == "wa_not_connected"
    assert r["ok"] is True  # نجح البريد على الأقل
