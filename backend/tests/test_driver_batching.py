"""تحقق من قواعد تجميع الطلبات على السائق (Phase 3)."""
import os, uuid, requests, math
from datetime import datetime, timezone
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv
import asyncio

load_dotenv(os.path.join(os.path.dirname(__file__), '..', '.env'))
API = "http://localhost:8001/api"
BR = "76f56acc-6948-4a2f-bbf4-feccbddea88f"


def token():
    r = requests.post(f"{API}/auth/login", json={"email": "admin@maestroegp.com", "password": "admin123"}, timeout=30)
    return r.json()["token"]


async def seed():
    db = AsyncIOMotorClient(os.environ['MONGO_URL'])[os.environ['DB_NAME']]
    did = str(uuid.uuid4())
    await db.drivers.insert_one({"id": did, "tenant_id": "default", "name": "سائق التجميع", "phone": "07790000001",
                                 "branch_id": BR, "pin": "1234", "is_active": True, "is_available": True,
                                 "current_order_id": None, "total_deliveries": 0,
                                 "created_at": datetime.now(timezone.utc).isoformat()})
    base = {"tenant_id": "default", "branch_id": BR, "status": "pending", "order_type": "delivery",
            "total": 1000, "total_amount": 1000, "created_at": datetime.now(timezone.utc).isoformat()}
    # نقطتان قريبتان (~0.3كم) ونقطة بعيدة (~5كم)
    o1 = str(uuid.uuid4()); o2 = str(uuid.uuid4()); o3 = str(uuid.uuid4()); o4 = str(uuid.uuid4())
    await db.orders.insert_one({**base, "id": o1, "order_number": 8001, "delivery_location": {"latitude": 33.3150, "longitude": 44.3660}})
    await db.orders.insert_one({**base, "id": o2, "order_number": 8002, "delivery_location": {"latitude": 33.3160, "longitude": 44.3670}})
    await db.orders.insert_one({**base, "id": o3, "order_number": 8003, "delivery_location": {"latitude": 33.3700, "longitude": 44.4200}})
    await db.orders.insert_one({**base, "id": o4, "order_number": 8004, "delivery_location": {"latitude": 33.3158, "longitude": 44.3665}})
    return db, did, o1, o2, o3, o4


async def cleanup(db, did, *oids):
    await db.drivers.delete_one({"id": did})
    for o in oids:
        await db.orders.delete_one({"id": o})


async def main():
    db, did, o1, o2, o3, o4 = await seed()
    H = {"Authorization": f"Bearer {token()}"}
    try:
        # 1) أول طلب
        r = requests.put(f"{API}/drivers/{did}/assign?order_id={o1}", headers=H, timeout=30)
        print("assign o1:", r.status_code, r.json().get("batched"))
        assert r.status_code == 200 and r.json()["batched"] is False

        # 2) طلب ثانٍ والسائق لم يغادر → مسموح (batched)
        r = requests.put(f"{API}/drivers/{did}/assign?order_id={o2}", headers=H, timeout=30)
        print("assign o2 (not departed):", r.status_code, r.json().get("batched"))
        assert r.status_code == 200 and r.json()["batched"] is True

        # 3) السائق يغادر (out_for_delivery على o1)
        requests.put(f"{API}/driver/orders/{o1}/status?status=out_for_delivery&driver_id={did}", timeout=30)

        # 4) طلب بعيد بعد المغادرة → مرفوض 409
        r = requests.put(f"{API}/drivers/{did}/assign?order_id={o3}", headers=H, timeout=30)
        print("assign o3 (departed + far):", r.status_code, r.json().get("detail", "")[:60])
        assert r.status_code == 409

        # 5) طلب قريب بعد المغادرة → مسموح
        r = requests.put(f"{API}/drivers/{did}/assign?order_id={o4}", headers=H, timeout=30)
        print("assign o4 (departed + near):", r.status_code)
        assert r.status_code == 200

        # 6) force يتجاوز القيد على الطلب البعيد
        r = requests.put(f"{API}/drivers/{did}/assign?order_id={o3}&force=true", headers=H, timeout=30)
        print("assign o3 force:", r.status_code)
        assert r.status_code == 200

        print("\nALL BATCHING ASSERTIONS PASSED ✅")
    finally:
        await cleanup(db, did, o1, o2, o3, o4)


if __name__ == "__main__":
    asyncio.run(main())
