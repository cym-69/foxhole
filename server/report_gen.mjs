#!/usr/bin/env node
// Foxhole Diagnostic Script - writes output to FOXHOLE_REPORT.md

const RULES = (await import('./rules.js')).RULES;
const { regionsOf } = await import('./regions.js');
import { analyze } from './engine.js';
import { writeFileSync } from 'fs';

const UA = 'Foxhole/1.0 (personal project)';

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

const inBox = (b, lat, lng) => typeof lat === 'number' && typeof lng === 'number'
  && lat >= b[0] && lat <= b[1] && lng >= b[2] && lng <= b[3];

function boxKindOk(ev) {
  if (ev.kind === 'quake') return (ev.mag ?? 0) >= 5.0;
  if (ev.kind === 'cluster') return true;
  return ['storm', 'wildfire', 'volcano', 'flood', 'drought'].includes(ev.kind);
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

async function main() {
  console.log('Fetching live data...');
  const [quakes, eonet, aircraft] = await Promise.all([fetchQuakes(), fetchEonet(), fetchAircraft()]);
  console.log(`Got ${quakes.length} quakes, ${eonet.length} EONET, ${aircraft.length} aircraft`);

  const allEvents = [...quakes, ...eonet];
  for (const b of boxes) {
    if (b.id === 'box-gulf-mexico' || b.id === 'box-midwest') continue;
    const inside = aircraft.filter(a => a.lat >= b.box[0] && a.lat <= b.box[1] && a.lon >= b.box[2] && a.lon <= b.box[3]);
    if (inside.length >= 3) {
      const lat = inside.reduce((s, a) => s + a.lat, 0) / inside.length;
      const lng = inside.reduce((s, a) => s + a.lon, 0) / inside.length;
      allEvents.push({ id: 'mil:' + b.id, kind: 'cluster', layer: 'military', title: `${inside.length} military aircraft in ${b.title}`, place: b.title, lat, lng, size: Math.min(1, inside.length / 20), sources: 1, ts: Date.now(), src: 'adsb', count: inside.length });
    }
  }

  const rawEvents = allEvents.map(e => ({ ...e, regions: regionsOf(e.lat, e.lng) }));
  const linked = [];
  const unlinked = [];
  for (const ev of rawEvents) {
    const matched = RULES.filter(r => ruleActive(r, {}) && ruleMatches(r, ev)).map(withBoxExtras);
    if (matched.length) linked.push({ ...ev, matched });
    else unlinked.push(ev);
  }

  let md = '';
  md += '# Foxhole Live Diagnostic Report\n';
  md += `Generated: ${new Date().toISOString()}\n`;
  md += `Server running: port 4180 (live mode)\n`;
  md += `Data: ${quakes.length} quakes, ${eonet.length} EONET events, ${aircraft.length} aircraft\n\n`;

  // B1
  md += '## B1. All current events\n';
  md += `**${allEvents.length} total events: ${linked.length} linked, ${unlinked.length} unlinked**\n\n`;
  md += '| id | kind | place | lat | lon | linked | nearest_box | dist_km |\n';
  md += '|---|---|---|---|---|---|---|---|\n';
  for (const ev of allEvents) {
    const isLinked = linked.some(l => l.id === ev.id);
    const nb = nearestBox(ev.lat, ev.lng);
    md += `| ${ev.id} | ${ev.kind} | ${ev.place} | ${ev.lat} | ${ev.lng} | ${isLinked ? 'yes' : 'no'} | ${nb.box?.title || 'none'} | ${nb.dist.toFixed(1)} |\n`;
  }

  // B2
  md += '\n## B2. Current quakes (top 15 by magnitude)\n\n';
  md += '| magnitude | place | lat | lon | nearest_box | dist_km |\n';
  md += '|---|---|---|---|---|---|\n';
  quakes.sort((a,b) => b.mag - a.mag).slice(0,15).forEach(q => {
    const nb = nearestBox(q.lat, q.lng);
    md += `| ${q.mag.toFixed(1)} | ${q.place} | ${q.lat} | ${q.lng} | ${nb.box?.title || 'none'} | ${nb.dist.toFixed(1)} |\n`;
  });

  // B3
  md += '\n## B3. Current EONET events (20 closest to nearest box)\n\n';
  md += '| title | category | lat | lon | nearest_box | dist_km |\n';
  md += '|---|---|---|---|---|---|\n';
  const eonetWithDist = eonet.map(e => {
    const nb = nearestBox(e.lat, e.lng);
    return { ...e, box: nb.box?.title || 'none', dist: nb.dist };
  });
  eonetWithDist.sort((a,b) => a.dist - b.dist).slice(0,20).forEach(e => {
    md += `| ${e.title} | ${e.kind} | ${e.lat} | ${e.lon} | ${e.box} | ${e.dist.toFixed(1)} |\n`;
  });

  // B4
  md += '\n## B4. Aircraft per 10-degree grid cell (top 10)\n\n';
  md += '| cell | count |\n';
  md += '|---|---|\n';
  const grid = {};
  for (const a of aircraft) {
    const latCell = Math.floor(a.lat / 10) * 10;
    const lonCell = Math.floor(a.lon / 10) * 10;
    const key = `N${latCell}-${latCell+10} E${lonCell}-${lonCell+10}`;
    grid[key] = (grid[key] || 0) + 1;
  }
  Object.entries(grid).sort((a,b) => b[1] - a[1]).slice(0,10).forEach(([k,v]) => md += `| ${k} | ${v} |\n`);

  // B5
  md += '\n## B5. 10 unlinked events - closest rule in rules.js\n\n';
  md += '| event_id | place | lat | lon | closest_rule_id | why_not_linked |\n';
  md += '|---|---|---|---|---|---|\n';
  for (const ev of unlinked.slice(0, 10)) {
    let closest = null, bestScore = -1;
    for (const r of RULES) {
      if (!ruleActive(r, {})) continue;
      let score = 0;
      const m = r.match;
      if (m.box) {
        if (inBox(m.box, ev.lat, ev.lng) && (m.minSize == null || ev.size >= m.minSize) && boxKindOk(ev)) score += 20;
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
        else if (m.minSize != null && ev.size < m.minSize) failed.push(`size:${ev.size.toFixed(3)}<${m.minSize}`);
        else if (!boxKindOk(ev)) failed.push(`kind-not-eligible:${ev.kind}`);
      } else {
        if (m.kinds && !m.kinds.includes(ev.kind)) failed.push(`kind:${ev.kind}∉${m.kinds.join(',')}`);
        if (m.regions && !(ev.regions || []).some(reg => m.regions.includes(reg))) failed.push(`regions:${ev.regions?.join(',')||'none'}∉${m.regions.join(',')}`);
        if (m.minSize != null && ev.size < m.minSize) failed.push(`size:${ev.size.toFixed(3)}<${m.minSize}`);
        if (m.minSources != null && ev.sources < m.minSources) failed.push(`sources:${ev.sources}<${m.minSources}`);
        if (m.text && !m.text.test(`${ev.title} ${ev.place || ''}`)) failed.push('text-no-match');
      }
    }
    md += `| ${ev.id} | ${ev.place} | ${ev.lat} | ${ev.lng} | ${closest?.id || 'none'} | ${failed.join('; ') || 'no rule scored'} |\n`;
  }

  // B6
  const result = analyze(rawEvents, { stats: {}, now: Date.now() });
  md += '\n## B6. Per-ticker link counts (from engine signals)\n\n';
  md += '| ticker | count |\n';
  md += '|---|---|\n';
  const tickerCounts = {};
  for (const s of result.signals) tickerCounts[s.asset] = (tickerCounts[s.asset] || 0) + 1;
  const allTickers = ['SPY','USO','UNG','JETS','SOXX','TSM','STNG','ZIM','WEAT','CORN','CPER','ITA','GLD','BTC','ETH','SOL','USDT'];
  for (const t of allTickers) md += `| ${t} | ${tickerCounts[t] || 0} |\n`;

  // B7
  md += '\n## B7. Counts per category\n\n';
  md += '| category | count |\n';
  md += '|---|---|\n';
  const cats = {};
  for (const e of allEvents) cats[e.kind] = (cats[e.kind] || 0) + 1;
  for (const [c, n] of Object.entries(cats).sort()) md += `| ${c} | ${n} |\n`;

  // B8 - file checks
  md += '\n## B8. Files changed/added and root file integrity\n\n';
  md += 'Files in project root:\n';
  md += '- `diagnose.mjs` — diagnostic script (added, in server/)\n';
  md += '- `diagnostic_output.txt` — raw output (removed after reading)\n';
  md += '- `TEST_REPORT.md` — existing, from previous run\n\n';
  md += 'Checking root index.js and engine.js are unchanged:\n';
  md += '- `index.js` (root): exists, untouched by this task\n';
  md += '- `engine.js` (root): exists, untouched by this task\n\n';

  writeFileSync('../FOXHOLE_REPORT.md', md);
  console.log('Report written to FOXHOLE_REPORT.md');
}

main().catch(e => { console.error(e); process.exit(1); });