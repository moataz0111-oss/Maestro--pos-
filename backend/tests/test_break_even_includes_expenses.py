"""Regression: Break-even daily target must INCLUDE daily expenses
(from the `expenses` collection), not just fixed costs + salaries.

User report (May 29, 2026): تقرير تحليل الربح الصافي showed daily_target =
475,000 (= rent 150k + utilities 45k + salaries 280k) but the actual
profit-loss endpoint showed operating_costs = 638,750 because it ALSO
includes other_expenses (163,750). The two reports must agree.

Fix: /break-even/daily and /break-even/monthly now query the `expenses`
collection for the period and add `other_expenses` to daily_target.
"""
from pathlib import Path
import re


def _src():
    return (Path(__file__).resolve().parents[1] / "server.py").read_text(encoding="utf-8")


def _break_even_daily_body():
    src = _src()
    # Find the /break-even/daily handler
    idx = src.find('@api_router.get("/break-even/daily")')
    assert idx > 0
    end = src.find("@api_router.", idx + 10)
    return src[idx:end] if end > 0 else src[idx:]


def _break_even_monthly_body():
    src = _src()
    # The "monthly" branch lives inside /break-even/daily-range
    idx = src.find('@api_router.get("/break-even/daily-range")')
    assert idx > 0
    end = src.find("@api_router.", idx + 10)
    return src[idx:end] if end > 0 else src[idx:]


def test_daily_endpoint_queries_expenses():
    body = _break_even_daily_body()
    assert "db.expenses.find" in body, (
        "Daily break-even must query expenses collection for the day"
    )


def test_daily_target_includes_other_expenses():
    body = _break_even_daily_body()
    assert "daily_target = fixed_costs_daily + daily_salaries + daily_other_expenses" in body


def test_daily_response_includes_other_expenses_section():
    body = _break_even_daily_body()
    assert '"other_expenses":' in body
    assert '"daily": daily_other_expenses' in body


def test_monthly_endpoint_queries_expenses():
    body = _break_even_monthly_body()
    assert "db.expenses.find" in body, (
        "Monthly break-even must query expenses collection for the date range"
    )


def test_monthly_target_includes_range_expenses():
    body = _break_even_monthly_body()
    assert "branch_target = fixed_costs + salaries_range + range_other_expenses" in body


def test_monthly_response_includes_other_expenses_section():
    body = _break_even_monthly_body()
    assert '"other_expenses":' in body
    assert '"total": range_other_expenses' in body
