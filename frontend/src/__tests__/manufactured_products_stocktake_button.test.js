/**
 * Regression: Manufacturing tab must show TWO monthly stocktake buttons:
 *   1. "مخزن المصنع (مواد خام)" — department="manufacturing"
 *   2. "المنتجات المصنعة" — department="manufactured_products"
 *
 * User request (May 25, 2026): clearly separate the raw-materials inventory
 * inside the factory from the finished manufactured products inventory.
 */
const fs = require('fs');
const path = require('path');

const WAREHOUSE_PATH = path.resolve(__dirname, '..', 'pages', 'WarehouseManufacturing.js');
const STOCKTAKE_PATH = path.resolve(__dirname, '..', 'components', 'MonthlyStocktake.js');
const HISTORY_PATH = path.resolve(__dirname, '..', 'components', 'MonthlyStocktakeHistory.js');

describe('Manufactured Products stocktake button', () => {
  let warehouseSrc;
  let stocktakeSrc;
  let historySrc;
  beforeAll(() => {
    warehouseSrc = fs.readFileSync(WAREHOUSE_PATH, 'utf-8');
    stocktakeSrc = fs.readFileSync(STOCKTAKE_PATH, 'utf-8');
    historySrc = fs.readFileSync(HISTORY_PATH, 'utf-8');
  });

  test('Manufacturing tab renders both stocktake buttons', () => {
    // The two buttons must appear next to each other inside the manufacturing TabsContent
    const mfgTabIdx = warehouseSrc.indexOf('<TabsContent value="manufacturing"');
    expect(mfgTabIdx).toBeGreaterThan(0);
    const slice = warehouseSrc.slice(mfgTabIdx, mfgTabIdx + 1500);
    expect(slice).toMatch(/<MonthlyStocktakeButton\s+department="manufacturing"\s*\/>/);
    expect(slice).toMatch(/<MonthlyStocktakeButton\s+department="manufactured_products"\s*\/>/);
  });

  test('Stocktake DEPT_META includes manufactured_products entry', () => {
    expect(stocktakeSrc).toMatch(/manufactured_products:\s*\{\s*label:\s*['"]المنتجات المصنعة['"]/);
  });

  test('Stocktake DEPT_META manufacturing label updated to "مخزن المصنع"', () => {
    expect(stocktakeSrc).toMatch(/manufacturing:\s*\{\s*label:\s*['"]مخزن المصنع \(مواد خام\)['"]/);
  });

  test('History DEPT_META includes manufactured_products entry', () => {
    expect(historySrc).toMatch(/manufactured_products:\s*\{\s*label:\s*['"]المنتجات المصنعة['"]/);
  });
});
