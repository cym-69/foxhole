# P3 live-feed verification — 2026-11-05

Server: `node server/index.js` on `127.0.0.1:4180`, warmed ~28s. Samples: `/api/state`, `/api/sats`, `/stream` headers. No demo code changes made (verification only).

## Verdicts

| Feed / area | Verdict | Evidence |
|---|---|---|
| Lint + tests | PASS | `npm run lint` exit 0; `npm test` exit 0 — `all AI tests passed`, `all GDELT tests passed` |
| USGS quakes | PASS | `status.events.detail`: "Earthquakes (USGS): ok"; context includes `usgs:us7000tw8r` M6.1 Fiji |
| NASA EONET | PASS | "Natural events (NASA): ok"; `eonet:EONET_25728` Super Typhoon In-fa in context |
| cryptocurrency.cv | PASS | "Crypto news (cryptocurrency.cv): ok" |
| GDELT backfill | PASS | "Conflict and policy (GDELT events): ok"; 14 `gdelt:` context events, sources 3–12 (Yemen 12, Beijing 4, Paris 5, Amman top event 20). Live within ~25s backfill race |
| Markets (Finnhub) | PASS | `status.markets.mode: live`; SPY `$735.78 -4.05%`, `demo: false`; `keys.finnhub: true` (.env key present, untracked) |
| Crypto prices | PASS | `status.crypto.prices.mode: live`; BTC `$76,160 -5.22% vol $40.0B`, `demo: false` |
| Crypto sentiment | PASS | `status.crypto.sentiment: live`; BTC `label: neutral score: 0` |
| Sats TLE (CelesTrak) | PASS | `/api/sats` → array of 150 `{name,line1,line2}` (ISS (ZARYA), POISK, CSS (TIANHE)…). No Molniya by name filter, but 150-set cache live |
| Signal engine | PASS | 3 top events, 14 signals; actions {BUY, SELL, WATCH}, levels {High, Medium, Low}; lead signal `gulf-conflict:USO BUY conf 0.605 High`, `why`/`wrongIf`/`cryptoLink`/`record {n:16,hits:12}` present; `data/track.json` shows open + closed tracks with hit/miss scoring |
| Demo→live ladder | PASS | All four `status` modes `live`, `demo: false` on trad/crypto, `mode: live` events — loop leaves demo only when `liveSources === 0` or `--demo` |
| AI layer | DEGRADED (expected) | `ai.connected: false, hasKey: false, paused: false, lastError: ""` — no AI provider configured; UI path intact (`ai.publicInfo()` shape) |
| Ships AIS | DEGRADED (expected) | No `AISSTREAM_API_KEY` in env; no `/api/ships` REST route (ships flow via WS/SSE fixtures) — matches pre-P3 known gap |
| Aircraft | DEGRADED (expected) | No `/api/aircraft` REST route; `adsb.lol` feeds via SSE fixtures |
| SSE `/stream` | PASS | 200 `text/event-stream`, `Cache-Control: no-cache`; P2 security headers present (`X-Content-Type-Options: nosniff`, `X-Frame-Options: SAMEORIGIN`, `Referrer-Policy: no-referrer`, `COOP: same-origin`, `CSP: default-src 'none'; sandbox`) |
| Security headers on `/api/state` | PASS | Same five headers on API responses |

## Remaining gaps after P3

1. AI layer disconnected by design (no provider key) — fine for offline use.
2. Ships require `AISSTREAM_API_KEY`; aircraft require live adsb.lol reachability — both degrade gracefully.
3. `data/track.json` carries historical test injections (`test:*` keys) alongside real GDELT tracks — cosmetic, consider pruning before public demo.
4. P4: monolithic 2.38 MB bundle (`dist/assets/index-*.js`) — code-split per original P4 plan.
