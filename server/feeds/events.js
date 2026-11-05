import { cfg } from '../config.js';

const UA = { 'User-Agent': 'Foxhole/0.1 (personal dashboard)' };
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));

async function getJSON(url, ms = 15000) {
  const r = await fetch(url, { headers: { ...UA, Accept: 'application/json' }, signal: AbortSignal.timeout(ms) });
  const raw = await r.text();
  if (!r.ok) throw new Error(`HTTP ${r.status} from ${new URL(url).host}: ${raw.slice(0, 100).replace(/\s+/g, ' ')}`);
  try { return JSON.parse(raw); }
  catch { throw new Error(`Reply from ${new URL(url).host} was not JSON: ${raw.slice(0, 100).replace(/\s+/g, ' ')}`); }
}

// Earthquakes (USGS, no key)
export async function usgs() {
  const j = await getJSON('https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_day.geojson');
  if (!Array.isArray(j.features)) throw new Error('USGS reply had no features list');
  return (j.features || [])
    .filter((f) => f.geometry?.coordinates)
    .map((f) => {
      const [lng, lat] = f.geometry.coordinates;
      const mag = f.properties.mag || 0;
      return {
        id: 'usgs:' + f.id, kind: 'quake', layer: 'nature',
        title: `M${mag.toFixed(1)} earthquake`, place: f.properties.place || 'unknown place',
        lat, lng, size: clamp((mag - 4.5) / 3.5),
        sources: 1 + (mag >= 6 ? 1 : 0) + ((f.properties.sig || 0) > 600 ? 1 : 0),
        ts: f.properties.time, src: 'usgs',
      };
    });
}

// Natural events (NASA EONET, no key)
const EONET_KIND = { wildfires: 'wildfire', severeStorms: 'storm', volcanoes: 'volcano', floods: 'flood', drought: 'drought' };
export async function eonet() {
  const j = await getJSON('https://eonet.gsfc.nasa.gov/api/v3/events?status=open&limit=100&days=10');
  if (!Array.isArray(j.events)) throw new Error('NASA reply had no events list');
  const out = [];
  for (const e of j.events || []) {
    const cat = e.categories?.[0]?.id;
    const kind = EONET_KIND[cat];
    const g = e.geometry?.[e.geometry.length - 1];
    if (!kind || !g) continue;
    let c = g.coordinates;
    if (g.type === 'Polygon') c = c?.[0]?.[0];
    if (!Array.isArray(c) || typeof c[0] !== 'number') continue;
    if (e.title && e.title.toLowerCase().startsWith('prescribed fire')) continue;
    const mv = Number(g.magnitudeValue);
    let size = 0.4;
    if (kind === 'storm' && mv) size = clamp((mv - 34) / 100);
    else if (kind === 'wildfire' && mv) size = clamp(Math.log10(mv + 1) / 5);
    out.push({
      id: 'eonet:' + e.id, kind, layer: 'nature', title: e.title, place: e.title,
      lat: c[1], lng: c[0], size: Math.max(size, 0.25),
      sources: e.sources?.length || 1, ts: Date.parse(g.date) || Date.now(), src: 'eonet',
    });
  }
  return out;
}

// Conflict, shipping and policy events come from feeds/gdelt.js


// Crypto events from headlines (cryptocurrency.cv, no key). An event needs 2+ headlines from 2+ outlets.
const CRYPTO_KINDS = [
  ['hack', /\b(hack(ed|s)?|exploit(ed|s)?|drain(ed)?|stolen|breach)\b/i, 'Hack or exploit'],
  ['depeg', /\b(de-?peg(ged)?|loses? (its )?peg)\b/i, 'Stablecoin peg break'],
  ['liquidation', /\bliquidat(ed|ions?)\b/i, 'Mass liquidations'],
  ['crackdown', /\b(sec (sues|charges)|crackdown|lawsuit|subpoena|banned?)\b/i, 'Legal action'],
  ['approval', /\b(approv(es|ed|al)|green-?light)\b.*\betf\b|\betf\b.*\bapprov/i, 'Fund approval'],
];
export function articlesOf(j) {
  const arr = j?.articles || j?.data || j?.news || (Array.isArray(j) ? j : []);
  return Array.isArray(arr) ? arr : [];
}
export async function cryptoNews() {
  const j = await getJSON(`${cfg.cryptoBase}/api/news?limit=80`);
  const arts = articlesOf(j).map((a) => ({
    title: String(a.title || ''),
    source: String(typeof a.source === 'object' ? a.source?.name : a.source || 'unknown'),
    ts: Date.parse(a.pubDate || a.publishedAt || a.published_at || '') || Date.now(),
  }));
  const out = [];
  for (const [kind, re, label] of CRYPTO_KINDS) {
    const hits = arts.filter((a) => re.test(a.title));
    const outlets = new Set(hits.map((h) => h.source));
    if (hits.length < 2 || outlets.size < 2) continue;
    out.push({
      id: 'crypto:' + kind, kind, layer: 'crypto', place: 'Crypto markets',
      title: `${label}: ${hits[0].title}`.slice(0, 130), lat: null, lng: null,
      size: clamp(hits.length / 6), sources: outlets.size,
      ts: Math.max(...hits.map((h) => h.ts)), src: 'cryptocv',
    });
  }
  return out;
}
