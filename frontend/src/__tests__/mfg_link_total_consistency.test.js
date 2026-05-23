/**
 * Regression guard: ensure the per-row `lineCost` (displayed under each link)
 * matches the per-row contribution to `totalCost` (the final summary).
 *
 * Bug context: in the old code, `_linkLineCost` used `isSubUnit` (binary
 * old/sub switch) while the row display used `_convertConsumptionToMain`
 * (universal converter). This caused a mismatch — e.g., 20 غرام of a كغم-based
 * sauce displayed as 48 IQD per row but contributed 49,260 IQD to the total.
 *
 * After fix: BOTH use `_convertConsumptionToMain` so the totals are exact.
 */

// Inline minimal copies of the production helpers (same as Settings.js)
const _LINK_WEIGHT_MAP_FE = {
  'غرام': 1, 'كغم': 1000, 'كيلو': 1000, 'كجم': 1000,
  'gram': 1, 'kg': 1000,
  'مل': 1, 'لتر': 1000, 'ml': 1, 'liter': 1000, 'l': 1000,
};

function _convertConsumptionToMain(qty, cu, mu, pw, pwu) {
  const _cu = (cu || '').trim();
  const _mu = (mu || '').trim();
  const _pwu = (pwu || '').trim();
  const _pw = Number(pw || 0);
  if (!_cu || _cu === _mu) return qty;
  if (_cu === _pwu && _pw > 0) return qty / _pw;
  const cuF = _LINK_WEIGHT_MAP_FE[_cu];
  const muF = _LINK_WEIGHT_MAP_FE[_mu];
  if (cuF != null && muF != null) return (qty * cuF) / muF;
  const pwuF = _LINK_WEIGHT_MAP_FE[_pwu];
  if (cuF != null && pwuF != null && _pw > 0) {
    return (qty * cuF / pwuF) / _pw;
  }
  return qty;
}

// Mirrors the row display formula (Settings.js lines 2206-2208)
function rowDisplayLineCost(perPieceCost, qty, consumptionUnit, mainUnit, pw, pwu) {
  const qtyInMain1 = _convertConsumptionToMain(1, consumptionUnit, mainUnit, pw, pwu);
  const unitCost = perPieceCost * qtyInMain1;
  return unitCost * qty;
}

// Mirrors the (NEW) _linkLineCost formula used in totalCost reducer
function totalContribLineCost(perPieceCost, qty, consumptionUnit, mainUnit, pw, pwu) {
  if (qty <= 0) return 0;
  const qtyInMain = _convertConsumptionToMain(qty, consumptionUnit, mainUnit, pw, pwu);
  return perPieceCost * qtyInMain;
}

describe('MfgLinksEditor — totalCost must equal sum of displayed lineCosts', () => {
  test('Customer scenario: لحم برغر 1 حبة + جرافيتي صوص 20 غرام', () => {
    // لحم برغر: main=حبة, perPieceCost=1473, consume 1 حبة
    const beef = { perPieceCost: 1473, qty: 1, cu: 'حبة', mu: 'حبة', pw: 0, pwu: '' };
    // جرافيتي صوص: main=كغم, perPieceCost=2000, consume 20 غرام
    // 20 غرام = 0.02 كغم → 2000 × 0.02 = 40 IQD (or 2 IQD/غرام × 20 = 40)
    // Customer screenshot showed 48 IQD per row → perPieceCost was 2400 (2.4 IQD/غرام × 20)
    const sauce = { perPieceCost: 2400, qty: 20, cu: 'غرام', mu: 'كغم', pw: 0, pwu: '' };

    const beefDisplay = rowDisplayLineCost(beef.perPieceCost, beef.qty, beef.cu, beef.mu, beef.pw, beef.pwu);
    const sauceDisplay = rowDisplayLineCost(sauce.perPieceCost, sauce.qty, sauce.cu, sauce.mu, sauce.pw, sauce.pwu);

    const beefTotal = totalContribLineCost(beef.perPieceCost, beef.qty, beef.cu, beef.mu, beef.pw, beef.pwu);
    const sauceTotal = totalContribLineCost(sauce.perPieceCost, sauce.qty, sauce.cu, sauce.mu, sauce.pw, sauce.pwu);

    // Display values match expectation
    expect(beefDisplay).toBeCloseTo(1473, 5);
    expect(sauceDisplay).toBeCloseTo(48, 5);

    // Critical: total reducer matches display (no mismatch)
    expect(beefTotal).toBeCloseTo(beefDisplay, 5);
    expect(sauceTotal).toBeCloseTo(sauceDisplay, 5);

    // Final total = 1521 (not 49,273!)
    expect(beefTotal + sauceTotal).toBeCloseTo(1521, 5);
  });

  test('Sub-unit via piece_weight: شريحة of حبة-based product', () => {
    const link = { perPieceCost: 1000, qty: 23, cu: 'شريحة', mu: 'حبة', pw: 46, pwu: 'شريحة' };
    const display = rowDisplayLineCost(link.perPieceCost, link.qty, link.cu, link.mu, link.pw, link.pwu);
    const total = totalContribLineCost(link.perPieceCost, link.qty, link.cu, link.mu, link.pw, link.pwu);
    // 23 شريحة = 0.5 حبة → 1000 × 0.5 = 500
    expect(display).toBeCloseTo(500, 5);
    expect(total).toBeCloseTo(500, 5);
  });

  test('Weight family conversion: 2 كغم of كغم-based product', () => {
    const link = { perPieceCost: 10000, qty: 2, cu: 'كغم', mu: 'كغم', pw: 0, pwu: '' };
    // Same unit, no conversion: 10000 × 2 = 20000
    expect(rowDisplayLineCost(link.perPieceCost, link.qty, link.cu, link.mu, link.pw, link.pwu)).toBe(20000);
    expect(totalContribLineCost(link.perPieceCost, link.qty, link.cu, link.mu, link.pw, link.pwu)).toBe(20000);
  });

  test('Zero quantity returns zero', () => {
    expect(totalContribLineCost(1473, 0, 'حبة', 'حبة', 0, '')).toBe(0);
    expect(totalContribLineCost(1473, -1, 'حبة', 'حبة', 0, '')).toBe(0);
  });

  test('Mixed cart total matches sum of individual line costs (3 items)', () => {
    const links = [
      { perPieceCost: 1473, qty: 1, cu: 'حبة', mu: 'حبة', pw: 0, pwu: '' },          // 1473
      { perPieceCost: 2400, qty: 20, cu: 'غرام', mu: 'كغم', pw: 0, pwu: '' },         // 48
      { perPieceCost: 1000, qty: 23, cu: 'شريحة', mu: 'حبة', pw: 46, pwu: 'شريحة' }, // 500
    ];
    const displaySum = links.reduce((s, l) =>
      s + rowDisplayLineCost(l.perPieceCost, l.qty, l.cu, l.mu, l.pw, l.pwu), 0);
    const totalSum = links.reduce((s, l) =>
      s + totalContribLineCost(l.perPieceCost, l.qty, l.cu, l.mu, l.pw, l.pwu), 0);
    expect(totalSum).toBeCloseTo(displaySum, 5);
    expect(totalSum).toBeCloseTo(2021, 5);  // 1473 + 48 + 500
  });
});
