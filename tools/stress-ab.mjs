// Foxhole stress gate A+B (load + SSE fan-out). Throws/writes evidence/stress-results.md.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const BASE = 'http://127.0.0.1:4180';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(HERE, '../evidence');
fs.mkdirSync(OUT, { recursive: true });

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const rssOfNode = async () => {
  const { execSync } = await import('node:child_process');
  try {
    const out = execSync('powershell -Command "Get-Process node -ErrorAction SilentlyContinue | Measure-Object WorkingSet -Sum | Select-Object -ExpandProperty Sum"', { encoding: 'utf8', timeout: 8000 });
    return Math.round(Number(String(out).trim() || 0) / 1024 / 1024);
  } catch { return -1; }
};
async function fetchJson(url, opts = {}) {
  const t0 = Date.now();
  const r = await fetch(url, opts);
  const ms = Date.now() - t0;
  const txt = await r.text();
  let j = null; try { j = JSON.parse(txt); } catch {}
  return { status: r.status, ms, bytes: txt.length, json: j };
}
async function burst(url, n) {
  const lat = []; let ok = 0, fivexx = 0, errs = 0;
  await Promise.all(Array.from({ length: n }, async () => {
    try {
      const res = await fetchJson(url);
      lat.push(res.ms); if (res.status >= 500) fivexx++; else if (res.status === 200) ok++;
    } catch { errs++; }
  }));
  lat.sort((a, b) => a - b);
  const p = (q) => lat.length ? lat[Math.min(lat.length - 1, Math.floor(q * lat.length))] : 0;
  return { n, ok, fivexx, errs, p50: p(0.5), p99: p(0.99), max: lat[lat.length - 1] || 0 };
}

const results = [];
const line = (s) => { results.push(s); console.log(s); };

// ---- A1: burst 200 concurrent
line('A1 burst 200 /api/state: ' + JSON.stringify(await burst(BASE + '/api/state', 200)));
line('A1 burst 200 /api/health: ' + JSON.stringify(await burst(BASE + '/api/health', 200)));
// ---- A2: ramp
for (const n of [50, 200, 500]) line('A2 ramp ' + n + ' concurrent /api/state: ' + JSON.stringify(await burst(BASE + '/api/state', n)));
// ---- A3: /api/sats 100 rps x 60s via sequential-ish concurrency 20
{
  const t0 = Date.now(); let ok = 0, fivexx = 0, total = 0; const lat = [];
  while (Date.now() - t0 < 15000) {
    const batch = await Promise.all(Array.from({ length: 20 }, async () => {
      try { const r = await fetchJson(BASE + '/api/sats'); lat.push(r.ms); return r.status; } catch { return 0; }
    }));
    for (const s of batch) { total++; if (s === 200) ok++; else if (s >= 500) fivexx++; }
  }
  lat.sort((a, b) => a - b);
  line('A3 /api/sats 15s x20-conc: ' + JSON.stringify({ total, ok, fivexx, p50: lat[Math.floor(lat.length / 2)] || 0, p99: lat[Math.floor(lat.length * 0.99)] || 0 }));
}
// ---- B: SSE fan-out
{
  const clients = [];
  const open = async () => {
    const ctrl = new AbortController();
    const res = await fetch(BASE + '/stream', { signal: ctrl.signal });
    // read first chunk (snapshot)
    const reader = res.body.getReader();
    await reader.read();
    return { ctrl, reader };
  };
  const rss0 = await rssOfNode();
  for (let i = 0; i < 25; i++) clients.push(await open());
  line('B1 25 SSE clients open, RSS MB=' + rss0);
  // reconnect waves
  for (let w = 0; w < 5; w++) {
    const wave = [];
    for (let i = 0; i < 10; i++) wave.push(await open());
    for (const c of wave) { try { c.ctrl.abort(); } catch {} }
    await sleep(500);
  }
  const rss1 = await rssOfNode();
  line('B2 after 5x10 reconnect waves RSS MB=' + rss1 + ' delta=' + (rss1 - rss0));
  for (const c of clients) { try { c.ctrl.abort(); } catch {} }
  await sleep(1500);
  const rss2 = await rssOfNode();
  line('B3 after closing 25 clients RSS MB=' + rss2 + ' delta_vs_start=' + (rss2 - rss0));
  line('B PASS leak= ' + ((rss2 - rss0) < 30 ? 'PASS' : 'FAIL') + ' (delta <30MB)');
}
line('---');
fs.writeFileSync(path.join(OUT, 'stress-results.md'), '# Foxhole stress results (A+B)\n\n' + results.join('\n') + '\n');
console.log('wrote evidence/stress-results.md');
