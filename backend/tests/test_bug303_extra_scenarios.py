"""
اختبارات إضافية لـbug303 — تغطية سيناريوهات لم يغطها الملف الأصلي:
G: DELETE /api/users/{self_id} → 400 (bug fix current_user['id'])
H: manager ممنوع من منح دور admin عبر PUT
I: manager ممنوع من إنشاء admin عبر POST
J: manager لا يستطيع حذف admin آخر (فقط admin يقدر)
K: tenant admin ممنوع من تعديل حساب super_admin (403)
L: super_admin لا يزال يستطيع إنشاء/تعديل admin عادي
"""
import os, asyncio
import pytest
import requests
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))

BACKEND_URL = os.environ.get("BACKEND_URL", "http://localhost:8001")
API = f"{BACKEND_URL}/api"
MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "maestro_pos")


def _clean():
    async def clean():
        c = AsyncIOMotorClient(MONGO_URL)
        db_ = c[DB_NAME]
        await db_.users.delete_many({"email": {"$regex": "^bug303x-.*@bugtest\\.com$"}})
    asyncio.get_event_loop().run_until_complete(clean())


@pytest.fixture(scope="module")
def admin_session():
    r = requests.post(f"{API}/auth/login",
                      json={"email": "admin@maestroegp.com", "password": "admin123"}, timeout=15)
    j = r.json()
    return j["token"], j["user"]["id"]


@pytest.fixture(scope="module")
def super_admin_token():
    r = requests.post(f"{API}/auth/login",
                      json={"email": "owner@maestroegp.com", "password": "owner123",
                            "secret_key": "271018"}, timeout=15)
    return r.json()["token"]


@pytest.fixture(scope="module")
def super_admin_id():
    r = requests.post(f"{API}/auth/login",
                      json={"email": "owner@maestroegp.com", "password": "owner123",
                            "secret_key": "271018"}, timeout=15)
    return r.json()["user"]["id"]


@pytest.fixture(scope="module")
def manager_ctx(admin_session):
    """أنشئ manager داخل تينانت admin واسترجع (token, id)."""
    _clean()
    admin_token, _ = admin_session
    mgr_email = "bug303x-mgr@bugtest.com"
    r = requests.post(f"{API}/users",
                      json={
                          "username": "bug303x_mgr",
                          "email": mgr_email,
                          "password": "Test1234!",
                          "full_name": "المدير المحدود",
                          "role": "manager",
                      },
                      headers={"Authorization": f"Bearer {admin_token}"}, timeout=15)
    assert r.status_code == 200, r.text
    mgr_id = r.json()["id"]
    r2 = requests.post(f"{API}/auth/login",
                       json={"email": mgr_email, "password": "Test1234!"}, timeout=15)
    assert r2.status_code == 200, r2.text
    return r2.json()["token"], mgr_id


def test_G_admin_cannot_delete_self(admin_session):
    """DELETE على حساب المستخدم نفسه يجب أن يُرجع 400 (bug fix)."""
    _clean()
    token, uid = admin_session
    r = requests.delete(f"{API}/users/{uid}",
                        headers={"Authorization": f"Bearer {token}"}, timeout=15)
    assert r.status_code == 400, f"expected 400, got {r.status_code}: {r.text}"
    assert "حسابك" in r.json().get("detail", "")


def test_H_manager_cannot_grant_admin_role(admin_session, manager_ctx):
    """Manager يحاول ترقية cashier → admin: يجب 403."""
    admin_token, _ = admin_session
    mgr_token, _ = manager_ctx
    # admin ينشئ cashier
    r0 = requests.post(f"{API}/users",
                       json={
                           "username": "bug303x_cashier",
                           "email": "bug303x-cashier@bugtest.com",
                           "password": "Test1234!",
                           "full_name": "Cashier X",
                           "role": "cashier",
                       },
                       headers={"Authorization": f"Bearer {admin_token}"}, timeout=15)
    assert r0.status_code == 200, r0.text
    cid = r0.json()["id"]
    # manager يحاول الترقية
    r = requests.put(f"{API}/users/{cid}",
                     json={"role": "admin"},
                     headers={"Authorization": f"Bearer {mgr_token}"}, timeout=15)
    assert r.status_code == 403, r.text
    # iter304: الرسالة قد تكون "المدير محدود..." أو "غير مصرح بمنح دور مالك المشروع"
    detail = r.json().get("detail", "")
    assert any(k in detail for k in ("المدير", "محدود", "مالك المشروع", "غير مصرح"))


def test_I_manager_cannot_create_admin(manager_ctx):
    """Manager يحاول POST /users role=admin: يجب 403."""
    mgr_token, _ = manager_ctx
    r = requests.post(f"{API}/users",
                      json={
                          "username": "bug303x_newadmin",
                          "email": "bug303x-newadmin@bugtest.com",
                          "password": "Test1234!",
                          "full_name": "Manager Attempts Admin",
                          "role": "admin",
                      },
                      headers={"Authorization": f"Bearer {mgr_token}"}, timeout=15)
    # قد يرجع 403 لأن create_user يشترط ADMIN/SUPER_ADMIN فقط أصلاً
    assert r.status_code == 403, r.text


def test_J_manager_cannot_delete_admin(admin_session, manager_ctx):
    """Manager يحاول حذف حساب admin: يجب 403.
    iter304: admin لم يعد يقدر ينشئ admin، لذا نضع co-admin مباشرة عبر DB.
    """
    import uuid as _uuid
    from datetime import datetime as _dt, timezone as _tz
    from motor.motor_asyncio import AsyncIOMotorClient as _M
    _admin_token, _ = admin_session
    mgr_token, _ = manager_ctx

    async def _seed():
        c = _M(MONGO_URL); db_ = c[DB_NAME]
        uid = str(_uuid.uuid4())
        await db_.users.insert_one({
            "id": uid,
            "username": "bug303x_coadmin2",
            "email": "bug303x-coadmin2@bugtest.com",
            "password_hash": "dummy",
            "full_name": "Co Admin 2",
            "role": "admin",
            "tenant_id": "default",
            "is_active": True,
            "created_at": _dt.now(_tz.utc).isoformat(),
        })
        return uid
    coid = asyncio.get_event_loop().run_until_complete(_seed())
    # manager يحاول حذفه
    r = requests.delete(f"{API}/users/{coid}",
                        headers={"Authorization": f"Bearer {mgr_token}"}, timeout=15)
    assert r.status_code == 403, r.text


def test_K_tenant_admin_cannot_edit_super_admin(admin_session, super_admin_id):
    """Admin يحاول تعديل حساب super_admin: يجب 403."""
    admin_token, _ = admin_session
    # super_admin في تينانت 'system' — قد يُرجع 404 (tenant filter) بدل 403
    # الاختبار الحقيقي: التأكد أن admin لا يستطيع تعديل super_admin
    r = requests.put(f"{API}/users/{super_admin_id}",
                     json={"phone": "0000000000"},
                     headers={"Authorization": f"Bearer {admin_token}"}, timeout=15)
    assert r.status_code in (403, 404), f"expected 403/404, got {r.status_code}: {r.text}"


def test_L_super_admin_can_create_and_edit_normal_admin(super_admin_token):
    """Super_admin ما زال يستطيع إنشاء/تعديل admin عادي (regression)."""
    _clean()
    r = requests.post(f"{API}/users",
                     json={
                         "username": "bug303x_sa_admin",
                         "email": "bug303x-saadmin@bugtest.com",
                         "password": "Test1234!",
                         "full_name": "SA Created Admin",
                         "role": "admin",
                     },
                     headers={"Authorization": f"Bearer {super_admin_token}"}, timeout=15)
    assert r.status_code == 200, r.text
    uid = r.json()["id"]
    r2 = requests.put(f"{API}/users/{uid}",
                     json={"phone": "0999888777"},
                     headers={"Authorization": f"Bearer {super_admin_token}"}, timeout=15)
    assert r2.status_code == 200, r2.text
    assert r2.json()["phone"] == "0999888777"


def test_Z_final_teardown():
    _clean()


if __name__ == "__main__":
    pytest.main([__file__, "-xvs"])
