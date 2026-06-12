"""Iter 238 — Web Push + cashier-only call popup + management alerts (escalation/reject)."""
import os
import time
import uuid
from datetime import datetime, timezone, timedelta

import requests
from dotenv import load_dotenv
from pymongo import MongoClient

load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))
load_dotenv(os.path.join(os.path.dirname(__file__), "..", "..", "frontend", ".env"))

BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
API = f"{BASE_URL}/api"

BRANCH_ID = "76f56acc-6948-4a2f-bbf4-feccbddea88f"
ADMIN_CREDS = {"email": "admin@maestroegp.com", "password": "admin123"}

mc = MongoClient(os.environ["MONGO_URL"])
db = mc[os.environ["DB_NAME"]]


# ---- helpers ----
def admin_token():
    r = requests.post(f"{API}/auth/login", json=ADMIN_CREDS, timeout=15)
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    j = r.json()
    return j.get("token") or j.get("access_token")


def admin_headers():
    return {"Authorization": f"Bearer {admin_token()}"}


# ---- Web Push (P0) ----
def test_vapid_public_key_endpoint():
    r = requests.get(f"{API}/push/vapid-public-key", timeout=15)
    assert r.status_code == 200
    pk = r.json().get("publicKey")
    assert pk and len(pk) > 80
    assert pk == os.environ.get("VAPID_PUBLIC_KEY")


def test_push_subscribe_driver():
    payload = {
        "endpoint": f"https://fcm.googleapis.com/fcm/send/iter238-{uuid.uuid4().hex}",
        "keys": {
            "p256dh": "BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM",
            "auth": "tBHItJI5svbpez7KI4CCXg",
        },
        "phone": "07801111111",
        "user_type": "driver",
    }
    r = requests.post(f"{API}/push/subscribe", json=payload, timeout=15)
    assert r.status_code == 200, r.text
    sub = db.push_subscriptions.find_one({"endpoint": payload["endpoint"]}, {"_id": 0})
    assert sub is not None, "subscription not stored"
    assert sub.get("is_active") is True
    db.push_subscriptions.delete_one({"endpoint": payload["endpoint"]})


# ---- Escalation (5-min not-approved) ----
def _seed_old_cashier_notification(order_id="ESC-TEST-X"):
    # Remove any prior seed for this id (idempotent)
    db.order_notifications.delete_many({"order_id": order_id})
    db.order_notifications.delete_many({"id": f"esc_{order_id}"})
    old_ts = (datetime.now(timezone.utc) - timedelta(minutes=7)).isoformat()
    db.order_notifications.insert_one({
        "id": f"notif-esctest-{uuid.uuid4().hex[:8]}",
        "type": "new_order_cashier",
        "order_id": order_id,
        "order_number": "9998",
        "branch_id": BRANCH_ID,
        "order_type": "delivery",
        "customer_name": "زبون",
        "customer_phone": "07700000000",
        "delivery_address": "عنوان اختبار",
        "total_amount": 25000,
        "items_count": 3,
        "is_read": False,
        "is_printed": False,
        "created_at": old_ts,
    })


def _cleanup(order_id):
    db.order_notifications.delete_many({"order_id": order_id})
    db.order_notifications.delete_many({"id": f"esc_{order_id}"})


def test_escalation_5min_not_approved_creates_alert():
    order_id = "ESC-TEST-X"
    try:
        _seed_old_cashier_notification(order_id)
        h = admin_headers()
        r1 = requests.get(f"{API}/order-notifications/escalations", headers=h, timeout=15)
        assert r1.status_code == 200, r1.text
        data1 = r1.json()
        assert "escalations" in data1 and "count" in data1
        alerts = [a for a in data1["escalations"] if a.get("order_id") == order_id]
        assert len(alerts) == 1, f"expected 1 escalation, got {len(alerts)}: {alerts}"
        a = alerts[0]
        assert a.get("type") == "order_management_alert"
        assert a.get("alert_kind") == "not_approved"
        assert a.get("branch_name") and a["branch_name"] != "غير محدد"
        assert a.get("cashier_name") and a["cashier_name"] != "غير معروف"

        # Idempotency: second call must NOT duplicate alert
        r2 = requests.get(f"{API}/order-notifications/escalations", headers=h, timeout=15)
        assert r2.status_code == 200
        alerts2 = [a for a in r2.json()["escalations"] if a.get("order_id") == order_id]
        assert len(alerts2) == 1, f"alert duplicated: {alerts2}"
    finally:
        _cleanup(order_id)


# ---- Reject flow creates management alert ----
def _create_delivery_order():
    h = admin_headers()
    payload = {
        "order_type": "delivery",
        "branch_id": BRANCH_ID,
        "customer_name": "زبون اختبار",
        "customer_phone": "07710000000",
        "delivery_address": "بغداد - اختبار",
        "items": [
            {"product_id": "test-prod", "product_name": "اختبار", "quantity": 1,
             "price": 10000, "unit_price": 10000, "total": 10000}
        ],
        "subtotal": 10000,
        "total": 10000,
        "payment_method": "cash",
        "status": "pending",
    }
    r = requests.post(f"{API}/orders", headers=h, json=payload, timeout=20)
    assert r.status_code in (200, 201), f"create order failed: {r.status_code} {r.text}"
    return r.json()


def test_reject_order_creates_management_alert():
    h = admin_headers()
    order = _create_delivery_order()
    order_id = order.get("id") or order.get("order_id")
    assert order_id, f"no id returned: {order}"
    try:
        r = requests.put(f"{API}/orders/{order_id}/reject", headers=h, timeout=20)
        assert r.status_code in (200, 204), f"reject failed: {r.status_code} {r.text}"

        # Verify DB flag
        doc = db.orders.find_one({"id": order_id}, {"_id": 0, "is_rejected": 1, "status": 1})
        assert doc and (doc.get("is_rejected") is True or doc.get("status") == "rejected"), doc

        # Allow tiny delay for alert write
        time.sleep(1)
        r2 = requests.get(f"{API}/order-notifications/escalations", headers=h, timeout=15)
        assert r2.status_code == 200
        rejected = [a for a in r2.json()["escalations"]
                    if a.get("order_id") == order_id and a.get("alert_kind") == "rejected"]
        assert len(rejected) >= 1, f"no rejected management alert for {order_id}: {r2.json()}"
        a = rejected[0]
        assert a.get("type") == "order_management_alert"
        assert a.get("branch_id") == BRANCH_ID
    finally:
        db.order_notifications.delete_many({"order_id": order_id})
        db.orders.delete_many({"id": order_id})
