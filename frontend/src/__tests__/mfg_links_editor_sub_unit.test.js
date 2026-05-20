/**
 * Tests for MfgLinksEditor sub-unit cost calculation logic.
 *
 * Real-world example:
 *   - Cheese block (حبة) with piece_weight=46 شريحة, batch produces 3 blocks.
 *   - raw_material_cost_after_waste = 13800 IQD for the batch.
 *   - Cost per block = 13800 / 3 = 4600 IQD.
 *   - Cost per slice = 4600 / 46 ≈ 100 IQD.
 *   - User links a "Burger" product → 2 slices of cheese per burger.
 *   - Expected line cost = 2 × 100 = 200 IQD.
 */

const _W = { 'غرام': 1, 'كغم': 1000, 'كيلو': 1000, 'كجم': 1000, 'gram': 1, 'kg': 1000, 'مل': 1, 'لتر': 1000 };

const _computeMfgUnitCost = (mp) => {
  if (!mp) return 0;
  // ⭐ Backend-computed value takes priority (single source of truth)
  const fromBackend = Number(mp.unit_cost_after_waste);
  if (fromBackend > 0) return fromBackend;
  const batchCost = Number(mp.raw_material_cost_after_waste ?? mp.production_cost ?? mp.raw_material_cost ?? 0);
  const pw = Number(mp.piece_weight || 0);
  const pwu = mp.piece_weight_unit || 'غرام';
  const pieceGrams = pw * (_W[pwu] || 1);
  let totalGrams = 0;
  for (const ing of (mp.recipe || [])) {
    const f = _W[ing.unit];
    if (f) totalGrams += Number(ing.quantity || 0) * f;
  }
  let calcYield = (pieceGrams > 0 && totalGrams > 0) ? totalGrams / pieceGrams : 0;
  if (calcYield === 0 && pw > 0) {
    let sumInPwu = 0;
    for (const ing of (mp.recipe || [])) {
      const qty = Number(ing.quantity || 0);
      if (ing.unit === pwu) { sumInPwu += qty; }
    }
    if (sumInPwu > 0) calcYield = sumInPwu / pw;
  }
  const denom = calcYield || Number(mp.quantity || 0) || 1;
  return batchCost / denom;
};

const _computeMfgSubUnitCost = (mp) => {
  if (!mp) return 0;
  const pw = Number(mp.piece_weight || 0);
  if (pw <= 0) return 0;
  return _computeMfgUnitCost(mp) / pw;
};

const _hasSubUnit = (mp) => {
  if (!mp) return false;
  const pw = Number(mp.piece_weight || 0);
  const pwu = mp.piece_weight_unit || '';
  return pw > 0 && pwu && pwu !== (mp.unit || 'حبة');
};

const lineCost = (mp, link) => {
  const consumptionUnit = link.consumption_unit || mp.unit || 'حبة';
  const isSubUnit = _hasSubUnit(mp) && consumptionUnit === mp.piece_weight_unit;
  const perUnit = isSubUnit ? _computeMfgSubUnitCost(mp) : _computeMfgUnitCost(mp);
  return perUnit * Number(link.consumption_qty || 0);
};

describe('MfgLinksEditor cost calculation', () => {
  test('weight-based recipe — per-piece cost', () => {
    const mp = {
      unit: 'حبة',
      piece_weight: 200,
      piece_weight_unit: 'غرام',
      raw_material_cost_after_waste: 6000,
      recipe: [{ unit: 'كغم', quantity: 1 }], // 1000g total
    };
    // calcYield = 1000 / 200 = 5 pieces; per piece = 6000/5 = 1200
    expect(_computeMfgUnitCost(mp)).toBeCloseTo(1200);
  });

  test('count-based recipe with slices — per-slice cost via fallback yield', () => {
    const mp = {
      unit: 'حبة',
      piece_weight: 46,
      piece_weight_unit: 'شريحة',
      raw_material_cost_after_waste: 13800,
      recipe: [{ unit: 'شريحة', quantity: 138 }], // 138 slices total
    };
    // calcYield = 0 (شريحة not in _W); fallback: sumInPwu=138, countYield=138/46=3 pieces
    // per piece = 13800/3 = 4600
    expect(_computeMfgUnitCost(mp)).toBeCloseTo(4600);
    // per slice = 4600 / 46 = 100
    expect(_computeMfgSubUnitCost(mp)).toBeCloseTo(100);
    expect(_hasSubUnit(mp)).toBe(true);
  });

  test('Burger linked to 2 slices of cheese — line cost = 200', () => {
    const mp = {
      unit: 'حبة',
      piece_weight: 46,
      piece_weight_unit: 'شريحة',
      raw_material_cost_after_waste: 13800,
      recipe: [{ unit: 'شريحة', quantity: 138 }],
    };
    const link = { consumption_qty: 2, consumption_unit: 'شريحة' };
    expect(lineCost(mp, link)).toBeCloseTo(200);
  });

  test('Linked at piece level — line cost = full piece cost', () => {
    const mp = {
      unit: 'حبة',
      piece_weight: 46,
      piece_weight_unit: 'شريحة',
      raw_material_cost_after_waste: 13800,
      recipe: [{ unit: 'شريحة', quantity: 138 }],
    };
    const link = { consumption_qty: 1, consumption_unit: 'حبة' };
    expect(lineCost(mp, link)).toBeCloseTo(4600);
  });

  test('Backward compat — missing consumption_unit defaults to main unit', () => {
    const mp = {
      unit: 'حبة',
      piece_weight: 46,
      piece_weight_unit: 'شريحة',
      raw_material_cost_after_waste: 13800,
      recipe: [{ unit: 'شريحة', quantity: 138 }],
    };
    const link = { consumption_qty: 1 };
    expect(lineCost(mp, link)).toBeCloseTo(4600);
  });

  test('No sub-unit (kg product) — _hasSubUnit returns false', () => {
    const mp = { unit: 'كغم', piece_weight: 0, piece_weight_unit: '' };
    expect(_hasSubUnit(mp)).toBe(false);
    expect(_computeMfgSubUnitCost(mp)).toBe(0);
  });

  test('Backend-computed unit_cost_after_waste takes priority over local calculation', () => {
    // Even if local calc would yield a different value, the backend value wins.
    const mp = {
      unit: 'حبة',
      piece_weight: 0,
      raw_material_cost_after_waste: 50000,
      quantity: 100,
      unit_cost_after_waste: 1473,
    };
    expect(_computeMfgUnitCost(mp)).toBe(1473);
  });
});
