# Foxhole — Stress Test Plan

Release: codex/validate-runtime @ aaae01e (pushable). Server: node server/index.js @ 127.0.0.1:4180 (FOXHOLE_TEST=1 for hooks).
Reference gates: tools/release-check.mjs (14/14), tools/release-browser.mjs (17/17). Both stay green throughout.

## A. Load — what breaks first (last one wins, record the cliff)
1. Burst HTTP: 200 concurrent /api/state + /api/health. Expect all 200s, no 500s. Record p50/p99.
2. Ramp concurrent /api/state 50 -> 200 -> 500. Find the latency cliff (server is Node + Express, single process).
3. Concurrent /api/sats (182 TLE rows, ~27KB) at 100 rps for 60s. Watch RSS + event-loop lag.
Pass: zero 5xx at ramp step 2; cliff point recorded in evidence/stress-results.md.

## B. SSE fan-out (clients Set, no max)
1. Open 25 /stream clients; verify all receive snapshot + stay open 60s (release-check stays-open check).
2. 50 simultaneous reconnects in a loop (5 waves). Memory leak check: process RSS before/after (clients Set must drain on close).
3. Kill 30 of 50 mid-stream; confirm no orphaned ping intervals (server stays responsive).
Pass: no FD/memory growth after wave drain; no client stuck on stale feed.

## C. Poller churn / upstream abuse
1. Block upstream DNS (or firewall 3rd-party) mid-run: quakes/eonet/feed pollers must degrade to last-good + labelled status, never crash. /api/health must show status/error, never throw.
2. Upstream 429 storms (simulate by pointing Finnhub base at a local stub returning 429): markets.refreshTrad backoff must engage, UI honestly shows stale.
3. Kill 127.0.0.1:4180 mid-poll and restart; GDELT backfill must time out at 25s without blocking boot.
Pass: server never exits; every degrade is labelled in /api/health.

## D. State blowout
1. FOXHOLE_TEST=1: POST /__test/event x500 (varied titles) -> footprint: /api/state payload size, compute() time, memory.
2. POST /__test/feed x500 via the same publish path -> client feed fan-out latency p99.
3. Restart with 500-event state; first render at 1280/1050/390 must stay under 3s FCP and scrollWidth==clientWidth (browser gate).
Pass: compute() < 200ms at 500 events; browser gate still 17/17.

## E. Resilience / chaos
1. Kill server mid-SSE-burst (kill -9). Clients must see error/reconnect, not hang.
2. Flood a malformed POST body to /api/* (oversized JSON, wrong types, missing Content-Type) — 400s, no 500s, no stack leak.
3. Cross-origin POST flood to /api/keys (Origin: evil) -> all 403 'Blocked origin.'; same-origin bad body -> 400 validation.
Pass: zero 500s; zero unhandled rejections in server log.

## F. Browser under load
1. With 500 test events, run release-browser.mjs: 1280/1050/390 console/page errors must stay 0.
2. Throttle CPU 4x (Playwright CDP) at 390px: HUD usable, no horizontal overflow, TV panel opens.
Pass: browser gate 17/17 under 4x CPU.

## G. Soak (30 min)
1. Leave server with 25 SSE clients + normal pollers for 30 min; sample RSS + /api/health every 5 min.
2. Record drift: RSS slope, source statuses, snapshot cadence.
Pass: RSS slope < 5MB/hr; all sources labelled; no restarts needed.

## Deliverable
Write evidence/stress-results.md after each section with: config (clients/rps), observed cliff/numbers, pass/fail. If any section finds a 500 or memory unbounded growth, file it as a release blocker before promoting aaae01e to master.
