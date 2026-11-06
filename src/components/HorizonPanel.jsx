import { useCallback, useEffect, useState } from 'react';

function scoreOf(item) {
  if (typeof item?.score === 'number') return item.score;
  if (typeof item?.topScore === 'number') return item.topScore;
  if (typeof item?.top_score === 'number') return item.top_score;
  if (typeof item?.count === 'number' && typeof item?.score === 'number') return item.score;
  return null;
}

export default function HorizonPanel() {
  const [profiles, setProfiles] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [items, setItems] = useState([]);
  const [loadingFeed, setLoadingFeed] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch('/api/horizon/profiles');
        const data = await res.json();
        if (!alive) return;
        const list = Array.isArray(data) ? data : (Array.isArray(data?.profiles) ? data.profiles : []);
        setProfiles(list);
        if (list.length > 0) setSelectedId((p) => p ?? list[0].id ?? null);
      } catch { /* intentional: keep empty state when profiles fail */ }
    })();
    return () => { alive = false; };
  }, []);

  const loadFeed = useCallback(async (profileId) => {
    if (!profileId) return;
    setLoadingFeed(true);
    try {
      const res = await fetch(`/api/horizon/feed?profile=${encodeURIComponent(profileId)}`);
      const data = await res.json();
      const list = Array.isArray(data) ? data : (Array.isArray(data?.items) ? data.items : (Array.isArray(data?.feed) ? data.feed : []));
      setItems(list);
    } catch { /* intentional: keep previous items on failure */ }
    setLoadingFeed(false);
  }, []);

  useEffect(() => {
    if (selectedId) loadFeed(selectedId);
  }, [selectedId, loadFeed]);

  const select = (profile) => {
    if (!profile) return;
    setSelectedId(profile.id ?? null);
  };

  const selectedProfile = profiles.find((p) => p && p.id === selectedId) || null;

  const cardsFor = (profile) => {
    if (!profile) return [];
    if (Array.isArray(profile.cards)) return profile.cards;
    if (Array.isArray(profile.profiles)) return profile.profiles;
    return [];
  };

  // Contract expects GET /api/horizon/profiles to return profile cards directly.
  // If the payload instead nests, flatten one level for display.
  const displayProfiles = profiles.length && profiles[0] && typeof profiles[0] === 'object' && !('name' in profiles[0]) && !('id' in profiles[0])
    ? profiles.flatMap((p) => cardsFor(p))
    : profiles;

  return (
    <div className="sb-card overflow-hidden">
      <div className="border-b-2 border-black bg-[#FFD23F] px-3 py-1.5">
        <span className="text-[10px] font-black uppercase tracking-wide text-black">Horizon</span>
      </div>

      <div className="px-3 py-2">
        <div className="text-[10px] font-black uppercase tracking-wide text-black">Profiles</div>
        {displayProfiles.length === 0 ? (
          <p className="mt-1 text-[12px] text-mute">No horizon profiles yet.</p>
        ) : (
          <ul className="mt-2 flex flex-col gap-1.5">
            {displayProfiles.map((profile, i) => {
              const active = (profile.id ?? null) === selectedId;
              const count = profile.count ?? profile.itemCount ?? profile.item_count ?? null;
              const top = typeof profile.topScore === 'number' ? profile.topScore : (typeof profile.top_score === 'number' ? profile.top_score : (typeof profile.score === 'number' ? profile.score : null));
              return (
                <li key={`${profile.id ?? i}-${i}`}>
                  <button
                    type="button"
                    onClick={() => select(profile)}
                    aria-pressed={active}
                    className={`flex w-full items-start gap-2 rounded-md border-2 border-black px-2 py-1.5 text-left focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-black ${active ? 'bg-white text-black shadow-[2px_2px_0_#111]' : 'bg-white/40 text-black/70 hover:bg-white/70'}`}
                    style={profile.accent || profile.color ? { borderLeft: `4px solid ${profile.accent || profile.color}` } : undefined}
                  >
                    <span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full border-2 border-black" style={{ background: profile.accent || profile.color || '#7C8C84' }} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-black leading-snug text-ink">{profile.name || profile.title || profile.id}</span>
                      {profile.description ? <span className="mt-0.5 block text-[11px] leading-snug text-mute">{profile.description}</span> : null}
                      <span className="mt-0.5 block text-[11px] text-mute">
                        {count != null ? `${count} items` : ''}
                        {top != null ? `${count != null ? ' · ' : ''}top ${top}` : ''}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="border-t border-line px-3 py-2">
        <div className="text-[10px] font-semibold uppercase tracking-wide text-mute">
          {selectedProfile ? selectedProfile.name || selectedProfile.id : 'Feed'}
        </div>
        {loadingFeed ? (
          <p className="mt-1 text-[12px] text-mute">Loading feed…</p>
        ) : items.length === 0 ? (
          <p className="mt-1 text-[12px] text-mute">No items for this profile yet.</p>
        ) : (
          <ul className="mt-2 flex max-h-[320px] flex-col gap-1.5 overflow-y-auto">
            {items.map((item, i) => {
              const score = scoreOf(item);
              const terms = Array.isArray(item.matchedTerms) ? item.matchedTerms : (Array.isArray(item.matched_terms) ? item.matched_terms : (Array.isArray(item.terms) ? item.terms : []));
              return (
                <li key={`${item.id ?? i}-${i}`} className="rounded-md border border-line bg-panel/55 px-2 py-1.5">
                  <div className="flex items-center justify-between gap-2 text-[10px] uppercase tracking-wide text-mute">
                    <span className="truncate">{item.srcName || item.source || item.src || ''}</span>
                    {score != null ? <span className="shrink-0 rounded border border-line px-1 text-[10px] text-mute">{score}</span> : null}
                  </div>
                  <p className="mt-1 text-[13px] leading-snug text-ink">{item.text || item.title || item.headline || ''}</p>
                  {terms.length > 0 ? (
                    <div className="mt-1 flex flex-wrap gap-1">
                      <span className="text-[10px] text-mute">matched:</span>
                      {terms.map((t) => (
                        <span key={t} className="rounded border border-line px-1 text-[10px] text-mute">{t}</span>
                      ))}
                    </div>
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
