# Changelog

- 2026-11-08: Cap concurrent SSE clients at 128 (server/index.js, 429 beyond). Defense-in-depth for the unbounded clients Set; behavior unchanged for normal use. Stress B already showed no leak at 25 + reconnect waves.

- 2026-11-08: Persist market history across restarts (server/feeds/markets.js) — last 60 ticks/symbol to cache/markets.json (atomic, throttled 30s, corrupt ignored); MoviesChart no longer starts flat after every reboot. README known-limits updated to match verified behavior (sw==cw at 1280/1050/390; history persisted). Cache dir gitignored. Why: honesty of "history" — a chart that resets each boot misrepresents price moves.
