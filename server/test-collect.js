// Deterministic collect() honesty tests (PRODUCT_GOAL: demo/live/stale labels, source-failure).
import assert from 'node:assert/strict';
import { collectEvents } from './collect.js';

const now = Date.now();
const ev = (id, ts = now - 1000) => ({ id, ts, title: id });
const ok = (evs = []) => ({ ok: true, ev: evs });
const fail = () => ({ ok: false, ev: [] });
const demo = () => [ev('demo:1')];
const primaries = (o) => ({ usgs: fail(), eonet: fail(), cryptocv: fail(), gdelt: fail(), ...o });

// demoForced always wins
{
  const r = collectEvents({ primary: primaries({ usgs: ok([ev('u1')]) }), liveEvents: [], demoEvents: demo, demoForced: true, now });
  assert.equal(r.demo, true);
  assert.equal(r.events[0].id, 'demo:1');
}

// All primaries fail, no aux events -> demo (honest unavailable/failed state)
{
  const r = collectEvents({ primary: primaries(), liveEvents: [], demoEvents: demo, demoForced: false, now });
  assert.equal(r.demo, true);
}

// Quiet live feed: primary ok but returned 0 events, no aux -> NOT demo (feed is healthy, just quiet)
{
  const r = collectEvents({ primary: primaries({ usgs: ok([]) }), liveEvents: [], demoEvents: demo, demoForced: false, now });
  assert.equal(r.demo, false);
  assert.equal(r.events.length, 0);
  assert.equal(r.liveSources, 1);
}

// Live auxiliary poller has events despite all primaries failing -> NOT demo
{
  const r = collectEvents({ primary: primaries(), liveEvents: [ev('aux:1')], demoEvents: demo, demoForced: false, now });
  assert.equal(r.demo, false);
  assert.ok(r.events.some(e => e.id === 'aux:1'));
  assert.equal(r.auxCount, 1);
}

// Primary ok with events -> live, includes aux
{
  const r = collectEvents({ primary: primaries({ eonet: ok([ev('p1')]) }), liveEvents: [ev('aux:1')], demoEvents: demo, demoForced: false, now });
  assert.equal(r.demo, false);
  assert.equal(r.events.length, 2);
}

// Stale events (>72h) filtered; if that empties everything and no live primary contributed fresh? liveSources still counts ok primaries
{
  const stale = ev('old', now - 73 * 3600 * 1000);
  const r = collectEvents({ primary: primaries({ usgs: ok([stale]) }), liveEvents: [], demoEvents: demo, demoForced: false, now });
  assert.equal(r.demo, false); // usgs is ok (healthy source), quiet != demo
  assert.equal(r.events.length, 0);
}

// Dedupe by id
{
  const r = collectEvents({ primary: primaries({ usgs: ok([ev('x')]), eonet: ok([ev('x')]) }), liveEvents: [ev('x')], demoEvents: demo, demoForced: false, now });
  assert.equal(r.events.filter(e => e.id === 'x').length, 1);
}

console.log('all collect tests passed');
