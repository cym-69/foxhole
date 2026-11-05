import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  sanitizeProfiles,
  scoreText,
  scoreItem,
  dedupeItems,
  profileFeed,
  profilesSummary,
  loadProfiles,
  DEFAULT_PROFILES,
} from './horizon/engine.js';

const dir = path.dirname(fileURLToPath(import.meta.url));

// profiles.json contract: exactly 5 profiles with required ids
const rawProfiles = JSON.parse(
  fs.readFileSync(path.join(dir, 'horizon', 'profiles.json'), 'utf8'),
);
assert.equal(rawProfiles.length, 5, 'profiles.json must contain exactly 5 profiles');
assert.deepEqual(
  rawProfiles.map((p) => p.id).sort(),
  ['cinema', 'crypto', 'markets', 'tech', 'war'],
  'profile ids must match the required set',
);
for (const p of rawProfiles) {
  assert.ok(p.id && p.name && typeof p.threshold === 'number', 'profile shape');
  assert.ok(p.threshold >= 0 && p.threshold <= 10, 'threshold range');
  assert.ok(Array.isArray(p.keywords) && p.keywords.length >= 5 && p.keywords.length <= 8, 'keyword count');
  for (const kw of p.keywords) {
    assert.ok(typeof kw.term === 'string' && kw.term.length, 'keyword term');
    assert.ok(kw.weight >= 1 && kw.weight <= 3, 'keyword weight range');
  }
  assert.ok(Array.isArray(p.exclude), 'exclude array');
  assert.ok(Array.isArray(p.sources), 'sources array');
  assert.ok(typeof p.accent === 'string' && p.accent, 'accent');
}
assert.equal(rawProfiles.find((p) => p.id === 'cinema').threshold, 4, 'cinema threshold is 4');

// --- sanitizeProfiles ---
{
  const cleaned = sanitizeProfiles([
    { id: 'a', name: 'A', threshold: 99, keywords: [{ term: 'x', weight: 5 }, { term: 'y', weight: 2 }] },
    { id: 'a', name: 'dup', threshold: 5, keywords: [] },
    { id: '', name: 'no id', threshold: 5, keywords: [] },
    { id: 'b', threshold: 5, keywords: [] },
    null,
    'junk',
    { id: 'c', name: 'C', threshold: -5, keywords: [{ term: '', weight: 1 }, { term: 'z', weight: 1 }] },
  ]);
  assert.deepEqual(cleaned.map((p) => p.id), ['a', 'c'], 'sanitize drops dupes and invalid');
  assert.equal(cleaned[0].threshold, 10, 'threshold clamped to 10');
  assert.equal(cleaned[1].threshold, 0, 'threshold clamped to 0');
  assert.deepEqual(cleaned[0].keywords, [{ term: 'y', weight: 2 }], 'bad weight filtered');
  assert.deepEqual(cleaned[1].keywords, [{ term: 'z', weight: 1 }], 'empty term filtered');

  assert.deepEqual(sanitizeProfiles('nope'), [], 'non-array -> []');
  assert.deepEqual(sanitizeProfiles(null), [], 'null -> []');

  const many = Array.from({ length: 20 }, (_, i) => ({
    id: 'p' + i,
    name: 'P' + i,
    keywords: Array.from({ length: 50 }, (_, j) => ({ term: 't' + j, weight: 1 })),
  }));
  const capped = sanitizeProfiles(many);
  assert.equal(capped.length, 12, 'cap 12 profiles');
  assert.equal(capped[0].keywords.length, 40, 'cap 40 keywords');
}

// --- scoreText exact vs partial ---
const warProfile = { keywords: [{ term: 'Red Sea', weight: 2 }, { term: 'oil', weight: 1 }], exclude: [] };
{
  const exact = scoreText('Disruption in the Red Sea tonight', warProfile);
  assert.equal(exact.score, 6, 'exact phrase match = 3 * weight');
  assert.deepEqual(exact.matchedTerms, ['Red Sea']);

  const partialProfile = { keywords: [{ term: 'missile', weight: 2 }], exclude: [] };
  const partial = scoreText('missiletes incoming tonight', partialProfile);
  assert.equal(partial.score, 2, 'substring partial = 1 * weight');
  assert.ok(partial.matchedTerms.includes('missile'));

  const both = scoreText('oil Red Sea', { keywords: [{ term: 'Red Sea', weight: 2 }, { term: 'oil', weight: 1 }], exclude: [] });
  assert.equal(both.score, 9, 'exact scores sum: 6 + 3');

  const none = scoreText('sunny day', warProfile);
  assert.equal(none.score, 0);
  assert.deepEqual(none.matchedTerms, []);
}
// --- scoreText exclude penalty + clamp ---
{
  const profile = { keywords: [{ term: 'oil', weight: 3 }], exclude: ['sports'] };
  const penalized = scoreText('oil sports', profile);
  assert.equal(penalized.score, 4, 'exact 9 minus 5 exclude = 4');
  assert.ok(penalized.matchedTerms.includes('oil'));

  const clampedLow = scoreText('sports', profile);
  assert.equal(clampedLow.score, 0, 'clamped at 0');

  const clampedHigh = scoreText('oil', { keywords: [{ term: 'oil', weight: 3 }, { term: 'o', weight: 3 }], exclude: [] });
  assert.ok(clampedHigh.score <= 10, 'clamped at 10');
}

// --- scoreItem source penalty ---
{
  const profile = { keywords: [{ term: 'oil', weight: 3 }], sources: ['bbc'], exclude: [] };
  const hit = scoreItem({ text: 'oil tops', src: 'bbc', srcName: 'BBC World' }, profile);
  assert.equal(hit.score, 9, 'listed source keeps score');
  const miss = scoreItem({ text: 'oil tops', src: 'npr', srcName: 'NPR World' }, profile);
  assert.equal(miss.score, 8.5, 'unlisted source loses 0.5');
  const missByName = scoreItem({ text: 'oil tops', src: 'x', srcName: 'bbc' }, profile);
  assert.equal(missByName.score, 9, 'srcName match also counts');
}

// --- dedupeItems URL + fuzzy title ---
{
  const base = Date.now();
  const items = [
    { id: '1', ts: base, text: 'Fed weighs rate cut', url: 'https://EXAMPLE.com/news/story/', score: 5 },
    { id: '2', ts: base + 1000, text: 'Fed weighs rate cut today', url: 'https://example.com/news/story', score: 7 },
    { id: '3', ts: base + 2000, text: 'Fed weighs rate cut', url: 'https://other.com/different', score: 6 },
    { id: '4', ts: base + 40 * 60 * 1000, text: 'Fed weighs rate cut', url: 'https://other.com/later', score: 9 },
  ];
  const deduped = dedupeItems(items);
  // 1+2 same canonical URL -> keep score 7; 3 fuzzy-matches within 30m and loses; 4 is 40m later -> kept
  assert.equal(deduped.length, 2, 'url + fuzzy dedupe keeps 2');
  assert.ok(deduped.some((x) => x.id === '2'), 'highest score kept for URL dup');
  assert.ok(deduped.some((x) => x.id === '4'), 'outside 30m window kept');

  // first 60 chars equal
  const long = 'a '.repeat(40);
  const d2 = dedupeItems([
    { id: 'a', ts: base, text: long + 'one', url: '', score: 1 },
    { id: 'b', ts: base + 60 * 1000, text: long + 'two', url: '', score: 2 },
    { id: 'c', ts: base + 60 * 1000, text: 'completely different story headline here', url: '', score: 3 },
  ]);
  assert.equal(d2.length, 2, 'first-60-char fuzzy match dedupes');

  assert.deepEqual(dedupeItems(null), [], 'null -> []');
}

// --- profileFeed threshold filtering + ordering ---
{
  const profiles = [
    {
      id: 'war',
      name: 'War',
      description: 'war',
      threshold: 5,
      keywords: [{ term: 'Iran', weight: 2 }, { term: 'missile', weight: 2 }],
      exclude: [],
      sources: [],
      accent: '#000',
    },
  ];
  const now = Date.now();
  const items = [
    { id: 'low', ts: now, text: 'sunny weather', src: 'bbc', srcName: 'BBC' },
    { id: 'mid', ts: now, text: 'missile', src: 'bbc', srcName: 'BBC' },
    { id: 'high', ts: now, text: 'Iran missile strike', src: 'bbc', srcName: 'BBC' },
    { id: 'high2', ts: now + 1000, text: 'Iran missile strike updated', src: 'bbc', srcName: 'BBC' },
  ];
  const feed = profileFeed('war', items, { allProfiles: profiles });
  assert.ok(feed.profile && feed.profile.id === 'war');
  assert.ok(!feed.items.find((x) => x.id === 'low'), 'below threshold filtered');
  assert.ok(feed.items.find((x) => x.id === 'mid'), 'at/above threshold kept');
  // sorted score desc: high items (Iran 6 + missile 6 = capped 10) before mid (6)
  // high and high2 fuzzy-dedupe within 30m keeping ... both tie score 10? tie -> later ts wins
  assert.equal(feed.items[0].score, 10, 'top item capped at 10');
  assert.ok(feed.items[0].score >= feed.items[feed.items.length - 1].score, 'sorted desc');
  assert.ok(feed.items.every((x) => Array.isArray(x.matchedTerms)), 'matchedTerms attached');

  const missing = profileFeed('nope', items, { allProfiles: profiles });
  assert.equal(missing.profile, null);
  assert.deepEqual(missing.items, []);
}

// --- profilesSummary + loadProfiles ---
{
  const summary = profilesSummary(
    [
      { text: 'Iran missile strike', src: 'bbc', srcName: 'BBC' },
      { text: 'sunny', src: 'bbc', srcName: 'BBC' },
    ],
    { allProfiles: DEFAULT_PROFILES },
  );
  assert.equal(summary.length, 5, 'summary has one row per default profile');
  const war = summary.find((s) => s.id === 'war');
  assert.ok(war.count >= 1, 'war count includes strike item');
  assert.ok(war.topScore > 0, 'war topScore > 0');
  assert.ok(typeof war.accent === 'string' && war.accent, 'accent present');

  const loaded = loadProfiles();
  assert.equal(loaded.length, 5, 'loadProfiles returns 5 defaults from file');
  assert.deepEqual(
    loaded.map((p) => p.id).sort(),
    ['cinema', 'crypto', 'markets', 'tech', 'war'],
  );
}

console.log('all horizon tests passed');
