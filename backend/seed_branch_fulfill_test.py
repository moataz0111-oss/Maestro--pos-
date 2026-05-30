"""Seed test scenario for Branch Order partial/reduced fulfillment.

Creates 3 manufactured products with LIMITED stock and one pending branch_request
that asks for MORE than available, so the factory must reduce/reject quantities.
"""
import asyncio
import os
import uuid
from datetime import datetime, timezone
from dotenv import load_dotenv
load_dotenv()
from motor.motor_asyncio import AsyncIOMotorClient

TENANT = "default"


async def main():
    c = AsyncIOMotorClient(os.environ['MONGO_URL'])
    db = c[os.environ['DB_NAME']]
    now = datetime.now(timezone.utc).isoformat()

    branch = await db.branches.find_one({"tenant_id": TENANT}, {"_id": 0})
    if not branch:
        print("No branch found"); return
    to_branch_id = branch["id"]
    to_branch_name = branch["name"]

    # Limited-stock products
    await db.manufactured_products.delete_many(
        {"tenant_id": TENANT, "name": {"$in": ["لحم برغر", "كراة مشروم", "ارز ريزو"]}}
    )
    burger = {"id": str(uuid.uuid4()), "tenant_id": TENANT, "name": "لحم برغر", "unit": "حبة",
              "piece_weight": 250, "piece_weight_unit": "غرام", "quantity": 30,
              "total_produced": 30, "transferred_quantity": 0,
              "unit_cost_after_waste": 6411.68, "production_cost": 192350, "recipe": [], "created_at": now}
    mushroom = {"id": str(uuid.uuid4()), "tenant_id": TENANT, "name": "كراة مشروم", "unit": "حبة",
                "piece_weight": 0, "quantity": 5, "total_produced": 5, "transferred_quantity": 0,
                "unit_cost_after_waste": 3403.19, "production_cost": 17015, "recipe": [], "created_at": now}
    rice = {"id": str(uuid.uuid4()), "tenant_id": TENANT, "name": "ارز ريزو", "unit": "صحن",
            "piece_weight": 0, "quantity": 12, "total_produced": 12, "transferred_quantity": 0,
            "unit_cost_after_waste": 1500, "production_cost": 18000, "recipe": [], "created_at": now}
    await db.manufactured_products.insert_many([burger, mushroom, rice])

    # One pending branch request asking MORE than available
    await db.branch_requests.delete_many({"tenant_id": TENANT, "request_number": 9001})
    items = [
        {"product_id": burger["id"], "product_name": "لحم برغر", "quantity": 100, "unit": "حبة",
         "cost_per_unit": 6411.68, "available_quantity": 30},
        {"product_id": mushroom["id"], "product_name": "كراة مشروم", "quantity": 20, "unit": "حبة",
         "cost_per_unit": 3403.19, "available_quantity": 5},
        {"product_id": rice["id"], "product_name": "ارز ريزو", "quantity": 30, "unit": "صحن",
         "cost_per_unit": 1500, "available_quantity": 12},
    ]
    total_cost = sum(i["quantity"] * i["cost_per_unit"] for i in items)
    req = {
        "id": str(uuid.uuid4()), "tenant_id": TENANT, "request_number": 9001,
        "to_branch_id": to_branch_id, "to_branch_name": to_branch_name,
        "requested_by": "kitchen-mgr", "requested_by_name": "مسؤول المطبخ",
        "status": "pending", "priority": "urgent",
        "items": items, "packaging_items": [], "total_cost": total_cost,
        "notes": "اختبار التنفيذ بكميات مخفّضة", "created_at": now,
    }
    await db.branch_requests.insert_one(req)
    print("Seeded 3 limited-stock products + pending branch_request #9001")
    print(f"  burger qty=30 (req 100), mushroom qty=5 (req 20), rice qty=12 (req 30)")
    print(f"  request_id={req['id']}  to_branch={to_branch_name}")


asyncio.run(main())
