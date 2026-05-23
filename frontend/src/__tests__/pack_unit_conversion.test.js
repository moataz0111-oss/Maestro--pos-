/**
 * Unit Test: تحويل وحدات علبة/كرتون عبر pack info
 * يتحقق من أن إضافة "علبة"/"كرتون"/"صحن" إلى _UNIT_GROUPS.count
 * يسمح بالتحويل من وزن (كغم/غرام) إلى علبة عند وجود pack_info.
 */

const _UNIT_GROUPS = {
  weight: { 'غرام': 0.001, 'كغم': 1, 'كيلو': 1, 'كجم': 1, 'gram': 0.001, 'kg': 1 },
  volume: { 'مل': 0.001, 'لتر': 1, 'ml': 0.001, 'liter': 1, 'l': 1 },
  count: { 'قطعة': 1, 'حبة': 1, 'piece': 1, 'علبة': 1, 'كرتون': 1, 'صحن': 1 },
};

const _findUnitGroup = (u) => {
  if (!u) return null;
  for (const [g, units] of Object.entries(_UNIT_GROUPS)) {
    if (Object.prototype.hasOwnProperty.call(units, String(u).trim())) return g;
  }
  return null;
};

const convertWithPackInfo = (qty, inputUnit, materialUnit, packInfo) => {
  if (!packInfo) return null;
  const gIn = _findUnitGroup(inputUnit);
  const gPack = _findUnitGroup(packInfo.pack_unit);
  if (!gIn || !gPack || gIn !== gPack) return null;
  const baseIn = _UNIT_GROUPS[gIn][inputUnit];
  const basePack = _UNIT_GROUPS[gPack][packInfo.pack_unit];
  const qtyInPackUnit = (Number(qty) || 0) * baseIn / basePack;
  const pieces = qtyInPackUnit / packInfo.pack_quantity;
  return { qty: Math.round(pieces * 1e6) / 1e6, converted: true };
};

const availableInputUnitsFor = (materialUnit, packUnit) => {
  const g = _findUnitGroup(materialUnit);
  if (!g) return [materialUnit].filter(Boolean);
  const own = Object.keys(_UNIT_GROUPS[g]).filter(u => !['gram','kg','ml','liter','l','piece'].includes(u));
  if (g === 'count' && packUnit) {
    const pg = _findUnitGroup(packUnit);
    if (pg && pg !== 'count') {
      const extra = Object.keys(_UNIT_GROUPS[pg]).filter(u => !['gram','kg','ml','liter','l','piece'].includes(u));
      return [...own, ...extra];
    }
  }
  return own;
};

// ===== Tests =====
function assertEqual(actual, expected) {
  expect(JSON.stringify(actual)).toBe(JSON.stringify(expected));
}

describe('Pack unit conversion (legacy file wrapped for Jest)', () => {
  test('علبة ⇒ count group', () => {
    assertEqual(_findUnitGroup('علبة'), 'count');
    assertEqual(_findUnitGroup('كرتون'), 'count');
  });

  test('availableInputUnitsFor("علبة","كغم") includes weight units', () => {
    const units = availableInputUnitsFor('علبة', 'كغم');
    assertEqual(units.includes('غرام') && units.includes('كغم'), true);
  });

  test('2 كغم ⇒ 0.5 علبة (pack=4كغم)', () => {
    assertEqual(convertWithPackInfo(2, 'كغم', 'علبة', { pack_quantity: 4, pack_unit: 'كغم' }).qty, 0.5);
  });

  test('500 غرام ⇒ 0.125 علبة (pack=4كغم)', () => {
    assertEqual(convertWithPackInfo(500, 'غرام', 'علبة', { pack_quantity: 4, pack_unit: 'كغم' }).qty, 0.125);
  });

  test('8 كغم ⇒ 2 علب', () => {
    assertEqual(convertWithPackInfo(8, 'كغم', 'علبة', { pack_quantity: 4, pack_unit: 'كغم' }).qty, 2);
  });

  test('1 لتر ⇒ 0.5 علبة (pack=2لتر)', () => {
    assertEqual(convertWithPackInfo(1, 'لتر', 'علبة', { pack_quantity: 2, pack_unit: 'لتر' }).qty, 0.5);
  });

  test('كغم vs pack=قطعة ⇒ null (different families)', () => {
    assertEqual(convertWithPackInfo(1, 'كغم', 'علبة', { pack_quantity: 12, pack_unit: 'قطعة' }), null);
  });
});
