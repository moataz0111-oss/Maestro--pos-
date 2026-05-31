"""
محاكاة حالة المستخدم (مايونيز): منتج صُنّع قبل الإصلاح فبقي actual_recipe_yield قديماً (7)
بينما الكمية المُصنّعة فعلياً 30 والكلفة 48,334. يجب أن يُصحّح النظام نفسه تلقائياً:
سعر الكيلو = 48,334 ÷ 30 = 1,611.13 (وليس ÷ 7 = 6,905) دون أي تدخّل يدوي.
"""
import os
import uuid
import asyncio
import requests
from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient

load_dotenv("/app/backend/.env")
API = os.environ.get("REACT_APP_BACKEND_URL", "https://recipe-mass-variance.preview.emergentagent.com").rstrip("/") + "/api"
ADMIN = {"email": "admin@maestroegp.com", "password": "admin123"}


def _token():
    r = requests.post(f"{API}/auth/login", json=ADMIN, timeout=30)
    r.raise_for_status()
    d = r.json()
    return d.get("access_token") or d.get("token")


async def _insert_stale(pid):
    c = AsyncIOMotorClient(os.environ["MONGO_URL"])
    db = c[os.environ["DB_NAME"]]
    # وصفة مُحجّمة (تُمثّل دفعة 30 كغم) لكن actual_recipe_yield ما زال 7 (قديم)
    await db.manufactured_products.insert_one({
        "id": pid,
        "tenant_id": "default",
        "name": "مايونيز قديم (محاكاة)",
        "unit": "كغم",
        "recipe": [
            {"raw_material_name": "نشأ", "quantity": 10000, "unit": "غرام", "cost_per_unit": 2.0, "waste_percentage": 0},
        ],
        "actual_recipe_yield": 7.0,          # قديم/قبل الإصلاح
        "total_produced": 30.0,               # صُنّع فعلاً 30 كغم
        "quantity": 30.0,
        "raw_material_cost": 45528.0,
        "cost_before_waste": 45528.0,
        "raw_material_cost_after_waste": 48334.0,
        "production_cost": 48334.0,
    })
    c.close()


async def _cleanup(pid):
    c = AsyncIOMotorClient(os.environ["MONGO_URL"])
    db = c[os.environ["DB_NAME"]]
    await db.manufactured_products.delete_many({"id": pid})
    c.close()


def test_stale_actual_yield_self_heals_to_total_produced():
    h = {"Authorization": f"Bearer {_token()}"}
    pid = f"stale-{uuid.uuid4().hex[:8]}"
    asyncio.run(_insert_stale(pid))
    try:
        prod = requests.get(f"{API}/manufactured-products/{pid}", headers=h, timeout=30).json()
        # سعر الكيلو يجب أن يكون 48,334 ÷ 30 = 1,611.13 (وليس 6,905)
        assert abs(float(prod["unit_cost_after_waste"]) - (48334.0 / 30.0)) < 1.0, prod["unit_cost_after_waste"]
        assert abs(float(prod["unit_cost_before_waste"]) - (45528.0 / 30.0)) < 1.0, prod["unit_cost_before_waste"]
        # العائد المعروض = 30 (الكمية المُصنّعة) وليس 7
        assert abs(float(prod["computed_yield"]) - 30.0) < 1e-2, prod["computed_yield"]
    finally:
        asyncio.run(_cleanup(pid))


if __name__ == "__main__":
    test_stale_actual_yield_self_heals_to_total_produced()
    print("STALE SELF-HEAL TEST PASSED")
