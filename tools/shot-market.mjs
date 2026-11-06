// Screenshot the MARKETS chart for verification.
const { createRequire } = await import('node:module');
const __req = createRequire(import.meta.url);
const { chromium } = __req('C:/Users/debih/AppData/Roaming/npm/node_modules/playwright');
const CHROME_PATH = 'C:/Users/debih/AppData/Local/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-win64/chrome-headless-shell.exe';
const BASE = 'http://127.0.0.1:4180';
const browser = await chromium.launch({ executablePath: CHROME_PATH, headless: true });
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
page.on('pageerror', (e) => console.log('[pageerror]', e.message || String(e)));
await page.goto(BASE, { waitUntil: 'load', timeout: 30000 });
await page.waitForTimeout(5000);
await page.screenshot({ path: 'evidence/phase3-markets.png', fullPage: false });
console.log('SHOT evidence/phase3-markets.png');
// Phase 7 slice 3: open the TV panel and screenshot the HLS channel tabs.
await page.getByRole('button', { name: /tv/i }).first().click().catch(() => { /* TV toggle may not exist on all builds */ });
await page.waitForTimeout(1500);
await page.screenshot({ path: 'evidence/phase7-tv.png', fullPage: false });
console.log('SHOT evidence/phase7-tv.png');
await browser.close();
