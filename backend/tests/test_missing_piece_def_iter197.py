"""Iter197: Tests for missing-piece-def scan and batch fix endpoints
Validates:
- GET /api/manufactured-products/missing-piece-def lists products that need a piece_def_value
- POST /api/manufactured-products/fix-piece-definitions updates piece_def_value in batch
- Validation: piece_def_value<=0 or non-weight unit is skipped
- After fix, computed_yield = 0.5 (40/80) for rab-missing-demo
- Tenant isolation: foreign ids are skipped
"""
import os
import pytest
import requests
import asyncio
from motor.motor_asyncio import AsyncIOMotorClient

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
MONGO_URL = "mongodb://localhost:27017"
DB_NAME = "maestro_pos"
DEMO_ID = "rab-missing-demo"


def _reset_demo():
    """Re-seed: set rab-missing-demo piece_def_value back to 0 so it reappears in scan."""
    async def _run():
        c = AsyncIOMotorClient(MONGO_URL)
        db = c[DB_NAME]
        await db.manufactured_products.update_one(
            {"id": DEMO_ID},
            {"$set": {"piece_def_value": 0, "piece_def_unit": None,
                      "piece_weight": 1, "piece_weight_unit": "غرام",
                      "unit": "شريحة"}},
        )
        c.close()
    asyncio.get_event_loop().run_until_complete(_run()) if False else asyncio.run(_run())


@pytest.fixture(scope="module")
def admin_token():
    r = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": "admin@maestroegp.com", "password": "admin123"},
        timeout=15,
    )
    assert r.status_code == 200, f"Login failed: {r.status_code} {r.text[:200]}"
    return r.json()["token"]


@pytest.fixture
def headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}", "Content-Type": "application/json"}


@pytest.fixture(autouse=True)
def reset_demo_before_each():
    _reset_demo()
    yield
    _reset_demo()


class TestMissingPieceDefScan:
    def test_scan_returns_demo_product(self, headers):
        r = requests.get(f"{BASE_URL}/api/manufactured-products/missing-piece-def", headers=headers, timeout=15)
        assert r.status_code == 200
        data = r.json()
        assert "count" in data and "items" in data
        ids = [it["id"] for it in data["items"]]
        assert DEMO_ID in ids, f"Demo {DEMO_ID} should appear in missing list. Got: {ids}"
        demo = next(it for it in data["items"] if it["id"] == DEMO_ID)
        assert demo["unit"] == "شريحة"
        assert demo["name"] == "دجاج راب (يحتاج تعريف)"
        assert demo["total_recipe_grams"] == 40.0

    def test_scan_excludes_already_defined(self, headers):
        # First fix the product
        fix = requests.post(
            f"{BASE_URL}/api/manufactured-products/fix-piece-definitions",
            headers=headers,
            json={"items": [{"id": DEMO_ID, "piece_def_value": 80, "piece_def_unit": "غرام"}]},
            timeout=15,
        )
        assert fix.status_code == 200
        assert fix.json()["updated"] == 1
        # Then scan — must not include it
        r = requests.get(f"{BASE_URL}/api/manufactured-products/missing-piece-def", headers=headers, timeout=15)
        assert r.status_code == 200
        ids = [it["id"] for it in r.json()["items"]]
        assert DEMO_ID not in ids, "Product with valid piece_def_value should be excluded"


class TestFixPieceDefinitions:
    def test_fix_updates_and_yield_becomes_half(self, headers):
        r = requests.post(
            f"{BASE_URL}/api/manufactured-products/fix-piece-definitions",
            headers=headers,
            json={"items": [{"id": DEMO_ID, "piece_def_value": 80, "piece_def_unit": "غرام"}]},
            timeout=15,
        )
        assert r.status_code == 200
        body = r.json()
        assert body["success"] is True
        assert body["updated"] == 1
        assert body["skipped"] == []

        # Verify via GET list
        gr = requests.get(f"{BASE_URL}/api/manufactured-products", headers=headers, timeout=15)
        assert gr.status_code == 200
        prods = gr.json() if isinstance(gr.json(), list) else gr.json().get("items", [])
        demo = next((p for p in prods if p.get("id") == DEMO_ID), None)
        assert demo is not None, "Demo not found in list"
        cy = demo.get("computed_yield")
        assert cy is not None, f"computed_yield missing in demo: {demo}"
        assert abs(float(cy) - 0.5) < 1e-6, f"Expected computed_yield=0.5 (40/80), got {cy}"

    def test_fix_skips_invalid_value(self, headers):
        r = requests.post(
            f"{BASE_URL}/api/manufactured-products/fix-piece-definitions",
            headers=headers,
            json={"items": [{"id": DEMO_ID, "piece_def_value": 0, "piece_def_unit": "غرام"}]},
            timeout=15,
        )
        assert r.status_code == 200
        body = r.json()
        assert body["updated"] == 0
        assert len(body["skipped"]) == 1
        assert body["skipped"][0]["id"] == DEMO_ID

    def test_fix_skips_non_weight_unit(self, headers):
        r = requests.post(
            f"{BASE_URL}/api/manufactured-products/fix-piece-definitions",
            headers=headers,
            json={"items": [{"id": DEMO_ID, "piece_def_value": 80, "piece_def_unit": "حبة"}]},
            timeout=15,
        )
        assert r.status_code == 200
        body = r.json()
        assert body["updated"] == 0
        assert len(body["skipped"]) == 1

    def test_fix_skips_foreign_tenant_id(self, headers):
        r = requests.post(
            f"{BASE_URL}/api/manufactured-products/fix-piece-definitions",
            headers=headers,
            json={"items": [{"id": "nonexistent-product-xyz-999", "piece_def_value": 80, "piece_def_unit": "غرام"}]},
            timeout=15,
        )
        assert r.status_code == 200
        body = r.json()
        assert body["updated"] == 0
        assert len(body["skipped"]) == 1
        assert "غير موجود" in body["skipped"][0]["reason"] or "موجود" in body["skipped"][0]["reason"]
