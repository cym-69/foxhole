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
const r = await page.request.post(BASE + '/__test/event', { data: { title: 'Debug event in browser', kind: 'conflict', lat: 24, lng: 40, size: 0.4, place: 'Test', sources: 1 } });
console.log('POST=' + r.status());
for (const s of [2, 5, 10, 20, 30]) {
  await page.waitForTimeout(s === 2 ? 2000 : 3000);
  console.log('AFTER_' + s + 's li=' + await page.locator('[data-feed-stream] li').count() + ' feedEvent=' + await page.locator('[data-feed-event]').count());
}
console.log('CONTAINER_TEXT=' + (await page.locator('[data-feed-stream]').innerText()).replace(/\s+/g, ' ').slice(0, 300));
await browser.close();
