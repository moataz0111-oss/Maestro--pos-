"""
iter296 — دعم شامل لكل موديلات ZKTeco (K/F/G/iFace/MB/SF/UA/…) وكل الأنواع (بصمة/وجه/راحة/كارت/هجين).

المزايا الجديدة:
- POST /api/biometric/devices يقبل حقول: communication_password, force_udp, timeout,
  firmware_version, model_name, protocol → تُخزَّن وتُرسَل ضمن params لكل job.
- PUT /api/biometric/devices/{id} لتحديث إعدادات الجهاز (IP/protocol/password/timeout…).
- POST /api/biometric/devices/{id}/test صار enqueue jop zk-probe-device بدلاً من direct connect.
- GET /api/biometric/devices/models قائمة الموديلات/الأنواع/البروتوكولات المدعومة.
- كل الجوبات الآن تحمل device_type + force_udp + timeout + protocol + model_name.
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
BRANCH_TEST = "76f56acc-6948-4a2f-bbf4-feccbddea88f"


@pytest.fixture(scope="module")
def admin_token():
    r = requests.post(f"{API}/auth/login",
                      json={"email": "admin@maestroegp.com", "password": "admin123"},
                      timeout=15)
    return r.json()["token"]


def _clean():
    import asyncio
    async def clean():
        c = AsyncIOMotorClient(MONGO_URL)
        db_ = c[DB_NAME]
        await db_.biometric_devices.delete_many({"name": {"$regex": "^ZK296-"}})
        await db_.employees.delete_many({"full_name": {"$regex": "^ZK296-EMP-"}})
        await db_.biometric_queue.delete_many({"reason": {"$in": [
            "new_device_initial_sync", "new_employee_auto_push", "manual_connection_test",
            "branch_bulk_sync", "manual_push_all", "employee_update_push", "employee_delete_push"
        ]}})
    asyncio.get_event_loop().run_until_complete(clean())


def test_A_supported_models_catalog(admin_token):
    """A: /biometric/devices/models يُرجع قائمة موديلات ZK المدعومة."""
    r = requests.get(f"{API}/biometric/devices/models",
                     headers={"Authorization": f"Bearer {admin_token}"}, timeout=15)
    assert r.status_code == 200
    data = r.json()
    assert "protocols" in data and len(data["protocols"]) >= 3
    assert "device_types" in data and len(data["device_types"]) >= 5
    assert "supported_models" in data
    # مثال K40, F18, iFace880 لازم يكونوا موجودين
    models = data["supported_models"]
    for expected in ["K40", "F18", "iFace880", "MB360", "SpeedFace-V5L"]:
        assert expected in models, f"expected model {expected} missing"


def test_B_device_created_with_full_zk_options_propagates_to_job_params(admin_token):
    """B: إنشاء جهاز مع كل خيارات ZK — الجوب لازم يحمل نفس الإعدادات."""
    _clean()
    # موظف ببصمة
    import asyncio
    async def seed():
        c = AsyncIOMotorClient(MONGO_URL)
        db_ = c[DB_NAME]
        await db_.employees.insert_one({
            "id": str(uuid.uuid4()), "tenant_id": TENANT, "branch_id": BRANCH_TEST,
            "name": "ZK296-EMP-1", "full_name": "ZK296-EMP-1",
            "biometric_uid": "8001", "is_active": True,
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
    asyncio.get_event_loop().run_until_complete(seed())
    
    r = requests.post(f"{API}/biometric/devices",
                      json={
                          "name": "ZK296-K40-Old",
                          "ip_address": "192.168.1.50",
                          "port": 4370,
                          "branch_id": BRANCH_TEST,
                          "device_type": "fingerprint",
                          "communication_password": "0",
                          "force_udp": True,
                          "timeout": 30,
                          "firmware_version": "Ver 6.60 Mar 26 2015",
                          "model_name": "K40",
                          "protocol": "zk-standard",
                      },
                      headers={"Authorization": f"Bearer {admin_token}"}, timeout=15)
    assert r.status_code in (200, 201), r.text
    data = r.json()
    dev = data["device"]
    assert dev["communication_password"] == "0"
    assert dev["force_udp"] is True
    assert dev["timeout"] == 30
    assert dev["model_name"] == "K40"
    assert dev["protocol"] == "zk-standard"
    
    # افحص أن الجوب يحمل نفس الإعدادات
    async def check():
        c = AsyncIOMotorClient(MONGO_URL)
        db_ = c[DB_NAME]
        job = await db_.biometric_queue.find_one({"params.device_id": dev["id"], "reason": "new_device_initial_sync"})
        return job
    job = asyncio.get_event_loop().run_until_complete(check())
    assert job is not None
    p = job["params"]
    assert p.get("device_type") == "fingerprint"
    assert p.get("communication_password") == "0"
    assert p.get("force_udp") is True
    assert p.get("timeout") == 30
    assert p.get("model_name") == "K40"
    assert p.get("protocol") == "zk-standard"


def test_C_device_update_endpoint(admin_token):
    """C: PUT /biometric/devices/{id} يُحدّث إعدادات ZK."""
    _clean()
    r = requests.post(f"{API}/biometric/devices",
                      json={"name": "ZK296-IF880", "ip_address": "192.168.1.60",
                            "port": 4370, "branch_id": BRANCH_TEST,
                            "device_type": "face", "model_name": "iFace880"},
                      headers={"Authorization": f"Bearer {admin_token}"}, timeout=15)
    device_id = r.json()["device"]["id"]
    
    r2 = requests.put(f"{API}/biometric/devices/{device_id}",
                      json={"port": 5005, "timeout": 60, "communication_password": "1234",
                            "protocol": "zk-push", "device_type": "hybrid"},
                      headers={"Authorization": f"Bearer {admin_token}"}, timeout=15)
    assert r2.status_code == 200, r2.text
    updated = r2.json()
    assert updated["port"] == 5005
    assert updated["timeout"] == 60
    assert updated["communication_password"] == "1234"
    assert updated["protocol"] == "zk-push"
    assert updated["device_type"] == "hybrid"


def test_D_test_connection_now_enqueues_zk_probe_job(admin_token):
    """D: POST /biometric/devices/{id}/test الآن يُنشئ جوب zk-probe-device (بدلاً من direct connect)."""
    _clean()
    r = requests.post(f"{API}/biometric/devices",
                      json={"name": "ZK296-Face", "ip_address": "192.168.1.70",
                            "port": 4370, "branch_id": BRANCH_TEST,
                            "device_type": "face", "model_name": "SpeedFace-V5L",
                            "protocol": "zk-standard", "communication_password": "9999"},
                      headers={"Authorization": f"Bearer {admin_token}"}, timeout=15)
    device_id = r.json()["device"]["id"]
    
    r2 = requests.post(f"{API}/biometric/devices/{device_id}/test",
                       headers={"Authorization": f"Bearer {admin_token}"}, timeout=15)
    assert r2.status_code == 200, r2.text
    data = r2.json()
    assert data.get("success") is True
    assert "job_id" in data
    assert "poll_url" in data
    
    # افحص أن الجوب فعلاً محفوظ وحامل الاعدادات
    import asyncio
    async def check():
        c = AsyncIOMotorClient(MONGO_URL)
        db_ = c[DB_NAME]
        return await db_.biometric_queue.find_one({"id": data["job_id"]})
    job = asyncio.get_event_loop().run_until_complete(check())
    assert job is not None
    assert job["type"] == "zk-probe-device"
    assert job["status"] == "pending"
    assert job["params"]["device_type"] == "face"
    assert job["params"]["model_name"] == "SpeedFace-V5L"
    assert job["params"]["communication_password"] == "9999"


def test_Z_teardown(admin_token):
    _clean()


if __name__ == "__main__":
    pytest.main([__file__, "-xvs"])
