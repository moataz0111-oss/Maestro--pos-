# iter333: Enterprise per-project expenses, owner toggles (inventory/purchases), owner weekly summary, cash diff alert
import os, uuid, asyncio, datetime
import pytest, requests
from pymongo import MongoClient
from dotenv import load_dotenv

load_dotenv('/app/frontend/.env')
load_dotenv('/app/backend/.env')
BASE_URL = os.environ.get('REACT_APP_BACKEND_URL').rstrip('/')
API = f"{BASE_URL}/api"
mdb = MongoClient(os.environ['MONGO_URL'])[os.environ['DB_NAME']]

TID = 'default'
BURGER = 'edc0531b-3fa3-4bb7-b942-d34d0ff6b745'
SHAWARMA = '75dfb28d-94d9-4d09-976f-be3a0f471aa1'
B_BR = '2e19e95f-9dd1-4895-becc-6abd549bb53f'
S_BR = 'ef8ab196-e638-4c76-8862-addb9930f493'
DENY = 'هذه الصلاحية غير مفعّلة'


def _login(email, pw):
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": pw})
    assert r.status_code == 200, r.text
    return r.json()


@pytest.fixture(scope="module")
def admin():
    return {"Authorization": f"Bearer {_login('admin@maestroegp.com', 'admin123')['token']}"}


@pytest.fixture(scope="module")
def pm():
    return {"Authorization": f"Bearer {_login('pmburger@test.com', 'Pm123456')['token']}"}


def _set_flags(admin, **kw):
    r = requests.put(f"{API}/projects/{BURGER}", json=kw, headers=admin)
    assert r.status_code == 200, r.text
    return r.json()["project"]


@pytest.fixture(scope="module", autouse=True)
def cleanup(admin):
    yield
    mdb.expenses.delete_many({"description": {"$regex": "^TEST333"}})
    mdb.cash_diff_alerts.delete_many({"shift_id": {"$regex": "^TEST333"}})
    mdb.projects.update_one({"id": BURGER}, {"$set": {"admin_inventory_enabled": False, "admin_purchases_enabled": False},
                                             "$unset": {"cash_diff_alert_threshold": ""}})
    mdb.tenants.update_one({"id": TID}, {"$unset": {"owner_weekly_summary": ""}})


# ---------- Expenses per project ----------
class TestExpenses:
    def test_create_with_branch_derives_project(self, admin):
        r = requests.post(f"{API}/expenses", headers=admin, json={
            "description": "TEST333 burger exp", "amount": 777, "category": "other", "branch_id": B_BR, "payment_method": "cash"})
        assert r.status_code in (200, 201), r.text
        d = r.json()
        assert d["project_id"] == BURGER
        # shawarma one
        r2 = requests.post(f"{API}/expenses", headers=admin, json={
            "description": "TEST333 shawarma exp", "amount": 888, "category": "other", "branch_id": S_BR, "payment_method": "cash"})
        assert r2.status_code in (200, 201), r2.text
        assert r2.json()["project_id"] == SHAWARMA

    def test_create_mismatch_header_rejected(self, admin):
        r = requests.post(f"{API}/expenses", headers={**admin, "X-Project-Id": SHAWARMA}, json={
            "description": "TEST333 mismatch", "amount": 999, "category": "other", "branch_id": B_BR, "payment_method": "cash"})
        assert r.status_code == 400, r.text

    def test_get_scoped_by_project_with_legacy(self, admin):
        legacy_id = "TEST333-legacy-" + uuid.uuid4().hex[:6]
        today = datetime.date.today().isoformat()
        mdb.expenses.insert_one({"id": legacy_id, "tenant_id": TID, "branch_id": B_BR, "amount": 111, "category": "other",
                                 "description": "TEST333 legacy", "business_date": today, "date": today,
                                 "created_at": datetime.datetime.utcnow().isoformat()})
        rb = requests.get(f"{API}/expenses", headers=admin, params={"project_id": BURGER})
        assert rb.status_code == 200
        descs = {e.get("description") for e in rb.json()}
        assert "TEST333 burger exp" in descs and "TEST333 legacy" in descs
        assert "TEST333 shawarma exp" not in descs
        assert all((e.get("project_id") in (BURGER, None, "")) for e in rb.json())
        rs = requests.get(f"{API}/expenses", headers=admin, params={"project_id": SHAWARMA})
        sd = {e.get("description") for e in rs.json()}
        assert "TEST333 shawarma exp" in sd and "TEST333 burger exp" not in sd and "TEST333 legacy" not in sd
        # with date filter (project scope in $and must survive)
        rd = requests.get(f"{API}/expenses", headers=admin, params={"project_id": BURGER, "start_date": "2000-01-01", "end_date": "2100-01-01"})
        dd = {e.get("description") for e in rd.json()}
        assert "TEST333 burger exp" in dd and "TEST333 shawarma exp" not in dd
        # all projects
        ra = requests.get(f"{API}/expenses", headers=admin)
        ad = {e.get("description") for e in ra.json()}
        assert {"TEST333 burger exp", "TEST333 shawarma exp"} <= ad

    def test_project_admin_sees_only_burger(self, pm):
        r = requests.get(f"{API}/expenses", headers=pm, params={"project_id": SHAWARMA})
        assert r.status_code == 200, r.text
        rows = r.json()
        descs = {e.get("description") for e in rows}
        assert "TEST333 shawarma exp" not in descs
        assert all(e.get("project_id") in (BURGER, None, "") for e in rows)
        # project admin should see burger expenses created by owner (manager-level visibility)
        assert "TEST333 burger exp" in descs, f"pmburger cannot see burger expenses created by owner: {descs}"


# ---------- Owner toggles ----------
INV_PATHS = ["/raw-materials", "/manufactured-products", "/inventory-stats", "/warehouse-transfers"]
PUR_PATHS = ["/suppliers", "/purchases-new"]


class TestToggles:
    def test_defaults_off_and_login_perms(self, admin, pm):
        _set_flags(admin, admin_inventory_enabled=False, admin_purchases_enabled=False)
        u = requests.get(f"{API}/auth/me", headers=pm).json()
        assert u["project_permissions"]["inventory"] is False
        assert u["project_permissions"]["purchases"] is False

    @pytest.mark.parametrize("path", INV_PATHS + PUR_PATHS)
    def test_off_403(self, pm, path):
        r = requests.get(f"{API}{path}", headers=pm)
        assert r.status_code == 403, f"{path} {r.status_code}"
        assert DENY in r.json().get("detail", "")

    def test_owner_not_gated(self, admin):
        for p in INV_PATHS + PUR_PATHS:
            r = requests.get(f"{API}{p}", headers=admin)
            assert r.status_code != 403, p

    def test_on_200_and_me(self, admin, pm):
        p = _set_flags(admin, admin_inventory_enabled=True, admin_purchases_enabled=True, cash_diff_alert_threshold=5000)
        assert p["admin_inventory_enabled"] and p["admin_purchases_enabled"] and p["cash_diff_alert_threshold"] == 5000
        for path in INV_PATHS + PUR_PATHS:
            r = requests.get(f"{API}{path}", headers=pm)
            assert r.status_code == 200, f"{path} {r.status_code} {r.text[:200]}"
        me = requests.get(f"{API}/auth/me", headers=pm).json()
        assert me["project_permissions"] == {"reports": me["project_permissions"]["reports"], "inventory": True, "purchases": True}

    def test_raw_materials_scoped_when_on(self, pm):
        rows = requests.get(f"{API}/raw-materials", headers=pm).json()
        if isinstance(rows, list):
            assert all(r.get("project_id") in (BURGER, None, "") for r in rows), "foreign project raw materials leaked"

    def test_pm_cannot_set_flags(self, admin, pm):
        _set_flags(admin, admin_inventory_enabled=False, admin_purchases_enabled=False)
        r = requests.put(f"{API}/projects/{BURGER}", headers=pm,
                         json={"admin_inventory_enabled": True, "admin_purchases_enabled": True, "cash_diff_alert_threshold": 1})
        assert r.status_code == 200
        p = mdb.projects.find_one({"id": BURGER})
        assert not p.get("admin_inventory_enabled") and not p.get("admin_purchases_enabled")
        assert p.get("cash_diff_alert_threshold") == 5000

    def test_negative_threshold_rejected(self, admin):
        r = requests.put(f"{API}/projects/{BURGER}", headers=admin, json={"cash_diff_alert_threshold": -5})
        assert r.status_code == 422


# ---------- Owner weekly summary ----------
class TestWeekly:
    def test_get_put_persist(self, admin):
        r = requests.put(f"{API}/projects/owner-weekly-summary", headers=admin, json={"enabled": False})
        assert r.status_code == 200 and r.json()["enabled"] is False
        assert requests.get(f"{API}/projects/owner-weekly-summary", headers=admin).json()["enabled"] is False
        assert mdb.tenants.find_one({"id": TID})["owner_weekly_summary"] is False
        r = requests.put(f"{API}/projects/owner-weekly-summary", headers=admin, json={"enabled": True})
        assert requests.get(f"{API}/projects/owner-weekly-summary", headers=admin).json()["enabled"] is True

    def test_send_now(self, admin):
        r = requests.post(f"{API}/projects/owner-weekly-summary/test", headers=admin)
        assert r.status_code == 200, r.text
        d = r.json()
        assert "sent" in d and "message" in d
        if d["sent"] == 0:
            assert "تعذّر الإرسال" in d["message"]

    def test_send_now_no_phone_400(self, admin):
        t = mdb.tenants.find_one({"id": TID})
        mdb.tenants.update_one({"id": TID}, {"$set": {"owner_phone": ""}})
        try:
            r = requests.post(f"{API}/projects/owner-weekly-summary/test", headers=admin)
            assert r.status_code == 400, r.text
        finally:
            mdb.tenants.update_one({"id": TID}, {"$set": {"owner_phone": t.get("owner_phone")}})

    def test_pm_forbidden(self, pm):
        assert requests.post(f"{API}/projects/owner-weekly-summary/test", headers=pm).status_code == 403
        assert requests.put(f"{API}/projects/owner-weekly-summary", headers=pm, json={"enabled": False}).status_code == 403

    def test_non_enterprise_forbidden(self, admin):
        mdb.tenants.update_one({"id": TID}, {"$set": {"enterprise_enabled": False}})
        try:
            r = requests.post(f"{API}/projects/owner-weekly-summary/test", headers=admin)
            assert r.status_code == 403, r.text
            r = requests.put(f"{API}/projects/owner-weekly-summary", headers=admin, json={"enabled": True})
            assert r.status_code == 403, r.text
        finally:
            mdb.tenants.update_one({"id": TID}, {"$set": {"enterprise_enabled": True}})
