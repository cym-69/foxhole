import { useEffect, useState } from 'react';
import { TV_CHANNELS, TV_EMBED, TV_ALLOW, TV_LAST_KEY } from '../config/tv.js';

// Docked TV panel over the globe. The iframe exists only while the panel is open
// and only for the selected tab (key on the channel id remounts it).
export default function TvPanel({ open, onClose }) {
  const [sel, setSel] = useState(() => {
    try {
      const v = localStorage.getItem(TV_LAST_KEY);
      if (v && TV_CHANNELS.some((c) => c.id === v)) return v;
    } catch { /* intentional: storage may be unavailable → default channel */ }
    return TV_CHANNELS[0].id;
  });

  useEffect(() => {
    try { localStorage.setItem(TV_LAST_KEY, sel); } catch { /* intentional: storage may be unavailable */ }
  }, [sel]);

  if (!open) return null;
  const ch = TV_CHANNELS.find((c) => c.id === sel) || TV_CHANNELS[0];

  return (
    <div className="sb-card absolute bottom-3 right-4 left-4 z-20 overflow-hidden sm:left-auto sm:w-[420px]">
      <div className="flex items-center gap-1 border-b-2 border-black bg-[#FFD23F] px-2 py-1.5">
        <span className="px-1 text-[10px] font-black uppercase tracking-wide text-black">TV</span>
        <div className="flex flex-1 flex-wrap gap-1">
          {TV_CHANNELS.map((c) => (
            <button
              key={c.id}
              onClick={() => setSel(c.id)}
              aria-pressed={c.id === sel}
              className={`rounded-full border-2 border-black px-2 py-0.5 text-[11px] font-bold ${c.id === sel ? 'bg-white text-black' : 'bg-white/40 text-black/70 hover:bg-white/70'}`}
            >
              {c.name}
            </button>
          ))}
        </div>
        <button onClick={onClose} title="Close TV" className="ml-1 rounded-full border-2 border-black bg-white px-2 py-0.5 text-[11px] font-black text-black hover:bg-[#FF7A59]">x</button>
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
