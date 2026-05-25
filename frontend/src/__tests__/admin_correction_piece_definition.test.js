/**
 * Regression: Admin Correction dialog (تصحيح إداري) must show piece-weight
 * inputs when the material unit is "قطعة", so the user can correct the
 * piece definition (1 piece = X grams) right from this modal.
 *
 * User request (May 25, 2026): showed the dialog and pointed out the
 * piece definition fields are missing.
 */
const fs = require('fs');
const path = require('path');

const WAREHOUSE_PATH = path.resolve(__dirname, '..', 'pages', 'WarehouseManufacturing.js');

describe('Admin Correction — piece definition fields', () => {
  let src;
  beforeAll(() => {
    src = fs.readFileSync(WAREHOUSE_PATH, 'utf-8');
  });

  test('Dialog open handler pre-fills piece_weight and piece_weight_unit', () => {
    // Find the setAdminCorrection({ ... }) call inside the open button
    const openIdx = src.indexOf('setAdminCorrection({');
    expect(openIdx).toBeGreaterThan(0);
    const block = src.slice(openIdx, openIdx + 700);
    expect(block).toMatch(/piece_weight:\s*material\.piece_weight/);
    expect(block).toMatch(/piece_weight_unit:\s*material\.piece_weight_unit/);
  });

  test('Piece definition section is conditionally rendered for unit "قطعة"', () => {
    // Conditional render: {adminCorrection.unit === 'قطعة' && (...)}
    expect(src).toMatch(/adminCorrection\.unit\s*===\s*['"]قطعة['"]\s*&&/);
    expect(src).toMatch(/data-testid=["']piece-definition-section["']/);
  });

  test('Two new inputs present: weight value + weight unit', () => {
    expect(src).toMatch(/data-testid=["']correction-piece-weight["']/);
    expect(src).toMatch(/data-testid=["']correction-piece-weight-unit["']/);
  });

  test('Piece definition has live preview ("1 قطعة = X غرام")', () => {
    expect(src).toMatch(/data-testid=["']piece-definition-preview["']/);
    expect(src).toMatch(/1\s*\$\{t\(['"]قطعة['"]\)\}\s*=\s*\$\{adminCorrection\.piece_weight\}/);
  });

  test('API call sends piece_weight & unit only when unit is "قطعة"', () => {
    // axios.post(...) body conditionally includes piece_weight: unit === 'قطعة' ? ... : undefined
    const apiCallMatch = src.match(
      /axios\.post\(`\$\{API\}\/raw-materials-new\/\$\{adminCorrection\.material_id\}\/admin-correct`,\s*\{[\s\S]*?\},\s*\{\s*headers\s*\}\s*\)/
    );
    expect(apiCallMatch).not.toBeNull();
    const body = apiCallMatch[0];
    expect(body).toMatch(/piece_weight:\s*adminCorrection\.unit\s*===\s*['"]قطعة['"]/);
    expect(body).toMatch(/piece_weight_unit:\s*adminCorrection\.unit\s*===\s*['"]قطعة['"]/);
  });

  test('Weight unit dropdown includes غرام and كغم', () => {
    // Search inside the piece definition select options
    const sectionMatch = src.match(/data-testid=["']piece-definition-section["'][\s\S]{0,2000}/);
    expect(sectionMatch).not.toBeNull();
    const section = sectionMatch[0];
    expect(section).toMatch(/['"]غرام['"]/);
    expect(section).toMatch(/['"]كغم['"]/);
  });
});
