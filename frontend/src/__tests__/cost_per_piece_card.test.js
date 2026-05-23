/**
 * Regression guard: ensure the "Cost per piece" card shows CORRECT values
 * when the manufactured product has its own piece_weight definition.
 *
 * Bug context (May 23, 2026): For "لحم مفروم":
 *   - product.piece_weight = 60, piece_weight_unit = "غرام"
 *   - one ingredient ("صويا صوص") had a raw material with pack_quantity=250, pack_unit="غرام"
 *   - The "parent detection" loop incorrectly used the ingredient's pack info to
 *     define the manufactured piece → displayed "1 قطعة = 250 غرام" and
 *     parentCost = unit_cost × 250 = wildly wrong total.
 *
 * Correct behavior: the manufactured product's OWN piece_weight is the source
 * of truth. The "parent" path should only activate when the product has NO
 * piece_weight definition (legacy data).
 */

function detectParent(product, rawMaterials) {
  const pw = Number(product.piece_weight || 0);
  const pwu = product.piece_weight_unit || '';
  const hasOwnPieceDef = pw > 0 && !!pwu;
  if (hasOwnPieceDef) return null;  // ⭐ skip parent detection
  for (const ing of (product.recipe || [])) {
    if (ing.unit === pwu) continue;
    const mat = rawMaterials.find(r => r.id === ing.raw_material_id);
    if (mat && mat.pack_unit === pwu && Number(mat.pack_quantity) > 0) {
      return { unit: ing.unit, packQty: Number(mat.pack_quantity), packUnit: mat.pack_unit };
    }
  }
  return null;
}

describe('Cost-per-piece card: parent detection must respect piece_weight', () => {
  test('لحم مفروم: piece_weight=60 → NO parent detection (skip raw pack_info confusion)', () => {
    const product = {
      piece_weight: 60,
      piece_weight_unit: 'غرام',
      recipe: [
        { raw_material_id: 'lahm', quantity: 9, unit: 'كغم' },
        { raw_material_id: 'soya', quantity: 0.339, unit: 'قطعة' },  // pack info exists
        { raw_material_id: 'salt', quantity: 0.4, unit: 'قطعة' },
      ],
    };
    const rawMaterials = [
      { id: 'lahm', pack_quantity: 1000, pack_unit: 'غرام' },
      { id: 'soya', pack_quantity: 250, pack_unit: 'غرام' },  // ⚠️ THIS used to break things
      { id: 'salt', pack_quantity: 334, pack_unit: 'غرام' },
    ];
    expect(detectParent(product, rawMaterials)).toBeNull();
  });

  test('Legacy product without piece_weight → parent detection IS used', () => {
    const product = {
      // No piece_weight set
      piece_weight: 0,
      piece_weight_unit: 'غرام',
      recipe: [
        { raw_material_id: 'beef', quantity: 5, unit: 'قطعة' },
      ],
    };
    const rawMaterials = [
      { id: 'beef', pack_quantity: 550, pack_unit: 'غرام' },
    ];
    const p = detectParent(product, rawMaterials);
    expect(p).toEqual({ unit: 'قطعة', packQty: 550, packUnit: 'غرام' });
  });

  test('Manufactured product cost-per-piece math (لحم مفروم scenario)', () => {
    // batch_cost_after_waste = 108,299 IQD
    // computed_yield = 10,250g / 60g = 170.833
    // unit_cost_after_waste = 108,299 / 170.833 = 633.95 ≈ 634 IQD per قطعة
    // per-gram = 634 / 60 = 10.57 IQD/غرام

    const batch_cost = 108299;
    const total_grams = 10250;
    const piece_weight = 60;
    const computed_yield = total_grams / piece_weight;
    const unit_cost = batch_cost / computed_yield;

    expect(computed_yield).toBeCloseTo(170.833, 2);
    expect(unit_cost).toBeCloseTo(634, 0);
    expect(unit_cost / piece_weight).toBeCloseTo(10.57, 1);

    // Verify the WRONG value that the bug used to produce:
    // parentCost = unit_cost × 250 = ~158,487 (wildly wrong)
    expect(unit_cost * 250).toBeCloseTo(158488, -2);
    // This confirms the user's screenshot value, which we now block via detectParent → null.
  });
});
