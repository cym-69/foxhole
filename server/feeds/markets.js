import { cfg } from '../config.js';
import { ASSETS, TRAD, CRYPTO } from '../assets.js';

const UA = { 'User-Agent': 'Foxhole/0.1 (personal dashboard)' };
const HIST = 60;
const store = new Map(); // sym -> { price, pct, vol, ts, hist[], demo }
const DEMO_BASE = { USO: 72, UNG: 14, GLD: 235, CPER: 28, WEAT: 5.6, CORN: 18.5, ITA: 160, JETS: 24, SOXX: 230, TSM: 190, STNG: 58, ZIM: 19, SPY: 560, BTC: 68000, ETH: 3400, SOL: 160, USDT: 1 };

export const status = { markets: { mode: 'demo', note: 'Add a free Finnhub key for live prices.' }, cryptoPrices: { mode: 'demo', note: '' } };

function push(sym, price, pct, vol, demo) {
  const prev = store.get(sym);
  const hist = prev?.hist ? [...prev.hist] : [];
  hist.push(price);
  if (hist.length > HIST) hist.shift();
  // Prefill marker: the first observation for a symbol is the live price at
  // server start. Repeating it in hist[] would paint a flat segment that
  // looks like real movement is missing. MarketsChart hides runs of the
  // prefill value by rendering the series starting at the first distinct
  // price — the prefill point itself stays the x=0 anchor.
  const prefill = hist.length === 1 ? price : prev?.prefill ?? price;
  store.set(sym, { price, pct, vol, ts: Date.now(), hist, prefill, demo });
}

function demoStep(sym) {
  const prev = store.get(sym);
  const base = DEMO_BASE[sym];
  const p = prev?.price ?? base;
  const drift = sym === 'USDT' ? 0.0002 : 0.003;
  const next = Math.max(0.01, p * (1 + (Math.random() - 0.5) * drift));
  push(sym, next, ((next - base) / base) * 100, null, true);
}

async function finnhubQuote(sym) {
  const url = `${cfg.finnhubBase}/quote?symbol=${sym}&token=${cfg.finnhubKey}`;
  const r = await fetch(url, { headers: UA, signal: AbortSignal.timeout(10000) });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  const j = await r.json();
  if (!j || !j.c) throw new Error('no price');
  return { price: j.c, pct: typeof j.dp === 'number' ? j.dp : 0 };
}

export async function refreshTrad(symbols = TRAD, maxAgeMs = 20000) {
  const due = symbols.filter((s) => TRAD.includes(s) && (!store.get(s) || Date.now() - store.get(s).ts > maxAgeMs));
  if (!cfg.finnhubKey) {
    status.markets = { mode: 'demo', note: 'Add a free Finnhub key for live prices.' };
    TRAD.forEach(demoStep);
    return;
  }
  let ok = 0, fail = 0, lastErr = '';
  for (const s of due) {
    try { const q = await finnhubQuote(s); push(s, q.price, q.pct, null, false); ok++; }
    catch (e) { fail++; lastErr = e.message; }
  }
  if (ok > 0 || store.get(TRAD[0])?.demo === false) status.markets = { mode: 'live', note: fail ? `${fail} symbols failed (${lastErr})` : '' };
  else if (fail) status.markets = { mode: 'error', note: `Finnhub error: ${lastErr}` };
}

export async function refreshCrypto() {
  try {
    const ids = CRYPTO.map((s) => ASSETS[s].cg).join(',');
    const r = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd&include_24hr_change=true&include_24hr_vol=true`, { headers: UA, signal: AbortSignal.timeout(10000) });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const j = await r.json();
    let n = 0;
    for (const s of CRYPTO) {
      const d = j[ASSETS[s].cg];
      if (d?.usd) { push(s, d.usd, d.usd_24h_change ?? 0, d.usd_24h_vol ?? null, false); n++; }
    }
    if (!n) throw new Error('empty reply');
    status.cryptoPrices = { mode: 'live', note: '' };
  } catch (e) {
    CRYPTO.forEach(demoStep);
    status.cryptoPrices = { mode: 'demo', note: `Crypto prices unavailable (${e.message}).` };
  }
}

export const getQuote = (sym) => store.get(sym) || null;
export const isLivePrice = (sym) => store.get(sym)?.demo === false;
export function snapshot(syms) {
  const o = {};
  for (const s of syms) {
    const q = store.get(s);
    if (q) o[s] = { sym: s, label: ASSETS[s].label, kind: ASSETS[s].kind, price: q.price, pct: q.pct, vol: q.vol, hist: q.hist, demo: q.demo, ts: q.ts };
  }
  return o;
}
