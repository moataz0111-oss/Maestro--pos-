"""Test POST /api/advances/{advance_id}/deduct-installment + validation cases."""
import os, asyncio, uuid
from datetime import datetime, timezone
import httpx
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), '..', '.env'))
MONGO_URL = os.environ['MONGO_URL']
DB_NAME = os.environ['DB_NAME']
BASE = "http://localhost:8001/api"


async def main():
    client = AsyncIOMotorClient(MONGO_URL)
    db = client[DB_NAME]

    async with httpx.AsyncClient(timeout=30) as c:
        r = await c.post(f"{BASE}/auth/login", json={"email": "admin@maestroegp.com", "password": "admin123"})
        token = r.json()["token"]
        H = {"Authorization": f"Bearer {token}"}

        # ensure seeded advance exists for 'موظف سلفة سابقة' on 2026-05 w/ remaining 100000
        emp = await db.employees.find_one({"tenant_id": "default", "name": "موظف سلفة سابقة"}, {"_id": 0})
        assert emp, "seeded employee missing"
        adv = await db.advances.find_one({"tenant_id": "default", "employee_id": emp["id"], "date": {"$regex": "^2026-05"}}, {"_id": 0})
        if not adv or adv.get("remaining_amount") != 100000:
            # reset to 100000
            adv_id = adv["id"] if adv else str(uuid.uuid4())
            if not adv:
                await db.advances.insert_one({
                    "id": adv_id, "tenant_id": "default", "employee_id": emp["id"],
                    "employee_name": emp["name"], "amount": 100000, "remaining_amount": 100000,
                    "deducted_amount": 0, "deduction_months": 1, "monthly_deduction": 100000,
                    "status": "approved", "reason": "test", "date": "2026-05-10",
                    "created_by": "seed", "created_at": datetime.now(timezone.utc).isoformat(),
                })
            else:
                await db.advances.update_one({"id": adv_id}, {"$set": {"remaining_amount": 100000, "deducted_amount": 0, "status": "approved"}})
            adv = await db.advances.find_one({"id": adv_id}, {"_id": 0})
        # clean any prior installments to keep deterministic
        await db.advance_installments.delete_many({"advance_id": adv["id"]})
        await db.advances.update_one({"id": adv["id"]}, {"$set": {"remaining_amount": 100000, "deducted_amount": 0, "status": "approved"}})

        # 1) zero amount -> 400
        r1 = await c.post(f"{BASE}/advances/{adv['id']}/deduct-installment", headers=H,
                          json={"month": "2026-06", "amount": 0, "notes": ""})
        print("ZERO:", r1.status_code, r1.json().get("detail", ""))
        assert r1.status_code == 400

        # 2) missing month -> 400
        r2 = await c.post(f"{BASE}/advances/{adv['id']}/deduct-installment", headers=H,
                          json={"month": "", "amount": 30000})
        print("NO MONTH:", r2.status_code, r2.json().get("detail", ""))
        assert r2.status_code == 400

        # 3) valid 30k -> 200, remaining 70000
        r3 = await c.post(f"{BASE}/advances/{adv['id']}/deduct-installment", headers=H,
                          json={"month": "2026-06", "amount": 30000, "notes": "اختبار"})
        print("OK:", r3.status_code, r3.json())
        assert r3.status_code == 200
        assert r3.json()["remaining_amount"] == 70000

        # verify in DB
        adv2 = await db.advances.find_one({"id": adv["id"]}, {"_id": 0})
        assert adv2["remaining_amount"] == 70000, adv2
        assert adv2["deducted_amount"] == 30000, adv2

        # 4) amount > remaining -> 400
        r4 = await c.post(f"{BASE}/advances/{adv['id']}/deduct-installment", headers=H,
                          json={"month": "2026-06", "amount": 999999, "notes": ""})
        print("OVER:", r4.status_code, r4.json().get("detail", ""))
        assert r4.status_code == 400

        # reset for the UI test
        await db.advance_installments.delete_many({"advance_id": adv["id"]})
        await db.advances.update_one({"id": adv["id"]}, {"$set": {"remaining_amount": 100000, "deducted_amount": 0, "status": "approved"}})
        print("\nALL DEDUCT ASSERTIONS PASSED ✅  (advance reset to 100000 for frontend test)")


if __name__ == "__main__":
    asyncio.run(main())
