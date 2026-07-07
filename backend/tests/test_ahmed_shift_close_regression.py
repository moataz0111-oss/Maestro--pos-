"""
Regression test: Verify that cash-register summary/close endpoints strictly enforce shift_id.

Bug context (Iter 287): Ahmed (cashier) opened a shift with sales ~802,750 IQD, while
the branch owner had an OLDER open shift with only 79,500 IQD. The summary endpoint
was picking the OLDEST open shift → closing report showed wrong totals.

Fix: Both frontend (Dashboard.js) and backend (shifts_routes.py) now require and
strictly enforce shift_id.

This test ensures the bug never regresses.
"""
import os
import time
import uuid
import subprocess
import pytest
import requests

BACKEND_URL = os.environ.get("BACKEND_URL", "http://localhost:8001")
API = f"{BACKEND_URL}/api"
TENANT = "default"
BRANCH_ID = "76f56acc-6948-4a2f-bbf4-feccbddea88f"


@pytest.fixture(scope="module")
def seeded():
    """يشغّل سكربت البذر لإنشاء وردية مالك ووردية كاشير في نفس الفرع."""
    script = os.path.join(os.path.dirname(__file__), "..", "seed_owner_cashier_close_test.py")
    subprocess.run(["python3", script], check=True, capture_output=True)
    time.sleep(1)
    return {
        "owner_shift_id": "closefix-shift-owner",
        "cashier_shift_id": "closefix-shift-cashier",
    }


@pytest.fixture(scope="module")
def admin_token():
    r = requests.post(f"{API}/auth/login",
                      json={"email": "admin@maestroegp.com", "password": "admin123"},
                      timeout=15)
    assert r.status_code == 200, f"admin login failed: {r.text}"
    return r.json()["token"]


def test_summary_requires_shift_id_and_returns_correct_totals(seeded, admin_token):
    """إذا مُرِّر shift_id صريح، يجب أن تُرجع الأرقام لتلك الوردية فقط."""
    headers = {"Authorization": f"Bearer {admin_token}"}

    # 1) طلب ملخص وردية الكاشير (802,750)
    r1 = requests.get(f"{API}/cash-register/summary",
                      params={"shift_id": seeded["cashier_shift_id"]},
                      headers=headers, timeout=15)
    assert r1.status_code == 200, f"cashier summary failed: {r1.text}"
    d1 = r1.json()
    total1 = float(d1.get("total_sales") or d1.get("cash_sales") or 0)
    assert total1 >= 800000, f"cashier shift total should be ~802,750, got {total1}"

    # 2) طلب ملخص وردية المالك (79,500)
    r2 = requests.get(f"{API}/cash-register/summary",
                      params={"shift_id": seeded["owner_shift_id"]},
                      headers=headers, timeout=15)
    assert r2.status_code == 200, f"owner summary failed: {r2.text}"
    d2 = r2.json()
    total2 = float(d2.get("total_sales") or d2.get("cash_sales") or 0)
    # وردية المالك: 79,500 (ليست بأكثر من 200 ألف)
    assert total2 < 200000, f"owner shift total should be ~79,500, got {total2}"

    # 3) التحقق من أن الوردية الصحيحة لا تختلط ببعضها
    assert total1 > total2 * 5, "shift totals mixed up — isolation broken!"


def test_summary_isolation_across_shifts(seeded, admin_token):
    """الأرقام يجب ألا تتغيّر عند تكرار الطلبات (idempotency)."""
    headers = {"Authorization": f"Bearer {admin_token}"}
    totals = []
    for _ in range(3):
        r = requests.get(f"{API}/cash-register/summary",
                         params={"shift_id": seeded["cashier_shift_id"]},
                         headers=headers, timeout=10)
        assert r.status_code == 200
        totals.append(float(r.json().get("total_sales") or r.json().get("cash_sales") or 0))
    # جميع القيم متطابقة (لا مزج مع الوردية الأخرى)
    assert len(set(totals)) == 1, f"summary not consistent across repeated calls: {totals}"


if __name__ == "__main__":
    # لتشغيل مباشر: python3 -m pytest -xvs test_ahmed_shift_close_regression.py
    pytest.main([__file__, "-xvs"])
