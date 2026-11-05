import { RULES } from '../rules.js';
const UA = { 'User-Agent': 'Foxhole/1.0 (personal project)' };
const MAX_BACKOFF = 10 * 60 * 1000;

export const live = {
  quakes: { status: 'waiting', lastUpdated: null, error: '', data: [] },
  eonet: { status: 'waiting', lastUpdated: null, error: '', data: [] },
  aircraft: { status: 'waiting', lastUpdated: null, error: '', data: [] },
};

const listeners = new Set();
export const onChange = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
const emit = (name) => { for (const fn of listeners) { try { fn(name); } catch { /* intentional: listener failures must not break emit */ } } };

async function getJSON(url, ms = 20000) {
  const r = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' }, signal: AbortSignal.timeout(ms) });
  const raw = await r.text();
  if (!r.ok) throw new Error('HTTP ' + r.status);
  try { return JSON.parse(raw); } catch { throw new Error('Not JSON'); }
}

function poll(key, baseMs, fetchFn) {
  const s = live[key];
  const run = async () => {
    let delay = baseMs;
    try {
      s.data = await fetchFn();
      s.status = 'ok'; s.error = ''; s.lastUpdated = Date.now();
      s._fails = 0;
    } catch (e) {
      s._fails = (s._fails || 0) + 1;
      s.error = e.message;
      s.status = s.lastUpdated && Date.now() - s.lastUpdated < baseMs * 3 ? 'stale' : 'error';
      delay = Math.min(MAX_BACKOFF, baseMs * 2 ** s._fails);
    }
    emit(key);
    setTimeout(run, delay);
  };
  run();
}

async function fetchQuakes() {
  const url = process.env.FOXHOLE_QUAKES_URL || 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_day.geojson';
  const j = await getJSON(url);
  if (!Array.isArray(j.features)) throw new Error('USGS reply had no features list');
  return j.features.filter((f) => f.geometry?.coordinates).map((f) => ({
    id: f.id, magnitude: f.properties.mag ?? 0, place: f.properties.place || 'unknown place', time: f.properties.time, lat: f.geometry.coordinates[1], lon: f.geometry.coordinates[0]
  }));
}

async function fetchEonet() {
  const j = await getJSON('https://eonet.gsfc.nasa.gov/api/v3/events?status=open&limit=100');
  if (!Array.isArray(j.events)) throw new Error('EONET reply had no events list');
  const out = [];
  for (const e of j.events) {
    const g = e.geometry?.[e.geometry.length - 1];
    if (!g) continue;
    let c = g.coordinates;
    if (g.type === 'Polygon') c = c?.[0]?.[0];
    if (!Array.isArray(c) || typeof c[0] !== 'number') continue;
    if (e.title && e.title.toLowerCase().startsWith('prescribed fire')) continue;
    out.push({ id: e.id, title: e.title, category: e.categories?.[0]?.id || 'unknown', lat: c[1], lon: c[0], date: g.date });
  }
  return out;
}

async function fetchAircraft() {
  const j = await getJSON('https://api.adsb.lol/v2/mil');
  if (!Array.isArray(j.ac)) throw new Error('adsb.lol reply had no aircraft list');
  return j.ac.filter((a) => typeof a.lat === 'number' && typeof a.lon === 'number').map((a) => ({
    hex: a.hex, callsign: (a.flight || '').trim(), type: a.t || '', lat: a.lat, lon: a.lon,
    altitude: typeof a.alt_baro === 'number' ? a.alt_baro : null, speed: a.gs ?? null, heading: a.track ?? null,
  }));
}

const STORM_MAX_DAYS = 3;
const MIL_THRESH = 3;
const testEvents = [];

export function liveEvents() {
  const out = [];
  for (const q of live.quakes.data) {
    out.push({ id: 'usgs:' + q.id, kind: 'quake', layer: 'nature', title: 'M' + Number(q.magnitude).toFixed(1) + ' earthquake', place: q.place, lat: q.lat, lng: q.lon, mag: q.magnitude, size: Math.min(1, Math.max(0, (q.magnitude - 4.5) / 3.5)), sources: 1, ts: q.time, src: 'usgs' });
  }
  for (const e of live.eonet.data) {
    const kind = { wildfires: 'wildfire', severeStorms: 'storm', volcanoes: 'volcano', floods: 'flood', drought: 'drought' }[e.category];
    if (!kind) continue;
    if (e.title && e.title.toLowerCase().startsWith('prescribed fire')) continue;
    const ts = Date.parse(e.date) || Date.now();
    if (kind === 'storm') {
      const ageDays = (Date.now() - ts) / (1000 * 60 * 60 * 24);
      if (ageDays > STORM_MAX_DAYS) continue;
    }
    out.push({ id: 'eonet:' + e.id, kind, layer: 'nature', title: e.title, place: e.title, lat: e.lat, lng: e.lon, size: 0.4, sources: 1, ts, src: 'eonet' });
  }
  const boxes = RULES.filter((r) => r.match.box).map((r) => ({ id: r.id, box: r.match.box, title: r.title }));
  for (const b of boxes) {
    if (b.id === 'box-gulf-mexico' || b.id === 'box-midwest') continue;
    const inside2 = live.aircraft.data.filter((a) => a.lat >= b.box[0] && a.lat <= b.box[1] && a.lon >= b.box[2] && a.lon <= b.box[3]);
    if (inside2.length >= MIL_THRESH) {
      const lat = inside2.reduce((s, a) => s + a.lat, 0) / inside2.length;
      const lng = inside2.reduce((s, a) => s + a.lon, 0) / inside2.length;
      out.push({ id: 'mil:' + b.id, kind: 'cluster', layer: 'military', title: inside2.length + ' military aircraft in ' + b.title, place: b.title, lat, lng, size: Math.min(1, inside2.length / 20), sources: 1, ts: live.aircraft.lastUpdated || Date.now(), src: 'adsb', count: inside2.length });
    }
  }
  if (testEvents.length) out.push(...testEvents.map((e) => ({ ...e })));
  return out;
}

export function addTestEvent(body) {
  const ev = {
    id: 'test:' + Date.now(),
    title: String(body.title || 'Test event'),
    kind: String(body.kind || 'conflict'),
    layer: body.layer || (body.kind === 'quake' ? 'nature' : body.kind === 'cluster' ? 'military' : 'conflict'),
    place: body.place || String(body.title || 'Test event'),
    lat: Number(body.lat),
    lng: body.lng != null ? Number(body.lng) : Number(body.lon),
    size: Number(body.size ?? 0.5),
    sources: body.sources || 1,
    ts: Date.now(),
    src: 'test',
  };
  testEvents.push(ev);
  emit('test');
  return ev;
}

export function startLivePollers() {
  poll('quakes', 60000, fetchQuakes);
  poll('eonet', 300000, fetchEonet);
  poll('aircraft', 15000, fetchAircraft);
}
