export default function TimelineVol({ momentum }) {
  const m = momentum || { empty: true, assets: {}, spanHours: 6 };
  const keys = Object.keys(m.assets || {});
  return (
    <section data-testid="timeline-vol" aria-label="Momentum density from GDELT history" className="border-b-2 border-black bg-white/60 px-4 py-2">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="shrink-0 text-[11px] font-black uppercase tracking-wide">Momentum · Density</span>
        <span className="text-[11px] font-bold text-mute">{m.empty ? 'No GDELT history upstream' : `${m.rows || 0} rows · ${m.spanHours || 6}h GDELT volume (15-min buckets)`}</span>
        {!m.empty && keys.map((asset) => {
          const a = m.assets[asset];
          const spark = Array.isArray(a.spark) ? a.spark : [];
          const max = Math.max(1, ...spark);
          const pts = spark.map((v, i) => `${(i * 100) / Math.max(1, spark.length - 1)},${100 - (v / max) * 90 - 5}`).join(' ');
          return (
            <span key={asset} data-asset={asset} className="inline-flex items-center gap-1.5 rounded border border-black px-1.5 py-0.5 text-[11px] font-black" title={`tone ${a.tone} · mentions ${a.mentions}`}>
              <svg width="48" height="14" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true" className="h-3.5 w-12"><polyline points={pts} fill="none" stroke="#111" strokeWidth="4" /></svg>
              {asset} <span className={a.dir < 0 ? 'text-red-700' : 'text-emerald-800'}>{a.score}</span>
              <span className="font-bold text-mute">{a.dir < 0 ? '▼' : '▲'}</span>
            </span>
          );
        })}
        {m.empty && <span className="text-xs font-bold text-mute">GDELT offline/demo — momentum needs live history.</span>}
      </div>
    </section>
  );
}
