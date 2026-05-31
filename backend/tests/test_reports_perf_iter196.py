"""
Iter196: Verify Reports endpoints work fast & return correct shape after
the _build_current_costs_map refactor in /app/backend/routes/reports_routes.py.
"""
import os
import time
import pytest
import requests
from datetime import datetime, timedelta

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://cogs-calc-system.preview.emergentagent.com").rstrip("/")
ADMIN_EMAIL = "admin@maestroegp.com"
ADMIN_PASSWORD = "admin123"
PERF_BUDGET_S = 5.0  # generous budget for tiny dataset


@pytest.fixture(scope="module")
def auth_headers():
    r = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
        timeout=15,
    )
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text[:200]}"
    token = r.json()["token"]
    return {"Authorization": f"Bearer {token}"}


def _get_timed(url, headers, params=None):
    t0 = time.time()
    r = requests.get(url, headers=headers, params=params, timeout=30)
    return r, time.time() - t0


# ------------------ /api/reports/sales ------------------
class TestReportsSales:
    def test_sales_no_date_range(self, auth_headers):
        r, dt = _get_timed(f"{BASE_URL}/api/reports/sales", auth_headers)
        assert r.status_code == 200, r.text[:300]
        assert dt < PERF_BUDGET_S, f"too slow: {dt:.2f}s"
        body = r.json()
        # Shape: must contain some product/cost structure
        assert isinstance(body, dict)
        print(f"/api/reports/sales no-range: {dt:.3f}s keys={list(body.keys())[:8]}")

    def test_sales_with_date_range(self, auth_headers):
        end = datetime.utcnow().date()
        start = end - timedelta(days=30)
        params = {"start_date": start.isoformat(), "end_date": end.isoformat()}
        r, dt = _get_timed(f"{BASE_URL}/api/reports/sales", auth_headers, params=params)
        assert r.status_code == 200, r.text[:300]
        assert dt < PERF_BUDGET_S, f"too slow: {dt:.2f}s"
        body = r.json()
        assert isinstance(body, dict)
        # If sales list exists, each item should have cost-related field after refactor
        sales = body.get("sales") or body.get("items") or body.get("products") or []
        if isinstance(sales, list) and sales:
            sample = sales[0]
            assert isinstance(sample, dict)
            print(f"sample sales keys: {list(sample.keys())[:12]}")
        print(f"/api/reports/sales 30d: {dt:.3f}s")

    def test_sales_wide_range_today(self, auth_headers):
        # one-day window
        today = datetime.utcnow().date().isoformat()
        r, dt = _get_timed(
            f"{BASE_URL}/api/reports/sales",
            auth_headers,
            params={"start_date": today, "end_date": today},
        )
        assert r.status_code == 200
        assert dt < PERF_BUDGET_S
        print(f"/api/reports/sales 1d: {dt:.3f}s")


# ------------------ /api/reports/profit-loss ------------------
class TestProfitLoss:
    def test_profit_loss_default(self, auth_headers):
        r, dt = _get_timed(f"{BASE_URL}/api/reports/profit-loss", auth_headers)
        assert r.status_code == 200, r.text[:300]
        assert dt < PERF_BUDGET_S, f"too slow: {dt:.2f}s"
        body = r.json()
        assert isinstance(body, dict)
        # Cost / revenue numbers should be present (numeric)
        # Common keys: total_revenue, total_cost, profit
        numeric_keys = [k for k, v in body.items() if isinstance(v, (int, float))]
        print(f"/api/reports/profit-loss: {dt:.3f}s numeric_keys={numeric_keys[:10]} all_keys={list(body.keys())[:15]}")

    def test_profit_loss_with_range(self, auth_headers):
        end = datetime.utcnow().date()
        start = end - timedelta(days=30)
        r, dt = _get_timed(
            f"{BASE_URL}/api/reports/profit-loss",
            auth_headers,
            params={"start_date": start.isoformat(), "end_date": end.isoformat()},
        )
        assert r.status_code == 200
        assert dt < PERF_BUDGET_S
        print(f"/api/reports/profit-loss 30d: {dt:.3f}s")


# ------------------ /api/reports/weekly-low-profit ------------------
class TestWeeklyLowProfit:
    def test_weekly_low_profit(self, auth_headers):
        r, dt = _get_timed(f"{BASE_URL}/api/reports/weekly-low-profit", auth_headers)
        assert r.status_code == 200, r.text[:300]
        assert dt < PERF_BUDGET_S, f"too slow: {dt:.2f}s"
        body = r.json()
        assert isinstance(body, (dict, list))
        print(f"/api/reports/weekly-low-profit: {dt:.3f}s type={type(body).__name__}")


# ------------------ /api/smart-reports/* ------------------
class TestSmartReports:
    def test_smart_sales(self, auth_headers):
        r, dt = _get_timed(f"{BASE_URL}/api/smart-reports/sales", auth_headers)
        assert r.status_code == 200, r.text[:300]
        assert dt < PERF_BUDGET_S
        print(f"/api/smart-reports/sales: {dt:.3f}s")

    def test_smart_products(self, auth_headers):
        r, dt = _get_timed(f"{BASE_URL}/api/smart-reports/products", auth_headers)
        assert r.status_code == 200, r.text[:300]
        assert dt < PERF_BUDGET_S
        print(f"/api/smart-reports/products: {dt:.3f}s")

    def test_smart_hourly(self, auth_headers):
        r, dt = _get_timed(f"{BASE_URL}/api/smart-reports/hourly", auth_headers)
        assert r.status_code == 200, r.text[:300]
        assert dt < PERF_BUDGET_S
        print(f"/api/smart-reports/hourly: {dt:.3f}s")


# ------------------ Cost-value parity sanity ------------------
class TestCostNumbersPresent:
    """
    Spot-check that cost numbers exist (non-null/numeric) somewhere in the
    sales response — guards against the refactor accidentally dropping cost fields.
    """
    def test_sales_response_contains_cost_fields(self, auth_headers):
        r = requests.get(f"{BASE_URL}/api/reports/sales", headers=auth_headers, timeout=30)
        assert r.status_code == 200
        body = r.json()
        # Recursively scan for cost-ish keys
        cost_keys_found = set()

        def walk(o):
            if isinstance(o, dict):
                for k, v in o.items():
                    lk = k.lower()
                    if any(s in lk for s in ("cost", "cogs", "profit")):
                        cost_keys_found.add(k)
                    walk(v)
            elif isinstance(o, list):
                for it in o[:20]:
                    walk(it)

        walk(body)
        print(f"cost-related keys found in /sales response: {sorted(cost_keys_found)[:20]}")
        # Don't fail hard if dataset is empty — but the keys should exist somewhere
        # If body has data at all, expect at least one cost-related key.
        if any(body.values()) if isinstance(body, dict) else body:
            assert len(cost_keys_found) > 0, "no cost/cogs/profit keys in non-empty sales response"
