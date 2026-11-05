import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef } from 'react';
import Globe from 'globe.gl';
import { feature } from 'topojson-client';
import world from 'world-atlas/countries-110m.json';
import { ICONS } from '../lib/icons.js';
import { altFraction } from '../lib/sats.js';

const land = feature(world, world.objects.countries).features;
const reduced = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const CAP_FAR = 30;
const CAP_NEAR = 90;

const dotSize = (impact) => Math.round(16 + Math.min(1, impact) * 24);
// Spike height grows with impact. Color: green = lead asset up, red = down, amber = unsure.
const COL = { up: '#5FD39A', down: '#E5706B', warn: '#E0B45A', sel: '#D6E0DA' };
const leadColor = (ev, sel) => (sel ? COL.sel : !ev.lead || ev.lead.action === 'WATCH' ? COL.warn : ev.lead.dir > 0 ? COL.up : COL.down);
const altOf = (ev) => 0.025 + Math.min(1, ev.impact) * 0.16;
// Ships: 0 other (dim grey), 1 cargo (light grey-blue), 2 tanker (amber).
export const SHIP_CLASS = { 0: '#7C8C84', 1: '#A9BFD6', 2: '#E0B45A' };
const SHIP_CLASS_NAME = { 0: 'other', 1: 'cargo', 2: 'tanker' };
const SHIP_ALT = 0.008;
const labelOf = (ev) => {
  const p = String(ev.place || ev.title).split(',')[0];
  const short = p.length > 22 ? p.slice(0, 21) + '...' : p;
  return ev.lead ? `${short}  ${ev.lead.asset} ${ev.lead.dir > 0 ? '\u25B2' : ev.lead.dir < 0 ? '\u25BC' : '\u25C6'}` : short;
};

const Globe3D = forwardRef(function Globe3D({ events, context = [], selectedId, onSelect, aircraft = [], ships = [], shipNames = {}, sats = [], pulse = null }, ref) {
  const host = useRef(null);
  const gl = useRef(null);
  const items = useRef(new Map());
  const seen = useRef(null);
  const zoomedIn = useRef(false);
  const pulses = useRef([]);
  const selRing = useRef(null);
  const planes = useRef(new Map());     // hex -> { from, to, t0, cs } (smooth 15 s glide)
  const planeItems = useRef(new Map()); // hex -> html element for a plane
  const shipPos = useRef(new Map());    // mmsi -> { from, to, t0, cls, sog, cog } (same glide as aircraft)
  const shipItems = useRef(new Map());  // mmsi -> html element for a ship
  const satPos = useRef(new Map());     // name -> { lat, lng, altKm }
  const satItems = useRef(new Map());   // name -> html element for a satellite
  const shownRef = useRef([]);          // last event dots, so plane/ship/sat updates keep them
  const latest = useRef({});
  latest.current = { events, context, selectedId, onSelect };

  // One html layer for every kind of marker, so planes, ships and satellites never clobber events.
  const applyHtml = useCallback(() => {
    const g = gl.current;
    if (!g) return;
    g.htmlElementsData([
      ...shownRef.current,
      ...Array.from(planeItems.current.values()),
      ...Array.from(shipItems.current.values()),
      ...Array.from(satItems.current.values()),
    ]);
  }, []);

  const applyRings = useCallback(() => {
    const g = gl.current;
    if (!g) return;
    g.ringsData([...pulses.current, ...(selRing.current ? [selRing.current] : [])]);
  }, []);

  const sync = useCallback(() => {
    const g = gl.current;
    if (!g) return;
    const { events: evs, context: ctx, selectedId: sel } = latest.current;
    const geo = evs.filter((e) => typeof e.lat === 'number' && typeof e.lng === 'number');
    const cap = zoomedIn.current ? CAP_NEAR : CAP_FAR;
    const keep = new Set();
    const shown = [];
    const pts = [];

    for (const [rank, ev] of geo.slice(0, cap).entries()) {
      const key = 'e:' + ev.id;
      keep.add(key);
      let it = items.current.get(key);
      if (!it) {
        const el = document.createElement('div');
        el.style.pointerEvents = 'auto';
        el.style.cursor = 'pointer';
        const dot = document.createElement('div');
        dot.className = 'fx-dot';
        dot.innerHTML = `<svg viewBox="0 0 24 24">${ICONS[ev.layer] || ICONS.conflict}</svg>`;
        el.appendChild(dot);
        const label = document.createElement('span');
        label.className = 'fx-label';
        el.appendChild(label);
        it = { key, el, dot, label, type: 'event' };
        el.addEventListener('click', (e) => { e.stopPropagation(); latest.current.onSelect(it.ev.id); });
        items.current.set(key, it);
      }
      const col = leadColor(ev, ev.id === sel);
      it.ev = ev; it.lat = ev.lat; it.lng = ev.lng; it.alt = altOf(ev);
      it.dot.style.setProperty('--s', dotSize(ev.impact) + 'px');
      it.dot.style.setProperty('--c', col);
      it.label.textContent = labelOf(ev);
      it.label.style.display = rank < 6 || ev.id === sel ? 'block' : 'none';
      it.el.title = ev.title;
      pts.push({ lat: ev.lat, lng: ev.lng, alt: it.alt, color: col, r: ev.id === sel ? 0.34 : 0.22 });
      shown.push(it);
    }

    // Everything past the cap becomes numbered bubbles (only when zoomed out)
    const cells = new Map();
    for (const ev of geo.slice(cap)) {
      const k = `${Math.floor(ev.lat / 15)},${Math.floor(ev.lng / 15)}`;
      const c = cells.get(k) || { n: 0, lat: 0, lng: 0 };
      c.n += 1; c.lat += ev.lat; c.lng += ev.lng; cells.set(k, c);
    }
    for (const [k, c] of cells) {
      const key = 'c:' + k;
      keep.add(key);
      let it = items.current.get(key);
      if (!it) {
        const el = document.createElement('div');
        el.style.pointerEvents = 'auto';
        el.style.cursor = 'pointer';
        const dot = document.createElement('div');
        dot.className = 'fx-dot fx-cluster';
        el.appendChild(dot);
        it = { key, el, dot, type: 'cluster' };
        el.addEventListener('click', (e) => {
          e.stopPropagation();
          gl.current.pointOfView({ lat: it.lat, lng: it.lng, altitude: 1.2 }, 900);
        });
        items.current.set(key, it);
      }
      it.lat = c.lat / c.n; it.lng = c.lng / c.n; it.alt = 0.02;
      it.dot.textContent = String(c.n);
      it.dot.style.setProperty('--s', '26px');
      it.el.title = `${c.n} more events. Click to zoom in.`;
      shown.push(it);
    }

    // Events with no trade link: small dim dots, never a signal
    for (const ev of ctx) {
      const key = 'x:' + ev.id;
      keep.add(key);
      let it = items.current.get(key);
      if (!it) {
        const el = document.createElement('div');
        el.style.pointerEvents = 'auto';
        el.style.cursor = 'pointer';
        const dot = document.createElement('div');
        dot.className = 'fx-dot fx-ctx';
        el.appendChild(dot);
        it = { key, el, dot, type: 'context' };
        el.addEventListener('click', (e) => { e.stopPropagation(); latest.current.onSelect(it.ev.id); });
        items.current.set(key, it);
      }
      it.ev = ev; it.lat = ev.lat; it.lng = ev.lng; it.alt = 0.006;
      it.dot.style.setProperty('--s', '10px');
      it.el.title = `${ev.title} (no trade link)`;
      shown.push(it);
    }

    for (const k of [...items.current.keys()]) if (!keep.has(k)) items.current.delete(k);
    g.pointsData(pts);
    shownRef.current = shown;
    applyHtml();
    items.current.forEach((it) => it.dot.classList.toggle('sel', it.type !== 'cluster' && it.ev?.id === sel));

    // Short pulse for events that just arrived
    const ids = geo.map((e) => e.id);
    if (seen.current === null) seen.current = new Set(ids);
    else {
      const fresh = geo.filter((e) => !seen.current.has(e.id));
      fresh.forEach((e) => seen.current.add(e.id));
      if (fresh.length) {
        const mine = fresh.map((e) => ({ lat: e.lat, lng: e.lng, r: 5, repeat: 0 }));
        pulses.current = [...pulses.current, ...mine];
        applyRings();
        setTimeout(() => { pulses.current = pulses.current.filter((p) => !mine.includes(p)); applyRings(); }, 4500);
      }
    }
    const selEv = [...geo, ...ctx].find((e) => e.id === sel);
    if (!selEv) selRing.current = null;
    else if (!selRing.current || selRing.current.id !== sel) selRing.current = { id: sel, lat: selEv.lat, lng: selEv.lng, r: 4, repeat: 1800 };
    applyRings();
  }, [applyRings, applyHtml]);

  useEffect(() => {
    const el = host.current;
    const g = Globe({ animateIn: false })(el)
      .backgroundColor('rgba(0,0,0,0)')
      .showAtmosphere(true).atmosphereColor('#8FA89B').atmosphereAltitude(0.18).showGraticules(true)
      .pointLat((d) => d.lat).pointLng((d) => d.lng).pointAltitude((d) => d.alt).pointRadius((d) => d.r).pointColor((d) => d.color).pointResolution(5).pointsMerge(true)
      .hexPolygonsData(land).hexPolygonResolution(3).hexPolygonAltitude(0.004).hexPolygonMargin(0.5).hexPolygonUseDots(true)
      .hexPolygonColor(() => 'rgba(143,168,155,0.5)')
      .htmlLat((d) => d.lat).htmlLng((d) => d.lng).htmlAltitude((d) => d.alt ?? 0.01).htmlElement((d) => d.el)
      .htmlTransitionDuration(reduced ? 0 : 600)
      .ringLat((d) => d.lat).ringLng((d) => d.lng).ringMaxRadius((d) => d.r)
      .ringPropagationSpeed(2).ringRepeatPeriod((d) => d.repeat)
      .ringColor(() => (t) => `rgba(143,168,155,${1 - t})`)
      .onGlobeClick(() => latest.current.onSelect(null));
    g.htmlElementVisibilityModifier((node, visible) => {
      node.style.opacity = visible ? '1' : '0';
      node.style.pointerEvents = visible ? 'auto' : 'none';
    });
    const mat = g.globeMaterial();
    mat.color.set('#121A17'); mat.emissive.set('#0A100E'); mat.shininess = 0;

    const c = g.controls();
    c.autoRotate = !reduced; c.autoRotateSpeed = 0.35; c.enableDamping = true;
    c.minDistance = 130; c.maxDistance = 520;
    c.addEventListener('start', () => { c.autoRotate = false; }); // stops for good when touched
    g.pointOfView({ lat: 22, lng: 40, altitude: 2.4 });
    g.onZoom((pov) => {
      const zi = pov.altitude < 1.6;
      if (zi !== zoomedIn.current) { zoomedIn.current = zi; sync(); }
    });
    gl.current = g;

    const resize = () => g.width(el.clientWidth).height(el.clientHeight);
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(el);
    sync();
    return () => { ro.disconnect(); try { g._destructor(); } catch {} el.innerHTML = ''; gl.current = null; };
  }, [sync]);

  useEffect(() => { sync(); }, [events, context, selectedId, sync]);

  // Military aircraft: small soft-cyan dots. Each dot glides from its last position to the new one over 15 s.
  const drawPlanes = useCallback(() => {
    const g = gl.current;
    if (!g) return;
    const now = performance.now();
    const items = [];
    for (const [hex, p] of planes.current) {
      const t = Math.min(1, (now - p.t0) / 15000);
      const lat = p.from.lat + (p.to.lat - p.from.lat) * t;
      const lng = p.from.lng + (p.to.lng - p.from.lng) * t;
      let it = planeItems.current.get(hex);
      if (!it) {
        const el = document.createElement('div');
        el.className = 'fx-plane';
        el.title = `Military aircraft ${p.cs}`;
        it = { el, plane: true, alt: 0.012 };
        planeItems.current.set(hex, it);
      }
      it.lat = lat; it.lng = lng;
      items.push(it);
    }
    for (const k of [...planeItems.current.keys()]) if (!planes.current.has(k)) planeItems.current.delete(k);
    applyHtml();
  }, [applyHtml]);
  useEffect(() => {
    const now = performance.now();
    const seen = new Set();
    for (const a of aircraft) {
      seen.add(a.hex);
      const prev = planes.current.get(a.hex);
      const cur = prev ? { lat: prev.from.lat + (prev.to.lat - prev.from.lat) * Math.min(1, (now - prev.t0) / 15000), lng: prev.from.lng + (prev.to.lng - prev.from.lng) * Math.min(1, (now - prev.t0) / 15000) } : { lat: a.lat, lng: a.lon };
      planes.current.set(a.hex, { from: cur, to: { lat: a.lat, lng: a.lon }, t0: now, cs: a.callsign || a.hex });
    }
    for (const k of [...planes.current.keys()]) if (!seen.has(k)) planes.current.delete(k);
    drawPlanes();
  }, [aircraft, drawPlanes]);
  useEffect(() => {
    let raf;
    const tick = () => { drawPlanes(); raf = requestAnimationFrame(tick); };
    if (!reduced) raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [drawPlanes]);

  // Ships: AIS rows [mmsi, lat, lng, cog, sog, cls]. Same 15 s glide as the aircraft.
  const drawShips = useCallback(() => {
    const g = gl.current;
    if (!g) return;
    const now = performance.now();
    const items = [];
    for (const [mmsi, p] of shipPos.current) {
      const t = Math.min(1, (now - p.t0) / 15000);
      const lat = p.from.lat + (p.to.lat - p.from.lat) * t;
      const lng = p.from.lng + (p.to.lng - p.from.lng) * t;
      let it = shipItems.current.get(mmsi);
      if (!it) {
        const el = document.createElement('div');
        el.className = 'fx-ship';
        el.style.background = SHIP_CLASS[p.cls] || SHIP_CLASS[0];
        shipItems.current.set(mmsi, (it = { el, alt: SHIP_ALT }));
      }
      it.lat = lat; it.lng = lng;
      const name = shipNames[mmsi] || ('MMSI ' + mmsi);
      it.el.title = `${name} - ${SHIP_CLASS_NAME[p.cls] || 'other'} - ${(p.sog ?? 0).toFixed(1)} kn`;
      items.push(it);
    }
    for (const k of [...shipItems.current.keys()]) if (!shipPos.current.has(k)) shipItems.current.delete(k);
    applyHtml();
  }, [applyHtml, shipNames]);
  useEffect(() => {
    const now = performance.now();
    const seen = new Set();
    for (const r of ships) {
      const mmsi = String(r[0]);
      seen.add(mmsi);
      const prev = shipPos.current.get(mmsi);
      const cur = prev ? { lat: prev.from.lat + (prev.to.lat - prev.from.lat) * Math.min(1, (now - prev.t0) / 15000), lng: prev.from.lng + (prev.to.lng - prev.from.lng) * Math.min(1, (now - prev.t0) / 15000) } : { lat: r[1], lng: r[2] };
      shipPos.current.set(mmsi, { from: cur, to: { lat: r[1], lng: r[2] }, t0: now, cls: r[5] || 0, sog: r[4], cog: r[3] });
    }
    for (const k of [...shipPos.current.keys()]) if (!seen.has(k)) shipPos.current.delete(k);
    drawShips();
  }, [ships, drawShips]);
  useEffect(() => {
    let raf;
    const tick = () => { drawShips(); raf = requestAnimationFrame(tick); };
    if (!reduced) raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [drawShips]);

  // Satellites: small white dots at real altitude (km over 6371), the ISS slightly larger.
  useEffect(() => {
    const g = gl.current;
    if (!g) return;
    const keep = new Set();
    for (const s of sats) {
      keep.add(s.name);
      let it = satItems.current.get(s.name);
      if (!it) {
        const el = document.createElement('div');
        el.className = 'fx-sat';
        el.style.pointerEvents = 'auto';
        satItems.current.set(s.name, (it = { el }));
      }
      const iss = /ISS|ZARYA/i.test(s.name);
      it.lat = s.lat; it.lng = s.lng; it.alt = altFraction(s.altKm);
      it.el.style.width = iss ? '7px' : '4px';
      it.el.style.height = iss ? '7px' : '4px';
      it.el.title = `${s.name} - ${s.altKm.toFixed(0)} km`;
      satPos.current.set(s.name, { lat: s.lat, lng: s.lng, altKm: s.altKm });
    }
    for (const k of [...satItems.current.keys()]) if (!keep.has(k)) satItems.current.delete(k);
    applyHtml();
  }, [sats, applyHtml]);

  // New event: one expanding pulse ring for 1.5 s.
  useEffect(() => {
    if (!pulse || typeof pulse.lat !== 'number') return;
    const ring = { lat: pulse.lat, lng: pulse.lng, r: 6, repeat: 0 };
    pulses.current = [...pulses.current, ring];
    applyRings();
    const t = setTimeout(() => { pulses.current = pulses.current.filter((p) => p !== ring); applyRings(); }, 1500);
    return () => clearTimeout(t);
  }, [pulse, applyRings]);

  useImperativeHandle(ref, () => ({
    flyTo(lat, lng, alt = 1.7) {
      const g = gl.current; if (!g) return;
      g.controls().autoRotate = false;
      g.pointOfView({ lat, lng, altitude: alt }, reduced ? 0 : 900);
    },
    screenOf(lat, lng) {
      const g = gl.current; if (!g) return null;
      const p = g.getScreenCoords(lat, lng, 0.01);
      const r = host.current.getBoundingClientRect();
      return p ? { x: r.left + p.x, y: r.top + p.y } : null;
    },
  }), []);

  return <div ref={host} className="absolute inset-0" />;
});

export default Globe3D;
