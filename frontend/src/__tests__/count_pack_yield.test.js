/**
 * Test the frontend yield/cost computation for count→count pack_info
 * (e.g., "بكن بقري" scenario).
 *
 * Real customer data:
 *   Raw material "لحم بقري مقدد": pack_quantity=10, pack_unit="قطعة" (1 carton = 10 slices)
 *   Manufactured "بكن بقري": piece_weight=1, piece_weight_unit="شريحة" (1 unit = 1 slice)
 *   Recipe: 5 قطعة of لحم بقري مقدد → 5 × 10 = 50 slices → yield = 50 units
 *   Cost: 5 × 5,500 = 27,500 IQD ÷ 50 = 550 IQD/unit
 *
 * Before fix: pack_unit="قطعة" (count) was rejected, yield fell back to
 * stored_qty=1 → 27,500 IQD/unit ❌
 */

const _W = {
  'غرام': 1, 'كغم': 1000, 'كيلو': 1000, 'كجم': 1000, 'gram': 1, 'kg': 1000,
  'مل': 1, 'لتر': 1000, 'ml': 1, 'liter': 1000, 'l': 1000,
};
const _COUNT = new Set(['قطعة', 'قطع', 'حبة', 'حبات', 'علبة', 'علب', 'كرتون', 'كراتين', 'صحن', 'piece', 'pieces', 'unit']);

function computeYield(product, rawMaterials) {
  const pw = Number(product.piece_weight || 0);
  const pwu = product.piece_weight_unit || 'غرام';
  const pwuIsWeight = !!_W[pwu];
  const pieceGrams = pw * (_W[pwu] || 1);
  let totalGrams = 0;
  for (const ing of (product.recipe || [])) {
    const q = Number(ing.quantity || 0);
    const f = _W[ing.unit];
    if (f) {
      totalGrams += q * f;
    } else if (_COUNT.has(ing.unit) || !ing.unit) {
      const mat = rawMaterials.find(r => r.id === ing.raw_material_id);
      if (mat && mat.pack_quantity && mat.pack_unit) {
        const pf = _W[mat.pack_unit] || 0;
        if (pf > 0) totalGrams += q * Number(mat.pack_quantity) * pf;
      }
    }
  }
  const calcYield = (pieceGrams > 0 && totalGrams > 0) ? totalGrams / pieceGrams : 0;
  let countYield = 0;
  if (calcYield === 0 && pw > 0) {
    let sumInPwu = 0;
    for (const ing of (product.recipe || [])) {
      const qty = Number(ing.quantity || 0);
      if (ing.unit === pwu) {
        sumInPwu += qty;
        continue;
      }
      const mat = rawMaterials.find(r => r.id === ing.raw_material_id);
      if (!mat || !mat.pack_quantity || !mat.pack_unit) continue;
      const ipq = Number(mat.pack_quantity);
      const ipu = mat.pack_unit;
      if (ipu === pwu) {
        sumInPwu += qty * ipq;
      } else if (!pwuIsWeight && !_W[ipu]) {
        sumInPwu += qty * ipq;
      }
    }
    if (sumInPwu > 0) countYield = sumInPwu / pw;
  }
  return calcYield || countYield;
}

describe('Frontend count→count pack_info yield', () => {
  test('Beef Bacon: 5 قطع × 10 شرائح/قطعة ÷ 1 شريحة → 50 وحدة', () => {
    const product = {
      piece_weight: 1,
      piece_weight_unit: 'شريحة',
      recipe: [{ raw_material_id: 'beef', quantity: 5, unit: 'قطعة' }],
    };
    const rawMaterials = [
      { id: 'beef', pack_quantity: 10, pack_unit: 'قطعة' },
    ];
    expect(computeYield(product, rawMaterials)).toBeCloseTo(50, 5);
  });

  test('Cost per unit = 27,500 ÷ 50 = 550 IQD', () => {
    const product = {
      piece_weight: 1,
      piece_weight_unit: 'شريحة',
      raw_material_cost_after_waste: 27500,
      recipe: [{ raw_material_id: 'beef', quantity: 5, unit: 'قطعة' }],
    };
    const rawMaterials = [{ id: 'beef', pack_quantity: 10, pack_unit: 'قطعة' }];
    const y = computeYield(product, rawMaterials);
    expect(27500 / y).toBeCloseTo(550, 1);
  });

  test('Safety: count pack_unit + weight piece_weight_unit → NO count_yield', () => {
    const product = {
      piece_weight: 30,
      piece_weight_unit: 'غرام',  // weight
      recipe: [{ raw_material_id: 'x', quantity: 5, unit: 'قطعة' }],
    };
    const rawMaterials = [
      { id: 'x', pack_quantity: 10, pack_unit: 'قطعة' },  // count pack
    ];
    // calcYield = 0 (no weight), countYield not activated (pwu is weight) → 0
    expect(computeYield(product, rawMaterials)).toBe(0);
  });

  test('Weight-based path still works (Beef Bacon original weight scenario)', () => {
    const product = {
      piece_weight: 30,
      piece_weight_unit: 'غرام',
      recipe: [{ raw_material_id: 'beef', quantity: 5, unit: 'قطعة' }],
    };
    const rawMaterials = [
      { id: 'beef', pack_quantity: 550, pack_unit: 'غرام' },
    ];
    // 5 × 550 = 2750g ÷ 30 = 91.67
    expect(computeYield(product, rawMaterials)).toBeCloseTo(91.667, 2);
  });

  test('Matching pack_unit and pwu (both "شريحة") still works', () => {
    const product = {
      piece_weight: 1,
      piece_weight_unit: 'شريحة',
      recipe: [{ raw_material_id: 'b', quantity: 3, unit: 'قطعة' }],
    };
    const rawMaterials = [{ id: 'b', pack_quantity: 46, pack_unit: 'شريحة' }];
    expect(computeYield(product, rawMaterials)).toBe(138);  // 3 × 46
  });
});
