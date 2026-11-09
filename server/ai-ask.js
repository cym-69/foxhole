// askAi retrieval tool. Facts vs interpretation separated. No fabrication.
// callRetry in server/ai.js is NOT exported; this module stays rules-only unless a model fn is injected.
import { freshnessOf } from './feeds/stream.js';
const MIN = 60 * 1000;
const OIL_WORDS = ['oil','crude','uso','hormuz','gulf','opec','aramco','energy'];
function clamp(n, lo, hi) { return Math.max(lo, Math.min(hi, n)); }
function factOf(row) {
  if (!row || typeof row !== 'object') return null;
  const title = String(row.title || row.text || '');
  if (!title.trim()) return null;
  const ts = Number(row.ts) || 0;
  if (!ts) return null;
  return { text: title.trim().slice(0, 280), source: String(row.source || row.src || row.srcName || 'unknown'), url: String(row.url || ''), ts };
}
function sortFacts(facts, cap = 8) {
  const seen = new Set(); const out = [];
  for (const f of facts.slice().sort((a,b) => b.ts - a.ts)) {
    const k = f.text + '|' + f.ts; if (seen.has(k)) continue; seen.add(k); out.push(f); if (out.length >= cap) break;
  } return out;
}
export function parseWindowMinutes(question) {
  const q = String(question || '').toLowerCase();
  const m = q.match(/last\s+(\d+)\s*(minute|minutes|min|mins|m|hour|hours|h|day|days|d)/);
  if (!m) return 60;
  const n = clamp(parseInt(m[1], 10) || 60, 1, 10080);
  const u = m[2];
  if (u.startsWith('h')) return clamp(n * 60, 1, 10080);
  if (u.startsWith('d')) return clamp(n * 60 * 24, 1, 10080);
  return n;
}
function rowsFrom(ctx) {
  const out = [];
  if (Array.isArray(ctx && ctx.stream)) {
    for (const r of ctx.stream) { const f = factOf(r); if (f) out.push({ ...f, kind: r.kind || 'event', place: r.place || '' }); }
    return out;
  }
  for (const e of (ctx && ctx.events) || []) { const f = factOf(e); if (f) out.push({ ...f, kind: e.kind || 'event', place: e.place || '' }); }
  for (const e of (ctx && ctx.context) || []) { const f = factOf(e); if (f) out.push({ ...f, kind: e.kind || 'event', place: e.place || '' }); }
  for (const h of (ctx && ctx.headlines) || []) { const f = factOf(h); if (f) out.push({ ...f, kind: 'news', place: String(h.srcName || h.src || '') }); }
  return out;
}
function priceFact(sym, q) {
  if (!q || typeof q.price !== 'number' || !Number.isFinite(q.price)) return null;
  const pct = typeof q.pct === 'number' ? q.pct : null;
  const t = q.ts ? '(' + new Date(q.ts).toISOString() + ')' : '';
  return { text: 'LIVE ' + sym + ': $' + q.price.toFixed(2) + (pct === null ? '' : ', ' + (pct > 0 ? '+' : '') + pct.toFixed(2) + '%') + ' ' + t + ' — sourced from live market snapshot.', source: 'markets snapshot (' + sym + ')', url: '', ts: q.ts || Date.now() };
}
export function handleLastWindow(question, ctx) {
  ctx = ctx || {}; const now = Number(ctx.now) || Date.now();
  const minutes = parseWindowMinutes(question); const cutoff = now - minutes * MIN;
  const rows = rowsFrom(ctx).filter(function(r) { return r.ts >= cutoff; });
  const facts = sortFacts(rows.map(function(r) { return { text: r.text, source: r.source, url: r.url, ts: r.ts }; }), 8);
  const interpretation = facts.length ? 'In the last ' + minutes + ' min, the newest retrieved state rows are ' + facts.length + ' item(s). Treat the count as retrieved, not as a verdict.' : 'No state rows fall inside the last ' + minutes + ' min window. That is the honest answer: the sources returned nothing recent.';
  const uncertainty = facts.length ? 'Retrieval is limited to the latest in-memory state snapshot; older headlines and events will not appear.' : 'Empty window: either a quiet period or a poll gap. Do not read silence as a market verdict.';
  return { facts, interpretation, uncertainty, minutes };
}
export function handleWhyOil(question, ctx) {
  ctx = ctx || {}; const now = Number(ctx.now) || Date.now(); const facts = [];
  const uso = (ctx.trad && ctx.trad.USO) || (ctx.prices && ctx.prices.USO) || null;
  const pf = priceFact('USO', uso); if (pf) facts.push(pf);
  const md = ctx.momentumDensity;
  if (md !== undefined && md !== null && Number.isFinite(Number(md))) {
    facts.push({ text: 'Momentum density in the current GDELT window: ' + Number(md).toFixed(3) + ' — sourced from live GDELT momentum.', source: 'GDELT momentum', url: '', ts: now });
  }
  const related = rowsFrom(ctx).filter(function(r) { const t = (r.text + ' ' + (r.place || '')).toLowerCase(); return OIL_WORDS.some(function(w) { return t.includes(w); }); }).slice(0, 5).map(function(r) { return { text: r.text, source: r.source, url: r.url, ts: r.ts }; });
  for (const r of related) facts.push(r);
  const ordered = sortFacts(facts, 8);
  const pct = uso && typeof uso.pct === 'number' ? uso.pct : null;
  const interpretation = !ordered.length ? 'No live USO quote and no oil-related rows are in the current snapshot, so there is nothing honest to say. Check whether the markets poller is running.' : 'USO is ' + (pct === null ? 'quoted without a pct' : (pct > 0 ? 'up' : pct < 0 ? 'down' : 'flat') + ' ' + Math.abs(pct).toFixed(2) + '%') + ' in the retrieved snapshot. The related rows above are the only causes the retrieval can cite.';
  const uncertainty = 'Price facts come from the live market snapshot; causality is not established by co-occurrence. The momentum figure describes the GDELT window, not an oil-specific signal.';
  return { facts: ordered, interpretation, uncertainty, symbol: 'USO' };
}
function regionWords(place) {
  const STOP = new Set(['the','of','a','an','in','near','over','under','at']);
  return String(place || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(function(w) { return w.length > 2 && !STOP.has(w); });
}
export function handleSimultaneous(question, ctx) {
  ctx = ctx || {}; const now = Number(ctx.now) || Date.now();
  const minutes = parseWindowMinutes(question); const cutoff = now - minutes * MIN;
  const rows = rowsFrom(ctx).filter(function(r) { return r.ts >= cutoff; });
  const facts = sortFacts(rows.map(function(r) { return { text: r.text, source: r.source, url: r.url, ts: r.ts }; }), 8);
  const counts = new Map();
  for (const r of rows) for (const w of regionWords(r.place)) counts.set(w, (counts.get(w) || 0) + 1);
  const shared = Array.from(counts.entries()).filter(function(e) { return e[1] >= 2; }).sort(function(a,b) { return b[1] - a[1]; }).slice(0, 3).map(function(e) { return e[0]; });
  const interpretation = rows.length < 2 ? 'Only ' + rows.length + ' row(s) fall in the same ' + minutes + '-min window, so there is no simultaneity to report.' : shared.length ? 'There are ' + rows.length + ' rows in the window and shared region keywords: ' + shared.join(', ') + '. Simultaneity is a retrieval fact; shared causation is an interpretation.' : 'There are ' + rows.length + ' rows in the same ' + minutes + '-min window but no repeated region keywords in their place fields.';
  const uncertainty = shared.length ? 'Region sharing is keyword overlap on place strings, not verified geo-proximity. Rows can be simultaneous without being related.' : 'Empty shared-region result may mean place fields are absent on news rows, not that events are unrelated.';
  return { facts, interpretation, uncertainty, sharedRegions: shared, minutes };
}
export function classifyQuestion(question) {
  const q = String(question || '').toLowerCase();
  if (/why\b.*\b(oil|uso|crude|energy)\b|\b(oil|uso)\b.*\bmoving\b|why.*moving/.test(q) || (q.includes('oil') && q.includes('why'))) return 'why-oil';
  if (/simultaneous|at the same time|same window|together/.test(q)) return 'simultaneous';
  if (/last|recent|happened|what happened|in the past/.test(q)) return 'last-window';
  return 'general';
}
export async function askAi(question, ctx, opts) {
  const q = String(question || '').trim();
  if (!q) throw new Error('Question is required.');
  ctx = ctx || {}; opts = opts || {};
  const now = Number(ctx.now) || Date.now();
  const kind = classifyQuestion(q);
  let partial;
  if (kind === 'why-oil') partial = handleWhyOil(q, ctx);
  else if (kind === 'simultaneous') partial = handleSimultaneous(q, ctx);
  else partial = handleLastWindow(q, ctx);
  const facts = partial.facts || [];
  const buckets = { fresh: 0, stale: 0, old: 0 };
  for (const f of facts) buckets[freshnessOf(f.ts, now)] += 1;
  let interpretation = partial.interpretation || '';
  if (opts.useModel === true && typeof opts.model === 'function') {
    try {
      const out = await opts.model({ question: q, facts, instructions: 'Answer ONLY from the provided facts. Cite sources. Flag uncertainty. Do not add facts, prices, or events that are not in the facts list.' });
      if (typeof out === 'string' && out.trim()) interpretation = out.trim().slice(0, 800);
    } catch (e) { /* keep rules interpretation on model error */ }
  }
  return { facts, interpretation, uncertainty: partial.uncertainty || '', freshness: { at: now, buckets } };
}
export const ASK_RULES_ONLY = true;
