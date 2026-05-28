"""Regression: Admin departments (central_kitchen, warehouse, purchasing)
must NOT appear in any report except HR. Their salaries must be
distributed across the REAL branches as "external salaries".

User request (May 29, 2026): the break-even report was showing the
central kitchen / warehouse / purchasing as if they were branches,
and their salaries were not being added to the real branches' targets.
"""
from pathlib import Path
import re


def _src():
    return (Path(__file__).resolve().parents[1] / "server.py").read_text(encoding="utf-8")


def test_daily_endpoint_filters_out_admin_departments():
    src = _src()
    idx = src.find('@api_router.get("/break-even/daily")')
    body = src[idx:src.find("@api_router.", idx + 10)]
    assert 'NON_BRANCH_TYPES = ["central_kitchen", "warehouse", "purchasing"]' in body
    assert '"branch_type": {"$nin": NON_BRANCH_TYPES}' in body


def test_daily_endpoint_applies_defensive_post_filter():
    src = _src()
    idx = src.find('@api_router.get("/break-even/daily")')
    body = src[idx:src.find("@api_router.", idx + 10)]
    # Even after Mongo filter, we filter again in Python to be safe
    assert 'branches = [b for b in branches if (b.get("branch_type") or "branch") == "branch"]' in body


def test_daily_endpoint_computes_external_salaries():
    src = _src()
    idx = src.find('@api_router.get("/break-even/daily")')
    body = src[idx:src.find("@api_router.", idx + 10)]
    # Must query employees in admin-dept branches
    assert "external_dept_branches" in body
    assert "external_employees_docs" in body
    assert "total_external_monthly_salaries" in body
    assert "external_daily_per_branch" in body
    # Adds to daily_target
    assert "daily_target = fixed_costs_daily + daily_salaries + daily_other_expenses + external_daily_per_branch" in body


def test_daily_endpoint_returns_external_salaries_section():
    src = _src()
    idx = src.find('@api_router.get("/break-even/daily")')
    body = src[idx:src.find("@api_router.", idx + 10)]
    assert '"external_salaries":' in body
    assert '"per_branch_daily": external_daily_per_branch' in body
    assert '"employees": external_employees_summary' in body
    assert '"departments":' in body


def test_each_branch_carries_external_salaries_share():
    src = _src()
    idx = src.find('@api_router.get("/break-even/daily")')
    body = src[idx:src.find("@api_router.", idx + 10)]
    assert '"external_salaries_share":' in body
    assert '"daily": external_daily_per_branch' in body


def test_daily_range_endpoint_also_filters_and_distributes():
    src = _src()
    idx = src.find('@api_router.get("/break-even/daily-range")')
    body = src[idx:src.find("@api_router.", idx + 10)]
    assert 'NON_BRANCH_TYPES = ["central_kitchen", "warehouse", "purchasing"]' in body
    assert "external_share_per_branch_range" in body
    assert "branch_target = fixed_costs + salaries_range + range_other_expenses + external_share_per_branch_range" in body


def test_monthly_summary_endpoint_also_filters():
    src = _src()
    idx = src.find('@api_router.get("/break-even/monthly-summary")')
    body = src[idx:src.find("@api_router.", idx + 10)]
    assert 'NON_BRANCH_TYPES = ["central_kitchen", "warehouse", "purchasing"]' in body


def test_profit_loss_endpoint_filters_admin_departments():
    src = (Path(__file__).resolve().parents[1] / "routes" / "reports_routes.py").read_text(encoding="utf-8")
    pl_idx = src.find("async def get_profit_loss_report")
    body = src[pl_idx:src.find("\n@router.", pl_idx + 10)]
    # Defensive filter present
    assert 'NON_BRANCH_TYPES = ["central_kitchen", "warehouse", "purchasing"]' in body
