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
function assertEqual(actual, expected, msg) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    console.error(`❌ ${msg} — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
    process.exit(1);
  } else {
    console.log(`✅ ${msg}`);
  }
}

// Test 1: علبة موجودة الآن في count group
assertEqual(_findUnitGroup('علبة'), 'count', 'علبة ⇒ count group');
assertEqual(_findUnitGroup('كرتون'), 'count', 'كرتون ⇒ count group');

// Test 2: availableInputUnitsFor for علبة with pack=كغم should include weight units
const units = availableInputUnitsFor('علبة', 'كغم');
const hasWeight = units.includes('غرام') && units.includes('كغم');
assertEqual(hasWeight, true, 'availableInputUnitsFor("علبة","كغم") تتضمن غرام/كغم');

// Test 3: convertWithPackInfo: 2 كغم → 0.5 علبة (إذا 1 علبة = 4 كغم)
const conv1 = convertWithPackInfo(2, 'كغم', 'علبة', { pack_quantity: 4, pack_unit: 'كغم' });
assertEqual(conv1.qty, 0.5, '2 كغم ⇒ 0.5 علبة (pack=4كغم)');

// Test 4: 500 غرام → 0.125 علبة (1 علبة = 4 كغم = 4000 غرام)
const conv2 = convertWithPackInfo(500, 'غرام', 'علبة', { pack_quantity: 4, pack_unit: 'كغم' });
assertEqual(conv2.qty, 0.125, '500 غرام ⇒ 0.125 علبة (pack=4كغم)');

// Test 5: 8 كغم → 2 علب
const conv3 = convertWithPackInfo(8, 'كغم', 'علبة', { pack_quantity: 4, pack_unit: 'كغم' });
assertEqual(conv3.qty, 2, '8 كغم ⇒ 2 علب');

// Test 6: 1 لتر → 0.5 علبة (pack = 2 لتر)
const conv4 = convertWithPackInfo(1, 'لتر', 'علبة', { pack_quantity: 2, pack_unit: 'لتر' });
assertEqual(conv4.qty, 0.5, '1 لتر ⇒ 0.5 علبة (pack=2لتر)');

// Test 7: input في عائلة مختلفة عن pack → null
const conv5 = convertWithPackInfo(1, 'كغم', 'علبة', { pack_quantity: 12, pack_unit: 'قطعة' });
assertEqual(conv5, null, 'كغم vs pack=قطعة ⇒ null (عائلتان مختلفتان)');

console.log('\n🎉 All pack conversion tests passed!');
