# Foxhole

A live world-events map linked to stocks, commodities and crypto, with plain-language signals.

## Run it (Node 18 or newer)

```
npm install
npm start
```

Open http://localhost:4180

- Try it with fake data first: `npm run demo`
- Change the code and see it live: `npm run dev`, then open http://localhost:5173
- Rebuild the screen after changes: `npm run build`
- Check the signal logic: `npm test`
- Check the code style: `npm run lint`

## First run

A setup window opens. Do two things in it:

1. **Connect an AI** (optional but recommended). Pick Gemini, OpenRouter or Groq for a free one. Or point it at a local model or your own agent (Hermes, Kilo, Paseo, any OpenAI-style endpoint).
2. **Paste a free Finnhub key** for live stock and commodity prices. Without it, prices are demo values.

Anything not live is marked "demo" in the top bar.

## Where the data comes from

| Part | Source | Key |
|---|---|---|
| Earthquakes | USGS | none |
| Fires, storms, volcanoes, floods, drought | NASA EONET | none |
| Conflict, blockade, sanctions with locations | GDELT raw 15-minute event files | none |
| Crypto events and sentiment | cryptocurrency.cv | none |
| Stocks and commodity ETFs | Finnhub (what OpenStock uses) | free key |
| Crypto prices and 24h volume | CoinGecko | none |
| Flights | adsb.lol | none |
| Ships | AISStream WebSocket | free key (`AISSTREAM_API_KEY`) — ships layer stays off without it |
| Satellites | CelesTrak TLE | none |
| Movies / TV trending | TMDB | free key (`TMDB_API_KEY`) — the Cinema tab shows a setup hint without it |
| X / Twitter | Nitter RSS + Google News fallback | none |
| Live streams checklist | Kick / YouTube / Rumble / Twitch web endpoints | none (YouTube, Rumble and Twitch report "unknown" — only Kick is polled) |
| Horizon radar (keyword profiles) | GDELT + RSS merged locally | none |

God's Eye View shows flights, ships, satellites and quakes. It is a viewer, not an events feed, so Foxhole does not read from it.
Commodities use ETFs (USO for oil, GLD for gold, and so on) because free price APIs do not carry futures.

## Signal Board — the four tabs

The left rail has four tabs:

- **Signals** — kanban board of rule matches (WATCH / BUY / SELL), draggable between columns.
- **Cinema** — TMDB trending / now-playing / airing-today, plus a personal "what I'm tracking" list kept in `server/config/cinema-tracking.json`.
- **Horizon** — radar profiles (War, Markets, Tech, Cinema, Crypto) that score headlines against keyword lists with fuzzy dedup.
- **Live** / **X** — stream-watchlist status and the X/news feed.

## Markets chart

`server/feeds/markets.js` accumulates `hist[]` (last 60 prices) per symbol.
The first price seen at server start is stored as `prefill` — the chart hides the
flat prefill run so the line starts at real movement, keeping the prefill as the
x=0 anchor. No synthetic series is drawn.

## How a signal is made (no AI needed)

1. Every event gets a type, a place, a size, and a source count.
2. `server/rules.js` is a plain table: event type + region + size gives assets, direction, and time window.
3. Confidence = rule trust x event size x source count x freshness x the rule's own track record.
4. An event with no matching rule is dropped. No asset link, no dot.
5. Every BUY or SELL is logged with the live price. When its window ends, Foxhole checks if the price moved the predicted way (0.25% or more). That becomes the rule's record.
6. A rule with 10+ results and a hit rate under 40% switches itself off. A rule with a good record gets more trust.
7. If an AI is connected it only rewords the "Why" line. It is blocked from adding numbers.

The starting rules are educated guesses. The track record is what tells you which ones work. Give it a few weeks of live prices before you trust any of them.

## Add or change a rule

Open `server/rules.js`, copy a block, edit it. No other file needs to change.

## Your keys

Stored only on your machine in the `data` folder. The server listens on 127.0.0.1 only.

## Known limits

- Live-price history starts flat: `hist[]` begins at server start, so the Markets chart shows "history building" until enough ticks accumulate. The prefill point is hidden from the line but kept as the anchor.
- GDELT events are grouped into half-degree map cells. Two reports on opposite sides of a cell edge can be counted as two smaller events. Event size comes from how many articles mention it, so big stories rank higher.
- The board is desktop-first (`min-width: 1100px`); narrower screens stack the globe above the kanban.
- cryptocurrency.cv can 403 with rate-limit abuse when polled too hard — the Events chip shows the detail on hover.
- Signals require a live rule match. A quiet news day genuinely produces "No signals yet".
