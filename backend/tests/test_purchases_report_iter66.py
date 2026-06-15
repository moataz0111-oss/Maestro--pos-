"""
اختبارات تقرير المشتريات الخارجية + سداد الموردين من الخزينة.
iter66 (fork) — 15 يونيو 2026 — تستهدف الخادم الحيّ (localhost:8001).
"""
import os
import uuid
import pytest
import httpx
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), '..', '.env'))

BASE = "http://localhost:8001"
ADMIN = {"email": "admin@maestroegp.com", "password": "admin123"}


def _db():
    return AsyncIOMotorClient(os.environ['MONGO_URL'])[os.environ['DB_NAME']]


async def _token(ac):
    r = await ac.post("/api/auth/login", json=ADMIN)
    return r.json()["token"]


@pytest.mark.asyncio
async def test_purchases_report_and_payment_flow():
    db = _db()
    sup_id = str(uuid.uuid4())
    pur_id = str(uuid.uuid4())
    await db.suppliers.insert_one({"id": sup_id, "name": "مورد تجريبي66", "phone": "0770", "total_purchases": 0, "is_active": True, "created_at": "2026-06-15T00:00:00+00:00"})
    await db.purchases_new.insert_one({
        "id": pur_id, "purchase_number": 888001, "supplier_id": sup_id, "supplier_name": "مورد تجريبي66",
        "invoice_number": "T66", "items": [{"name": "سكر", "quantity": 10, "unit": "كيس", "cost_per_unit": 1000, "total_cost": 10000}],
        "total_amount": 10000, "payment_method": "credit", "payment_status": "pending", "created_by": "tester",
        "created_at": "2026-06-15T10:00:00+00:00",
    })
    # إيداع للخزينة لضمان رصيد كافٍ
    dep_id = str(uuid.uuid4())
    await db.owner_deposits.insert_one({"id": dep_id, "amount": 50000, "date": "2026-06-15", "created_at": "2026-06-15T00:00:00+00:00"})

    async with httpx.AsyncClient(base_url=BASE, timeout=20) as ac:
        token = await _token(ac)
        h = {"Authorization": f"Bearer {token}"}

        # التقرير يتضمن الفاتورة
        r = await ac.get("/api/purchases-report", headers=h)
        assert r.status_code == 200, r.text
        data = r.json()
        inv = next((i for i in data["invoices"] if i["id"] == pur_id), None)
        assert inv is not None
        assert inv["pay_status"] == "unpaid"
        assert inv["remaining_amount"] == 10000

        bal_before = data["summary"]["treasury_balance"]

        # سداد جزئي
        r = await ac.post(f"/api/purchases-new/{pur_id}/pay", json={"amount": 4000, "payment_method": "cash"}, headers=h)
        assert r.status_code == 200, r.text
        assert r.json()["payment_status"] == "partial"
        assert r.json()["remaining_amount"] == 6000
        assert r.json()["treasury_balance"] == bal_before - 4000

        # تجاوز المتبقي يُرفض
        r = await ac.post(f"/api/purchases-new/{pur_id}/pay", json={"amount": 999999, "payment_method": "cash"}, headers=h)
        assert r.status_code == 400

        # سداد المتبقي
        r = await ac.post(f"/api/purchases-new/{pur_id}/pay", json={"amount": 6000, "payment_method": "card"}, headers=h)
        assert r.status_code == 200
        assert r.json()["payment_status"] == "paid"
        assert r.json()["remaining_amount"] == 0

        # التقرير يعكس السداد الكامل
        r = await ac.get("/api/purchases-report", headers=h)
        inv = next((i for i in r.json()["invoices"] if i["id"] == pur_id), None)
        assert inv["pay_status"] == "paid"
        assert inv["paid_amount"] == 10000

    # تنظيف
    await db.purchases_new.delete_one({"id": pur_id})
    await db.suppliers.delete_one({"id": sup_id})
    await db.owner_deposits.delete_one({"id": dep_id})
    await db.owner_withdrawals.delete_many({"linked_purchase_id": pur_id})


@pytest.mark.asyncio
async def test_pay_requires_existing_invoice():
    async with httpx.AsyncClient(base_url=BASE, timeout=20) as ac:
        token = await _token(ac)
        h = {"Authorization": f"Bearer {token}"}
        r = await ac.post("/api/purchases-new/nonexistent/pay", json={"amount": 100}, headers=h)
        assert r.status_code == 404
