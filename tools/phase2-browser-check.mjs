// Browser checks for the satellites layer (2b/2c) and the map profiles (4c).
const { createRequire } = await import('node:module');
const __req = createRequire(import.meta.url);
const { chromium } = __req('C:/Users/debih/AppData/Roaming/npm/node_modules/playwright');

const URL = process.env.PAGE_URL || 'http://127.0.0.1:4180';
const CHROME_PATH = (process.env.PLAYWRIGHT_CHROME_PATH || 'C:/Users/debih/AppData/Local/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-win64/chrome-headless-shell.exe');
const browser = await chromium.launch({ executablePath: CHROME_PATH, headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.on('pageerror', (e) => console.log('PAGEERROR ' + (e.message || e)));
await page.goto(URL, { waitUntil: 'load', timeout: 20000 });
await page.waitForTimeout(3000);

const switchState = async () => Object.fromEntries(await Promise.all(['quakes', 'storms', 'military', 'ships', 'sats'].map(async (k) => [
  k, (await page.locator(`[data-layer-switch="${k}"]`).getAttribute('aria-pressed')) === 'true',
])));
const profileLit = async () => {
  const out = {};
  for (const id of ['all', 'conflict', 'energy', 'disasters', 'markets']) {
    out[id] = (await page.locator(`[data-profile="${id}"]`).getAttribute('aria-pressed')) === 'true';
  }
  return out;
};
const noLinkChecked = async () => await page.locator('input[type="checkbox"]').isChecked();

// ---- 2b/2c: satellites layer
console.log('SATS_SWITCH_DEFAULT=' + (await page.locator('[data-layer-switch="sats"]').getAttribute('aria-pressed')));
await page.locator('[data-layer-switch="sats"]').click();
await page.waitForTimeout(3500);
const satCount = await page.locator('.fx-sat').count();
const satSizes = await page.locator('.fx-sat').evaluateAll((ns) => ns.slice(0, 6).map((n) => n.style.width + 'x' + n.style.height));
const satTitles = await page.locator('.fx-sat').evaluateAll((ns) => ns.slice(0, 3).map((n) => n.title));
console.log('SAT_DOTS=' + satCount);
console.log('SAT_SIZES=' + JSON.stringify(satSizes));
console.log('SAT_TITLES=' + JSON.stringify(satTitles));
console.log('SAT_BIG_DOT_COUNT=' + await page.locator('.fx-sat').evaluateAll((ns) => ns.filter((n) => n.style.width === '7px').length));
await page.screenshot({ path: 'C2-sats.png', fullPage: false });
await page.locator('[data-layer-switch="sats"]').click(); // back to off
await page.waitForTimeout(600);
console.log('SAT_DOTS_AFTER_OFF=' + await page.locator('.fx-sat').count());

// ---- 4c: profiles
await page.locator('[data-profile="energy"]').click();
await page.waitForTimeout(400);
console.log('ENERGY_SWITCHES=' + JSON.stringify(await switchState()));
console.log('ENERGY_NOLINK=' + await noLinkChecked());
console.log('ENERGY_PROFILE_LIT=' + JSON.stringify(await profileLit()));
await page.reload({ waitUntil: 'load' });
await page.waitForTimeout(3500);
console.log('AFTER_RELOAD_SWITCHES=' + JSON.stringify(await switchState()));
console.log('AFTER_RELOAD_NOLINK=' + await noLinkChecked());
console.log('AFTER_RELOAD_PROFILE_LIT=' + JSON.stringify(await profileLit()));

await page.locator('[data-profile="all"]').click();
await page.waitForTimeout(400);
console.log('ALL_SWITCHES=' + JSON.stringify(await switchState()));
console.log('ALL_PROFILE_LIT=' + JSON.stringify(await profileLit()));

await page.locator('[data-layer-switch="quakes"]').click(); // one manual toggle
await page.waitForTimeout(400);
console.log('AFTER_MANUAL_TOGGLE_PROFILE_LIT=' + JSON.stringify(await profileLit()));
console.log('AFTER_MANUAL_TOGGLE_SWITCHES=' + JSON.stringify(await switchState()));

await browser.close();
