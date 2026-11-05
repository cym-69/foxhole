// Mock AISStream server for Foxhole. Local only, no real key needed.
// Usage: node tools/mock-ais.mjs   (listens on ws://127.0.0.1:9100)
import { WebSocketServer } from 'ws';

const PORT = Number(process.env.MOCK_AIS_PORT || 9100);
const _HORMUZ = [[24, 54], [27.5, 57.5]];
const TYPES = ['PositionReport', 'ShipStaticData'];

const wss = new WebSocketServer({ host: '127.0.0.1', port: PORT });
console.log(`mock-ais listening on ws://127.0.0.1:${PORT}`);

function bin(obj) { return Buffer.from(JSON.stringify(obj), 'utf8'); }
const jitter = (v) => Math.round((v + (Math.random() - 0.5) / 8) * 10000) / 10000;

function position(mmsi, name, lat, lng, sog, cog) {
  return {
    MessageId: Math.floor(Math.random() * 1e9),
    MessageType: 'PositionReport',
    MetaData: { MMSI: mmsi, ShipName: name, Latitude: jitter(lat), Longitude: jitter(lng), time_utc: new Date().toISOString() },
    Message: {
      PositionReport: {
        Cog: jitter(cog),
        Latitude: jitter(lat),
        Longitude: jitter(lng),
        Sog: jitter(sog),
        TrueHeading: Math.round(cog),
        NavigationalStatus: 0,
        Timestamp: Math.floor(Date.now() / 1000) % 60,
      },
    },
  };
}

function staticData(mmsi, name, type) {
  return {
    MessageId: Math.floor(Math.random() * 1e9),
    MessageType: 'ShipStaticData',
    MetaData: { MMSI: mmsi, ShipName: name, Latitude: 0, Longitude: 0, time_utc: new Date().toISOString() },
    Message: { ShipStaticData: { Type: type, Name: name, CallSign: 'MOCK' + mmsi, Destination: 'MOCK' } },
  };
}

function checkSub(msg) {
  if (!msg || typeof msg !== 'object') return 'no json';
  if (typeof msg.APIKey !== 'string' || msg.APIKey.trim() === '') return 'missing APIKey';
  if (!Array.isArray(msg.BoundingBoxes) || msg.BoundingBoxes.length !== 6) return 'need 6 BoundingBoxes';
  for (const b of msg.BoundingBoxes) {
    if (!Array.isArray(b) || b.length !== 2) return 'a BoundingBox needs 2 corners';
    for (const c of b) if (!Array.isArray(c) || c.length !== 2 || !c.every((n) => typeof n === 'number' && Number.isFinite(n))) return 'a corner needs 2 numbers';
  }
  if (!Array.isArray(msg.FilterMessageTypes) || msg.FilterMessageTypes.length === 0) return 'missing FilterMessageTypes';
  for (const t of TYPES) if (!msg.FilterMessageTypes.includes(t)) return 'FilterMessageTypes missing ' + t;
  return null;
}

const frames = [];
// 10 inside the Hormuz box
for (let i = 0; i < 10; i++) {
  const mmsi = 4_000_000_100 + i;
  frames.push(position(mmsi, `HORMUZ TANKER ${i + 1}`, 24.5 + i * 0.25, 54.8 + i * 0.25, 9 + i / 10, 30 + i));
}
// 10 in the other boxes
const spots = [
  [12.5, 43.0, 50_100_001, 'RED SEA CARGO 1', 2.0],
  [13.1, 44.0, 50_100_002, 'RED SEA TANKER 2', 2.0],
  [30.0, 32.0, 50_100_003, 'SUEZ CARGO 1', 2.0],
  [31.0, 32.6, 50_100_004, 'SUEZ BULK 2', 2.0],
  [42.0, 29.0, 60_100_005, 'BLACK SEA TANKER 1', 2.0],
  [44.0, 34.0, 60_100_006, 'BLACK SEA CARGO 2', 2.0],
  [7.5, -79.8, 60_100_007, 'PANAMA TANKER 1', 2.0],
  [9.0, -79.5, 60_100_008, 'PANAMA BULK 2', 2.0],
  [22.1, 119.0, 70_100_009, 'TAIWAN CARGO 1', 2.0],
  [25.5, 121.5, 70_100_010, 'TAIWAN TANKER 2', 2.0],
];
for (const [lat, lng, mmsi, name, sog] of spots) frames.push(position(mmsi, name, lat, lng, sog, 120));
// 10 static data frames, Type mix of 80, 70, 30
const mixes = [80, 80, 80, 80, 70, 70, 70, 70, 30, 30];
for (let i = 0; i < 10; i++) {
  const mmsi = i < 10 ? 4_000_000_100 + i : 4_000_000_200 + i;
  frames.push(staticData(mmsi, `HORMUZ TANKER ${(i % 10) + 1}`, mixes[i]));
}

wss.on('connection', (ws) => {
  console.log('mock-ais: client connected');
  let ok = false;
  ws.on('message', (raw) => {
    if (ok) return;
    let msg = null;
    try { msg = JSON.parse(raw.toString('utf8')); } catch { ws.send(bin({ error: 'bad subscription' })); return; }
    const why = checkSub(msg);
    if (why) { ws.send(bin({ error: 'bad subscription: ' + why })); return; }
    ok = true;
    console.log(`mock-ais: subscription ok (${msg.BoundingBoxes.length} boxes, types ${msg.FilterMessageTypes.join(',')})`);
    ws.send(bin({ MessageId: 1, MessageType: 'SubscriptionConfirmation', SubscriptionConf: { compression: true, filters: { FilterMessageTypes: msg.FilterMessageTypes } } }));
    for (const f of frames) ws.send(bin(f), { binary: true });
    // Trickle one fresh position so the feed stays ok while the mock is up
    const t = setInterval(() => {
      if (ws.readyState !== 1) { clearInterval(t); return; }
      ws.send(bin(position(4_000_000_100, 'HORMUZ TANKER 1', 24.5 + Math.random() / 20, 54.8 + Math.random() / 20, 9.2, 30)), { binary: true });
    }, 10000);
    ws.on('close', () => clearInterval(t));
  });
  ws.on('error', () => {});
});
