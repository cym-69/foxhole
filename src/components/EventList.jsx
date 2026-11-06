import Icon from './Icon.jsx';
import { LAYERS } from '../lib/icons.js';
import { ago, cleanText } from '../lib/format.js';

export default function EventList({ events, contextCount = 0, total, layers, onToggle, selectedId, onSelect, now }) {
  return (
    <aside className="flex min-h-0 flex-col border-r border-line">
      <div className="flex flex-wrap gap-1.5 border-b border-line p-3">
        {LAYERS.map((l) => {
          const on = layers.has(l.id);
          return (
            <button
              key={l.id} onClick={() => onToggle(l.id)} aria-pressed={on}
              className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors ${on ? 'border-accent/60 bg-accent/10 text-ink' : 'border-line text-mute hover:text-ink'}`}
            >
              <Icon layer={l.id} size={13} /> {l.label}
            </button>
          );
        })}
      </div>
      <div className="px-3 pb-1 pt-2.5 text-xs text-mute">
        {events.length} of {total} events, ranked by impact
      </div>
      <ul className="thin-scroll min-h-0 flex-1 overflow-y-auto px-2 pb-3">
        {events.length === 0 && <li className="px-2 py-6 text-sm text-mute">Nothing here. Turn a layer back on or wait for new events.</li>}
        {events.map((e) => {
          const sel = e.id === selectedId;
          return (
            <li key={e.id}>
              <button
                data-event={e.id} onClick={() => onSelect(e.id)}
                className={`relative mb-1 w-full rounded-lg border px-2.5 py-2 text-left transition-colors ${sel ? 'border-accent/60 bg-panel' : 'border-transparent hover:bg-panel/70'}`}
              >
                <div className="flex gap-2.5">
                  <span className={`mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full border ${sel ? 'border-accent bg-accent text-bg' : 'border-accent/50 text-accent'}`}>
                    <Icon layer={e.layer} size={13} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="line-clamp-2 text-[13px] leading-snug">{cleanText(e.title)}</p>
                    <div className="mt-1 flex items-center justify-between gap-2 text-[11px] text-mute">
                      <span className="truncate">{cleanText(e.place)}</span>
                      <span className="shrink-0">{ago(e.ts, now)}</span>
                    </div>
                  </div>
                </div>
                <div className="mt-2 h-[3px] overflow-hidden rounded-full bg-line">
                  <div className="h-full rounded-full bg-accent" style={{ width: `${Math.min(100, Math.round(e.impact * 110))}%` }} />
                </div>
              </button>
            </li>
          );
        })}
      </ul>
      {contextCount > 0 && <p className="border-t border-line px-3 py-2 text-[11px] leading-snug text-mute">{contextCount} more events have no trade link. They show as dim dots on the globe and never get a signal.</p>}
    </aside>
  );
}
