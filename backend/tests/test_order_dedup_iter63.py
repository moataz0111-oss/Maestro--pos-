"""Regression: order duplication prevention (content-fingerprint dedup, 150s window, table_id-aware). iter63.

Reproduces the Sidiya #34/#35 duplicate scenario: two identical rapid submissions must
produce ONE order, while a different table must NOT be merged.
"""
import os
import requests
from pymongo import MongoClient
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))

API = ""
with open(os.path.join(os.path.dirname(__file__), "..", "..", "frontend", ".env")) as f:
    for line in f:
        if line.startswith("REACT_APP_BACKEND_URL"):
            API = line.split("=", 1)[1].strip()
BASE = f"{API}/api"
BRANCH = "76f56acc-6948-4a2f-bbf4-feccbddea88f"
db = MongoClient(os.environ["MONGO_URL"])[os.environ["DB_NAME"]]


def _token():
    r = requests.post(f"{BASE}/auth/login", json={"email": "cashier1@maestroegp.com", "password": "cash123"}, timeout=10)
    return r.json()["token"]


def _product_id():
    p = db.products.find_one({}, {"_id": 0, "id": 1})
    return p["id"]


def _payload(pid, table=None):
    d = {
        "branch_id": BRANCH, "order_type": "dine_in", "customer_name": "زبون_تست_تكرار",
        "items": [{"product_id": pid, "product_name": "برغر", "quantity": 2, "price": 14000}],
        "subtotal": 28000, "total": 28000, "payment_method": "cash",
    }
    if table:
        d["table_id"] = table
    return d


def _cleanup(ids):
    if ids:
        db.orders.delete_many({"id": {"$in": list(ids)}})
    db.orders.delete_many({"customer_name": "زبون_تست_تكرار"})


def test_duplicate_orders_are_prevented():
    token = _token()
    h = {"Authorization": f"Bearer {token}"}
    pid = _product_id()
    created = set()
    try:
        a = requests.post(f"{BASE}/orders", json=_payload(pid), headers=h, timeout=15).json()
        b = requests.post(f"{BASE}/orders", json=_payload(pid), headers=h, timeout=15).json()
        c = requests.post(f"{BASE}/orders", json=_payload(pid, table="table-test-99"), headers=h, timeout=15).json()
        created.update(x.get("id") for x in (a, b, c) if x.get("id"))
        # identical rapid submissions => SAME order (no duplicate)
        assert a.get("id") and a["id"] == b["id"], f"duplicate created! a={a.get('id')} b={b.get('id')}"
        # different table => a genuinely new order (no false merge / no lost order)
        assert c.get("id") and c["id"] != a["id"], "different table was wrongly merged"
    finally:
        _cleanup(created)
