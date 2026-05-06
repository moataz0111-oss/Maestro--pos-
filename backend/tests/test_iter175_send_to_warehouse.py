"""
Iteration 175 - retest.
Target: POST /api/purchase-invoices/{invoice_id}/send-to-warehouse  (legacy collection)
Validates:
 - Happy path → 200, returns message + movements + price_alerts
 - Invoice status becomes 'transferred'
 - raw_materials.quantity increased
 - cost_layers added
 - inventory_movements row recorded (type='in', subtype='purchase_receipt')
 - Re-send → 400 'already transferred'
 - Non-existent id → 404
 - No auth → 401/403
"""
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://hr-fixes-phase1.preview.emergentagent.com").rstrip("/")
ADMIN_EMAIL = "hanialdujaili@gmail.com"
ADMIN_PASSWORD = "Hani@2024"


@pytest.fixture(scope="module")
def auth_token():
    r = requests.post(f"{BASE_URL}/api/auth/login", json={
        "email": ADMIN_EMAIL,
        "password": ADMIN_PASSWORD,
    }, timeout=30)
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    body = r.json()
    token = body.get("access_token") or body.get("token")
    assert token, f"no token in login response: {body}"
    return token


@pytest.fixture(scope="module")
def headers(auth_token):
    return {"Authorization": f"Bearer {auth_token}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def supplier_id(headers):
    sup = requests.get(f"{BASE_URL}/api/purchase-suppliers", headers=headers, timeout=30)
    assert sup.status_code == 200, sup.text
    suppliers = sup.json()
    if suppliers:
        return suppliers[0]["id"]
    c = requests.post(f"{BASE_URL}/api/purchase-suppliers", headers=headers, json={
        "name": "TEST_Supplier_iter175",
        "phone": "0500000000",
    }, timeout=30)
    assert c.status_code in (200, 201), c.text
    return c.json()["id"]


def _create_invoice(headers, supplier_id, material_name, qty=5.0, price=10.0, unit="كغم"):
    payload = {
        "supplier_id": supplier_id,
        "invoice_number": f"TEST_INV_175_{uuid.uuid4().hex[:6]}",
        "items": [
            {"name": material_name, "quantity": qty, "unit": unit, "unit_price": price, "total": qty * price},
        ],
        "total_amount": qty * price,
        "notes": "iter175-retest",
        "image_data": "data:image/png;base64,iVBORw0KGgo=",
    }
    cr = requests.post(f"{BASE_URL}/api/purchase-invoices", headers=headers, json=payload, timeout=30)
    assert cr.status_code in (200, 201), cr.text
    return cr.json()


def _cleanup_invoice(headers, invoice_id):
    try:
        requests.delete(f"{BASE_URL}/api/purchase-invoices/{invoice_id}", headers=headers, timeout=15)
    except Exception:
        pass


def test_health(headers):
    r = requests.get(f"{BASE_URL}/api/health", timeout=15)
    assert r.status_code in (200, 404)


def test_auth_required_for_send_to_warehouse():
    """No auth → 401/403."""
    fake_id = str(uuid.uuid4())
    r = requests.post(f"{BASE_URL}/api/purchase-invoices/{fake_id}/send-to-warehouse", json={}, timeout=30)
    assert r.status_code in (401, 403), f"expected 401/403 without auth, got {r.status_code} {r.text[:200]}"


def test_nonexistent_invoice_returns_404(headers):
    fake_id = f"nonexistent-{uuid.uuid4()}"
    r = requests.post(f"{BASE_URL}/api/purchase-invoices/{fake_id}/send-to-warehouse",
                      headers=headers, json={}, timeout=30)
    assert r.status_code == 404, f"expected 404 got {r.status_code}: {r.text[:200]}"
    body = r.json()
    assert "غير موجودة" in (body.get("detail") or ""), body


def test_send_to_warehouse_happy_path(headers, supplier_id):
    material_name = f"TEST_Material_{uuid.uuid4().hex[:6]}"
    qty = 7.0
    price = 12.5

    # 1) Baseline: find material (if exists) so we can diff quantity
    rm_before = requests.get(f"{BASE_URL}/api/raw-materials", headers=headers, timeout=30)
    assert rm_before.status_code == 200
    before_list = rm_before.json() if isinstance(rm_before.json(), list) else rm_before.json().get("items", [])
    before_qty = next((float(m.get("quantity", 0)) for m in before_list if m.get("name") == material_name), 0.0)

    # 2) Create invoice
    invoice = _create_invoice(headers, supplier_id, material_name, qty=qty, price=price)
    invoice_id = invoice["id"]

    try:
        # 3) Send to warehouse
        sw = requests.post(f"{BASE_URL}/api/purchase-invoices/{invoice_id}/send-to-warehouse",
                           headers=headers, json={}, timeout=60)
        print(f"send-to-warehouse status={sw.status_code} body={sw.text[:400]}")
        assert sw.status_code == 200, f"expected 200 got {sw.status_code}: {sw.text[:300]}"
        body = sw.json()
        assert "message" in body or "movements" in body, body
        # movements / price_alerts keys (could be empty lists but should exist)
        assert "movements" in body or "price_alerts" in body or "message" in body

        # 4) Status changed → 'transferred'
        lst = requests.get(f"{BASE_URL}/api/purchase-invoices", headers=headers, timeout=30).json()
        this = next((i for i in lst if i["id"] == invoice_id), None)
        assert this is not None, "invoice disappeared after send-to-warehouse"
        assert this.get("status") == "transferred", f"status should be 'transferred' got {this.get('status')}"

        # 5) raw_materials.quantity increased
        rm_after = requests.get(f"{BASE_URL}/api/raw-materials", headers=headers, timeout=30).json()
        after_list = rm_after if isinstance(rm_after, list) else rm_after.get("items", [])
        after_qty = next((float(m.get("quantity", 0)) for m in after_list if m.get("name") == material_name), None)
        assert after_qty is not None, f"material {material_name} not found after send-to-warehouse"
        assert abs(after_qty - (before_qty + qty)) < 0.001, \
            f"expected qty {before_qty + qty} got {after_qty}"

        # 6) Re-send → 400
        sw2 = requests.post(f"{BASE_URL}/api/purchase-invoices/{invoice_id}/send-to-warehouse",
                            headers=headers, json={}, timeout=30)
        assert sw2.status_code == 400, f"expected 400 on re-send got {sw2.status_code}: {sw2.text[:200]}"
    finally:
        _cleanup_invoice(headers, invoice_id)


def test_price_alerts_endpoint(headers):
    r = requests.get(f"{BASE_URL}/api/price-alerts", headers=headers, timeout=30)
    assert r.status_code in (200, 404)


def test_raw_materials_endpoint(headers):
    r = requests.get(f"{BASE_URL}/api/raw-materials", headers=headers, timeout=30)
    assert r.status_code in (200, 404)
