"""Feature: fulfill_branch_request must support adjusted/reduced quantities per
product, record reduced_items, and notify the kitchen manager
(branch_request_notifications). User-reported (Feb 2026): execute button rejected
the whole order on insufficient stock; factory should be able to reduce/reject
per product and notify the kitchen.
"""
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[1]


def _src():
    return (BACKEND / "routes" / "inventory_system.py").read_text(encoding="utf-8")


def _fulfill_body():
    src = _src()
    idx = src.find("async def fulfill_branch_request")
    assert idx != -1
    end = src.find("async def get_unread_branch_request_notifications")
    assert end != -1
    return src[idx:end]


def test_fulfill_accepts_payload_and_user():
    body = _fulfill_body()
    assert "payload: Optional[dict] = None" in body
    assert "current_user: dict = Depends(get_current_user)" in body
    assert 'payload.get("items")' in body
    assert 'payload.get("packaging_items")' in body
    assert 'payload.get("notes_to_kitchen")' in body


def test_fulfill_caps_at_requested_and_tracks_reductions():
    body = _fulfill_body()
    # cannot send more than requested
    assert "if send_qty > original_qty:" in body
    assert "send_qty = original_qty" in body
    # reductions tracked (including rejected==0)
    assert "reduced_items" in body
    assert '"rejected": send_qty <= 0' in body
    # rejected (0) items are skipped from transfer
    assert "if send_qty <= 0:" in body
    assert "continue" in body


def test_fulfill_blocks_when_all_rejected():
    body = _fulfill_body()
    assert "لا توجد كميات للتنفيذ" in body


def test_fulfill_uses_adjusted_lists_for_transfer():
    body = _fulfill_body()
    # product + packaging transfer loops iterate the adjusted lists
    assert "for item in items_to_fulfill:" in body
    assert "for pitem in pkg_to_fulfill:" in body


def test_fulfill_stores_reduction_and_notifies_kitchen():
    body = _fulfill_body()
    assert '"reduced_items": reduced_items' in body
    assert '"fulfillment_note": notes_to_kitchen' in body
    # notification only when there are reductions
    assert "if reduced_items:" in body
    assert "branch_request_notifications.insert_one" in body
    assert '"type": "branch_order_reduced"' in body
    assert '"to_branch_id": to_branch_id' in body


def test_get_branch_requests_refreshes_available_quantity():
    src = _src()
    idx = src.find("async def get_branch_requests")
    body = src[idx:idx + 2500]
    assert 'it["available_quantity"] = qty_by_id.get(pid, 0)' in body
    assert "manufactured_products.find" in body


def test_notification_endpoints_exist():
    src = _src()
    assert '@router.get("/branch-request-notifications/unread")' in src
    assert '@router.post("/branch-request-notifications/{notification_id}/ack")' in src
