"""Iter246: read receipts and listened receipts for order-chat (text & voice)."""
import io
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL") or open("/app/frontend/.env").read().split("REACT_APP_BACKEND_URL=")[1].split("\n")[0].strip()
BASE_URL = BASE_URL.rstrip("/")

ORDER_ID = "252ccd0a-e564-4a37-bb6c-974f8668169d"


@pytest.fixture
def api():
    s = requests.Session()
    return s


def _get_messages(api):
    r = api.get(f"{BASE_URL}/api/order-chat/{ORDER_ID}")
    assert r.status_code == 200, r.text
    body = r.json()
    if isinstance(body, dict):
        return body.get("messages", [])
    return body


def test_new_text_message_defaults_read_false(api):
    payload = {"order_id": ORDER_ID, "sender": "customer", "sender_name": "TEST_iter246", "text": "TEST_iter246_default_text"}
    r = api.post(f"{BASE_URL}/api/order-chat/{ORDER_ID}", json=payload)
    assert r.status_code in (200, 201), r.text
    msg = r.json()
    assert msg.get("read") is False, f"new text message should default read=false: {msg}"
    # Optional but sensible: listened false / absent
    assert msg.get("listened") in (False, None)
    # Persisted
    all_msgs = _get_messages(api)
    found = [m for m in all_msgs if m.get("id") == msg["id"]]
    assert found, "newly-sent text msg not found"
    assert found[0].get("read") is False


def test_mark_read_marks_other_side_only(api):
    # Customer sends text
    r = api.post(f"{BASE_URL}/api/order-chat/{ORDER_ID}", json={
        "order_id": ORDER_ID, "sender": "customer", "sender_name": "TEST_iter246_C",
        "text": "TEST_iter246_customer_unread_msg"
    })
    assert r.status_code in (200, 201)
    cust_msg_id = r.json()["id"]

    # Driver sends text (this one is from the OTHER side relative to viewer=driver -- must NOT be marked)
    r2 = api.post(f"{BASE_URL}/api/order-chat/{ORDER_ID}", json={
        "order_id": ORDER_ID, "sender": "driver", "sender_name": "TEST_iter246_D",
        "text": "TEST_iter246_driver_msg_should_stay_unread_when_driver_views"
    })
    assert r2.status_code in (200, 201)
    drv_msg_id = r2.json()["id"]

    # viewer=driver -> should mark customer's messages read, NOT driver's
    rr = api.post(f"{BASE_URL}/api/order-chat/{ORDER_ID}/read", params={"viewer": "driver"})
    assert rr.status_code == 200, rr.text
    body = rr.json()
    assert "updated" in body and isinstance(body["updated"], int)
    assert body["updated"] >= 1

    msgs = _get_messages(api)
    by_id = {m["id"]: m for m in msgs}
    assert by_id[cust_msg_id].get("read") is True
    assert by_id[cust_msg_id].get("read_at"), "read_at must be set"
    # Driver-own message must NOT be marked when viewer=driver
    assert by_id[drv_msg_id].get("read") is False, "driver's own message must not be marked read when viewer=driver"


def test_viewer_customer_does_not_mark_own(api):
    # Send a fresh customer text (should be read=false)
    r = api.post(f"{BASE_URL}/api/order-chat/{ORDER_ID}", json={
        "order_id": ORDER_ID, "sender": "customer", "sender_name": "TEST_iter246_C2",
        "text": "TEST_iter246_customer_own_msg_should_stay_unread_when_customer_views"
    })
    assert r.status_code in (200, 201)
    cust_msg_id = r.json()["id"]

    # viewer=customer should NOT mark customer's own
    rr = api.post(f"{BASE_URL}/api/order-chat/{ORDER_ID}/read", params={"viewer": "customer"})
    assert rr.status_code == 200

    msgs = _get_messages(api)
    by_id = {m["id"]: m for m in msgs}
    assert by_id[cust_msg_id].get("read") is False, "customer's own message must NOT be read when viewer=customer"


def _make_webm_bytes():
    # Minimal non-empty bytes claiming webm
    return b"\x1a\x45\xdf\xa3" + b"\x00" * 256


def test_voice_defaults_and_listened_endpoint(api):
    files = {"file": ("test_iter246.webm", io.BytesIO(_make_webm_bytes()), "audio/webm")}
    data = {"sender": "customer", "sender_name": "TEST_iter246_voice", "duration": "1.5"}
    r = api.post(f"{BASE_URL}/api/order-chat/{ORDER_ID}/voice", files=files, data=data)
    assert r.status_code in (200, 201), r.text
    voice_msg = r.json()
    assert voice_msg.get("type") == "voice"
    assert voice_msg.get("read") is False
    assert voice_msg.get("listened") is False
    voice_id = voice_msg["id"]

    # viewer=driver listened endpoint targeting this voice msg
    rl = api.post(f"{BASE_URL}/api/order-chat/{ORDER_ID}/listened/{voice_id}", params={"viewer": "driver"})
    assert rl.status_code == 200, rl.text
    assert rl.json().get("updated") == 1

    msgs = _get_messages(api)
    by_id = {m["id"]: m for m in msgs}
    assert by_id[voice_id].get("listened") is True
    assert by_id[voice_id].get("read") is True
    assert by_id[voice_id].get("listened_at")
    assert by_id[voice_id].get("read_at")


def test_listened_does_not_mark_own_side(api):
    # Customer uploads voice
    files = {"file": ("test_iter246b.webm", io.BytesIO(_make_webm_bytes()), "audio/webm")}
    data = {"sender": "customer", "sender_name": "TEST_iter246_v2", "duration": "1.0"}
    r = api.post(f"{BASE_URL}/api/order-chat/{ORDER_ID}/voice", files=files, data=data)
    assert r.status_code in (200, 201)
    voice_id = r.json()["id"]

    # viewer=customer should NOT mark own voice listened (other side = driver, but message is from customer)
    rl = api.post(f"{BASE_URL}/api/order-chat/{ORDER_ID}/listened/{voice_id}", params={"viewer": "customer"})
    assert rl.status_code == 200
    assert rl.json().get("updated") == 0, "must not mark own voice listened"

    msgs = _get_messages(api)
    by_id = {m["id"]: m for m in msgs}
    assert by_id[voice_id].get("listened") is False
