// Stream normalizer tests (no network): dedupe/cap/freshness/buildStream.
import assert from 'node:assert/strict';
import { normalizeEvent, dedupeEvents, freshnessOf, buildStream } from './feeds/stream.js';

const now = Date.now();
assert.equal(freshnessOf(now, now), 'fresh');
assert.equal(freshnessOf(now - 30 * 3600 * 1000, now), 'stale');
assert.equal(freshnessOf(now - 100 * 3600 * 1000, now), 'old');

const n = normalizeEvent({ id: 'usgs:1', kind: 'quake', title: 'M5 quake', place: 'X', lat: 1, lon: 2, ts: now, src: 'usgs', url: 'https://a' }, now);
assert.deepEqual(Object.keys(n).sort(), ['fresh', 'id', 'kind', 'lat', 'lng', 'place', 'provider', 'source', 'title', 'ts', 'url'].sort());
assert.equal(n.source, 'usgs');
assert.equal(n.provider, 'usgs');
assert.equal(n.fresh, 'fresh');
assert.equal(n.lng, 2);
assert.equal(normalizeEvent({}, now), null);
assert.equal(normalizeEvent(null, now), null);

const dup = dedupeEvents([
  { id: 'a', ts: now - 1000, kind: 'quake', src: 'usgs' },
  { id: 'a', ts: now - 500, kind: 'quake', src: 'usgs' },
  { id: 'b', ts: now, kind: 'storm', src: 'nws' },
], 10);
assert.equal(dup.length, 2);
assert.equal(dup[0].id, 'b'); // ts desc

const many = Array.from({ length: 400 }, (_, i) => ({ id: 'e' + i, ts: now - i, src: 's' }));
assert.equal(dedupeEvents(many).length, 300);

const rows = buildStream({
  events: [{ id: 'usgs:1', kind: 'quake', title: 'Q', ts: now, src: 'usgs' }],
  context: [{ id: 'nws:x', kind: 'storm', title: 'S', ts: now - 1000, src: 'nws' }],
  headlines: [{ id: 'h1', text: 'Breaking', ts: now - 2000, src: 'bbc', srcName: 'BBC', kind: 'news', url: 'https://h' }],
}, now);
assert.equal(rows.length, 3);
assert.ok(rows.every((r) => typeof r.id === 'string' && typeof r.fresh === 'string'));
// dedupe across events/context same id
const rows2 = buildStream({ events: [{ id: 'x', ts: now }], context: [{ id: 'x', ts: now - 1 }], headlines: [] }, now);
assert.equal(rows2.length, 1);

console.log('all stream tests passed');
