"""Regression: Branch Orders — packaging persistence + cost + fulfill transfer.

User request (Feb 2026): packaging materials must be SAVED in the branch
request, INCLUDED in the total cost, and TRANSFERRED to the branch on fulfill.
Also a pre-existing 500 (ObjectId serialization) in
GET /branch-packaging-inventory was fixed.
"""
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[1]


def _inv_src():
    return (BACKEND / "routes" / "inventory_system.py").read_text(encoding="utf-8")


def _server_src():
    return (BACKEND / "server.py").read_text(encoding="utf-8")


def _func_body(src, marker):
    idx = src.find(marker)
    assert idx != -1, f"marker not found: {marker}"
    return src[idx:idx + 6000]


def test_create_branch_request_reads_packaging_items():
    body = _func_body(_inv_src(), "async def create_branch_request")
    assert 'request_data.get("packaging_items"' in body
    # لا يُرفض الطلب إذا كان يحتوي تغليف فقط
    assert "not items and not packaging_items" in body


def test_create_branch_request_costs_and_saves_packaging():
    body = _func_body(_inv_src(), "async def create_branch_request")
    assert "packaging_with_details" in body
    assert "total_cost += p_cost" in body
    assert '"packaging_items": packaging_with_details' in body


def test_fulfill_checks_packaging_availability():
    body = _func_body(_inv_src(), "async def fulfill_branch_request")
    assert 'for pitem in request.get("packaging_items", [])' in body


def test_fulfill_transfers_packaging_to_branch():
    body = _func_body(_inv_src(), "async def fulfill_branch_request")
    assert "db.branch_packaging_inventory" in body
    assert "transferred_to_branches" in body


def test_branch_packaging_inventory_endpoint_excludes_objectid():
    # الإصلاح: لا يُعاد _id (ObjectId) في server.py
    src = _server_src()
    idx = src.find("async def get_branch_packaging_inventory")
    body = src[idx:idx + 1200]
    assert 'find(query, {"_id": 0})' in body
    assert 'item.pop("_id"' not in body
