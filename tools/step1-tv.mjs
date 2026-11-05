// STEP 1: test YouTube live-stream candidates. Channel ID from the canonical link of
// https://www.youtube.com/<handle>, then probe the /embed/live_stream?channel=<ID> page.
const { createRequire } = await import('node:module');
const __req = createRequire(import.meta.url);
const { chromium } = __req('C:/Users/debih/AppData/Roaming/npm/node_modules/playwright');

const CHROME_PATH = 'C:/Users/debih/AppData/Local/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-win64/chrome-headless-shell.exe';
const CANDIDATES = [
  { handle: '@markets', name: 'Bloomberg Television' },
  { handle: '@euronews', name: 'Euronews' },
  { handle: '@trtworld', name: 'TRT World' },
  { handle: '@channelnewsasia', name: 'Channel NewsAsia' },
];
const BAD = /unavailable|playback on other websites|watch on youtube|error/i;

const browser = await chromium.launch({ executablePath: CHROME_PATH, headless: true });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await ctx.newPage();

let winner = null;
for (const c of CANDIDATES) {
  let id = '';
  try {
    await page.goto('https://www.youtube.com/' + c.handle, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForTimeout(3500);
    const href = await page.evaluate(() => document.querySelector('link[rel="canonical"]')?.href || '');
    const m = href.match(/\/channel\/(UC[\w-]+)/);
    id = m ? m[1] : '';
    if (!id) {
      const m2 = (await page.url()).match(/\/channel\/(UC[\w-]+)/);
      id = m2 ? m2[1] : '';
    }
  } catch (e) {
    console.log(`CAND ${c.handle} | channel=ERROR | ${String(e).split('\n')[0].slice(0, 120)}`);
  }
  if (!id) {
    console.log(`CAND ${c.handle} | channel=NONE | FAIL | no channel id in canonical link`);
    continue;
  }
  let text = '';
  let err = '';
  try {
    await page.goto(`https://www.youtube.com/embed/live_stream?channel=${id}&autoplay=1&mute=1&rel=0`, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForTimeout(8000);
    text = await page.evaluate(() => (document.body ? document.body.innerText : '') || '');
    text = text.replace(/\s+/g, ' ').trim();
  } catch (e) {
    err = String(e).split('\n')[0].slice(0, 160);
  }
  const bad = err ? true : BAD.test(text);
  console.log(`CAND ${c.handle} | channel=${id} | ${bad ? 'FAIL' : 'PASS'} | ${err ? 'error: ' + err : 'text: ' + (text || '(no text)').slice(0, 200)}`);
  if (!bad && !winner) winner = { ...c, id };
}
await browser.close();
console.log(`WINNER=${winner ? winner.handle + ' ' + winner.id : 'none'}`);
