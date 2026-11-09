const ac = new AbortController();
const res = await fetch('http://127.0.0.1:4180/stream', { signal: ac.signal });
const reader = res.body.getReader(); const dec = new TextDecoder();
let buf = ''; let feedItems = []; let gotSnapshot = false;
const start = Date.now();
while (Date.now() - start < 12000 && !gotSnapshot) {
  const { value, done: d } = await reader.read();
  if (d) break;
  buf += dec.decode(value, { stream: true });
  const parts = buf.split('\n\n'); buf = parts.pop();
  for (const p of parts) {
    if (p.includes('event: snapshot')) {
      const idx = p.indexOf('data: '); if (idx < 0) continue;
      try { const j = JSON.parse(p.slice(idx + 6)); feedItems = j.feed || []; gotSnapshot = true; } catch {}
    }
  }
}
try { reader.cancel(); } catch {}
console.log('FEED_N=' + feedItems.length);
console.log('FEED_HAS_TAGS=' + feedItems.some((it)=> Array.isArray(it.tags) && it.tags.length));
console.log('FEED_KEYS=' + (feedItems[0] ? Object.keys(feedItems[0]).join(',') : 'empty'));
console.log('FEED_SAMPLE=' + JSON.stringify(feedItems.slice(0,3)).slice(0,800));
const s = await (await fetch('http://127.0.0.1:4180/api/state')).json();
console.log('STATE_KEYS=' + Object.keys(s).join(','));
const assets = s.assets ? Object.keys(s.assets) : [];
console.log('ASSETS=' + assets.join(','));
