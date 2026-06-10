"""تحقق من أجور التوصيل عند إسناد السائق + تسوية التحصيل كـ "توصيل داخلي"."""
import os, uuid, requests, asyncio
from datetime import datetime, timezone
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), '..', '.env'))
API = "http://localhost:8001/api"
BR = "76f56acc-6948-4a2f-bbf4-feccbddea88f"


def token():
    r = requests.post(f"{API}/auth/login", json={"email": "admin@maestroegp.com", "password": "admin123"}, timeout=30)
    return r.json()["token"]


async def seed():
    db = AsyncIOMotorClient(os.environ['MONGO_URL'])[os.environ['DB_NAME']]
    did = str(uuid.uuid4())
    await db.drivers.insert_one({"id": did, "tenant_id": "default", "name": "سائق الأجور", "phone": "07790000099",
                                 "branch_id": BR, "pin": "1234", "is_active": True, "is_available": True,
                                 "current_order_id": None, "total_deliveries": 0,
                                 "created_at": datetime.now(timezone.utc).isoformat()})
    oid = str(uuid.uuid4())
    await db.orders.insert_one({"id": oid, "tenant_id": "default", "branch_id": BR, "status": "pending",
                                "order_type": "delivery", "total": 10000, "total_amount": 10000,
                                "order_number": 8801, "payment_method": "cash", "payment_status": "pending",
                                "created_at": datetime.now(timezone.utc).isoformat()})
    return db, did, oid


async def cleanup(db, did, oid):
    await db.drivers.delete_one({"id": did})
    await db.orders.delete_one({"id": oid})
    await db.driver_payments.delete_many({"driver_id": did})


def test_assign_with_delivery_fee_adds_to_total():
    db, did, oid = asyncio.get_event_loop().run_until_complete(seed())
    try:
        h = {"Authorization": f"Bearer {token()}"}
        # إسناد مع أجور 2000
        r = requests.put(f"{API}/drivers/{did}/assign?order_id={oid}&delivery_fee=2000", headers=h, timeout=30)
        assert r.status_code == 200, r.text
        assert r.json()["new_total"] == 12000
        order = asyncio.get_event_loop().run_until_complete(
            AsyncIOMotorClient(os.environ['MONGO_URL'])[os.environ['DB_NAME']].orders.find_one({"id": oid}))
        assert order["delivery_fee"] == 2000
        assert order["total"] == 12000
        assert order["driver_id"] == did
        # إعادة الإسناد بأجور مختلفة لا تتراكم (idempotent)
        r2 = requests.put(f"{API}/drivers/{did}/assign?order_id={oid}&delivery_fee=3000&force=true", headers=h, timeout=30)
        assert r2.status_code == 200, r2.text
        assert r2.json()["new_total"] == 13000
    finally:
        asyncio.get_event_loop().run_until_complete(cleanup(db, did, oid))


def test_collect_payment_tags_internal_delivery():
    db, did, oid = asyncio.get_event_loop().run_until_complete(seed())
    try:
        h = {"Authorization": f"Bearer {token()}"}
        requests.put(f"{API}/drivers/{did}/assign?order_id={oid}&delivery_fee=1000", headers=h, timeout=30)
        # سلّم الطلب ثم حصّل المبلغ
        asyncio.get_event_loop().run_until_complete(
            AsyncIOMotorClient(os.environ['MONGO_URL'])[os.environ['DB_NAME']].orders.update_one(
                {"id": oid}, {"$set": {"status": "delivered"}}))
        r = requests.post(f"{API}/drivers/{did}/collect-payment", params={"amount": 11000}, headers=h, timeout=30)
        assert r.status_code == 200, r.text
        order = asyncio.get_event_loop().run_until_complete(
            AsyncIOMotorClient(os.environ['MONGO_URL'])[os.environ['DB_NAME']].orders.find_one({"id": oid}))
        assert order["driver_payment_status"] == "paid"
        assert order["payment_method"] == "cash"
        assert order["payment_status"] == "paid"
        assert order["payment_source"] == "internal_delivery"
    finally:
        asyncio.get_event_loop().run_until_complete(cleanup(db, did, oid))
