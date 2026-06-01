"""
اختبار تقرير هدر وتكلفة مواد الفروع (المبني على المبيعات + الجرد).
يتحقّق:
- تكلفة المواد المُستهلكة تُحسب بتفكيك المنتج النهائي → مكوّناته المُصنّعة × تكلفة الوحدة قبل/بعد الهدر.
- قيمة الفقد الفعلي تأتي من حركات branch_loss (الجرد).
- الفلترة بفرع البيع تعمل.
"""
import os
import uuid
from datetime import datetime, timezone

import requests
from pymongo import MongoClient
from dotenv import load_dotenv

load_dotenv("/app/backend/.env")

MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ["DB_NAME"]
with open("/app/frontend/.env") as f:
    for line in f:
        if line.startswith("REACT_APP_BACKEND_URL"):
            API = line.strip().split("=", 1)[1].strip() + "/api"

EMAIL, PASSWORD, TENANT = "admin@maestroegp.com", "admin123", "default"
BRANCH = "76f56acc-6948-4a2f-bbf4-feccbddea88f"
TAG = "PYTEST-BRWASTE"


def _login():
    r = requests.post(f"{API}/auth/login", json={"email": EMAIL, "password": PASSWORD}, timeout=30)
    r.raise_for_status()
    return r.json().get("token") or r.json().get("access_token")


def _cleanup(db):
    db.manufactured_products.delete_many({"name": {"$regex": f"^{TAG}"}})
    db.products.delete_many({"name": {"$regex": f"^{TAG}"}})
    db.orders.delete_many({"_pytest_brwaste": True})
    db.inventory_movements.delete_many({"notes": TAG})


def test_branch_waste_efficiency():
    db = MongoClient(MONGO_URL)[DB_NAME]
    _cleanup(db)
    token = _login()
    H = {"Authorization": f"Bearer {token}"}
    try:
        # منتج مُصنّع: تكلفة الوحدة قبل 1000 / بعد الهدر 1100 (10%)
        mp = str(uuid.uuid4())
        db.manufactured_products.insert_one({
            "id": mp, "tenant_id": TENANT, "name": f"{TAG}-برغر", "unit": "حبة",
            "raw_material_cost": 1000, "raw_material_cost_after_waste": 1100, "total_produced": 0,
        })
        # منتج بيع نهائي يستهلك 1 حبة
        fp = str(uuid.uuid4())
        db.products.insert_one({
            "id": fp, "tenant_id": TENANT, "name": f"{TAG}-وجبة",
            "manufactured_links": [{"manufactured_product_id": mp, "consumption_qty": 1, "consumption_unit": "حبة"}],
        })
        bd = datetime.now(timezone.utc).date().isoformat()
        # طلب: 5 وجبات
        db.orders.insert_one({
            "id": str(uuid.uuid4()), "tenant_id": TENANT, "branch_id": BRANCH, "status": "completed",
            "business_date": bd, "_pytest_brwaste": True, "created_at": datetime.now(timezone.utc).isoformat(),
            "items": [{"product_id": fp, "name": f"{TAG}-وجبة", "quantity": 5}],
        })
        # فقد من الجرد: 2 حبة بقيمة 2200
        db.inventory_movements.insert_one({
            "id": str(uuid.uuid4()), "tenant_id": TENANT, "type": "branch_loss", "branch_id": BRANCH,
            "product_id": mp, "product_name": f"{TAG}-برغر", "quantity": 2, "unit": "حبة",
            "total_value": 2200, "notes": TAG, "created_at": datetime.now(timezone.utc).isoformat(),
        })

        r = requests.get(f"{API}/reports/branch-waste-efficiency",
                         params={"branch_id": BRANCH, "start_date": bd, "end_date": bd}, headers=H, timeout=60)
        assert r.status_code == 200, r.text
        rows = {row["id"]: row for row in r.json().get("rows", [])}
        assert mp in rows, "صف المنتج مفقود"
        row = rows[mp]
        assert abs(row["quantity"] - 5) < 1e-6, f"qty={row['quantity']}"
        assert abs(row["cost_before_waste"] - 5000) < 1e-6, f"before={row['cost_before_waste']}"
        assert abs(row["cost_after_waste"] - 5500) < 1e-6, f"after={row['cost_after_waste']}"
        assert abs(row["waste_value"] - 500) < 1e-6, f"waste={row['waste_value']}"
        assert abs(row["loss_value"] - 2200) < 1e-6, f"loss={row['loss_value']}"
        assert abs(row["loss_qty"] - 2) < 1e-6, f"loss_qty={row['loss_qty']}"

        # فلترة بفرع آخر → لا يظهر هذا المنتج
        r2 = requests.get(f"{API}/reports/branch-waste-efficiency",
                          params={"branch_id": "NON-EXISTENT-BRANCH", "start_date": bd, "end_date": bd}, headers=H, timeout=60)
        assert r2.status_code == 200
        assert all(x["id"] != mp for x in r2.json().get("rows", [])), "الفلترة بالفرع لا تعمل"
        print("PASS: branch waste efficiency (sales cost + count loss + branch filter) ✅")
    finally:
        _cleanup(db)


if __name__ == "__main__":
    test_branch_waste_efficiency()
