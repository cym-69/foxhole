#!/usr/bin/env node
// Foxhole Diagnostic Script - fetches live data from APIs and computes all tables
// Uses EXACT same rule matching logic as server/engine.js

const RULES = (await import('./rules.js')).RULES;
const { regionsOf } = await import('./regions.js');
import { analyze } from './engine.js';
import { refreshGdelt } from './feeds/gdelt.js';

const UA = 'Foxhole/1.0 (personal project)';

// Boxes from rules (for nearest-box distance calculation)
const boxes = RULES.filter(r => r.match.box).map(r => ({
  id: r.id,
  title: r.title,
  box: r.match.box
}));

function distance(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLon/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

function nearestBox(lat, lon) {
  let best = null, bestDist = Infinity;
  for (const b of boxes) {
    const cx = (b.box[0] + b.box[1]) / 2;
    const cy = (b.box[2] + b.box[3]) / 2;
    const d = distance(lat, lon, cx, cy);
    if (d < bestDist) { bestDist = d; best = b; }
  }
  return { box: best, dist: bestDist };
}

// EXACT rule matching from engine.js
const inBox = (b, lat, lng) => typeof lat === 'number' && typeof lng === 'number'
  && lat >= b[0] && lat <= b[1] && lng >= b[2] && lng <= b[3];

// Wildfire is excluded on purpose (Phase 1c): wildfires stay on the globe but never link.
function boxKindOk(ev) {
  if (ev.kind === 'quake') return (ev.mag ?? 0) >= 5.0;
  if (ev.kind === 'cluster') return true;
  return ['storm', 'volcano', 'flood', 'drought'].includes(ev.kind);
}

function ruleMatches(rule, ev) {
  const m = rule.match;
  if (m.box) return inBox(m.box, ev.lat, ev.lng) && (m.minSize == null || ev.size >= m.minSize) && boxKindOk(ev);
  if (m.kinds && !m.kinds.includes(ev.kind)) return false;
  if (m.regions && !(ev.regions || []).some((r) => m.regions.includes(r))) return false;
  if (m.minSize != null && ev.size < m.minSize) return false;
  if (m.minSources != null && ev.sources < m.minSources) return false;
  if (m.text && !m.text.test(`${ev.title} ${ev.place || ''}`)) return false;
  return true;
}

const BOX_EXTRA = [{ a: 'ITA', d: 1, w: 0.4 }, { a: 'GLD', d: 1, w: 0.3 }];
function withBoxExtras(rule) {
  if (!rule.match.box) return rule;
  const have = new Set(rule.effects.map((e) => e.a));
  return { ...rule, effects: [...rule.effects, ...BOX_EXTRA.filter((e) => !have.has(e.a))] };
}

// Rule active check
const ruleActive = (rule, stats) => {
  const s = stats[rule.id];
  return !(s && s.n >= 10 && s.hits / s.n < 0.4);
};

async function getJSON(url) {
  const r = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' } });
  if (!r.ok) throw new Error(`HTTP ${r.status} from ${new URL(url).host}`);
  return r.json();
}

async function fetchQuakes() {
  const j = await getJSON('https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_day.geojson');
  return j.features.filter(f => f.geometry?.coordinates).map(f => {
    const [lon, lat] = f.geometry.coordinates;
    const mag = f.properties.mag ?? 0;
    return { id: 'usgs:' + f.id, kind: 'quake', layer: 'nature', title: `M${Number(mag).toFixed(1)} earthquake`, place: f.properties.place || 'unknown place', lat, lng: lon, mag, size: Math.min(1, Math.max(0, (mag - 4.5) / 3.5)), sources: 1, ts: f.properties.time, src: 'usgs' };
  });
}

async function fetchEonet() {
  const j = await getJSON('https://eonet.gsfc.nasa.gov/api/v3/events?status=open&limit=100');
  return j.events.map(e => {
    const g = e.geometry?.[e.geometry.length - 1];
    if (!g) return null;
    let c = g.coordinates;
    if (g.type === 'Polygon') c = c?.[0]?.[0];
    if (!Array.isArray(c) || typeof c[0] !== 'number') return null;
    if (e.title && e.title.toLowerCase().startsWith('prescribed fire')) return null;
    const kind = { wildfires: 'wildfire', severeStorms: 'storm', volcanoes: 'volcano', floods: 'flood', drought: 'drought' }[e.categories?.[0]?.id] || e.categories?.[0]?.id || 'unknown';
    return { id: 'eonet:' + e.id, kind, layer: 'nature', title: e.title, place: e.title, lat: c[1], lng: c[0], size: 0.4, sources: 1, ts: Date.parse(g.date) || Date.now(), src: 'eonet' };
  }).filter(Boolean);
}

async function fetchAircraft() {
  const j = await getJSON('https://api.adsb.lol/v2/mil');
  return j.ac.filter(a => typeof a.lat === 'number' && typeof a.lon === 'number').map(a => ({
    hex: a.hex, callsign: (a.flight || '').trim(), type: a.t || '', lat: a.lat, lon: a.lon,
    altitude: typeof a.alt_baro === 'number' ? a.alt_baro : null, speed: a.gs ?? null, heading: a.track ?? null,
  }));
}

// Conflict, blockade and sanction events (GDELT export files), same source as feeds/gdelt.js.
async function fetchGdelt() {
  try { return await refreshGdelt(); }
  catch (e) { console.log(`GDELT fetch failed: ${e.message}`); return []; }
}

async function main() {
  console.log('Fetching live data...');
  const [quakes, eonet, aircraft, gdelt] = await Promise.all([fetchQuakes(), fetchEonet(), fetchAircraft(), fetchGdelt()]);
  console.log(`Got ${quakes.length} quakes, ${eonet.length} EONET, ${aircraft.length} aircraft, ${gdelt.length} GDELT`);

  const allEvents = [...quakes, ...eonet, ...gdelt];
  
  // Add aircraft clusters (same logic as liveEvents)
  for (const b of boxes) {
    if (b.id === 'box-gulf-mexico' || b.id === 'box-midwest') continue;
    const inside = aircraft.filter(a => a.lat >= b.box[0] && a.lat <= b.box[1] && a.lon >= b.box[2] && a.lon <= b.box[3]);
    if (inside.length >= 3) {
      const lat = inside.reduce((s, a) => s + a.lat, 0) / inside.length;
      const lng = inside.reduce((s, a) => s + a.lon, 0) / inside.length;
      allEvents.push({ id: 'mil:' + b.id, kind: 'cluster', layer: 'military', title: `${inside.length} military aircraft in ${b.title}`, place: b.title, lat, lng, size: Math.min(1, inside.length / 20), sources: 1, ts: Date.now(), src: 'adsb', count: inside.length });
    }
  }

  // Compute linked/unlinked using EXACT engine logic
  const rawEvents = allEvents.map(e => ({ ...e, regions: regionsOf(e.lat, e.lng) }));
  const linked = [];
  const unlinked = [];

  const nowMs = Date.now();
  for (const ev of rawEvents) {
    // Storms link only while their latest geometry date is 3 days old or less (Phase 1c).
    if (ev.kind === 'storm' && (nowMs - (ev.ts || 0)) / (1000 * 60 * 60 * 24) > 3) { unlinked.push(ev); continue; }
    const matched = RULES.filter(r => ruleActive(r, {}) && ruleMatches(r, ev)).map(withBoxExtras);
    if (matched.length) linked.push({ ...ev, matched });
    else unlinked.push(ev);
  }

  // GDELT status: fetched count, how many survive the 72h "fresh" filter, and the per-category split.
  const gdeltFresh = gdelt.filter(e => Date.now() - e.ts < 72 * 3600000);
  const gdeltByCat = {};
  for (const g of gdelt) gdeltByCat[g.kind] = (gdeltByCat[g.kind] || 0) + 1;
  console.log(`\n=== G0: GDELT FEED STATUS ===`);
  console.log(`status: ${gdelt.length ? 'ok' : 'no events in window'}`);
  console.log(`fetched | ${gdelt.length}`);
  console.log(`survive the fresh (72h) filter | ${gdeltFresh.length}`);
  console.log('category | count');
  for (const [c, n] of Object.entries(gdeltByCat).sort()) console.log(`${c} | ${n}`);

  console.log(`\n=== G1: 10 SAMPLE GDELT EVENTS ===`);
  const linkedIds = new Set(linked.map(l => l.id));
  gdelt.slice(0, 10).forEach((g, i) => {
    const hit = linked.find(l => l.id === g.id);
    let ruleId = 'none (not linked)';
    if (hit) ruleId = hit.matched.map(m => m.id).join(',');
    else {
      let best = null, bestScore = -1;
      for (const r of RULES) {
        if (r.match.box) continue;
        let score = 0;
        const m = r.match;
        if (m.kinds && m.kinds.includes(g.kind)) score += 10;
        if (m.regions && (g.regions || []).some(reg => m.regions.includes(reg))) score += 5;
        if (m.minSize != null && g.size >= m.minSize) score += 3;
        if (m.minSources != null && g.sources >= m.minSources) score += 3;
        if (m.text && m.text.test(`${g.title} ${g.place || ''}`)) score += 7;
        if (score > bestScore) { bestScore = score; best = r; }
      }
      ruleId = `${best ? best.id : 'none'} (closest, score ${bestScore})`;
    }
    console.log(`--- sample ${i + 1} ---`);
    console.log(`title | ${g.title}`);
    console.log(`category | ${g.kind}`);
    console.log(`lat | ${g.lat}`);
    console.log(`lon | ${g.lng}`);
    console.log(`date | ${new Date(g.ts).toISOString().slice(0, 10)}`);
    console.log(`linked | ${linkedIds.has(g.id) ? 'yes' : 'no'}`);
    console.log(`rule | ${ruleId}`);
  });

  // All events (quakes + eonet + gdelt + aircraft clusters)
  console.log(`\n=== B1: ALL EVENTS (${allEvents.length} total, ${linked.length} linked, ${unlinked.length} unlinked) ===`);
  console.log('id | kind | place | lat | lon | linked | nearest_box | dist_km');
  for (const ev of allEvents) {
    const isLinked = linked.some(l => l.id === ev.id);
    const nb = nearestBox(ev.lat, ev.lng);
    console.log(`${ev.id} | ${ev.kind} | ${ev.place} | ${ev.lat} | ${ev.lng} | ${isLinked ? 'yes' : 'no'} | ${nb.box?.title || 'none'} | ${nb.dist.toFixed(1)}`);
  }

  console.log('\n=== B2: QUAKES TOP 15 BY MAGNITUDE ===');
  console.log('magnitude | place | lat | lon | nearest_box | dist_km');
  quakes.sort((a,b) => b.mag - a.mag).slice(0,15).forEach(q => {
    const nb = nearestBox(q.lat, q.lng);
    console.log(`${q.mag.toFixed(1)} | ${q.place} | ${q.lat} | ${q.lng} | ${nb.box?.title || 'none'} | ${nb.dist.toFixed(1)}`);
  });

  console.log('\n=== B3: EONET 20 CLOSEST TO BOXES ===');
  console.log('title | category | lat | lon | nearest_box | dist_km');
  const eonetWithDist = eonet.map(e => {
    const nb = nearestBox(e.lat, e.lng);
    return { ...e, box: nb.box?.title || 'none', dist: nb.dist };
  });
  eonetWithDist.sort((a,b) => a.dist - b.dist).slice(0,20).forEach(e => {
    console.log(`${e.title} | ${e.kind} | ${e.lat} | ${e.lng} | ${e.box} | ${e.dist.toFixed(1)}`);
  });

  console.log('\n=== B4: AIRCRAFT GRID (10deg) TOP 10 ===');
  console.log('cell | count');
  const grid = {};
  for (const a of aircraft) {
    const latCell = Math.floor(a.lat / 10) * 10;
    const lonCell = Math.floor(a.lon / 10) * 10;
    const key = `N${latCell}-${latCell+10} E${lonCell}-${lonCell+10}`;
    grid[key] = (grid[key] || 0) + 1;
  }
  Object.entries(grid).sort((a,b) => b[1] - a[1]).slice(0,10).forEach(([k,v]) => console.log(`${k} | ${v}`));

  console.log('\n=== B5: 10 UNLINKED EVENTS - CLOSEST RULE ===');
  console.log('event_id | place | lat | lon | closest_rule_id | closest_rule_title | why_not_linked');
  for (const ev of unlinked.slice(0, 10)) {
    let closest = null, bestScore = -1;
    for (const r of RULES) {
      if (!ruleActive(r, {})) continue;
      let score = 0;
      const m = r.match;
      if (m.box) {
        if (inBox(m.box, ev.lat, ev.lng) && (m.minSize == null || ev.size >= m.minSize) && boxKindOk(ev)) { score += 20; }
      } else {
        if (m.kinds && m.kinds.includes(ev.kind)) score += 10;
        if (m.regions && (ev.regions || []).some(reg => m.regions.includes(reg))) score += 5;
        if (m.minSize != null && ev.size >= m.minSize) score += 3;
        if (m.text && m.text.test(`${ev.title} ${ev.place || ''}`)) score += 7;
      }
      if (score > bestScore) { bestScore = score; closest = r; }
    }
    const failed = [];
    if (closest) {
      const m = closest.match;
      if (m.box) {
        if (!inBox(m.box, ev.lat, ev.lng)) failed.push('outside-box');
        else if (m.minSize != null && ev.size < m.minSize) failed.push(`size:${ev.size}<${m.minSize}`);
        else if (!boxKindOk(ev)) failed.push(`kind-not-eligible-for-box:${ev.kind}`);
      } else {
        if (m.kinds && !m.kinds.includes(ev.kind)) failed.push(`kind:${ev.kind} not in ${m.kinds}`);
        if (m.regions && !(ev.regions || []).some(reg => m.regions.includes(reg))) failed.push(`region:${ev.regions} not in ${m.regions}`);
        if (m.minSize != null && ev.size < m.minSize) failed.push(`size:${ev.size}<${m.minSize}`);
        if (m.minSources != null && ev.sources < m.minSources) failed.push(`sources:${ev.sources}<${m.minSources}`);
        if (m.text && !m.text.test(`${ev.title} ${ev.place || ''}`)) failed.push('text-no-match');
      }
    }
    console.log(`${ev.id} | ${ev.place} | ${ev.lat} | ${ev.lng} | ${closest?.id || 'none'} | ${closest?.title || 'none'} | ${failed.join('; ') || 'no rule scored'}`);
  }

  // Use the actual engine analyze for signals
  const result = analyze(rawEvents, { stats: {}, now: Date.now() });

  console.log('\n=== B6: PER-TICKER LINK COUNTS ===');
  console.log('ticker | count');
  const tickerCounts = {};
  for (const s of result.signals) tickerCounts[s.asset] = (tickerCounts[s.asset] || 0) + 1;
  const allTickers = ['SPY','USO','UNG','JETS','SOXX','TSM','STNG','ZIM','WEAT','CORN','CPER','ITA','GLD','BTC','ETH','SOL','USDT'];
  for (const t of allTickers) console.log(`${t} | ${tickerCounts[t] || 0}`);

  console.log('\n=== B7: COUNTS PER CATEGORY ===');
  console.log('category | count');
  const cats = {};
  for (const e of allEvents) cats[e.kind] = (cats[e.kind] || 0) + 1;
  for (const [c, n] of Object.entries(cats).sort()) console.log(`${c} | ${n}`);
}

main().catch(e => { console.error(e); process.exit(1); });
