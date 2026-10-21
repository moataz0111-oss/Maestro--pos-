# Iter325: per-project scoping of Settings tabs (users, customers, delivery, payment, callcenter, invoice)
# for enterprise tenants + non-enterprise regression.
import os
import uuid
import bcrypt
import pytest
import requests
from datetime import datetime, timezone
from pymongo import MongoClient

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api"
P_MAIN = "52aee398-394c-4d65-8eaa-59bab5ece916"  # oldest (has branch الفرع الرئيسي + orders)
P_SALON = "f7a383ad-0e51-4c11-b20b-390f93a341bb"
P_A = "3128cfc4-b3ed-488a-b318-eebbd21d696b"  # مشروع رابع تجريبي (test writes)
P_B = "18f5019d-8169-4e0a-8f49-19128f24adab"  # عيادة الشفاء (test writes)
BR_MAIN = "76f56acc-6948-4a2f-bbf4-feccbddea88f"
BR_BURGER = "2e19e95f-9dd1-4895-becc-6abd549bb53f"
P_BURGER = "edc0531b-3fa3-4bb7-b942-d34d0ff6b745"

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


@pytest.fixture(scope="module", autouse=True)
def backup_settings():
    colls = ["payment_settings", "callcenter_config", "tenant_invoice_settings"]
    snap = {c: list(mdb[c].find({"tenant_id": "default", "project_id": {"$in": [P_A, P_B]}})) for c in colls}
    yield
    for c in colls:
        mdb[c].delete_many({"tenant_id": "default", "project_id": {"$in": [P_A, P_B]}})
        if snap[c]:
            mdb[c].insert_many(snap[c])
    mdb.users.delete_many({"email": {"$regex": "^test_it325"}})
    mdb.delivery_app_settings.delete_many({"app_id": {"$regex": "^test_it325"}})


# ---------- Users ----------
class TestUsers:
    def test_users_filtered_by_project(self, H):
        all_u = requests.get(f"{API}/users", headers=H).json()
        main = requests.get(f"{API}/users", headers=hp(H, P_MAIN)).json()
        salon = requests.get(f"{API}/users", headers=hp(H, P_SALON)).json()
        assert len(all_u) >= len(main) + len(salon) - 0
        bids = {BR_MAIN}
        for u in main:
            assert u.get("project_id") == P_MAIN or u.get("branch_id") in bids
        for u in salon:
            assert u.get("project_id") == P_SALON
        assert {u["email"] for u in salon} & {"salon@test.com"}
        # query param also works
        q = requests.get(f"{API}/users", headers=H, params={"project_id": P_SALON}).json()
        assert {u["id"] for u in q} == {u["id"] for u in salon}

    def test_create_user_with_project_and_validation(self, H):
        em = f"test_it325_{uuid.uuid4().hex[:6]}@x.com"
        r = requests.post(f"{API}/users", headers=H, json={"username": em.split("@")[0], "email": em, "password": "pass1234",
                                                            "full_name": "TEST it325", "role": "cashier", "project_id": P_SALON})
        assert r.status_code in (200, 201), r.text
        uid = r.json()["id"]
        doc = mdb.users.find_one({"id": uid})
        assert doc["project_id"] == P_SALON
        salon = requests.get(f"{API}/users", headers=hp(H, P_SALON)).json()
        assert uid in {u["id"] for u in salon}
        main = requests.get(f"{API}/users", headers=hp(H, P_MAIN)).json()
        assert uid not in {u["id"] for u in main}
        # branch from another project -> 400
        em2 = f"test_it325_{uuid.uuid4().hex[:6]}@x.com"
        r2 = requests.post(f"{API}/users", headers=H, json={"username": em2.split("@")[0], "email": em2, "password": "pass1234",
                                                             "full_name": "TEST it325b", "role": "cashier", "project_id": P_SALON, "branch_id": BR_MAIN})
        assert r2.status_code == 400, r2.text
        # PUT -> set project, then clear
        r3 = requests.put(f"{API}/users/{uid}", headers=H, json={"project_id": P_MAIN})
        assert r3.status_code == 200, r3.text
        assert mdb.users.find_one({"id": uid})["project_id"] == P_MAIN
        r4 = requests.put(f"{API}/users/{uid}", headers=H, json={"project_id": ""})
        assert r4.status_code == 200, r4.text
        assert mdb.users.find_one({"id": uid}).get("project_id") is None
        # PUT with branch of other project -> 400
        r5 = requests.put(f"{API}/users/{uid}", headers=H, json={"project_id": P_SALON, "branch_id": BR_MAIN})
        assert r5.status_code == 400, r5.text
        # PUT invalid project -> 400
        r6 = requests.put(f"{API}/users/{uid}", headers=H, json={"project_id": "nope-xyz"})
        assert r6.status_code == 400


# ---------- Customers ----------
class TestCustomers:
    def test_customers_by_project(self, H):
        all_c = requests.get(f"{API}/customers", headers=H).json()
        main = requests.get(f"{API}/customers", headers=H, params={"project_id": P_MAIN}).json()
        salon = requests.get(f"{API}/customers", headers=H, params={"project_id": P_SALON}).json()
        allp = requests.get(f"{API}/customers", headers=H, params={"project_id": "all"}).json()
        print("all", len(all_c), "main", len(main), "salon", len(salon))
        assert len(allp) == len(all_c)
        assert len(main) <= len(all_c) and len(main) > 0
        # salon has no orders -> only customers with project_id==salon
        for c in salon:
            assert c.get("project_id") == P_SALON
        ord_cids = set(mdb.orders.distinct("customer_id", {"tenant_id": "default", "project_id": P_MAIN}))
        ord_ph = set(mdb.orders.distinct("customer_phone", {"tenant_id": "default", "project_id": P_MAIN}))
        for c in main:
            dbc = mdb.customers.find_one({"id": c["id"]}) or {}
            assert c["id"] in ord_cids or c.get("phone") in ord_ph or dbc.get("project_id") == P_MAIN


# ---------- Delivery ----------
class TestDelivery:
    def test_delivery_scope_move_and_delete(self, H):
        app_id = f"test_it325_{uuid.uuid4().hex[:5]}"
        r = requests.post(f"{API}/delivery-app-settings", headers=H, json={"app_id": app_id, "name": "TEST شركة", "commission_rate": 10,
                                                                            "is_active": True, "scope_project_id": P_A})
        assert r.status_code == 200, r.text
        a = requests.get(f"{API}/delivery-apps", headers=hp(H, P_A)).json()
        hit = [x for x in a if x["id"] == app_id]
        assert hit and hit[0]["project_id"] == P_A and hit[0]["project_name"]
        b = requests.get(f"{API}/delivery-apps", headers=hp(H, P_B)).json()
        assert app_id not in {x["id"] for x in b}
        allv = requests.get(f"{API}/delivery-apps", headers=H).json()
        assert app_id in {x["id"] for x in allv}
        # move to all
        r2 = requests.post(f"{API}/delivery-app-settings", headers=H, json={"app_id": app_id, "name": "TEST شركة", "commission_rate": 12,
                                                                             "is_active": True, "scope_project_id": "all", "original_project_id": P_A})
        assert r2.status_code == 200
        docs = list(mdb.delivery_app_settings.find({"app_id": app_id}))
        assert len(docs) == 1 and docs[0].get("project_id") is None
        b = requests.get(f"{API}/delivery-apps", headers=hp(H, P_B)).json()
        hit = [x for x in b if x["id"] == app_id]
        assert hit and hit[0]["project_id"] is None and hit[0]["commission_rate"] == 12
        # move to B
        requests.post(f"{API}/delivery-app-settings", headers=H, json={"app_id": app_id, "name": "TEST شركة", "commission_rate": 12,
                                                                        "is_active": True, "scope_project_id": P_B, "original_project_id": "all"})
        docs = list(mdb.delivery_app_settings.find({"app_id": app_id}))
        assert len(docs) == 1 and docs[0]["project_id"] == P_B
        # delete with wrong scope -> 404 ; with correct -> 200
        assert requests.delete(f"{API}/delivery-app-settings/{app_id}", headers=H, params={"scope_project_id": "all"}).status_code == 404
        d = requests.delete(f"{API}/delivery-app-settings/{app_id}", headers=H, params={"scope_project_id": P_B})
        assert d.status_code == 200
        assert mdb.delivery_app_settings.count_documents({"app_id": app_id}) == 0

    def test_delivery_invalid_project(self, H):
        r = requests.post(f"{API}/delivery-app-settings", headers=H, json={"app_id": "test_it325_bad", "name": "x", "commission_rate": 1,
                                                                            "is_active": True, "scope_project_id": "bad-pid"})
        assert r.status_code == 400


# ---------- Payment / Callcenter / Invoice per project ----------
class TestPerProjectSettings:
    def test_payment_isolation(self, H):
        mdb.payment_settings.delete_many({"tenant_id": "default", "project_id": {"$in": [P_A, P_B]}})
        e = requests.get(f"{API}/payment-settings", headers=hp(H, P_A)).json()
        assert e["zaincash_phone"] == "" and e["project_id"] == P_A
        r = requests.post(f"{API}/payment-settings", headers=hp(H, P_A), json={"zaincash_phone": "07700325325", "zaincash_name": "TEST A", "stripe_secret_key": "sk_test_it325"})
        assert r.status_code == 200, r.text
        a = requests.get(f"{API}/payment-settings", headers=hp(H, P_A)).json()
        assert a["zaincash_phone"] == "07700325325" and a["stripe_secret_key_set"] is True and "stripe_secret_key" not in a
        b = requests.get(f"{API}/payment-settings", headers=hp(H, P_B)).json()
        assert b["zaincash_phone"] == "" and b["stripe_secret_key_set"] is False
        r2 = requests.post(f"{API}/payment-settings", headers=H, json={"zaincash_phone": "1"})
        assert r2.status_code == 400

    def test_callcenter_isolation(self, H):
        mdb.callcenter_config.delete_many({"tenant_id": "default", "project_id": {"$in": [P_A, P_B]}})
        e = requests.get(f"{API}/callcenter/config", headers=hp(H, P_A)).json()
        r = requests.post(f"{API}/callcenter/config", headers=hp(H, P_A), json={**e, "provider": "custom", "api_url": "https://it325.test", "enabled": True})
        assert r.status_code == 200, r.text
        a = requests.get(f"{API}/callcenter/config", headers=hp(H, P_A)).json()
        assert a["api_url"] == "https://it325.test" and a.get("project_id") == P_A
        b = requests.get(f"{API}/callcenter/config", headers=hp(H, P_B)).json()
        assert b.get("api_url") in (None, "") 
        r2 = requests.post(f"{API}/callcenter/config", headers=H, json={**e, "provider": "custom"})
        assert r2.status_code == 400

    def test_invoice_isolation_strict(self, H):
        mdb.tenant_invoice_settings.delete_many({"tenant_id": "default", "project_id": {"$in": [P_A, P_B]}})
        e = requests.get(f"{API}/tenant/invoice-settings", headers=hp(H, P_A), params={"strict": "true"}).json()
        assert e.get("phone") in (None, "") and e["project_id"] == P_A
        r = requests.put(f"{API}/tenant/invoice-settings", headers=hp(H, P_A), json={"phone": "0770-IT325", "address": "TEST addr"})
        assert r.status_code == 200, r.text
        a = requests.get(f"{API}/tenant/invoice-settings", headers=hp(H, P_A), params={"strict": "true"}).json()
        assert a["phone"] == "0770-IT325"
        b = requests.get(f"{API}/tenant/invoice-settings", headers=hp(H, P_B), params={"strict": "true"}).json()
        assert b.get("phone") in (None, "")
        s = requests.get(f"{API}/tenant/invoice-settings", headers=hp(H, P_SALON), params={"strict": "true"}).json()
        assert s.get("phone") == "0770-SALON"

    def test_main_project_migration_payment(self, H):
        # oldest project receives the general doc lazily
        r = requests.get(f"{API}/payment-settings", headers=hp(H, P_MAIN))
        assert r.status_code == 200
        assert mdb.payment_settings.count_documents({"tenant_id": "default", "project_id": P_MAIN}) == 1


# ---------- Non-enterprise regression ----------
@pytest.fixture(scope="module")
def ne():
    tid = f"test-it325-{uuid.uuid4().hex[:6]}"
    em = f"test_it325_admin_{uuid.uuid4().hex[:5]}@x.com"
    now = datetime.now(timezone.utc).isoformat()
    mdb.tenants.insert_one({"id": tid, "name": "TEST NE tenant", "is_active": True, "enterprise_enabled": False, "created_at": now, "max_users": 50, "max_branches": 10})
    mdb.users.insert_one({"id": str(uuid.uuid4()), "username": em.split("@")[0], "email": em, "full_name": "TEST NE admin",
                          "password": bcrypt.hashpw(b"pass1234", bcrypt.gensalt()).decode(), "role": "admin", "tenant_id": tid,
                          "permissions": ["all"], "is_active": True, "created_at": now, "branch_id": None})
    h = {"Authorization": f"Bearer {login(em, 'pass1234')}"}
    yield tid, h
    for c in ["users", "payment_settings", "callcenter_config", "tenant_invoice_settings", "delivery_app_settings", "branches", "customers"]:
        mdb[c].delete_many({"tenant_id": tid})
    mdb.tenants.delete_one({"id": tid})


class TestNonEnterprise:
    def test_ne_settings_save_without_project(self, ne):
        tid, h = ne
        assert requests.post(f"{API}/payment-settings", headers=h, json={"zaincash_phone": "0780NE"}).status_code == 200
        assert requests.get(f"{API}/payment-settings", headers=h).json()["zaincash_phone"] == "0780NE"
        cfg = requests.get(f"{API}/callcenter/config", headers=h).json()
        assert requests.post(f"{API}/callcenter/config", headers=h, json={**cfg, "provider": "custom", "api_url": "https://ne"}).status_code == 200
        assert requests.get(f"{API}/callcenter/config", headers=h).json()["api_url"] == "https://ne"
        assert requests.put(f"{API}/tenant/invoice-settings", headers=h, json={"phone": "NE-PH"}).status_code == 200
        assert requests.get(f"{API}/tenant/invoice-settings", headers=h).json()["phone"] == "NE-PH"
        # X-Project-Id header ignored for non-enterprise
        assert requests.get(f"{API}/payment-settings", headers={**h, "X-Project-Id": P_A}).json()["zaincash_phone"] == "0780NE"

    def test_ne_delivery_and_users(self, ne):
        tid, h = ne
        r = requests.post(f"{API}/delivery-app-settings", headers=h, json={"app_id": "test_it325_ne", "name": "NE co", "commission_rate": 5, "is_active": True, "scope_project_id": P_A})
        assert r.status_code == 200
        assert mdb.delivery_app_settings.find_one({"tenant_id": tid, "app_id": "test_it325_ne"}).get("project_id") is None
        apps = requests.get(f"{API}/delivery-apps", headers=h).json()
        assert "project_id" not in apps[0]
        assert "test_it325_ne" in {a["id"] for a in apps}
        users = requests.get(f"{API}/users", headers=h).json()
        assert len(users) == 1
        em = f"test_it325_necash_{uuid.uuid4().hex[:4]}@x.com"
        rc = requests.post(f"{API}/users", headers=h, json={"username": em.split("@")[0], "email": em, "password": "pass1234", "full_name": "NE c", "role": "cashier", "project_id": P_A})
        print(rc.status_code, rc.text[:200])
        assert rc.status_code in (200, 201)
        assert mdb.users.find_one({"email": em}).get("project_id") in (None,)
        uid = rc.json()["id"]
        assert requests.put(f"{API}/users/{uid}", headers=h, json={"project_id": P_A}).status_code == 200
        assert mdb.users.find_one({"id": uid}).get("project_id") is None
        cust = requests.get(f"{API}/customers", headers=h)
        assert cust.status_code == 200
