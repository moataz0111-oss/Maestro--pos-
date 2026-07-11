"""Test حاسم: عزل مالك النظام (super_admin) عن رسائل الترحيب.

يتحقق أن:
- send_welcome_email يُرسَل ONLY إلى المستلم المستهدف (recipient_email)
- super_admin recovery_emails لا يُضاف تلقائياً
- الواتساب/SMS يُرسَلان فقط لرقم المستلم
"""
import os, sys
import pytest
from unittest.mock import AsyncMock, patch, MagicMock

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))


@pytest.mark.asyncio
async def test_welcome_email_only_to_target_never_super_admin():
    """بريد الترحيب لا يُرسَل إلا للمستلم المحدد — لا يشمل recovery_emails."""
    from server import send_welcome_email

    captured_recipients = []

    async def _spy_send_email(to_emails, subject, html_content, purpose="system", tenant_id=None):
        captured_recipients.append(to_emails)
        return True

    with patch("server.send_system_email", side_effect=_spy_send_email), \
         patch("server.email_transport_configured", new=AsyncMock(return_value=True)), \
         patch("server.get_owner_recovery_emails", new=AsyncMock(
             return_value=["owner@maestroegp.com", "recovery@maestroegp.com"])):
        await send_welcome_email(
            recipient_email="client@resto.com",
            tenant_name="مطعم أ",
            owner_name="أحمد",
            username="client@resto.com",
            password="temp",
        )

    assert len(captured_recipients) == 1, "يجب استدعاء send_system_email مرة واحدة"
    to = captured_recipients[0]
    # اقلبها إلى list دائماً
    if isinstance(to, str): to = [to]
    to_lower = [str(x).lower() for x in to]
    # ✅ المستلم فقط
    assert "client@resto.com" in to_lower
    # ❌ super_admin recovery emails NOT included
    assert "owner@maestroegp.com" not in to_lower, "بريد مالك النظام يجب ألا يصله ترحيب العميل!"
    assert "recovery@maestroegp.com" not in to_lower, "بريد الاسترداد يجب ألا يصله ترحيب العميل!"
    assert len(to) == 1, f"يجب أن يكون هناك مستلم واحد فقط، وُجد: {to}"


@pytest.mark.asyncio
async def test_welcome_bundle_isolates_tenant_admin_only():
    """helper الترحيب يرسل فقط لمالك المطعم — ليس لأي حساب آخر في النظام."""
    from routes.super_admin_routes import _send_welcome_bundle_to_user

    tenant = {"id": "t_A", "name": "مطعم أ"}
    admin_user = {
        "id": "u1", "tenant_id": "t_A", "role": "admin",
        "email": "admin-a@resto.com", "phone": "+9647701234567", "full_name": "أحمد",
    }

    # مراقب الاستدعاءات
    email_recipients = []
    wa_recipients = []

    async def _spy_email(recipient_email, **kwargs):
        email_recipients.append(recipient_email)
        return True
    async def _spy_wa_send(phone, message, **kwargs):
        wa_recipients.append(phone)
        return True, None

    with patch("routes.super_admin_routes.db") as mock_db, \
         patch("routes.super_admin_routes.hash_password", return_value="H"), \
         patch("routes.super_admin_routes.send_welcome_email", side_effect=_spy_email), \
         patch("routes.super_admin_routes.email_transport_configured", new=AsyncMock(return_value=True)), \
         patch("routes.super_admin_routes._phone_to_e164", new=AsyncMock(return_value="+9647701234567")), \
         patch("routes.super_admin_routes._wa_free") as mock_wa:
        mock_db.users.update_one = AsyncMock(return_value=None)
        mock_wa.is_connected = AsyncMock(return_value=True)
        mock_wa.send_message = AsyncMock(side_effect=_spy_wa_send)
        await _send_welcome_bundle_to_user(admin_user, tenant)

    # ✅ البريد ذهب فقط للمستهدف
    assert email_recipients == ["admin-a@resto.com"], \
        f"يجب إرسال البريد فقط لـ admin-a@resto.com، لكن أُرسل لـ: {email_recipients}"
    # ✅ الواتساب ذهب فقط لرقم المستهدف
    assert wa_recipients == ["+9647701234567"], \
        f"يجب إرسال الواتساب فقط للرقم المستهدف، لكن أُرسل لـ: {wa_recipients}"


@pytest.mark.asyncio
async def test_sms_fallback_when_wa_disconnected():
    """SMS يُرسَل كـ fallback عند فشل الواتساب — ولا يذهب لأحد آخر."""
    from routes.super_admin_routes import _send_welcome_bundle_to_user

    tenant = {"id": "T", "name": "T"}
    user = {"id": "u", "tenant_id": "T", "role": "admin",
            "email": "target@x.com", "phone": "+9647701234567", "full_name": "N"}

    sms_recipients = []
    async def _spy_sms(phone, body):
        sms_recipients.append(phone)
        return True, "sid_123"

    with patch("routes.super_admin_routes.db") as mock_db, \
         patch("routes.super_admin_routes.hash_password", return_value="H"), \
         patch("routes.super_admin_routes.send_welcome_email", new=AsyncMock(return_value=True)), \
         patch("routes.super_admin_routes.email_transport_configured", new=AsyncMock(return_value=True)), \
         patch("routes.super_admin_routes._phone_to_e164", new=AsyncMock(return_value="+9647701234567")), \
         patch("routes.super_admin_routes._wa_free") as mock_wa, \
         patch("twilio_verify._sms_configured", return_value=True), \
         patch("twilio_verify.send_sms", side_effect=_spy_sms):
        mock_db.users.update_one = AsyncMock(return_value=None)
        mock_wa.is_connected = AsyncMock(return_value=False)  # واتساب معطّل
        r = await _send_welcome_bundle_to_user(user, tenant)

    assert r["whatsapp_sent"] is False
    assert r["whatsapp_error"] == "wa_not_connected"
    assert r["sms_sent"] is True, f"SMS لم يُرسَل كـ fallback: {r}"
    assert sms_recipients == ["+9647701234567"], f"SMS ذهب لرقم خاطئ: {sms_recipients}"
