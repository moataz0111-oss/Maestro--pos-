"""تحقق من تقرير أداء السائقين GET /api/drivers/performance"""
import os, uuid, requests, asyncio
from datetime import datetime, timezone, timedelta
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), '..', '.env'))
API = "http://localhost:8001/api"
BR = "76f56acc-6948-4a2f-bbf4-feccbddea88f"


def token():
    r = requests.post(f"{API}/auth/login", json={"email": "admin@maestroegp.com", "password": "admin123"}, timeout=30)
    return r.json()["token"]


def _db():
    return AsyncIOMotorClient(os.environ['MONGO_URL'])[os.environ['DB_NAME']]


async def seed():
    db = _db()
    did = str(uuid.uuid4())
    await db.drivers.insert_one({"id": did, "tenant_id": "default", "name": "سائق أداء", "phone": "07790000096",
                                 "branch_id": BR, "pin": "1234", "is_active": True, "is_available": True,
                                 "current_order_id": None, "created_at": datetime.now(timezone.utc).isoformat()})
    now = datetime.now(timezone.utc)
    oids = []
    # طلبان مُسلّمان: زمن توصيل 20 و40 دقيقة، أجور 2000+3000، مع موقع زبون (~5 كم)
    for i, (mins, fee) in enumerate([(20, 2000), (40, 3000)]):
        oid = str(uuid.uuid4())
        oids.append(oid)
        out_at = now - timedelta(minutes=mins + 5)
        del_at = now - timedelta(minutes=5)
        await db.orders.insert_one({
            "id": oid, "tenant_id": "default", "branch_id": BR, "order_number": 9990 + i,
            "status": "delivered", "order_type": "delivery", "driver_id": did, "driver_name": "سائق أداء",
            "total": 10000 + fee, "delivery_fee": fee, "payment_method": "cash", "payment_status": "paid",
            "delivery_location": {"latitude": 33.3602, "longitude": 44.3661},
            "out_for_delivery_at": out_at.isoformat(), "delivered_at": del_at.isoformat(),
            "created_at": (now - timedelta(hours=1)).isoformat(),
            "items": [], "subtotal": 10000, "discount": 0
        })
    # طلب نشط
    oid = str(uuid.uuid4())
    oids.append(oid)
    await db.orders.insert_one({
        "id": oid, "tenant_id": "default", "branch_id": BR, "order_number": 9992,
        "status": "out_for_delivery", "order_type": "delivery", "driver_id": did, "driver_name": "سائق أداء",
        "total": 8000, "payment_method": "cash", "payment_status": "pending",
        "created_at": now.isoformat(), "items": [], "subtotal": 8000, "discount": 0
    })
    # موقع الفرع (للمسافة)
    old_branch = await db.branches.find_one({"id": BR}, {"_id": 0, "latitude": 1, "longitude": 1}) or {}
    await db.branches.update_one({"id": BR}, {"$set": {"latitude": 33.3152, "longitude": 44.3661}})
    return db, did, oids, old_branch


def test_driver_performance_report():
    loop = asyncio.get_event_loop()
    db, did, oids, old_branch = loop.run_until_complete(seed())
    try:
        h = {"Authorization": f"Bearer {token()}"}
        r = requests.get(f"{API}/drivers/performance", headers=h, params={"period": "today", "branch_id": BR}, timeout=30)
        assert r.status_code == 200, r.text
        data = r.json()
        row = next((d for d in data["drivers"] if d["driver_id"] == did), None)
        assert row is not None, "السائق غير موجود في التقرير"
        assert row["deliveries"] == 2, row
        assert row["total_fees"] == 5000, row
        assert row["total_collected"] == 25000, row
        assert row["active_orders"] == 1, row
        # متوسط الزمن ~30 دقيقة (20+40)/2
        assert 28 <= row["avg_delivery_minutes"] <= 32, row["avg_delivery_minutes"]
        # المسافة ~10 كم (5 كم × طلبين)
        assert 9 <= row["distance_km"] <= 11, row["distance_km"]
        # الإجماليات تشمل السائق
        assert data["totals"]["deliveries"] >= 2
        assert data["totals"]["total_fees"] >= 5000
    finally:
        loop.run_until_complete(_db().drivers.delete_one({"id": did}))
        loop.run_until_complete(_db().orders.delete_many({"id": {"$in": oids}}))
        loop.run_until_complete(_db().branches.update_one({"id": BR}, {"$set": {
            "latitude": old_branch.get("latitude"), "longitude": old_branch.get("longitude")}}))
