"""
اختبار شامل (end-to-end): تصنيع منتج (صوص) يحتوي مايونيز كمكوّن مُصنّع يجب أن
يخصم المايونيز المُستهلَك من 'المتبقي' في المصنع تلقائياً عبر مسار /produce الحقيقي.
"""
import os
import uuid
import asyncio
import requests
from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient

load_dotenv("/app/backend/.env")
API = os.environ.get("REACT_APP_BACKEND_URL", "https://pos-inventory-sync-7.preview.emergentagent.com").rstrip("/") + "/api"
ADMIN = {"email": "admin@maestroegp.com", "password": "admin123"}


def _token():
    r = requests.post(f"{API}/auth/login", json=ADMIN, timeout=30)
    r.raise_for_status()
    d = r.json()
    return d.get("access_token") or d.get("token")


async def _seed_rm(rm_id):
    c = AsyncIOMotorClient(os.environ["MONGO_URL"])
    db = c[os.environ["DB_NAME"]]
    await db.manufacturing_inventory.delete_many({"raw_material_id": rm_id})
    await db.manufacturing_inventory.insert_one({
        "id": str(uuid.uuid4()), "raw_material_id": rm_id, "material_id": rm_id,
        "name": "نشأ تست", "quantity": 1_000_000.0, "unit": "غرام", "tenant_id": "default",
    })
    c.close()


async def _cleanup(rm_id, ids):
    c = AsyncIOMotorClient(os.environ["MONGO_URL"])
    db = c[os.environ["DB_NAME"]]
    await db.manufacturing_inventory.delete_many({"raw_material_id": rm_id})
    for i in ids:
        await db.manufactured_products.delete_many({"id": i})
        await db.inventory_movements.delete_many({"product_id": i})
    c.close()


def test_nested_produce_deducts_parent_ingredient():
    h = {"Authorization": f"Bearer {_token()}"}
    rm_id = f"rm-{uuid.uuid4().hex[:8]}"
    asyncio.run(_seed_rm(rm_id))
    mayo_id = sauce_id = None
    try:
        # 1) أنشئ المايونيز
        mayo = requests.post(f"{API}/manufactured-products", json={
            "name": f"مايونيز E2E {uuid.uuid4().hex[:5]}", "unit": "كغم",
            "recipe": [{"raw_material_id": rm_id, "raw_material_name": "نشأ تست",
                        "quantity": 6000, "unit": "غرام", "cost_per_unit": 2.0, "waste_percentage": 0}],
        }, headers=h, timeout=30)
        assert mayo.status_code == 200, mayo.text
        mayo_id = mayo.json()["id"]
        # صنّع 30 كغم من المايونيز
        pr = requests.post(f"{API}/manufactured-products/{mayo_id}/produce?quantity=30", headers=h, timeout=30)
        assert pr.status_code == 200, pr.text

        # تحقق: المتبقي 30
        m = requests.get(f"{API}/manufactured-products/{mayo_id}", headers=h, timeout=30).json()
        assert abs(float(m["remaining_quantity"]) - 30.0) < 1e-2, m["remaining_quantity"]

        # 2) أنشئ صوص يحتوي 10 كغم مايونيز كمكوّن مُصنّع
        sauce = requests.post(f"{API}/manufactured-products", json={
            "name": f"صوص E2E {uuid.uuid4().hex[:5]}", "unit": "كغم",
            "recipe": [{"manufactured_product_id": mayo_id, "raw_material_name": "مايونيز E2E",
                        "source": "manufactured", "quantity": 10, "unit": "كغم",
                        "cost_per_unit": 1611.13, "waste_percentage": 0}],
        }, headers=h, timeout=30)
        assert sauce.status_code == 200, sauce.text
        sauce_id = sauce.json()["id"]

        # 3) صنّع وحدة واحدة من الصوص → يستهلك 10 كغم مايونيز (وضع per-unit)
        pr2 = requests.post(f"{API}/manufactured-products/{sauce_id}/produce?quantity=1", headers=h, timeout=30)
        assert pr2.status_code == 200, pr2.text

        # 4) تحقق: متبقي المايونيز = 30 - 10 = 20
        m2 = requests.get(f"{API}/manufactured-products/{mayo_id}", headers=h, timeout=30).json()
        assert abs(float(m2["remaining_quantity"]) - 20.0) < 1e-2, f"remaining={m2['remaining_quantity']} consumed={m2.get('consumed_as_ingredient')}"
        assert abs(float(m2.get("consumed_as_ingredient") or 0) - 10.0) < 1e-2, m2.get("consumed_as_ingredient")

        # تحقق من القائمة أيضاً
        lst = requests.get(f"{API}/manufactured-products", headers=h, timeout=30).json()
        ml = next((p for p in lst if p["id"] == mayo_id), None)
        assert ml and abs(float(ml["remaining_quantity"]) - 20.0) < 1e-2, ml["remaining_quantity"] if ml else None
    finally:
        asyncio.run(_cleanup(rm_id, [x for x in [mayo_id, sauce_id] if x]))


if __name__ == "__main__":
    test_nested_produce_deducts_parent_ingredient()
    print("E2E NESTED PRODUCE DEDUCTION PASSED")
