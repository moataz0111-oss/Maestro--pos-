"""Test: هوية Maestro EGP موحّدة في كل رسائل النظام (بريد + واتساب).

يتحقق أن كل نقطة إرسال بريد داخل server.py و routes/*.py تمر عبر
build_branded_email_html أو أن HTML الناتج يحتوي على الشعار والقالب الموحّد.
"""
import os
import sys
import pytest
from unittest.mock import AsyncMock, patch, MagicMock

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))


def test_build_branded_email_html_has_logo_below_blue_bar():
    """قالب البريد الموحّد: عنوان + شعار تحت الشريط الأزرق + محتوى + تذييل."""
    from server import build_branded_email_html
    html = build_branded_email_html(
        title="اختبار",
        body_html="<p>مرحباً</p>",
        severity="info",
    )
    assert "data:image/png;base64," in html, "الشعار مفقود"
    idx_h2 = html.find("</h2></div>")
    idx_logo = html.find("data:image/png;base64,")
    idx_body = html.find("<p>مرحباً</p>")
    assert idx_h2 > 0 and idx_logo > idx_h2 > 0, "الشعار يجب أن يكون بعد الشريط الأزرق"
    assert idx_body > idx_logo > 0, "محتوى الجسم يجب أن يكون بعد الشعار"
    assert "Maestro EGP —" in html, "تذييل النظام مفقود"


def test_branded_email_severity_variants():
    """يجب أن يدعم القالب info/warning/critical/success بألوان مختلفة."""
    from server import build_branded_email_html
    for sev, color in [("info", "#3B82F6"), ("warning", "#F59E0B"),
                        ("critical", "#EF4444"), ("success", "#10B981")]:
        html = build_branded_email_html(title="X", body_html="Y", severity=sev)
        assert color in html, f"اللون {color} مفقود لـ severity={sev}"


@pytest.mark.asyncio
async def test_send_welcome_email_uses_branded_template():
    """بريد الترحيب للعميل الجديد يجب أن يستخدم قالب Maestro EGP الموحّد."""
    from server import send_welcome_email

    captured = {}
    async def _fake_send(to_emails, subject, html_content, purpose="system", tenant_id=None):
        captured["html"] = html_content
        captured["subject"] = subject
        captured["purpose"] = purpose
        return True

    with patch("server.send_system_email", side_effect=_fake_send), \
         patch("server.email_transport_configured", new=AsyncMock(return_value=True)):
        await send_welcome_email(
            recipient_email="test@x.com",
            tenant_name="مطعم تجريبي",
            owner_name="أحمد",
            username="admin",
            password="Pass123!",
        )

    assert "html" in captured, "لم يُرسَل بريد"
    html = captured["html"]
    assert "data:image/png;base64," in html, "الشعار الموحّد مفقود في بريد الترحيب"
    assert "مرحباً" in html
    assert "مطعم تجريبي" in html
    assert captured.get("purpose") == "welcome"


@pytest.mark.asyncio
async def test_send_shift_report_email_uses_branded_template():
    """تقرير إغلاق الوردية على البريد يجب أن يستخدم القالب الموحّد."""
    from server import send_shift_report_email

    captured = {}
    async def _fake_send(to_emails, subject, html_content, purpose="system", tenant_id=None):
        captured["html"] = html_content
        captured["purpose"] = purpose
        return True

    with patch("server.send_system_email", side_effect=_fake_send), \
         patch("server.email_transport_configured", new=AsyncMock(return_value=True)):
        await send_shift_report_email(
            shift_data={
                "cashier_name": "مصطفى", "total_sales": 500000,
                "total_expenses": 20000, "closing_cash": 480000,
                "expected_cash": 480000, "cash_difference": 0,
                "net_profit": 100000, "total_orders": 42,
            },
            recipient_emails=["owner@test.com"],
        )

    assert "html" in captured
    html = captured["html"]
    assert "data:image/png;base64," in html, "الشعار مفقود في تقرير الوردية"
    assert "مصطفى" in html
    assert "500,000" in html
    assert captured.get("purpose") == "shift_report"
