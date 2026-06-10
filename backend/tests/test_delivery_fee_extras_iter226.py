"""Additional tests: /driver/order-driver-info returns delivery_fee+order_total,
and /reports/sales by_payment_method contains 'توصيل داخلي' when driver collects."""
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


async def _seed():
    db = AsyncIOMotorClient(os.environ['MONGO_URL'])[os.environ['DB_NAME']]
    did = str(uuid.uuid4())
    await db.drivers.insert_one({"id": did, "tenant_id": "default", "name": "سائق اختبار 226", "phone": "07790000226",
                                 "branch_id": BR, "pin": "1234", "is_active": True, "is_available": True,
                                 "current_order_id": None, "total_deliveries": 0,
                                 "created_at": datetime.now(timezone.utc).isoformat()})
    oid = str(uuid.uuid4())
    await db.orders.insert_one({"id": oid, "tenant_id": "default", "branch_id": BR, "status": "pending",
                                "order_type": "delivery", "total": 10000, "total_amount": 10000,
                                "order_number": 9901, "payment_method": "cash", "payment_status": "pending",
                                "created_at": datetime.now(timezone.utc).isoformat()})
    return db, did, oid


async def _cleanup(db, did, oid):
    await db.drivers.delete_one({"id": did})
    await db.orders.delete_many({"id": oid})
    await db.driver_payments.delete_many({"driver_id": did})


def test_order_driver_info_returns_delivery_fee_and_order_total():
    db, did, oid = asyncio.get_event_loop().run_until_complete(_seed())
    try:
        h = {"Authorization": f"Bearer {token()}"}
        r = requests.put(f"{API}/drivers/{did}/assign?order_id={oid}&delivery_fee=2500", headers=h, timeout=30)
        assert r.status_code == 200, r.text
        # No-auth endpoint
        r2 = requests.get(f"{API}/driver/order-driver-info/{oid}", timeout=30)
        assert r2.status_code == 200, r2.text
        body = r2.json()
        assert body.get("delivery_fee") == 2500, body
        assert body.get("order_total") == 12500, body
    finally:
        asyncio.get_event_loop().run_until_complete(_cleanup(db, did, oid))


def test_sales_report_has_internal_delivery_key():
    db, did, oid = asyncio.get_event_loop().run_until_complete(_seed())
    try:
        h = {"Authorization": f"Bearer {token()}"}
        requests.put(f"{API}/drivers/{did}/assign?order_id={oid}&delivery_fee=1000", headers=h, timeout=30)
        asyncio.get_event_loop().run_until_complete(
            AsyncIOMotorClient(os.environ['MONGO_URL'])[os.environ['DB_NAME']].orders.update_one(
                {"id": oid}, {"$set": {"status": "delivered"}}))
        r = requests.post(f"{API}/drivers/{did}/collect-payment", params={"amount": 11000}, headers=h, timeout=30)
        assert r.status_code == 200, r.text
        # Now check sales report
        today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        r2 = requests.get(f"{API}/smart-reports/sales?period=today", headers=h, timeout=30)
        assert r2.status_code == 200, r2.text
        data = r2.json()
        bpm = data.get("by_payment_method", {})
        # Internal delivery key must exist
        assert "توصيل داخلي" in bpm, f"Missing 'توصيل داخلي' in {list(bpm.keys())}"
        # Should NOT use old label
        assert "نقدي السائقين" not in bpm, f"Old label still present: {bpm}"
    finally:
        asyncio.get_event_loop().run_until_complete(_cleanup(db, did, oid))
