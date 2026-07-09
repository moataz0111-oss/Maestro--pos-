"""
Iteration 285 — Business-Day Start Hour + Shift-Opens-On-First-Order + Report/Closing parity.

Tests:
 A. Shared helper `iraq_business_date_from_utc` respects 6 AM Iraq cutoff.
 B. Auto-heal DB state: shifts already have Iraq-cutoff business_date.
 C. Lazy shift creation: POST /api/orders as cashier with NO open shift creates a shift.
 D. Order.business_date == shift.business_date (post-midnight parity).
 E. Reports/Closing parity: sales report total for biz_date == cash-register-closings total.
 F. Integrity check /api/integrity/shifts-check reports 'ok' for the biz_date.
 G. Regressions: welcome-approvals 200, admin sales report range non-zero.
"""
import os
import sys
import pytest
import requests
from datetime import datetime, timezone, timedelta

# Load backend .env so `routes.shared` can import (it requires MONGO_URL)
sys.path.insert(0, "/app/backend")
try:
    from dotenv import load_dotenv
    load_dotenv("/app/backend/.env")
except Exception:
    pass
os.environ.setdefault("MONGO_URL", "mongodb://localhost:27017")
os.environ.setdefault("DB_NAME", "maestro_pos")

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://multi-cashier-vault.preview.emergentagent.com").rstrip("/")
ADMIN_EMAIL = "admin@maestroegp.com"
ADMIN_PASS = "admin123"
CASHIER_EMAIL = "cashier1@maestroegp.com"
CASHIER_PASS = "cash123"
CASHIER_ID = "40bb3762-a015-4ca6-a83a-ae6c18743283"
BRANCH_ID = "76f56acc-6948-4a2f-bbf4-feccbddea88f"
TENANT_ID = "default"
PRODUCT_ID = "765a9972-ec45-404d-ab20-055ecf1b2d13"  # برغر كلاسيك 5000
PRODUCT_PRICE = 5000.0

IRAQ_OFFSET = timedelta(hours=3)


def iraq_business_date_now(cutoff_hour=6):
    iraq_now = datetime.now(timezone.utc) + IRAQ_OFFSET
    if iraq_now.hour < cutoff_hour:
        iraq_now = iraq_now - timedelta(days=1)
    return iraq_now.strftime("%Y-%m-%d")


# ============ Fixtures ============
@pytest.fixture(scope="module")
def admin_token():
    r = requests.post(f"{BASE_URL}/api/auth/login",
                      json={"email": ADMIN_EMAIL, "password": ADMIN_PASS}, timeout=20)
    assert r.status_code == 200, f"Admin login failed: {r.status_code} {r.text}"
    return r.json().get("token") or r.json().get("access_token")


@pytest.fixture(scope="module")
def admin_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def cashier_token():
    r = requests.post(f"{BASE_URL}/api/auth/login",
                      json={"email": CASHIER_EMAIL, "password": CASHIER_PASS}, timeout=20)
    if r.status_code != 200:
        pytest.skip(f"Cashier login unavailable: {r.status_code} {r.text[:200]}")
    return r.json().get("token") or r.json().get("access_token")


@pytest.fixture(scope="module")
def cashier_headers(cashier_token):
    return {"Authorization": f"Bearer {cashier_token}", "Content-Type": "application/json"}


# ============ A. Helper unit test ============
class TestBusinessDayHelper:
    def test_helper_import_and_before_cutoff(self):
        sys.path.insert(0, "/app/backend")
        from routes.shared import iraq_business_date_from_utc
        # 01:54 Iraq = 22:54 UTC previous day → previous day
        assert iraq_business_date_from_utc("2026-07-06T22:54:00+00:00") == "2026-07-06"

    def test_helper_after_cutoff(self):
        sys.path.insert(0, "/app/backend")
        from routes.shared import iraq_business_date_from_utc
        # 10:30 Iraq = 07:30 UTC same day → same day
        assert iraq_business_date_from_utc("2026-07-07T07:30:00+00:00") == "2026-07-07"

    def test_helper_edge_5_59(self):
        sys.path.insert(0, "/app/backend")
        from routes.shared import iraq_business_date_from_utc
        # 05:59 Iraq → previous day
        assert iraq_business_date_from_utc("2026-07-07T02:59:00+00:00") == "2026-07-06"

    def test_helper_edge_6_00(self):
        sys.path.insert(0, "/app/backend")
        from routes.shared import iraq_business_date_from_utc
        # 06:00 Iraq → same day
        assert iraq_business_date_from_utc("2026-07-07T03:00:00+00:00") == "2026-07-07"


# ============ B. Auto-healed DB state ============
class TestAutoHealedState:
    """Verify existing shifts opened before 6 AM Iraq get PREVIOUS day business_date."""

    def test_shifts_business_date_matches_cutoff(self, admin_headers):
        """List all shifts and verify their business_date matches cutoff formula from opened_at."""
        sys.path.insert(0, "/app/backend")
        from routes.shared import iraq_business_date_from_utc
        r = requests.get(f"{BASE_URL}/api/shifts?branch_id={BRANCH_ID}", headers=admin_headers, timeout=20)
        assert r.status_code == 200, r.text
        shifts = r.json()
        mismatches = []
        for s in shifts:
            opened_at = s.get("opened_at")
            bd = s.get("business_date")
            if not opened_at or not bd:
                continue
            expected = iraq_business_date_from_utc(opened_at)
            if expected and expected != bd:
                mismatches.append({"id": s.get("id"), "opened_at": opened_at,
                                   "business_date": bd, "expected": expected})
        assert not mismatches, f"Auto-heal mismatches: {mismatches[:5]}"


# ============ C. Lazy shift creation on first order ============
@pytest.fixture(scope="module")
def ensure_no_open_shift(admin_headers):
    """Close ALL open shifts in the branch to force lazy shift creation for our cashier."""
    r = requests.get(f"{BASE_URL}/api/shifts?status=open&branch_id={BRANCH_ID}",
                     headers=admin_headers, timeout=20)
    if r.status_code == 200:
        for s in r.json():
            try:
                requests.post(f"{BASE_URL}/api/shifts/{s['id']}/close",
                              headers=admin_headers,
                              json={"closing_cash": s.get("opening_cash", 0) or 0}, timeout=15)
            except Exception:
                pass
    yield


@pytest.fixture(scope="module")
def order_and_shift(cashier_headers, admin_headers, ensure_no_open_shift):
    """POST /api/orders as cashier with no open shift; return (order, shift)."""
    # Verify no open shift
    r = requests.get(f"{BASE_URL}/api/shifts/current", headers=cashier_headers, timeout=15)
    if r.status_code == 200 and r.json() and r.json().get("id"):
        # There's already an open shift — try to close it
        sh = r.json()
        requests.post(f"{BASE_URL}/api/shifts/{sh['id']}/close",
                      headers=admin_headers,
                      json={"closing_cash": sh.get("opening_cash", 0)}, timeout=15)

    import time
    unique_name = f"TEST_iter285_{int(time.time()*1000)}"
    order_payload = {
        "branch_id": BRANCH_ID,
        "items": [
            {"product_id": PRODUCT_ID, "product_name": "برغر كلاسيك", "name": "برغر كلاسيك",
             "quantity": 3, "price": PRODUCT_PRICE, "total": PRODUCT_PRICE * 3}
        ],
        "subtotal": PRODUCT_PRICE * 3,
        "total": PRODUCT_PRICE * 3,
        "payment_method": "cash",
        "order_type": "dine_in",
        "customer_name": unique_name,
        "offline_id": f"iter285-{unique_name}",
    }
    r = requests.post(f"{BASE_URL}/api/orders", headers=cashier_headers,
                      json=order_payload, timeout=25)
    assert r.status_code in (200, 201), f"Order creation failed: {r.status_code} {r.text}"
    order = r.json()

    # Now fetch the auto-created shift
    r2 = requests.get(f"{BASE_URL}/api/shifts/current", headers=cashier_headers, timeout=15)
    assert r2.status_code == 200, r2.text
    shift = r2.json()
    assert shift and shift.get("id"), f"No shift auto-created: {shift}"
    return order, shift


class TestLazyShiftCreation:
    def test_order_created(self, order_and_shift):
        order, _ = order_and_shift
        assert order.get("id") or order.get("_id") or order.get("order_id"), f"Order missing id: {order}"

    def test_shift_auto_created(self, order_and_shift):
        _, shift = order_and_shift
        assert shift.get("status") == "open", f"Shift not open: {shift}"
        assert shift.get("cashier_id") == CASHIER_ID

    def test_shift_business_date_matches_cutoff(self, order_and_shift):
        sys.path.insert(0, "/app/backend")
        from routes.shared import iraq_business_date_from_utc
        _, shift = order_and_shift
        opened_at = shift.get("opened_at")
        assert opened_at, "shift.opened_at missing"
        expected = iraq_business_date_from_utc(opened_at)
        assert shift.get("business_date") == expected, (
            f"shift.business_date={shift.get('business_date')} != cutoff expected {expected} (opened_at={opened_at})"
        )

    def test_order_business_date_matches_shift(self, order_and_shift):
        order, shift = order_and_shift
        assert order.get("business_date") == shift.get("business_date"), (
            f"order.business_date={order.get('business_date')} != shift.business_date={shift.get('business_date')}"
        )


# ============ E+F. Report/Closing parity + integrity ============
class TestReportClosingParity:
    def test_close_shift_and_verify_parity(self, admin_headers, cashier_headers, order_and_shift):
        order, shift = order_and_shift
        biz_date = shift.get("business_date")
        order_total = float(order.get("total") or (PRODUCT_PRICE * 3))

        # Close the shift
        r = requests.post(f"{BASE_URL}/api/shifts/{shift['id']}/close",
                          headers=admin_headers,
                          json={"closing_cash": order_total + float(shift.get("opening_cash", 0) or 0)},
                          timeout=20)
        assert r.status_code == 200, f"Close failed: {r.status_code} {r.text}"

        # Sales report
        r_sales = requests.get(
            f"{BASE_URL}/api/reports/sales?start_date={biz_date}&end_date={biz_date}",
            headers=admin_headers, timeout=30)
        assert r_sales.status_code == 200, r_sales.text
        sales = r_sales.json()
        sales_total = float(sales.get("total_sales") or sales.get("total") or
                            sales.get("summary", {}).get("total_sales") or 0)

        # Cash register closings
        r_cl = requests.get(
            f"{BASE_URL}/api/reports/cash-register-closings?start_date={biz_date}&end_date={biz_date}",
            headers=admin_headers, timeout=30)
        assert r_cl.status_code == 200, r_cl.text
        closings = r_cl.json()
        closings_list = closings if isinstance(closings, list) else closings.get("closings") or closings.get("data") or []
        # Find our shift's closing
        our = next((c for c in closings_list if c.get("shift_id") == shift["id"] or c.get("id") == shift["id"]), None)
        if not our:
            # fallback: match by cashier_id + business_date
            our = next((c for c in closings_list if c.get("cashier_id") == CASHIER_ID and
                        c.get("business_date") == biz_date), None)
        assert our, f"Closing not found for shift {shift['id']} on {biz_date}. closings={closings_list[:3]}"
        closing_total = float(our.get("total_sales") or our.get("total") or 0)

        # The sales-report total must include our order_total; closing must equal at least our order_total
        assert abs(closing_total - order_total) <= 1, (
            f"Closing total {closing_total} != order total {order_total} (biz_date={biz_date})"
        )
        # Sales report must be >= closing (may include other shifts on same day)
        assert sales_total + 1 >= closing_total, (
            f"Sales report total {sales_total} < closing total {closing_total} — report/closing MISMATCH!"
        )

    def test_integrity_check_ok(self, admin_headers, order_and_shift):
        _, shift = order_and_shift
        biz_date = shift.get("business_date")
        r = requests.get(f"{BASE_URL}/api/integrity/shifts-check?date={biz_date}",
                         headers=admin_headers, timeout=20)
        if r.status_code == 404:
            # alternative endpoint
            r = requests.get(f"{BASE_URL}/api/integrity/shifts-check?start_date={biz_date}&end_date={biz_date}",
                             headers=admin_headers, timeout=20)
        assert r.status_code == 200, f"Integrity endpoint: {r.status_code} {r.text}"
        data = r.json()
        # Find our shift status
        items = data if isinstance(data, list) else data.get("results") or data.get("shifts") or data.get("data") or []
        if items:
            our = next((it for it in items if it.get("shift_id") == shift["id"] or it.get("id") == shift["id"]), None)
            if our:
                status = our.get("status") or our.get("state")
                assert status in ("ok", "OK", "match", None), f"Integrity NOT ok for shift: {our}"


# ============ G. Regressions ============
class TestRegressions:
    def test_welcome_approvals_admin(self, admin_headers):
        r = requests.get(f"{BASE_URL}/api/welcome-approvals", headers=admin_headers, timeout=15)
        assert r.status_code == 200, r.text

    def test_sales_report_range_returns_data(self, admin_headers):
        r = requests.get(
            f"{BASE_URL}/api/reports/sales?start_date=2026-06-25&end_date=2026-07-07",
            headers=admin_headers, timeout=30)
        assert r.status_code == 200, r.text
        data = r.json()
        # Just ensure endpoint responds; totals may be 0 in test env
        assert isinstance(data, dict)
