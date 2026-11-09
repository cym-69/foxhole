# Foxhole — value-test notes (rewrite 2026-11-08, m00468)

## STEP 1: WHAT THIS IS
- Foxhole is a private loopback world-events dashboard: a 3D globe of live events (quakes, storms, conflicts, military flights, satellites, news) turned into explainable BUY/SELL/WATCH signals for stocks, ETFs, and crypto, with headline feed, cinema, horizon radar, and live TV.

## WHO IT IS FOR
- One private user on their own machine (PRODUCT_GOAL §6). Not multi-user, not public. Value = "what happened in the world and what should I watch/do about it" at a glance.

## GOALS
- One-glance world awareness + honest, explainable signals. Live/stale/demo labels always truthful. No key needed for core view; keys only unlock optional live prices/films.

## TECH
- Node 18+, React 18.3 + Vite 6, Tailwind 4, Express 4.21, globe.gl 2.40 (+three), hls.js, satellite.js, fast-xml-parser 5.12, ws. Tests node assert, eslint --max-warnings=0, Playwright gates tools/release-*.mjs.

## CURRENT STATE (verified live 2026-11-08 23:26)
- Server 127.0.0.1:4180 PID 3252. /api/state: events 2, context 60, signals 9, top 2; markets demo (no Finnhub key), crypto prices live, sats stale cached 182.
- Health: quakes 45 ok, eonet 60 ok, aircraft 77 ok, ships no key, headlines 13/13 ok.
- Release gates green (lint/test/build/release-check 14/14/browser 17/17). Market history now persists (60 ticks). SSE capped at 128.

## STEP 2: VALUE TEST (first-time user)
- THE ONE THING: "Show me what's happening in the world right now and which assets it could move — in 10 seconds."
- DELIVERY: Globe + Best Signals + Events list do deliver it, but thin right now: only 2 events carry signals while 60 sit as 'no link' context; secrets are a math formula with dry text ("Gulf state approves extra drilling"), not a story; prices are demo without a Finnhub key so BUY/SELL numbers feel fake; satellites are stale; ships off.
- WOW FACTOR GAP: competitors (TradingView/ThinkOrSwim-style news+price linkage, FlightRadar24 live density, NASA FIRMS/EONET maps) show dense live visuals + attributed headlines + real prices. Foxhole shows sparse dots, formula text, and demo numbers. "Wow" needs: a real quoted headline per signal, a live price strip that is actually live, denser globe activity (ships/flights/sats), and an explainer that reads like news, not a template.
- REAL FREE SOURCES TO INVESTIGATE: CoinGecko (already live), CelesTrak (retry; may need User-Agent fix), USGS, EONET, adsb.lol (live), GDELT 2.0 (live), Open-Meteo weather (no key) for storm context, OFAC/EU sanctions lists (scrapable), OpenSky (anonymous rate-limited) as backup flights, Stooq CSV prices (no key, delayed) as demo upgrade.
- RANKED (user-facing value first; cleanup only after top 5):
  1. Per-signal attributed headline: attach the actual news headline (GDELT/news) behind each signal so the 'why' reads real. [real data, biggest trust gain]
  2. Make price strip feel real without a key: Stooq delayed free quotes for trad ETFs (labelled 'delayed') + keep CoinGecko live; demo mode only when Stooq fails. [real data]
  3. Fix satellite staleness + show satellite count/orbit status on map; retry CelesTrak with proper headers. [real data/vis]
  4. Densify globe: surface aircraft count, show context dots bigger, add weather overlay toggle (Open-Meteo alerts) — visual richness. [visual]
  5. Signals explainer timeline: when the event was first seen + what moved next (price pct since). [useful]
  6. Cinema tab without TMDB key: free fallback (Wikipedia box-office / public lists) properly labelled. [feature]
  7. Ships without key: label + free fallback via MarineTraffic-free alternatives (likely skip if none). [feature]
  8. Only then: perf/cleanup, README polish.

## DECISIONS
- See CHANGELOG.md. No paid keys. Prefer free sources; label delayed/demo honestly.
