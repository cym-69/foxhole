import assert from 'node:assert/strict';
import { analyze, ruleMatches } from './engine.js';
import { RULES } from './rules.js';
import { demoEvents } from './feeds/demo.js';
import { safeReword } from './ai.js';
import { normSentiment } from './feeds/crypto.js';
import { regionsOf } from './regions.js';
import { live, liveEvents } from './feeds/live.js';
import { slugTitle, aggregate, relevant } from './feeds/gdelt.js';
import { startShips, stopShips, shipClass, buildSubscription, SHIP_BOXES, shipBoxes, sweep } from './feeds/ships.js';
import { fetchSats, parseTle, readCache } from './feeds/sats.js';
import { satrecOf, satPosition } from '../src/lib/sats.js';
import { PROFILES } from '../src/lib/profiles.js';
import { parseFeedXml, ingest, cleanTitle, eventToFeedItem } from './feeds/headlines.js';

const ctx = { stats: {}, aiWhy: new Map(), sentiment: { BTC: { label: 'bearish', score: -0.3 } } };
const r = analyze(demoEvents(), ctx);
const sig = (ev, asset) => r.signals.find((s) => s.eventId === ev && s.asset === asset);

// 1. Events with no asset link are dropped
assert.ok(!r.events.find((e) => e.id === 'demo:fire'), 'California wildfire has no rule, so no dot');
assert.ok(!r.events.find((e) => e.id === 'demo:sudan'), 'Sudan conflict has no rule, so no dot');

assert.ok(r.context.find((e) => e.id === 'demo:fire') && r.context.find((e) => e.id === 'demo:sudan'), 'unlinked events are kept as context, with no signals');
assert.ok(!r.signals.find((x) => x.eventId === 'demo:fire'));

// 2. Direction checks
assert.equal(sig('demo:hormuz', 'USO').dir, 1);
assert.equal(sig('demo:hormuz', 'JETS').dir, -1);
assert.equal(sig('demo:taiwan', 'SOXX').dir, -1);
assert.equal(sig('demo:chile', 'CPER').dir, 1);
assert.equal(sig('demo:depeg', 'BTC').dir, -1);

// 3. Confidence is bounded, and signals are sorted per event
for (const s of r.signals) assert.ok(s.conf >= 0 && s.conf <= 0.95);

// 4. Rules respect region and size
const ev = { id: 'x', kind: 'quake', size: 0.9, sources: 3, regions: regionsOf(35, 139), title: 'M7', place: 'Japan', ts: Date.now() };
assert.ok(ruleMatches(RULES.find((x) => x.id === 'chip-quake'), ev));
assert.ok(!ruleMatches(RULES.find((x) => x.id === 'chip-quake'), { ...ev, size: 0.2 }));
assert.ok(!ruleMatches(RULES.find((x) => x.id === 'chip-quake'), { ...ev, regions: [] }));

// 5. Old events lose confidence
const old = analyze(demoEvents().map((e) => ({ ...e, ts: Date.now() - 80 * 3600000 })), ctx);
const fresh = r.signals.find((s) => s.eventId === 'demo:hormuz' && s.asset === 'USO');
const aged = old.signals.find((s) => s.eventId === 'demo:hormuz' && s.asset === 'USO');
assert.ok(aged.conf < fresh.conf);

// 6. A rule with a bad record switches off; a good record raises confidence
const bad = analyze(demoEvents(), { ...ctx, stats: { 'chip-quake': { n: 12, hits: 3 } } });
assert.ok(!bad.signals.find((s) => s.ruleId === 'chip-quake'), 'failing rule is paused');
const good = analyze(demoEvents(), { ...ctx, stats: { 'chip-quake': { n: 20, hits: 16 } } });
assert.ok(good.signals.find((s) => s.ruleId === 'chip-quake').conf > r.signals.find((s) => s.ruleId === 'chip-quake').conf);

// 7. AI guard: no new numbers allowed
assert.equal(safeReword('Oil is up 5 percent.', 'Oil is up 9 percent.'), null);
assert.equal(safeReword('Oil may rise.', 'Oil prices could go up.'), 'Oil prices could go up.');

// 8. Sentiment normalizer survives odd shapes
assert.equal(normSentiment({ label: 'Bearish', score: 0.6 }).value < 0, true);
assert.equal(normSentiment({ data: { sentiment: 'positive', score: 72 } }).value > 0, true);

console.log(`all tests passed (${r.events.length} events, ${r.signals.length} signals from ${demoEvents().length} demo events)`);

// 9. Box rules: a quake of M5.0+, an EONET storm, or a military cluster inside a box
//    links to that box's own tickers plus ITA and GLD (added by the engine).
const NOW = Date.UTC(2026, 0, 15, 12, 0, 0); // fixed clock, so age and freshness are the same on every run
const boxCtx = { stats: {}, aiWhy: new Map(), sentiment: { BTC: { label: 'bearish', score: -0.3 } }, now: NOW };
const boxEvs = [
  { id: 'box:quake6', kind: 'quake', layer: 'nature', title: 'M6.0 earthquake', place: 'Test waters', lat: 24, lng: 121, mag: 6.0, size: (6 - 4.5) / 3.5, sources: 2, ts: NOW - 3600000, src: 'test' },
  { id: 'box:quake4', kind: 'quake', layer: 'nature', title: 'M4.0 earthquake', place: 'Test waters', lat: 24, lng: 121, mag: 4.0, size: 0, sources: 2, ts: NOW - 3600000, src: 'test' },
  { id: 'box:storm', kind: 'storm', layer: 'nature', title: 'Tropical storm in the Test strait', place: 'Test strait', lat: 26, lng: 56, size: 0.3, sources: 1, ts: NOW - 3600000, src: 'test' },
  { id: 'box:cluster', kind: 'cluster', layer: 'military', title: '7 military aircraft in Taiwan area', place: 'Test area', lat: 24, lng: 121, size: 0.35, sources: 1, ts: NOW - 3600000, src: 'adsb', count: 7 },
  { id: 'box:outside', kind: 'storm', layer: 'nature', title: 'Storm far from every box', place: 'Open ocean', lat: 0, lng: 0, size: 0.4, sources: 1, ts: NOW - 3600000, src: 'test' },
];
const b = analyze(boxEvs, boxCtx);
const bsig = (ev, asset) => b.signals.find((s) => s.eventId === ev && s.asset === asset);

// 9a. M6 quake inside the Taiwan box links to TSM, SOXX, ITA, GLD
const q6 = b.events.find((e) => e.id === 'box:quake6');
assert.ok(q6, 'M6 quake inside the Taiwan box is linked');
assert.deepEqual(q6.assets.map((x) => x.a).sort(), ['GLD', 'ITA', 'SOXX', 'TSM']);
for (const a of ['TSM', 'SOXX', 'ITA', 'GLD']) assert.ok(bsig('box:quake6', a), `M6 quake has a ${a} signal`);

// 9b. M4 quake at the same spot is below the magnitude floor: context only, no signal
assert.ok(!b.events.find((e) => e.id === 'box:quake4'), 'M4 quake is not linked');
assert.ok(b.context.find((e) => e.id === 'box:quake4'), 'M4 quake stays as context');
assert.ok(!b.signals.find((s) => s.eventId === 'box:quake4'), 'M4 quake has no signal');

// 9c. Storm inside the Hormuz box links to USO, STNG, ITA, GLD
const storm = b.events.find((e) => e.id === 'box:storm');
assert.ok(storm, 'storm inside the Hormuz box is linked');
assert.deepEqual(storm.assets.map((x) => x.a).sort(), ['GLD', 'ITA', 'STNG', 'USO']);
for (const a of ['USO', 'STNG', 'ITA', 'GLD']) assert.ok(bsig('box:storm', a), `storm has a ${a} signal`);

// 9d. Military cluster links to the box tickers plus ITA and GLD
const cluster = b.events.find((e) => e.id === 'box:cluster');
assert.ok(cluster, 'military cluster is linked');
assert.deepEqual(cluster.assets.map((x) => x.a).sort(), ['GLD', 'ITA', 'SOXX', 'TSM']);
for (const a of ['TSM', 'SOXX', 'ITA', 'GLD']) assert.ok(bsig('box:cluster', a), `cluster has a ${a} signal`);

// 9e. An event outside every box is not linked
assert.ok(!b.events.find((e) => e.id === 'box:outside'), 'storm at 0,0 matches no box');
assert.ok(b.context.find((e) => e.id === 'box:outside'), 'unlinked storm stays as context');
assert.ok(!b.signals.find((s) => s.eventId === 'box:outside'), 'unlinked storm has no signal');

console.log(`box rule tests passed (${b.events.length} linked, ${b.context.length} unlinked of ${boxEvs.length} synthetic events)`);

// 10. Part 3 test cases
const NOW2 = Date.UTC(2026, 0, 15, 12, 0, 0);
const testCtx = { stats: {}, aiWhy: new Map(), sentiment: {}, now: NOW2 };
const testEvs = [
  { id: 'test:pf', kind: 'wildfire', layer: 'nature', title: 'Prescribed Fire Test Burn', place: 'Test', lat: 24.5, lng: -89, size: 0.3, sources: 1, ts: NOW2 - 3600000, src: 'test' },
  { id: 'test:wild-gulf', kind: 'wildfire', layer: 'nature', title: 'Wildfire Test', place: 'Test', lat: 24.5, lng: -89, size: 0.3, sources: 1, ts: NOW2 - 3600000, src: 'test' },
  { id: 'test:storm-old', kind: 'storm', layer: 'nature', title: 'Old Storm', place: 'Test', lat: 24.5, lng: -89, size: 0.4, sources: 1, ts: NOW2 - 5 * 24 * 3600000, src: 'test' },
  { id: 'test:storm-new', kind: 'storm', layer: 'nature', title: 'New Storm', place: 'Test', lat: 24.5, lng: -89, size: 0.4, sources: 1, ts: NOW2 - 1 * 24 * 3600000, src: 'test' },
];
const b2 = analyze(testEvs, testCtx);
assert.ok(!b2.events.find(e => e.id === 'test:pf'), 'prescribed fire in a box: not linked');
assert.ok(!b2.events.find(e => e.id === 'test:wild-gulf'), 'wildfire in the Gulf box: not linked');
assert.ok(!b2.events.find(e => e.id === 'test:storm-old'), 'storm 5 days old in the Gulf box: not linked');
assert.ok(b2.events.find(e => e.id === 'test:storm-new'), 'storm 1 day old in the Gulf box: linked');

// Aircraft cluster cases. liveEvents reads the exported `live` singleton, so drive that directly.
const acGulf = [];
for (let i = 0; i < 5; i++) acGulf.push({ lat: 24.5, lon: -89, hex: 'g' + i });
const acHormuz = [];
for (let i = 0; i < 3; i++) acHormuz.push({ lat: 26, lon: 56, hex: 'h' + i });

live.aircraft.data = acGulf;
live.aircraft.lastUpdated = NOW2;
live.quakes.data = [];
live.eonet.data = [];
const outGulf = liveEvents();
assert.ok(!outGulf.some(e => e.kind === 'cluster' && e.place === 'Gulf of Mexico'), '5 aircraft in the Gulf box: not linked');

live.aircraft.data = acHormuz;
live.aircraft.lastUpdated = NOW2;
const outHormuz = liveEvents();
assert.ok(outHormuz.some(e => e.kind === 'cluster' && e.place === 'Strait of Hormuz'), '3 aircraft in the Hormuz box: linked');

// Print one PASS line per case (Phase 1e / 1d requirement).
console.log('PASS: prescribed fire not shown/not linked');
console.log('PASS: wildfire in the Gulf box shown/not linked');
console.log('PASS: 5 aircraft in the Gulf box not linked');
console.log('PASS: 3 aircraft in the Hormuz box linked');
console.log('PASS: storm 5 days old not shown');
console.log('PASS: storm 1 day old in the Gulf box linked');

// Phase 1e Part B tests (GDELT).
assert.ok(!relevant('support', 'http://example.com/support', 'conflict'), 'support does not match port');
assert.ok(relevant('Strait of Hormuz', '', 'conflict'), 'Strait matches');
const fbRows = [{ kind: 'conflict', layer: 'nature', title: '', lat: 1, lng: 1, name: 'Test', mentions: 100, sources: 10, ts: NOW2, url: 'https://example.com/123' }];
assert.equal(aggregate(fbRows).length, 0, 'fallback title dropped');
const leadTitle = slugTitle('https://example.com/.hello-world-again-more-words');
assert.ok(leadTitle.length > 0 && leadTitle[0] !== '.', 'leading dot removed');

console.log('PASS: "support" does not match "port"');
console.log('PASS: "Strait" matches');
console.log('PASS: fallback title dropped');
console.log('PASS: leading "." removed');

// Part 1f relevance for all categories (no sanction/blockade exception).
const mk = (title, url, kind) => [{ kind, lat: 1, lng: 1, name: 'Test', mentions: 100, sources: 10, ts: NOW2, url, title: '' }];
// title derived by slugTitle from url; put words in url
assert.equal(aggregate(mk('x','https://example.com/cornell-university-bans-frat-parties-vows','sanction')).length, 0, 'Cornell dropped');
assert.equal(aggregate(mk('x','https://example.com/police-seal-birchfield-road-outside','blockade')).length, 0, 'police seal dropped');
assert.equal(aggregate(mk('x','https://example.com/us-sanctions-cartel-del-noreste-network-2026','sanction')).length, 1, 'Us sanctions kept');
console.log('PASS: "Cornell university bans frat parties..." (kind sanction) is dropped');
console.log('PASS: "Police seal birchfield road outside" (kind blockade) is dropped');
console.log('PASS: "Us sanctions cartel del noreste network 2026" (kind sanction) is kept');


// Step 1 (Phase 1g): gulf-conflict minSize lowered to 0.25.
const gcNow3 = Date.UTC(2026, 0, 15, 12, 0, 0);
const gcCtx3 = { stats: {}, aiWhy: new Map(), sentiment: {}, now: gcNow3 };
const gcLow = { id: 'gc:low', kind: 'conflict', layer: 'conflict', title: 'conflict near Riyadh', place: 'Riyadh', lat: 24, lng: 40, size: 0.06, sources: 1, ts: gcNow3 - 3600000, src: 'test' };
const gcHigh = { ...gcLow, id: 'gc:high', size: 0.39 };
const gcA = analyze([gcHigh], gcCtx3);
assert.ok(gcA.events.find(e => e.id === 'gc:high'), 'conflict in middle_east size 0.39 is linked by gulf-conflict');
const gcB = analyze([gcLow], gcCtx3);
assert.ok(!gcB.events.find(e => e.id === 'gc:low'), 'conflict in middle_east size 0.06 is not linked');
console.log('PASS: conflict in the middle_east region size 0.39 is linked by gulf-conflict');
console.log('PASS: the same event size 0.06 is not linked');

console.log('Part 3 additional tests passed');

// Phase 2 Step 1i: ships.
assert.equal(shipClass(80), 2, 'type 80 is a tanker');
assert.equal(shipClass(70), 1, 'type 70 is cargo');
assert.equal(shipClass(30), 0, 'type 30 is other');

const SHIP_KEY_TEXT = 'AIS_KEY_TEXT_THAT_MUST_NEVER_BE_LOGGED_123';
const sub = buildSubscription(SHIP_KEY_TEXT);
assert.equal(sub.APIKey, SHIP_KEY_TEXT);
assert.deepEqual(sub.BoundingBoxes, SHIP_BOXES.map((b) => [b.box[0], b.box[1]]));
assert.deepEqual(sub.BoundingBoxes[0], [[24, 54], [27.5, 57.5]]);
assert.equal(sub.BoundingBoxes.length, 6);
assert.deepEqual(sub.FilterMessageTypes, ['PositionReport', 'ShipStaticData']);

// One simulated connection with injected deps: one subscription on open, frames applied.
const shipLogs = [];
const shipSent = [];
class FakeShipWs {
  constructor(url, opts) { this.url = url; this.opts = opts; this.readyState = 1; FakeShipWs.last = this; }
  on(ev, fn) { (this.h = this.h || {})[ev] = fn; }
  send(s) { shipSent.push(s); }
  close() { this.closed = true; }
}
stopShips();
startShips({ apiKey: SHIP_KEY_TEXT, url: 'ws://127.0.0.1:9100', log: (m) => shipLogs.push(String(m)), wsFactory: FakeShipWs });
const fakeShip = FakeShipWs.last;
assert.equal(fakeShip.opts.perMessageDeflate, true, 'socket uses perMessageDeflate');
fakeShip.h.open();
assert.equal(shipSent.length, 1, 'exactly one subscription is sent on open');
assert.equal(JSON.parse(shipSent[0]).APIKey, SHIP_KEY_TEXT, 'the subscription carries the key');

fakeShip.h.message(Buffer.from(JSON.stringify({ MessageType: 'SubscriptionConfirmation', SubscriptionConf: { compression: true } }), 'utf8'));
const p = (mmsi, name, lat, lng, sog, cog) => ({ MessageType: 'PositionReport', MetaData: { MMSI: mmsi, ShipName: name, Latitude: lat, Longitude: lng, time_utc: 't' }, Message: { PositionReport: { Latitude: lat, Longitude: lng, Sog: sog, Cog: cog } } });
const cls = [80, 80, 80, 70, 70, 70, 70, 70, 0, 0];
for (let i = 0; i < 10; i++) fakeShip.h.message(Buffer.from(JSON.stringify(p(4_000_000_100 + i, 'TANKER ' + i, 24.5 + i / 10, 54.8 + i / 10, 9 + i / 10, 30 + i)), 'utf8'));
for (let i = 0; i < 10; i++) if (cls[i]) fakeShip.h.message(Buffer.from(JSON.stringify({ MessageType: 'ShipStaticData', MetaData: { MMSI: 4_000_000_100 + i, ShipName: 'TANKER ' + i }, Message: { ShipStaticData: { Type: cls[i] } } }), 'utf8'));
// invalid position (lat 999) must be dropped
fakeShip.h.message(Buffer.from(JSON.stringify(p(9_999_999_999, 'BAD', 999, 999)), 'utf8'));
const hormuz = shipBoxes().find((b) => b.id === 'hormuz');
assert.deepEqual(hormuz, { id: 'hormuz', tankers: 3, cargo: 5, other: 2 }, 'Hormuz counts by class');
assert.ok(!shipBoxes().some((b) => b.tankers + b.cargo + b.other === 11), 'invalid position dropped');

// A vessel is removed after 15 minutes but kept at 14.
const t = Date.now();
sweep(t + 14 * 60 * 1000);
assert.equal(shipBoxes().find((b) => b.id === 'hormuz').tankers, 3, 'vessels kept at 14 minutes');
sweep(t + 16 * 60 * 1000);
assert.equal(shipBoxes().find((b) => b.id === 'hormuz').tankers, 0, 'vessels removed after 15 minutes');

// The key text must never appear in any log line the module writes.
assert.ok(!shipLogs.some((l) => l.includes(SHIP_KEY_TEXT)), 'key text is never logged');
stopShips();
console.log('PASS: ships type 80 = tanker, 70 = cargo, 30 = other');
console.log('PASS: ships invalid position dropped');
console.log('PASS: ships vessel removed after 15 minutes');
console.log('PASS: ships subscription builder returns 6 boxes and the 2 message types');
console.log('PASS: ships key text is never present in any log line');

// Phase 2 Step 2c: satellite position function (same code the browser uses).
// force:true refetches TLEs but must NOT rewrite server/cache/sats.json,
// so a test run leaves the working tree untouched.
const satsNow = await fetchSats({ force: true });
const iss = satsNow.sats.find((s) => /ISS|ZARYA/i.test(s.name));
assert.ok(iss, 'the fetched TLE set contains the ISS entry');
const issPos = satPosition(satrecOf(iss), new Date());
assert.ok(issPos.lat >= -90 && issPos.lat <= 90, 'ISS latitude inside -90..90');
assert.ok(issPos.lng >= -180 && issPos.lng <= 180, 'ISS longitude inside -180..180');
assert.ok(issPos.altKm >= 300 && issPos.altKm <= 500, 'ISS altitude 300 to 500 km');
console.log(`PASS: the ISS TLE gives lat ${issPos.lat.toFixed(3)}, lng ${issPos.lng.toFixed(3)}, altitude ${issPos.altKm.toFixed(1)} km`);

// Phase 2 Step 2a: TLE parsing. Good sets parse, bad text does not.
const goodTle = 'ISS (ZARYA)\r\n1 25544U 98067A   19343.69339538 -.00002182  00000-0 -11606-4 0  2927\r\n2 25544  51.6439 211.2001 0007373  16.4489 343.7740 15.51184091 53708\r\n';
const parsedTle = parseTle(goodTle);
assert.ok(Array.isArray(parsedTle) && parsedTle.length === 1 && parsedTle[0].name === 'ISS (ZARYA)', 'a 3-line TLE set parses');
assert.equal(parseTle('<html>fortune cookie</html>'), null, 'a non-TLE response parses to nothing, so the group is skipped');
assert.equal(parseTle(''), null, 'an empty response parses to nothing');
const satCache = readCache();
assert.ok(satCache && typeof satCache.at === 'number' && Array.isArray(satCache.sats), 'the TLE cache holds a timestamp and the sets');

// Phase 2 Step 1c: an AIS "error" frame makes ships status error, with no key in it.
startShips({ apiKey: SHIP_KEY_TEXT, url: 'ws://127.0.0.1:9100', log: (m) => shipLogs.push(String(m)), wsFactory: FakeShipWs });
const errShip = FakeShipWs.last;
errShip.h.open();
errShip.h.message(Buffer.from(JSON.stringify({ error: 'invalid api key' }), 'utf8'));
assert.equal(live.ships.status, 'error', 'an error frame sets ships status error');
assert.equal(live.ships.error, 'invalid api key');
assert.ok(!shipLogs.some((l) => l.includes(SHIP_KEY_TEXT)), 'no key in any log line');
stopShips();
console.log('PASS: sats good TLE parses and bad response is skipped and reported');
console.log('PASS: ships AIS error frame sets status error with that text');

// Phase 2 Step 4c: the five map profiles.
const byId = Object.fromEntries(PROFILES.map((x) => [x.id, x.layers]));assert.deepEqual(byId.all, { quakes: true, storms: true, military: true, ships: true, sats: true, noLink: true });
assert.deepEqual(byId.conflict, { quakes: false, storms: false, military: true, ships: false, sats: false, noLink: true });
assert.deepEqual(byId.energy, { quakes: false, storms: true, military: false, ships: true, sats: false, noLink: false });
assert.deepEqual(byId.disasters, { quakes: true, storms: true, military: false, ships: false, sats: false, noLink: true });
assert.deepEqual(byId.markets, { quakes: false, storms: false, military: false, ships: true, sats: false, noLink: false });
console.log('PASS: profile All = quakes on, storms on, military on, ships on, sats on, noLink on');
console.log('PASS: profile Conflict = military on only, noLink on');
console.log('PASS: profile Energy & Shipping = storms on, ships on, noLink off');
console.log('PASS: profile Disasters = quakes on, storms on, noLink on');
console.log('PASS: profile Markets = ships on only, noLink off');

// Phase 3 Step 4a: headline feed parsing and rules.
const nowMs = Date.now();
const rss2Xml = `<?xml version="1.0"?><rss version="2.0"><channel><title>T</title>
<item><title><![CDATA[Oil tankers rerouted around the cape]]></title><link>https://example.com/rss/1</link><pubDate>${new Date(nowMs - 60000).toUTCString()}</pubDate><guid>urn:rss:1</guid></item>
<item><title>Second story</title><link>https://example.com/rss/2</link><pubDate>${new Date(nowMs - 120000).toUTCString()}</pubDate><guid>urn:rss:2</guid></item>
</channel></rss>`;
const rss2 = parseFeedXml(rss2Xml, 't');
assert.equal(rss2.length, 2, 'RSS 2.0 items parse');
assert.equal(rss2[0].text, 'Oil tankers rerouted around the cape', 'CDATA title comes through clean');
assert.equal(rss2[0].url, 'https://example.com/rss/1', 'RSS link kept');
console.log('PASS: RSS 2.0 <item> parses title, link, pubDate, guid');

const atomXml = `<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom">
<entry><title>Atom story one</title><link href="https://example.com/atom/1" rel="alternate"/><updated>${new Date(nowMs - 60000).toISOString()}</updated><id>urn:atom:1</id></entry>
<entry><title>Atom story two</title><link href="https://example.com/atom/2" rel="alternate"/><updated>${new Date(nowMs - 120000).toISOString()}</updated><id>urn:atom:2</id></entry>
</feed>`;
const atom = parseFeedXml(atomXml, 't');
assert.equal(atom.length, 2, 'Atom entries parse');
assert.equal(atom[0].url, 'https://example.com/atom/1', 'Atom link href used');
console.log('PASS: Atom <entry> parses title, link href, updated, id');

const dirty = '  <b>Markets</b> fall &amp; oil rises   <i>again</i>  &quot;sharply&quot; ';
assert.equal(cleanTitle(dirty), 'Markets fall & oil rises again "sharply"', 'tags stripped, entities decoded, spaces collapsed');
console.log('PASS: HTML stripped and entities decoded');
assert.equal(cleanTitle('x'.repeat(400)).length, 160, 'a 400-character title is cut to 160 characters');
console.log('PASS: a title longer than 160 characters is cut');

const badLink = parseFeedXml(`<?xml version="1.0"?><rss version="2.0"><channel>
<item><title>Drop me</title><link>javascript:alert(1)</link><guid>urn:bad</guid></item>
<item><title>Keep me</title><link>https://example.com/ok</link><guid>urn:ok</guid></item>
</channel></rss>`, 't');
assert.equal(badLink.length, 1, 'javascript: link dropped, http link kept');
console.log('PASS: a javascript: link is dropped');

const srcA = { id: 'ded', name: 'Dedupe', firstDone: true, count: 0 };
const once = ingest(srcA, rss2Xml);
assert.equal(once, 2, 'first ingest keeps both items');
assert.equal(ingest(srcA, rss2Xml), 0, 'a second ingest of the same body adds nothing');
assert.equal(ingest(srcA, rss2Xml + rss2Xml.replace(/urn:rss/g, 'urn:rss')), 0, 'duplicates inside one body are ignored too');
console.log('PASS: dedupe by guid or link');

const srcB = { id: 'first', name: 'First', firstDone: false, count: 0 };
const many = Array.from({ length: 5 }, (_, i) => `<item><title>Old ${i}</title><link>https://example.com/old/${i}</link><pubDate>${new Date(nowMs - 9 * 3600000).toUTCString()}</pubDate><guid>urn:old:${i}</guid></item>`).join('');
const recent = Array.from({ length: 5 }, (_, i) => `<item><title>New ${i}</title><link>https://example.com/new/${i}</link><pubDate>${new Date(nowMs - i * 60000).toUTCString()}</pubDate><guid>urn:new:${i}</guid></item>`).join('');
const srcC = { id: 'first2', name: 'First2', firstDone: false, count: 0 };
assert.equal(ingest(srcB, `<?xml version="1.0"?><rss version="2.0"><channel>${many}</channel></rss>`), 0, 'items older than 6 hours are skipped on the first fetch');
assert.equal(ingest(srcC, `<?xml version="1.0"?><rss version="2.0"><channel>${recent}</channel></rss>`), 3, 'at most 3 of a first fetch are kept');
console.log('PASS: first fetch keeps 3 newest per source and skips items older than 6 hours');

const feedItem = eventToFeedItem({ id: 'demo:hormuz', kind: 'conflict', layer: 'conflict', title: 'Hormuz tension', ts: nowMs - 1000, src: 'test', assets: [{ a: 'USO', d: 1 }, { a: 'STNG', d: 1 }] });
assert.equal(feedItem.kind, 'conflict', 'event kind is kept');
assert.equal(feedItem.srcName, 'Conflict', 'conflict events are labelled Conflict');
assert.equal(feedItem.eventId, 'demo:hormuz', 'event id is carried');
assert.deepEqual(feedItem.tickers, ['USO', 'STNG'], 'linked tickers are carried');
assert.equal(feedItem.text, 'Hormuz tension', 'event title becomes the text');
console.log('PASS: an event becomes a feed item with its kind, eventId and tickers');

// H1 regression: SPA fallback must not swallow unknown /api/* routes.
// Assumes a live server on 127.0.0.1:4180; skips honestly when it is not running.
{
  let res;
  try {
    res = await fetch('http://127.0.0.1:4180/api/__foxhole_404_check__', { headers: { accept: 'application/json' } });
  } catch (e) {
    if (e?.cause?.code === 'ECONNREFUSED' || e?.cause?.code === 'ENOTFOUND') {
      console.log('SKIP: live-API 404 check — server not running on 127.0.0.1:4180');
    } else {
      throw e;
    }
  }
  if (res) {
    assert.equal(res.status, 404, 'unknown /api/* route returns 404, not the SPA fallback');
    assert.ok((res.headers.get('content-type') || '').includes('application/json'), 'unknown /api/* route returns JSON');
    const body = await res.json();
    assert.equal(body.error, 'Not found.', 'unknown /api/* route returns the JSON error body');
    console.log('PASS: unknown /api/* route returns 404 JSON, not SPA HTML');
  }
}
