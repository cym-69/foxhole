/* Pure: build the 40-point plot window from a server hist[] + prefill anchor.
   The returned pts always has 40 slots when hist.length >= 2:
   - window = last 40 ticks, right-aligned (latest at index 39)
   - leading slots are unknown pre-window (NOT a move): the first slot is
     the server's prefill anchor (if it differs from the first observed tick),
     otherwise unknown pre-window slots are filled with the first observed
     value — the line is flat there but never implies a price move.
   Shared by MarketsChart.jsx and server/test-markets.js (golden-file tests). */
export function buildSeriesPts(hist, prefill) {
  const raw = Array.isArray(hist) ? hist.filter((v) => typeof v === 'number') : [];
  if (raw.length < 2) return [];
  const window = raw.slice(-40);
  const pts = [...window];
  const anchor = typeof prefill === 'number' && prefill !== window[0] ? prefill : window[0];
  while (pts.length < 40) pts.unshift(anchor);
  return pts;
}
