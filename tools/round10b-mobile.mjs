import { chromium } from 'playwright';
import { statSync } from 'node:fs';
const mode = process.argv[2] || 'after';
const exe = process.env.PW_EXE || 'C:\\Users\\debih\\AppData\\Local\\ms-playwright\\chromium_headless_shell-1234\\chrome-headless-shell-win64\\chrome-headless-shell.exe';
const browser = await chromium.launch({ executablePath: exe });
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
await page.goto('http://127.0.0.1:4180/', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(8000);
await page.keyboard.press('Escape');
await page.waitForTimeout(500);
try{ await page.evaluate(()=>{ window.scrollTo(0, window.innerHeight * 0.8); }); }catch{}
await page.waitForTimeout(600);
const result = await page.evaluate(() => {
  const vw = window.innerWidth;
  const sw = document.documentElement.scrollWidth;
  const cw = document.documentElement.clientWidth;
  const tickerEl = document.querySelector('[data-testid="live-ticker"]');
  const chips = Array.from(document.querySelectorAll('[data-asset-chip]'));
  const visibleChips = chips.filter(c => {
    const r = c.getBoundingClientRect();
    const cs = getComputedStyle(c);
    return r.width > 0 && r.height > 0 && cs.display !== 'none' && cs.visibility !== 'hidden';
  });
  const r = tickerEl ? tickerEl.getBoundingClientRect() : null;
  return {
    vw, sw, cw,
    liveTickerPresent: !!tickerEl,
    tickerVisible: !!tickerEl && r && r.width > 0 && getComputedStyle(tickerEl).display !== 'none',
    tickerRect: r ? { x: r.x, y: r.y, w: r.width, h: r.height } : null,
    feedPresent: !!document.querySelector('[data-feed-stream]'),
    compactPresent: !!document.querySelector('[data-feed-compact]'),
    chipCount: chips.length,
    visibleChipCount: visibleChips.length,
    chips: chips.slice(0,12).map(c => ({ asset: c.getAttribute('data-asset'), dir: c.getAttribute('data-dir'), text: c.innerText, vis: !!c.getBoundingClientRect().width })),
    bodyLen: document.body?.innerText?.length
  };
});
await page.screenshot({ path: 'screenshots/round10b-' + mode + '.png' });
const size = statSync('screenshots/round10b-' + mode + '.png').size;
console.log(JSON.stringify({ mode, ...result, screenshotSize: size }));
await browser.close();
