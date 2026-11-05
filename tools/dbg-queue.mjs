const { createRequire } = await import('node:module');
const __req = createRequire(import.meta.url);
const { chromium } = __req('C:/Users/debih/AppData/Roaming/npm/node_modules/playwright');
const CHROME_PATH = 'C:/Users/debih/AppData/Local/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-win64/chrome-headless-shell.exe';
const BASE = 'http://127.0.0.1:4180';
const browser = await chromium.launch({ executablePath: CHROME_PATH, headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
page.on('pageerror', (e) => console.log('PAGEERROR ' + (e.message || e)));
await page.goto(BASE, { waitUntil: 'load', timeout: 30000 });
await page.waitForSelector('[data-feed-stream]', { timeout: 20000 });
for (let i = 1; i <= 14; i++) {
  await page.waitForTimeout(10000);
  const q = await page.locator('[data-feed-stream]').getAttribute('data-feed-queue');
  const n = await page.locator('[data-feed-stream] li').count();
  const first = n ? (await page.locator('[data-feed-stream] li').first().locator('p').first().innerText()).trim().slice(0, 40) : '-';
  const age = n ? (await page.locator('[data-feed-stream] li').first().locator('span.num').first().innerText()).trim() : '-';
  console.log(`T=${i * 10}s queue=${q} dom=${n} newestAge=${age} top=${first}`);
}
await browser.close();
