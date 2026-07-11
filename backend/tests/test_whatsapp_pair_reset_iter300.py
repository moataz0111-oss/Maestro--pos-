"""Tests for iteration_300: WhatsApp pair with force=true, reset endpoint, and multi-phone flow.

- POST /api/super-admin/whatsapp/pair {phone, force:true} -> returns {ok:true, code} or friendly arabic error (never raw 'Connection Closed').
- POST /api/super-admin/whatsapp/reset -> {ok:true, message:'reset scheduled'}, super_admin only.
- GET  /api/super-admin/whatsapp/status -> qr non-null (data:image/png;base64,...), error None after warmup.
- Sequential pair with different phones + force=true should each be accepted (not 'already_paired' block).
"""
import os
import re
import time
import requests
import pytest

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
API = f"{BASE_URL}/api"

OWNER_EMAIL = "owner@maestroegp.com"
OWNER_PASSWORD = "owner123"
SECRET_KEY = "271018"

PHONE_A = "07705551234"  # Iraq mobile A
PHONE_B = "07711119999"  # Iraq mobile B


def _get_super_admin_token():
    r = requests.post(
        f"{API}/super-admin/login",
        json={"email": OWNER_EMAIL, "password": OWNER_PASSWORD, "secret_key": SECRET_KEY},
        timeout=30,
    )
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text[:300]}"
    body = r.json()
    # If 2FA challenge returned, fetch pending code and verify
    tok = body.get("token") or body.get("access_token")
    if tok:
        return tok
    # 2FA challenge path
    if body.get("verification_id") or body.get("challenge_id") or body.get("session_id"):
        # Try common verify endpoints — but for a fresh env 2FA usually disabled.
        pytest.skip(f"2FA required, cannot bypass automatically: {body}")
    pytest.skip(f"Unexpected login response, no token: {body}")


@pytest.fixture(scope="module")
def token():
    return _get_super_admin_token()


@pytest.fixture(scope="module")
def auth_headers(token):
    return {"Authorization": f"Bearer {token}"}


# ---------- STATUS ----------
class TestWhatsAppStatus:
    def test_status_requires_auth(self):
        r = requests.get(f"{API}/super-admin/whatsapp/status", timeout=15)
        assert r.status_code in (401, 403)

    def test_status_returns_qr_non_null_and_no_raw_connection_closed(self, auth_headers):
        # Wait briefly for wa_service to have warmed up
        qr = None
        error = "init"
        for _ in range(6):
            r = requests.get(f"{API}/super-admin/whatsapp/status", headers=auth_headers, timeout=15)
            assert r.status_code == 200, f"status non-200: {r.status_code} {r.text[:200]}"
            data = r.json()
            qr = data.get("qr")
            error = data.get("error")
            if qr:
                break
            time.sleep(2)
        assert qr and isinstance(qr, str) and qr.startswith("data:image/png;base64,"), \
            f"qr must be non-null data URL after warmup, got qr={str(qr)[:60]} error={error}"
        # error should not be the raw baileys 'Connection Closed' text
        if error:
            assert "Connection Closed" not in str(error), f"raw 'Connection Closed' leaked: {error}"


# ---------- PAIR ----------
class TestWhatsAppPair:
    def test_pair_requires_auth(self):
        r = requests.post(f"{API}/super-admin/whatsapp/pair",
                          json={"phone": PHONE_A, "force": True}, timeout=15)
        assert r.status_code in (401, 403)

    def test_pair_missing_phone_400(self, auth_headers):
        r = requests.post(f"{API}/super-admin/whatsapp/pair",
                          headers=auth_headers, json={"force": True}, timeout=15)
        assert r.status_code == 400

    def test_pair_with_force_phone_a(self, auth_headers):
        r = requests.post(
            f"{API}/super-admin/whatsapp/pair",
            headers=auth_headers,
            json={"phone": PHONE_A, "force": True},
            timeout=90,
        )
        assert r.status_code == 200, f"pair non-200: {r.status_code} {r.text[:300]}"
        data = r.json()
        # Either successful pairing code OR a friendly arabic error — never raw baileys
        if data.get("ok"):
            code = data.get("code", "")
            # 8 chars, split as XXXX-XXXX
            assert re.match(r"^[A-Z0-9]{4}-[A-Z0-9]{4}$", code) or len(code.replace("-", "")) == 8, \
                f"invalid code format: {code}"
        else:
            err = str(data.get("error", ""))
            # Must not leak the raw baileys text; must be an arabic friendly message OR contain arabic hint
            assert "Connection Closed" not in err or "انتظر" in err or "الخدمة" in err, \
                f"raw Connection Closed leaked without friendly wrapper: {err}"

    def test_pair_with_force_phone_b_after_a(self, auth_headers):
        """After pairing phone A, pairing phone B with force=true must be accepted (not 'already_paired')."""
        # small wait to let socket settle
        time.sleep(3)
        r = requests.post(
            f"{API}/super-admin/whatsapp/pair",
            headers=auth_headers,
            json={"phone": PHONE_B, "force": True},
            timeout=90,
        )
        assert r.status_code == 200, f"pair B non-200: {r.status_code} {r.text[:300]}"
        data = r.json()
        err = str(data.get("error", "") or "")
        # Critical: must not be blocked with already_paired/already_registered because force=true wipes
        assert "already_paired" not in err and "already_registered" not in err, \
            f"phone B rejected as already paired despite force=true: {err}"
        if data.get("ok"):
            code = data.get("code", "")
            assert len(code.replace("-", "")) == 8, f"invalid code B: {code}"
        else:
            # accept friendly arabic transient error
            assert "Connection Closed" not in err or "انتظر" in err or "الخدمة" in err, \
                f"raw Connection Closed leaked (B): {err}"


# ---------- RESET ----------
class TestWhatsAppReset:
    def test_reset_requires_auth(self):
        r = requests.post(f"{API}/super-admin/whatsapp/reset", timeout=15)
        assert r.status_code in (401, 403)

    def test_reset_ok(self, auth_headers):
        r = requests.post(f"{API}/super-admin/whatsapp/reset", headers=auth_headers, timeout=30)
        assert r.status_code == 200, f"reset non-200: {r.status_code} {r.text[:300]}"
        data = r.json()
        assert data.get("ok") is True, f"reset ok=false: {data}"
        assert "reset" in str(data.get("message", "")).lower(), f"unexpected message: {data}"

    def test_status_recovers_after_reset(self, auth_headers):
        # After reset, status should return without 'Connection Closed' raw text
        time.sleep(6)
        r = requests.get(f"{API}/super-admin/whatsapp/status", headers=auth_headers, timeout=15)
        assert r.status_code == 200
        err = r.json().get("error")
        if err:
            assert "Connection Closed" not in str(err), f"post-reset raw Connection Closed: {err}"
