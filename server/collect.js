// Pure event collection logic - extracted for deterministic testing (PRODUCT_GOAL honesty).
export function collectEvents({ primary, liveEvents, demoEvents, demoForced, now = Date.now(), maxAgeMs = 72 * 3600 * 1000 }) {
  const all = [];
  let liveSources = 0;
  for (const k of ['usgs', 'eonet', 'cryptocv', 'gdelt']) {
    const s = primary[k];
    if (s && s.ok) { liveSources++; if (Array.isArray(s.ev)) all.push(...s.ev); }
  }
  const aux = typeof liveEvents === 'function' ? liveEvents() : (Array.isArray(liveEvents) ? liveEvents : []);
  all.push(...aux);
  const fresh = all.filter((e) => e && (now - (e.ts || 0)) < maxAgeMs);
  const seen = new Set();
  const uniq = fresh.filter((e) => (seen.has(e.id) ? false : seen.add(e.id)));
  const demo = demoForced || (liveSources === 0 && uniq.length === 0);
  return demo
    ? { events: typeof demoEvents === 'function' ? demoEvents() : demoEvents, demo: true, liveSources: 0, auxCount: aux.length }
    : { events: uniq, demo: false, liveSources, auxCount: aux.length };
}
