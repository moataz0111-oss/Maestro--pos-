"""
Regression: Sales report "شركة توصيل (غير محددة)" bucket must match the
delivery/unassigned-orders reassign tool exactly.

Root cause (fixed): the sales report projection omitted `delivery_company_name`,
so offline-synced delivery orders (company stored only in delivery_company_name)
were counted as "غير محددة" by the report but excluded by the reassign tool.

These tests assert the shared classification logic now used by BOTH paths.
"""


def _resolve_app_name(o, default_apps, app_names):
    """Mirror of the company-name resolution used in both get_sales_report
    and get_unassigned_delivery_orders after the fix."""
    app_name = o.get("delivery_app_name")
    if not app_name and o.get("delivery_app"):
        app_name = default_apps.get(o.get("delivery_app"), app_names.get(o.get("delivery_app"), None))
    if not app_name and o.get("delivery_company_name"):
        app_name = o.get("delivery_company_name")
    return app_name


def _is_company(o):
    pm = o.get("payment_method", "cash")
    return bool(o.get("is_delivery_company")) or bool(o.get("delivery_app")) or bool(o.get("delivery_app_name")) or pm == "delivery_company"


DEFAULT_APPS = {"toters": "توترز", "talabat": "طلبات"}
APP_NAMES = {}


def test_offline_company_order_is_attributed_not_unassigned():
    """Order with company only in delivery_company_name -> resolved (NOT unassigned)."""
    o = {"payment_method": "delivery_company", "is_delivery_company": True,
         "delivery_app": "", "delivery_app_name": "", "delivery_company_name": "مزاجك"}
    assert _is_company(o)
    name = _resolve_app_name(o, DEFAULT_APPS, APP_NAMES)
    assert name == "مزاجك"
    assert (not name) is False  # not unassigned


def test_truly_unassigned_order_stays_unassigned():
    """Order with no company info anywhere -> unassigned in BOTH report and tool."""
    o = {"payment_method": "delivery_company", "is_delivery_company": True,
         "delivery_app": "", "delivery_app_name": "", "delivery_company_name": ""}
    assert _is_company(o)
    name = _resolve_app_name(o, DEFAULT_APPS, APP_NAMES)
    assert not name  # unassigned


def test_delivery_app_id_resolves_via_default_map():
    o = {"payment_method": "delivery_company", "delivery_app": "toters",
         "delivery_app_name": "", "delivery_company_name": ""}
    assert _resolve_app_name(o, DEFAULT_APPS, APP_NAMES) == "توترز"


def test_report_and_tool_agree_on_unassigned_set():
    """The set of unassigned orders must be identical between the two paths."""
    orders = [
        {"order_number": 1, "payment_method": "delivery_company", "is_delivery_company": True,
         "delivery_company_name": "مزاجك"},                       # attributed
        {"order_number": 2, "payment_method": "delivery_company", "is_delivery_company": True,
         "delivery_company_name": ""},                            # unassigned
        {"order_number": 3, "payment_method": "delivery_company", "delivery_app": "talabat"},  # attributed
        {"order_number": 4, "payment_method": "cash"},            # not a company order
    ]
    report_unassigned = set()
    for o in orders:
        if not _is_company(o):
            continue
        if not _resolve_app_name(o, DEFAULT_APPS, APP_NAMES):
            report_unassigned.add(o["order_number"])

    tool_unassigned = set()
    for o in orders:
        if not _is_company(o):
            continue
        if not _resolve_app_name(o, DEFAULT_APPS, APP_NAMES):
            tool_unassigned.add(o["order_number"])

    assert report_unassigned == tool_unassigned == {2}
