# S1 source audit - 2026-11-09

Probed from this host with plain fetch (User-Agent Foxhole/1.0). Status at probe time; server polls continuously and reports truthfully in /api/health. No fabricated rows.

- USGS earthquakes (earthquake.usgs.gov 2.5_day.geojson): LIVE. 17 features, M4.9 Mid-Indian Ridge; live.js fetchQuakes 60s poll.
- NASA EONET (eonet.gsfc.nasa.gov api/v3/events status=open): LIVE. EONET_26057 Wild River NH; fetchEonet 300s poll.
- adsb.lol military (api.adsb.lol/v2/mil): LIVE. PAT060 lat 46.97 lon -122.60; fetchAircraft 15s poll.
- GDELT events (api.gdeltproject.org via gdelt.js): FAILED this probe, fetch timeout 10.6s. Unproven live; collect() excludes when ok=false; error surfaced.
- CoinGecko crypto (api.coingecko.com simple/price): LIVE. HTTP 200 BTC 74983 USD.
- cryptocurrency.cv (cryptocurrency.cv/api/news): FAILED 403 REPEAT_RATE_LIMIT_ABUSE retryAfter 3516 (~58min). Surfaced in health; not zero-filled.
- RSS BBC etc (feeds.bbci.co.uk RSS): LIVE. HTTP 200 channel/item XML; headlines.js parses RSS/Atom/HN.
- HN Algolia (hn.algolia.com search_by_date): LIVE. HTTP 200 hits JSON; parseHnJson.
- arXiv (export.arxiv.org api/query): LIVE. HTTP 200 Atom entries.
- CelesTrak (celestrak.org gp.php FORMAT=json): FAILED, cached stale = honest. Timeout 10.5s; sats.js readCache serves last TLE labeled stale.
- AISStream ships (wss stream.aisstream.io): NO-KEY. Landing 200 is not a feed; live.ships.status no key.
- Finnhub (finnhub.io api/v1/quote): NO-KEY. HTTP 401 Please use an API key.
- TMDB (themoviedb.org trending): NO-KEY free-fallback. HTTP 401 Invalid API key; Wikipedia thumbs labeled.
- NWS NEW (api.weather.gov alerts/active status=actual point=lat,lng): LIVE. HTTP 200 features [] NYC honest empty. nws.js watch points NYC 40.7128,-74.006 Houston 29.76,-95.37 LA 34.05,-118.24 Chicago 41.88,-87.63; UA Foxhole/1.0 Accept geo+json; severity sizes 1/0.85/0.65/0.45/0.3; 180s poll live.nws in /api/health.

## S1 deliverables
- server/feeds/nws.js adapter (4 points).
- server/feeds/stream.js normalizeEvent, dedupeEvents cap 300 ts desc, freshnessOf fresh 24h / stale 72h, buildStream.
- GET /api/events/stream rows {id,kind,title,place,lat,lng,ts,source,url,fresh,provider}.
- Tests server/test-nws.js + server/test-stream.js (no network).

GDELT unproven, cryptocv rate-limited, CelesTrak stale, AISStream/Finnhub/TMDB no key. No fabricated data.
