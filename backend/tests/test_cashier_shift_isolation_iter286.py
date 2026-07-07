"""
Iteration 286 — CRITICAL RETEST of iter285 bug fix:
Cashier A's order must NEVER attach to Cashier B's shift.

Fix location: /app/backend/server.py ~lines 7929-7937 — the branch-wide
"grab any open shift" fallback now applies ONLY to non-cashier roles.
A cashier with no own open shift MUST fall through to lazy-shift creation
that opens HIS OWN shift.

Test scenarios:
  A. CRITICAL: Insert fake open shift for cashier B; POST /api/orders as
     cashier A → order.shift_id != fake_shift.id, new shift's cashier_id == A.
  B. business_date follows 6 AM Iraq cutoff; order.business_date == shift.business_date.
  C. Owner regression: with a cashier's shift open, owner order attaches to it.
  D. GET /api/shifts/current returns none for cashier A pre-order.
  E. After closing cashier A's new shift: sales report AND cash-register-closings
     both include the order total (parity, tol 1 IQD). integrity/shifts-check ok.
"""
import os
import sys
import time
import pytest
import requests
from datetime import datetime, timezone, timedelta

sys.path.insert(0, "/app/backend")
try:
    from dotenv import load_dotenv
    load_dotenv("/app/backend/.env")
except Exception:
    pass
os.environ.setdefault("MONGO_URL", "mongodb://localhost:27017")
os.environ.setdefault("DB_NAME", "maestro_pos")

from pymongo import MongoClient  # noqa: E402

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL",
    "https://whatsapp-pos-system.preview.emergentagent.com").rstrip("/")
ADMIN_EMAIL = "admin@maestroegp.com"
ADMIN_PASS = "admin123"
CASHIER_EMAIL = "cashier1@maestroegp.com"
CASHIER_PASS = "cash123"
CASHIER_A_ID = "40bb3762-a015-4ca6-a83a-ae6c18743283"
FAKE_CASHIER_B_ID = "iter286-fake-cashier-b"
BRANCH_ID = "76f56acc-6948-4a2f-bbf4-feccbddea88f"
TENANT_ID = "default"
PRODUCT_ID = "765a9972-ec45-404d-ab20-055ecf1b2d13"
PRODUCT_PRICE = 5000.0
IRAQ_OFFSET = timedelta(hours=3)


def iraq_business_date_expected(cutoff_hour=6, ref_utc=None):
    iraq_now = (ref_utc or datetime.now(timezone.utc)) + IRAQ_OFFSET
    if iraq_now.hour < cutoff_hour:
        iraq_now = iraq_now - timedelta(days=1)
    return iraq_now.strftime("%Y-%m-%d")


# ============ Fixtures ============
@pytest.fixture(scope="module")
def db():
    client = MongoClient(os.environ["MONGO_URL"])
    return client[os.environ["DB_NAME"]]


@pytest.fixture(scope="module")
def admin_headers():
    r = requests.post(f"{BASE_URL}/api/auth/login",
                      json={"email": ADMIN_EMAIL, "password": ADMIN_PASS}, timeout=20)
    assert r.status_code == 200, f"Admin login failed: {r.status_code} {r.text}"
    tok = r.json().get("token") or r.json().get("access_token")
    return {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def cashier_headers():
    r = requests.post(f"{BASE_URL}/api/auth/login",
                      json={"email": CASHIER_EMAIL, "password": CASHIER_PASS}, timeout=20)
    if r.status_code != 200:
        pytest.skip(f"Cashier login failed: {r.status_code} {r.text[:200]}")
    tok = r.json().get("token") or r.json().get("access_token")
    return {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def clean_slate(admin_headers, db):
    """Close all open shifts in the branch. Insert one fake open shift for cashier B."""
    # Close all open shifts via API
    r = requests.get(f"{BASE_URL}/api/shifts?status=open&branch_id={BRANCH_ID}",
                     headers=admin_headers, timeout=20)
    if r.status_code == 200:
        for s in r.json() or []:
            try:
                requests.post(
                    f"{BASE_URL}/api/shifts/{s['id']}/close",
                    headers=admin_headers,
                    json={"closing_cash": float(s.get("opening_cash", 0) or 0)},
                    timeout=15,
                )
            except Exception:
                pass
    # Ensure DB-level any still-open shifts in this branch are forcibly closed
    db.shifts.update_many(
        {"branch_id": BRANCH_ID, "status": "open"},
        {"$set": {"status": "closed", "closed_at": datetime.now(timezone.utc).isoformat(),
                  "_iter286_forced_close": True}},
    )

    # Insert fake open shift for FAKE cashier B
    fake_shift_id = "iter286-fake-shift-B"
    db.shifts.delete_many({"id": fake_shift_id})
    now = datetime.now(timezone.utc).isoformat()
    fake_shift = {
        "id": fake_shift_id,
        "tenant_id": TENANT_ID,
        "branch_id": BRANCH_ID,
        "cashier_id": FAKE_CASHIER_B_ID,
        "cashier_name": "TEST_iter286_cashier_B",
        "opened_at": now,
        "started_at": now,
        "status": "open",
        "opening_balance": 0,
        "opening_cash": 0,
        "created_at": now,
        "business_date": iraq_business_date_expected(),
        "_iter286_seed": True,
    }
    db.shifts.insert_one(fake_shift)
    yield fake_shift_id

    # Cleanup
    db.shifts.delete_many({"_iter286_seed": True})
    db.shifts.delete_many({"id": fake_shift_id})


# ============ D. Pre-order shift/current check ============
class TestCashierPreOrderNoShift:
    def test_no_current_shift_for_cashier(self, cashier_headers, clean_slate, db):
        # Also ensure cashier A has NO open shift in DB (belt & braces)
        db.shifts.update_many(
            {"cashier_id": CASHIER_A_ID, "status": "open"},
            {"$set": {"status": "closed", "_iter286_forced_close_A": True,
                      "closed_at": datetime.now(timezone.utc).isoformat()}},
        )
        r = requests.get(f"{BASE_URL}/api/shifts/current", headers=cashier_headers, timeout=15)
        # Endpoint may return 200 with null/{}/message, or 404
        assert r.status_code in (200, 204, 404), r.text
        if r.status_code == 200:
            body = r.json() if r.text else None
            # Accept empty/None/dict-without-id
            if body and isinstance(body, dict) and body.get("id"):
                # If it returns the fake B shift → BUG. If it returns another cashier's
                # shift, the endpoint is filtering by branch not cashier. Fail loud.
                assert body.get("cashier_id") == CASHIER_A_ID, (
                    f"/api/shifts/current for cashier A returned another cashier's shift: {body}"
                )


# ============ A. CRITICAL retest ============
@pytest.fixture(scope="module")
def order_and_new_shift(cashier_headers, clean_slate, db):
    """POST /api/orders as cashier A while fake B shift is open in same branch."""
    unique = f"TEST_iter286_{int(time.time()*1000)}"
    payload = {
        "branch_id": BRANCH_ID,
        "items": [{
            "product_id": PRODUCT_ID,
            "product_name": "برغر كلاسيك",
            "name": "برغر كلاسيك",
            "quantity": 2,
            "price": PRODUCT_PRICE,
            "total": PRODUCT_PRICE * 2,
        }],
        "subtotal": PRODUCT_PRICE * 2,
        "total": PRODUCT_PRICE * 2,
        "payment_method": "cash",
        "order_type": "dine_in",
        "customer_name": unique,
        "offline_id": f"iter286-{unique}",
    }
    r = requests.post(f"{BASE_URL}/api/orders", headers=cashier_headers, json=payload, timeout=25)
    assert r.status_code in (200, 201), f"Order failed: {r.status_code} {r.text}"
    order = r.json()

    # Fetch cashier A's current shift
    r2 = requests.get(f"{BASE_URL}/api/shifts/current", headers=cashier_headers, timeout=15)
    assert r2.status_code == 200, r2.text
    shift = r2.json()
    return order, shift


class TestCashierIsolation:
    def test_order_not_attached_to_other_cashier_shift(self, order_and_new_shift, clean_slate):
        order, _ = order_and_new_shift
        assert order.get("shift_id") != clean_slate, (
            f"CRITICAL BUG STILL PRESENT: order.shift_id ({order.get('shift_id')}) "
            f"== fake cashier B's shift ({clean_slate})"
        )

    def test_new_shift_belongs_to_cashier_A(self, order_and_new_shift):
        _, shift = order_and_new_shift
        assert shift, "No shift returned from /api/shifts/current after order"
        assert shift.get("cashier_id") == CASHIER_A_ID, (
            f"New shift cashier_id={shift.get('cashier_id')} != cashier A ({CASHIER_A_ID}). Full: {shift}"
        )
        assert shift.get("status") == "open"

    def test_order_shift_id_matches_new_shift(self, order_and_new_shift):
        order, shift = order_and_new_shift
        assert order.get("shift_id") == shift.get("id"), (
            f"order.shift_id ({order.get('shift_id')}) != new shift id ({shift.get('id')})"
        )

    def test_fake_B_shift_untouched(self, order_and_new_shift, clean_slate, db):
        """Cashier B's shift totals must be unaffected."""
        b_shift = db.shifts.find_one({"id": clean_slate}, {"_id": 0})
        assert b_shift, "Fake B shift disappeared"
        assert b_shift.get("status") == "open", f"Fake B shift status changed: {b_shift.get('status')}"
        # Any total-like fields must be 0 / missing
        for k in ("total_sales", "total_orders", "cash_sales", "orders_count"):
            v = b_shift.get(k)
            if v is not None:
                assert float(v or 0) == 0, f"Fake B shift {k}={v} — expected 0"


# ============ B. Business-date cutoff parity ============
class TestBusinessDate:
    def test_shift_business_date_follows_cutoff(self, order_and_new_shift):
        _, shift = order_and_new_shift
        expected = iraq_business_date_expected()
        assert shift.get("business_date") == expected, (
            f"shift.business_date={shift.get('business_date')} != expected {expected}"
        )

    def test_order_business_date_matches_shift(self, order_and_new_shift):
        order, shift = order_and_new_shift
        assert order.get("business_date") == shift.get("business_date"), (
            f"order.business_date={order.get('business_date')} "
            f"!= shift.business_date={shift.get('business_date')}"
        )


# ============ E. Report / closing parity + integrity (must run BEFORE Owner) ============
class TestReportClosingParity:
    def test_close_and_verify_parity(self, admin_headers, order_and_new_shift):
        order, shift = order_and_new_shift
        biz_date = shift.get("business_date")
        order_total = float(order.get("total") or (PRODUCT_PRICE * 2))

        r = requests.post(
            f"{BASE_URL}/api/shifts/{shift['id']}/close",
            headers=admin_headers,
            json={"closing_cash": order_total + float(shift.get("opening_cash", 0) or 0)},
            timeout=20,
        )
        assert r.status_code == 200, f"Close failed: {r.status_code} {r.text}"

        r_s = requests.get(
            f"{BASE_URL}/api/reports/sales?start_date={biz_date}&end_date={biz_date}",
            headers=admin_headers, timeout=30,
        )
        assert r_s.status_code == 200, r_s.text
        s = r_s.json()
        sales_total = float(s.get("total_sales") or s.get("total")
                            or s.get("summary", {}).get("total_sales") or 0)

        r_c = requests.get(
            f"{BASE_URL}/api/reports/cash-register-closings?start_date={biz_date}&end_date={biz_date}",
            headers=admin_headers, timeout=30,
        )
        assert r_c.status_code == 200, r_c.text
        cj = r_c.json()
        closings = cj if isinstance(cj, list) else cj.get("closings") or cj.get("data") or []
        ours = next((c for c in closings
                     if c.get("shift_id") == shift["id"] or c.get("id") == shift["id"]), None)
        if not ours:
            ours = next((c for c in closings
                         if c.get("cashier_id") == CASHIER_A_ID and c.get("business_date") == biz_date), None)
        assert ours, f"No closing found for shift {shift['id']} on {biz_date}. closings={closings[:3]}"
        closing_total = float(ours.get("total_sales") or ours.get("total") or 0)

        assert abs(closing_total - order_total) <= 1, (
            f"Closing {closing_total} != order {order_total}"
        )
        assert sales_total + 1 >= closing_total, (
            f"Sales report {sales_total} < closing {closing_total}"
        )

    def test_integrity_check_ok(self, admin_headers, order_and_new_shift):
        _, shift = order_and_new_shift
        biz_date = shift.get("business_date")
        r = requests.get(f"{BASE_URL}/api/integrity/shifts-check?date={biz_date}",
                         headers=admin_headers, timeout=20)
        if r.status_code == 404:
            r = requests.get(
                f"{BASE_URL}/api/integrity/shifts-check?start_date={biz_date}&end_date={biz_date}",
                headers=admin_headers, timeout=20,
            )
        assert r.status_code == 200, f"integrity: {r.status_code} {r.text}"
        d = r.json()
        items = d if isinstance(d, list) else d.get("results") or d.get("shifts") or d.get("data") or []
        our = None
        if items:
            our = next((it for it in items
                        if it.get("shift_id") == shift["id"] or it.get("id") == shift["id"]), None)
        if our:
            status = our.get("status") or our.get("state")
            assert status in ("ok", "OK", "match", None), f"Integrity NOT ok: {our}"


# ============ C. Owner regression (runs LAST — closes remaining shifts) ============
class TestOwnerRegression:
    def test_owner_no_open_shift_returns_400(self, admin_headers, db):
        # Close everything in branch first (parity test class must run BEFORE this)
        db.shifts.update_many(
            {"branch_id": BRANCH_ID, "status": "open"},
            {"$set": {"status": "closed", "closed_at": datetime.now(timezone.utc).isoformat(),
                      "_iter286_owner_test_close": True}},
        )
        unique = f"TEST_iter286_owner_{int(time.time()*1000)}"
        payload = {
            "branch_id": BRANCH_ID,
            "items": [{"product_id": PRODUCT_ID, "product_name": "برغر كلاسيك",
                       "name": "برغر كلاسيك", "quantity": 1,
                       "price": PRODUCT_PRICE, "total": PRODUCT_PRICE}],
            "subtotal": PRODUCT_PRICE,
            "total": PRODUCT_PRICE,
            "payment_method": "cash",
            "order_type": "dine_in",
            "customer_name": unique,
            "offline_id": f"iter286-owner-noshift-{unique}",
        }
        r = requests.post(f"{BASE_URL}/api/orders", headers=admin_headers, json=payload, timeout=20)
        assert r.status_code == 400, f"Expected 400 for owner with no open shift, got {r.status_code}: {r.text}"
        assert "وردية" in r.text or "shift" in r.text.lower()

    def test_owner_attaches_to_open_cashier_shift(self, admin_headers, db):
        # Insert an open shift for cashier A
        db.shifts.update_many(
            {"branch_id": BRANCH_ID, "status": "open"},
            {"$set": {"status": "closed", "closed_at": datetime.now(timezone.utc).isoformat()}},
        )
        shift_id = "iter286-owner-attach-A"
        db.shifts.delete_many({"id": shift_id})
        now = datetime.now(timezone.utc).isoformat()
        db.shifts.insert_one({
            "id": shift_id,
            "tenant_id": TENANT_ID,
            "branch_id": BRANCH_ID,
            "cashier_id": CASHIER_A_ID,
            "cashier_name": "Cashier A",
            "opened_at": now,
            "started_at": now,
            "status": "open",
            "opening_balance": 0,
            "opening_cash": 0,
            "created_at": now,
            "business_date": iraq_business_date_expected(),
            "_iter286_seed": True,
        })

        unique = f"TEST_iter286_owner_ok_{int(time.time()*1000)}"
        payload = {
            "branch_id": BRANCH_ID,
            "items": [{"product_id": PRODUCT_ID, "product_name": "برغر كلاسيك",
                       "name": "برغر كلاسيك", "quantity": 1,
                       "price": PRODUCT_PRICE, "total": PRODUCT_PRICE}],
            "subtotal": PRODUCT_PRICE,
            "total": PRODUCT_PRICE,
            "payment_method": "cash",
            "order_type": "dine_in",
            "customer_name": unique,
            "offline_id": f"iter286-owner-{unique}",
        }
        r = requests.post(f"{BASE_URL}/api/orders", headers=admin_headers, json=payload, timeout=20)
        assert r.status_code in (200, 201), f"Owner order failed: {r.status_code} {r.text}"
        order = r.json()
        assert order.get("shift_id") == shift_id, (
            f"Owner order attached to {order.get('shift_id')} instead of open cashier shift {shift_id}"
        )
        # cleanup this owner test shift
        db.shifts.update_one({"id": shift_id}, {"$set": {"status": "closed"}})


# ============ (moved parity above) ============
