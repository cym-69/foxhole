import fs from 'node:fs';
const path = process.argv[2];
const raw = fs.readFileSync(path, 'utf8').split('\n\n').filter(Boolean);
const srcs = new Map();
for (const chunk of raw) {
  const m = chunk.match(/^event: (\w+)\ndata: (.*)$/s);
  if (!m) continue;
  const ev = m[1];
  let d;
  try { d = JSON.parse(m[2]); } catch { continue; }
  if (ev === 'snapshot') {
    console.log('snapshot keys:', Object.keys(d || {}).join(','));
    console.log('snapshot feed len:', (d.feed || d.items || d.events || []).length);
    const feed = d.feed || [];
    for (const it of feed) console.log('snap feed:', JSON.stringify(Object.keys(it)).slice(0, 120), '|', it.srcName || it.src, '|', (it.title || it.headline || it.text || '').slice(0, 70), '->', (it.url || it.link || '').slice(0, 70));
  }
  if (ev === 'feed') {
    const name = d.srcName || d.src || d.source || d.id;
    srcs.set(name, (srcs.get(name) || 0) + 1);
    if (srcs.get(name) <= 1) console.log('feed src:', name, '|', (d.title || '').slice(0, 60), '->', (d.url || '').slice(0, 60));
  }
  if (ev === 'headlines') {
    console.log('headlines event keys:', Object.keys(d || {}).join(','));
    console.log('headlines sample:', JSON.stringify(d).slice(0, 400));
  }
}
console.log('stream feed sources:', JSON.stringify([...srcs.entries()]));
for (const chunk of raw) {
  const m = chunk.match(/^event: (\w+)\ndata: (.*)$/s);
  if (!m) continue;
  if (m[1] === 'snapshot') {
    let d; try { d = JSON.parse(m[2]); } catch { continue; }
    const feed = d.feed || [];
    const bySrc = new Map();
    for (const it of feed) bySrc.set(it.srcName || it.src, (bySrc.get(it.srcName || it.src) || 0) + 1);
    console.log('snapshot feed by src:', JSON.stringify([...bySrc.entries()]));
  }
}
