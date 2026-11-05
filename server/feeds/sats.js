import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { live } from './live.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const CACHE_DIR = path.resolve(here, '..', 'cache');
const CACHE_FILE = path.join(CACHE_DIR, 'sats.json');
const MAX_AGE = 3 * 60 * 60 * 1000; // fetch at most every 3 hours
const UA = 'Foxhole/1.0 (personal project)';
export const SATS_LIMIT = 150;

// Stations first, so the 150 cap keeps the interesting ones.
export const SAT_GROUPS = [
  { id: 'stations', url: 'https://celestrak.org/NORAD/elements/gp.php?GROUP=stations&FORMAT=tle' },
  { id: 'resource', url: 'https://celestrak.org/NORAD/elements/gp.php?GROUP=resource&FORMAT=tle' },
];

live.sats = { status: 'waiting', lastUpdated: null, error: '', data: [] };

const log = (m) => console.log('sats: ' + m);

// 3-line sets: name, then "1 ..." and "2 ...". Returns null when the text is not that format.
export function parseTle(text) {
  if (typeof text !== 'string' || !text.trim()) return null;
  const lines = text.split(/\r?\n/);
  const out = [];
  for (let i = 0; i + 2 < lines.length + 1; i++) {
    const name = (lines[i] || '').trim();
    const l1 = (lines[i + 1] || '').trim();
    const l2 = (lines[i + 2] || '').trim();
    if (!l1.startsWith('1 ') || !l2.startsWith('2 ') || !name) continue;
    out.push({ name, line1: l1, line2: l2 });
    i += 2;
  }
  return out.length ? out : null;
}

export function readCache() {
  try {
    const j = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
    if (!j || !Array.isArray(j.sats) || typeof j.at !== 'number') return null;
    return j;
  } catch { return null; }
}

function writeCache(sats) {
  try {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
    fs.writeFileSync(CACHE_FILE, JSON.stringify({ at: Date.now(), sats }, null, 1));
  } catch (e) { log('could not write cache: ' + e.message); }
}

async function fetchGroup(g) {
  const r = await fetch(g.url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(30000) });
  if (!r.ok) throw new Error('HTTP ' + r.status + ' from ' + g.id);
  const sets = parseTle(await r.text());
  if (!sets) throw new Error(g.id + ' did not return 3-line TLE sets');
  return sets;
}

// Cache-first. Fetches at most every 3 hours. A failed group is reported and skipped.
// options.force ignores the 3 hour cache age (used by tests).
export async function fetchSats(options = {}) {
  const notes = [];
  const force = Boolean(options.force);
  const cached = readCache();
  const age = cached ? Date.now() - cached.at : Infinity;
  if (!force && cached && age < MAX_AGE) {
    live.sats.data = cached.sats.slice();
    live.sats.status = 'ok';
    live.sats.error = '';
    live.sats.lastUpdated = cached.at;
    return { sats: cached.sats, notes: ['cache is ' + Math.round(age / 60000) + ' minutes old, no fetch'] };
  }
  const sats = [];
  for (const g of SAT_GROUPS) {
    try { sats.push(...await fetchGroup(g)); }
    catch (e) { notes.push('skipped ' + g.id + ': ' + e.message); }
  }
  if (!sats.length && cached) {
    notes.push('fetch failed, using the cached set');
    live.sats.data = cached.sats.slice();
    live.sats.status = 'stale';
    live.sats.error = notes.join('; ');
    live.sats.lastUpdated = cached.at;
    return { sats: cached.sats, notes };
  }
  if (!sats.length) {
    live.sats.status = 'error';
    live.sats.error = notes.join('; ') || 'no TLE data';
    return { sats: [], notes };
  }
  writeCache(sats);
  live.sats.data = sats;
  live.sats.status = 'ok';
  live.sats.error = '';
  live.sats.lastUpdated = Date.now();
  return { sats, notes };
}

export function satsRows() { return (live.sats.data || []).slice(0, SATS_LIMIT); }

export function startSats() {
  const run = async () => {
    const res = await fetchSats();
    for (const n of res.notes) log(n);
    log(`${live.sats.data.length} TLE sets, status ${live.sats.status}`);
  };
  run().catch((e) => { live.sats.status = 'error'; live.sats.error = e.message; });
  setInterval(() => { fetchSats().catch(() => {}); }, MAX_AGE);
}
