// Located conflict, blockade, sanction, strike and drought events from GDELT's raw 15-minute event files.
// Free, no key. Replaces the GEO API, which now returns 404.
// Column positions follow the GDELT 2.0 event table. If GDELT ever changes them, edit COL only.
import zlib from 'node:zlib';

const UA = { 'User-Agent': 'Foxhole/0.1 (personal dashboard)' };
const BASES = ['https://data.gdeltproject.org/gdeltv2/', 'http://data.gdeltproject.org/gdeltv2/'];
const WINDOW_FILES = 24;   // 6 hours of files kept
export const COL = { baseCode: 27, rootCode: 28, mentions: 31, sources: 32, geoType: 51, geoName: 52, lat: 56, lng: 57, added: 59, url: 60, minCols: 58 };

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
  } catch { return ''; }
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
      try { await loadFile(x); } catch { /* missing file, skip */ }
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
