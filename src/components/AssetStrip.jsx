import { motion } from 'framer-motion';
import Spark from './Spark.jsx';
import { arrow, dirColor, pct, price } from '../lib/format.js';

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
  const up = (q.pct ?? 0) >= 0;
  const gaugeValue = isCrypto ? q.sentiment?.value ?? 0 : pressure;
  const gaugeLabel = isCrypto ? (q.sentiment ? q.sentiment.label : 'no data') : pressure === 0 ? 'no pressure' : pressure > 0 ? 'upward pressure' : 'downward pressure';
  return (
    <motion.div
      layout transition={{ type: 'spring', stiffness: 380, damping: 36 }} data-asset={q.sym}
      className="sb-card w-[176px] shrink-0 px-2.5 py-2"
      style={hit ? { background: '#FFD23F', boxShadow: '4px 4px 0 #111' } : {}}
    >
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1 text-[13px] font-black">
          {q.sym}
          {hit && <span className={`text-[10px] ${dirColor(hit)}`}>{arrow(hit)}</span>}
        </span>
        <span className="sb-chip num px-1.5 text-xs" style={{ background: up ? '#C6E265' : '#FF7A59' }}>{pct(q.pct)}</span>
      </div>
      <div className="mt-0.5 flex items-center justify-between">
        <span className="num text-[13px] font-black">{price(q.price)}</span>
        <Spark values={q.hist} color={up ? '#22A352' : '#E64A2E'} w={60} h={18} />
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
      <div className="thin-scroll flex min-w-0 flex-1 gap-2 overflow-x-auto pb-1">
        {sorted.map((q) => <Card key={q.sym} q={q} hit={hits[q.sym]} pressure={pressure[q.sym] ?? 0} isCrypto={isCrypto} />)}
      </div>
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
  return (
    <footer className="space-y-1.5 border-t border-line px-4 py-2.5">
      <Row title="Stocks and commodities" items={Object.values(trad)} hits={hits} pressure={pressure} />
      <Row title="Crypto" items={Object.values(crypto)} hits={hits} pressure={pressure} isCrypto />
    </footer>
  );
}
