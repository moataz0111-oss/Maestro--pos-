# Iter327: Enterprise printers project restriction (create/update validation, list filter,
# agents-monitor project filter) + non-enterprise regression.
import os
import uuid
import bcrypt
import pytest
import requests
from datetime import datetime, timezone
from pymongo import MongoClient

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api"
P_MAIN = "52aee398-394c-4d65-8eaa-59bab5ece916"
P_BURGER = "edc0531b-3fa3-4bb7-b942-d34d0ff6b745"
P_SHAWARMA = "75dfb28d-94d9-4d09-976f-be3a0f471aa1"
BR_MAIN = "76f56acc-6948-4a2f-bbf4-feccbddea88f"
BR_BURGER = "2e19e95f-9dd1-4895-becc-6abd549bb53f"
BR_BURGER2 = "e92ba1be-2c32-4fbd-aa65-96bff5834098"
BURGER_BRS = {BR_BURGER, BR_BURGER2}

mdb = MongoClient(os.environ.get("MONGO_URL", "mongodb://localhost:27017"))[os.environ.get("DB_NAME", "maestro_pos")]


def login(email, pw):
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": pw})
    assert r.status_code == 200, r.text
    return r.json()["token"]


@pytest.fixture(scope="module")
def H():
    return {"Authorization": f"Bearer {login('admin@maestroegp.com', 'admin123')}"}


def hp(H, pid):
    return {**H, "X-Project-Id": pid}


def pr(name, branch, **kw):
    return {"name": name, "ip_address": "10.0.0.9", "port": 9100, "branch_id": branch, "printer_type": "kitchen", **kw}


@pytest.fixture(scope="module", autouse=True)
def cleanup():
    yield
    mdb.printers.delete_many({"name": {"$regex": "^TEST_it327"}})


# ---------- Create validation ----------
class TestCreate:
    def test_create_with_project_and_matching_branch(self, H):
        r = requests.post(f"{API}/printers", headers=H, json=pr("TEST_it327_burger", BR_BURGER, project_id=P_BURGER))
        assert r.status_code == 200, r.text
        assert r.json()["project_id"] == P_BURGER
        assert mdb.printers.find_one({"id": r.json()["id"]})["project_id"] == P_BURGER

    def test_create_mismatch_branch_400(self, H):
        r = requests.post(f"{API}/printers", headers=H, json=pr("TEST_it327_bad", BR_MAIN, project_id=P_BURGER))
        assert r.status_code == 400, r.text
        assert mdb.printers.count_documents({"name": "TEST_it327_bad"}) == 0

    def test_create_unknown_project_400(self, H):
        r = requests.post(f"{API}/printers", headers=H, json=pr("TEST_it327_unk", "", project_id=str(uuid.uuid4())))
        assert r.status_code == 400

    def test_create_main_project(self, H):
        r = requests.post(f"{API}/printers", headers=H, json=pr("TEST_it327_main", BR_MAIN, project_id=P_MAIN))
        assert r.status_code == 200 and r.json()["project_id"] == P_MAIN

    def test_create_no_branch_with_project(self, H):
        r = requests.post(f"{API}/printers", headers=H, json=pr("TEST_it327_nobranch", "", project_id=P_SHAWARMA))
        assert r.status_code == 200 and r.json()["project_id"] == P_SHAWARMA


# ---------- List filter ----------
class TestList:
    def test_list_filter_burger(self, H):
        lst = requests.get(f"{API}/printers", headers=hp(H, P_BURGER)).json()
        names = {p["name"] for p in lst}
        assert "TEST_it327_burger" in names
        assert "TEST_it327_main" not in names and "TEST_it327_nobranch" not in names
        for p in lst:
            assert p.get("branch_id") in BURGER_BRS or (not p.get("branch_id") and p.get("project_id") == P_BURGER)

    def test_list_filter_shawarma_nobranch(self, H):
        names = {p["name"] for p in requests.get(f"{API}/printers", headers=hp(H, P_SHAWARMA)).json()}
        assert "TEST_it327_nobranch" in names and "TEST_it327_burger" not in names

    def test_list_all(self, H):
        names = {p["name"] for p in requests.get(f"{API}/printers", headers=hp(H, "all")).json()}
        assert {"TEST_it327_burger", "TEST_it327_main", "TEST_it327_nobranch"} <= names


# ---------- Update ----------
class TestUpdate:
    def test_update_project_mismatch_400(self, H):
        pid = mdb.printers.find_one({"name": "TEST_it327_burger"})["id"]
        r = requests.put(f"{API}/printers/{pid}", headers=H, json={"project_id": P_MAIN})  # branch stays burger
        assert r.status_code == 400
        assert mdb.printers.find_one({"id": pid})["project_id"] == P_BURGER

    def test_update_project_and_branch(self, H):
        pid = mdb.printers.find_one({"name": "TEST_it327_burger"})["id"]
        r = requests.put(f"{API}/printers/{pid}", headers=H, json={"project_id": P_MAIN, "branch_id": BR_MAIN})
        assert r.status_code == 200, r.text
        d = mdb.printers.find_one({"id": pid})
        assert d["project_id"] == P_MAIN and d["branch_id"] == BR_MAIN
        # restore
        r = requests.put(f"{API}/printers/{pid}", headers=H, json={"project_id": P_BURGER, "branch_id": BR_BURGER2})
        assert r.status_code == 200 and r.json()["branch_id"] == BR_BURGER2


# ---------- Agents monitor ----------
class TestAgentsMonitor:
    def _ids(self, H, pid=None):
        h = hp(H, pid) if pid else H
        r = requests.get(f"{API}/print-queue/agents-monitor", headers=h)
        assert r.status_code == 200, r.text
        return {a["branch_id"] for a in r.json()["agents"]}

    def test_all(self, H):
        ids = self._ids(H)
        assert {BR_MAIN, BR_BURGER, BR_BURGER2} <= ids

    def test_burger(self, H):
        assert self._ids(H, P_BURGER) == BURGER_BRS

    def test_main(self, H):
        assert self._ids(H, P_MAIN) == {BR_MAIN}

    def test_query_param(self, H):
        r = requests.get(f"{API}/print-queue/agents-monitor", headers=H, params={"project_id": P_BURGER})
        assert {a["branch_id"] for a in r.json()["agents"]} == BURGER_BRS


# ---------- Non-enterprise ----------
@pytest.fixture(scope="module")
def ne():
    tid = f"test-it327-{uuid.uuid4().hex[:6]}"
    em = f"test_it327_admin_{uuid.uuid4().hex[:5]}@x.com"
    now = datetime.now(timezone.utc).isoformat()
    mdb.tenants.insert_one({"id": tid, "name": "TEST NE 327", "is_active": True, "enterprise_enabled": False, "created_at": now, "max_users": 50, "max_branches": 10})
    mdb.users.insert_one({"id": str(uuid.uuid4()), "username": em.split("@")[0], "email": em, "full_name": "TEST NE admin",
                          "password": bcrypt.hashpw(b"pass1234", bcrypt.gensalt()).decode(), "role": "admin", "tenant_id": tid,
                          "permissions": ["all"], "is_active": True, "created_at": now, "branch_id": None})
    bid = str(uuid.uuid4())
    mdb.branches.insert_one({"id": bid, "name": "TEST NE branch", "tenant_id": tid, "is_active": True, "created_at": now})
    h = {"Authorization": f"Bearer {login(em, 'pass1234')}"}
    yield tid, h, bid, em
    for c in ["users", "printers", "branches"]:
        mdb[c].delete_many({"tenant_id": tid})
    mdb.tenants.delete_one({"id": tid})


class TestNonEnterprise:
    def test_ne_create_printer_ignores_project(self, ne):
        tid, h, bid, _ = ne
        r = requests.post(f"{API}/printers", headers=h, json=pr("TEST_it327_ne", bid, project_id=P_BURGER))
        assert r.status_code == 200, r.text
        doc = mdb.printers.find_one({"id": r.json()["id"]})
        assert doc["tenant_id"] == tid and doc.get("project_id") != P_BURGER
        assert [p["name"] for p in requests.get(f"{API}/printers", headers=h).json()] == ["TEST_it327_ne"]

    def test_ne_update_ignores_project(self, ne):
        tid, h, bid, _ = ne
        pid = mdb.printers.find_one({"tenant_id": tid})["id"]
        r = requests.put(f"{API}/printers/{pid}", headers=h, json={"project_id": P_BURGER, "name": "TEST_it327_ne2"})
        assert r.status_code == 200
        d = mdb.printers.find_one({"id": pid})
        assert d["name"] == "TEST_it327_ne2" and d.get("project_id") != P_BURGER

    def test_ne_agents_monitor(self, ne):
        tid, h, bid, _ = ne
        r = requests.get(f"{API}/print-queue/agents-monitor", headers=h)
        assert r.status_code == 200
        assert [a["branch_id"] for a in r.json()["agents"]] == [bid]
        assert "summary" in r.json()
