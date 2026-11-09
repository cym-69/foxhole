// NWS adapter tests (no network): normalization + fetch with fake fetch.
import assert from 'node:assert/strict';
import { normalizeNwsFeature, normalizeNwsPayload, fetchNws, POINT_LIST, nwsSize } from './feeds/nws.js';

assert.equal(POINT_LIST.length, 4);
assert.ok(POINT_LIST.some((p) => p.name === 'New York' && p.lat === 40.7128));
assert.equal(nwsSize('Extreme'), 1);
assert.equal(nwsSize('severe'), 0.85);
assert.equal(nwsSize('Moderate'), 0.65);
assert.equal(nwsSize('Minor'), 0.45);
assert.equal(nwsSize('unknown'), 0.3);

const f = {
  id: 'https://api.weather.gov/alerts/urn:oid:2.49.0.1.840.0.test',
  properties: {
    id: 'urn:oid:2.49.0.1.840.0.test',
    event: 'Tornado Warning',
    areaDesc: 'Test County',
    severity: 'Extreme',
    effective: '2026-11-09T08:00:00Z',
    onset: '2026-11-09T08:00:00Z',
  },
  geometry: { type: 'Point', coordinates: [-74.0, 40.7] },
};
const ev = normalizeNwsFeature(f, { lat: 40.7128, lng: -74.006 });
assert.ok(ev);
assert.equal(ev.id, 'nws:urn:oid:2.49.0.1.840.0.test');
assert.equal(ev.kind, 'storm');
assert.equal(ev.layer, 'nature');
assert.equal(ev.title, 'Tornado Warning');
assert.equal(ev.place, 'Test County');
assert.equal(ev.lat, 40.7);
assert.equal(ev.lng, -74.0);
assert.equal(ev.size, 1);
assert.equal(ev.src, 'nws');
assert.ok(typeof ev.ts === 'number');

assert.equal(normalizeNwsFeature({ properties: {} }, POINT_LIST[0]), null);
assert.throws(() => normalizeNwsPayload({}, POINT_LIST[0]), /no features/);
assert.deepEqual(normalizeNwsPayload({ features: [] }, POINT_LIST[0]), []);

// fetchNws with fake fetch: one feature for NYC, empty elsewhere
// (calls counter omitted — unused var would break eslint no-unused-vars)
const fake = async (url) => {
  const isNyc = url.includes('40.7128,-74.006');
  return { ok: true, json: async () => ({ features: isNyc ? [f] : [] }) };
};
const rows = await fetchNws(fake);
assert.equal(rows.length, 1);
assert.equal(rows[0].kind, 'storm');

console.log('all nws tests passed');
