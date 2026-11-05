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
await page.request.post(BASE + '/__test/feed', { data: { text: 'Probe headline', srcName: 'MockWatch', kind: 'news', tickers: ['CLF'], url: 'http://127.0.0.1:9200/a.xml' } });
await page.waitForTimeout(8000);
const info = await page.evaluate(() => {
  const c = document.querySelector('[data-feed-stream]');
  const r = c.getBoundingClientRect();
  const lis = [...c.querySelectorAll('li')];
  const out = { container: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), pe: getComputedStyle(c).pointerEvents, z: getComputedStyle(c).zIndex }, items: [] };
  for (const li of lis.slice(0, 4)) {
    const b = li.getBoundingClientRect();
    const cx = b.x + b.width / 2, cy = b.y + b.height / 2;
    const top = document.elementFromPoint(cx, cy);
    out.items.push({
      y: Math.round(b.y), h: Math.round(b.height), text: (li.innerText || '').replace(/\s+/g, ' ').slice(0, 40),
      topEl: top ? top.tagName + '.' + String(top.className).slice(0, 40) : 'none',
      isAnchor: !!li.querySelector('a'),
    });
  }
  return out;
});
console.log(JSON.stringify(info, null, 1));
await browser.close();
