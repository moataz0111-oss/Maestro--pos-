/**
 * Tests for "Add Stock" (زيادة الكمية) unit conversion logic.
 *
 * User requested: allow choosing the input unit (gram or piece).
 * System auto-converts to product's main unit before posting to backend.
 *
 * Example: 
 *   Product unit = "قطعة", piece_weight = 550 grams, piece_weight_unit = "غرام"
 *   User enters "1100 غرام" → system converts: 1100/550 = 2 قطعة
 */

const _WT = { 'غرام': 1, 'كغم': 1000, 'كيلو': 1000, 'كجم': 1000, 'مل': 1, 'لتر': 1000 };
const _WEIGHT_SET = new Set(['غرام','كغم','كيلو','كجم','مل','لتر']);

function convertToProductUnit(addStockQuantity, addStockUnit, product) {
  const mainUnit = product.unit;
  const pwu = product.piece_weight_unit;
  const pw = Number(product.piece_weight || 0);
  if (!addStockUnit || addStockUnit === mainUnit || pw <= 0) {
    return addStockQuantity;
  }
  const mainIsWeight = _WEIGHT_SET.has(mainUnit);
  const pieceUnitImplicit = (pwu && !_WEIGHT_SET.has(pwu)) ? pwu : 'قطعة';
  // Case A: weight product + user enters piece count → multiply
  if (mainIsWeight && addStockUnit === pieceUnitImplicit) {
    const pieceInMain = pw * (_WT[pwu] || 1) / (_WT[mainUnit] || 1);
    return addStockQuantity * pieceInMain;
  }
  // Case B: piece product + user enters sub-unit (exact pwu match) → divide
  if (addStockUnit === pwu) {
    return addStockQuantity / pw;
  }
  // Case C: piece product + user enters a weight unit (pwu is also weight) → base conversion + divide
  if (!mainIsWeight && _WT[addStockUnit] && _WT[pwu]) {
    const inputInBaseGrams = addStockQuantity * _WT[addStockUnit];
    const pieceInBaseGrams = pw * _WT[pwu];
    if (pieceInBaseGrams > 0) return inputInBaseGrams / pieceInBaseGrams;
  }
  // Case D: weight ↔ weight (both product and input are weight)
  if (_WT[addStockUnit] && _WT[mainUnit]) {
    return addStockQuantity * (_WT[addStockUnit] / _WT[mainUnit]);
  }
  return addStockQuantity;
}

describe('Add Stock unit conversion', () => {
  test('main unit selection → no conversion', () => {
    const p = { unit: 'قطعة', piece_weight: 550, piece_weight_unit: 'غرام' };
    expect(convertToProductUnit(2, 'قطعة', p)).toBe(2);
  });

  test('1100 غرام input for قطعة-product (1 قطعة = 550 غرام) → 2 قطعة', () => {
    const p = { unit: 'قطعة', piece_weight: 550, piece_weight_unit: 'غرام' };
    expect(convertToProductUnit(1100, 'غرام', p)).toBe(2);
  });

  test('500 غرام input for قطعة-product (1 قطعة = 550 غرام) → ~0.909 قطعة', () => {
    const p = { unit: 'قطعة', piece_weight: 550, piece_weight_unit: 'غرام' };
    expect(convertToProductUnit(500, 'غرام', p)).toBeCloseTo(500 / 550, 4);
  });

  test('2 كغم input when piece_weight is in غرام → uses weight base conversion', () => {
    const p = { unit: 'قطعة', piece_weight: 250, piece_weight_unit: 'غرام' };
    // 2 كغم = 2000 غرام / 250 = 8 قطع
    expect(convertToProductUnit(2, 'كغم', p)).toBe(8);
  });

  test('شريحة input for قطعة-product (1 قطعة = 46 شريحة) → divides', () => {
    const p = { unit: 'قطعة', piece_weight: 46, piece_weight_unit: 'شريحة' };
    expect(convertToProductUnit(92, 'شريحة', p)).toBe(2);
  });

  test('no piece_weight set → returns as-is', () => {
    const p = { unit: 'قطعة', piece_weight: 0 };
    expect(convertToProductUnit(5, 'غرام', p)).toBe(5);
  });

  // ⭐ Critical new case: weight-based product + user enters piece count
  test('weight product (unit=غرام, piece_weight=30 غرام) + قطعة input → multiplies', () => {
    const p = { unit: 'غرام', piece_weight: 30, piece_weight_unit: 'غرام' };
    // User enters 5 قطعة → 5 × 30 = 150 غرام
    expect(convertToProductUnit(5, 'قطعة', p)).toBe(150);
  });

  test('weight product (unit=كغم, piece_weight=550 غرام) + قطعة input → converts via base', () => {
    const p = { unit: 'كغم', piece_weight: 550, piece_weight_unit: 'غرام' };
    // 1 قطعة = 550 غرام = 0.55 كغم → 2 قطعة = 1.1 كغم
    expect(convertToProductUnit(2, 'قطعة', p)).toBeCloseTo(1.1, 4);
  });

  test('weight product with explicit pwu non-weight (شريحة) + شريحة input', () => {
    const p = { unit: 'غرام', piece_weight: 30, piece_weight_unit: 'شريحة' };
    // 1 شريحة = 30 غرام → 5 شريحة = 150 غرام
    expect(convertToProductUnit(5, 'شريحة', p)).toBe(150);
  });


  test('empty addStockUnit defaults to no conversion', () => {
    const p = { unit: 'قطعة', piece_weight: 550, piece_weight_unit: 'غرام' };
    expect(convertToProductUnit(3, '', p)).toBe(3);
    expect(convertToProductUnit(3, null, p)).toBe(3);
  });
});
