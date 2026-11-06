// X (Twitter) feed via Nitter RSS with Google News fallback.
// Only server side: the browser reads these from our own SSE stream.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseFeedXml, cleanTitle } from './headlines.js';

const REFRESH_MS = 180_000;
const FETCH_MS = 15_000;
const SNAPSHOT_ITEMS = 120;
const MAX_HANDLES = 30;
const UA = 'Foxhole/1.0 (personal project)';

// Jittered poll: ±25% around REFRESH_MS so the 30 nitter RSS fetches do not
// fire in lockstep with the other pollers.
export function xfeedIntervalMs(base = REFRESH_MS) {
  return Math.round(base * (1 + (Math.random() - 0.5) * 0.5));
}

function loadHandles() {
  try {
    const here = path.dirname(fileURLToPath(import.meta.url));
    const raw = fs.readFileSync(path.join(here, '..', 'config', 'x-handles.json'), 'utf8');
    const list = JSON.parse(raw);
    return sanitizeHandles(Array.isArray(list) ? list : []);
  } catch { // intentional: missing or unreadable handles file yields an empty list
    return [];
  }
}

export function sanitizeHandles(list) {
  if (!Array.isArray(list)) return [];
  const out = [];
  const seen = new Set();
  for (const entry of list) {
    if (out.length >= MAX_HANDLES) break;
    const rawHandle = entry && typeof entry === 'object' ? entry.handle : (typeof entry === 'string' ? entry : '');
    const handle = String(rawHandle || '').trim().replace(/^@/, '');
    if (!/^[A-Za-z0-9_]{1,30}$/.test(handle)) continue;
    const key = handle.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const label = entry && typeof entry === 'object' && entry.label ? String(entry.label).trim() : '';
    out.push({ handle, label: label || handle });
  }
  return out;
}

function canonicalUrl(url) {
  const u = String(url || '');
  const m = u.match(/^https?:\/\/(nitter\.net|twitter\.com|www\.twitter\.com)(\/.*)?$/i);
  if (m) return 'https://x.com' + (m[2] || '');
  return u;
}

function fnv1aHex(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

export function normalizeXItem(raw, handle) {
  if (!raw || typeof raw !== 'object') return null;
  const cleanHandle = String(handle || '').trim().replace(/^@/, '');
  if (!/^[A-Za-z0-9_]{1,30}$/.test(cleanHandle)) return null;
  const url = canonicalUrl(raw.url || '');
  if (!/^https?:\/\//i.test(url)) return null;
  const text = cleanTitle(raw.title || raw.text || '');
  if (!text) return null;
  // raw may be a parseFeedXml item ({ts, ...}) or carry a pubDate string.
  const parsedTs = Date.parse(raw.pubDate || '');
  const ts = Number.isFinite(parsedTs)
    ? parsedTs
    : (typeof raw.ts === 'number' && Number.isFinite(raw.ts) ? raw.ts : Date.now());
  const id = 'x:' + fnv1aHex(url + ts);
  return { id, ts, author: '@' + cleanHandle, text, url, srcName: 'x' };
}

export function parseNitterRss(xml, handle) {
  const items = parseFeedXml(xml, 'x');
  const out = [];
  for (const raw of items) {
    const item = normalizeXItem(raw, handle);
    if (item) out.push(item);
  }
  return out;
}

// Loaded once at module init.
export const handles = loadHandles();

let snapshot = { ok: false, updatedAt: 0, items: [] };
let started = false;

export function xFeedSnapshot() {
  const items = snapshot.items.slice().sort((a, b) => b.ts - a.ts).slice(0, SNAPSHOT_ITEMS);
  return { ok: snapshot.ok, updatedAt: snapshot.updatedAt, items };
}

async function fetchHandle(impl, base, entry) {
  const handle = typeof entry === 'string' ? entry : entry.handle;
  const tryFetch = async (url) => {
    const r = await impl(url, { headers: { 'User-Agent': UA, Accept: 'application/rss+xml, application/xml;q=0.9, */*;q=0.8' }, signal: AbortSignal.timeout(FETCH_MS) });
    if (!r || !r.ok) throw new Error('HTTP ' + (r && r.status ? r.status : 'failed'));
    return await r.text();
  };
  try {
    const body = await tryFetch(base + '/' + handle + '/rss');
    return parseNitterRss(body, handle);
  } catch { // intentional: fall back to Google News search RSS for this handle
    const fallbackUrl = 'https://news.google.com/rss/search?q=site:x.com%20' + encodeURIComponent(handle) + '&hl=en-US&gl=US&ceid=US:en';
    try {
      const body = await tryFetch(fallbackUrl);
      return parseNitterRss(body, handle);
    } catch { // intentional: a failed fallback for one handle yields no items for it
      return [];
    }
  }
}

export async function refreshXFeed(fetchImpl) {
  const impl = fetchImpl || fetch;
  const base = (process.env.NITTER_BASE_URL || 'https://nitter.net').replace(/\/+$/, '');
  try {
    const results = await Promise.all(handles.map((entry) => fetchHandle(impl, base, entry)));
    const byUrl = new Map();
    for (const items of results) {
      for (const item of items) {
        if (!byUrl.has(item.url)) byUrl.set(item.url, item);
      }
    }
    const merged = Array.from(byUrl.values()).sort((a, b) => b.ts - a.ts).slice(0, SNAPSHOT_ITEMS);
    snapshot = { ok: merged.length > 0, updatedAt: Date.now(), items: merged };
  } catch { // intentional: refreshXFeed must never reject
    snapshot = { ok: false, updatedAt: Date.now(), items: snapshot.items };
  }
  return xFeedSnapshot();
}

export function startXFeed() {
  if (started) return stopXFeed;
  started = true;
  refreshXFeed().catch(() => { /* intentional: background refresh swallows errors */ });
  let stopped = false;
  let timer;
  const schedule = () => {
    timer = setTimeout(() => {
      if (stopped) return;
      refreshXFeed().catch(() => { /* intentional: background refresh swallows errors */ });
      schedule();
    }, xfeedIntervalMs());
  };
  schedule();
  timer.unref();
  function stopXFeed() {
    if (stopped) return;
    stopped = true;
    clearTimeout(timer);
    started = false;
  }
  return stopXFeed;
}
