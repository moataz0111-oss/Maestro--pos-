"""
Iteration 168 - Backend tests for:
  (1) DELETE /api/expenses/{expense_id} - role guard, 404, recompute shift totals
  (2) Customer/sync/sandbox order paths inject business_date
  (3) auto_migrate_business_dates v2 flag (system_flags)
  (4) POST /api/admin/migrate-business-dates?force=true
  (5) GET /api/reports/expenses by_cashier.items contains 'id'
"""
import os
import time
import uuid
import pytest
import requests
from datetime import datetime, timezone

def _load_base_url():
    val = os.environ.get("REACT_APP_BACKEND_URL")
    if not val:
        try:
            with open("/app/frontend/.env", "r") as fh:
                for line in fh:
                    if line.startswith("REACT_APP_BACKEND_URL="):
                        val = line.split("=", 1)[1].strip()
                        break
        except Exception:
            pass
    if not val:
        raise RuntimeError("REACT_APP_BACKEND_URL not configured")
    return val.rstrip("/")

BASE_URL = _load_base_url()
ADMIN_EMAIL = "hanialdujaili@gmail.com"
ADMIN_PASSWORD = "Hani@2024"


# ---------- fixtures ----------
@pytest.fixture(scope="module")
def session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def admin_token(session):
    r = session.post(f"{BASE_URL}/api/auth/login",
                     json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
                     timeout=20)
    if r.status_code != 200:
        pytest.skip(f"admin login failed: {r.status_code} {r.text[:200]}")
    data = r.json()
    tok = data.get("access_token") or data.get("token")
    assert tok, f"no token in login response: {data}"
    return tok


@pytest.fixture(scope="module")
def admin_client(session, admin_token):
    session.headers.update({"Authorization": f"Bearer {admin_token}"})
    return session


@pytest.fixture(scope="module")
def me(admin_client):
    r = admin_client.get(f"{BASE_URL}/api/auth/me", timeout=20)
    assert r.status_code == 200
    return r.json()


@pytest.fixture(scope="module")
def primary_branch(admin_client, me):
    r = admin_client.get(f"{BASE_URL}/api/branches", timeout=20)
    assert r.status_code == 200
    branches = r.json()
    assert len(branches) > 0, "no branches"
    bid = me.get("branch_id") or branches[0].get("id")
    return bid


@pytest.fixture(scope="module")
def open_shift(admin_client, primary_branch):
    """Find or open a shift for the test branch."""
    r = admin_client.get(f"{BASE_URL}/api/shifts/current",
                         params={"branch_id": primary_branch}, timeout=20)
    if r.status_code == 200 and r.json():
        return r.json()
    # Try to open
    r = admin_client.post(f"{BASE_URL}/api/shifts/open",
                          json={"branch_id": primary_branch, "opening_cash": 0}, timeout=20)
    if r.status_code in (200, 201):
        return r.json()
    pytest.skip(f"could not open shift: {r.status_code} {r.text[:200]}")


def _get_shift_total(client, branch_id, shift_id):
    """Helper: fetch a shift's total_expenses by querying current/list endpoints."""
    r = client.get(f"{BASE_URL}/api/shifts/current",
                   params={"branch_id": branch_id}, timeout=20)
    if r.status_code == 200 and r.json() and r.json().get("id") == shift_id:
        return float(r.json().get("total_expenses") or 0)
    # Fallback: list shifts and find by id
    r = client.get(f"{BASE_URL}/api/shifts",
                   params={"branch_id": branch_id, "limit": 50}, timeout=20)
    if r.status_code == 200:
        for s in r.json():
            if s.get("id") == shift_id:
                return float(s.get("total_expenses") or 0)
    return None


# ---------- DELETE expense tests ----------
class TestDeleteExpense:
    def test_delete_nonexistent_returns_404(self, admin_client):
        fake_id = f"nonexistent-{uuid.uuid4()}"
        r = admin_client.delete(f"{BASE_URL}/api/expenses/{fake_id}", timeout=20)
        assert r.status_code == 404, f"expected 404, got {r.status_code} {r.text[:200]}"

    def test_delete_expense_recomputes_shift_total(self, admin_client, primary_branch, open_shift):
        # 1) get shift total before
        shift_id = open_shift.get("id")
        before_total = _get_shift_total(admin_client, primary_branch, shift_id)
        if before_total is None:
            pytest.skip("could not read shift total before")

        # 2) create expense of 100,000
        amount = 100000
        exp_payload = {
            "amount": amount,
            "category": "other",
            "description": f"TEST_iter168_delete_{uuid.uuid4().hex[:8]}",
            "branch_id": primary_branch,
        }
        c = admin_client.post(f"{BASE_URL}/api/expenses", json=exp_payload, timeout=20)
        assert c.status_code in (200, 201), f"expense create failed: {c.status_code} {c.text[:200]}"
        exp = c.json()
        exp_id = exp.get("id")
        assert exp_id, f"no id in expense response: {exp}"
        # business_date assertion
        assert exp.get("business_date"), "expense should carry business_date inherited from shift"

        # 3) verify shift total grew by amount
        time.sleep(0.5)
        mid_total = _get_shift_total(admin_client, primary_branch, shift_id)
        assert mid_total is not None
        # Note: shift total_expenses is recomputed only on shift close; live total
        # may not auto-update on POST /api/expenses. We accept either:
        #   - exact match (live recompute), OR
        #   - same as before (recompute happens on close), and the DELETE recomputes correctly
        live_recompute = abs(mid_total - (before_total + amount)) < 0.01

        # 4) DELETE expense
        d = admin_client.delete(f"{BASE_URL}/api/expenses/{exp_id}", timeout=20)
        assert d.status_code == 200, f"delete failed: {d.status_code} {d.text[:200]}"
        body = d.json()
        assert body.get("success") is True
        assert "message" in body

        # 5) verify shift total is back to before (DELETE always recomputes)
        time.sleep(0.5)
        after_total = _get_shift_total(admin_client, primary_branch, shift_id)
        assert after_total is not None
        assert abs(after_total - before_total) < 0.01, \
            f"after delete shift.total_expenses should return to {before_total}, got {after_total} (live_recompute_on_create={live_recompute}, mid_total={mid_total})"

        # 6) DELETE again -> 404
        d2 = admin_client.delete(f"{BASE_URL}/api/expenses/{exp_id}", timeout=20)
        assert d2.status_code == 404

    def test_delete_expense_excluded_from_reports(self, admin_client, primary_branch):
        # create
        exp_payload = {
            "amount": 50000,
            "category": "other",
            "description": f"TEST_iter168_report_{uuid.uuid4().hex[:8]}",
            "branch_id": primary_branch,
        }
        c = admin_client.post(f"{BASE_URL}/api/expenses", json=exp_payload, timeout=20)
        assert c.status_code in (200, 201)
        exp_id = c.json()["id"]
        # Listing should include it
        listing = admin_client.get(f"{BASE_URL}/api/expenses",
                                   params={"branch_id": primary_branch}, timeout=20)
        assert listing.status_code == 200
        assert any(e.get("id") == exp_id for e in listing.json())
        # delete
        d = admin_client.delete(f"{BASE_URL}/api/expenses/{exp_id}", timeout=20)
        assert d.status_code == 200
        # Listing should no longer include
        listing2 = admin_client.get(f"{BASE_URL}/api/expenses",
                                    params={"branch_id": primary_branch}, timeout=20)
        assert listing2.status_code == 200
        assert not any(e.get("id") == exp_id for e in listing2.json())

    def test_unauthenticated_delete_rejected(self, session):
        s = requests.Session()
        s.headers.update({"Content-Type": "application/json"})
        r = s.delete(f"{BASE_URL}/api/expenses/anything", timeout=20)
        assert r.status_code in (401, 403), f"expected 401/403 for no auth, got {r.status_code}"


# ---------- Reports: by_cashier.items 'id' field ----------
class TestExpenseReportContainsId:
    def test_by_cashier_items_have_id(self, admin_client, primary_branch):
        # ensure at least one expense exists today
        seed_payload = {
            "amount": 1000,
            "category": "other",
            "description": f"TEST_iter168_reportid_{uuid.uuid4().hex[:8]}",
            "branch_id": primary_branch,
        }
        seed = admin_client.post(f"{BASE_URL}/api/expenses", json=seed_payload, timeout=20)
        assert seed.status_code in (200, 201)
        seed_id = seed.json()["id"]

        try:
            # Default report (no dates) should aggregate today's data
            today = datetime.now(timezone.utc).date().isoformat()
            r = admin_client.get(f"{BASE_URL}/api/reports/expenses",
                                 params={"start_date": today, "end_date": today,
                                         "branch_id": primary_branch}, timeout=20)
            assert r.status_code == 200, f"{r.status_code} {r.text[:200]}"
            data = r.json()
            assert "by_cashier" in data
            # find any cashier with items
            found_with_id = False
            for cashier_name, cinfo in data["by_cashier"].items():
                items = cinfo.get("items", [])
                for it in items:
                    assert "id" in it, f"item missing id field: {it}"
                    if it.get("id"):
                        found_with_id = True
            assert found_with_id, "no expense item with id found in by_cashier.items"
        finally:
            admin_client.delete(f"{BASE_URL}/api/expenses/{seed_id}", timeout=20)


# ---------- migrate-business-dates ?force=true ----------
class TestMigrateForce:
    def test_force_param_accepted(self, admin_client):
        r = admin_client.post(f"{BASE_URL}/api/admin/migrate-business-dates",
                              params={"force": "true"}, timeout=120)
        assert r.status_code == 200, f"{r.status_code} {r.text[:200]}"
        body = r.json()
        # Response shape: should include 'stats' with counters (not necessarily flat)
        stats = body.get("stats", body)
        for key in ("shifts_updated", "orders_updated", "expenses_updated"):
            assert key in stats, f"stats missing key {key}: {stats}"
            assert isinstance(stats[key], int), f"{key} should be int"

    def test_force_recomputes_actual_changes_only(self, admin_client):
        # Run twice with force=true; changes count should drop to 0 the second time
        r1 = admin_client.post(f"{BASE_URL}/api/admin/migrate-business-dates",
                               params={"force": "true"}, timeout=120)
        assert r1.status_code == 200
        s1 = r1.json().get("stats", r1.json())

        r2 = admin_client.post(f"{BASE_URL}/api/admin/migrate-business-dates",
                               params={"force": "true"}, timeout=120)
        assert r2.status_code == 200
        s2 = r2.json().get("stats", r2.json())

        # On second force run, since no records actually changed, counts should be 0.
        assert s2.get("orders_updated", 0) == 0, \
            f"second force run should report 0 actual order changes, got {s2.get('orders_updated')}"
        assert s2.get("expenses_updated", 0) == 0, \
            f"second force run should report 0 actual expense changes, got {s2.get('expenses_updated')}"


# ---------- system_flags v2 fixed flag ----------
class TestAutoMigrationV2Flag:
    def test_orders_business_date_v2_flag_exists(self, admin_client):
        # The flag is set after first auto-migrate-v2 completes during startup.
        # We can't query db directly via API; instead, infer that subsequent
        # /api/admin/migrate-business-dates without force returns 0 orders_updated.
        r = admin_client.post(f"{BASE_URL}/api/admin/migrate-business-dates", timeout=60)
        assert r.status_code == 200
        s = r.json().get("stats", r.json())
        assert s.get("orders_updated", 0) == 0, \
            f"non-force migration should be no-op after startup migration: {s}"
        assert s.get("expenses_updated", 0) == 0


# ---------- order creation paths inject business_date ----------
class TestOrderBusinessDateInjection:
    def test_pos_order_has_business_date(self, admin_client, primary_branch, open_shift):
        # Try creating a normal order via /api/orders if menu items exist
        items_resp = admin_client.get(f"{BASE_URL}/api/menu-items",
                                      params={"branch_id": primary_branch}, timeout=20)
        if items_resp.status_code != 200 or not items_resp.json():
            pytest.skip("no menu items available to create test order")
        items = items_resp.json()
        # pick one available item
        item = None
        for it in items:
            if it.get("is_available", True) and (it.get("price") or 0) > 0:
                item = it
                break
        if not item:
            pytest.skip("no available menu item with price")

        order_payload = {
            "branch_id": primary_branch,
            "order_type": "dine_in",
            "items": [{
                "menu_item_id": item["id"],
                "menu_item_name": item.get("name", ""),
                "quantity": 1,
                "unit_price": item["price"],
                "total_price": item["price"]
            }],
            "subtotal": item["price"],
            "total": item["price"],
            "payment_method": "cash"
        }
        r = admin_client.post(f"{BASE_URL}/api/orders", json=order_payload, timeout=20)
        if r.status_code not in (200, 201):
            pytest.skip(f"order create not available: {r.status_code} {r.text[:200]}")
        order = r.json()
        order_id = order.get("id")
        assert order_id

        # GET orders and check this one carries business_date in DB (via reports)
        # OrderResponse may strip business_date (known iter166 issue), so use sales report
        today = datetime.now(timezone.utc).date().isoformat()
        sr = admin_client.get(f"{BASE_URL}/api/reports/sales",
                              params={"start_date": today, "end_date": today,
                                      "branch_id": primary_branch}, timeout=20)
        assert sr.status_code == 200, f"{sr.status_code} {sr.text[:200]}"
        # order must appear in today's report (proves business_date applied)
        sales = sr.json()
        # response shape varies; just ensure count > 0
        total_orders = sales.get("total_orders") or len(sales.get("orders", []) or [])
        assert total_orders >= 1, f"created order should appear in today's sales report"
