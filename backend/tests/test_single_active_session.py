"""
Regression tests — جلسة نشطة واحدة لكل مستخدم
=================================================
القاعدة (طلب المالك):
- كل الحسابات = جهاز واحد فقط. الدخول الثاني يُبطل التوكن الأول → 401 مع رسالة
  عربية "تم تسجيل الدخول من جهاز آخر — تم إنهاء هذه الجلسة".
- الاستثناء: مالك المشروع (admin) ومالك النظام (super_admin) — بلا قيد.

يعتمد على الباك إند المُشغّل عبر supervisor على http://localhost:8001.
Note: عند تفعيل 2FA، الاختبارات توثّق أجهزتها مسبقاً في trusted_devices حتى لا
تحتاج لتحدي OTP (وهي بيئة اختبار مغلقة، لا SMS متاح).
"""
import os
import sys
import asyncio
import pytest
import requests

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

BASE = "http://localhost:8001/api"


async def _trust_devices_async(subject_type, subject_id, device_ids):
    from motor.motor_asyncio import AsyncIOMotorClient
    from datetime import datetime, timezone
    import uuid as _uuid
    client = AsyncIOMotorClient(os.environ["MONGO_URL"])
    db = client[os.environ["DB_NAME"]]
    now = datetime.now(timezone.utc).isoformat()
    for did in device_ids:
        await db.trusted_devices.update_one(
            {"subject_type": subject_type, "subject_id": str(subject_id), "device_id": did},
            {"$set": {"subject_type": subject_type, "subject_id": str(subject_id),
                      "device_id": did, "last_seen_at": now, "revoked": False},
             "$setOnInsert": {"id": str(_uuid.uuid4()), "created_at": now}},
            upsert=True,
        )
    client.close()


def _trust_devices(subject_type, subject_id, device_ids):
    asyncio.get_event_loop().run_until_complete(_trust_devices_async(subject_type, subject_id, device_ids))


def _users_ensure_password(admin_token, user_id, password):
    r = requests.put(f"{BASE}/users/{user_id}/reset-password",
                     headers={"Authorization": f"Bearer {admin_token}"},
                     json={"new_password": password}, timeout=10)
    assert r.status_code == 200, r.text


@pytest.fixture(scope="module")
def admin_token():
    # وثّق جهاز pytest-admin أولاً لتخطّي 2FA
    import asyncio
    from motor.motor_asyncio import AsyncIOMotorClient
    async def _prep():
        c = AsyncIOMotorClient(os.environ["MONGO_URL"])
        u = await c[os.environ["DB_NAME"]].users.find_one({"email": "admin@maestroegp.com"}, {"id": 1})
        c.close()
        return u["id"] if u else None
    admin_id = asyncio.get_event_loop().run_until_complete(_prep())
    if admin_id:
        _trust_devices("user", admin_id, ["pytest-admin"])
    r = requests.post(f"{BASE}/auth/login",
                      json={"email": "admin@maestroegp.com", "password": "admin123", "device_id": "pytest-admin"},
                      timeout=10)
    assert r.status_code == 200, r.text
    body = r.json()
    assert "token" in body, f"admin token missing (2FA?): {body}"
    return body["token"]


@pytest.fixture(scope="module")
def cashier_creds(admin_token):
    """يجد أول مستخدم غير admin/super_admin ويعيد له كلمة مرور معروفة + يوثّق أجهزته."""
    r = requests.get(f"{BASE}/users", headers={"Authorization": f"Bearer {admin_token}"}, timeout=10)
    users = r.json()
    candidate = next(u for u in users if u.get("role") not in ("admin", "super_admin") and u.get("email"))
    pw = "PytestPass2026!"
    _users_ensure_password(admin_token, candidate["id"], pw)
    # وثّق كل الأجهزة التي سنستخدمها
    _trust_devices("user", candidate["id"], ["dev-C1", "dev-C2", "dev-D1", "dev-D2", "dev-D3"])
    return {"email": candidate["email"], "password": pw, "id": candidate["id"]}


def _login(email, password, device):
    r = requests.post(f"{BASE}/auth/login",
                      json={"email": email, "password": password, "device_id": device}, timeout=10)
    assert r.status_code == 200, f"login failed: {r.text}"
    body = r.json()
    assert "token" in body, f"login returned 2FA challenge (device not trusted?): {body}"
    return body["token"]


def _me(token):
    return requests.get(f"{BASE}/auth/me", headers={"Authorization": f"Bearer {token}"}, timeout=10)


def test_A_admin_owner_multiple_devices_allowed():
    """مالك المشروع (admin) — الدخول من عدة أجهزة مسموح، الجلسات القديمة تبقى صالحة."""
    _trust_devices("user", "d3896bff-b29f-4035-93b7-dd1765298e7d", ["dev-A1", "dev-A2"])
    t1 = _login("admin@maestroegp.com", "admin123", "dev-A1")
    t2 = _login("admin@maestroegp.com", "admin123", "dev-A2")
    assert _me(t1).status_code == 200, "مالك المشروع فقد جلسته الأولى!"
    assert _me(t2).status_code == 200


def test_B_super_admin_multiple_devices_allowed():
    """مالك النظام (super_admin) — نفس القاعدة، بلا قيد."""
    # ابحث عن super_admin id من DB ووثّق أجهزته
    import asyncio
    from motor.motor_asyncio import AsyncIOMotorClient
    async def _get_sa_id():
        c = AsyncIOMotorClient(os.environ["MONGO_URL"])
        u = await c[os.environ["DB_NAME"]].users.find_one({"role": "super_admin"}, {"id": 1})
        c.close()
        return u["id"] if u else None
    sa_id = asyncio.get_event_loop().run_until_complete(_get_sa_id())
    _trust_devices("user", sa_id, ["dev-SB1", "dev-SB2"])
    r1 = requests.post(f"{BASE}/super-admin/login",
                       json={"email": "owner@maestroegp.com", "password": "owner123",
                             "secret_key": "271018", "device_id": "dev-SB1"},
                       timeout=10)
    body1 = r1.json()
    assert "token" in body1, f"super-admin login didn't return token: {body1}"
    t1 = body1["token"]
    r2 = requests.post(f"{BASE}/super-admin/login",
                       json={"email": "owner@maestroegp.com", "password": "owner123",
                             "secret_key": "271018", "device_id": "dev-SB2"},
                       timeout=10)
    t2 = r2.json()["token"]
    assert _me(t1).status_code == 200
    assert _me(t2).status_code == 200


def test_C_employee_second_login_kicks_first(cashier_creds):
    """موظف (غير مالك) — الدخول الثاني يُبطل توكن الجهاز الأول."""
    t1 = _login(cashier_creds["email"], cashier_creds["password"], "dev-C1")
    assert _me(t1).status_code == 200

    t2 = _login(cashier_creds["email"], cashier_creds["password"], "dev-C2")

    r_old = _me(t1)
    assert r_old.status_code == 401, f"expected 401 got {r_old.status_code}"
    assert "جهاز آخر" in r_old.json().get("detail", ""), r_old.text

    assert _me(t2).status_code == 200


def test_D_employee_third_login_kicks_second(cashier_creds):
    """السلوك متعدٍّ: الدخول الثالث يُبطل الثاني."""
    t1 = _login(cashier_creds["email"], cashier_creds["password"], "dev-D1")
    t2 = _login(cashier_creds["email"], cashier_creds["password"], "dev-D2")
    t3 = _login(cashier_creds["email"], cashier_creds["password"], "dev-D3")
    assert _me(t1).status_code == 401
    assert _me(t2).status_code == 401
    assert _me(t3).status_code == 200
