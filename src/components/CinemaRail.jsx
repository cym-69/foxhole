import { useEffect, useState } from 'react';

const TRACKING_KEY = 'foxhole.cinemaTracking';
const STATUS_FLOW = ['want', 'watching', 'done'];

function safeUrl(u) {
  try {
    const x = new URL(u);
    return ['http:', 'https:'].includes(x.protocol) ? u : null;
  } catch {
    return null;
  }
}

function readStoredTracking() {
  try {
    const raw = localStorage.getItem(TRACKING_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch { /* intentional: storage unavailable */ }
  return null;
}

function rateOf(item) {
  return typeof item?.rating === 'number' ? item.rating.toFixed(1) : null;
}

function yearOf(item) {
  return typeof item?.release_date === 'string' && item.release_date.length >= 4 ? item.release_date.slice(0, 4) : null;
}

export default function CinemaRail() {
  const [snapshot, setSnapshot] = useState(null);
  const [stored, setStored] = useState(() => readStoredTracking());
  const [draft, setDraft] = useState('');

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch('/api/cinema/trending');
        const data = res && typeof res.json === 'function' ? await res.json() : null;
        if (!alive || !data) return;
        setSnapshot({
          ok: data.ok,
          status: data.status,
          fetchedAt: data.fetchedAt,
          trending: Array.isArray(data.trending) ? data.trending : [],
          nowPlaying: Array.isArray(data.nowPlaying) ? data.nowPlaying : [],
          upcoming: Array.isArray(data.upcoming) ? data.upcoming : [],
          airingToday: Array.isArray(data.airingToday) ? data.airingToday : [],
          tracking: Array.isArray(data.tracking) ? data.tracking : [],
        });
      } catch { /* intentional: leave snapshot null so empty states render */ }
    })();
    return () => { alive = false; };
  }, []);

  const updateTracking = (next) => {
    setStored(next);
    try { localStorage.setItem(TRACKING_KEY, JSON.stringify(next)); } catch { /* intentional: storage unavailable */ }
  };

  const seed = snapshot && Array.isArray(snapshot.tracking) ? snapshot.tracking : [];
  const tracking = stored !== null ? stored : seed;

  const cycleStatus = (id, delta) => {
    const next = tracking.map((entry) => {
      if (entry && entry.id === id) {
        const idx = STATUS_FLOW.indexOf(entry.status);
        const current = idx >= 0 ? idx : 0;
        const nextIdx = (current + delta + STATUS_FLOW.length) % STATUS_FLOW.length;
        return { ...entry, status: STATUS_FLOW[nextIdx] };
      }
      return entry;
    });
    updateTracking(next);
  };

  const removeEntry = (id) => {
    updateTracking(tracking.filter((entry) => !entry || entry.id !== id));
  };

  const addEntry = () => {
    const title = draft.trim();
    if (!title) return;
    updateTracking([...tracking, { id: Date.now(), media_type: 'movie', title, poster: null, status: 'want', note: '' }]);
    setDraft('');
  };

  const trending = snapshot?.trending || [];
  const inCinemas = [...(snapshot?.nowPlaying || []), ...(snapshot?.upcoming || []), ...(snapshot?.airingToday || [])];

  return (
    <div className="sb-card overflow-hidden">
      <div className="border-b-2 border-black bg-[#FFD23F] px-3 py-1.5">
        <span className="text-[10px] font-black uppercase tracking-wide text-black">Cinema</span>
      </div>

      <div className="px-3 py-2">
        <div className="text-[10px] font-black uppercase tracking-wide text-black">What&rsquo;s trending</div>
        {snapshot?.status === 'missing-key' ? (
          <p className="mt-1 text-[12px] leading-snug text-mute">Add TMDB_API_KEY to .env to enable live trending</p>
        ) : trending.length === 0 ? (
          <p className="mt-1 text-[12px] text-mute">No trending titles right now.</p>
        ) : (
          <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
            {trending.map((item, i) => {
              const poster = safeUrl(item.poster);
              const rate = rateOf(item);
              const year = yearOf(item);
              return (
                <div key={`${item.id ?? i}-${i}`} className="w-20 shrink-0 rounded-md border border-line bg-panel/55 p-1.5">
                  {poster ? (
                    <img src={poster} alt="" className="w-16 rounded" loading="lazy" />
                  ) : (
                    <div className="grid h-24 w-16 place-items-center rounded bg-panel/80 text-[10px] uppercase tracking-wide text-mute">No poster</div>
                  )}
                  <div className="mt-1 text-[10px] font-semibold uppercase tracking-wide text-mute">#{i + 1}</div>
                  <div className="truncate text-[12px] leading-snug text-ink">{item.title}</div>
                  <div className="mt-0.5 text-[11px] text-mute">
                    {rate ? <span>★ {rate}</span> : <span>—</span>}
                    {year ? <span> · {year}</span> : null}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="border-t border-line px-3 py-2">
        <div className="text-[10px] font-black uppercase tracking-wide text-black">Now in cinemas / Airing today</div>
        {inCinemas.length === 0 ? (
          <p className="mt-1 text-[12px] text-mute">Nothing listed right now.</p>
        ) : (
          <ul className="mt-2 flex flex-col gap-1.5">
            {inCinemas.slice(0, 8).map((item, i) => {
              const poster = safeUrl(item.poster);
              const rate = rateOf(item);
              const year = yearOf(item);
              return (
                <li key={`${item.id ?? i}-${i}`} className="flex items-center gap-2">
                  {poster ? (
                    <img src={poster} alt="" className="w-10 shrink-0 rounded" loading="lazy" />
                  ) : (
                    <div className="grid h-14 w-10 shrink-0 place-items-center rounded bg-panel/80 text-[9px] uppercase tracking-wide text-mute">—</div>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13px] font-bold leading-snug text-ink">{item.title}</div>
                    <div className="text-[11px] text-mute">
                      {year || ''}
                      {rate ? ` · ★ ${rate}` : ''}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="border-t-2 border-black px-3 py-2">
        <div className="text-[10px] font-black uppercase tracking-wide text-black">What I&rsquo;m tracking</div>
        {tracking.length === 0 ? (
          <p className="mt-1 text-[12px] text-mute">Nothing tracked yet. Add a title below.</p>
        ) : (
          <ul className="mt-2 flex max-h-[220px] flex-col gap-1.5 overflow-y-auto">
            {tracking.map((entry, i) => (
              <li key={`${entry.id ?? i}-${i}`} className="rounded-md border-2 border-black bg-white px-2 py-1.5 shadow-[2px_2px_0_#111]">
                <div className="flex items-center gap-2">
                  <span className="min-w-0 flex-1 truncate text-[13px] font-bold leading-snug text-ink">{entry.title}</span>
                  <span className="shrink-0 rounded-full border-2 border-black bg-[#FFD23F] px-1.5 py-0.5 text-[10px] font-black uppercase tracking-wide text-black">{entry.status}</span>
                  <button type="button" onClick={() => cycleStatus(entry.id, -1)} title="Previous status" aria-label="Previous status" className="rounded-full border-2 border-black bg-white px-1.5 py-0.5 text-[11px] font-black text-black hover:bg-[#C6E265]">−</button>
                  <button type="button" onClick={() => cycleStatus(entry.id, 1)} title="Next status" aria-label="Next status" className="rounded-full border-2 border-black bg-white px-1.5 py-0.5 text-[11px] font-black text-black hover:bg-[#C6E265]">+</button>
                  <button type="button" onClick={() => removeEntry(entry.id)} title="Remove" aria-label="Remove" className="rounded-full border-2 border-black bg-white px-1.5 py-0.5 text-[11px] font-black text-black hover:bg-[#FF7A59]">×</button>
                </div>
                {entry.note ? <p className="mt-1 text-[11px] font-bold leading-snug text-mute">{entry.note}</p> : null}
              </li>
            ))}
          </ul>
        )}
        <div className="mt-2 flex gap-1.5">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') addEntry(); }}
            placeholder="Add a title to track…"
            className="min-w-0 flex-1 rounded-md border-2 border-black bg-white px-2 py-1 text-[12px] font-bold text-ink placeholder:text-mute"
          />
          <button type="button" onClick={addEntry} className="shrink-0 rounded-full border-2 border-black bg-[#C6E265] px-2.5 py-0.5 text-[11px] font-black text-black">Add</button>
        </div>
      </div>
    </div>
  );
}
