"""
اختبار: خصم المنتجات المُصنّعة المُستهلَكة كمكوّن في تصنيع منتجات أخرى (Nested Recipes).
سيناريو المستخدم: مايونيز (30 كغم) يُستخدم كمكوّن في صوص آخر — يجب أن ينقص "المتبقي"
من مايونيز تلقائياً (يُصحّح ذاتياً من حركات الاستهلاك، حتى للبيانات القائمة).
"""
import os
import uuid
import asyncio
import requests
from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient

load_dotenv("/app/backend/.env")
API = os.environ.get("REACT_APP_BACKEND_URL", "https://multi-tenant-pwa-pos.preview.emergentagent.com").rstrip("/") + "/api"
ADMIN = {"email": "admin@maestroegp.com", "password": "admin123"}


def _token():
    r = requests.post(f"{API}/auth/login", json=ADMIN, timeout=30)
    r.raise_for_status()
    d = r.json()
    return d.get("access_token") or d.get("token")


async def _seed(pid):
    c = AsyncIOMotorClient(os.environ["MONGO_URL"])
    db = c[os.environ["DB_NAME"]]
    await db.manufactured_products.delete_many({"id": pid})
    await db.inventory_movements.delete_many({"product_id": pid, "type": "manufactured_consumption"})
    # مايونيز: صُنّع 30 كغم
    await db.manufactured_products.insert_one({
        "id": pid, "tenant_id": "default", "name": "مايونيز تست خصم", "unit": "كغم",
        "recipe": [{"raw_material_name": "نشأ", "quantity": 6000, "unit": "غرام", "cost_per_unit": 2.0, "waste_percentage": 0}],
        "total_produced": 30.0, "transferred_quantity": 0.0, "quantity": 30.0,
        "raw_material_cost_after_waste": 48334.0, "production_cost": 48334.0,
        "cost_before_waste": 45528.0, "raw_material_cost": 45528.0,
    })
    # حركة استهلاك: استُهلك 12 كغم من مايونيز في تصنيع صوص آخر (تحاكي بيانات قائمة)
    await db.inventory_movements.insert_one({
        "id": str(uuid.uuid4()), "tenant_id": "default", "type": "manufactured_consumption",
        "category": "manufacturing", "product_id": pid, "product_name": "مايونيز تست خصم",
        "quantity": -12.0, "unit": "كغم", "reason": "إنتاج صوص", "created_at": "2026-05-31T00:00:00Z",
    })
    c.close()


async def _cleanup(pid):
    c = AsyncIOMotorClient(os.environ["MONGO_URL"])
    db = c[os.environ["DB_NAME"]]
    await db.manufactured_products.delete_many({"id": pid})
    await db.inventory_movements.delete_many({"product_id": pid, "type": "manufactured_consumption"})
    c.close()


def test_consumed_as_ingredient_reduces_remaining():
    h = {"Authorization": f"Bearer {_token()}"}
    pid = f"mayo-consume-{uuid.uuid4().hex[:8]}"
    asyncio.run(_seed(pid))
    try:
        # GET list — المتبقي يجب أن يكون 30 - 0 - 12 = 18
        lst = requests.get(f"{API}/manufactured-products", headers=h, timeout=30).json()
        prod = next((p for p in lst if p["id"] == pid), None)
        assert prod is not None, "product not found in list"
        assert abs(float(prod["remaining_quantity"]) - 18.0) < 1e-3, prod["remaining_quantity"]
        assert abs(float(prod["quantity"]) - 18.0) < 1e-3, prod["quantity"]
        assert abs(float(prod.get("consumed_as_ingredient") or 0) - 12.0) < 1e-3, prod.get("consumed_as_ingredient")

        # GET single — نفس النتيجة
        single = requests.get(f"{API}/manufactured-products/{pid}", headers=h, timeout=30).json()
        assert abs(float(single["remaining_quantity"]) - 18.0) < 1e-3, single["remaining_quantity"]
    finally:
        asyncio.run(_cleanup(pid))


def test_unit_conversion_grams_to_kg():
    """إذا سُجِّل الاستهلاك بالغرام بينما وحدة المنتج كغم، يُحوَّل قبل الطرح."""
    h = {"Authorization": f"Bearer {_token()}"}
    pid = f"mayo-g-{uuid.uuid4().hex[:8]}"

    async def seed():
        c = AsyncIOMotorClient(os.environ["MONGO_URL"])
        db = c[os.environ["DB_NAME"]]
        await db.manufactured_products.insert_one({
            "id": pid, "tenant_id": "default", "name": "مايونيز غرام", "unit": "كغم",
            "recipe": [], "total_produced": 30.0, "transferred_quantity": 0.0, "quantity": 30.0,
            "raw_material_cost_after_waste": 100.0, "production_cost": 100.0,
        })
        await db.inventory_movements.insert_one({
            "id": str(uuid.uuid4()), "tenant_id": "default", "type": "manufactured_consumption",
            "product_id": pid, "quantity": -5000.0, "unit": "غرام", "created_at": "2026-05-31T00:00:00Z",
        })
        c.close()

    async def clean():
        c = AsyncIOMotorClient(os.environ["MONGO_URL"])
        db = c[os.environ["DB_NAME"]]
        await db.manufactured_products.delete_many({"id": pid})
        await db.inventory_movements.delete_many({"product_id": pid})
        c.close()

    asyncio.run(seed())
    try:
        single = requests.get(f"{API}/manufactured-products/{pid}", headers=h, timeout=30).json()
        # 5000 غرام = 5 كغم → المتبقي = 30 - 5 = 25
        assert abs(float(single["remaining_quantity"]) - 25.0) < 1e-3, single["remaining_quantity"]
    finally:
        asyncio.run(clean())


if __name__ == "__main__":
    test_consumed_as_ingredient_reduces_remaining()
    test_unit_conversion_grams_to_kg()
    print("NESTED CONSUMPTION TESTS PASSED")
