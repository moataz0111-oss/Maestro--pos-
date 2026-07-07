"""Seed: owner + cashier both have OPEN shifts in same branch.
Verifies close dialog targets the CASHIER shift (802,750) not owner's own (79,500).
Idempotent: cleans previous closefix-* docs each run.
"""
import asyncio, os, uuid
from datetime import datetime, timezone, timedelta
from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient
import bcrypt

load_dotenv(os.path.join(os.path.dirname(__file__), ".env"))
MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "test_database")
TENANT = "default"
BRANCH_ID = "76f56acc-6948-4a2f-bbf4-feccbddea88f"

def iraq_date():
    return (datetime.now(timezone.utc) + timedelta(hours=3)).strftime("%Y-%m-%d")

async def main():
    client = AsyncIOMotorClient(MONGO_URL)
    db = client[DB_NAME]
    now = datetime.now(timezone.utc)
    bd = iraq_date()

    # cleanup
    await db.shifts.delete_many({"id": {"$regex": "^closefix-"}})
    await db.orders.delete_many({"id": {"$regex": "^closefix-"}})

    admin = await db.users.find_one({"email": "admin@maestroegp.com"}, {"_id": 0, "id": 1, "full_name": 1})

    # cashier user
    cashier = await db.users.find_one({"email": "closefix-cashier@maestroegp.com"}, {"_id": 0, "id": 1})
    if not cashier:
        cashier = {"id": str(uuid.uuid4())}
        await db.users.insert_one({
            "id": cashier["id"], "username": "closefix_cashier",
            "email": "closefix-cashier@maestroegp.com",
            "password": bcrypt.hashpw(b"test1234", bcrypt.gensalt()).decode(),
            "full_name": "احمد اختبار", "role": "cashier",
            "branch_id": BRANCH_ID, "tenant_id": TENANT,
            "is_active": True, "permissions": [],
            "created_at": now.isoformat(),
        })

    # OWNER shift (OLDER — starts 3h ago) with one small order 79,500
    owner_shift_id = "closefix-shift-owner"
    await db.shifts.insert_one({
        "id": owner_shift_id, "tenant_id": TENANT, "branch_id": BRANCH_ID,
        "cashier_id": admin["id"], "cashier_name": admin.get("full_name") or "مدير النظام",
        "started_at": (now - timedelta(hours=3)).isoformat(),
        "opened_at": (now - timedelta(hours=3)).isoformat(),
        "status": "open", "opening_balance": 0, "opening_cash": 0,
        "business_date": bd, "created_at": now.isoformat(),
    })
    await db.orders.insert_one({
        "id": "closefix-order-owner-1", "order_number": 990001, "order_type": "takeaway",
        "tenant_id": TENANT, "branch_id": BRANCH_ID, "shift_id": owner_shift_id,
        "cashier_id": admin["id"], "status": "completed", "payment_method": "cash",
        "total": 79500, "total_cost": 0, "discount": 0, "items": [],
        "business_date": bd, "created_at": (now - timedelta(hours=2, minutes=50)).isoformat(),
    })

    # CASHIER shift (NEWER — starts 2h ago) with orders totaling 802,750
    cashier_shift_id = "closefix-shift-cashier"
    await db.shifts.insert_one({
        "id": cashier_shift_id, "tenant_id": TENANT, "branch_id": BRANCH_ID,
        "cashier_id": cashier["id"], "cashier_name": "احمد اختبار",
        "started_at": (now - timedelta(hours=2)).isoformat(),
        "opened_at": (now - timedelta(hours=2)).isoformat(),
        "status": "open", "opening_balance": 0, "opening_cash": 0,
        "business_date": bd, "created_at": now.isoformat(),
    })
    for i, amt in enumerate([500000, 300000, 2750]):
        await db.orders.insert_one({
            "id": f"closefix-order-cashier-{i+1}", "order_number": 990010 + i, "order_type": "takeaway",
            "tenant_id": TENANT, "branch_id": BRANCH_ID, "shift_id": cashier_shift_id,
            "cashier_id": cashier["id"], "status": "completed", "payment_method": "cash",
            "total": amt, "total_cost": 0, "discount": 0, "items": [],
            "business_date": bd, "created_at": (now - timedelta(hours=1, minutes=30 - i)).isoformat(),
        })

    print(f"Seeded: owner shift {owner_shift_id} (79,500 — OLDER)")
    print(f"        cashier shift {cashier_shift_id} 'احمد اختبار' (802,750 — newer)")
    print("Expected: manager summary WITHOUT shift_id → cashier shift (802,750, احمد اختبار)")
    print("          summary WITH shift_id=closefix-shift-owner → owner shift (79,500)")

asyncio.run(main())
