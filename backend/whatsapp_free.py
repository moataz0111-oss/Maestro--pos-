"""جسر الاتصال بخدمة الواتساب المجاني (Baileys) عبر HTTP محلي.

يستخدمه الباك إند لإرسال رموز التحقق مجاناً من رقم المالك المرتبط،
ولعرض حالة الاتصال ورمز QR في لوحة المالك.
يسجّل كل محاولة إرسال في MongoDB (wa_messages) لعرضها في لوحة المالك.
"""
import os
import uuid
import httpx
import logging
from datetime import datetime, timezone

WA_URL = os.environ.get("WA_SERVICE_URL", "http://127.0.0.1:3002")
WA_TOKEN = os.environ.get("WA_SERVICE_TOKEN", "")
_HEADERS = {"x-wa-token": WA_TOKEN}

logger = logging.getLogger(__name__)


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


async def send_message(phone: str, message: str, purpose: str = "other", tenant_id=None, sent_by=None):
    """يرسل رسالة نصية عبر واتساب. يُرجع (ok: bool, error: str|None).
    
    يسجّل تلقائياً في wa_messages للعرض في لوحة المالك.
    - purpose: نوع الرسالة (otp, order_alert, forgotten_shift, test, other)
    - tenant_id: معرّف المستأجر (اختياري)
    - sent_by: معرّف المستخدم الذي أطلق الإرسال (اختياري)
    """
    ok, err = False, None
    try:
        async with httpx.AsyncClient(timeout=25) as c:
            r = await c.post(f"{WA_URL}/send", headers=_HEADERS,
                             json={"phone": phone, "message": message})
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


async def request_pairing_code(phone: str):
    """يطلب رمز ربط برقم الهاتف (بديل مسح QR). يُرجع dict فيه ok/code/error."""
    try:
        async with httpx.AsyncClient(timeout=30) as c:
            r = await c.post(f"{WA_URL}/pair", headers=_HEADERS, json={"phone": phone})
            return r.json()
    except Exception as e:
        return {"ok": False, "error": str(e)}
