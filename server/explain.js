// Round 12: evidence-count confidence honesty.
// Confidence used to be a pure rule-base x size factor, so a single-source
// event could read as High and WATCH was a fixed 0.2-0.3 band that ignored
// how many independent events actually corroborate it. These helpers derive
// both the band and the band label directly from evidence count.

export const levelOf = (c) => (c < 0.25 ? 'Low' : c < 0.42 ? 'Medium' : 'High');
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));

// Independent linked events that corroborate this signal: each distinct
// event id firing the same asset counts once (multi-asset copies of one
// event collapse to 1), plus up to +2 credit for the event's own source
// breadth (e.g. a GDELT cell with 20 sources earns 2 extra votes).
export function evidenceCount(ev, assetSignals) {
  const ids = new Set();
  if (Array.isArray(assetSignals)) for (const s of assetSignals) if (s && s.eventId) ids.add(s.eventId);
  const distinct = Math.max(1, ids.size || 1);
  const sources = Math.max(0, Number(ev?.sources ?? 1) - 1);
  const breadth = Math.min(2, Math.floor(sources / 4));
  return { count: distinct + breadth, distinct, sources: Number(ev?.sources ?? 1) };
}

// Ceiling that keeps a level honest: 1 -> Medium max (never High),
// 2 -> 0.55, 3+ -> uncapped (High only when the raw conf earns it).
export function capFor(count) {
  if (count <= 1) return 0.35;
  if (count === 2) return 0.41;
  return 0.95;
}

// Recent (<24h) evidence is full weight; older corroboration still counts
// for the ceiling but is flagged stale in the label.
export function evidenceOf(ev, assetSignals, ageH) {
  const { count, distinct, sources } = evidenceCount(ev, assetSignals);
  const recent = (ageH ?? 0) <= 24;
  const cap = capFor(count);
  const label = count >= 3 && recent
    ? count + ' linked events \u00b7 High confidence'
    : count >= 3
      ? count + ' linked events (stale) \u00b7 capped by age'
      : count + ' linked event' + (count === 1 ? '' : 's') + ' \u00b7 ' + (cap <= 0.35 ? 'Medium max' : 'capped') + ' \u00b7 ' + sources + ' source' + (sources === 1 ? '' : 's');
  return { count, distinct, sources, recent, cap, label };
}

// WATCH band from actual context corroboration instead of the fixed
// 0.2-0.3 clamp: more siblings, broader sources and fresher age push band
// up toward Medium, a lone quiet event stays low Low.
export function watchConf({ siblings = 1, sources = 1, ageH = 12 } = {}) {
  const fresh = ageH <= 6 ? 1 : ageH <= 24 ? 0.85 : ageH <= 72 ? 0.65 : 0.4;
  const srcBoost = Math.min(1, (Math.max(1, sources) - 1) / 10);
  const sibBoost = Math.min(1, (Math.max(1, siblings) - 1) / 3);
  return Number(clamp(0.10 + 0.10 * sibBoost + 0.06 * srcBoost + 0.08 * fresh, 0.10, 0.42).toFixed(3));
}

// Sibling context events: unlinked events sharing a region or a tuned box
// with this event. Counted separately from linked corroboration so WATCH
// cannot borrow strength from a rival event that fired a real rule.
export function siblingCount(ev, context) {
  if (!ev || !Array.isArray(context)) return 1;
  const regs = new Set(ev.regions || []);
  let n = 0;
  for (const e of context) {
    if (!e || e.id === ev.id) continue;
    const lat = e.lat, lng = e.lng;
    const sameBox = Number.isFinite(lat) && Number.isFinite(lng) && Number.isFinite(ev.lat) && Number.isFinite(ev.lng)
      && Math.abs(lat - ev.lat) < 5 && Math.abs(lng - ev.lng) < 5;
    const sameRegion = (e.regions || []).some((r) => regs.has(r));
    if (sameBox || sameRegion) n++;
  }
  return n + 1;
}

// Apply the evidence ceiling to a raw linked confidence and recompute level.
export function honestly(ev, rawConf, assetSignals, ageH) {
  const evd = evidenceOf(ev, assetSignals, ageH);
  // Soft cap: above the ceiling, a track-record edge still ranks, but only
  // by up to +0.02 and never across the High boundary for 1-2 events.
  const over = rawConf > evd.cap ? Math.min(0.02, 0.05 * (rawConf - evd.cap)) : 0;
  const capped = rawConf > evd.cap ? evd.cap + over : rawConf;
  const conf = Number(clamp(capped, 0, 0.95).toFixed(3));
  return { conf, level: levelOf(conf), evidence: evd };
}
