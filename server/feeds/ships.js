import WebSocket from 'ws';
import { live, getContextEvents } from './live.js';

const DEFAULT_AIS_URL = 'wss://stream.aisstream.io/v0/stream';
const TTL = 15 * 60 * 1000;       // drop a vessel not updated for 15 minutes
export const SHIP_SWEEP = 60 * 1000;   // sweep every 60 seconds
export const SHIP_FRESH = 120 * 1000;  // ok only if a message arrived in the last 120 seconds
export const SHIP_MAX = 3000;          // vessel cap (drop the oldest)
const SUB_MIN_GAP = 1000;              // never send two subscriptions within 1 second
const START_BACKOFF = 2000;            // start 2 seconds
const MAX_BACKOFF = 5 * 60 * 1000;     // max 5 minutes
export const SHIP_TYPES = ['PositionReport', 'ShipStaticData'];

// Six watch boxes. Each is [[lat1, lon1], [lat2, lon2]].
export const SHIP_BOXES = [
  { id: 'hormuz', label: 'Hormuz', box: [[24, 54], [27.5, 57.5]] },
  { id: 'redsea', label: 'Red Sea', box: [[11, 42], [14, 45]] },
  { id: 'suez', label: 'Suez', box: [[29, 31.5], [32, 33.3]] },
  { id: 'blacksea', label: 'Black Sea', box: [[41, 28], [47, 41]] },
  { id: 'panama', label: 'Panama', box: [[6.5, -81], [10, -78.5]] },
  { id: 'taiwan', label: 'Taiwan', box: [[21, 118], [26.5, 123]] },
];

// AISStream ships status lives in the same `live` object the API and SSE read.
live.ships = { status: 'no key', lastUpdated: null, error: '', data: [] };

const vessels = new Map(); // mmsi -> { mmsi, name, lat, lng, sog, cog, heading, cls, lastSeen }
let sock = null;
let stopped = true;
let attempt = 0;
let lastMsgAt = 0;
let lastSubAt = 0;
let subTimer = null;
let sweepTimer = null;
const loggedKeys = new Set();

const log = (m) => console.log('ships: ' + m);
const logOnce = (tag, m) => { if (!loggedKeys.has(tag)) { loggedKeys.add(tag); log(m); } };

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v)) ? Number(v) : null));

// 70-79 cargo, 80-89 tanker, anything else other.
export function shipClass(type) {
  const t = num(type);
  if (t === null) return 0;
  if (t >= 70 && t <= 79) return 1;
  if (t >= 80 && t <= 89) return 2;
  return 0;
}

// Integer ship type from ShipStaticData. Falls back to any case-insensitive *type* key.
export function staticType(sd) {
  if (!sd || typeof sd !== 'object') return null;
  if (num(sd.Type) !== null) return num(sd.Type);
  const key = Object.keys(sd).find((k) => /^.*type/i.test(k) && num(sd[k]) !== null);
  return key ? num(sd[key]) : null;
}

export function inBox(v, b) {
  return v.lat >= b[0][0] && v.lat <= b[1][0] && v.lng >= b[0][1] && v.lng <= b[1][1];
}

// Key names only, never values: confirms the field names without leaking the key or traffic.
function logKeyNames(tag, msg, realMode) {
  if (!realMode || loggedKeys.has(tag)) return;
  loggedKeys.add(tag);
  const meta = msg.MetaData && typeof msg.MetaData === 'object' ? Object.keys(msg.MetaData) : [];
  const inner = msg.Message && typeof msg.Message === 'object' ? Object.values(msg.Message)[0] : null;
  log(`${tag} keys | top=[${Object.keys(msg)}] MetaData=[${meta}] Message=[${inner && typeof inner === 'object' ? Object.keys(inner) : []}]`);
}

function keyOf(msg) {
  const m = msg.MetaData || {};
  const mmsi = m.MMSI ?? msg.MMSI;
  if (mmsi == null) return null;
  const s = String(mmsi).trim();
  return s === '' ? null : s;
}

function keep(mmsi, v) {
  if (!vessels.has(mmsi) && vessels.size >= SHIP_MAX) {
    let oldest = null;
    for (const [k, x] of vessels) if (!oldest || x.lastSeen < oldest.lastSeen) oldest = { k, lastSeen: x.lastSeen };
    if (oldest) vessels.delete(oldest.k);
  }
  vessels.set(mmsi, v);
}

export function applyPositionReport(msg, now = Date.now()) {
  const mmsi = keyOf(msg);
  if (mmsi === null) return null;
  const pr = (msg.Message && msg.Message.PositionReport) || msg.Message || {};
  const meta = msg.MetaData || {};
  const lat = num(pr.Latitude ?? meta.Latitude);
  const lng = num(pr.Longitude ?? meta.Longitude);
  if (lat === null || lng === null) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null; // invalid position dropped
  const v = vessels.get(mmsi) || { mmsi, name: '', lat: 0, lng: 0, sog: null, cog: null, heading: null, cls: 0, lastSeen: 0 };
  const name = String(meta.ShipName ?? meta.Name ?? '').trim();
  if (name) v.name = name;
  v.lat = lat; v.lng = lng;
  v.sog = num(pr.Sog ?? pr.SpeedOverGround) ?? v.sog;
  v.cog = num(pr.Cog ?? pr.CourseOverGround) ?? v.cog;
  v.heading = num(pr.TrueHeading ?? pr.Heading) ?? v.heading;
  v.lastSeen = now;
  keep(mmsi, v);
  return v;
}

export function applyStaticData(msg, now = Date.now()) {
  const mmsi = keyOf(msg);
  if (mmsi === null) return null;
  const sd = (msg.Message && msg.Message.ShipStaticData) || {};
  const v = vessels.get(mmsi) || { mmsi, name: '', lat: 0, lng: 0, sog: null, cog: null, heading: null, cls: 0, lastSeen: now };
  const name = String((msg.MetaData || {}).ShipName ?? sd.Name ?? '').trim();
  if (name) v.name = name;
  v.cls = shipClass(staticType(sd));
  v.lastSeen = now;
  keep(mmsi, v);
  return v;
}

export function sweep(now = Date.now()) {
  for (const [k, v] of vessels) if (now - v.lastSeen > TTL) vessels.delete(k);
}

export function vesselCount() { return vessels.size; }

// Compact rows for SSE: [mmsi, lat, lng, cog, sog, cls] with cls 0 other, 1 cargo, 2 tanker.
export function shipRows() {
  const out = [];
  for (const v of vessels.values()) {
    out.push([
      /^\d+$/.test(v.mmsi) ? Number(v.mmsi) : v.mmsi,
      Math.round(v.lat * 10000) / 10000,
      Math.round(v.lng * 10000) / 10000,
      Math.round((v.cog ?? 0) * 10) / 10,
      Math.round((v.sog ?? 0) * 10) / 10,
      v.cls,
    ]);
  }
  return out.slice(0, SHIP_MAX);
}

// Names for hover text only, never the key.
export function shipNames() {
  const out = [];
  for (const v of vessels.values()) if (v.name) out.push([v.mmsi, v.name]);
  return out;
}

export function shipBoxes() {
  return SHIP_BOXES.map((b) => {
    let tankers = 0; let cargo = 0; let other = 0;
    for (const v of vessels.values()) {
      if (!inBox(v, b.box)) continue;
      if (v.cls === 2) tankers++;
      else if (v.cls === 1) cargo++;
      else other++;
    }
    // Free fallback without an AIS key: live aircraft are real chokepoint activity.
    // Boxes are tight: widen by 3° for the fallback count so it moves (labelled aircraft, not ships).
    let aircraft = 0;
    if (!vessels.size) {
      for (const a of live.aircraft?.data || []) {
        if (a.lat >= b.box[0][0] - 3 && a.lat <= b.box[1][0] + 3 && a.lon >= b.box[0][1] - 3 && a.lon <= b.box[1][1] + 3) aircraft++;
      }
    }
    // Context events inside the widened box: honest activity in prime space even when aircraft=0.
    // Top event = first by size among in-box events; null when none (zeros are truthful).
    let events = 0;
    let topEvent = null;
    try {
      const inside = getContextEvents().filter((e) => {
        if (typeof e.lat !== "number" || typeof e.lng !== "number") return false;
        return e.lat >= b.box[0][0] - 3 && e.lat <= b.box[1][0] + 3 && e.lng >= b.box[0][1] - 3 && e.lng <= b.box[1][1] + 3;
      });
      events = inside.length;
      if (inside.length) {
        const top = [...inside].sort((a, b) => (b.size || 0) - (a.size || 0))[0];
        topEvent = String(top.title || "").slice(0, 80) || null;
      }
    } catch { /* keep events=0, topEvent=null if context events unavailable in test runtime */ }
    return { id: b.id, tankers, cargo, other, aircraft, events, topEvent, src: vessels.size ? 'ais' : 'aircraft' };
  });
}

export function shipsSnapshot() {
  return { now: Date.now(), rows: shipRows(), boxes: shipBoxes(), names: shipNames() };
}

function refreshStatus(now = Date.now()) {
  if (live.ships.status === 'no key') return;
  if (live.ships.status === 'error') return;
  live.ships.status = lastMsgAt && now - lastMsgAt <= SHIP_FRESH ? 'ok' : 'stale';
  live.ships.data = shipRows();
  live.ships.lastUpdated = lastMsgAt || live.ships.lastUpdated;
}

function handleFrame(raw, realMode) {
  let msg;
  try { msg = JSON.parse(raw); } catch { return; }
  if (!msg || typeof msg !== 'object') return;
  if (msg.error) {
    live.ships.status = 'error';
    live.ships.error = String(msg.error).slice(0, 200);
    log('server error: ' + live.ships.error);
    return;
  }
  const now = Date.now();
  lastMsgAt = now;
  live.ships.status = 'ok';
  live.ships.error = '';
  live.ships.lastUpdated = now;
  const t = msg.MessageType || (msg.Message && Object.keys(msg.Message)[0]);
  if (t === 'SubscriptionConfirmation') {
    const conf = msg.SubscriptionConf || {};
    const compression = conf.compression ?? msg.compression ?? perMessageDeflate;
    logOnce('sub', `subscribed, compression=${compression}`);
  } else if (t === 'PositionReport') {
    logKeyNames('PositionReport', msg, realMode);
    applyPositionReport(msg, now);
  } else if (t === 'ShipStaticData') {
    logKeyNames('ShipStaticData', msg, realMode);
    applyStaticData(msg, now);
  }
  live.ships.data = shipRows();
}

let perMessageDeflate = true;

function backoff() {
  const base = Math.min(MAX_BACKOFF, START_BACKOFF * 2 ** Math.max(0, attempt - 1));
  return base * (0.5 + Math.random() * 0.5);
}

export function startShips(opts = {}) {
  const apiKey = opts.apiKey ?? process.env.AISSTREAM_API_KEY ?? '';
  const envUrl = process.env.FOXHOLE_AIS_URL;
  const urlOverride = opts.url || envUrl || '';
  const url = opts.url || envUrl || DEFAULT_AIS_URL;
  const logFn = opts.log ?? log;
  const wsFactory = opts.wsFactory ?? WebSocket;
  const wsOpts = { perMessageDeflate: opts.perMessageDeflate ?? true };

  stopped = false;
  live.ships.status = 'waiting';

  if ((!apiKey || apiKey === '') && !urlOverride) {
    live.ships.status = 'no key';
    live.ships.error = '';
    logFn('no AISSTREAM_API_KEY, ships layer stays off');
    return () => stopShips();
  }

  const realMode = !/^wss?:\/\/(127\.0\.0\.1|localhost|\[::1\])/i.test(url);

  const connect = () => {
    if (stopped) return;
    let ws;
    try {
      ws = new wsFactory(url, wsOpts);
      perMessageDeflate = wsOpts.perMessageDeflate;
    } catch (e) {
      live.ships.status = 'error';
      live.ships.error = String(e.message || e).slice(0, 200);
      return schedule();
    }
    sock = ws;

    ws.on('open', () => {
      attempt = 0;
      const send = () => {
        if (stopped || sock !== ws || ws.readyState !== 1) return;
        try {
          ws.send(JSON.stringify(buildSubscription(apiKey)));
          lastSubAt = Date.now();
        } catch (e) {
          live.ships.status = 'error';
          live.ships.error = String(e.message || e).slice(0, 200);
        }
      };
      const since = Date.now() - lastSubAt; // never two subscriptions within 1 second
      if (since >= SUB_MIN_GAP) send();
      else { clearTimeout(subTimer); subTimer = setTimeout(send, SUB_MIN_GAP - since); }
    });

    ws.on('message', (data) => {
      attempt = 0;
      const raw = Buffer.isBuffer(data) ? data.toString('utf8') : (typeof data === 'string' ? data : Buffer.from(data).toString('utf8'));
      handleFrame(raw, realMode);
    });

    ws.on('error', (e) => {
      attempt += 1;
      live.ships.status = 'error';
      live.ships.error = String(e.message || e).slice(0, 200);
      logFn('connection error: ' + live.ships.error);
    });

    ws.on('close', () => {
      loggedKeys.delete('sub'); // the next connection logs its own SubscriptionConfirmation
      if (stopped) return;
      attempt += 1;
      if (live.ships.status !== 'error') {
        live.ships.status = lastMsgAt && Date.now() - lastMsgAt <= SHIP_FRESH ? 'stale' : 'error';
      }
      live.ships.data = shipRows();
      schedule();
    });
  };

  const schedule = () => {
    if (stopped) return;
    const d = backoff();
    setTimeout(connect, d);
  };

  connect();
  sweepTimer = setInterval(() => { sweep(); refreshStatus(); }, SHIP_SWEEP);
  return () => stopShips();
}

export function buildSubscription(apiKey) {
  return {
    APIKey: String(apiKey == null ? '' : apiKey),
    BoundingBoxes: SHIP_BOXES.map((b) => [b.box[0], b.box[1]]),
    FilterMessageTypes: SHIP_TYPES.slice(),
  };
}

export function stopShips() {
  stopped = true;
  clearTimeout(subTimer);
  clearInterval(sweepTimer);
  sweepTimer = null;
  try { if (sock) sock.close(); } catch { /* intentional: already closed */ }
  sock = null;
}
