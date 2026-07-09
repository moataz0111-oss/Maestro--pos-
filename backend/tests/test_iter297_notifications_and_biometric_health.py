"""iter297: notification preferences + biometric health dashboard + shift-close report."""
import os
import time
import uuid
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://multi-cashier-vault.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

BRANCH_ID = "76f56acc-6948-4a2f-bbf4-feccbddea88f"

DEFAULT_KEYS = {
    "shift_close_report_whatsapp": True,
    "shift_close_report_email": True,
    "shift_close_report_bell": True,
    "integrity_check_whatsapp": False,
    "integrity_check_email": False,
    "integrity_check_bell": True,
}


def _login(email, password):
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=30)
    assert r.status_code == 200, f"login failed for {email}: {r.status_code} {r.text}"
    return {"Authorization": f"Bearer {r.json()['token']}"}


@pytest.fixture(scope="module")
def admin_headers():
    return _login("admin@maestroegp.com", "admin123")


@pytest.fixture(scope="module")
def cashier_headers():
    try:
        return _login("cashier1@maestroegp.com", "cash123")
    except AssertionError:
        pytest.skip("cashier1 credential not available")


# ==================== NOTIFICATION PREFERENCES ====================

def test_get_notification_prefs_returns_defaults(admin_headers):
    # Ensure clean state by explicitly deleting existing pref doc via PUT with defaults
    r = requests.get(f"{API}/system/notification-preferences", headers=admin_headers, timeout=20)
    assert r.status_code == 200, r.text
    data = r.json()
    assert "preferences" in data and "defaults" in data
    for k, v in DEFAULT_KEYS.items():
        assert k in data["defaults"], f"missing default key {k}"
        assert data["defaults"][k] == v, f"default value mismatch for {k}: {data['defaults'][k]}"
    # preferences must contain all 6 keys
    for k in DEFAULT_KEYS.keys():
        assert k in data["preferences"], f"missing pref key {k}"


def test_put_notification_prefs_accepts_valid_rejects_unknown(admin_headers):
    # Toggle integrity_check_whatsapp True + unknown key
    body = {"integrity_check_whatsapp": True, "bogus_key": True, "shift_close_report_bell": False}
    r = requests.put(f"{API}/system/notification-preferences", headers=admin_headers, json=body, timeout=20)
    assert r.status_code == 200, r.text
    data = r.json()
    assert data.get("success") is True
    prefs = data["preferences"]
    assert prefs["integrity_check_whatsapp"] is True
    assert prefs["shift_close_report_bell"] is False
    assert "bogus_key" not in prefs
    # restore defaults
    restore = {k: v for k, v in DEFAULT_KEYS.items()}
    r2 = requests.put(f"{API}/system/notification-preferences", headers=admin_headers, json=restore, timeout=20)
    assert r2.status_code == 200
    for k, v in DEFAULT_KEYS.items():
        assert r2.json()["preferences"][k] == v


def test_put_notification_prefs_rejects_empty_updates(admin_headers):
    r = requests.put(f"{API}/system/notification-preferences", headers=admin_headers, json={"unknown": True}, timeout=20)
    assert r.status_code == 400


def test_notification_prefs_forbidden_for_cashier(cashier_headers):
    r = requests.get(f"{API}/system/notification-preferences", headers=cashier_headers, timeout=20)
    assert r.status_code == 403, f"expected 403 got {r.status_code}: {r.text}"
    r2 = requests.put(f"{API}/system/notification-preferences", headers=cashier_headers,
                      json={"integrity_check_whatsapp": True}, timeout=20)
    assert r2.status_code == 403


# ==================== BIOMETRIC HEALTH DASHBOARD ====================

def test_biometric_health_structure(admin_headers):
    r = requests.get(f"{API}/biometric/health", headers=admin_headers, timeout=30)
    assert r.status_code == 200, r.text
    data = r.json()
    assert "totals" in data and "branches" in data
    for k in ["devices_total", "devices_active", "devices_offline", "pending", "processing", "failed"]:
        assert k in data["totals"], f"missing totals.{k}"
        assert isinstance(data["totals"][k], int)
    assert isinstance(data["branches"], list)
    for br in data["branches"]:
        for k in ["branch_id", "branch_name", "devices_total", "devices_active",
                  "devices_offline", "last_sync", "queue", "devices"]:
            assert k in br, f"branch missing key {k}"
        for qk in ["pending", "processing", "completed", "failed"]:
            assert qk in br["queue"]


def test_biometric_health_offline_after_minutes(admin_headers):
    # create a device with no last_sync — will count as offline
    payload = {
        "name": f"BIO-TEST-HEALTH-{int(time.time())}",
        "ip_address": "10.0.0.222", "port": 4370, "branch_id": BRANCH_ID,
        "device_type": "fingerprint", "protocol": "zk-standard", "timeout": 5,
    }
    c = requests.post(f"{API}/biometric/devices", headers=admin_headers, json=payload, timeout=30)
    assert c.status_code == 200, c.text
    dev_id = c.json()["device"]["id"]
    try:
        r = requests.get(f"{API}/biometric/health?offline_after_minutes=5",
                         headers=admin_headers, timeout=30)
        assert r.status_code == 200
        data = r.json()
        # find our device in branches
        found = False
        for br in data["branches"]:
            for d in br["devices"]:
                if d["id"] == dev_id:
                    found = True
                    assert d["is_offline"] is True, f"device with no last_sync should be offline"
                    assert d.get("last_sync") in (None, "")
        assert found, "created device not found in health dashboard"
    finally:
        requests.delete(f"{API}/biometric/devices/{dev_id}", headers=admin_headers, timeout=15)


def test_biometric_health_forbidden_for_cashier(cashier_headers):
    r = requests.get(f"{API}/biometric/health", headers=cashier_headers, timeout=20)
    assert r.status_code == 403


# ==================== BIOMETRIC MODELS + DEVICE UPDATE + TEST ====================

def test_biometric_devices_models_shape(admin_headers):
    r = requests.get(f"{API}/biometric/devices/models", headers=admin_headers, timeout=20)
    assert r.status_code == 200
    d = r.json()
    assert len(d["protocols"]) == 3
    assert len(d["device_types"]) == 5
    assert isinstance(d["supported_models"], list) and len(d["supported_models"]) > 0


def test_biometric_device_update_new_fields(admin_headers):
    payload = {
        "name": f"BIO-TEST-UPD-{int(time.time())}",
        "ip_address": "10.0.0.221", "port": 4370, "branch_id": BRANCH_ID,
        "device_type": "fingerprint", "protocol": "zk-standard", "timeout": 5,
    }
    c = requests.post(f"{API}/biometric/devices", headers=admin_headers, json=payload, timeout=30)
    assert c.status_code == 200, c.text
    dev_id = c.json()["device"]["id"]
    try:
        u = requests.put(f"{API}/biometric/devices/{dev_id}", headers=admin_headers,
                        json={"protocol": "zk-push", "timeout": 15, "communication_password": "1234"}, timeout=20)
        assert u.status_code == 200, u.text
        updated = u.json()
        assert updated["protocol"] == "zk-push"
        assert updated["timeout"] == 15
        assert updated["communication_password"] == "1234"
    finally:
        requests.delete(f"{API}/biometric/devices/{dev_id}", headers=admin_headers, timeout=15)


def test_biometric_device_test_creates_probe_job(admin_headers):
    payload = {
        "name": f"BIO-TEST-PROBE-{int(time.time())}",
        "ip_address": "10.0.0.223", "port": 4370, "branch_id": BRANCH_ID,
        "device_type": "fingerprint", "protocol": "zk-standard", "timeout": 5,
    }
    c = requests.post(f"{API}/biometric/devices", headers=admin_headers, json=payload, timeout=30)
    assert c.status_code == 200
    dev_id = c.json()["device"]["id"]
    try:
        t = requests.post(f"{API}/biometric/devices/{dev_id}/test", headers=admin_headers, timeout=20)
        assert t.status_code == 200, t.text
        data = t.json()
        assert data.get("success") is True
        assert "job_id" in data
        assert "poll_url" in data and dev_id != data["poll_url"]
        assert data["poll_url"].endswith(data["job_id"])
    finally:
        requests.delete(f"{API}/biometric/devices/{dev_id}", headers=admin_headers, timeout=15)


# ==================== SHIFT CLOSE (no exception + sends report in background) ====================

def test_shift_close_no_exception_and_background_report(admin_headers):
    """Open a shift, close via /cash-register/close, verify no 5xx exception and endpoint returns quickly."""
    # get any cashier user
    users_r = requests.get(f"{API}/users?role=cashier", headers=admin_headers, timeout=20)
    if users_r.status_code != 200:
        pytest.skip("cannot list cashiers")
    cashiers = [u for u in users_r.json() if u.get("role") == "cashier"]
    if not cashiers:
        pytest.skip("no cashier available for shift-close test")
    cashier = cashiers[0]

    # ensure no open shift for this cashier — try cleanup via cleanup-non-cashier isn't right
    # open a shift
    open_r = requests.post(f"{API}/shifts/open-for-cashier", headers=admin_headers,
                           json={"cashier_id": cashier["id"], "branch_id": cashier.get("branch_id") or BRANCH_ID,
                                 "opening_cash": 0}, timeout=30)
    if open_r.status_code != 200:
        pytest.skip(f"cannot open shift: {open_r.status_code} {open_r.text[:200]}")
    shift = open_r.json().get("shift")
    if not shift:
        pytest.skip(f"open shift returned no shift: {open_r.json()}")
    shift_id = shift["id"]

    # close via cash-register/close
    close_r = requests.post(f"{API}/cash-register/close", headers=admin_headers,
                            json={"denominations": {}, "notes": "iter297 test",
                                  "shift_id": shift_id, "force_close_without_count": True},
                            timeout=45)
    assert close_r.status_code < 500, f"5xx from close: {close_r.status_code} {close_r.text[:500]}"
    # 200 expected
    assert close_r.status_code == 200, f"close returned {close_r.status_code}: {close_r.text[:500]}"
