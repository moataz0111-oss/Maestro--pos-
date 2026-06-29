"""Integration test: biometric shift separation.

Verifies that two punches on the SAME calendar day belonging to different
shifts (e.g. 00:09 night-shift checkout + 23:57 next night-shift check-in)
are NOT merged into a single ~24h shift. The early-morning punch must be
reattributed to the previous business day.
"""
import os
import uuid
from datetime import datetime, timezone

import requests
from pymongo import MongoClient

API = os.environ.get("TEST_API_URL", "https://pos-security-audit-1.preview.emergentagent.com") + "/api"
ADMIN = {"email": "admin@maestroegp.com", "password": "admin123"}
MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "maestro_pos")

TENANT = "default"
UID = "99077"  # unlikely to collide
DAY = "2026-06-16"        # the calendar day with the overlapping punches
PREV = "2026-06-15"       # previous business day


def _token():
    r = requests.post(f"{API}/auth/login", json=ADMIN, timeout=20)
    r.raise_for_status()
    d = r.json()
    return d.get("access_token") or d.get("token")


def _db():
    return MongoClient(MONGO_URL)[DB_NAME]


def _cleanup(db, emp_id):
    db.employees.delete_many({"biometric_uid": UID})
    db.biometric_attendance.delete_many({"employee_code": UID})
    if emp_id:
        db.attendance.delete_many({"employee_id": emp_id})


def test_shift_separation_splits_overnight():
    db = _db()
    emp_id = str(uuid.uuid4())
    _cleanup(db, emp_id)

    now = datetime.now(timezone.utc).isoformat()
    db.employees.insert_one({
        "id": emp_id,
        "tenant_id": TENANT,
        "name": "موظف فصل الشفت",
        "biometric_uid": UID,
        "is_active": True,
        "shift_start": "20:00",
        "shift_end": "04:00",
        "work_hours_per_day": 8,
        "salary": 0,
        "created_at": now,
    })

    # Raw punches: prev-day check-in 22:00, this-day 00:09 (checkout of prev shift)
    # and 23:57 (check-in of tonight). Both 00:09 & 23:57 fall on DAY calendar date.
    raws = [
        {"employee_code": UID, "punch_time": f"{PREV}T22:00:00", "tenant_id": TENANT, "processed": False},
        {"employee_code": UID, "punch_time": f"{DAY}T00:09:00", "tenant_id": TENANT, "processed": False},
        {"employee_code": UID, "punch_time": f"{DAY}T23:57:00", "tenant_id": TENANT, "processed": False},
    ]
    for r in raws:
        r["id"] = str(uuid.uuid4())
    db.biometric_attendance.insert_many(raws)

    try:
        tok = _token()
        h = {"Authorization": f"Bearer {tok}"}
        resp = requests.post(f"{API}/attendance/auto-process", headers=h, timeout=60)
        assert resp.status_code == 200, resp.text

        prev_att = db.attendance.find_one({"employee_id": emp_id, "date": PREV})
        day_att = db.attendance.find_one({"employee_id": emp_id, "date": DAY})

        assert prev_att is not None, "previous day attendance missing"
        assert day_att is not None, "current day attendance missing"

        # Previous day: 22:00 check-in -> 00:09 overnight checkout (~2h, NOT 24h)
        assert prev_att["check_in"] == "22:00", prev_att
        assert prev_att["check_out"] == "00:09", prev_att
        assert prev_att["worked_hours"] <= 4, f"prev worked_hours too big: {prev_att['worked_hours']}"

        # Current day: only the 23:57 check-in, NOT a 24h shift
        assert day_att["check_in"] == "23:57", day_att
        # no giant 24h worked-hours block
        assert (day_att.get("worked_hours") or 0) <= 4, f"day worked_hours too big: {day_att['worked_hours']}"
    finally:
        _cleanup(db, emp_id)


def test_day_shift_two_shifts_separated():
    """Day-shift employee (no night config): 00:09 + 23:57 same day must NOT
    become a 24h shift on the current day."""
    db = _db()
    emp_id = str(uuid.uuid4())
    uid2 = "99078"
    db.employees.delete_many({"biometric_uid": uid2})
    db.biometric_attendance.delete_many({"employee_code": uid2})
    db.attendance.delete_many({"employee_id": emp_id})

    now = datetime.now(timezone.utc).isoformat()
    db.employees.insert_one({
        "id": emp_id,
        "tenant_id": TENANT,
        "name": "موظف نهاري",
        "biometric_uid": uid2,
        "is_active": True,
        "shift_start": "09:00",
        "shift_end": "17:00",
        "work_hours_per_day": 8,
        "salary": 0,
        "created_at": now,
    })
    raws = [
        {"employee_code": uid2, "punch_time": f"{DAY}T00:09:00", "tenant_id": TENANT, "processed": False},
        {"employee_code": uid2, "punch_time": f"{DAY}T23:57:00", "tenant_id": TENANT, "processed": False},
    ]
    for r in raws:
        r["id"] = str(uuid.uuid4())
    db.biometric_attendance.insert_many(raws)

    try:
        tok = _token()
        h = {"Authorization": f"Bearer {tok}"}
        resp = requests.post(f"{API}/attendance/auto-process", headers=h, timeout=60)
        assert resp.status_code == 200, resp.text

        day_att = db.attendance.find_one({"employee_id": emp_id, "date": DAY})
        assert day_att is not None, "current day attendance missing"
        # must NOT be a ~24h merged shift
        assert (day_att.get("worked_hours") or 0) <= 12, f"day worked_hours too big (24h merge bug): {day_att['worked_hours']}"
        assert day_att["check_in"] == "23:57", day_att
    finally:
        db.employees.delete_many({"biometric_uid": uid2})
        db.biometric_attendance.delete_many({"employee_code": uid2})
        db.attendance.delete_many({"employee_id": emp_id})


if __name__ == "__main__":
    test_shift_separation_splits_overnight()
    print("PASS: overnight shift separation")
    test_day_shift_two_shifts_separated()
    print("PASS: day-shift two-shift separation")