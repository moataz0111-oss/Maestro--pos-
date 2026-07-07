"""Welcome Discount feature tests (iteration 277)."""
import os, time, uuid, requests, pytest

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://whatsapp-pos-system.preview.emergentagent.com').rstrip('/')
API = f"{BASE_URL}/api"

ADMIN = {"email": "admin@maestroegp.com", "password": "admin123"}
CASHIER = {"email": "expattr-cashier-a@maestroegp.com", "password": "test123"}


@pytest.fixture(scope="module")
def admin_token():
    r = requests.post(f"{API}/auth/login", json=ADMIN, timeout=30)
    assert r.status_code == 200, r.text
    return r.json()["token"]


@pytest.fixture(scope="module")
def cashier_token():
    r = requests.post(f"{API}/auth/login", json=CASHIER, timeout=30)
    if r.status_code != 200:
        pytest.skip(f"Cashier login failed: {r.status_code} {r.text[:200]}")
    return r.json()["token"]


@pytest.fixture(scope="module")
def admin_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def product_id():
    r = requests.get(f"{API}/customer/menu/default", timeout=30)
    assert r.status_code == 200, r.text
    data = r.json()
    # Find first available product
    if isinstance(data, dict):
        cats = data.get("categories") or data.get("menu") or []
        for c in cats:
            prods = c.get("products") or c.get("items") or []
            for p in prods:
                if p.get("id"):
                    return p["id"]
        # fallback: try products key
        prods = data.get("products") or []
        for p in prods:
            if p.get("id"):
                return p["id"]
    elif isinstance(data, list):
        for c in data:
            for p in c.get("products", []):
                if p.get("id"):
                    return p["id"]
    pytest.skip(f"No product found in menu: {str(data)[:300]}")


@pytest.fixture(scope="module")
def unique_phone():
    # Generate unique iraqi-style phone
    return "0770" + str(int(time.time()))[-7:]


state = {}


def test_01_place_first_order_auto_creates_customer(product_id, unique_phone):
    payload = {
        "items": [{"product_id": product_id, "quantity": 1}],
        "delivery_address": "حي الاختبار",
        "payment_method": "cash",
        "customer_name": "زبون جديد",
        "customer_phone": unique_phone,
    }
    r = requests.post(f"{API}/customer/order/default", json=payload, timeout=30)
    assert r.status_code == 200, f"{r.status_code} {r.text[:500]}"
    body = r.json()
    order = body.get("order") or body
    assert order.get("is_first_order") is True, f"is_first_order not True: {body}"
    cid = order.get("customer_id") or body.get("customer_id")
    assert cid, f"customer_id missing: {body}"
    state["customer_id"] = cid
    state["order_id"] = order.get("id") or order.get("order_id") or body.get("order_id")


def test_02_customer_lookup_by_phone(admin_headers, unique_phone):
    r = requests.get(f"{API}/customers", params={"phone": unique_phone}, headers=admin_headers, timeout=30)
    assert r.status_code == 200, r.text
    data = r.json()
    lst = data if isinstance(data, list) else (data.get("customers") or data.get("data") or [])
    assert lst, f"No customer found: {data}"
    cust = lst[0]
    assert cust.get("welcome_status") == "pending", f"welcome_status: {cust.get('welcome_status')}"
    assert cust.get("source") == "auto_order", f"source: {cust.get('source')}"
    assert cust.get("total_orders") == 1, f"total_orders: {cust.get('total_orders')}"


def test_03_second_order_not_first(product_id, unique_phone):
    payload = {
        "items": [{"product_id": product_id, "quantity": 1}],
        "delivery_address": "حي الاختبار",
        "payment_method": "cash",
        "customer_name": "زبون جديد",
        "customer_phone": unique_phone,
    }
    r = requests.post(f"{API}/customer/order/default", json=payload, timeout=30)
    assert r.status_code == 200, r.text
    body = r.json()
    order = body.get("order") or body
    assert order.get("is_first_order") is False, f"is_first_order should be False: {body}"
    # verify total_orders bumped to 2
    # We'll check via customer lookup (needs admin) — skip re-fetch here; done in next test
    state["second_ok"] = True


def test_04_total_orders_two(admin_headers, unique_phone):
    r = requests.get(f"{API}/customers", params={"phone": unique_phone}, headers=admin_headers, timeout=30)
    lst = r.json() if isinstance(r.json(), list) else (r.json().get("customers") or r.json().get("data") or [])
    assert lst[0].get("total_orders") == 2, f"total_orders: {lst[0].get('total_orders')}"


def test_05_order_notification_first_order(admin_headers):
    # Check MongoDB directly for order_notifications
    from pymongo import MongoClient
    from dotenv import load_dotenv
    load_dotenv("/app/backend/.env")
    mc = MongoClient(os.environ["MONGO_URL"])
    db = mc[os.environ.get("DB_NAME", "maestro_pos")]
    oid = state.get("order_id")
    assert oid, "No order id captured"
    doc = db.order_notifications.find_one({"order_id": oid})
    assert doc is not None, f"No notification for order {oid}"
    assert doc.get("is_first_order") is True, f"is_first_order flag missing: {doc}"
    assert doc.get("customer_id") == state["customer_id"], f"customer_id mismatch: {doc}"


def test_06_grant_welcome_discount(admin_headers):
    cid = state["customer_id"]
    r = requests.post(f"{API}/customers/{cid}/grant-welcome-discount", headers=admin_headers, timeout=30)
    assert r.status_code == 200, f"{r.status_code} {r.text[:500]}"
    body = r.json()
    assert body.get("success") is True, body
    code = body.get("coupon_code")
    assert code and code.startswith("WLC"), f"coupon_code: {code}"
    assert body.get("whatsapp_sent") is False, f"whatsapp_sent expected False: {body}"
    assert body.get("whatsapp_error") == "not_connected", f"whatsapp_error: {body.get('whatsapp_error')}"
    state["coupon_code"] = code


def test_07_customer_marked_granted(admin_headers, unique_phone):
    r = requests.get(f"{API}/customers", params={"phone": unique_phone}, headers=admin_headers, timeout=30)
    lst = r.json() if isinstance(r.json(), list) else (r.json().get("customers") or r.json().get("data") or [])
    cust = lst[0]
    assert cust.get("welcome_status") == "granted", cust
    assert cust.get("welcome_coupon_code") == state["coupon_code"], cust


def test_08_coupon_validates(admin_headers):
    code = state["coupon_code"]
    r = requests.post(f"{API}/coupons/validate", params={"code": code, "order_total": 20000, "customer_name": "زبون جديد", "customer_id": state["customer_id"]}, headers=admin_headers, timeout=30)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body.get("valid") is True, body


def test_09_grant_again_fails(admin_headers):
    cid = state["customer_id"]
    r = requests.post(f"{API}/customers/{cid}/grant-welcome-discount", headers=admin_headers, timeout=30)
    assert r.status_code == 400, f"expected 400 got {r.status_code}: {r.text[:300]}"


def test_10_config_get(admin_headers):
    r = requests.get(f"{API}/welcome-discount/config", headers=admin_headers, timeout=30)
    assert r.status_code == 200, r.text
    cfg = r.json()
    assert "enabled" in cfg
    assert cfg.get("discount_type", "percentage") == "percentage"


def test_11_config_update(admin_headers):
    r = requests.put(f"{API}/welcome-discount/config", json={"discount_value": 15, "valid_days": 5}, headers=admin_headers, timeout=30)
    assert r.status_code == 200, r.text
    r2 = requests.get(f"{API}/welcome-discount/config", headers=admin_headers, timeout=30)
    cfg = r2.json()
    assert cfg.get("discount_value") == 15, cfg
    assert cfg.get("valid_days") == 5, cfg
    # reset
    requests.put(f"{API}/welcome-discount/config", json={"discount_value": 10, "valid_days": 7}, headers=admin_headers, timeout=30)


def test_12_cashier_forbidden_config(cashier_token):
    headers = {"Authorization": f"Bearer {cashier_token}", "Content-Type": "application/json"}
    r = requests.put(f"{API}/welcome-discount/config", json={"discount_value": 20}, headers=headers, timeout=30)
    assert r.status_code == 403, f"expected 403 got {r.status_code}: {r.text[:200]}"


def test_13_cashier_forbidden_grant(cashier_token):
    headers = {"Authorization": f"Bearer {cashier_token}"}
    # use any customer id (won't matter since RBAC check should hit first)
    cid = state.get("customer_id") or "any"
    r = requests.post(f"{API}/customers/{cid}/grant-welcome-discount", headers=headers, timeout=30)
    assert r.status_code == 403, f"expected 403 got {r.status_code}: {r.text[:200]}"
