"""
اختبار دقّة حساب "المباع" في الجرد اليومي للفرع.
يتحقّق أن المباع يُفكَّك إلى مكوّنات المنتج المُصنّعة (manufactured_links) مع تحويل الوحدة،
ليطابق الخصم الفعلي من مخزون الفرع تماماً (دقة COGS 100%).
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

EMAIL = "admin@maestroegp.com"
PASSWORD = "admin123"
TENANT = "default"

TAG = "PYTEST-COUNT"


def _login():
    r = requests.post(f"{API}/auth/login", json={"email": EMAIL, "password": PASSWORD}, timeout=30)
    r.raise_for_status()
    return r.json().get("token") or r.json().get("access_token")


def _cleanup(db):
    db.manufactured_products.delete_many({"name": {"$regex": f"^{TAG}"}})
    db.products.delete_many({"name": {"$regex": f"^{TAG}"}})
    db.branch_inventory.delete_many({"branch_id": f"{TAG}-BR"})
    db.orders.delete_many({"branch_id": f"{TAG}-BR"})
    db.branch_stock_counts.delete_many({"branch_id": f"{TAG}-BR"})


def test_sold_multi_component_with_unit_conversion():
    db = MongoClient(MONGO_URL)[DB_NAME]
    _cleanup(db)
    token = _login()
    H = {"Authorization": f"Bearer {token}"}
    branch_id = f"{TAG}-BR"

    try:
        # 1) منتجان مُصنّعان: برغر (حبة) + صوص (كغم)
        mp_burger = str(uuid.uuid4())
        mp_sauce = str(uuid.uuid4())
        db.manufactured_products.insert_many([
            {"id": mp_burger, "tenant_id": TENANT, "name": f"{TAG}-برغر", "unit": "حبة",
             "piece_weight": 0, "piece_weight_unit": "", "total_produced": 0},
            {"id": mp_sauce, "tenant_id": TENANT, "name": f"{TAG}-صوص", "unit": "كغم",
             "piece_weight": 0, "piece_weight_unit": "", "total_produced": 0},
        ])

        # 2) منتج بيع نهائي يرتبط بالاثنين: 1 حبة برغر + 20 غرام صوص
        fp_id = str(uuid.uuid4())
        db.products.insert_one({
            "id": fp_id, "tenant_id": TENANT, "name": f"{TAG}-وجبة", "price": 5000,
            "manufactured_links": [
                {"manufactured_product_id": mp_burger, "consumption_qty": 1, "consumption_unit": "حبة"},
                {"manufactured_product_id": mp_sauce, "consumption_qty": 20, "consumption_unit": "غرام"},
            ],
        })

        # 3) مخزون الفرع الحالي (بعد الخصم الحيّ للمبيعات): 100-3=97 برغر، 5-0.06=4.94 صوص
        db.branch_inventory.insert_many([
            {"id": str(uuid.uuid4()), "tenant_id": TENANT, "branch_id": branch_id,
             "product_id": mp_burger, "product_name": f"{TAG}-برغر", "unit": "حبة",
             "quantity": 97, "item_type": "finished"},
            {"id": str(uuid.uuid4()), "tenant_id": TENANT, "branch_id": branch_id,
             "product_id": mp_sauce, "product_name": f"{TAG}-صوص", "unit": "كغم",
             "quantity": 4.94, "item_type": "finished"},
        ])

        # 3ب) جرد اليوم السابق يُحدّد الافتتاحي (100 برغر، 5 صوص)
        from datetime import timedelta as _td
        bd = datetime.now(timezone.utc).date().isoformat()
        prev_date = (datetime.now(timezone.utc).date() - _td(days=1)).isoformat()
        db.branch_stock_counts.insert_one({
            "id": str(uuid.uuid4()), "tenant_id": TENANT, "branch_id": branch_id,
            "business_date": prev_date, "status": "submitted",
            "items": [
                {"product_id": mp_burger, "actual_qty": 100},
                {"product_id": mp_sauce, "actual_qty": 5},
            ],
        })

        # 4) طلب بيع: 3 وجبات اليوم (business_date = اليوم التشغيلي)
        db.orders.insert_one({
            "id": str(uuid.uuid4()), "tenant_id": TENANT, "branch_id": branch_id,
            "status": "completed", "business_date": bd,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "items": [{"product_id": fp_id, "name": f"{TAG}-وجبة", "quantity": 3, "price": 5000}],
        })

        # 5) اجلب قالب الجرد وتحقّق من المباع المُفكَّك
        r = requests.get(f"{API}/branch-stock-count/today",
                         params={"branch_id": branch_id, "business_date": bd}, headers=H, timeout=60)
        assert r.status_code == 200, r.text
        rows = {row["product_id"]: row for row in r.json().get("items", [])}

        assert mp_burger in rows, "صف البرغر مفقود"
        assert mp_sauce in rows, "صف الصوص مفقود"

        # برغر: 3 وجبات × 1 حبة = 3 حبة
        assert abs(rows[mp_burger]["sold_qty"] - 3) < 1e-6, f"sold برغر={rows[mp_burger]['sold_qty']} (متوقع 3)"
        # صوص: 3 × 20 غرام = 60 غرام = 0.06 كغم
        assert abs(rows[mp_sauce]["sold_qty"] - 0.06) < 1e-6, f"sold صوص={rows[mp_sauce]['sold_qty']} (متوقع 0.06)"

        # المتوقع = افتتاحي - مباع
        assert abs(rows[mp_burger]["expected_qty"] - 97) < 1e-6, f"expected برغر={rows[mp_burger]['expected_qty']}"
        assert abs(rows[mp_sauce]["expected_qty"] - 4.94) < 1e-6, f"expected صوص={rows[mp_sauce]['expected_qty']}"
        print("PASS: sold computed with multi-component + unit conversion ✅")
    finally:
        _cleanup(db)


if __name__ == "__main__":
    test_sold_multi_component_with_unit_conversion()
