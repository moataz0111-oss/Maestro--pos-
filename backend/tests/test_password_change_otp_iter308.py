"""
iter308 — Password change OTP-required flow + super_admin secret_key change
+ General Manager access + Old token invalidation after PW change
"""
import os, sys, uuid, asyncio
import pytest
import requests
from datetime import datetime, timezone

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

BASE = os.environ.get("REACT_APP_BACKEND_URL", "http://localhost:8001").rstrip("/") + "/api"


def _run(coro):
    return asyncio.get_event_loop().run_until_complete(coro)


async def _db():
    from motor.motor_asyncio import AsyncIOMotorClient
    client = AsyncIOMotorClient(os.environ["MONGO_URL"])
    return client, client[os.environ["DB_NAME"]]


async def _trust_device(subject_id, device_id):
    client, db = await _db()
    now = datetime.now(timezone.utc).isoformat()
    await db.trusted_devices.update_one(
        {"subject_type": "user", "subject_id": str(subject_id), "device_id": device_id},
        {"$set": {"subject_type": "user", "subject_id": str(subject_id),
                  "device_id": device_id, "last_seen_at": now, "revoked": False},
         "$setOnInsert": {"id": str(uuid.uuid4()), "created_at": now}},
        upsert=True,
    )
    client.close()


async def _get_user(email):
    client, db = await _db()
    u = await db.users.find_one({"email": email}, {"_id": 0})
    client.close()
    return u


async def _get_verification_code(vid):
    """Read verification session and derive code. Since code is hashed, we
    can only test with the raw code if we intercept before hashing. Instead
    we read the session and use the salt+hash to bruteforce (4-digit code -> 10k)."""
    client, db = await _db()
    sess = await db.verification_sessions.find_one({"id": vid}, {"_id": 0})
    client.close()
    return sess


def _hash_otp(code, salt):
    import hashlib
    jwt_secret = os.environ.get("JWT_SECRET", "")
    return hashlib.sha256(f"{salt}:{code}:{jwt_secret}".encode()).hexdigest()


def _find_code_for_session(sess):
    """Brute-force the OTP code (4-6 digits) to match the stored hash."""
    if not sess or not sess.get("code_hash"):
        return None
    salt = sess.get("salt", "")
    target = sess["code_hash"]
    # Try 6 digits then 4 digits
    for width in (6, 5, 4):
        for i in range(10 ** width):
            code = str(i).zfill(width)
            if _hash_otp(code, salt) == target:
                return code
    return None


def _seed_hash(code, salt):
    return _hash_otp(code, salt)


# ---------- Login helpers ----------
def _login(email, password, device):
    r = requests.post(f"{BASE}/auth/login",
                      json={"email": email, "password": password, "device_id": device},
                      timeout=15)
    return r


def _sa_login(secret_key="271018", password="owner123", device="dev-sa-iter308"):
    r = requests.post(f"{BASE}/super-admin/login",
                      json={"email": "owner@maestroegp.com", "password": password,
                            "secret_key": secret_key, "device_id": device},
                      timeout=15)
    return r


# ---------- Prepare: trust admin & super_admin devices ----------
@pytest.fixture(scope="module", autouse=True)
def setup_devices():
    admin = _run(_get_user("admin@maestroegp.com"))
    sa = _run(_get_user("owner@maestroegp.com"))
    assert admin, "admin user not found"
    assert sa, "super_admin user not found"
    _run(_trust_device(admin["id"], "dev-admin-iter308"))
    _run(_trust_device(sa["id"], "dev-sa-iter308"))
    # Store for tests
    pytest.admin_id = admin["id"]
    pytest.sa_id = sa["id"]
    yield
    # Restore passwords/secret at end (best effort)
    from passlib.hash import bcrypt
    async def _restore():
        client, db = await _db()
        await db.users.update_one(
            {"email": "admin@maestroegp.com"},
            {"$set": {"password": bcrypt.hash("admin123"), "active_session_id": None}}
        )
        await db.users.update_one(
            {"email": "owner@maestroegp.com"},
            {"$set": {"password": bcrypt.hash("owner123"),
                      "secret_key": "271018", "super_admin_secret": "271018",
                      "active_session_id": None}}
        )
        client.close()
    _run(_restore())


# ---------- Tests ----------
def test_admin_login_baseline():
    r = _login("admin@maestroegp.com", "admin123", "dev-admin-iter308")
    assert r.status_code == 200, r.text
    body = r.json()
    assert "token" in body, f"unexpected 2FA challenge: {body}"


def test_pw_change_first_call_returns_202_otp_required():
    """(1) FIRST call without otp_code → 202 with otp_required=True, challenge_id, channels_sent."""
    r = _login("admin@maestroegp.com", "admin123", "dev-admin-iter308")
    assert r.status_code == 200
    tok = r.json()["token"]
    r2 = requests.put(f"{BASE}/users/{pytest.admin_id}/reset-password",
                      headers={"Authorization": f"Bearer {tok}"},
                      json={"new_password": "AdminNew123!"},
                      timeout=15)
    assert r2.status_code == 202, f"expected 202, got {r2.status_code}: {r2.text}"
    body = r2.json()
    assert body.get("otp_required") is True, body
    assert body.get("otp_challenge_id"), body
    assert isinstance(body.get("channels_sent"), list), body


def test_pw_change_wrong_otp_returns_401():
    r = _login("admin@maestroegp.com", "admin123", "dev-admin-iter308")
    tok = r.json()["token"]
    r2 = requests.put(f"{BASE}/users/{pytest.admin_id}/reset-password",
                      headers={"Authorization": f"Bearer {tok}"},
                      json={"new_password": "AdminNew123!"}, timeout=15)
    assert r2.status_code == 202, r2.text
    vid = r2.json()["otp_challenge_id"]
    r3 = requests.put(f"{BASE}/users/{pytest.admin_id}/reset-password",
                      headers={"Authorization": f"Bearer {tok}"},
                      json={"new_password": "AdminNew123!",
                            "otp_challenge_id": vid, "otp_code": "000000"},
                      timeout=15)
    assert r3.status_code == 401, f"expected 401 with wrong OTP, got {r3.status_code}: {r3.text}"


def test_pw_change_correct_otp_success_and_old_password_rejected():
    """Full lifecycle: change PW → login old fails, new succeeds."""
    # Login
    r = _login("admin@maestroegp.com", "admin123", "dev-admin-iter308")
    assert r.status_code == 200, r.text
    tok = r.json()["token"]
    # First call → get challenge
    r2 = requests.put(f"{BASE}/users/{pytest.admin_id}/reset-password",
                      headers={"Authorization": f"Bearer {tok}"},
                      json={"new_password": "AdminNew456!"}, timeout=15)
    assert r2.status_code == 202, r2.text
    vid = r2.json()["otp_challenge_id"]
    # Read code from db
    sess = _run(_get_verification_code(vid))
    assert sess, "verification session not found"
    code = _find_code_for_session(sess)
    assert code, f"could not derive OTP code from session hash (salt={sess.get('salt')})"
    # Second call → success
    r3 = requests.put(f"{BASE}/users/{pytest.admin_id}/reset-password",
                      headers={"Authorization": f"Bearer {tok}"},
                      json={"new_password": "AdminNew456!",
                            "otp_challenge_id": vid, "otp_code": code}, timeout=15)
    assert r3.status_code == 200, f"expected 200 on correct OTP, got {r3.status_code}: {r3.text}"
    body = r3.json()
    assert body.get("secret_key_changed") is False, body
    # OLD password login must fail
    r4 = _login("admin@maestroegp.com", "admin123", "dev-admin-iter308")
    assert r4.status_code == 401, f"OLD password should now be 401, got {r4.status_code}: {r4.text}"
    # NEW password login must succeed
    r5 = _login("admin@maestroegp.com", "AdminNew456!", "dev-admin-iter308")
    assert r5.status_code == 200, f"NEW password should login, got {r5.status_code}: {r5.text}"
    pytest.admin_current_pw = "AdminNew456!"


def test_super_admin_change_password_and_secret_key_together():
    """super_admin can change password AND secret_key in ONE request."""
    r = _sa_login()
    assert r.status_code == 200, f"SA login: {r.text}"
    body = r.json()
    assert "token" in body, f"unexpected 2FA: {body}"
    tok = body["token"]
    # First call → 202
    r2 = requests.put(f"{BASE}/users/{pytest.sa_id}/reset-password",
                      headers={"Authorization": f"Bearer {tok}"},
                      json={"new_password": "OwnerNew123!", "new_secret_key": "999888"},
                      timeout=15)
    assert r2.status_code == 202, r2.text
    vid = r2.json()["otp_challenge_id"]
    sess = _run(_get_verification_code(vid))
    code = _find_code_for_session(sess)
    assert code, "could not derive OTP for SA session"
    r3 = requests.put(f"{BASE}/users/{pytest.sa_id}/reset-password",
                      headers={"Authorization": f"Bearer {tok}"},
                      json={"new_password": "OwnerNew123!", "new_secret_key": "999888",
                            "otp_challenge_id": vid, "otp_code": code}, timeout=15)
    assert r3.status_code == 200, f"SA pw+sk change failed: {r3.status_code} {r3.text}"
    assert r3.json().get("secret_key_changed") is True, r3.json()
    # OLD secret_key must fail (403 by SA login design, or 401)
    r4 = _sa_login(secret_key="271018", password="OwnerNew123!")
    assert r4.status_code in (401, 403), f"OLD secret should reject, got {r4.status_code}"
    # OLD password must fail
    r5 = _sa_login(secret_key="999888", password="owner123")
    assert r5.status_code in (401, 403), f"OLD password should reject, got {r5.status_code}"
    # NEW + NEW succeed
    r6 = _sa_login(secret_key="999888", password="OwnerNew123!")
    assert r6.status_code == 200, f"NEW creds should login: {r6.text}"


def test_general_manager_has_access_to_admin_endpoints():
    """GM should NOT get 403 on admin-level endpoints."""
    # Seed a GM user
    from passlib.hash import bcrypt
    gm_email = "iter308_gm@t.com"
    gm_pw = "GmPass123!"
    gm_id = "iter308-gm-access"
    async def _seed():
        client, db = await _db()
        await db.users.update_one(
            {"id": gm_id},
            {"$set": {"id": gm_id, "username": "iter308gm", "email": gm_email,
                      "full_name": "iter308 gm", "role": "general_manager",
                      "tenant_id": "default", "password": bcrypt.hash(gm_pw),
                      "is_active": True, "permissions": []}},
            upsert=True)
        client.close()
    _run(_seed())
    _run(_trust_device(gm_id, "dev-gm-iter308"))
    r = _login(gm_email, gm_pw, "dev-gm-iter308")
    assert r.status_code == 200, r.text
    tok = r.json()["token"]
    H = {"Authorization": f"Bearer {tok}"}
    endpoints = [
        "/users", "/branches", "/expenses", "/purchases",
        "/hr/employees", "/notifications",
        "/finance/reports/dashboard-summary",
    ]
    failed_403 = []
    for ep in endpoints:
        rr = requests.get(f"{BASE}{ep}", headers=H, timeout=10)
        if rr.status_code == 403:
            failed_403.append((ep, rr.text[:120]))
    # Cleanup
    async def _cleanup():
        client, db = await _db()
        await db.users.delete_one({"id": gm_id})
        client.close()
    _run(_cleanup())
    assert not failed_403, f"GM got 403 on: {failed_403}"


def test_old_token_invalidated_after_password_change_admin_note():
    """
    Requirement: after PW change, active_session_id nulled → OLD token should 401.
    NOTE: for admin/super_admin, issue_user_session doesn't set active_session_id
    (multi-device allowed). So old token remains valid even after PW change.
    This test documents behavior for a non-admin role (manager).
    """
    from passlib.hash import bcrypt
    email = "iter308_mgr_sess@t.com"
    pw = "MgrPass123!"
    uid = "iter308-mgr-sess"
    async def _seed():
        client, db = await _db()
        await db.users.update_one(
            {"id": uid},
            {"$set": {"id": uid, "username": "iter308mgrs", "email": email,
                      "full_name": "iter308 mgr", "role": "manager",
                      "tenant_id": "default", "password": bcrypt.hash(pw),
                      "is_active": True, "permissions": []}},
            upsert=True)
        client.close()
    _run(_seed())
    _run(_trust_device(uid, "dev-mgr-sess-iter308"))
    r = _login(email, pw, "dev-mgr-sess-iter308")
    assert r.status_code == 200, r.text
    mgr_tok = r.json()["token"]
    # Verify token works
    me = requests.get(f"{BASE}/auth/me", headers={"Authorization": f"Bearer {mgr_tok}"}, timeout=10)
    assert me.status_code == 200, me.text

    # Admin changes manager's password (through OTP flow)
    a = _login("admin@maestroegp.com", getattr(pytest, "admin_current_pw", "admin123"),
               "dev-admin-iter308")
    assert a.status_code == 200, a.text
    a_tok = a.json()["token"]
    r1 = requests.put(f"{BASE}/users/{uid}/reset-password",
                      headers={"Authorization": f"Bearer {a_tok}"},
                      json={"new_password": "MgrNew456!"}, timeout=15)
    assert r1.status_code == 202, r1.text
    vid = r1.json()["otp_challenge_id"]
    sess = _run(_get_verification_code(vid))
    code = _find_code_for_session(sess)
    assert code
    r2 = requests.put(f"{BASE}/users/{uid}/reset-password",
                      headers={"Authorization": f"Bearer {a_tok}"},
                      json={"new_password": "MgrNew456!",
                            "otp_challenge_id": vid, "otp_code": code}, timeout=15)
    assert r2.status_code == 200, r2.text
    # OLD manager token → 401
    me2 = requests.get(f"{BASE}/auth/me", headers={"Authorization": f"Bearer {mgr_tok}"}, timeout=10)
    assert me2.status_code == 401, f"OLD manager token should 401 after PW change, got {me2.status_code}"
    # NEW password login works
    r3 = _login(email, "MgrNew456!", "dev-mgr-sess-iter308")
    assert r3.status_code == 200, r3.text
    # Cleanup
    async def _cleanup():
        client, db = await _db()
        await db.users.delete_one({"id": uid})
        client.close()
    _run(_cleanup())


def test_super_admin_multi_device_login():
    """SA can login from multiple devices without kicking each other."""
    async def _t():
        client, db = await _db()
        u = await db.users.find_one({"email": "owner@maestroegp.com"}, {"id": 1})
        if u:
            for d in ("dev-sa-A-iter308", "dev-sa-B-iter308"):
                await db.trusted_devices.update_one(
                    {"subject_type": "user", "subject_id": u["id"], "device_id": d},
                    {"$set": {"subject_type": "user", "subject_id": u["id"],
                              "device_id": d, "revoked": False,
                              "last_seen_at": datetime.now(timezone.utc).isoformat()},
                     "$setOnInsert": {"id": str(uuid.uuid4()),
                                      "created_at": datetime.now(timezone.utc).isoformat()}},
                    upsert=True)
        client.close()
    _run(_t())
    # Use current SA password (might have been changed by other test)
    pwd = "OwnerNew123!"
    sk = "999888"
    a = _sa_login(secret_key=sk, password=pwd, device="dev-sa-A-iter308")
    if a.status_code != 200:
        # fallback to original
        pwd = "owner123"; sk = "271018"
        a = _sa_login(secret_key=sk, password=pwd, device="dev-sa-A-iter308")
    assert a.status_code == 200, a.text
    b = _sa_login(secret_key=sk, password=pwd, device="dev-sa-B-iter308")
    assert b.status_code == 200, b.text
    ta = a.json()["token"]
    tb = b.json()["token"]
    # Both tokens still valid
    ra = requests.get(f"{BASE}/auth/me", headers={"Authorization": f"Bearer {ta}"}, timeout=10)
    rb = requests.get(f"{BASE}/auth/me", headers={"Authorization": f"Bearer {tb}"}, timeout=10)
    assert ra.status_code == 200, f"SA device A token invalidated: {ra.text}"
    assert rb.status_code == 200, f"SA device B token invalidated: {rb.text}"
