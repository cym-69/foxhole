// Step 4b/4c: feed stream UI behaviour against the running test server (mock rss + FOXHOLE_TEST=1).
const { createRequire } = await import('node:module');
const __req = createRequire(import.meta.url);
const { chromium } = __req('C:/Users/debih/AppData/Roaming/npm/node_modules/playwright');
const CHROME_PATH = 'C:/Users/debih/AppData/Local/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-win64/chrome-headless-shell.exe';
const BASE = process.env.PAGE_URL || 'http://127.0.0.1:4180';
const MOCK_URL = 'http://127.0.0.1:9200/a.xml';
const MODE = process.argv[2] || 'all';

const browser = await chromium.launch({ executablePath: CHROME_PATH, headless: true });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await ctx.newPage();
page.on('pageerror', (e) => console.log('PAGEERROR ' + (e.message || e)));
const POST = async (path, body) => page.request.post(BASE + path, { data: body });
const items = page.locator('[data-feed-stream] li');
const titleOf = async (i) => (await items.nth(i).locator('p').first().innerText()).trim();
const queueLen = () => page.locator('[data-feed-stream]').getAttribute('data-feed-queue').then((v) => Number(v));

await page.goto(BASE, { waitUntil: 'load', timeout: 30000 });
await page.waitForSelector('[data-feed-stream]', { timeout: 20000 });
console.log('FEED_CONTAINER=' + await page.locator('[data-feed-stream]').count());

// ---- 4b: 12 items, one per second --------------------------------------
for (let i = 1; i <= 12; i++) {
  const r = await POST('/__test/feed', { text: 'Headline number ' + i, srcName: 'MockWatch', kind: 'news', tickers: ['CLF'], url: MOCK_URL });
  if (r.status() !== 200) console.log('FEED_POST_STATUS_' + i + '=' + r.status());
  await page.waitForTimeout(1000);
}
console.log('DOM_ITEMS_AT_SECOND_12=' + await items.count());
await page.screenshot({ path: 'C3-feed-items.png', fullPage: false });

await page.waitForTimeout(35000);
const n8 = await items.count();
console.log('DOM_ITEMS_AFTER_DRAIN=' + n8 + '  (cap 8)');
await page.screenshot({ path: 'C3-feed-8.png', fullPage: false });
const mask = await page.locator('[data-feed-stream]').evaluate((el) => getComputedStyle(el).maskImage || getComputedStyle(el).webkitMaskImage);
console.log('MASK_IMAGE=' + String(mask).slice(0, 80));
console.log('MASK_NOT_NONE=' + (String(mask) !== 'none'));
console.log('NEWEST_TOP=' + await titleOf(0) + '  |  SECOND=' + await titleOf(1) + '  |  OLDEST_BOTTOM=' + await titleOf(n8 - 1));

// Hover pauses release and removal (hover the first item: the container itself is pointer-events none).
const topBefore = await titleOf(0);
await items.first().hover();
await page.waitForTimeout(8000);
console.log('HOVER_TOP_BEFORE=' + topBefore + '  AFTER_8s=' + await titleOf(0) + '  PAUSED=' + (topBefore === await titleOf(0)));
await page.mouse.move(0, 0);

// A news item opens its url in a new tab (hover first, so the list stays still while we click).
await POST('/__test/feed', { text: 'Popup test headline', srcName: 'MockWatch', kind: 'news', tickers: ['CLF'], url: MOCK_URL });
for (let i = 0; i < 12; i++) {
  await page.waitForTimeout(1000);
  if (await items.first().locator('a').count()) break;
}
const newsLink = items.first().locator('a');
await newsLink.hover();
await page.waitForTimeout(500);
console.log('NEWS_ITEM_TEXT=' + await newsLink.locator('p').first().innerText());
console.log('NEWS_LINK_URL=' + await newsLink.getAttribute('href'));
console.log('NEWS_LINK_REL=' + await newsLink.getAttribute('rel'));
console.log('NEWS_LINK_TARGET=' + await newsLink.getAttribute('target'));
const [popup] = await Promise.all([
  page.waitForEvent('popup', { timeout: 20000 }),
  newsLink.click(),
]);
await popup.waitForLoadState('load', { timeout: 20000 }).catch(() => {});
console.log('POPUP_URL=' + (popup ? await popup.url() : 'none'));
await popup.close();
await page.mouse.move(5, 5); // leave the stream, so releasing resumes
await page.waitForTimeout(1000);
await page.screenshot({ path: 'C3-feed-popup.png', fullPage: false });

// ---- 4c: click an event item --------------------------------------------
await page.reload({ waitUntil: 'load' });
await page.waitForSelector('[data-feed-stream]', { timeout: 20000 });
for (let i = 0; i < 30; i++) { if (await queueLen() === 0) break; await page.waitForTimeout(3000); }
console.log('QUEUE_DRAINED=' + await queueLen());
const ev = await POST('/__test/event', { title: 'Feed pick test event', kind: 'conflict', lat: 24, lng: 40, size: 0.4, place: 'Test', sources: 1 });
console.log('EVENT_POST_STATUS=' + ev.status());
const evItem = page.locator('[data-feed-event]').first();
await evItem.waitFor({ state: 'visible', timeout: 30000 });
console.log('EVENT_ITEM_TEXT=' + (await evItem.locator('p').first().innerText()).trim());
await evItem.hover();
await evItem.click();
await page.waitForTimeout(2500);
const chainText = await page.locator('main aside').last().innerText();
console.log('CHAIN_SHOWS_EVENT_TITLE=' + /Feed pick test event/.test(chainText));
await page.screenshot({ path: 'C3-feed-event-pick.png', fullPage: false });

// ---- 4b: silence: past 90 s every item ages out -------------------------
for (let i = 0; i < 30; i++) { if (await queueLen() === 0) break; await page.waitForTimeout(3000); }
console.log('QUEUE_BEFORE_SILENCE=' + await queueLen());
console.log('WAITING_100S...');
await page.waitForTimeout(100000);
console.log('DOM_ITEMS_AFTER_100S_SILENCE=' + await items.count());
await page.screenshot({ path: 'C3-feed-empty.png', fullPage: false });

await browser.close();
