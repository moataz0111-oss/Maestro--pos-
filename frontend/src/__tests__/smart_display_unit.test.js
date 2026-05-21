/**
 * Test smart display unit derivation for manufactured product cards.
 *
 * Scenario: User configured "أرز ريزو" with:
 *   - product.unit = "غرام" (weight unit) ← unusual
 *   - piece_weight_unit = "حصة" (count unit)
 *   - piece_weight = 167
 *   - quantity (storedQty) = 6000
 *
 * Without fix, card shows "6000 غرام", price "per gram".
 * With fix, card displays "6000 حصة" and "price per حصة" — matching what
 * the recipe yield (6000) actually represents.
 */

const COUNT_UNITS = new Set(['قطعة','حبة','شريحة','حصة','كأس','كاب','قدح','صحن','علبة','كرتون','كيس','باكيت','رول','زجاجة','ربطة','piece']);
const WEIGHT_UNITS = new Set(['غرام','كغم','كيلو','كجم','مل','لتر','gram','kg','ml','l','liter']);

const smartDisplayUnit = (product) => {
  const pwu = product.piece_weight_unit;
  const unit = product.unit;
  if (pwu && COUNT_UNITS.has(pwu) && WEIGHT_UNITS.has(unit)) {
    return pwu;
  }
  return unit || 'قطعة';
};

describe('Smart display unit derivation', () => {
  test('Weight unit + count piece_weight_unit → uses piece_weight_unit', () => {
    const product = {
      unit: 'غرام',
      piece_weight: 167,
      piece_weight_unit: 'حصة',
    };
    expect(smartDisplayUnit(product)).toBe('حصة');
  });

  test('Normal piece-based product → uses product.unit', () => {
    const product = {
      unit: 'حبة',
      piece_weight: 200,
      piece_weight_unit: 'غرام',
    };
    expect(smartDisplayUnit(product)).toBe('حبة');
  });

  test('Both count units (e.g. حبة → شريحة) → uses product.unit', () => {
    const product = {
      unit: 'حبة',
      piece_weight: 46,
      piece_weight_unit: 'شريحة',
    };
    expect(smartDisplayUnit(product)).toBe('حبة');
  });

  test('No piece_weight_unit → fallback to product.unit', () => {
    const product = { unit: 'كغم' };
    expect(smartDisplayUnit(product)).toBe('كغم');
  });

  test('Missing unit → defaults to قطعة', () => {
    const product = {};
    expect(smartDisplayUnit(product)).toBe('قطعة');
  });

  test('Includes newly added units كاب and قدح', () => {
    const product = {
      unit: 'مل',
      piece_weight: 250,
      piece_weight_unit: 'كاب',
    };
    expect(smartDisplayUnit(product)).toBe('كاب');

    const product2 = {
      unit: 'لتر',
      piece_weight: 0.2,
      piece_weight_unit: 'قدح',
    };
    expect(smartDisplayUnit(product2)).toBe('قدح');
  });

  test('Sale unit "صحن" with weight product.unit', () => {
    const product = {
      unit: 'غرام',
      piece_weight: 300,
      piece_weight_unit: 'صحن',
    };
    expect(smartDisplayUnit(product)).toBe('صحن');
  });
});
