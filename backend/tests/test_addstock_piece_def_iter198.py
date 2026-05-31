"""Iter198: Verify add-stock with piece_def_value correctly deducts raw material.

Scenario: product 'fahita-demo' (unit=غرام, piece_def_value=80غرام, recipe=8000غ raw chicken).
Add 24000غرام (= 300 حصة × 80) → should deduct exactly 24000غ raw → 100000→76000.
"""
import os
import pytest
import requests
from pymongo import MongoClient
from dotenv import load_dotenv

load_dotenv("/app/backend/.env")
load_dotenv("/app/frontend/.env")

BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ["DB_NAME"]

PRODUCT_ID = "fahita-demo"
RAW_ID = "fahita-demo-raw"


@pytest.fixture(scope="module")
def db():
    c = MongoClient(MONGO_URL)
    return c[DB_NAME]


@pytest.fixture(scope="module", autouse=True)
def seed_demo(db):
    """Create the demo product + raw material + inventory, then clean up after the module."""
    from datetime import datetime, timezone
    now = datetime.now(timezone.utc).isoformat()
    db.raw_materials.replace_one(
        {"id": RAW_ID},
        {"id": RAW_ID, "tenant_id": "default", "name": "دجاج خام (demo)",
         "pack_quantity": 1000, "pack_unit": "غرام", "cost_per_unit": 5, "created_at": now},
        upsert=True,
    )
    db.manufacturing_inventory.replace_one(
        {"raw_material_id": RAW_ID},
        {"id": "fahita-demo-inv", "tenant_id": "default", "raw_material_id": RAW_ID,
         "material_id": RAW_ID, "name": "دجاج خام (demo)", "quantity": 100000,
         "unit": "غرام", "last_updated": now},
        upsert=True,
    )
    db.manufactured_products.replace_one(
        {"id": PRODUCT_ID},
        {"id": PRODUCT_ID, "tenant_id": "default", "name": "دجاج فاهيتا (demo)",
         "unit": "غرام", "piece_weight": 1, "piece_weight_unit": "حصة",
         "piece_def_value": 80, "piece_def_unit": "غرام",
         "recipe": [{"raw_material_id": RAW_ID, "raw_material_name": "دجاج خام (demo)",
                     "quantity": 8000, "unit": "غرام", "cost_per_unit": 5}],
         "raw_material_cost": 40000, "raw_material_cost_after_waste": 40000,
         "production_cost": 40000, "cost_before_waste": 40000,
         "total_produced": 0, "transferred_quantity": 0, "quantity": 0, "created_at": now},
        upsert=True,
    )
    yield
    db.manufactured_products.delete_one({"id": PRODUCT_ID})
    db.raw_materials.delete_one({"id": RAW_ID})
    db.manufacturing_inventory.delete_one({"raw_material_id": RAW_ID})


@pytest.fixture
def reset_seed(db):
    """Re-seed the demo product + raw material to the pristine state."""
    def _reset():
        db.manufactured_products.update_one(
            {"id": PRODUCT_ID},
            {"$set": {
                "quantity": 0,
                "total_produced": 0,
                "recipe.0.quantity": 8000,
            }},
        )
        db.manufacturing_inventory.update_one(
            {"$or": [{"raw_material_id": RAW_ID}, {"material_id": RAW_ID}]},
            {"$set": {"quantity": 100000}},
        )
    _reset()
    yield
    _reset()


@pytest.fixture(scope="module")
def admin_token():
    r = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": "admin@maestroegp.com", "password": "admin123"},
    )
    assert r.status_code == 200, r.text
    return r.json()["token"]


@pytest.fixture(scope="module")
def headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}"}


def test_product_seed_state(db):
    """Sanity: the product is correctly seeded with piece_def_value=80."""
    p = db.manufactured_products.find_one({"id": PRODUCT_ID}, {"_id": 0})
    assert p is not None
    assert p["unit"] == "غرام"
    assert float(p["piece_def_value"]) == 80
    assert p["piece_def_unit"] == "غرام"
    assert p["piece_weight_unit"] == "حصة"
    assert p["recipe"][0]["quantity"] == 8000


def test_add_stock_24000_grams_deducts_24000_raw(db, headers, reset_seed):
    """POST /api/manufactured-products/fahita-demo/add-stock?quantity=24000
       → product.quantity becomes 24000, raw stock deducted by 24000 (100000→76000)."""
    r = requests.post(
        f"{BASE_URL}/api/manufactured-products/{PRODUCT_ID}/add-stock",
        params={"quantity": 24000},
        headers=headers,
    )
    assert r.status_code == 200, r.text
    body = r.json()
    # Response sanity
    assert "new_quantity" in body or "quantity" in body or body.get("success") is True
    # Verify product quantity persisted
    p = db.manufactured_products.find_one({"id": PRODUCT_ID}, {"_id": 0})
    assert abs(p["quantity"] - 24000) < 0.001, f"product.quantity={p['quantity']}"
    # Verify raw deducted by 24000
    rm_id = p["recipe"][0]["raw_material_id"]
    mi = db.manufacturing_inventory.find_one(
        {"$or": [{"raw_material_id": rm_id}, {"material_id": rm_id}]},
        {"_id": 0},
    )
    assert abs(mi["quantity"] - 76000) < 0.001, (
        f"raw stock={mi['quantity']} (expected 76000 = 100000 - 24000). "
        f"If it equals 100000-300=99700, piece_def_value was IGNORED (bug)."
    )


def test_add_stock_response_payload(db, headers, reset_seed):
    """Verify the response includes the new quantity (300 portions worth)."""
    r = requests.post(
        f"{BASE_URL}/api/manufactured-products/{PRODUCT_ID}/add-stock",
        params={"quantity": 24000},
        headers=headers,
    )
    assert r.status_code == 200
    body = r.json()
    # Find a key that holds the new product quantity
    new_q = body.get("new_quantity") or body.get("quantity") or body.get("product", {}).get("quantity")
    assert new_q is not None, f"Response missing new quantity: {body}"
    assert abs(float(new_q) - 24000) < 0.001
