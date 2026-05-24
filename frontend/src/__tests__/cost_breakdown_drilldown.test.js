/**
 * Regression guard for the cost breakdown dialog in Sales Report.
 *
 * Feature (May 24, 2026): Customer wanted to click on "تكلفة المواد" or
 * "تكلفة التغليف" cards in the sales report to see a per-product
 * breakdown showing each product sold + its materials/packaging cost.
 */
const fs = require('fs');
const path = require('path');

const REPORTS_PATH = path.resolve(__dirname, '..', 'pages', 'Reports.js');

describe('Cost breakdown drill-down (sales report)', () => {
  let source;
  beforeAll(() => {
    source = fs.readFileSync(REPORTS_PATH, 'utf-8');
  });

  test('Materials cost card is clickable', () => {
    expect(source).toMatch(/data-testid="materials-cost-card"/);
    expect(source).toMatch(/onClick={\(\)\s*=>\s*setShowCostBreakdown\('materials'\)}/);
  });

  test('Packaging cost card is clickable', () => {
    expect(source).toMatch(/data-testid="packaging-cost-card"/);
    expect(source).toMatch(/onClick={\(\)\s*=>\s*setShowCostBreakdown\('packaging'\)}/);
  });

  test('Cost breakdown dialog exists with empty + total + row testids', () => {
    expect(source).toMatch(/data-testid="cost-breakdown-dialog"/);
    expect(source).toMatch(/data-testid="cost-breakdown-empty"/);
    expect(source).toMatch(/data-testid="cost-breakdown-total"/);
    expect(source).toMatch(/data-testid={`cost-breakdown-row-\$\{idx\}`}/);
  });

  test('Uses cost_breakdown_by_product from salesReport', () => {
    expect(source).toMatch(/salesReport\?\.cost_breakdown_by_product/);
  });
});
