"""Backend tests for Integrity Check feature + closings business_date filter.

Covers:
- /api/integrity/shifts-check auth (admin 200, cashier 403)
- Row structure (stored vs actual) & Arabic issues on mismatch
- Manual mismatch injection: fake order flips shift to mismatch, cleanup reverts to ok
- notify=true dedupes db.notifications integrity_alert
- /api/reports/cash-register-closings business_date-first filter
- All cash_register_closings docs have business_date == linked shift.business_date
"""

import os
import uuid
import datetime as dt
import pytest
import requests
from pymongo import MongoClient

BASE = os.environ.get("REACT_APP_BACKEND_URL", "https://multi-cashier-vault.preview.emergentagent.com").rstrip("/")
MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "test_database")

ADMIN = {"email": "admin@maestroegp.com", "password": "admin123"}


@pytest.fixture(scope="module")
def db():
    return MongoClient(MONGO_URL)[DB_NAME]


def _login(payload):
    r = requests.post(f"{BASE}/api/auth/login", json=payload, timeout=15)
    if r.status_code != 200:
        return None
    d = r.json()
    return d.get("token") or d.get("access_token")


@pytest.fixture(scope="module")
def admin_token():
    tok = _login(ADMIN)
    if not tok:
        pytest.skip("admin login failed")
    return tok


@pytest.fixture(scope="module")
def admin_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}"}


@pytest.fixture(scope="module")
def cashier_token(db):
    """Find any cashier user and get token; falls back to skip."""
    users = list(db.users.find({"tenant_id": "default", "role": "cashier"}, {"email": 1, "password_hash": 1}).limit(5))
    # Try common test passwords
    candidates = [
        {"email": u["email"], "password": p}
        for u in users
        for p in ["cashier123", "admin123", "123456", "password"]
    ]
    for c in candidates:
        tok = _login(c)
        if tok:
            return tok
    return None


class TestIntegrityAuth:
    def test_admin_gets_results(self, admin_headers):
        r = requests.get(
            f"{BASE}/api/integrity/shifts-check",
            params={"start_date": "2026-06-25", "end_date": "2026-07-07"},
            headers=admin_headers, timeout=30,
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert set(["checked", "ok_count", "mismatch_count", "rows"]).issubset(data.keys())
        assert isinstance(data["rows"], list)
        assert data["checked"] == len(data["rows"])
        # sanity: at least a few rows exist for that range
        assert data["checked"] >= 1

    def test_row_structure(self, admin_headers):
        r = requests.get(
            f"{BASE}/api/integrity/shifts-check",
            params={"start_date": "2026-06-25", "end_date": "2026-07-07"},
            headers=admin_headers, timeout=30,
        )
        data = r.json()
        for row in data["rows"]:
            assert "status" in row and row["status"] in ("ok", "mismatch")
            assert "stored" in row and "actual" in row
            assert "issues" in row and isinstance(row["issues"], list)
            # stored/actual should have total_sales
            assert "total_sales" in row["stored"] or "total_sales" in (row.get("stored") or {})
            assert "total_sales" in row["actual"]

    def test_cashier_forbidden(self, cashier_token):
        if not cashier_token:
            pytest.skip("no cashier account available")
        r = requests.get(
            f"{BASE}/api/integrity/shifts-check",
            params={"start_date": "2026-06-25", "end_date": "2026-07-07"},
            headers={"Authorization": f"Bearer {cashier_token}"}, timeout=15,
        )
        assert r.status_code == 403, f"expected 403, got {r.status_code} {r.text[:200]}"


class TestIntegrityCorrectness:
    def test_ok_shift_totals_match_orders(self, admin_headers, db):
        r = requests.get(
            f"{BASE}/api/integrity/shifts-check",
            params={"start_date": "2026-06-25", "end_date": "2026-07-07"},
            headers=admin_headers, timeout=30,
        )
        rows = r.json()["rows"]
        ok_rows = [x for x in rows if x["status"] == "ok"]
        if not ok_rows:
            pytest.skip("no ok row to verify")
        row = ok_rows[0]
        assert abs(float(row["stored"].get("total_sales", 0)) - float(row["actual"]["total_sales"])) < 0.01

    def test_inject_mismatch_and_cleanup(self, admin_headers, db):
        r = requests.get(
            f"{BASE}/api/integrity/shifts-check",
            params={"start_date": "2026-06-25", "end_date": "2026-07-07"},
            headers=admin_headers, timeout=30,
        )
        rows = r.json()["rows"]
        ok_rows = [x for x in rows if x["status"] == "ok"]
        if not ok_rows:
            pytest.skip("no ok row available for injection test")

        row0 = ok_rows[0]
        shift_id = row0.get("shift_id") or row0.get("id")
        branch_id = row0.get("branch_id")
        assert shift_id, f"row missing shift_id: {row0}"

        fake_order_id = f"TEST_INTEGRITY_{uuid.uuid4()}"
        db.orders.insert_one({
            "id": fake_order_id,
            "tenant_id": "default",
            "branch_id": branch_id,
            "shift_id": shift_id,
            "status": "completed",
            "total": 99999.0,
            "total_amount": 99999.0,
            "created_at": dt.datetime.now(dt.timezone.utc).isoformat(),
            "items": [],
        })

        try:
            r2 = requests.get(
                f"{BASE}/api/integrity/shifts-check",
                params={"start_date": "2026-06-25", "end_date": "2026-07-07"},
                headers=admin_headers, timeout=30,
            )
            flipped = next((x for x in r2.json()["rows"] if (x.get("shift_id") or x.get("id")) == shift_id), None)
            assert flipped is not None, "shift missing after injection"
            assert flipped["status"] == "mismatch", f"shift did not flip: {flipped}"
            issues_txt = " ".join(flipped["issues"])
            assert "الطلبات" in issues_txt or "مبيعات" in issues_txt, f"expected Arabic issue text, got: {issues_txt}"
        finally:
            db.orders.delete_one({"id": fake_order_id})

        r3 = requests.get(
            f"{BASE}/api/integrity/shifts-check",
            params={"start_date": "2026-06-25", "end_date": "2026-07-07"},
            headers=admin_headers, timeout=30,
        )
        restored = next((x for x in r3.json()["rows"] if (x.get("shift_id") or x.get("id")) == shift_id), None)
        assert restored and restored["status"] == "ok", f"shift did not return to ok: {restored}"


class TestNotifyDedup:
    def test_notify_creates_and_dedups(self, admin_headers, db):
        # First call
        requests.get(
            f"{BASE}/api/integrity/shifts-check",
            params={"start_date": "2026-06-25", "end_date": "2026-07-07", "notify": "true"},
            headers=admin_headers, timeout=30,
        )
        before = db.notifications.count_documents({"type": "integrity_alert", "tenant_id": "default"})
        assert before >= 1, "expected at least 1 integrity_alert notification from startup or first call"

        # Second call – should NOT create duplicates
        requests.get(
            f"{BASE}/api/integrity/shifts-check",
            params={"start_date": "2026-06-25", "end_date": "2026-07-07", "notify": "true"},
            headers=admin_headers, timeout=30,
        )
        after = db.notifications.count_documents({"type": "integrity_alert", "tenant_id": "default"})
        assert after == before, f"dedup failed: before={before} after={after}"


class TestClosingsBusinessDate:
    def test_all_closings_have_matching_business_date(self, db):
        closings = list(db.cash_register_closings.find({"tenant_id": "default"}))
        assert len(closings) > 0
        missing = 0
        mismatch = []
        for c in closings:
            if not c.get("business_date"):
                missing += 1
                continue
            shift = db.shifts.find_one({"id": c.get("shift_id"), "tenant_id": "default"}) if c.get("shift_id") else None
            if shift and shift.get("business_date") and shift["business_date"] != c["business_date"]:
                mismatch.append({"closing_id": c.get("id"), "closing_bd": c["business_date"], "shift_bd": shift["business_date"]})
        assert missing == 0, f"{missing} closings missing business_date"
        assert not mismatch, f"business_date mismatches: {mismatch[:5]}"

    def test_closings_report_filters_by_business_date(self, admin_headers, db):
        target = "2026-07-06"
        r = requests.get(
            f"{BASE}/api/reports/cash-register-closings",
            params={"start_date": target, "end_date": target},
            headers=admin_headers, timeout=30,
        )
        assert r.status_code == 200, r.text
        payload = r.json()
        items = payload if isinstance(payload, list) else (payload.get("closings") or payload.get("data") or payload.get("items") or [])
        # Check every returned item's business_date == target (may be missing key if API strips it, then check via db)
        wrong_day = []
        for it in items:
            bd = it.get("business_date")
            if bd is None:
                # look up from db
                cdoc = db.cash_register_closings.find_one({"id": it.get("id")})
                bd = cdoc.get("business_date") if cdoc else None
            if bd and bd != target:
                wrong_day.append({"id": it.get("id"), "bd": bd})
        assert not wrong_day, f"closings leaked from other days: {wrong_day[:5]}"
