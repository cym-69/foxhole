const { createRequire } = await import('node:module');
const __req = createRequire(import.meta.url);
const { chromium } = __req('C:/Users/debih/AppData/Roaming/npm/node_modules/playwright');

const CHROME_PATH = (process.env.PLAYWRIGHT_CHROME_PATH || 'C:/Users/debih/AppData/Local/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-win64/chrome-headless-shell.exe');
const browser = await chromium.launch({ executablePath: CHROME_PATH, headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
await page.goto('http://127.0.0.1:4180', { waitUntil: 'load', timeout: 15000 });
await page.waitForTimeout(3000);

const postPromise = page.evaluate(async () => {
  const r = await fetch('/__test/event', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title: 'Test strike near Strait of Hormuz', kind: 'conflict', lat: 26, lng: 56, size: 0.8 }) });
  return r.text();
});

await page.waitForTimeout(150);
await page.screenshot({ path: 'C2-pulse.png', fullPage: false });
const src = await postPromise;
await page.waitForTimeout(2000);

const firstBtn = page.locator('[data-event]').first();
const firstRowText = (await firstBtn.count()) ? (await firstBtn.innerText()).replace(/\s+/g, ' ').trim() : '';
await firstBtn.click();
await page.waitForTimeout(1200);
const rightPanel = await page.locator('aside').last().innerText();
const flat = rightPanel.replace(/\s+/g, ' ').trim();
const tickerList = [...new Set(flat.split(/\s+/).filter((x) => ['USO', 'STNG', 'ITA', 'GLD', 'JETS'].includes(x)))];

console.log('POST_RESULT=' + src);
console.log('FIRST_ROW=' + firstRowText);
console.log('RIGHT_PANEL_TICKERS=' + tickerList.join(','));
await browser.close();
