// Normalized event stream helpers: stable id, dedupe, cap, freshness.
const CAP = 300;
const FRESH_MS = 24 * 3600 * 1000;
const STALE_MS = 72 * 3600 * 1000;
export function freshnessOf(ts, now = Date.now()) {
  const age = now - Number(ts || now);
  if (age <= FRESH_MS) return 'fresh';
  if (age <= STALE_MS) return 'stale';
  return 'old';
}
function str(v) { return typeof v === 'string' ? v : ''; }
export function normalizeEvent(e, now = Date.now()) {
  if (!e || typeof e !== 'object') return null;
  const id = str(e.id);
  if (!id) return null;
  const ts = Number(e.ts) || now;
  return {
    id,
    kind: str(e.kind) || 'event',
    title: str(e.title) || str(e.place) || 'Event',
    place: str(e.place) || str(e.title) || '',
    lat: typeof e.lat === 'number' ? e.lat : null,
    lng: typeof e.lng === 'number' ? e.lng : (typeof e.lon === 'number' ? e.lon : null),
    ts,
    source: str(e.src || e.source) || 'unknown',
    url: str(e.url) || '',
    fresh: freshnessOf(ts, now),
    provider: str(e.src || e.source) || 'unknown',
  };
}
export function dedupeEvents(list, cap = CAP) {
  const seen = new Set();
  const out = [];
  for (const e of Array.isArray(list) ? list : []) {
    const n = e && typeof e.id === 'string' && e.fresh ? e : normalizeEvent(e);
    if (!n) continue;
    if (seen.has(n.id)) continue;
    seen.add(n.id);
    out.push(n);
  }
  out.sort((a, b) => (b.ts || 0) - (a.ts || 0));
  return out.slice(0, cap);
}
export function buildStream({ events = [], context = [], headlines = [] } = {}, now = Date.now()) {
  const fromEvents = (events || []).map((e) => normalizeEvent(e, now));
  const fromContext = (context || []).map((e) => normalizeEvent(e, now));
  const fromHeadlines = (headlines || []).map((h) => normalizeEvent({
    id: 'headline:' + String(h.id || ''),
    kind: h.kind || 'news',
    title: h.text || h.title || 'Headline',
    place: h.srcName || h.src || '',
    lat: null,
    lng: null,
    ts: h.ts,
    src: h.src || 'headlines',
    url: h.url || '',
  }, now));
  return dedupeEvents([...fromEvents, ...fromContext, ...fromHeadlines], CAP);
}
