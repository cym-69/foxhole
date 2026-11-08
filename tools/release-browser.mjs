// Foxhole release gate - browser widths + console + SSE (named events) + TV HLS (CSP-enforced).
// Usage: node tools/release-browser.mjs [baseUrl]   (defaults to http://127.0.0.1:4180)
// No bypassCSP: Chromium runs with default CSP handling.
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const BASE = process.argv[2] || 'http://127.0.0.1:4180';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(HERE, '../evidence');
fs.mkdirSync(OUT, { recursive: true });

const require = createRequire('C:/Users/debih/AppData/Roaming/npm/');
const { chromium } = require('playwright');

let pass = 0;
let fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log('PASS: ' + name + (extra ? ' -- ' + extra : '')); }
  else { fail++; console.log('FAIL: ' + name + (extra ? ' -- ' + extra : '')); }
};

const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });

const WIDTHS = [
  { name: 'desktop-1280', width: 1280, height: 900 },
  { name: 'narrow-1050', width: 1050, height: 900 },
  { name: 'mobile-390', width: 390, height: 844 },
];

for (const w of WIDTHS) {
  const page = await browser.newPage({ viewport: { width: w.width, height: w.height } });
  const consoleErrors = [];
  const pageErrors = [];
  page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 200)); });
  page.on('pageerror', e => pageErrors.push(String(e.message || e).slice(0, 200)));
  await page.goto(BASE + '/', { waitUntil: 'load', timeout: 60000 });
  await page.waitForTimeout(9000);
  await page.screenshot({ path: path.join(OUT, 'release-' + w.name + '.png') });
  // Page-level overflow only: scrollbars/overflow of intentional inner scroll
  // containers (AssetStrip strip, Kanban columns, globe canvas, SVG charts) are
  // by design and must not fail the gate. scrollWidth <= clientWidth is the
  // real regression signal (e.g. the old implicit-grid-column blowout).
  const layout = await page.evaluate(() => {
    const de = document.documentElement;
    return { sw: de.scrollWidth, cw: de.clientWidth };
  });
  ok(w.name + ' renders without page horizontal overflow', layout.sw <= layout.cw + 1, 'sw=' + layout.sw + ' cw=' + layout.cw);
  ok(w.name + ' zero console errors', consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | ') || 'clean');
  ok(w.name + ' zero page errors', pageErrors.length === 0, pageErrors.slice(0, 3).join(' | ') || 'clean');
  const hud = await page.evaluate(() => document.body.innerText.slice(0, 400).replace(/\n/g, ' '));
  ok(w.name + ' HUD text present', /foxhole|events|signal|tv/i.test(hud), hud.slice(0, 120));
  await page.close();
}

// ---- SSE inside the real page: /stream uses NAMED events, so we must listen
// ---- for a typed event (snapshot) rather than onmessage (unnamed data only).
// Probe is same-origin relative ('/stream') inside the app page.
{
  const page = await browser.newPage();
  await page.goto(BASE + '/', { waitUntil: 'load', timeout: 60000 });
  await page.waitForTimeout(3000);
  const probe = await page.evaluate(() => new Promise(resolve => {
    const t0 = Date.now();
    const es = new window.EventSource('/stream');
    let opened = false;
    let done = false;
    const finish = (kind) => { if (!done) { done = true; try { es.close(); } catch { /* noop */ } resolve({ kind, opened, ms: Date.now() - t0 }); } };
    const to = setTimeout(() => finish('timeout'), 20000);
    es.onopen = () => { opened = true; };
    es.addEventListener('snapshot', () => { clearTimeout(to); finish('named-snapshot'); });
    es.addEventListener('feed', () => { clearTimeout(to); finish('named-feed'); });
    es.addEventListener('event_new', () => { clearTimeout(to); finish('named-event_new'); });
    // Note: onerror fires when we close/abort the stream; it is not a failure
    // once any named event arrived. Only fail if nothing ever landed.
    es.onerror = () => { if (opened && done) return; if (!opened) { clearTimeout(to); finish('error'); } };
  }));
  ok('Browser EventSource receives named events on /stream', probe.kind.startsWith('named-'), JSON.stringify(probe));
  await page.close();
}

// ---- TV panel: open it, then explicitly select an HLS tab (the default tab
// ---- is a YouTube iframe; the <video> element only exists for HLS tabs).
{
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const consoleErrors = [];
  const pageErrors = [];
  page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 200)); });
  page.on('pageerror', e => pageErrors.push(String(e.message || e).slice(0, 200)));
  await page.goto(BASE + '/', { waitUntil: 'load', timeout: 60000 });
  await page.waitForTimeout(4000);
  // Dismiss any onboarding/setup modal overlay that blocks header clicks.
  await page.keyboard.press('Escape').catch(() => {});
  await page.waitForTimeout(500);
  const closeBtn = page.getByRole('button', { name: 'Close' }).first();
  if (await closeBtn.count()) await closeBtn.click().catch(() => {});
  await page.waitForTimeout(500);
  const tvBtn = page.getByRole('button', { name: 'TV', exact: true }).first();
  if (await tvBtn.count()) await tvBtn.click().catch(() => {});
  await page.waitForTimeout(2500);
  const yt = await page.evaluate(() => ({ iframe: !!document.querySelector('iframe'), video: !!document.querySelector('video') }));
  console.log('INFO: default TV tab state ' + JSON.stringify(yt));
  // Click the HLS channel tab by its visible name.
  const hlsTab = page.getByRole('button', { name: 'Al Jazeera HLS', exact: true });
  const hlsCount = await hlsTab.count();
  ok('HLS channel tab present in TV panel', hlsCount > 0, 'count=' + hlsCount);
  if (await hlsTab.count()) await hlsTab.click().catch(() => {});
  await page.waitForTimeout(3000);
  const hasVideo = await page.evaluate(() => !!document.querySelector('video'));
  ok('TV HLS tab renders a video element', hasVideo);
  await page.waitForTimeout(15000);
  const tvState = await page.evaluate(() => {
    const v = document.querySelector('video');
    if (!v) return { found: false };
    return { found: true, readyState: v.readyState, videoWidth: v.videoWidth, paused: v.paused, currentTime: Math.round(v.currentTime * 10) / 10, networkState: v.networkState, error: v.error ? String(v.error.code) : null };
  });
  ok('HLS video playing (CSP-enforced, no bypass)', tvState.found && tvState.readyState >= 2 && tvState.videoWidth > 0 && !tvState.paused, JSON.stringify(tvState));
  const mse = await page.evaluate(async () => {
    const probe = document.createElement('video');
    probe.muted = true;
    const supported = !!probe.canPlayType('application/vnd.apple.mpegurl') || !!window.MediaSource;
    return { canPlayType: probe.canPlayType('application/vnd.apple.mpegurl'), mediaSource: !!window.MediaSource, supported: !!supported };
  });
  console.log('INFO: HLS capability ' + JSON.stringify(mse));
  const fatal = [...consoleErrors, ...pageErrors].filter(t => !/favicon|404/.test(t));
  ok('TV no fatal console/page errors after 18s', fatal.length === 0, fatal.slice(0, 3).join(' | ') || 'clean');
  await page.screenshot({ path: path.join(OUT, 'release-tv.png') });
  await page.close();
}

await browser.close();
console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
