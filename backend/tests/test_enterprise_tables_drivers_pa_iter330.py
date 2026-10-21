# iter330: Enterprise tables/drivers per project + project_admin (pmburger) isolation + non-enterprise regression
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
B_MANSOUR = "2e19e95f-9dd1-4895-becc-6abd549bb53f"
B_KARRADA = "e92ba1be-2c32-4fbd-aa65-96bff5834098"
S_JADRIYA = "ef8ab196-e638-4c76-8862-addb9930f493"
OWNER_ADMIN_ID = "d3896bff-b29f-4035-93b7-dd1765298e7d"
PREFIX = "TEST330_"


def _login(email, pw):
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": pw}, timeout=20)
    assert r.status_code == 200, r.text
    return r.json().get("token") or r.json().get("access_token")


@pytest.fixture(scope="module")
def admin_h():
    return {"Authorization": f"Bearer {_login('admin@maestroegp.com', 'admin123')}"}


@pytest.fixture(scope="module")
def pa_h():
    return {"Authorization": f"Bearer {_login('pmburger@test.com', 'Pm123456')}"}


@pytest.fixture(scope="module", autouse=True)
def cleanup():
    yield
    mdb.tables.delete_many({"tenant_id": "default", "number": {"$gte": 33000, "$lt": 34000}})
    mdb.drivers.delete_many({"name": {"$regex": f"^{PREFIX}"}})
    mdb.printers.delete_many({"name": {"$regex": f"^{PREFIX}"}})
    mdb.users.delete_many({"email": {"$regex": "^test330_"}})


# ---------- Tables ----------
class TestTables:
    def test_create_tables_and_filter(self, admin_h):
        r1 = requests.post(f"{API}/tables", json={"number": 33001, "capacity": 4, "branch_id": B_MANSOUR, "section": "داخلي"},
                           headers={**admin_h, "X-Project-Id": BURGER})
        assert r1.status_code == 200, r1.text
        assert r1.json()["project_id"] == BURGER
        r2 = requests.post(f"{API}/tables", json={"number": 33002, "capacity": 2, "branch_id": S_JADRIYA, "section": "خارجي"},
                           headers=admin_h)  # all projects view -> derived from branch
        assert r2.status_code == 200, r2.text
        assert r2.json()["project_id"] == SHAWARMA
        g = requests.get(f"{API}/tables", headers={**admin_h, "X-Project-Id": BURGER}).json()
        nums = [t["number"] for t in g]
        assert 33001 in nums and 33002 not in nums
        assert all(t["branch_id"] in (B_MANSOUR, B_KARRADA) or t.get("project_id") == BURGER for t in g)
        allt = [t["number"] for t in requests.get(f"{API}/tables", headers=admin_h).json()]
        assert 33001 in allt and 33002 in allt

    def test_create_table_project_mismatch_400(self, admin_h):
        r = requests.post(f"{API}/tables", json={"number": 33003, "capacity": 4, "branch_id": B_MANSOUR, "project_id": SHAWARMA},
                          headers=admin_h)
        assert r.status_code == 400, r.text

    def test_pa_put_other_project_table_404(self, pa_h):
        t = mdb.tables.find_one({"number": 33002, "tenant_id": "default"})
        r = requests.put(f"{API}/tables/{t['id']}", json={"number": 33002, "capacity": 9, "branch_id": S_JADRIYA}, headers=pa_h)
        assert r.status_code == 404, r.text
        assert mdb.tables.find_one({"id": t["id"]})["capacity"] == 2

    def test_pa_get_tables_only_own(self, pa_h):
        g = requests.get(f"{API}/tables", headers={**pa_h, "X-Project-Id": SHAWARMA}).json()
        nums = [t["number"] for t in g]
        assert 33002 not in nums and 33001 in nums


# ---------- Drivers ----------
class TestDrivers:
    def test_create_driver_and_filter(self, admin_h):
        r = requests.post(f"{API}/drivers", json={"name": PREFIX + "burger", "phone": "07701111330", "branch_id": B_KARRADA},
                          headers=admin_h)
        assert r.status_code == 200, r.text
        assert r.json().get("driver", r.json())["project_id"] == BURGER, r.json()
        r2 = requests.post(f"{API}/drivers", json={"name": PREFIX + "shaw", "phone": "07702222330", "branch_id": S_JADRIYA},
                           headers=admin_h)
        assert r2.json().get("driver", r2.json())["project_id"] == SHAWARMA, r2.json()
        names = [d["name"] for d in requests.get(f"{API}/drivers", params={"project_id": BURGER}, headers=admin_h).json()]
        assert PREFIX + "burger" in names and PREFIX + "shaw" not in names

    def test_driver_legacy_no_project_by_branch(self, admin_h):
        did = str(uuid.uuid4())
        mdb.drivers.insert_one({"id": did, "tenant_id": "default", "name": PREFIX + "legacy", "phone": "0770", "branch_id": B_MANSOUR, "project_id": None})
        names = [d["name"] for d in requests.get(f"{API}/drivers", params={"project_id": BURGER}, headers=admin_h).json()]
        assert PREFIX + "legacy" in names
        names2 = [d["name"] for d in requests.get(f"{API}/drivers", params={"project_id": SHAWARMA}, headers=admin_h).json()]
        assert PREFIX + "legacy" not in names2

    def test_put_driver_mismatch_400(self, admin_h):
        d = mdb.drivers.find_one({"name": PREFIX + "burger"})
        r = requests.put(f"{API}/drivers/{d['id']}", json={"branch_id": S_JADRIYA, "project_id": BURGER}, headers=admin_h)
        assert r.status_code == 400, r.text

    def test_pa_drivers(self, pa_h):
        names = [d["name"] for d in requests.get(f"{API}/drivers", params={"project_id": SHAWARMA}, headers=pa_h).json()]
        assert PREFIX + "shaw" not in names
        d = mdb.drivers.find_one({"name": PREFIX + "shaw"}) or mdb.drivers.find_one({"project_id": SHAWARMA})
        if not d:
            did = str(uuid.uuid4()); mdb.drivers.insert_one({"id": did, "tenant_id": "default", "name": PREFIX + "shaw2", "phone": "0770", "branch_id": S_JADRIYA, "project_id": SHAWARMA}); d = {"id": did}
        r = requests.put(f"{API}/drivers/{d['id']}", json={"name": "hack"}, headers=pa_h)
        assert r.status_code == 404, r.text


# ---------- Project admin ----------
class TestProjectAdmin:
    def test_me(self, pa_h):
        me = requests.get(f"{API}/auth/me", headers=pa_h).json()
        assert me["role"] == "project_admin" and me["project_id"] == BURGER

    def test_users_scoped(self, pa_h):
        us = requests.get(f"{API}/users", headers=pa_h).json()
        assert isinstance(us, list) and len(us) > 0
        assert all(u.get("project_id") == BURGER for u in us), [(u.get("email"), u.get("project_id")) for u in us]

    def test_projects_scoped(self, pa_h):
        ps = requests.get(f"{API}/projects", headers=pa_h).json()
        ps = ps if isinstance(ps, list) else ps.get("projects", [])
        assert [p["id"] for p in ps] == [BURGER]

    def test_payment_settings(self, pa_h):
        r = requests.get(f"{API}/payment-settings", headers={**pa_h, "X-Project-Id": SHAWARMA})
        assert r.status_code == 200, r.text
        assert r.json().get("project_id") == BURGER

    def test_create_admin_403(self, pa_h):
        r = requests.post(f"{API}/users", json={"username": "test330a", "email": "test330_a@x.com", "password": "Aa123456!",
                                                 "full_name": "x", "role": "admin"}, headers=pa_h)
        assert r.status_code == 403, r.text

    def test_create_user_forced_project(self, pa_h):
        r = requests.post(f"{API}/users", json={"username": "test330b", "email": "test330_b@x.com", "password": "Aa123456!",
                                                 "full_name": "x", "role": "cashier", "project_id": SHAWARMA}, headers=pa_h)
        assert r.status_code in (200, 201), r.text
        assert mdb.users.find_one({"email": "test330_b@x.com"})["project_id"] == BURGER

    def test_pa_move_user_to_other_project_branch(self, admin_h, pa_h):
        # security: PA must not move his user into another project's branch
        rc = requests.post(f"{API}/users", json={"username": "test330c", "email": "test330_c@x.com", "password": "Aa123456!",
                                                  "full_name": "x", "role": "cashier", "branch_id": B_MANSOUR, "project_id": BURGER}, headers=admin_h)
        assert rc.status_code in (200, 201), rc.text
        u = mdb.users.find_one({"email": "test330_c@x.com"})
        r = requests.put(f"{API}/users/{u['id']}", json={"branch_id": S_JADRIYA}, headers=pa_h)
        after = mdb.users.find_one({"email": "test330_c@x.com"})
        assert after.get("project_id") == BURGER and after.get("branch_id") != S_JADRIYA, f"status={r.status_code} after={after.get('project_id')},{after.get('branch_id')}"

    def test_owner_admin_put_delete_404(self, pa_h):
        r = requests.put(f"{API}/users/{OWNER_ADMIN_ID}", json={"full_name": "hack"}, headers=pa_h)
        assert r.status_code == 404, r.text
        r = requests.delete(f"{API}/users/{OWNER_ADMIN_ID}", headers=pa_h)
        assert r.status_code in (403, 404), r.text

    def test_printer_other_project_404(self, admin_h, pa_h):
        r = requests.post(f"{API}/printers", json={"name": PREFIX + "pr", "ip_address": "192.168.1.50", "branch_id": S_JADRIYA, "project_id": SHAWARMA},
                          headers=admin_h)
        assert r.status_code == 200, r.text
        pid = r.json()["id"]
        r = requests.put(f"{API}/printers/{pid}", json={"name": "hack", "ip_address": "1.1.1.1"}, headers=pa_h)
        assert r.status_code == 404, r.text
        r = requests.delete(f"{API}/printers/{pid}", headers=pa_h)
        assert r.status_code == 404, r.text
        assert mdb.printers.find_one({"id": pid})["name"] == PREFIX + "pr"
