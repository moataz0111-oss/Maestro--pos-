"""
Regression: قواعد صلاحيات تعديل المستخدمين
================================================
طلب المالك:
- admin (مالك المشروع): يعدّل الجميع + نفسه + admin آخر.
- manager (مدير عام): يعدّل الجميع + نفسه، إلا admin.
- أي دور أدنى: لا يعدّل أحداً غير نفسه.
"""
import os
import pytest
import requests

BASE = "http://localhost:8001/api"


def _trust_device(subject_id, device_id):
    """يوثّق جهازاً في trusted_devices ليتخطّى 2FA."""
    import asyncio
    from motor.motor_asyncio import AsyncIOMotorClient
    from datetime import datetime, timezone
    import uuid as _uuid
    async def _do():
        c = AsyncIOMotorClient(os.environ["MONGO_URL"])
        db = c[os.environ["DB_NAME"]]
        now = datetime.now(timezone.utc).isoformat()
        await db.trusted_devices.update_one(
            {"subject_type": "user", "subject_id": subject_id, "device_id": device_id},
            {"$set": {"subject_type": "user", "subject_id": subject_id,
                      "device_id": device_id, "last_seen_at": now, "revoked": False},
             "$setOnInsert": {"id": str(_uuid.uuid4()), "created_at": now}},
            upsert=True,
        )
        c.close()
    asyncio.get_event_loop().run_until_complete(_do())


def _seed_user(user_id, email, password, role):
    """ينشئ/يُحدّث مستخدم اختبار."""
    import asyncio
    from motor.motor_asyncio import AsyncIOMotorClient
    from passlib.hash import bcrypt
    async def _do():
        c = AsyncIOMotorClient(os.environ["MONGO_URL"])
        db = c[os.environ["DB_NAME"]]
        await db.users.update_one(
            {"id": user_id},
            {"$set": {
                "id": user_id, "username": f"u_{user_id}",
                "email": email, "full_name": f"اختبار {role}",
                "role": role, "tenant_id": "default",
                "password": bcrypt.hash(password),
                "is_active": True, "permissions": [],
            }}, upsert=True)
        c.close()
    asyncio.get_event_loop().run_until_complete(_do())


def _login(email, password, device_id):
    r = requests.post(f"{BASE}/auth/login",
                      json={"email": email, "password": password, "device_id": device_id},
                      timeout=10)
    assert r.status_code == 200, r.text
    body = r.json()
    assert "token" in body, f"login returned 2FA challenge: {body}"
    return body["token"]


@pytest.fixture(scope="module", autouse=True)
def _setup():
    # A مالك مشروع
    _seed_user("hier-admin-A", "hier_admin_a@test.com", "AdminA123!", "admin")
    # B مالك مشروع ثانٍ (لاختبار admin ↔ admin)
    _seed_user("hier-admin-B", "hier_admin_b@test.com", "AdminB123!", "admin")
    # C مدير عام
    _seed_user("hier-mgr-C", "hier_mgr_c@test.com", "MgrC123!", "manager")
    # D كاشير عادي
    _seed_user("hier-cash-D", "hier_cash_d@test.com", "CashD123!", "cashier")

    for uid, dev in [("hier-admin-A", "dev-A"), ("hier-admin-B", "dev-B"),
                     ("hier-mgr-C", "dev-C"), ("hier-cash-D", "dev-D")]:
        _trust_device(uid, dev)
    yield
    # تنظيف
    import asyncio
    from motor.motor_asyncio import AsyncIOMotorClient
    async def _clean():
        c = AsyncIOMotorClient(os.environ["MONGO_URL"])
        db = c[os.environ["DB_NAME"]]
        await db.users.delete_many({"id": {"$in": ["hier-admin-A", "hier-admin-B", "hier-mgr-C", "hier-cash-D"]}})
        c.close()
    asyncio.get_event_loop().run_until_complete(_clean())


def _put(token, target_id, payload):
    return requests.put(f"{BASE}/users/{target_id}",
                        headers={"Authorization": f"Bearer {token}"},
                        json=payload, timeout=10)


def test_admin_can_edit_another_admin():
    """مالك المشروع يعدّل مالك مشروع آخر — يجب أن ينجح."""
    tok = _login("hier_admin_a@test.com", "AdminA123!", "dev-A")
    r = _put(tok, "hier-admin-B", {"phone": "07811111111"})
    assert r.status_code == 200, r.text


def test_admin_can_edit_manager():
    """مالك المشروع يعدّل المدير العام — يجب أن ينجح."""
    tok = _login("hier_admin_a@test.com", "AdminA123!", "dev-A")
    r = _put(tok, "hier-mgr-C", {"phone": "07822222222"})
    assert r.status_code == 200, r.text


def test_admin_can_edit_self():
    """مالك المشروع يعدّل نفسه — يجب أن ينجح."""
    tok = _login("hier_admin_a@test.com", "AdminA123!", "dev-A")
    r = _put(tok, "hier-admin-A", {"phone": "07833333333"})
    assert r.status_code == 200, r.text


def test_admin_can_edit_cashier():
    """مالك المشروع يعدّل الكاشير — يجب أن ينجح."""
    tok = _login("hier_admin_a@test.com", "AdminA123!", "dev-A")
    r = _put(tok, "hier-cash-D", {"phone": "07844444444"})
    assert r.status_code == 200, r.text


def test_manager_cannot_edit_admin():
    """المدير العام يحاول تعديل مالك المشروع — يجب 403."""
    tok = _login("hier_mgr_c@test.com", "MgrC123!", "dev-C")
    r = _put(tok, "hier-admin-A", {"phone": "07855555555"})
    assert r.status_code == 403, r.text
    assert "مالك المشروع" in r.json().get("detail", "") or "غير مصرح" in r.json().get("detail", ""), r.text


def test_manager_can_edit_self():
    """المدير العام يعدّل نفسه — يجب أن ينجح."""
    tok = _login("hier_mgr_c@test.com", "MgrC123!", "dev-C")
    r = _put(tok, "hier-mgr-C", {"phone": "07866666666"})
    assert r.status_code == 200, r.text


def test_manager_can_edit_cashier():
    """المدير العام يعدّل كاشير — يجب أن ينجح."""
    tok = _login("hier_mgr_c@test.com", "MgrC123!", "dev-C")
    r = _put(tok, "hier-cash-D", {"phone": "07877777777"})
    assert r.status_code == 200, r.text


def test_manager_cannot_promote_to_admin():
    """المدير العام يحاول ترقية كاشير إلى admin — يجب 403."""
    tok = _login("hier_mgr_c@test.com", "MgrC123!", "dev-C")
    r = _put(tok, "hier-cash-D", {"role": "admin"})
    assert r.status_code == 403, r.text


def test_cashier_cannot_edit_others():
    """الكاشير يحاول تعديل مستخدم آخر — يجب 403."""
    tok = _login("hier_cash_d@test.com", "CashD123!", "dev-D")
    r = _put(tok, "hier-mgr-C", {"phone": "07888888888"})
    assert r.status_code == 403, r.text
