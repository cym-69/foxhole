// Tests the X feed module with crafted RSS and fake fetches (no network).
import assert from 'node:assert/strict';
import { sanitizeHandles, normalizeXItem, parseNitterRss, refreshXFeed, xFeedSnapshot } from './feeds/xfeed.js';

const xml = `<rss version="2.0"><channel>
  <item>
    <title>First test post</title>
    <link>https://nitter.net/example/status/123456</link>
    <guid>https://nitter.net/example/status/123456</guid>
    <pubDate>Thu, 05 Nov 2026 20:00:00 GMT</pubDate>
  </item>
  <item>
    <title>Second test post</title>
    <link>https://nitter.net/example/status/789012</link>
    <guid>https://nitter.net/example/status/789012</guid>
    <pubDate>Thu, 05 Nov 2026 21:00:00 GMT</pubDate>
  </item>
</channel></rss>`;

const parsed = parseNitterRss(xml, 'Example');
assert.equal(parsed.length, 2);
assert.ok(parsed.every((i) => i.url.startsWith('https://x.com/')), 'nitter urls canonicalized to x.com');
assert.ok(parsed.every((i) => i.author === '@Example' && i.srcName === 'x' && i.id.startsWith('x:') && typeof i.ts === 'number'));

// sanitizeHandles
const sanitized = sanitizeHandles([
  { handle: '@Reuters', label: 'Reuters' },
  { handle: 'reuters' },
  { handle: 'BBCBreaking', label: 'BBC Breaking' },
  { handle: '@BBCBreaking' },
  { handle: 'not valid!' },
  { handle: 'USGS_Quakes' },
]);
assert.deepEqual(sanitized, [
  { handle: 'Reuters', label: 'Reuters' },
  { handle: 'BBCBreaking', label: 'BBC Breaking' },
  { handle: 'USGS_Quakes', label: 'USGS_Quakes' },
]);

// normalizeXItem rejects bad input and keeps non-nitter urls
assert.equal(normalizeXItem(null, 'Example'), null);
assert.equal(normalizeXItem({ url: 'javascript:alert(1)', title: 'x' }, 'Example'), null);
const ext = normalizeXItem({ url: 'https://example.com/a', title: 'Hi', pubDate: 'Thu, 05 Nov 2026 20:00:00 GMT' }, 'Example');
assert.equal(ext.url, 'https://example.com/a');

// refreshXFeed with always-failing fake fetch: resolves with an ok snapshot
const failingFetch = async () => ({ ok: false, status: 500, text: async () => 'err' });
const snap = await refreshXFeed(failingFetch);
assert.equal(snap.ok, true);
assert.ok(Array.isArray(snap.items));
assert.equal(xFeedSnapshot().ok, true);

console.log('all xfeed tests passed');
