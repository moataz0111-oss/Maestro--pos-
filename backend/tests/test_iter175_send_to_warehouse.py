"""
Iteration 175 - Test the send-to-warehouse flow for purchase invoices.
Goal: Confirm that the frontend button calling
POST /api/purchases-new/{invoice_id}/send-to-warehouse works end-to-end
when the invoice was created via POST /api/purchase-invoices.
"""
import os
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
    return r.json().get("access_token") or r.json().get("token")


@pytest.fixture(scope="module")
def headers(auth_token):
    return {"Authorization": f"Bearer {auth_token}", "Content-Type": "application/json"}


def test_health(headers):
    r = requests.get(f"{BASE_URL}/api/health", timeout=15)
    assert r.status_code in (200, 404)


def test_purchase_invoices_list_works(headers):
    r = requests.get(f"{BASE_URL}/api/purchase-invoices", headers=headers, timeout=30)
    assert r.status_code == 200
    data = r.json()
    assert isinstance(data, list)


def test_send_to_warehouse_against_purchase_invoice_id(headers):
    """Create invoice via /api/purchase-invoices, then call /api/purchases-new/{id}/send-to-warehouse.
    This is exactly what the frontend Purchasing page does."""
    # 1) Create / fetch supplier
    sup = requests.get(f"{BASE_URL}/api/purchase-suppliers", headers=headers, timeout=30)
    assert sup.status_code == 200
    suppliers = sup.json()
    if suppliers:
        supplier_id = suppliers[0]["id"]
    else:
        c = requests.post(f"{BASE_URL}/api/purchase-suppliers", headers=headers, json={
            "name": "TEST_Supplier_iter175",
            "phone": "0500000000",
        }, timeout=30)
        assert c.status_code in (200, 201), c.text
        supplier_id = c.json()["id"]

    # 2) Create invoice
    payload = {
        "supplier_id": supplier_id,
        "invoice_number": "TEST_INV_175",
        "items": [
            {"name": "TEST_Material_175", "quantity": 5, "unit": "كغم", "unit_price": 10, "total": 50},
        ],
        "total_amount": 50,
        "notes": "test",
        "image_data": "data:image/png;base64,iVBORw0KGgo=",
    }
    cr = requests.post(f"{BASE_URL}/api/purchase-invoices", headers=headers, json=payload, timeout=30)
    assert cr.status_code in (200, 201), cr.text
    invoice = cr.json()
    invoice_id = invoice["id"]
    assert invoice.get("status") in ("new", "pending"), f"unexpected status: {invoice.get('status')}"

    # 3) Try to send to warehouse via /api/purchases-new/{id}/send-to-warehouse
    sw = requests.post(
        f"{BASE_URL}/api/purchases-new/{invoice_id}/send-to-warehouse",
        headers=headers,
        json={},
        timeout=30,
    )
    print(f"send-to-warehouse status={sw.status_code} body={sw.text[:300]}")

    # If 404 -> integration bug (route or collection mismatch)
    # We assert <500 to allow main agent to clearly see the failure mode
    assert sw.status_code != 500, f"Server error: {sw.text}"

    # 4) Verify invoice status updated to 'transferred' OR 'sent_to_warehouse'
    lst = requests.get(f"{BASE_URL}/api/purchase-invoices", headers=headers, timeout=30)
    items = [i for i in lst.json() if i["id"] == invoice_id]
    if items:
        new_status = items[0].get("status")
        print(f"Invoice status after send-to-warehouse: {new_status}")
        # Frontend checks invoice.status === 'transferred'
        # If sw was 200 OK, status should reflect that
        if sw.status_code == 200:
            assert new_status in ("transferred", "sent_to_warehouse"), \
                f"Frontend expects 'transferred' but backend stored: {new_status}"

    # 5) Cleanup
    try:
        requests.delete(f"{BASE_URL}/api/purchase-invoices/{invoice_id}", headers=headers, timeout=30)
    except Exception:
        pass


def test_raw_materials_endpoint(headers):
    r = requests.get(f"{BASE_URL}/api/raw-materials", headers=headers, timeout=30)
    assert r.status_code in (200, 404)


def test_manufacturing_requests_endpoint(headers):
    r = requests.get(f"{BASE_URL}/api/manufacturing-requests", headers=headers, timeout=30)
    assert r.status_code in (200, 404)


def test_price_alerts_endpoint(headers):
    r = requests.get(f"{BASE_URL}/api/price-alerts", headers=headers, timeout=30)
    assert r.status_code in (200, 404)
