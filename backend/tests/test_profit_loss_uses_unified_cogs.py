"""Regression: /reports/profit-loss must use the unified costs map for
cost_of_goods_sold (same as /reports/sales) — NOT the stale
`order.total_cost` stored in orders.

User report (May 24, 2026): "Net profit" and "Gross profit" cards
displayed the same number because:
1. Top "Net profit" card was using salesReport.total_profit (gross)
2. /profit-loss endpoint computed gross_profit from stale order.total_cost
   so net_profit was also wrong

Fix: profit-loss endpoint now uses `_build_current_costs_map` to compute
COGS dynamically, identical to /reports/sales.
"""
from pathlib import Path
import re


def _src():
    return (Path(__file__).resolve().parents[1] / "routes" / "reports_routes.py").read_text(encoding="utf-8")


def _pl_body():
    src = _src()
    m = re.search(
        r"async def get_profit_loss_report.*?(?=\n@router\.|\nasync def |\Z)",
        src,
        re.DOTALL,
    )
    assert m, "function not found"
    return m.group(0)


def test_profit_loss_uses_unified_costs_map():
    body = _pl_body()
    assert "_build_current_costs_map" in body, (
        "profit-loss must use unified costs map (consistent with sales report)"
    )


def test_profit_loss_does_not_sum_stale_order_total_cost():
    body = _pl_body()
    assert 'sum(o.get("total_cost", 0)' not in body, (
        "Must NOT sum stale order.total_cost. Compute COGS from unified map × qty."
    )


def test_profit_loss_computes_cogs_as_sum_of_per_item_resolved_cost():
    body = _pl_body()
    # Should iterate over items and apply (unit_cost + unit_pkg) × qty
    assert "_by_id.get(pid_ref)" in body
    assert re.search(r'\(entry\["unit_cost"\]\s*\+\s*entry\["unit_pkg"\]\)\s*\*\s*qty', body), (
        "COGS must equal (unit_cost + unit_pkg) × qty per item"
    )


def test_net_profit_in_response_shape_unchanged():
    src = _src()
    pl = _pl_body()
    # Response still contains net_profit, total_operating_costs, gross_profit
    assert '"net_profit"' in pl
    assert '"total_operating_costs"' in pl
    assert '"gross_profit"' in pl


def test_net_profit_subtracts_operating_costs_from_gross():
    body = _pl_body()
    # Pin the formula: net_profit = gross_profit - total_operating_costs
    assert "net_profit = gross_profit - total_operating_costs" in body
