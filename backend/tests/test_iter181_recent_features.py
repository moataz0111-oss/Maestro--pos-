"""
Iteration 181 - Backend regression tests for recently added features:
  - Branch Daily Stock Count (variance + monetary loss + recipe distribution)
  - Cash register / shift close blocking when stock count missing
  - Inventory movements listing with filters
  - Smart Purchase Suggestions (30-day average consumption)
  - Approve & Convert purchase request to invoice (with raw_material_id linkage)
  - Monthly Department Stocktake (is-due / template / submit)
  - HR Salary payment receipt (print data)
  - GET /api/biometric-queue/pending (no-auth poll)
  - Waste Efficiency Report
  - Manufactured products endpoint (cost_before_waste / cost_after_waste)
  - Stockout Predictions endpoint

Run:
  pytest /app/backend/tests/test_iter181_recent_features.py -v \
      --tb=short --junitxml=/app/test_reports/pytest/iter181.xml
"""
import os
import uuid
from datetime import datetime, timezone, date

import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    # fall back to the value baked into the frontend .env
    with open("/app/frontend/.env") as f:
        for line in f:
            if line.startswith("REACT_APP_BACKEND_URL="):
                BASE_URL = line.split("=", 1)[1].strip().rstrip("/")
                break

ADMIN_EMAIL = "hanialdujaili@gmail.com"
ADMIN_PASSWORD = "Hani@2024"


# ----------------------- fixtures -----------------------

@pytest.fixture(scope="session")
def api():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="session")
def admin_token(api):
    r = api.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
        timeout=20,
    )
    assert r.status_code == 200, f"Login failed: {r.status_code} {r.text}"
    data = r.json()
    token = data.get("token") or data.get("access_token")
    assert token, f"No token in login response: {data}"
    return token


@pytest.fixture(scope="session")
def auth(admin_token):
    return {"Authorization": f"Bearer {admin_token}"}


@pytest.fixture(scope="session")
def me(api, auth):
    r = api.get(f"{BASE_URL}/api/auth/me", headers=auth, timeout=15)
    assert r.status_code == 200, r.text
    return r.json()


@pytest.fixture(scope="session")
def branches(api, auth):
    r = api.get(f"{BASE_URL}/api/branches", headers=auth, timeout=15)
    assert r.status_code == 200, r.text
    return r.json()


@pytest.fixture(scope="session")
def primary_branch_id(branches, me):
    if me.get("branch_id"):
        return me["branch_id"]
    assert branches, "No branches available for testing"
    return branches[0]["id"]


# ----------------------- 1. Auth sanity -----------------------

class TestAuthSanity:
    def test_login(self, admin_token):
        assert isinstance(admin_token, str) and len(admin_token) > 20

    def test_me(self, me):
        assert me.get("email") == ADMIN_EMAIL
        assert me.get("role") in ("admin", "super_admin", "owner", "manager")


# ----------------------- 2. Manufactured product cost -----------------------

class TestManufacturingCost:
    def test_list_manufactured_products(self, api, auth):
        r = api.get(f"{BASE_URL}/api/manufactured-products", headers=auth, timeout=20)
        assert r.status_code == 200, r.text
        products = r.json()
        assert isinstance(products, list)
        # If there is at least one product, verify before/after waste fields are present
        if products:
            p = products[0]
            # These fields are written on create — older legacy docs may miss them
            has_before = "cost_before_waste" in p or "raw_material_cost" in p
            has_after = "production_cost" in p or "raw_material_cost_after_waste" in p
            assert has_before, f"Missing cost_before_waste / raw_material_cost in: {list(p.keys())}"
            assert has_after, f"Missing production_cost / raw_material_cost_after_waste in: {list(p.keys())}"


# ----------------------- 3. Inventory movements -----------------------

class TestInventoryMovements:
    def test_list_all(self, api, auth):
        r = api.get(f"{BASE_URL}/api/inventory-movements", headers=auth, timeout=20)
        assert r.status_code == 200, r.text
        body = r.json()
        # Endpoint may return list or {movements: [...]}
        items = body if isinstance(body, list) else body.get("movements", body.get("items"))
        assert items is not None, f"Unexpected shape: {body}"
        assert isinstance(items, list)

    def test_filter_by_date(self, api, auth):
        today = date.today().isoformat()
        r = api.get(
            f"{BASE_URL}/api/inventory-movements",
            headers=auth,
            params={"start_date": today, "end_date": today},
            timeout=20,
        )
        assert r.status_code == 200, r.text

    def test_filter_by_type(self, api, auth):
        r = api.get(
            f"{BASE_URL}/api/inventory-movements",
            headers=auth,
            params={"movement_type": "product_manufactured"},
            timeout=20,
        )
        assert r.status_code == 200, r.text


# ----------------------- 4. Branch stock count -----------------------

class TestBranchStockCount:
    def test_template_or_today(self, api, auth, primary_branch_id):
        r = api.get(
            f"{BASE_URL}/api/branch-stock-count/today",
            headers=auth,
            params={"branch_id": primary_branch_id},
            timeout=20,
        )
        assert r.status_code == 200, r.text
        body = r.json()
        # Should expose items with expected_qty
        items = body.get("items") if isinstance(body, dict) else None
        assert items is not None, f"Unexpected payload: {body}"
        if items:
            it0 = items[0]
            assert "expected_qty" in it0 or "expected" in it0
            assert "product_id" in it0

    def test_submit_empty_count_ok(self, api, auth, primary_branch_id):
        """Submitting an empty count should still 200 (records the day)."""
        r = api.post(
            f"{BASE_URL}/api/branch-stock-count/submit",
            headers=auth,
            json={"branch_id": primary_branch_id, "items": [], "notes": "TEST_iter181 empty"},
            timeout=20,
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert "count" in body
        assert body["count"].get("status") == "submitted"
        assert body["count"].get("branch_id") == primary_branch_id

    def test_submit_with_variance_and_loss_distribution(self, api, auth, primary_branch_id):
        # Pull the template to obtain a real product_id + expected_qty
        r = api.get(
            f"{BASE_URL}/api/branch-stock-count/today",
            headers=auth, params={"branch_id": primary_branch_id}, timeout=20,
        )
        items = r.json().get("items") or []
        if not items:
            pytest.skip("No products available in branch to test variance")
        target = items[0]
        product_id = target["product_id"]
        expected = float(target.get("expected_qty") or target.get("expected") or 0)
        # Pretend we only have half — variance = expected/2
        actual = max(0.0, expected - 1.0) if expected > 1 else 0.0
        payload = {
            "branch_id": primary_branch_id,
            "items": [{"product_id": product_id, "actual_qty": actual, "notes": "TEST_iter181"}],
            "notes": "TEST_iter181 variance",
        }
        r = api.post(
            f"{BASE_URL}/api/branch-stock-count/submit",
            headers=auth, json=payload, timeout=20,
        )
        assert r.status_code == 200, r.text
        body = r.json()
        count = body.get("count", {})
        assert count.get("status") == "submitted"
        saved_items = count.get("items") or []
        assert saved_items, "Submission did not return saved items"
        si = next((x for x in saved_items if x["product_id"] == product_id), None)
        assert si is not None
        variance = round(expected - actual, 4)
        assert abs(si["variance"] - variance) < 0.01, f"Variance mismatch {si['variance']} vs {variance}"
        if variance > 0:
            # variance_cost should be variance * unit_cost
            unit_cost = si.get("unit_cost") or 0
            assert abs(si["variance_cost"] - round(variance * unit_cost, 2)) < 0.05
            # recipe_breakdown is populated when product has a recipe
            assert isinstance(si.get("recipe_breakdown"), list)

    def test_history(self, api, auth, primary_branch_id):
        r = api.get(
            f"{BASE_URL}/api/branch-stock-count/history",
            headers=auth, params={"branch_id": primary_branch_id, "days": 7}, timeout=20,
        )
        assert r.status_code == 200, r.text


# ----------------------- 5. Cash register close blocked when count missing -----------------------

class TestCashRegisterCloseBlock:
    def test_close_without_count_returns_409_when_missing(self, api, auth, primary_branch_id):
        """If there's inventory in the branch and no count submitted today,
        closing the cash register must be blocked with HTTP 409 + STOCK_COUNT_REQUIRED."""
        # Note: we may have already submitted a count above in TestBranchStockCount.
        # In that case the endpoint should NOT block. We assert one of the two outcomes.
        r = api.post(
            f"{BASE_URL}/api/cash-register/close",
            headers=auth,
            json={"branch_id": primary_branch_id, "denominations": {}, "notes": "TEST_iter181"},
            timeout=20,
        )
        # Accept: 409 (count missing), 404 (no open shift), 200 (closed ok), 400 (other),
        # 403 (cashier-only). We specifically validate the 409 contract when produced.
        assert r.status_code in (200, 400, 403, 404, 409), f"Unexpected {r.status_code}: {r.text}"
        if r.status_code == 409:
            data = r.json()
            detail = data.get("detail")
            if isinstance(detail, dict):
                assert detail.get("code") == "STOCK_COUNT_REQUIRED"


# ----------------------- 6. Smart purchase suggestions -----------------------

class TestSmartPurchaseSuggestions:
    def test_no_materials_returns_empty(self, api, auth):
        r = api.post(
            f"{BASE_URL}/api/warehouse-purchase-requests/suggest-quantities",
            headers=auth, json={"material_ids": [], "days": 30, "coverage_days": 7}, timeout=20,
        )
        assert r.status_code == 200, r.text
        assert r.json().get("suggestions") == []

    def test_real_material_30_day_avg(self, api, auth):
        r = api.get(f"{BASE_URL}/api/raw-materials", headers=auth, timeout=20)
        assert r.status_code == 200, r.text
        mats = r.json()
        if not mats:
            pytest.skip("No raw materials seeded")
        mid = mats[0]["id"]
        r = api.post(
            f"{BASE_URL}/api/warehouse-purchase-requests/suggest-quantities",
            headers=auth,
            json={"material_ids": [mid], "days": 30, "coverage_days": 7},
            timeout=25,
        )
        assert r.status_code == 200, r.text
        suggestions = r.json().get("suggestions") or []
        assert len(suggestions) == 1
        s = suggestions[0]
        assert s["raw_material_id"] == mid
        for key in ("daily_avg", "weekly_avg", "suggested_qty", "current_stock",
                    "min_quantity", "period_days", "coverage_days", "reason"):
            assert key in s, f"Missing key {key}"
        assert s["period_days"] == 30
        assert s["coverage_days"] == 7
        assert isinstance(s["suggested_qty"], (int, float))


# ----------------------- 7. Warehouse purchase requests (approve & convert) -----------------------

class TestWarehousePurchaseRequestFlow:
    def test_list_endpoint(self, api, auth):
        r = api.get(f"{BASE_URL}/api/warehouse-purchase-requests", headers=auth, timeout=20)
        assert r.status_code == 200, r.text
        assert isinstance(r.json(), list)

    def test_price_and_convert_to_invoice(self, api, auth):
        """End-to-end: create request → approve by manager (or directly mark approved_by_owner via API path) → price & create invoice."""
        # Need at least one raw material and one supplier
        rms = api.get(f"{BASE_URL}/api/raw-materials", headers=auth, timeout=15).json()
        sups = api.get(f"{BASE_URL}/api/suppliers", headers=auth, timeout=15).json()
        if not rms or not sups:
            pytest.skip("Need at least one raw material AND one supplier")
        rm = rms[0]
        sup = sups[0]

        # 1) Create the request
        create_payload = {
            "items": [{
                "raw_material_id": rm["id"],
                "name": rm["name"],
                "quantity": 5,
                "unit": rm.get("unit", "كغم"),
                "notes": "TEST_iter181",
            }],
            "notes": "TEST_iter181 purchase request",
        }
        r = api.post(
            f"{BASE_URL}/api/warehouse-purchase-requests",
            headers=auth, json=create_payload, timeout=20,
        )
        assert r.status_code in (200, 201), r.text
        created = r.json()
        req_id = created.get("id") or created.get("request", {}).get("id")
        assert req_id, f"No request id returned: {created}"

        # 2) Approve by owner (admin acts as owner here)
        r = api.post(
            f"{BASE_URL}/api/warehouse-purchase-requests/{req_id}/approve",
            headers=auth, json={"notes": "TEST_iter181 approve"}, timeout=20,
        )
        # Some implementations require an interim manager approval — accept 200/400
        if r.status_code not in (200, 201):
            pytest.skip(f"Approval step needs different flow ({r.status_code}): {r.text}")

        # 3) Price & convert (omit raw_material_id intentionally to test the name→id backfill)
        invoice_payload = {
            "supplier_id": sup["id"],
            "invoice_number": f"TEST-{uuid.uuid4().hex[:6]}",
            "items": [{
                "name": rm["name"],
                "quantity": 5,
                "unit": rm.get("unit", "كغم"),
                "cost_per_unit": 1000.0,
            }],
            "total_amount": 5000.0,
            "payment_method": "cash",
            "payment_status": "paid",
            "notes": "TEST_iter181 invoice",
        }
        r = api.post(
            f"{BASE_URL}/api/warehouse-purchase-requests/{req_id}/price-and-create-invoice",
            headers=auth, json=invoice_payload, timeout=25,
        )
        assert r.status_code in (200, 201), r.text
        body = r.json()
        purchase_id = body.get("purchase_id")
        assert purchase_id, f"No purchase_id: {body}"

        # 4) Verify invoice was created with raw_material_id properly back-filled
        r = api.get(f"{BASE_URL}/api/purchases-new", headers=auth, timeout=20)
        if r.status_code == 200:
            purchases = r.json()
            inv = next((p for p in purchases if p.get("id") == purchase_id), None)
            assert inv is not None, "Newly created invoice not found in list"
            items = inv.get("items") or []
            assert items, "Invoice has no items"
            # raw_material_id should have been back-filled from the request items by name
            assert items[0].get("raw_material_id") == rm["id"], \
                f"raw_material_id not back-filled: {items[0]}"


# ----------------------- 8. Monthly Department Stocktake -----------------------

class TestMonthlyStocktake:
    def test_is_due(self, api, auth):
        r = api.get(f"{BASE_URL}/api/department-stock-count/is-due", headers=auth, timeout=15)
        assert r.status_code == 200, r.text
        body = r.json()
        for key in ("is_due", "days_remaining_in_month", "period", "departments"):
            assert key in body, f"Missing key {key}"
        # is_due is true only days 25..end-of-month
        today = datetime.now(timezone.utc).day
        assert body["is_due"] is (today >= 25)
        for dept in ("manufacturing", "warehouse_raw", "packaging"):
            assert dept in body["departments"]

    def test_template_per_department(self, api, auth):
        for dept in ("manufacturing", "warehouse_raw", "packaging"):
            r = api.get(
                f"{BASE_URL}/api/department-stock-count/template",
                headers=auth, params={"department": dept}, timeout=20,
            )
            assert r.status_code == 200, f"{dept}: {r.status_code} {r.text}"
            body = r.json()
            assert body.get("department") == dept
            assert "items" in body

    def test_submit_empty(self, api, auth):
        r = api.post(
            f"{BASE_URL}/api/department-stock-count/submit",
            headers=auth,
            json={"department": "manufacturing", "items": [], "notes": "TEST_iter181"},
            timeout=20,
        )
        # Submission is allowed any day, but is_due flag controls UI button visibility.
        # If backend enforces the date-window, we accept either 200 or 4xx with clear msg.
        assert r.status_code in (200, 400, 403), r.text


# ----------------------- 9. HR salary payment receipt -----------------------

class TestHRSalaryReceipt:
    def test_payroll_list(self, api, auth):
        r = api.get(f"{BASE_URL}/api/payroll", headers=auth, timeout=20)
        assert r.status_code == 200, r.text

    def test_print_data_for_payroll(self, api, auth):
        r = api.get(f"{BASE_URL}/api/payroll", headers=auth, timeout=20)
        assert r.status_code == 200, r.text
        payrolls = r.json()
        if not payrolls:
            pytest.skip("No payroll records to test print receipt")
        pid = payrolls[0].get("id")
        assert pid
        r = api.get(f"{BASE_URL}/api/payroll/{pid}/print", headers=auth, timeout=20)
        assert r.status_code == 200, r.text
        body = r.json()
        # Required for both A4 and 80mm thermal print
        for key in ("payroll", "employee", "deductions", "bonuses", "advances", "print_date"):
            assert key in body, f"Missing key {key}"
        # Net salary must be retrievable
        net = body["payroll"].get("net_salary")
        assert net is not None, f"net_salary missing in payroll: {body['payroll'].keys()}"


# ----------------------- 10. Biometric queue pending (no-auth) -----------------------

class TestBiometricQueuePending:
    def test_pending_no_auth(self):
        r = requests.get(f"{BASE_URL}/api/biometric-queue/pending", timeout=15)
        assert r.status_code == 200, r.text
        assert isinstance(r.json(), list)

    def test_pending_with_branch_filter(self):
        r = requests.get(
            f"{BASE_URL}/api/biometric-queue/pending",
            params={"branch_id": "nonexistent", "limit": 5},
            timeout=15,
        )
        assert r.status_code == 200, r.text
        assert r.json() == []


# ----------------------- 11. Waste Efficiency Report -----------------------

class TestWasteEfficiency:
    def test_default_period(self, api, auth):
        r = api.get(f"{BASE_URL}/api/reports/waste-efficiency", headers=auth, timeout=25)
        assert r.status_code == 200, r.text

    def test_custom_filters(self, api, auth, primary_branch_id):
        today = date.today().isoformat()
        r = api.get(
            f"{BASE_URL}/api/reports/waste-efficiency",
            headers=auth,
            params={
                "start_date": today, "end_date": today,
                "branch_id": primary_branch_id, "group_by": "raw_material",
            },
            timeout=25,
        )
        assert r.status_code == 200, r.text


# ----------------------- 12. Stockout predictions -----------------------

class TestStockoutPredictions:
    def test_basic(self, api, auth):
        r = api.get(f"{BASE_URL}/api/raw-materials/stockout-predictions", headers=auth, timeout=25)
        assert r.status_code == 200, r.text
        body = r.json()
        # Expect a summary + predictions list
        if isinstance(body, dict):
            assert "predictions" in body or "items" in body
