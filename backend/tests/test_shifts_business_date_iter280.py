"""
Iteration 280 — Backend tests for the Iraq-timezone business_date fix on shifts + regressions.
Verifies:
  1. POST open shift stores business_date == Iraq date (UTC+3), not UTC date.
  2. GET /api/shifts?date_from=<iraq_today>&date_to=<iraq_today> returns today's shift.
  3. GET /api/shifts?date_from=<iraq_yesterday>&date_to=<iraq_yesterday> does NOT return it.
  4. Regression: GET /api/welcome-approvals returns 200 for admin.
"""
import os
import pytest
import requests
from datetime import datetime, timezone, timedelta

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://multi-cashier-vault.preview.emergentagent.com").rstrip("/")
ADMIN_EMAIL = "admin@maestroegp.com"
ADMIN_PASS = "admin123"
CASHIER_ID = "40bb3762-a015-4ca6-a83a-ae6c18743283"
BRANCH_ID = "76f56acc-6948-4a2f-bbf4-feccbddea88f"

IRAQ_OFFSET = timedelta(hours=3)


def iraq_today() -> str:
    return (datetime.now(timezone.utc) + IRAQ_OFFSET).strftime("%Y-%m-%d")


def iraq_yesterday() -> str:
    return (datetime.now(timezone.utc) + IRAQ_OFFSET - timedelta(days=1)).strftime("%Y-%m-%d")


def utc_today() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d")


@pytest.fixture(scope="module")
def admin_token():
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASS}, timeout=15)
    assert r.status_code == 200, r.text
    return r.json()["token"]


@pytest.fixture(scope="module")
def auth_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def opened_shift(auth_headers):
    """Ensure a shift is open for CASHIER_ID; if conflict, fetch existing open one."""
    # Try to open a new shift
    payload = {"cashier_id": CASHIER_ID, "branch_id": BRANCH_ID, "opening_cash": 100.0}
    r = requests.post(f"{BASE_URL}/api/shifts", headers=auth_headers, json=payload, timeout=15)
    if r.status_code == 200:
        shift = r.json()
        yield shift
        # cleanup: close
        try:
            requests.post(f"{BASE_URL}/api/shifts/{shift['id']}/close", headers=auth_headers,
                          json={"closing_cash": 100.0}, timeout=15)
        except Exception:
            pass
        return
    # Conflict — reuse existing open shift for this cashier
    lst = requests.get(f"{BASE_URL}/api/shifts?status=open&branch_id={BRANCH_ID}", headers=auth_headers, timeout=15).json()
    existing = next((s for s in lst if s.get("cashier_id") == CASHIER_ID), None)
    if not existing:
        pytest.skip(f"Could not open or find open shift: {r.status_code} {r.text}")
    yield existing


class TestShiftBusinessDate:
    def test_open_shift_business_date_is_iraq_date(self, opened_shift):
        """The core fix: business_date must be Iraq's local date, not UTC date."""
        iraq = iraq_today()
        utc = utc_today()
        assert opened_shift.get("business_date") == iraq, (
            f"business_date={opened_shift.get('business_date')} expected Iraq date {iraq} (UTC was {utc})"
        )

    def test_shift_appears_under_iraq_today_filter(self, auth_headers, opened_shift):
        iraq = iraq_today()
        r = requests.get(f"{BASE_URL}/api/shifts?date_from={iraq}&date_to={iraq}", headers=auth_headers, timeout=15)
        assert r.status_code == 200, r.text
        ids = [s["id"] for s in r.json()]
        assert opened_shift["id"] in ids, f"Shift {opened_shift['id']} missing from Iraq-today filter {iraq}"

    def test_shift_NOT_under_iraq_yesterday(self, auth_headers, opened_shift):
        yday = iraq_yesterday()
        r = requests.get(f"{BASE_URL}/api/shifts?date_from={yday}&date_to={yday}", headers=auth_headers, timeout=15)
        assert r.status_code == 200
        ids = [s["id"] for s in r.json()]
        assert opened_shift["id"] not in ids, f"Shift wrongly appears under yesterday ({yday})"

    def test_shift_NOT_under_utc_today_when_different(self, auth_headers, opened_shift):
        """If UTC date differs from Iraq date (typical 21:00-24:00 UTC window), UTC-date filter must NOT return it."""
        iraq = iraq_today()
        utc = utc_today()
        if utc == iraq:
            pytest.skip("UTC date == Iraq date now; bug window closed")
        r = requests.get(f"{BASE_URL}/api/shifts?date_from={utc}&date_to={utc}", headers=auth_headers, timeout=15)
        assert r.status_code == 200
        ids = [s["id"] for s in r.json()]
        assert opened_shift["id"] not in ids, (
            f"Shift business_date={opened_shift.get('business_date')} incorrectly returned under UTC date {utc}"
        )


class TestRegressionWelcomeApprovals:
    def test_welcome_approvals_admin_200(self, auth_headers):
        r = requests.get(f"{BASE_URL}/api/welcome-approvals", headers=auth_headers, timeout=15)
        assert r.status_code == 200, r.text
        data = r.json()
        assert isinstance(data, (list, dict))
        if isinstance(data, dict):
            assert "pending" in data or "count" in data
