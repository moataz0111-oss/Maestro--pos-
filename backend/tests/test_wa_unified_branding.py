"""Test: هوية Maestro EGP الموحّدة على الواتساب (شعار + قالب).
يتحقق أن:
- كل رسائل الواتساب تُرسَل بالشعار افتراضياً (with_logo=True)
- القالب الموحّد يحتوي header + separator + timestamp
- عند فشل send-media → يعود لـ send نصياً
- OTP وتقارير الوردية والتحقق كلها تستخدم نفس القالب
"""
import os
import sys
import pytest
from unittest.mock import AsyncMock, patch, MagicMock

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))


def test_branded_text_template_has_unified_header_and_footer():
    """القالب الموحّد يجب أن يحتوي على header + separator + footer + timestamp."""
    from whatsapp_free import _build_branded_text

    txt = _build_branded_text("طلب جديد #123", title="🔔 تنبيه طلب")
    assert "*🔔 Maestro EGP*" in txt, "الترويسة مفقودة"
    assert "━━━━━━━━━━━━━━━━━" in txt, "الفاصل مفقود"
    assert "*🔔 تنبيه طلب*" in txt, "العنوان مفقود"
    assert "طلب جديد #123" in txt, "المحتوى مفقود"
    assert "(بغداد)" in txt, "طابع الوقت مفقود"

    # بلا عنوان — يجب أن يعمل أيضاً
    txt2 = _build_branded_text("رمز التحقق: 123456")
    assert "*🔔 Maestro EGP*" in txt2
    assert "رمز التحقق: 123456" in txt2


def test_logo_b64_loads_successfully():
    """الشعار يجب أن يُحمَّل ويكون مقاس معقول."""
    from whatsapp_free import _get_logo_b64
    b64 = _get_logo_b64()
    assert b64, "الشعار فارغ"
    assert len(b64) > 5000, "الشعار صغير جداً — قد يكون تالفاً"
    assert len(b64) < 100000, "الشعار كبير جداً للواتساب (>100KB base64)"


@pytest.mark.asyncio
async def test_send_message_uses_media_with_logo_by_default():
    """كل استدعاء لـ send_message يجب أن يحاول إرسال /send-media أولاً (شعار + caption)."""
    from whatsapp_free import send_message

    captured = {"endpoint": None, "body": None}

    class _FakeResponse:
        status_code = 200
        def json(self): return {"ok": True}

    class _FakeClient:
        async def __aenter__(self): return self
        async def __aexit__(self, *a): return False
        async def post(self, url, headers=None, json=None):
            captured["endpoint"] = url
            captured["body"] = json
            return _FakeResponse()

    with patch("whatsapp_free.httpx.AsyncClient", return_value=_FakeClient()), \
         patch("whatsapp_free._log_message", new=AsyncMock(return_value=None)):
        ok, err = await send_message("+9647701234567", "تنبيه اختبار", title="تقرير")

    assert ok is True
    assert captured["endpoint"] and "/send-media" in captured["endpoint"], \
        f"يجب استدعاء /send-media افتراضياً، لكن استدُعي: {captured['endpoint']}"
    assert "image_b64" in (captured["body"] or {}), "image_b64 مفقود من body"
    assert "caption" in (captured["body"] or {}), "caption مفقود"
    caption = captured["body"]["caption"]
    assert "*🔔 Maestro EGP*" in caption, "القالب الموحّد غير مطبّق"
    assert "تنبيه اختبار" in caption
    assert "*تقرير*" in caption


@pytest.mark.asyncio
async def test_send_message_falls_back_to_text_when_media_not_supported():
    """إن كان wa_service قديماً (404 على /send-media) → يجب أن يعود لـ /send نصياً."""
    from whatsapp_free import send_message

    calls = []
    class _FakeResponse:
        def __init__(self, status, payload):
            self.status_code = status
            self._payload = payload
        def json(self): return self._payload

    class _FakeClient:
        async def __aenter__(self): return self
        async def __aexit__(self, *a): return False
        async def post(self, url, headers=None, json=None):
            calls.append(url)
            if "/send-media" in url:
                return _FakeResponse(404, {"ok": False, "error": "not_found"})
            return _FakeResponse(200, {"ok": True})

    with patch("whatsapp_free.httpx.AsyncClient", return_value=_FakeClient()), \
         patch("whatsapp_free._log_message", new=AsyncMock(return_value=None)):
        ok, err = await send_message("+9647701234567", "OTP: 123456", title="رمز تحقق")

    assert ok is True, f"يجب أن ينجح fallback إلى /send، err={err}"
    assert any("/send-media" in c for c in calls), "لم يحاول /send-media أولاً"
    assert any(c.endswith("/send") for c in calls), "لم يعد إلى /send كـ fallback"


@pytest.mark.asyncio
async def test_send_message_with_logo_false_skips_media():
    """with_logo=False → يذهب مباشرة إلى /send نصياً (بلا محاولة /send-media)."""
    from whatsapp_free import send_message

    calls = []
    class _FakeResponse:
        status_code = 200
        def json(self): return {"ok": True}

    class _FakeClient:
        async def __aenter__(self): return self
        async def __aexit__(self, *a): return False
        async def post(self, url, headers=None, json=None):
            calls.append(url)
            return _FakeResponse()

    with patch("whatsapp_free.httpx.AsyncClient", return_value=_FakeClient()), \
         patch("whatsapp_free._log_message", new=AsyncMock(return_value=None)):
        ok, err = await send_message("+9647701234567", "قصير", with_logo=False)

    assert ok is True
    assert all("/send-media" not in c for c in calls), "with_logo=False يجب ألا يستدعي /send-media"
    assert any(c.endswith("/send") for c in calls)
