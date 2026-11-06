import LiveTicker from './LiveTicker.jsx';

const DOT = { live: 'bg-up', demo: 'bg-warn', error: 'bg-down', none: 'bg-mute', 'missing-key': 'bg-mute' };

function Chip({ label, mode, title }) {
  return (
    <span title={title} className="sb-chip flex items-center gap-1.5 px-2.5 py-1 text-xs text-ink">
      <span className={`h-2 w-2 rounded-full border border-black ${DOT[mode] || DOT.none}`} />
      {label}
    </span>
  );
}

export default function TopBar({ state, online, onSetup, tvOpen, onTv }) {
  const s = state?.status;
  const ai = state?.ai;
  const anyDemo = s && (s.events.mode === 'demo' || s.markets.mode === 'demo' || s.crypto.prices.mode === 'demo');
  const chips = s ? [
    { label: 'Events', mode: s.events.mode, title: `${s.events.counts.linked} of ${s.events.counts.seen} linked.\n${s.events.detail.join('\n')}` },
    { label: 'Prices', mode: s.markets.mode, title: s.markets.note || 'Live prices from Finnhub' },
    { label: 'Sentiment', mode: s.crypto.sentiment, title: s.crypto.prices.note || 'cryptocurrency.cv' },
    { label: 'Cinema', mode: s.cinema || 'none', title: s.cinema === 'live' ? 'TMDB live' : s.cinema === 'missing-key' ? 'Add TMDB_API_KEY for trending movies/TV' : 'Cinema feed unavailable' },
    { label: 'Live', mode: s.livewatch || 'none', title: s.livewatch === 'live' ? 'Watchlist poller live' : 'Watchlist poller error' },
    { label: 'X', mode: s.xfeed || 'none', title: s.xfeed === 'live' ? 'X feed poller live' : 'X feed poller error' },
  ] : [];
  return (
    <header className="flex h-12 items-center gap-3 border-b-2 border-black bg-paper px-4">
      <div className="flex items-center gap-2">
        <svg width="26" height="26" viewBox="0 0 32 32" aria-hidden="true"><rect x="2" y="2" width="28" height="28" rx="6" fill="#FFD23F" stroke="#111" strokeWidth="2.5" /><path d="M6 10l6 5h8l6-5-2 11-8 7-8-7z" fill="#111" /></svg>
        <span className="text-lg font-black tracking-tight">FOXHOLE</span>
        <span className="sb-verdict hidden text-[10px] md:inline" style={{ background: '#FFD23F' }}>SIGNAL BOARD</span>
      </div>
      <div className="ml-4 flex items-center gap-2">
        {s && (
          <>
            {chips.map((c) => (
              <Chip key={c.label} label={c.label} mode={c.mode} title={c.title} />
            ))}
          </>
        )}
        {!online && <span className="sb-chip px-2.5 py-1 text-xs" style={{ background: '#FF7A59' }}>Cannot reach the Foxhole server. Is it running?</span>}
      </div>
      {anyDemo && (
        <span className="ml-1 sb-chip px-2 py-1 text-[11px]" style={{ background: '#FFD23F' }}>Demo data where live is missing. Do not trade on it.</span>
      )}
      {ai?.connected && ai.lastError && (
        <button onClick={onSetup} title={ai.lastError} className="sb-chip max-w-[320px] truncate px-2.5 py-1 text-xs" style={{ background: '#FFD23F' }}>
          {ai.paused ? 'AI paused for 5 minutes. ' : 'AI problem. '}{ai.lastError} Change model
        </button>
      )}
      <div className="ml-auto flex items-center gap-2">
        <LiveTicker />
        {ai?.connected ? (
          <button onClick={onSetup} className="sb-btn flex items-center gap-1.5 px-3 py-1 text-xs font-black" style={{ background: '#C6E265' }} title={`Model: ${ai.model}`}>
            AI ON
          </button>
        ) : (
          <button onClick={onSetup} className="sb-btn px-3 py-1 text-xs font-black" style={{ background: '#FFD23F' }}>
            Rules only. Connect AI
          </button>
        )}
        <button onClick={onSetup} className="sb-btn px-3 py-1 text-xs font-bold">Settings</button>
        <button onClick={onTv} title="Live TV" className="sb-btn px-3 py-1 text-xs font-bold" style={tvOpen ? { background: '#111', color: '#fff' } : {}}>TV</button>
      </div>
    </header>
  );
}
