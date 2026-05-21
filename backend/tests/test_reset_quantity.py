"""Test the manual quantity reset endpoint for manufactured products.

Verifies that POST /api/manufactured-products/{id}/reset-quantity
correctly zeroes out total_produced, transferred_quantity, and quantity.
"""
import asyncio
from unittest.mock import AsyncMock, MagicMock, patch

import pytest


def _mock_db_with_product(product):
    db = MagicMock()
    db.manufactured_products = MagicMock()
    db.manufactured_products.find_one = AsyncMock(return_value=product)
    db.manufactured_products.update_one = AsyncMock(return_value=None)
    db.manufacturing_movements = MagicMock()
    db.manufacturing_movements.insert_one = AsyncMock(return_value=None)
    return db


def test_reset_quantity_zeroes_all_fields():
    """The endpoint must $set quantity/total_produced/transferred_quantity to 0."""
    product = {
        "id": "p1",
        "name": "أرز ريزو",
        "unit": "قطعة",
        "total_produced": 2199,
        "transferred_quantity": 0,
        "quantity": 2199,
    }
    db = _mock_db_with_product(product)

    with patch("routes.inventory_system.get_db", return_value=db):
        from routes.inventory_system import reset_product_quantity
        result = asyncio.run(reset_product_quantity("p1", current_user={"id": "u1"}))

    assert db.manufactured_products.update_one.called
    set_ops = db.manufactured_products.update_one.call_args[0][1]["$set"]
    assert set_ops["quantity"] == 0
    assert set_ops["total_produced"] == 0
    assert set_ops["transferred_quantity"] == 0

    assert db.manufacturing_movements.insert_one.called
    movement = db.manufacturing_movements.insert_one.call_args[0][0]
    assert movement["type"] == "reset_quantity"
    assert movement["product_id"] == "p1"
    assert movement["previous_quantity"] == 2199

    assert result["previous"]["quantity"] == 2199
    assert result["previous"]["total_produced"] == 2199


def test_reset_quantity_404_when_product_missing():
    """Should raise HTTPException 404 when product not found."""
    from fastapi import HTTPException

    db = MagicMock()
    db.manufactured_products = MagicMock()
    db.manufactured_products.find_one = AsyncMock(return_value=None)

    with patch("routes.inventory_system.get_db", return_value=db):
        from routes.inventory_system import reset_product_quantity
        with pytest.raises(HTTPException) as exc:
            asyncio.run(reset_product_quantity("missing", current_user={"id": "u1"}))
        assert exc.value.status_code == 404
