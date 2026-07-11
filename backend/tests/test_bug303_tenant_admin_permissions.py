"""
اختبار bug303 (v2): صلاحيات tenant admin — المُصحّحة حسب طلب المالك
======================================================================
السياسة الصحيحة:
- tenant admin يعدّل نفسه (phone, email, name, password) — لكنه لا يقدر يغيّر role/permissions/branch على حسابه.
- tenant admin يعدّل/يحذف مستخدميه الذين ليسوا admin (كاشير/مدير/مطبخ/…).
- tenant admin ممنوع من: تعديل/حذف حساب admin آخر أو نفسه (كحذف).
- فقط super_admin يستطيع إنشاء/تعديل/حذف حسابات admin.
- كل ما سبق داخل حدود التينانت.
"""
import os, uuid, asyncio
from datetime import datetime, timezone
import pytest
import requests
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))

BACKEND_URL = os.environ.get("BACKEND_URL", "http://localhost:8001")
API = f"{BACKEND_URL}/api"
MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "maestro_pos")


@pytest.fixture(scope="module")
def admin_login():
    r = requests.post(f"{API}/auth/login",
                      json={"email": "admin@maestroegp.com", "password": "admin123"}, timeout=15)
    return {"token": r.json()["token"], "user_id": r.json()["user"]["id"]}


def _clean():
    async def clean():
        c = AsyncIOMotorClient(MONGO_URL)
        db_ = c[DB_NAME]
        await db_.users.delete_many({"email": {"$regex": "^bug303v2-.*@bugtest\\.com$"}})
    asyncio.get_event_loop().run_until_complete(clean())


def test_A_self_edit_phone_ok(admin_login):
    """A: tenant admin يعدّل هاتف نفسه."""
    _clean()
    r = requests.put(f"{API}/users/{admin_login['user_id']}",
                     json={"phone": "0770123456"},
                     headers={"Authorization": f"Bearer {admin_login['token']}"}, timeout=15)
    assert r.status_code == 200, r.text
    assert r.json()["phone"] == "0770123456"


def test_B_self_cannot_change_own_role(admin_login):
    """B: tenant admin لا يستطيع تغيير دور نفسه (منعاً للاختراق)."""
    _clean()
    r = requests.put(f"{API}/users/{admin_login['user_id']}",
                     json={"role": "cashier"},
                     headers={"Authorization": f"Bearer {admin_login['token']}"}, timeout=15)
    assert r.status_code == 403


def test_C_cannot_create_admin(admin_login):
    """C: tenant admin ممنوع من إنشاء حساب admin آخر — فقط super_admin يقدر."""
    _clean()
    r = requests.post(f"{API}/users",
                      json={"username": "bug303v2_coadmin",
                            "email": "bug303v2-coadmin@bugtest.com",
                            "password": "Test1234!", "full_name": "شريك",
                            "role": "admin"},
                      headers={"Authorization": f"Bearer {admin_login['token']}"}, timeout=15)
    assert r.status_code == 403


def test_D_can_create_cashier(admin_login):
    """D: tenant admin يقدر يُنشئ كاشير (دور أدنى)."""
    _clean()
    r = requests.post(f"{API}/users",
                      json={"username": "bug303v2_cashier",
                            "email": "bug303v2-cashier@bugtest.com",
                            "password": "Test1234!", "full_name": "كاشير جديد",
                            "role": "cashier"},
                      headers={"Authorization": f"Bearer {admin_login['token']}"}, timeout=15)
    assert r.status_code == 200, r.text


def test_E_cannot_promote_to_admin(admin_login):
    """E: tenant admin ممنوع من ترقية كاشير إلى admin."""
    _clean()
    r1 = requests.post(f"{API}/users",
                       json={"username": "bug303v2_pmt",
                             "email": "bug303v2-pmt@bugtest.com",
                             "password": "Test1234!", "full_name": "المرشح",
                             "role": "cashier"},
                       headers={"Authorization": f"Bearer {admin_login['token']}"}, timeout=15)
    assert r1.status_code == 200
    uid = r1.json()["id"]
    r2 = requests.put(f"{API}/users/{uid}",
                      json={"role": "admin"},
                      headers={"Authorization": f"Bearer {admin_login['token']}"}, timeout=15)
    assert r2.status_code == 403


def test_F_can_edit_and_delete_cashier(admin_login):
    """F: tenant admin يقدر يعدّل ويحذف كاشير في تينانته."""
    _clean()
    r1 = requests.post(f"{API}/users",
                       json={"username": "bug303v2_cash2",
                             "email": "bug303v2-cash2@bugtest.com",
                             "password": "Test1234!", "full_name": "كاشير للحذف",
                             "role": "cashier"},
                       headers={"Authorization": f"Bearer {admin_login['token']}"}, timeout=15)
    uid = r1.json()["id"]
    r2 = requests.put(f"{API}/users/{uid}",
                      json={"phone": "0770555777"},
                      headers={"Authorization": f"Bearer {admin_login['token']}"}, timeout=15)
    assert r2.status_code == 200, r2.text
    r3 = requests.delete(f"{API}/users/{uid}",
                         headers={"Authorization": f"Bearer {admin_login['token']}"}, timeout=15)
    assert r3.status_code == 200, r3.text


def test_G_cannot_delete_self(admin_login):
    """G: tenant admin ممنوع من حذف نفسه (فقط super_admin يستطيع)."""
    _clean()
    r = requests.delete(f"{API}/users/{admin_login['user_id']}",
                        headers={"Authorization": f"Bearer {admin_login['token']}"}, timeout=15)
    assert r.status_code == 400


def test_H_cannot_delete_another_admin(admin_login):
    """H: tenant admin ممنوع من حذف admin آخر — يحتاج super_admin."""
    _clean()
    async def seed():
        c = AsyncIOMotorClient(MONGO_URL)
        db_ = c[DB_NAME]
        uid = str(uuid.uuid4())
        await db_.users.insert_one({
            "id": uid, "username": "bug303v2_admin2",
            "email": "bug303v2-admin2@bugtest.com",
            "password_hash": "dummy", "full_name": "Admin ثانٍ",
            "role": "admin", "tenant_id": "default",
            "is_active": True, "created_at": datetime.now(timezone.utc).isoformat(),
        })
        return uid
    uid = asyncio.get_event_loop().run_until_complete(seed())
    r = requests.delete(f"{API}/users/{uid}",
                        headers={"Authorization": f"Bearer {admin_login['token']}"}, timeout=15)
    assert r.status_code == 403


def test_Z_teardown(admin_login):
    _clean()


if __name__ == "__main__":
    pytest.main([__file__, "-xvs"])
