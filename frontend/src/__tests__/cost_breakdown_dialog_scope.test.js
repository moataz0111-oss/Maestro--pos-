/**
 * Regression: showCostBreakdown state must be reachable wherever
 * setShowCostBreakdown is called. The bug was: state defined inside
 * ComprehensiveReportTab, but setShowCostBreakdown also called from the
 * Sales tab in the outer Reports component → ReferenceError on page load.
 *
 * New architecture: state lives in Reports (outer), passed as props to
 * ComprehensiveReportTab. Dialog rendered once in Reports (outside tabs).
 */
const fs = require('fs');
const path = require('path');

const REPORTS_PATH = path.resolve(__dirname, '..', 'pages', 'Reports.js');

describe('Cost-breakdown Dialog scope (Reports.js)', () => {
  let src;
  let lines;
  beforeAll(() => {
    src = fs.readFileSync(REPORTS_PATH, 'utf-8');
    lines = src.split('\n');
  });

  function lineOf(needle) {
    return lines.findIndex((l) => l.includes(needle)) + 1;
  }

  test('useState for showCostBreakdown lives in Reports outer function', () => {
    const reportsStart = lineOf('export default function Reports()');
    const stateLine = lineOf('const [showCostBreakdown, setShowCostBreakdown]');
    expect(reportsStart).toBeGreaterThan(0);
    expect(stateLine).toBeGreaterThan(reportsStart);
  });

  test('ComprehensiveReportTab receives showCostBreakdown via props (destructured)', () => {
    const compStart = lineOf('const ComprehensiveReportTab = ({');
    const propsBlockEnd = lines.findIndex((l, i) => i > compStart && l.includes('}) => {')) + 1;
    const propsBlock = lines.slice(compStart - 1, propsBlockEnd).join('\n');
    expect(propsBlock).toMatch(/showCostBreakdown/);
    expect(propsBlock).toMatch(/setShowCostBreakdown/);
  });

  test('ComprehensiveReportTab does NOT redeclare showCostBreakdown via useState', () => {
    const compStart = lineOf('const ComprehensiveReportTab = ({');
    const smartStart = lineOf('const SmartReportTab = ');
    const compBody = lines.slice(compStart - 1, smartStart - 1).join('\n');
    expect(compBody).not.toMatch(/useState\(null\).*showCostBreakdown/);
    expect(compBody).not.toMatch(/const \[showCostBreakdown, setShowCostBreakdown\]\s*=\s*useState/);
  });

  test('Dialog (cost-breakdown-dialog) rendered inside Reports outer function', () => {
    const reportsStart = lineOf('export default function Reports()');
    const dialogTestIdLine = lines.findIndex(
      (l, i) => i >= reportsStart && l.includes('data-testid="cost-breakdown-dialog"')
    ) + 1;
    expect(dialogTestIdLine).toBeGreaterThan(reportsStart);
  });

  test('JSX call sites pass showCostBreakdown/setShowCostBreakdown to ComprehensiveReportTab', () => {
    // The <ComprehensiveReportTab .../> usage should forward the props
    const usageIdx = src.indexOf('<ComprehensiveReportTab');
    expect(usageIdx).toBeGreaterThan(0);
    // Find the closing /> after it
    const closeIdx = src.indexOf('/>', usageIdx);
    const usageBlock = src.slice(usageIdx, closeIdx + 2);
    expect(usageBlock).toMatch(/showCostBreakdown=\{showCostBreakdown\}/);
    expect(usageBlock).toMatch(/setShowCostBreakdown=\{setShowCostBreakdown\}/);
  });
});
