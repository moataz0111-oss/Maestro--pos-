"""Regression: a manufactured product that is OUT OF STOCK (quantity=0) and whose
yield can't be computed from the recipe must NOT report unit_cost = whole batch
cost. Before fix, denom fell back to 1.0 -> unit_cost = entire production_cost
(inflated ~hundreds of thousands), causing linked sale products to show massive
COGS and -2500% margins in reports. Fix: denom falls back to total_produced.

User-reported (Feb 2026, real client data): زنجر products linked to 'دجاج زنجر'
(0 stock) showed cost ~143,000/unit instead of the correct small value.
"""
import asyncio
import os
from dotenv import load_dotenv
load_dotenv()
import pytest
from motor.motor_asyncio import AsyncIOMotorClient
from routes.inventory_system import _enrich_unit_cost_fields


def _db():
    c = AsyncIOMotorClient(os.environ["MONGO_URL"])
    return c[os.environ["DB_NAME"]]


def test_zero_stock_no_recipe_uses_total_produced():
    async def run():
        db = _db()
        prod = {
            "name": "t", "unit": "قطعة", "piece_weight": 0, "piece_weight_unit": "غرام",
            "quantity": 0, "total_produced": 500,
            "production_cost": 596000, "raw_material_cost_after_waste": 596000, "recipe": [],
        }
        await _enrich_unit_cost_fields(db, prod)
        # 596000 / 500 = 1192, NOT 596000
        assert abs(prod["unit_cost_after_waste"] - 1192.0) < 0.01, prod["unit_cost_after_waste"]
    asyncio.get_event_loop().run_until_complete(run())


def test_recipe_yield_takes_priority_unchanged():
    async def run():
        db = _db()
        prod = {
            "name": "t", "unit": "قطعة", "piece_weight": 100, "piece_weight_unit": "غرام",
            "quantity": 300, "total_produced": 500,
            "production_cost": 596000, "raw_material_cost_after_waste": 596000,
            "recipe": [{"raw_material_id": "r", "quantity": 50, "unit": "كغم"}],
        }
        await _enrich_unit_cost_fields(db, prod)
        # recipe yield = 50kg / 100g = 500 -> 596000/500 = 1192 (recipe-based, unchanged)
        assert abs(prod["computed_yield"] - 500.0) < 0.01
        assert abs(prod["unit_cost_after_waste"] - 1192.0) < 0.01
    asyncio.get_event_loop().run_until_complete(run())


def test_in_stock_with_quantity_only():
    async def run():
        db = _db()
        # no recipe yield, but has total_produced -> use it (not current quantity)
        prod = {
            "name": "t", "unit": "قطعة", "piece_weight": 0, "piece_weight_unit": "غرام",
            "quantity": 120, "total_produced": 480,
            "production_cost": 480000, "raw_material_cost_after_waste": 480000, "recipe": [],
        }
        await _enrich_unit_cost_fields(db, prod)
        # 480000 / 480 = 1000 (total_produced preferred over current quantity 120)
        assert abs(prod["unit_cost_after_waste"] - 1000.0) < 0.01, prod["unit_cost_after_waste"]
    asyncio.get_event_loop().run_until_complete(run())
