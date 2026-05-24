/**
 * Regression guard: ensure MfgLinksEditor is invoked as a FUNCTION CALL
 * (e.g. {renderMfgLinksEditor({...})}) rather than as a JSX ELEMENT
 * (e.g. <MfgLinksEditor {...} />).
 *
 * Bug context (May 24, 2026): When defined as an inner function component
 * of `Settings()`, React treats every render of the parent as a "new"
 * component type for MfgLinksEditor → unmounts the entire subtree and
 * remounts it → the active <Input> loses focus → user has to click and
 * retype after every keystroke ("frozen" feel).
 *
 * The fix uses a render function instead, which inlines the JSX directly
 * into the parent's tree so React keeps the <Input> identity stable.
 */
const fs = require('fs');
const path = require('path');

const SETTINGS_PATH = path.resolve(__dirname, '..', 'pages', 'Settings.js');

describe('MfgLinksEditor must be invoked as function (no focus loss on typing)', () => {
  let source;
  beforeAll(() => {
    source = fs.readFileSync(SETTINGS_PATH, 'utf-8');
  });

  test('No <MfgLinksEditor /> JSX element usage anywhere', () => {
    // Match <MfgLinksEditor ... /> or <MfgLinksEditor>...</MfgLinksEditor>
    const jsxUsages = source.match(/<MfgLinksEditor[\s/>]/g) || [];
    expect(jsxUsages).toHaveLength(0);
  });

  test('renderMfgLinksEditor function is defined', () => {
    expect(source).toMatch(/const\s+renderMfgLinksEditor\s*=\s*\(/);
  });

  test('renderMfgLinksEditor is invoked at least twice (add + edit dialogs)', () => {
    const calls = source.match(/renderMfgLinksEditor\(\s*\{/g) || [];
    expect(calls.length).toBeGreaterThanOrEqual(2);
  });
});
