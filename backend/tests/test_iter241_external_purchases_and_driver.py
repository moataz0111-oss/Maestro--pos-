"""
Iter 241 backend tests:
- Task C: purchases-report invoice_image_url under /api/uploads/invoices/
- Task D: price-increases report returns data; backend reason enforcement on POST /api/purchases-new
- Driver freed on reject_order / reject_customer_order
"""
import os
import time
import requests
import pytest

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://trusted-device-auth.preview.emergentagent.com').rstrip('/')


@pytest.fixture(scope="session")
def admin_token():
    r = requests.post(f"{BASE_URL}/api/auth/login",
                      json={"email": "admin@maestroegp.com", "password": "admin123"}, timeout=30)
    assert r.status_code == 200, r.text
    return r.json()["token"]


@pytest.fixture(scope="session")
def headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}", "Content-Type": "application/json"}


# ---- Task C ----
def test_purchases_report_has_invoice_image_url(headers):
    r = requests.get(f"{BASE_URL}/api/purchases-report",
                     headers=headers, params={"start": "2026-01-01", "end": "2026-12-31"}, timeout=30)
    assert r.status_code == 200, r.text
    body = r.json()
    items = body.get("invoices") or body.get("purchases") or body.get("items") or []
    assert items, f"no purchases returned: {body}"
    target = None
    for p in items:
        if p.get("invoice_image_url"):
            target = p
            break
    assert target is not None, f"No purchase has invoice_image_url among {len(items)} invoices"
    url = target["invoice_image_url"]
    assert "/api/uploads/invoices/" in url or "/uploads/invoices/" in url, f"unexpected URL: {url}"
    # Normalize to absolute
    if url.startswith("/api/uploads/"):
        abs_url = BASE_URL + url
    elif url.startswith("/uploads/"):
        abs_url = BASE_URL + "/api" + url
    else:
        abs_url = url
    img = requests.get(abs_url, timeout=30)
    assert img.status_code == 200, f"image fetch failed {img.status_code} for {abs_url}"
    assert img.content.startswith(b'\x89PNG') or img.content.startswith(b'\xff\xd8\xff') or len(img.content) > 50, \
        f"image content not valid: {img.content[:20]!r}"


# ---- Task D ----
def test_price_increase_report_returns_data(headers):
    r = requests.get(f"{BASE_URL}/api/reports/price-increases",
                     headers=headers, params={"days": 60, "min_pct": 10}, timeout=30)
    assert r.status_code == 200, r.text
    body = r.json()
    rows = body.get("rows") or body.get("items") or body.get("data") or []
    if isinstance(body, list):
        rows = body
    assert len(rows) >= 1, f"price-increases empty: {body}"
    # Locate مادة اختبار سعر row
    found = False
    for row in rows:
        name = row.get("name") or row.get("material_name") or row.get("item_name") or ""
        if "اختبار" in name and "سعر" in name:
            found = True
            pct = row.get("pct") or row.get("percentage") or row.get("increase_pct")
            if pct is not None:
                assert float(pct) >= 10, row
            break
    assert found, f"target row 'مادة اختبار سعر' not found in {rows}"


def test_price_increase_reason_required_on_purchase_create(headers):
    """POST /api/purchases-new without reason for >25% increase returns 400 PRICE_INCREASE_REASON_REQUIRED."""
    unique_name = "مادة اختبار سعر"
    # Find current latest cost for this material by scanning purchases-report
    rep = requests.get(f"{BASE_URL}/api/purchases-report",
                       headers=headers, params={"start": "2026-01-01", "end": "2026-12-31"}, timeout=20)
    assert rep.status_code == 200
    invoices = rep.json().get("invoices", [])
    last_cost = None
    last_time = ""
    for inv in invoices:
        for it in inv.get("items", []):
            if it.get("name") == unique_name and inv.get("created_at", "") > last_time:
                last_time = inv["created_at"]
                last_cost = it.get("cost_per_unit")
    if last_cost is None:
        last_cost = 1000.0
    new_cost = round(last_cost * 1.6, 2)  # +60% increase to ensure threshold tripped

    payload_no_reason = {
        "supplier_id": "",
        "supplier_name": "غير محدد",
        "items": [{
            "name": unique_name,
            "quantity": 1,
            "unit": "كغم",
            "cost_per_unit": new_cost,
            "total_cost": new_cost,
            "category": "test"
        }],
        "total_amount": new_cost,
        "paid_amount": 0,
        "payment_status": "pending",
        "payment_method": "cash",
        "invoice_number": f"TST-REASON-{int(time.time())}"
    }
    r = requests.post(f"{BASE_URL}/api/purchases-new", headers=headers, json=payload_no_reason, timeout=30)
    assert r.status_code == 400, f"expected 400 (baseline={last_cost} new={new_cost}), got {r.status_code}: {r.text}"
    body = r.json()
    detail = body.get("detail")
    if isinstance(detail, dict):
        code = detail.get("code")
    else:
        code = body.get("code")
    assert code == "PRICE_INCREASE_REASON_REQUIRED", f"unexpected error: {body}"

    # With reason
    payload_with = dict(payload_no_reason)
    payload_with["invoice_number"] = f"TST-REASON-OK-{int(time.time())}"
    payload_with["price_increase_reasons"] = {
        "by_name": {unique_name: "ارتفاع سعر السوق"}
    }
    r2 = requests.post(f"{BASE_URL}/api/purchases-new", headers=headers, json=payload_with, timeout=30)
    assert r2.status_code in (200, 201), f"with reason failed: {r2.status_code} {r2.text}"
    created = r2.json()
    log = created.get("price_increase_log") or []
    assert log, f"price_increase_log not stored on purchase response: {created}"
    assert any((entry.get("reason") or "").strip() == "ارتفاع سعر السوق" for entry in log), log


# ---- Driver freed on reject ----
def test_driver_freed_on_order_reject(headers):
    # Find a driver and a pending order (or any order to assign+reject)
    dr = requests.get(f"{BASE_URL}/api/drivers", headers=headers, timeout=20)
    drivers = dr.json() if dr.status_code == 200 else []
    if not drivers:
        pytest.skip("no drivers seeded")
    driver = drivers[0]
    driver_id = driver["id"]

    o_list = requests.get(f"{BASE_URL}/api/orders", headers=headers, timeout=20).json()
    # Pick a delivery order that is NOT delivered/cancelled — prefer pending/confirmed
    candidate = None
    for o in o_list:
        if o.get("order_type") == "delivery" and o.get("status") in ("pending", "confirmed", "preparing", "ready"):
            candidate = o
            break
    if not candidate:
        pytest.skip("no eligible delivery order to test reject")
    order_id = candidate["id"]

    # Assign driver
    a = requests.put(f"{BASE_URL}/api/drivers/{driver_id}/assign",
                     headers=headers, params={"order_id": order_id, "force": "true"}, timeout=20)
    if a.status_code >= 400:
        a = requests.put(f"{BASE_URL}/api/orders/{order_id}/assign-driver",
                         headers=headers, json={"driver_id": driver_id}, timeout=20)
    assert a.status_code in (200, 201), f"assign failed: {a.status_code} {a.text}"

    # Verify assigned
    g = requests.get(f"{BASE_URL}/api/orders/{order_id}", headers=headers, timeout=20)
    assert g.status_code == 200
    assert g.json().get("driver_id"), f"driver not assigned: {g.json()}"

    # Reject via PUT
    rj = requests.put(f"{BASE_URL}/api/orders/{order_id}/reject", headers=headers,
                      json={"reason": "test"}, timeout=20)
    if rj.status_code >= 400:
        rj = requests.post(f"{BASE_URL}/api/notifications/reject-order/{order_id}",
                           headers=headers, json={"reason": "test"}, timeout=20)
    assert rj.status_code in (200, 201, 204), f"reject failed: {rj.status_code} {rj.text}"

    # Verify driver_id cleared
    g2 = requests.get(f"{BASE_URL}/api/orders/{order_id}", headers=headers, timeout=20)
    assert g2.status_code == 200, g2.text
    od = g2.json()
    assert not od.get("driver_id"), f"driver_id not cleared: {od.get('driver_id')}"
    assert not od.get("driver_name"), f"driver_name not cleared: {od.get('driver_name')}"
    assert not od.get("driver_phone"), f"driver_phone not cleared: {od.get('driver_phone')}"
