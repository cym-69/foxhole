// Foxhole release gate — PRODUCT_GOAL.md acceptance evidence.
// 1. HTTP probes: /api/state, /api/health, /api/sats; security headers; unknown route 404.
// 2. SSE: connect to /stream, require at least one event within 25s.
// 3. Loopback guard: HOST=0.0.0.0 must throw (import in a child process).
// Usage: node tools/release-check.mjs [baseUrl]   (defaults to http://127.0.0.1:4180)
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const BASE = process.argv[2] || 'http://127.0.0.1:4180';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const SERVER_CONFIG = path.resolve(HERE, '../server/config.js');

let pass = 0;
let fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log(`PASS: ${name}${extra ? ' — ' + extra : ''}`); }
  else { fail++; console.log(`FAIL: ${name}${extra ? ' — ' + extra : ''}`); }
};

// ---------- 1. HTTP probes ----------
console.log(`Base URL: ${BASE}`);
const state = await fetch(BASE + '/api/state').then(r => r.json());
ok('/api/state 200 + events[]', Array.isArray(state?.events), `events=${state?.events?.length ?? '?'}`);
ok('/api/state modes labelled', state?.status && typeof state.status === 'object', JSON.stringify(state?.status ?? {}).slice(0, 160));

const health = await fetch(BASE + '/api/health').then(async r => ({ status: r.status, body: await r.json().catch(() => ({})) }));
ok('/api/health ok', health.status === 200 && health.body?.ok === true, `status=${health.status}`);

const sats = await fetch(BASE + '/api/sats');
const satsBody = await sats.text();
ok('/api/sats array', sats.ok && satsBody.trim().startsWith('['), `bytes=${satsBody.length}`);

const nf = await fetch(BASE + '/api/this-route-does-not-exist');
const nfBody = await nf.text();
ok('unknown /api/* -> 404 JSON (not SPA)', nf.status === 404 && nfBody.includes('"error"'), `status=${nf.status}`);

// Security headers on API + HTML shell
const apiRes = await fetch(BASE + '/api/state');
ok('API: X-Content-Type-Options nosniff', (apiRes.headers.get('x-content-type-options') || '') === 'nosniff', apiRes.headers.get('x-content-type-options') || '(missing)');
ok('API: Referrer-Policy present', (apiRes.headers.get('referrer-policy') || '').trim().length > 0, apiRes.headers.get('referrer-policy') || '(missing)');
const html = await fetch(BASE + '/');
ok('HTML: X-Frame-Options present', /S/.test(html.headers.get('x-frame-options') || ''), html.headers.get('x-frame-options') || '(missing)');

// ---------- 2. SSE ----------
{
  const ac = new AbortController();
  let events = 0;
  let closed = false;
  try {
    const res = await fetch(BASE + '/stream', { signal: ac.signal, headers: { Accept: 'text/event-stream' } });
    ok('SSE Content-Type text/event-stream', (res.headers.get('content-type') || '').includes('text/event-stream'), res.headers.get('content-type') || '(missing)');
    ok('SSE Cache-Control no-cache', (res.headers.get('cache-control') || '').includes('no-cache'), res.headers.get('cache-control') || '(missing)');
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = '';
    const deadline = Date.now() + 25000;
    while (Date.now() < deadline && events === 0) {
      const { value, done } = await reader.read();
      if (done) { closed = true; break; }
      buf += dec.decode(value, { stream: true });
      const parts = buf.split('\n\n');
      buf = parts.pop();
      for (const p of parts) { if (/^event:/m.test(p) || /^data:/m.test(p)) events++; }
    }
    ok('SSE first event received', events > 0, `events=${events}`);
    ok('SSE connection stayed open', !closed);
    try { reader.cancel(); } catch { /* reader may already be closed */ }
    ac.abort();
  } catch (e) {
    ok('SSE first event received', false, String(e.message || e));
    ok('SSE connection stayed open', false, 'exception');
  }
}

// ---------- 3. Loopback guard ----------
{
  const child = spawnSync(process.execPath, ['--input-type=module', '-e', `await import(${JSON.stringify(pathToFileURL(SERVER_CONFIG).href)})`], {
    env: { ...process.env, HOST: '0.0.0.0', FOXHOLE_DATA_DIR: path.resolve(HERE, '../data') },
    encoding: 'utf-8',
    timeout: 20000,
  });
  const out = ((child.stderr || '') + (child.stdout || '')).slice(0, 400);
  ok('HOST=0.0.0.0 rejected (loopback-only)', child.status !== 0 && /loopback/i.test(out), `exit=${child.status} ${out.split('\n')[0]}`);
  const loop = spawnSync(process.execPath, ['--input-type=module', '-e', `const m = await import(${JSON.stringify(pathToFileURL(SERVER_CONFIG).href)}); console.log('HOST_OK ' + m.cfg.host)`], {
    env: { ...process.env, HOST: '127.0.0.1', FOXHOLE_DATA_DIR: path.resolve(HERE, '../data') },
    encoding: 'utf-8',
    timeout: 20000,
  });
  ok('HOST=127.0.0.1 accepted', loop.status === 0 && /HOST_OK 127\.0\.0\.1/.test(loop.stdout || ''), `exit=${loop.status}`);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
