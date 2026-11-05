import { useEffect, useState } from 'react';
import { TV_CHANNELS, TV_EMBED, TV_ALLOW, TV_LAST_KEY } from '../config/tv.js';

// Docked TV panel over the globe. The iframe exists only while the panel is open
// and only for the selected tab (key on the channel id remounts it).
export default function TvPanel({ open, onClose }) {
  const [sel, setSel] = useState(() => {
    try {
      const v = localStorage.getItem(TV_LAST_KEY);
      if (v && TV_CHANNELS.some((c) => c.id === v)) return v;
    } catch {}
    return TV_CHANNELS[0].id;
  });

  useEffect(() => {
    try { localStorage.setItem(TV_LAST_KEY, sel); } catch {}
  }, [sel]);

  if (!open) return null;
  const ch = TV_CHANNELS.find((c) => c.id === sel) || TV_CHANNELS[0];

  return (
    <div className="absolute bottom-3 right-4 left-4 z-20 overflow-hidden rounded-xl border border-line bg-panel/95 shadow-lg backdrop-blur sm:left-auto sm:w-[420px]">
      <div className="flex items-center gap-1 border-b border-line px-2 py-1.5">
        <span className="px-1 text-[10px] font-semibold uppercase tracking-wide text-mute">TV</span>
        <div className="flex flex-1 flex-wrap gap-1">
          {TV_CHANNELS.map((c) => (
            <button
              key={c.id}
              onClick={() => setSel(c.id)}
              className={`rounded-full border px-2 py-0.5 text-[11px] ${c.id === sel ? 'border-accent/60 bg-accent/10 text-ink' : 'border-line text-mute hover:text-ink'}`}
            >
              {c.name}
            </button>
          ))}
        </div>
        <button onClick={onClose} title="Close TV" className="ml-1 rounded-full border border-line px-2 py-0.5 text-[11px] text-mute hover:text-ink">x</button>
      </div>
      <div className="relative aspect-video w-full bg-black">
        <iframe
          key={ch.id}
          src={TV_EMBED(ch.channel)}
          title={ch.name}
          allow={TV_ALLOW}
          allowFullScreen
          className="h-full w-full"
        />
      </div>
    </div>
  );
}
