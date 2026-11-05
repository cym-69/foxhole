import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sanitizeWatchlist, checkOne } from './feeds/livewatch.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const seed = JSON.parse(fs.readFileSync(path.join(here, 'config', 'live-watchlist.json'), 'utf8'));
assert.ok(Array.isArray(seed) && seed.length > 0, 'seed is a non-empty JSON array');
const seedClean = sanitizeWatchlist(seed);
assert.equal(seedClean.length, seed.length, 'every seed entry is valid');

function jsonResponse(payload, status = 200) {
  return { ok: status < 400, status, json: async () => payload };
}

// sanitizeWatchlist drops invalid entries and caps at 60.
const cleaned = sanitizeWatchlist([
  { id: 'a', platform: 'kick', handle: 'candaceowens', name: 'Candace Owens (Kick)', enabled: true },
  { id: 'b', platform: 'myspace', handle: 'nope', name: 'Bad platform', enabled: true },
  { id: 'c', platform: 'kick', handle: '', name: 'Missing handle', enabled: true },
  { id: 'd', platform: 'twitch', handle: 'someone', enabled: true },
  { id: '', platform: 'kick', handle: 'x', name: 'Empty id', enabled: true },
  { id: 'a', platform: 'kick', handle: 'duplicate', name: 'Duplicate id', enabled: true },
  { id: 'e', platform: 'YOUTUBE', handle: 'SomeChannel', name: 'Case test', enabled: true },
  'junk',
  null,
]);
assert.equal(cleaned.length, 2, 'only two valid entries survive');
assert.equal(cleaned[0].url, 'https://kick.com/candaceowens');
assert.equal(cleaned[0].enabled, true);
assert.equal(cleaned[1].platform, 'youtube');
assert.equal(cleaned[1].url, 'https://www.youtube.com/@SomeChannel');
assert.deepEqual(sanitizeWatchlist(null), []);
assert.deepEqual(sanitizeWatchlist('nope'), []);

const sixtyOne = Array.from({ length: 61 }, (_, i) => ({
  id: `id-${i}`,
  platform: 'kick',
  handle: `handle${i}`,
  name: `Name ${i}`,
  enabled: true,
}));
assert.equal(sanitizeWatchlist(sixtyOne).length, 60, 'sanitizeWatchlist caps at 60 entries');

// kick live: livestream non-null => live true.
let kickCalls = 0;
const kickLive = await checkOne(
  { id: 'ko-candaceowens', platform: 'kick', handle: 'candaceowens', name: 'Candace Owens (Kick)', url: 'https://kick.com/candaceowens', enabled: true },
  {
    fetchImpl: async (url) => {
      kickCalls++;
      assert.ok(url.includes('kick.com/api/v2/channels/candaceowens'), `kick url shape: ${url}`);
      return jsonResponse({
        livestream: {
          session_title: 'Live title',
          category: { name: 'Politics' },
          viewers: 42,
          thumbnail_url: 'https://example.com/thumb.jpg',
          created_at: '2026-11-05T10:00:00.000Z',
        },
      });
    },
  },
);
assert.equal(kickCalls, 1);
assert.equal(kickLive.id, 'ko-candaceowens');
assert.equal(kickLive.live, true);
assert.equal(kickLive.unknown, false);
assert.equal(kickLive.title, 'Live title');
assert.equal(kickLive.category, 'Politics');
assert.equal(kickLive.viewers, 42);
assert.equal(kickLive.thumbnail, 'https://example.com/thumb.jpg');
assert.equal(kickLive.startedAt, '2026-11-05T10:00:00.000Z');
assert.ok(kickLive.checkedAt);

// kick offline: livestream null => live false, unknown false.
const kickOffline = await checkOne(
  { id: 'ko-candaceowens', platform: 'kick', handle: 'candaceowens', name: 'Candace Owens (Kick)', url: 'https://kick.com/candaceowens', enabled: true },
  { fetchImpl: async () => jsonResponse({ livestream: null }) },
);
assert.equal(kickOffline.live, false);
assert.equal(kickOffline.unknown, false);

// twitch missing creds => unknown true, and no fetch happens.
let twitchFetched = false;
const twitchUnknown = await checkOne(
  { id: 'tw-someone', platform: 'twitch', handle: 'someone', name: 'Someone (Twitch)', url: 'https://www.twitch.tv/someone', enabled: true },
  {
    fetchImpl: async () => {
      twitchFetched = true;
      return jsonResponse({ data: [] });
    },
    twitchClientId: '',
    twitchToken: '',
  },
);
assert.equal(twitchFetched, false, 'twitch without creds must not fetch');
assert.equal(twitchUnknown.live, false);
assert.equal(twitchUnknown.unknown, true);

// youtube always unknown and never fake-live.
let youtubeFetched = false;
const youtubeUnknown = await checkOne(
  { id: 'yt-candaceowens', platform: 'youtube', handle: 'CandaceOwens', name: 'Candace Owens (YouTube)', url: 'https://www.youtube.com/@CandaceOwens', enabled: true },
  {
    fetchImpl: async () => {
      youtubeFetched = true;
      return jsonResponse({});
    },
  },
);
assert.equal(youtubeFetched, false);
assert.equal(youtubeUnknown.live, false);
assert.equal(youtubeUnknown.unknown, true);

// rumble also unknown.
const rumbleUnknown = await checkOne(
  { id: 'rumble-candaceowens', platform: 'rumble', handle: 'candaceowens', name: 'Candace Owens (Rumble)', url: 'https://rumble.com/candaceowens', enabled: true },
  { fetchImpl: async () => jsonResponse({}) },
);
assert.equal(rumbleUnknown.live, false);
assert.equal(rumbleUnknown.unknown, true);

console.log('all livewatch tests passed');
