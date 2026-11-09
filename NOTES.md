# Foxhole — audit notes

## 1. What this project is (read from README/PRODUCT_GOAL/package)
- A loopback-only live world-events map (globe + ranked event list) linked to stocks/commodities/crypto via explainable rule-based signals, with headlines, flight/ship/satellite layers, cinema, horizon radar, and TV. No AI needed for core signals; AI optional rewording only.

## 2. Who it is for
- One private user running it on their own computer. Not multi-user, not public-network (PRODUCT_GOAL §6: loopback by default, local safety outside public deployment).

## 3. Goals (from PRODUCT_GOAL)
- Honest live/stale/demo labels; explainable signals (rule + confidence + record visible); reliable SSE live view; usable at 1280/1050/390 with no horizontal overflow; truthful optional integrations; local secret safety; repeatable release with real browser evidence (no bypassCSP).

## 4. Tech
- Node 18+, React 18.3 + Vite 6, Tailwind 4, Express 4.21, globe.gl 2.40 (+three), hls.js, framer-motion, satellite.js, fast-xml-parser 5.12, ws. Tests: node assert suites (server/test*.js). Lint: eslint --max-warnings=0. Release gates: tools/release-check.mjs + tools/release-browser.mjs (Playwright).

## 5. Current state (at aaae01e, pushed to private allah1maximus/foxhole)
- Release gate green: lint/test/build/audit clean; release-check 14/14; browser 17/17 (overflow/SSE/HLS under CSP); secret-review PASS. Server on 127.0.0.1:4180. Stress A+B green (rate-limit 429s are by design, no 5xx, no SSE leak). Untracked: NOTES.md, RELEASE-HANDOFF.md, STRESS-PLAN.md, tools/stress-ab.mjs.

## Audit (STEP 2) — ranked improvements
1. Market history starts flat at every boot (HIST capped in-memory, prefill hidden but chart still builds up from zero; server/index.js owns /api/state). Persist last 60 points per symbol to disk (append-only, atomic write throttled) so the Markets chart has real history across restarts. High impact: PRODUCT_GOAL honesty about history; removes the biggest UX discontinuity.
2. README known-limits still cites the old min-width story (body 1017px at 390px). Current verified state is sw==cw at 1280/1050/390. Fix docs so the release gate and the docs agree. Low risk, real confusion removal.
3. analyze() is O(events x rules) with per-event stats recompute; fine at current scale (45 quakes + 60 EONET + GDELT) but the impact sort + bestPerEvent filter is O(n^2) on signals. Micro-opt only if evidence (stress C/D) shows /api/state p99 > 50ms at blowout sizes; otherwise leave.
4. Ships layer needs AIS key (status no key) — UI already honest; adding a demo/fallback would violate honesty. No action.
5. Tech stack vs web: Vite 6 / React 18 / Express 4.21 are current; package audit 0 vulns. No switch justified.
6. SSE clients Set is unbounded; stress B showed no leak at 25 + reconnect waves. Add a cap + 429 at >128 concurrent clients for defense in depth only if cheap and behavior-preserving.

## Decisions
- See CHANGELOG.md entries. No dependencies added.

## Final re-audit (2026-11-08)
- #1 market history persistence: SHIPPED (db7ddb4). Verified: 13 symbols persist round-trip, reload restores hist; tests/lint/build green.
- #2 stale README min-width note: FIXED in same commit (sw==cw at 1280/1050/390, cache/ gitignored).
- #6 SSE unbounded clients Set: SHIPPED ee5a1d2 (cap 128, 429 beyond), tests green.
- #3 analyze() micro-opt: skipped — /api/state p99 463ms under burst is rate-limiter, not engine; no evidence for rewrite.
- #4/#5: no action (honesty constraints; stack current, 0 vulns).
- Remaining: ships/TMDB/AI need user keys (by design); stress C-G (poller churn, state blowout, 30-min soak) still future work. Top items are now minor: stop condition met.
