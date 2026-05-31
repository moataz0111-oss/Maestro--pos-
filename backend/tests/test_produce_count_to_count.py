"""
سيناريو المستخدم (تصنيع جبن امريكي شرائح): منتج بوحدة فرعية عدّية (شريحة)
ومكوّن قطعي بتعبئة عدّية (1 قطعة = 46 شريحة). كان مسار التصنيع يعجز عن حساب
العائد (total_grams = 0) فيسقط في النمط per-unit ويستهلك كميات خاطئة.

بعد الإصلاح: تصنيع 46 شريحة يجب أن يخصم 1 قطعة فقط (وليس 4×46 = 184).
"""
import os
import uuid
import asyncio
import requests
from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient

load_dotenv("/app/backend/.env")
API = os.environ.get("REACT_APP_BACKEND_URL", "https://batch-accounting-1.preview.emergentagent.com").rstrip("/") + "/api"
ADMIN = {"email": "admin@maestroegp.com", "password": "admin123"}


def _token():
    r = requests.post(f"{API}/auth/login", json=ADMIN, timeout=30)
    r.raise_for_status()
    d = r.json()
    return d.get("access_token") or d.get("token")


async def _seed(rid, pid):
    c = AsyncIOMotorClient(os.environ["MONGO_URL"])
    db = c[os.environ["DB_NAME"]]
    await db.raw_materials.delete_many({"id": rid})
    await db.manufacturing_inventory.delete_many({"raw_material_id": rid})
    await db.manufactured_products.delete_many({"id": pid})
    await db.raw_materials.insert_one({
        "id": rid, "tenant_id": "default", "name": "جبن شيدر اختبار",
        "unit": "قطعة", "pack_quantity": 46, "pack_unit": "شريحة",
        "cost_per_unit": 7500, "quantity": 4,
    })
    await db.manufacturing_inventory.insert_one({
        "id": str(uuid.uuid4()), "tenant_id": "default", "raw_material_id": rid,
        "material_id": rid, "name": "جبن شيدر اختبار", "quantity": 4, "unit": "قطعة",
    })
    await db.manufactured_products.insert_one({
        "id": pid, "tenant_id": "default", "name": "جبن امريكي شرائح اختبار",
        "unit": "شريحة", "piece_weight": 1, "piece_weight_unit": "شريحة",
        "recipe": [{
            "raw_material_id": rid, "raw_material_name": "جبن شيدر اختبار",
            "unit": "قطعة", "quantity": 4, "cost_per_unit": 7500, "waste_percentage": 0,
            "pack_quantity": 46, "pack_unit": "شريحة",
        }],
        "raw_material_cost": 30000, "raw_material_cost_after_waste": 30000,
        "cost_before_waste": 30000, "production_cost": 30000, "quantity": 0, "total_produced": 0,
    })
    c.close()


async def _cheddar_remaining(rid):
    c = AsyncIOMotorClient(os.environ["MONGO_URL"])
    db = c[os.environ["DB_NAME"]]
    it = await db.manufacturing_inventory.find_one({"raw_material_id": rid})
    c.close()
    return float(it.get("quantity") or 0) if it else None


async def _cleanup(rid, pid):
    c = AsyncIOMotorClient(os.environ["MONGO_URL"])
    db = c[os.environ["DB_NAME"]]
    await db.raw_materials.delete_many({"id": rid})
    await db.manufacturing_inventory.delete_many({"raw_material_id": rid})
    await db.manufactured_products.delete_many({"id": pid})
    c.close()


def test_produce_count_to_count_consumes_correct_amount():
    h = {"Authorization": f"Bearer {_token()}"}
    rid = f"rm-{uuid.uuid4().hex[:8]}"
    pid = f"mfg-{uuid.uuid4().hex[:8]}"
    asyncio.run(_seed(rid, pid))
    try:
        # تصنيع 46 شريحة → يجب أن يُحجّم الوصفة 0.25x ويخصم 1 قطعة فقط
        r = requests.post(f"{API}/manufactured-products/{pid}/produce?quantity=46", headers=h, timeout=30)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d.get("batch_mode") is True, d
        assert abs(float(d.get("scale_factor") or 0) - 0.25) < 1e-3, d.get("scale_factor")
        remaining = asyncio.run(_cheddar_remaining(rid))
        assert abs(remaining - 3.0) < 1e-6, f"expected 3 قطعة remaining, got {remaining}"
        prod = requests.get(f"{API}/manufactured-products/{pid}", headers=h, timeout=30).json()
        assert abs(float(prod["quantity"]) - 46.0) < 1e-6, prod["quantity"]
        assert abs(float(prod["unit_cost_after_waste"]) - (30000.0 / 184.0)) < 0.5, prod["unit_cost_after_waste"]
    finally:
        asyncio.run(_cleanup(rid, pid))


if __name__ == "__main__":
    test_produce_count_to_count_consumes_correct_amount()
    print("PRODUCE COUNT->COUNT TEST PASSED")
