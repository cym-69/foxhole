// Screenshot proof for the ships layer (mock AIS feed).
// Run while the server and tools/mock-ais.mjs are up.
const { createRequire } = await import('node:module');
const __req = createRequire(import.meta.url);
const { chromium } = __req('C:/Users/debih/AppData/Roaming/npm/node_modules/playwright');

const URL = process.env.PAGE_URL || 'http://127.0.0.1:4180';
const CHROME_PATH = (process.env.PLAYWRIGHT_CHROME_PATH || 'C:/Users/debih/AppData/Local/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-win64/chrome-headless-shell.exe');
const browser = await chromium.launch({ executablePath: CHROME_PATH, headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.on('pageerror', (e) => console.log('PAGEERROR ' + (e.message || e)));
await page.goto(URL, { waitUntil: 'load', timeout: 20000 });
await page.waitForTimeout(2500);

// Zoom toward Hormuz through the existing preset buttons (uses the same flyTo API as the app).
const me = page.locator('button', { hasText: 'Middle East' }).first();
if (await me.count()) await me.click();
await page.waitForTimeout(2500);

// Ships panel line, switch state, and dot count
const shipLine = await page.locator('p', { hasText: 'Hormuz' }).first().innerText().catch(() => '(none)');
console.log('SHIP_LINE=' + shipLine.replace(/\n/g, ' '));
const switches = await page.locator('button[aria-pressed]').allInnerTexts();
console.log('SWITCHES=' + JSON.stringify(switches.map((s) => s.replace(/\n/g, ' ').trim())));
console.log('SHIP_DOTS=' + await page.locator('.fx-ship').count());
await page.waitForTimeout(1500);
await page.screenshot({ path: 'C2-ships.png', fullPage: false });
await browser.close();
