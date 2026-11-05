import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeTmdbItem, sanitizeTracking, refreshCinema } from './feeds/cinema.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const seed = JSON.parse(fs.readFileSync(path.join(here, 'config', 'cinema-tracking.json'), 'utf8'));
assert.equal(seed.length, 6, 'seed has 6 entries');
assert.deepEqual(new Set(seed.map((e) => e.status)), new Set(['watching', 'want', 'done']));
assert.ok(seed.some((e) => e.media_type === 'movie') && seed.some((e) => e.media_type === 'tv'));

const item = normalizeTmdbItem({
  id: 123,
  media_type: 'movie',
  title: 'Example',
  overview: 'A test film.',
  vote_average: 7.5,
  popularity: 42,
  poster_path: '/abc.jpg',
  backdrop_path: '/def.jpg',
  release_date: '2026-01-15',
  genres: [{ name: 'Drama' }, { name: 'Sci-Fi' }],
}, 'tv');
assert.deepEqual(item, {
  id: 123,
  media_type: 'movie',
  title: 'Example',
  overview: 'A test film.',
  rating: 7.5,
  popularity: 42,
  poster: 'https://image.tmdb.org/t/p/w500/abc.jpg',
  backdrop: 'https://image.tmdb.org/t/p/w500/def.jpg',
  release_date: '2026-01-15',
  genre_names: ['Drama', 'Sci-Fi'],
});

const bare = normalizeTmdbItem({ id: 456, name: 'A Show', poster_path: null }, 'tv');
assert.equal(bare.media_type, 'tv');
assert.equal(bare.title, 'A Show');
assert.equal(bare.poster, null);
assert.equal(bare.backdrop, null);
assert.deepEqual(bare.genre_names, []);

const cleaned = sanitizeTracking([
  { id: 1, media_type: 'movie', title: 'Keep', poster: 'https://example.com/p.jpg', status: 'watching', note: 'first' },
  { id: 1, media_type: 'movie', title: 'Duplicate', status: 'done' },
  { id: '2', media_type: 'tv', title: 'Also keep', status: 'unknown' },
  { id: 'nope', media_type: 'movie', title: 'Bad id' },
  { id: 3, media_type: 'book', title: 'Bad type' },
  { id: 4, media_type: 'movie', title: '  ' },
  null,
  'junk',
]);
assert.equal(cleaned.length, 2);
assert.deepEqual(cleaned[0], {
  id: 1,
  media_type: 'movie',
  title: 'Keep',
  poster: 'https://example.com/p.jpg',
  status: 'watching',
  note: 'first',
});
assert.equal(cleaned[1].status, 'want');
assert.deepEqual(sanitizeTracking(null), []);

function jsonResponse(payload, status = 200) {
  return { ok: status < 400, status, json: async () => payload };
}

const savedKey = process.env.TMDB_API_KEY;
let calls = 0;
process.env.TMDB_API_KEY = 'test-key';
const live = await refreshCinema(async (url) => {
  calls++;
  assert.ok(!url.includes('test-key') || url.includes('api_key=test-key'));
  if (url.includes('/trending/all/day')) return jsonResponse({ results: [{ id: 10, media_type: 'movie', title: 'Trending One', poster_path: '/t.jpg' }] });
  if (url.includes('/movie/now_playing')) return jsonResponse({ results: [{ id: 11, title: 'Now One' }] });
  if (url.includes('/movie/upcoming')) return jsonResponse({ results: [{ id: 12, title: 'Soon One' }] });
  if (url.includes('/tv/airing_today')) return jsonResponse({ results: [{ id: 13, name: 'Today One' }] });
  return jsonResponse({}, 404);
});
assert.equal(calls, 4, 'parallel fetch made 4 calls');
assert.equal(live.ok, true);
assert.equal(live.status, 'live');
assert.ok(live.fetchedAt);
assert.equal(live.trending.length, 1);
assert.equal(live.trending[0].poster, 'https://image.tmdb.org/t/p/w500/t.jpg');
assert.equal(live.nowPlaying[0].media_type, 'movie');
assert.equal(live.upcoming[0].title, 'Soon One');
assert.equal(live.airingToday[0].media_type, 'tv');
assert.equal(live.tracking.length, 6);

delete process.env.TMDB_API_KEY;
let fetched = false;
const missing = await refreshCinema(async () => {
  fetched = true;
  return jsonResponse({ results: [] });
});
assert.equal(fetched, false, 'no fetch without a key');
assert.equal(missing.ok, false);
assert.equal(missing.status, 'missing-key');
assert.deepEqual(missing.trending, []);
assert.deepEqual(missing.nowPlaying, []);
assert.deepEqual(missing.upcoming, []);
assert.deepEqual(missing.airingToday, []);
assert.equal(missing.tracking.length, 6);

if (savedKey !== undefined) process.env.TMDB_API_KEY = savedKey;
console.log('all cinema tests passed');
