// askAi fixture tests (no network): each question type, no hallucinated citations.
import assert from 'node:assert/strict';
import { askAi, classifyQuestion, parseWindowMinutes, handleWhyOil } from './ai-ask.js';
const NOW = Date.now();
const MIN = 60 * 1000;
const ctx = {
  now: NOW,
  momentumDensity: 0.42,
  trad: { USO: { price: 72.5, pct: 1.5, ts: NOW - 2 * MIN } },
  crypto: {},
  events: [
    { id: 'e1', title: 'Gulf oil tanker attack near strait', place: 'Strait of Hormuz', ts: NOW - 5 * MIN, src: 'gdelt', url: 'https://gdelt.example/1' },
    { id: 'e2', title: 'M5.4 earthquake off coast', place: 'Hormuz region', ts: NOW - 8 * MIN, src: 'usgs', url: 'https://usgs.example/2' },
    { id: 'e3', title: 'Old distant event', place: 'Elsewhere far', ts: NOW - 300 * MIN, src: 'usgs', url: 'https://usgs.example/3' },
  ],
  context: [],
  headlines: [
    { id: 'h1', text: 'OPEC weighs output cut as crude jumps', ts: NOW - 3 * MIN, src: 'bbc', srcName: 'BBC World', kind: 'news', url: 'https://bbc.example/oil' },
    { id: 'h2', text: 'Quiet equities day', ts: NOW - 50 * MIN, src: 'npr', srcName: 'NPR', kind: 'news', url: 'https://npr.example/quiet' },
  ],
};
// every fact must cite only fixture sources/urls — no hallucination
function assertCited(ans) {
  const allowed = new Set(['https://gdelt.example/1','https://usgs.example/2','https://usgs.example/3','https://bbc.example/oil','https://npr.example/quiet','']);
  for (const f of ans.facts) { assert.ok(typeof f.text === 'string' && f.text.length > 0, 'fact text'); assert.ok(f.ts > 0, 'fact ts'); assert.ok(allowed.has(f.url), 'url must be a fixture url, got ' + f.url); }
}
const run = async () => {
  assert.equal(classifyQuestion('What happened in the last 10 minutes?'), 'last-window');
  assert.equal(classifyQuestion('Why is oil moving?'), 'why-oil');
  assert.equal(classifyQuestion('What simultaneous events are happening?'), 'simultaneous');
  assert.equal(parseWindowMinutes('last 10 minutes'), 10);
  assert.equal(parseWindowMinutes('last 2 hours'), 120);
  assert.equal(parseWindowMinutes('what happened'), 60);
  const a = await askAi('What happened in the last 10 minutes?', ctx);
  assert.ok(a.facts.length >= 2, 'last-window returns >=2 facts');
  assert.ok(!a.facts.some((f) => f.text.includes('Old distant event')), 'old event excluded from 10m window');
  assert.equal(typeof a.interpretation, 'string'); assert.ok(a.interpretation.length > 0);
  assert.equal(typeof a.uncertainty, 'string');
  assert.equal(a.freshness.buckets.fresh, a.facts.length, 'all fixture facts fresh');
  assertCited(a);
  const b = await askAi('Why is oil moving?', ctx);
  assert.ok(b.facts.every((f) => f.text.indexOf('%') === -1 || f.text.indexOf('USO') > -1), 'pct only in price fact');
  assert.ok(b.facts.length >= 2, 'why-oil has price+related');
  assert.ok(b.facts.some((f) => f.text.includes('USO')), 'USO price fact present');
  assert.ok(b.facts.some((f) => /hormuz|oil|crude|opec/i.test(f.text)), 'related oil row present');
  assertCited(b);
  const c = await askAi('Simultaneous events in the last 15 minutes?', ctx);
  assert.ok(c.facts.length >= 2); assertCited(c);
  assert.ok(typeof c.interpretation === 'string' && c.interpretation.length > 0);
  // no-fabrication: unknown question with empty ctx returns empty facts, honest interpretation
  const d = await askAi('What happened in the last 5 minutes?', { now: NOW, events: [], context: [], headlines: [], trad: {}, momentumDensity: 0 });
  assert.deepEqual(d.facts, []); assert.ok(/No state rows/.test(d.interpretation));
  // why-oil with no USO quote and no related rows: honest empty
  const e2 = handleWhyOil('Why is oil moving?', { now: NOW, trad: {}, events: [], headlines: [] });
  assert.equal(e2.facts.length, 0); assert.ok(/nothing honest/.test(e2.interpretation));
  const e = handleWhyOil('Why is oil moving?', { now: NOW, trad: {}, events: [], headlines: [], momentumDensity: 0 });
  assert.ok(e.facts.length >= 1); assert.ok(e.facts.some((f) => f.source === 'GDELT momentum')); assertCited({ facts: e.facts });
  await assert.rejects(() => askAi('', ctx), /Question is required/);
  console.log('all ai-ask tests passed');
};
run().catch((e) => { console.error(e); process.exit(1); });
