import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { cfg, saveKey, ROOT } from './config.js';
import { ASSETS, TRAD, CRYPTO } from './assets.js';
import { usgs, eonet, cryptoNews } from './feeds/events.js';
import { refreshGdelt } from './feeds/gdelt.js';
import { demoEvents, DEMO_SENTIMENT } from './feeds/demo.js';
import { fetchSentiment } from './feeds/crypto.js';
import * as markets from './feeds/markets.js';
import { analyze } from './engine.js';
import * as track from './track.js';
import * as ai from './ai.js';
import { live, onChange, startLivePollers, liveEvents, addTestEvent } from './feeds/live.js';
import { startShips, shipBoxes, shipsSnapshot } from './feeds/ships.js';
import { startSats, satsRows } from './feeds/sats.js';
import { startHeadlines, headlineItems, headlineStatus, onHeadline, pushTestHeadline, seedEvents, feedEvent } from './feeds/headlines.js';
import { cinemaSnapshot, startCinema } from './feeds/cinema.js';
import { liveNowSnapshot, startLiveWatchlist } from './feeds/livewatch.js';
import { xFeedSnapshot, startXFeed } from './feeds/xfeed.js';
import { profiles, profilesSummary, profileFeed } from './horizon/engine.js';

const HOUR = 3600000;
const src = {
  usgs: { name: 'Earthquakes (USGS)', ev: [], ok: false, err: '' },
  eonet: { name: 'Natural events (NASA)', ev: [], ok: false, err: '' },
  cryptocv: { name: 'Crypto news (cryptocurrency.cv)', ev: [], ok: false, err: '' },
  gdelt: { name: 'Conflict and policy (GDELT events)', ev: [], ok: false, err: '' },
};
let sentiment = {};
let sentimentLive = false;

async function refreshSimple() {
  const jobs = { usgs, eonet, cryptocv: cryptoNews };
  await Promise.all(Object.entries(jobs).map(async ([k, fn]) => {
    try { src[k].ev = await fn(); src[k].ok = true; src[k].err = ''; }
    catch (e) { src[k].ok = false; src[k].err = e.message; }
  }));
}
async function refreshGdeltSrc() {
  try { src.gdelt.ev = await refreshGdelt(); src.gdelt.ok = true; src.gdelt.err = ''; }
  catch (e) { src.gdelt.ok = false; src.gdelt.err = e.message; }
}
async function refreshSentiment() {
  const s = await fetchSentiment();
  if (Object.keys(s).length) { sentiment = s; sentimentLive = true; } else sentimentLive = false;
}

function collect() {
  const all = [];
  let liveSources = 0;
  for (const k of ['usgs', 'eonet', 'cryptocv', 'gdelt']) if (src[k].ok) { liveSources++; all.push(...src[k].ev); }
  all.push(...liveEvents());
  const fresh = all.filter((e) => Date.now() - e.ts < 72 * HOUR);
  const seen = new Set();
  const uniq = fresh.filter((e) => (seen.has(e.id) ? false : seen.add(e.id)));
  if (cfg.demoForced || (liveSources === 0 && uniq.length === 0)) return { events: demoEvents(), demo: true, liveSources: 0 };
  return { events: uniq, demo: false, liveSources };
}

let cached = { t: 0, v: null };
function compute() {
  if (Date.now() - cached.t < 2000 && cached.v) return cached.v;
  const col = collect();
  const sent = !sentimentLive && col.demo
    ? Object.fromEntries(Object.entries(DEMO_SENTIMENT).map(([k, v]) => [k, { ...v, value: v.score }]))
    : sentiment;
  const btc = markets.getQuote('BTC');
  // Round 7: product builds surface top unlinked events as WATCH-level multi-event signals.
  // analyze() without ctx.watch stays linked-only (test invariants); buildState enables watch.
  const result = analyze(col.events, { stats: track.getStats(), aiWhy: ai.aiWhyCache, sentiment: sent, btcVol: btc?.vol, watch: true });
  cached = { t: Date.now(), v: { col, result, sent } };
  return cached.v;
}

function buildState() {
  const { col, result, sent } = compute();
  const topSignals = result.top.map((id) => result.signals.find((s) => s.id === id)).filter(Boolean);

  // Ask the AI (if connected) to reword the note for the main signal of each top event.
  const wanted = [];
  for (const e of result.events.slice(0, 6)) { // few requests, so free models do not rate-limit us
    const s = result.signals.find((x) => x.eventId === e.id);
    if (s && s.whySrc === 'rules') wanted.push({ key: s.whyKey, text: s.whyBase });
  }
  ai.requestWhy(wanted);
  ai.refreshBrief(topSignals.map((s) => `${s.action} ${s.label}, ${s.level} confidence: ${s.whyBase}`));

  const trad = markets.snapshot(TRAD);
  const crypto = markets.snapshot(CRYPTO);
  for (const s of CRYPTO) if (crypto[s]) crypto[s].sentiment = sent[s] || null;

  const ctxFresh = (e) => (Date.now() - e.ts < 24 * HOUR ? 1 : 0.6);
  const context = result.context
    .filter((e) => typeof e.lat === 'number')
    .sort((a, b) => b.size * ctxFresh(b) - a.size * ctxFresh(a))
    .slice(0, 60)
    .map(({ id, kind, layer, title, place, lat, lng, size, sources, src, ts }) => ({ id, kind, layer, title, place, lat, lng, size, sources, src, ts, linked: false }));
  const lead = (id) => { const s = result.signals.find((x) => x.eventId === id); return s ? { asset: s.asset, dir: s.dir, action: s.action } : null; };
  const events = result.events.map(({ id, kind, layer, title, place, lat, lng, size, sources, src, ts, impact, assets }) => ({ id, kind, layer, title, place, lat, lng, size, sources, src, ts, impact, assets, lead: lead(id) }));
  return {
    now: Date.now(),
    status: {
      events: {
        mode: col.demo ? 'demo' : 'live',
        counts: { seen: col.events.length, linked: result.events.length },
        detail: Object.values(src).map((s) => `${s.name}: ${s.ok ? 'ok' : (s.err || 'waiting').slice(0, 200)}`),
      },
      markets: markets.status.markets,
      crypto: { prices: markets.status.cryptoPrices, sentiment: sentimentLive ? 'live' : col.demo ? 'demo' : 'none' },
      cinema: cinemaSnapshot().status,
      livewatch: liveNowSnapshot().ok ? 'live' : 'error',
      xfeed: xFeedSnapshot().ok ? 'live' : 'error',
    },
    ai: { ...ai.publicInfo(), brief: ai.getBrief() },
    keys: { finnhub: !!cfg.finnhubKey, tmdb: !!cfg.tmdbKey },
    assets: ASSETS, events, context, signals: result.signals, top: result.top, trad, crypto,
  };
}

const app = express();
app.use(express.json({ limit: '50kb' }));

app.use((req,res,next)=>{
  const isHtml = req.method === 'GET' && !req.path.startsWith('/api') && !req.path.startsWith('/stream') && !req.path.startsWith('/assets') && !req.path.startsWith('/__');
  res.set({
    'X-Content-Type-Options':'nosniff',
    'X-Frame-Options':'SAMEORIGIN',
    'Referrer-Policy':'no-referrer',
    'Cross-Origin-Opener-Policy':'same-origin',
    // HTML runs our bundled app (self scripts/styles/img, data: icons, blob: three); API stays locked down.
    // Sandboxed preview iframes (e.g. YouTube in TvPanel) carry their own sandbox attr, not this header.
    'Content-Security-Policy': isHtml
      ? "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; font-src 'self' data:; media-src 'self' blob: https:; frame-src https:; connect-src 'self' https:; worker-src 'self' blob:; object-src 'none'; base-uri 'self'; frame-ancestors 'self'"
      : "default-src 'none'; sandbox",
  });
  next();
});

const rate = new Map();
function rateLimit(windowMs, max, pathPrefix) {
  return (req,res,next)=>{
    if (!req.path.startsWith(pathPrefix)) return next();
    const now=Date.now();
    const key=`${req.ip||'x'}:${req.path}`;
    const entry=rate.get(key);
    if (!entry || now-entry.start>=windowMs) { rate.set(key,{start:now,count:1}); return next(); }
    entry.count+=1;
    if (entry.count>max) return res.status(429).json({error:'Too many requests.'});
    return next();
  };
}
setInterval(()=>{ const now=Date.now(); for (const [k,v] of rate) if (now-v.start>=60000) rate.delete(k); },60000).unref();

const postRate=rateLimit(60000,30,'/api/');
const testRate=rateLimit(60000,30,'/__test/');
const stateRate=rateLimit(60000,120,'/api/state');
const streamRate=rateLimit(60000,30,'/stream');
const cinemaRate=rateLimit(60000,30,'/api/cinema');
const horizonRate=rateLimit(60000,90,'/api/horizon');
const liveNowRate=rateLimit(60000,60,'/api/live/now');
const xRate=rateLimit(60000,60,'/api/x');
app.use((req,res,next)=>{ if (req.method!=='POST') return next(); if (req.path.startsWith('/__test/')) return testRate(req,res,next); return postRate(req,res,next); });
app.use(stateRate);
app.use(streamRate);
app.use(cinemaRate);
app.use(horizonRate);
app.use(liveNowRate);
app.use(xRate);

app.use((req,res,next)=>{
  if (req.method!=='GET') return next();
  const o=req.headers.origin;
  if (!o) return next();
  try {
    const u=new URL(o);
    const ok=u.host===req.headers.host || ['localhost:5173','127.0.0.1:5173'].includes(u.host);
    if (ok) res.set('Access-Control-Allow-Origin',o);
  } catch { /* intentional: malformed Origin gets no CORS header */ }
  next();
});

// Block other websites from posting to your local server (it stores your keys).
app.use((req, res, next) => {
  if (req.method === 'GET') return next();
  const o = req.headers.origin;
  if (!o) return next();
  try {
    const u = new URL(o);
    const ok = u.host === req.headers.host || ['localhost:5173', '127.0.0.1:5173'].includes(u.host);
    if (ok) return next();
  } catch { /* intentional: malformed Origin → blocked */ }
  res.status(403).json({ error: 'Blocked origin.' });
});

app.get('/api/state', async (req, res) => {
  const focus = String(req.query.focus || '').split(',').filter((s) => TRAD.includes(s)).slice(0, 8);
  if (focus.length && cfg.finnhubKey) await markets.refreshTrad(focus, 8000).catch(() => {});
  res.json(buildState());
});
app.get('/api/track', (_req, res) => res.json(track.getTrack()));

// Live sources: status per source plus last updated time.
function liveStatus() {
  const out = {};
  for (const [k, s] of Object.entries(live)) out[k] = { status: s.status, lastUpdated: s.lastUpdated, error: s.error, count: s.data.length };
  if (live.ships) out.ships.boxes = shipBoxes();
  return out;
}
// Health endpoint: aggregated per-source status incl. 429 backoff state (headline pollers are 5m/10m).
app.get('/api/health', (_req, res) => res.json({ ok: true, ts: Date.now(), sources: liveStatus(), headlines: headlineStatus() }));
app.get('/api/live', (_req, res) => res.json({ sources: liveStatus(), aircraft: live.aircraft.data, headlines: headlineStatus() }));
app.get('/api/sats', (_req, res) => res.json(satsRows()));
// Cinema tracker (TMDB-backed when TMDB_API_KEY is set; honest empty lists otherwise).
app.get('/api/cinema/trending', (_req, res) => res.json(cinemaSnapshot()));
app.get('/api/cinema/now', (_req, res) => res.json(cinemaSnapshot()));
// Horizon topic radar: profile summaries plus per-profile scored headline feed.
app.get('/api/horizon/profiles', (_req, res) => res.json({ ok: true, profiles: profilesSummary(headlineItems(), { allProfiles: profiles }) }));
app.get('/api/horizon/feed', (req, res) => res.json(profileFeed(String(req.query.profile || ''), headlineItems(), { allProfiles: profiles })));
// LIVE NOW watchlist and X (Twitter) feed snapshots.
app.get('/api/live/now', (_req, res) => res.json(liveNowSnapshot()));
app.get('/api/x/feed', (_req, res) => res.json(xFeedSnapshot()));

// Live stream (Server-Sent Events). Snapshot on connect, then small change messages.
const clients = new Set();
const MAX_SSE_CLIENTS = 128; // defense-in-depth cap; a single loopback user never approaches this
const sse = (res, event, data) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
app.get('/stream', (req, res) => {
  if (clients.size >= MAX_SSE_CLIENTS) { res.writeHead(429); res.end('Too Many Requests'); return; }
  res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
  res.flushHeaders();
  const client = { res, seen: new Set() };
  clients.add(client);
  const ping = setInterval(() => res.write(': ping\n\n'), 20000);
  const { result } = compute();
  bootFeed(result); // the 8 newest existing events belong in the first snapshot
  client.seen = new Set(result.events.map((e) => e.id));
  sse(res, 'snapshot', { now: Date.now(), events: result.events.map(eventOut), aircraft: live.aircraft.data, ships: shipsSnapshot(), sources: liveStatus(), feed: headlineItems() });
  req.on('close', () => { clearInterval(ping); clients.delete(client); });
});
const eventOut = ({ id, kind, layer, title, place, lat, lng, size, sources, src, ts, impact, assets }) => ({ id, kind, layer, title, place, lat, lng, size, sources, src, ts, impact, assets });

// Push changes to clients. Events are checked each time the state is computed.
let feedBooted = false;
// First state with events: the 8 newest existing events become the first feed items.
function bootFeed(result) {
  if (feedBooted || !result.events.length) return;
  feedBooted = true;
  seedEvents(result.events.slice().sort((a, b) => (b.ts || 0) - (a.ts || 0)).slice(0, 8));
}
// New headline: one SSE message per item.
onHeadline((item) => { for (const c of clients) sse(c.res, 'feed', item); });
// New events after start become feed items too.
function feedNewEvents(result) {
  for (const e of result.events) feedEvent(e);
}
function pushChanges(name) {
  if (!clients.size) return;
  if (name !== 'aircraft') cached.t = 0;
  if (name === 'aircraft') {
    for (const c of clients) sse(c.res, 'aircraft', { now: Date.now(), aircraft: live.aircraft.data });
    return;
  }
  if (name === 'status' || name === 'quakes' || name === 'eonet') {
    for (const c of clients) sse(c.res, 'status', { sources: liveStatus() });
  }
  const { result } = compute();
  bootFeed(result);
  for (const c of clients) {
    for (const e of result.events) {
      if (!c.seen.has(e.id)) { c.seen.add(e.id); sse(c.res, 'event_new', eventOut(e)); }
      else if (name !== 'aircraft') {
        const key = `${e.impact}|${e.assets.map((a) => a.a + a.d).join(',')}`;
        if (c.lastKey && c.lastKey.get(e.id) !== key) sse(c.res, 'event_update', eventOut(e));
      }
    }
    c.lastKey = new Map(result.events.map((e) => [e.id, `${e.impact}|${e.assets.map((a) => a.a + a.d).join(',')}`]));
  }
  feedNewEvents(result);
}
// Aircraft: sent on each 15 s aircraft poll (onChange). Status: on each source change.
onChange((name) => pushChanges(name));
// Ships: compact rows plus box counts every 15 s. Snapshot on connect in /stream.
setInterval(() => {
  if (!clients.size) return;
  const payload = shipsSnapshot();
  for (const c of clients) sse(c.res, 'ships', payload);
}, 15000);
setInterval(() => {
  if (!clients.size) return;
  const prices = Object.fromEntries(TRAD.concat(CRYPTO).map((s) => [s, markets.getQuote(s)?.price ?? null]));
  const key = JSON.stringify(prices);
  for (const c of clients) if (c.lastPrices !== key) { c.lastPrices = key; sse(c.res, 'prices', { prices, live: markets.status }); }
}, 20000);

app.post('/api/ai/connect', async (req, res) => {
  try { res.json(await ai.connect(req.body || {})); cached.t = 0; }
  catch (e) { res.status(400).json({ error: e.message || 'Could not connect.' }); }
});
app.post('/api/ai/models', async (req, res) => {
  try { res.json({ models: await ai.listModels(req.body || {}) }); }
  catch (e) { res.status(400).json({ error: e.message || 'Could not load the models.' }); }
});
app.post('/api/ai/disconnect', (_req, res) => { cached.t = 0; res.json(ai.disconnect()); });
app.post('/api/cinema/key', async (req, res) => {
  const k = String(req.body?.tmdb || '').trim();
  if (!k) return res.status(400).json({ error: 'Paste your TMDB API key.' });
  try {
    const r = await fetch(`https://api.themoviedb.org/3/configuration?api_key=${encodeURIComponent(k)}`, { signal: AbortSignal.timeout(10000) });
    if (!r.ok) throw new Error(r.status === 401 ? 'TMDB rejected this key.' : 'TMDB returned an error.');
  } catch (e) { return res.status(400).json({ error: e.message }); }
  saveKey('tmdb', k);
  process.env.TMDB_API_KEY = k;
  cached.t = 0;
  res.json({ ok: true });
});
app.post('/api/keys', async (req, res) => {
  const k = String(req.body?.finnhub || '').trim();
  if (!k) return res.status(400).json({ error: 'Paste your Finnhub key.' });
  try {
    const r = await fetch(`${cfg.finnhubBase}/quote?symbol=SPY&token=${k}`, { signal: AbortSignal.timeout(10000) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.c) throw new Error(r.status === 401 || r.status === 403 ? 'Finnhub rejected this key.' : 'Finnhub returned no price.');
  } catch (e) { return res.status(400).json({ error: e.message }); }
  saveKey('finnhub', k);
  await markets.refreshTrad(TRAD, 0);
  cached.t = 0;
  res.json({ ok: true });
});

// Test-only hook: disabled unless FOXHOLE_TEST=1. Uses the same live feed array and SSE path as real events.
if (process.env.FOXHOLE_TEST === '1') {
  app.post('/__test/event', (req, res) => {
    const b = req.body || {};
    try {
      const ev = addTestEvent({
        title: b.title,
        kind: b.kind,
        layer: b.layer,
        place: b.place,
        lat: b.lat,
        lng: (b.lng != null ? b.lng : b.lon),
        size: b.size,
        sources: b.sources,
      });
      cached.t = 0; cached.v = null;
      res.json({ ok: true, event: ev });
    } catch (e) { res.status(400).json({ error: e.message || 'test event failed' }); }
  });
  console.log('FOXHOLE_TEST=1 test hooks enabled');

  // Test-only hook: pushes a headline through the same publish path as a real source.
  app.post('/__test/feed', (req, res) => {
    const b = req.body || {};
    res.json({ ok: true, item: pushTestHeadline(b) });
  });
}

const dist = path.join(ROOT, 'dist');
if (fs.existsSync(dist)) {
  app.use(express.static(dist));
  // SPA fallback — must not swallow /api/* (e.g. /api/typo), /__test/*, or /stream.
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/') || req.path === '/api' || req.path.startsWith('/__test/') || req.path === '/stream') {
      return res.status(404).json({ error: 'Not found.' });
    }
    next();
  });
  app.get('*', (_req, res) => res.sendFile(path.join(dist, 'index.html')));
} else {
  app.get('/', (_req, res) => res.type('text').send('Foxhole API is running. Run "npm run build" to serve the app here, or use "npm run dev" and open http://localhost:5173'));
}

async function start() {
  startLivePollers();
  startShips();
  startSats();
  startHeadlines();
  startCinema();
  startLiveWatchlist();
  startXFeed();
  await Promise.allSettled([refreshSimple(), markets.refreshTrad(TRAD, 0), markets.refreshCrypto(), refreshSentiment()]);
  // Polling jitter (+/- 20%) avoids thundering-herd alignment across feeds.
  // Recursive setTimeout (not setInterval) so the delay is re-jittered each iteration.
  const schedule = (fn, ms) => { const jitter = () => Math.round(ms + (Math.random() - 0.5) * 0.4 * ms); const loop = () => setTimeout(() => { fn(); loop(); }, jitter()); loop(); };
  schedule(() => refreshSimple().catch(() => {}), 60000);
  schedule(() => markets.refreshTrad(TRAD, 19000).catch(() => {}), 20000);
  schedule(() => markets.refreshCrypto().catch(() => {}), 30000);
  schedule(() => refreshSentiment().catch(() => {}), 90000);
  const gdeltStart = Date.now();
  try {
    await Promise.race([
      refreshGdeltSrc(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('GDELT backfill time limit')), 25000)),
    ]);
    console.log(`GDELT backfill finished in ${((Date.now() - gdeltStart) / 1000).toFixed(1)}s`);
  } catch (e) {
    console.log(`GDELT backfill hit 25s limit; continuing in background`);
  }
  setInterval(refreshGdeltSrc, 300000);
  setInterval(() => {
    const { result, col } = compute();
    if (col.demo) return;
    track.record(result.signals, markets.getQuote, markets.isLivePrice);
    track.settle(markets.getQuote, markets.isLivePrice);
  }, 60000);
  app.listen(cfg.port, cfg.host, () => {
    console.log(`Foxhole running at http://${cfg.host}:${cfg.port}${cfg.demoForced ? '  (demo mode)' : ''}`);
  });
}
start();
