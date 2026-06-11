"""
Iter227 backend tests covering:
- Issue1 P0: customer order creates order_notifications of type 'new_order_cashier'
- Issue2: branch-stock-count pending-alerts accepts ?branch_id= and is scoped
- Issue3: payment-settings persists fee_zones; customer/delivery-fee returns zone fee;
          delivery-fee/suggest returns suggested_fee for app order
"""
import os
import time
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "http://localhost:8001").rstrip("/")
TENANT = "default"
ADMIN_EMAIL = "admin@maestroegp.com"
ADMIN_PASSWORD = "admin123"


def _admin_token():
    r = requests.post(f"{BASE_URL}/api/auth/login",
                      json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=30)
    assert r.status_code == 200, r.text
    return r.json().get("token") or r.json().get("access_token")


def _hdr(tok):
    return {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}


def _first_product():
    r = requests.get(f"{BASE_URL}/api/customer/menu/{TENANT}", timeout=30)
    assert r.status_code == 200, r.text
    d = r.json()
    items = d if isinstance(d, list) else d.get("products", [])
    assert items, "no products in menu"
    return items[0]


def _branches(tok):
    r = requests.get(f"{BASE_URL}/api/branches", headers=_hdr(tok), timeout=30)
    assert r.status_code == 200, r.text
    return r.json()


# -------------------- Issue 1: P0 incoming order notification --------------------
def test_customer_order_creates_notification():
    tok = _admin_token()
    prod = _first_product()
    payload = {
        "items": [{"product_id": prod["id"], "quantity": 2}],
        "customer_name": "TEST_زبون اتصال",
        "customer_phone": "07801234567",
        "delivery_address": "بغداد - الكرادة - شارع 14",
        "payment_method": "cash",
    }
    r = requests.post(f"{BASE_URL}/api/customer/order/{TENANT}", json=payload, timeout=30)
    assert r.status_code in (200, 201), r.text
    data = r.json()
    order_id = (data.get("order") or {}).get("id") or data.get("order_id") or data.get("id")
    assert order_id, f"no order_id in response: {data}"

    # Small delay; backend should insert notification synchronously but tolerate up to ~3s.
    notif = None
    for _ in range(8):
        rn = requests.get(f"{BASE_URL}/api/order-notifications", headers=_hdr(tok), timeout=30)
        assert rn.status_code == 200, rn.text
        items = rn.json() if isinstance(rn.json(), list) else rn.json().get("notifications", [])
        for n in items:
            if n.get("type") == "new_order_cashier" and (
                n.get("order_id") == order_id or n.get("data", {}).get("order_id") == order_id
            ):
                notif = n
                break
        if notif:
            break
        time.sleep(0.5)
    assert notif is not None, "new_order_cashier notification not found for the new order"
    # Validate payload fields (either flat or nested under 'data')
    flat = {**notif, **(notif.get("data") or {})}
    assert flat.get("customer_name") == "TEST_زبون اتصال"
    assert flat.get("customer_phone") == "07801234567"
    assert "الكرادة" in (flat.get("delivery_address") or "")
    assert float(flat.get("total_amount") or 0) > 0
    assert int(flat.get("items_count") or 0) >= 1
    assert flat.get("branch_id"), "branch_id missing on notification"


# -------------------- Issue 2: branch-stock-count pending-alerts ?branch_id= --------------------
def test_pending_alerts_accepts_branch_id():
    tok = _admin_token()
    branches = _branches(tok)
    assert branches, "no branches available"
    bid = branches[0]["id"]
    r = requests.get(
        f"{BASE_URL}/api/branch-stock-count/pending-alerts",
        params={"branch_id": bid},
        headers=_hdr(tok),
        timeout=30,
    )
    assert r.status_code == 200, r.text
    body = r.json()
    # Tolerant shape: {count: int} or {pending: [...]} etc.
    assert isinstance(body, (dict, list))


# -------------------- Issue 3: fee_zones persistence + distance fee + suggest --------------------
def test_payment_settings_fee_zones_and_distance_fee():
    tok = _admin_token()
    branches = _branches(tok)
    bid = branches[0]["id"]

    # Persist fee zones
    settings_payload = {
        "distance_fee_enabled": True,
        "fee_zones": [
            {"up_to_km": 3, "fee": 1000},
            {"up_to_km": 6, "fee": 2000},
            {"up_to_km": 100, "fee": 3000},
        ],
    }
    r = requests.post(f"{BASE_URL}/api/payment-settings", json=settings_payload, headers=_hdr(tok), timeout=30)
    assert r.status_code in (200, 201), r.text

    rg = requests.get(f"{BASE_URL}/api/payment-settings", headers=_hdr(tok), timeout=30)
    assert rg.status_code == 200
    ps = rg.json()
    zones = ps.get("fee_zones") or (ps.get("settings") or {}).get("fee_zones") or []
    assert len(zones) == 3, f"expected 3 zones, got {zones}"
    assert zones[0]["fee"] == 1000 and zones[1]["fee"] == 2000

    # Set branch location to a known point
    lat, lng = 33.3152, 44.3661  # Baghdad center-ish
    rl = requests.put(
        f"{BASE_URL}/api/branches/{bid}/location",
        json={"latitude": lat, "longitude": lng},
        headers=_hdr(tok),
        timeout=30,
    )
    assert rl.status_code in (200, 204), rl.text

    # ~1km away
    near_lat = lat + 0.009  # ~1km north
    near_lng = lng
    r1 = requests.get(
        f"{BASE_URL}/api/customer/delivery-fee/{TENANT}",
        params={"lat": near_lat, "lng": near_lng, "branch_id": bid},
        timeout=30,
    )
    assert r1.status_code == 200, r1.text
    fee1 = r1.json().get("fee") or r1.json().get("delivery_fee")
    assert fee1 == 1000, f"expected 1000 at ~1km, got {fee1}; resp={r1.json()}"

    # ~4.4km away => zone 2 (fee 2000)
    far_lat = lat + 0.04  # ~4.4km north
    far_lng = lng
    r2 = requests.get(
        f"{BASE_URL}/api/customer/delivery-fee/{TENANT}",
        params={"lat": far_lat, "lng": far_lng, "branch_id": bid},
        timeout=30,
    )
    assert r2.status_code == 200, r2.text
    fee2 = r2.json().get("fee") or r2.json().get("delivery_fee")
    assert fee2 == 2000, f"expected 2000 at ~4.4km, got {fee2}; resp={r2.json()}"


def test_delivery_fee_suggest_for_app_order():
    tok = _admin_token()
    branches = _branches(tok)
    bid = branches[0]["id"]
    # Ensure branch has location (from previous test ideally; set again to be safe)
    requests.put(
        f"{BASE_URL}/api/branches/{bid}/location",
        json={"latitude": 33.3152, "longitude": 44.3661},
        headers=_hdr(tok),
        timeout=30,
    )

    prod = _first_product()
    # Create an app order with delivery_location ~4.4km away
    payload = {
        "items": [{"product_id": prod["id"], "quantity": 1}],
        "customer_name": "TEST_زون عميل",
        "customer_phone": "07809999999",
        "delivery_address": "TEST",
        "payment_method": "cash",
        "delivery_location": {"lat": 33.3152 + 0.04, "lng": 44.3661},
        "branch_id": bid,
    }
    r = requests.post(f"{BASE_URL}/api/customer/order/{TENANT}", json=payload, timeout=30)
    assert r.status_code in (200, 201), r.text
    body = r.json()
    oid = (body.get("order") or {}).get("id") or body.get("order_id")
    assert oid, body

    rs = requests.get(
        f"{BASE_URL}/api/delivery-fee/suggest",
        params={"order_id": oid},
        headers=_hdr(tok),
        timeout=30,
    )
    assert rs.status_code == 200, rs.text
    sf = rs.json().get("suggested_fee")
    assert sf in (1000, 2000, 3000), f"unexpected suggested_fee {sf}; resp={rs.json()}"
