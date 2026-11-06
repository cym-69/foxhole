import { useEffect, useRef, useState } from 'react';
import { TV_CHANNELS, TV_EMBED, TV_ALLOW, TV_LAST_KEY } from '../config/tv.js';
import Hls from 'hls.js';

// Docked TV panel over the globe. The iframe exists only while the panel is open
// and only for the selected tab (key on the channel id remounts it).
// YouTube tabs render the live embed; HLS tabs render a <video> with hls.js.
export default function TvPanel({ open, onClose }) {
  const [sel, setSel] = useState(() => {
    try {
      const v = localStorage.getItem(TV_LAST_KEY);
      if (v && TV_CHANNELS.some((c) => c.id === v)) return v;
    } catch { /* intentional: storage may be unavailable → default channel */ }
    return TV_CHANNELS[0].id;
  });
  const [hlsError, setHlsError] = useState(null);
  const videoRef = useRef(null);

  useEffect(() => {
    try { localStorage.setItem(TV_LAST_KEY, sel); } catch { /* intentional: storage may be unavailable */ }
  }, [sel]);

  const ch = TV_CHANNELS.find((c) => c.id === sel) || TV_CHANNELS[0];
  const isHls = ch.kind === 'hls';

  useEffect(() => {
    if (!open || !isHls || !ch.url) return;
    const video = videoRef.current;
    if (!video) return;
    setHlsError(null);
    let hls = null;
    let cancelled = false;
    if (Hls.isSupported()) {
      hls = new Hls({ enableWorker: true });
      hls.loadSource(ch.url);
      hls.attachMedia(video);
      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (cancelled) return;
        if (data && data.fatal) setHlsError(data.errorDetails || data.details || 'Stream error');
      });
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = ch.url;
    } else {
      setHlsError('HLS is not supported in this browser.');
    }
    video.play?.().catch(() => { /* autoplay policy: video is muted */ });
    return () => {
      cancelled = true;
      if (hls) hls.destroy();
      video.removeAttribute('src');
      video.load();
    };
  }, [open, isHls, ch.id, ch.url]);

  if (!open) return null;

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
        <button onClick={onClose} aria-label="Close TV" title="Close TV" className="ml-1 rounded-full border-2 border-black bg-white px-2 py-0.5 text-[11px] font-black text-black hover:bg-[#FF7A59] focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-black">x</button>
      </div>
      <div className="relative aspect-video w-full bg-black">
        {isHls ? (
          <>
            <video
              ref={videoRef}
              key={ch.id}
              className="h-full w-full"
              controls
              muted
              playsInline
              aria-label={ch.name}
            />
            {hlsError ? (
              <div role="alert" className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-black/80 px-4 text-center text-white">
                <span className="text-sm font-black">Stream unavailable</span>
                <span className="text-[11px] font-bold text-white/70">{String(hlsError)}</span>
              </div>
            ) : null}
          </>
        ) : (
          <iframe
            key={ch.id}
            src={TV_EMBED(ch.channel)}
            title={ch.name}
            allow={TV_ALLOW}
            allowFullScreen
            className="h-full w-full"
          />
        )}
      </div>
    </div>
  );
}
