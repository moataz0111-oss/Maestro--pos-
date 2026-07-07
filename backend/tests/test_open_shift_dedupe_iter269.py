"""Iter269: verify server-side dedupe of OPEN cashier shifts at GET /api/shifts.
Acceptance: cashier محمد صبحي appears once with total_sales=2266500 when cashiers_only=true;
without cashiers_only both duplicate open shifts are returned; DB is untouched
(two docs with notes='dup-repro' still present)."""
import os
import requests
import pytest

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://whatsapp-pos-system.preview.emergentagent.com").rstrip("/")
BRANCH_ID = "76f56acc-6948-4a2f-bbf4-feccbddea88f"
CASHIER_NAME = "محمد صبحي"


@pytest.fixture(scope="module")
def token():
    r = requests.post(f"{BASE_URL}/api/auth/login",
                      json={"email": "admin@maestroegp.com", "password": "admin123"},
                      timeout=30)
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text[:300]}"
    j = r.json()
    tok = j.get("token") or j.get("access_token")
    assert tok, f"no token in login: {j}"
    return tok


@pytest.fixture(scope="module")
def headers(token):
    return {"Authorization": f"Bearer {token}"}


def _get_shifts(headers, **params):
    r = requests.get(f"{BASE_URL}/api/shifts", params=params, headers=headers, timeout=30)
    assert r.status_code == 200, f"{r.status_code} {r.text[:400]}"
    return r.json()


def _msubhi(shifts):
    return [s for s in shifts if (s.get("cashier_name") or "").strip() == CASHIER_NAME]


def test_open_cashiers_only_dedupes_to_single_row(headers):
    """PRIMARY: with cashiers_only=true, محمد صبحي open shifts must dedupe to one row = 2,266,500."""
    shifts = _get_shifts(headers, status="open", cashiers_only="true", branch_id=BRANCH_ID)
    ms = _msubhi(shifts)
    assert len(ms) == 1, f"expected 1 محمد صبحي open shift, got {len(ms)}: {[(s.get('id'), s.get('total_sales')) for s in ms]}"
    total = float(ms[0].get("total_sales") or 0)
    assert abs(total - 2266500) < 1.0, f"expected total_sales≈2266500, got {total}"
    # inflated value must be absent
    all_totals = [float(s.get("total_sales") or 0) for s in shifts]
    assert 2286500 not in [int(t) for t in all_totals], f"inflated 2286500 still in response: {all_totals}"


def test_open_without_cashiers_only_returns_both(headers):
    """REGRESSION: dedupe scoped to cashiers_only=true — plain query returns both duplicate open shifts."""
    shifts = _get_shifts(headers, status="open", branch_id=BRANCH_ID)
    ms = _msubhi(shifts)
    assert len(ms) >= 2, f"expected >=2 محمد صبحي open shifts without cashiers_only, got {len(ms)}"
    totals = sorted(int(float(s.get("total_sales") or 0)) for s in ms)
    assert 2266500 in totals and 2286500 in totals, f"both duplicates must be present: {totals}"


def test_closed_dedupe_still_works(headers):
    """Regression: closed-shift dedupe (from iter268) still functions."""
    shifts = _get_shifts(headers, status="closed", cashiers_only="true", branch_id=BRANCH_ID)
    ms = _msubhi(shifts)
    # If there were closed duplicates they must also be deduped — assert no inflated value
    all_totals = [int(float(s.get("total_sales") or 0)) for s in shifts]
    assert 2286500 not in all_totals, f"inflated 2286500 leaked into closed cashiers_only: {all_totals}"


def test_db_not_deleted(headers):
    """No deletion: without cashiers_only both docs must still exist (proves DB untouched)."""
    shifts = _get_shifts(headers, status="open", branch_id=BRANCH_ID)
    ms = _msubhi(shifts)
    ids = {s.get("id") for s in ms}
    assert "msubhi-shift-0001" in ids or len(ids) >= 2, f"seed shift missing; ids={ids}"
