import { actionBg, arrow, dirColor } from '../lib/format.js';

export default function BestSignals({ signals, top, ai, onPick, onSetup }) {
  const picks = top.map((id) => signals.find((s) => s.id === id)).filter(Boolean);
  return (
    <section className="grid h-[84px] grid-cols-[repeat(3,minmax(0,1fr))_1.25fr] gap-3 border-b border-line px-4 py-2.5">
      {picks.length === 0 && (
        <div className="col-span-3 flex items-center text-sm text-mute">No event links to a tradable asset right now. New ones show up here.</div>
      )}
      {picks.map((s) => (
        <button key={s.id} onClick={() => onPick(s.eventId)} className="flex min-w-0 flex-col justify-center rounded-[10px] border border-line bg-panel px-3 text-left transition-colors hover:border-accent/60">
          <div className="flex items-center gap-2">
            <span className={`rounded px-1.5 py-0.5 text-[11px] font-semibold ${actionBg(s.action)}`}>{s.action}</span>
            <span className="truncate text-sm font-medium">{s.label}</span>
            <span className={`text-xs ${dirColor(s.dir)}`}>{arrow(s.dir)}</span>
            <span className="ml-auto text-xs text-mute">{s.level}</span>
          </div>
          <p className="mt-1 line-clamp-2 text-xs leading-snug text-mute">{s.why}</p>
        </button>
      ))}
      <div className="flex min-w-0 items-center rounded-[10px] border border-dashed border-line px-3">
        {ai?.brief ? (
          <p className="line-clamp-3 text-xs leading-snug text-ink">{ai.brief}</p>
        ) : ai?.connected ? (
          <p className="text-xs text-mute">{picks.length ? 'Writing your brief...' : 'Nothing to brief right now. No live event links to a tradable asset.'}</p>
        ) : (
          <div className="flex items-center gap-3">
            <p className="text-xs leading-snug text-mute">A two-sentence brief of what matters now appears here once an AI is connected.</p>
            <button onClick={onSetup} className="shrink-0 rounded-full bg-accent px-3 py-1 text-xs font-medium text-bg hover:brightness-110">Connect</button>
          </div>
        )}
      </div>
    </section>
  );
}
