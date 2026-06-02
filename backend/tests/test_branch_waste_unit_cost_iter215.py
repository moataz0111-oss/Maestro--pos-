"""
اختبار انحدار (iter215): تقرير «هدر وتكلفة مواد الفروع» يجب أن يستخدم
تكلفة الوحدة (raw_material_cost ÷ الإنتاجية) لا تكلفة الدفعة الكاملة.

الخلل السابق: كان التقرير يضرب الكمية المباعة × raw_material_cost (إجمالي
الدفعة) فتتضخّم التكلفة بمقدار الإنتاجية (yield). مثال حقيقي: لحم برغر
raw_material_cost=641,168 بإنتاجية 100 → كان يُحتسب 641,168/حبة بدل 6,411.68.

هذا الاختبار يثبّت أن التقرير = الكمية × (raw_material_cost ÷ yield)،
ومتطابق مع منطق تكلفة المبيعات (_enrich_unit_cost_fields).
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
TAG = "PYTEST-BRWASTE-UNIT"


def _login():
    r = requests.post(f"{API}/auth/login", json={"email": EMAIL, "password": PASSWORD}, timeout=30)
    r.raise_for_status()
    return r.json().get("token") or r.json().get("access_token")


def _cleanup(db):
    db.manufactured_products.delete_many({"name": {"$regex": f"^{TAG}"}})
    db.products.delete_many({"name": {"$regex": f"^{TAG}"}})
    db.orders.delete_many({"_pytest_brwaste_unit": True})


def test_branch_waste_uses_unit_cost_not_batch():
    db = MongoClient(MONGO_URL)[DB_NAME]
    _cleanup(db)
    token = _login()
    H = {"Authorization": f"Bearer {token}"}
    try:
        # منتج مُصنّع: تكلفة الدفعة 10,000 بإنتاجية 10 حبة → تكلفة الوحدة = 1,000
        mp = str(uuid.uuid4())
        db.manufactured_products.insert_one({
            "id": mp, "tenant_id": TENANT, "name": f"{TAG}-برغر", "unit": "حبة",
            "raw_material_cost": 10000,        # إجمالي الدفعة
            "quantity": 10, "total_produced": 10,  # الإنتاجية = 10 → وحدة = 1000
        })
        # منتج بيع نهائي يستهلك 1 حبة
        fp = str(uuid.uuid4())
        db.products.insert_one({
            "id": fp, "tenant_id": TENANT, "name": f"{TAG}-وجبة",
            "manufactured_links": [{"manufactured_product_id": mp, "consumption_qty": 1, "consumption_unit": "حبة"}],
        })
        bd = datetime.now(timezone.utc).date().isoformat()
        # طلب: 5 وجبات → استهلاك 5 حبة
        db.orders.insert_one({
            "id": str(uuid.uuid4()), "tenant_id": TENANT, "branch_id": BRANCH, "status": "completed",
            "business_date": bd, "_pytest_brwaste_unit": True, "created_at": datetime.now(timezone.utc).isoformat(),
            "items": [{"product_id": fp, "name": f"{TAG}-وجبة", "quantity": 5}],
        })

        r = requests.get(f"{API}/reports/branch-waste-efficiency",
                         params={"branch_id": BRANCH, "start_date": bd, "end_date": bd}, headers=H, timeout=60)
        assert r.status_code == 200, r.text
        rows = {row["id"]: row for row in r.json().get("rows", [])}
        assert mp in rows, "صف المنتج مفقود"
        row = rows[mp]
        assert abs(row["quantity"] - 5) < 1e-6, f"qty={row['quantity']}"
        # ✅ تكلفة الوحدة = 1000 (= 10000/10) وليست 10000 (الدفعة)
        # 5 حبة × 1000 = 5000  (الخلل السابق كان سيُعطي 50000)
        assert abs(row["cost_after_waste"] - 5000) < 1e-6, \
            f"المتوقع 5000 (تكلفة وحدة) لكن النتيجة {row['cost_after_waste']} — تستخدم تكلفة الدفعة!"
        assert row["cost_after_waste"] < 50000, "التقرير ما زال يستخدم تكلفة الدفعة (مُضخّمة)"
        print("PASS: branch waste report uses per-unit cost (batch ÷ yield) ✅")
    finally:
        _cleanup(db)


if __name__ == "__main__":
    test_branch_waste_uses_unit_cost_not_batch()
