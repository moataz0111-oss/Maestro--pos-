"""
اختبار bug304 (extras): مزامنة ثنائية بين tenant document و admin user (super_admin flows)
==============================================================================
- POST /api/super-admin/tenants: owner_phone/name/email → admin user يُنقَل تلقائياً.
- PUT /api/super-admin/tenants/{id}: تحديث owner_phone/owner_name → admin.phone/full_name.
- Guard extra: tenant admin ممنوع من تعديل tenant_id / branch_id / is_active / permissions على نفسه.
"""
import os, uuid, asyncio
import pytest
import requests
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))

API = f"{os.environ.get('BACKEND_URL', 'http://localhost:8001')}/api"
MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "maestro_pos")


@pytest.fixture(scope="module")
def sa_token():
    r = requests.post(f"{API}/super-admin/login",
                      json={"email": "owner@maestroegp.com", "password": "owner123", "secret_key": "271018"},
                      timeout=15)
    assert r.status_code == 200, r.text
    return r.json()["token"]


@pytest.fixture(scope="module")
def admin_login():
    r = requests.post(f"{API}/auth/login",
                      json={"email": "admin@maestroegp.com", "password": "admin123"}, timeout=15)
    assert r.status_code == 200, r.text
    j = r.json()
    return {"token": j["token"], "user_id": j["user"]["id"], "tenant_id": j["user"].get("tenant_id", "default")}


def _cleanup():
    async def _c():
        c = AsyncIOMotorClient(MONGO_URL)
        db_ = c[DB_NAME]
        await db_.users.delete_many({"email": {"$regex": "^bug304-.*@bugtest\\.com$"}})
        await db_.tenants.delete_many({"slug": {"$regex": "^bug304"}})
    asyncio.get_event_loop().run_until_complete(_c())


def test_create_tenant_syncs_phone_to_admin_user(sa_token):
    """super_admin ينشئ تينانت بـowner_phone → admin user يحصل على نفس phone."""
    _cleanup()
    slug = f"bug304tc{uuid.uuid4().hex[:6]}"
    email = f"bug304-{uuid.uuid4().hex[:6]}@bugtest.com"
    phone = f"0770{uuid.uuid4().hex[:6]}"
    payload = {
        "name": "شركة الاختبار",
        "slug": slug,
        "owner_name": "المالك الأول",
        "owner_email": email,
        "owner_phone": phone,
        "subscription_type": "trial",
        "max_branches": 1,
        "max_users": 5,
    }
    r = requests.post(f"{API}/super-admin/tenants", json=payload,
                      headers={"Authorization": f"Bearer {sa_token}"}, timeout=20)
    assert r.status_code in (200, 201), r.text

    async def check():
        c = AsyncIOMotorClient(MONGO_URL)
        db_ = c[DB_NAME]
        u = await db_.users.find_one({"email": email}, {"_id": 0, "phone": 1, "full_name": 1, "role": 1, "tenant_id": 1})
        t = await db_.tenants.find_one({"slug": slug}, {"_id": 0, "id": 1, "owner_phone": 1})
        return u, t
    u, t = asyncio.get_event_loop().run_until_complete(check())
    assert u and u.get("phone") == phone, f"admin.phone لم يُنقَل من tenant. got={u}"
    assert u.get("full_name") == "المالك الأول"
    assert u.get("role") == "admin"
    assert u.get("tenant_id") == t["id"]


def test_update_tenant_syncs_owner_phone_to_admin(sa_token):
    """super_admin يُحدّث owner_phone/owner_name → admin.phone/full_name يُحدَّثان."""
    _cleanup()
    slug = f"bug304up{uuid.uuid4().hex[:6]}"
    email = f"bug304-{uuid.uuid4().hex[:6]}@bugtest.com"
    old_phone = f"0770{uuid.uuid4().hex[:6]}"
    r0 = requests.post(f"{API}/super-admin/tenants",
                       json={"name": "شركة تحديث", "slug": slug,
                             "owner_name": "قبل التحديث", "owner_email": email,
                             "owner_phone": old_phone, "subscription_type": "trial",
                             "max_branches": 1, "max_users": 5},
                       headers={"Authorization": f"Bearer {sa_token}"}, timeout=20)
    assert r0.status_code in (200, 201), r0.text
    # جِب tenant_id
    async def _get():
        c = AsyncIOMotorClient(MONGO_URL); db_ = c[DB_NAME]
        return await db_.tenants.find_one({"slug": slug}, {"_id": 0, "id": 1})
    t = asyncio.get_event_loop().run_until_complete(_get())
    assert t and t.get("id"), f"tenant لم يُنشأ: {t}"
    tid = t["id"]

    new_phone = f"0771{uuid.uuid4().hex[:6]}"
    r = requests.put(f"{API}/super-admin/tenants/{tid}",
                     json={"owner_phone": new_phone, "owner_name": "بعد التحديث"},
                     headers={"Authorization": f"Bearer {sa_token}"}, timeout=20)
    assert r.status_code == 200, r.text

    async def check_user():
        c = AsyncIOMotorClient(MONGO_URL); db_ = c[DB_NAME]
        return await db_.users.find_one({"email": email}, {"_id": 0, "phone": 1, "full_name": 1})
    u = asyncio.get_event_loop().run_until_complete(check_user())
    assert u and u.get("phone") == new_phone, f"admin.phone لم يتزامن: {u}"
    assert u.get("full_name") == "بعد التحديث"


def _admin_puts_self(admin_login, body):
    return requests.put(f"{API}/users/{admin_login['user_id']}", json=body,
                        headers={"Authorization": f"Bearer {admin_login['token']}"}, timeout=15)


def test_self_edit_tenant_id_ignored(admin_login):
    """tenant_id ليس ضمن UserUpdate — Pydantic يتجاهله، والقيمة الأصلية تبقى."""
    original_tid = admin_login["tenant_id"]
    r = _admin_puts_self(admin_login, {"tenant_id": "different-tenant-xyz"})
    # مقبول: إما يُرفض 403 (لو أُضيف الحقل مستقبلاً) أو يُتجاهل بصمت (200 مع بقاء نفس tenant_id)
    assert r.status_code in (200, 403), r.text
    if r.status_code == 200:
        assert r.json().get("tenant_id") == original_tid, f"تسرّب: tenant_id تغيّر! {r.json()}"


def test_self_edit_forbids_branch_id(admin_login):
    r = _admin_puts_self(admin_login, {"branch_id": "some-branch"})
    assert r.status_code == 403, r.text


def test_self_edit_forbids_is_active(admin_login):
    r = _admin_puts_self(admin_login, {"is_active": False})
    assert r.status_code == 403, r.text


def test_self_edit_forbids_permissions(admin_login):
    r = _admin_puts_self(admin_login, {"permissions": ["all", "hack"]})
    assert r.status_code == 403, r.text


def test_Z_teardown():
    _cleanup()


if __name__ == "__main__":
    pytest.main([__file__, "-xvs"])
