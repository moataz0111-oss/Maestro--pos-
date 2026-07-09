"""Iter 292 — multichannel notification (bell+WhatsApp+Email) + wa_messages log endpoint.

Covers:
- GET /api/super-admin/whatsapp/messages (auth + shape + filters)
- POST /api/super-admin/whatsapp/test — logs a row in wa_messages
- notify_owner_multichannel() writes to db.notifications and gracefully degrades
- _alert_forgotten_open_shifts creates a bell notification with category='shift'
- Regression: /api/health, /api/super-admin/whatsapp/status
"""
import asyncio
import os
import uuid
from datetime import datetime, timezone, timedelta

import pytest
import requests
from motor.motor_asyncio import AsyncIOMotorClient

BASE_URL = "http://localhost:8001"
MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "maestro_pos")

# Shared event loop across all tests so Motor client (bound in server.py at import)
# does not lose its loop between _run() calls.
_LOOP = asyncio.new_event_loop()
asyncio.set_event_loop(_LOOP)


def _run(coro_or_awaitable):
    return _LOOP.run_until_complete(coro_or_awaitable)


@pytest.fixture(scope="module")
def sa_token():
    r = requests.post(f"{BASE_URL}/api/super-admin/login", json={
        "email": "owner@maestroegp.com",
        "password": "owner123",
        "secret_key": "271018",
    }, timeout=15)
    assert r.status_code == 200, f"super admin login failed: {r.status_code} {r.text[:200]}"
    return r.json()["token"]


@pytest.fixture(scope="module")
def sa_headers(sa_token):
    return {"Authorization": f"Bearer {sa_token}"}


# ============ Regression: health + wa/status ============

def test_health_ok():
    r = requests.get(f"{BASE_URL}/api/health", timeout=10)
    assert r.status_code == 200
    data = r.json()
    assert data.get("status") in ("ok", "healthy", True) or "status" in data


def test_wa_status_shape(sa_headers):
    r = requests.get(f"{BASE_URL}/api/super-admin/whatsapp/status", headers=sa_headers, timeout=10)
    assert r.status_code == 200
    d = r.json()
    # keys: connected, qr, error (or any subset)
    assert "connected" in d
    assert isinstance(d["connected"], bool)


# ============ Auth on new endpoint ============

def test_wa_messages_requires_auth():
    r = requests.get(f"{BASE_URL}/api/super-admin/whatsapp/messages", timeout=10)
    assert r.status_code in (401, 403), f"expected 401/403 got {r.status_code}"


def test_wa_messages_shape(sa_headers):
    r = requests.get(f"{BASE_URL}/api/super-admin/whatsapp/messages", headers=sa_headers, timeout=10)
    assert r.status_code == 200
    d = r.json()
    assert "messages" in d and isinstance(d["messages"], list)
    assert "counts" in d
    for k in ("total", "sent", "failed"):
        assert k in d["counts"] and isinstance(d["counts"][k], int)


def test_wa_messages_filter_status_sent(sa_headers):
    r = requests.get(f"{BASE_URL}/api/super-admin/whatsapp/messages?status=sent",
                     headers=sa_headers, timeout=10)
    assert r.status_code == 200
    for m in r.json()["messages"]:
        assert m.get("status") == "sent"


def test_wa_messages_filter_status_failed(sa_headers):
    r = requests.get(f"{BASE_URL}/api/super-admin/whatsapp/messages?status=failed",
                     headers=sa_headers, timeout=10)
    assert r.status_code == 200
    for m in r.json()["messages"]:
        assert m.get("status") == "failed"


# ============ POST /whatsapp/test writes a wa_messages row ============

def test_wa_test_logs_row(sa_headers):
    # baseline count
    r0 = requests.get(f"{BASE_URL}/api/super-admin/whatsapp/messages?purpose=test",
                      headers=sa_headers, timeout=10)
    assert r0.status_code == 200
    before = r0.json()["counts"]["total"]

    # fire a test send (wa is not actually connected — should log as failed but still log)
    r = requests.post(f"{BASE_URL}/api/super-admin/whatsapp/test",
                      headers=sa_headers, json={"phone": "+201000000000"}, timeout=15)
    assert r.status_code == 200
    body = r.json()
    assert "success" in body and "phone" in body

    # give the async _log_message a moment
    import time
    time.sleep(1.5)

    r1 = requests.get(f"{BASE_URL}/api/super-admin/whatsapp/messages?purpose=test",
                      headers=sa_headers, timeout=10)
    assert r1.status_code == 200
    after = r1.json()
    assert after["counts"]["total"] >= before + 1, f"before={before} after={after['counts']['total']}"

    # find the newest row for this test purpose and validate fields
    msgs = after["messages"]
    assert msgs, "expected at least one wa_messages row with purpose=test"
    m = msgs[0]
    for field in ("id", "phone", "message_preview", "message_length", "purpose", "status", "sent_at"):
        assert field in m, f"wa_messages doc missing field {field}"
    assert m["purpose"] == "test"
    assert m["status"] in ("sent", "failed")
    assert len(m["message_preview"]) <= 200


# ============ notify_owner_multichannel — direct DB verification ============

# --- direct notify tests below use the shared _LOOP ---


def test_notify_multichannel_writes_bell_and_returns_dict():
    """Import server module and call notify_owner_multichannel directly."""
    import sys
    sys.path.insert(0, "/app/backend")
    # Reset asyncio loop for clean run
    from server import notify_owner_multichannel  # noqa

    unique_title = f"TEST_iter292_{uuid.uuid4().hex[:8]}"
    res = _run(notify_owner_multichannel(
        title=unique_title,
        message="pytest multichannel test message",
        severity="warning",
        category="system",
        send_whatsapp=True,
        send_email=True,
        metadata={"pytest": True},
    ))
    assert isinstance(res, dict)
    for k in ("bell", "whatsapp", "email"):
        assert k in res, f"result missing key {k}"
    # bell must always succeed (DB write)
    assert res["bell"] is True, f"bell must succeed, got {res}"
    # whatsapp/email are booleans (may be False due to env config)
    assert isinstance(res["whatsapp"], bool)
    assert isinstance(res["email"], bool)

    # verify persistence in DB
    async def _check():
        client = AsyncIOMotorClient(MONGO_URL)
        db = client[DB_NAME]
        doc = await db.notifications.find_one({"title": unique_title}, {"_id": 0})
        client.close()
        return doc

    doc = _run(_check())
    assert doc is not None, "notification not persisted"
    assert doc.get("severity") == "warning"
    assert doc.get("category") == "system"
    assert doc.get("metadata", {}).get("pytest") is True
    assert doc.get("is_read") is False


def test_notify_multichannel_visible_via_api(sa_headers):
    """Verify GET /api/super-admin/notifications returns the newly created notification."""
    import sys
    sys.path.insert(0, "/app/backend")
    from server import notify_owner_multichannel

    unique_title = f"TEST_iter292_visible_{uuid.uuid4().hex[:8]}"
    _run(notify_owner_multichannel(
        title=unique_title,
        message="visible-via-api test",
        severity="info",
        category="system",
    ))
    r = requests.get(f"{BASE_URL}/api/super-admin/notifications?limit=100",
                     headers=sa_headers, timeout=10)
    assert r.status_code == 200
    data = r.json()
    titles = [n.get("title") for n in data.get("notifications", [])]
    assert unique_title in titles, f"newly created notification not in api response (got {len(titles)} items)"


# ============ Forgotten-shift alert creates bell notification ============

def test_forgotten_shift_alert_creates_bell():
    import sys
    sys.path.insert(0, "/app/backend")
    from server import _alert_forgotten_open_shifts

    seed_id = f"TEST_shift_{uuid.uuid4().hex[:8]}"
    started = (datetime.now(timezone.utc) - timedelta(hours=14)).isoformat()

    async def _seed_and_run():
        client = AsyncIOMotorClient(MONGO_URL)
        db = client[DB_NAME]
        await db.shifts.insert_one({
            "id": seed_id,
            "status": "open",
            "started_at": started,
            "alerted_forgotten": False,
            "cashier_name": "TEST_iter292_cashier",
            "branch_name": "TEST_iter292_branch",
            "tenant_id": "default",
        })
        try:
            await _alert_forgotten_open_shifts()
            # verify notification created with category=shift
            notif = await db.notifications.find_one(
                {"category": "shift", "metadata.shift_id": seed_id}, {"_id": 0}
            )
            # verify shift is now flagged as alerted
            shift_after = await db.shifts.find_one({"id": seed_id}, {"_id": 0})
            return notif, shift_after
        finally:
            # cleanup
            await db.shifts.delete_one({"id": seed_id})
            if 'notif' in dir():
                pass
            await db.notifications.delete_many({"metadata.shift_id": seed_id})
            client.close()

    notif, shift_after = _run(_seed_and_run())
    assert notif is not None, "expected a bell notification with category=shift"
    assert notif.get("severity") == "warning"
    assert notif.get("metadata", {}).get("shift_id") == seed_id
    assert shift_after and shift_after.get("alerted_forgotten") is True
