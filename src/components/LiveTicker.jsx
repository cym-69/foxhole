import { useCallback, useEffect, useMemo, useState } from 'react';
import { ago, price, pct } from '../lib/format.js';

// S6: seamless slow-scroll ticker fed by REAL data only.
//   Markets: /api/state  -> trad/crypto { sym, price, pct(24h), ts, demo, label, kind }
//   Events/headlines: /api/events/stream (S1 normalized) -> { id, title, provider, ts, fresh }
// Never fabricate prices: only API values are rendered. Empty/error is honest.

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function freshnessLabel(ts, fresh, now) {
  const age = now - Number(ts || 0);
  if (fresh === 'old') return 'old';
  if (Number.isFinite(age) && age > 72 * 3600 * 1000) return 'old';
  if (fresh === 'stale') return 'stale';
  if (Number.isFinite(age) && age > 24 * 3600 * 1000) return 'stale';
  return 'fresh';
}

function dedupeItems(items) {
  const seen = new Set();
  const out = [];
  for (const it of items || []) {
    if (!it || !it.id || seen.has(it.id)) continue;
    seen.add(it.id);
    out.push(it);
  }
  return out;
}

// Build ticker items from /api/state payload. Markets only (with a real price).
function marketsFromState(state, now) {
  const rows = [];
  if (!state || typeof state !== 'object') return rows;
  const pools = [
    { bag: state.trad, provider: 'finnhub' },
    { bag: state.crypto, provider: 'coingecko' },
  ];
  for (const { bag, provider } of pools) {
    if (!bag || typeof bag !== 'object') continue;
    for (const [sym, q] of Object.entries(bag)) {
      if (!q || typeof q !== 'object') continue;
      const p = num(q.price);
      if (p == null || p <= 0) continue; // NEVER fabricate a price: skip non-numeric.
      const rawPct = num(q.pct ?? q.d24h);
      const ts = num(q.ts) || now;
      rows.push({
        id: 'mkt:' + sym,
        kind: 'market',
        sym,
        label: q.label || sym,
        price: p,
        pct: rawPct,
        ts,
        provider: q.demo ? 'demo' : provider,
        demo: q.demo === true,
        fresh: freshnessLabel(ts, null, now),
      });
    }
  }
  // Sort: markets by |pct| desc (null pct last, stable by sym).
  rows.sort((a, b) => {
    const da = a.pct == null ? -1 : Math.abs(a.pct);
    const db = b.pct == null ? -1 : Math.abs(b.pct);
    if (db !== da) return db - da;
    return String(a.sym).localeCompare(String(b.sym));
  });
  return rows;
}

// Normalize helpers — tolerate both S1 normalized shape and legacy shapes.
function normalizeStreamItem(raw, now) {
  if (!raw || typeof raw !== 'object') return null;
  const id = typeof raw.id === 'string' && raw.id ? raw.id : (raw.id != null ? String(raw.id) : null);
  if (!id) return null;
  const title = (typeof raw.title === 'string' && raw.title) || (typeof raw.text === 'string' && raw.text) || (typeof raw.place === 'string' && raw.place) || 'Event';
  const provider = raw.provider || raw.src || raw.srcName || raw.source || 'unknown';
  const ts = num(raw.ts) || now;
  const fresh = raw.fresh || null;
  const impact = num(raw.impact ?? raw.size);
  return { id: String(id), title, provider: String(provider), ts, fresh, impact };
}

function eventsFromStream(list, now) {
  const rows = (Array.isArray(list) ? list : []).map((e) => normalizeStreamItem(e, now)).filter(Boolean);
  // Also collapse near-duplicates (same story from overlapping providers) by
  // normalized title, keeping the highest-impact copy — honest, never fabricated.
  const byTitle = new Map();
  for (const r of rows) {
    const key = String(r.title || '').trim().toLowerCase().replace(/\s+/g, ' ').slice(0, 110) + '|' + (r.provider === 'unknown' ? '' : r.provider);
    const prev = byTitle.get(key);
    const score = (r.impact == null ? -Infinity : r.impact) + (r.ts || 0) / 1e15;
    const pScore = prev ? ((prev.impact == null ? -Infinity : prev.impact) + (prev.ts || 0) / 1e15) : -Infinity;
    if (!prev || score > pScore) byTitle.set(key, r);
  }
  const deduped = dedupeItems([...byTitle.values()]);
  // Prioritize: high-impact first (numeric impact desc), then newest.
  deduped.sort((a, b) => {
    const ia = a.impact == null ? -Infinity : a.impact;
    const ib = b.impact == null ? -Infinity : b.impact;
    if (ib !== ia) return ib - ia;
    return (b.ts || 0) - (a.ts || 0);
  });
  return deduped.map((e) => ({ ...e, fresh: freshnessLabel(e.ts, e.fresh, now), kind: 'event' }));
}

export default function LiveTicker() {
  const [items, setItems] = useState([]);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(Date.now());

  const load = useCallback(async () => {
    const [stateRes, streamRes] = await Promise.allSettled([
      fetch('/api/state'),
      fetch('/api/events/stream'),
    ]);
    const state = stateRes.status === 'fulfilled' && stateRes.value.ok
      ? await stateRes.value.json().catch(() => null) : null;
    const stream = streamRes.status === 'fulfilled' && streamRes.value.ok
      ? await streamRes.value.json().catch(() => null) : null;
    if (!state && !stream) {
      setError(stateRes.status === 'fulfilled' ? 'Server error ' + stateRes.value.status : 'Could not load ticker feeds.');
      setLoading(false);
      return;
    }
    const t = Date.now();
    // High-impact events first, then markets by |pct| desc.
    setItems(dedupeItems([
      ...eventsFromStream(Array.isArray(stream) ? stream : (stream?.items || []), t),
      ...marketsFromState(state, t),
    ]));
    setError(null);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, 60000);
    return () => clearInterval(id);
  }, [load]);

  // Heartbeat for time-ago/freshness labels.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(id);
  }, []);

  // Seamless loop: duplicate the list inside the marquee track; the CSS
  // animation translates by exactly -50% so the seam is invisible.
  const doubled = useMemo(() => [...items, ...items], [items]);

  const summary = items.length
    ? items.slice(0, 8).map((it) => (it.kind === 'market' ? it.sym : it.title)).join(' | ')
    : 'Ticker is loading live market and event items.';

  if (error && items.length === 0 && !loading) {
    return (
      <span
        data-testid="live-ticker"
        role="alert"
        title={`Live ticker offline: ${error}`}
        className="sb-chip hidden min-[480px]:inline-flex max-w-[170px] shrink-0 items-center gap-1.5 truncate bg-zinc-600 px-2.5 py-1 text-[11px] font-black uppercase tracking-wide text-white"
        style={{ boxShadow: '3px 3px 0 #111' }}
      >
        <span>○</span> Ticker offline — no live data
      </span>
    );
  }

  if (!items.length) {
    return (
      <span
        data-testid="live-ticker"
        title={error ? `Ticker offline: ${error}` : 'Waiting for live market and event data…'}
        className="sb-chip hidden min-[480px]:inline-flex max-w-[170px] shrink-0 items-center gap-1.5 truncate bg-zinc-600 px-2.5 py-1 text-[11px] font-black uppercase tracking-wide text-white"
        style={{ boxShadow: '3px 3px 0 #111' }}
      >
        <span className="animate-pulse">●</span> LIVE · LOADING
      </span>
    );
  }

  return (
    <span
      data-testid="live-ticker"
      role="region"
      aria-label="Live markets and events ticker"
      title={summary}
      className="sb-chip min-w-0 max-w-[560px] flex-1 items-center overflow-hidden bg-red-600 px-2.5 py-1 text-[11px] font-black uppercase tracking-wide text-white [display:none] min-[480px]:[display:inline-flex]"
      style={{ boxShadow: '3px 3px 0 #111' }}
    >
      <span className="mr-1.5 inline-flex shrink-0 items-center gap-1">
        <span className="animate-pulse">●</span> LIVE NOW
      </span>
      <span className="ticker-viewport relative block min-w-0 flex-1 overflow-hidden">
        <span className="ticker-track inline-flex items-center gap-4 whitespace-nowrap will-change-transform">
          {doubled.map((it, i) => {
            const firstHalf = i < items.length;
            const key = (firstHalf ? 'a:' : 'b:') + it.id;
            if (it.kind === 'market') {
              const p = it.pct;
              const dir = p == null ? 'text-warn' : p > 0 ? 'text-up' : p < 0 ? 'text-down' : 'text-warn';
              return (
                <span key={key} className="inline-flex shrink-0 items-center gap-1.5 normal-case tracking-normal" aria-hidden={firstHalf ? undefined : true}>
                  <span className="font-black">{it.sym}</span>
                  <span className="num font-bold">{price(it.price)}</span>
                  {p != null && <span className={`num font-bold ${dir}`}>{pct(p)}</span>}
                  {it.demo && <span className="rounded border border-current px-1 text-[9px] font-black uppercase">demo</span>}
                  <span className="text-white/70 normal-case font-semibold">{it.provider}</span>
                  <span className="text-white/70">· {ago(it.ts, now)}</span>
                  <span className="text-white/60 text-[9px] uppercase">{it.fresh}</span>
                </span>
              );
            }
            return (
              <span key={key} className="inline-flex shrink-0 items-center gap-1.5" aria-hidden={firstHalf ? undefined : true}>
                <span className="max-w-[260px] truncate font-bold normal-case tracking-normal">{it.title}</span>
                <span className="text-white/70 normal-case font-semibold">{it.provider}</span>
                <span className="text-white/70">· {ago(it.ts, now)}</span>
                <span className="text-white/60 text-[9px] uppercase">{it.fresh}</span>
              </span>
            );
          })}
        </span>
      </span>
    </span>
  );
}
