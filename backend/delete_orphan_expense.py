"""
سكريبت لحذف مصروف الصيانة اليتيم 75,000 د.ع من قاعدة بيانات الإنتاج
وإعادة احتساب إجمالي مصروفات الوردية المرتبطة.

طريقة التشغيل على السيرفر:
    cd /app/backend
    python3 delete_orphan_expense.py

يبحث عن مصاريف "صيانة" بقيمة 75,000 د.ع ويعرضها، ثم يطلب تأكيدك قبل الحذف.
"""
import asyncio
import os
import sys
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv

load_dotenv('/app/backend/.env')


async def main():
    client = AsyncIOMotorClient(os.environ['MONGO_URL'])
    db = client[os.environ['DB_NAME']]

    # 1) البحث عن المصاريف المرشحة
    print("🔍 البحث عن مصاريف الصيانة 75,000 د.ع...\n")
    candidates = await db.expenses.find({
        "$or": [
            {"amount": 75000, "description": {"$regex": "صيان", "$options": "i"}},
            {"amount": 75000, "category": "maintenance"},
        ]
    }, {"_id": 0}).to_list(100)

    if not candidates:
        print("✅ لا توجد مصاريف صيانة بقيمة 75,000 د.ع. قاعدة البيانات نظيفة.")
        return

    print(f"وُجد {len(candidates)} سجل مطابق:\n")
    for i, e in enumerate(candidates, 1):
        print(f"  [{i}] id={e.get('id')}")
        print(f"      description={e.get('description')}")
        print(f"      amount={e.get('amount')} IQD")
        print(f"      date={e.get('date')}  business_date={e.get('business_date')}")
        print(f"      branch={e.get('branch_id')}  tenant={e.get('tenant_id')}")
        print(f"      created_at={e.get('created_at')}")
        print()

    # 2) تأكيد الحذف
    choice = input(f"اكتب رقم السجل للحذف (1-{len(candidates)})، أو 'all' لحذف الكل، أو 'no' للإلغاء: ").strip().lower()
    if choice in ('no', 'n', ''):
        print("❌ تم الإلغاء.")
        return

    to_delete = candidates if choice == 'all' else [candidates[int(choice) - 1]]

    for exp in to_delete:
        expense_id = exp["id"]
        exp_branch = exp.get("branch_id")
        exp_tenant = exp.get("tenant_id")
        exp_created = exp.get("created_at", "")

        # حذف المصروف
        await db.expenses.delete_one({"id": expense_id})
        print(f"🗑️  تم حذف المصروف {expense_id} (مبلغ {exp['amount']})")

        # 3) إعادة احتساب إجمالي مصروفات أي وردية تحتوي هذا المصروف
        if exp_created and exp_branch:
            shift_q = {"branch_id": exp_branch, "started_at": {"$lte": exp_created}}
            if exp_tenant:
                shift_q["tenant_id"] = exp_tenant
            affected = await db.shifts.find(shift_q, {"_id": 0}).to_list(100)

            for s in affected:
                s_end = s.get("ended_at") or ""
                if s_end and exp_created > s_end:
                    continue
                q = {
                    "branch_id": exp_branch,
                    "category": {"$ne": "refund"},
                    "created_at": {"$gte": s.get("started_at", "")}
                }
                if exp_tenant:
                    q["tenant_id"] = exp_tenant
                if s_end:
                    q["created_at"]["$lte"] = s_end
                shift_expenses = await db.expenses.find(q, {"_id": 0, "amount": 1}).to_list(500)
                total_exp = sum(float(e.get("amount") or 0) for e in shift_expenses)
                opening_cash = float(s.get("opening_cash") or s.get("opening_balance") or 0)
                cash_sales = float(s.get("cash_sales") or 0)
                expected_cash = opening_cash + cash_sales - total_exp

                await db.shifts.update_one(
                    {"id": s["id"]},
                    {"$set": {
                        "total_expenses": total_exp,
                        "expected_cash": expected_cash,
                    }}
                )
                print(f"   ✅ أُعيد حساب الوردية {s['id'][:8]}... → المصاريف الجديدة = {total_exp:,.0f} IQD")

    print("\n✅ انتهى. الآن تقرير إغلاق الصندوق سيُظهر القيم الصحيحة.")
    client.close()


if __name__ == "__main__":
    asyncio.run(main())
