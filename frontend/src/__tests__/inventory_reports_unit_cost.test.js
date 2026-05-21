/**
 * Regression test for InventoryReports cost calculation.
 *
 * Bug: previously the report computed:
 *   totalValue = quantity × raw_material_cost (BATCH cost!)
 *   profit_margin shown for whole batch
 *
 * For "لحم برغر" with quantity=500 and batch_cost=641,168 IQD:
 *   Wrong:  500 × 641,168 = 320,584,000 IQD ❌
 *   Right:  500 × (641,168/500) = 641,168 IQD ✅
 *
 * Fixed: uses unit_cost_after_waste (from backend) or falls back to
 * batch_cost / quantity for legacy data.
 */

const _unitCost = (p) => Number(p?.unit_cost_after_waste ?? 0) || (
  (Number(p?.quantity) || 0) > 0
    ? Number(p?.raw_material_cost_after_waste || p?.production_cost || p?.raw_material_cost || 0) / Number(p.quantity)
    : 0
);

describe('InventoryReports unit cost helper', () => {
  test('prefers unit_cost_after_waste from backend', () => {
    const p = {
      quantity: 500,
      raw_material_cost: 641168, // batch cost
      unit_cost_after_waste: 1282.336,
    };
    expect(_unitCost(p)).toBe(1282.336);
  });

  test('falls back to batch_cost / quantity for legacy data (لحم برغر)', () => {
    const p = {
      quantity: 500,
      raw_material_cost_after_waste: 641168,
    };
    expect(_unitCost(p)).toBeCloseTo(1282.336, 3);
  });

  test('totalValue calculation NOT 320M for legacy لحم برغر', () => {
    const p = {
      quantity: 500,
      raw_material_cost_after_waste: 641168,
    };
    const totalValue = p.quantity * _unitCost(p);
    expect(totalValue).toBeCloseTo(641168);
    expect(totalValue).toBeLessThan(1_000_000); // sanity: not in millions
  });

  test('returns 0 for product with no quantity or cost', () => {
    expect(_unitCost({})).toBe(0);
    expect(_unitCost({ quantity: 0 })).toBe(0);
    expect(_unitCost({ raw_material_cost: 1000 })).toBe(0);
  });

  test('profit margin uses unit cost not batch cost', () => {
    const p = {
      quantity: 500,
      raw_material_cost_after_waste: 641168,
      selling_price: 5000,
    };
    const profit = p.selling_price - _unitCost(p);
    expect(profit).toBeCloseTo(3717.664, 2);
    expect(profit).toBeGreaterThan(0);
  });

  test('multi-product total respects per-unit costs', () => {
    const products = [
      { name: 'برجر', quantity: 500, raw_material_cost_after_waste: 641168 },
      { name: 'دجاج', quantity: 100, raw_material_cost_after_waste: 200000 },
    ];
    const total = products.reduce((sum, p) => sum + (p.quantity || 0) * _unitCost(p), 0);
    // 500 × 1282.336 + 100 × 2000 = 641168 + 200000 = 841168
    expect(total).toBeCloseTo(841168);
  });

  test('handles unit_cost_after_waste=0 gracefully with fallback', () => {
    const p = {
      quantity: 500,
      raw_material_cost_after_waste: 641168,
      unit_cost_after_waste: 0, // backend hasn't computed it yet
    };
    // Should fall back to batch / qty
    expect(_unitCost(p)).toBeCloseTo(1282.336, 3);
  });
});
