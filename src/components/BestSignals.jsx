import { actionBg, arrow, dirColor } from '../lib/format.js';
import { ago } from '../lib/format.js';

function seenLabel(s, now) {
  return s.eventTs ? `Seen ${ago(s.eventTs, now)}` : '';
}

export default function BestSignals({ signals, top, ai, onPick, onSetup, now }) {
  const picks = top.map((id) => signals.find((s) => s.id === id)).filter(Boolean).slice(0, 3);
  return (
    <section data-testid="best-signals-strip" aria-label="Best signals" className="grid grid-cols-1 gap-3 border-b-2 border-black bg-paper px-4 py-2.5 md:grid-cols-3 xl:grid-cols-[repeat(3,minmax(0,1fr))_1.25fr]">
      {picks.length === 0 && (
        <div className="col-span-3 flex items-center text-sm font-bold text-mute md:col-span-3 xl:col-span-3">No event links to a tradable asset right now. New ones show up here.</div>
      )}
      {picks.map((s) => (
        <button key={s.id} onClick={() => onPick(s.eventId)} aria-label={`${s.action} ${s.label}. ${s.why || ''}`} className="sb-card flex min-w-0 flex-col justify-center px-3 py-2.5 text-left focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-black">
          <div className="flex items-center gap-2">
            <span className={`rounded border-2 border-black px-1.5 py-0.5 text-[11px] font-black ${actionBg(s.action)}`}>{s.action} {s.asset} {Math.round((s.conf || 0) * 100)}%</span>
            <span className="truncate text-sm font-black">{s.label}</span>
            <span className={`text-xs ${dirColor(s.dir)}`}>{arrow(s.dir)}</span>
            <span className="ml-auto text-xs font-bold text-mute">{s.level}</span>
          </div>
          <p className="mt-1 line-clamp-1 text-xs font-black leading-snug text-ink">{s.eventTitle ? `“${s.eventTitle}”` : s.ruleTitle}</p>
          {s.eventPlace ? <p className="mt-0.5 line-clamp-1 text-xs font-bold leading-snug text-mute">{s.eventPlace}</p> : null}
          {seenLabel(s, now) ? <p className="mt-0.5 line-clamp-1 text-xs font-bold leading-snug text-mute">{seenLabel(s, now)}</p> : null}
          <p className="mt-0.5 line-clamp-2 text-xs font-bold leading-snug text-mute">{(s.why || '').slice(0, 140)}</p>
        </button>
      ))}
      <div className="flex min-w-0 items-center rounded-[10px] border-2 border-dashed border-black bg-[#FFD23F] px-3 py-2 md:col-span-3 xl:col-span-1">
        {ai?.brief ? (
          <p className="line-clamp-3 text-xs leading-snug text-ink">{ai.brief}</p>
        ) : ai?.connected ? (
          <p className="text-xs text-mute">{picks.length ? 'Writing your brief...' : 'Nothing to brief right now. No live event links to a tradable asset.'}</p>
        ) : (
          <div className="flex items-center gap-3">
            <p className="text-xs leading-snug text-mute">A two-sentence brief of what matters now appears here once an AI is connected.</p>
            <button onClick={onSetup} className="sb-btn shrink-0 rounded-full px-3 py-1 text-xs font-bold" style={{ background: '#111', color: '#FFFDF5' }}>Connect</button>
          </div>
        )}
      </div>
    </section>
  );
}
