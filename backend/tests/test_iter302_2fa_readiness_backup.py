"""
اختبار iter302 — 2FA readiness + backup codes + verify_2fa_code backup path.
Endpoints:
- GET  /api/super-admin/security-2fa-readiness (super_admin only)
- POST /api/super-admin/security-2fa-backup-codes (super_admin only)
- verify_2fa_code accepts a valid backup code as last-resort for super_admin_login purpose.
"""
import os
import re
import uuid
import hashlib
import asyncio
from datetime import datetime, timezone, timedelta

import pytest
import requests
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))

BACKEND_URL = os.environ.get("BACKEND_URL", "http://localhost:8001")
API = f"{BACKEND_URL}/api"
MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "maestro_pos")

CODE_RE = re.compile(r"^[0-9A-F]{4}-[0-9A-F]{4}$")


def _run(coro):
    return asyncio.get_event_loop().run_until_complete(coro)


@pytest.fixture(scope="module")
def admin_token():
    r = requests.post(f"{API}/auth/login",
                      json={"email": "admin@maestroegp.com", "password": "admin123"}, timeout=15)
    assert r.status_code == 200, r.text
    return r.json()["token"]


@pytest.fixture(scope="module")
def super_token():
    r = requests.post(f"{API}/super-admin/login",
                      json={"email": "owner@maestroegp.com", "password": "owner123",
                            "secret_key": "271018", "device_id": f"iter302-{uuid.uuid4()}"}, timeout=15)
    assert r.status_code == 200, r.text
    data = r.json()
    # If 2FA challenge, fetch pending code and verify - not expected in this env
    if "token" not in data:
        pytest.skip(f"2FA required for owner login, cannot proceed: {data}")
    return data["token"]


# -------------------- 2FA Readiness --------------------

def test_readiness_requires_super_admin(admin_token):
    r = requests.get(f"{API}/super-admin/security-2fa-readiness",
                     headers={"Authorization": f"Bearer {admin_token}"}, timeout=15)
    assert r.status_code == 403, f"tenant admin should get 403, got {r.status_code}: {r.text}"


def test_readiness_no_auth():
    r = requests.get(f"{API}/super-admin/security-2fa-readiness", timeout=15)
    assert r.status_code in (401, 403)


def test_readiness_super_admin_ok(super_token):
    r = requests.get(f"{API}/super-admin/security-2fa-readiness",
                     headers={"Authorization": f"Bearer {super_token}"}, timeout=15)
    assert r.status_code == 200, r.text
    data = r.json()
    # Structure
    assert "channels_available" in data
    ch = data["channels_available"]
    assert set(ch.keys()) >= {"whatsapp_connected", "email_configured", "twilio_configured"}
    assert isinstance(ch["whatsapp_connected"], bool)
    assert isinstance(ch["email_configured"], bool)
    assert isinstance(ch["twilio_configured"], bool)
    assert isinstance(data["total_users"], int)
    assert isinstance(data["ready_count"], int)
    assert isinstance(data["at_risk_count"], int)
    assert isinstance(data["at_risk_users"], list)
    assert data["ready_count"] + data["at_risk_count"] == data["total_users"]
    assert "recommendation" in data and isinstance(data["recommendation"], str)


def test_readiness_flags_at_risk_users(super_token):
    """Insert a user without phone and no valid email — must appear in at_risk_users."""
    at_risk_uid = f"iter302-atrisk-{uuid.uuid4()}"

    async def seed():
        c = AsyncIOMotorClient(MONGO_URL); db_ = c[DB_NAME]
        await db_.users.insert_one({
            "id": at_risk_uid, "tenant_id": "default", "branch_id": None,
            "email": "", "phone": "", "full_name": "ITER302 AtRisk",
            "username": "iter302_atrisk", "role": "cashier",
            "is_active": True,
            "created_at": datetime.now(timezone.utc).isoformat(),
        })

    async def cleanup():
        c = AsyncIOMotorClient(MONGO_URL); db_ = c[DB_NAME]
        await db_.users.delete_many({"id": at_risk_uid})

    try:
        _run(seed())
        r = requests.get(f"{API}/super-admin/security-2fa-readiness",
                         headers={"Authorization": f"Bearer {super_token}"}, timeout=15)
        assert r.status_code == 200
        data = r.json()
        ids = {u["id"] for u in data["at_risk_users"]}
        assert at_risk_uid in ids, f"seeded at-risk user missing from at_risk_users list. keys={ids}"
        # recommendation must warn
        assert "⚠️" in data["recommendation"] or "لا تفعّل" in data["recommendation"]
    finally:
        _run(cleanup())


# -------------------- Backup Codes generation --------------------

def test_backup_codes_requires_super_admin(admin_token):
    r = requests.post(f"{API}/super-admin/security-2fa-backup-codes",
                      headers={"Authorization": f"Bearer {admin_token}"}, timeout=15)
    assert r.status_code == 403, r.text


def test_backup_codes_generation_and_storage(super_token):
    r = requests.post(f"{API}/super-admin/security-2fa-backup-codes",
                      headers={"Authorization": f"Bearer {super_token}"}, timeout=15)
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["success"] is True
    codes = data["codes"]
    assert isinstance(codes, list) and len(codes) == 5, f"expected 5 codes, got {len(codes)}"
    for c in codes:
        assert CODE_RE.match(c), f"bad code format: {c}"
    # unique
    assert len(set(codes)) == 5

    # DB: raw codes NOT stored — only hashes
    async def check():
        cli = AsyncIOMotorClient(MONGO_URL); db_ = cli[DB_NAME]
        cfg = await db_.security_config.find_one({"id": "global"}, {"_id": 0})
        assert cfg is not None
        stored = cfg.get("backup_codes") or []
        # 5 hashes
        assert len(stored) == 5, f"expected 5 stored hashes, got {len(stored)}"
        # each equals sha256 of raw code
        expected = [hashlib.sha256(c.encode()).hexdigest() for c in codes]
        assert set(stored) == set(expected)
        # no raw code appears as substring anywhere in stored
        joined = " ".join(stored)
        for c in codes:
            assert c not in joined, "raw code found in stored hashes!"
        assert cfg.get("backup_codes_generated_by") == "owner@maestroegp.com"

    _run(check())


# -------------------- verify_2fa_code with backup code --------------------

def test_verify_2fa_accepts_backup_code_and_consumes_it(super_token):
    """
    Generate backup codes, create a super_admin_login verification session with
    a known wrong OTP code_hash, then:
      (a) submit a wrong code → fail
      (b) submit a real backup code → success, consumed, backup code removed from DB.
    """
    # 1) Generate fresh backup codes
    g = requests.post(f"{API}/super-admin/security-2fa-backup-codes",
                      headers={"Authorization": f"Bearer {super_token}"}, timeout=15)
    assert g.status_code == 200
    raw_codes = g.json()["codes"]
    backup_code = raw_codes[0]

    # 2) Create verification session directly in DB (purpose=super_admin_login)
    sess_id = f"iter302-vs-{uuid.uuid4()}"
    now = datetime.now(timezone.utc)

    async def setup_session():
        cli = AsyncIOMotorClient(MONGO_URL); db_ = cli[DB_NAME]
        await db_.verification_sessions.insert_one({
            "id": sess_id,
            "purpose": "super_admin_login",
            "subject_type": "user",
            "subject_id": "iter302",
            "subject_name": "iter302",
            "tenant_id": "system",
            "channel": "email",
            "method": "otp",
            "destination": "iter302@test.local",
            "device_id": None,
            "code_hash": "sha256_of_something_impossible_to_match_x" * 2,
            "salt": "irrelevant",
            "expires_at": (now + timedelta(minutes=10)).isoformat(),
            "consumed": False,
            "attempts": 0,
            "created_at": now.isoformat(),
        })

    async def cleanup_session():
        cli = AsyncIOMotorClient(MONGO_URL); db_ = cli[DB_NAME]
        await db_.verification_sessions.delete_one({"id": sess_id})

    async def read_session_and_cfg():
        cli = AsyncIOMotorClient(MONGO_URL); db_ = cli[DB_NAME]
        s = await db_.verification_sessions.find_one({"id": sess_id}, {"_id": 0})
        cfg = await db_.security_config.find_one({"id": "global"}, {"_id": 0}) or {}
        return s, cfg

    # Look up real super admin user id (needed so verify-2fa endpoint finds the user).
    async def _get_sa():
        cli = AsyncIOMotorClient(MONGO_URL); db_ = cli[DB_NAME]
        u = await db_.users.find_one({"email": "owner@maestroegp.com"}, {"_id": 0, "id": 1})
        return u["id"] if u else None
    sa_id = _run(_get_sa())
    assert sa_id, "super admin user not found"

    # Re-create session bound to real user id
    async def setup_real():
        cli = AsyncIOMotorClient(MONGO_URL); db_ = cli[DB_NAME]
        await db_.verification_sessions.delete_one({"id": sess_id})
        await db_.verification_sessions.insert_one({
            "id": sess_id, "purpose": "super_admin_login",
            "subject_type": "user", "subject_id": sa_id,
            "subject_name": "iter302", "tenant_id": "system",
            "channel": "email", "method": "otp",
            "destination": "iter302@test.local", "device_id": f"iter302-{uuid.uuid4()}",
            "code_hash": "impossible_hash_never_matches_anything_xyz",
            "salt": "irrelevant",
            "expires_at": (now + timedelta(minutes=10)).isoformat(),
            "consumed": False, "attempts": 0,
            "created_at": now.isoformat(),
        })
    try:
        _run(setup_real())

        # (a) wrong code — must fail with 401
        r_wrong = requests.post(f"{API}/auth/login/verify-2fa",
                                json={"verification_id": sess_id, "code": "WRONG-CODE"}, timeout=15)
        assert r_wrong.status_code == 401, r_wrong.text
        s_after_wrong, _ = _run(read_session_and_cfg())
        assert s_after_wrong["attempts"] == 1
        assert s_after_wrong["consumed"] is False

        # (b) real backup code — must succeed (200) and consume the session
        r_ok = requests.post(f"{API}/auth/login/verify-2fa",
                             json={"verification_id": sess_id, "code": backup_code}, timeout=15)
        assert r_ok.status_code == 200, r_ok.text
        body = r_ok.json()
        assert "token" in body, f"expected token in response, got {body}"

        s_final, cfg_final = _run(read_session_and_cfg())
        assert s_final["consumed"] is True
        assert s_final.get("used_backup_code") is True

        # backup code removed from DB (single-use)
        used_hash = hashlib.sha256(backup_code.encode()).hexdigest()
        remaining = cfg_final.get("backup_codes") or []
        assert used_hash not in remaining, "used backup code should be removed from DB"
        assert len(remaining) == 4, f"expected 4 codes left, got {len(remaining)}"

        # (c) reusing same backup code on a NEW session should fail
        # (session already consumed, so create a new one)
        sess_id_2 = f"iter302-vs-{uuid.uuid4()}"

        async def setup_session_2():
            cli = AsyncIOMotorClient(MONGO_URL); db_ = cli[DB_NAME]
            await db_.verification_sessions.insert_one({
                "id": sess_id_2,
                "purpose": "super_admin_login",
                "subject_type": "user", "subject_id": sa_id,
                "subject_name": "iter302", "tenant_id": "system",
                "channel": "email", "method": "otp",
                "destination": "iter302@test.local", "device_id": f"iter302-{uuid.uuid4()}",
                "code_hash": "impossiblehash",
                "salt": "x",
                "expires_at": (now + timedelta(minutes=10)).isoformat(),
                "consumed": False, "attempts": 0,
                "created_at": now.isoformat(),
            })
        _run(setup_session_2())
        r_reuse = requests.post(f"{API}/auth/login/verify-2fa",
                                json={"verification_id": sess_id_2, "code": backup_code}, timeout=15)
        assert r_reuse.status_code == 401, f"reused backup code must be rejected: {r_reuse.text}"

        # cleanup second session
        async def _c2():
            cli = AsyncIOMotorClient(MONGO_URL); db_ = cli[DB_NAME]
            await db_.verification_sessions.delete_one({"id": sess_id_2})
        _run(_c2())

    finally:
        _run(cleanup_session())
