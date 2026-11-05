// Step 3c: open the TV panel, take a screenshot of each channel after 8 s, report what is on screen.
const { createRequire } = await import('node:module');
const __req = createRequire(import.meta.url);
const { chromium } = __req('C:/Users/debih/AppData/Roaming/npm/node_modules/playwright');

const URL = process.env.PAGE_URL || 'http://127.0.0.1:4180';
const CHROME_PATH = (process.env.PLAYWRIGHT_CHROME_PATH || 'C:/Users/debih/AppData/Local/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-win64/chrome-headless-shell.exe');
const CHANNELS = [
  { id: 'aljazeera', file: 'C2-tv-aljazeera.png' },
  { id: 'dw', file: 'C2-tv-dw.png' },
  { id: 'france24', file: 'C2-tv-france24.png' },
  { id: 'sky', file: 'C2-tv-sky.png' },
];

const browser = await chromium.launch({ executablePath: CHROME_PATH, headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
page.on('pageerror', (e) => console.log('PAGEERROR ' + (e.message || e)));
await page.goto(URL, { waitUntil: 'load', timeout: 20000 });
await page.waitForTimeout(2500);

console.log('IFRAMES_BEFORE_OPEN=' + await page.locator('iframe').count());
await page.locator('button', { hasText: 'TV' }).first().click();
await page.waitForTimeout(1500);
console.log('IFRAMES_AFTER_OPEN=' + await page.locator('iframe[src*="youtube"]').count());
console.log('IFRAME_SRC=' + await page.locator('iframe[src*="youtube"]').getAttribute('src'));
console.log('IFRAME_ALLOW=' + await page.locator('iframe[src*="youtube"]').getAttribute('allow'));
const box = await page.locator('iframe[src*="youtube"]').boundingBox();
console.log('IFRAME_BOX=' + JSON.stringify(box));
console.log('PANEL_16x9=' + (Math.abs(box.width / box.height - 16 / 9) < 0.05));

for (const c of CHANNELS) {
  await page.locator('button', { hasText: /Al Jazeera|DW News|France 24|Sky News/ }).filter({ hasText: c.id === 'dw' ? 'DW News' : (c.id === 'sky' ? 'Sky News' : (c.id === 'france24' ? 'France 24' : 'Al Jazeera')) }).first().click();
  await page.waitForTimeout(8000);
  const _iframe = page.locator('iframe[src*="youtube"]');
  let state = 'no iframe';
  try {
    state = 'player present';
    const yt = page.frame({ url: /youtube/ });
    if (yt) {
      const txt = (await yt.evaluate(() => document.body ? document.body.innerText.slice(0, 220) : '')).replace(/\s+/g, ' ').trim();
      const lower = txt.toLowerCase();
      if (/video unavailable|unavailable|error|not available|this video is/.test(lower)) state = 'on screen: ' + txt.slice(0, 140);
      else if (txt.length > 0) state = 'text on screen: ' + txt.slice(0, 140);
      else state = 'player present (no text scraped)';
    }
  } catch (e) { state = 'player present (frame text blocked: ' + String(e).split('\n')[0].slice(0, 80) + ')'; }
  await page.screenshot({ path: c.file, fullPage: false });
  console.log(`CHANNEL_${c.id}=${state}`);
}

console.log('SAVED_CHANNEL=' + await page.evaluate(() => localStorage.getItem('foxhole.tvChannel')));
await page.locator('button', { hasText: 'x' }).first().click();
await page.waitForTimeout(800);
console.log('IFRAMES_AFTER_CLOSE=' + await page.locator('iframe[src*="youtube"]').count());
await browser.close();
