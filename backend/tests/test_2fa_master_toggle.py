"""Tests for master 2FA toggle, session invalidation, readiness, email masking, user phone persistence."""
import os
import time
import requests
import pytest

def _load_backend_url():
    v = os.environ.get("REACT_APP_BACKEND_URL")
    if v:
        return v.rstrip("/")
    try:
        with open("/app/frontend/.env") as f:
            for line in f:
                if line.startswith("REACT_APP_BACKEND_URL="):
                    return line.split("=", 1)[1].strip().rstrip("/")
    except Exception:
        pass
    raise RuntimeError("REACT_APP_BACKEND_URL not found")

BASE_URL = _load_backend_url()
API = f"{BASE_URL}/api"

ADMIN_EMAIL = "admin@maestroegp.com"
ADMIN_PASS = "admin123"
OWNER_EMAIL = "owner@maestroegp.com"
OWNER_PASS = "owner123"
OWNER_SECRET = "271018"


def _post(path, **kw):
    return requests.post(f"{API}{path}", timeout=30, **kw)


def _get(path, **kw):
    return requests.get(f"{API}{path}", timeout=30, **kw)


def _login_admin_direct():
    r = _post("/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASS})
    return r


def _login_owner_direct():
    r = _post("/super-admin/login", json={"email": OWNER_EMAIL, "password": OWNER_PASS, "secret_key": OWNER_SECRET})
    return r


def _complete_2fa(login_resp_json, email, password, extra=None):
    """Complete 2FA using dev_code returned in login response."""
    dev_code = login_resp_json.get("dev_code") or login_resp_json.get("code")
    session_id = login_resp_json.get("session_id") or login_resp_json.get("twofa_session") or login_resp_json.get("two_fa_session_id")
    payload = {"email": email, "password": password, "code": dev_code}
    if session_id:
        payload["session_id"] = session_id
    if extra:
        payload.update(extra)
    return _post("/auth/login/verify-2fa", json=payload)


def _owner_get_token(state):
    """Get an owner token whether or not 2FA is enabled."""
    r = _login_owner_direct()
    assert r.status_code == 200, f"owner login failed: {r.status_code} {r.text}"
    data = r.json()
    if data.get("requires_2fa"):
        # need 2FA verify
        dev_code = data.get("dev_code")
        session_id = data.get("session_id") or data.get("two_fa_session_id")
        v = _post("/auth/login/verify-2fa", json={
            "email": OWNER_EMAIL, "password": OWNER_PASS,
            "secret_key": OWNER_SECRET, "code": dev_code,
            "verification_id": data.get("verification_id") or data.get("session_id")
        })
        assert v.status_code == 200, f"owner 2fa verify failed: {v.status_code} {v.text}"
        data = v.json()
    token = data.get("token") or data.get("access_token")
    assert token, f"no token in owner login: {data}"
    state["owner_data"] = data
    return token


state = {}


class Test2FAMasterToggle:

    def test_01_default_state_admin_direct_login(self):
        """Master toggle should default OFF: admin login returns token directly."""
        # First ensure 2FA is off (via owner)
        owner_token = _owner_get_token(state)
        r = _post("/super-admin/security-2fa-toggle",
                  headers={"Authorization": f"Bearer {owner_token}"},
                  json={"enabled": False})
        # Toggle off should succeed (or be no-op)
        assert r.status_code in (200, 201), f"disable 2fa failed: {r.status_code} {r.text}"

        # Now admin login must be direct
        r = _login_admin_direct()
        assert r.status_code == 200, f"admin login failed: {r.status_code} {r.text}"
        data = r.json()
        assert not data.get("requires_2fa"), f"expected direct login, got {data}"
        assert data.get("token") or data.get("access_token"), f"no token: {data}"

    def test_02_enable_2fa_via_owner(self):
        """Owner enables 2FA -> success, devices_revoked and driver_sessions_cleared present."""
        owner_token = _owner_get_token(state)
        state["owner_token_pre_enable"] = owner_token

        r = _post("/super-admin/security-2fa-toggle",
                  headers={"Authorization": f"Bearer {owner_token}"},
                  json={"enabled": True})
        assert r.status_code == 200, f"enable 2fa failed: {r.status_code} {r.text}"
        d = r.json()
        assert d.get("success") is True or d.get("ok") is True or d.get("two_fa_enabled") is True, f"unexpected: {d}"
        assert d.get("two_fa_enabled") is True, f"two_fa_enabled not true: {d}"
        assert "devices_revoked" in d, f"devices_revoked missing: {d}"
        assert "driver_sessions_cleared" in d, f"driver_sessions_cleared missing: {d}"
        assert d["devices_revoked"] >= 0
        assert d["driver_sessions_cleared"] >= 0

    def test_03_owner_token_invalidated_after_enable(self):
        """The owner token used to enable 2FA must be invalidated (iat < sessions_valid_after)."""
        token = state.get("owner_token_pre_enable")
        assert token, "no pre-enable owner token"
        r = _get("/auth/me", headers={"Authorization": f"Bearer {token}"})
        assert r.status_code == 401, f"expected 401 after activation, got {r.status_code} {r.text}"

    def test_04_admin_login_requires_2fa_with_masked_email(self):
        """Admin login now requires 2FA, destination_masked hides local part."""
        r = _login_admin_direct()
        assert r.status_code == 200, f"admin login failed: {r.status_code} {r.text}"
        d = r.json()
        assert d.get("requires_2fa") is True, f"requires_2fa not true: {d}"
        assert d.get("channel") == "email", f"channel != email: {d}"
        masked = d.get("destination_masked") or d.get("destination")
        assert masked == "***@maestroegp.com", f"expected '***@maestroegp.com', got {masked!r}"
        state["admin_2fa_resp"] = d

    def test_05_complete_admin_2fa(self):
        """Complete admin 2FA using dev_code -> token + device_id."""
        d = state.get("admin_2fa_resp")
        assert d, "no admin 2fa response"
        dev_code = d.get("dev_code")
        assert dev_code, f"no dev_code in {d}"
        session_id = d.get("verification_id") or d.get("session_id") or d.get("two_fa_session_id")
        payload = {"email": ADMIN_EMAIL, "password": ADMIN_PASS, "code": dev_code}
        if session_id:
            payload["verification_id"] = session_id
        r = _post("/auth/login/verify-2fa", json=payload)
        assert r.status_code == 200, f"verify failed: {r.status_code} {r.text}"
        j = r.json()
        assert j.get("token") or j.get("access_token"), f"no token: {j}"
        assert j.get("device_id"), f"no device_id: {j}"
        state["admin_token"] = j.get("token") or j.get("access_token")

    def test_06_2fa_readiness_endpoint(self):
        """Owner calls readiness endpoint."""
        # Re-login owner (now requires 2FA)
        r = _login_owner_direct()
        assert r.status_code == 200
        d = r.json()
        if d.get("requires_2fa"):
            v = _post("/auth/login/verify-2fa", json={
                "email": OWNER_EMAIL, "password": OWNER_PASS,
                "secret_key": OWNER_SECRET,
                "code": d.get("dev_code"),
                "verification_id": d.get("verification_id") or d.get("session_id")
            })
            assert v.status_code == 200, f"owner verify failed: {v.status_code} {v.text}"
            d = v.json()
        owner_token = d.get("token") or d.get("access_token")
        state["owner_token"] = owner_token

        r = _get("/super-admin/2fa-readiness",
                 headers={"Authorization": f"Bearer {owner_token}"})
        assert r.status_code == 200, f"readiness failed: {r.status_code} {r.text}"
        j = r.json()
        assert "total_users" in j, f"total_users missing: {j}"
        assert "users_without_phone" in j, f"users_without_phone missing: {j}"
        assert "users_without_any_contact" in j, f"users_without_any_contact missing: {j}"
        assert "drivers_without_phone" in j, f"drivers_without_phone missing: {j}"
        assert isinstance(j["users_without_phone"], list)
        assert isinstance(j["users_without_any_contact"], list)
        assert isinstance(j["drivers_without_phone"], list)

    def test_07_disable_2fa(self):
        """Disable 2FA to restore normal login."""
        owner_token = state.get("owner_token")
        assert owner_token
        r = _post("/super-admin/security-2fa-toggle",
                  headers={"Authorization": f"Bearer {owner_token}"},
                  json={"enabled": False})
        assert r.status_code == 200, f"disable failed: {r.status_code} {r.text}"
        d = r.json()
        assert d.get("two_fa_enabled") is False, f"two_fa_enabled not false: {d}"

    def test_08_admin_direct_login_restored(self):
        """After disable, admin login is direct again."""
        r = _login_admin_direct()
        assert r.status_code == 200, f"admin login failed: {r.status_code} {r.text}"
        d = r.json()
        assert not d.get("requires_2fa"), f"still requires 2fa: {d}"
        token = d.get("token") or d.get("access_token")
        assert token
        state["admin_token_direct"] = token

    def test_09_user_phone_create_and_persist(self):
        """Create user with phone, verify in GET /users, then update via PUT."""
        admin_token = state.get("admin_token_direct")
        assert admin_token
        headers = {"Authorization": f"Bearer {admin_token}"}

        # Get a branch id
        rb = _get("/branches", headers=headers)
        assert rb.status_code == 200, f"branches failed: {rb.status_code} {rb.text}"
        branches = rb.json()
        assert isinstance(branches, list) and len(branches) > 0, f"no branches: {branches}"
        branch_id = branches[0].get("id") or branches[0].get("_id")
        assert branch_id, f"no branch id: {branches[0]}"

        ts = int(time.time())
        payload = {
            "username": f"testcashier_{ts}",
            "email": f"TEST_cashier_{ts}@maestroegp.com",
            "password": "TestPass123!",
            "full_name": "Test Cashier",
            "role": "cashier",
            "branch_id": branch_id,
            "phone": "+9647801234567"
        }
        rc = _post("/users", headers=headers, json=payload)
        assert rc.status_code in (200, 201), f"create user failed: {rc.status_code} {rc.text}"
        created = rc.json()
        user_id = created.get("id") or created.get("_id")
        assert user_id, f"no user id: {created}"
        state["test_user_id"] = user_id

        # Verify via GET /users
        rl = _get("/users", headers=headers)
        assert rl.status_code == 200, f"list users failed: {rl.status_code} {rl.text}"
        users = rl.json()
        found = next((u for u in users if (u.get("id") == user_id or u.get("_id") == user_id)), None)
        assert found, f"created user not in list"
        assert found.get("phone") == "+9647801234567", f"phone not persisted: {found.get('phone')}"

        # Update phone
        ru = requests.put(f"{API}/users/{user_id}",
                          headers=headers,
                          json={"phone": "+9647809998887"}, timeout=30)
        assert ru.status_code in (200, 204), f"update failed: {ru.status_code} {ru.text}"

        # Verify update
        rl2 = _get("/users", headers=headers)
        users2 = rl2.json()
        found2 = next((u for u in users2 if (u.get("id") == user_id or u.get("_id") == user_id)), None)
        assert found2, "user missing after update"
        assert found2.get("phone") == "+9647809998887", f"phone not updated: {found2.get('phone')}"

    def test_10_cleanup_test_user(self):
        """Delete the test user."""
        admin_token = state.get("admin_token_direct")
        user_id = state.get("test_user_id")
        if not (admin_token and user_id):
            pytest.skip("nothing to cleanup")
        r = requests.delete(f"{API}/users/{user_id}",
                            headers={"Authorization": f"Bearer {admin_token}"}, timeout=30)
        # Cleanup is best-effort; log if not supported
        assert r.status_code in (200, 204, 404, 405), f"unexpected delete status: {r.status_code} {r.text}"

    def test_11_final_state_2fa_disabled(self):
        """Ensure 2FA is left DISABLED at the end."""
        r = _login_admin_direct()
        assert r.status_code == 200
        d = r.json()
        assert not d.get("requires_2fa"), f"2FA still enabled at end! {d}"
