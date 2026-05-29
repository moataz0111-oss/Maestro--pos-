"""Seed test data for Delivery Report verification (fork has empty DB)."""
import asyncio, os, uuid
from datetime import datetime, timezone
from dotenv import load_dotenv
load_dotenv()
from motor.motor_asyncio import AsyncIOMotorClient

TENANT = "default"
BRANCH_ID = "76f56acc-6948-4a2f-bbf4-feccbddea88f"


async def main():
    c = AsyncIOMotorClient(os.environ['MONGO_URL'])
    db = c[os.environ['DB_NAME']]
    now = datetime.now(timezone.utc)
    today = now.strftime("%Y-%m-%d")

    # 1) delivery_app_settings (commission rates)
    settings = [
        {"app_id": "toters", "name": "توترز", "commission_rate": 15, "is_active": True, "tenant_id": TENANT},
        {"app_id": "talabat", "name": "طلبات", "commission_rate": 18, "is_active": True, "tenant_id": TENANT},
    ]
    await db.delivery_app_settings.delete_many({"tenant_id": TENANT})
    await db.delivery_app_settings.insert_many(settings)

    # 2) delivery orders with items
    await db.orders.delete_many({"tenant_id": TENANT, "order_type": "delivery"})
    orders = []
    samples = [
        ("toters", "توترز", 15, [("برجر دجاج", 2, 5000, 0), ("بطاطا", 1, 2000, 500)]),
        ("toters", "توترز", 15, [("بيتزا", 1, 12000, 0)]),
        ("talabat", "طلبات", 18, [("شاورما", 3, 4000, 0), ("مشروب", 2, 1500, 0)]),
    ]
    for i, (app_id, app_name, rate, items) in enumerate(samples, start=1):
        item_docs = []
        subtotal = 0
        for name, qty, price, disc in items:
            line = price * qty - disc
            subtotal += line
            item_docs.append({"name": name, "quantity": qty, "price": price, "discount": disc, "total": line})
        total = subtotal
        commission = round(total * rate / 100, 2)
        orders.append({
            "id": str(uuid.uuid4()),
            "order_number": 1000 + i,
            "tenant_id": TENANT,
            "branch_id": BRANCH_ID,
            "order_type": "delivery",
            "status": "completed",
            "delivery_app": app_id,
            "delivery_app_name": app_name,
            "delivery_commission": commission,
            "delivery_collected": False,
            "customer_name": f"عميل {i}",
            "payment_method": "delivery_app",
            "items": item_docs,
            "subtotal": subtotal,
            "discount": 0,
            "total": total,
            "created_at": now.isoformat(),
            "business_date": today,
        })
    await db.orders.insert_many(orders)
    print(f"Seeded {len(settings)} app settings and {len(orders)} delivery orders for tenant={TENANT}")
    for o in orders:
        print(o["order_number"], o["delivery_app_name"], "total=", o["total"], "comm=", o["delivery_commission"])

asyncio.run(main())
