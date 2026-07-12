"""
Regression: عند تحديث كلمة مرور المستخدم عبر PUT /api/users/{id} مع حقل password:
1. تُحدَّث الـ hash فعلياً — تسجيل الدخول بكلمة المرور الجديدة يعمل.
2. يُحدَّث password_vault بنفس الكلمة — زر «إرسال بيانات الدخول» يُرسل كلمة المرور الصحيحة الحالية.

كانت هذه المشكلة: UserUpdate model كان لا يحوي حقل password، فيُسقطه Pydantic،
فتبقى الكلمة القديمة تعمل ويبقى الـ vault قديم — يخدع رسالة الترحيب.
"""
import pytest
import requests
from cryptography.fernet import Fernet
import os
import sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

BASE = "http://localhost:8001/api"


@pytest.fixture(scope="module")
def admin_token():
    # وثّق جهاز admin مسبقاً لتخطّي 2FA (لأن admin مستخدم موجود في DB)
    import asyncio
    from motor.motor_asyncio import AsyncIOMotorClient
    from datetime import datetime, timezone
    import uuid as _uuid
    async def _trust():
        client = AsyncIOMotorClient(os.environ["MONGO_URL"])
        db = client[os.environ["DB_NAME"]]
        u = await db.users.find_one({"email": "admin@maestroegp.com"}, {"id": 1})
        if u:
            now = datetime.now(timezone.utc).isoformat()
            await db.trusted_devices.update_one(
                {"subject_type": "user", "subject_id": str(u["id"]), "device_id": "vault-test"},
                {"$set": {"subject_type": "user", "subject_id": str(u["id"]),
                          "device_id": "vault-test", "last_seen_at": now, "revoked": False},
                 "$setOnInsert": {"id": str(_uuid.uuid4()), "created_at": now}},
                upsert=True,
            )
        client.close()
    asyncio.get_event_loop().run_until_complete(_trust())

    r = requests.post(f"{BASE}/auth/login",
                      json={"email": "admin@maestroegp.com", "password": "admin123", "device_id": "vault-test"},
                      timeout=10)
    assert r.status_code == 200
    return r.json()["token"]


@pytest.fixture(scope="module")
def target_user(admin_token):
    users = requests.get(f"{BASE}/users", headers={"Authorization": f"Bearer {admin_token}"}, timeout=10).json()
    candidate = next(u for u in users if u.get("role") not in ("admin", "super_admin") and u.get("email"))
    # وثّق جهاز vault-verify للـ target حتى يتخطّى 2FA
    import asyncio
    from motor.motor_asyncio import AsyncIOMotorClient
    from datetime import datetime, timezone
    import uuid as _uuid
    async def _trust():
        client = AsyncIOMotorClient(os.environ["MONGO_URL"])
        db = client[os.environ["DB_NAME"]]
        now = datetime.now(timezone.utc).isoformat()
        await db.trusted_devices.update_one(
            {"subject_type": "user", "subject_id": str(candidate["id"]), "device_id": "vault-verify"},
            {"$set": {"subject_type": "user", "subject_id": str(candidate["id"]),
                      "device_id": "vault-verify", "last_seen_at": now, "revoked": False},
             "$setOnInsert": {"id": str(_uuid.uuid4()), "created_at": now}},
            upsert=True,
        )
        client.close()
    asyncio.get_event_loop().run_until_complete(_trust())
    return candidate


def test_update_user_password_field_updates_hash_and_vault(admin_token, target_user):
    new_pw = "VaultRegression2026!"
    # 1) تحديث عبر PUT مع حقل password
    r = requests.put(f"{BASE}/users/{target_user['id']}",
                     headers={"Authorization": f"Bearer {admin_token}"},
                     json={"password": new_pw}, timeout=10)
    assert r.status_code == 200, r.text
    # يجب أن يعود password_vault ضمن الحقول (وإن لم يعُد، الاختبار التالي سيكشف)

    # 2) تسجيل الدخول بكلمة المرور الجديدة يجب أن ينجح
    login = requests.post(f"{BASE}/auth/login",
                          json={"email": target_user["email"], "password": new_pw, "device_id": "vault-verify"},
                          timeout=10)
    assert login.status_code == 200, f"password hash was NOT updated! login failed: {login.text}"

    # 3) نقرأ المستخدم مباشرة من الـ DB لنفكّ تشفير الـ vault ونتأكد أنه يطابق كلمة المرور الجديدة
    from server import _get_password_vault
    from motor.motor_asyncio import AsyncIOMotorClient
    import asyncio
    async def _read():
        client = AsyncIOMotorClient(os.environ["MONGO_URL"])
        db = client[os.environ["DB_NAME"]]
        u = await db.users.find_one({"id": target_user["id"]}, {"_id": 0, "password_vault": 1})
        client.close()
        return u
    doc = asyncio.get_event_loop().run_until_complete(_read())
    assert doc.get("password_vault"), "password_vault لم يُحدَّث!"

    cipher = _get_password_vault()
    decrypted = cipher.decrypt(doc["password_vault"].encode()).decode()
    assert decrypted == new_pw, f"vault يحتوي كلمة مرور خاطئة: '{decrypted}' vs المتوقع '{new_pw}'"
