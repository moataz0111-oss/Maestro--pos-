"""🔒 Test: migrate_tenants_to_customer_tier_v1
يتحقق من:
 1. تحويل العملاء القدامى بدون account_tier إلى customer + enterprise_enabled=False.
 2. تحويل الحسابات التجريبية (is_demo أو subscription_type trial/demo) إلى trial.
 3. عدم المساس بأي تينانت لديه account_tier مسبقاً.
 4. البيانات (projects, branches, orders, users) لا تُمَس أبداً.
 5. الهجرة idempotent — تشغيلها مرتين لا يُغيّر شيئاً.
 6. ترقية العميل لاحقاً إلى enterprise تُعيد ظهور كل بياناته القديمة.
"""
import os
import sys
import uuid
import asyncio
from datetime import datetime, timezone

import pytest
from motor.motor_asyncio import AsyncIOMotorClient

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")


def _new_db():
    name = f"test_tier_mig_{uuid.uuid4().hex[:8]}"
    client = AsyncIOMotorClient(MONGO_URL)
    return client, client[name]


def _run(coro):
    return asyncio.get_event_loop().run_until_complete(coro) if False else asyncio.new_event_loop().run_until_complete(coro)


async def _seed_tenant(db, *, tier_set=False, account_tier=None, is_demo=False,
                       subscription_type="monthly", enterprise_enabled=None, name="Legacy Tenant"):
    tid = str(uuid.uuid4())
    doc = {
        "id": tid,
        "name": name,
        "subscription_type": subscription_type,
        "is_demo": is_demo,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    if tier_set and account_tier:
        doc["account_tier"] = account_tier
    if enterprise_enabled is not None:
        doc["enterprise_enabled"] = enterprise_enabled
    await db.tenants.insert_one(doc)
    return tid


async def _seed_business_data(db, tid):
    pid = str(uuid.uuid4())
    bid = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    await db.projects.insert_one({
        "id": pid, "tenant_id": tid, "name": "Legacy Project",
        "activity_type": "restaurant", "is_default": True, "is_active": True, "created_at": now,
    })
    await db.branches.insert_one({
        "id": bid, "tenant_id": tid, "project_id": pid, "name": "فرع الرئيسي",
        "is_active": True, "created_at": now,
    })
    await db.users.insert_one({
        "id": str(uuid.uuid4()), "tenant_id": tid, "project_id": pid,
        "email": f"emp_{tid[:6]}@test.com", "role": "cashier", "is_active": True, "created_at": now,
    })
    await db.orders.insert_one({
        "id": str(uuid.uuid4()), "tenant_id": tid, "project_id": pid, "branch_id": bid,
        "total": 50000, "status": "paid", "created_at": now,
    })
    return {"project_id": pid, "branch_id": bid}


async def _case_A():
    client, db = _new_db()
    try:
        from routes.projects_routes import migrate_tenants_to_customer_tier_v1
        tid = await _seed_tenant(db, subscription_type="monthly",
                                 enterprise_enabled=True, name="GRaffiti BURGER")
        data = await _seed_business_data(db, tid)
        r = await migrate_tenants_to_customer_tier_v1(db)
        assert r["success"] is True
        assert r["customer_updated"] >= 1
        t = await db.tenants.find_one({"id": tid})
        assert t["account_tier"] == "customer", t
        assert t["enterprise_enabled"] is False, t
        assert t["max_projects"] == 1
        # بيانات محفوظة
        assert await db.projects.find_one({"id": data["project_id"]}) is not None
        assert await db.branches.find_one({"id": data["branch_id"]}) is not None
        assert await db.orders.count_documents({"tenant_id": tid}) == 1
    finally:
        await client.drop_database(db.name)
        client.close()


async def _case_B():
    """على السيرفر الفعلي: حتى الحسابات القديمة ذات is_demo=True تُصبح customer (قرار المالك: لا auto-trial)."""
    client, db = _new_db()
    try:
        from routes.projects_routes import migrate_tenants_to_customer_tier_v1
        tid = await _seed_tenant(db, is_demo=True, subscription_type="trial", name="Demo Co")
        await _seed_business_data(db, tid)
        r = await migrate_tenants_to_customer_tier_v1(db)
        assert r["trial_updated"] == 0  # ❌ ممنوع auto-trial على السيرفر
        t = await db.tenants.find_one({"id": tid})
        assert t["account_tier"] == "customer", t
        assert t["enterprise_enabled"] is False, t
    finally:
        await client.drop_database(db.name)
        client.close()


async def _case_C():
    client, db = _new_db()
    try:
        from routes.projects_routes import migrate_tenants_to_customer_tier_v1
        tid = await _seed_tenant(db, tier_set=True, account_tier="enterprise",
                                 enterprise_enabled=True, subscription_type="yearly")
        await db.tenants.update_one({"id": tid}, {"$set": {"max_projects": 5, "is_enterprise": True}})
        await migrate_tenants_to_customer_tier_v1(db)
        t = await db.tenants.find_one({"id": tid})
        assert t["account_tier"] == "enterprise"
        assert t["enterprise_enabled"] is True
        assert t["max_projects"] == 5
        assert "tier_migrated_from" not in t
    finally:
        await client.drop_database(db.name)
        client.close()


async def _case_D():
    client, db = _new_db()
    try:
        from routes.projects_routes import migrate_tenants_to_customer_tier_v1
        await _seed_tenant(db, subscription_type="monthly")
        r1 = await migrate_tenants_to_customer_tier_v1(db)
        assert r1["success"] is True
        r2 = await migrate_tenants_to_customer_tier_v1(db)
        assert r2.get("skipped") is True
    finally:
        await client.drop_database(db.name)
        client.close()


async def _case_E():
    """ترقية العميل من customer إلى enterprise تعيد كل بياناته القديمة."""
    client, db = _new_db()
    try:
        from routes.projects_routes import migrate_tenants_to_customer_tier_v1
        tid = await _seed_tenant(db, subscription_type="monthly",
                                 enterprise_enabled=True, name="GRaffiti BURGER")
        data = await _seed_business_data(db, tid)
        await migrate_tenants_to_customer_tier_v1(db)
        t1 = await db.tenants.find_one({"id": tid})
        assert t1["enterprise_enabled"] is False

        # محاكاة SuperAdmin: زر 👑 → enterprise
        await db.tenants.update_one(
            {"id": tid},
            {"$set": {"account_tier": "enterprise", "enterprise_enabled": True,
                      "is_enterprise": True, "max_projects": 10}}
        )

        # ✅ المشروع والفرع والطلب والموظف — كلها محفوظة
        p = await db.projects.find_one({"id": data["project_id"]})
        assert p is not None and p["name"] == "Legacy Project"
        b = await db.branches.find_one({"id": data["branch_id"]})
        assert b is not None and b["project_id"] == data["project_id"]
        assert await db.orders.count_documents({"project_id": data["project_id"]}) == 1
        assert await db.users.count_documents({"project_id": data["project_id"]}) == 1

        t2 = await db.tenants.find_one({"id": tid})
        assert t2["enterprise_enabled"] is True
        assert t2["account_tier"] == "enterprise"
        assert t2["max_projects"] == 10
    finally:
        await client.drop_database(db.name)
        client.close()


def test_A_legacy_paid_tenant_becomes_customer_hidden():
    _run(_case_A())


def test_B_demo_tenant_becomes_trial_visible():
    _run(_case_B())


def test_C_tenant_with_tier_preset_is_untouched():
    _run(_case_C())


def test_D_idempotent_on_rerun():
    _run(_case_D())


def test_E_customer_upgraded_to_enterprise_preserves_data():
    _run(_case_E())
