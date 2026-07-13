"""جسر الاتصال بخدمة الواتساب المجاني (Baileys) عبر HTTP محلي.

يستخدمه الباك إند لإرسال رموز التحقق مجاناً من رقم المالك المرتبط،
ولعرض حالة الاتصال ورمز QR في لوحة المالك.
يسجّل كل محاولة إرسال في MongoDB (wa_messages) لعرضها في لوحة المالك.
"""
import os
import re
import uuid
import httpx
import logging
from datetime import datetime, timezone

WA_URL = os.environ.get("WA_SERVICE_URL", "http://127.0.0.1:3002")
WA_TOKEN = os.environ.get("WA_SERVICE_TOKEN", "")
_HEADERS = {"x-wa-token": WA_TOKEN}

logger = logging.getLogger(__name__)


# 🛡️ حماية: منع إرسال واتساب/OTP لأي رقم تجريبي/وهمي معروف
# هذه الأنماط تُطابق أرقام seed القديمة والاختبارات التي تركت آثاراً.
_DUMMY_PHONE_PATTERNS = [
    # صيغة محلية: 0780XXXXXXX حيث XXXX تجريبي معروف
    re.compile(r'^0780(0000|1111|2222|3333|4444|5555|6666|7777|8888|9999)\d{3}$'),
    # صيغة دولية: +964780XXXXXXX أو 964780XXXXXXX
    re.compile(r'^\+?964780(0000|1111|2222|3333|4444|5555|6666|7777|8888|9999)\d{3}$'),
    # صيغة أخرى شائعة في الاختبارات: 07801234567, 07809876543
    re.compile(r'^0780(1234567|9876543)$'),
    # معرفات ديمو نصية
    re.compile(r'demo[-_]?drv', re.IGNORECASE),
    re.compile(r'^test|^dummy|^fake', re.IGNORECASE),
    # صيغة بلا كود دولة (E.164 مقطوع)
    re.compile(r'^780(0000|1111|2222|3333|4444|5555|6666|7777|8888|9999)\d{3}$'),
]


def is_dummy_phone(phone: str) -> bool:
    """يتحقق هل الرقم تجريبي/وهمي — يمنع إرسال رسائل عليه."""
    if not phone:
        return True
    p = str(phone).strip()
    for pat in _DUMMY_PHONE_PATTERNS:
        if pat.search(p):
            return True
    return False


async def _log_message(phone: str, message: str, purpose: str, ok: bool, error, tenant_id=None, sent_by=None):
    """يسجّل محاولة إرسال واتساب في MongoDB لعرضها في لوحة المالك (سجل الرسائل)."""
    try:
        # الاستيراد التأخّري لتفادي حلقة الاستيراد مع server.py
        from motor.motor_asyncio import AsyncIOMotorClient
        _mongo_url = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
        _db_name = os.environ.get("DB_NAME", "maestro_pos")
        client = AsyncIOMotorClient(_mongo_url)
        db = client[_db_name]
        # نخزّن أول 200 حرف فقط من الرسالة لتفادي تسريب OTP كامل في السجل
        preview = (message or "")[:200]
        doc = {
            "id": str(uuid.uuid4()),
            "phone": phone or "",
            "message_preview": preview,
            "message_length": len(message or ""),
            "purpose": purpose or "other",
            "status": "sent" if ok else "failed",
            "error": (str(error)[:300] if error else None),
            "sent_at": datetime.now(timezone.utc).isoformat(),
            "sent_by": sent_by,
            "tenant_id": tenant_id,
        }
        await db.wa_messages.insert_one(doc)
    except Exception as _e:
        logger.warning(f"wa_messages log failed: {_e}")


async def status() -> dict:
    try:
        async with httpx.AsyncClient(timeout=8) as c:
            r = await c.get(f"{WA_URL}/status", headers=_HEADERS)
            return r.json()
    except Exception as e:
        return {"connected": False, "qr": None, "error": f"service_unreachable: {e}"}


async def is_connected() -> bool:
    st = await status()
    return bool(st.get("connected"))


async def send_message(phone: str, message: str, purpose: str = "other", tenant_id=None, sent_by=None,
                        with_logo: bool = True, title: str | None = None):
    """يرسل رسالة واتساب بهوية Maestro EGP الموحّدة (شعار + قالب).

    - with_logo=True (افتراضياً): يُرسل صورة الشعار مع الرسالة كـ caption.
    - إن فشل إرسال الوسائط أو الواتساب لا يدعمه: يعود تلقائياً لنص فقط.
    - يسجّل تلقائياً في wa_messages.
    """
    # 🛡️ رفض الأرقام التجريبية/الوهمية قبل الإرسال
    if is_dummy_phone(phone):
        logger.warning(f"⛔ blocked send to dummy phone: {phone} (purpose={purpose})")
        await _log_message(phone, message, purpose, ok=False,
                            error="dummy_phone_blocked", tenant_id=tenant_id, sent_by=sent_by)
        return False, "dummy_phone_blocked"
    
    ok, err = False, None
    # 1) القالب الموحّد: header + separator + content + footer
    branded_text = _build_branded_text(message, title=title)
    try:
        async with httpx.AsyncClient(timeout=30) as c:
            if with_logo:
                logo_b64 = _get_logo_b64()
                if logo_b64:
                    try:
                        r = await c.post(
                            f"{WA_URL}/send-media", headers=_HEADERS,
                            json={"phone": phone, "caption": branded_text, "image_b64": logo_b64},
                        )
                        if r.status_code == 200 and r.json().get("ok"):
                            ok, err = True, None
                        elif r.status_code in (404, 400):
                            # wa_service قديم لا يدعم /send-media → fallback نص
                            with_logo = False
                        else:
                            try:
                                err = r.json().get("error") or f"http_{r.status_code}"
                            except Exception:
                                err = f"http_{r.status_code}"
                    except Exception as _me:
                        # فشل إرسال الوسائط — fallback نص
                        logger.warning(f"wa send-media failed, falling back to text: {_me}")
                        with_logo = False
                else:
                    with_logo = False
            if not ok and not with_logo:
                # fallback: رسالة نصية بالقالب الموحّد
                r = await c.post(f"{WA_URL}/send", headers=_HEADERS,
                                 json={"phone": phone, "message": branded_text})
                if r.status_code == 200 and r.json().get("ok"):
                    ok, err = True, None
                else:
                    try:
                        err = r.json().get("error") or f"http_{r.status_code}"
                    except Exception:
                        err = f"http_{r.status_code}"
                    ok = False
    except Exception as e:
        ok, err = False, str(e)
    # سجّل المحاولة بصمت — الفشل في التسجيل لا يمنع إرجاع النتيجة الفعلية
    await _log_message(phone, message, purpose, ok, err, tenant_id=tenant_id, sent_by=sent_by)
    return ok, err


# ==================== الشعار والقالب الموحّد ====================
_LOGO_B64_CACHE: str | None = None


def _get_logo_b64() -> str:
    """يقرأ شعار Maestro EGP كـ base64 (مرة واحدة) للإرسال عبر واتساب."""
    global _LOGO_B64_CACHE
    if _LOGO_B64_CACHE is not None:
        return _LOGO_B64_CACHE
    try:
        _here = os.path.dirname(os.path.abspath(__file__))
        # نسخة الواتساب أصغر (128×128) لتظهر بحجم مقارب لشعار البريد
        _p = os.path.join(_here, "static", "branding", "maestro-logo-wa.b64")
        with open(_p, "r", encoding="utf-8") as f:
            _LOGO_B64_CACHE = f.read().strip()
    except Exception as _e:
        logger.warning(f"whatsapp logo load failed: {_e}")
        _LOGO_B64_CACHE = ""
    return _LOGO_B64_CACHE


def _build_branded_text(message: str, title: str | None = None) -> str:
    """يبني نص موحّد للواتساب بهوية Maestro EGP.

    القالب:
      *🔔 Maestro EGP*
      ━━━━━━━━━━━━━━━━━
      {title إن وُجد}

      {content}
      ━━━━━━━━━━━━━━━━━
      _2026-XX-XX HH:MM_
    """
    from datetime import datetime, timezone, timedelta
    _iraq_tz = timezone(timedelta(hours=3))
    _now = datetime.now(_iraq_tz).strftime("%Y-%m-%d %H:%M")
    parts = ["*🔔 Maestro EGP*", "━━━━━━━━━━━━━━━━━"]
    if title:
        parts.append(f"*{title}*")
        parts.append("")
    parts.append(message or "")
    parts.append("━━━━━━━━━━━━━━━━━")
    parts.append(f"_{_now} (بغداد)_")
    return "\n".join(parts)


async def logout():
    try:
        async with httpx.AsyncClient(timeout=15) as c:
            r = await c.post(f"{WA_URL}/logout", headers=_HEADERS)
            return r.json()
    except Exception as e:
        return {"ok": False, "error": str(e)}


async def reconnect():
    try:
        async with httpx.AsyncClient(timeout=15) as c:
            r = await c.post(f"{WA_URL}/reconnect", headers=_HEADERS)
            return r.json()
    except Exception as e:
        return {"ok": False, "error": str(e)}


async def request_pairing_code(phone: str, force: bool = False):
    """يطلب رمز ربط برقم الهاتف (بديل مسح QR). يُرجع dict فيه ok/code/error.
    force=True يُصفّر الجلسة قبل الطلب (يفيد إن كانت الجلسة تالفة)."""
    try:
        async with httpx.AsyncClient(timeout=45) as c:
            r = await c.post(f"{WA_URL}/pair", headers=_HEADERS, json={"phone": phone, "force": bool(force)})
            return r.json()
    except Exception as e:
        return {"ok": False, "error": str(e)}


async def reset_session():
    """يُصفّر جلسة الواتساب (auth dir) ويعيد التشغيل — يُستخدم إن علِقت الجلسة."""
    try:
        async with httpx.AsyncClient(timeout=15) as c:
            r = await c.post(f"{WA_URL}/reset", headers=_HEADERS)
            return r.json()
    except Exception as e:
        return {"ok": False, "error": str(e)}
