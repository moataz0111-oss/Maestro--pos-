"""Iter270 — verify /api/cash-register/summary and /api/cash-register/close consolidate duplicate open shifts.

IMPORTANT: These tests MUTATE the seed. Run summary test BEFORE close test.
"""
import os
import requests
import pytest
from pymongo import MongoClient

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://whatsapp-pos-system.preview.emergentagent.com").rstrip("/")
BRANCH_ID = "76f56acc-6948-4a2f-bbf4-feccbddea88f"
EXPECTED_TOTAL = 2266500

mongo = MongoClient("mongodb://localhost:27017")
db = mongo["maestro_pos"]


@pytest.fixture(scope="module")
def token():
    r = requests.post(f"{BASE_URL}/api/auth/login",
                      json={"email": "admin@maestroegp.com", "password": "admin123"},
                      timeout=30)
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    tok = r.json().get("token") or r.json().get("access_token")
    assert tok, f"no token in response: {r.json()}"
    return tok


@pytest.fixture(scope="module")
def headers(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


def test_01_seed_present():
    """Two OPEN shifts exist for محمد صبحي on 2026-07-02."""
    shifts = list(db.shifts.find({"notes": "dup-repro", "status": "open"}))
    assert len(shifts) == 2, f"expected 2 open dup-repro shifts, got {len(shifts)}"
    totals = sorted([s.get("total_sales", 0) for s in shifts])
    assert totals == [20000, 2266500], f"unexpected totals: {totals}"


def test_02_summary_consolidates(headers):
    """GET /api/cash-register/summary must return total_sales=2266500 (not 20000)."""
    r = requests.get(f"{BASE_URL}/api/cash-register/summary",
                     params={"branch_id": BRANCH_ID}, headers=headers, timeout=30)
    assert r.status_code == 200, f"{r.status_code} {r.text}"
    data = r.json()
    print("summary response:", data)
    total = data.get("total_sales") or data.get("totalSales") or 0
    # Must equal expected, NOT the small duplicate-only value
    assert total != 20000, "summary picked arbitrary shift (bug still present)"
    assert abs(total - EXPECTED_TOTAL) < 1, f"summary total {total} != {EXPECTED_TOTAL}"


def test_03_close_consolidates_and_merges(headers):
    """POST /api/cash-register/close: closes anchor with full total; other shift marked merged."""
    body = {"branch_id": BRANCH_ID, "denominations": {}, "force_close_without_count": True}
    r = requests.post(f"{BASE_URL}/api/cash-register/close", json=body, headers=headers, timeout=60)
    assert r.status_code == 200, f"{r.status_code} {r.text}"
    data = r.json()
    print("close response keys:", list(data.keys()))
    # The closed shift returned should have total ≈ EXPECTED_TOTAL
    shift = data.get("shift") or data
    total = shift.get("total_sales") or data.get("total_sales") or 0
    assert abs(total - EXPECTED_TOTAL) < 1, f"close total {total} != {EXPECTED_TOTAL}"


def test_04_db_state_after_close():
    """DB: exactly one 'closed' + one 'merged' shift remain for that seed."""
    seed_ids = ["9c836d96-9fe9-466b-87f5-8648fb50f344", "92b598b8-0194-46e5-bdb9-4b26f9709bf3"]
    shifts = list(db.shifts.find({"id": {"$in": seed_ids}}))
    statuses = sorted([s.get("status") for s in shifts])
    print("post-close statuses:", statuses, [s.get("total_sales") for s in shifts])
    assert "closed" in statuses, f"no closed shift found: {statuses}"
    assert "merged" in statuses, f"duplicate shift not marked merged: {statuses}"
    # Exactly one closed
    closed = [s for s in shifts if s.get("status") == "closed"]
    merged = [s for s in shifts if s.get("status") == "merged"]
    assert len(closed) == 1, f"expected 1 closed, got {len(closed)}"
    assert len(merged) == 1, f"expected 1 merged, got {len(merged)}"
    # closed has full total
    assert abs(closed[0].get("total_sales", 0) - EXPECTED_TOTAL) < 1
    # merged has merged_into pointing to closed
    assert merged[0].get("merged_into") == closed[0]["id"], f"merged_into={merged[0].get('merged_into')}, closed.id={closed[0]['id']}"
    # earliest shift (09:00) is the anchor kept as closed
    assert closed[0].get("shift_start", "").startswith("2026-07-02T09:00") or \
           closed[0].get("id") == "9c836d96-9fe9-466b-87f5-8648fb50f344", \
           f"earliest shift not anchor: closed={closed[0].get('id')} start={closed[0].get('shift_start')}"
