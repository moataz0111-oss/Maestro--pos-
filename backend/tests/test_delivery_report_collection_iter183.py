"""Regression: Delivery Company Report & Collection improvements.

User request (Feb 2026):
  1. Commission rate must show the real rate (from delivery_app_settings),
     not 0% (it was previously read from the empty `delivery_apps` collection).
  2. Drill-down: each delivery-company order must carry itemized details
     (items with name/quantity/price/discount/total + subtotal/customer_name).
  3. Collection with offers: POST /reports/delivery/collect must compute the
     offer amount/percentage and DEPOSIT the actual collected net into the
     Owner's Safe (owner_deposits) with source='delivery_collection', logging
     collector, branch, company and the from/to period.
"""
from pathlib import Path


def _src():
    return (Path(__file__).resolve().parents[1] / "routes" / "reports_routes.py").read_text(encoding="utf-8")


def _delivery_credits_body(src):
    idx = src.find('@router.get("/delivery-credits")')
    return src[idx:src.find("@router.", idx + 10)]


def _collect_body(src):
    idx = src.find('@router.post("/delivery/collect")')
    return src[idx:src.find("@router.", idx + 10)]


def test_commission_rate_read_from_settings_not_empty_collection():
    body = _delivery_credits_body(_src())
    # rates must come from delivery_app_settings keyed by app_id
    assert "delivery_app_settings" in body
    assert 's["app_id"]: s.get("commission_rate", 0)' in body


def test_orders_enriched_with_items_for_drilldown():
    body = _delivery_credits_body(_src())
    assert '"items": order_items' in body
    assert '"subtotal"' in body
    assert '"customer_name"' in body
    # each item exposes the fields the UI table renders
    for field in ['"name"', '"quantity"', '"price"', '"discount"', '"total"']:
        assert field in body


def test_collect_computes_offer_amount_and_percentage():
    body = _collect_body(_src())
    assert "has_offers" in body
    assert "offer_amount = round(expected - collection.amount, 2)" in body
    assert "offer_percentage = round((offer_amount / expected) * 100, 2)" in body


def test_collect_deposits_into_owner_safe():
    body = _collect_body(_src())
    assert "db.owner_deposits.insert_one" in body
    assert '"source": "delivery_collection"' in body
    # logs collector, branch, company and period
    assert "ref_collection_id" in body
    assert "period_start" in body and "period_end" in body
    assert "branch_name" in body


def test_collect_marks_orders_collected():
    body = _collect_body(_src())
    assert '"delivery_collected": True' in body


def test_collection_model_has_offer_and_period_fields():
    src = _src()
    idx = src.find("class DeliveryCollectionCreate")
    model = src[idx:src.find("@router.post", idx)]
    for field in ["expected_amount", "has_offers", "period_start", "period_end", "branch_id", "total_sales", "commission"]:
        assert field in model


def test_collect_stores_total_sales_and_commission_for_reprint():
    body = _collect_body(_src())
    assert '"total_sales": collection.total_sales' in body
    assert '"commission": collection.commission' in body
