# iter331: Retest drivers per project (routes/drivers_routes.py) + project_admin isolation (users/tables/drivers)
import os
import uuid
import pytest
import requests
from pymongo import MongoClient
from dotenv import load_dotenv

load_dotenv('/app/frontend/.env')
load_dotenv('/app/backend/.env')
BASE_URL = os.environ.get('REACT_APP_BACKEND_URL').rstrip('/')
API = f"{BASE_URL}/api"
mdb = MongoClient(os.environ['MONGO_URL'])[os.environ['DB_NAME']]

BURGER = "edc0531b-3fa3-4bb7-b942-d34d0ff6b745"
SHAWARMA = "75dfb28d-94d9-4d09-976f-be3a0f471aa1"
MAIN = "52aee398-394c-4d65-8eaa-59bab5ece916"
B_MANSOUR = "2e19e95f-9dd1-4895-becc-6abd549bb53f"
B_KARRADA = "e92ba1be-2c32-4fbd-aa65-96bff5834098"
S_JADRIYA = "ef8ab196-e638-4c76-8862-addb9930f493"
S_HURRIYA = "a05b3c1e-a7c8-4c66-89f7-f06bfa102901"
M_MAIN = "76f56acc-6948-4a2f-bbf4-feccbddea88f"
P = "TEST331_"


def _login(email, pw):
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": pw}, timeout=20)
    assert r.status_code == 200, r.text
    return r.json().get("token") or r.json().get("access_token")


def _d(resp):
    j = resp.json()
    return j.get("driver", j) if isinstance(j, dict) else j


@pytest.fixture(scope="module")
def admin_h():
    return {"Authorization": f"Bearer {_login('admin@maestroegp.com', 'admin123')}"}


@pytest.fixture(scope="module")
def pa_h():
    return {"Authorization": f"Bearer {_login('pmburger@test.com', 'Pm123456')}"}


@pytest.fixture(scope="module", autouse=True)
def cleanup():
    yield
    mdb.drivers.delete_many({"name": {"$regex": f"^{P}"}})
    mdb.users.delete_many({"email": {"$regex": "^test331_"}})
    mdb.tables.delete_many({"tenant_id": "default", "number": {"$gte": 33100, "$lt": 33200}})


def _names(h, **params):
    r = requests.get(f"{API}/drivers", params=params, headers=h)
    assert r.status_code == 200, r.text
    return {d["name"]: d for d in r.json()}


# ---------- Drivers (admin, all-projects view) ----------
class TestDriversAdmin:
    def test_create_all_view_derives_project(self, admin_h):
        r = requests.post(f"{API}/drivers", json={"name": P + "burger", "phone": "07701113310", "branch_id": B_KARRADA}, headers=admin_h)
        assert r.status_code == 200, r.text
        assert _d(r).get("project_id") == BURGER, r.json()
        assert mdb.drivers.find_one({"name": P + "burger"})["project_id"] == BURGER
        r2 = requests.post(f"{API}/drivers", json={"name": P + "shaw", "phone": "07702223310", "branch_id": S_JADRIYA}, headers=admin_h)
        assert r2.status_code == 200 and _d(r2).get("project_id") == SHAWARMA, r2.text

    def test_create_mismatch_400(self, admin_h):
        r = requests.post(f"{API}/drivers", json={"name": P + "bad", "phone": "0770333", "branch_id": B_KARRADA, "project_id": SHAWARMA}, headers=admin_h)
        assert r.status_code == 400, r.text
        assert not mdb.drivers.find_one({"name": P + "bad"})

    def test_create_header_mismatch_400(self, admin_h):
        r = requests.post(f"{API}/drivers", json={"name": P + "bad2", "phone": "0770334", "branch_id": B_KARRADA},
                          headers={**admin_h, "X-Project-Id": SHAWARMA})
        assert r.status_code == 400, r.text

    def test_get_filter_with_legacy(self, admin_h):
        mdb.drivers.insert_one({"id": str(uuid.uuid4()), "tenant_id": "default", "name": P + "legacy", "phone": "0770", "branch_id": B_MANSOUR, "project_id": None, "is_active": True})
        mdb.drivers.insert_one({"id": str(uuid.uuid4()), "tenant_id": "default", "name": P + "legacy_nofield", "phone": "0770", "branch_id": B_MANSOUR, "is_active": True})
        b = _names(admin_h, project_id=BURGER)
        assert P + "burger" in b and P + "legacy" in b and P + "legacy_nofield" in b
        assert P + "shaw" not in b
        assert b[P + "burger"].get("project_id") == BURGER  # response includes project_id
        s = _names(admin_h, project_id=SHAWARMA)
        assert P + "shaw" in s and P + "legacy" not in s and P + "burger" not in s
        a = _names(admin_h)
        assert {P + "burger", P + "shaw", P + "legacy"} <= set(a)

    def test_put_branch_other_project_mismatch_400(self, admin_h):
        d = mdb.drivers.find_one({"name": P + "burger"})
        r = requests.put(f"{API}/drivers/{d['id']}", json={"branch_id": S_JADRIYA, "project_id": BURGER}, headers=admin_h)
        assert r.status_code == 400, r.text
        after = mdb.drivers.find_one({"id": d["id"]})
        assert after["branch_id"] == B_KARRADA and after["project_id"] == BURGER

    def test_put_only_branch_syncs_project(self, admin_h):
        d = mdb.drivers.find_one({"name": P + "burger"})
        r = requests.put(f"{API}/drivers/{d['id']}", json={"branch_id": S_HURRIYA}, headers=admin_h)
        assert r.status_code == 200, r.text
        after = mdb.drivers.find_one({"id": d["id"]})
        assert after["branch_id"] == S_HURRIYA and after["project_id"] == SHAWARMA, after
        # move back
        r = requests.put(f"{API}/drivers/{d['id']}", json={"branch_id": B_KARRADA}, headers=admin_h)
        assert r.status_code == 200
        assert mdb.drivers.find_one({"id": d["id"]})["project_id"] == BURGER

    def test_delete_other_tenant_404(self, admin_h):
        other = mdb.tenants.find_one({"id": {"$ne": "default"}}, {"_id": 0, "id": 1})
        did = str(uuid.uuid4())
        mdb.drivers.insert_one({"id": did, "tenant_id": other["id"], "name": P + "othertenant", "phone": "0770"})
        r = requests.delete(f"{API}/drivers/{did}", headers=admin_h)
        assert r.status_code == 404, r.text
        assert mdb.drivers.find_one({"id": did})

    def test_delete_requires_manager(self, admin_h):
        rc = requests.post(f"{API}/users", json={"username": "test331cash", "email": "test331_cash@x.com", "password": "Aa123456!",
                                                  "full_name": "x", "role": "cashier", "branch_id": B_MANSOUR}, headers=admin_h)
        assert rc.status_code in (200, 201), rc.text
        ch = {"Authorization": f"Bearer {_login('test331_cash@x.com', 'Aa123456!')}"}
        d = mdb.drivers.find_one({"name": P + "legacy"})
        r = requests.delete(f"{API}/drivers/{d['id']}", headers=ch)
        assert r.status_code == 403, r.text
        assert mdb.drivers.find_one({"id": d["id"]})

    def test_admin_delete_ok(self, admin_h):
        d = mdb.drivers.find_one({"name": P + "legacy_nofield"})
        r = requests.delete(f"{API}/drivers/{d['id']}", headers=admin_h)
        assert r.status_code == 200, r.text
        assert not mdb.drivers.find_one({"id": d["id"]})


# ---------- Project admin ----------
class TestProjectAdmin:
    def test_pa_get_drivers_only_own(self, pa_h):
        mdb.drivers.insert_one({"id": str(uuid.uuid4()), "tenant_id": "default", "name": P + "legacy_shaw", "phone": "0770", "branch_id": S_JADRIYA, "project_id": None})
        n = _names(pa_h, project_id=SHAWARMA)
        assert P + "burger" in n and P + "legacy" in n
        assert P + "shaw" not in n and P + "legacy_shaw" not in n
        assert all(d.get("project_id") in (BURGER, None) for d in n.values())
        assert all((d.get("project_id") == BURGER) or d.get("branch_id") in (B_MANSOUR, B_KARRADA) for d in n.values()), \
            [(k, v.get("project_id"), v.get("branch_id")) for k, v in n.items()]

    def test_pa_put_delete_other_project_driver_404(self, pa_h):
        for nm in (P + "shaw", P + "legacy_shaw"):
            d = mdb.drivers.find_one({"name": nm})
            r = requests.put(f"{API}/drivers/{d['id']}", json={"name": "hack"}, headers=pa_h)
            assert r.status_code == 404, f"{nm} PUT {r.status_code} {r.text}"
            r = requests.delete(f"{API}/drivers/{d['id']}", headers=pa_h)
            assert r.status_code == 404, f"{nm} DELETE {r.status_code} {r.text}"
            assert mdb.drivers.find_one({"id": d["id"]})["name"] == nm

    def test_pa_create_driver_forced_project(self, pa_h):
        r = requests.post(f"{API}/drivers", json={"name": P + "pa_drv", "phone": "07705553310", "branch_id": B_MANSOUR},
                          headers={**pa_h, "X-Project-Id": SHAWARMA})
        assert r.status_code == 200, r.text
        assert mdb.drivers.find_one({"name": P + "pa_drv"})["project_id"] == BURGER
        r = requests.post(f"{API}/drivers", json={"name": P + "pa_bad", "phone": "07705553311", "branch_id": S_JADRIYA}, headers=pa_h)
        assert r.status_code == 400, r.text

    def test_pa_create_cashier_forced_project(self, pa_h):
        r = requests.post(f"{API}/users", json={"username": "test331pa1", "email": "test331_pa1@x.com", "password": "Aa123456!",
                                                 "full_name": "x", "role": "cashier", "project_id": SHAWARMA, "branch_id": B_MANSOUR}, headers=pa_h)
        assert r.status_code in (200, 201), r.text
        u = mdb.users.find_one({"email": "test331_pa1@x.com"})
        assert u["project_id"] == BURGER and u["branch_id"] == B_MANSOUR

    def test_pa_create_cashier_other_branch_400(self, pa_h):
        r = requests.post(f"{API}/users", json={"username": "test331pa2", "email": "test331_pa2@x.com", "password": "Aa123456!",
                                                 "full_name": "x", "role": "cashier", "branch_id": S_JADRIYA}, headers=pa_h)
        assert r.status_code == 400, r.text

    @pytest.mark.parametrize("role", ["admin", "general_manager", "project_admin"])
    def test_pa_create_high_roles_403(self, pa_h, role):
        r = requests.post(f"{API}/users", json={"username": f"test331{role}", "email": f"test331_{role}@x.com", "password": "Aa123456!",
                                                 "full_name": "x", "role": role}, headers=pa_h)
        assert r.status_code == 403, r.text
        assert not mdb.users.find_one({"email": f"test331_{role}@x.com"})

    def test_pa_update_user_other_branch_400(self, pa_h):
        u = mdb.users.find_one({"email": "test331_pa1@x.com"})
        r = requests.put(f"{API}/users/{u['id']}", json={"branch_id": S_JADRIYA}, headers=pa_h)
        assert r.status_code == 400, r.text
        after = mdb.users.find_one({"id": u["id"]})
        assert after["project_id"] == BURGER and after["branch_id"] == B_MANSOUR
        r = requests.put(f"{API}/users/{u['id']}", json={"branch_id": B_KARRADA}, headers=pa_h)
        assert r.status_code == 200, r.text
        assert mdb.users.find_one({"id": u["id"]})["branch_id"] == B_KARRADA

    def test_pa_table_status_other_project_404(self, admin_h, pa_h):
        r = requests.post(f"{API}/tables", json={"number": 33101, "capacity": 2, "branch_id": S_JADRIYA}, headers=admin_h)
        assert r.status_code == 200, r.text
        tid = r.json()["id"]
        r = requests.put(f"{API}/tables/{tid}/status", params={"status": "occupied"}, headers=pa_h)
        assert r.status_code == 404, r.text
        assert mdb.tables.find_one({"id": tid})["status"] != "occupied"
        r2 = requests.post(f"{API}/tables", json={"number": 33102, "capacity": 2, "branch_id": B_MANSOUR}, headers=admin_h)
        tid2 = r2.json()["id"]
        r = requests.put(f"{API}/tables/{tid2}/status", params={"status": "occupied"}, headers=pa_h)
        assert r.status_code == 200, r.text
        assert mdb.tables.find_one({"id": tid2})["status"] == "occupied"


# ---------- Regression: tables per project ----------
class TestTablesRegression:
    def test_tables_filter(self, admin_h):
        b = [t["number"] for t in requests.get(f"{API}/tables", headers={**admin_h, "X-Project-Id": BURGER}).json()]
        s = [t["number"] for t in requests.get(f"{API}/tables", headers={**admin_h, "X-Project-Id": SHAWARMA}).json()]
        assert 33102 in b and 33101 not in b
        assert 33101 in s and 33102 not in s
        r = requests.post(f"{API}/tables", json={"number": 33103, "capacity": 4, "branch_id": B_MANSOUR, "project_id": SHAWARMA}, headers=admin_h)
        assert r.status_code == 400
