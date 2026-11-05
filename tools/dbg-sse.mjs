// Debug: raw SSE client plus a test event, to see which messages the server sends.
const BASE = process.env.PAGE_URL || 'http://127.0.0.1:4180';
const ac = new AbortController();
const res = await fetch(BASE + '/stream', { signal: ac.signal, headers: { Accept: 'text/event-stream' } });
const reader = res.body.getReader();
const dec = new TextDecoder();
let buf = '';
const seen = [];
const done = (async () => {
  while (true) {
    const { value, done: d } = await reader.read();
    if (d) break;
    buf += dec.decode(value, { stream: true });
    const parts = buf.split('\n\n');
    buf = parts.pop();
    for (const p of parts) {
      const ev = (p.match(/^event: (.+)$/m) || [])[1] || '?';
      seen.push(ev);
      if (ev === 'feed') console.log('FEED ' + (p.match(/^data: (.*)$/m) || [])[1]?.slice(0, 160));
    }
  }
})();
await new Promise((r) => setTimeout(r, 4000));
console.log('EVENTS_SO_FAR=' + seen.join(','));
const r2 = await fetch(BASE + '/__test/event', {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ title: 'SSE debug event', kind: 'conflict', lat: 24, lng: 40, size: 0.4, place: 'Test', sources: 1 }),
});
console.log('POST_STATUS=' + r2.status);
await new Promise((r) => setTimeout(r, 20000));
console.log('EVENTS_AFTER=' + seen.join(','));
ac.abort();
