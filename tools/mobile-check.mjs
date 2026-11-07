// Mobile QA @390px: screenshots + console errors + scroll checks
const { createRequire } = await import('node:module');
const __req = createRequire(import.meta.url);
const { chromium } = __req('C:/Users/debih/AppData/Roaming/npm/node_modules/playwright');

const URL = process.env.PAGE_URL || 'http://127.0.0.1:4180';
const CHROME = process.env.PLAYWRIGHT_CHROME_PATH || 'C:/Users/debih/AppData/Local/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-win64/chrome-headless-shell.exe';
const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message || String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
await page.goto(URL, { waitUntil: 'load', timeout: 20000 });
await page.waitForTimeout(4000);
const metrics = await page.evaluate(() => {
  const de = document.documentElement;
  return {
    docW: de.scrollWidth, winW: window.innerWidth,
    bodyH: document.body.scrollHeight,
    hOverflow: de.scrollWidth > window.innerWidth,
    wide: window.innerWidth >= 1100,
    text: document.body.innerText.slice(0, 400),
  };
});
console.log('METRICS ' + JSON.stringify(metrics));
await page.screenshot({ path: 'evidence/mobile-390.png', fullPage: false });
await page.screenshot({ path: 'evidence/mobile-390-full.png', fullPage: true });
console.log('ERRORS ' + JSON.stringify(errors.slice(0, 10)));
console.log('ERROR_COUNT ' + errors.length);
await browser.close();
