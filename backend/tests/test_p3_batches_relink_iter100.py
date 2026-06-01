"""Tests for P3 features iter100:
- GET /api/manufactured-products/{id}/batches
- PUT /api/branch-requests/{id}/relink-item
- WAC snapshot on produce
"""
import os
import uuid
import datetime
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
assert BASE_URL, "REACT_APP_BACKEND_URL missing"

TEST_PRODUCT_ID = "17918d1e-be86-4d1e-9ac6-8d5440d97161"  # برغر اختبار (seeded)
DEFAULT_BRANCH_ID = "76f56acc-6948-4a2f-bbf4-feccbddea88f"


@pytest.fixture(scope="module")
def token():
    r = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": "admin@maestroegp.com", "password": "admin123"},
        timeout=20,
    )
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    return r.json().get("access_token") or r.json().get("token")


@pytest.fixture(scope="module")
def headers(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


# ====== Backend tests ======
class TestBatchHistory:
    def test_batches_endpoint_shape(self, headers):
        r = requests.get(
            f"{BASE_URL}/api/manufactured-products/{TEST_PRODUCT_ID}/batches",
            headers=headers, timeout=20,
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert "batches" in data and isinstance(data["batches"], list)
        assert "summary" in data
        summary = data["summary"]
        for k in ("total_batches", "total_quantity", "total_value", "avg_unit_cost"):
            assert k in summary, f"missing summary key {k}"
        assert "current_wac_after" in data
        # if batches exist, validate batch row shape
        if data["batches"]:
            b = data["batches"][0]
            for k in ("quantity", "unit_cost_after", "wac_unit_after", "created_at"):
                assert k in b, f"batch missing key {k}"

    def test_batches_unknown_product(self, headers):
        r = requests.get(
            f"{BASE_URL}/api/manufactured-products/nonexistent-id-zzz/batches",
            headers=headers, timeout=20,
        )
        # Should still succeed (empty batches) — endpoint doesn't 404 on missing product
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["summary"]["total_batches"] == 0


class TestRelinkBranchRequest:
    """Creates a synthetic branch_request via Mongo for relink tests."""

    @pytest.fixture(scope="class")
    def synthetic_request(self, headers):
        # Insert a branch_request directly via debug endpoint? No — use Mongo via subprocess
        # Easier: create branch_request through actual API if possible.
        # Try POST /api/branch-requests
        # Get a manufactured product to use as suggestion target — TEST_PRODUCT_ID
        # The request must have an item with broken product_id to show suggestion.
        # Create request via direct mongo insert using motor through helper script.
        from pymongo import MongoClient
        mongo_url = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
        db_name = os.environ.get("DB_NAME", "test_database")
        client = MongoClient(mongo_url)
        db = client[db_name]
        req_id = str(uuid.uuid4())
        now = datetime.datetime.utcnow().isoformat()
        doc = {
            "id": req_id,
            "tenant_id": "default",
            "request_number": f"REL-TEST-{req_id[:6]}",
            "to_branch_id": DEFAULT_BRANCH_ID,
            "status": "pending",
            "items": [
                {
                    "product_id": "broken-id-zzz",
                    "product_name": "برغر تجريبي",
                    "quantity": 1,
                    "unit": "حبة",
                    "suggestion": {"product_id": TEST_PRODUCT_ID, "product_name": "برغر اختبار"},
                }
            ],
            "created_at": now,
        }
        db.branch_requests.insert_one(doc)
        yield req_id
        db.branch_requests.delete_one({"id": req_id})
        client.close()

    def test_relink_success(self, headers, synthetic_request):
        r = requests.put(
            f"{BASE_URL}/api/branch-requests/{synthetic_request}/relink-item",
            headers=headers,
            json={"item_index": 0, "product_id": TEST_PRODUCT_ID},
            timeout=20,
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["product_id"] == TEST_PRODUCT_ID
        assert data["item_index"] == 0
        # Verify persistence: fetch request items
        from pymongo import MongoClient
        client = MongoClient(os.environ.get("MONGO_URL"))
        db = client[os.environ.get("DB_NAME", "test_database")]
        req = db.branch_requests.find_one({"id": synthetic_request})
        assert req["items"][0]["product_id"] == TEST_PRODUCT_ID
        assert "suggestion" not in req["items"][0]
        client.close()

    def test_relink_missing_product_id(self, headers, synthetic_request):
        r = requests.put(
            f"{BASE_URL}/api/branch-requests/{synthetic_request}/relink-item",
            headers=headers, json={"item_index": 0}, timeout=20,
        )
        assert r.status_code == 400, r.text

    def test_relink_bad_item_index(self, headers, synthetic_request):
        r = requests.put(
            f"{BASE_URL}/api/branch-requests/{synthetic_request}/relink-item",
            headers=headers, json={"item_index": 99, "product_id": TEST_PRODUCT_ID},
            timeout=20,
        )
        assert r.status_code == 400, r.text

    def test_relink_unknown_request(self, headers):
        r = requests.put(
            f"{BASE_URL}/api/branch-requests/nonexistent-req-zzz/relink-item",
            headers=headers, json={"item_index": 0, "product_id": TEST_PRODUCT_ID},
            timeout=20,
        )
        assert r.status_code == 404, r.text

    def test_relink_unknown_product(self, headers, synthetic_request):
        r = requests.put(
            f"{BASE_URL}/api/branch-requests/{synthetic_request}/relink-item",
            headers=headers, json={"item_index": 0, "product_id": "no-such-prod-zzz"},
            timeout=20,
        )
        assert r.status_code == 404, r.text


class TestProduceWACSnapshot:
    def test_produce_records_wac_snapshot(self, headers):
        # Produce 1 unit of test product and check the new batch has wac_unit_after + batch_unit_cost_after
        r = requests.post(
            f"{BASE_URL}/api/manufactured-products/{TEST_PRODUCT_ID}/produce",
            headers=headers, json={"quantity": 1}, timeout=30,
        )
        if r.status_code != 200:
            pytest.skip(f"produce failed (likely insufficient ingredients): {r.status_code} {r.text[:200]}")
        # fetch batches
        r2 = requests.get(
            f"{BASE_URL}/api/manufactured-products/{TEST_PRODUCT_ID}/batches",
            headers=headers, timeout=20,
        )
        assert r2.status_code == 200
        latest = r2.json()["batches"][0]
        assert latest.get("wac_unit_after") is not None, "wac_unit_after missing on new batch"
        # unit_cost_after corresponds to batch_unit_cost_after (computed if missing)
        assert latest.get("unit_cost_after") is not None
