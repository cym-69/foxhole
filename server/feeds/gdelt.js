// Located conflict, blockade, sanction, strike and drought events from GDELT's raw 15-minute event files.
// Free, no key. Replaces the GEO API, which now returns 404.
// Column positions follow the GDELT 2.0 event table. If GDELT ever changes them, edit COL only.
import zlib from 'node:zlib';

const UA = { 'User-Agent': 'Foxhole/0.1 (personal dashboard)' };
const BASES = ['https://data.gdeltproject.org/gdeltv2/', 'http://data.gdeltproject.org/gdeltv2/'];
const WINDOW_FILES = 24;   // 6 hours of files kept
export const COL = { baseCode: 27, rootCode: 28, mentions: 31, sources: 32, geoType: 51, geoName: 52, lat: 56, lng: 57, added: 59, url: 60, tone: 34, minCols: 58 };

const LAYER = { conflict: 'conflict', blockade: 'trade', sanction: 'policy', strike: 'trade', drought: 'nature' };

// Whole-word relevance list (single array). Optional trailing "s" allowed.
export const GDELT_WORDS = [
  'oil', 'gas', 'energy', 'pipeline', 'refinery', 'opec', 'fuel', 'diesel',
  'sanction', 'tariff', 'embargo', 'blockade', 'strait', 'shipping', 'tanker',
  'port', 'houthi', 'red sea', 'hormuz', 'suez', 'taiwan', 'chip', 'semiconductor',
  'grain', 'wheat', 'corn', 'harvest', 'airline', 'airport', 'missile', 'drone',
  'strike', 'attack', 'ceasefire', 'truce', 'war', 'nuclear', 'military',
  'drought', 'flood', 'famine', 'wildfire',
];
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
export const GDELT_RE = new RegExp(GDELT_WORDS.map((w) => `\\b${esc(w)}s?\\b`).join('|'), 'i');

export function relevant(title, url, kind) {
  if (kind === 'sanction' || kind === 'blockade') return true;
  return GDELT_RE.test(`${title || ''} ${url || ''}`.toLowerCase());
}
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));

// CAMEO codes. Fighting (19, 20) and bombings only. Crime-type assaults (18x) are skipped on purpose.
// Strike (base 19x but work-stoppage wording) and drought (154) are
// classified by a keyword pass on the row so port-strike, freight and
// midwest-crop rules can fire from GDELT, not just demo/EONET.
export function kindOf(root, base, title = '') {
  if (base === '191') return 'blockade';
  if ((root === '19') || root === '20' || base === '183') {
    return /\b(strike|dockwork|longshore|walkout)\b/i.test(title) ? 'strike' : 'conflict';
  }
  if (base === '163' || base === '172') return 'sanction';
  if (root === '15') return 'drought';
  return null;
}

const parseTs = (s) => {
  const m = /^(\d{4})(\d\d)(\d\d)(\d\d)(\d\d)(\d\d)$/.exec(s || '');
  return m ? Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]) : Date.now();
};

export function parseExport(text) {
  const rows = [];
  for (const line of text.split('\n')) {
    if (!line) continue;
    const c = line.split('\t');
    if (c.length < COL.minCols) continue;
    const url = (c[COL.url] || '').trim();
    const kind = kindOf(c[COL.rootCode], c[COL.baseCode], `${slugTitle(url)} ${url}`);
    if (!kind) continue;
    if (!['3', '4', '5'].includes(c[COL.geoType])) continue; // skip country-level centroids
    const lat = parseFloat(c[COL.lat]);
    const lng = parseFloat(c[COL.lng]);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    rows.push({
      kind, lat, lng, name: (c[COL.geoName] || '').split(',')[0].trim(),
      mentions: Number(c[COL.mentions]) || 0, sources: Number(c[COL.sources]) || 0,
      ts: parseTs((c[COL.added] || '').trim()), url,
      tone: Number(c[COL.tone])||0,
    });
  }
  return rows;
}

// Make a readable line out of the article address, when it has one.
export function slugTitle(url) {
  try {
    const seg = new URL(url).pathname.split('/').filter(Boolean).pop() || '';
    const t = decodeURIComponent(seg).replace(/\.(html?|php|aspx?|shtml)$/i, '').replace(/[-_+]+/g, ' ').replace(/\b\d{5,}\b/g, '').replace(/\s+/g, ' ').trim();
    const words = t.split(' ');
    if (words.length < 4 || t.length < 20 || /[%=]/.test(t) || (t.match(/[a-z]/gi) || []).length < t.length * 0.7) return '';
    const cleaned = t.replace(/^[^a-zA-Z]+/, '');
    if (!cleaned) return '';
    return (cleaned[0].toUpperCase() + cleaned.slice(1)).slice(0, 120);
  } catch { /* intentional: unparseable URL → no title */ return ''; }
}

// Group rows by kind and half-degree cell. Size comes from how many articles mention it.
export function aggregate(rows) {
  const cells = new Map();
  for (const r of rows) {
    const rl = Math.round(r.lat * 2) / 2;
    const rg = Math.round(r.lng * 2) / 2;
    const key = `${r.kind}:${rl},${rg}`;
    const c = cells.get(key) || { key, kind: r.kind, mentions: 0, sources: 0, ts: 0, best: r };
    c.mentions += r.mentions; c.sources += r.sources; c.ts = Math.max(c.ts, r.ts);
    if (r.mentions > c.best.mentions) c.best = r;
    cells.set(key, c);
  }
  const out = [];
  for (const c of cells.values()) {
    if (c.sources < 3 || c.mentions < 10) continue; // too thin to trust
    const place = c.best.name || 'unknown place';
    const sl = slugTitle(c.best.url);
    if (!sl) continue; // drop fallback titles
    const title = sl;
    if (!GDELT_RE.test(`${title} ${c.best.url}`.toLowerCase())) continue;
    out.push({
      id: `gdelt:${c.key}`, kind: c.kind, layer: LAYER[c.kind],
      title, place,
      lat: c.best.lat, lng: c.best.lng,
      size: clamp((Math.log10(c.mentions + 1) - 1) / 2.5), // 100 mentions = 0.4, 1000 = 0.8
      sources: Math.min(20, c.sources), ts: c.ts, src: 'gdelt', _m: c.mentions,
    });
  }
  const top = [];
  for (const kind of Object.keys(LAYER)) top.push(...out.filter((e) => e.kind === kind).sort((a, b) => b._m - a._m).slice(0, 30));
  return top.map(({ _m, ...e }) => e);
}

// Read the first file out of a zip (GDELT files hold exactly one).
export function unzipFirst(buf) {
  let e = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) if (buf.readUInt32LE(i) === 0x06054b50) { e = i; break; }
  if (e < 0) throw new Error('Not a zip file');
  const cd = buf.readUInt32LE(e + 16);
  if (buf.readUInt32LE(cd) !== 0x02014b50) throw new Error('Bad zip directory');
  const method = buf.readUInt16LE(cd + 10);
  const csize = buf.readUInt32LE(cd + 20);
  const lho = buf.readUInt32LE(cd + 42);
  const start = lho + 30 + buf.readUInt16LE(lho + 26) + buf.readUInt16LE(lho + 28);
  const data = buf.subarray(start, start + csize);
  return method === 0 ? data : zlib.inflateRawSync(data);
}

export function stepBack(ts) {
  const d = new Date(Date.UTC(+ts.slice(0, 4), +ts.slice(4, 6) - 1, +ts.slice(6, 8), +ts.slice(8, 10), +ts.slice(10, 12), +ts.slice(12, 14)) - 15 * 60000);
  return d.toISOString().replace(/[-:T]/g, '').slice(0, 14);
}

let base = BASES[0];
async function fetchBuf(path, ms = 60000) {
  let last;
  for (const b of [base, ...BASES.filter((x) => x !== base)]) {
    try {
      const r = await fetch(b + path, { headers: UA, signal: AbortSignal.timeout(ms) });
      if (!r.ok) throw new Error(`HTTP ${r.status} for ${path}`);
      base = b;
      return Buffer.from(await r.arrayBuffer());
    } catch (e) { last = e; }
  }
  throw last;
}

const win = new Map(); // file timestamp -> rows
let backfilled = false;

async function loadFile(ts) {
  const text = unzipFirst(await fetchBuf(`${ts}.export.CSV.zip`)).toString('utf8');
  win.set(ts, parseExport(text));
  for (const k of [...win.keys()].sort().reverse().slice(WINDOW_FILES)) win.delete(k);
}
async function backfill(ts) {
  const targets = [];
  let t = ts;
  for (let i = 1; i < WINDOW_FILES; i++) {
    t = stepBack(t);
    targets.push(t);
  }
  for (let i = 0; i < targets.length; i += 3) {
    await Promise.all(targets.slice(i, i + 3).map(async (x) => {
      if (win.has(x)) return;
      try { await loadFile(x); } catch (e) { /* intentional empty catch: backfill skips missing/unavailable files; refreshGdelt still surfaces lastupdate failures */ if (e && e.code !== 'ENOENT') console.warn(`gdelt backfill skipped ${x}: ${e.message}`); }
    }));
  }
}

export async function refreshGdelt() {
  const lu = (await fetchBuf('lastupdate.txt', 20000)).toString('utf8');
  const parts = lu.split('\n').map((l) => l.trim().split(/\s+/)).find((p) => p[2] && p[2].includes('.export.CSV.zip'));
  if (!parts) throw new Error('lastupdate.txt had no event file in it');
  const ts = parts[2].split('/').pop().slice(0, 14);
  if (!win.has(ts)) await loadFile(ts);
  if (!backfilled) { backfilled = true; await backfill(ts); }
  return aggregate([...win.values()].flat());
}

 // Round 11: per-asset momentum/density from real GDELT tone+volume history (6h window, 24x15min files).
 // Honest: no fake 24h from 6h; empty snapshot when the window is empty (demo/offline).
 const MOMENTUM_ASSETS = [
   { asset: 'USO', re: /\b(oil|gas|energy|pipeline|refinery|opec|fuel|diesel|aramco)\b|riyadh|gulf|hormuz/i },
   { asset: 'STNG', re: /\b(shipping|tanker|strait|blockade|port|houthi)\b|hormuz|suez|red sea/i },
   { asset: 'GLD', re: /\b(war|missile|attack|military|nuclear|ceasefire|truce)\b|gaza|ukraine|russia|taiwan|korea/i },
   { asset: 'WEAT', re: /\b(grain|wheat|corn|harvest|drought|flood|famine)\b|ukraine|black sea/i },
   { asset: 'ITA', re: /\b(airline|airport|missile|drone|military|attack|defense)\b|taiwan|chip|semiconductor|nvidia/i },
 ];
 export function momentumSnapshot(winMap, now = Date.now()) {
   const keys = winMap instanceof Map ? [...winMap.keys()].sort() : winMap && typeof winMap === 'object' ? Object.keys(winMap).sort() : [];
   const rowsByFile = [];
   if (winMap instanceof Map) { for (const k of keys) rowsByFile.push(winMap.get(k) || []); }
   else if (winMap && typeof winMap === 'object') { for (const k of keys) rowsByFile.push(winMap[k] || []); }
   if (!rowsByFile.length || rowsByFile.every((r) => !r.length)) {
     return { at: now, spanHours: 6, buckets: 24, empty: true, rows: 0, assets: {}, note: 'No GDELT history upstream' };
   }
   const files = rowsByFile;
   const buckets = Array.from({ length: 24 }, (_, i) => {
     const fi = Math.max(0, files.length - 24 + i);
     const rows = files[fi] || [];
     let mentions = 0, toneW = 0;
     for (const r of rows) { mentions += r.mentions || 0; toneW += (r.tone || 0) * (r.mentions || 0); }
     return { i, mentions, tone: mentions ? toneW / mentions : 0, rows: rows.length };
   });
   const assets = {};
   for (const { asset, re } of MOMENTUM_ASSETS) {
     let mentions = 0, toneW = 0, rows = 0;
     const spark = [];
     for (let i = 0; i < 24; i++) {
       const fi = Math.max(0, files.length - 24 + i);
       const fr = files[fi] || [];
       let m = 0;
       for (const r of fr) {
         const hay = `${r.name || ''} ${r.url || ''} ${r.kind || ''}`.toLowerCase();
         if (!re.test(hay)) continue;
         const men = r.mentions || 0;
         m += men; toneW += (r.tone || 0) * men; mentions += men; rows++;
       }
       spark.push(m);
     }
     const toneAvg = mentions ? toneW / mentions : 0;
     const score = mentions > 0 ? Number((Math.min(1, Math.log10(mentions + 1) / 4) * 100 + Math.max(-20, Math.min(20, toneAvg * 2))).toFixed(1)) : 0;
     assets[asset] = { mentions, rows, tone: Number(toneAvg.toFixed(2)), score, spark, dir: toneAvg < -2 ? -1 : 1 };
   }
   const totalRows = files.reduce((n, f) => n + (f?.length || 0), 0);
   return { at: now, spanHours: 6, bucketCount: 24, empty: false, rows: totalRows, assets, buckets, note: 'GDELT tone+volume, last 6h' };
 }
 export function momentumFromWindow(now = Date.now()) { return momentumSnapshot(win, now); }
 