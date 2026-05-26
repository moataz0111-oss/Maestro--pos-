/**
 * Regression: offline POS orders must save delivery_company_id and
 * delivery_company_name (the names the backend sync handler reads), not
 * the legacy delivery_app field alone — otherwise the order gets synced
 * as "آجل عدي" (regular credit) instead of being routed to the company.
 *
 * User reported (May 26, 2026): 3 orders for توترز customers became
 * regular credit after an internet outage.
 */
const fs = require('fs');
const path = require('path');

const POS_PATH = path.resolve(__dirname, '..', 'pages', 'POS.js');
const REPORTS_PATH = path.resolve(__dirname, '..', 'pages', 'Reports.js');

describe('Offline order → delivery company routing', () => {
  let posSrc;
  let reportsSrc;
  beforeAll(() => {
    posSrc = fs.readFileSync(POS_PATH, 'utf-8');
    reportsSrc = fs.readFileSync(REPORTS_PATH, 'utf-8');
  });

  test('Offline order payload (save & send) includes delivery_company_id + name', () => {
    // Find the offline-builder block with delivery_company_id (skip earlier non-offline blocks)
    const idx = posSrc.indexOf('delivery_company_id: orderType === \'delivery\'');
    expect(idx).toBeGreaterThan(0);
    const block = posSrc.slice(idx, idx + 600);
    expect(block).toMatch(/delivery_company_id:/);
    expect(block).toMatch(/delivery_company_name:/);
  });

  test('Final offline order payload (checkout) includes delivery_company_id + name', () => {
    // Second offline order builder (checkout)
    const matches = [...posSrc.matchAll(/payment_method: paymentMethod,/g)];
    expect(matches.length).toBeGreaterThan(0);
    const idx = matches[0].index;
    const block = posSrc.slice(idx, idx + 1000);
    expect(block).toMatch(/delivery_company_id:/);
    expect(block).toMatch(/delivery_company_name:/);
  });

  test('Offline order sets customer_type to "delivery_company" when delivery + app chosen', () => {
    expect(posSrc).toMatch(
      /customer_type:\s*orderType\s*===\s*['"]delivery['"]\s*&&\s*deliveryApp\s*\?\s*['"]delivery_company['"]/
    );
  });
});

describe('Reports → الآجل tab — "نقل لشركة" button', () => {
  let reportsSrc;
  beforeAll(() => {
    reportsSrc = fs.readFileSync(REPORTS_PATH, 'utf-8');
  });

  test('Button rendered next to "تحصيل" for each unpaid credit order', () => {
    // Template-literal data-testid: data-testid={`assign-company-btn-${order.order_number}`}
    expect(reportsSrc).toMatch(/assign-company-btn-\$\{order\.order_number\}/);
  });

  test('Dialog with delivery-company select exists', () => {
    expect(reportsSrc).toMatch(/data-testid="assign-company-dialog"/);
    expect(reportsSrc).toMatch(/data-testid="assign-company-select"/);
    expect(reportsSrc).toMatch(/data-testid="assign-company-confirm"/);
    expect(reportsSrc).toMatch(/data-testid="assign-company-cancel"/);
  });

  test('Handler calls correct backend endpoint with company id + note', () => {
    expect(reportsSrc).toMatch(
      /axios\.patch\(`\$\{API\}\/sync\/orders\/\$\{assignCompanyOrder\.id\}\/assign-delivery-company`/
    );
    expect(reportsSrc).toMatch(/delivery_company_id:\s*selectedAssignCompanyId/);
    expect(reportsSrc).toMatch(/note:\s*assignCompanyNote/);
  });

  test('Delivery-companies list fetched from /api/delivery-apps on open', () => {
    expect(reportsSrc).toMatch(/axios\.get\(`\$\{API\}\/delivery-apps`/);
  });
});
