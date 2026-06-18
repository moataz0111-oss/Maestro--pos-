"""Backend tests for new order-chat endpoints (customer<->driver, no auth)."""
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://pwa-driver-track.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"


@pytest.fixture(scope="module")
def admin_token():
    r = requests.post(f"{API}/auth/login", json={
        "email": "admin@maestroegp.com", "password": "admin123"
    }, timeout=30)
    assert r.status_code == 200, r.text
    return r.json()["token"]


@pytest.fixture(scope="module")
def test_order_id(admin_token):
    """Use an existing order so chat endpoints don't 404."""
    headers = {"Authorization": f"Bearer {admin_token}"}
    r = requests.get(f"{API}/orders?limit=1", headers=headers, timeout=30)
    if r.status_code == 200:
        d = r.json()
        orders = d if isinstance(d, list) else d.get("orders", [])
        if orders:
            return orders[0]["id"]
    pytest.skip(f"No existing order to test chat: {r.status_code} {r.text[:150]}")


def test_get_chat_empty_on_existing_order(test_order_id):
    r = requests.get(f"{API}/order-chat/{test_order_id}", timeout=30)
    assert r.status_code == 200, r.text
    assert "messages" in r.json()
    assert isinstance(r.json()["messages"], list)


def test_post_customer_message(test_order_id):
    r = requests.post(f"{API}/order-chat/{test_order_id}", json={
        "sender": "customer", "sender_name": "TEST_customer", "text": "مرحبا يا سائق"
    }, timeout=30)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["sender"] == "customer"
    assert body["text"] == "مرحبا يا سائق"
    assert body["order_id"] == test_order_id
    assert "id" in body and "created_at" in body
    assert "_id" not in body


def test_post_driver_message(test_order_id):
    r = requests.post(f"{API}/order-chat/{test_order_id}", json={
        "sender": "driver", "sender_name": "TEST_driver", "text": "أنا في الطريق"
    }, timeout=30)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["sender"] == "driver"
    assert body["text"] == "أنا في الطريق"


def test_get_returns_both_messages_sorted(test_order_id):
    r = requests.get(f"{API}/order-chat/{test_order_id}", timeout=30)
    assert r.status_code == 200
    msgs = r.json()["messages"]
    assert len(msgs) >= 2
    senders = [m["sender"] for m in msgs]
    assert "customer" in senders and "driver" in senders
    # Sorted ascending by created_at
    ts = [m["created_at"] for m in msgs]
    assert ts == sorted(ts)


def test_empty_text_returns_400(test_order_id):
    r = requests.post(f"{API}/order-chat/{test_order_id}", json={
        "sender": "customer", "text": "   "
    }, timeout=30)
    assert r.status_code == 400, r.text


def test_nonexistent_order_returns_404():
    fake = "non-existent-" + uuid.uuid4().hex
    r = requests.post(f"{API}/order-chat/{fake}", json={
        "sender": "customer", "text": "hello"
    }, timeout=30)
    assert r.status_code == 404, r.text


def test_driver_order_info_endpoint(test_order_id):
    """The existing endpoint used by tracking screen — must not 500."""
    r = requests.get(f"{API}/driver/order-driver-info/{test_order_id}", timeout=30)
    assert r.status_code == 200, r.text
    body = r.json()
    assert "order_status" in body
