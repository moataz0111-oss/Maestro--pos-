"""Verify produce() deducts raw materials even for LEGACY manufacturing_inventory
records keyed only by material_id (the reported bug)."""
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

    # Two raw materials in manufacturing inventory:
    #  - "لحم" keyed ONLY by material_id (legacy, would previously NOT deduct)
    #  - "خبز" keyed ONLY by raw_material_id (newer)
    lahm_id = "rm-lahm-001"
    khubz_id = "rm-khubz-001"
    await db.manufacturing_inventory.delete_many({"material_id": {"$in": [lahm_id, khubz_id]}})
    await db.manufacturing_inventory.delete_many({"raw_material_id": {"$in": [lahm_id, khubz_id]}})
    await db.manufacturing_inventory.insert_many([
        {"id": str(uuid.uuid4()), "material_id": lahm_id, "material_name": "لحم",
         "quantity": 50, "unit": "كغم", "cost_per_unit": 12000, "last_updated": now},  # legacy: only material_id
        {"id": str(uuid.uuid4()), "raw_material_id": khubz_id, "raw_material_name": "خبز",
         "quantity": 1000, "unit": "حبة", "cost_per_unit": 250, "last_updated": now},  # only raw_material_id
    ])

    # Manufactured product: 1 burger = 0.2 كغم لحم + 1 خبز (per-unit / legacy mode, no piece_weight)
    pid = str(uuid.uuid4())
    await db.manufactured_products.delete_many({"id": pid})
    await db.manufactured_products.insert_one({
        "id": pid, "tenant_id": TENANT, "name": "برغر اختبار", "unit": "حبة",
        "piece_weight": 0, "quantity": 0, "total_produced": 0,
        "recipe": [
            {"raw_material_id": lahm_id, "raw_material_name": "لحم", "quantity": 0.2, "unit": "كغم", "cost_per_unit": 12000, "waste_percentage": 0},
            {"raw_material_id": khubz_id, "raw_material_name": "خبز", "quantity": 1, "unit": "حبة", "cost_per_unit": 250, "waste_percentage": 0},
        ],
        "raw_material_cost": 2650, "raw_material_cost_after_waste": 2650,
        "created_at": now,
    })
    print("SEED done. product_id =", pid)
    print("Before: لحم=50 كغم (material_id only), خبز=1000 حبة")

asyncio.run(main())
