"""
اختبار bug304: مزامنة ثنائية الاتجاه بين tenant document و admin user
========================================================================
- عند إنشاء تينانت جديد بـowner_phone: يُنقَل تلقائياً إلى admin.phone.
- عند تحديث تينانت (super admin) بـowner_phone/owner_name/owner_email:
  تنعكس على admin user.
- عند تعديل tenant admin هاتفه/بريده/اسمه: تنعكس على tenant document.
"""
import os, uuid, asyncio
from datetime import datetime, timezone
import pytest
import requests
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))

API = f"{os.environ.get('BACKEND_URL', 'http://localhost:8001')}/api"
MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "maestro_pos")


@pytest.fixture(scope="module")
def admin_login():
    r = requests.post(f"{API}/auth/login",
                      json={"email": "admin@maestroegp.com", "password": "admin123"}, timeout=15)
    return {"token": r.json()["token"], "user_id": r.json()["user"]["id"], "tenant_id": r.json()["user"].get("tenant_id", "default")}


def _clean():
    async def clean():
        c = AsyncIOMotorClient(MONGO_URL)
        db_ = c[DB_NAME]
        await db_.users.delete_many({"email": {"$regex": "^bug304-.*@bugtest\\.com$"}})
        await db_.tenants.delete_many({"slug": {"$regex": "^bug304"}})
    asyncio.get_event_loop().run_until_complete(clean())


def test_A_self_edit_syncs_to_tenant(admin_login):
    """A: tenant admin يعدّل هاتفه → tenant.owner_phone يُحدَّث تلقائياً."""
    _clean()
    new_phone = f"07700{uuid.uuid4().hex[:5]}"
    r = requests.put(f"{API}/users/{admin_login['user_id']}",
                     json={"phone": new_phone, "full_name": "المالك المُحدَّث"},
                     headers={"Authorization": f"Bearer {admin_login['token']}"}, timeout=15)
    assert r.status_code == 200, r.text
    
    # افحص أن tenant document تحدّث
    async def get_tenant():
        c = AsyncIOMotorClient(MONGO_URL)
        db_ = c[DB_NAME]
        return await db_.tenants.find_one({"id": admin_login["tenant_id"]}, {"_id": 0, "owner_phone": 1, "owner_name": 1})
    tn = asyncio.get_event_loop().run_until_complete(get_tenant())
    assert tn and tn.get("owner_phone") == new_phone, f"tenant.owner_phone لم يُحدَّث. حالياً: {tn}"
    assert tn.get("owner_name") == "المالك المُحدَّث"


def test_Z_teardown(admin_login):
    _clean()


if __name__ == "__main__":
    pytest.main([__file__, "-xvs"])
