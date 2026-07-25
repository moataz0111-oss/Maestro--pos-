"""Focused iter312 regression coverage for report cap and legacy-order fixes."""
import os
import re
import uuid
from pathlib import Path

import pytest
import requests
from dotenv import dotenv_values
from pymongo import MongoClient

frontend_env = dotenv_values("/app/frontend/.env")
backend_env = dotenv_values("/app/backend/.env")
base_url = os.environ.get("REACT_APP_BACKEND_URL") or frontend_env.get("REACT_APP_BACKEND_URL")
if not base_url:
    raise RuntimeError("REACT_APP_BACKEND_URL is missing")
BASE_URL = base_url.rstrip("/")
DATE_PARAMS = {"start_date": "2026-07-01", "end_date": "2026-07-25"}
TRUSTED_DEVICE_ID = "test-device-iter295"


def _credentials():
    path = Path("/app/memory/test_credentials.md")
    if not path.exists():
        pytest.skip("Missing /app/memory/test_credentials.md")
    content = path.read_text(encoding="utf-8")
    email = re.search(r"(?im)^- Email:\s*([^\s]+)", content)
    password = re.search(r"(?im)^- Password:\s*([^\s]+)", content)
    if not email or not password:
        pytest.skip("Admin credentials are absent from test_credentials.md")
    return email.group(1), password.group(1)


@pytest.fixture(scope="module")
def api_client():
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    yield session
    session.close()


@pytest.fixture(scope="module")
def admin_headers(api_client):
    email, password = _credentials()
    response = api_client.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": email, "password": password, "device_id": TRUSTED_DEVICE_ID},
        timeout=30,
    )
    if response.status_code != 200:
        pytest.fail(f"Trusted-device login failed: {response.status_code} {response.text[:500]}")
    data = response.json()
    token = data.get("token")
    if not token:
        pytest.fail(f"Trusted-device login returned no token: {data}")
    cookie = response.cookies.get("access_token")
    assert cookie, "Successful login did not set the httpOnly access_token cookie"
    assert "HttpOnly" in response.headers.get("Set-Cookie", "")
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture(scope="module")
def high_volume_legacy_orders():
    """Insert 10,001 isolated orders including one legacy document without total."""
    mongo_url = backend_env.get("MONGO_URL")
    db_name = backend_env.get("DB_NAME")
    if not mongo_url or not db_name:
        pytest.fail("MONGO_URL/DB_NAME missing from backend/.env")
    client = MongoClient(mongo_url, serverSelectionTimeoutMS=5000)
    db = client[db_name]
    run_id = f"TEST_ITER312_{uuid.uuid4().hex}"
    count = 10001
    documents = []
    for index in range(count):
        doc = {
            "id": f"{run_id}_{index}",
            "qa_run_id": run_id,
            "tenant_id": "default",
            "order_number": f"TEST_ITER312_{index}",
            "status": "completed",
            "is_refunded": False,
            "payment_status": "paid",
            "payment_method": "cash",
            "order_type": "takeaway",
            "subtotal": 1,
            "discount": 0,
            "items": [],
            "business_date": "2026-07-25",
            "created_at": "2026-07-25T12:00:00+00:00",
        }
        if index != 0:
            doc["total"] = 1
        documents.append(doc)
    result = db.orders.insert_many(documents, ordered=False)
    assert len(result.inserted_ids) == count
    try:
        yield {"run_id": run_id, "count": count, "expected_test_revenue": count - 1}
    finally:
        db.orders.delete_many({"qa_run_id": run_id})
        remaining = db.orders.count_documents({"qa_run_id": run_id})
        client.close()
        assert remaining == 0


# Core availability and authentication regressions.
def test_health(api_client):
    response = api_client.get(f"{BASE_URL}/api/health", timeout=15)
    assert response.status_code == 200, response.text[:500]
    assert response.json().get("status") == "ok"


def test_admin_login_triggers_2fa(api_client):
    email, password = _credentials()
    response = api_client.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": email, "password": password, "device_id": f"TEST_ITER312_NEW_{uuid.uuid4().hex}"},
        timeout=30,
    )
    assert response.status_code == 200, response.text[:500]
    data = response.json()
    assert data.get("requires_2fa") is True
    assert isinstance(data.get("verification_id"), str) and data["verification_id"]
    assert data.get("channel") in {"email", "whatsapp", "sms"}


# High-volume reports must include all test orders and tolerate the incomplete legacy row.
def test_profit_loss_legacy_and_unlimited(api_client, admin_headers, high_volume_legacy_orders):
    response = api_client.get(
        f"{BASE_URL}/api/reports/profit-loss",
        params=DATE_PARAMS,
        headers=admin_headers,
        timeout=180,
    )
    assert response.status_code == 200, response.text[:1000]
    data = response.json()
    assert data["revenue"]["order_count"] >= high_volume_legacy_orders["count"]
    assert data["revenue"]["order_count"] != 10000
    assert isinstance(data["revenue"]["total_sales"], (int, float))
    assert isinstance(data["net_profit"]["amount"], (int, float))


def test_sales_report_unlimited(api_client, admin_headers, high_volume_legacy_orders):
    response = api_client.get(
        f"{BASE_URL}/api/reports/sales",
        params=DATE_PARAMS,
        headers=admin_headers,
        timeout=180,
    )
    assert response.status_code == 200, response.text[:1000]
    data = response.json()
    assert data["total_orders"] >= high_volume_legacy_orders["count"]
    assert data["total_orders"] != 10000
    assert data["total_sales"] >= high_volume_legacy_orders["expected_test_revenue"]


# Unlimited cash-closing history and requested management collections.
def test_cash_register_closings_limit_zero(api_client, admin_headers):
    response = api_client.get(
        f"{BASE_URL}/api/reports/cash-register-closings",
        params={"limit": 0},
        headers=admin_headers,
        timeout=60,
    )
    assert response.status_code == 200, response.text[:500]
    data = response.json()
    assert isinstance(data.get("closings"), list)
    assert data.get("stats", {}).get("total_closings") == len(data["closings"])


def test_requested_collection_endpoints(api_client, admin_headers):
    failures = []
    for endpoint in ("branches", "products", "expenses", "employees", "shifts"):
        response = api_client.get(f"{BASE_URL}/api/{endpoint}", headers=admin_headers, timeout=60)
        if response.status_code != 200:
            failures.append(f"{endpoint}: {response.status_code} {response.text[:250]}")
            continue
        assert isinstance(response.json(), (list, dict)), f"{endpoint}: invalid payload type"
    assert not failures, "; ".join(failures)


# Previously failing compatibility contracts from iter311.
def test_orders_legacy_records(api_client, admin_headers):
    response = api_client.get(f"{BASE_URL}/api/orders", headers=admin_headers, timeout=90)
    assert response.status_code == 200, response.text[:1000]
    assert isinstance(response.json(), list)


def test_comprehensive_report_contract(api_client, admin_headers):
    response = api_client.get(
        f"{BASE_URL}/api/reports/comprehensive",
        params=DATE_PARAMS,
        headers=admin_headers,
        timeout=120,
    )
    assert response.status_code == 200, response.text[:500]
    data = response.json()
    for field in ("total_revenue", "total_expenses", "net_profit"):
        assert field in data, f"Missing {field}: {data}"
        assert isinstance(data[field], (int, float, dict))
