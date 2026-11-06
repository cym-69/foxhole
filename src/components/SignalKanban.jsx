import { useMemo, useState } from 'react';
import { sprout, cleanText } from '../lib/format.js';

const COLS = [
  { id: 'WATCH', label: 'WATCH', bg: '#FFD23F' },
  { id: 'BUY', label: 'BUY', bg: '#C6E265' },
  { id: 'SELL', label: 'SELL', bg: '#FF7A59' },
];

const ConfidenceBar = ({ c }) => {
  const filled = Math.round((c ?? 0) * 5);
  return (
    <span className="sb-confbar" title={`confidence ${Math.round((c ?? 0) * 100)}%`}>
      {[0, 1, 2, 3, 4].map((i) => (<i key={i} className={i < filled ? 'on' : ''} />))}
    </span>
  );
};

const Spark = ({ seed = 1 }) => {
  const pts = useMemo(() => {
    const out = [];
    for (let i = 0; i < 16; i++) out.push(10 + Math.abs(Math.sin(seed * 1.7 + i * .6)) * 12 + (i % 3) * 2);
    return out;
  }, [seed]);
  const max = Math.max(...pts);
  const d = pts.map((v, i) => `${i === 0 ? 'M' : 'L'}${(i * 4).toFixed(1)},${(20 - (v / max) * 16).toFixed(1)}`).join(' ');
  return (
    <svg viewBox="0 0 64 24" className="h-6 w-16 shrink-0" aria-hidden="true">
      <path d={d} fill="none" stroke="#111" strokeWidth="2" strokeLinejoin="round" />
    </svg>
  );
};

export default function SignalKanban({ signals = [], onPick, selectedId }) {
  const [overrides, setOverrides] = useState({});
  const [dragId, setDragId] = useState(null);

  const grouped = useMemo(() => {
    const g = { WATCH: [], BUY: [], SELL: [] };
    for (const s of signals) {
      const action = overrides[s.id] || s.action || 'WATCH';
      g[action]?.push(s);
    }
    for (const k of Object.keys(g)) g[k].sort((a, b) => (b.conf ?? 0) - (a.conf ?? 0));
    return g;
  }, [signals, overrides]);

  const drop = (e, action) => {
    e.preventDefault();
    const id = dragId || e.dataTransfer.getData('text/plain');
    if (id) setOverrides((p) => ({ ...p, [id]: action }));
    setDragId(null);
  };

  return (
    <section className="grid h-full grid-cols-3 gap-3 p-3">
      {COLS.map((c) => (
        <div
          key={c.id}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => drop(e, c.id)}
          className="flex min-h-0 flex-col rounded-xl border-2 border-black bg-paper/60"
          style={{ boxShadow: '4px 4px 0 #111' }}
        >
          <header className="flex items-center justify-between border-b-2 border-black px-3 py-2" style={{ background: c.bg }}>
            <span className="text-sm font-black tracking-wide">{c.label}</span>
            <span className="num sb-chip px-2 py-0.5 text-xs">{grouped[c.id].length}</span>
          </header>
          <div className="thin-scroll min-h-0 flex-1 space-y-2 overflow-y-auto p-2">
            {grouped[c.id].length === 0 && (
              <p className="py-6 text-center text-xs font-semibold text-mute">Drop cards here</p>
            )}
            {grouped[c.id].map((s) => (
              <article
                key={s.id}
                data-asset={s.asset}
                draggable
                onDragStart={(e) => { setDragId(s.id); e.dataTransfer.setData('text/plain', s.id); }}
                onClick={() => onPick?.(s.eventId)}
                className="sb-card cursor-grab p-2.5 active:cursor-grabbing"
                style={{ opacity: selectedId && s.eventId === selectedId ? 1 : 1, outline: selectedId && s.eventId === selectedId ? '3px solid #111' : 'none' }}
              >
                <div className="flex items-center gap-2">
                  <span className="sb-verdict text-[11px]" style={{ background: c.bg }}>{s.action}</span>
                  <span className="truncate text-sm font-black">{s.asset || cleanText(s.label)}</span>
                  <span className="ml-auto text-base" title="sprouts = confidence">{sprout(s.conf ?? 0)}</span>
                </div>
                <p className="mt-1 line-clamp-2 text-xs leading-snug text-mute">{cleanText(s.why || s.label)}</p>
                <div className="mt-2 flex items-center gap-2">
                  <ConfidenceBar c={s.conf} />
                  <span className="num text-[11px] font-bold">{Math.round((s.conf ?? 0) * 100)}%</span>
                  <span className="ml-auto"><Spark seed={s.asset?.length || 1} /></span>
                </div>
              </article>
            ))}
          </div>
        </div>
      ))}
    </section>
  );
}
