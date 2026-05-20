/**
 * Test: availableInputUnitsFor + convertWithPackInfo
 * يدعم وحدة مخصّصة (شريحة/حصة/كأس) كـ pack_unit حتى لو لم تكن في _UNIT_GROUPS.
 */

const _UNIT_GROUPS = {
  weight: { 'غرام': 0.001, 'كغم': 1, 'كيلو': 1, 'كجم': 1, 'gram': 0.001, 'kg': 1 },
  volume: { 'مل': 0.001, 'لتر': 1, 'ml': 0.001, 'liter': 1, 'l': 1 },
  count: { 'قطعة': 1, 'حبة': 1, 'piece': 1, 'علبة': 1, 'كرتون': 1, 'صحن': 1 },
};

function _findUnitGroup(u) {
  if (!u) return null;
  const k = String(u).trim();
  for (const [g, units] of Object.entries(_UNIT_GROUPS)) {
    if (Object.prototype.hasOwnProperty.call(units, k)) return g;
  }
  return null;
}

function availableInputUnitsFor(materialUnit, packUnit) {
  const g = _findUnitGroup(materialUnit);
  if (!g) return [materialUnit].filter(Boolean);
  const own = Object.keys(_UNIT_GROUPS[g]).filter(u => !['gram','kg','ml','liter','l','piece'].includes(u));
  let extras = [];
  if (g === 'count' && packUnit) {
    const pg = _findUnitGroup(packUnit);
    if (pg && pg !== 'count') {
      extras = Object.keys(_UNIT_GROUPS[pg]).filter(u => !['gram','kg','ml','liter','l','piece'].includes(u));
    }
    if (!extras.includes(packUnit) && !own.includes(packUnit)) {
      extras.push(packUnit);
    }
  }
  return [...own, ...extras];
}

function convertWithPackInfo(qty, inputUnit, materialUnit, packInfo) {
  if (!packInfo) return null;
  if (inputUnit === packInfo.pack_unit && packInfo.pack_quantity > 0) {
    const pieces = (Number(qty) || 0) / packInfo.pack_quantity;
    return { qty: Math.round(pieces * 1e6) / 1e6, converted: true };
  }
  const gIn = _findUnitGroup(inputUnit);
  const gPack = _findUnitGroup(packInfo.pack_unit);
  if (!gIn || !gPack || gIn !== gPack) return null;
  const baseIn = _UNIT_GROUPS[gIn][inputUnit];
  const basePack = _UNIT_GROUPS[gPack][packInfo.pack_unit];
  const qtyInPackUnit = (Number(qty) || 0) * baseIn / basePack;
  const pieces = qtyInPackUnit / packInfo.pack_quantity;
  return { qty: Math.round(pieces * 1e6) / 1e6, converted: true };
}

describe('Pack-unit custom support (شريحة/حصة/كأس)', () => {
  test('cheddar slices: 1 قطعة = 46 شريحة → dropdown يحتوي شريحة', () => {
    const units = availableInputUnitsFor('قطعة', 'شريحة');
    expect(units).toContain('قطعة');
    expect(units).toContain('شريحة');
  });

  test('conversion: 92 شريحة → 2 قطعة (إذا 1 قطعة = 46 شريحة)', () => {
    const res = convertWithPackInfo(92, 'شريحة', 'قطعة', { pack_quantity: 46, pack_unit: 'شريحة' });
    expect(res).not.toBeNull();
    expect(res.qty).toBe(2);
  });

  test('standard: 1 قطعة = 250 غرام → dropdown يحتوي غرام/كغم/قطعة', () => {
    const units = availableInputUnitsFor('قطعة', 'غرام');
    expect(units).toEqual(expect.arrayContaining(['قطعة', 'غرام', 'كغم']));
  });

  test('conversion: 500 غرام → 2 قطعة (إذا 1 قطعة = 250 غرام)', () => {
    const res = convertWithPackInfo(500, 'غرام', 'قطعة', { pack_quantity: 250, pack_unit: 'غرام' });
    expect(res.qty).toBe(2);
  });

  test('no packInfo → null', () => {
    expect(convertWithPackInfo(5, 'غرام', 'قطعة', null)).toBeNull();
  });
});
