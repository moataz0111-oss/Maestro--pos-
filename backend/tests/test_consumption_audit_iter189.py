"""Integration test (iter 189): Raw Material Consumption report + movements
categorization + produce deduction (both id fields) + transfer merge.

Hits live API via REACT_APP_BACKEND_URL (admin@maestroegp.com/admin123).
Re-seeds the deduction test fixture so the test is repeatable.
"""
import os
import re
import sys
import time
import uuid
import subprocess
from pathlib import Path

import pytest
import requests
from dotenv import load_dotenv

BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_DIR))
load_dotenv(BACKEND_DIR / ".env")

# Load REACT_APP_BACKEND_URL from frontend/.env
FRONTEND_ENV = BACKEND_DIR.parent / "frontend" / ".env"
BASE_URL = None
for line in FRONTEND_ENV.read_text().splitlines():
    if line.startswith("REACT_APP_BACKEND_URL="):
        BASE_URL = line.split("=", 1)[1].strip().rstrip("/")
        break
assert BASE_URL, "REACT_APP_BACKEND_URL missing in frontend/.env"

ADMIN_EMAIL = "admin@maestroegp.com"
ADMIN_PASS = "admin123"
START = "2020-01-01"
END = "2030-01-01"


@pytest.fixture(scope="session")
def token():
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASS}, timeout=20)
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    tok = r.json().get("token") or r.json().get("access_token")
    assert tok, f"no token in {r.json()}"
    return tok


@pytest.fixture(scope="session")
def headers(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


@pytest.fixture(scope="session")
def seeded_product_id():
    """Run the seed script and capture printed product_id."""
    res = subprocess.run(
        ["python3", "seed_produce_deduction_test.py"],
        cwd=str(BACKEND_DIR), capture_output=True, text=True, timeout=30,
    )
    assert res.returncode == 0, f"seed failed: {res.stderr}"
    m = re.search(r"product_id\s*=\s*([0-9a-f-]{36})", res.stdout)
    assert m, f"could not parse product_id from: {res.stdout}"
    return m.group(1)


def test_health(headers):
    r = requests.get(f"{BASE_URL}/api/health", timeout=10)
    assert r.status_code == 200


def test_report_endpoints_200(headers):
    """All five inventory/manufacturing report endpoints respond 200."""
    for ep in [
        "/api/inventory-movements?start_date=" + START + "&end_date=" + END,
        "/api/manufacturing-inventory",
        "/api/manufactured-products",
        "/api/warehouse-transactions",
        "/api/warehouse-transfers",
    ]:
        r = requests.get(f"{BASE_URL}{ep}", headers=headers, timeout=20)
        assert r.status_code == 200, f"{ep} -> {r.status_code}: {r.text[:200]}"


def _mi_qty(headers, *, material_id=None, raw_material_id=None, name=None):
    r = requests.get(f"{BASE_URL}/api/manufacturing-inventory", headers=headers, timeout=20)
    assert r.status_code == 200
    rows = r.json()
    for row in rows:
        if material_id and row.get("material_id") == material_id:
            return row.get("quantity"), row
        if raw_material_id and row.get("raw_material_id") == raw_material_id:
            return row.get("quantity"), row
        if name and (row.get("material_name") == name or row.get("raw_material_name") == name):
            return row.get("quantity"), row
    return None, None


def test_produce_deducts_both_id_fields(headers, seeded_product_id):
    """Producing 100 units must deduct لحم(legacy material_id) 50→30 and خبز(raw_material_id) 1000→900."""
    # Baseline after seed
    qty_lahm_before, _ = _mi_qty(headers, material_id="rm-lahm-001")
    qty_khubz_before, _ = _mi_qty(headers, raw_material_id="rm-khubz-001")
    assert qty_lahm_before == 50, f"seed لحم expected 50, got {qty_lahm_before}"
    assert qty_khubz_before == 1000, f"seed خبز expected 1000, got {qty_khubz_before}"

    r = requests.post(
        f"{BASE_URL}/api/manufactured-products/{seeded_product_id}/produce?quantity=100",
        headers=headers, timeout=30,
    )
    assert r.status_code == 200, f"produce failed: {r.status_code} {r.text}"

    qty_lahm_after, _ = _mi_qty(headers, material_id="rm-lahm-001")
    qty_khubz_after, _ = _mi_qty(headers, raw_material_id="rm-khubz-001")
    assert qty_lahm_after == 30, f"لحم expected 30, got {qty_lahm_after}"
    assert qty_khubz_after == 900, f"خبز expected 900, got {qty_khubz_after}"


def test_consumption_report_aggregates(headers):
    """After producing, the consumption report aggregates by material+product."""
    r = requests.get(
        f"{BASE_URL}/api/reports/raw-material-consumption?start_date={START}&end_date={END}",
        headers=headers, timeout=30,
    )
    assert r.status_code == 200, f"{r.status_code} {r.text[:300]}"
    data = r.json()
    for key in ("movements", "by_material", "by_product", "summary"):
        assert key in data, f"missing key '{key}' in {list(data.keys())}"

    materials = {m.get("material_name"): m for m in data["by_material"]}
    assert "لحم" in materials, f"لحم missing in by_material: {list(materials)}"
    assert "خبز" in materials, f"خبز missing in by_material: {list(materials)}"
    # quantities should match what was consumed (cumulative >= this run)
    assert materials["لحم"].get("quantity", 0) >= 20, materials["لحم"]
    assert materials["خبز"].get("quantity", 0) >= 100, materials["خبز"]

    # by_product references the manufactured source
    products = {p.get("product_name"): p for p in data["by_product"]}
    assert "برغر اختبار" in products, f"missing product in by_product: {list(products)}"

    # movement rows include the required fields
    assert len(data["movements"]) > 0, "no movements returned"
    sample = data["movements"][0]
    for f in ("material_name", "quantity", "product_name", "performed_by_name"):
        assert f in sample, f"movement missing '{f}': {sample}"


def test_movements_consumption_category(headers):
    """summary.by_category must include 'consumption' bucket, and rows
    of type manufacturing_consumption/manufactured_consumption fall under it."""
    r = requests.get(
        f"{BASE_URL}/api/inventory-movements?start_date={START}&end_date={END}",
        headers=headers, timeout=30,
    )
    assert r.status_code == 200
    data = r.json()
    summary = data.get("summary", {})
    by_cat = summary.get("by_category", {})
    assert "consumption" in by_cat, f"consumption bucket missing; keys={list(by_cat)}"
    assert by_cat["consumption"].get("count", 0) >= 1, by_cat["consumption"]

    # Verify category=consumption filter returns only consumption-type rows
    r2 = requests.get(
        f"{BASE_URL}/api/inventory-movements?start_date={START}&end_date={END}&category=consumption",
        headers=headers, timeout=30,
    )
    assert r2.status_code == 200
    rows = r2.json().get("movements", [])
    assert len(rows) > 0, "category=consumption returned no rows"
    for row in rows:
        assert row.get("type") in ("manufacturing_consumption", "manufactured_consumption"), row

    # And manufacturing bucket should NOT include consumption types
    r3 = requests.get(
        f"{BASE_URL}/api/inventory-movements?start_date={START}&end_date={END}&category=manufacturing",
        headers=headers, timeout=30,
    )
    assert r3.status_code == 200
    for row in r3.json().get("movements", []):
        assert row.get("type") != "manufacturing_consumption", f"consumption type leaked into manufacturing: {row}"
        assert row.get("type") != "manufactured_consumption", row


def test_transfer_merges_legacy_record_no_duplicate(headers):
    """transfer_to_manufacturing must MERGE into a legacy material_id-only record,
    not create a 2nd row."""
    # Setup: create a raw material in DB + a legacy MI row keyed by material_id only
    import asyncio
    from datetime import datetime, timezone
    from motor.motor_asyncio import AsyncIOMotorClient

    rm_id = "rm-merge-test-" + uuid.uuid4().hex[:8]

    async def setup_and_check():
        c = AsyncIOMotorClient(os.environ.get("MONGO_URL", "mongodb://localhost:27017"))
        db = c[os.environ.get("DB_NAME", "test_database")]
        now = datetime.now(timezone.utc).isoformat()
        await db.raw_materials.delete_many({"id": rm_id})
        await db.manufacturing_inventory.delete_many({"$or": [{"raw_material_id": rm_id}, {"material_id": rm_id}]})
        await db.warehouse_inventory.delete_many({"raw_material_id": rm_id})
        await db.raw_materials.insert_one({
            "id": rm_id, "tenant_id": "default", "name": "TEST_رخام",
            "unit": "كغم", "quantity": 200, "min_quantity": 0,
            "cost_per_unit": 100, "created_at": now,
        })
        await db.warehouse_inventory.insert_one({
            "id": str(uuid.uuid4()), "tenant_id": "default",
            "raw_material_id": rm_id, "raw_material_name": "TEST_رخام",
            "quantity": 100, "unit": "كغم", "cost_per_unit": 100, "last_updated": now,
        })
        # Legacy MI row keyed only by material_id
        await db.manufacturing_inventory.insert_one({
            "id": str(uuid.uuid4()), "material_id": rm_id, "material_name": "TEST_رخام",
            "quantity": 10, "unit": "كغم", "cost_per_unit": 100, "last_updated": now,
        })
        c.close()

    async def count_rows():
        c = AsyncIOMotorClient(os.environ.get("MONGO_URL", "mongodb://localhost:27017"))
        db = c[os.environ.get("DB_NAME", "test_database")]
        rows = await db.manufacturing_inventory.find(
            {"$or": [{"raw_material_id": rm_id}, {"material_id": rm_id}]}
        ).to_list(length=10)
        c.close()
        return rows

    async def cleanup():
        c = AsyncIOMotorClient(os.environ.get("MONGO_URL", "mongodb://localhost:27017"))
        db = c[os.environ.get("DB_NAME", "test_database")]
        await db.raw_materials.delete_many({"id": rm_id})
        await db.manufacturing_inventory.delete_many({"$or": [{"raw_material_id": rm_id}, {"material_id": rm_id}]})
        await db.warehouse_inventory.delete_many({"raw_material_id": rm_id})
        c.close()

    asyncio.run(setup_and_check())

    # Perform transfer of 30 from warehouse to manufacturing
    payload = {"items": [{"raw_material_id": rm_id, "quantity": 30}]}
    r = requests.post(f"{BASE_URL}/api/warehouse-to-manufacturing", json=payload, headers=headers, timeout=30)
    assert r.status_code == 200, f"transfer failed: {r.status_code} {r.text[:300]}"

    rows = asyncio.run(count_rows())
    try:
        assert len(rows) == 1, f"expected 1 merged MI row, got {len(rows)}: {rows}"
        row = rows[0]
        assert row.get("quantity") == 40, f"expected 10+30=40, got {row.get('quantity')}: {row}"
        # both id fields should be healed
        assert row.get("raw_material_id") == rm_id, f"raw_material_id not healed: {row}"
        assert row.get("material_id") == rm_id, f"material_id not preserved: {row}"
    finally:
        asyncio.run(cleanup())
