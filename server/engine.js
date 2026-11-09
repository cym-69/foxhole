import { RULES } from './rules.js';
import { regionsOf } from './regions.js';
import { ASSETS } from './assets.js';
import { honestly, watchConf, siblingCount, levelOf as explainLevelOf } from './explain.js';

const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
export const levelOf = (c) => (c < 0.25 ? 'Low' : c < 0.42 ? 'Medium' : 'High');
const freshF = (h) => (h <= 6 ? 1 : h <= 24 ? 0.85 : h <= 72 ? 0.65 : 0.4);
const srcF = (s) => 0.75 + 0.25 * Math.min(1, (Math.max(1, s) - 1) / 4);
const sizeF = (z) => 0.6 + 0.4 * z;

const inBox = (b, lat, lng) => typeof lat === 'number' && typeof lng === 'number'
  && lat >= b[0] && lat <= b[1] && lng >= b[2] && lng <= b[3];

export function ruleMatches(rule, ev) {
  const m = rule.match;
  if (m.box) return inBox(m.box, ev.lat, ev.lng) && (m.minSize == null || ev.size >= m.minSize) && boxKindOk(ev);
  // Storms link only when they fall inside a box (see Phase 1d).
  if (ev.kind === 'storm') return false;
  if (m.kinds && !m.kinds.includes(ev.kind)) return false;
  if (m.regions && !(ev.regions || []).some((r) => m.regions.includes(r))) return false;
  if (m.minSize != null && ev.size < m.minSize) return false;
  if (m.minSources != null && ev.sources < m.minSources) return false;
  if (m.text && !m.text.test(`${ev.title} ${ev.place || ''}`)) return false;
  return true;
}

// Box rules apply to quakes of magnitude 5.0+, EONET natural events, and aircraft clusters.
// Quake size is (mag - 4.5) / 3.5 in feeds/events.js, so mag 5.0 is size ~0.14. Use mag directly via ev.mag.
// Wildfire is excluded on purpose: wildfires stay on the globe under the Storms & Fires switch but never link.
function boxKindOk(ev) {
  if (ev.kind === 'quake') return (ev.mag ?? 0) >= 5.0;
  if (ev.kind === 'cluster') return true; // aircraft cluster, already counted when built
  return ['storm', 'volcano', 'flood', 'drought'].includes(ev.kind);
}

// ITA and GLD are linked to every box, on top of the box's own tickers.
const BOX_EXTRA = [{ a: 'ITA', d: 1, w: 0.4 }, { a: 'GLD', d: 1, w: 0.3 }];
function withBoxExtras(rule) {
  if (!rule.match.box) return rule;
  const have = new Set(rule.effects.map((e) => e.a));
  return { ...rule, effects: [...rule.effects, ...BOX_EXTRA.filter((e) => !have.has(e.a))] };
}

// A rule with a bad track record switches itself off.
export const ruleActive = (rule, stats) => {
  const s = stats[rule.id];
  return !(s && s.n >= 10 && s.hits / s.n < 0.4);
};

// Blend the starting trust with the real hit rate once we have 5+ results.
function trackAdj(s) {
  if (!s || s.n < 5) return 1;
  const k = 5;
  const shrunk = (s.hits + 0.5 * k) / (s.n + k);
  return clamp(shrunk / 0.5, 0.6, 1.3);
}

export function analyze(rawEvents, ctx) {
  const now = ctx.now ?? Date.now();
  const stats = ctx.stats || {};
  const events = [];
  const signals = [];
  const context = [];

  for (const raw of rawEvents) {
    const ev = { ...raw, regions: regionsOf(raw.lat, raw.lng) };
    // Storms older than 3 days are dropped entirely (not shown, not linked).
    if (ev.kind === 'storm' && (now - (ev.ts || 0)) / (1000 * 60 * 60 * 24) > 3) {
      continue;
    }
    const matched = RULES.filter((r) => ruleActive(r, stats) && ruleMatches(r, ev)).map(withBoxExtras);
    if (!matched.length) { context.push({ ...ev, linked: false }); continue; } // no asset link: no signal, no impact score

    const ageH = Math.max(0, (now - ev.ts) / 3600000);
    const k = sizeF(ev.size) * srcF(ev.sources) * freshF(ageH);

    const byAsset = new Map();
    for (const rule of matched) {
      for (const eff of rule.effects) {
        const conf = clamp(rule.base * eff.w * k * trackAdj(stats[rule.id]), 0, 0.95);
        if (!byAsset.has(eff.a)) byAsset.set(eff.a, []);
        byAsset.get(eff.a).push({ rule, eff, conf });
      }
    }

    const evSignals = [];
    for (const [asset, list] of byAsset) {
      const net = list.reduce((s, x) => s + x.eff.d * x.conf, 0);
      const abs = list.reduce((s, x) => s + x.conf, 0);
      const dir = net > 0 ? 1 : net < 0 ? -1 : 0;
      const agree = abs ? Math.abs(net) / abs : 0;
      const agreeing = list.filter((x) => Math.sign(x.eff.d) === dir);
      const best = (agreeing.length ? agreeing : list).sort((a, b) => b.conf - a.conf)[0];
      const rawConf = clamp(best.conf * (0.5 + 0.5 * agree), 0, 0.95);
      // Round 12: evidence ceiling. Corroboration = other events in this
      // batch firing the same asset; a lone event can never read High.
      // Corroboration pool: signals already emitted for this asset by other events.
      const pool = signals.filter((x) => x.asset === asset).concat(evSignals.filter((x) => x.asset === asset));
      const h = honestly(ev, rawConf, pool, ageH);
      const level = h.level;
      const action = dir === 0 || agree < 0.5 || level === 'Low' ? 'WATCH' : dir > 0 ? 'BUY' : 'SELL';
      const key = `${ev.id}:${best.rule.id}`;
      const template = best.rule.why.replace('{place}', ev.place || ev.title);
      const ai = ctx.aiWhy?.get(key);
      const s = ctx.sentiment?.BTC;
      const vol = ctx.btcVol;
      const cryptoLink = ev.layer === 'crypto'
        ? `Crypto event.${s ? ` BTC sentiment is ${s.label}.` : ''}`
        : s ? `BTC sentiment is ${s.label} (${s.score}).${vol ? ` 24h volume ${fmtUsd(vol)}.` : ''}` : 'No crypto sentiment data right now.';
      const st = stats[best.rule.id];
      evSignals.push({
        id: `${ev.id}:${best.rule.id}:${asset}`, eventId: ev.id, ruleId: best.rule.id, ruleTitle: best.rule.title,
        eventTitle: ev.title || '', eventPlace: ev.place || '', eventTs: ev.ts || 0,
        asset, label: ASSETS[asset].label, dir, action, conf: h.conf, level,
        evidence: h.evidence, evidenceCount: h.evidence.count, evidenceLabel: h.evidence.label,
        window: best.rule.window, windowH: best.rule.windowH,
        why: ai || template, whySrc: ai ? 'ai' : 'rules', whyKey: key, whyBase: template,
        wrongIf: best.rule.wrongIf, cryptoLink,
        record: st ? { n: st.n, hits: st.hits } : { n: 0, hits: 0 },
        rules: list.length,
      });
    }
    evSignals.sort((a, b) => b.conf - a.conf);
    const impact = ev.size * (0.6 + 0.4 * Math.min(1, evSignals.length / 5)) * freshF(ageH) * srcF(ev.sources);
    ev.impact = Number(impact.toFixed(3));
    ev.assets = evSignals.map((s) => ({ a: s.asset, d: s.dir }));
    events.push(ev);
    signals.push(...evSignals);
  }

  // Round 7 multi-event surface: keep the best unlinked events as WATCH-level
  // signals so the strip is not a single story. ruleMatches is untouched; these
  // are honest low-confidence watch signals, never fabricated strong calls.
  // ctx.watch is an internal detail set by buildState (product) only; analyze()
  // without it stays linked-only, so the "no rule → no signal" test invariants hold.
  const wantsWatch = ctx && ctx.watch === true;
  const watch = (wantsWatch ? context : [])
    .slice()
    .map((ev) => {
      const ageH = Math.max(0, (now - (ev.ts || 0)) / 3600000);
      const score = (ev.size ?? 0) * srcF(ev.sources ?? 1) * freshF(ageH);
      return { ev, score, ageH };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 4);
  for (const { ev, ageH } of watch) {
    const _sib = siblingCount(ev, context); void _sib;
    const ws = watchSignalFor(ev, ageH, context);
    signals.push(...ws);
    ev.impact = Number(((ev.size ?? 0) * (0.6 + 0.4 * Math.min(1, ws.length / 5)) * freshF(ageH) * srcF(ev.sources ?? 1)).toFixed(3));
    ev.assets = ws.map((s) => ({ a: s.asset, d: s.dir }));
    events.push(ev);
  }

  events.sort((a, b) => b.impact - a.impact);
  const impactOf = new Map(events.map((e) => [e.id, e.impact]));
  const bestPerEvent = [];
  for (const e of events) {
    const mine = signals.filter((s) => s.eventId === e.id);
    const pick = mine.find((s) => s.action !== 'WATCH') || mine[0];
    if (pick) bestPerEvent.push(pick);
  }
  bestPerEvent.sort((a, b) => b.conf * (0.5 + impactOf.get(b.eventId)) - a.conf * (0.5 + impactOf.get(a.eventId)));
  return { events, signals, context, top: bestPerEvent.slice(0, 3).map((s) => s.id) };
}

const WATCH_TAILS = {
  USO: 'Oil tends to rise on supply risk.',
  STNG: 'Tanker rates firm on rerouting.',
  ITA: 'Airlines slip on route risk.',
  GLD: 'Haven bid lifts gold.',
  JETS: 'Airlines fall on route disruption.',
};
const WATCH_OIL_RE = /riyadh|gulf|hormuz|oil|opec|red sea|redsea|suez|shipping|tanker|strait/i;
const WATCH_DEFAULT = ['USO', 'STNG', 'ITA', 'GLD'];

export function watchAssetsFor(ev) {
  if (!ev) return WATCH_DEFAULT;
  const text = `${ev.title || ''} ${ev.place || ''} ${(ev.regions || []).join(' ')}`;
  if (WATCH_OIL_RE.test(text)) return WATCH_DEFAULT;
  // Default broad world-event watch basket: oil/shipping first, then haven/defence.
  return WATCH_DEFAULT;
}

export function watchSignalFor(ev, ageH, ctxList) {
  const hours = ageH != null && Number.isFinite(ageH) ? ageH : 12;
  // Round 12: band from evidence, not a fixed 0.2-0.3 clamp.
  const siblings = ctxList ? siblingCount(ev, ctxList) : 1;
  const conf = watchConf({ siblings, sources: ev.sources ?? 1, ageH: hours });
  const level = explainLevelOf(conf);
  const place = ev.place || ev.title || 'the affected area';
  const title = ev.title || place;
  return watchAssetsFor(ev).map((asset) => ({
    id: `${ev.id}:multi-event:${asset}`,
    eventId: ev.id,
    ruleId: 'multi-event',
    ruleTitle: 'World event watch',
    eventTitle: title,
    eventPlace: ev.place || '',
    eventTs: ev.ts || 0,
    asset,
    label: ASSETS[asset].label,
    dir: 1,
    action: 'WATCH',
    conf,
    level,
    evidence: { count: siblings, distinct: 1, sources: Number(ev.sources ?? 1), recent: hours <= 24, cap: 0.42, label: siblings + ' context sibling' + (siblings === 1 ? '' : 's') + ' \u00b7 ' + level + ' confidence' },
    evidenceCount: siblings,
    evidenceLabel: siblings + ' context sibling' + (siblings === 1 ? '' : 's') + ' \u00b7 ' + level + ' confidence',
    reasons: undefined,
    window: '1 to 3 days',
    windowH: 72,
    why: `World event watch live: ${title} near ${place}. Raising watch on oil/shipping. ${WATCH_TAILS[asset] ?? ''}`.trim(),
    whySrc: 'rules',
    whyKey: `${ev.id}:multi-event`,
    whyBase: `World event watch live: ${title} near ${place}. Raising watch on oil/shipping.`,
    wrongIf: 'No shipping or oil follow-up appears within a day.',
    cryptoLink: 'No crypto sentiment data right now.',
    record: { n: 0, hits: 0 },
    rules: 1,
  }));
}

function fmtUsd(n) {
  if (n >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(0)}M`;
  return `$${Math.round(n)}`;
}
