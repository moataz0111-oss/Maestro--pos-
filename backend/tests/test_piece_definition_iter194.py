"""Feature: piece definition for count units. When a manufactured product's
piece_weight_unit is a COUNT unit (قطعة/شريحة/علبة...) that has no intrinsic
weight, the user defines the real weight via piece_def_value + piece_def_unit
(e.g., 1 قطعة = 120 غرام). _enrich_unit_cost_fields must use this definition to
compute yield/unit cost accurately, preventing inflated costs.

User-reported (Feb 2026): selecting قطعة as weight unit caused calculation errors.
"""
import asyncio
import os
from dotenv import load_dotenv
load_dotenv()
from motor.motor_asyncio import AsyncIOMotorClient
from routes.inventory_system import _enrich_unit_cost_fields


def _db():
    return AsyncIOMotorClient(os.environ["MONGO_URL"])[os.environ["DB_NAME"]]


def test_piece_definition_drives_yield_and_cost():
    async def run():
        db = _db()
        # 60kg meat batch, cost 60000; piece unit = قطعة (count), defined as 120g/piece
        p = {
            "name": "t", "unit": "قطعة", "piece_weight": 1, "piece_weight_unit": "قطعة",
            "piece_def_value": 120, "piece_def_unit": "غرام",
            "quantity": 0, "total_produced": 0,
            "production_cost": 60000, "raw_material_cost_after_waste": 60000,
            "recipe": [{"raw_material_id": "rm1", "quantity": 60, "unit": "كغم"}],
        }
        await _enrich_unit_cost_fields(db, p)
        # yield = 60000g / 120g = 500 ; unit_cost = 60000 / 500 = 120
        assert abs(p["computed_yield"] - 500.0) < 0.01, p["computed_yield"]
        assert abs(p["unit_cost_after_waste"] - 120.0) < 0.01, p["unit_cost_after_waste"]
    asyncio.get_event_loop().run_until_complete(run())


def test_piece_definition_kg_unit():
    async def run():
        db = _db()
        p = {
            "name": "t", "unit": "قطعة", "piece_weight": 1, "piece_weight_unit": "شريحة",
            "piece_def_value": 0.2, "piece_def_unit": "كغم",  # 1 شريحة = 0.2 كغم = 200g
            "quantity": 0, "total_produced": 0,
            "production_cost": 60000, "raw_material_cost_after_waste": 60000,
            "recipe": [{"raw_material_id": "rm1", "quantity": 60, "unit": "كغم"}],
        }
        await _enrich_unit_cost_fields(db, p)
        # yield = 60000g / 200g = 300 ; unit_cost = 60000/300 = 200
        assert abs(p["computed_yield"] - 300.0) < 0.01, p["computed_yield"]
        assert abs(p["unit_cost_after_waste"] - 200.0) < 0.01, p["unit_cost_after_waste"]
    asyncio.get_event_loop().run_until_complete(run())


def test_no_definition_falls_back_unchanged():
    async def run():
        db = _db()
        # real weight unit -> definition ignored, normal behavior
        p = {
            "name": "t", "unit": "قطعة", "piece_weight": 120, "piece_weight_unit": "غرام",
            "quantity": 0, "total_produced": 0,
            "production_cost": 60000, "raw_material_cost_after_waste": 60000,
            "recipe": [{"raw_material_id": "rm1", "quantity": 60, "unit": "كغم"}],
        }
        await _enrich_unit_cost_fields(db, p)
        assert abs(p["computed_yield"] - 500.0) < 0.01, p["computed_yield"]
        assert abs(p["unit_cost_after_waste"] - 120.0) < 0.01, p["unit_cost_after_waste"]
    asyncio.get_event_loop().run_until_complete(run())
