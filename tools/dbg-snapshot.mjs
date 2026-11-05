// Read one SSE snapshot from the running server, print the feed items and a few state numbers.
const BASE = process.env.PAGE_URL || 'http://127.0.0.1:4180';
const ac = new AbortController();
const res = await fetch(BASE + '/stream', { signal: ac.signal, headers: { Accept: 'text/event-stream' } });
const reader = res.body.getReader();
const dec = new TextDecoder();
let buf = '';
let snap = null;
const _items = [];
while (!snap) {
  const { value, done } = await reader.read();
  if (done) break;
  buf += dec.decode(value, { stream: true });
  const parts = buf.split('\n\n');
  buf = parts.pop();
  for (const p of parts) {
    if (/^event: snapshot/m.test(p)) {
      const m = p.match(/^data: (.*)$/m);
      if (m) { snap = JSON.parse(m[1]); break; }
    }
  }
}
ac.abort();
console.log('SNAPSHOT_FEED_COUNT=' + snap.feed.length);
for (const it of snap.feed.slice(0, 5)) {
  let t = String(it.text);
  if (t.length > 70) t = t.slice(0, 70);
  console.log(`FEED_ITEM ${it.srcName} | ${t} | kind=${it.kind} url=${it.url} ago=${Math.round((Date.now() - it.ts) / 60000)}m`);
}
const st = await (await fetch(BASE + '/api/state')).json();
console.log('TOPBAR seen=' + st.status.events.counts.seen + ' linked=' + st.status.events.counts.linked);
const live = await (await fetch(BASE + '/api/live')).json();
console.log('HEADLINES ' + live.headlines.status + ' sources=' + live.headlines.sources.map((s) => `${s.id}:${s.ok}`).join(','));
console.log('EVENT_ITEMS_IN_FEED=' + snap.feed.filter((f) => f.eventId).length);
console.log('NEWS_ITEMS_IN_FEED=' + snap.feed.filter((f) => !f.eventId).length);
