# Foxhole product goal

## Intended finished product

Foxhole is a dependable, private world-events dashboard for one person running it on their own computer. It shows what is happening, where it is happening, which tracked markets might be affected, and exactly why a rule produced a WATCH, BUY, or SELL signal. It helps a user investigate events; it does not present a signal as verified financial advice or claim a predictive record it has not earned.

The first screen should answer three questions without setup: **What happened? Where? Why might it matter?** The globe and ranked event list stay in sync. Selecting an event reveals its source, age, location, linked assets, rule explanation, uncertainty, and conditions that would make the signal wrong. Markets, headlines, live layers, and optional TV support that investigation without obscuring it. Desktop and narrow layouts retain the same essential actions.

## Release requirements

1. **Honest data.** Every price, event, status, and signal distinguishes live, stale, unavailable, and demo data. A missing key or failed feed never silently becomes an apparently live value. A quiet live feed does not trigger a demo warning. Every visible event can be traced to its source and timestamp.
2. **Explainable signals.** Rule matching, direction, confidence, time window, and historical hit record are visible and consistent with the backend. Unlinked events may appear as context but never acquire a trade signal. AI is optional and cannot determine asset, direction, confidence, or numerical claims. The UI explains that rules are hypotheses and that a sparse record is inconclusive.
3. **Reliable live view.** The development and production apps receive SSE updates, reconnect after a dropped connection, and bound client memory. Each external source reports its own healthy, delayed, or failed state. Poll failures leave the app usable and do not flood logs or viewers.
4. **Usable visual experience.** At desktop, 1050px, and 390px widths, the globe, event list, signal board, markets, and settings remain reachable with no horizontal page overflow. Keyboard access, readable focus states, reduced motion, and useful loading/error/empty states are maintained. The existing visual identity is preserved unless a deliberate design change is approved.
5. **Optional integrations behave truthfully.** Finnhub, TMDB, AISStream, AI, X/news, watchlists, satellites, and TV either work with their documented prerequisites or show a clear unavailable state. TV verification requires actual playback progress with browser CSP enforced; an iframe or video element merely mounting is insufficient. An integration with no reliable availability check must say “unknown.”
6. **Local safety and privacy.** The service binds to loopback by default. Credentials remain out of Git, are never returned in public API responses or logs, and tests cannot overwrite saved user settings. Inputs and external content are validated before use. Running on a public network is outside this release target and requires a separate authentication and deployment design.
7. **Repeatable release.** A clean checkout with documented Node prerequisites can install dependencies and run lint, tests, and build. Browser checks cover demo mode, live or intentionally failed feeds, SSE, responsive layouts, and CSP-enforced TV. Checks report real failures rather than bypassing security policy. Release instructions match the implementation.

## Acceptance evidence

Release is complete only when the requirements above have direct evidence: passing `npm run lint`, `npm test`, and `npm run build`; clean tracked changes; browser checks at the three widths; SSE in development and production; a CSP-enforced TV playback check; missing-key and feed-failure checks; and a review of secret handling and external-data labeling. Live-source availability varies, so a source outage is acceptable only when the app reports it accurately and remains usable.

Keep evidence from the run being assessed. Historical logs, screenshots, and the earlier Phase 10 report show previous behavior, not proof of the current release. Do not enable Playwright `bypassCSP` for the TV gate. Do not run tests against the user's saved `data` directory.

## Current implementation and next work

The existing code already implements the event map, rule engine, signal tracking, feeds, markets, live layers, cinema, topic radar, TV, and optional AI. Commit `260b31d` on `codex/validate-runtime` isolates the AI test, fixes development SSE routing, permits HLS under production CSP, bounds headline state, and aligns the narrow layout and demo banner. This branch is the current continuation base; the original `master` worktree contains line-ending-only changes that must not be discarded casually.

Prioritize the following remaining work, using a separate scoped change for each:

1. Reproduce and diagnose the globe error seen in the CSP-enforced headless browser; distinguish browser/WebGL limitations from an app defect, then fix any app defect.
2. Make browser release checks portable and assert actual SSE updates, TV playback, responsive visibility, and console errors. Existing TV evidence used `bypassCSP` and did not prove every channel played.
3. Verify demo/live/stale labels and source-failure behavior with deterministic fixtures. Check the backend fallback that may choose demo events despite a live auxiliary poller.
4. Review credential storage, Origin checks, custom AI endpoint handling, and exposure when `HOST` is changed. Keep the local release bound to loopback.
5. Reconcile stale diagnostic reports and README claims with current source and test evidence. Preserve historical reports as history rather than treating them as current gates.

For each task, inspect current source first, add focused regression coverage where behavior is at risk, run relevant checks, and record what was verified and what remains uncertain. Do not claim product completion from a green unit suite alone.
