import { actionBg, arrow, dirColor } from '../lib/format.js';
import { ago } from '../lib/format.js';
import { quoteDeltas, BLOCKED_LABEL, fmtDelta } from '../lib/deltas.js';

function seenLabel(s, now) {
  return s.eventTs ? `Seen ${ago(s.eventTs, now)}` : '';
}

export default function BestSignals({ signals, top, ai, brief, onPick, onSetup, now, trad, crypto }) {
  const quotes = { ...(trad || {}), ...(crypto || {}) };
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
            <span className="ml-auto text-xs font-bold text-mute">{s.evidenceLabel || s.level}</span>
          </div>
          <p className="mt-1 line-clamp-1 text-xs font-black leading-snug text-ink">{s.eventTitle ? `“${s.eventTitle}”` : s.ruleTitle}</p>
          {s.eventPlace ? <p className="mt-0.5 line-clamp-1 text-xs font-bold leading-snug text-mute">{s.eventPlace}</p> : null}
          {seenLabel(s, now) ? <p className="mt-0.5 line-clamp-1 text-xs font-bold leading-snug text-mute">{seenLabel(s, now)}</p> : null}
          <p className="mt-0.5 line-clamp-2 text-xs font-bold leading-snug text-mute">{(s.why || '').slice(0, 140)}</p>
          {(() => {
            const q = quotes[s.asset];
            const d = quoteDeltas(q);
            const live = d.d24h != null;
            return (
              <span data-testid="signal-price-delta" data-asset-delta={s.asset} className={"mt-0.5 inline-block rounded border border-black/30 px-1 py-0.5 text-[10px] font-black " + (live ? (d.d24h >= 0 ? 'bg-[#C6E265] text-up' : 'bg-[#FF7A59] text-down') : 'bg-[#E6E6E6] text-mute')}>
                {live ? "24h " + fmtDelta(d.d24h) + (d.d1h != null ? " · 1h " + fmtDelta(d.d1h) : "") : BLOCKED_LABEL}
              </span>
            );
          })()}
        </button>
      ))}
      <div data-testid="what-matters-brief" className="flex min-w-0 flex-col justify-center gap-1 rounded-[10px] border-2 border-dashed border-black bg-[#FFD23F] px-3 py-2 md:col-span-3 xl:col-span-1">
        <div className="flex items-center gap-2">
          <span className="shrink-0 rounded border border-black/40 bg-white/60 px-1 py-0.5 text-[10px] font-black uppercase tracking-wide text-ink">{brief?.src === 'ai' ? 'AI brief' : 'Rules brief'}</span>
          {!ai?.connected && (
            <button onClick={onSetup} className="ml-auto shrink-0 text-[11px] font-bold text-ink underline underline-offset-2">Connect AI for deeper brief</button>
          )}
        </div>
        {brief?.text ? (
          <p className="line-clamp-3 text-xs leading-snug text-ink">{brief.text}</p>
        ) : ai?.connected ? (
          <p className="text-xs text-mute">{picks.length ? 'Writing your brief...' : 'Nothing to brief right now. No live event links to a tradable asset.'}</p>
        ) : (
          <p className="text-xs leading-snug text-mute">A two-sentence brief of what matters now appears here once an AI is connected.</p>
        )}
      </div>
    </section>
  );
}