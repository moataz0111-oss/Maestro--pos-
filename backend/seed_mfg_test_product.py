"""Seed a manufactured product to verify BranchOrders unit-cost fix & unit selection."""
import asyncio, os, uuid
from datetime import datetime, timezone
from dotenv import load_dotenv
load_dotenv()
from motor.motor_asyncio import AsyncIOMotorClient

TENANT = "default"


async def main():
    c = AsyncIOMotorClient(os.environ['MONGO_URL'])
    db = c[os.environ['DB_NAME']]
    now = datetime.now(timezone.utc).isoformat()
    await db.manufactured_products.delete_many({"tenant_id": TENANT, "name": {"$in": ["لحم برغر", "كراة مشروم"]}})
    products = [
        {
            "id": str(uuid.uuid4()), "tenant_id": TENANT,
            "name": "لحم برغر", "unit": "حبة",
            "piece_weight": 250, "piece_weight_unit": "غرام",
            "raw_material_cost": 641168, "raw_material_cost_after_waste": 641168,
            "production_cost": 641168, "cost_before_waste": 641168,
            "total_produced": 100, "transferred_quantity": 0, "quantity": 100,
            "recipe": [], "created_at": now,
        },
        {
            "id": str(uuid.uuid4()), "tenant_id": TENANT,
            "name": "كراة مشروم", "unit": "حبة",
            "piece_weight": 0, "piece_weight_unit": "غرام",
            "raw_material_cost": 340319, "raw_material_cost_after_waste": 340319,
            "production_cost": 340319, "cost_before_waste": 340319,
            "total_produced": 100, "transferred_quantity": 0, "quantity": 100,
            "recipe": [], "created_at": now,
        },
    ]
    await db.manufactured_products.insert_many(products)
    print("Seeded manufactured products: لحم برغر (250غ/حبة), كراة مشروم")
    print("Expected unit cost لحم برغر = 641168/100 = 6411.68 IQD/حبة")

asyncio.run(main())
