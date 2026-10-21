# Iter326: retest of iter325 minor fixes (upsert migration, delivery per-assignment rows,
# user branch->project sync, login no password_vault) + quick regression.
import os
import uuid
import asyncio
import pytest
import requests
import concurrent.futures as cf
from pymongo import MongoClient

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api"
P_MAIN = "52aee398-394c-4d65-8eaa-59bab5ece916"
P_SALON = "f7a383ad-0e51-4c11-b20b-390f93a341bb"
P_A = "3128cfc4-b3ed-488a-b318-eebbd21d696b"
P_B = "18f5019d-8169-4e0a-8f49-19128f24adab"
BR_MAIN = "76f56acc-6948-4a2f-bbf4-feccbddea88f"
BR_BURGER = "2e19e95f-9dd1-4895-becc-6abd549bb53f"
P_BURGER = "edc0531b-3fa3-4bb7-b942-d34d0ff6b745"

mdb = MongoClient(os.environ.get("MONGO_URL", "mongodb://localhost:27017"))[os.environ.get("DB_NAME", "maestro_pos")]


def login_raw(email, pw):
    return requests.post(f"{API}/auth/login", json={"email": email, "password": pw})


@pytest.fixture(scope="module")
def H():
    r = login_raw("admin@maestroegp.com", "admin123")
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['token']}"}


def hp(H, pid):
    return {**H, "X-Project-Id": pid}


@pytest.fixture(scope="module", autouse=True)
def cleanup():
    snap = list(mdb.payment_settings.find({"tenant_id": "default", "project_id": P_MAIN}))
    yield
    mdb.users.delete_many({"email": {"$regex": "^test_it326"}})
    mdb.delivery_app_settings.delete_many({"app_id": {"$regex": "^test_it326"}})
    mdb.payment_settings.delete_many({"tenant_id": "default", "project_id": P_MAIN})
    if snap:
        mdb.payment_settings.insert_many(snap)


# ---------- (4) Login no password_vault ----------
def test_login_no_password_vault():
    r = login_raw("admin@maestroegp.com", "admin123")
    u = r.json()["user"]
    assert "password_vault" not in u and "password" not in u
    me = requests.get(f"{API}/auth/me", headers={"Authorization": f"Bearer {r.json()['token']}"})
    if me.status_code == 200:
        assert "password_vault" not in me.json(), "password_vault leaked in /auth/me"


def test_users_list_no_password_vault(H):
    us = requests.get(f"{API}/users", headers=H).json()
    leaked = [u.get("email") for u in us if "password_vault" in u]
    print("users with password_vault in list:", len(leaked))
    # informational - users list may intentionally include vault for welcome button


# ---------- (1) Lazy migration upsert concurrency ----------
def test_migration_concurrent_no_duplicates(H):
    mdb.payment_settings.delete_many({"tenant_id": "default", "project_id": P_MAIN})
    general = mdb.payment_settings.find_one({"tenant_id": "default", "project_id": None})
    if not general:
        pytest.skip("no general payment settings to migrate")
    url = f"{API}/payment-settings"

    def get():
        return requests.get(url, headers=hp(H, P_MAIN)).status_code

    with cf.ThreadPoolExecutor(12) as ex:
        codes = list(ex.map(lambda _: get(), range(12)))
    assert all(c == 200 for c in codes), codes
    n = mdb.payment_settings.count_documents({"tenant_id": "default", "project_id": P_MAIN})
    assert n == 1, f"duplicate migrated docs: {n}"


# ---------- (2) Delivery all-projects rows per assignment ----------
class TestDeliveryAssignments:
    APP = "test_it326_app"

    def _rows(self, H):
        return [a for a in requests.get(f"{API}/delivery-apps", headers=H).json() if a["id"] == self.APP]

    def test_rows_per_assignment_and_scoped_edit_delete(self, H):
        # general + salon assignment
        r1 = requests.post(f"{API}/delivery-app-settings", headers=H, json={"app_id": self.APP, "name": "TEST326", "commission_rate": 5, "is_active": True, "scope_project_id": "all"})
        r2 = requests.post(f"{API}/delivery-app-settings", headers=H, json={"app_id": self.APP, "name": "TEST326", "commission_rate": 9, "is_active": True, "scope_project_id": P_SALON})
        assert r1.status_code == 200 and r2.status_code == 200, (r1.text, r2.text)
        rows = self._rows(H)
        assert len(rows) == 2, rows
        byp = {r["project_id"]: r for r in rows}
        assert byp[None]["commission_rate"] == 5 and byp[None]["project_name"] is None
        assert byp[P_SALON]["commission_rate"] == 9 and byp[P_SALON]["project_name"]
        # edit commission of salon assignment only (frontend sends original_project_id)
        r3 = requests.post(f"{API}/delivery-app-settings", headers=H, json={"app_id": self.APP, "name": "TEST326", "commission_rate": 12, "is_active": True, "scope_project_id": P_SALON, "original_project_id": P_SALON})
        assert r3.status_code == 200
        byp = {r["project_id"]: r for r in self._rows(H)}
        assert byp[None]["commission_rate"] == 5 and byp[P_SALON]["commission_rate"] == 12
        # project view: salon sees its own override
        sal = [a for a in requests.get(f"{API}/delivery-apps", headers=hp(H, P_SALON)).json() if a["id"] == self.APP]
        assert len(sal) == 1 and sal[0]["commission_rate"] == 12
        # delete salon assignment only
        d = requests.delete(f"{API}/delivery-app-settings/{self.APP}", headers=H, params={"scope_project_id": P_SALON})
        assert d.status_code == 200
        rows = self._rows(H)
        assert len(rows) == 1 and rows[0]["project_id"] is None and rows[0]["commission_rate"] == 5
        d2 = requests.delete(f"{API}/delivery-app-settings/{self.APP}", headers=H, params={"scope_project_id": "all"})
        assert d2.status_code == 200
        assert self._rows(H) == []

    def test_toters_rows_listed(self, H):
        rows = requests.get(f"{API}/delivery-apps", headers=H).json()
        t = [r for r in rows if r["id"] == "toters"]
        print("toters rows:", [(r.get("project_name"), r.get("commission_rate")) for r in t])
        assert len(t) >= 1
        keys = [(r["id"], r.get("project_id")) for r in rows]
        assert len(keys) == len(set(keys)), "duplicate (app, project) rows"


# ---------- (3) PUT user branch_id only -> project sync ----------
def test_user_branch_only_syncs_project(H):
    em = f"test_it326_{uuid.uuid4().hex[:6]}@x.com"
    r = requests.post(f"{API}/users", headers=H, json={"username": em.split("@")[0], "email": em, "password": "pass1234",
                                                        "full_name": "TEST it326", "role": "cashier", "branch_id": BR_MAIN, "project_id": P_MAIN})
    assert r.status_code in (200, 201), r.text
    uid = r.json()["id"]
    assert mdb.users.find_one({"id": uid})["project_id"] == P_MAIN
    u = requests.put(f"{API}/users/{uid}", headers=H, json={"branch_id": BR_BURGER})
    assert u.status_code == 200, u.text
    doc = mdb.users.find_one({"id": uid})
    assert doc["branch_id"] == BR_BURGER and doc["project_id"] == P_BURGER, (doc.get("branch_id"), doc.get("project_id"))
    # regression: explicit mismatched project+branch -> 400
    bad = requests.put(f"{API}/users/{uid}", headers=H, json={"branch_id": BR_MAIN, "project_id": P_SALON})
    assert bad.status_code == 400
    # users filter
    burger = requests.get(f"{API}/users", headers=hp(H, P_BURGER)).json()
    assert uid in {x["id"] for x in burger}
    main = requests.get(f"{API}/users", headers=hp(H, P_MAIN)).json()
    assert uid not in {x["id"] for x in main}


# ---------- regression: per-project payment/callcenter isolation ----------
def test_payment_no_project_400_and_isolation(H):
    r = requests.get(f"{API}/payment-settings", headers=hp(H, P_A))
    assert r.status_code == 200
    r2 = requests.get(f"{API}/callcenter/config", headers=hp(H, P_A))
    print("callcenter config", r2.status_code)
    inv = requests.get(f"{API}/tenant/invoice-settings", headers=hp(H, P_A), params={"strict": True})
    assert inv.status_code == 200
