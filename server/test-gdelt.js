// Tests the GDELT event-file reader with made-up rows and a hand-built zip.
import assert from 'node:assert/strict';
import zlib from 'node:zlib';
import { COL, kindOf, parseExport, aggregate, slugTitle, unzipFirst, stepBack, momentumSnapshot } from './feeds/gdelt.js';
import { analyze } from './engine.js';

const now = new Date();
const stamp = now.toISOString().replace(/[-:T]/g, '').slice(0, 14);
function row({ root, base, gt = '4', lat, lng, name, mentions, sources, url = '' }) {
  const c = Array(61).fill('');
  c[COL.rootCode] = root; c[COL.baseCode] = base; c[COL.geoType] = gt; c[COL.geoName] = name;
  c[COL.lat] = String(lat); c[COL.lng] = String(lng); c[COL.mentions] = String(mentions); c[COL.sources] = String(sources);
  c[COL.added] = stamp; c[COL.url] = url;
  return c.join('\t');
}
const text = [
  row({ root: '19', base: '195', lat: 26.5, lng: 56.3, name: 'Strait of Hormuz, Iran', mentions: 150, sources: 5, url: 'https://news.example.com/world/2026/10/tanker-struck-near-strait-of-hormuz' }),
  row({ root: '19', base: '195', lat: 26.5, lng: 56.3, name: 'Strait of Hormuz, Iran', mentions: 100, sources: 4 }),
  row({ root: '19', base: '194', lat: 26.6, lng: 56.4, name: 'Strait of Hormuz, Iran', mentions: 80, sources: 3 }),
  row({ root: '18', base: '186', gt: '3', lat: 40.7, lng: -74, name: 'New York, United States', mentions: 900, sources: 40 }),   // crime story: skipped
  row({ root: '19', base: '190', gt: '1', lat: 32, lng: 53, name: 'Iran', mentions: 900, sources: 40 }),                                // country centroid: skipped
  row({ root: '19', base: '193', lat: 10, lng: 10, name: 'Nowhere', mentions: 5, sources: 1 }),                                       // too thin: dropped
  row({ root: '17', base: '172', lat: 55.7, lng: 37.6, name: 'Moscow, Russia', mentions: 200, sources: 8, url: 'https://news.example.com/world/2026/10/new-sanctions-announced-on-russian-oil' }),
  row({ root: '19', base: '191', lat: 14, lng: 42.5, name: 'Red Sea', mentions: 120, sources: 9, url: 'https://news.example.com/world/2026/10/houthi-blockade-hits-shipping-lanes' }),
  row({ root: '18', base: '183', lat: 31.4, lng: 34.3, name: 'Gaza, Israel', mentions: 300, sources: 14, url: 'https://news.example.com/world/2026/10/missile-strike-hits-gaza-city-center' }),
  row({ root: '19', base: '193', lat: 31.2, lng: 32.3, name: 'Suez Canal, Egypt', mentions: 130, sources: 6, url: 'https://news.example.com/world/2026/10/dockworkers-strike-halts-operations-at-port' }),
  row({ root: '15', base: '154', lat: 12.8, lng: 45, name: 'Aden, Yemen', mentions: 110, sources: 5, url: 'https://news.example.com/world/2026/10/severe-drought-threatens-yemen-food-supplies' }),
  'short\tline',
].join('\n');

// kinds
assert.equal(kindOf('19', '191'), 'blockade');
assert.equal(kindOf('18', '186'), null);
assert.equal(kindOf('18', '183'), 'conflict');
assert.equal(kindOf('19', '193', 'dockworkers strike halts operations at port'), 'strike');
assert.equal(kindOf('19', '193', 'tanker struck near strait'), 'conflict');
assert.equal(kindOf('17', '172'), 'sanction');
assert.equal(kindOf('15', '154'), 'drought');

// parsing keeps only usable rows
const rows = parseExport(text);
assert.equal(rows.length, 9, 'crime, country-level and short rows are skipped');

// grouping and thresholds
const evs = aggregate(rows);
assert.equal(evs.length, 6, 'thin cell dropped');
const hormuz = evs.find((e) => e.kind === 'conflict' && e.place.startsWith('Strait'));
assert.ok(hormuz && hormuz.sources === 12 && hormuz.size > 0.5 && hormuz.size < 0.7);
assert.equal(hormuz.title, 'Tanker struck near strait of hormuz');
assert.equal(evs.find((e) => e.kind === 'blockade').layer, 'trade');
assert.equal(evs.find((e) => e.kind === 'sanction').layer, 'policy');
assert.ok(Math.abs(hormuz.ts - Date.now()) < 24 * 3600000);

// the rules engine links these to assets
const r = analyze(evs, { stats: {}, aiWhy: new Map(), sentiment: {} });
assert.ok(r.signals.find((s) => s.eventId === hormuz.id && s.asset === 'USO' && s.dir === 1), 'Hormuz fighting leads to an oil signal');
assert.ok(r.signals.find((s) => s.asset === 'ZIM'), 'Red Sea blockade leads to a shipping signal');

// headline helper
assert.equal(slugTitle('https://x.com/a/12345678'), '');
assert.equal(slugTitle('https://x.com/news/army-hits-port-city-after-talks-fail.html'), 'Army hits port city after talks fail');

// zip reader (hand-built zip with deflate)
function makeZip(name, data) {
  const comp = zlib.deflateRawSync(data), nm = Buffer.from(name);
  const lh = Buffer.alloc(30); lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(8, 8);
  lh.writeUInt32LE(comp.length, 18); lh.writeUInt32LE(data.length, 22); lh.writeUInt16LE(nm.length, 26);
  const cd = Buffer.alloc(46); cd.writeUInt32LE(0x02014b50, 0); cd.writeUInt16LE(20, 4); cd.writeUInt16LE(20, 6); cd.writeUInt16LE(8, 10);
  cd.writeUInt32LE(comp.length, 20); cd.writeUInt32LE(data.length, 24); cd.writeUInt16LE(nm.length, 28); cd.writeUInt32LE(0, 42);
  const body = Buffer.concat([lh, nm, comp]);
  const eo = Buffer.alloc(22); eo.writeUInt32LE(0x06054b50, 0); eo.writeUInt16LE(1, 8); eo.writeUInt16LE(1, 10);
  eo.writeUInt32LE(46 + nm.length, 12); eo.writeUInt32LE(body.length, 16);
  return Buffer.concat([body, cd, nm, eo]);
}
const zipped = makeZip('20261011120000.export.CSV', Buffer.from(text));
assert.equal(unzipFirst(zipped).toString(), text);
assert.throws(() => unzipFirst(Buffer.from('not a zip at all, just text padding padding')), /Not a zip/);

// file name stepping
assert.equal(stepBack('20261011120000'), '20261011114500');
assert.equal(stepBack('20261101000000'), '20261031234500');

// momentum / density (Round 11)
 const mEmpty = momentumSnapshot(new Map());
 assert.equal(mEmpty.empty, true);
 assert.equal(mEmpty.spanHours, 6);
 const mRows = [{ name: 'Strait of Hormuz, Iran', url: 'https://x.com/oil-tanker-strait-hormuz', kind: 'conflict', mentions: 200, tone: -6 }, { name: 'Riyadh', url: 'https://x.com/aramco-oil-riyadh', kind: 'conflict', mentions: 120, tone: -4 }];
 const win2 = new Map([['20261109140000', mRows]]);
 const m2 = momentumSnapshot(win2);
 assert.equal(m2.empty, false);
 assert.ok(m2.assets.USO && m2.assets.USO.mentions > 0, 'USO momentum present');
 assert.equal(m2.assets.USO.spark.length, 24);
 assert.equal(m2.spanHours, 6);
 console.log('all GDELT tests passed');
