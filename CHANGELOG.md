# Changelog

- 2026-11-08: Round 1 value loop — each signal now carries the real event headline it fired on (eventTitle/eventPlace from server/engine.js, shown as a quoted headline on SignalCard). Why: a signal without the news behind it reads as a formula; attribution is the #1 trust gap from the first-time-user value test.

- 2026-11-08: Cap concurrent SSE clients at 128 (server/index.js, 429 beyond). Defense-in-depth for the unbounded clients Set; behavior unchanged for normal use. Stress B already showed no leak at 25 + reconnect waves.

- 2026-11-08: Persist market history across restarts (server/feeds/markets.js) — last 60 ticks/symbol to cache/markets.json (atomic, throttled 30s, corrupt ignored); MoviesChart no longer starts flat after every reboot. README known-limits updated to match verified behavior (sw==cw at 1280/1050/390; history persisted). Cache dir gitignored. Why: honesty of "history" — a chart that resets each boot misrepresents price moves.
- 2026-11-08: Round 4 value loop — SignalCard now shows a timeline line (Seen Xm ago + live price/move for the asset; demo labelled). Why: explainer timeline from VALUE TEST #5 — users can see when it fired and what the asset did, not just a verdict.
- 2026-11-08: Round 5 value loop — Cinema works without a TMDB key: free Wikipedia 2026-films fallback (status free-fallback, banner labelled, tracking seed kept; TMDB key still unlocks live trending). Why: VALUE TEST #6 — tab was dead without a key.
