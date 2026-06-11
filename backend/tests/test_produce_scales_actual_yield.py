"""
اختبار: عند تحجيم الوصفة أثناء التصنيع (produce) يجب تحجيم actual_recipe_yield
بنفس المعامل حتى لا يبقى قديماً → يمنع ظهور سعر الوحدة مضخّماً.

سيناريو المايونيز: ary=7، نُنتج 30 → يجب أن يصبح ary=30 وتكلفة الكيلو = الكلفة ÷ 30.
"""
import os
import uuid
import asyncio
import requests
from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient

load_dotenv("/app/backend/.env")
API = os.environ.get("REACT_APP_BACKEND_URL", "https://multi-tenant-pwa-pos-1.preview.emergentagent.com").rstrip("/") + "/api"
ADMIN = {"email": "admin@maestroegp.com", "password": "admin123"}


def _token():
    r = requests.post(f"{API}/auth/login", json=ADMIN, timeout=30)
    r.raise_for_status()
    d = r.json()
    return d.get("access_token") or d.get("token")


async def _seed_inventory(rm_id):
    c = AsyncIOMotorClient(os.environ["MONGO_URL"])
    db = c[os.environ["DB_NAME"]]
    await db.manufacturing_inventory.delete_many({"raw_material_id": rm_id})
    await db.manufacturing_inventory.insert_one({
        "id": str(uuid.uuid4()),
        "raw_material_id": rm_id,
        "material_id": rm_id,
        "name": "نشا اختبار",
        "quantity": 1_000_000.0,
        "unit": "غرام",
        "tenant_id": "default",
    })
    c.close()


async def _cleanup(rm_id):
    c = AsyncIOMotorClient(os.environ["MONGO_URL"])
    db = c[os.environ["DB_NAME"]]
    await db.manufacturing_inventory.delete_many({"raw_material_id": rm_id})
    c.close()


def test_produce_scales_actual_recipe_yield():
    h = {"Authorization": f"Bearer {_token()}"}
    rm_id = f"test-rm-{uuid.uuid4().hex[:8]}"
    asyncio.run(_seed_inventory(rm_id))

    recipe = [{
        "raw_material_id": rm_id,
        "raw_material_name": "نشا اختبار",
        "quantity": 6000, "unit": "غرام",
        "cost_per_unit": 2.0, "waste_percentage": 0,
    }]
    # ary=7 (الناتج الفعلي 7 كغم). تكلفة الدفعة = 6000*2 = 12000 → 12000/7 = 1714.28/كغم
    payload = {"name": f"مايونيز سكيل {uuid.uuid4().hex[:5]}", "unit": "كغم", "recipe": recipe, "actual_recipe_yield": 7.0}
    r = requests.post(f"{API}/manufactured-products", json=payload, headers=h, timeout=30)
    assert r.status_code == 200, r.text
    pid = r.json()["id"]

    try:
        # أنتج 30 كغم
        pr = requests.post(f"{API}/manufactured-products/{pid}/produce?quantity=30", headers=h, timeout=30)
        assert pr.status_code == 200, pr.text

        prod = requests.get(f"{API}/manufactured-products/{pid}", headers=h, timeout=30).json()
        # ⭐ يجب أن يتحجّم ary من 7 إلى 30
        assert abs(float(prod.get("actual_recipe_yield") or 0) - 30.0) < 1e-2, prod.get("actual_recipe_yield")
        # العائد المحسوب = 30
        assert abs(float(prod["computed_yield"]) - 30.0) < 1e-2, prod["computed_yield"]
        # تكلفة الكيلو تبقى ثابتة ≈ 1714.28 (وليست مضخّمة على 7)
        assert abs(float(prod["unit_cost_before_waste"]) - (12000.0 / 7.0)) < 1.0, prod["unit_cost_before_waste"]
    finally:
        requests.delete(f"{API}/manufactured-products/{pid}", headers=h, timeout=30)
        asyncio.run(_cleanup(rm_id))


if __name__ == "__main__":
    test_produce_scales_actual_recipe_yield()
    print("PRODUCE-SCALE TEST PASSED")
