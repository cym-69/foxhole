// Live headlines feed: RSS 2.0, RSS 1.0 (RDF) and Atom, plus one item per new event.
// Only server side: the browser reads these from our own SSE stream.
import { XMLParser } from 'fast-xml-parser';

const BASE_MS = 5 * 60 * 1000;      // poll every 5 minutes
const STAGGER_MS = 20000;           // sources start 20 s apart
const FETCH_MS = 10000;             // per-request timeout
const MAX_DELAY_MS = 30 * 60 * 1000;
const UA = 'Foxhole/1.0 (personal project)';
const SNAPSHOT_ITEMS = 15;
const SNAPSHOT_EVENTS = 8;
const SEEN_MAX = 3000;
const FIRST_FETCH_PER_SOURCE = 3;
const FIRST_FETCH_HOURS = 6;

const SOURCES = [
  { id: 'bbc', name: 'BBC World', url: 'https://feeds.bbci.co.uk/news/world/rss.xml' },
  { id: 'aljazeera', name: 'Al Jazeera', url: 'https://www.aljazeera.com/xml/rss/all.xml' },
  { id: 'dw', name: 'DW', url: 'https://rss.dw.com/rdf/rss-en-all' },
  { id: 'guardian', name: 'Guardian World', url: 'https://www.theguardian.com/world/rss' },
  { id: 'npr', name: 'NPR World', url: 'https://feeds.npr.org/1004/rss.xml' },
  { id: 'bbcbiz', name: 'BBC Business', url: 'https://feeds.bbci.co.uk/news/business/rss.xml' },
  { id: 'marketwatch', name: 'MarketWatch', url: 'https://feeds.content.dowjones.io/public/rss/mw_topstories' },
];

// FOXHOLE_RSS_URLS=host-a,host-b replaces the list (names = host name).
function sourceList() {
  const env = String(process.env.FOXHOLE_RSS_URLS || '').split(',').map((s) => s.trim()).filter(Boolean);
  if (!env.length) return SOURCES.slice();
  return env.map((url, i) => {
    const host = url.replace(/^https?:\/\//, '').split('/')[0];
    return { id: 'env' + i, name: host, url };
  });
}

// Event kind -> short source label for a feed item.
const EVENT_SRC = {
  quake: 'Quake', storm: 'Storm', wildfire: 'Fire', volcano: 'Fire', flood: 'Storm', drought: 'Storm',
  cluster: 'Aircraft', blockade: 'Sanction', sanction: 'Sanction', conflict: 'Conflict', crypto: 'Crypto',
};

const parser = new XMLParser({
  ignoreAttributes: false, attributeNamePrefix: '@_', parseTagValue: true, trimValues: true,
  isArray: (name) => ['item', 'entry'].includes(name),
});

const ENTITIES = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'", '#x27': "'", hellip: '\u2026', mdash: '\u2014', ndash: '\u2013', rsquo: '\u2019', lsquo: '\u2018', rdquo: '\u201D', ldquo: '\u201C', eacute: '\u00E9',
};
function decodeEntities(s) {
  return String(s).replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (m, k) => {
    const k2 = k.toLowerCase();
    if (ENTITIES[k2] !== undefined) return ENTITIES[k2];
    if (k2[0] === '#') {
      const n = k2[1] === 'x' ? parseInt(k2.slice(2), 16) : parseInt(k2.slice(1), 10);
      return Number.isFinite(n) && n > 0 ? String.fromCodePoint(n) : m;
    }
    return m;
  });
}
// Strip tags, decode entities, collapse spaces, cut to 160 characters.
export function cleanTitle(raw) {
  let t = decodeEntities(String(raw == null ? '' : raw).replace(/<[^>]*>/g, ' '));
  t = t.replace(/\s+/g, ' ').trim();
  return t.length > 160 ? t.slice(0, 159).trimEnd() + '\u2026' : t;
}
function asArray(v) { return Array.isArray(v) ? v : (v == null ? [] : [v]); }
function firstText(v) { const a = asArray(v); return a.length ? a[0] : ''; }
function atomLink(entry) {
  const links = asArray(entry.link).filter((l) => typeof l === 'object');
  const abs = links.find((l) => l['@_rel'] === 'alternate' && /^https?:\/\//.test(l['@_href'] || ''))
    || links.find((l) => /^https?:\/\//.test(l['@_href'] || ''));
  return (abs && abs['@_href']) || (typeof entry.link === 'string' && /^https?:\/\//.test(entry.link) ? entry.link : '');
}
function parseTime(v) {
  const t = Date.parse(String(v || ''));
  return Number.isFinite(t) ? t : Date.now();
}

// Turn one parsed feed document into items: {id, ts, text, url}.
export function parseFeedXml(xml, src) {
  let doc;
  try { doc = parser.parse(xml); } catch { return []; }
  if (!doc || typeof doc !== 'object') return [];
  const rawItems = [];
  const push = (it, atom) => {
    if (!it || typeof it !== 'object') return;
    const title = firstText(it.title) ?? it.title;
    if (title == null) return;
    const text = cleanTitle(typeof title === 'object' ? title['#text'] ?? title : title);
    if (!text) return;
    const url = atom ? atomLink(it) : firstText(it.link ?? '');
    if (!/^https?:\/\//i.test(String(url || ''))) return; // javascript: links are dropped
    const key = firstText(it.guid) || String(url);
    const ts = parseTime(atom ? (firstText(it.updated) ?? firstText(it.published) ?? firstText(it.pubDate)) : it.pubDate);
    rawItems.push({ id: src + ':' + String(key), ts, text, url });
  };
  const rss = doc.rss?.channel ?? doc.channel;
  if (rss) asArray(rss.item).forEach((it) => push(it, false));
  const rdf = doc['rdf:RDF'] ?? doc.RDF;
  if (rdf) asArray(rdf.item).forEach((it) => push(it, false));
  const feed = doc.feed;
  if (feed) asArray(feed.entry).forEach((it) => push(it, true));
  if (!rss && !rdf && !feed) {
    for (const v of Object.values(doc)) {
      if (v && typeof v === 'object' && asArray(v.item).length) asArray(v.item).forEach((it) => push(it, false));
    }
  }
  return rawItems;
}

// One feed item, newest last in the list.
function makeItem({ id, ts, src, srcName, kind, text, url, eventId, tickers }) {
  return { id: String(id), ts: Number(ts) || Date.now(), src: src || 'test', srcName: srcName || 'Foxhole', kind: kind || 'news', text: cleanTitle(text), url: url || '', eventId: eventId || null, tickers: tickers || [] };
}

// Item from a live event: same shape, same code path as news.
export function eventToFeedItem(e) {
  const kind = String(e.kind || 'event');
  return makeItem({
    id: 'event:' + e.id,
    ts: e.ts || Date.now(),
    src: e.src || 'event',
    srcName: EVENT_SRC[kind] || 'Event',
    kind,
    text: e.title || e.place || 'Event',
    url: '',
    eventId: e.id,
    tickers: (e.assets || []).map((a) => a.a),
  });
}

const sources = sourceList().map((s) => ({ ...s, ok: false, error: '', count: 0, lastFetch: null, fails: 0, etag: '', lastModified: '', firstDone: false }));
const items = [];      // feed items, newest last
const seen = new Set(); // guids or links already kept, capped
const fedEvents = new Set(); // event ids already pushed to the feed
const listeners = new Set();

export function onHeadline(fn) { listeners.add(fn); return () => listeners.delete(fn); }
function publish(item) {
  items.push(item);
  if (items.length > 40) items.splice(0, items.length - 40);
  for (const fn of listeners) { try { fn(item); } catch { /* intentional: listener failures must not break publish */ } }
}

export function pushTestHeadline(body) {
  const b = body || {};
  const item = makeItem({
    id: 'test:' + Date.now() + ':' + Math.random().toString(36).slice(2, 7),
    ts: Date.now(),
    src: 'test', srcName: b.srcName || 'Test', kind: b.kind || 'news',
    text: b.text || 'Test headline', url: /^https?:\/\//i.test(String(b.url || '')) ? b.url : '', eventId: null, tickers: b.tickers || [],
  });
  publish(item);
  return item;
}

export function headlineItems() { return items.slice(-SNAPSHOT_ITEMS); }
export function headlineRaw() { return items.slice(); }export function headlineStatus() {
  return {
    status: sources.some((s) => s.ok) ? 'ok' : (sources.length ? 'error' : 'none'),
    sources: sources.map((s) => ({ id: s.id, name: s.name, ok: s.ok, count: s.count, lastFetch: s.lastFetch, error: s.error })),
  };
}

async function probe(s) {
  const r = await fetch(s.url, { headers: { 'User-Agent': UA, Accept: 'application/rss+xml, application/xml;q=0.9, */*;q=0.8' }, signal: AbortSignal.timeout(FETCH_MS) });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  const body = await r.text();
  if (!/<item[\s>]/.test(body) && !/<entry[\s>]/.test(body)) throw new Error('no <item or <entry in body');
  return { body, etag: r.headers.get('etag') || '', lastModified: r.headers.get('last-modified') || '' };
}

async function pollSource(s) {
  const headers = { 'User-Agent': UA, Accept: 'application/rss+xml, application/xml;q=0.9, */*;q=0.8' };
  if (s.etag) headers['If-None-Match'] = s.etag;
  if (s.lastModified) headers['If-Modified-Since'] = s.lastModified;
  const r = await fetch(s.url, { headers, signal: AbortSignal.timeout(FETCH_MS) });
  if (r.status === 304) { s.ok = true; s.error = ''; s.lastFetch = Date.now(); return; }
  if (!r.ok) throw new Error('HTTP ' + r.status);
  const body = await r.text();
  if (!/<item[\s>]/.test(body) && !/<entry[\s>]/.test(body)) throw new Error('no <item or <entry in body');
  s.etag = r.headers.get('etag') || '';
  s.lastModified = r.headers.get('last-modified') || '';
  s.ok = true; s.error = ''; s.lastFetch = Date.now();
  ingest(s, body);
}

// Turn one body into items, then apply the dedupe and first-fetch rules.
export function ingest(s, body) {
  const fresh = parseFeedXml(body, s.id);
  let kept = fresh;
  if (!s.firstDone) {
    const cutoff = Date.now() - FIRST_FETCH_HOURS * 3600000;
    kept = fresh.filter((x) => x.ts >= cutoff).sort((a, b) => b.ts - a.ts).slice(0, FIRST_FETCH_PER_SOURCE);
  }
  s.firstDone = true;
  let added = 0;
  for (const it of kept) {
    if (seen.has(it.id)) continue;
    if (seen.size >= SEEN_MAX) { const oldest = seen.values().next().value; seen.delete(oldest); }
    seen.add(it.id);
    publish(makeItem({ ...it, src: s.id, srcName: s.name, kind: 'news' }));
    added++;
  }
  s.count = added || s.count;
  return added;
}

function startSource(s, index) {
  setTimeout(async () => {
    const run = async () => {
      try { await pollSource(s); s.fails = 0; }
      catch (e) {
        s.ok = false; s.error = e.message; s.fails++;
        setTimeout(run, Math.min(MAX_DELAY_MS, BASE_MS * 2 ** s.fails));
        return;
      }
      setTimeout(run, BASE_MS);
    };
    run();
  }, index * STAGGER_MS);
}

// New event -> one item, using the same publish path as headlines.
export function feedEvent(e) {
  if (!e || fedEvents.has(e.id)) return;
  fedEvents.add(e.id);
  publish(eventToFeedItem(e));
}

// At start: the 8 newest existing events go into the snapshot list.
export function seedEvents(events) {
  const fresh = (events || []).slice().sort((a, b) => (b.ts || 0) - (a.ts || 0)).slice(0, SNAPSHOT_EVENTS);
  for (const e of fresh) if (!fedEvents.has(e.id)) { fedEvents.add(e.id); publish(eventToFeedItem(e)); }
}

export function startHeadlines() {
  (async () => {
    for (const s of sources) {
      try { await probe(s); s.ok = true; s.error = ''; s.lastFetch = Date.now(); s.count = 0; }
      catch (e) {
        s.ok = false; s.error = e.message;
        console.log(`headlines: dropped ${s.id} (${s.url}) - ${e.message}`);
      }
    }
  })().finally(() => {
    for (const [i, s] of sources.entries()) if (s.ok) startSource(s, i);
    else { s.fails = 1; }
  });
}

