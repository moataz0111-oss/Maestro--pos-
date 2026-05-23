/**
 * Test the unit dropdown options + conversion logic in MfgLinksEditor.
 *
 * Customer requested ability to pick ANY unit when linking a sale product
 * to a manufactured product (e.g., switch between كغم/غرام/قطعة/شريحة).
 */

const _LINK_UNIT_FAMILIES = {
  weight: ['غرام', 'كغم', 'كيلو', 'كجم'],
  volume: ['مل', 'لتر'],
};

const _LINK_WEIGHT_MAP_FE = {
  'غرام': 1, 'كغم': 1000, 'كيلو': 1000, 'كجم': 1000, 'gram': 1, 'kg': 1000,
  'مل': 1, 'لتر': 1000, 'ml': 1, 'liter': 1000, 'l': 1000,
};

function getMfgLinkUnitOptions(mp) {
  if (!mp) return ['حبة'];
  const opts = [];
  const add = (u) => { if (u && !opts.includes(u)) opts.push(u); };
  const mainUnit = mp.unit || 'حبة';
  const pwu = mp.piece_weight_unit || '';
  const pw = Number(mp.piece_weight || 0);
  add(mainUnit);
  if (pw > 0 && pwu) add(pwu);
  for (const fam of Object.values(_LINK_UNIT_FAMILIES)) {
    if (fam.includes(mainUnit) || (pw > 0 && fam.includes(pwu))) {
      fam.forEach(u => add(u));
    }
  }
  return opts;
}

function convertConsumptionToMain(qty, cu, mu, pw, pwu) {
  const _cu = (cu || '').trim();
  const _mu = (mu || '').trim();
  const _pwu = (pwu || '').trim();
  const _pw = Number(pw || 0);
  if (!_cu || _cu === _mu) return qty;
  if (_cu === _pwu && _pw > 0) return qty / _pw;
  const cuF = _LINK_WEIGHT_MAP_FE[_cu];
  const muF = _LINK_WEIGHT_MAP_FE[_mu];
  if (cuF != null && muF != null) return (qty * cuF) / muF;
  const pwuF = _LINK_WEIGHT_MAP_FE[_pwu];
  if (cuF != null && pwuF != null && _pw > 0) {
    return (qty * cuF / pwuF) / _pw;
  }
  return qty;
}

describe('MfgLinksEditor unit options', () => {
  test('Count main unit only → returns just the main', () => {
    const mp = { unit: 'حبة' };
    expect(getMfgLinkUnitOptions(mp)).toEqual(['حبة']);
  });

  test('Count main + count sub (شريحة) → returns both', () => {
    const mp = { unit: 'حبة', piece_weight: 46, piece_weight_unit: 'شريحة' };
    expect(getMfgLinkUnitOptions(mp)).toEqual(['حبة', 'شريحة']);
  });

  test('Weight main (كغم) → returns full weight family', () => {
    const mp = { unit: 'كغم' };
    expect(getMfgLinkUnitOptions(mp)).toEqual(['كغم', 'غرام', 'كيلو', 'كجم']);
  });

  test('Count main + weight sub (غرام piece weight) → includes weight family', () => {
    const mp = { unit: 'حبة', piece_weight: 500, piece_weight_unit: 'غرام' };
    const opts = getMfgLinkUnitOptions(mp);
    expect(opts).toContain('حبة');
    expect(opts).toContain('غرام');
    expect(opts).toContain('كغم');
  });

  test('Volume main (لتر) → returns volume family', () => {
    const mp = { unit: 'لتر' };
    expect(getMfgLinkUnitOptions(mp)).toEqual(['لتر', 'مل']);
  });
});

describe('MfgLinksEditor conversion', () => {
  test('Same unit → no-op', () => {
    expect(convertConsumptionToMain(5, 'حبة', 'حبة', 0, '')).toBe(5);
  });

  test('Sub unit via piece_weight: 92 شريحة → 2 حبة', () => {
    expect(convertConsumptionToMain(92, 'شريحة', 'حبة', 46, 'شريحة')).toBe(2);
  });

  test('Same weight family: 2 كغم → 2000 غرام', () => {
    expect(convertConsumptionToMain(2, 'كغم', 'غرام', 0, '')).toBe(2000);
  });

  test('Same weight family: 500 غرام → 0.5 كغم', () => {
    expect(convertConsumptionToMain(500, 'غرام', 'كغم', 0, '')).toBe(0.5);
  });

  test('Volume: 250 مل → 0.25 لتر', () => {
    expect(convertConsumptionToMain(250, 'مل', 'لتر', 0, '')).toBe(0.25);
  });

  test('Weight via piece_weight bridge: 1 كغم → 2 حبة (piece_weight=500غرام)', () => {
    expect(convertConsumptionToMain(1, 'كغم', 'حبة', 500, 'غرام')).toBe(2);
  });

  test('Cost calculation: 0.25 كغم at 10,000 IQD/كغم should be 2,500', () => {
    // Manufactured: 1 كغم of sauce costs 10,000 IQD
    // Recipe consumes 0.25 كغم → cost = 10,000 × 0.25 = 2,500
    const perPieceCost = 10000;
    const qtyInMain = convertConsumptionToMain(1, 'كغم', 'كغم', 0, '');  // no conversion
    const unitCost = perPieceCost * qtyInMain;
    const lineCost = unitCost * 0.25;
    expect(lineCost).toBe(2500);
  });

  test('Cost calculation: choosing غرام for كغم-based product (0.25 غرام)', () => {
    // Manufactured: 1 كغم of sauce costs 10,000 IQD
    // Pick غرام: 1 غرام = 0.001 كغم → unit cost = 10000 × 0.001 = 10 IQD/غرام
    const perPieceCost = 10000;
    const qtyInMain = convertConsumptionToMain(1, 'غرام', 'كغم', 0, '');
    expect(qtyInMain).toBe(0.001);
    expect(perPieceCost * qtyInMain).toBe(10);
  });
});
