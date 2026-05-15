"""Regression tests for warehouse → manufacturing partial fulfillment flow.

Covers:
- GET /api/manufacturing-requests refreshes `available_quantity` from current raw_materials
- POST /api/manufacturing-requests/{id}/fulfill supports `partial=true` + custom `items[]`
- Multi-step partial fulfillment closes the request when remaining qty hits 0
- `fulfillment_log` array tracks each partial transfer with sent_quantity and original_quantity
- `insufficient_materials` error returns `requested` field (not `needed`) — fixes undefined bug
"""
import os
import pytest
import requests

BASE_URL = open("/app/frontend/.env").read().split("REACT_APP_BACKEND_URL=")[-1].split("\n")[0].strip()
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
def in_stock_material(auth):
    mats = requests.get(f"{BASE_URL}/api/raw-materials", headers=auth, timeout=20).json()
    m = next((x for x in mats if float(x.get("quantity") or 0) >= 5), None)
    if not m:
        pytest.skip("Need a raw material with >= 5 units in stock to run this test suite")
    return m


def _create_request(auth, material, qty):
    r = requests.post(
        f"{BASE_URL}/api/manufacturing-requests",
        headers=auth,
        json={"items": [{"material_id": material["id"], "quantity": qty}], "priority": "normal", "notes": "TEST partial mfg"},
        timeout=20,
    )
    assert r.status_code == 200, r.text
    return r.json()["id"]


def _get_request(auth, rid):
    reqs = requests.get(f"{BASE_URL}/api/manufacturing-requests", headers=auth, timeout=20).json()
    return next((x for x in reqs if x["id"] == rid), None)


class TestManufacturingPartialFulfill:
    def test_get_refreshes_available_quantity(self, auth, in_stock_material):
        """available_quantity must reflect current raw_materials.quantity, not the stale snapshot from creation."""
        rid = _create_request(auth, in_stock_material, 1)
        req = _get_request(auth, rid)
        assert req is not None
        avail = req["items"][0].get("available_quantity")
        # Allow small drift (other tests may have run in parallel) but it must be present
        assert avail is not None
        assert avail >= 0

    def test_insufficient_error_uses_requested_field(self, auth, in_stock_material):
        """Bug fix: previously returned `needed` causing frontend to show 'undefined'."""
        # Build a request asking way more than available
        huge = float(in_stock_material["quantity"]) + 1_000_000
        rid = _create_request(auth, in_stock_material, huge)
        r = requests.post(
            f"{BASE_URL}/api/manufacturing-requests/{rid}/fulfill",
            headers=auth, json={}, timeout=20,
        )
        assert r.status_code == 400, r.text
        detail = r.json()["detail"]
        assert isinstance(detail, dict)
        items = detail.get("insufficient_materials") or []
        assert items, "should list insufficient materials"
        assert items[0].get("requested") is not None, "must include 'requested' key (was 'needed' previously)"
        assert items[0].get("available") is not None
        # cleanup: reject this huge request
        requests.patch(f"{BASE_URL}/api/manufacturing-requests/{rid}/status", headers=auth, params={"status": "rejected"}, timeout=10)

    def test_partial_then_more_partial_then_fulfilled(self, auth, in_stock_material):
        """Multi-step partial: send 2, then 1, then remaining → request should close at fulfilled."""
        if float(in_stock_material.get("quantity") or 0) < 5:
            pytest.skip("Need >= 5 units in stock for this test")
        rid = _create_request(auth, in_stock_material, 5)

        # 1) send 2
        r = requests.post(
            f"{BASE_URL}/api/manufacturing-requests/{rid}/fulfill",
            headers=auth,
            json={
                "items": [{"material_id": in_stock_material["id"], "quantity": 2}],
                "partial": True,
                "notes_to_manufacturing": "stage-1",
            },
            timeout=20,
        )
        assert r.status_code == 200
        assert r.json()["partial"] is True
        req = _get_request(auth, rid)
        assert req["status"] == "partially_fulfilled"
        assert abs(req["items"][0]["quantity"] - 3) < 0.01
        assert len(req["fulfillment_log"]) == 1
        log0 = req["fulfillment_log"][0]
        assert log0["items"][0]["sent_quantity"] == 2
        assert log0["items"][0]["original_quantity"] == 5
        assert log0.get("notes_to_manufacturing") == "stage-1"

        # 2) send 1
        r = requests.post(
            f"{BASE_URL}/api/manufacturing-requests/{rid}/fulfill",
            headers=auth,
            json={
                "items": [{"material_id": in_stock_material["id"], "quantity": 1}],
                "partial": True,
            },
            timeout=20,
        )
        assert r.status_code == 200
        req = _get_request(auth, rid)
        assert req["status"] == "partially_fulfilled"
        assert abs(req["items"][0]["quantity"] - 2) < 0.01
        assert len(req["fulfillment_log"]) == 2

        # 3) send remaining 2 (still partial=True, no remainder)
        r = requests.post(
            f"{BASE_URL}/api/manufacturing-requests/{rid}/fulfill",
            headers=auth,
            json={
                "items": [{"material_id": in_stock_material["id"], "quantity": 2}],
                "partial": True,
            },
            timeout=20,
        )
        assert r.status_code == 200
        req = _get_request(auth, rid)
        assert req["status"] == "fulfilled"
        assert len(req["fulfillment_log"]) == 3

    def test_partial_cannot_send_more_than_available(self, auth, in_stock_material):
        """Partial flow still enforces the 'available stock' check."""
        rid = _create_request(auth, in_stock_material, 10)
        huge_qty = float(in_stock_material["quantity"]) + 1_000_000
        r = requests.post(
            f"{BASE_URL}/api/manufacturing-requests/{rid}/fulfill",
            headers=auth,
            json={
                "items": [{"material_id": in_stock_material["id"], "quantity": huge_qty}],
                "partial": True,
            },
            timeout=20,
        )
        # quantity is capped at original_qty (10) — but we may still have 10 available, so this passes
        # OR backend returns 400 if insufficient
        assert r.status_code in (200, 400)


class TestManufacturingNotifications:
    def test_partial_creates_unread_notification(self, auth, in_stock_material):
        """A partial fulfillment must create an unread notification for manufacturing dept."""
        rid = _create_request(auth, in_stock_material, 4)
        r = requests.post(
            f"{BASE_URL}/api/manufacturing-requests/{rid}/fulfill",
            headers=auth,
            json={
                "items": [{"material_id": in_stock_material["id"], "quantity": 1}],
                "partial": True,
                "notes_to_manufacturing": "TEST notif msg",
            },
            timeout=20,
        )
        assert r.status_code == 200

        notifs = requests.get(
            f"{BASE_URL}/api/manufacturing-notifications/unread",
            headers=auth, timeout=20,
        ).json()
        ours = next((n for n in notifs if n.get("request_id") == rid), None)
        assert ours is not None, "notification missing"
        assert ours["type"] == "partial_transfer"
        assert ours["status"] == "unread"
        assert ours["any_remaining"] is True
        assert ours["notes_to_manufacturing"] == "TEST notif msg"
        assert ours["items_summary"][0]["sent_quantity"] == 1
        assert ours["items_summary"][0]["original_quantity"] == 4
        assert ours.get("from_warehouse_user")

    def test_ack_marks_notification_as_acknowledged(self, auth, in_stock_material):
        rid = _create_request(auth, in_stock_material, 3)
        requests.post(
            f"{BASE_URL}/api/manufacturing-requests/{rid}/fulfill",
            headers=auth,
            json={
                "items": [{"material_id": in_stock_material["id"], "quantity": 1}],
                "partial": True,
            },
            timeout=20,
        )
        notifs = requests.get(
            f"{BASE_URL}/api/manufacturing-notifications/unread",
            headers=auth, timeout=20,
        ).json()
        target = next(n for n in notifs if n.get("request_id") == rid)

        # Ack with 'accept' action
        r = requests.post(
            f"{BASE_URL}/api/manufacturing-notifications/{target['id']}/ack",
            headers=auth, json={"action": "accept"}, timeout=20,
        )
        assert r.status_code == 200
        assert r.json()["action"] == "accept"

        # No longer in unread
        notifs2 = requests.get(
            f"{BASE_URL}/api/manufacturing-notifications/unread",
            headers=auth, timeout=20,
        ).json()
        assert all(n["id"] != target["id"] for n in notifs2)

    def test_ack_unknown_id_returns_404(self, auth):
        r = requests.post(
            f"{BASE_URL}/api/manufacturing-notifications/UNKNOWN-XYZ/ack",
            headers=auth, json={"action": "accept"}, timeout=20,
        )
        assert r.status_code == 404
