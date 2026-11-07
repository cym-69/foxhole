import { useEffect, useState } from 'react';

function itemsOf(data) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.items)) return data.items;
  return [];
}

export default function LiveTicker() {
  const [liveItems, setLiveItems] = useState([]);
  const [error, setError] = useState(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const res = await fetch('/api/live/now');
        if (!res.ok) throw new Error(`Server error ${res.status}`);
        const data = await res.json();
        if (!alive) return;
        setError(null);
        setLiveItems(itemsOf(data).filter((it) => it && it.live === true));
      } catch (e) {
        if (!alive) return;
        setError(e?.message || 'Could not load live ticker.');
      }
    };
    load();
    const id = setInterval(load, 60000);
    return () => { alive = false; clearInterval(id); };
  }, []);

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, []);
  void tick;

  const title = liveItems.map((it) => it.name || it.id).filter(Boolean).join(', ');

  if (error && liveItems.length === 0) {
    return (
      <span
        role="alert"
        title={`Live ticker failed to load: ${error}`}
        className="sb-chip inline-flex items-center gap-1.5 bg-zinc-600 px-2.5 py-1 text-[11px] font-black uppercase tracking-wide text-white"
        style={{ boxShadow: '3px 3px 0 #111' }}
      >
        <span>○</span> LIVE OFFLINE
      </span>
    );
  }

  return (
    <span
      title={title || 'Watchlist poller is live, but none of the 8 channels checked are streaming right now.'}
      className="sb-chip inline-flex items-center gap-1.5 bg-red-600 px-2.5 py-1 text-[11px] font-black uppercase tracking-wide text-white"
      style={{ boxShadow: '3px 3px 0 #111' }}
    >
      <span className="animate-pulse">●</span> LIVE NOW · {liveItems.length} · {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
    </span>
  );
}
