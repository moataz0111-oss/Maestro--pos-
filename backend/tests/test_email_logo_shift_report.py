"""Test: تقرير إغلاق الوردية على البريد يحتوي الشعار تحت الشريط الأزرق.
Also verifies WhatsApp diagnostic reasons are set when WA not connected / no phones."""
import os
import sys
import pytest
from unittest.mock import AsyncMock, patch, MagicMock

# اجعل backend importable
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))


@pytest.mark.asyncio
async def test_email_html_contains_logo_below_blue_bar():
    """يتحقق أن قالب البريد يحتوي على شعار Maestro EGP كصورة base64
    وأن الشعار موضوع بعد <h2> (الشريط الأزرق) قبل محتوى الرسالة."""
    from server import _get_maestro_logo_b64, notify_owner_multichannel

    # تحميل الشعار مباشرة
    logo = _get_maestro_logo_b64()
    assert logo.startswith("data:image/png;base64,"), "الشعار يجب أن يكون data URL"
    assert len(logo) > 1000, "الشعار مفقود أو صغير جداً"

    # حاكِ send_system_email لالتقاط HTML المُرسَل
    captured_html = {}

    async def fake_send_email(to_emails, subject, html_content, purpose="system", tenant_id=None):
        captured_html["html"] = html_content
        captured_html["subject"] = subject
        return True

    # حاكِ إرسال البريد + الجرس + قاعدة البيانات
    with patch("server.send_system_email", side_effect=fake_send_email), \
         patch("server.db") as mock_db, \
         patch("server._wa_free") as mock_wa:
        # tenant.owner_email
        mock_db.tenants.find_one = AsyncMock(return_value={"owner_email": "owner@test.com"})
        # لا مستخدمين إضافيين
        async def _empty_cursor(*args, **kwargs):
            if False:
                yield {}
        mock_db.users.find = MagicMock(return_value=_empty_cursor())
        mock_db.notifications.insert_one = AsyncMock(return_value=None)
        mock_wa.is_connected = AsyncMock(return_value=False)

        result = await notify_owner_multichannel(
            title="📊 تقرير إغلاق وردية — مصطفى",
            message="👤 الكاشير: مصطفى\n💰 المبيعات: 539,875",
            severity="info",
            category="shift",
            send_whatsapp=True,
            send_email=True,
            tenant_id="default",
        )

    # تحقق: البريد أُرسل
    assert "html" in captured_html, "لم يُلتقط HTML البريد"
    html = captured_html["html"]

    # 1) الشعار موجود
    assert "data:image/png;base64," in html, "الشعار غير موجود في HTML"

    # 2) الشعار بعد <h2> (تحت الشريط الأزرق)
    idx_h2 = html.find("</h2></div>")
    idx_logo = html.find("data:image/png;base64,")
    assert idx_h2 > 0 and idx_logo > idx_h2, \
        "الشعار يجب أن يكون بعد الشريط الأزرق (</h2></div>)"

    # 3) الشعار قبل محتوى الرسالة (pre)
    idx_pre = html.find("<pre")
    assert idx_pre > idx_logo, "الشعار يجب أن يكون قبل محتوى الرسالة"

    # 4) تشخيص واتساب: لأن الاتصال False
    assert result.get("whatsapp") is False
    assert result.get("whatsapp_skip_reason") == "wa_not_connected"

    print("✅ الشعار يظهر تحت الشريط الأزرق في بريد التقرير")
    print(f"   HTML preview snippet: {html[html.find(chr(60)+'img'):html.find(chr(60)+'img')+120]}")


@pytest.mark.asyncio
async def test_wa_skip_reason_no_recipients():
    """تشخيص: عند اتصال الواتساب لكن بلا أرقام → skip_reason='no_recipients'."""
    from server import notify_owner_multichannel

    async def fake_send_email(to_emails, subject, html_content, purpose="system", tenant_id=None):
        return True

    with patch("server.send_system_email", side_effect=fake_send_email), \
         patch("server.db") as mock_db, \
         patch("server._wa_free") as mock_wa, \
         patch("server._phone_to_e164", new=AsyncMock(return_value=None)):
        mock_db.tenants.find_one = AsyncMock(return_value={})  # لا owner_phone
        async def _empty_cursor(*args, **kwargs):
            if False:
                yield {}
        mock_db.users.find = MagicMock(return_value=_empty_cursor())
        mock_db.notifications.insert_one = AsyncMock(return_value=None)
        mock_wa.is_connected = AsyncMock(return_value=True)  # الواتساب مربوط
        mock_wa.send_message = AsyncMock(return_value=(True, None))

        # env بلا هاتف
        with patch.dict(os.environ, {"OWNER_ALERT_PHONE": ""}):
            result = await notify_owner_multichannel(
                title="test",
                message="test",
                severity="info",
                category="shift",
                tenant_id="default",
            )

    assert result.get("whatsapp") is False
    assert result.get("whatsapp_skip_reason") == "no_recipients"
    print("✅ تشخيص no_recipients يعمل عند غياب الأرقام")
