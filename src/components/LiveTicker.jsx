import { useEffect, useState } from 'react';

function itemsOf(data) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.items)) return data.items;
  return [];
}

export default function LiveTicker() {
  const [liveItems, setLiveItems] = useState([]);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const res = await fetch('/api/live/now');
        const data = await res.json();
        if (!alive) return;
        setLiveItems(itemsOf(data).filter((it) => it && it.live === true));
      } catch { /* intentional: keep previous ticker state on failure */ }
    };
    load();
    const id = setInterval(load, 60000);
    return () => { alive = false; clearInterval(id); };
  }, []);

  if (liveItems.length === 0) return null;

  const title = liveItems.map((it) => it.name || it.id).filter(Boolean).join(', ');

  return (
    <span
      title={title}
      className="inline-flex animate-pulse items-center gap-1.5 rounded-full bg-red-600 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-white"
    >
      ● LIVE NOW · {liveItems.length}
    </span>
  );
}
