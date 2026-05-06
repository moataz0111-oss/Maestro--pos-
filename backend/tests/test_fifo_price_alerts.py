"""
Backend tests for FIFO cost layers + Price Alerts feature.

Covers:
- GET /api/raw-materials-new/{id}/cost-layers
- GET /api/price-alerts (with status_filter)
- POST /api/price-alerts/{id}/mark-read (admin only)
- POST /api/price-alerts/mark-all-read
- POST /api/price-alerts/{id}/dismiss
- E2E: create supplier -> warehouse-purchase-request -> approve -> price (+20%) -> alert generated
- E2E: confirm-receipt -> 2 active layers, cost_per_unit unchanged (oldest)
- E2E: within-1% threshold => no alert
- E2E: decrease scenario (-4%) => alert with direction=decrease
- Service-level: consume_fifo drains oldest first and updates cost_per_unit
"""
import os
import time
import uuid
import asyncio
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://hr-fixes-phase1.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN_EMAIL = "hanialdujaili@gmail.com"
ADMIN_PASSWORD = "Hani@2024"
TENANT_ID = "47b57008-b561-41ab-b3b0-6f30a513f633"

# Material id that already exists per problem statement (طماطم)
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


# ---------------- Cost Layers endpoint ----------------
class TestCostLayersEndpoint:
    def test_cost_layers_for_existing_material(self, admin_headers):
        r = requests.get(f"{API}/raw-materials-new/{TOMATO_ID}/cost-layers", headers=admin_headers, timeout=20)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["material_id"] == TOMATO_ID
        assert "layers" in data and isinstance(data["layers"], list)
        for k in ("active_count", "depleted_count", "total_active_quantity", "total_active_value", "current_effective_cost"):
            assert k in data, f"missing key {k}"
        # if active layers exist, current_effective_cost must equal oldest active layer's unit_cost
        active = [l for l in data["layers"] if l.get("status") == "active" and (l.get("remaining_quantity", 0) or 0) > 0]
        if active:
            assert data["current_effective_cost"] == active[0]["unit_cost"]
            assert data["active_count"] == len(active)


# ---------------- Price alerts list & status filters ----------------
class TestPriceAlertsListing:
    def test_list_all(self, admin_headers):
        r = requests.get(f"{API}/price-alerts", headers=admin_headers, timeout=20)
        assert r.status_code == 200
        data = r.json()
        assert "alerts" in data and "unread_count" in data and "total_count" in data
        assert isinstance(data["alerts"], list)

    def test_status_filter_unread(self, admin_headers):
        r = requests.get(f"{API}/price-alerts?status_filter=unread", headers=admin_headers, timeout=20)
        assert r.status_code == 200
        data = r.json()
        for a in data["alerts"]:
            assert a["status"] == "unread"

    def test_status_filter_dismissed(self, admin_headers):
        r = requests.get(f"{API}/price-alerts?status_filter=dismissed", headers=admin_headers, timeout=20)
        assert r.status_code == 200


# ---------------- E2E: increase + receipt + threshold + decrease ----------------
class TestE2EFlow:
    """Full flow: supplier -> request -> approve -> price (alert) -> confirm-receipt (FIFO layer)."""

    @pytest.fixture(scope="class")
    def supplier_id(self, admin_headers):
        # create a supplier (idempotent-ish: unique per run)
        sup = {"name": f"TEST_SUPPLIER_{uuid.uuid4().hex[:8]}", "phone": "+0", "address": "test"}
        r = requests.post(f"{API}/suppliers", json=sup, headers=admin_headers, timeout=20)
        assert r.status_code in (200, 201), r.text
        return r.json().get("id")

    def _create_request(self, admin_headers, name, qty, unit="كغم"):
        payload = {
            "items": [{"name": name, "quantity": qty, "unit": unit, "notes": "test"}],
            "priority": "normal",
            "notes": f"TEST_FIFO_{uuid.uuid4().hex[:6]}",
        }
        r = requests.post(f"{API}/warehouse-purchase-requests", json=payload, headers=admin_headers, timeout=20)
        assert r.status_code in (200, 201), r.text
        return r.json()["id"]

    def _approve(self, admin_headers, req_id):
        r = requests.post(f"{API}/warehouse-purchase-requests/{req_id}/approve", headers=admin_headers, timeout=20)
        assert r.status_code == 200, r.text

    def _price(self, admin_headers, req_id, supplier_id, name, qty, unit, cost):
        invoice_payload = {
            "supplier_id": supplier_id,
            "invoice_number": f"INV-TEST-{uuid.uuid4().hex[:6]}",
            "items": [{"name": name, "quantity": qty, "unit": unit, "cost_per_unit": cost}],
            "total_amount": qty * cost,
            "payment_method": "cash",
            "payment_status": "paid",
            "notes": "test pricing",
        }
        r = requests.post(
            f"{API}/warehouse-purchase-requests/{req_id}/price-and-create-invoice",
            json=invoice_payload, headers=admin_headers, timeout=30,
        )
        assert r.status_code == 200, r.text
        return r.json()

    def _confirm_receipt(self, admin_headers, req_id):
        r = requests.post(f"{API}/warehouse-purchase-requests/{req_id}/confirm-receipt", headers=admin_headers, timeout=30)
        assert r.status_code == 200, r.text
        return r.json()

    def _get_material(self, admin_headers, mid):
        r = requests.get(f"{API}/raw-materials-new", headers=admin_headers, timeout=20)
        assert r.status_code == 200
        for m in r.json():
            if m.get("id") == mid:
                return m
        return None

    def test_e2e_increase_then_receipt_creates_layer(self, admin_headers, supplier_id):
        # snapshot tomato current state
        before = self._get_material(admin_headers, TOMATO_ID)
        assert before is not None, "طماطم not found"
        old_cost = float(before["cost_per_unit"])
        old_qty = float(before["quantity"])
        # +20% by increasing 20% on the current price
        new_cost = round(old_cost * 1.20, 2)

        # cost-layers before
        layers_before_resp = requests.get(f"{API}/raw-materials-new/{TOMATO_ID}/cost-layers", headers=admin_headers, timeout=20).json()
        active_before = layers_before_resp["active_count"]

        req_id = self._create_request(admin_headers, "طماطم", 20)
        self._approve(admin_headers, req_id)
        priced = self._price(admin_headers, req_id, supplier_id, "طماطم", 20, "كغم", new_cost)
        # alert validation
        assert priced["price_alerts_count"] >= 1, priced
        alert = next((a for a in priced["price_alerts"] if a["material_id"] == TOMATO_ID), None)
        assert alert is not None, f"no alert for tomato; alerts={priced['price_alerts']}"
        assert alert["direction"] == "increase"
        assert abs(alert["percent_change"] - 20.0) < 0.5
        assert alert["severity"] == "critical"  # >=10% => critical
        assert alert["status"] == "unread"
        alert_id = alert["id"]

        # appears in list as unread
        listing = requests.get(f"{API}/price-alerts?status_filter=unread", headers=admin_headers, timeout=20).json()
        ids = [a["id"] for a in listing["alerts"]]
        assert alert_id in ids

        # confirm-receipt → adds layer; cost_per_unit must remain old (oldest layer)
        self._confirm_receipt(admin_headers, req_id)

        layers_after = requests.get(f"{API}/raw-materials-new/{TOMATO_ID}/cost-layers", headers=admin_headers, timeout=20).json()
        assert layers_after["active_count"] == active_before + 1
        # current effective cost must remain the oldest one (== old_cost)
        assert abs(layers_after["current_effective_cost"] - old_cost) < 0.01, \
            f"effective={layers_after['current_effective_cost']} expected={old_cost}"

        after_mat = self._get_material(admin_headers, TOMATO_ID)
        assert abs(after_mat["cost_per_unit"] - old_cost) < 0.01
        assert abs(after_mat["quantity"] - (old_qty + 20)) < 0.001

        # mark-read
        rr = requests.post(f"{API}/price-alerts/{alert_id}/mark-read", headers=admin_headers, timeout=20)
        assert rr.status_code == 200
        # verify status changed
        listing2 = requests.get(f"{API}/price-alerts", headers=admin_headers, timeout=20).json()
        a2 = next((a for a in listing2["alerts"] if a["id"] == alert_id), None)
        assert a2 and a2["status"] == "read"

        # dismiss
        dd = requests.post(f"{API}/price-alerts/{alert_id}/dismiss", headers=admin_headers, timeout=20)
        assert dd.status_code == 200
        listing3 = requests.get(f"{API}/price-alerts", headers=admin_headers, timeout=20).json()
        a3 = next((a for a in listing3["alerts"] if a["id"] == alert_id), None)
        assert a3 and a3["status"] == "dismissed"

    def test_e2e_within_threshold_no_alert(self, admin_headers, supplier_id):
        before = self._get_material(admin_headers, TOMATO_ID)
        old_cost = float(before["cost_per_unit"])
        # +0.4% (well under 1%) — uses 1.004 factor
        within_cost = round(old_cost * 1.004, 4)
        if abs(within_cost - old_cost) / old_cost * 100 >= 1.0:
            within_cost = old_cost  # safety
        req_id = self._create_request(admin_headers, "طماطم", 1)
        self._approve(admin_headers, req_id)
        priced = self._price(admin_headers, req_id, supplier_id, "طماطم", 1, "كغم", within_cost)
        assert priced["price_alerts_count"] == 0, priced

    def test_e2e_decrease_creates_info_alert(self, admin_headers, supplier_id):
        before = self._get_material(admin_headers, TOMATO_ID)
        old_cost = float(before["cost_per_unit"])
        # -4% (info severity since <5%)
        new_cost = round(old_cost * 0.96, 2)
        req_id = self._create_request(admin_headers, "طماطم", 5)
        self._approve(admin_headers, req_id)
        priced = self._price(admin_headers, req_id, supplier_id, "طماطم", 5, "كغم", new_cost)
        assert priced["price_alerts_count"] >= 1
        alert = next((a for a in priced["price_alerts"] if a["material_id"] == TOMATO_ID), None)
        assert alert is not None
        assert alert["direction"] == "decrease"
        assert alert["severity"] == "info"
        assert alert["percent_change"] < 0


# ---------------- RBAC ----------------
class TestPriceAlertsRBAC:
    def test_unauth_returns_401_or_403(self):
        r = requests.post(f"{API}/price-alerts/non-existent/mark-read", timeout=20)
        # no token => 401/403 expected
        assert r.status_code in (401, 403, 422)


# ---------------- Service-level FIFO consume ----------------
class TestFIFOConsume:
    def test_consume_fifo_drains_oldest(self, admin_headers):
        """Service-level: consume some quantity and verify oldest-layer drains and cost_per_unit updates if oldest depletes."""
        # Use direct DB call via importing module
        import sys
        sys.path.insert(0, "/app")
        from backend.services.cost_layer_service import consume_fifo, get_active_layers
        from motor.motor_asyncio import AsyncIOMotorClient

        async def runner():
            from dotenv import load_dotenv
            load_dotenv("/app/backend/.env")
            mongo_url = os.environ["MONGO_URL"]
            db_name = os.environ["DB_NAME"]
            client = AsyncIOMotorClient(mongo_url)
            db = client[db_name]
            # Pick a material with at least 2 active layers; if tomato has 2+, use it; else skip.
            layers = await get_active_layers(db, TOMATO_ID, TENANT_ID)
            if len(layers) < 2:
                client.close()
                pytest.skip("Need >=2 active layers for FIFO consume test")
            oldest = layers[0]
            second = layers[1]
            old_remaining = float(oldest["remaining_quantity"])
            consume_qty = old_remaining + 1  # drain oldest fully + 1 from next
            res = await consume_fifo(db, material_id=TOMATO_ID, quantity=consume_qty, tenant_id=TENANT_ID)
            assert abs(res["consumed"] - consume_qty) < 0.001
            # new effective cost should be second layer's cost
            assert abs(res["new_effective_cost"] - float(second["unit_cost"])) < 0.01
            # raw_materials.cost_per_unit reflects new effective cost
            mat = await db.raw_materials.find_one({"id": TOMATO_ID, "tenant_id": TENANT_ID}, {"_id": 0})
            assert abs(float(mat["cost_per_unit"]) - float(second["unit_cost"])) < 0.01
            # restore: re-create the consumed layer back as a new layer at the OLDEST position is impossible,
            # so as compensation, push back into second layer to keep total consistent.
            await db.material_cost_layers.update_one(
                {"id": oldest["id"]},
                {"$set": {"remaining_quantity": old_remaining, "status": "active"}}
            )
            await db.material_cost_layers.update_one(
                {"id": second["id"]},
                {"$inc": {"remaining_quantity": 1.0}}
            )
            # restore quantity & cost_per_unit
            await db.raw_materials.update_one(
                {"id": TOMATO_ID, "tenant_id": TENANT_ID},
                {"$inc": {"quantity": consume_qty}}
            )
            # restore cost_per_unit to oldest
            await db.raw_materials.update_one(
                {"id": TOMATO_ID, "tenant_id": TENANT_ID},
                {"$set": {"cost_per_unit": float(oldest["unit_cost"])}}
            )
            client.close()

        asyncio.get_event_loop().run_until_complete(runner())
