"""Seed a multi-cashier expense-attribution scenario to verify NO cross-cashier mixing.

Scenario (branch=الفرع الرئيسي, business_date=today):
- Cashier A "كاشير أ" opens a shift, records expenses 10,000 + 2,000 = 12,000
- Cashier B "كاشير ب" opens a shift (SAME branch/day), records expenses 5,000
- One LEGACY expense (no shift_id) by Cashier A of 3,000 (tests created_by fallback)

Expected (canonical per-shift rule):
- Cashier A shift total_expenses = 12,000 + 3,000(legacy) = 15,000
- Cashier B shift total_expenses = 5,000
- NO shift should show the other's expenses. Branch daily total = 20,000.
"""
import asyncio, os, uuid
from datetime import datetime, timezone, timedelta
from motor.motor_asyncio import AsyncIOMotorClient

MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "test_database")
TENANT = "default"
BRANCH_ID = "76f56acc-6948-4a2f-bbf4-feccbddea88f"

def iraq_date():
    return (datetime.now(timezone.utc) + timedelta(hours=3)).strftime("%Y-%m-%d")

async def main():
    client = AsyncIOMotorClient(MONGO_URL)
    db = client[DB_NAME]
    bd = iraq_date()
    now = datetime.now(timezone.utc).isoformat()

    # clean previous test artifacts
    await db.shifts.delete_many({"cashier_name": {"$in": ["كاشير أ اختبار", "كاشير ب اختبار"]}})
    await db.expenses.delete_many({"description": {"$regex": "^EXP-ATTR-TEST"}})

    a_id, b_id = "expattr-cashier-a", "expattr-cashier-b"
    a_shift, b_shift = "expattr-shift-a", "expattr-shift-b"

    for uid, name in [(a_id, "كاشير أ اختبار"), (b_id, "كاشير ب اختبار")]:
        await db.users.update_one({"id": uid}, {"$set": {
            "id": uid, "email": f"{uid}@maestroegp.com", "username": uid, "full_name": name,
            "role": "cashier", "branch_id": BRANCH_ID, "tenant_id": TENANT,
            "is_active": True, "permissions": ["expenses"],
            "created_at": now,
        }}, upsert=True)

    for sid, uid, name in [(a_shift, a_id, "كاشير أ اختبار"), (b_shift, b_id, "كاشير ب اختبار")]:
        await db.shifts.update_one({"id": sid}, {"$set": {
            "id": sid, "tenant_id": TENANT, "branch_id": BRANCH_ID,
            "cashier_id": uid, "cashier_name": name, "status": "open",
            "opening_cash": 0, "opening_balance": 0,
            "started_at": now, "opened_at": now, "business_date": bd, "created_at": now,
        }}, upsert=True)

    def exp(desc, amount, uid, name, sid):
        return {"id": str(uuid.uuid4()), "tenant_id": TENANT, "branch_id": BRANCH_ID,
                "category": "other", "description": desc, "amount": amount,
                "payment_method": "cash", "business_date": bd, "date": bd,
                "shift_id": sid, "cashier_id": uid, "created_by": uid,
                "created_by_name": name, "created_at": now}

    docs = [
        exp("EXP-ATTR-TEST A1", 10000, a_id, "كاشير أ اختبار", a_shift),
        exp("EXP-ATTR-TEST A2", 2000, a_id, "كاشير أ اختبار", a_shift),
        exp("EXP-ATTR-TEST B1", 5000, b_id, "كاشير ب اختبار", b_shift),
    ]
    # legacy expense by A (no shift_id) → must attribute to A's shift via created_by fallback
    legacy = exp("EXP-ATTR-TEST A-LEGACY", 3000, a_id, "كاشير أ اختبار", a_shift)
    legacy["shift_id"] = None
    docs.append(legacy)
    await db.expenses.insert_many(docs)

    print(f"Seeded. business_date={bd}")
    print(f"Cashier A shift={a_shift} (expected total_expenses=15000)")
    print(f"Cashier B shift={b_shift} (expected total_expenses=5000)")
    print(f"Branch daily total expected = 20000")
    client.close()

if __name__ == "__main__":
    asyncio.run(main())
