"""Smoke tests for HR leave-permissions feature (manager grant -> owner approval)."""
import os
import requests

API = os.environ.get("TEST_API_URL", "https://pwa-driver-track.preview.emergentagent.com") + "/api"
ADMIN = {"email": "admin@maestroegp.com", "password": "admin123"}


def _token():
    r = requests.post(f"{API}/auth/login", json=ADMIN, timeout=20)
    r.raise_for_status()
    d = r.json()
    return d.get("access_token") or d.get("token")


def test_leave_permission_full_flow():
    tok = _token()
    h = {"Authorization": f"Bearer {tok}"}
    emps = requests.get(f"{API}/employees", headers=h, timeout=20).json()
    assert emps, "no employees to test with"
    emp = emps[0]["id"]

    # create hourly permission
    r = requests.post(f"{API}/leave-permissions", headers=h, json={
        "employee_id": emp, "leave_type": "hourly", "date_from": "2026-06-20", "hours": 2, "reason": "pytest"
    }, timeout=20)
    assert r.status_code == 200, r.text
    pid = r.json()["permission"]["id"]
    assert r.json()["permission"]["status"] == "pending"

    # pending count >= 1
    pc = requests.get(f"{API}/leave-permissions/pending-count", headers=h, timeout=20).json()
    assert pc["pending"] >= 1

    # approve
    r = requests.put(f"{API}/leave-permissions/{pid}/approve", headers=h, timeout=20)
    assert r.status_code == 200, r.text

    # double approve fails
    r = requests.put(f"{API}/leave-permissions/{pid}/approve", headers=h, timeout=20)
    assert r.status_code == 400

    # list shows approved
    rows = requests.get(f"{API}/leave-permissions", headers=h, timeout=20).json()
    assert any(x["id"] == pid and x["status"] == "approved" for x in rows)
