import { useMemo, useState } from 'react';
import { sprout, cleanText } from '../lib/format.js';
import Spark from './Spark.jsx';

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

// Real hist spark only: use server quote hist when available, else nothing.
// No synthetic curve — fabrication would fake movement.
const HistSpark = ({ q }) => {
  const hist = Array.isArray(q?.hist) ? q.hist.filter((v) => typeof v === 'number') : [];
  if (hist.length < 2) return null;
  const up = (hist[hist.length - 1] ?? 0) >= (hist[0] ?? 0);
  return <Spark values={hist} color={up ? '#22A352' : '#E64A2E'} w={64} h={20} />;
};

export default function SignalKanban({ signals = [], onPick, selectedId, trad = {}, crypto = {} }) {
  const [overrides, setOverrides] = useState({});
  const [dragId, setDragId] = useState(null);
  const [tab, setTab] = useState('WATCH');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState('conf');
  const [expanded, setExpanded] = useState({});

  const quotes = useMemo(() => ({ ...trad, ...crypto }), [trad, crypto]);

  if (signals.length === 0) {
    return (
      <section className="grid h-full place-items-center p-6">
        <div className="sb-card max-w-sm p-5 text-center">
          <p className="text-2xl font-black tracking-tight">No signals yet</p>
          <p className="mt-2 text-sm leading-snug text-mute">
            No live event currently matches any rule (chokepoints, grain,
            chips, crypto). Prices are live — signals appear when news
            crosses a threshold. Try Demo mode for the full board.
          </p>
        </div>
      </section>
    );
  }

  const grouped = useMemo(() => {
    const g = { WATCH: [], BUY: [], SELL: [] };
    for (const s of signals) {
      const action = overrides[s.id] || s.action || 'WATCH';
      g[action]?.push(s);
    }
    return g;
  }, [signals, overrides]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = [...(grouped[tab] || [])];
    const hit = (s) => !q || [s.asset, s.label, s.title, s.eventTitle, s.why, s.ruleTitle].filter(Boolean).join(' ').toLowerCase().includes(q);
    const arr = list.filter(hit);
    if (sort === 'conf') arr.sort((a, b) => (b.conf ?? 0) - (a.conf ?? 0));
    else if (sort === 'ts') arr.sort((a, b) => (b.eventTs ?? 0) - (a.eventTs ?? 0));
    else if (sort === 'asset') arr.sort((a, b) => String(a.asset || '').localeCompare(String(b.asset || '')));
    return arr;
  }, [grouped, tab, query, sort]);

  const drop = (e, action) => {
    e.preventDefault();
    const id = dragId || e.dataTransfer.getData('text/plain');
    if (id) setOverrides((p) => ({ ...p, [id]: action }));
    setDragId(null);
  };

  const active = COLS.find((c) => c.id === tab) || COLS[0];

  return (
    <section className="flex h-full min-w-0 flex-col gap-3 p-3">
      <div role="tablist" aria-label="Signal actions" className="flex flex-wrap items-center gap-2">
        {COLS.map((c) => (
          <button
            key={c.id}
            role="tab"
            aria-selected={tab === c.id}
            onClick={() => setTab(c.id)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => drop(e, c.id)}
            className="sb-chip px-3 py-1.5 text-xs font-black"
            style={{ background: c.bg, border: tab === c.id ? '3px solid #111' : '2px solid #111', opacity: tab === c.id ? 1 : 0.65 }}
          >
            {c.label} <span className="num ml-1">{(grouped[c.id] || []).length}</span>
          </button>
        ))}
        <label className="ml-auto flex items-center gap-2 text-xs font-black">
          <span className="sr-only">Filter cards</span>
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Filter asset / title / why" className="w-52 rounded border-2 border-black px-2 py-1 text-xs font-bold" />
        </label>
        <label className="flex items-center gap-2 text-xs font-black">
          <span>Sort</span>
          <select value={sort} onChange={(e) => setSort(e.target.value)} className="rounded border-2 border-black px-2 py-1 text-xs font-bold">
            <option value="conf">Confidence desc</option>
            <option value="ts">Newest event</option>
            <option value="asset">Asset A–Z</option>
          </select>
        </label>
      </div>
      <div
        role="tabpanel"
        aria-label={`${active.label} cards`}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => drop(e, active.id)}
        className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-xl border-2 border-black bg-paper/60"
        style={{ boxShadow: '4px 4px 0 #111' }}
      >
        <div className="thin-scroll min-h-0 min-w-0 flex-1 space-y-2 overflow-y-auto p-2">
          {filtered.length === 0 && (
            <p className="py-10 text-center text-xs font-semibold text-mute">
              {query.trim() ? `No ${active.label} cards match "${query.trim()}". Clear the filter or drop a card here.` : `No ${active.label} cards yet. Drag a card here to move it, or wait for new events.`}
            </p>
          )}
          {filtered.map((s) => {
            const isOpen = !!expanded[s.id];
            const rec = s.record?.n >= 1 ? `Rule record: ${s.record.hits} of ${s.record.n} hit` : 'Rule record: none yet';
            return (
              <article
                key={s.id}
                data-asset={s.asset}
                draggable
                onDragStart={(e) => { setDragId(s.id); e.dataTransfer.setData('text/plain', s.id); }}
                onClick={() => onPick?.(s.eventId)}
                className="sb-card w-full cursor-grab p-3 active:cursor-grabbing"
                style={{ outline: selectedId && s.eventId === selectedId ? '3px solid #111' : 'none' }}
              >
                <div className="flex items-center gap-2">
                  <span className="sb-verdict text-[11px]" style={{ background: active.bg }}>{overrides[s.id] || s.action}</span>
                  <span className="min-w-0 flex-1 truncate text-sm font-black">{s.asset || cleanText(s.label)}</span>
                  <span className="shrink-0 text-base" title="sprouts = confidence">{sprout(s.conf ?? 0)}</span>
                  <button
                    type="button"
                    aria-expanded={isOpen}
                    aria-label={isOpen ? 'Collapse details' : 'Expand details'}
                    onClick={(e) => { e.stopPropagation(); setExpanded((p) => ({ ...p, [s.id]: !p[s.id] })); }}
                    className="sb-chip shrink-0 px-2 py-0.5 text-xs font-black"
                  >
                    {isOpen ? '− Collapse' : '+ Expand'}
                  </button>
                </div>
                <p className="mt-1 line-clamp-2 text-xs leading-snug text-mute">{cleanText(s.why || s.label)}</p>
                {isOpen && (
                  <dl className="mt-2 space-y-1 text-xs leading-snug">
                    <div className="flex gap-2"><dt className="w-20 shrink-0 text-mute">Event</dt><dd>{cleanText(s.eventTitle || s.label || '—')}</dd></div>
                    <div className="flex gap-2"><dt className="w-20 shrink-0 text-mute">Rule</dt><dd>{cleanText(s.ruleTitle || '—')}</dd></div>
                    <div className="flex gap-2"><dt className="w-20 shrink-0 text-mute">Evidence</dt><dd>{s.evidenceLabel || ((s.evidenceCount || 1) + ' linked event(s)')}</dd></div>
                    <div className="flex gap-2"><dt className="w-20 shrink-0 text-mute">Why</dt><dd>{cleanText(s.why || '—')}</dd></div>
                    <div className="flex gap-2"><dt className="w-20 shrink-0 text-down">Wrong if</dt><dd>{cleanText(s.wrongIf || '—')}</dd></div>
                    <div className="flex gap-2"><dt className="w-20 shrink-0 text-mute">Crypto</dt><dd>{cleanText(s.cryptoLink || '—')}</dd></div>
                    <div className="flex gap-2"><dt className="w-20 shrink-0 text-mute">Record</dt><dd>{rec}</dd></div>
                  </dl>
                )}
                <div className="mt-2 flex items-center gap-2">
                  <ConfidenceBar c={s.conf} />
                  <span className="num text-[11px] font-bold">{Math.round((s.conf ?? 0) * 100)}%</span>
                  <span className="ml-auto"><HistSpark q={quotes[s.asset]} /></span>
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
