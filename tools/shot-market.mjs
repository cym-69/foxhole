// Screenshot the MARKETS chart for verification.
// Phase 10 slice 2: TV HLS vs YouTube drop-test — visits every TV channel, verifies
// the <video>/iframe mounts and that no fatal HLS error is visible. Writes
// evidence/phase10-tv.json (per-channel status) plus screenshots.
const { createRequire } = await import('node:module');
const { writeFileSync } = await import('node:fs');
const __req = createRequire(import.meta.url);
const { chromium } = __req('C:/Users/debih/AppData/Roaming/npm/node_modules/playwright');
const CHROME_PATH = 'C:/Users/debih/AppData/Local/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-win64/chrome-headless-shell.exe';
const BASE = 'http://127.0.0.1:4180';
const browser = await chromium.launch({ executablePath: CHROME_PATH, headless: true });
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, bypassCSP: true });
page.on('pageerror', (e) => console.log('[pageerror]', e.message || String(e)));
await page.goto(BASE, { waitUntil: 'load', timeout: 30000 });
await page.waitForTimeout(5000);
await page.screenshot({ path: 'evidence/phase3-markets.png', fullPage: false });
console.log('SHOT evidence/phase3-markets.png');
// Dismiss the Setup modal (z-50 overlay intercepts pointer events over the header).
const closeSetup = page.getByRole('button', { name: /close settings|close setup|×|X/i }).first();
const closeCount = await closeSetup.count().catch(() => 0);
if (closeCount) await closeSetup.click().catch(() => { /* optional */ });
await page.waitForTimeout(1000);
// Open the TV panel via the header "TV" button (exact name 'TV').
const tvBtn = page.getByRole('button', { name: 'TV', exact: true }).first();
console.log('TV: tvBtn count=' + (await tvBtn.count()));
await tvBtn.click({ force: true }).catch((e) => console.log('TV: click failed ' + String(e.message || e).slice(0, 120)));
await page.waitForTimeout(2500);
// The panel opens on click; if the overlay was in the way, center-click to dismiss
// then click TV again — the tail dump confirms when the 11 channel buttons exist.
let allNow = page.locator('button');
let tail = await allNow.allTextContents();
console.log('TV: buttons after open=' + (await allNow.count()) + ' tail:' + tail.slice(-15).join(' | '));
if (!tail.some((t) => t.includes('Al Jazeera HLS'))) {
  console.log('TV: panel not open, retry after backdrop click');
  await page.mouse.click(800, 100);
  await page.waitForTimeout(1000);
  await page.getByRole('button', { name: 'TV', exact: true }).first().click({ force: true }).catch(() => {});
  await page.waitForTimeout(2500);
  allNow = page.locator('button');
  tail = await allNow.allTextContents();
  console.log('TV: buttons after retry=' + (await allNow.count()) + ' tail:' + tail.slice(-15).join(' | '));
}
const report = { when: new Date().toISOString(), base: BASE, channels: [] };
// Channel buttons are the 11 whose text matches a known name, not "last N".
const wanted = ['Al Jazeera', 'DW News', 'France 24', 'Sky News', 'Al Jazeera HLS', 'DW English HLS', 'CNN International', 'Africanews', 'BBC News', 'NHK World', 'France 24 Arabic'];
const n = wanted.length;
for (let idx = 0; idx < n; idx++) {
  const pattern = new RegExp('^' + wanted[idx].replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$', 'i');
  const tab = page.locator('button').filter({ hasText: pattern }).first();
  const label = wanted[idx];
  if ((await tab.count()) === 0) { console.log(`TV: MISSING ${label}`); continue; }
  await tab.click();
  await page.waitForTimeout(2500);
  const video = page.locator('video').first();
  const iframe = page.locator('iframe').first();
  const hasVideo = (await video.count()) > 0;
  let readyState = -1, networkState = -1, errorText = '';
  if (hasVideo) {
    const st = await video.evaluate((el) => ({ rs: el.readyState, ns: el.networkState, err: el.error ? el.error.code : 0 })).catch(() => ({ rs: -1, ns: -1, err: 0 }));
    readyState = st.rs; networkState = st.ns; errorText = String(st.err || '');
  }
  const hasIframe = (await iframe.count()) > 0;
  report.channels.push({ label, hasVideo, readyState, networkState, errorText, hasIframe });
  console.log(`TV: ${label} | video:${hasVideo} rs:${readyState} ns:${networkState} iframe:${hasIframe}`);
}
await page.screenshot({ path: 'evidence/phase7-tv.png', fullPage: false });
console.log('SHOT evidence/phase7-tv.png');
writeFileSync('evidence/phase10-tv.json', JSON.stringify(report, null, 2));
console.log('WROTE evidence/phase10-tv.json (' + report.channels.length + ' channels)');
await browser.close();