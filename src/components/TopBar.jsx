import LiveTicker from './LiveTicker.jsx';

const DOT = { live: 'bg-up', demo: 'bg-warn', error: 'bg-down', none: 'bg-mute' };

function Chip({ label, mode, title }) {
  return (
    <span title={title} className="flex items-center gap-1.5 rounded-full border border-line px-2.5 py-1 text-xs text-mute">
      <span className={`h-1.5 w-1.5 rounded-full ${DOT[mode] || DOT.none}`} />
      {label}
    </span>
  );
}

export default function TopBar({ state, online, onSetup, tvOpen, onTv }) {
  const s = state?.status;
  const ai = state?.ai;
  const anyDemo = s && (s.events.mode === 'demo' || s.markets.mode === 'demo' || s.crypto.prices.mode === 'demo');
  return (
    <header className="flex h-11 items-center gap-3 border-b border-line px-4">
      <div className="flex items-center gap-2">
        <svg width="22" height="22" viewBox="0 0 32 32" aria-hidden="true"><path d="M6 8l6 5h8l6-5-2 11-8 7-8-7z" fill="#8FA89B" /></svg>
        <span className="text-[15px] font-semibold tracking-tight">Foxhole</span>
      </div>
      <div className="ml-4 flex items-center gap-2">
        {s && (
          <>
            <Chip label={s.events.mode === 'live' ? `Events live, ${s.events.counts.linked} of ${s.events.counts.seen} linked` : 'Events demo'} mode={s.events.mode} title={`Only events a rule can link to an asset get signals.\n${s.events.detail.join('\n')}`} />
            <Chip label={s.markets.mode === 'live' ? 'Prices live' : 'Prices demo'} mode={s.markets.mode} title={s.markets.note || 'Live prices from Finnhub'} />
            <Chip label={s.crypto.sentiment === 'live' ? 'Crypto sentiment live' : s.crypto.sentiment === 'demo' ? 'Crypto sentiment demo' : 'No crypto sentiment'} mode={s.crypto.sentiment} title={s.crypto.prices.note || 'cryptocurrency.cv'} />
          </>
        )}
        {!online && <span className="rounded-full bg-down/15 px-2.5 py-1 text-xs text-down">Cannot reach the Foxhole server. Is it running?</span>}
      </div>
      {anyDemo && (
        <span className="ml-1 text-xs text-warn">Demo data is shown where a live source is missing. Do not trade on it.</span>
      )}
      {ai?.connected && ai.lastError && (
        <button onClick={onSetup} title={ai.lastError} className="max-w-[320px] truncate rounded-full bg-warn/15 px-2.5 py-1 text-xs text-warn">
          {ai.paused ? 'AI paused for 5 minutes. ' : 'AI problem. '}{ai.lastError} Change model
        </button>
      )}
      <div className="ml-auto flex items-center gap-2">
        <LiveTicker />
        {ai?.connected ? (
          <button onClick={onSetup} className="flex items-center gap-1.5 rounded-full border border-accent/50 px-3 py-1 text-xs text-accent hover:bg-accent/10" title={`Model: ${ai.model}`}>
            <span className="h-1.5 w-1.5 rounded-full bg-accent" /> AI on
          </button>
        ) : (
          <button onClick={onSetup} className="rounded-full bg-accent px-3 py-1 text-xs font-medium text-bg hover:brightness-110">
            Rules only. Connect a free AI
          </button>
        )}
        <button onClick={onSetup} className="rounded-full border border-line px-3 py-1 text-xs text-mute hover:text-ink">Settings</button>
        <button onClick={onTv} title="Live TV" className={`rounded-full border px-3 py-1 text-xs ${tvOpen ? 'border-accent/60 bg-accent/10 text-ink' : 'border-line text-mute hover:text-ink'}`}>TV</button>
      </div>
    </header>
  );
}
