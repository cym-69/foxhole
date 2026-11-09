## Round 12: evidence-count confidence honesty — confidence now scales with independent linked-event evidence (High only at >=3 recent linked events; WATCH band computed from actual context siblings/sources), signals carry evidenceCount + evidenceLabel rendered in BestSignals/SignalCard/Chain.

# Changelog

- Round 11 value loop — momentum/density from GDELT history: per-asset momentum score + 24-bucket 6h volume spark (tone+mentions, honest 6h label, empty upstream shows No GDELT history upstream). Why: reviewer gap — TimelineVol/momentum route not exposing real history; now every asset shows real momentum density.

- Round 10d fix - compact rail now selects TAGGED headlines (filter tags/tickers>0, take 5 from last 30, fallback all): pre-fix slice(-5) landed on untagged Guardian/NPR tail (before: 390 chipsTotal=1 proofo: GLD only, api tail5 all empty). After: 390 chipsTotal=14 visible 14, sw==cw==390; 480 tickerVisible true; 1280 chips 11 visible. Live /api/state: 13 headlines, 5 tagged (Saudis/Sudan USO-STNG-ITA, aircraft ITA-GLD, M5.7/M6.4 USO-STNG-ITA) vs tail5 tickers all []. Ticker >=480 kept (hidden min-[480px]:inline-flex).

- Round 10c fix - reviewer FAIL: compact rail now unconditional on narrow ({!wide}, no mapLayers gate) and ticker uses hidden min-[480px]:inline-flex (was max-sm:hidden = 640px Tailwind sm, invisible at 480). Headless verify (no clicks): 390px chipsTotal 14 visible 14, hasCompactRail true, sw==cw==390; 480px tickerVisible true; 1280px tickerVisible true, 11 chips visible.

- Round 10b fix - mobile ticker chips: LiveTicker now shows on sm+ (was max-md:hidden), plus a compact FeedStream chip rail below 480px fed directly from /api/state headlines so chips render at 390px (390 verified: 12 visible chips, sw==cw==390). Original round10 screenshots untouched; mobile proof in round10b-before/after.png.

- Round 10 value loop - news ticker now tags headlines with asset chips (USO/STNG/ITA/GLD/JETS, keyword-linked, honest) so every headline answers which assets it could move. Why: reviewer gap - news was text-only while the question is assets.

- Round 9 value loop — rules brief: no-AI two-sentence synthesis from live top events/signals/chokepoints (src rules, honest label); AI key still deepens. Why: reviewer gap #3 — core question 'what matters now' went unanswered without a key.

- 2026-11-08: Round 8 value loop — Chokepoints show events-in-box + aircraft (honest activity, not all-zero). Why: reviewer gap #4 — strip read all-zero live even where context events were firing; now each box counts context events in its widened box (topEvent title shown) alongside aircraft/AIS ships, with emerald highlight when events>0. Zeros remain truthful when no in-box activity.

- 2026-11-08: Round 7 value loop — multi-event surface: top 3 linked events in Best Signals (was 1), top 4 unlinked context events now emit WATCH-level multi-event signals (conf 0.2-0.3, ruleId multi-event, honest 'no direct rule fired'), per-asset tails so 4 cards no longer share identical why text. Why: reviewer gaps — single-story surface with 58 context events never signaling, and templated boilerplate across assets. Value: every top event on the globe now touches assets; user sees 3 stories in 10s + differentiation.

- 2026-11-08: Round 1 value loop — each signal now carries the real event headline it fired on (eventTitle/eventPlace from server/engine.js, shown as a quoted headline on SignalCard). Why: a signal without the news behind it reads as a formula; attribution is the #1 trust gap from the first-time-user value test.

- 2026-11-08: Cap concurrent SSE clients at 128 (server/index.js, 429 beyond). Defense-in-depth for the unbounded clients Set; behavior unchanged for normal use. Stress B already showed no leak at 25 + reconnect waves.

- 2026-11-08: Persist market history across restarts (server/feeds/markets.js) — last 60 ticks/symbol to cache/markets.json (atomic, throttled 30s, corrupt ignored); MoviesChart no longer starts flat after every reboot. README known-limits updated to match verified behavior (sw==cw at 1280/1050/390; history persisted). Cache dir gitignored. Why: honesty of "history" — a chart that resets each boot misrepresents price moves.
- 2026-11-08: Round 4 value loop — SignalCard now shows a timeline line (Seen Xm ago + live price/move for the asset; demo labelled). Why: explainer timeline from VALUE TEST #5 — users can see when it fired and what the asset did, not just a verdict.
- 2026-11-08: Round 6 value loop — Chokepoints strip under Best Signals: 6 boxes with live aircraft counts when no AIS key (status ships 'no key' stays honest), AIS ship counts when key present. Why: VALUE TEST #7 — ships were a dead layer without a key. Why it matters: every chokepoint now shows real activity even keyless (counts are 0 when no aircraft are flying there — truthful, not padded).
- 2026-11-08: Round 5 value loop — Cinema works without a TMDB key: free Wikipedia 2026-films fallback (status free-fallback, banner labelled, tracking seed kept; TMDB key still unlocks live trending). Why: VALUE TEST #6 — tab was dead without a key.
