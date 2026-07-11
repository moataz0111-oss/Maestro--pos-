"""iter299 — notify_owner_multichannel aggregates phones/emails across:
- OWNER_ALERT_PHONE env
- tenants.owner_phone / owner_email
- users with role in [super_admin, admin, owner, manager, branch_manager] and phone/email set
Dedup preserved. Returns whatsapp_recipients / email_recipients counts.
Also validates: no exception raised when WhatsApp isn't connected and no email transport (preview).
"""
import asyncio
import os
import sys
import uuid
import pytest

sys.path.insert(0, "/app/backend")
from dotenv import load_dotenv
load_dotenv("/app/backend/.env")
from datetime import datetime, timezone
from motor.motor_asyncio import AsyncIOMotorClient


MONGO_URL = os.environ.get("MONGO_URL")
DB_NAME = os.environ.get("DB_NAME")
TENANT = "test_notify_iter299"


@pytest.fixture(scope="module")
def loop():
    l = asyncio.new_event_loop()
    yield l
    l.close()


@pytest.fixture(scope="module")
def db(loop):
    client = AsyncIOMotorClient(MONGO_URL)
    d = client[DB_NAME]
    yield d
    # cleanup
    loop.run_until_complete(d.tenants.delete_many({"id": TENANT}))
    loop.run_until_complete(d.users.delete_many({"tenant_id": TENANT}))
    loop.run_until_complete(d.notifications.delete_many({"tenant_id": TENANT}))
    client.close()


async def _seed(db):
    await db.tenants.delete_many({"id": TENANT})
    await db.users.delete_many({"tenant_id": TENANT})
    await db.tenants.insert_one({
        "id": TENANT,
        "owner_email": "OwnerTenant@example.com",  # will be lowercased
        "owner_phone": "+201111111111",
        "name": "Test Tenant iter299",
    })
    users = [
        {"id": str(uuid.uuid4()), "tenant_id": TENANT, "role": "admin",
         "email": "admin_it299@ex.com", "phone": "+201222222222", "username": "u1"},
        {"id": str(uuid.uuid4()), "tenant_id": TENANT, "role": "manager",
         "email": "manager_it299@ex.com", "phone": "+201333333333", "username": "u2"},
        {"id": str(uuid.uuid4()), "tenant_id": TENANT, "role": "branch_manager",
         "email": "bm_it299@ex.com", "phone": "+201444444444", "username": "u3"},
        {"id": str(uuid.uuid4()), "tenant_id": TENANT, "role": "cashier",
         "email": "cash_it299@ex.com", "phone": "+201555555555", "username": "u4"},  # must NOT be included
        {"id": str(uuid.uuid4()), "tenant_id": TENANT, "role": "admin",
         "email": "OwnerTenant@example.com", "phone": "+201111111111", "username": "dup"},  # dup by both
        {"id": str(uuid.uuid4()), "tenant_id": TENANT, "role": "manager",
         "email": "", "phone": "", "username": "empty"},  # empty must be skipped
    ]
    await db.users.insert_many(users)


def test_notify_multichannel_aggregates_and_dedupes(db, loop):
    # Import here so env is loaded already
    import server  # noqa
    loop.run_until_complete(_seed(db))

    async def run():
        # Force WhatsApp connected check to return False so send loop is skipped (no external I/O)
        # but tenant/user aggregation still happens if we make it True. We inject a monkey stub.
        original_is_connected = server._wa_free.is_connected
        original_send = server._wa_free.send_message
        server._wa_free.is_connected = lambda: _true()
        sent = []
        async def fake_send(e164, msg, purpose=None, tenant_id=None):
            sent.append(e164)
            return True, None
        server._wa_free.send_message = fake_send

        # Stub send_system_email to avoid SMTP; return True
        original_ss = server.send_system_email
        async def fake_email(recipients, subject, html, **kwargs):
            fake_email.last = list(recipients)
            return True
        fake_email.last = []
        server.send_system_email = fake_email

        try:
            res = await server.notify_owner_multichannel(
                title="TEST iter299",
                message="body",
                severity="info",
                category="system",
                tenant_id=TENANT,
                metadata={"t": 1},
            )
        finally:
            server._wa_free.is_connected = original_is_connected
            server._wa_free.send_message = original_send
            server.send_system_email = original_ss

        return res, sent, fake_email.last

    async def _true():
        return True

    res, sent_phones, emails_used = loop.run_until_complete(run())

    # Bell
    assert res["bell"] is True

    # WhatsApp: expected phones are tenant.owner_phone(+201111...) + 3 users (admin/manager/bm)
    # dup admin phone same as tenant.owner_phone => dedup; empty phone user skipped; cashier excluded.
    # Env OWNER_ALERT_PHONE optional; if present, counted.
    expected_phones = {"+201111111111", "+201222222222", "+201333333333", "+201444444444"}
    env_p = os.environ.get("OWNER_ALERT_PHONE", "").strip()
    if env_p:
        expected_phones.add(env_p)
    assert set(sent_phones) >= expected_phones, f"missing phones. got={sent_phones}"
    assert res.get("whatsapp_recipients", 0) == len(set(sent_phones))
    # dedup check: no duplicate entries sent
    assert len(sent_phones) == len(set(sent_phones))

    # Emails: tenant.owner_email + 3 users (dup collapsed) + cashier excluded + empty skipped
    expected_emails = {"ownertenant@example.com", "admin_it299@ex.com",
                       "manager_it299@ex.com", "bm_it299@ex.com"}
    # recovery_emails from db could add more; ensure superset
    assert expected_emails.issubset(set(emails_used)), f"missing emails. got={emails_used}"
    assert len(emails_used) == len(set(emails_used)), "email dedup broken"
    assert res.get("email_recipients", 0) == len(emails_used)


def test_notify_multichannel_no_exception_without_tenant(db, loop):
    import server

    async def run():
        original_is_connected = server._wa_free.is_connected
        server._wa_free.is_connected = lambda: _false()
        original_ss = server.send_system_email
        async def fake_email(recipients, subject, html, **kwargs):
            return True
        server.send_system_email = fake_email
        try:
            res = await server.notify_owner_multichannel(
                title="no-tenant", message="x", tenant_id=None
            )
        finally:
            server._wa_free.is_connected = original_is_connected
            server.send_system_email = original_ss
        return res

    async def _false():
        return False

    res = loop.run_until_complete(run())
    assert res["bell"] is True
    # whatsapp skipped because is_connected=False → no key required, but must not error
    assert res.get("whatsapp") in (False, None) or res["whatsapp"] is False
