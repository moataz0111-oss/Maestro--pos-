# iter334: Retest of iter333 gaps - cash-diff alert via /cash-register/close, project-scoped /raw-materials,
# weekly summary from shifts+expenses, _owner_phones incl. admins with project_id, GET owner-weekly-summary guard
import os, sys, uuid, asyncio, re, time, datetime
import pytest, requests
from pymongo import MongoClient
from dotenv import load_dotenv

load_dotenv('/app/frontend/.env')
load_dotenv('/app/backend/.env')
sys.path.insert(0, '/app/backend')
BASE_URL = os.environ.get('REACT_APP_BACKEND_URL').rstrip('/')
API = f"{BASE_URL}/api"
mdb = MongoClient(os.environ['MONGO_URL'])[os.environ['DB_NAME']]

TID = 'default'
BURGER = 'edc0531b-3fa3-4bb7-b942-d34d0ff6b745'
SHAWARMA = '75dfb28d-94d9-4d09-976f-be3a0f471aa1'
B_BR = '2e19e95f-9dd1-4895-becc-6abd549bb53f'
S_BR = 'ef8ab196-e638-4c76-8862-addb9930f493'


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


@pytest.fixture(scope="module", autouse=True)
def cleanup():
    yield
    mdb.shifts.delete_many({"id": {"$regex": "^TEST334"}})
    mdb.cash_diff_alerts.delete_many({"shift_id": {"$regex": "^TEST334"}})
    mdb.raw_materials.delete_many({"name": {"$regex": "^TEST334"}})
    mdb.expenses.delete_many({"description": {"$regex": "^TEST334"}})
    mdb.projects.update_one({"id": BURGER}, {"$set": {"admin_inventory_enabled": False, "admin_purchases_enabled": False},
                                             "$unset": {"cash_diff_alert_threshold": ""}})


def _open_shift(branch, project):
    sid = f"TEST334-{uuid.uuid4().hex[:8]}"
    now = datetime.datetime.now(datetime.timezone.utc).isoformat()
    mdb.shifts.insert_one({"id": sid, "tenant_id": TID, "branch_id": branch, "project_id": project, "status": "open",
                           "cashier_id": "TEST334-cashier", "cashier_name": "TEST334 Cashier", "opening_cash": 0,
                           "started_at": now, "opened_at": now,
                           "business_date": (datetime.datetime.utcnow() + datetime.timedelta(hours=3)).strftime("%Y-%m-%d")})
    return sid


# ---------- Cash diff alert from real UI close endpoint ----------
class TestCashDiffViaClose:
    def test_above_threshold_records_alert(self, admin):
        mdb.projects.update_one({"id": BURGER}, {"$unset": {"cash_diff_alert_threshold": ""}})
        sid = _open_shift(B_BR, BURGER)
        r = requests.post(f"{API}/cash-register/close", headers=admin, json={
            "shift_id": sid, "branch_id": B_BR, "denominations": {"50000": 1}, "force_close_without_count": True})
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["status"] == "closed"
        assert abs(d["cash_difference"]) >= 10000
        rec = None
        for _ in range(10):
            rec = mdb.cash_diff_alerts.find_one({"shift_id": sid})
            if rec:
                break
            time.sleep(1)
        assert rec, "no cash_diff_alerts record after /cash-register/close"
        assert rec["project_id"] == BURGER
        assert rec["difference"] == d["cash_difference"]
        assert rec["threshold"] == 10000

    def test_below_threshold_no_record(self, admin):
        sid = _open_shift(B_BR, BURGER)
        r = requests.post(f"{API}/cash-register/close", headers=admin, json={
            "shift_id": sid, "branch_id": B_BR, "denominations": {"1000": 1}, "force_close_without_count": True})
        assert r.status_code == 200, r.text
        assert abs(r.json()["cash_difference"]) < 10000
        time.sleep(3)
        assert mdb.cash_diff_alerts.find_one({"shift_id": sid}) is None

    def test_project_derived_from_branch_when_shift_lacks_project(self, admin):
        mdb.projects.update_one({"id": BURGER}, {"$set": {"cash_diff_alert_threshold": 500}})
        sid = _open_shift(B_BR, None)
        r = requests.post(f"{API}/cash-register/close", headers=admin, json={
            "shift_id": sid, "branch_id": B_BR, "denominations": {"1000": 1}, "force_close_without_count": True})
        assert r.status_code == 200, r.text
        rec = None
        for _ in range(10):
            rec = mdb.cash_diff_alerts.find_one({"shift_id": sid})
            if rec:
                break
            time.sleep(1)
        mdb.projects.update_one({"id": BURGER}, {"$unset": {"cash_diff_alert_threshold": ""}})
        assert rec and rec["project_id"] == BURGER and rec["threshold"] == 500


# ---------- /api/raw-materials project scope ----------
class TestRawMaterialsScope:
    @pytest.fixture(scope="class", autouse=True)
    def seed(self, admin):
        r = requests.put(f"{API}/projects/{BURGER}", json={"admin_inventory_enabled": True}, headers=admin)
        assert r.status_code == 200, r.text
        now = datetime.datetime.utcnow().isoformat()
        docs = [("TEST334 burger", BURGER, None), ("TEST334 burger legacy", None, B_BR),
                ("TEST334 shawarma", SHAWARMA, None), ("TEST334 shawarma legacy", None, S_BR)]
        for n, p, b in docs:
            mdb.raw_materials.insert_one({"id": f"TEST334-{uuid.uuid4().hex[:6]}", "tenant_id": TID, "name": n,
                                          "unit": "kg", "project_id": p, "branch_id": b, "created_at": now})
        yield
        mdb.raw_materials.delete_many({"name": {"$regex": "^TEST334"}})
        requests.put(f"{API}/projects/{BURGER}", json={"admin_inventory_enabled": False}, headers=admin)

    def _names(self, r):
        assert r.status_code == 200, r.text
        return {m["name"] for m in r.json()}

    def test_pmburger_only_burger(self, pm):
        names = self._names(requests.get(f"{API}/raw-materials", headers=pm))
        assert "TEST334 burger" in names and "TEST334 burger legacy" in names
        assert not any("shawarma" in n for n in names)
        assert "نعناع اختبار" not in names and "شامبو تست" not in names, names

    def test_pmburger_cannot_override_project(self, pm):
        names = self._names(requests.get(f"{API}/raw-materials", headers=pm, params={"project_id": SHAWARMA}))
        assert "TEST334 shawarma" not in names and "TEST334 burger" in names

    def test_owner_with_project_param(self, admin):
        names = self._names(requests.get(f"{API}/raw-materials", headers=admin, params={"project_id": SHAWARMA}))
        assert names == {"TEST334 shawarma", "TEST334 shawarma legacy"}, names

    def test_owner_all(self, admin):
        names = self._names(requests.get(f"{API}/raw-materials", headers=admin))
        assert {"TEST334 burger", "TEST334 shawarma", "نعناع اختبار"} <= names


# ---------- Weekly summary ----------
class TestWeeklySummary:
    def test_get_forbidden_for_project_admin(self, pm, admin):
        assert requests.get(f"{API}/projects/owner-weekly-summary", headers=pm).status_code == 403
        r = requests.get(f"{API}/projects/owner-weekly-summary", headers=admin)
        assert r.status_code == 200 and "enabled" in r.json()

    def _run(self, coro_fn):
        import routes.shared as sh
        sh._db = None; sh._client = None

        async def _w():
            return await coro_fn(sh.get_database())
        return asyncio.run(_w())

    def _burger_vals(self, msg):
        lines = msg.split("\n")
        i = next(k for k, l in enumerate(lines) if "مطعم البرغر الملكي" in l)
        nums = lambda s: [float(x.replace(",", "")) for x in re.findall(r"[\d,]+(?:\.\d+)?", s)]
        sales, orders = nums(lines[i + 1])[0], nums(lines[i + 1])[-1]
        exp, net = nums(lines[i + 2])[0], nums(lines[i + 2])[-1]
        return sales, orders, exp, net

    def test_uses_shifts_and_expenses(self):
        from routes.project_daily_summary import build_owner_weekly_summary
        local = datetime.datetime.utcnow() + datetime.timedelta(hours=3)
        dates = [(local - datetime.timedelta(days=d)).strftime("%Y-%m-%d") for d in range(7, 0, -1)]
        before = self._burger_vals(self._run(lambda db: build_owner_weekly_summary(db, TID, dates)))
        mdb.shifts.insert_one({"id": f"TEST334-wk-{uuid.uuid4().hex[:6]}", "tenant_id": TID, "status": "closed",
                               "branch_id": B_BR, "project_id": BURGER, "business_date": dates[2],
                               "total_sales": 123000, "total_orders": 7})
        mdb.shifts.insert_one({"id": f"TEST334-wk-{uuid.uuid4().hex[:6]}", "tenant_id": TID, "status": "closed",
                               "branch_id": B_BR, "business_date": dates[3], "total_sales": 1000, "total_orders": 1})  # legacy
        mdb.shifts.insert_one({"id": f"TEST334-wk-{uuid.uuid4().hex[:6]}", "tenant_id": TID, "status": "open",
                               "branch_id": B_BR, "project_id": BURGER, "business_date": dates[3], "total_sales": 99999})
        for amt, cat, extra in [(5000, "rent", {"business_date": dates[1]}), (700, "refund", {"business_date": dates[1]}),
                                (300, "other", {"date": dates[4]})]:
            mdb.expenses.insert_one({"id": f"TEST334-{uuid.uuid4().hex[:6]}", "tenant_id": TID, "project_id": BURGER,
                                     "branch_id": B_BR, "amount": amt, "category": cat,
                                     "description": "TEST334 wk exp", **extra})
        after = self._burger_vals(self._run(lambda db: build_owner_weekly_summary(db, TID, dates)))
        assert after[0] - before[0] == 124000, (before, after)
        assert after[1] - before[1] == 8
        assert after[2] - before[2] == 5300
        assert after[3] - before[3] == 124000 - 5300

    def test_owner_phones_include_admin_with_project(self):
        from routes.project_daily_summary import _owner_phones
        phones = self._run(lambda db: _owner_phones(db, TID))
        assert "07833333333" in phones
        admin_phone = mdb.users.find_one({"email": "admin@maestroegp.com"}).get("phone")
        assert admin_phone in phones
