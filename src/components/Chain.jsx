import { AnimatePresence, motion } from 'framer-motion';
import Icon from './Icon.jsx';
import SignalCard from './SignalCard.jsx';
import { actionBg, ago, arrow, dirColor, pct } from '../lib/format.js';

function Step({ label, last, children }) {
  return (
    <div className="relative pl-6">
      <span className="absolute left-0 top-1.5 h-2 w-2 rounded-full bg-accent" />
      {!last && <span className="absolute bottom-[-14px] left-[3.5px] top-4 w-px bg-line" />}
      <p className="mb-1.5 text-xs text-mute">{label}</p>
      {children}
    </div>
  );
}

export default function Chain({ event, signals, trad, crypto, now, error }) {
  return (
    <aside className="thin-scroll min-h-0 overflow-y-auto border-l border-line p-4">
      <AnimatePresence mode="wait">
        {!event ? (
          <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="pt-10 text-sm leading-relaxed text-mute">
            <p className="text-ink">Pick an event to see what it touches.</p>
            <p className="mt-2">Click a dot on the globe or a row in the list. You will get the reason, the assets it hits, and a signal for each.</p>
            {error && <p className="mt-4 text-down">{error}</p>}
          </motion.div>
        ) : (
          <motion.div key={event.id} initial={{ opacity: 0, x: 14 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 14 }} transition={{ duration: 0.22 }} className="space-y-5">
            <Step label="Event">
              <div className="flex items-start gap-2.5">
                <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full border border-accent/60 text-accent"><Icon layer={event.layer} size={15} /></span>
                <div>
                  <p className="text-sm font-medium leading-snug">{event.title}</p>
                  <p className="mt-1 text-xs text-mute">{event.place}. {ago(event.ts, now)}. {event.sources} {event.sources === 1 ? 'source' : 'sources'}.</p>
                </div>
              </div>
              <div className="mt-2.5 flex items-center gap-2 text-xs text-mute">
                Impact
                <div className="h-[3px] flex-1 overflow-hidden rounded-full bg-line"><div className="h-full rounded-full bg-accent" style={{ width: `${Math.min(100, Math.round(event.impact * 110))}%` }} /></div>
              </div>
            </Step>

            {event.linked === false ? (
              <Step label="Trade link" last>
                <p className="text-[13px] leading-snug">No rule connects this event to a tradable asset, so Foxhole gives no signal for it. It is shown so the map is not blank.</p>
              </Step>
            ) : (
            <>
            <Step label="Why it matters">
              <p className="text-[13px] leading-snug">{signals[0]?.why}</p>
            </Step>

            <Step label="Assets hit">
              <div className="flex flex-wrap gap-1.5">
                {signals.map((s) => {
                  const q = trad[s.asset] || crypto[s.asset];
                  return (
                    <span key={s.id} className="flex items-center gap-1.5 rounded-full border border-line px-2 py-1 text-xs">
                      <span className={dirColor(s.dir)}>{arrow(s.dir)}</span>
                      <span className="font-medium">{s.asset}</span>
                      {q && <span className={`num ${q.pct >= 0 ? 'text-up' : 'text-down'}`}>{pct(q.pct)}</span>}
                    </span>
                  );
                })}
              </div>
            </Step>

            <Step label="Signals" last>
              <div className="space-y-2.5">
                {signals[0] && <SignalCard s={signals[0]} />}
                {signals.slice(1).map((s) => (
                  <div key={s.id} className="flex items-center gap-2 rounded-lg border border-line px-3 py-2 text-[13px]">
                    <span className={`rounded px-1.5 py-0.5 text-[11px] font-semibold ${actionBg(s.action)}`}>{s.action}</span>
                    <span>{s.label}</span>
                    <span className={`text-xs ${dirColor(s.dir)}`}>{arrow(s.dir)}</span>
                    <span className="ml-auto text-xs text-mute">{s.level}</span>
                  </div>
                ))}
              </div>
              <p className="mt-3 text-[11px] leading-snug text-mute">Signals are leads, not advice. Check the Wrong if line before you act.</p>
            </Step>
            </>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </aside>
  );
}
