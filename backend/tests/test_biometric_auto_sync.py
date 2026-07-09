"""
Regression test: Biometric device auto-sync + auto-push + branch bulk sync.

User's requirements (Iraqi Arabic):
1. عند إضافة جهاز بصمة لفرع، يجب أن يُصدر لجميع الموظفين تلقائياً (auto-sync all existing employees)
2. عند إنشاء موظف جديد، يجب أن يُصدر تلقائياً لكل أجهزة البصمة في فرعه
3. يجب أن يعمل مع 100 جهاز لعميل واحد أو عبر كل العملاء
4. مزامنة كل أجهزة الفرع دفعة واحدة (Bulk branch sync)
5. عند تحديث biometric_uid لموظف → تلقائياً push لكل أجهزة الفرع
6. عند حذف موظف ببصمة → تلقائياً delete-user لكل أجهزة الفرع

Scenarios tested:
A. Add device to branch with 3 existing employees → 3 push jobs enqueued
B. Create new employee in branch with 5 devices → 5 push jobs enqueued
C. Manual re-push endpoint /biometric/devices/{id}/push-all-users works
D. Employees without biometric_uid are skipped (not enqueued)
E. Branch-level bulk sync endpoint /biometric/branches/{branch_id}/sync-all-devices
F. Employee update with biometric_uid → push jobs for all branch devices
G. Employee delete with biometric_uid → delete-user jobs for all branch devices
H. Queue status endpoint returns correct per-branch counts
"""
import os
import uuid
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
TENANT = "default"
BRANCH_TEST = "76f56acc-6948-4a2f-bbf4-feccbddea88f"  # main branch for testing


@pytest.fixture(scope="module")
def admin_token():
    r = requests.post(f"{API}/auth/login",
                      json={"email": "admin@maestroegp.com", "password": "admin123"},
                      timeout=15)
    return r.json()["token"]


def _clean_biometric_test_data():
    import asyncio
    async def clean():
        c = AsyncIOMotorClient(MONGO_URL)
        db_ = c[DB_NAME]
        await db_.biometric_devices.delete_many({"name": {"$regex": "^BIO-TEST-"}})
        await db_.employees.delete_many({"$or": [
            {"biometric_uid": {"$in": ["9001", "9002", "9003", "9099", "9100"]}},
            {"biometric_id": {"$in": ["9001", "9002", "9003", "9099", "9100"]}},
            {"full_name": {"$regex": "^بصمة اختبار "}},
            {"name": {"$regex": "^بصمة اختبار "}}
        ]})
        await db_.biometric_queue.delete_many({"auto_generated": True, "reason": {"$in": [
            "new_device_initial_sync", "new_employee_auto_push", "manual_push_all",
            "branch_bulk_sync", "employee_update_push", "employee_delete_push"
        ]}})
    asyncio.get_event_loop().run_until_complete(clean())


def _seed_employees(count, has_bio_uid=True):
    """يزرع موظفين للاختبار — يُرجع قائمة biometric_uids."""
    import asyncio
    async def seed():
        c = AsyncIOMotorClient(MONGO_URL)
        db_ = c[DB_NAME]
        bio_uids = []
        for i in range(count):
            bio_uid = f"90{10 + i:02d}" if has_bio_uid else None
            doc = {
                "id": str(uuid.uuid4()),
                "tenant_id": TENANT,
                "branch_id": BRANCH_TEST,
                "name": f"بصمة اختبار موظف {i+1}",
                "full_name": f"بصمة اختبار موظف {i+1}",
                "position": "كاشير",
                "is_active": True,
                "created_at": datetime.now(timezone.utc).isoformat(),
            }
            if bio_uid:
                doc["biometric_uid"] = bio_uid
                bio_uids.append(bio_uid)
            await db_.employees.insert_one(doc)
        return bio_uids
    return asyncio.get_event_loop().run_until_complete(seed())


def _count_pending_jobs(reason=None, device_id=None, job_type=None):
    import asyncio
    async def count():
        c = AsyncIOMotorClient(MONGO_URL)
        db_ = c[DB_NAME]
        q = {"status": "pending", "auto_generated": True}
        if reason:
            q["reason"] = reason
        if device_id:
            q["params.device_id"] = device_id
        if job_type:
            q["type"] = job_type
        return await db_.biometric_queue.count_documents(q)
    return asyncio.get_event_loop().run_until_complete(count())


def test_A_new_device_auto_pushes_all_branch_employees(admin_token):
    """A: إضافة جهاز لفرع فيه 3 موظفين ببصمة → 3 جوبات push تلقائياً."""
    _clean_biometric_test_data()
    _seed_employees(3, has_bio_uid=True)
    
    r = requests.post(f"{API}/biometric/devices",
                      json={"name": "BIO-TEST-DEV-A", "ip_address": "192.168.1.201",
                            "port": 4370, "branch_id": BRANCH_TEST, "device_type": "fingerprint"},
                      headers={"Authorization": f"Bearer {admin_token}"}, timeout=15)
    assert r.status_code in (200, 201), f"create device failed: {r.text}"
    data = r.json()
    assert data.get("auto_sync_enqueued") == 3, f"expected 3 jobs, got {data.get('auto_sync_enqueued')}"
    device_id = data["device"]["id"]
    
    count = _count_pending_jobs(reason="new_device_initial_sync", device_id=device_id)
    assert count == 3, f"expected 3 pending jobs for device, got {count}"


def test_B_new_employee_auto_pushes_to_all_branch_devices(admin_token):
    """B: إنشاء موظف جديد في فرع فيه 5 أجهزة → 5 جوبات push تلقائياً."""
    _clean_biometric_test_data()
    
    for i in range(5):
        r = requests.post(f"{API}/biometric/devices",
                          json={"name": f"BIO-TEST-DEV-B{i}", "ip_address": f"192.168.1.{210+i}",
                                "port": 4370, "branch_id": BRANCH_TEST, "device_type": "fingerprint"},
                          headers={"Authorization": f"Bearer {admin_token}"}, timeout=15)
        assert r.status_code in (200, 201)
    
    r = requests.post(f"{API}/employees",
                      json={
                          "name": "بصمة اختبار موظف جديد",
                          "position": "كاشير",
                          "salary_type": "monthly",
                          "salary": 500000,
                          "branch_id": BRANCH_TEST,
                          "biometric_uid": "9099",
                          "phone": "0770000000",
                          "hire_date": "2026-07-07",
                      },
                      headers={"Authorization": f"Bearer {admin_token}"}, timeout=15)
    assert r.status_code in (200, 201), f"create employee failed: {r.text}"
    
    count = _count_pending_jobs(reason="new_employee_auto_push")
    assert count == 5, f"expected 5 pending jobs, got {count}"


def test_C_manual_push_all_users_endpoint(admin_token):
    """C: endpoint إعادة المزامنة اليدوية يعمل — يُنشئ جوبات لكل الموظفين."""
    _clean_biometric_test_data()
    _seed_employees(4, has_bio_uid=True)
    
    r = requests.post(f"{API}/biometric/devices",
                      json={"name": "BIO-TEST-DEV-C", "ip_address": "192.168.1.220",
                            "port": 4370, "branch_id": BRANCH_TEST, "device_type": "fingerprint"},
                      headers={"Authorization": f"Bearer {admin_token}"}, timeout=15)
    device_id = r.json()["device"]["id"]
    
    # امسح كل الجوبات الأولية
    import asyncio
    async def clean_jobs():
        c = AsyncIOMotorClient(MONGO_URL)
        db_ = c[DB_NAME]
        await db_.biometric_queue.delete_many({"params.device_id": device_id})
    asyncio.get_event_loop().run_until_complete(clean_jobs())
    
    r2 = requests.post(f"{API}/biometric/devices/{device_id}/push-all-users",
                       headers={"Authorization": f"Bearer {admin_token}"}, timeout=15)
    assert r2.status_code == 200, f"push-all-users failed: {r2.text}"
    assert r2.json().get("enqueued") == 4


def test_D_employees_without_biometric_uid_are_skipped(admin_token):
    """D: موظفون بلا biometric_uid يُتخطون (لا جوبات تُنشأ لهم)."""
    _clean_biometric_test_data()
    _seed_employees(2, has_bio_uid=True)   # 2 ببصمة
    _seed_employees(3, has_bio_uid=False)  # 3 بدون بصمة (نتخطاها)
    
    r = requests.post(f"{API}/biometric/devices",
                      json={"name": "BIO-TEST-DEV-D", "ip_address": "192.168.1.230",
                            "port": 4370, "branch_id": BRANCH_TEST, "device_type": "fingerprint"},
                      headers={"Authorization": f"Bearer {admin_token}"}, timeout=15)
    assert r.status_code in (200, 201)
    assert r.json().get("auto_sync_enqueued") == 2, "should only enqueue for employees with biometric_uid"


def test_E_branch_bulk_sync_all_devices(admin_token):
    """E: مزامنة كل أجهزة فرع دفعة واحدة — 3 أجهزة × 4 موظفين = 12 جوب."""
    _clean_biometric_test_data()
    _seed_employees(4, has_bio_uid=True)
    
    # أنشئ 3 أجهزة
    for i in range(3):
        r = requests.post(f"{API}/biometric/devices",
                          json={"name": f"BIO-TEST-DEV-E{i}", "ip_address": f"192.168.1.{240+i}",
                                "port": 4370, "branch_id": BRANCH_TEST, "device_type": "fingerprint"},
                          headers={"Authorization": f"Bearer {admin_token}"}, timeout=15)
        assert r.status_code in (200, 201)
    
    # امسح كل الجوبات الأولية (initial sync)
    import asyncio
    async def clean_jobs():
        c = AsyncIOMotorClient(MONGO_URL)
        db_ = c[DB_NAME]
        await db_.biometric_queue.delete_many({"reason": "new_device_initial_sync"})
    asyncio.get_event_loop().run_until_complete(clean_jobs())
    
    # الآن استدعِ bulk sync للفرع كله
    r = requests.post(f"{API}/biometric/branches/{BRANCH_TEST}/sync-all-devices",
                      headers={"Authorization": f"Bearer {admin_token}"}, timeout=15)
    assert r.status_code == 200, f"branch bulk sync failed: {r.text}"
    data = r.json()
    assert data.get("devices_count") == 3, f"expected 3 devices, got {data.get('devices_count')}"
    assert data.get("employees_count") == 4, f"expected 4 employees, got {data.get('employees_count')}"
    assert data.get("total_enqueued") == 12, f"expected 12 jobs, got {data.get('total_enqueued')}"


def test_F_employee_update_biometric_uid_pushes_to_devices(admin_token):
    """F: تحديث biometric_uid لموظف → push تلقائي لكل أجهزة الفرع."""
    _clean_biometric_test_data()
    
    # أنشئ جهازين
    for i in range(2):
        requests.post(f"{API}/biometric/devices",
                      json={"name": f"BIO-TEST-DEV-F{i}", "ip_address": f"192.168.1.{250+i}",
                            "port": 4370, "branch_id": BRANCH_TEST, "device_type": "fingerprint"},
                      headers={"Authorization": f"Bearer {admin_token}"}, timeout=15)
    
    # أنشئ موظف بلا بصمة
    r = requests.post(f"{API}/employees",
                      json={
                          "name": "بصمة اختبار للتحديث",
                          "position": "كاشير",
                          "salary_type": "monthly",
                          "salary": 500000,
                          "branch_id": BRANCH_TEST,
                          "phone": "0770000001",
                          "hire_date": "2026-07-07",
                      },
                      headers={"Authorization": f"Bearer {admin_token}"}, timeout=15)
    assert r.status_code in (200, 201)
    emp_id = r.json()["id"]
    
    # لا جوبات employee_update بعد (الموظف بلا بصمة أصلاً)
    assert _count_pending_jobs(reason="employee_update_push") == 0
    
    # الآن حدّث الـ biometric_uid
    r2 = requests.put(f"{API}/employees/{emp_id}",
                      json={"biometric_uid": "9100"},
                      headers={"Authorization": f"Bearer {admin_token}"}, timeout=15)
    assert r2.status_code == 200, f"update failed: {r2.text}"
    
    # يجب أن يُنشأ جوبان (واحد لكل جهاز)
    count = _count_pending_jobs(reason="employee_update_push")
    assert count == 2, f"expected 2 update-push jobs, got {count}"


def test_G_employee_delete_enqueues_delete_user_jobs(admin_token):
    """G: حذف موظف ببصمة → delete-user job لكل أجهزة الفرع."""
    _clean_biometric_test_data()
    
    # جهازان
    for i in range(2):
        requests.post(f"{API}/biometric/devices",
                      json={"name": f"BIO-TEST-DEV-G{i}", "ip_address": f"192.168.1.{260+i}",
                            "port": 4370, "branch_id": BRANCH_TEST, "device_type": "fingerprint"},
                      headers={"Authorization": f"Bearer {admin_token}"}, timeout=15)
    
    # موظف ببصمة
    r = requests.post(f"{API}/employees",
                      json={
                          "name": "بصمة اختبار للحذف",
                          "position": "كاشير",
                          "salary_type": "monthly",
                          "salary": 500000,
                          "branch_id": BRANCH_TEST,
                          "phone": "0770000002",
                          "hire_date": "2026-07-07",
                          "biometric_uid": "9100",
                      },
                      headers={"Authorization": f"Bearer {admin_token}"}, timeout=15)
    assert r.status_code in (200, 201)
    emp_id = r.json()["id"]
    
    # احذف الموظف
    r2 = requests.delete(f"{API}/employees/{emp_id}",
                         headers={"Authorization": f"Bearer {admin_token}"}, timeout=15)
    assert r2.status_code == 200, f"delete failed: {r2.text}"
    
    # يجب أن يُنشأ delete-user job لكل جهاز
    count = _count_pending_jobs(reason="employee_delete_push", job_type="zk-delete-user")
    assert count == 2, f"expected 2 delete-user jobs, got {count}"


def test_H_queue_status_endpoint(admin_token):
    """H: نقطة نهاية إحصائيات الطابور تعرض العدّاد لكل فرع."""
    _clean_biometric_test_data()
    _seed_employees(2, has_bio_uid=True)
    
    requests.post(f"{API}/biometric/devices",
                  json={"name": "BIO-TEST-DEV-H", "ip_address": "192.168.1.270",
                        "port": 4370, "branch_id": BRANCH_TEST, "device_type": "fingerprint"},
                  headers={"Authorization": f"Bearer {admin_token}"}, timeout=15)
    
    r = requests.get(f"{API}/biometric/queue/status?branch_id={BRANCH_TEST}",
                     headers={"Authorization": f"Bearer {admin_token}"}, timeout=15)
    assert r.status_code == 200, f"queue status failed: {r.text}"
    data = r.json()
    assert data.get("branch_id") == BRANCH_TEST
    assert data.get("pending", 0) >= 2, f"expected ≥2 pending jobs, got {data.get('pending')}"
    assert "processing" in data
    assert "completed" in data
    assert "failed" in data


def test_Z_teardown(admin_token):
    """Z: نظافة نهائية — إزالة بيانات الاختبار."""
    _clean_biometric_test_data()


if __name__ == "__main__":
    pytest.main([__file__, "-xvs"])
