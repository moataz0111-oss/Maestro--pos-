"""Seed captain-feature test data: cashier with open shift + captain linked + 1 held order."""
import asyncio, os, uuid, bcrypt
from datetime import datetime, timezone
from motor.motor_asyncio import AsyncIOMotorClient

async def main():
    db = AsyncIOMotorClient(os.environ["MONGO_URL"])[os.environ["DB_NAME"]]
    tenant = "default"
    branch = await db.branches.find_one({"tenant_id": tenant}, {"_id": 0, "id": 1})
    branch_id = branch["id"] if branch else None
    now = datetime.now(timezone.utc).isoformat()
    bdate = now[:10]

    # captain user
    cap = await db.users.find_one({"email": "cap1@maestroegp.com"})
    if not cap:
        pw = bcrypt.hashpw("cap123".encode(), bcrypt.gensalt()).decode()
        cap_id = str(uuid.uuid4())
        await db.users.insert_one({"id": cap_id, "username": "captain1", "email": "cap1@maestroegp.com",
            "password": pw, "full_name": "كابتن أحمد", "role": "captain", "tenant_id": tenant,
            "is_active": True, "branch_id": None, "created_at": now})
    else:
        cap_id = cap["id"]

    # cashier user
    cashier = await db.users.find_one({"role": "cashier", "tenant_id": tenant})
    if not cashier:
        pw = bcrypt.hashpw("cash123".encode(), bcrypt.gensalt()).decode()
        cashier_id = str(uuid.uuid4())
        await db.users.insert_one({"id": cashier_id, "username": "cashier1", "email": "cashier1@maestroegp.com",
            "password": pw, "full_name": "كاشير سالم", "role": "cashier", "tenant_id": tenant,
            "is_active": True, "branch_id": branch_id, "created_at": now})
        cashier_name = "كاشير سالم"
    else:
        cashier_id = cashier["id"]
        cashier_name = cashier.get("full_name", "كاشير")

    # close any stale open shifts for this cashier, then open fresh one
    await db.shifts.update_many({"cashier_id": cashier_id, "status": "open"}, {"$set": {"status": "closed"}})
    shift_id = str(uuid.uuid4())
    await db.shifts.insert_one({"id": shift_id, "tenant_id": tenant, "cashier_id": cashier_id,
        "cashier_name": cashier_name, "status": "open", "role": "cashier", "opening_cash": 0,
        "started_at": now, "business_date": bdate, "branch_id": branch_id, "linked_captains": []})

    # link captain
    await db.captain_shift_links.update_many({"captain_id": cap_id, "active": True}, {"$set": {"active": False}})
    await db.captain_shift_links.insert_one({"id": str(uuid.uuid4()), "captain_id": cap_id,
        "captain_name": "كابتن أحمد", "shift_id": shift_id, "cashier_id": cashier_id,
        "cashier_name": cashier_name, "branch_id": branch_id, "active": True, "linked_at": now,
        "tenant_id": tenant})
    await db.shifts.update_one({"id": shift_id}, {"$push": {"linked_captains": {"captain_id": cap_id, "captain_name": "كابتن أحمد", "linked_at": now}}})

    # one held captain order
    await db.orders.delete_many({"_seed": "captain_demo"})
    onum = (await db.orders.find_one(sort=[("order_number", -1)]) or {}).get("order_number", 0) + 1
    await db.orders.insert_one({"id": str(uuid.uuid4()), "tenant_id": tenant, "order_number": onum,
        "order_type": "takeaway", "payment_method": "cash", "payment_status": "paid", "status": "completed",
        "total": 12000, "subtotal": 12000, "items": [{"product_name": "برغر", "quantity": 1, "price": 12000}],
        "cashier_id": cashier_id, "captain_id": cap_id, "captain_name": "كابتن أحمد",
        "captain_cash_status": "held", "shift_id": shift_id, "branch_id": branch_id,
        "business_date": bdate, "created_at": now, "_seed": "captain_demo"})

    print(f"OK: shift={shift_id} cashier={cashier_id} captain={cap_id} held_order=#{onum}")

asyncio.run(main())
