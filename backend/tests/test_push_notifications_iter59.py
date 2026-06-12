"""Regression tests for real Web Push (VAPID + pywebpush) — iter59."""
import os
import json
import requests
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))

BASE = "http://localhost:8001/api"


def test_vapid_public_key_exposed():
    r = requests.get(f"{BASE}/push/vapid-public-key", timeout=10)
    assert r.status_code == 200
    pk = r.json().get("publicKey")
    assert pk and len(pk) > 80, "VAPID public key must be returned"
    assert pk == os.environ.get("VAPID_PUBLIC_KEY")


def test_subscribe_driver_push():
    payload = {
        "endpoint": "https://fcm.googleapis.com/fcm/send/pytest-driver",
        "keys": {
            "p256dh": "BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM",
            "auth": "tBHItJI5svbpez7KI4CCXg",
        },
        "phone": "07801111111",
        "user_type": "driver",
    }
    r = requests.post(f"{BASE}/push/subscribe", json=payload, timeout=10)
    assert r.status_code == 200


def test_webpush_signing_valid():
    """The VAPID private key must produce a valid signed request the push service accepts."""
    from pywebpush import webpush, WebPushException

    sub = {
        "endpoint": "https://fcm.googleapis.com/fcm/send/pytest-dead-endpoint",
        "keys": {
            "p256dh": "BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM",
            "auth": "tBHItJI5svbpez7KI4CCXg",
        },
    }
    try:
        webpush(
            subscription_info=sub,
            data=json.dumps({"title": "t", "body": "b"}),
            vapid_private_key=os.environ["VAPID_PRIVATE_KEY"],
            vapid_claims={"sub": os.environ["VAPID_SUBJECT"]},
        )
    except WebPushException as e:
        status = getattr(getattr(e, "response", None), "status_code", None)
        # 404/410 => request was authenticated; endpoint just doesn't exist. Signing is valid.
        assert status in (400, 404, 410), f"unexpected push status {status}: {e}"
