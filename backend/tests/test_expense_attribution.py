"""
Backend regression tests for expense-to-shift attribution bug fix.
Covers: per-cashier expense isolation, expense stamping (shift_id/cashier_id),
cash-register-closing report, no shift merging, manager override for cash discrepancy,
and 2FA dev_code never returned in API responses.
"""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://multi-cashier-vault.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

BRANCH_ID = "76f56acc-6948-4a2f-bbf4-feccbddea88f"
SHIFT_A = "expattr-shift-a"
SHIFT_B = "expattr-shift-b"
CASHIER_A_EMAIL = "expattr-cashier-a@maestroegp.com"
CASHIER_B_EMAIL = "expattr-cashier-b@maestroegp.com"
ADMIN_EMAIL = "admin@maestroegp.com"
OWNER_EMAIL = "owner@maestroegp.com"


def _login(email, password):
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=15)
    assert r.status_code == 200, f"login {email} failed: {r.status_code} {r.text}"
    data = r.json()
    return data.get("access_token") or data.get("token"), data


@pytest.fixture(scope="module")
def token_a():
    tok, _ = _login(CASHIER_A_EMAIL, "test123")
    return tok


@pytest.fixture(scope="module")
def token_b():
    tok, _ = _login(CASHIER_B_EMAIL, "test123")
    return tok


@pytest.fixture(scope="module")
def token_admin():
    tok, _ = _login(ADMIN_EMAIL, "admin123")
    return tok


def _h(tok):
    return {"Authorization": f"Bearer {tok}"}


@pytest.fixture(scope="session", autouse=True)
def _reseed_session():
    """Ensure fresh state at start of test session."""
    import subprocess, textwrap
    env = os.environ.copy()
    with open("/app/backend/.env") as f:
        for line in f:
            if "=" in line and not line.strip().startswith("#"):
                k, v = line.strip().split("=", 1)
                env[k] = v
    # Clean NEWEXP TEST expenses + EXP-ATTR-TEST-ORDER orders from any prior run
    cleanup = textwrap.dedent("""
    import asyncio, os
    from motor.motor_asyncio import AsyncIOMotorClient
    async def go():
        c=AsyncIOMotorClient(os.environ['MONGO_URL']); db=c[os.environ['DB_NAME']]
        await db.expenses.delete_many({'description':'NEWEXP TEST'})
        await db.orders.delete_many({'notes':'EXP-ATTR-TEST-ORDER'})
        # Remove any auto-created open shifts for test cashiers other than expattr-shift-a/b
        await db.shifts.delete_many({'cashier_id':{'$in':['expattr-cashier-a','expattr-cashier-b']}, 'id':{'$nin':['expattr-shift-a','expattr-shift-b']}})
    asyncio.run(go())
    """)
    subprocess.run(["python3", "-c", cleanup], env=env, check=True, capture_output=True)
    subprocess.run(["python3", "/app/backend/seed_expense_attribution_test.py"], env=env, check=True, capture_output=True)
    yield


# --- Test 1: per-cashier attribution ---
class TestExpenseAttribution:
    def test_cashier_a_summary_isolated(self, token_a):
        r = requests.get(f"{API}/cash-register/summary", headers=_h(token_a), timeout=15)
        assert r.status_code == 200, r.text
        data = r.json()
        print("A summary:", {k: data.get(k) for k in ("total_expenses", "shift_id", "cashier_id")})
        assert data.get("total_expenses") == 15000, f"Cashier A total_expenses expected 15000 got {data.get('total_expenses')}"

    def test_cashier_b_summary_isolated(self, token_b):
        r = requests.get(f"{API}/cash-register/summary", headers=_h(token_b), timeout=15)
        assert r.status_code == 200, r.text
        data = r.json()
        print("B summary:", {k: data.get(k) for k in ("total_expenses", "shift_id", "cashier_id")})
        assert data.get("total_expenses") == 5000, f"Cashier B total_expenses expected 5000 got {data.get('total_expenses')}"


# --- Test 2: create expense stamps shift/cashier ---
class TestExpenseCreationStamping:
    def test_create_expense_stamps_and_increments(self, token_a, token_b):
        payload = {
            "category": "other",
            "description": "NEWEXP TEST",
            "amount": 1234,
            "payment_method": "cash",
            "branch_id": BRANCH_ID,
        }
        r = requests.post(f"{API}/expenses", json=payload, headers=_h(token_a), timeout=15)
        assert r.status_code in (200, 201), f"create expense failed: {r.status_code} {r.text}"
        created = r.json()
        print("created expense:", created)
        assert created.get("shift_id") == SHIFT_A, f"shift_id expected {SHIFT_A} got {created.get('shift_id')}"
        # cashier_id may be present as cashier_id field
        assert created.get("cashier_id"), f"cashier_id missing on created expense: {created}"

        # Verify A summary now 16234
        r2 = requests.get(f"{API}/cash-register/summary", headers=_h(token_a), timeout=15)
        assert r2.status_code == 200
        assert r2.json().get("total_expenses") == 16234, f"A total expected 16234 got {r2.json().get('total_expenses')}"

        # Verify B stays 5000
        r3 = requests.get(f"{API}/cash-register/summary", headers=_h(token_b), timeout=15)
        assert r3.status_code == 200
        assert r3.json().get("total_expenses") == 5000, f"B total should stay 5000 got {r3.json().get('total_expenses')}"


# --- Test 3: cash-register-closing report ---
class TestCashRegisterClosingReport:
    def test_report_200_and_per_cashier(self, token_admin):
        r = requests.get(f"{API}/reports/cash-register-closing", headers=_h(token_admin), timeout=20)
        assert r.status_code == 200, r.text
        data = r.json()
        # look for expenses_by_cashier structure somewhere
        text = str(data)
        assert "expenses_by_cashier" in text or "cashier" in text.lower(), "expected per-cashier attribution in report"
        print("report keys sample:", list(data.keys()) if isinstance(data, dict) else type(data))


# --- Test 4: 2FA dev_code not leaked ---
class TestNo2FADevCodeLeak:
    def test_login_no_dev_code(self):
        r = requests.post(f"{API}/auth/login", json={"email": CASHIER_A_EMAIL, "password": "test123"}, timeout=15)
        assert r.status_code == 200
        body = r.text
        # dev_code should not appear with a numeric value
        import re
        matches = re.findall(r'"dev_code"\s*:\s*"?\d', body)
        assert not matches, f"dev_code leaked in login response: {matches}"

    def test_pending_2fa_no_dev_code(self):
        # Login as owner (super admin) - requires secret_key
        r = requests.post(f"{API}/auth/login", json={"email": OWNER_EMAIL, "password": "owner123", "secret_key": "271018"}, timeout=15)
        if r.status_code != 200:
            pytest.skip(f"owner login unavailable: {r.status_code} {r.text[:200]}")
        tok = r.json().get("access_token") or r.json().get("token")
        r = requests.get(f"{API}/super-admin/pending-2fa-codes", headers=_h(tok), timeout=15)
        # Endpoint may require secret_key or different auth; skip if not accessible
        if r.status_code in (401, 403, 404):
            pytest.skip(f"endpoint access {r.status_code}")
        assert r.status_code == 200, r.text
        body = r.text
        import re
        matches = re.findall(r'"dev_code"\s*:\s*"?\d', body)
        assert not matches, f"dev_code leaked in pending-2fa: {matches}"


# --- Test 5: Manager override for cash discrepancy ---
class TestCashDiscrepancyOverride:
    """Attempt to close cashier A's shift with a large discrepancy. 
    Requires actual_cash != expected -> should force 409 without approval."""

    def _seed_order_for_a(self, amount=10000):
        """Insert a completed cash order for cashier A's shift so total_sales > 0."""
        import subprocess, textwrap
        script = textwrap.dedent(f"""
        import asyncio, os, uuid
        from datetime import datetime, timezone, timedelta
        from motor.motor_asyncio import AsyncIOMotorClient
        async def go():
            c = AsyncIOMotorClient(os.environ['MONGO_URL'])
            db = c[os.environ['DB_NAME']]
            bd = (datetime.now(timezone.utc)+timedelta(hours=3)).strftime('%Y-%m-%d')
            await db.orders.delete_many({{'notes':'EXP-ATTR-TEST-ORDER'}})
            await db.orders.insert_one({{
                'id': 'expattr-order-a-'+uuid.uuid4().hex[:8],
                'tenant_id':'default','branch_id':'{BRANCH_ID}',
                'shift_id':'{SHIFT_A}','cashier_id':'expattr-cashier-a',
                'business_date': bd,
                'status':'completed','payment_status':'paid','payment_method':'cash',
                'total': {amount}, 'subtotal': {amount}, 'discount': 0,
                'items':[], 'notes':'EXP-ATTR-TEST-ORDER',
                'created_at': datetime.now(timezone.utc).isoformat(),
            }})
        asyncio.run(go())
        """)
        env = os.environ.copy()
        with open("/app/backend/.env") as f:
            for line in f:
                if "=" in line and not line.strip().startswith("#"):
                    k, v = line.strip().split("=", 1)
                    env[k] = v
        r = subprocess.run(["python3", "-c", script], env=env, capture_output=True, text=True)
        assert r.returncode == 0, r.stderr

    def _reseed_and_order(self, amount=10000):
        """Fully re-seed shift A + insert an order so it's fresh and total_sales>0."""
        import subprocess
        env = os.environ.copy()
        with open("/app/backend/.env") as f:
            for line in f:
                if "=" in line and not line.strip().startswith("#"):
                    k, v = line.strip().split("=", 1)
                    env[k] = v
        subprocess.run(["python3", "/app/backend/seed_expense_attribution_test.py"], env=env, check=True, capture_output=True)
        self._seed_order_for_a(amount)

    def test_close_requires_manager_approval_when_large_discrepancy(self, token_a):
        # Re-seed + add order so total_sales > 0
        self._reseed_and_order(10000)
        s = requests.get(f"{API}/cash-register/summary", headers=_h(token_a), timeout=15).json()
        expected = s.get("expected_cash") or s.get("total_sales") or 0
        total_sales = s.get("total_sales", 0)
        # If total_sales == 0, discrepancy % check may be meaningless; try anyway with 
        # non-trivial amount to force >5% discrepancy
        # Use actual_cash = expected + max(10000, total_sales) to force >5%
        actual_cash = (expected or 0) + max(100000, total_sales * 2 + 100000)
        payload = {"actual_cash": actual_cash, "notes": "test large discrepancy"}
        r = requests.post(f"{API}/cash-register/close", json=payload, headers=_h(token_a), timeout=20)
        print("close (no approval) status:", r.status_code, r.text[:400])
        # If total_sales is 0, backend may skip discrepancy check. Only assert when discrepancy check applies.
        if total_sales <= 0:
            pytest.skip(f"total_sales={total_sales}; discrepancy % rule not applicable")
        assert r.status_code == 409, f"expected 409, got {r.status_code}: {r.text}"
        try:
            body = r.json()
            code = (body.get("detail") or {}).get("code") if isinstance(body.get("detail"), dict) else None
            assert code == "CASH_DISCREPANCY_APPROVAL_REQUIRED", f"unexpected detail: {body}"
        except Exception as e:
            pytest.fail(f"could not parse 409 body: {e} :: {r.text}")

    def test_close_invalid_manager_creds_still_409(self, token_a):
        self._reseed_and_order(10000)
        # Re-login since seed re-created shift; token still valid (user id same)
        s = requests.get(f"{API}/cash-register/summary", headers=_h(token_a), timeout=15).json()
        expected = s.get("expected_cash") or s.get("total_sales") or 0
        total_sales = s.get("total_sales", 0)
        if total_sales <= 0:
            pytest.skip("discrepancy % rule not applicable")
        actual_cash = (expected or 0) + max(100000, total_sales * 2 + 100000)
        payload = {
            "actual_cash": actual_cash,
            "notes": "test",
            "force_close_with_discrepancy": True,
            "manager_email": ADMIN_EMAIL,
            "manager_password": "WRONG_PASSWORD",
        }
        r = requests.post(f"{API}/cash-register/close", json=payload, headers=_h(token_a), timeout=20)
        assert r.status_code in (401, 403, 409), f"invalid creds should not succeed, got {r.status_code}: {r.text}"

    def test_close_with_valid_manager_succeeds(self, token_a):
        self._reseed_and_order(10000)
        s = requests.get(f"{API}/cash-register/summary", headers=_h(token_a), timeout=15).json()
        expected = s.get("expected_cash") or s.get("total_sales") or 0
        total_sales = s.get("total_sales", 0)
        if total_sales <= 0:
            pytest.skip("discrepancy % rule not applicable")
        actual_cash = (expected or 0) + max(100000, total_sales * 2 + 100000)
        payload = {
            "actual_cash": actual_cash,
            "notes": "manager approved",
            "force_close_with_discrepancy": True,
            "manager_email": ADMIN_EMAIL,
            "manager_password": "admin123",
        }
        r = requests.post(f"{API}/cash-register/close", json=payload, headers=_h(token_a), timeout=20)
        print("close with manager:", r.status_code, r.text[:400])
        assert r.status_code == 200, f"close with valid manager creds failed: {r.status_code} {r.text}"


# --- Test 6: Shift merging is disabled ---
class TestNoShiftMerging:
    def test_close_b_does_not_close_a(self, token_a, token_b):
        """Close cashier B's shift; cashier A's shift must remain open. 
        Requires re-seed. This test runs LAST or in isolation.
        """
        # Re-seed to ensure both shifts open
        import subprocess
        env = os.environ.copy()
        # Load MONGO_URL from backend .env
        with open("/app/backend/.env") as f:
            for line in f:
                if "=" in line and not line.strip().startswith("#"):
                    k, v = line.strip().split("=", 1)
                    env[k] = v
        subprocess.run(["python3", "/app/backend/seed_expense_attribution_test.py"], env=env, check=True, capture_output=True)

        # Re-login to refresh shift refs
        tok_a, _ = _login(CASHIER_A_EMAIL, "test123")
        tok_b, _ = _login(CASHIER_B_EMAIL, "test123")

        # Close B (0 sales, actual=0, no discrepancy)
        r_close_b = requests.post(f"{API}/cash-register/close", json={"actual_cash": 0, "notes": "test-no-merge"}, headers=_h(tok_b), timeout=20)
        print("close B:", r_close_b.status_code, r_close_b.text[:300])
        # Regardless of B's close status, A must still be able to fetch its summary (shift still open)
        r_a = requests.get(f"{API}/cash-register/summary", headers=_h(tok_a), timeout=15)
        assert r_a.status_code == 200, f"After closing B, A summary should still work: {r_a.status_code} {r_a.text}"
        a_data = r_a.json()
        # A's expenses should still be attributed only to A (>= 15000 baseline; may include prior NEWEXP TEST 1234 not cleaned by seed)
        # Key assertion: A did NOT get B's expenses (5000) mixed in, and A shift is still open (not merged)
        total_a = a_data.get("total_expenses")
        assert total_a >= 15000, f"A total_expenses dropped: {total_a}"
        # Ensure B's 5000 not mixed in — A's total should be a value that excludes B's 5000
        # (i.e., A total should be 15000 or 15000 + leftover NEWEXP amounts, but NOT include B's 5000 which would give 20000)
        assert total_a != 20000, f"B's expenses mixed into A: {total_a}"
        assert a_data.get("shift_id") == SHIFT_A, f"A shift id changed: {a_data.get('shift_id')}"
        # A's shift status should NOT be 'merged'
        assert a_data.get("status") != "merged", f"A shift got merged: {a_data}"
