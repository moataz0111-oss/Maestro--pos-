"""
اختبار حرِج: إصلاح submit_biometric_job_result لسجلات zk-sync
=================================================================
البق الأصلي: عندما ينفّذ الوكيل جوب zk-sync ويُعيد قائمة سجلات الحضور،
كان الباك إند يخزّنها في biometric_queue.result فقط ولا يُدخلها في
biometric_attendance → صفحة الحضور تظهر صفراً لكل الموظفين.

الإصلاح: للجوبات من نوع zk-sync، نستخرج result.records ونُدخلها في
biometric_attendance، ثم نُشغّل _auto_process_attendance_internal.
"""
import os
import uuid
import asyncio
from datetime import datetime, timezone

import pytest
import requests
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))

BACKEND_URL = os.environ.get("BACKEND_URL", "http://localhost:8001")
API = f"{BACKEND_URL}/api"
MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "maestro_pos")
AGENT_KEY = os.environ.get("BIOMETRIC_AGENT_KEY", "")
TENANT = "default"
BRANCH = "76f56acc-6948-4a2f-bbf4-feccbddea88f"


@pytest.fixture(scope="module")
def admin_token():
    r = requests.post(f"{API}/auth/login",
                      json={"email": "admin@maestroegp.com", "password": "admin123"}, timeout=15)
    return r.json()["token"]


def _clean():
    async def clean():
        c = AsyncIOMotorClient(MONGO_URL)
        db_ = c[DB_NAME]
        await db_.biometric_devices.delete_many({"name": {"$regex": "^BUG302-"}})
        await db_.employees.delete_many({"full_name": {"$regex": "^BUG302-EMP"}})
        await db_.biometric_queue.delete_many({"reason": {"$regex": "bug302"}})
        await db_.biometric_attendance.delete_many({"employee_code": {"$in": ["7001", "7002"]}})
        await db_.attendance.delete_many({"employee_id": {"$regex": "^BUG302-"}})
    asyncio.get_event_loop().run_until_complete(clean())


def test_zk_sync_result_creates_biometric_attendance_and_processes(admin_token):
    """
    السيناريو:
    1. أنشئ جهاز + 2 موظفين ببصمة (biometric_uid=7001, 7002).
    2. أنشئ جوب zk-sync يدوياً في biometric_queue بحالة processing.
    3. أرسل نتيجة كوكيل (POST /biometric-queue/{job_id}/result مع X-Agent-Key)
       تحوي 3 سجلات: 7001 دخول+خروج، 7002 دخول فقط.
    4. تأكد: (أ) 3 سجلات في biometric_attendance بمفاتيح صحيحة.
             (ب) 2 سجل في db.attendance بعد المعالجة التلقائية.
             (ج) الاستجابة تحوي inserted=3, auto_processed>=2.
    """
    _clean()
    
    # 1) جهاز
    r = requests.post(f"{API}/biometric/devices",
                      json={"name": "BUG302-DEV", "ip_address": "192.168.99.99",
                            "port": 4370, "branch_id": BRANCH},
                      headers={"Authorization": f"Bearer {admin_token}"}, timeout=15)
    assert r.status_code in (200, 201), r.text
    device_id = r.json()["device"]["id"]
    
    # 2) موظفان ببصمة
    async def seed_emps():
        c = AsyncIOMotorClient(MONGO_URL)
        db_ = c[DB_NAME]
        for uid, name in [("7001", "BUG302-EMP-A"), ("7002", "BUG302-EMP-B")]:
            await db_.employees.insert_one({
                "id": f"BUG302-{uid}",
                "tenant_id": TENANT,
                "branch_id": BRANCH,
                "name": name, "full_name": name,
                "position": "كاشير",
                "biometric_uid": uid,
                "shift_start": "08:00", "shift_end": "17:00",
                "work_hours_per_day": 8,
                "is_active": True,
                "created_at": datetime.now(timezone.utc).isoformat(),
            })
    asyncio.get_event_loop().run_until_complete(seed_emps())
    
    # 3) جوب zk-sync في processing
    job_id = str(uuid.uuid4())
    async def insert_job():
        c = AsyncIOMotorClient(MONGO_URL)
        db_ = c[DB_NAME]
        await db_.biometric_queue.insert_one({
            "id": job_id,
            "type": "zk-sync",
            "params": {"device_id": device_id, "device_ip": "192.168.99.99", "device_port": 4370},
            "status": "processing",
            "branch_id": BRANCH,
            "tenant_id": TENANT,
            "reason": "bug302_test",
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
    asyncio.get_event_loop().run_until_complete(insert_job())
    
    # 4) الوكيل يُرسل النتيجة
    result_payload = {
        "success": True,
        "result": {
            "records": [
                {"uid": "7001", "timestamp": "2026-07-10 08:05:00", "status": 0, "punch_type": "in"},
                {"uid": "7001", "timestamp": "2026-07-10 17:10:00", "status": 1, "punch_type": "out"},
                {"uid": "7002", "timestamp": "2026-07-10 08:20:00", "status": 0, "punch_type": "in"},
            ],
            "count": 3
        }
    }
    r2 = requests.post(f"{API}/biometric-queue/{job_id}/result",
                       json=result_payload,
                       headers={"X-Agent-Key": AGENT_KEY}, timeout=15)
    assert r2.status_code == 200, r2.text
    data = r2.json()
    assert data["ok"] is True
    assert data["inserted"] == 3, f"expected 3 inserted records, got {data.get('inserted')}"
    assert data["auto_processed"] >= 2, f"expected ≥2 processed attendances, got {data.get('auto_processed')}"
    
    # 5) تحقق مباشر في DB
    async def verify():
        c = AsyncIOMotorClient(MONGO_URL)
        db_ = c[DB_NAME]
        bio_count = await db_.biometric_attendance.count_documents({"employee_code": {"$in": ["7001", "7002"]}})
        att_count = await db_.attendance.count_documents({"employee_id": {"$regex": "^BUG302-"}})
        return bio_count, att_count
    bio_count, att_count = asyncio.get_event_loop().run_until_complete(verify())
    assert bio_count == 3, f"biometric_attendance count = {bio_count}"
    assert att_count == 2, f"attendance count = {att_count} (expected one row per employee×date)"


def test_zk_sync_result_dedupes_and_idempotent(admin_token):
    """إعادة إرسال نفس النتيجة لا تُدخل تكراراً."""
    _clean()
    
    r = requests.post(f"{API}/biometric/devices",
                      json={"name": "BUG302-DEV2", "ip_address": "192.168.99.98",
                            "port": 4370, "branch_id": BRANCH},
                      headers={"Authorization": f"Bearer {admin_token}"}, timeout=15)
    device_id = r.json()["device"]["id"]
    
    async def seed():
        c = AsyncIOMotorClient(MONGO_URL)
        db_ = c[DB_NAME]
        await db_.employees.insert_one({
            "id": "BUG302-7001",
            "tenant_id": TENANT, "branch_id": BRANCH,
            "name": "BUG302-EMP-A", "full_name": "BUG302-EMP-A",
            "biometric_uid": "7001", "is_active": True,
            "shift_start": "08:00", "shift_end": "17:00",
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
        await db_.biometric_queue.insert_one({
            "id": "job-dedupe-1",
            "type": "zk-sync",
            "params": {"device_id": device_id},
            "status": "processing",
            "branch_id": BRANCH,
            "tenant_id": TENANT,
            "reason": "bug302_test",
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
        await db_.biometric_queue.insert_one({
            "id": "job-dedupe-2",
            "type": "zk-sync",
            "params": {"device_id": device_id},
            "status": "processing",
            "branch_id": BRANCH,
            "tenant_id": TENANT,
            "reason": "bug302_test",
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
    asyncio.get_event_loop().run_until_complete(seed())
    
    payload = {"success": True, "result": {"records": [
        {"uid": "7001", "timestamp": "2026-07-10 08:05:00", "status": 0, "punch_type": "in"}
    ]}}
    r1 = requests.post(f"{API}/biometric-queue/job-dedupe-1/result",
                       json=payload, headers={"X-Agent-Key": AGENT_KEY}, timeout=15)
    r2 = requests.post(f"{API}/biometric-queue/job-dedupe-2/result",
                       json=payload, headers={"X-Agent-Key": AGENT_KEY}, timeout=15)
    assert r1.json()["inserted"] == 1
    assert r2.json()["inserted"] == 0  # dedup — سجل موجود سابقاً


def test_zk_sync_failure_does_not_process(admin_token):
    """لو الجوب فشل (success=false)، لا سجلات تُدخَل."""
    _clean()
    async def seed():
        c = AsyncIOMotorClient(MONGO_URL)
        db_ = c[DB_NAME]
        await db_.biometric_queue.insert_one({
            "id": "job-fail-1",
            "type": "zk-sync",
            "params": {"device_id": "does-not-matter"},
            "status": "processing",
            "branch_id": BRANCH,
            "tenant_id": TENANT,
            "reason": "bug302_test",
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
    asyncio.get_event_loop().run_until_complete(seed())
    
    r = requests.post(f"{API}/biometric-queue/job-fail-1/result",
                      json={"success": False, "error": "device_unreachable"},
                      headers={"X-Agent-Key": AGENT_KEY}, timeout=15)
    assert r.status_code == 200
    assert r.json()["inserted"] == 0


def test_teardown(admin_token):
    _clean()


if __name__ == "__main__":
    pytest.main([__file__, "-xvs"])
