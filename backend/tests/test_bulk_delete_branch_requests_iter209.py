"""Iter209 — Bulk delete branch requests + sanity checks for P3+ features.

Covers:
- POST /api/branch-requests/bulk-delete (success, empty list 400, partial unknown ids)
- Sanity: GET /api/manufactured-products/{id}/batches returns >=2 batches for sparkline tests
"""
import os
import uuid
import datetime as _dt
import pytest
import requests

BASE_URL = (os.environ.get("REACT_APP_BACKEND_URL") or "https://offline-pos-system-17.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN_EMAIL = "admin@maestroegp.com"
ADMIN_PASSWORD = "admin123"

BURGER_PRODUCT_ID = "17918d1e-be86-4d1e-9ac6-8d5440d97161"


@pytest.fixture(scope="module")
def session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    r = s.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    if r.status_code != 200:
        pytest.skip(f"login failed: {r.status_code} {r.text}")
    token = r.json().get("token") or r.json().get("access_token")
    if token:
        s.headers.update({"Authorization": f"Bearer {token}"})
    return s


@pytest.fixture()
def seeded_requests(session):
    """Create 3 throw-away branch_requests directly via a workaround:
    we POST via the standard create endpoint (kitchen role) — but admin too can create with branch_id.
    Falls back to mongo insert if creation endpoint is restrictive."""
    created_ids = []
    # Try via REST first
    for i in range(3):
        payload = {
            "branch_id": "76f56acc-6948-4a2f-bbf4-feccbddea88f",
            "branch_name": "TEST_BULK_DEL",
            "items": [{"product_name": f"TEST_BULK_ITEM_{i}", "quantity": 1, "unit": "حبة"}],
            "notes": f"TEST_BULK_{uuid.uuid4().hex[:6]}",
        }
        r = session.post(f"{API}/branch-requests", json=payload)
        if r.status_code in (200, 201):
            data = r.json()
            rid = data.get("id") or data.get("request_id")
            if rid:
                created_ids.append(rid)
    if len(created_ids) < 2:
        # Fall back: mongo direct insertion
        try:
            from motor.motor_asyncio import AsyncIOMotorClient
            import asyncio
            mongo_url = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
            db_name = os.environ.get("DB_NAME", "test_database")
            client = AsyncIOMotorClient(mongo_url)
            db = client[db_name]

            async def _ins():
                ids = []
                for i in range(3):
                    rid = str(uuid.uuid4())
                    await db.branch_requests.insert_one({
                        "id": rid,
                        "tenant_id": "default",
                        "branch_id": "76f56acc-6948-4a2f-bbf4-feccbddea88f",
                        "branch_name": "TEST_BULK_DEL",
                        "items": [{"product_name": f"TEST_BULK_ITEM_{i}", "quantity": 1, "unit": "حبة"}],
                        "status": "pending",
                        "notes": f"TEST_BULK_{i}",
                        "created_at": _dt.datetime.utcnow().isoformat(),
                    })
                    ids.append(rid)
                return ids
            created_ids = asyncio.get_event_loop().run_until_complete(_ins())
        except Exception as e:
            pytest.skip(f"could not seed branch_requests: {e}")
    yield created_ids
    # cleanup leftovers if any
    try:
        session.post(f"{API}/branch-requests/bulk-delete", json={"request_ids": created_ids})
    except Exception:
        pass


class TestBulkDeleteBranchRequests:
    def test_empty_list_returns_400(self, session):
        r = session.post(f"{API}/branch-requests/bulk-delete", json={"request_ids": []})
        assert r.status_code == 400, r.text

    def test_missing_field_returns_400(self, session):
        r = session.post(f"{API}/branch-requests/bulk-delete", json={})
        assert r.status_code == 400, r.text

    def test_invalid_type_returns_400(self, session):
        r = session.post(f"{API}/branch-requests/bulk-delete", json={"request_ids": "not-a-list"})
        assert r.status_code == 400, r.text

    def test_unknown_ids_returns_zero_deleted(self, session):
        r = session.post(
            f"{API}/branch-requests/bulk-delete",
            json={"request_ids": [str(uuid.uuid4()), str(uuid.uuid4())]},
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert "deleted_count" in data
        assert data["deleted_count"] == 0

    def test_bulk_delete_success_and_persistence(self, session):
        """Insert directly in mongo, then bulk-delete via API, verify removal in mongo."""
        from motor.motor_asyncio import AsyncIOMotorClient
        import asyncio
        mongo_url = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
        db_name = os.environ.get("DB_NAME", "maestro_pos")
        client = AsyncIOMotorClient(mongo_url)
        db = client[db_name]

        async def _ins():
            ids = []
            for i in range(3):
                rid = str(uuid.uuid4())
                await db.branch_requests.insert_one({
                    "id": rid,
                    "tenant_id": "default",
                    "branch_id": "76f56acc-6948-4a2f-bbf4-feccbddea88f",
                    "branch_name": "TEST_BULK_DEL",
                    "items": [{"product_name": f"TEST_BULK_ITEM_{i}", "quantity": 1, "unit": "حبة"}],
                    "status": "pending",
                    "notes": f"TEST_BULK_{i}",
                    "created_at": _dt.datetime.utcnow().isoformat(),
                })
                ids.append(rid)
            return ids

        async def _count(ids):
            return await db.branch_requests.count_documents({"id": {"$in": ids}})

        loop = asyncio.new_event_loop()
        try:
            ids = loop.run_until_complete(_ins())
            assert loop.run_until_complete(_count(ids)) == 3, "seed not inserted in mongo"

            # Bulk delete via API
            r = session.post(f"{API}/branch-requests/bulk-delete", json={"request_ids": ids})
            assert r.status_code == 200, r.text
            data = r.json()
            assert data["deleted_count"] == 3, f"expected 3 deleted, got {data}"

            # Verify removal in mongo
            assert loop.run_until_complete(_count(ids)) == 0, "documents still present after bulk delete"
        finally:
            # Cleanup any leftovers
            try:
                loop.run_until_complete(db.branch_requests.delete_many({"branch_name": "TEST_BULK_DEL"}))
            except Exception:
                pass
            loop.close()


class TestSparklineSanity:
    def test_burger_has_at_least_two_batches(self, session):
        r = session.get(f"{API}/manufactured-products/{BURGER_PRODUCT_ID}/batches")
        assert r.status_code == 200, r.text
        data = r.json()
        batches = data.get("batches") or data.get("items") or (data if isinstance(data, list) else [])
        assert isinstance(batches, list)
        assert len(batches) >= 2, f"expected >=2 batches for sparkline, got {len(batches)}"
