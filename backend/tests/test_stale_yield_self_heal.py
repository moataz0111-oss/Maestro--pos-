"""
سيناريو لحم ستيك (منتج حصصي): الكلفة المخزّنة تخصّ عائد الوصفة نفسها
(actual_recipe_yield = 25 حصة، الكلفة = 51,300) بينما total_produced تراكم إلى 100
عبر عدّة دفعات. يجب أن تُقسَم الكلفة على عائد الوصفة (25) لا على الكمية التراكمية (100):
    تكلفة الحصة = 51,300 ÷ 25 = 2,052 (وليس ÷100 = 513).

هذا يحمي الإصلاح: كل منتج يُحسب حسب إدخاله الخاص (عائد وصفته) لا حسب
الكمية الإجمالية المُنتجة تراكمياً.
"""
import os
import uuid
import asyncio
import requests
from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient

load_dotenv("/app/backend/.env")
API = os.environ.get("REACT_APP_BACKEND_URL", "https://inventory-accounting-10.preview.emergentagent.com").rstrip("/") + "/api"
ADMIN = {"email": "admin@maestroegp.com", "password": "admin123"}


def _token():
    r = requests.post(f"{API}/auth/login", json=ADMIN, timeout=30)
    r.raise_for_status()
    d = r.json()
    return d.get("access_token") or d.get("token")


async def _insert_portion_product(pid):
    c = AsyncIOMotorClient(os.environ["MONGO_URL"])
    db = c[os.environ["DB_NAME"]]
    # وصفة حصصية: العائد الفعلي للوصفة = 25 حصة، والكلفة تخصّ هذه الدفعة.
    # total_produced=100 (تراكم عبر 4 دفعات) — يجب ألّا يُستخدم كمقام.
    await db.manufactured_products.insert_one({
        "id": pid,
        "tenant_id": "default",
        "name": "لحم ستيك (محاكاة حصص)",
        "unit": "حصة",
        "recipe": [
            {"raw_material_name": "لحم", "quantity": 5000, "unit": "غرام", "cost_per_unit": 10.0, "waste_percentage": 0},
        ],
        "actual_recipe_yield": 25.0,          # عائد الوصفة = 25 حصة
        "total_produced": 100.0,               # تراكم 100 حصة عبر دفعات متعددة
        "quantity": 40.0,                      # المتبقي
        "raw_material_cost": 50000.0,
        "cost_before_waste": 50000.0,
        "raw_material_cost_after_waste": 51300.0,
        "production_cost": 51300.0,
    })
    c.close()


async def _cleanup(pid):
    c = AsyncIOMotorClient(os.environ["MONGO_URL"])
    db = c[os.environ["DB_NAME"]]
    await db.manufactured_products.delete_many({"id": pid})
    c.close()


def test_portion_unit_cost_uses_recipe_yield_not_total_produced():
    h = {"Authorization": f"Bearer {_token()}"}
    pid = f"steak-{uuid.uuid4().hex[:8]}"
    asyncio.run(_insert_portion_product(pid))
    try:
        prod = requests.get(f"{API}/manufactured-products/{pid}", headers=h, timeout=30).json()
        # تكلفة الحصة = 51,300 ÷ 25 = 2,052 (وليست ÷100 = 513)
        assert abs(float(prod["unit_cost_after_waste"]) - (51300.0 / 25.0)) < 1.0, prod["unit_cost_after_waste"]
        assert abs(float(prod["unit_cost_before_waste"]) - (50000.0 / 25.0)) < 1.0, prod["unit_cost_before_waste"]
        # العائد المعروض = 25 (عائد الوصفة) وليس 100 (التراكمي)
        assert abs(float(prod["computed_yield"]) - 25.0) < 1e-2, prod["computed_yield"]
    finally:
        asyncio.run(_cleanup(pid))


if __name__ == "__main__":
    test_portion_unit_cost_uses_recipe_yield_not_total_produced()
    print("PORTION UNIT-COST (recipe-yield denominator) TEST PASSED")
