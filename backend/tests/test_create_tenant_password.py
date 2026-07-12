"""
Regression نهائي: عند إنشاء مستأجر جديد بكلمة مرور مدخَلة من الفورم،
يجب أن تُحفَظ حرفياً في password (hash) و password_vault (Fernet-encrypted).

المشكلة السابقة: TenantCreate model لم يحوِ حقل owner_password، فأسقطه Pydantic،
واستخدم الباك إند '{slug}123' افتراضياً — وبالتالي رسالة الترحيب كانت
تُرسل كلمة مرور لا يعرفها المشرف.
"""
import os, uuid, asyncio
import pytest
import requests

BASE = "http://localhost:8001/api"


def _trust_device(subject_id, device_id):
    from motor.motor_asyncio import AsyncIOMotorClient
    from datetime import datetime, timezone
    async def _do():
        c = AsyncIOMotorClient(os.environ["MONGO_URL"])
        db = c[os.environ["DB_NAME"]]
        now = datetime.now(timezone.utc).isoformat()
        await db.trusted_devices.update_one(
            {"subject_type": "user", "subject_id": subject_id, "device_id": device_id},
            {"$set": {"subject_type": "user", "subject_id": subject_id,
                      "device_id": device_id, "last_seen_at": now, "revoked": False},
             "$setOnInsert": {"id": str(uuid.uuid4()), "created_at": now}},
            upsert=True)
        c.close()
    asyncio.get_event_loop().run_until_complete(_do())


@pytest.fixture(scope="module")
def super_admin_token():
    from motor.motor_asyncio import AsyncIOMotorClient
    async def _get_id():
        c = AsyncIOMotorClient(os.environ["MONGO_URL"])
        u = await c[os.environ["DB_NAME"]].users.find_one({"role": "super_admin"}, {"id": 1})
        c.close()
        return u["id"] if u else None
    sa_id = asyncio.get_event_loop().run_until_complete(_get_id())
    _trust_device(sa_id, "sa-dev")
    r = requests.post(f"{BASE}/super-admin/login",
                      json={"email": "owner@maestroegp.com", "password": "owner123",
                            "secret_key": "271018", "device_id": "sa-dev"},
                      timeout=10)
    assert r.status_code == 200, r.text
    return r.json()["token"]


def test_create_tenant_honors_typed_owner_password(super_admin_token):
    """super_admin ينشئ tenant بكلمة مرور مُدخَلة → login بها ينجح + vault يطابقها بالضبط."""
    slug = f"pwtest{uuid.uuid4().hex[:6]}"
    typed = "MyRealPass!2026"

    r = requests.post(f"{BASE}/super-admin/tenants",
                      headers={"Authorization": f"Bearer {super_admin_token}"},
                      json={"name": f"Test {slug}", "slug": slug,
                            "owner_name": "مالك اختبار",
                            "owner_email": f"{slug}@test.com",
                            "owner_password": typed},
                      timeout=15)
    assert r.status_code == 200, r.text

    # وثّق الجهاز للمالك الجديد
    from motor.motor_asyncio import AsyncIOMotorClient
    async def _prep():
        c = AsyncIOMotorClient(os.environ["MONGO_URL"])
        u = await c[os.environ["DB_NAME"]].users.find_one({"email": f"{slug}@test.com"}, {"id": 1})
        c.close()
        return u["id"] if u else None
    owner_id = asyncio.get_event_loop().run_until_complete(_prep())
    assert owner_id, "المالك لم يُنشأ!"
    _trust_device(owner_id, "owner-dev")

    # ✅ Login بكلمة المرور المُدخَلة يجب أن ينجح
    login = requests.post(f"{BASE}/auth/login",
                          json={"email": f"{slug}@test.com", "password": typed, "device_id": "owner-dev"},
                          timeout=10)
    assert login.status_code == 200, f"لم يتم حفظ كلمة المرور المُدخَلة! {login.text}"
    assert "token" in login.json(), f"login returned 2FA challenge: {login.json()}"

    # ✅ vault decrypted يجب أن يطابق حرفياً
    import sys as _s; _s.path.insert(0, "/app/backend")
    from server import _get_password_vault
    async def _read():
        c = AsyncIOMotorClient(os.environ["MONGO_URL"])
        u = await c[os.environ["DB_NAME"]].users.find_one({"email": f"{slug}@test.com"}, {"_id": 0, "password_vault": 1})
        c.close()
        return u
    doc = asyncio.get_event_loop().run_until_complete(_read())
    dec = _get_password_vault().decrypt(doc["password_vault"].encode()).decode()
    assert dec == typed, f"vault يحوي '{dec}' والمتوقع '{typed}'"


def test_create_tenant_default_password_when_omitted(super_admin_token):
    """super_admin لم يُدخل كلمة مرور → يُستخدم `{slug}123` كافتراضية (سلوك قديم مُحافَظ عليه)."""
    slug = f"defpw{uuid.uuid4().hex[:6]}"
    r = requests.post(f"{BASE}/super-admin/tenants",
                      headers={"Authorization": f"Bearer {super_admin_token}"},
                      json={"name": f"Def {slug}", "slug": slug,
                            "owner_name": "مالك افتراضي",
                            "owner_email": f"{slug}@test.com"},
                      timeout=15)
    assert r.status_code == 200, r.text

    from motor.motor_asyncio import AsyncIOMotorClient
    async def _prep():
        c = AsyncIOMotorClient(os.environ["MONGO_URL"])
        u = await c[os.environ["DB_NAME"]].users.find_one({"email": f"{slug}@test.com"}, {"id": 1})
        c.close()
        return u["id"] if u else None
    owner_id = asyncio.get_event_loop().run_until_complete(_prep())
    _trust_device(owner_id, "def-dev")

    login = requests.post(f"{BASE}/auth/login",
                          json={"email": f"{slug}@test.com", "password": f"{slug}123", "device_id": "def-dev"},
                          timeout=10)
    assert login.status_code == 200, login.text
