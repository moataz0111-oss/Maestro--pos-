"""
Regression test: Verify the FULL cashier daily flow works correctly per the user's requirements.

User's requirements (Iraqi Arabic):
1. عند حفظ أول طلب يفتح الوردية للكاشير تلقائياً
2. يفحص إذا كانت له وردية مفتوحة أم لا؛ إن وُجدت يضيف الطلب إليها
3. الوردية المفتوحة يجب أن تكون لهذا اليوم — ليست ليوم سابق ولا يوم جديد
4. يتحقق من تاريخ الوردية
5. يجب أن يكون إغلاق الصندوق مطابقاً للمبيعات لكل كاشير + مطابقاً للمصاريف + مطابقاً لكل عمل الكاشير

Scenarios tested:
A. Cashier without shift → submits order → shift opens with today's business_date
B. Cashier with STALE open shift (yesterday) → submits order → old shift auto-closed, new one opened for today
C. Cashier with valid open shift (today) → order attaches to existing shift (no duplicate)
D. Two orders from same cashier in same day → both attach to same shift
E. Cash register summary shows exact totals matching cashier's orders
"""
import os
import time
import uuid
import subprocess
from datetime import datetime, timezone, timedelta

import bcrypt
import pytest
import requests
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))

BACKEND_URL = os.environ.get("BACKEND_URL", "http://localhost:8001")
API = f"{BACKEND_URL}/api"
MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "test_database")
TENANT = "default"
BRANCH_ID = "76f56acc-6948-4a2f-bbf4-feccbddea88f"


def iraq_business_date_str():
    return (datetime.now(timezone.utc) + timedelta(hours=3)).strftime("%Y-%m-%d")


@pytest.fixture(scope="module")
async def db():
    client = AsyncIOMotorClient(MONGO_URL)
    return client[DB_NAME]


@pytest.fixture(scope="module")
def cashier_test():
    """يُنشئ أو يجد كاشير اختبار مع صلاحيات كاملة."""
    import asyncio
    async def setup():
        client = AsyncIOMotorClient(MONGO_URL)
        db_ = client[DB_NAME]
        email = "cashier-lazy-shift@maestroegp.com"
        user = await db_.users.find_one({"email": email}, {"_id": 0})
        if not user:
            uid = str(uuid.uuid4())
            await db_.users.insert_one({
                "id": uid, "username": "cashier_lazy",
                "email": email,
                "password": bcrypt.hashpw(b"test1234", bcrypt.gensalt()).decode(),
                "full_name": "كاشير لازي شفت",
                "role": "cashier", "branch_id": BRANCH_ID, "tenant_id": TENANT,
                "is_active": True, "permissions": [],
                "created_at": datetime.now(timezone.utc).isoformat(),
            })
            user = await db_.users.find_one({"email": email}, {"_id": 0})
        return user
    return asyncio.get_event_loop().run_until_complete(setup())


@pytest.fixture(scope="module")
def cashier_token(cashier_test):
    r = requests.post(f"{API}/auth/login",
                      json={"email": cashier_test["email"], "password": "test1234"},
                      timeout=15)
    assert r.status_code == 200, f"cashier login failed: {r.text}"
    return r.json()["token"]


def _clean_cashier_shifts(cashier_id):
    """يمسح ورديات الكاشير من ديه بي بشكل مباشر (للاختبار فقط)."""
    import asyncio
    async def _clean():
        client = AsyncIOMotorClient(MONGO_URL)
        db_ = client[DB_NAME]
        await db_.shifts.delete_many({"cashier_id": cashier_id})
        await db_.orders.delete_many({"cashier_id": cashier_id, "order_number": {"$gte": 990100}})
    asyncio.get_event_loop().run_until_complete(_clean())


def _get_product(token=None):
    """يجد أي منتج صالح لاستخدامه في الطلبات."""
    headers = {"Authorization": f"Bearer {token}"} if token else {}
    r = requests.get(f"{API}/products", headers=headers, timeout=10)
    if r.status_code == 200:
        products = r.json()
        for p in products:
            if p.get("price", 0) > 0 and p.get("branch_id") == BRANCH_ID:
                return p
        for p in products:
            if p.get("price", 0) > 0:
                return p
    return None


def _submit_order(token, product, customer_suffix=""):
    """يُرسل طلباً ويُرجع الاستجابة. customer_suffix يُغيّر البصمة لتفادي الـdedup في الاختبارات."""
    unique = str(uuid.uuid4())[:8]
    payload = {
        "branch_id": BRANCH_ID,
        "order_type": "takeaway",
        "payment_method": "cash",
        "customer_name": f"test-{unique}{customer_suffix}",
        "items": [{
            "product_id": product["id"],
            "product_name": product.get("name", "منتج تجربة"),
            "price": float(product["price"]),
            "quantity": 1,
            "extras": [],
            "unit_type": product.get("unit_type", "piece"),
        }],
        "subtotal": float(product["price"]),
        "discount": 0,
        "total": float(product["price"]),
        "offline_id": f"lazy-shift-test-{unique}",
    }
    r = requests.post(f"{API}/orders", json=payload,
                      headers={"Authorization": f"Bearer {token}"}, timeout=15)
    return r


def test_A_cashier_without_shift_first_order_opens_shift(cashier_test, cashier_token):
    """السيناريو A: كاشير بدون وردية → أول طلب → تُفتح وردية باليوم الحالي."""
    _clean_cashier_shifts(cashier_test["id"])
    time.sleep(0.5)
    product = _get_product(cashier_token)
    assert product is not None, "لا يوجد منتج للاختبار — يجب seed المنتجات أولاً"
    
    r = _submit_order(cashier_token, product)
    assert r.status_code in (200, 201), f"first order failed: {r.text}"
    order = r.json()
    assert order.get("shift_id"), "الطلب لم يُربط بأي وردية!"
    
    # تحقق أن الوردية موجودة و business_date = اليوم
    r2 = requests.get(f"{API}/shifts/current",
                      headers={"Authorization": f"Bearer {cashier_token}"}, timeout=10)
    assert r2.status_code == 200
    shift = r2.json()
    assert shift.get("status") == "open", f"shift not open: {shift}"
    assert shift.get("business_date") == iraq_business_date_str(), \
        f"business_date mismatch: {shift.get('business_date')} vs today {iraq_business_date_str()}"
    assert shift["id"] == order["shift_id"], "shift_id mismatch between order and shift!"


def test_B_stale_shift_auto_closes_and_new_opens(cashier_test, cashier_token):
    """السيناريو B: وردية من الأمس مفتوحة → أول طلب اليوم → القديمة تُغلَق ووردية جديدة تُفتح."""
    _clean_cashier_shifts(cashier_test["id"])
    time.sleep(0.5)
    
    # اصنع وردية "من الأمس" مباشرة في DB
    import asyncio
    async def _seed_stale():
        client = AsyncIOMotorClient(MONGO_URL)
        db_ = client[DB_NAME]
        yesterday = (datetime.now(timezone.utc) - timedelta(days=1))
        yesterday_biz = (datetime.now(timezone.utc) + timedelta(hours=3) - timedelta(days=1)).strftime("%Y-%m-%d")
        await db_.shifts.insert_one({
            "id": f"stale-shift-{cashier_test['id'][:8]}",
            "tenant_id": TENANT, "branch_id": BRANCH_ID,
            "cashier_id": cashier_test["id"],
            "cashier_name": cashier_test["full_name"],
            "started_at": yesterday.isoformat(),
            "opened_at": yesterday.isoformat(),
            "status": "open",
            "opening_balance": 0,
            "business_date": yesterday_biz,
            "created_at": yesterday.isoformat(),
        })
        return yesterday_biz
    yesterday_biz = asyncio.get_event_loop().run_until_complete(_seed_stale())
    
    product = _get_product(cashier_token)
    r = _submit_order(cashier_token, product)
    assert r.status_code in (200, 201), f"order failed: {r.text}"
    order = r.json()
    new_shift_id = order.get("shift_id")
    
    # الوردية القديمة يجب أن تكون closed الآن + الطلب في وردية جديدة
    import asyncio
    async def _check():
        client = AsyncIOMotorClient(MONGO_URL)
        db_ = client[DB_NAME]
        stale = await db_.shifts.find_one({"id": f"stale-shift-{cashier_test['id'][:8]}"}, {"_id": 0})
        new_shift = await db_.shifts.find_one({"id": new_shift_id}, {"_id": 0})
        return stale, new_shift
    stale, new_shift = asyncio.get_event_loop().run_until_complete(_check())
    
    assert stale is not None
    assert stale.get("status") == "closed", f"stale shift should be closed, got {stale.get('status')}"
    assert stale.get("auto_close_reason") == "stale_business_date_next_day_order"
    
    assert new_shift is not None
    assert new_shift.get("business_date") == iraq_business_date_str()
    assert new_shift.get("status") == "open"
    assert new_shift["id"] != f"stale-shift-{cashier_test['id'][:8]}"


def test_C_two_orders_same_day_same_shift(cashier_test, cashier_token):
    """السيناريو C: طلبان في نفس اليوم من نفس الكاشير → نفس الوردية."""
    _clean_cashier_shifts(cashier_test["id"])
    time.sleep(0.5)
    product = _get_product(cashier_token)
    
    r1 = _submit_order(cashier_token, product)
    assert r1.status_code in (200, 201)
    o1 = r1.json()
    
    time.sleep(0.3)
    r2 = _submit_order(cashier_token, product)
    assert r2.status_code in (200, 201)
    o2 = r2.json()
    
    assert o1["shift_id"] == o2["shift_id"], \
        f"Two same-day orders got different shifts! {o1['shift_id']} vs {o2['shift_id']}"


def test_D_summary_matches_exact_cashier_sales(cashier_test, cashier_token):
    """السيناريو D: ملخص الصندوق يطابق مبيعات الكاشير بالضبط."""
    _clean_cashier_shifts(cashier_test["id"])
    time.sleep(0.5)
    product = _get_product(cashier_token)
    price = float(product["price"])
    
    for _ in range(3):
        r = _submit_order(cashier_token, product)
        assert r.status_code in (200, 201)
        time.sleep(0.2)
    
    # جلب الوردية النشطة
    r = requests.get(f"{API}/shifts/current",
                     headers={"Authorization": f"Bearer {cashier_token}"}, timeout=10)
    assert r.status_code == 200
    shift_id = r.json()["id"]
    
    # ملخص الصندوق
    r = requests.get(f"{API}/cash-register/summary?shift_id={shift_id}",
                     headers={"Authorization": f"Bearer {cashier_token}"}, timeout=10)
    assert r.status_code == 200, f"summary failed: {r.text}"
    s = r.json()
    
    expected_total = price * 3
    actual_total = float(s.get("total_sales") or 0)
    assert abs(actual_total - expected_total) < 1, \
        f"Sales mismatch! expected {expected_total}, got {actual_total}"
    assert int(s.get("total_orders") or 0) == 3
    assert abs(float(s.get("cash_sales") or 0) - expected_total) < 1


if __name__ == "__main__":
    pytest.main([__file__, "-xvs"])
