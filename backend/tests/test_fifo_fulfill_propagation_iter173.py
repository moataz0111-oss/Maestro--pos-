"""
FIFO Phase 2 — Manufacturing Request Fulfill + Cost Propagation tests (iteration 173).

Validates:
- POST /api/manufacturing-requests/{id}/fulfill now uses consume_fifo (FIFO) ⇒ drains oldest layer first.
- raw_materials.cost_per_unit auto-updates to next-oldest layer's unit_cost when oldest depletes.
- Response includes cost_propagation array; updated_manufactured > 0 when material price changed.
- manufactured_products & POS products that use the material have raw_material_cost auto-recomputed.
- Service-level: weighted_avg_cost on receiving manufacturing_inventory side reflects mix of layers.

Pre-conditions (verified at run-time): material طماطم has at least 2 active FIFO layers with
different unit_cost values so that consuming "deep enough" depletes the oldest.
"""
import os
import time
import uuid
import asyncio
from typing import Optional

import pytest
import requests
from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient

load_dotenv("/app/backend/.env")

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://hr-fixes-phase1.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN_EMAIL = "hanialdujaili@gmail.com"
ADMIN_PASSWORD = "Hani@2024"
TENANT_ID = "47b57008-b561-41ab-b3b0-6f30a513f633"
TOMATO_ID = "c4b3b488-011b-4fdb-a4b7-c5f3c76033d1"


# ---------------- Fixtures ----------------
@pytest.fixture(scope="module")
def admin_token():
    r = requests.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=20)
    assert r.status_code == 200, f"Admin login failed: {r.status_code} {r.text}"
    return r.json()["token"]


@pytest.fixture(scope="module")
def admin_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def admin_user(admin_token):
    """Fetch admin user info so we can pass requested_by/requested_by_name on creation."""
    r = requests.get(f"{API}/auth/me", headers={"Authorization": f"Bearer {admin_token}"}, timeout=20)
    if r.status_code == 200:
        return r.json()
    # fall back
    return {"id": "admin", "name": "Admin"}


def _get_material(headers, mid):
    r = requests.get(f"{API}/raw-materials-new", headers=headers, timeout=20)
    assert r.status_code == 200
    for m in r.json():
        if m.get("id") == mid:
            return m
    return None


def _get_layers(headers, mid):
    r = requests.get(f"{API}/raw-materials-new/{mid}/cost-layers", headers=headers, timeout=20)
    assert r.status_code == 200, r.text
    return r.json()


# ---------------- Pre-flight: ensure 2+ layers with different unit_cost ----------------
class TestPreflightLayers:
    def test_tomato_has_multi_priced_layers(self, admin_headers):
        layers = _get_layers(admin_headers, TOMATO_ID)
        active = [l for l in layers["layers"] if l.get("status") == "active" and (l.get("remaining_quantity", 0) or 0) > 0]
        assert len(active) >= 2, f"Need >=2 active layers; have {len(active)}"
        prices = sorted({float(l["unit_cost"]) for l in active})
        assert len(prices) >= 2, f"Need layers with >=2 distinct unit_cost; got {prices}"


# ---------------- E2E: fulfill consumes FIFO + propagates cost ----------------
class TestFulfillFIFOAndPropagation:
    """Full E2E covering the Phase 2 problem statement."""

    @pytest.fixture(scope="class")
    def created_manufactured_product(self, admin_headers):
        """Create a manufactured product TEST_X that uses طماطم 0.5kg in recipe."""
        payload = {
            "name": f"TEST_X_{uuid.uuid4().hex[:6]}",
            "name_en": "TEST_X",
            "unit": "قطعة",
            "recipe": [{
                "raw_material_id": TOMATO_ID,
                "raw_material_name": "طماطم",
                "quantity": 0.5,
                "unit": "كغم",
                "cost_per_unit": 500.0,  # initial; should be propagated later
            }],
            "quantity": 0,
            "min_quantity": 0,
            "selling_price": 1000.0,
            "category": "test",
        }
        r = requests.post(f"{API}/manufactured-products", json=payload, headers=admin_headers, timeout=20)
        assert r.status_code in (200, 201), r.text
        prod = r.json()
        assert prod["id"]
        # initial raw_material_cost = 0.5 * 500 = 250
        assert abs(float(prod["raw_material_cost"]) - 250.0) < 0.01, prod
        return prod

    def test_fulfill_drains_oldest_and_propagates(self, admin_headers, admin_user, created_manufactured_product):
        # Snapshot state
        layers_before = _get_layers(admin_headers, TOMATO_ID)
        active_before = [l for l in layers_before["layers"] if l["status"] == "active" and (l.get("remaining_quantity") or 0) > 0]
        oldest = active_before[0]
        oldest_cost = float(oldest["unit_cost"])
        # Find first layer (going forward) with DIFFERENT unit_cost than oldest — we must drain
        # all same-priced older layers then partially consume that different-priced layer.
        different_idx = next(
            (i for i, l in enumerate(active_before) if abs(float(l["unit_cost"]) - oldest_cost) > 0.001),
            None,
        )
        assert different_idx is not None, "no layer with different cost — preflight failed"
        # drain layers[0..different_idx-1] fully + 5 from layers[different_idx]
        qty_to_drain_same = sum(float(l["remaining_quantity"]) for l in active_before[:different_idx])
        consume_qty = qty_to_drain_same + 5
        next_diff = active_before[different_idx]
        oldest_remaining = float(oldest["remaining_quantity"])
        next_cost = float(next_diff["unit_cost"])
        # Sanity: ensure raw_materials.quantity >= consume_qty (fulfill validation)
        mat_before = _get_material(admin_headers, TOMATO_ID)
        assert float(mat_before["quantity"]) >= consume_qty, \
            f"raw_materials.quantity ({mat_before['quantity']}) < consume_qty ({consume_qty})"
        prev_cost_per_unit = float(mat_before["cost_per_unit"])
        # cost_per_unit must equal oldest layer cost (effective)
        assert abs(prev_cost_per_unit - oldest_cost) < 0.01

        # Create manufacturing-request
        req_payload = {
            "items": [{"material_id": TOMATO_ID, "quantity": consume_qty}],
            "priority": "normal",
            "notes": f"TEST_FIFO_FULFILL_{uuid.uuid4().hex[:6]}",
            "requested_by": admin_user.get("id", "admin"),
            "requested_by_name": admin_user.get("name", "Admin"),
        }
        cr = requests.post(f"{API}/manufacturing-requests", json=req_payload, headers=admin_headers, timeout=20)
        assert cr.status_code in (200, 201), cr.text
        req_id = cr.json()["id"]

        # Fulfill
        fr = requests.post(f"{API}/manufacturing-requests/{req_id}/fulfill", headers=admin_headers, timeout=30)
        assert fr.status_code == 200, fr.text
        body = fr.json()
        # cost_propagation must be present
        assert "cost_propagation" in body, body
        cp = body["cost_propagation"]
        assert isinstance(cp, list)
        # Tomato cost changed (oldest depleted) ⇒ propagation entry exists
        tomato_entry = next((e for e in cp if e.get("material_id") == TOMATO_ID), None)
        assert tomato_entry is not None, f"cost_propagation missing tomato entry: {cp}"
        assert tomato_entry.get("updated_manufactured", 0) >= 1, tomato_entry

        # Verify raw_materials.cost_per_unit auto-updated to next-oldest layer's cost
        mat_after = _get_material(admin_headers, TOMATO_ID)
        assert abs(float(mat_after["cost_per_unit"]) - next_cost) < 0.01, \
            f"cost_per_unit expected {next_cost}, got {mat_after['cost_per_unit']}"
        # And quantity decreased exactly by consume_qty
        assert abs(float(mat_after["quantity"]) - (float(mat_before["quantity"]) - consume_qty)) < 0.001

        # Verify cost-layers: all drained layers before different_idx must be depleted and next_diff reduced by 5
        layers_after = _get_layers(admin_headers, TOMATO_ID)
        for l in active_before[:different_idx]:
            la = next((x for x in layers_after["layers"] if x["id"] == l["id"]), None)
            assert la is not None
            assert la["status"] == "depleted", f"layer {l['id']} should be depleted"
            assert float(la.get("remaining_quantity", 0) or 0) <= 0.0001
        next_after = next((l for l in layers_after["layers"] if l["id"] == next_diff["id"]), None)
        assert next_after is not None
        assert abs(float(next_after["remaining_quantity"]) - (float(next_diff["remaining_quantity"]) - 5)) < 0.001

        # Effective cost in cost-layers = next_cost
        assert abs(float(layers_after["current_effective_cost"]) - next_cost) < 0.01

        # Verify TEST_X manufactured_product: raw_material_cost auto-updated
        # 0.5 * next_cost
        prod_id = created_manufactured_product["id"]
        pr = requests.get(f"{API}/manufactured-products/{prod_id}", headers=admin_headers, timeout=20)
        assert pr.status_code == 200, pr.text
        prod = pr.json()
        expected_rmc = round(0.5 * next_cost, 4)
        assert abs(float(prod["raw_material_cost"]) - expected_rmc) < 0.01, \
            f"raw_material_cost expected {expected_rmc}, got {prod['raw_material_cost']}"
        # recipe[0].cost_per_unit also updated
        recipe = prod.get("recipe", [])
        assert recipe and abs(float(recipe[0]["cost_per_unit"]) - next_cost) < 0.01
        # profit_margin = 1000 - expected_rmc
        expected_pm = 1000.0 - expected_rmc
        assert abs(float(prod["profit_margin"]) - expected_pm) < 0.01

        # Stash for next test
        TestFulfillFIFOAndPropagation._consumed = {
            "consume_qty": consume_qty,
            "qty_to_drain_same": qty_to_drain_same,
            "oldest_cost": oldest_cost,
            "next_cost": next_cost,
        }

    def test_manufacturing_inventory_weighted_avg_cost(self, admin_headers):
        """manufacturing_inventory.cost_per_unit on receiving side = weighted-avg of consumed layers."""
        info = getattr(TestFulfillFIFOAndPropagation, "_consumed", None)
        if not info:
            pytest.skip("previous test did not run")
        # Compute expected weighted_avg
        qty_same = info["qty_to_drain_same"]
        oldest_cost = info["oldest_cost"]
        next_cost = info["next_cost"]
        consume_qty = info["consume_qty"]
        from_next = consume_qty - qty_same
        expected_avg = (qty_same * oldest_cost + from_next * next_cost) / consume_qty

        # Fetch manufacturing_inventory directly via DB (no public list endpoint that always exists)
        async def runner():
            mongo_url = os.environ["MONGO_URL"]
            db_name = os.environ["DB_NAME"]
            client = AsyncIOMotorClient(mongo_url)
            db = client[db_name]
            inv = await db.manufacturing_inventory.find_one({"material_id": TOMATO_ID}, {"_id": 0})
            client.close()
            return inv

        loop = asyncio.new_event_loop()
        try:
            inv = loop.run_until_complete(runner())
        finally:
            loop.close()
        assert inv is not None, "manufacturing_inventory entry not created"
        # cost_per_unit on receiving side reflects most recent weighted-avg of this fulfill
        assert abs(float(inv.get("cost_per_unit", 0)) - expected_avg) < 0.5, \
            f"weighted_avg expected ~{expected_avg:.4f}, got {inv.get('cost_per_unit')}"


# ---------------- propagate_cost_to_products helper regression ----------------
class TestPropagateHelperRegression:
    def test_helper_updates_test_product_when_called_directly(self):
        """Direct service-level: tweak raw_materials.cost_per_unit then call propagate_cost_to_products."""
        import sys
        sys.path.insert(0, "/app")
        from backend.services.cost_layer_service import propagate_cost_to_products

        async def runner():
            mongo_url = os.environ["MONGO_URL"]
            db_name = os.environ["DB_NAME"]
            client = AsyncIOMotorClient(mongo_url)
            db = client[db_name]

            # snapshot current cost_per_unit
            mat = await db.raw_materials.find_one({"id": TOMATO_ID, "tenant_id": TENANT_ID}, {"_id": 0})
            original = float(mat["cost_per_unit"])

            # Find a manufactured_product that references tomato
            mfg = await db.manufactured_products.find_one(
                {"tenant_id": TENANT_ID, "recipe.raw_material_id": TOMATO_ID}, {"_id": 0}
            )
            # Some manufactured_products may be created without tenant_id — also try without filter
            if not mfg:
                mfg = await db.manufactured_products.find_one(
                    {"recipe.raw_material_id": TOMATO_ID}, {"_id": 0}
                )
            assert mfg is not None, "no manufactured_product with tomato found — create one first"
            qty = next(
                (float(i.get("quantity", 0)) for i in mfg.get("recipe", []) if i.get("raw_material_id") == TOMATO_ID),
                None,
            )
            assert qty is not None and qty > 0

            # bump price by +13 (arbitrary unique delta) and call helper
            new_price = round(original + 13.0, 4)
            await db.raw_materials.update_one(
                {"id": TOMATO_ID, "tenant_id": TENANT_ID},
                {"$set": {"cost_per_unit": new_price}},
            )
            res = await propagate_cost_to_products(db, material_id=TOMATO_ID, tenant_id=TENANT_ID)
            assert res["updated_manufactured"] >= 1, res

            # Verify
            updated = await db.manufactured_products.find_one({"id": mfg["id"]}, {"_id": 0})
            recipe_ing = next(i for i in updated["recipe"] if i.get("raw_material_id") == TOMATO_ID)
            assert abs(float(recipe_ing["cost_per_unit"]) - new_price) < 0.01

            # restore price
            await db.raw_materials.update_one(
                {"id": TOMATO_ID, "tenant_id": TENANT_ID},
                {"$set": {"cost_per_unit": original}},
            )
            await propagate_cost_to_products(db, material_id=TOMATO_ID, tenant_id=TENANT_ID)
            client.close()

        loop = asyncio.new_event_loop()
        try:
            loop.run_until_complete(runner())
        finally:
            loop.close()
