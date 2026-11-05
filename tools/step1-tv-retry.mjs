// STEP 1 retry: full Chromium (not headless shell), headed when a display is available.
const { createRequire } = await import('node:module');
const __req = createRequire(import.meta.url);
const { chromium } = __req('C:/Users/debih/AppData/Roaming/npm/node_modules/playwright');

const CHROME_PATH = 'C:/Users/debih/AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const CANDIDATES = [
  { handle: '@markets', name: 'Bloomberg Television' },
  { handle: '@euronews', name: 'Euronews' },
  { handle: '@trtworld', name: 'TRT World' },
  { handle: '@channelnewsasia', name: 'Channel NewsAsia' },
];
const BAD = /unavailable|playback on other websites|watch on youtube|error/i;

let browser;
try {
  browser = await chromium.launch({ executablePath: CHROME_PATH, headless: false, args: ['--autoplay-policy=no-user-gesture-required'] });
} catch (e) {
  console.log('LAUNCH_ERROR ' + String(e).split('\n')[0].slice(0, 160));
  browser = await chromium.launch({ executablePath: CHROME_PATH, headless: true, args: ['--autoplay-policy=no-user-gesture-required'] });
}
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, userAgent: UA });
const page = await ctx.newPage();

let winner = null;
for (const c of CANDIDATES) {
  let id = '';
  try {
    await page.goto('https://www.youtube.com/' + c.handle, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForTimeout(4000);
    const href = await page.evaluate(() => document.querySelector('link[rel="canonical"]')?.href || '');
    const m = href.match(/\/channel\/(UC[\w-]+)/) || (await page.url()).match(/\/channel\/(UC[\w-]+)/);
    id = m ? m[1] : '';
  } catch (e) {
    console.log(`CAND ${c.handle} | channel=ERROR | ${String(e).split('\n')[0].slice(0, 120)}`);
  }
  if (!id) { console.log(`CAND ${c.handle} | channel=NONE | FAIL | no channel id`); continue; }
  let text = '';
  let err = '';
  try {
    await page.goto(`https://www.youtube.com/embed/live_stream?channel=${id}&autoplay=1&mute=1&rel=0`, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForTimeout(8000);
    text = await page.evaluate(() => (document.body ? document.body.innerText : '') || '');
    text = text.replace(/\s+/g, ' ').trim();
  } catch (e) { err = String(e).split('\n')[0].slice(0, 160); }
  const bad = err ? true : BAD.test(text);
  console.log(`CAND ${c.handle} | channel=${id} | ${bad ? 'FAIL' : 'PASS'} | ${err ? 'error: ' + err : 'text: ' + (text || '(no text)').slice(0, 200)}`);
  if (!bad && !winner) winner = { ...c, id };
}
await browser.close();
console.log(`WINNER=${winner ? winner.handle + ' ' + winner.id : 'none'}`);
