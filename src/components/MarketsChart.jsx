import { useMemo, useRef, useState } from 'react';

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
    return SERIES.filter((s) => active.has(s.id)).map((s, si) => {
      // Real history when available; a gentle wobble ending at the live price otherwise.
      const hist = Array.isArray(prices[s.id]?.hist) ? prices[s.id].hist.filter((v) => typeof v === 'number') : [];
      const live = prices[s.id]?.price;
      let pts;
      if (hist.length >= 2) {
        const tail = Math.min(40, hist.length);
        pts = hist.slice(-tail);
        // normalize to a 40-point window for the x-scale
        while (pts.length < 40) pts.unshift(pts[0]);
      } else if (typeof live === 'number') {
        pts = [];
        for (let i = 0; i < 40; i++) {
          const wobble = Math.sin(i * 0.45 + si * 1.9) * live * 0.004 + Math.cos(i * 0.19 + si) * live * 0.002;
          const drift = i * (si % 2 ? 1 : -1) * live * 0.000;
          pts.push(live - ((39 - i) * live * 0.0002) + wobble + drift);
        }
      } else {
        const base = 100 + si * 137;
        pts = [];
        for (let i = 0; i < 40; i++) {
          const wobble = Math.sin(i * 0.45 + si * 1.9) * 4 + Math.cos(i * 0.19 + si) * 2.5;
          const drift = i * (si % 2 ? 0.35 : -0.22);
          pts.push(base + wobble + drift);
        }
      }
      return { ...s, pts };
    });
  }, [active, trad, crypto]);

  const toggle = (id) => setActive((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const W = 640, H = 220, PAD = 28;
  const all = series.flatMap((s) => s.pts);
  const min = all.length ? Math.min(...all) : 0;
  const max = all.length ? Math.max(...all) : 1;
  const x = (i) => PAD + (i / 39) * (W - PAD * 2);
  const y = (v) => PAD + ((max - v) / (max - min || 1)) * (H - PAD * 2);

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
          if (!r) return;
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
            const px = x((i * 3 + 2) % 40);
            const py = y(sr.pts[(i * 3 + 2) % 40]);
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
              {series.map((s) => (
                <circle key={s.id} cx={x(hover)} cy={y(s.pts[hover])} r="4" fill="#fff" stroke={s.color} strokeWidth="2.5" />
              ))}
            </g>
          )}
        </svg>
      </div>
      <p className="num text-[11px] font-bold text-mute">{hover != null ? `t-${39 - hover} · ` : ''}{series.map((s) => `${s.id} ${hover != null ? s.pts[hover].toFixed(1) : s.pts[39].toFixed(1)}`).join(' · ') || 'no series'}{spawnAlerts.length ? ` · ${spawnAlerts[0].label}` : ''}</p>
    </section>
  );
}
