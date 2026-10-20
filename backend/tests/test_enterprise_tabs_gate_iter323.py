# iter323: Enterprise-only features (dashboard / transfers log) gated by tenant.enterprise_enabled
import os, uuid, datetime
import pytest, requests, bcrypt
from pymongo import MongoClient

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
DEV = "e2e-tester-persistent"
TID = "TEST_iter323_nonent"
PW = "test1234"
USERS = {"admin": f"TEST_ne_admin_{TID}@x.com", "general_manager": f"TEST_ne_gm_{TID}@x.com",
         "enterprise_owner": f"TEST_ne_eo_{TID}@x.com"}

mdb = MongoClient(os.environ.get("MONGO_URL", "mongodb://localhost:27017"))[os.environ.get("DB_NAME", "maestro_pos")]


def login(email, pw):
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": pw, "device_id": DEV})
    assert r.status_code == 200, r.text
    d = r.json()
    tok = d.get("token") or d.get("access_token")
    assert tok, f"no token (2FA?) {d}"
    return {"Authorization": f"Bearer {tok}"}


@pytest.fixture(scope="module", autouse=True)
def temp_tenant():
    now = datetime.datetime.utcnow().isoformat()
    mdb.tenants.delete_many({"id": TID})
    mdb.users.delete_many({"tenant_id": TID})
    mdb.tenants.insert_one({"id": TID, "name": "TEST iter323 normal", "enterprise_enabled": False,
                            "is_active": True, "created_at": now, "max_projects": 1})
    h = bcrypt.hashpw(PW.encode(), bcrypt.gensalt()).decode()
    for role, email in USERS.items():
        mdb.users.insert_one({"id": str(uuid.uuid4()), "username": email, "email": email, "password": h,
                              "password_hash": h, "full_name": f"TEST {role}", "role": role,
                              "tenant_id": TID, "permissions": ["all"], "is_active": True, "created_at": now})
    yield
    mdb.users.delete_many({"tenant_id": TID})
    mdb.tenants.delete_many({"id": TID})
    mdb.trusted_devices.delete_many({"tenant_id": TID}) if "trusted_devices" in mdb.list_collection_names() else None


# Enterprise tenant admin -> allowed
class TestEnterpriseTenant:
    def test_config_me(self):
        h = login("admin@maestroegp.com", "admin123")
        r = requests.get(f"{BASE_URL}/api/enterprise-config/me", headers=h)
        assert r.status_code == 200 and r.json()["enterprise_enabled"] is True

    def test_dashboard_ok(self):
        h = login("admin@maestroegp.com", "admin123")
        r = requests.get(f"{BASE_URL}/api/enterprise/dashboard", headers=h)
        assert r.status_code == 200, r.text

    def test_inventory_log_ok(self):
        h = login("admin@maestroegp.com", "admin123")
        r = requests.get(f"{BASE_URL}/api/projects/inventory/log", headers=h)
        assert r.status_code == 200, r.text


# Non-enterprise tenant users -> blocked
@pytest.mark.parametrize("role", list(USERS.keys()))
class TestNonEnterpriseTenant:
    def test_config_me_false(self, role):
        h = login(USERS[role], PW)
        r = requests.get(f"{BASE_URL}/api/enterprise-config/me", headers=h)
        assert r.status_code == 200 and r.json()["enterprise_enabled"] is False

    def test_dashboard_403(self, role):
        h = login(USERS[role], PW)
        r = requests.get(f"{BASE_URL}/api/enterprise/dashboard", headers=h)
        assert r.status_code == 403, r.text

    def test_inventory_log_403(self, role):
        h = login(USERS[role], PW)
        r = requests.get(f"{BASE_URL}/api/projects/inventory/log", headers=h)
        assert r.status_code == 403, r.text
