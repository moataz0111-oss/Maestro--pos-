/**
 * Regression: When the user is on the "المبيعات" tab in Reports, the
 * "صافي الربح" card must show NET profit (gross - operating - salaries -
 * expenses), not just gross profit.
 *
 * Root cause: profit-loss endpoint was only fetched when activeTab=='profit'.
 * The Sales tab card uses `profitLossReport?.net_profit?.amount` so when
 * profitLossReport is null on Sales tab, it falls back to gross.
 *
 * Fix: fetchReports for activeTab==='sales' now ALSO fetches /profit-loss
 * in parallel so the Net Profit card is accurate immediately.
 */
const fs = require('fs');
const path = require('path');
const REPORTS_PATH = path.resolve(__dirname, '..', 'pages', 'Reports.js');

describe('Sales tab also fetches profit-loss for accurate Net Profit', () => {
  let src;
  beforeAll(() => {
    src = fs.readFileSync(REPORTS_PATH, 'utf-8');
  });

  test('Sales case fetches BOTH /reports/sales and /reports/profit-loss in parallel', () => {
    // Locate the switch case for 'sales'
    const idx = src.indexOf("case 'sales':");
    expect(idx).toBeGreaterThan(0);
    // The block that ends at "break;" right after
    const block = src.slice(idx, idx + 800);
    expect(block).toMatch(/Promise\.all/);
    expect(block).toMatch(/axios\.get\(`\$\{API\}\/reports\/sales`/);
    expect(block).toMatch(/axios\.get\(`\$\{API\}\/reports\/profit-loss`/);
  });

  test('Sales case still updates setSalesReport', () => {
    const idx = src.indexOf("case 'sales':");
    const block = src.slice(idx, idx + 800);
    expect(block).toMatch(/setSalesReport\(salesRes\.data\)/);
  });

  test('Sales case updates setProfitLossReport when profit-loss succeeds', () => {
    const idx = src.indexOf("case 'sales':");
    const block = src.slice(idx, idx + 800);
    expect(block).toMatch(/setProfitLossReport\(profitForSalesRes\.data\)/);
  });

  test('Sales case gracefully handles profit-loss failure (does not break sales)', () => {
    const idx = src.indexOf("case 'sales':");
    const block = src.slice(idx, idx + 800);
    // .catch fallback on the profit-loss promise
    expect(block).toMatch(/profit-loss`,\s*\{\s*params\s*\}\)\.catch/);
  });
});
