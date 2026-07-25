"""Regression and high-volume coverage for removal of silent report query caps."""
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
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture(scope="class")
def high_volume_orders():
    """Insert >10k isolated TEST_ orders in the fork DB, then always remove them."""
    mongo_url = backend_env.get("MONGO_URL")
    db_name = backend_env.get("DB_NAME")
    if not mongo_url or not db_name:
        pytest.fail("MONGO_URL/DB_NAME missing from backend/.env")
    client = MongoClient(mongo_url, serverSelectionTimeoutMS=5000)
    db = client[db_name]
    run_id = f"TEST_CAP_{uuid.uuid4().hex}"
    count = 10001
    documents = [
        {
            "id": f"{run_id}_{index}",
            "qa_run_id": run_id,
            "tenant_id": "default",
            "order_number": f"TEST_LIMIT_{index}",
            "status": "completed",
            "is_refunded": False,
            "payment_status": "paid",
            "payment_method": "cash",
            "order_type": "takeaway",
            "subtotal": 1,
            "total": 1,
            "discount": 0,
            "items": [],
            "business_date": "2026-07-25",
            "created_at": "2026-07-25T12:00:00+00:00",
        }
        for index in range(count)
    ]
    result = db.orders.insert_many(documents, ordered=False)
    assert len(result.inserted_ids) == count
    try:
        yield {"run_id": run_id, "count": count}
    finally:
        db.orders.delete_many({"qa_run_id": run_id})
        client.close()


# Authentication and basic API availability regressions.
class TestAuthAndHealthRegression:
    def test_health(self, api_client):
        response = api_client.get(f"{BASE_URL}/api/health", timeout=15)
        assert response.status_code == 200, response.text[:500]
        data = response.json()
        assert data.get("status") == "ok"

    def test_admin_login_triggers_2fa_for_new_device(self, api_client):
        email, password = _credentials()
        response = api_client.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": email, "password": password},
            timeout=30,
        )
        assert response.status_code == 200, response.text[:500]
        data = response.json()
        assert data.get("requires_2fa") is True
        assert isinstance(data.get("verification_id"), str) and data["verification_id"]
        assert data.get("channel") in {"email", "whatsapp", "sms"}


# Management endpoint smoke regressions requested for the admin token.
class TestAdminEndpointRegression:
    @pytest.mark.parametrize(
        "endpoint",
        ["branches", "products", "orders", "expenses", "employees", "shifts"],
    )
    def test_admin_collection_endpoint(self, endpoint, api_client, admin_headers):
        response = api_client.get(
            f"{BASE_URL}/api/{endpoint}", headers=admin_headers, timeout=60
        )
        assert response.status_code == 200, f"{endpoint}: {response.status_code} {response.text[:500]}"
        data = response.json()
        assert isinstance(data, (list, dict)), f"{endpoint}: unexpected payload {type(data)}"


# Cash-closing history must be unlimited both explicitly and by default.
class TestCashClosingUnlimitedHistory:
    def test_limit_zero_and_default_are_identical(self, api_client, admin_headers):
        explicit = api_client.get(
            f"{BASE_URL}/api/reports/cash-register-closings",
            params={"limit": 0},
            headers=admin_headers,
            timeout=60,
        )
        default = api_client.get(
            f"{BASE_URL}/api/reports/cash-register-closings",
            headers=admin_headers,
            timeout=60,
        )
        assert explicit.status_code == 200, explicit.text[:500]
        assert default.status_code == 200, default.text[:500]
        explicit_data = explicit.json()
        default_data = default.json()
        for data in (explicit_data, default_data):
            assert isinstance(data.get("closings"), list)
            assert isinstance(data.get("stats"), dict)
            assert data["stats"].get("total_closings") == len(data["closings"])
        explicit_ids = [row.get("id") for row in explicit_data["closings"]]
        default_ids = [row.get("id") for row in default_data["closings"]]
        assert default_ids == explicit_ids
        assert default_data["stats"] == explicit_data["stats"]


# The requested comprehensive contract should exist and return the stated totals.
class TestComprehensiveReportContract:
    def test_comprehensive_report_contract(self, api_client, admin_headers):
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


# High-volume proof: old .to_list(10000) behavior would return exactly 10,000.
@pytest.mark.usefixtures("high_volume_orders")
class TestReportsAboveTenThousand:
    def test_sales_report_not_capped_at_10000(self, api_client, admin_headers, high_volume_orders):
        response = api_client.get(
            f"{BASE_URL}/api/reports/sales",
            params=DATE_PARAMS,
            headers=admin_headers,
            timeout=180,
        )
        assert response.status_code == 200, response.text[:500]
        data = response.json()
        assert isinstance(data.get("total_sales"), (int, float))
        assert isinstance(data.get("total_orders"), int)
        assert data["total_orders"] >= high_volume_orders["count"]
        assert data["total_orders"] != 10000
        assert data["total_sales"] >= high_volume_orders["count"]

    def test_profit_loss_report_not_capped_at_10000(self, api_client, admin_headers, high_volume_orders):
        response = api_client.get(
            f"{BASE_URL}/api/reports/profit-loss",
            params=DATE_PARAMS,
            headers=admin_headers,
            timeout=180,
        )
        assert response.status_code == 200, response.text[:500]
        data = response.json()
        assert isinstance(data.get("revenue"), dict)
        assert isinstance(data.get("cost_of_goods_sold"), dict)
        assert isinstance(data.get("net_profit"), dict)
        order_count = data["revenue"].get("order_count")
        assert isinstance(order_count, int)
        assert order_count >= high_volume_orders["count"]
        assert order_count != 10000
        assert isinstance(data["revenue"].get("total_sales"), (int, float))
        assert isinstance(data["cost_of_goods_sold"].get("total"), (int, float))
        assert isinstance(data["net_profit"].get("amount"), (int, float))
