"""
اختبارات انحدار (regression) لميزات دورة حياة التوصيل المضافة:
- رفض الطلب من الكاشير: PUT /api/orders/{id}/reject
- تقييم الزبون بعد التسليم: POST /api/track/{id}/rating
- سجل التقييمات للمالك: GET /api/delivery-ratings

تُشغَّل ضد الـ API الحيّ باستخدام REACT_APP_BACKEND_URL.
"""
import os
import re
import requests

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


def _backend_url():
    env_path = os.path.join(ROOT, "frontend", ".env")
    with open(env_path) as f:
        for line in f:
            if line.startswith("REACT_APP_BACKEND_URL"):
                return line.split("=", 1)[1].strip()
    raise RuntimeError("REACT_APP_BACKEND_URL not found")


BASE = _backend_url().rstrip("/") + "/api"
ADMIN = {"email": "admin@maestroegp.com", "password": "admin123"}


def _token():
    r = requests.post(f"{BASE}/auth/login", json=ADMIN, timeout=30)
    r.raise_for_status()
    return r.json()["token"]


def test_reject_requires_auth():
    r = requests.put(f"{BASE}/orders/non-existent/reject", timeout=30)
    assert r.status_code in (401, 403)


def test_reject_unknown_order_404():
    h = {"Authorization": f"Bearer {_token()}"}
    r = requests.put(f"{BASE}/orders/this-order-does-not-exist/reject", headers=h, timeout=30)
    assert r.status_code == 404


def test_rating_unknown_order_404():
    r = requests.post(f"{BASE}/track/this-order-does-not-exist/rating",
                      json={"food_rating": 5}, timeout=30)
    assert r.status_code == 404


def test_delivery_ratings_requires_auth():
    r = requests.get(f"{BASE}/delivery-ratings", timeout=30)
    assert r.status_code in (401, 403)


def test_delivery_ratings_returns_summary_shape():
    h = {"Authorization": f"Bearer {_token()}"}
    r = requests.get(f"{BASE}/delivery-ratings", headers=h, timeout=30)
    assert r.status_code == 200
    data = r.json()
    assert "ratings" in data and isinstance(data["ratings"], list)
    assert "summary" in data
    for k in ("count", "avg_food", "avg_restaurant", "avg_driver"):
        assert k in data["summary"]
