/* Pure: derive honest price deltas from a live quote.
A delta is only honest when the quote is live (!demo) and we have
real history. Demo randomness is never presented as movement.
  d24h: vendor 24h change (CoinGecko usd_24h_change / Finnhub dp)
  d1h:  change vs the price ~1h ago in hist[] (needs histTs)
  session: change vs first observed tick in hist[]
Returns { d1h, d24h, session } numbers or null. */
export function quoteDeltas(q, now = Date.now()) {
  if (!q || q.demo === true) return { d1h: null, d24h: null, session: null };
  const d24h = typeof q.pct === 'number' && Number.isFinite(q.pct) ? q.pct : null;
  const hist = Array.isArray(q.hist) ? q.hist.filter((v) => typeof v === 'number' && Number.isFinite(v)) : [];
  const ts = Array.isArray(q.histTs) ? q.histTs.filter((v) => typeof v === 'number' && Number.isFinite(v)) : [];
  let d1h = null;
  if (hist.length >= 2 && ts.length === hist.length && typeof q.price === 'number') {
    const target = now - 3600e3;
    let ref = null;
    for (let i = 0; i < ts.length; i++) {
      if (ts[i] <= target) ref = hist[i];
      else break;
    }
    if (ref != null && ref > 0) d1h = ((q.price - ref) / ref) * 100;
  }
  const session = hist.length >= 2 && hist[0] > 0 && typeof q.price === 'number' ? ((q.price - hist[0]) / hist[0]) * 100 : null;
  return { d1h, d24h, session };
}

/* Display helper: the honest blocked label when no honest delta exists. */
/* Provider-agnostic: Finnhub/CoinGecko are the live vendors; Stooq is no longer used. */
export const BLOCKED_LABEL = 'price unavailable';
export function isLiveQuote(q) { return !!q && q.demo !== true && typeof q.price === 'number'; }
export function fmtDelta(n) {
  if (n == null || Number.isNaN(n)) return '-';
  return (n > 0 ? '+' : '') + n.toFixed(2) + '%';
}
