"""Regression guard: GET /api/reports/weekly-low-profit endpoint.

Feature (May 24, 2026): Backend endpoint that returns last-7-days products
with profit margin below a threshold. Used by the WeeklyLowProfitAlert
banner in the frontend.

Critical regression: An early implementation called `OrderStatus.CANCELLED.value`
which crashed because `OrderStatus` in routes/shared.py is a plain class with
string constants (not an Enum) — `.value` does not exist on `str` objects.
This test pins the correct usage.
"""
import inspect
from pathlib import Path
import re


def _source():
    p = Path(__file__).resolve().parents[1] / "routes" / "reports_routes.py"
    return p.read_text(encoding="utf-8")


def test_endpoint_registered():
    src = _source()
    assert "@router.get(\"/weekly-low-profit\")" in src, (
        "Endpoint /weekly-low-profit must be registered with @router.get"
    )


def test_does_not_call_value_on_orderstatus_cancelled():
    """OrderStatus is a plain str-class, NOT an Enum. Calling .value will crash."""
    src = _source()
    assert "OrderStatus.CANCELLED.value" not in src, (
        "OrderStatus.CANCELLED.value will raise AttributeError. "
        "Use OrderStatus.CANCELLED directly (plain string)."
    )


def test_uses_tenant_and_branch_scoping():
    src = _source()
    # extract function body
    match = re.search(
        r"async def get_weekly_low_profit_products\b.*?(?=\n@router\.|\nasync def |\Z)",
        src,
        re.DOTALL,
    )
    assert match, "Function not found"
    body = match.group(0)
    assert "build_tenant_query" in body, "Must scope by tenant"
    assert "build_branch_query" in body, "Must support branch_id scoping"


def test_returns_week_id_and_threshold_in_response():
    src = _source()
    match = re.search(
        r"async def get_weekly_low_profit_products\b.*?(?=\n@router\.|\nasync def |\Z)",
        src,
        re.DOTALL,
    )
    body = match.group(0)
    assert "\"week_id\"" in body, "Response must include week_id (ISO week)"
    assert "\"threshold\"" in body, "Response must include threshold"
    assert "\"products\"" in body, "Response must include products list"
    assert "\"total_count\"" in body, "Response must include total_count"


def test_orderstatus_is_plain_class_not_enum():
    """Lock in that OrderStatus stays a plain class. If someone converts it
    to an Enum later, they need to also update all `OrderStatus.X` usages."""
    import os
    os.environ.setdefault("MONGO_URL", "mongodb://localhost:27017")
    os.environ.setdefault("DB_NAME", "test_db")
    # Import directly from shared.py (not via routes/__init__.py which boots mongo)
    import importlib.util
    from pathlib import Path
    shared_path = Path(__file__).resolve().parents[1] / "routes" / "shared.py"
    spec = importlib.util.spec_from_file_location("_shared_isolated", shared_path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    OrderStatus = mod.OrderStatus
    assert OrderStatus.CANCELLED == "cancelled"
    assert isinstance(OrderStatus.CANCELLED, str)
    # If this fails, OrderStatus became an Enum -> review reports_routes.py
    assert not hasattr(OrderStatus.CANCELLED, "value"), (
        "OrderStatus.CANCELLED gained a .value attribute — likely became an "
        "Enum. Audit all `OrderStatus.X` usages across routes/ to use .value."
    )
