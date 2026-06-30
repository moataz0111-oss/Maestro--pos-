"""
iter254 — Auto-ban (automatic blocking of attackers) E2E test.

Verifies:
  1. Sending 20+ rejected write attempts with a SPOOFED X-Forwarded-For IP causes
     that IP to be auto-added to blocked_ips (auto=true, reason mentions attempted path).
  2. Subsequent requests with the same spoofed XFF return 403 + JSON {blocked: True}.
  3. The pod's own real IP remains functional (200) — only the spoofed XFF is banned.
  4. Cleanup: unblock the fake IP.
  5. Regression: anonymous /api/ reachable, admin login still works.

NOTE: We use a DIFFERENT fake IP than previous iteration to avoid leftover state.
"""
import os
import time
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    with open("/app/frontend/.env") as f:
        for line in f:
            if line.startswith("REACT_APP_BACKEND_URL="):
                BASE_URL = line.split("=", 1)[1].strip().rstrip("/")
                break

SA_EMAIL = "owner@maestroegp.com"
SA_PASSWORD = "owner123"
SA_SECRET = "271018"

FAKE_IP = "198.51.100.42"   # TEST-NET-2 reserved range, never a real client


@pytest.fixture(scope="module")
def sa_headers():
    r = requests.post(
        f"{BASE_URL}/api/super-admin/login",
        json={"email": SA_EMAIL, "password": SA_PASSWORD, "secret_key": SA_SECRET},
        timeout=15,
    )
    assert r.status_code == 200, f"super-admin login failed: {r.status_code} {r.text}"
    tok = r.json()["token"]
    return {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}


@pytest.fixture(scope="module", autouse=True)
def ensure_clean(sa_headers):
    """Ensure FAKE_IP not blocked before/after the module."""
    requests.post(f"{BASE_URL}/api/super-admin/unblock-ip",
                  json={"ip": FAKE_IP}, headers=sa_headers, timeout=10)
    yield
    requests.post(f"{BASE_URL}/api/super-admin/unblock-ip",
                  json={"ip": FAKE_IP}, headers=sa_headers, timeout=10)


def _list_blocked(sa_headers):
    r = requests.get(f"{BASE_URL}/api/super-admin/blocked-ips",
                     headers=sa_headers, timeout=10)
    assert r.status_code == 200
    return r.json().get("blocked", [])


# === 1. Generating 20+ forbidden writes from a spoofed IP triggers auto-ban ===
def test_auto_ban_triggers_after_20_offenses(sa_headers):
    spoof = {"X-Forwarded-For": FAKE_IP, "Content-Type": "application/json"}
    # 25 unauthenticated POSTs to /api/products → should be 401/403 (forbidden write)
    for i in range(25):
        try:
            requests.post(f"{BASE_URL}/api/products",
                          json={"name": f"X{i}"}, headers=spoof, timeout=8)
        except requests.RequestException:
            pass
    # Give a moment for the audit middleware + DB write
    time.sleep(2)

    blocked = _list_blocked(sa_headers)
    ips = [b.get("ip") for b in blocked]
    assert FAKE_IP in ips, f"Auto-ban did NOT trigger. blocked={ips}"

    entry = next(b for b in blocked if b.get("ip") == FAKE_IP)
    assert entry.get("auto") is True, f"entry not flagged auto: {entry}"
    reason = entry.get("reason") or ""
    assert "/api/products" in (entry.get("last_path") or "") or "/api/products" in reason, (
        f"Reason/last_path doesn't reference attempted path: {entry}"
    )


# === 2. After ban, requests from that XFF get 403 {blocked: True} ===
def test_banned_ip_gets_403_blocked_json():
    spoof = {"X-Forwarded-For": FAKE_IP, "Accept": "application/json"}
    r = requests.get(f"{BASE_URL}/api/", headers=spoof, timeout=10)
    assert r.status_code == 403, f"Expected 403 for banned XFF; got {r.status_code}"
    try:
        body = r.json()
    except Exception:
        pytest.fail(f"Expected JSON body, got: {r.text[:200]}")
    assert body.get("blocked") is True, f"Expected blocked:true; got {body}"
    assert "detail" in body


# === 3. Pod's own (real) IP must still work — testing-pod safeguard ===
def test_real_pod_ip_still_works():
    """Without spoofed XFF, the testing pod's outbound IP must remain 200."""
    r = requests.get(f"{BASE_URL}/api/", timeout=10)
    assert r.status_code == 200, (
        f"Testing pod was inadvertently banned! /api/ returned {r.status_code}"
    )


# === 4. Unblock cleanup verified ===
def test_unblock_fake_ip(sa_headers):
    r = requests.post(f"{BASE_URL}/api/super-admin/unblock-ip",
                      json={"ip": FAKE_IP}, headers=sa_headers, timeout=10)
    assert r.status_code == 200
    assert r.json().get("success") is True

    blocked = _list_blocked(sa_headers)
    ips = [b.get("ip") for b in blocked]
    assert FAKE_IP not in ips, f"unblock didn't remove: {ips}"

    # And the spoofed XFF can now reach /api/
    r2 = requests.get(f"{BASE_URL}/api/",
                      headers={"X-Forwarded-For": FAKE_IP}, timeout=10)
    assert r2.status_code == 200, f"After unblock /api/ should be 200; got {r2.status_code}"


# === 5. Regression: admin login still works (interceptor regression check) ===
def test_admin_login_regression():
    r = requests.post(f"{BASE_URL}/api/auth/login",
                      json={"email": "admin@maestroegp.com", "password": "admin123"},
                      timeout=15)
    assert r.status_code == 200, f"admin login failed: {r.status_code} {r.text}"
    assert "token" in r.json()


# === 6. Regression: a WRONG-password login still returns 401 (not 403/blocked) ===
def test_wrong_login_still_401_not_blocked():
    r = requests.post(f"{BASE_URL}/api/auth/login",
                      json={"email": "admin@maestroegp.com", "password": "WRONG-PASS-xyz"},
                      timeout=15)
    assert r.status_code in (401, 423), (
        f"Wrong login should be 401/423; got {r.status_code} {r.text[:200]}"
    )
    # MUST NOT be a blocked JSON payload (no 'blocked':true)
    try:
        body = r.json()
        assert not body.get("blocked"), f"Wrong login mis-flagged as blocked: {body}"
    except ValueError:
        pass


# === 7. Security-log endpoint exposes auto-blocked entries with reason ===
def test_security_log_shows_auto_entries(sa_headers):
    # Re-trigger so we can read it
    spoof = {"X-Forwarded-For": FAKE_IP, "Content-Type": "application/json"}
    for i in range(25):
        try:
            requests.post(f"{BASE_URL}/api/products",
                          json={"name": f"Y{i}"}, headers=spoof, timeout=8)
        except requests.RequestException:
            pass
    time.sleep(2)

    r = requests.get(f"{BASE_URL}/api/super-admin/blocked-ips",
                     headers=sa_headers, timeout=10)
    assert r.status_code == 200
    blocked = r.json().get("blocked", [])
    auto_entries = [b for b in blocked if b.get("auto") is True]
    assert len(auto_entries) >= 1, "Expected at least one auto-blocked entry"
    e = next((b for b in auto_entries if b.get("ip") == FAKE_IP), None)
    assert e is not None, f"Our fake auto entry missing: {[b.get('ip') for b in auto_entries]}"
    assert e.get("reason"), "auto entry missing reason text"
    # cleanup
    requests.post(f"{BASE_URL}/api/super-admin/unblock-ip",
                  json={"ip": FAKE_IP}, headers=sa_headers, timeout=10)
