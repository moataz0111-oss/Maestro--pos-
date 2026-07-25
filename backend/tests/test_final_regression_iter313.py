"""Final iter313 backend regression for legacy orders and uncapped reports."""
import os
import re
import uuid
from pathlib import Path

import pytest
import requests
from dotenv import dotenv_values
from pymongo import MongoClient

FRONTEND_ENV = dotenv_values("/app/frontend/.env")
BACKEND_ENV = dotenv_values("/app/backend/.env")
BASE_URL = (os.environ.get("REACT_APP_BACKEND_URL") or FRONTEND_ENV.get("REACT_APP_BACKEND_URL") or "").rstrip("/")
if not BASE_URL:
    raise RuntimeError("REACT_APP_BACKEND_URL is missing")

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
        pytest.fail(f"Admin login failed: {response.status_code} {response.text[:500]}")
    data = response.json()
    token = data.get("token")
    if not token:
        pytest.fail(f"Admin login returned no token: {data}")
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def mongo_db():
    mongo_url = BACKEND_ENV.get("MONGO_URL")
    db_name = BACKEND_ENV.get("DB_NAME")
    if not mongo_url or not db_name:
        pytest.fail("MONGO_URL/DB_NAME missing from backend/.env")
    client = MongoClient(mongo_url, serverSelectionTimeoutMS=5000)
    try:
        yield client[db_name]
    finally:
        client.close()


@pytest.fixture
def high_volume_orders(mongo_db):
    """Insert 10,001 paid orders for the requested report range, then remove them."""
    run_id = f"TEST_ITER313_{uuid.uuid4().hex}"
    count = 10001
    documents = []
    for index in range(count):
        documents.append({
            "id": f"{run_id}_{index}",
            "qa_run_id": run_id,
            "tenant_id": "default",
            "order_number": 900000 + index,
            "order_type": "takeaway",
            "items": [],
            "subtotal": 1.0,
            "total": 1.0,
            "status": "completed",
            "is_refunded": False,
            "payment_status": "paid",
            "payment_method": "cash",
            "business_date": "2026-07-25",
            "created_at": "2026-07-25T12:00:00+00:00",
        })
    result = mongo_db.orders.insert_many(documents, ordered=False)
    assert len(result.inserted_ids) == count
    try:
        yield {"run_id": run_id, "count": count}
    finally:
        mongo_db.orders.delete_many({"qa_run_id": run_id})
        assert mongo_db.orders.count_documents({"qa_run_id": run_id}) == 0


# Basic public health contract.
def test_health(api_client):
    response = api_client.get(f"{BASE_URL}/api/health", timeout=15)
    assert response.status_code == 200, response.text[:500]
    data = response.json()
    assert data.get("status") == "ok"


# Legacy rows must serialize successfully with OrderResponse defaults/optional fields.
def test_orders_returns_legacy_rows_with_defaults(api_client, admin_headers, mongo_db):
    missing_filter = {
        "tenant_id": "default",
        "$or": [{field: {"$exists": False}} for field in ("order_number", "order_type", "items", "subtotal", "total")],
    }
    legacy_docs = list(mongo_db.orders.find(missing_filter, {"_id": 0}).limit(100))
    assert legacy_docs, "No legacy order exists to verify compatibility"

    response = api_client.get(f"{BASE_URL}/api/orders", headers=admin_headers, timeout=120)
    assert response.status_code == 200, response.text[:1000]
    orders = response.json()
    assert isinstance(orders, list)
    by_id = {order["id"]: order for order in orders}

    defaults = {"order_number": 0, "order_type": "dine_in", "subtotal": 0.0, "total": 0.0}
    for source in legacy_docs:
        assert source["id"] in by_id, f"Legacy order {source['id']} was omitted"
        returned = by_id[source["id"]]
        for field, default in defaults.items():
            if field not in source:
                assert returned.get(field) == default, f"{source['id']} missing default {field}"
        if "items" not in source:
            assert "items" not in returned or returned["items"] is None


# Both report readers must count every matching Mongo row beyond the old 10K cap.
def test_profit_loss_and_sales_are_uncapped(api_client, admin_headers, mongo_db, high_volume_orders):
    date_or = [
        {"business_date": {"$gte": "2026-07-01", "$lte": "2026-07-25"}},
        {
            "business_date": {"$exists": False},
            "created_at": {"$gte": "2026-07-01", "$lte": "2026-07-25T23:59:59"},
        },
    ]
    expected_profit_loss = mongo_db.orders.count_documents({
        "tenant_id": "default",
        "status": {"$ne": "cancelled"},
        "$or": date_or,
    })
    expected_sales = mongo_db.orders.count_documents({
        "tenant_id": "default",
        "status": {"$nin": ["cancelled", "refunded"]},
        "is_refunded": {"$ne": True},
        "payment_status": {"$in": ["paid", "credit", None]},
        "$or": date_or,
    })
    assert expected_profit_loss > 10000
    assert expected_sales > 10000

    profit_loss = api_client.get(
        f"{BASE_URL}/api/reports/profit-loss",
        params=DATE_PARAMS,
        headers=admin_headers,
        timeout=240,
    )
    assert profit_loss.status_code == 200, profit_loss.text[:1000]
    profit_data = profit_loss.json()
    assert profit_data["revenue"]["order_count"] == expected_profit_loss
    assert isinstance(profit_data["revenue"]["total_sales"], (int, float))
    assert isinstance(profit_data["net_profit"]["amount"], (int, float))

    sales = api_client.get(
        f"{BASE_URL}/api/reports/sales",
        params=DATE_PARAMS,
        headers=admin_headers,
        timeout=240,
    )
    assert sales.status_code == 200, sales.text[:1000]
    sales_data = sales.json()
    assert sales_data["total_orders"] == expected_sales
    assert isinstance(sales_data["total_sales"], (int, float))


# limit=0 must return the complete deduplicated closing collection.
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


# Minimal collection endpoint regression requested for the release gate.
def test_core_collection_endpoints(api_client, admin_headers):
    failures = []
    for endpoint in ("branches", "products", "expenses", "employees", "shifts"):
        response = api_client.get(f"{BASE_URL}/api/{endpoint}", headers=admin_headers, timeout=60)
        if response.status_code != 200:
            failures.append(f"{endpoint}: {response.status_code} {response.text[:250]}")
            continue
        assert isinstance(response.json(), (list, dict)), f"{endpoint}: invalid payload type"
    assert not failures, "; ".join(failures)
