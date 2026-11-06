import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import TopBar from './components/TopBar.jsx';
import BestSignals from './components/BestSignals.jsx';
import EventList from './components/EventList.jsx';
import AssetStrip from './components/AssetStrip.jsx';
import FeedStream from './components/FeedStream.jsx';
import { fetchState } from './api.js';
import { LAYERS } from './lib/icons.js';
import { PROFILES, matchProfile } from './lib/profiles.js';
import { satrecOf, satPosition } from './lib/sats.js';

const Globe3D = lazy(() => import('./components/Globe3D.jsx'));
const Lines = lazy(() => import('./components/Lines.jsx'));
const Setup = lazy(() => import('./components/Setup.jsx'));
const TvPanel = lazy(() => import('./components/TvPanel.jsx'));
const CinemaRail = lazy(() => import('./components/CinemaRail.jsx'));
const HorizonPanel = lazy(() => import('./components/HorizonPanel.jsx'));
const LiveWatchPanel = lazy(() => import('./components/LiveWatchPanel.jsx'));
const XFeedPanel = lazy(() => import('./components/XFeedPanel.jsx'));
const SignalKanban = lazy(() => import('./components/SignalKanban.jsx'));
const MarketsChart = lazy(() => import('./components/MarketsChart.jsx'));

const PanelsFallback = () => <div className="grid place-items-center py-16 text-sm text-mute">Loading panel…</div>;
const GlobeFallback = () => <div className="grid place-items-center py-16 text-sm text-mute">Loading globe…</div>;

const PRESETS = [
  { label: 'Global', lat: 20, lng: 10, alt: 2.4 },
  { label: 'Middle East', lat: 28, lng: 45, alt: 1.4 },
  { label: 'Europe', lat: 50, lng: 20, alt: 1.5 },
  { label: 'Asia', lat: 30, lng: 105, alt: 1.8 },
  { label: 'Americas', lat: 15, lng: -80, alt: 1.9 },
];

// Labels for the ship watch boxes (server sends id / tankers / cargo / other).
const SHIP_BOX_LABEL = { hormuz: 'Hormuz', redsea: 'Red Sea', suez: 'Suez', blacksea: 'Black Sea', panama: 'Panama', taiwan: 'Taiwan' };

// Which map switch controls each event: quakes, storms/fires/volcanoes/floods/drought, military clusters.
const mapLayerOn = (e, on) => {
  if (e.kind === 'quake') return on.quakes;
  if (e.kind === 'cluster') return on.military;
  if (['storm', 'wildfire', 'volcano', 'flood', 'drought'].includes(e.kind)) return on.storms;
  return true;
};

export default function App() {
  const [state, setState] = useState(null);
  const [online, setOnline] = useState(true);
  const [selectedId, setSelectedId] = useState(null);
  const [layers, setLayers] = useState(() => new Set(LAYERS.map((l) => l.id)));
  const [setupOpen, setSetupOpen] = useState(false);
  const [lines, setLines] = useState([]);
  const [tvOpen, setTvOpen] = useState(false);
  const [railTab, setRailTab] = useState('signals');
  const [liveCount, setLiveCount] = useState(0);
  const globe = useRef(null);
  const firstLoad = useRef(true);

  const selected = useMemo(() => state?.events.find((e) => e.id === selectedId) || state?.context.find((e) => e.id === selectedId) || null, [state, selectedId]);
  const selectedSignals = useMemo(() => (selected ? state.signals.filter((s) => s.eventId === selected.id) : []), [state, selected]);
  const focus = useMemo(() => selectedSignals.map((s) => s.asset).filter((a) => state?.trad[a]).slice(0, 8).join(','), [selectedSignals, state]);

  const load = useCallback(async () => {
    try {
      const s = await fetchState(focus ? focus.split(',') : []);
      setState(s); setOnline(true);
      if (firstLoad.current) {
        firstLoad.current = false;
        if (!localStorage.getItem('foxhole.setupSeen') && !s.ai.connected) setSetupOpen(true);
      }
    } catch { setOnline(false); }
  }, [focus]);

  useEffect(() => { load(); const t = setInterval(load, focus ? 8000 : 12000); return () => clearInterval(t); }, [load, focus]);

  const closeSetup = useCallback(() => { localStorage.setItem('foxhole.setupSeen', '1'); setSetupOpen(false); }, []);

  const select = useCallback((id) => {
    setSelectedId(id);
    const ev = state?.events.find((e) => e.id === id) || state?.context.find((e) => e.id === id);
    if (ev && typeof ev.lat === 'number') globe.current?.flyTo(ev.lat, ev.lng, 1.8);
  }, [state]);

  // Live stream: aircraft, ships, satellites, source statuses, headlines, and new/updated events.
  // Auto-reconnect is built into EventSource.
  const [live, setLive] = useState({ sources: null, aircraft: [], ships: [], shipBoxes: [], shipNames: {}, pulse: null, feed: [] });
  useEffect(() => {
    const es = new EventSource('/stream');
    es.addEventListener('snapshot', (m) => {
      const d = JSON.parse(m.data);
      setLive((p) => ({
        ...p,
        sources: d.sources,
        aircraft: d.aircraft,
        ships: d.ships?.rows || p.ships,
        shipBoxes: d.ships?.boxes || p.shipBoxes,
        shipNames: d.ships?.names ? Object.fromEntries(d.ships.names) : p.shipNames,
        feed: d.feed || p.feed,
      }));
    });
    es.addEventListener('aircraft', (m) => { const d = JSON.parse(m.data); setLive((p) => ({ ...p, aircraft: d.aircraft })); });
    es.addEventListener('ships', (m) => { const d = JSON.parse(m.data); setLive((p) => ({ ...p, ships: d.rows || [], shipBoxes: d.boxes || [] })); });
    es.addEventListener('status', (m) => { const d = JSON.parse(m.data); setLive((p) => ({ ...p, sources: d.sources })); });
    es.addEventListener('feed', (m) => { const d = JSON.parse(m.data); setLive((p) => ({ ...p, feed: [...p.feed, d] })); });
    es.addEventListener('event_new', (m) => { const e = JSON.parse(m.data); setLive((p) => ({ ...p, pulse: { ...e, at: Date.now() } })); load(); });
    es.addEventListener('event_update', () => load());
    return () => es.close();
  }, [load]);


  // Layer toggles (Quakes, Storms & Fires, Military Aircraft, Ships, Satellites, Feed) plus the
  // no-link checkbox. Saved in localStorage, read in an effect only.
  const [mapLayers, setMapLayers] = useState({ quakes: true, storms: true, military: true, ships: true, sats: false, feed: true, noLink: true });
  const [activeProfile, setActiveProfile] = useState(null);
  const saveLayers = (n) => { try { localStorage.setItem('foxhole.mapLayers', JSON.stringify(n)); } catch { /* intentional: storage may be unavailable */ } return n; };
  useEffect(() => {
    try {
      const v = JSON.parse(localStorage.getItem('foxhole.mapLayers') || 'null');
      if (v) setMapLayers((p) => { const n = saveLayers({ ...p, ...v }); setActiveProfile(matchProfile(n)?.id ?? null); return n; });
    } catch { /* intentional: corrupt saved layers → defaults */ }
  }, []);
  const toggleMap = (k) => setMapLayers((p) => { const n = saveLayers({ ...p, [k]: !p[k] }); setActiveProfile(null); return n; });
  const applyProfile = (id) => setMapLayers((p) => {
    const preset = PROFILES.find((x) => x.id === id);
    if (!preset) return p;
    const n = saveLayers({ ...preset.layers });
    setActiveProfile(matchProfile(n)?.id ?? null);
    return n;
  });

  // Satellites: fetch the TLE list once, then recompute positions every 2 s in the browser.
  const [satRecs, setSatRecs] = useState(null);
  useEffect(() => {
    if (!mapLayers.sats) return;
    let alive = true;
    (async () => {
      try {
        const tle = await (await fetch('/api/sats')).json();
        if (!alive) return;
        setSatRecs(tle.map((t) => ({ name: t.name, rec: satrecOf(t) })).filter((x) => x.rec));
      } catch { /* intentional: sats fetch failed → keep previous */ }
    })();
    return () => { alive = false; };
  }, [mapLayers.sats]);
  const [sats, setSats] = useState([]);
  useEffect(() => {
    if (!satRecs) { setSats([]); return; }
    const tick = () => {
      const now = new Date();
      setSats(satRecs.map((x) => ({ name: x.name, ...satPosition(x.rec, now) })).filter((s) => s.lat != null));
    };
    tick();
    const t = setInterval(tick, 2000);
    return () => clearInterval(t);
  }, [satRecs]);

  const visible = useMemo(() => (state ? state.events.filter((e) => layers.has(e.layer)) : []), [state, layers]);
  const showCtx = mapLayers.noLink;
  const visibleCtx = useMemo(() => (state && showCtx ? state.context.filter((e) => layers.has(e.layer)) : []), [state, layers, showCtx]);
  const toggle = (id) => setLayers((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  // Draw lines from the selected event to each asset card it touches
  useEffect(() => {
    setLines([]);
    if (!selected) return;
    const compute = () => {
      const from = typeof selected.lat === 'number'
        ? globe.current?.screenOf(selected.lat, selected.lng)
        : (() => { const r = document.querySelector(`[data-event="${CSS.escape(selected.id)}"]`)?.getBoundingClientRect(); return r ? { x: r.right, y: r.top + r.height / 2 } : null; })();
      if (!from) return setLines([]);
      const out = [];
      for (const s of selectedSignals.slice(0, 8)) {
        const card = document.querySelector(`[data-asset="${s.asset}"]`);
        if (!card) continue;
        card.scrollIntoView({ inline: 'nearest', block: 'nearest' });
        const r = card.getBoundingClientRect();
        out.push({ a: s.asset, dir: s.dir, from, to: { x: r.left + r.width / 2, y: r.top } });
      }
      setLines(out);
    };
    const t = setTimeout(compute, 1000);
    window.addEventListener('resize', compute);
    return () => { clearTimeout(t); window.removeEventListener('resize', compute); };
  }, [selected?.id, load]); // eslint-disable-line react-hooks/exhaustive-deps

  // The headline stream is only useful on a wide window.
  const [wide, setWide] = useState(() => typeof window === 'undefined' || window.innerWidth >= 1100);
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1100px)');
    const on = () => setWide(mq.matches);
    on();
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);

  if (!state) {
    return (
      <div className="grid h-screen place-items-center text-sm text-mute">
        {online ? 'Loading Foxhole...' : 'Cannot reach the Foxhole server. Start it with: npm start'}
      </div>
    );
  }

  return (
    <div className="grid h-screen w-screen grid-rows-[auto_auto_minmax(0,1fr)_auto] overflow-hidden">
      <TopBar state={state} online={online} onSetup={() => setSetupOpen(true)} tvOpen={tvOpen} onTv={() => setTvOpen((v) => !v)} />
      <BestSignals signals={state.signals} top={state.top} ai={state.ai} onPick={select} onSetup={() => setSetupOpen(true)} />

      <main className="grid min-h-0 grid-cols-[340px_minmax(0,1fr)_360px]">
        <div className="flex min-h-0 flex-col border-r-2 border-black">
          <div className="flex flex-wrap items-center gap-1 border-b-2 border-black px-2 py-1.5">
            {[['signals', 'Signals'], ['cinema', 'Cinema'], ['horizon', 'Horizon'], ['live', `Live${liveCount > 0 ? ` ${liveCount}` : ''}`], ['x', 'X']].map(([id, label]) => (
              <button key={id} onClick={() => setRailTab(id)} className="sb-chip px-2.5 py-1 text-xs" style={{ background: railTab === id ? '#111' : '#fff', color: railTab === id ? '#fff' : '#111' }}>{label}</button>
            ))}
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            <Suspense fallback={<div className="grid place-items-center py-8 text-sm text-mute">Loading…</div>}>
              {railTab === 'signals' && <EventList events={visible} contextCount={state.context.length} total={state.events.length} layers={layers} onToggle={toggle} selectedId={selectedId} onSelect={select} now={state.now} />}
              {railTab === 'cinema' && <CinemaRail />}
              {railTab === 'horizon' && <HorizonPanel />}
              {railTab === 'live' && <LiveWatchPanel onLiveChange={setLiveCount} />}
              {railTab === 'x' && <XFeedPanel />}
            </Suspense>
          </div>
        </div>

        <section className="relative min-h-0 overflow-hidden" style={{ background: 'radial-gradient(ellipse at 50% 45%, #FFFDF5 0%, #FAF6EF 70%)' }}>
          <Suspense fallback={GlobeFallback}>
            <Globe3D ref={globe} events={visible.filter((e) => mapLayerOn(e, mapLayers))} context={visibleCtx} selectedId={selectedId} onSelect={(id) => (id ? select(id) : setSelectedId(null))} aircraft={mapLayers.military ? live.aircraft : []} ships={mapLayers.ships ? live.ships : []} shipNames={live.shipNames} sats={mapLayers.sats ? sats : []} pulse={live.pulse} />
          </Suspense>
          <div className="absolute left-4 top-3 flex flex-col gap-1.5 pr-[220px]">
            <div className="flex flex-wrap items-center gap-2 text-xs text-mute">
              {PROFILES.map((p) => (
                <button key={p.id} data-profile={p.id} onClick={() => applyProfile(p.id)} aria-pressed={activeProfile === p.id} className="sb-chip px-3 py-1" style={{ background: activeProfile === p.id ? '#111' : '#fff', color: activeProfile === p.id ? '#fff' : '#111' }}>{p.label}</button>
              ))}
              {[['quakes', 'Quakes'], ['storms', 'Storms & Fires'], ['military', 'Military Aircraft'], ['ships', 'Ships'], ['sats', 'Satellites'], ['feed', 'Feed']].map(([k, label]) => (
                <button key={k} data-layer-switch={k} onClick={() => toggleMap(k)} aria-pressed={mapLayers[k]} className="sb-chip flex items-center gap-1.5 px-2.5 py-1" style={{ background: mapLayers[k] ? '#FFD23F' : '#fff', color: '#111' }}>
                  <span className={`h-1.5 w-1.5 rounded-full ${mapLayers[k] ? 'bg-black' : 'bg-mute'}`} /> {label}
                </button>
              ))}
            </div>
            {live.sources?.ships?.status === 'ok' && (
              <p className="text-xs text-mute">
                {live.shipBoxes.map((b) => `${SHIP_BOX_LABEL[b.id] || b.id} ${b.tankers} tankers, ${b.cargo} cargo`).join(' | ')}
              </p>
            )}
            <p className="text-xs text-mute">Bigger dot, bigger impact. The icon shows the type.</p>
          </div>
          <label className="absolute right-4 top-3 flex cursor-pointer items-center gap-2 text-xs text-mute">
            <input type="checkbox" checked={showCtx} onChange={(e) => toggleMap('noLink')} />
            Show events with no trade link ({state.context.length})
          </label>
          <div className="absolute bottom-3 left-4 flex gap-1.5">
            {PRESETS.map((p) => (
              <button key={p.label} onClick={() => globe.current?.flyTo(p.lat, p.lng, p.alt)} className="sb-chip px-3 py-1 text-xs text-ink">{p.label}</button>
            ))}
          </div>
          {mapLayers.feed && (
            <FeedStream incoming={live.feed} wide={wide} onPickEvent={(id) => {
              const ev = state?.events.find((e) => e.id === id) || state?.context.find((e) => e.id === id);
              if (ev) select(id);
            }} />
          )}
          {state.events.length === 0 && (
            <div className="pointer-events-none absolute inset-x-0 bottom-14 grid place-items-center text-center text-sm text-mute">
              <p>{state.context.length ? 'Quiet right now. Nothing live links to a tradable asset, so there are no signals.' : 'No live events yet.'}<br />{state.context.length ? 'The dim dots are real events with no trade link.' : 'New ones appear here as they come in.'}</p>
            </div>
          )}
          <Suspense fallback={null}>
            <TvPanel open={tvOpen} onClose={() => setTvOpen(false)} />
          </Suspense>
        </section>

        <div className="flex min-h-0 flex-col border-l-2 border-black">
          <div className="min-h-0 flex-[1.4]">
            <Suspense fallback={PanelsFallback}>
              <SignalKanban signals={state.signals} onPick={select} selectedId={selectedId} />
            </Suspense>
          </div>
          <div className="min-h-0 flex-1 border-t-2 border-black p-2">
            <Suspense fallback={PanelsFallback}>
              <MarketsChart signals={state.signals} trad={state.trad} crypto={state.crypto} />
            </Suspense>
          </div>
        </div>
      </main>

      <AssetStrip trad={state.trad} crypto={state.crypto} signals={state.signals} selectedSignals={selectedSignals} />
      <Suspense fallback={null}>
        <Lines lines={lines} />
        <Setup open={setupOpen} state={state} onClose={closeSetup} onChanged={load} />
      </Suspense>
    </div>
  );
}
