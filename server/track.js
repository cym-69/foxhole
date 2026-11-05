import fs from 'node:fs';
import path from 'node:path';
import { DATA_DIR } from './config.js';

const FILE = path.join(DATA_DIR, 'track.json');
let db = { open: [], closed: [], stats: {} };
try { db = { ...db, ...JSON.parse(fs.readFileSync(FILE, 'utf8')) }; } catch { /* intentional: missing file → defaults */ }
const save = () => { try { fs.writeFileSync(FILE, JSON.stringify(db)); } catch { /* intentional: persist is best-effort */ } };

export const getStats = () => db.stats;
export const getTrack = () => ({ open: db.open.length, closed: db.closed.length, stats: db.stats, recent: db.closed.slice(-20) });

// Log each BUY or SELL signal once, using a LIVE price only. Demo prices are never logged.
export function record(signals, getQuote, isLive) {
  const seen = new Set([...db.open, ...db.closed].map((o) => o.key));
  let changed = false;
  for (const s of signals) {
    if (s.action === 'WATCH' || !isLive(s.asset)) continue;
    const key = `${s.eventId}:${s.ruleId}:${s.asset}`;
    if (seen.has(key)) continue;
    const price = getQuote(s.asset)?.price;
    if (!price) continue;
    const now = Date.now();
    db.open.push({ key, ruleId: s.ruleId, asset: s.asset, dir: s.dir, entry: price, ts: now, endTs: now + s.windowH * 3600000 });
    changed = true;
  }
  if (changed) save();
}

// When a signal's window ends, check the price and score the rule: hit = moved 0.25%+ the predicted way.
export function settle(getQuote, isLive) {
  const now = Date.now();
  let changed = false;
  db.open = db.open.filter((o) => {
    if (now < o.endTs) return true;
    const q = getQuote(o.asset);
    if (!q || !isLive(o.asset)) return now < o.endTs + 6 * 3600000; // wait a bit for live data, then drop
    const move = (q.price - o.entry) / o.entry;
    const hit = o.dir * move >= 0.0025;
    const s = (db.stats[o.ruleId] ||= { n: 0, hits: 0 });
    s.n += 1; s.hits += hit ? 1 : 0;
    db.closed.push({ ...o, exit: q.price, move: Number(move.toFixed(4)), hit });
    if (db.closed.length > 500) db.closed.shift();
    changed = true;
    return false;
  });
  if (changed) save();
}
