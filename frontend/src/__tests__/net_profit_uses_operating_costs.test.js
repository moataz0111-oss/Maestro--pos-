/**
 * Regression: "صافي الربح" (net profit) card must show the net amount
 * AFTER deducting operating costs (salaries, rent, electricity, expenses).
 *
 * User reported (May 24, 2026): the card showed the same number as
 * "إجمالي الأرباح" because it was using `salesReport.total_profit` (gross).
 * The dedicated `profitLossReport.net_profit.amount` was already fetched
 * but not used in this card.
 *
 * Fix: card now displays `profitLossReport?.net_profit?.amount` with
 * sub-text showing the deducted operating cost amount.
 */
const fs = require('fs');
const path = require('path');
const REPORTS_PATH = path.resolve(__dirname, '..', 'pages', 'Reports.js');

describe('Net profit card (Sales tab)', () => {
  let src;
  beforeAll(() => {
    src = fs.readFileSync(REPORTS_PATH, 'utf-8');
  });

  test('Net profit card uses profitLossReport.net_profit.amount', () => {
    // Locate the net profit card section
    const m = src.match(/data-testid="net-profit-value"[\s\S]{0,300}/);
    expect(m).not.toBeNull();
    expect(m[0]).toMatch(/profitLossReport\?\.net_profit\?\.amount/);
  });

  test('Falls back to total_profit if profitLossReport not yet loaded', () => {
    const m = src.match(/data-testid="net-profit-value"[\s\S]{0,300}/);
    expect(m[0]).toMatch(/\?\?\s*salesReport\.total_profit/);
  });

  test('Card shows deducted operating cost amount as sub-text', () => {
    expect(src).toMatch(/profitLossReport\?\.total_operating_costs\?\.total/);
    expect(src).toMatch(/بعد خصم التكاليف التشغيلية/);
  });

  test('Net profit value goes red when negative', () => {
    // The conditional class application using ?? salesReport.total_profit
    expect(src).toMatch(/\(profitLossReport\?\.net_profit\?\.amount\s*\?\?\s*salesReport\.total_profit\)\s*<\s*0/);
    expect(src).toMatch(/'text-red-600'\s*:\s*'text-emerald-600'/);
  });
});
