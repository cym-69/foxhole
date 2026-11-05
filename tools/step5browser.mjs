// Step 5: console check plus the TV tab list and the layer switches, with the server running normally.
const { createRequire } = await import('node:module');
const __req = createRequire(import.meta.url);
const { chromium } = __req('C:/Users/debih/AppData/Roaming/npm/node_modules/playwright');
const CHROME_PATH = 'C:/Users/debih/AppData/Local/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-win64/chrome-headless-shell.exe';
const BASE = 'http://127.0.0.1:4180';

const browser = await chromium.launch({ executablePath: CHROME_PATH, headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const lines = [];
page.on('console', (m) => {
  const loc = m.location();
  lines.push('[console:' + m.type() + '] ' + m.text() + (loc && loc.url ? ` (${loc.url}:${loc.lineNumber}:${loc.columnNumber})` : ''));
});
page.on('pageerror', (e) => lines.push('[pageerror] ' + (e.message || String(e))));
page.on('requestfailed', (r) => lines.push('[requestfailed] ' + r.url() + ' ' + (r.failure() ? r.failure().errorText : '')));

await page.goto(BASE, { waitUntil: 'load', timeout: 30000 });
await page.waitForTimeout(3000);

// Layer switches, including the new Feed switch.
const sw = await page.$$eval('[data-layer-switch]', (els) => els.map((e) => e.textContent.trim().replace(/\s+/g, ' ') + '=' + e.getAttribute('aria-pressed')));
console.log('LAYER_SWITCHES=' + sw.join(' | '));

// TV tabs.
await page.locator('button', { hasText: 'TV' }).first().click();
await page.waitForTimeout(2000);
const tabs = await page.$$eval('iframe[src*="youtube"]', () => []);
const tabText = await page.$$eval('button', (els) => els.map((e) => e.textContent.trim()).filter((t) => /Al Jazeera|DW News|France 24|Sky News|Bloomberg|Euronews|TRT|Channel NewsAsia/.test(t)));
console.log('TV_TABS=' + tabText.join(' | '));
await page.screenshot({ path: 'C3-tv-final.png', fullPage: false });
await page.locator('button', { hasText: 'x' }).first().click();

// Feed stream present and clipboard of the latest headline title.
await page.waitForTimeout(5000);
console.log('FEED_ITEMS=' + await page.locator('[data-feed-stream] li').count());
console.log('FEED_MASK=' + await page.locator('[data-feed-stream]').evaluate((el) => getComputedStyle(el).maskImage));
await page.screenshot({ path: 'C3-feed-final.png', fullPage: false });

await page.waitForTimeout(50000);
const interesting = lines.filter((l) => !/ReadPixels/i.test(l) && !/code: 1/i.test(l) && !/h3-js/i.test(l));
console.log('CONSOLE_MESSAGES_TOTAL=' + lines.length);
console.log('CONSOLE_OTHER_THAN_READPIXELS_AND_H3=' + (interesting.length ? interesting.join('\n  ') : 'none'));
await browser.close();
