import { AnimatePresence, motion } from 'framer-motion';
import Icon from './Icon.jsx';
import { REDUCED, fadeUp, staggerParent } from '../lib/motion.js';
import SignalCard from './SignalCard.jsx';
import { actionBg, ago, arrow, dirColor, pct } from '../lib/format.js';

function Step({ label, last, children }) {
  return (
    <motion.div variants={fadeUp} className="relative pl-6">
      <span className="absolute left-0 top-1.5 h-3 w-3 rounded-full border-2 border-black bg-[#FFD23F] shadow-[1.5px_1.5px_0_#111]" />
      {!last && <span className="absolute bottom-[-14px] left-[5px] top-4 w-0.5 bg-black" />}
      <p className="mb-1.5 text-xs font-black uppercase tracking-wide text-black">{label}</p>
      {children}
    </motion.div>
  );
}

export default function Chain({ event, signals, trad, crypto, now, error }) {
  return (
    <aside className="thin-scroll min-h-0 overflow-y-auto border-l-2 border-black p-4">
      <AnimatePresence mode="wait">
        {!event ? (
          <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: REDUCED ? 0 : 0.2 }} className="pt-10 text-sm leading-relaxed text-mute">
            <p className="text-ink">Pick an event to see what it touches.</p>
            <p className="mt-2">Click a dot on the globe or a row in the list. You will get the reason, the assets it hits, and a signal for each.</p>
            {error && <p className="mt-4 text-down">{error}</p>}
          </motion.div>
        ) : (
          <motion.div key={event.id} variants={staggerParent} initial="hidden" animate="show" exit="exit" className="space-y-5">
            <Step label="Event">
              <div className="flex items-start gap-2.5">
                <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full border-2 border-black bg-white text-black shadow-[2px_2px_0_#111]"><Icon layer={event.layer} size={15} /></span>
                <div>
                  <p className="text-sm font-black leading-snug">{event.title}</p>
                  <p className="mt-1 text-xs font-bold text-mute">{event.place}. <time dateTime={new Date(event.ts).toISOString()} title={new Date(event.ts).toLocaleString()}>{ago(event.ts, now)}</time>. {event.sources} {event.sources === 1 ? 'source' : 'sources'}{event.src ? ` · ${event.src}` : ''}.</p>
                </div>
              </div>
              <div className="mt-2.5 flex items-center gap-2 text-xs font-bold text-mute">
                Impact
                <div className="h-[5px] flex-1 overflow-hidden rounded-full border border-black bg-white"><div className="h-full bg-black" style={{ width: `${Math.min(100, Math.round(event.impact * 110))}%` }} /></div>
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
                    <span key={s.id} className="sb-chip flex items-center gap-1.5 px-2 py-1 text-xs">
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
                {signals[0] && <SignalCard s={signals[0]} q={trad[signals[0].asset] || crypto[signals[0].asset]} now={now} />}
                {signals.slice(1).map((s) => (
                  <div key={s.id} className="sb-card flex items-center gap-2 px-3 py-2 text-[13px]">
                    <span className={`rounded px-1.5 py-0.5 text-[11px] font-semibold ${actionBg(s.action)}`}>{s.action}</span>
                    <span>{s.label}</span>
                    <span className={`text-xs ${dirColor(s.dir)}`}>{arrow(s.dir)}</span>
                    <span className="ml-auto text-xs text-mute">{s.level}</span>
                  </div>
                ))}
              </div>
              <p className="mt-3 border-t-2 border-black pt-2 text-[11px] font-bold leading-snug text-mute">Signals are leads, not advice. Check the Wrong if line before you act.</p>
            </Step>
            </>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </aside>
  );
}
