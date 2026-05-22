"""Test the new DELETE /api/purchases-new/{id} endpoint.

Allows correcting wrong invoices (e.g., a typo creating a 73M IQD invoice).
Constraints:
  - Cannot delete invoices that were already sent to warehouse (would break stock).
  - Decrements supplier's total_purchases by the deleted amount.
  - Logs the action in audit_logs.
"""
import asyncio
from unittest.mock import AsyncMock, MagicMock, patch

import pytest


def _mock_db(purchase, has_supplier=True):
    db = MagicMock()
    db.purchases_new = MagicMock()
    db.purchases_new.find_one = AsyncMock(return_value=purchase)
    db.purchases_new.delete_one = AsyncMock(return_value=None)
    db.suppliers = MagicMock()
    db.suppliers.update_one = AsyncMock(return_value=None)
    db.audit_logs = MagicMock()
    db.audit_logs.insert_one = AsyncMock(return_value=None)
    return db


def test_delete_pending_purchase_decrements_supplier():
    purchase = {
        "id": "p1",
        "purchase_number": 5,
        "supplier_id": "s1",
        "supplier_name": "سيد التوابل",
        "total_amount": 73_733_048,
        "status": "pending",
    }
    db = _mock_db(purchase)

    with patch("routes.inventory_system.get_db", return_value=db):
        from routes.inventory_system import delete_purchase
        result = asyncio.run(delete_purchase("p1", current_user={"id": "u1"}))

    # Supplier total_purchases decremented by the full amount
    sup_call = db.suppliers.update_one.call_args
    assert sup_call[0][0] == {"id": "s1"}
    assert sup_call[0][1] == {"$inc": {"total_purchases": -73_733_048.0}}

    # Invoice deleted
    assert db.purchases_new.delete_one.called
    assert db.purchases_new.delete_one.call_args[0][0] == {"id": "p1"}

    # Audit logged
    audit = db.audit_logs.insert_one.call_args[0][0]
    assert audit["action"] == "delete_purchase"
    assert audit["total_amount"] == 73_733_048
    assert audit["deleted_by"] == "u1"

    # Response shape
    assert result["deleted_amount"] == 73_733_048


def test_delete_blocked_when_sent_to_warehouse():
    from fastapi import HTTPException

    purchase = {
        "id": "p2",
        "purchase_number": 6,
        "supplier_id": "s2",
        "total_amount": 50000,
        "status": "sent_to_warehouse",
    }
    db = _mock_db(purchase)

    with patch("routes.inventory_system.get_db", return_value=db):
        from routes.inventory_system import delete_purchase
        with pytest.raises(HTTPException) as exc:
            asyncio.run(delete_purchase("p2", current_user={"id": "u1"}))
        assert exc.value.status_code == 400
        assert "أُرسلت للمخزن" in str(exc.value.detail)


def test_delete_returns_404_when_missing():
    from fastapi import HTTPException

    db = MagicMock()
    db.purchases_new = MagicMock()
    db.purchases_new.find_one = AsyncMock(return_value=None)

    with patch("routes.inventory_system.get_db", return_value=db):
        from routes.inventory_system import delete_purchase
        with pytest.raises(HTTPException) as exc:
            asyncio.run(delete_purchase("missing", current_user={"id": "u1"}))
        assert exc.value.status_code == 404
