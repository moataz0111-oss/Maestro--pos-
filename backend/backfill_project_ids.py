"""
Backfill: ربط جميع الوثائق القديمة (بلا project_id) بالمشروع الافتراضي لمستأجرها.
شامل: categories, products, branches, raw_materials, manufactured_products,
packaging_materials, printers, expenses, orders, customers.

الاستخدام:
  cd /app/backend && python3 backfill_project_ids.py
"""
import asyncio
import os
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv

load_dotenv()

COLLECTIONS = [
    "categories", "products", "branches", "raw_materials",
    "manufactured_products", "packaging_materials", "printers",
    "expenses", "orders", "customers", "recipes",
    "packaging_requests", "branch_requests", "branch_orders",
]


async def backfill():
    client = AsyncIOMotorClient(os.environ["MONGO_URL"])
    db = client[os.environ["DB_NAME"]]

    print("🚀 بدء ترحيل project_id للبيانات القديمة …\n")

    # 1) بناء خريطة tenant_id → default_project_id
    default_projects = await db.projects.find(
        {"is_default": True}, {"tenant_id": 1, "id": 1, "_id": 0}
    ).to_list(length=None)
    tenant_to_default = {p["tenant_id"]: p["id"] for p in default_projects}
    print(f"📦 عُثر على {len(tenant_to_default)} مشروع افتراضي عبر المستأجرين.\n")

    # 2) للمستأجرين بلا مشروع افتراضي — أنشئه تلقائياً
    all_tenants = await db.tenants.find({}, {"id": 1, "name": 1, "_id": 0}).to_list(length=None)
    from datetime import datetime, timezone
    import uuid
    for t in all_tenants:
        tid = t.get("id")
        if not tid or tid in tenant_to_default:
            continue
        new_id = str(uuid.uuid4())
        await db.projects.insert_one({
            "id": new_id,
            "tenant_id": tid,
            "name": "default",
            "activity_type": "restaurant",
            "is_default": True,
            "is_active": True,
            "currency": "IQD",
            "timezone": "Asia/Baghdad",
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
        tenant_to_default[tid] = new_id
        print(f"   ✅ أنشئ مشروع افتراضي لـ {t.get('name', tid)} → {new_id}")

    # 3) ترحيل كل collection
    total_updated = 0
    for coll_name in COLLECTIONS:
        coll = db[coll_name]
        coll_updated = 0
        for tid, pid in tenant_to_default.items():
            result = await coll.update_many(
                {
                    "tenant_id": tid,
                    "$or": [
                        {"project_id": {"$exists": False}},
                        {"project_id": None},
                        {"project_id": ""},
                    ],
                },
                {"$set": {"project_id": pid}},
            )
            coll_updated += result.modified_count
        total_updated += coll_updated
        print(f"   📁 {coll_name}: {coll_updated:>6} وثيقة")

    print(f"\n✅ اكتمل الترحيل. إجمالي الوثائق المُرحَّلة: {total_updated}")
    client.close()


if __name__ == "__main__":
    asyncio.run(backfill())
