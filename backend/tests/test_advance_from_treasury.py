"""تحقق: صرف السلفة يُسحب من خزينة المالك (owner_withdrawals) وليس مصروف نقدي (expenses)."""
import os, asyncio, uuid
from datetime import datetime, timezone
import httpx
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), '..', '.env'))
MONGO_URL = os.environ['MONGO_URL']
DB_NAME = os.environ['DB_NAME']
BASE = "http://localhost:8001/api"
BRANCH_ID = "76f56acc-6948-4a2f-bbf4-feccbddea88f"


async def main():
    client = AsyncIOMotorClient(MONGO_URL)
    db = client[DB_NAME]

    # login
    async with httpx.AsyncClient(timeout=30) as c:
        r = await c.post(f"{BASE}/auth/login", json={"email": "admin@maestroegp.com", "password": "admin123"})
        token = r.json()["token"]
        H = {"Authorization": f"Bearer {token}"}

        # seed employee with branch
        emp_id = str(uuid.uuid4())
        await db.employees.insert_one({
            "id": emp_id, "tenant_id": "default", "name": "موظف اختبار السلفة",
            "phone": "", "branch_id": BRANCH_ID, "salary": 600000, "salary_type": "monthly",
            "is_active": True, "position": "عامل", "hire_date": "2026-01-01",
            "created_at": datetime.now(timezone.utc).isoformat(),
        })

        try:
            # 1) advance with absurd amount -> expect 400 (treasury insufficient)
            r1 = await c.post(f"{BASE}/advances", headers=H, json={"employee_id": emp_id, "amount": 999999999999, "deduction_months": 1})
            print("INSUFFICIENT status:", r1.status_code, "-", r1.json().get("detail", "")[:90])
            assert r1.status_code == 400, "should block when treasury insufficient"

            # 2) deposit into owner safe for the branch
            await db.owner_deposits.insert_one({
                "id": str(uuid.uuid4()), "tenant_id": "default", "branch_id": BRANCH_ID,
                "amount": 200000, "date": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
                "beneficiary": "TEST_SEED", "description": "test seed deposit",
                "created_at": datetime.now(timezone.utc).isoformat(),
            })

            # count expenses & withdrawals before
            exp_before = await db.expenses.count_documents({"employee_id": emp_id, "category": "advance"})
            wd_before = await db.owner_withdrawals.count_documents({"employee_id": emp_id, "category": "advance"})

            # 3) advance now -> expect 200
            r2 = await c.post(f"{BASE}/advances", headers=H, json={"employee_id": emp_id, "amount": 50000, "deduction_months": 1, "reason": "اختبار"})
            print("FUNDED status:", r2.status_code)
            assert r2.status_code == 200, r2.text
            adv = r2.json()
            adv_doc = await db.advances.find_one({"id": adv["id"]}, {"_id": 0})
            assert adv_doc.get("linked_owner_withdrawal_id"), "advance must link an owner withdrawal"

            exp_after = await db.expenses.count_documents({"employee_id": emp_id, "category": "advance"})
            wd_after = await db.owner_withdrawals.count_documents({"employee_id": emp_id, "category": "advance"})
            print(f"expenses(advance): {exp_before} -> {exp_after} (should NOT increase)")
            print(f"owner_withdrawals(advance): {wd_before} -> {wd_after} (should +1)")
            assert exp_after == exp_before, "advance must NOT create a cash expense anymore"
            assert wd_after == wd_before + 1, "advance must create one owner-safe withdrawal"
            print("\nALL ASSERTIONS PASSED ✅")
        finally:
            # cleanup always (even on assertion failure) to avoid leftover docs crashing /api/employees
            await db.employees.delete_one({"id": emp_id})
            await db.advances.delete_many({"employee_id": emp_id})
            await db.owner_withdrawals.delete_many({"employee_id": emp_id})
            await db.owner_deposits.delete_many({"beneficiary": "TEST_SEED"})


if __name__ == "__main__":
    asyncio.run(main())
