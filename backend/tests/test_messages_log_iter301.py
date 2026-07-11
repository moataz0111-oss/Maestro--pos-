"""iter301 — /api/system/messages-log endpoint + send_system_email logging + notify_owner_multichannel hardening."""
import asyncio
import os
import sys
import uuid
import pytest
import requests
from datetime import datetime, timezone, timedelta
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv

sys.path.insert(0, "/app/backend")
load_dotenv("/app/backend/.env")

BASE_URL = (os.environ.get("REACT_APP_BACKEND_URL") or "https://multi-cashier-vault.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"
MONGO_URL = os.environ.get("MONGO_URL")
DB_NAME = os.environ.get("DB_NAME")

ADMIN = {"email": "admin@maestroegp.com", "password": "admin123"}
CASHIER = {"email": "cashier1@maestroegp.com", "password": "cash123"}

TENANT_TEST = "test_iter301_msglog"
PURPOSE_PREFIX = "iter301_test_"


# ---------- Fixtures ----------
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
    # cleanup docs by purpose prefix
    loop.run_until_complete(d.wa_messages.delete_many({"purpose": {"$regex": f"^{PURPOSE_PREFIX}"}}))
    loop.run_until_complete(d.system_email_logs.delete_many({"purpose": {"$regex": f"^{PURPOSE_PREFIX}"}}))
    loop.run_until_complete(d.notifications.delete_many({"category": {"$regex": f"^{PURPOSE_PREFIX}"}}))
    loop.run_until_complete(d.tenants.delete_many({"id": TENANT_TEST}))
    loop.run_until_complete(d.users.delete_many({"tenant_id": TENANT_TEST}))
    client.close()


@pytest.fixture(scope="module")
def admin_token():
    r = requests.post(f"{API}/auth/login", json=ADMIN, timeout=30)
    if r.status_code != 200:
        pytest.skip(f"admin login failed: {r.status_code} {r.text[:200]}")
    return r.json().get("access_token") or r.json().get("token")


@pytest.fixture(scope="module")
def admin_tenant(admin_token):
    r = requests.get(f"{API}/auth/me", headers={"Authorization": f"Bearer {admin_token}"}, timeout=10)
    if r.status_code == 200:
        return r.json().get("tenant_id") or "default"
    return "default"


@pytest.fixture(scope="module")
def cashier_token():
    r = requests.post(f"{API}/auth/login", json=CASHIER, timeout=30)
    if r.status_code != 200:
        pytest.skip(f"cashier login failed: {r.status_code}")
    return r.json().get("access_token") or r.json().get("token")


@pytest.fixture(scope="module", autouse=True)
def seed_data(db, loop, admin_tenant):
    """Seed wa_messages / system_email_logs / notifications for the admin tenant."""
    now = datetime.now(timezone.utc)

    async def _seed():
        # Clean any old test data
        await db.wa_messages.delete_many({"purpose": {"$regex": f"^{PURPOSE_PREFIX}"}})
        await db.system_email_logs.delete_many({"purpose": {"$regex": f"^{PURPOSE_PREFIX}"}})
        await db.notifications.delete_many({"category": {"$regex": f"^{PURPOSE_PREFIX}"}})

        # WhatsApp — 3 (2 shift-related, 1 old)
        await db.wa_messages.insert_many([
            {"id": str(uuid.uuid4()), "tenant_id": admin_tenant, "phone": "+201111111111",
             "message": "wa msg 1", "purpose": f"{PURPOSE_PREFIX}shift_close", "status": "sent",
             "sent_at": (now - timedelta(hours=2)).isoformat()},
            {"id": str(uuid.uuid4()), "tenant_id": admin_tenant, "phone": "+201222222222",
             "message": "wa msg 2 failed", "purpose": f"{PURPOSE_PREFIX}shift_open", "status": "failed",
             "error": "not connected",
             "sent_at": (now - timedelta(hours=1)).isoformat()},
            {"id": str(uuid.uuid4()), "tenant_id": admin_tenant, "phone": "+201333333333",
             "message": "wa msg 3 old", "purpose": f"{PURPOSE_PREFIX}security", "status": "sent",
             "sent_at": (now - timedelta(days=3)).isoformat()},
        ])

        # Email — 2
        await db.system_email_logs.insert_many([
            {"id": str(uuid.uuid4()), "tenant_id": admin_tenant, "to": ["a@x.com"],
             "subject": "Email 1", "purpose": f"{PURPOSE_PREFIX}shift_close", "status": "sent",
             "provider": "smtp", "sent_at": (now - timedelta(minutes=30)).isoformat()},
            {"id": str(uuid.uuid4()), "tenant_id": admin_tenant, "to": ["b@x.com", "c@x.com"],
             "subject": "Email 2 fail", "purpose": f"{PURPOSE_PREFIX}system", "status": "failed",
             "error": "no_transport_configured", "provider": None,
             "sent_at": (now - timedelta(minutes=10)).isoformat()},
        ])

        # Bell notifications — 2
        await db.notifications.insert_many([
            {"id": str(uuid.uuid4()), "tenant_id": admin_tenant, "title": "Bell 1",
             "message": "bell body 1", "category": f"{PURPOSE_PREFIX}shift", "type": "info",
             "is_read": False, "severity": "info",
             "created_at": (now - timedelta(minutes=5)).isoformat()},
            {"id": str(uuid.uuid4()), "tenant_id": admin_tenant, "title": "Bell 2",
             "message": "bell body 2", "category": f"{PURPOSE_PREFIX}security", "type": "warning",
             "is_read": True, "severity": "warning",
             "created_at": (now - timedelta(minutes=1)).isoformat()},
        ])

    loop.run_until_complete(_seed())
    yield


# ---------- Endpoint tests ----------

def _get(path, token, params=None):
    return requests.get(f"{API}{path}", headers={"Authorization": f"Bearer {token}"}, params=params or {}, timeout=30)


class TestMessagesLogEndpoint:
    def test_default_call(self, admin_token):
        r = _get("/system/messages-log", admin_token)
        assert r.status_code == 200, r.text
        data = r.json()
        assert "items" in data and "stats" in data
        assert data.get("days") == 7
        assert data.get("limit") == 200
        # our seeded data (ignoring old wa 3d that is still within 7d anyway):
        purposes_seen = [i.get("purpose") or "" for i in data["items"]]
        assert any(str(p).startswith(PURPOSE_PREFIX) for p in purposes_seen), f"seeded purposes not found: {purposes_seen[:5]}"

        # sorting: sent_at descending
        sent_dates = [i.get("sent_at") for i in data["items"] if i.get("sent_at")]
        assert sent_dates == sorted(sent_dates, reverse=True), "items not sorted newest-first"

        # stats structure
        assert "by_channel" in data["stats"]
        for ch in ("whatsapp", "email", "bell"):
            assert ch in data["stats"]["by_channel"]
        assert "by_status" in data["stats"]
        for st in ("sent", "failed"):
            assert st in data["stats"]["by_status"]

    def test_channel_filter_email(self, admin_token):
        r = _get("/system/messages-log", admin_token, {"channel": "email"})
        assert r.status_code == 200
        items = r.json()["items"]
        assert all(i["channel"] == "email" for i in items)
        # must include our seeded email(s)
        assert any((i.get("purpose") or "").startswith(PURPOSE_PREFIX) for i in items)

    def test_channel_filter_whatsapp(self, admin_token):
        r = _get("/system/messages-log", admin_token, {"channel": "whatsapp"})
        assert r.status_code == 200
        items = r.json()["items"]
        assert all(i["channel"] == "whatsapp" for i in items)

    def test_channel_filter_bell(self, admin_token):
        r = _get("/system/messages-log", admin_token, {"channel": "bell"})
        assert r.status_code == 200
        items = r.json()["items"]
        assert all(i["channel"] == "bell" for i in items)

    def test_days_filter(self, admin_token):
        r = _get("/system/messages-log", admin_token, {"days": 1})
        assert r.status_code == 200
        cutoff = datetime.now(timezone.utc) - timedelta(days=1, minutes=5)  # small tolerance
        for i in r.json()["items"]:
            if i.get("sent_at"):
                ts = datetime.fromisoformat(i["sent_at"].replace("Z", "+00:00"))
                if ts.tzinfo is None:
                    ts = ts.replace(tzinfo=timezone.utc)
                assert ts >= cutoff, f"item older than 1d returned: {i.get('sent_at')}"

    def test_category_filter(self, admin_token):
        # our seeded categories/purposes contain 'shift'
        r = _get("/system/messages-log", admin_token, {"category": "shift", "days": 7})
        assert r.status_code == 200
        items = r.json()["items"]
        # for whatsapp/email, `purpose` is filtered via regex; for bell, `category` field.
        # every returned item should have "shift" in its purpose (case-insensitive)
        for i in items:
            purpose_or_cat = (i.get("purpose") or "").lower()
            assert "shift" in purpose_or_cat, f"category filter leaked non-shift item: {i}"
        # must contain at least our seeded shift items
        assert len(items) >= 2

    def test_stats_counts_match_items(self, admin_token):
        r = _get("/system/messages-log", admin_token)
        assert r.status_code == 200
        data = r.json()
        items = data["items"]
        stats = data["stats"]
        # by_channel counts must be exact
        ch_expected = {"whatsapp": 0, "email": 0, "bell": 0}
        for i in items:
            ch_expected[i["channel"]] = ch_expected.get(i["channel"], 0) + 1
        for k, v in ch_expected.items():
            assert stats["by_channel"].get(k, 0) == v

    def test_cashier_forbidden_403(self, cashier_token):
        r = _get("/system/messages-log", cashier_token)
        assert r.status_code == 403, f"cashier should get 403 but got {r.status_code}: {r.text[:200]}"


# ---------- send_system_email signature + logging ----------

class TestSendSystemEmailLogging:
    def test_send_email_signature_accepts_purpose_and_tenant(self, db, loop):
        """send_system_email must accept purpose= and tenant_id= kwargs and log a row."""
        import server
        purpose = f"{PURPOSE_PREFIX}sig_check"

        async def _run():
            ok = await server.send_system_email(
                ["dummy_iter301@example.com"],
                "iter301 test subject",
                "<p>hi</p>",
                purpose=purpose,
                tenant_id=TENANT_TEST,
            )
            # Verify a log row was inserted (regardless of provider/success)
            doc = await db.system_email_logs.find_one({"purpose": purpose})
            return ok, doc

        ok, doc = loop.run_until_complete(_run())
        assert doc is not None, "send_system_email did not insert a system_email_logs row"
        assert doc.get("purpose") == purpose
        assert doc.get("tenant_id") == TENANT_TEST
        assert doc.get("status") in ("sent", "failed")
        # In preview no SMTP configured → status=failed with error set
        if doc.get("status") == "failed":
            assert doc.get("error"), "failed row must include error string"

    def test_no_transport_writes_failed_log(self, db, loop):
        """When no transport configured, logs a failed row with provider=None."""
        import server
        purpose = f"{PURPOSE_PREFIX}no_transport"

        async def _run():
            # Force cfg empty by patching _load_email_config
            orig = server._load_email_config
            async def fake_cfg():
                return {}
            server._load_email_config = fake_cfg
            try:
                ok = await server.send_system_email(
                    ["x@example.com"], "s", "<p>x</p>",
                    purpose=purpose, tenant_id=TENANT_TEST,
                )
            finally:
                server._load_email_config = orig
            doc = await db.system_email_logs.find_one({"purpose": purpose})
            return ok, doc

        ok, doc = loop.run_until_complete(_run())
        assert ok is False
        assert doc is not None
        assert doc.get("status") == "failed"
        assert doc.get("error")


# ---------- notify_owner_multichannel: upper-cap + dedup + $type filter ----------

class TestNotifyHardening:
    def test_upper_cap_20_recipients(self, db, loop):
        """If a tenant has 30 admins with phones, only 20 send. Warning logged."""
        import server
        tid = f"{TENANT_TEST}_cap"

        async def _seed():
            await db.tenants.delete_many({"id": tid})
            await db.users.delete_many({"tenant_id": tid})
            # 30 unique admin phones
            users = []
            for i in range(30):
                users.append({
                    "id": str(uuid.uuid4()), "tenant_id": tid, "role": "admin",
                    "email": f"admin_cap_{i:02d}@ex.com",
                    "phone": f"+96470{i:08d}",  # 30 distinct E.164
                    "username": f"cap_{i:02d}",
                })
            await db.users.insert_many(users)

        loop.run_until_complete(_seed())

        async def _run():
            orig_conn = server._wa_free.is_connected
            orig_send = server._wa_free.send_message
            orig_email = server.send_system_email
            server._wa_free.is_connected = lambda: _t()
            sent = []
            async def fake_send(e164, msg, purpose=None, tenant_id=None):
                sent.append(e164); return True, None
            server._wa_free.send_message = fake_send
            async def fake_email(recipients, subject, html, **kwargs):
                return True
            server.send_system_email = fake_email
            try:
                res = await server.notify_owner_multichannel(
                    title="cap test", message="x", tenant_id=tid,
                    category=f"{PURPOSE_PREFIX}cap",
                )
            finally:
                server._wa_free.is_connected = orig_conn
                server._wa_free.send_message = orig_send
                server.send_system_email = orig_email
            return res, sent

        async def _t():
            return True

        res, sent = loop.run_until_complete(_run())
        assert len(sent) == 20, f"cap not enforced, sent {len(sent)}"
        assert res.get("whatsapp_recipients") == 20
        # cleanup
        loop.run_until_complete(db.users.delete_many({"tenant_id": tid}))

    def test_dedup_after_e164_normalization(self, db, loop):
        """Same number in 2 formats -> sent once."""
        import server
        tid = f"{TENANT_TEST}_dedup"

        async def _seed():
            await db.tenants.delete_many({"id": tid})
            await db.users.delete_many({"tenant_id": tid})
            await db.tenants.insert_one({"id": tid, "owner_phone": "+9647701234567"})
            await db.users.insert_many([
                # Same number, local Iraqi format (07xxxxxxxxx)
                {"id": str(uuid.uuid4()), "tenant_id": tid, "role": "admin",
                 "email": "a@x.com", "phone": "07701234567", "username": "dup1"},
                # Same again w/ + prefix
                {"id": str(uuid.uuid4()), "tenant_id": tid, "role": "manager",
                 "email": "b@x.com", "phone": "+9647701234567", "username": "dup2"},
                # A different number
                {"id": str(uuid.uuid4()), "tenant_id": tid, "role": "admin",
                 "email": "c@x.com", "phone": "+9647709999999", "username": "diff"},
            ])

        loop.run_until_complete(_seed())

        async def _run():
            orig_conn = server._wa_free.is_connected
            orig_send = server._wa_free.send_message
            orig_email = server.send_system_email
            server._wa_free.is_connected = lambda: _t()
            sent = []
            async def fake_send(e164, msg, purpose=None, tenant_id=None):
                sent.append(e164); return True, None
            server._wa_free.send_message = fake_send
            async def fake_email(recipients, subject, html, **kwargs):
                return True
            server.send_system_email = fake_email
            try:
                res = await server.notify_owner_multichannel(
                    title="dedup test", message="x", tenant_id=tid,
                    category=f"{PURPOSE_PREFIX}dedup",
                )
            finally:
                server._wa_free.is_connected = orig_conn
                server._wa_free.send_message = orig_send
                server.send_system_email = orig_email
            return res, sent

        async def _t():
            return True

        res, sent = loop.run_until_complete(_run())
        # Should dedup: 2 unique E.164 numbers
        assert len(sent) == len(set(sent)), f"duplicates leaked: {sent}"
        assert len(sent) == 2, f"expected 2 unique, got {sent}"
        loop.run_until_complete(db.users.delete_many({"tenant_id": tid}))
        loop.run_until_complete(db.tenants.delete_many({"id": tid}))

    def test_phone_type_string_filter_skips_null(self, db, loop):
        """User with phone=None must be skipped, no crash."""
        import server
        tid = f"{TENANT_TEST}_null"

        async def _seed():
            await db.tenants.delete_many({"id": tid})
            await db.users.delete_many({"tenant_id": tid})
            await db.users.insert_many([
                {"id": str(uuid.uuid4()), "tenant_id": tid, "role": "admin",
                 "email": "a@x.com", "phone": None, "username": "null_phone"},
                {"id": str(uuid.uuid4()), "tenant_id": tid, "role": "admin",
                 "email": "b@x.com", "phone": "+9647701234567", "username": "valid"},
            ])

        loop.run_until_complete(_seed())

        async def _run():
            orig_conn = server._wa_free.is_connected
            orig_send = server._wa_free.send_message
            orig_email = server.send_system_email
            server._wa_free.is_connected = lambda: _t()
            sent = []
            async def fake_send(e164, msg, purpose=None, tenant_id=None):
                sent.append(e164); return True, None
            server._wa_free.send_message = fake_send
            async def fake_email(recipients, subject, html, **kwargs):
                return True
            server.send_system_email = fake_email
            try:
                res = await server.notify_owner_multichannel(
                    title="null phone test", message="x", tenant_id=tid,
                    category=f"{PURPOSE_PREFIX}null",
                )
            finally:
                server._wa_free.is_connected = orig_conn
                server._wa_free.send_message = orig_send
                server.send_system_email = orig_email
            return res, sent

        async def _t():
            return True

        res, sent = loop.run_until_complete(_run())
        # No exception + only the valid phone sent
        assert res.get("bell") is True
        assert len(sent) == 1, f"expected only valid phone, got {sent}"
        loop.run_until_complete(db.users.delete_many({"tenant_id": tid}))
