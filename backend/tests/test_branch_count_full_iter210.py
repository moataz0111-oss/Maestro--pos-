"""
اختبارات شاملة لمرحلة (iteration 210) — سلسلة المخزون: تصنيع→تحويل→بيع→جرد→خصم.
يغطي الميزات:
  1) GET /api/branch-stock-count/today — تفكيك المباع بمكوّنات مُصنّعة + تحويل وحدة + expected=opening+received-sold
  2) POST /api/branch-stock-count/submit — حفظ + variance + branch_loss + تحديث branch_inventory
  3) GET /api/branch-stock-count/check — needs_count/can_close قبل/بعد التسجيل
  4) GET /api/branch-stock-count/pending-alerts — يعتمد على وردية مفتوحة (shifts status=open)
  5) GET /api/reports/waste-efficiency?group_by=product — details[] مع المكوّنات (403 للأدوار العادية)
  6) Regression: الفرع الحقيقي 76f56acc... يستجيب 200 بدون أخطاء
نظافة: كل البيانات مُسبَقة بـ PYTEST-I210 وتُحذف في finally.
"""
import os
import uuid
from datetime import datetime, timezone, timedelta

import pytest
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
REAL_BRANCH = "76f56acc-6948-4a2f-bbf4-feccbddea88f"

TAG = "PYTEST-I210"


def _login():
    r = requests.post(f"{API}/auth/login", json={"email": EMAIL, "password": PASSWORD}, timeout=30)
    r.raise_for_status()
    j = r.json()
    return j.get("token") or j.get("access_token")


@pytest.fixture(scope="module")
def token():
    return _login()


@pytest.fixture(scope="module")
def H(token):
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture(scope="module")
def db():
    return MongoClient(MONGO_URL)[DB_NAME]


def _full_cleanup(db):
    db.manufactured_products.delete_many({"name": {"$regex": f"^{TAG}"}})
    db.products.delete_many({"name": {"$regex": f"^{TAG}"}})
    db.branch_inventory.delete_many({"branch_id": {"$regex": f"^{TAG}"}})
    db.orders.delete_many({"branch_id": {"$regex": f"^{TAG}"}})
    db.branch_stock_counts.delete_many({"branch_id": {"$regex": f"^{TAG}"}})
    db.shifts.delete_many({"branch_id": {"$regex": f"^{TAG}"}})
    db.branches.delete_many({"id": {"$regex": f"^{TAG}"}})
    db.inventory_movements.delete_many({"branch_id": {"$regex": f"^{TAG}"}})


@pytest.fixture(autouse=True)
def cleanup_before_after(db):
    _full_cleanup(db)
    yield
    _full_cleanup(db)


# ===================================================================
# 1) المباع المُفكَّك + تحويل وحدة + expected_qty
# ===================================================================
def test_today_template_sold_decomposition_and_expected(db, H):
    branch_id = f"{TAG}-BR1"
    mp_burger, mp_sauce = str(uuid.uuid4()), str(uuid.uuid4())
    db.manufactured_products.insert_many([
        {"id": mp_burger, "tenant_id": TENANT, "name": f"{TAG}-برغر", "unit": "حبة",
         "piece_weight": 0, "piece_weight_unit": "", "total_produced": 0},
        {"id": mp_sauce, "tenant_id": TENANT, "name": f"{TAG}-صوص", "unit": "كغم",
         "piece_weight": 0, "piece_weight_unit": "", "total_produced": 0},
    ])
    fp_id = str(uuid.uuid4())
    db.products.insert_one({
        "id": fp_id, "tenant_id": TENANT, "name": f"{TAG}-وجبة", "price": 5000,
        "manufactured_links": [
            {"manufactured_product_id": mp_burger, "consumption_qty": 1, "consumption_unit": "حبة"},
            {"manufactured_product_id": mp_sauce, "consumption_qty": 20, "consumption_unit": "غرام"},
        ],
    })
    db.branch_inventory.insert_many([
        {"id": str(uuid.uuid4()), "tenant_id": TENANT, "branch_id": branch_id,
         "product_id": mp_burger, "product_name": f"{TAG}-برغر", "unit": "حبة",
         "quantity": 97, "item_type": "finished"},
        {"id": str(uuid.uuid4()), "tenant_id": TENANT, "branch_id": branch_id,
         "product_id": mp_sauce, "product_name": f"{TAG}-صوص", "unit": "كغم",
         "quantity": 4.94, "item_type": "finished"},
    ])
    bd = datetime.now(timezone.utc).date().isoformat()
    prev_date = (datetime.now(timezone.utc).date() - timedelta(days=1)).isoformat()
    db.branch_stock_counts.insert_one({
        "id": str(uuid.uuid4()), "tenant_id": TENANT, "branch_id": branch_id,
        "business_date": prev_date, "status": "submitted",
        "items": [
            {"product_id": mp_burger, "actual_qty": 100},
            {"product_id": mp_sauce, "actual_qty": 5},
        ],
    })
    db.orders.insert_one({
        "id": str(uuid.uuid4()), "tenant_id": TENANT, "branch_id": branch_id,
        "status": "completed", "business_date": bd,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "items": [{"product_id": fp_id, "name": f"{TAG}-وجبة", "quantity": 3, "price": 5000}],
    })

    r = requests.get(f"{API}/branch-stock-count/today",
                     params={"branch_id": branch_id, "business_date": bd}, headers=H, timeout=60)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["has_submitted_today"] is False
    rows = {row["product_id"]: row for row in body["items"]}
    assert mp_burger in rows and mp_sauce in rows
    # المباع المُفكَّك
    assert abs(rows[mp_burger]["sold_qty"] - 3) < 1e-6
    assert abs(rows[mp_sauce]["sold_qty"] - 0.06) < 1e-6
    # expected = opening + received - sold = 100+0-3 = 97  ;  5-0.06=4.94
    assert abs(rows[mp_burger]["expected_qty"] - 97) < 1e-6
    assert abs(rows[mp_sauce]["expected_qty"] - 4.94) < 1e-6
    assert abs(rows[mp_burger]["opening_qty"] - 100) < 1e-6
    assert abs(rows[mp_sauce]["opening_qty"] - 5) < 1e-6


def test_today_empty_branch_returns_200(db, H):
    """فرع فارغ — يجب أن يعيد 200 مع items فارغة بدون خطأ"""
    branch_id = f"{TAG}-EMPTY"
    bd = datetime.now(timezone.utc).date().isoformat()
    r = requests.get(f"{API}/branch-stock-count/today",
                     params={"branch_id": branch_id, "business_date": bd}, headers=H, timeout=60)
    assert r.status_code == 200, r.text
    body = r.json()
    assert "items" in body
    assert isinstance(body["items"], list)
    assert body.get("has_submitted_today") is False


# ===================================================================
# 2) Submit — variance + branch_loss + تحديث المخزون
# ===================================================================
def test_submit_creates_variance_and_branch_loss_and_updates_inventory(db, H):
    branch_id = f"{TAG}-BR2"
    mp = str(uuid.uuid4())
    db.manufactured_products.insert_one({
        "id": mp, "tenant_id": TENANT, "name": f"{TAG}-منتج",
        "unit": "حبة", "piece_weight": 0, "piece_weight_unit": "",
        "total_produced": 0, "unit_cost_after_waste": 1000,
    })
    db.branch_inventory.insert_one({
        "id": str(uuid.uuid4()), "tenant_id": TENANT, "branch_id": branch_id,
        "product_id": mp, "product_name": f"{TAG}-منتج", "unit": "حبة",
        "quantity": 50, "item_type": "finished",
    })
    bd = datetime.now(timezone.utc).date().isoformat()
    # افتتاحي = 50
    db.branch_stock_counts.insert_one({
        "id": str(uuid.uuid4()), "tenant_id": TENANT, "branch_id": branch_id,
        "business_date": (datetime.now(timezone.utc).date() - timedelta(days=1)).isoformat(),
        "status": "submitted",
        "items": [{"product_id": mp, "actual_qty": 50}],
    })

    payload = {
        "branch_id": branch_id, "business_date": bd,
        "items": [{"product_id": mp, "actual_qty": 45, "notes": None}],
        "notes": "اختبار فقد"
    }
    r = requests.post(f"{API}/branch-stock-count/submit", json=payload, headers=H, timeout=60)
    assert r.status_code == 200, r.text
    j = r.json()
    saved = j["count"]
    assert saved["status"] == "submitted"
    it = saved["items"][0]
    # expected=50, actual=45, variance=5
    assert abs(it["variance"] - 5) < 1e-6
    assert abs(it["actual_qty"] - 45) < 1e-6

    # تحقق من تحديث المخزون
    inv = db.branch_inventory.find_one({"branch_id": branch_id, "product_id": mp})
    assert abs(inv["quantity"] - 45) < 1e-6, f"inventory not updated: {inv['quantity']}"

    # تحقق من حركة branch_loss
    loss = db.inventory_movements.find_one({
        "type": "branch_loss", "branch_id": branch_id, "business_date": bd,
    })
    assert loss is not None, "branch_loss movement missing"
    assert abs(loss["quantity"] - 5) < 1e-6


# ===================================================================
# 3) check — needs_count / can_close
# ===================================================================
def test_check_no_inventory_can_close(db, H):
    branch_id = f"{TAG}-EMPTY2"
    r = requests.get(f"{API}/branch-stock-count/check",
                     params={"branch_id": branch_id}, headers=H, timeout=60)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["can_close"] is True
    assert body["needs_count"] is False


def test_check_has_inventory_blocks_close_until_submitted(db, H):
    branch_id = f"{TAG}-BR3"
    mp = str(uuid.uuid4())
    db.manufactured_products.insert_one({
        "id": mp, "tenant_id": TENANT, "name": f"{TAG}-عنصر",
        "unit": "حبة", "piece_weight": 0, "piece_weight_unit": "", "total_produced": 0,
    })
    db.branch_inventory.insert_one({
        "id": str(uuid.uuid4()), "tenant_id": TENANT, "branch_id": branch_id,
        "product_id": mp, "product_name": f"{TAG}-عنصر", "unit": "حبة",
        "quantity": 10, "item_type": "finished",
    })
    bd = datetime.now(timezone.utc).date().isoformat()
    # افتتاحي
    db.branch_stock_counts.insert_one({
        "id": str(uuid.uuid4()), "tenant_id": TENANT, "branch_id": branch_id,
        "business_date": (datetime.now(timezone.utc).date() - timedelta(days=1)).isoformat(),
        "status": "submitted",
        "items": [{"product_id": mp, "actual_qty": 10}],
    })

    # قبل التسجيل
    r1 = requests.get(f"{API}/branch-stock-count/check",
                      params={"branch_id": branch_id, "business_date": bd}, headers=H, timeout=60)
    assert r1.status_code == 200
    b1 = r1.json()
    assert b1["can_close"] is False
    assert b1["needs_count"] is True

    # سجّل الجرد
    payload = {"branch_id": branch_id, "business_date": bd,
               "items": [{"product_id": mp, "actual_qty": 10, "notes": None}]}
    rs = requests.post(f"{API}/branch-stock-count/submit", json=payload, headers=H, timeout=60)
    assert rs.status_code == 200, rs.text

    # بعد التسجيل
    r2 = requests.get(f"{API}/branch-stock-count/check",
                      params={"branch_id": branch_id, "business_date": bd}, headers=H, timeout=60)
    assert r2.status_code == 200
    b2 = r2.json()
    assert b2["can_close"] is True
    assert b2.get("submitted_at") is not None


# ===================================================================
# 4) pending-alerts — يعتمد على وردية مفتوحة (shifts status=open)
# ===================================================================
def test_pending_alerts_only_when_shift_open(db, H):
    branch_id = f"{TAG}-BR4"
    # سجل اسم الفرع
    db.branches.insert_one({"id": branch_id, "tenant_id": TENANT, "name": f"{TAG}-فرع-تنبيه"})
    mp = str(uuid.uuid4())
    db.manufactured_products.insert_one({
        "id": mp, "tenant_id": TENANT, "name": f"{TAG}-مت", "unit": "حبة",
        "piece_weight": 0, "piece_weight_unit": "", "total_produced": 0,
    })
    db.branch_inventory.insert_one({
        "id": str(uuid.uuid4()), "tenant_id": TENANT, "branch_id": branch_id,
        "product_id": mp, "product_name": f"{TAG}-مت", "unit": "حبة",
        "quantity": 7, "item_type": "finished",
    })

    # 4أ) لا توجد وردية مفتوحة لهذا الفرع → غير مدرج
    r0 = requests.get(f"{API}/branch-stock-count/pending-alerts", headers=H, timeout=60)
    assert r0.status_code == 200, r0.text
    body0 = r0.json()
    assert "pending" in body0 and "count" in body0
    assert all(p["branch_id"] != branch_id for p in body0["pending"])

    # 4ب) أنشئ وردية مفتوحة → يجب أن يُدرج
    bd = datetime.now(timezone.utc).date().isoformat()
    db.shifts.insert_one({
        "id": str(uuid.uuid4()), "tenant_id": TENANT, "branch_id": branch_id,
        "status": "open", "business_date": bd,
        "started_at": datetime.now(timezone.utc).isoformat(),
        "opened_at": datetime.now(timezone.utc).isoformat(),
    })
    r1 = requests.get(f"{API}/branch-stock-count/pending-alerts", headers=H, timeout=60)
    assert r1.status_code == 200, r1.text
    body1 = r1.json()
    branch_ids = [p["branch_id"] for p in body1["pending"]]
    assert branch_id in branch_ids, f"branch {branch_id} not in pending: {body1}"
    target = next(p for p in body1["pending"] if p["branch_id"] == branch_id)
    assert target["business_date"] == bd
    assert target["branch_name"] == f"{TAG}-فرع-تنبيه"

    # 4ج) سجّل الجرد → يجب أن يختفي
    payload = {"branch_id": branch_id, "business_date": bd,
               "items": [{"product_id": mp, "actual_qty": 7, "notes": None}]}
    rs = requests.post(f"{API}/branch-stock-count/submit", json=payload, headers=H, timeout=60)
    assert rs.status_code == 200, rs.text

    r2 = requests.get(f"{API}/branch-stock-count/pending-alerts", headers=H, timeout=60)
    assert r2.status_code == 200
    body2 = r2.json()
    assert all(p["branch_id"] != branch_id for p in body2["pending"]), \
        f"branch {branch_id} still pending after submit: {body2}"


# ===================================================================
# 5) waste-efficiency report — details + RBAC
# ===================================================================
def test_waste_efficiency_admin_includes_details_array(H):
    today = datetime.now(timezone.utc).date()
    r = requests.get(
        f"{API}/reports/waste-efficiency",
        params={
            "group_by": "product",
            "start_date": (today - timedelta(days=30)).isoformat(),
            "end_date": today.isoformat(),
        },
        headers=H, timeout=60,
    )
    assert r.status_code == 200, r.text
    j = r.json()
    # يجب أن يحتوي على rows أو صفوف (قد تكون فارغة لو لا توجد حركات إنتاج، لكن يجب أن لا ينكسر)
    rows = j.get("rows") or j.get("data") or j.get("items") or []
    # كل صف يجب أن يحوي details (مصفوفة)
    for row in rows:
        assert "details" in row, f"row missing details key: {list(row.keys())}"
        assert isinstance(row["details"], list)
        for d in row["details"]:
            for k in ("name", "unit", "quantity", "cost_before_waste", "cost_after_waste", "waste_value"):
                assert k in d, f"detail item missing key {k}: {d}"


def test_waste_efficiency_non_admin_forbidden(db, H):
    """دور غير مصرّح يُرجع 403"""
    # أنشئ مستخدم cashier موقت
    import bcrypt
    email = f"{TAG.lower()}cashier@maestroegp.com"
    pwd = "test123"
    pwd_hash = bcrypt.hashpw(pwd.encode(), bcrypt.gensalt()).decode()
    uid = str(uuid.uuid4())
    db.users.delete_many({"email": email})
    db.users.insert_one({
        "id": uid, "tenant_id": TENANT, "email": email, "username": f"{TAG}-cashier",
        "full_name": f"{TAG}-cashier", "password_hash": pwd_hash, "role": "cashier",
        "is_active": True, "created_at": datetime.now(timezone.utc).isoformat(),
    })
    try:
        r = requests.post(f"{API}/auth/login", json={"email": email, "password": pwd}, timeout=30)
        if r.status_code != 200:
            pytest.skip(f"could not login as cashier: {r.status_code} {r.text[:200]}")
        tok = r.json().get("token") or r.json().get("access_token")
        h2 = {"Authorization": f"Bearer {tok}"}
        r2 = requests.get(f"{API}/reports/waste-efficiency",
                          params={"group_by": "product"}, headers=h2, timeout=30)
        assert r2.status_code == 403, f"expected 403 for cashier, got {r2.status_code}: {r2.text[:200]}"
    finally:
        db.users.delete_many({"email": email})


# ===================================================================
# 6) Regression — الفرع الحقيقي
# ===================================================================
def test_real_branch_today_no_errors(H):
    r = requests.get(f"{API}/branch-stock-count/today",
                     params={"branch_id": REAL_BRANCH}, headers=H, timeout=60)
    assert r.status_code == 200, r.text
    j = r.json()
    assert "items" in j and isinstance(j["items"], list)
    assert "business_date" in j


def test_real_branch_check_no_errors(H):
    r = requests.get(f"{API}/branch-stock-count/check",
                     params={"branch_id": REAL_BRANCH}, headers=H, timeout=60)
    assert r.status_code == 200, r.text
    j = r.json()
    assert "can_close" in j and "needs_count" in j


def test_pending_alerts_endpoint_alive(H):
    """Smoke — يستجيب بهيكل صحيح حتى لو لا توجد ورديات مفتوحة"""
    r = requests.get(f"{API}/branch-stock-count/pending-alerts", headers=H, timeout=60)
    assert r.status_code == 200, r.text
    j = r.json()
    assert "pending" in j and "count" in j
    assert isinstance(j["pending"], list)
    assert isinstance(j["count"], int)
