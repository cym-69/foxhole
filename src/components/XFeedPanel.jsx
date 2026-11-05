import { useEffect, useState } from 'react';

function safeUrl(u) {
  try {
    const x = new URL(u);
    return ['http:', 'https:'].includes(x.protocol) ? u : null;
  } catch {
    return null;
  }
}

function relativeTime(ts) {
  if (typeof ts !== 'number' || !Number.isFinite(ts)) return '';
  const diff = Math.max(0, Date.now() - ts);
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function itemsOf(data) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.items)) return data.items;
  if (Array.isArray(data?.feed)) return data.feed;
  return [];
}

export default function XFeedPanel() {
  const [items, setItems] = useState([]);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const res = await fetch('/api/x/feed');
        const data = await res.json();
        if (!alive) return;
        setItems(itemsOf(data));
      } catch { /* intentional: keep previous items on failure */ }
    };
    load();
    const id = setInterval(load, 60000);
    return () => { alive = false; clearInterval(id); };
  }, []);

  const sorted = [...items].sort((a, b) => {
    const ta = typeof a?.ts === 'number' ? a.ts : (typeof a?.created_at === 'number' ? a.created_at : 0);
    const tb = typeof b?.ts === 'number' ? b.ts : (typeof b?.created_at === 'number' ? b.created_at : 0);
    return tb - ta;
  });

  return (
    <div className="overflow-hidden rounded-xl border border-line bg-panel/95 shadow-lg backdrop-blur">
      <div className="border-b border-line px-3 py-1.5">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-mute">X feed</span>
      </div>
      <div className="px-3 py-2">
        {sorted.length === 0 ? (
          <p className="text-[12px] text-mute">No X posts to show right now.</p>
        ) : (
          <ul className="flex max-h-[320px] flex-col gap-1.5 overflow-y-auto">
            {sorted.map((item, i) => {
              const ts = typeof item.ts === 'number' ? item.ts : (typeof item.created_at === 'number' ? item.created_at : (typeof item.createdAt === 'number' ? item.createdAt : null));
              const url = safeUrl(item.url);
              return (
                <li key={`${item.id ?? i}-${i}`} className="rounded-md border border-line bg-panel/55 px-2 py-1.5">
                  <div className="flex items-center gap-2 text-[10px] uppercase tracking-wide text-mute">
                    <span className="min-w-0 flex-1 truncate">{item.author || item.name || item.handle || 'X'}</span>
                    <span className="shrink-0">{relativeTime(ts)}</span>
                  </div>
                  <p className="mt-1 text-[13px] leading-snug text-ink">{item.text || item.body || item.content || ''}</p>
                  {url ? (
                    <a href={url} target="_blank" rel="noreferrer" className="mt-1 block text-[11px] text-mute hover:text-ink">Open on X</a>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
