/**
 * Regression: BreakEvenReport must show a "رواتب خارجية" section for each
 * branch — listing the admin-department employees, their departments, and
 * the share allocated to this specific branch (daily / monthly).
 */
const fs = require('fs');
const path = require('path');

const BREAKEVEN_PATH = path.resolve(__dirname, '..', 'pages', 'BreakEvenReport.js');

describe('BreakEvenReport — external salaries section per branch', () => {
  let src;
  beforeAll(() => {
    src = fs.readFileSync(BREAKEVEN_PATH, 'utf-8');
  });

  test('Section renders when branch has external_salaries_share.daily > 0', () => {
    expect(src).toMatch(/branch\.external_salaries_share\?\.daily\s*\?\?\s*0\s*\)\s*>\s*0/);
    expect(src).toMatch(/data-testid="external-salaries-section"/);
  });

  test('Shows the share amount with daily/monthly switch', () => {
    expect(src).toMatch(/data-testid="external-share-amount"/);
    expect(src).toMatch(/branch\.external_salaries_share\?\.daily/);
    expect(src).toMatch(/branch\.external_salaries_share\?\.monthly_equivalent/);
  });

  test('Lists external employees from data.external_salaries.employees', () => {
    expect(src).toMatch(/data\.external_salaries\.employees\.map/);
    expect(src).toMatch(/external-emp-\$\{emp\.id\}/);
  });

  test('Each row shows name, department, monthly salary, share per branch', () => {
    expect(src).toMatch(/emp\.name/);
    expect(src).toMatch(/emp\.department/);
    expect(src).toMatch(/emp\.monthly_salary/);
    expect(src).toMatch(/emp\.share_per_branch_daily/);
  });

  test('Departments list rendered as comma-separated chip', () => {
    expect(src).toMatch(/data\.external_salaries\.departments\.join/);
  });

  test('Informational footer explains the distribution logic', () => {
    expect(src).toMatch(/المطبخ المركزي\/المخزن\/المشتريات/);
  });
});
