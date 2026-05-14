"""Regression tests for:
1. Price-increase justification (≥10% above last purchase price requires `price_increase_reasons`).
2. Multi-invoice partial-receipt flow (`confirm-receipt` creates one inventory_movement per invoice
   and only closes the request when all linked invoices are received).
3. Endpoint /api/raw-materials/last-purchase-prices returns last cost + date + supplier per material.
"""
import os
import pytest
import requests

BASE_URL = os.environ.get(
    "REACT_APP_BACKEND_URL",
    open("/app/frontend/.env").read().split("REACT_APP_BACKEND_URL=")[-1].split("\n")[0].strip(),
)
ADMIN_EMAIL = "hanialdujaili@gmail.com"
ADMIN_PASSWORD = "Hani@2024"


@pytest.fixture(scope="module")
def auth():
    r = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
        timeout=20,
    )
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['token']}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def material(auth):
    mats = requests.get(f"{BASE_URL}/api/raw-materials", headers=auth, timeout=20).json()
    if not mats:
        pytest.skip("No raw materials available")
    return mats[0]


@pytest.fixture(scope="module")
def supplier(auth):
    sups = requests.get(f"{BASE_URL}/api/suppliers", headers=auth, timeout=20).json()
    if not sups:
        pytest.skip("No suppliers available")
    return sups[0]


def _create_and_approve_request(auth, material, qty=10):
    r = requests.post(
        f"{BASE_URL}/api/warehouse-purchase-requests",
        headers=auth,
        json={
            "items": [{
                "raw_material_id": material["id"],
                "name": material["name"],
                "quantity": qty,
                "unit": material.get("unit", "كغم"),
            }],
            "notes": "TEST_pytest",
        },
        timeout=20,
    )
    assert r.status_code == 200, r.text
    req_id = r.json()["id"]
    if r.json().get("status") != "approved_by_owner":
        ar = requests.post(
            f"{BASE_URL}/api/warehouse-purchase-requests/{req_id}/approve",
            headers=auth, json={}, timeout=20,
        )
        assert ar.status_code == 200, ar.text
    return req_id


class TestLastPurchasePricesEndpoint:
    def test_returns_by_id_and_by_name(self, auth, material):
        r = requests.post(
            f"{BASE_URL}/api/raw-materials/last-purchase-prices",
            headers=auth,
            json={"material_ids": [material["id"]], "names": [material["name"]]},
            timeout=20,
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert "by_id" in data and "by_name" in data
        entry = data["by_id"].get(material["id"]) or data["by_name"].get(material["name"])
        if entry:  # may be empty if no prior purchases
            assert "cost" in entry and "date" in entry


class TestPriceIncreaseJustification:
    def test_blocks_increase_without_reason(self, auth, material, supplier):
        # Get current last cost
        lp = requests.post(
            f"{BASE_URL}/api/raw-materials/last-purchase-prices",
            headers=auth, json={"material_ids": [material["id"]]}, timeout=20,
        ).json()
        last = (lp.get("by_id") or {}).get(material["id"])
        if not last:
            pytest.skip("No prior purchase price to compare against")
        last_cost = float(last["cost"])
        new_cost = last_cost * 1.20  # +20%
        req_id = _create_and_approve_request(auth, material)
        r = requests.post(
            f"{BASE_URL}/api/warehouse-purchase-requests/{req_id}/price-and-create-invoice",
            headers=auth,
            json={
                "supplier_id": supplier["id"],
                "invoice_number": "TEST-NO-REASON",
                "items": [{
                    "raw_material_id": material["id"],
                    "name": material["name"],
                    "quantity": 10,
                    "unit": material.get("unit", "كغم"),
                    "cost_per_unit": new_cost,
                }],
                "total_amount": 10 * new_cost,
                "payment_method": "cash",
                "payment_status": "paid",
            },
            timeout=20,
        )
        assert r.status_code == 400, r.text
        detail = r.json()["detail"]
        assert isinstance(detail, dict)
        assert detail.get("code") == "PRICE_INCREASE_REASON_REQUIRED"
        assert detail.get("items_requiring_reason"), "should list flagged items"

    def test_allows_increase_with_reason(self, auth, material, supplier):
        lp = requests.post(
            f"{BASE_URL}/api/raw-materials/last-purchase-prices",
            headers=auth, json={"material_ids": [material["id"]]}, timeout=20,
        ).json()
        last = (lp.get("by_id") or {}).get(material["id"])
        if not last:
            pytest.skip("No prior purchase price")
        new_cost = float(last["cost"]) * 1.20
        req_id = _create_and_approve_request(auth, material)
        r = requests.post(
            f"{BASE_URL}/api/warehouse-purchase-requests/{req_id}/price-and-create-invoice",
            headers=auth,
            json={
                "supplier_id": supplier["id"],
                "invoice_number": "TEST-WITH-REASON",
                "items": [{
                    "raw_material_id": material["id"],
                    "name": material["name"],
                    "quantity": 10,
                    "unit": material.get("unit", "كغم"),
                    "cost_per_unit": new_cost,
                }],
                "total_amount": 10 * new_cost,
                "payment_method": "cash",
                "payment_status": "paid",
                "price_increase_reasons": {"by_id": {material["id"]: "ارتفاع عالمي"}},
            },
            timeout=20,
        )
        assert r.status_code == 200, r.text
        pid = r.json()["purchase_id"]
        inv = requests.get(f"{BASE_URL}/api/purchases-new/{pid}", headers=auth, timeout=20).json()
        log = inv.get("price_increase_log") or []
        assert len(log) >= 1
        assert log[0]["reason"] == "ارتفاع عالمي"
        assert log[0]["diff_pct"] >= 10.0

    def test_small_increase_allowed_without_reason(self, auth, material, supplier):
        lp = requests.post(
            f"{BASE_URL}/api/raw-materials/last-purchase-prices",
            headers=auth, json={"material_ids": [material["id"]]}, timeout=20,
        ).json()
        last = (lp.get("by_id") or {}).get(material["id"])
        if not last:
            pytest.skip("No prior purchase price")
        new_cost = float(last["cost"]) * 1.05  # +5% only
        req_id = _create_and_approve_request(auth, material, qty=5)
        r = requests.post(
            f"{BASE_URL}/api/warehouse-purchase-requests/{req_id}/price-and-create-invoice",
            headers=auth,
            json={
                "supplier_id": supplier["id"],
                "invoice_number": "TEST-SMALL",
                "items": [{
                    "raw_material_id": material["id"],
                    "name": material["name"],
                    "quantity": 5,
                    "unit": material.get("unit", "كغم"),
                    "cost_per_unit": new_cost,
                }],
                "total_amount": 5 * new_cost,
                "payment_method": "cash",
                "payment_status": "paid",
            },
            timeout=20,
        )
        assert r.status_code == 200, r.text


class TestPriceIncreaseReportEndpoint:
    def test_report_returns_structure_and_rows(self, auth, material, supplier):
        # Ensure there's at least one priced invoice with a reason (from prior tests)
        r = requests.get(
            f"{BASE_URL}/api/reports/price-increases?days=30&min_pct=10",
            headers=auth, timeout=20,
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert "rows" in data and "total_rows" in data and "total_cost_impact" in data
        assert "by_supplier" in data and "by_material" in data
        # Each row carries the audit fields
        if data["rows"]:
            row = data["rows"][0]
            for field in ("material_name", "old_cost", "new_cost", "diff_pct", "reason", "supplier_name", "invoice_number", "cost_impact"):
                assert field in row, f"missing {field} in row"
            assert row["diff_pct"] >= 10.0

    def test_report_filter_by_supplier(self, auth, supplier):
        r = requests.get(
            f"{BASE_URL}/api/reports/price-increases?days=30&supplier_id={supplier['id']}",
            headers=auth, timeout=20,
        )
        assert r.status_code == 200
        data = r.json()
        for row in data["rows"]:
            assert row["supplier_id"] == supplier["id"]

    def test_report_filter_by_min_pct(self, auth):
        r = requests.get(
            f"{BASE_URL}/api/reports/price-increases?days=30&min_pct=100",
            headers=auth, timeout=20,
        )
        assert r.status_code == 200
        for row in r.json()["rows"]:
            assert row["diff_pct"] >= 100.0

    def test_partial_then_full_receipt_creates_separate_movements(self, auth, material, supplier):
        """End-to-end: 1 request → 2 partial invoices → confirm receipt processes both."""
        req_id = _create_and_approve_request(auth, material, qty=20)

        # Invoice 1 — partial (8 units)
        i1 = requests.post(
            f"{BASE_URL}/api/warehouse-purchase-requests/{req_id}/price-and-create-invoice",
            headers=auth,
            json={
                "supplier_id": supplier["id"],
                "invoice_number": "PYTEST-PARTIAL-1",
                "items": [{
                    "raw_material_id": material["id"],
                    "name": material["name"],
                    "quantity": 8,
                    "unit": material.get("unit", "كغم"),
                    "cost_per_unit": 100,
                }],
                "total_amount": 800,
                "payment_method": "cash",
                "payment_status": "paid",
                "partial": True,
                "price_increase_reasons": {"by_id": {material["id"]: "test"}},
            },
            timeout=20,
        )
        assert i1.status_code == 200, i1.text

        # Invoice 2 — final (12 units)
        i2 = requests.post(
            f"{BASE_URL}/api/warehouse-purchase-requests/{req_id}/price-and-create-invoice",
            headers=auth,
            json={
                "supplier_id": supplier["id"],
                "invoice_number": "PYTEST-PARTIAL-2",
                "items": [{
                    "raw_material_id": material["id"],
                    "name": material["name"],
                    "quantity": 12,
                    "unit": material.get("unit", "كغم"),
                    "cost_per_unit": 100,
                }],
                "total_amount": 1200,
                "payment_method": "cash",
                "payment_status": "paid",
                "partial": False,
                "price_increase_reasons": {"by_id": {material["id"]: "test"}},
            },
            timeout=20,
        )
        assert i2.status_code == 200, i2.text

        # Verify request links 2 invoices
        reqs = requests.get(f"{BASE_URL}/api/warehouse-purchase-requests", headers=auth, timeout=20).json()
        ours = next((x for x in reqs if x["id"] == req_id), None)
        assert ours is not None
        assert len(ours.get("purchase_invoice_ids") or []) == 2
        assert ours.get("status") == "priced_by_purchasing"

        # Confirm receipt — should process BOTH pending invoices and create 2 movements
        r = requests.post(
            f"{BASE_URL}/api/warehouse-purchase-requests/{req_id}/confirm-receipt",
            headers=auth, json={}, timeout=20,
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["movements_logged"] >= 2
        assert len(body["received_purchase_ids"]) == 2
        assert body["pending_invoices_left"] == 0

        # Verify request is closed
        reqs = requests.get(f"{BASE_URL}/api/warehouse-purchase-requests", headers=auth, timeout=20).json()
        ours = next((x for x in reqs if x["id"] == req_id), None)
        assert ours.get("status") == "received_by_warehouse"
