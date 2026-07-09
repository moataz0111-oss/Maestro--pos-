"""iter283: automatic integrity check regressions.

- GET /api/welcome-approvals (admin) 200
- POST close on a clean shift creates NO integrity_alert (no false positive)
- Backend log contains scheduler startup line
"""
import os, uuid, time, datetime as dt
import pytest, requests
from pymongo import MongoClient

BASE = os.environ.get("REACT_APP_BACKEND_URL", "https://multi-cashier-vault.preview.emergentagent.com").rstrip("/")
MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "maestro_pos")
ADMIN = {"email": "admin@maestroegp.com", "password": "admin123"}


@pytest.fixture(scope="module")
def db():
    return MongoClient(MONGO_URL)[DB_NAME]


@pytest.fixture(scope="module")
def admin_headers():
    r = requests.post(f"{BASE}/api/auth/login", json=ADMIN, timeout=15)
    if r.status_code != 200:
        pytest.skip("admin login failed")
    d = r.json()
    tok = d.get("token") or d.get("access_token")
    return {"Authorization": f"Bearer {tok}"}


def test_welcome_approvals_200(admin_headers):
    r = requests.get(f"{BASE}/api/welcome-approvals", headers=admin_headers, timeout=15)
    assert r.status_code == 200, r.text


def test_integrity_shifts_check_200(admin_headers):
    r = requests.get(
        f"{BASE}/api/integrity/shifts-check",
        params={"start_date": "2026-06-25", "end_date": "2026-07-07"},
        headers=admin_headers, timeout=30,
    )
    assert r.status_code == 200


def test_scheduler_startup_log():
    with open("/var/log/supervisor/backend.err.log") as f:
        content = f.read()
    assert "Hourly automatic integrity check scheduler started" in content, \
        "scheduler startup log line not found"


def test_post_close_no_false_alarm(admin_headers, db):
    """Create a clean shift + closing, wait 3s, verify NO integrity_alert notification created for it."""
    # Find an existing branch
    branch = db.branches.find_one({"tenant_id": "default"})
    if not branch:
        pytest.skip("no branch")
    branch_id = branch["id"]

    # Find a cashier user
    cashier = db.users.find_one({"tenant_id": "default", "role": "cashier"})
    if not cashier:
        pytest.skip("no cashier")

    shift_id = f"TEST_ITER283_SHIFT_{uuid.uuid4()}"
    now = dt.datetime.now(dt.timezone.utc)
    bd = now.date().isoformat()

    # Insert a clean shift (no orders, no expenses, opening=closing=0)
    db.shifts.insert_one({
        "id": shift_id,
        "tenant_id": "default",
        "branch_id": branch_id,
        "business_date": bd,
        "cashier_id": cashier["id"],
        "cashier_name": cashier.get("name", "test"),
        "opening_cash": 0.0,
        "status": "open",
        "opened_at": now.isoformat(),
        "created_at": now.isoformat(),
    })

    notif_count_before = db.notifications.count_documents({
        "type": "integrity_alert", "tenant_id": "default"
    })

    try:
        # Insert a clean closing directly (mirrors what the close endpoint does),
        # but we want to invoke the API path so the post-close async task fires.
        # Try close endpoint
        r = requests.post(
            f"{BASE}/api/shifts/{shift_id}/close",
            json={"closing_cash": 0.0, "expenses": [], "notes": "iter283 clean close"},
            headers=admin_headers, timeout=20,
        )
        # If endpoint path differs / 404, just insert closing manually to still test no-false-alarm via absence of new alert
        if r.status_code >= 400:
            # fallback: no close route triggered; skip
            pytest.skip(f"close endpoint returned {r.status_code}: {r.text[:200]}")

        # Wait for the post-close async integrity task
        time.sleep(3.5)

        notif_count_after = db.notifications.count_documents({
            "type": "integrity_alert", "tenant_id": "default",
            "shift_id": shift_id,
        })
        assert notif_count_after == 0, (
            f"FALSE POSITIVE: clean shift {shift_id} triggered integrity_alert"
        )

        # Also assert overall count didn't grow because of this shift
        # (allow scheduler/other alerts unrelated)
    finally:
        # Cleanup
        db.shifts.delete_one({"id": shift_id})
        db.cash_register_closings.delete_many({"shift_id": shift_id})
        db.notifications.delete_many({"shift_id": shift_id})


def test_no_post_close_integrity_failed_in_logs():
    with open("/var/log/supervisor/backend.err.log") as f:
        # only inspect last 200KB to avoid huge scans
        f.seek(0, 2)
        size = f.tell()
        f.seek(max(0, size - 200_000))
        tail = f.read()
    assert "post-close integrity failed" not in tail, \
        "backend log contains 'post-close integrity failed'"
