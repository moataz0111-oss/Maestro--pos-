"""iter296: verify DELETE /api/biometric/devices/{id} cancels pending jobs and /models endpoint via public URL."""
import os
import requests
import time

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://multi-cashier-vault.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"
BRANCH_ID = "76f56acc-6948-4a2f-bbf4-feccbddea88f"


def _login():
    r = requests.post(f"{API}/auth/login", json={"email": "admin@maestroegp.com", "password": "admin123"}, timeout=30)
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    return {"Authorization": f"Bearer {r.json()['token']}"}


def test_models_endpoint_public_url():
    h = _login()
    r = requests.get(f"{API}/biometric/devices/models", headers=h, timeout=20)
    assert r.status_code == 200, r.text
    data = r.json()
    assert "protocols" in data and "device_types" in data and "supported_models" in data
    proto_ids = [p["id"] for p in data["protocols"]]
    assert "zk-standard" in proto_ids and "zk-push" in proto_ids and "pull-sdk" in proto_ids
    dt_ids = [d["id"] for d in data["device_types"]]
    for t in ["fingerprint", "face", "palm", "rfid", "hybrid"]:
        assert t in dt_ids, f"missing device_type {t}"


def test_delete_device_cancels_pending_jobs():
    h = _login()
    # create device
    payload = {
        "name": f"ZK296-DEL-{int(time.time())}",
        "ip_address": "10.99.99.99",  # unreachable so probe stays pending
        "port": 4370,
        "branch_id": BRANCH_ID,
        "device_type": "fingerprint",
        "protocol": "zk-standard",
        "timeout": 5,
    }
    r = requests.post(f"{API}/biometric/devices", headers=h, json=payload, timeout=30)
    assert r.status_code in (200, 201), r.text
    dev = r.json()
    device_id = dev.get("id") or dev.get("device", {}).get("id")
    assert device_id, dev

    # enqueue a probe job so we have something pending
    r2 = requests.post(f"{API}/biometric/devices/{device_id}/test", headers=h, timeout=30)
    assert r2.status_code == 200, r2.text
    probe = r2.json()
    assert probe.get("success") is True
    assert "job_id" in probe

    # delete device
    r3 = requests.delete(f"{API}/biometric/devices/{device_id}", headers=h, timeout=30)
    assert r3.status_code == 200, r3.text
    body = r3.json()
    assert body.get("success") is True
    assert body.get("cancelled_jobs", 0) >= 1, f"expected >=1 cancelled_jobs, got {body}"
