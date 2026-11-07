import { useMemo, useRef, useState } from 'react';
import { buildSeriesPts } from '../lib/markets-window.js';

/* Brutalist markets chart: sprite bars + confidence-per-signal scatter, crosshair on hover. */

const SERIES = [
  { id: 'SPY', color: '#111111' },
  { id: 'BTC', color: '#0A7A3D' },
  { id: 'USO', color: '#E64A2E' },
  { id: 'GLD', color: '#E6A700' },
];

export default function MarketsChart({ signals = [], trad = {}, crypto = {}, spawnAlerts = [] }) {
  const [active, setActive] = useState(new Set(['SPY', 'BTC', 'USO', 'GLD']));
  const [hover, setHover] = useState(null);
  const ref = useRef(null);

  const series = useMemo(() => {
    const prices = { ...trad, ...crypto };
    return SERIES.filter((s) => active.has(s.id)).map((s) => {
      // Real history only: server accumulates hist[] from live prices
      // (server/feeds/markets.js). No synthetic fallback — skip the
      // series until the server has at least two points for it.
      return { ...s, pts: buildSeriesPts(prices[s.id]?.hist, prices[s.id]?.prefill) };
    }).filter((s) => s.pts.length > 0);
  }, [active, trad, crypto]);

  // Tick a "history building" note when only the prefill is available.
  const pending = SERIES.filter((s) => {
    const live = (trad?.[s.id]?.price ?? crypto?.[s.id]?.price);
    return typeof live === 'number' && !series.some((x) => x.id === s.id);
  }).map((s) => s.id);

  const toggle = (id) => setActive((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const W = 640, H = 220, PAD = 28;
  if (series.length === 0) {
    return (
      <section className="sb-card flex h-full min-h-0 flex-col p-3">
        <header className="mb-1 flex items-center gap-2">
          <h2 className="text-sm font-black">MARKETS</h2>
          <span className="text-xs text-mute">price + signal confidence</span>
          <div className="ml-auto flex gap-1">
            {SERIES.map((s) => (
              <button key={s.id} onClick={() => toggle(s.id)} className="sb-chip px-2 py-0.5 text-[11px] num" style={{ background: active.has(s.id) ? s.color : '#fff', color: active.has(s.id) ? '#fff' : '#111', opacity: active.has(s.id) ? 1 : 0.55 }}>{s.id}</button>
            ))}
          </div>
        </header>
        <p className="num text-[11px] font-bold text-mute">no series{pending.length ? ` · hist building (${pending.join(', ')})` : ''}</p>
        <p className="mt-2 border-t-2 border-dashed border-black/40 pt-2 text-[12px] font-bold text-mute">
          No price history yet — collecting live points. The board fills in as Finnhub/CoinGecko ticks arrive.
        </p>
      </section>
    );
  }
  const all = series.flatMap((s) => s.pts);
  const min = all.length ? Math.min(...all) : 0;
  const max = all.length ? Math.max(...all) : 1;
  // Pad the y-scale by 10% each side so a flat-ish line isn't a hard horizontal ruler.
  const span = max - min || 1;
  const lo = min - span * 0.1;
  const hi = max + span * 0.1;
  const x = (i) => PAD + (i / 39) * (W - PAD * 2);
  const y = (v) => PAD + ((hi - v) / (hi - lo)) * (H - PAD * 2);
  const hoverVal = (s) => {
    if (hover == null || hover < 0 || hover >= s.pts.length) return null;
    const v = s.pts[hover];
    return typeof v === 'number' && Number.isFinite(v) ? v : null;
  };

  return (
    <section className="sb-card flex h-full min-h-0 flex-col p-3">
      <header className="mb-1 flex items-center gap-2">
        <h2 className="text-sm font-black">MARKETS</h2>
        <span className="text-xs text-mute">price + signal confidence</span>
        <div className="ml-auto flex gap-1">
          {SERIES.map((s) => (
            <button key={s.id} onClick={() => toggle(s.id)} className="sb-chip px-2 py-0.5 text-[11px] num" style={{ background: active.has(s.id) ? s.color : '#fff', color: active.has(s.id) ? '#fff' : '#111', opacity: active.has(s.id) ? 1 : 0.55 }}>{s.id}</button>
          ))}
        </div>
      </header>
      <div className="min-h-0 flex-1">
        <svg ref={ref} viewBox={`0 0 ${W} ${H}`} className="h-full w-full" onMouseMove={(e) => {
          const r = ref.current?.getBoundingClientRect();
          if (!r || !r.width) return;
          const i = Math.round(((e.clientX - r.left) / r.width) * 39);
          setHover(Math.max(0, Math.min(39, i)));
        }} onMouseLeave={() => setHover(null)}>
          {[0.25, 0.5, 0.75].map((f) => (
            <line key={f} x1={PAD} x2={W - PAD} y1={H * f} y2={H * f} stroke="#111" strokeOpacity="0.12" strokeDasharray="3 5" />
          ))}
          {series.map((s) => {
            const d = s.pts.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
            return <path key={s.id} d={d} fill="none" stroke={s.color} strokeWidth="2.5" strokeLinejoin="round" />;
          })}
          {/* confidence scatter: each signal is a dot on its series line, sized by confidence */}
          {signals.slice(0, 12).map((s, i) => {
            const sr = series.find((x) => x.id === s.asset);
            if (!sr) return null;
            const idx = Math.min((i * 3 + 2) % 40, sr.pts.length - 1);
            const v = sr.pts[idx];
            if (typeof v !== 'number') return null;
            const px = x(idx);
            const py = y(v);
            return <circle key={s.id} cx={px} cy={py} r={3 + (s.conf ?? 0) * 4} fill={s.action === 'BUY' ? '#22A352' : s.action === 'SELL' ? '#E64A2E' : '#E6A700'} stroke="#111" strokeWidth="1.5" />;
          })}
          {/* spawn alerts land as tick marks at the right edge */}
          {spawnAlerts.slice(0, 6).map((a, i) => (
            <g key={`${a.id}-${i}`}>
              <line x1={W - PAD - (i * 12)} x2={W - PAD - (i * 12)} y1={PAD} y2={H - PAD} stroke="#E64A2E" strokeOpacity="0.35" strokeDasharray="2 3" />
              <text x={W - PAD - (i * 12)} y={PAD - 4} textAnchor="middle" fontSize="8" fontWeight="800"><tspan fill="#E64A2E">●</tspan></text>
            </g>
          ))}
          {hover != null && (
            <g>
              <line x1={x(hover)} x2={x(hover)} y1={PAD} y2={H - PAD} stroke="#111" strokeWidth="1.5" strokeDasharray="4 3" />
              {series.map((s) => {
                const v = hoverVal(s);
                if (v == null) return null;
                return <circle key={s.id} cx={x(hover)} cy={y(v)} r="4" fill="#fff" stroke={s.color} strokeWidth="2.5" />;
              })}
            </g>
          )}
        </svg>
      </div>
      <p className="num text-[11px] font-bold text-mute">{hover != null ? `t-${39 - hover} · ` : ''}{series.map((s) => { const v = hover != null ? hoverVal(s) : (s.pts[39] ?? s.pts[s.pts.length - 1]); return `${s.id} ${typeof v === 'number' ? v.toFixed(1) : '—'}`; }).join(' · ') || 'no series'}{pending.length ? ` · hist building (${pending.join(', ')})` : ''}{spawnAlerts.length ? ` · ${spawnAlerts[0].label}` : ''}</p>
    </section>
  );
}
