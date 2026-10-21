# iter333: Direct unit tests for send_cash_diff_alert + build_owner_weekly_summary (server module stubbed for WA)
import os, sys, types, asyncio, uuid
import pytest
from dotenv import load_dotenv
from pymongo import MongoClient

load_dotenv('/app/backend/.env')
sys.path.insert(0, '/app/backend')
mdb = MongoClient(os.environ['MONGO_URL'])[os.environ['DB_NAME']]
TID = 'default'
BURGER = 'edc0531b-3fa3-4bb7-b942-d34d0ff6b745'
B_BR = '2e19e95f-9dd1-4895-becc-6abd549bb53f'
SENT = []


class _FakeWA:
    async def send_message(self, to, msg, **kw):
        SENT.append((to, msg, kw))
        return True, None


async def _e164(p, default_country="IQ"):
    return "+964" + p.lstrip("0")


@pytest.fixture(scope="module", autouse=True)
def stub_server():
    real = sys.modules.get("server")
    fake = types.ModuleType("server")
    fake._wa_free = _FakeWA()
    fake._phone_to_e164 = _e164
    sys.modules["server"] = fake
    pm = mdb.users.find_one({"email": "pmburger@test.com"})
    mdb.users.update_one({"id": pm["id"]}, {"$set": {"phone": "07701112233"}})
    yield
    mdb.users.update_one({"id": pm["id"]}, {"$set": {"phone": pm.get("phone") or ""}})
    mdb.cash_diff_alerts.delete_many({"shift_id": {"$regex": "^TEST333"}})
    mdb.projects.update_one({"id": BURGER}, {"$unset": {"cash_diff_alert_threshold": ""}})
    if real:
        sys.modules["server"] = real
    else:
        sys.modules.pop("server", None)


def _run(coro):
    import routes.shared as sh
    sh._db = None; sh._client = None  # fresh motor client bound to this loop
    return asyncio.run(coro)


def _rec(diff, sid=None, **kw):
    return {"tenant_id": TID, "branch_id": B_BR, "branch_name": "البرغر الملكي - المنصور", "cashier_name": "TEST",
            "shift_id": sid or f"TEST333-{uuid.uuid4().hex[:8]}", "difference": diff, "expected_cash": 100000,
            "actual_cash": 100000 + diff, "business_date": "2026-01-10", **kw}


class TestCashDiffAlert:
    def test_default_threshold_above_sends_and_records(self):
        from routes.project_daily_summary import send_cash_diff_alert
        mdb.projects.update_one({"id": BURGER}, {"$unset": {"cash_diff_alert_threshold": ""}})
        SENT.clear()
        r = _rec(-15000)
        n = _run(send_cash_diff_alert(r))
        assert n == 1
        doc = mdb.cash_diff_alerts.find_one({"shift_id": r["shift_id"]})
        assert doc and doc["project_id"] == BURGER and doc["sent"] == 1 and doc["threshold"] == 10000
        assert "عجز" in SENT[0][1] and SENT[0][0] == "+9647701112233"

    def test_below_threshold_no_record(self):
        from routes.project_daily_summary import send_cash_diff_alert
        r = _rec(5000)
        assert _run(send_cash_diff_alert(r)) == 0
        assert mdb.cash_diff_alerts.find_one({"shift_id": r["shift_id"]}) is None

    def test_custom_threshold_and_surplus(self):
        from routes.project_daily_summary import send_cash_diff_alert
        mdb.projects.update_one({"id": BURGER}, {"$set": {"cash_diff_alert_threshold": 3000}})
        SENT.clear()
        r = _rec(3000)
        assert _run(send_cash_diff_alert(r)) == 1
        assert "زيادة" in SENT[0][1]
        assert mdb.cash_diff_alerts.find_one({"shift_id": r["shift_id"]})["threshold"] == 3000

    def test_zero_threshold_disables(self):
        from routes.project_daily_summary import send_cash_diff_alert
        mdb.projects.update_one({"id": BURGER}, {"$set": {"cash_diff_alert_threshold": 0}})
        r = _rec(999999)
        assert _run(send_cash_diff_alert(r)) == 0
        assert mdb.cash_diff_alerts.find_one({"shift_id": r["shift_id"]}) is None

    def test_non_enterprise_tenant_zero(self):
        from routes.project_daily_summary import send_cash_diff_alert
        t = mdb.tenants.find_one({"enterprise_enabled": {"$ne": True}})
        r = _rec(999999, tenant_id=t["id"])
        assert _run(send_cash_diff_alert(r)) == 0
        assert mdb.cash_diff_alerts.find_one({"shift_id": r["shift_id"]}) is None


class TestWeeklyBuilder:
    def test_message_lists_all_projects_sorted(self):
        from routes.project_daily_summary import build_owner_weekly_summary
        from routes.shared import get_database
        dates = [f"2026-01-{d:02d}" for d in range(1, 8)]
        ids = []
        for pid, sales, exp in ((BURGER, 90000, 10000), ('75dfb28d-94d9-4d09-976f-be3a0f471aa1', 50000, 5000)):
            i = f"TEST333-cl-{uuid.uuid4().hex[:6]}"; ids.append(i)
            mdb.cash_register_closings.insert_one({"id": i, "tenant_id": TID, "project_id": pid, "business_date": "2026-01-03",
                                                   "total_sales": sales, "total_expenses": exp, "orders_count": 3})
        try:
            async def go():
                return await build_owner_weekly_summary(get_database(), TID, dates)
            msg = _run(go())
            n_projects = mdb.projects.count_documents({"tenant_id": TID, "deleted_at": {"$exists": False}})
            assert msg.count("💰 المبيعات") == n_projects
            assert msg.index("مطعم البرغر الملكي") < msg.index("مطعم الشاورما الذهبي")
            assert "🥇 مطعم البرغر الملكي" in msg and "90,000" in msg and "80,000" in msg
        finally:
            mdb.cash_register_closings.delete_many({"id": {"$in": ids}})
