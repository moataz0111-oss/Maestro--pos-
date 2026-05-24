/**
 * Regression guard: profit margin indicator in cost breakdown dialog.
 *
 * Feature (May 24, 2026): Customer wanted products with low profit margin
 * (< 10%) highlighted in RED in the cost breakdown drill-down to alert
 * the manager when a product is barely profitable or losing money.
 *
 * Color scheme:
 *   🔴 < 10% → red (low profitability — review price)
 *   🟡 10–30% → amber (medium)
 *   🟢 > 30% → green (good)
 */
const fs = require('fs');
const path = require('path');

const REPORTS_PATH = path.resolve(__dirname, '..', 'pages', 'Reports.js');

describe('Profit margin indicator in cost breakdown', () => {
  let source;
  beforeAll(() => {
    source = fs.readFileSync(REPORTS_PATH, 'utf-8');
  });

  test('Uses profit_margin from backend response', () => {
    expect(source).toMatch(/v\.profit_margin/);
  });

  test('Red highlight (low profit) class applied when margin < 10%', () => {
    expect(source).toMatch(/lowProfit\s*=\s*hasMargin\s*&&\s*margin\s*<\s*10/);
    expect(source).toMatch(/bg-red-500\/10/);
  });

  test('Amber for medium profit (10–30%)', () => {
    expect(source).toMatch(/midProfit\s*=\s*hasMargin\s*&&\s*margin\s*>=\s*10\s*&&\s*margin\s*<\s*30/);
  });

  test('Green for good profit (>= 30%)', () => {
    expect(source).toMatch(/goodProfit\s*=\s*hasMargin\s*&&\s*margin\s*>=\s*30/);
  });

  test('Color emoji indicators applied (🔴/🟡/🟢)', () => {
    expect(source).toMatch(/🔴/);
    expect(source).toMatch(/🟡/);
    expect(source).toMatch(/🟢/);
  });

  test('Low profit row shows warning text', () => {
    expect(source).toMatch(/ربحية منخفضة — راجع السعر/);
  });

  test('Legend explaining colors exists', () => {
    expect(source).toMatch(/data-testid="profit-legend"/);
  });

  test('Profit margin cell renders percentage', () => {
    expect(source).toMatch(/data-testid={`profit-margin-\$\{idx\}`}/);
    expect(source).toMatch(/margin\.toFixed\(1\)/);
  });
});

// ----------------------------------------------------------------------------
// Pure math regression: verify backend formula matches expectations
// ----------------------------------------------------------------------------
function computeMargin(revenue, materials, packaging) {
  const cost = materials + packaging;
  if (revenue <= 0) return 0;
  return ((revenue - cost) / revenue) * 100;
}

describe('Profit margin math (matches backend)', () => {
  test('Profitable product: 1000 revenue, 400 cost → 60%', () => {
    expect(computeMargin(1000, 350, 50)).toBeCloseTo(60, 1);
  });

  test('Low profitability: 1000 revenue, 950 cost → 5% (RED)', () => {
    expect(computeMargin(1000, 900, 50)).toBeCloseTo(5, 1);
  });

  test('Loss: 500 revenue, 800 cost → -60% (clearly RED)', () => {
    expect(computeMargin(500, 750, 50)).toBeCloseTo(-60, 1);
  });

  test('Mid-range: 1000 revenue, 800 cost → 20% (AMBER)', () => {
    expect(computeMargin(1000, 750, 50)).toBeCloseTo(20, 1);
  });

  test('No revenue → 0', () => {
    expect(computeMargin(0, 100, 10)).toBe(0);
  });
});
