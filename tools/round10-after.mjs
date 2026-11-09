import { chromium } from 'playwright';
const exe = process.env.PW_EXE || 'C:\\Users\\debih\\AppData\\Local\\ms-playwright\\chromium_headless_shell-1234\\chrome-headless-shell-win64\\chrome-headless-shell.exe';
const browser = await chromium.launch({ executablePath: exe });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
await page.goto('http://127.0.0.1:4180/', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(8000);
await page.keyboard.press('Escape');
// Try to dismiss any intro modal/overlay showing the ticker; if not found, continue
const result = await page.evaluate(() => {
  const ticker = document.querySelector('[data-testid="live-ticker"]');
  const chips = Array.from(document.querySelectorAll('[data-asset-chip]'));
  const containers = Array.from(document.querySelectorAll('[data-asset-chips]'));
  const feed = document.querySelector('[data-feed-stream]');
  // feed items text for sample
  const items = Array.from(document.querySelectorAll('[data-feed-stream] article, [data-feed-stream] li')).slice(0,10).map(el => el.innerText?.slice(0,200));
  return {
    liveTickerPresent: !!ticker,
    liveTickerText: ticker?.innerText?.slice(0,200) || null,
    feedPresent: !!feed,
    chipCount: chips.length,
    chips: chips.slice(0,15).map(c => ({ asset: c.getAttribute('data-asset'), dir: c.getAttribute('data-dir'), text: c.innerText, title: c.getAttribute('title') })),
    containers: containers.length,
    bodyLen: document.body?.innerText?.length,
    items
  };
});
await page.screenshot({ path: 'screenshots/round10-after.png' });
const fs = await import('node:fs');
const size = fs.statSync('screenshots/round10-after.png').size;
console.log(JSON.stringify({ ...result, screenshotSize: size }));
await browser.close();
