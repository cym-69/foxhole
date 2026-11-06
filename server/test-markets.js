// Golden-file tests for src/lib/markets-window.js buildSeriesPts
// (used by MarketsChart.jsx). Pure-function tests — no DOM, no server needed.
// Run: node server/test-markets.js
import { buildSeriesPts } from '../src/lib/markets-window.js';

export function runTests() {
  const F = [];
  const ok = (name, cond) => { if (cond) F.push(`PASS: ${name}`); else F.push(`FAIL: ${name}`); };

  // 1. Real 40-tick window is right-aligned (latest at index 39)
  {
    const hist = Array.from({ length: 40 }, (_, i) => 100 + i);
    const pts = buildSeriesPts(hist, undefined);
    ok('40 ticks: length 40', pts.length === 40);
    ok('40 ticks: first slot is hist[0]', pts[0] === 100);
    ok('40 ticks: last slot is hist[39] (latest)', pts[39] === 139);
    ok('40 ticks: monotonic', pts.every((v, i) => i === 0 || v > pts[i - 1]));
  }

  // 2. Over-long history slices to the last 40 (old ticks dropped)
  {
    const hist = Array.from({ length: 100 }, (_, i) => 100 + i);
    const pts = buildSeriesPts(hist, undefined);
    ok('100 ticks: sliced to 40', pts.length === 40);
    ok('100 ticks: first slot is hist[60] (the 40-window start)', pts[0] === 160);
    ok('100 ticks: last slot is hist[99]', pts[39] === 199);
  }

  // 3. Short history pads to 40 with the first observed value (flat, no fake move)
  {
    const pts = buildSeriesPts([100, 101, 102, 103], undefined);
    ok('4 ticks: padded to 40', pts.length === 40);
    ok('4 ticks: leading slots are the first observed value', pts.slice(0, 36).every((v) => v === 100));
    ok('4 ticks: real ticks occupy the last 4 slots', pts.slice(36).join(',') === '100,101,102,103');
  }

  // 4. A differing server prefill anchor lands as the very first slot
  {
    const pts = buildSeriesPts([100, 101], 99);
    ok('prefill anchor: first slot is the prefill', pts[0] === 99);
    ok('prefill anchor: real ticks stay right-aligned', pts[39] === 101 && pts[38] === 100);
    ok('prefill anchor: 38 unknown slots filled with the prefill', pts.slice(1, 38).every((v) => v === 99));
  }

  // 5. A prefill equal to the first tick does NOT duplicate — window[0] fills
  {
    const pts = buildSeriesPts([100, 101, 102], 100);
    ok('prefill === first: all leading slots are the first tick', pts.slice(0, 37).every((v) => v === 100));
  }

  // 6. Non-numbers and tiny histories produce no series
  ok('no hist: []', buildSeriesPts(undefined, undefined).length === 0);
  ok('one tick: [] (series hidden until 2 ticks)', buildSeriesPts([100], undefined).length === 0);
  ok('mixed: non-numbers are filtered out', buildSeriesPts([100, 'x', null, 101], undefined).join(',').endsWith(',100,101'));
  ok('non-array hist: []', buildSeriesPts(null, 99).length === 0);

  // Verdict
  const fails = F.filter((l) => l.startsWith('FAIL'));
  for (const l of F) console.log(l);
  if (fails.length) { console.error(`${fails.length} markets test(s) failed`); process.exit(1); }
  console.log('all markets tests passed');
}

runTests();
