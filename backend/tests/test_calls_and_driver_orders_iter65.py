"""
اختبارات تراجعية لمكالمات WebRTC داخل التطبيق (signaling) + إصلاح اختفاء طلب السائق.
iter65 (fork) — 14 يونيو 2026
تستهدف الخادم الحيّ (localhost:8001) لتفادي مشاكل event-loop مع motor العالمي في server.py.
"""
import os
import uuid
import pytest
import httpx
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), '..', '.env'))

BASE = "http://localhost:8001"


def _db():
    c = AsyncIOMotorClient(os.environ['MONGO_URL'])
    return c[os.environ['DB_NAME']]


@pytest.mark.asyncio
async def test_call_signaling_lifecycle():
    db = _db()
    driver_id = f"test-drv-{uuid.uuid4().hex[:6]}"
    order_id = str(uuid.uuid4())
    await db.orders.insert_one({
        "id": order_id, "tenant_id": "default", "driver_id": driver_id,
        "driver_name": "سائق اختبار", "customer_name": "زبون اختبار",
        "customer_phone": "07700000111", "status": "preparing", "order_type": "delivery",
        "order_number": 99999,
    })
    async with httpx.AsyncClient(base_url=BASE, timeout=15) as ac:
        r = await ac.post("/api/calls/initiate", json={
            "order_id": order_id, "caller": "customer", "caller_name": "زبون اختبار",
            "offer": {"type": "offer", "sdp": "v=0 FAKE"},
        })
        assert r.status_code == 200, r.text
        call_id = r.json()["call_id"]
        assert r.json()["callee"] == "driver"

        r = await ac.get(f"/api/calls/incoming?driver_id={driver_id}")
        call = r.json()["call"]
        assert call and call["id"] == call_id
        assert call["offer"]["sdp"] == "v=0 FAKE"

        r = await ac.post(f"/api/calls/{call_id}/answer", json={"answer": {"type": "answer", "sdp": "v=0 ANS"}})
        assert r.status_code == 200

        r = await ac.get(f"/api/calls/{call_id}")
        c = r.json()["call"]
        assert c["status"] == "answered"
        assert c["answer"]["sdp"] == "v=0 ANS"

        r = await ac.post(f"/api/calls/{call_id}/end")
        assert r.status_code == 200
        r = await ac.get(f"/api/calls/{call_id}")
        assert r.json()["call"]["status"] == "ended"

    await db.orders.delete_one({"id": order_id})
    await db.call_sessions.delete_many({"order_id": order_id})


@pytest.mark.asyncio
async def test_call_initiate_requires_driver_for_customer_call():
    db = _db()
    order_id = str(uuid.uuid4())
    await db.orders.insert_one({
        "id": order_id, "tenant_id": "default", "status": "pending",
        "order_type": "delivery", "customer_phone": "07700000222",
    })
    async with httpx.AsyncClient(base_url=BASE, timeout=15) as ac:
        r = await ac.post("/api/calls/initiate", json={
            "order_id": order_id, "caller": "customer",
            "offer": {"type": "offer", "sdp": "x"},
        })
        assert r.status_code == 400, r.text
    await db.orders.delete_one({"id": order_id})


@pytest.mark.asyncio
async def test_driver_orders_keeps_confirmed_and_completed():
    """إصلاح الاختفاء: confirmed/completed تبقى ظاهرة، delivered/cancelled تختفي."""
    db = _db()
    driver_id = f"test-drv-{uuid.uuid4().hex[:6]}"
    statuses = ["pending", "confirmed", "preparing", "ready", "completed", "out_for_delivery", "delivered", "cancelled"]
    ids = []
    for st in statuses:
        oid = str(uuid.uuid4())
        ids.append(oid)
        await db.orders.insert_one({
            "id": oid, "tenant_id": "default", "driver_id": driver_id,
            "status": st, "order_type": "delivery", "order_number": 1000,
            "created_at": "2026-06-14T10:00:00+00:00",
        })
    async with httpx.AsyncClient(base_url=BASE, timeout=15) as ac:
        r = await ac.get(f"/api/driver/orders?driver_id={driver_id}")
        assert r.status_code == 200
        returned = {o["status"] for o in r.json()}
    for st in ["pending", "confirmed", "preparing", "ready", "completed", "out_for_delivery"]:
        assert st in returned, f"{st} يجب أن يظهر للسائق"
    assert "delivered" not in returned
    assert "cancelled" not in returned

    for oid in ids:
        await db.orders.delete_one({"id": oid})
