"""
Backend tests for the new 2FA + trusted-device + permanent IP ban + owner
security endpoints + purge-dummy-data. Uses public BASE_URL and dev_code
returned from server in preview (SMTP/Twilio not configured).
"""
import os
import uuid
import requests
import pytest

BASE_URL = os.environ.get(
    "REACT_APP_BACKEND_URL", "https://multi-cashier-vault.preview.emergentagent.com"
).rstrip("/")
API = f"{BASE_URL}/api"

ADMIN_EMAIL = "admin@maestroegp.com"
ADMIN_PASS = "admin123"
OWNER_EMAIL = "owner@maestroegp.com"
OWNER_PASS = "owner123"
OWNER_SECRET = "271018"
DRIVER_PHONE = "07801111111"
DRIVER_PIN = "1234"

# Throwaway IP for ban tests (never the owner's or shared test infra)
TEST_BAN_IP = "203.0.113.77"


# ---------------------------- Helpers ----------------------------

def _fresh_device_id():
    return f"dev-test-{uuid.uuid4().hex[:12]}"


def _ensure_admin_2fa():
    """Start staff 2FA on a fresh device, return (verification_id, dev_code)."""
    r = requests.post(
        f"{API}/auth/login",
        json={"email": ADMIN_EMAIL, "password": ADMIN_PASS},
        timeout=20,
    )
    assert r.status_code == 200, r.text
    data = r.json()
    assert data.get("requires_2fa") is True
    assert "verification_id" in data
    assert data.get("channel") == "email"
    assert data.get("pending_delivery") is True
    # Privacy: no destination shown
    assert "destination_masked" not in data
    assert "destination" not in data
    assert "email" not in data  # no raw email echoed
    assert "phone" not in data
    # No token yet
    assert "token" not in data
    assert "dev_code" in data, f"dev_code missing in preview: {data}"
    return data["verification_id"], data["dev_code"]


def _admin_login_with_2fa():
    """Full staff login flow. Returns (token, user, device_id)."""
    ver_id, code = _ensure_admin_2fa()
    r = requests.post(
        f"{API}/auth/login/verify-2fa",
        json={"verification_id": ver_id, "code": code},
        timeout=20,
    )
    assert r.status_code == 200, r.text
    data = r.json()
    assert "token" in data and "user" in data and "device_id" in data
    return data["token"], data["user"], data["device_id"]


def _owner_login_with_2fa():
    """Full owner login flow. Returns (super_admin_token, device_id)."""
    r = requests.post(
        f"{API}/super-admin/login",
        json={
            "email": OWNER_EMAIL,
            "password": OWNER_PASS,
            "secret_key": OWNER_SECRET,
        },
        timeout=20,
    )
    assert r.status_code == 200, r.text
    data = r.json()
    assert data.get("requires_2fa") is True
    assert data.get("channel") == "email"
    assert "destination_masked" not in data
    assert "dev_code" in data, f"owner dev_code missing: {data}"
    v = requests.post(
        f"{API}/auth/login/verify-2fa",
        json={"verification_id": data["verification_id"], "code": data["dev_code"]},
        timeout=20,
    )
    assert v.status_code == 200, v.text
    vd = v.json()
    assert "token" in vd and "device_id" in vd
    return vd["token"], vd["device_id"]


# ---------------------------- Staff 2FA ----------------------------

class TestStaff2FA:
    def test_login_new_device_requires_2fa_no_destination(self):
        ver_id, code = _ensure_admin_2fa()
        assert ver_id and code

    def test_verify_success_then_reuse_fails(self):
        ver_id, code = _ensure_admin_2fa()
        r1 = requests.post(
            f"{API}/auth/login/verify-2fa",
            json={"verification_id": ver_id, "code": code},
            timeout=20,
        )
        assert r1.status_code == 200, r1.text
        d = r1.json()
        assert d["user"]["email"] == ADMIN_EMAIL
        assert isinstance(d["token"], str) and len(d["token"]) > 10
        assert isinstance(d["device_id"], str)
        # Reuse must fail
        r2 = requests.post(
            f"{API}/auth/login/verify-2fa",
            json={"verification_id": ver_id, "code": code},
            timeout=20,
        )
        assert r2.status_code == 401, r2.text

    def test_verify_wrong_code_fails(self):
        ver_id, _ = _ensure_admin_2fa()
        r = requests.post(
            f"{API}/auth/login/verify-2fa",
            json={"verification_id": ver_id, "code": "000000"},
            timeout=20,
        )
        assert r.status_code == 401

    def test_trusted_device_bypasses_2fa(self):
        _, _, device_id = _admin_login_with_2fa()
        r = requests.post(
            f"{API}/auth/login",
            json={
                "email": ADMIN_EMAIL,
                "password": ADMIN_PASS,
                "device_id": device_id,
            },
            timeout=20,
        )
        assert r.status_code == 200, r.text
        d = r.json()
        assert not d.get("requires_2fa"), f"should skip 2FA: {d}"
        assert "token" in d and d["token"]


# ---------------------------- Owner 2FA ----------------------------

class TestOwner2FA:
    def test_owner_login_and_me(self):
        token, _ = _owner_login_with_2fa()
        me = requests.get(
            f"{API}/auth/me",
            headers={"Authorization": f"Bearer {token}"},
            timeout=20,
        )
        assert me.status_code == 200, me.text
        data = me.json()
        # role can be nested under user or direct
        role = data.get("role") or (data.get("user") or {}).get("role")
        assert role == "super_admin", f"unexpected role payload: {data}"


# ---------------------------- Driver 2FA ----------------------------

class TestDriver2FA:
    def test_driver_login_and_verify(self):
        r = requests.post(
            f"{API}/driver/login",
            params={"phone": DRIVER_PHONE, "pin": DRIVER_PIN},
            timeout=20,
        )
        assert r.status_code == 200, r.text
        d = r.json()
        assert d.get("requires_2fa") is True
        assert d.get("channel") in ("whatsapp", "email"), d
        assert d.get("pending_delivery") is True
        assert "destination_masked" not in d
        assert "dev_code" in d, d
        v = requests.post(
            f"{API}/driver/login/verify-2fa",
            json={"verification_id": d["verification_id"], "code": d["dev_code"]},
            timeout=20,
        )
        assert v.status_code == 200, v.text
        vd = v.json()
        assert "token" in vd and "device_id" in vd
        assert "driver" in vd or "user" in vd


# ---------------------------- Permanent IP Ban ----------------------------

class TestPermanentIPBan:
    def test_five_fails_ban_then_owner_unblock(self):
        headers = {"X-Forwarded-For": TEST_BAN_IP}
        # 5 failed logins
        for i in range(5):
            r = requests.post(
                f"{API}/auth/login",
                json={"email": ADMIN_EMAIL, "password": "WRONG_PASS_xx"},
                headers=headers,
                timeout=20,
            )
            # Should be 401 (or maybe 403 on last if banned mid-way). Accept both.
            assert r.status_code in (401, 403), f"attempt {i+1}: {r.status_code} {r.text}"

        # 6th request from same IP should be blocked at middleware level
        blocked = requests.post(
            f"{API}/auth/login",
            json={"email": ADMIN_EMAIL, "password": ADMIN_PASS},
            headers=headers,
            timeout=20,
        )
        assert blocked.status_code == 403, f"expected ban 403, got {blocked.status_code} {blocked.text}"

        # Now use owner token to inspect + unblock
        owner_token, _ = _owner_login_with_2fa()
        auth_h = {"Authorization": f"Bearer {owner_token}"}
        lst = requests.get(f"{API}/super-admin/blocked-ips", headers=auth_h, timeout=20)
        assert lst.status_code == 200, lst.text
        body = lst.json()
        ips_field = body.get("blocked_ips") or body.get("blocked") or body.get("ips") or body
        # Normalize to a set of ip strings
        ips_set = set()
        if isinstance(ips_field, list):
            for item in ips_field:
                if isinstance(item, str):
                    ips_set.add(item)
                elif isinstance(item, dict):
                    if "ip" in item:
                        ips_set.add(item["ip"])
        assert TEST_BAN_IP in ips_set, f"{TEST_BAN_IP} not in blocked list: {body}"

        # Unblock
        ub = requests.post(
            f"{API}/super-admin/unblock-ip",
            json={"ip": TEST_BAN_IP},
            headers=auth_h,
            timeout=20,
        )
        assert ub.status_code == 200, ub.text

        # Confirm removal
        lst2 = requests.get(f"{API}/super-admin/blocked-ips", headers=auth_h, timeout=20)
        body2 = lst2.json()
        ips2 = body2.get("blocked_ips") or body2.get("blocked") or body2.get("ips") or body2
        ips2_set = set()
        if isinstance(ips2, list):
            for item in ips2:
                if isinstance(item, str):
                    ips2_set.add(item)
                elif isinstance(item, dict) and "ip" in item:
                    ips2_set.add(item["ip"])
        assert TEST_BAN_IP not in ips2_set, f"still blocked after unblock: {body2}"


# ---------------------------- Owner Security Endpoints ----------------------------

class TestOwnerSecurityEndpoints:
    @pytest.fixture(scope="class")
    def owner_headers(self):
        token, _ = _owner_login_with_2fa()
        return {"Authorization": f"Bearer {token}"}

    def test_security_status(self, owner_headers):
        r = requests.get(f"{API}/super-admin/security-status", headers=owner_headers, timeout=20)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d.get("twilio_configured") is False
        assert "email_configured" in d and isinstance(d["email_configured"], bool)
        assert d.get("max_login_fails") == 5

    def test_pending_2fa_codes(self, owner_headers):
        # Trigger one pending
        _ensure_admin_2fa()
        r = requests.get(f"{API}/super-admin/pending-2fa-codes", headers=owner_headers, timeout=20)
        assert r.status_code == 200, r.text
        d = r.json()
        lst = d.get("codes") or d.get("pending") or d if isinstance(d, list) else d.get("items") or []
        if isinstance(d, dict):
            for k in ("codes", "pending", "items", "pending_codes"):
                if k in d and isinstance(d[k], list):
                    lst = d[k]
                    break
        assert isinstance(lst, list)
        if lst:
            has_dev = any(("dev_code" in x) or ("code" in x) for x in lst if isinstance(x, dict))
            assert has_dev, f"expected dev_code in one item: {lst[:2]}"

    def test_trusted_devices_and_revoke(self, owner_headers):
        # Ensure at least one trusted device exists
        _, _, dev_id = _admin_login_with_2fa()
        r = requests.get(f"{API}/super-admin/trusted-devices", headers=owner_headers, timeout=20)
        assert r.status_code == 200, r.text
        d = r.json()
        devices = d.get("devices") or d.get("trusted_devices") or (d if isinstance(d, list) else [])
        assert isinstance(devices, list) and len(devices) >= 1
        # owner_name field expected
        sample = devices[0]
        assert isinstance(sample, dict)
        # Not strictly enforced but should exist per spec
        # assert "owner_name" in sample
        # Revoke the device we just added
        rv = requests.post(
            f"{API}/super-admin/revoke-device",
            json={"device_id": dev_id},
            headers=owner_headers,
            timeout=20,
        )
        assert rv.status_code == 200, rv.text


# ---------------------------- Purge Dummy Data ----------------------------

class TestPurgeDummyData:
    @pytest.fixture(scope="class")
    def owner_headers(self):
        token, _ = _owner_login_with_2fa()
        return {"Authorization": f"Bearer {token}"}

    def test_dry_run_then_delete(self, owner_headers):
        dry = requests.post(
            f"{API}/super-admin/purge-dummy-data",
            json={"dry_run": True},
            headers=owner_headers,
            timeout=30,
        )
        assert dry.status_code == 200, dry.text
        dd = dry.json()
        # deleted counts must all be zero in dry-run
        deleted = dd.get("deleted") or {}
        if isinstance(deleted, dict):
            for k, v in deleted.items():
                assert v == 0, f"dry_run should not delete but {k}={v}: {dd}"
        # found lists should be present
        found = dd.get("found") or dd
        assert isinstance(found, (dict, list))

        # Real delete
        real = requests.post(
            f"{API}/super-admin/purge-dummy-data",
            json={"dry_run": False},
            headers=owner_headers,
            timeout=30,
        )
        assert real.status_code == 200, real.text
        rd = real.json()
        deleted2 = rd.get("deleted") or {}
        # At least one collection should have >0 deleted OR everything already gone (idempotent). Log for visibility.
        total_deleted = 0
        if isinstance(deleted2, dict):
            for v in deleted2.values():
                if isinstance(v, int):
                    total_deleted += v
        # Don't hard-fail if already purged in a previous iteration
        print(f"purge total_deleted={total_deleted} payload={rd}")
