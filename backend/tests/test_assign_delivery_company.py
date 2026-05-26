"""Regression: PATCH /api/sync/orders/{order_id}/assign-delivery-company

User scenario (May 26, 2026): offline orders for company customers (e.g.
توترز) get synced as "آجل عدي" (regular credit) instead of being routed
to the company's account. The user reported 3 orders #4, #5, #6 stuck.

Fix: admin endpoint to retroactively move a credit/cash order onto a
delivery-company account (delivery_company_id, customer_type, etc).
Plus a UI button "نقل لشركة" in the Reports → الآجل tab.

This test pins the endpoint contract.
"""
from pathlib import Path
import re


def _src():
    return (Path(__file__).resolve().parents[1] / "routes" / "sync_routes.py").read_text(encoding="utf-8")


def _endpoint_body():
    src = _src()
    m = re.search(
        r"async def assign_delivery_company\b.*?(?=\n@router\.|\nasync def |\Z)",
        src,
        re.DOTALL,
    )
    assert m, "assign_delivery_company endpoint not found"
    return m.group(0)


def test_endpoint_registered_with_correct_path():
    src = _src()
    assert '@router.patch("/orders/{order_id}/assign-delivery-company"' in src


def test_role_gated_to_admin_super_admin_manager():
    body = _endpoint_body()
    assert 'admin' in body and 'super_admin' in body and 'manager' in body


def test_writes_critical_fields_for_company_routing():
    body = _endpoint_body()
    for f in [
        '"customer_type": "delivery_company"',
        '"delivery_company_id":',
        '"delivery_company":',
        '"delivery_company_name":',
        '"order_type": "delivery"',
        '"payment_method": "delivery_company"',
    ]:
        assert f in body, f"Missing field in update_set: {f}"


def test_audit_history_appended_via_push():
    body = _endpoint_body()
    assert '"$push": {"company_assignment_history"' in body


def test_lookups_delivery_company_name_when_missing():
    body = _endpoint_body()
    # Must look up the company name from delivery_apps if payload didn't send it
    assert "db.delivery_apps.find_one" in body


def test_returns_404_when_order_missing():
    body = _endpoint_body()
    assert 'HTTPException(status_code=404' in body


def test_does_not_change_order_number_or_total():
    """The endpoint must only touch routing fields — totals stay frozen."""
    body = _endpoint_body()
    # update_set must not include `order_number` or `total` keys (read-only)
    # The string "order_number" appears in audit messages / response; what matters
    # is that we never write it back to the DB.
    assert 'update_set["order_number"]' not in body
    assert 'update_set["total"]' not in body
    assert '"order_number":' not in body.split('update_set = {')[1].split('}')[0]
    assert '"total":' not in body.split('update_set = {')[1].split('}')[0]
