import { motion } from 'framer-motion';
import Spark from './Spark.jsx';
import { arrow, dirColor, price } from '../lib/format.js';
import { quoteDeltas, BLOCKED_LABEL, fmtDelta } from '../lib/deltas.js';
import { REDUCED, SPRING_LAYOUT, fadeUp, staggerParent } from '../lib/motion.js';

function Gauge({ value }) {
  const v = Math.max(-1, Math.min(1, value ?? 0));
  const color = v > 0.1 ? '#22A352' : v < -0.1 ? '#E64A2E' : '#E6A700';
  return (
    <div className="relative h-[6px] flex-1 border-2 border-black bg-white" style={{ borderRadius: 999 }}>
      <span className="absolute left-1/2 top-[-3px] h-[10px] w-[2px] bg-black" />
      <span className="absolute top-[-4px] h-[10px] w-[10px] rounded-full border-2 border-black" style={{ left: `calc(${((v + 1) / 2) * 100}% - 5px)`, background: color }} />
    </div>
  );
}

function Card({ q, hit, pressure, isCrypto }) {
  const d = quoteDeltas(q);
  const live = d.d24h != null;
  const up = live ? d.d24h >= 0 : (q.pct ?? 0) >= 0;
  const dUp = (d.d24h ?? 0) >= 0;
  const gaugeValue = isCrypto ? (typeof q.sentiment?.value === 'number' ? q.sentiment.value : 0) : pressure;
  const sentiment = q.sentiment;
  const sentimentLabel = typeof sentiment?.label === 'string' && sentiment.label.trim()
    ? sentiment.label
    : (sentiment != null ? (typeof sentiment.value === 'number' ? 'sentiment unavailable' : (typeof sentiment === 'string' && sentiment.trim() ? sentiment : 'sentiment unavailable')) : 'no data');
  const gaugeLabel = isCrypto
    ? sentimentLabel
    : pressure === 0 ? 'no pressure' : pressure > 0 ? 'upward pressure' : 'downward pressure';
  return (
    <motion.div
      layout={!REDUCED} transition={REDUCED ? { duration: 0 } : SPRING_LAYOUT} data-asset={q.sym}
      variants={fadeUp} initial="hidden" animate="show" exit="exit"
      className="sb-card w-[176px] shrink-0 px-2.5 py-2"
      style={hit ? { background: '#FFD23F', boxShadow: '4px 4px 0 #111' } : {}}
    >
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1 text-[13px] font-black">
          {q.sym}
          {hit && <span className={`text-[10px] ${dirColor(hit)}`}>{arrow(hit)}</span>}
        </span>
        <span data-testid="price-delta" data-asset-delta={q.sym} className="sb-chip num px-1.5 text-xs" style={live ? { background: dUp ? '#C6E265' : '#FF7A59' } : { background: '#E6E6E6' }} title={live ? `24h change ${fmtDelta(d.d24h)}${d.d1h != null ? ` · 1h ${fmtDelta(d.d1h)}` : ''}` : 'Live price unavailable — Stooq is bot-blocked (404), so no real delta exists.'}>{live ? `24h ${fmtDelta(d.d24h)}` : BLOCKED_LABEL}</span>
      </div>
      <div className="mt-0.5 flex items-center justify-between">
        <span className="num text-[13px] font-black">{live ? price(q.price) : BLOCKED_LABEL}</span>
        <Spark values={q.hist} color={up ? '#22A352' : '#E64A2E'} w={60} h={18} />
      </div>
      <div className="mt-0.5 flex items-center justify-between text-[10px] font-bold">
        <span data-testid="delta-1h" className={d.d1h != null ? ((d.d1h ?? 0) >= 0 ? 'text-up' : 'text-down') : 'text-mute'}>{d.d1h != null ? `1h ${fmtDelta(d.d1h)}` : (live ? '1h —' : BLOCKED_LABEL)}</span>
        <span data-testid="delta-24h" className={live ? (dUp ? 'text-up' : 'text-down') : 'text-mute'}>{live ? `24h ${fmtDelta(d.d24h)}` : BLOCKED_LABEL}</span>
      </div>
      <div className="mt-1.5 flex items-center gap-2" title={isCrypto ? 'Crypto sentiment from cryptocurrency.cv' : 'Net push from active events on this asset'}>
        <Gauge value={gaugeValue} />
        <span className="w-[72px] truncate text-right text-[10px] font-bold text-mute">{gaugeLabel}</span>
      </div>
    </motion.div>
  );
}

function Row({ title, items, hits, pressure, isCrypto }) {
  const sorted = [...items].sort((a, b) => (hits[b.sym] ? 1 : 0) - (hits[a.sym] ? 1 : 0));
  return (
    <div className="flex items-stretch gap-3">
      <div className="flex w-[96px] shrink-0 items-center text-xs font-black leading-tight">{title}</div>
      <motion.div className="thin-scroll flex min-w-0 flex-1 gap-2 overflow-x-auto pb-1" variants={staggerParent} initial="hidden" animate="show">
        {sorted.map((q) => <Card key={q.sym} q={q} hit={hits[q.sym]} pressure={pressure[q.sym] ?? 0} isCrypto={isCrypto} />)}
      </motion.div>
    </div>
  );
}

export default function AssetStrip({ trad, crypto, signals, selectedSignals }) {
  const hits = {};
  selectedSignals.forEach((s) => { hits[s.asset] = s.dir || 0.0001; });
  // Event pressure: confidence-weighted push from every active signal on an asset
  const pressure = {};
  signals.forEach((s) => { pressure[s.asset] = (pressure[s.asset] || 0) + s.dir * s.conf; });
  Object.keys(pressure).forEach((k) => { pressure[k] = Math.max(-1, Math.min(1, pressure[k] * 1.5)); });
  const tradItems = Object.values(trad);
  const cryptoItems = Object.values(crypto);
  const noPrices = tradItems.length === 0 && cryptoItems.length === 0;
  return (
    <footer className="space-y-1.5 border-t-2 border-black bg-paper px-4 py-2.5">
      {noPrices && (
        <div className="sb-card mx-auto max-w-md px-3 py-2 text-center">
          <p className="text-[13px] font-black">Prices loading…</p>
          <p className="text-[11px] font-bold text-mute">Finnhub / CoinGecko ticks arrive on the first server refresh.</p>
        </div>
      )}
      {!noPrices && <Row title="Stocks and commodities" items={tradItems} hits={hits} pressure={pressure} />}
      {!noPrices && <Row title="Crypto" items={cryptoItems} hits={hits} pressure={pressure} isCrypto />}
    </footer>
  );
}