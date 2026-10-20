# Iter320: transfer log filters, enterprise dashboard comparison, project owner fields,
# assign-admin WA welcome fields, low-stock alerts (instant once-until-restocked + daily summary)
import os
import uuid
import pytest
import requests
from pymongo import MongoClient
from dotenv import load_dotenv

load_dotenv("/app/backend/.env")
BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api"
REST = "52aee398-394c-4d65-8eaa-59bab5ece916"
SALON = "f7a383ad-0e51-4c11-b20b-390f93a341bb"
TAG = f"TEST_i320{uuid.uuid4().hex[:4]}"
mdb = MongoClient(os.environ["MONGO_URL"])[os.environ["DB_NAME"]]
CREATED = {"raw": [], "users": []}


@pytest.fixture(scope="module")
def s():
    r = requests.post(f"{API}/auth/login", json={"email": "admin@maestroegp.com", "password": "admin123"})
    if r.status_code != 200:
        pytest.skip("login failed")
    ses = requests.Session()
    ses.headers.update({"Authorization": f"Bearer {r.json()['token']}", "Content-Type": "application/json"})
    yield ses
    for i in CREATED["raw"]:
        mdb.raw_materials.delete_one({"id": i})
        mdb.low_stock_alert_state.delete_many({"item_id": i})
    for u in CREATED["users"]:
        mdb.users.delete_one({"id": u})


# ---- Transfer log ----
class TestTransferLog:
    def test_all(self, s):
        r = s.get(f"{API}/projects/inventory/log")
        assert r.status_code == 200, r.text
        logs = r.json()
        assert isinstance(logs, list) and len(logs) >= 2
        assert all("_id" not in x for x in logs)
        t = [x for x in logs if x.get("type") == "transfer"][0]
        for k in ("quantity", "cost_per_unit", "from_project_name", "target_project_name", "user_name", "created_at"):
            assert k in t
        mv = [x for x in logs if x.get("type") == "move"][0]
        assert mv["items"][0].get("from_project_name") == "صالون الأناقة"

    def test_project_filter(self, s):
        logs = s.get(f"{API}/projects/inventory/log", params={"project_id": SALON}).json()
        assert len(logs) >= 2
        for x in logs:
            assert SALON in (x.get("from_project_id"), x.get("target_project_id")) or \
                any(i.get("from_project_id") == SALON for i in x.get("items", []))
        other = s.get(f"{API}/projects/inventory/log", params={"project_id": "18f5019d-8169-4e0a-8f49-19128f24adab"}).json()
        assert other == []

    def test_date_filter(self, s):
        logs = s.get(f"{API}/projects/inventory/log").json()
        d = logs[0]["created_at"][:10]
        same = s.get(f"{API}/projects/inventory/log", params={"start_date": d, "end_date": d}).json()
        assert len(same) >= 1 and all(x["created_at"][:10] == d for x in same)
        none = s.get(f"{API}/projects/inventory/log", params={"start_date": "2000-01-01", "end_date": "2000-01-02"}).json()
        assert none == []

    def test_unauth(self):
        assert requests.get(f"{API}/projects/inventory/log").status_code in (401, 403)


# ---- Enterprise dashboard ----
class TestEnterpriseDashboard:
    def test_dashboard(self, s):
        r = s.get(f"{API}/enterprise/dashboard")
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["projects"]
        deleted = {p["id"] for p in mdb.projects.find({"tenant_id": "default", "deleted_at": {"$exists": True}}, {"id": 1})}
        for p in d["projects"]:
            for k in ("revenue", "purchases", "expenses", "inventory_value", "net_profit", "orders_count", "branches_count"):
                assert k in p, k
            assert abs(p["net_profit"] - (p["revenue"] - p["expenses"] - p["purchases"])) < 0.05
            assert p["id"] not in deleted
        assert d["totals"]["projects_count"] == len(d["projects"])


# ---- Project owner fields ----
class TestProjectOwner:
    def test_owner_fields_persist(self, s):
        orig = mdb.projects.find_one({"id": SALON}, {"_id": 0, "owner_name": 1, "owner_phone": 1}) or {}
        r = s.put(f"{API}/projects/{SALON}", json={"owner_name": f"{TAG}_owner", "owner_phone": "07701234567"})
        assert r.status_code == 200, r.text
        g = s.get(f"{API}/projects/{SALON}").json()
        assert g["owner_name"] == f"{TAG}_owner" and g["owner_phone"] == "07701234567"
        # restore
        mdb.projects.update_one({"id": SALON}, {"$set": {"owner_name": orig.get("owner_name"), "owner_phone": orig.get("owner_phone")}})


# ---- Assign admin WA welcome ----
class TestAssignAdmin:
    def test_assign_admin_wa_fields(self, s):
        prev = mdb.projects.find_one({"id": "3128cfc4-b3ed-488a-b318-eebbd21d696b"}, {"_id": 0, "admin_user_id": 1}) or {}
        u = uuid.uuid4().hex[:6]
        r = s.post(f"{API}/projects/3128cfc4-b3ed-488a-b318-eebbd21d696b/assign-admin", json={
            "username": f"test_i320_{u}", "email": f"test_i320_{u}@example.com", "password": "Pass1234",
            "full_name": f"{TAG} Admin", "phone": "07709998877"})
        mdb.projects.update_one({"id": "3128cfc4-b3ed-488a-b318-eebbd21d696b"}, {"$set": {"admin_user_id": prev.get("admin_user_id")}})
        assert r.status_code == 200, r.text
        d = r.json()
        CREATED["users"].append(d["admin"]["id"])
        assert "whatsapp_sent" in d and "whatsapp_error" in d
        print("WA:", d["whatsapp_sent"], d["whatsapp_error"])
        assert d["whatsapp_sent"] is False and d["whatsapp_error"]
        assert d["admin"]["phone"] == "07709998877" and "password" not in d["admin"]
        assert mdb.users.find_one({"id": d["admin"]["id"]})["phone"] == "07709998877"


# ---- Stock alerts ----
def _instant(pid, since):
    return list(mdb.notifications.find({"category": "low_stock", "metadata.project_id": pid,
                                        "metadata.type": "low_stock_instant", "created_at": {"$gte": since}}, {"_id": 0}))


class TestStockAlerts:
    def test_run_and_once_until_restocked(self, s):
        from datetime import datetime, timezone
        r = s.post(f"{API}/raw-materials-new", headers={"X-Project-Id": SALON},
                   json={"name": f"{TAG}_low", "unit": "كغم", "quantity": 100, "cost_per_unit": 100, "min_quantity": 10})
        assert r.status_code == 200, r.text
        mid = r.json()["id"]
        CREATED["raw"].append(mid)
        mdb.raw_materials.update_one({"id": mid}, {"$set": {"min_quantity": 10, "project_id": SALON}})
        since = datetime.now(timezone.utc).isoformat()
        assert s.post(f"{API}/projects/stock-alerts/run").status_code == 200
        assert not [n for n in _instant(SALON, since) if f"{TAG}_low" in n["message"]]
        # drop below min
        mdb.raw_materials.update_one({"id": mid}, {"$set": {"quantity": 5}})
        assert s.post(f"{API}/projects/stock-alerts/run").status_code == 200
        hits = [n for n in _instant(SALON, since) if f"{TAG}_low" in n["message"]]
        assert len(hits) == 1, hits
        assert hits[0]["title"] == "📉 تنبيه نقص مخزون — صالون الأناقة"
        # run again -> no repeat
        s.post(f"{API}/projects/stock-alerts/run")
        assert len([n for n in _instant(SALON, since) if f"{TAG}_low" in n["message"]]) == 1
        # restock -> state cleared
        mdb.raw_materials.update_one({"id": mid}, {"$set": {"quantity": 50}})
        s.post(f"{API}/projects/stock-alerts/run")
        assert mdb.low_stock_alert_state.count_documents({"item_id": mid}) == 0
        # drop again -> alerted again
        mdb.raw_materials.update_one({"id": mid}, {"$set": {"quantity": 2}})
        s.post(f"{API}/projects/stock-alerts/run")
        assert len([n for n in _instant(SALON, since) if f"{TAG}_low" in n["message"]]) == 2

    def test_daily_summary_once(self, s):
        docs = list(mdb.notifications.find({"metadata.project_id": SALON, "metadata.type": "low_stock_daily"}, {"_id": 0, "title": 1, "created_at": 1}))
        assert docs, "no daily summary"
        assert docs[0]["title"].startswith("📋 ملخص المخزون الناقص اليومي")
        days = [d["created_at"][:10] for d in docs]
        # at most one per day (UTC date approx)
        assert len(days) == len(set(days)), days

    def test_non_owner_forbidden(self):
        r = requests.post(f"{API}/auth/login", json={"email": "wkeeper@maestroegp.com", "password": "wkeeper123"})
        if r.status_code != 200:
            pytest.skip("wkeeper login failed")
        h = {"Authorization": f"Bearer {r.json()['token']}"}
        assert requests.post(f"{API}/projects/stock-alerts/run", headers=h).status_code == 403
        assert requests.get(f"{API}/projects/inventory/log", headers=h).status_code == 403
