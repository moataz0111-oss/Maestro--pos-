"""
Iteration 167 - Backend tests:
- Smart Reports: new periods (yesterday, last_month, six_months, year) for sales & products
- /api/reports/expenses: cashier_id filter + business_date with legacy fallback
- /api/reports/* endpoints: business_date refactor via _apply_business_date_filter
- Verify migration idempotency
"""
import os
import pytest
import requests
from datetime import datetime, timedelta, timezone

def _load_backend_url():
    # Try env first; else parse /app/frontend/.env
    val = os.environ.get("REACT_APP_BACKEND_URL")
    if val:
        return val.rstrip("/")
    try:
        with open("/app/frontend/.env") as f:
            for line in f:
                if line.startswith("REACT_APP_BACKEND_URL="):
                    return line.strip().split("=", 1)[1].rstrip("/")
    except Exception:
        pass
    raise RuntimeError("REACT_APP_BACKEND_URL not set")


BASE_URL = _load_backend_url()
ADMIN_EMAIL = "hanialdujaili@gmail.com"
ADMIN_PASSWORD = "Hani@2024"


# ---------- Fixtures ----------
@pytest.fixture(scope="module")
def admin_token():
    r = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
        timeout=20,
    )
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    tok = r.json().get("access_token") or r.json().get("token")
    assert tok, f"no token in response: {r.json()}"
    return tok


@pytest.fixture(scope="module")
def headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def some_cashier_id(headers):
    """Find an existing user id we can use as cashier_id (any user from /api/users)."""
    r = requests.get(f"{BASE_URL}/api/users", headers=headers, timeout=20)
    if r.status_code != 200:
        return None
    users = r.json() if isinstance(r.json(), list) else r.json().get("users", [])
    if not users:
        return None
    # Prefer cashier role if exists
    for u in users:
        if u.get("role") == "cashier":
            return u.get("id") or u.get("_id")
    return users[0].get("id") or users[0].get("_id")


# ---------- Smart Reports: New periods (sales) ----------
SMART_PERIODS = ["yesterday", "last_month", "six_months", "year"]


@pytest.mark.parametrize("period", SMART_PERIODS)
def test_smart_reports_sales_new_periods(headers, period):
    r = requests.get(
        f"{BASE_URL}/api/smart-reports/sales",
        headers=headers,
        params={"period": period},
        timeout=30,
    )
    assert r.status_code == 200, f"period={period} -> {r.status_code} {r.text[:300]}"
    data = r.json()
    # Expected core keys (response is a dict)
    assert isinstance(data, dict), f"expected dict response for period={period}"
    # numeric fields should be numbers (no error)
    assert "total_sales" in data or "total_orders" in data, (
        f"missing total_sales/total_orders for period={period}: keys={list(data.keys())}"
    )


@pytest.mark.parametrize("period", SMART_PERIODS)
def test_smart_reports_products_new_periods(headers, period):
    r = requests.get(
        f"{BASE_URL}/api/smart-reports/products",
        headers=headers,
        params={"period": period, "limit": 5},
        timeout=30,
    )
    assert r.status_code == 200, f"period={period} -> {r.status_code} {r.text[:300]}"
    data = r.json()
    assert isinstance(data, (dict, list)), f"unexpected type for period={period}: {type(data)}"


def test_smart_reports_sales_yesterday_filters_correctly(headers):
    """Verify yesterday window doesn't include today's data — no orders dated today should appear in totals.
    We just check the call returns 200 and field consistency (orders <= total)."""
    r = requests.get(
        f"{BASE_URL}/api/smart-reports/sales",
        headers=headers,
        params={"period": "yesterday"},
        timeout=30,
    )
    assert r.status_code == 200
    data = r.json()
    # If total_orders is reported, total_sales must be >= 0
    assert data.get("total_sales", 0) >= 0
    assert data.get("total_orders", 0) >= 0


def test_smart_reports_sales_last_month_returns_finite_value(headers):
    r = requests.get(
        f"{BASE_URL}/api/smart-reports/sales",
        headers=headers,
        params={"period": "last_month"},
        timeout=30,
    )
    assert r.status_code == 200
    data = r.json()
    # total_sales of last_month should be >= 0
    assert isinstance(data.get("total_sales", 0), (int, float))


def test_smart_reports_sales_six_months_ge_month(headers):
    """six_months window should return total_sales >= month window (monotonic over wider range)."""
    r_month = requests.get(
        f"{BASE_URL}/api/smart-reports/sales",
        headers=headers,
        params={"period": "month"},
        timeout=30,
    )
    r_six = requests.get(
        f"{BASE_URL}/api/smart-reports/sales",
        headers=headers,
        params={"period": "six_months"},
        timeout=30,
    )
    assert r_month.status_code == 200 and r_six.status_code == 200
    # Allow equality (no extra orders) - just shouldn't be less
    assert r_six.json().get("total_sales", 0) + 0.001 >= r_month.json().get("total_sales", 0), (
        f"six_months({r_six.json().get('total_sales')}) < month({r_month.json().get('total_sales')})"
    )


# ---------- Reports: Expenses with cashier_id filter ----------
def test_reports_expenses_basic(headers):
    r = requests.get(f"{BASE_URL}/api/reports/expenses", headers=headers, timeout=30)
    assert r.status_code == 200, f"{r.status_code} {r.text[:300]}"
    d = r.json()
    assert "total_expenses" in d
    assert "expenses" in d
    assert isinstance(d["expenses"], list)
    assert "by_cashier" in d


def test_reports_expenses_with_cashier_filter(headers, some_cashier_id):
    """cashier_id should narrow results to expenses created_by=that id (or empty)."""
    if not some_cashier_id:
        pytest.skip("no users to use as cashier_id")
    r = requests.get(
        f"{BASE_URL}/api/reports/expenses",
        headers=headers,
        params={"cashier_id": some_cashier_id},
        timeout=30,
    )
    assert r.status_code == 200, f"{r.status_code} {r.text[:300]}"
    d = r.json()
    assert "expenses" in d
    # Every returned expense must have created_by == cashier_id (if any)
    for e in d["expenses"]:
        # Some legacy may not store created_by, but if present it must match
        cb = e.get("created_by")
        if cb:
            assert cb == some_cashier_id, (
                f"cashier filter leak: expense created_by={cb} != {some_cashier_id}"
            )


def test_reports_expenses_with_invalid_cashier_returns_empty(headers):
    r = requests.get(
        f"{BASE_URL}/api/reports/expenses",
        headers=headers,
        params={"cashier_id": "nonexistent-id-xyz-zzz"},
        timeout=30,
    )
    assert r.status_code == 200
    d = r.json()
    assert d["total_expenses"] == 0
    assert d["expenses"] == []


def test_reports_expenses_with_date_range(headers):
    today = datetime.now(timezone.utc).date()
    start = (today - timedelta(days=30)).isoformat()
    end = today.isoformat()
    r = requests.get(
        f"{BASE_URL}/api/reports/expenses",
        headers=headers,
        params={"start_date": start, "end_date": end},
        timeout=30,
    )
    assert r.status_code == 200, f"{r.status_code} {r.text[:300]}"
    d = r.json()
    assert "expenses" in d
    assert "total_expenses" in d


def test_reports_expenses_combined_filters(headers, some_cashier_id):
    if not some_cashier_id:
        pytest.skip("no users to use as cashier_id")
    today = datetime.now(timezone.utc).date()
    start = (today - timedelta(days=60)).isoformat()
    end = today.isoformat()
    r = requests.get(
        f"{BASE_URL}/api/reports/expenses",
        headers=headers,
        params={
            "start_date": start,
            "end_date": end,
            "cashier_id": some_cashier_id,
        },
        timeout=30,
    )
    assert r.status_code == 200, f"{r.status_code} {r.text[:300]}"


# ---------- All other /api/reports/* endpoints with date range ----------
DATE_RANGE_ENDPOINTS = [
    "/api/reports/sales",
    "/api/reports/purchases",
    "/api/reports/products",
    "/api/reports/profit-loss",
    "/api/reports/delivery-credits",
    "/api/reports/cancellations",
    "/api/reports/discounts",
    "/api/reports/credit",
    "/api/reports/card",
]


@pytest.mark.parametrize("endpoint", DATE_RANGE_ENDPOINTS)
def test_reports_endpoint_with_date_range(headers, endpoint):
    today = datetime.now(timezone.utc).date()
    start = (today - timedelta(days=30)).isoformat()
    end = today.isoformat()
    r = requests.get(
        f"{BASE_URL}{endpoint}",
        headers=headers,
        params={"start_date": start, "end_date": end},
        timeout=30,
    )
    assert r.status_code == 200, (
        f"{endpoint} failed: {r.status_code} {r.text[:300]}"
    )
    # Response must be parseable JSON dict
    j = r.json()
    assert isinstance(j, (dict, list)), f"{endpoint} bad type: {type(j)}"


@pytest.mark.parametrize("endpoint", DATE_RANGE_ENDPOINTS)
def test_reports_endpoint_no_date_filter(headers, endpoint):
    """Without date params - shouldn't crash. Some endpoints (cancellations, discounts,
    credit, card) require dates by design; for those, 422 is acceptable."""
    REQUIRES_DATES = {
        "/api/reports/cancellations",
        "/api/reports/discounts",
        "/api/reports/credit",
        "/api/reports/card",
    }
    r = requests.get(f"{BASE_URL}{endpoint}", headers=headers, timeout=30)
    if endpoint in REQUIRES_DATES:
        assert r.status_code in (200, 422), f"{endpoint}: {r.status_code} {r.text[:200]}"
    else:
        assert r.status_code == 200, f"{endpoint} (no dates): {r.status_code} {r.text[:300]}"


# ---------- Migration idempotency ----------
def test_migration_business_dates_idempotent(headers):
    """Re-running business_date migration must succeed; repeated runs return zeros (already migrated)."""
    r = requests.post(
        f"{BASE_URL}/api/admin/migrate-business-dates", headers=headers, timeout=60
    )
    assert r.status_code == 200, f"{r.status_code} {r.text[:300]}"
    d1 = r.json()
    # Second run
    r2 = requests.post(
        f"{BASE_URL}/api/admin/migrate-business-dates", headers=headers, timeout=60
    )
    assert r2.status_code == 200
    d2 = r2.json()
    # Either 'stats' key or flat - flexible check
    stats1 = d1.get("stats", d1)
    stats2 = d2.get("stats", d2)
    # the second run shifts/orders/expenses updated should be 0
    for key in ("shifts_updated", "orders_updated", "expenses_updated"):
        if key in stats2:
            assert stats2[key] == 0, (
                f"migration not idempotent: {key} second run={stats2[key]} (first run={stats1.get(key)})"
            )


# ---------- Smoke test for invalid period (should fall through to default) ----------
def test_smart_reports_sales_invalid_period_default(headers):
    r = requests.get(
        f"{BASE_URL}/api/smart-reports/sales",
        headers=headers,
        params={"period": "garbage_period_xyz"},
        timeout=30,
    )
    # Should default to today's window per code, no 500
    assert r.status_code == 200
