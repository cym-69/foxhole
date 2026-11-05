import { useEffect, useState } from 'react';

function safeUrl(u) {
  try {
    const x = new URL(u);
    return ['http:', 'https:'].includes(x.protocol) ? u : null;
  } catch {
    return null;
  }
}

function itemsOf(data) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.items)) return data.items;
  return [];
}

export default function LiveWatchPanel({ onLiveChange }) {
  const [items, setItems] = useState([]);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const res = await fetch('/api/live/now');
        const data = await res.json();
        if (!alive) return;
        setItems(itemsOf(data));
      } catch { /* intentional: keep previous items on failure */ }
    };
    load();
    const id = setInterval(load, 60000);
    return () => { alive = false; clearInterval(id); };
  }, []);

  useEffect(() => {
    const liveCount = items.filter((it) => it && it.live === true).length;
    onLiveChange?.(liveCount);
  }, [items, onLiveChange]);

  const thumbOf = (item) => safeUrl(item.thumbnail || item.thumbnail_url || item.thumbnailUrl || item.image);

  return (
    <div className="overflow-hidden rounded-xl border border-line bg-panel/95 shadow-lg backdrop-blur">
      <div className="border-b border-line px-3 py-1.5">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-mute">Live watch</span>
      </div>
      <div className="px-3 py-2">
        {items.length === 0 ? (
          <p className="text-[12px] text-mute">No live channels are being tracked right now.</p>
        ) : (
          <ul className="flex max-h-[320px] flex-col gap-1.5 overflow-y-auto">
            {items.map((item, i) => {
              const thumbnail = thumbOf(item);
              const url = safeUrl(item.url);
              return (
                <li key={`${item.id ?? i}-${i}`} className="rounded-md border border-line bg-panel/55 px-2 py-1.5">
                  <div className="flex items-center gap-2 text-[10px] uppercase tracking-wide text-mute">
                    <span className="rounded border border-line px-1 text-[10px]">{item.platform}</span>
                    <span className="min-w-0 flex-1 truncate">{item.name}</span>
                    {item.live ? (
                      <span className="shrink-0 animate-pulse rounded-full bg-red-600 px-1.5 py-0.5 text-[10px] font-semibold text-white">LIVE</span>
                    ) : null}
                    {item.unknown ? (
                      <span className="shrink-0 rounded border border-line px-1.5 py-0.5 text-[10px]">check</span>
                    ) : null}
                  </div>
                  {thumbnail ? (
                    <img src={thumbnail} alt="" loading="lazy" className="mt-1.5 w-full rounded" />
                  ) : null}
                  <div className="mt-1.5 text-[13px] leading-snug text-ink">{item.title}</div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[11px] text-mute">
                    {item.category ? <span>{item.category}</span> : null}
                    {typeof item.viewers === 'number' ? <span>{item.viewers} watching</span> : null}
                    {url ? (
                      <a href={url} target="_blank" rel="noreferrer" className="text-[11px] text-mute hover:text-ink">Watch</a>
                    ) : (
                      <span className="text-[11px]">Watch</span>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
