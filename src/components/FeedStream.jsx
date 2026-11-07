import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';

// Live headline stream over the globe, along its left edge.
// Items are queued as they arrive from SSE, then released one at a time.
const MAX_QUEUE = 30;
// 7 on screen plus the one that is fading out, so the DOM never holds more than 8.
const MAX_SHOWN = 7;
const RELEASE_MS = 4000;
const SNAPSHOT_MS = 1500;
const MAX_AGE_MS = 90000;
const AGE_TICK = 1000;

// Left border colour per item kind. News stays neutral grey.
const KIND_COLOR = {
  news: '#111111', x: '#0A7A3D', live: '#E64A2E', cinema: '#E6A700',
  conflict: '#E64A2E', trade: '#E6A700', policy: '#111111', nature: '#22A352', crypto: '#0A7A3D',
  blockade: '#E6A700', sanction: '#111111',
  quake: '#22A352', storm: '#22A352', wildfire: '#E6A700', volcano: '#22A352', flood: '#22A352', drought: '#22A352',
  cluster: '#0A7A3D',
};

const FILTER_TABS = [
  { id: 'all', label: 'All' },
  { id: 'war', label: 'War' },
  { id: 'markets', label: 'Markets' },
  { id: 'tech', label: 'Tech' },
  { id: 'science', label: 'Science' },
  { id: 'cinema', label: 'Cinema' },
  { id: 'hn', label: 'HN' },
  { id: 'arxiv', label: 'arXiv' },
  { id: 'x', label: 'X' },
  { id: 'live', label: 'Live' },
];

function matchesFilter(it, filter) {
  if (filter === 'all') return true;
  if (filter === 'x') return it.srcName === 'x' || it.srcName === 'x/News' || it.kind === 'x';
  if (filter === 'hn') return it.srcName === 'Hacker News';
  if (filter === 'arxiv') return it.srcName === 'arXiv';
  if (filter === 'live') return it.kind === 'live' || /kick|rumble|twitch|youtube/i.test(it.srcName || '');
  if (filter === 'cinema') return /cinema|movie|tmdb|box office/i.test(`${it.srcName || ''} ${it.text || ''}`);
  if (filter === 'war') return ['conflict', 'blockade'].includes(it.kind) || /\bwar|ukraine|russia|strike|missile|iran|houthi|red sea|gaza|israel|china|taiwan/i.test(it.text || '');
  if (filter === 'markets') return ['trade', 'crypto'].includes(it.kind) || /tariff|trade|export|fed|rate|spy|recession|nvidia|bitcoin|oil price|gold/i.test(it.text || '');
  if (filter === 'tech') return /chip|semiconductor|ai\b|ai |cuda|gpu|tech|silicon/i.test(it.text || '');
  if (filter === 'science') return /arxiv|quantum|cancer|space|climate|research/i.test(`${it.srcName || ''} ${it.text || ''}`);
  return true;
}
const colorOf = (kind) => KIND_COLOR[kind] || '#7C8C84';
const ageLabel = (ts) => {
  const m = Math.max(0, Math.round((Date.now() - ts) / 60000));
  return m < 1 ? 'now' : `${m}m`;
};

export default function FeedStream({ incoming = [], onPickEvent, wide = true }) {
  const [shown, setShown] = useState([]);
  const [hover, setHover] = useState(false);
  const [tick, setTick] = useState(0);
  const [filter, setFilter] = useState('all');
  const queue = useRef([]);
  const seen = useRef(new Set());
  const lastAt = useRef(0);
  const snapshotPhase = useRef(true);

  // Queue what the stream sends (max 30, oldest dropped).
  useEffect(() => {
    if (!Array.isArray(incoming) || !incoming.length) return;
    for (const it of incoming) {
      if (!it || seen.current.has(it.id)) continue;
      if (!matchesFilter(it, filter)) continue;
      seen.current.add(it.id);
      queue.current.push({ ...it, _at: Date.now() }); // _at = when it entered the stream
    }
    const over = queue.current.length - MAX_QUEUE;
    if (over > 0) queue.current.splice(0, over);
  }, [incoming]);

  // Release at most one item every 4 s (1.5 s while the first snapshot list drains).
  useEffect(() => {
    const id = setInterval(() => {
      setTick((t) => t + 1);
      if (hover) return;
      const now = Date.now();
      const wait = snapshotPhase.current ? SNAPSHOT_MS : RELEASE_MS;
      if (!queue.current.length) { snapshotPhase.current = false; return; }
      if (now - lastAt.current < wait) return;
      lastAt.current = now;
      const it = queue.current.shift();
      setShown((p) => [it, ...p].slice(0, MAX_SHOWN));
    }, 250);
    return () => clearInterval(id);
  }, [hover]);

  // Disappearing cascade: items fade out by age (CSS opacity) and are
  // removed from the DOM after MAX_AGE_MS so the board never fills up.
  // Hover pauses both the fade and the removal — that's the freeze.
  useEffect(() => {
    const id = setInterval(() => {
      if (hover) return;
      const now = Date.now();
      setShown((p) => (p.some((x) => now - (x._at || x.ts) > MAX_AGE_MS) ? p.filter((x) => now - (x._at || x.ts) <= MAX_AGE_MS) : p));
    }, AGE_TICK);
    return () => clearInterval(id);
  }, [hover]);

  if (!wide) return null;
  void tick; // keeps the age labels fresh

  return (
    <div
      data-feed-stream=""
      data-feed-hover={hover ? '1' : '0'}
      data-feed-queue={queue.current.length}
      data-feed-filter={filter}
      className="absolute left-4 top-[104px] w-[300px] overflow-hidden"
      style={{
        height: '55%',
        WebkitMaskImage: 'linear-gradient(to bottom, #000 0%, #000 35%, transparent 100%)',
        maskImage: 'linear-gradient(to bottom, #000 0%, #000 35%, transparent 100%)',
        pointerEvents: 'none',
      }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <div className="mb-2 flex flex-wrap gap-1" role="tablist" aria-label="Feed filter" style={{ pointerEvents: 'auto' }}>
        {FILTER_TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={filter === t.id}
            onClick={() => setFilter(t.id)}
            className="sb-chip px-2 py-0.5 text-[10px] focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-black"
            style={{ background: filter === t.id ? '#111' : '#fff', color: filter === t.id ? '#fff' : '#111' }}
          >{t.label}</button>
        ))}
      </div>
      <ul className="flex flex-col gap-2">
        <AnimatePresence initial={false}>
          {shown.map((it) => {
            const news = !it.eventId && /^https?:\/\//i.test(it.url || '');
            const body = (
              <>
                <div className="flex items-center justify-between gap-2 text-[10px] uppercase tracking-wide text-mute">
                  <span className="truncate">{it.srcName}</span>
                  <span className="num shrink-0">{ageLabel(it.ts)}</span>
                </div>
                <p className="mt-1 line-clamp-2 text-[13px] leading-snug text-ink">{it.text}</p>
                {!!(it.tickers || []).length && (
                  <div className="mt-1 flex flex-wrap gap-1">
                    {it.tickers.slice(0, 6).map((t) => (
                      <span key={t} className="num rounded border border-line px-1 text-[10px] text-mute">{t}</span>
                    ))}
                  </div>
                )}
              </>
            );
            const cls = 'sb-card block w-full px-2 py-1.5 text-left';
            const ageMs = Date.now() - (it._at || it.ts || Date.now());
            const faded = ageMs > 30000 && !hover; // second half of life: grey + faded
            const gone = ageMs > MAX_AGE_MS; // removed by the interval above
            return (
              <motion.li
                key={it.id}
                layout
                initial={{ opacity: 0, x: -12 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -12, transition: { duration: 0.2 } }}
                transition={{ duration: 0.2 }}
                style={{ borderLeft: `3px solid ${colorOf(it.kind)}`, pointerEvents: 'auto', opacity: gone ? 0 : faded ? 0.45 : 1, filter: faded ? 'grayscale(0.6)' : 'none', transition: 'opacity 1.2s ease, filter 1.2s ease' }}
              >
                {news
                  ? <a href={it.url} target="_blank" rel="noopener noreferrer" title={it.text} className={`${cls} focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-black`}>{body}</a>
                  : <button type="button" data-feed-event={it.eventId || ''} onClick={() => it.eventId && onPickEvent(it.eventId)} aria-label={it.eventId ? `Focus ${it.text || 'event'}` : (it.text || 'Feed item')} className={`${cls} ${it.eventId ? 'cursor-pointer hover:bg-[#C6E265]/40' : 'cursor-default'} focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-black`}>{body}</button>}
              </motion.li>
            );
          })}
        </AnimatePresence>
      </ul>
    </div>
  );
}
