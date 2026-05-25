/**
 * Regression: Admin Correction dialog (تصحيح إداري) must:
 *  1. Pre-fill the EXISTING saved pack definition from material.pack_quantity
 *     and material.pack_unit (NOT piece_weight which is for manufactured products).
 *  2. Show the section for ALL units (not only when unit==قطعة) so the user
 *     can always see/edit the saved definition.
 *  3. Send pack_quantity & pack_unit in the API call.
 *
 * User feedback (May 25, 2026): "يجب يظهر التعريف القديم وتفصيلة وهو يعدل
 * على الرقم او الوحدة" — old definition must show, even when unit isn't "قطعة".
 */
const fs = require('fs');
const path = require('path');

const WAREHOUSE_PATH = path.resolve(__dirname, '..', 'pages', 'WarehouseManufacturing.js');

describe('Admin Correction — pack definition fields', () => {
  let src;
  beforeAll(() => {
    src = fs.readFileSync(WAREHOUSE_PATH, 'utf-8');
  });

  test('Dialog open handler pre-fills pack_quantity and pack_unit from material', () => {
    const openIdx = src.indexOf('setAdminCorrection({');
    expect(openIdx).toBeGreaterThan(0);
    const block = src.slice(openIdx, openIdx + 700);
    expect(block).toMatch(/pack_quantity:\s*material\.pack_quantity/);
    expect(block).toMatch(/pack_unit:\s*material\.pack_unit/);
  });

  test('Piece definition section is rendered UNCONDITIONALLY (no unit gate)', () => {
    // The section must NOT be hidden behind a conditional on unit==="قطعة"
    expect(src).toMatch(/data-testid=["']piece-definition-section["']/);
    // The previous bug was {adminCorrection.unit === 'قطعة' && (...)}
    // We must not have that wrapping the section anymore
    const sectionIdx = src.indexOf('data-testid="piece-definition-section"');
    const around = src.slice(Math.max(0, sectionIdx - 400), sectionIdx);
    expect(around).not.toMatch(/adminCorrection\.unit\s*===\s*['"]قطعة['"]\s*&&\s*\(\s*$/);
  });

  test('Inputs are bound to pack_quantity / pack_unit (not piece_weight)', () => {
    const sectionMatch = src.match(/data-testid=["']piece-definition-section["'][\s\S]{0,2500}<\/p>\s*<\/div>/);
    expect(sectionMatch).not.toBeNull();
    const section = sectionMatch[0];
    expect(section).toMatch(/adminCorrection\.pack_quantity/);
    expect(section).toMatch(/adminCorrection\.pack_unit/);
    expect(section).toMatch(/data-testid=["']correction-piece-weight["']/);
    expect(section).toMatch(/data-testid=["']correction-piece-weight-unit["']/);
  });

  test('Live preview uses the unit of the material itself ("1 كغم = X غرام")', () => {
    expect(src).toMatch(/1\s*\$\{adminCorrection\.unit\s*\|\|\s*t\(['"]قطعة['"]\)\}\s*=\s*\$\{adminCorrection\.pack_quantity\}/);
  });

  test('API call sends pack_quantity & pack_unit (always, not conditional)', () => {
    const apiCallMatch = src.match(
      /axios\.post\(`\$\{API\}\/raw-materials-new\/\$\{adminCorrection\.material_id\}\/admin-correct`,\s*\{[\s\S]*?\},\s*\{\s*headers\s*\}\s*\)/
    );
    expect(apiCallMatch).not.toBeNull();
    const body = apiCallMatch[0];
    expect(body).toMatch(/pack_quantity:\s*parseFloat\(adminCorrection\.pack_quantity\)/);
    expect(body).toMatch(/pack_unit:\s*adminCorrection\.pack_unit/);
  });

  test('Sub-unit dropdown includes weight, volume, AND count options', () => {
    const sectionMatch = src.match(/data-testid=["']piece-definition-section["'][\s\S]{0,2500}<\/p>\s*<\/div>/);
    const section = sectionMatch[0];
    expect(section).toMatch(/['"]غرام['"]/);
    expect(section).toMatch(/['"]كغم['"]/);
    expect(section).toMatch(/['"]شريحة['"]/);
    expect(section).toMatch(/['"]حبة['"]/);
  });
});
