import { chromium } from 'playwright';
import fs from 'node:fs';
const exe = 'C:\\Users\\debih\\AppData\\Local\\ms-playwright\\chromium_headless_shell-1234\\chrome-headless-shell-win64\\chrome-headless-shell.exe';
const mode = process.argv[2] || 'after';
const browser = await chromium.launch({ executablePath: exe });
const report = {};
for (const vw of [390, 480, 1280]) {
  const page = await browser.newPage({ viewport: { width: vw, height: vw === 390 ? 844 : 800 } });
  await page.goto('http://127.0.0.1:4180/', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(8000);
  await page.keyboard.press('Escape');
  const r = await page.evaluate(() => {
    const chips = Array.from(document.querySelectorAll('[data-asset-chip]'));
    const vis = (el) => { if (!el) return false; const s = getComputedStyle(el); const b = el.getBoundingClientRect(); return s.display !== 'none' && s.visibility !== 'hidden' && b.width > 0 && b.height > 0; };
    const ticker = document.querySelector('[data-testid="live-ticker"]');
    const compact = document.querySelector('[data-feed-compact="1"]');
    const feed = document.querySelector('[data-feed-stream]');
    return {
      vw: window.innerWidth, sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth,
      chipsTotal: chips.length,
      chipsVisible: chips.filter(vis).length,
      hasCompactRail: !!compact, compactVisible: vis(compact),
      tickerPresent: !!ticker, tickerVisible: vis(ticker),
      feedPresent: !!feed,
      sample: chips.slice(0, 8).map(c => c.getAttribute('data-asset') + '/dir=' + c.getAttribute('data-dir'))
    };
  });
  report[vw] = r;
  if (vw === 390) await page.screenshot({ path: 'screenshots/round10c-' + mode + '.png' });
  await page.close();
}
const sizes = {};
for (const f of ['round10c-before.png', 'round10c-after.png']) { try { sizes[f] = fs.statSync('screenshots/' + f).size; } catch {} }
console.log(JSON.stringify({ mode, report, sizes }));
await browser.close();
