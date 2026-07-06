"""جسر الاتصال بخدمة الواتساب المجاني (Baileys) عبر HTTP محلي.

يستخدمه الباك إند لإرسال رموز التحقق مجاناً من رقم المالك المرتبط،
ولعرض حالة الاتصال ورمز QR في لوحة المالك.
"""
import os
import httpx

WA_URL = os.environ.get("WA_SERVICE_URL", "http://127.0.0.1:3002")
WA_TOKEN = os.environ.get("WA_SERVICE_TOKEN", "")
_HEADERS = {"x-wa-token": WA_TOKEN}


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


async def send_message(phone: str, message: str):
    """يرسل رسالة نصية عبر واتساب. يُرجع (ok: bool, error: str|None)."""
    try:
        async with httpx.AsyncClient(timeout=25) as c:
            r = await c.post(f"{WA_URL}/send", headers=_HEADERS,
                             json={"phone": phone, "message": message})
            if r.status_code == 200 and r.json().get("ok"):
                return True, None
            try:
                err = r.json().get("error")
            except Exception:
                err = f"http_{r.status_code}"
            return False, err
    except Exception as e:
        return False, str(e)


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
