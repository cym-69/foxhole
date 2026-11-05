import { cfg } from '../config.js';
import { CRYPTO } from '../assets.js';

const UA = { 'User-Agent': 'Foxhole/0.1 (personal dashboard)' };

// Turn whatever the sentiment endpoint returns into { label, score, value (-1 to 1) }.
export function normSentiment(j) {
  const d = j?.data ?? j ?? {};
  const label = String(d.label ?? d.sentiment ?? d.classification ?? '').toLowerCase();
  let score = Number(d.score ?? d.value ?? d.sentimentScore);
  if (!Number.isFinite(score)) score = 0;
  let sign = 0;
  if (/bull|pos|greed|up/.test(label)) sign = 1;
  else if (/bear|neg|fear|down/.test(label)) sign = -1;
  let value = score;
  if (score > 1 || score < -1) value = score / 100;
  if (sign !== 0 && Math.abs(value) < 0.05) value = sign * 0.2;
  if (sign === 1 && value < 0) value = Math.abs(value);
  if (sign === -1 && value > 0) value = -value;
  return { label: label || (value > 0.15 ? 'bullish' : value < -0.15 ? 'bearish' : 'neutral'), score: Number(value.toFixed(2)), value: Math.max(-1, Math.min(1, value)) };
}

export async function fetchSentiment() {
  const out = {};
  await Promise.all(CRYPTO.filter((s) => s !== 'USDT').map(async (sym) => {
    try {
      const r = await fetch(`${cfg.cryptoBase}/api/ai/sentiment?asset=${sym}`, { headers: UA, signal: AbortSignal.timeout(12000) });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      out[sym] = normSentiment(await r.json());
    } catch { /* leave missing */ }
  }));
  return out;
}
