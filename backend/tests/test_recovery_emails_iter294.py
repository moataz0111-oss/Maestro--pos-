"""iter294 — Recovery Emails CRUD via /api/system/email-settings.

Covers:
- GET returns recovery_emails array
- PUT with valid list saves + lowercases + dedups
- PUT with invalid / empty / >5 → 400 with Arabic error
- PUT without recovery_emails field preserves DB value
- notify_owner_multichannel path uses DB list via get_owner_recovery_emails()
"""
import os
import pytest
import requests
from pymongo import MongoClient

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "http://localhost:8001").rstrip("/")
MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "maestro_pos")


@pytest.fixture(scope="module")
def mongo():
    c = MongoClient(MONGO_URL)
    yield c[DB_NAME]
    c.close()


@pytest.fixture(scope="module")
def super_admin_token():
    """Login super admin (2FA currently disabled in DB — see iter293 report)."""
    r = requests.post(f"{BASE_URL}/api/super-admin/login", json={
        "email": "owner@maestroegp.com",
        "password": "owner123",
        "secret_key": "271018",
        "device_id": "iter294-test",
    })
    if r.status_code != 200:
        pytest.skip(f"Super admin login failed: {r.status_code} {r.text[:200]}")
    data = r.json()
    if data.get("requires_2fa"):
        pytest.skip("2FA gate encountered — iter294 focuses on email-settings only")
    tok = data.get("token")
    if not tok:
        pytest.skip("No token in login response")
    return tok


@pytest.fixture(scope="module")
def auth_headers(super_admin_token):
    return {"Authorization": f"Bearer {super_admin_token}"}


@pytest.fixture(scope="module", autouse=True)
def preserve_recovery_emails(mongo):
    """Snapshot recovery_emails before tests, restore after."""
    doc = mongo.email_config.find_one({"id": "global"}) or {}
    original = doc.get("recovery_emails")
    yield
    if original is None:
        mongo.email_config.update_one({"id": "global"}, {"$unset": {"recovery_emails": ""}})
    else:
        mongo.email_config.update_one({"id": "global"}, {"$set": {"recovery_emails": original}})


# ---------------------- GET ----------------------

def test_get_email_settings_returns_recovery_emails_array(auth_headers):
    r = requests.get(f"{BASE_URL}/api/system/email-settings", headers=auth_headers)
    assert r.status_code == 200, r.text
    data = r.json()
    assert "recovery_emails" in data
    assert isinstance(data["recovery_emails"], list)
    assert len(data["recovery_emails"]) >= 1
    for e in data["recovery_emails"]:
        assert "@" in e
        assert e == e.lower()  # already lowercased


def test_get_requires_auth():
    r = requests.get(f"{BASE_URL}/api/system/email-settings")
    assert r.status_code in (401, 403)


# ---------------------- PUT: happy path ----------------------

def test_put_saves_recovery_emails_lowercased(auth_headers, mongo):
    payload = {"recovery_emails": ["TEST_A@Example.com", "test_b@example.com"]}
    r = requests.put(f"{BASE_URL}/api/system/email-settings", headers=auth_headers, json=payload)
    assert r.status_code == 200, r.text
    data = r.json()
    assert data.get("success") is True
    assert data.get("recovery_emails") == ["test_a@example.com", "test_b@example.com"]

    # Verify DB persistence
    doc = mongo.email_config.find_one({"id": "global"})
    assert doc["recovery_emails"] == ["test_a@example.com", "test_b@example.com"]

    # GET should reflect immediately
    g = requests.get(f"{BASE_URL}/api/system/email-settings", headers=auth_headers)
    assert g.status_code == 200
    assert g.json()["recovery_emails"] == ["test_a@example.com", "test_b@example.com"]


def test_put_deduplicates_recovery_emails(auth_headers):
    payload = {"recovery_emails": ["dup@x.com", "DUP@x.com", "other@y.com", "dup@x.com"]}
    r = requests.put(f"{BASE_URL}/api/system/email-settings", headers=auth_headers, json=payload)
    assert r.status_code == 200, r.text
    assert r.json()["recovery_emails"] == ["dup@x.com", "other@y.com"]


# ---------------------- PUT: validation ----------------------

def test_put_invalid_email_returns_400(auth_headers):
    r = requests.put(f"{BASE_URL}/api/system/email-settings", headers=auth_headers,
                     json={"recovery_emails": ["invalid-email"]})
    assert r.status_code == 400, r.text
    detail = r.json().get("detail", "")
    assert "بريد الاسترداد" in detail or "صالح" in detail


def test_put_empty_list_returns_400(auth_headers):
    r = requests.put(f"{BASE_URL}/api/system/email-settings", headers=auth_headers,
                     json={"recovery_emails": []})
    assert r.status_code == 400, r.text
    # empty [] → falls into no-valid-emails branch
    detail = r.json().get("detail", "")
    assert "بريد الاسترداد" in detail or "صالح" in detail or "أقصى" in detail


def test_put_more_than_5_returns_400(auth_headers):
    emails = [f"user{i}@example.com" for i in range(6)]
    r = requests.put(f"{BASE_URL}/api/system/email-settings", headers=auth_headers,
                     json={"recovery_emails": emails})
    assert r.status_code == 400, r.text
    detail = r.json().get("detail", "")
    assert "5" in detail or "أقصى" in detail


def test_put_exactly_5_ok(auth_headers):
    emails = [f"user{i}@example.com" for i in range(5)]
    r = requests.put(f"{BASE_URL}/api/system/email-settings", headers=auth_headers,
                     json={"recovery_emails": emails})
    assert r.status_code == 200, r.text
    assert len(r.json()["recovery_emails"]) == 5


# ---------------------- PUT: field omission preserves existing ----------------------

def test_put_without_recovery_emails_field_preserves_existing(auth_headers, mongo):
    # First set a known list
    known = ["preserve1@x.com", "preserve2@y.com"]
    r = requests.put(f"{BASE_URL}/api/system/email-settings", headers=auth_headers,
                     json={"recovery_emails": known})
    assert r.status_code == 200

    # PUT with only SMTP fields — should NOT clear recovery_emails
    r2 = requests.put(f"{BASE_URL}/api/system/email-settings", headers=auth_headers,
                      json={"smtp_host": "mail.privateemail.com", "smtp_port": 465, "smtp_user": ""})
    assert r2.status_code == 200, r2.text
    assert r2.json()["recovery_emails"] == known

    doc = mongo.email_config.find_one({"id": "global"})
    assert doc["recovery_emails"] == known


# ---------------------- get_owner_recovery_emails helper ----------------------

def test_get_owner_recovery_emails_returns_db_list(auth_headers, mongo):
    """Directly verify the helper reads from DB after PUT.

    Uses inline async call to server.get_owner_recovery_emails (source of truth
    for notify_owner_multichannel dynamic recipients).
    """
    import sys
    sys.path.insert(0, "/app/backend")

    new_list = ["dynamic1@test.com", "dynamic2@test.com"]
    r = requests.put(f"{BASE_URL}/api/system/email-settings", headers=auth_headers,
                     json={"recovery_emails": new_list})
    assert r.status_code == 200

    # Verify DB
    doc = mongo.email_config.find_one({"id": "global"})
    assert doc["recovery_emails"] == new_list

    # And the helper (used by notify_owner_multichannel) reads them dynamically
    import asyncio
    from server import get_owner_recovery_emails
    got = asyncio.get_event_loop().run_until_complete(get_owner_recovery_emails()) \
        if False else asyncio.new_event_loop().run_until_complete(get_owner_recovery_emails())
    assert got == new_list, f"helper returned {got}, expected {new_list}"


# ---------------------- Regression: /api/health ----------------------

def test_health_still_ok():
    r = requests.get(f"{BASE_URL}/api/health")
    assert r.status_code == 200
