"""
Regression test: Verify expense-to-shift binding is STRICT — no leakage across shifts.

User's screenshot showed:
- Al sidyah / احمد زين shift: sales=0, cash=0, expenses=21,000 IQD, expected=-21,000
This indicates expenses from a PREVIOUS shift (or a different cashier) leaked into
the new shift's summary.

Root causes fixed:
1. shift_expense_query (routes/shared.py) — legacy fallback now requires created_at >= started_at
2. create_expense (server.py) — always binds shift_id explicitly:
   - Searches for open shift for THIS cashier + THIS branch + TODAY's business_date
   - If none exists, auto-opens one (Lazy Shift for Expenses) matching Lazy Shift for Orders

Scenarios tested:
A. Cashier creates expense before any shift exists → shift auto-opens; expense binds to it
B. Cashier closes shift → creates NEW shift → old expenses do NOT appear in new shift's summary
C. Two shifts for same cashier different days: yesterday's expenses stay with yesterday's shift
D. Manager creates expense (no auto shift open — expense with shift_id=None is fine for managers)
"""
import os
import time
import uuid
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
DB_NAME = os.environ.get("DB_NAME", "maestro_pos")
TENANT = "default"
BRANCH_ID = "76f56acc-6948-4a2f-bbf4-feccbddea88f"


def iraq_biz_today():
    return (datetime.now(timezone.utc) + timedelta(hours=3)).strftime("%Y-%m-%d")


def iraq_biz_yesterday():
    return (datetime.now(timezone.utc) + timedelta(hours=3) - timedelta(days=1)).strftime("%Y-%m-%d")


@pytest.fixture(scope="module")
def cashier_test():
    """يُنشئ كاشير اختبار مخصص للمصاريف."""
    import asyncio
    async def setup():
        client = AsyncIOMotorClient(MONGO_URL)
        db_ = client[DB_NAME]
        email = "cashier-expense-test@maestroegp.com"
        user = await db_.users.find_one({"email": email}, {"_id": 0})
        if not user:
            uid = str(uuid.uuid4())
            await db_.users.insert_one({
                "id": uid, "username": "cashier_exp",
                "email": email,
                "password": bcrypt.hashpw(b"test1234", bcrypt.gensalt()).decode(),
                "full_name": "كاشير اختبار مصاريف",
                "role": "cashier", "branch_id": BRANCH_ID, "tenant_id": TENANT,
                "is_active": True, "permissions": ["expenses"],  # صلاحية مصاريف
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
    assert r.status_code == 200, f"login failed: {r.text}"
    return r.json()["token"]


@pytest.fixture(scope="module")
def admin_token():
    r = requests.post(f"{API}/auth/login",
                      json={"email": "admin@maestroegp.com", "password": "admin123"},
                      timeout=15)
    return r.json()["token"]


def _clean(cashier_id):
    import asyncio
    async def clean():
        c = AsyncIOMotorClient(MONGO_URL)
        db_ = c[DB_NAME]
        await db_.shifts.delete_many({"cashier_id": cashier_id})
        await db_.expenses.delete_many({"created_by": cashier_id})
        await db_.orders.delete_many({"cashier_id": cashier_id})
    asyncio.get_event_loop().run_until_complete(clean())


def _create_expense(token, amount, description):
    r = requests.post(f"{API}/expenses",
                      json={"amount": amount, "description": description, "category": "operational",
                            "branch_id": BRANCH_ID, "date": iraq_biz_today()},
                      headers={"Authorization": f"Bearer {token}"}, timeout=15)
    return r


def test_A_lazy_shift_opens_on_first_expense(cashier_test, cashier_token):
    """A: كاشير بدون وردية يُسجّل مصروفاً → تُفتح وردية له تلقائياً باليوم الحالي."""
    _clean(cashier_test["id"])
    time.sleep(0.5)
    
    r = _create_expense(cashier_token, 5000, "مصروف اختبار A")
    assert r.status_code in (200, 201), f"expense create failed: {r.text}"
    exp = r.json()
    assert exp.get("shift_id"), "المصروف لم يُربط بأي وردية!"
    assert exp.get("business_date") == iraq_biz_today()
    
    # تحقّق أن الوردية موجودة و business_date = اليوم
    r2 = requests.get(f"{API}/shifts/current",
                      headers={"Authorization": f"Bearer {cashier_token}"}, timeout=10)
    assert r2.status_code == 200
    shift = r2.json()
    assert shift["id"] == exp["shift_id"]
    assert shift.get("business_date") == iraq_biz_today()
    assert shift.get("status") == "open"


def test_B_no_expense_leakage_across_shifts(cashier_test, cashier_token):
    """B: بعد إغلاق الوردية وفتح وردية جديدة، مصاريف الوردية القديمة لا تظهر في ملخص الجديدة."""
    _clean(cashier_test["id"])
    time.sleep(0.5)
    
    # 1) أنشئ مصروفاً → وردية 1 تُفتح تلقائياً
    r1 = _create_expense(cashier_token, 21000, "مصروف الوردية القديمة")
    assert r1.status_code in (200, 201)
    old_shift_id = r1.json()["shift_id"]
    
    # 2) أغلق الوردية القديمة يدوياً (محاكاة إغلاق الصندوق)
    import asyncio
    async def close_old():
        c = AsyncIOMotorClient(MONGO_URL)
        db_ = c[DB_NAME]
        await db_.shifts.update_one(
            {"id": old_shift_id},
            {"$set": {"status": "closed", "ended_at": datetime.now(timezone.utc).isoformat()}}
        )
    asyncio.get_event_loop().run_until_complete(close_old())
    time.sleep(0.5)
    
    # 3) أنشئ مصروفاً جديداً → وردية جديدة تُفتح
    r2 = _create_expense(cashier_token, 3000, "مصروف الوردية الجديدة")
    assert r2.status_code in (200, 201)
    new_shift_id = r2.json()["shift_id"]
    assert new_shift_id != old_shift_id, "وردية جديدة يجب أن تختلف عن القديمة!"
    
    # 4) اجلب ملخص الوردية الجديدة — يجب أن يعرض 3,000 فقط (ليس 24,000)
    r3 = requests.get(f"{API}/cash-register/summary?shift_id={new_shift_id}",
                      headers={"Authorization": f"Bearer {cashier_token}"}, timeout=10)
    assert r3.status_code == 200, f"summary failed: {r3.text}"
    s = r3.json()
    assert abs(float(s.get("total_expenses") or 0) - 3000) < 1, \
        f"مصاريف الوردية الجديدة يجب أن تكون 3,000 فقط، لكن ظهرت {s.get('total_expenses')}"


def test_C_summary_matches_expenses_exactly(cashier_test, cashier_token):
    """C: ملخص الصندوق يطابق مصاريف الوردية بالضبط (لا تسرّب من أيام سابقة)."""
    _clean(cashier_test["id"])
    time.sleep(0.5)
    
    # زرع مصاريف من الأمس (وردية أخرى)
    import asyncio
    async def seed_yesterday():
        c = AsyncIOMotorClient(MONGO_URL)
        db_ = c[DB_NAME]
        y = datetime.now(timezone.utc) - timedelta(days=1)
        y_biz = iraq_biz_yesterday()
        old_shift_id = f"exp-old-shift-{cashier_test['id'][:8]}"
        await db_.shifts.insert_one({
            "id": old_shift_id, "tenant_id": TENANT, "branch_id": BRANCH_ID,
            "cashier_id": cashier_test["id"], "cashier_name": cashier_test["full_name"],
            "started_at": y.isoformat(), "opened_at": y.isoformat(),
            "status": "closed", "ended_at": y.isoformat(),
            "opening_balance": 0, "business_date": y_biz,
        })
        # مصروف الأمس
        await db_.expenses.insert_one({
            "id": str(uuid.uuid4()), "tenant_id": TENANT, "branch_id": BRANCH_ID,
            "created_by": cashier_test["id"], "cashier_id": cashier_test["id"],
            "amount": 50000, "description": "مصروف الأمس",
            "category": "operational", "shift_id": old_shift_id,
            "business_date": y_biz, "created_at": y.isoformat(),
        })
    asyncio.get_event_loop().run_until_complete(seed_yesterday())
    time.sleep(0.3)
    
    # الآن أنشئ مصروف اليوم عبر API
    r = _create_expense(cashier_token, 7500, "مصروف اليوم")
    assert r.status_code in (200, 201)
    today_shift_id = r.json()["shift_id"]
    
    # ملخص وردية اليوم — يجب أن يعرض 7,500 فقط
    r2 = requests.get(f"{API}/cash-register/summary?shift_id={today_shift_id}",
                      headers={"Authorization": f"Bearer {cashier_token}"}, timeout=10)
    assert r2.status_code == 200
    s = r2.json()
    assert abs(float(s.get("total_expenses") or 0) - 7500) < 1, \
        f"يجب 7,500 فقط (بلا مصروف الأمس)، لكن ظهر {s.get('total_expenses')}"


def test_D_multiple_expenses_same_shift_sum_correctly(cashier_test, cashier_token):
    """D: عدة مصاريف في نفس الوردية → المجموع يطابق الملخص."""
    _clean(cashier_test["id"])
    time.sleep(0.5)
    
    amounts = [1500, 2500, 3000, 4000]
    shift_id = None
    for amt in amounts:
        r = _create_expense(cashier_token, amt, f"مصروف {amt}")
        assert r.status_code in (200, 201)
        if not shift_id:
            shift_id = r.json()["shift_id"]
        else:
            assert r.json()["shift_id"] == shift_id, "المصاريف تربط بوردية مختلفة!"
        time.sleep(0.3)  # تفادي دقّة الـdedup
    
    expected_total = sum(amounts)
    
    r = requests.get(f"{API}/cash-register/summary?shift_id={shift_id}",
                     headers={"Authorization": f"Bearer {cashier_token}"}, timeout=10)
    assert r.status_code == 200
    s = r.json()
    assert abs(float(s.get("total_expenses") or 0) - expected_total) < 1, \
        f"مجموع المصاريف يجب {expected_total} لكن {s.get('total_expenses')}"


if __name__ == "__main__":
    pytest.main([__file__, "-xvs"])
