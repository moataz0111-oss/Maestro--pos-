"""Regression: /delivery-orders 'all orders' tab — app + internal delivery; excludes delivery companies; summary matches categories. iter60."""
import os
import requests
from datetime import datetime, timezone
from pymongo import MongoClient
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))

API = os.environ.get("REACT_APP_BACKEND_URL", "")
if not API:
    with open(os.path.join(os.path.dirname(__file__), "..", "..", "frontend", ".env")) as f:
        for line in f:
            if line.startswith("REACT_APP_BACKEND_URL"):
                API = line.split("=", 1)[1].strip()
BASE = f"{API}/api"
BRANCH = "76f56acc-6948-4a2f-bbf4-feccbddea88f"
db = MongoClient(os.environ["MONGO_URL"])[os.environ["DB_NAME"]]


def _token():
    r = requests.post(f"{BASE}/auth/login", json={"email": "admin@maestroegp.com", "password": "admin123"}, timeout=10)
    return r.json()["token"]


def _seed():
    now = datetime.now(timezone.utc).isoformat()
    db.orders.delete_many({"id": {"$regex": "^AUDITTEST-"}})
    base = dict(tenant_id="default", branch_id=BRANCH, order_type="delivery", created_at=now, total=15000,
                items=[{"product_name": "برغر", "quantity": 1, "price": 15000}])
    db.orders.insert_many([
        {**base, "id": "AUDITTEST-APP", "order_number": "T101", "status": "pending", "source": "customer_app", "customer_name": "زبون التطبيق"},
        {**base, "id": "AUDITTEST-INT", "order_number": "T102", "status": "out_for_delivery", "accepted_at": now, "driver_id": "d1", "driver_name": "سائق المطعم"},
        {**base, "id": "AUDITTEST-CO", "order_number": "T103", "status": "delivered", "is_delivery_company": True, "delivery_app_name": "توترز"},
        {**base, "id": "AUDITTEST-REJ", "order_number": "T104", "status": "cancelled", "is_rejected": True, "source": "customer_app"},
    ])


def _cleanup():
    db.orders.delete_many({"id": {"$regex": "^AUDITTEST-"}})


def test_delivery_orders_includes_app_and_internal_excludes_companies():
    _seed()
    try:
        today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        r = requests.get(f"{BASE}/delivery-orders", params={"date": today, "branch_id": BRANCH},
                         headers={"Authorization": f"Bearer {_token()}"}, timeout=15)
        assert r.status_code == 200
        data = r.json()
        nums = {o["order_number"]: o for o in data["orders"] if o["order_number"].startswith("T")}
        # app order + internal delivery order present
        assert "T101" in nums and "T102" in nums and "T104" in nums
        # delivery-company order excluded
        assert "T103" not in nums
        # internal delivery shows restaurant driver
        assert nums["T102"]["driver_name"] == "سائق المطعم"
        # summary counts match the actual categories (consistency)
        s = data["summary"]
        cats = {}
        for o in nums.values():
            cats[o["category"]] = cats.get(o["category"], 0) + 1
        assert s["rejected"] == cats.get("rejected", 0) >= 1
        assert s["accepted"] == cats.get("accepted", 0)  # pending must NOT inflate 'accepted'
        assert s["preparing"] == cats.get("preparing", 0) >= 1
    finally:
        _cleanup()
