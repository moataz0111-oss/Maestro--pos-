/**
 * Regression guard: WeeklyLowProfitAlert component mounted globally in App.
 *
 * Feature (May 24, 2026): A weekly banner that proactively alerts the manager
 * when last-week's sold products had a profit margin below threshold (default 10%).
 * After review, banner is dismissed for the current ISO week (localStorage).
 *
 * Goals tested here:
 *  - Component imported & mounted globally in App.js (so it appears on every page).
 *  - Component file references the correct backend endpoint.
 *  - Component uses week_id localStorage strategy to avoid nagging.
 *  - Component renders nothing when total_count === 0.
 */
const fs = require('fs');
const path = require('path');

const APP_PATH = path.resolve(__dirname, '..', 'App.js');
const COMPONENT_PATH = path.resolve(__dirname, '..', 'components', 'WeeklyLowProfitAlert.jsx');

describe('WeeklyLowProfitAlert — global mount + endpoint contract', () => {
  let appSource;
  let compSource;
  beforeAll(() => {
    appSource = fs.readFileSync(APP_PATH, 'utf-8');
    compSource = fs.readFileSync(COMPONENT_PATH, 'utf-8');
  });

  test('App.js imports WeeklyLowProfitAlert', () => {
    expect(appSource).toMatch(
      /import\s+WeeklyLowProfitAlert\s+from\s+["']\.\/components\/WeeklyLowProfitAlert["']/
    );
  });

  test('App.js mounts <WeeklyLowProfitAlert /> globally (inside BrowserRouter)', () => {
    expect(appSource).toMatch(/<WeeklyLowProfitAlert\s*\/>/);
  });

  test('Component calls correct backend endpoint', () => {
    expect(compSource).toMatch(/\/reports\/weekly-low-profit/);
  });

  test('Component sends Authorization header from localStorage token', () => {
    expect(compSource).toMatch(/localStorage\.getItem\(['"]token['"]\)/);
    expect(compSource).toMatch(/Authorization:\s*`Bearer\s+\$\{token\}`/);
  });

  test('Component uses week_id localStorage strategy to suppress duplicate alerts', () => {
    expect(compSource).toMatch(/maestro_low_profit_dismissed_week/);
    expect(compSource).toMatch(/dismissedWeek\s*===\s*payload\.week_id/);
  });

  test('Component returns null when total_count === 0 (no banner spam)', () => {
    expect(compSource).toMatch(/total_count.*===?\s*0/);
  });

  test('Banner has data-testid hooks for QA', () => {
    expect(compSource).toMatch(/data-testid=["']low-profit-alert-banner["']/);
    expect(compSource).toMatch(/data-testid=["']low-profit-dismiss-btn["']/);
  });

  test('Dismiss button persists week_id to localStorage', () => {
    expect(compSource).toMatch(
      /localStorage\.setItem\(\s*STORAGE_KEY\s*,\s*data\.week_id\s*\)/
    );
  });
});
