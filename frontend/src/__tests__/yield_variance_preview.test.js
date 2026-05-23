/**
 * Test yield variance computation client-side for the Produce dialog.
 *
 * The actual yield input lets the user record real-world production output,
 * and the UI shows a preview of the variance vs expected (produceQuantity).
 *
 * Backend round-trips this as actual_yield query param, and saves a
 * yield_variances record with {expected_yield, actual_yield, variance, variance_pct}.
 */

const computeVariancePreview = (produceQuantity, actualYieldStr) => {
  const ay = actualYieldStr === '' || actualYieldStr === null ? null : Number(actualYieldStr);
  if (ay === null || isNaN(ay) || ay < 0) return null;
  const variance = ay - produceQuantity;
  const pct = produceQuantity > 0 ? (variance / produceQuantity) * 100 : 0;
  return {
    variance: Number(variance.toFixed(6)),
    pct: Number(pct.toFixed(3)),
    positive: variance > 0,
    matches: Math.abs(variance) < 1e-6,
  };
};

describe('Yield variance preview (Produce dialog)', () => {
  test('Empty actual yield returns null (no preview)', () => {
    expect(computeVariancePreview(91, '')).toBeNull();
  });

  test('Equal actual yield → matches=true, variance=0', () => {
    const r = computeVariancePreview(91, '91');
    expect(r.matches).toBe(true);
    expect(r.variance).toBe(0);
    expect(r.pct).toBe(0);
  });

  test('Under-yield (waste) → negative variance', () => {
    const r = computeVariancePreview(91, '85');
    expect(r.variance).toBe(-6);
    expect(r.pct).toBeCloseTo(-6.593, 2);
    expect(r.positive).toBe(false);
  });

  test('Over-yield (bonus) → positive variance', () => {
    const r = computeVariancePreview(91, '95');
    expect(r.variance).toBe(4);
    expect(r.pct).toBeCloseTo(4.396, 2);
    expect(r.positive).toBe(true);
  });

  test('Beef Bacon scenario: 91.67 expected, 85 actual', () => {
    const r = computeVariancePreview(91.67, '85');
    expect(r.variance).toBeCloseTo(-6.67, 2);
    expect(r.pct).toBeCloseTo(-7.276, 2);
  });

  test('Negative actual yield rejected (returns null)', () => {
    expect(computeVariancePreview(91, '-5')).toBeNull();
  });

  test('Non-numeric input rejected', () => {
    expect(computeVariancePreview(91, 'abc')).toBeNull();
  });
});
