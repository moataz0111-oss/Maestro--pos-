/**
 * Test: حساب سعر القطعة الواحدة للمنتجات القطعية بدون pack_info
 * (مثال: بان 5انش = 24 قطعة في الوصفة، piece_weight=1 قطعة → عائد=24)
 */

const _W = {
  'غرام': 1, 'كغم': 1000, 'كيلو': 1000, 'كجم': 1000, 'gram': 1, 'kg': 1000,
  'مل': 1, 'لتر': 1000, 'ml': 1, 'liter': 1000, 'l': 1000
};
const _COUNT = new Set(['قطعة', 'حبة', 'علبة', 'كرتون', 'صحن', 'piece']);

function computeYieldAndUnitCost(product, rawMaterials = []) {
  const pw = Number(product.piece_weight || 0);
  const pwu = product.piece_weight_unit || 'غرام';
  const pieceGrams = pw * (_W[pwu] || 1);
  let totalGrams = 0;
  for (const ing of (product.recipe || [])) {
    const q = Number(ing.quantity || 0);
    const f = _W[ing.unit];
    if (f) totalGrams += q * f;
    else if (_COUNT.has(ing.unit)) {
      const mat = rawMaterials.find(r => r.id === ing.raw_material_id);
      if (mat && mat.pack_quantity && mat.pack_unit) {
        const pf = _W[mat.pack_unit] || 0;
        if (pf > 0) totalGrams += q * Number(mat.pack_quantity) * pf;
      }
    }
  }
  const calcYield = (pieceGrams > 0 && totalGrams > 0) ? totalGrams / pieceGrams : 0;
  let countYield = 0;
  if (calcYield === 0 && pw > 0 && _COUNT.has(pwu)) {
    let sumSameUnit = 0;
    for (const ing of (product.recipe || [])) {
      if (ing.unit === pwu) sumSameUnit += Number(ing.quantity || 0);
    }
    if (sumSameUnit > 0) countYield = sumSameUnit / pw;
  }
  const finalYield = calcYield || countYield;
  const denom = finalYield || Number(product.quantity || 0) || 1;
  const batchAfter = Number(product.raw_material_cost_after_waste || 0);
  const unitAfter = batchAfter / denom;
  return { finalYield, unitAfter: Math.round(unitAfter * 100) / 100 };
}

describe('Per-unit cost for count-based recipes', () => {
  test('بان 5انش: 24 قطعة × 400 = 9697 IQD → سعر القطعة الواحدة = 404 IQD', () => {
    const product = {
      unit: 'قطعة',
      piece_weight: 1,
      piece_weight_unit: 'قطعة',
      quantity: 0,
      raw_material_cost_after_waste: 9697,
      recipe: [{ raw_material_id: 'r1', raw_material_name: 'بان 5 انش', quantity: 24, unit: 'قطعة', cost_per_unit: 400 }],
    };
    const r = computeYieldAndUnitCost(product);
    expect(r.finalYield).toBe(24);
    expect(r.unitAfter).toBeCloseTo(404.04, 1);
  });

  test('weight-based recipe: piece_weight=100 غرام, ingredient=1 كغم → عائد=10', () => {
    const product = {
      unit: 'قطعة',
      piece_weight: 100,
      piece_weight_unit: 'غرام',
      raw_material_cost_after_waste: 1000,
      recipe: [{ raw_material_id: 'r2', raw_material_name: 'دجاج', quantity: 1, unit: 'كغم', cost_per_unit: 1000 }],
    };
    const r = computeYieldAndUnitCost(product);
    expect(r.finalYield).toBe(10);
    expect(r.unitAfter).toBe(100);
  });

  test('no yield possible → unitAfter = batch_after / quantity', () => {
    const product = {
      unit: 'قطعة',
      piece_weight: 0,  // no piece_weight defined
      piece_weight_unit: 'غرام',
      quantity: 5,
      raw_material_cost_after_waste: 1000,
      recipe: [{ raw_material_id: 'r3', raw_material_name: 'x', quantity: 1, unit: 'قطعة', cost_per_unit: 1000 }],
    };
    const r = computeYieldAndUnitCost(product);
    expect(r.finalYield).toBe(0);
    expect(r.unitAfter).toBe(200);  // 1000 / 5
  });
});
