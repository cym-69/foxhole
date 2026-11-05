# PART A - TEST EXECUTION REPORT
## Tests executed (previous run): server/test.js, server/test-ai.js, server/test-gdelt.js

### PART A1 - Events with no asset link are dropped
- Test: Events with no matching rule are not linked as events but kept in context
- Evidence: 
  - `demo:fire` (California wildfire) has no rule → not in events, present in context, no signals (PASS)
  - `demo:sudan` (Sudan conflict) has no rule → not in events, present in context, no signals (PASS)
- Result: PASS

### PART A2 - Direction checks
- Test: Signals produce correct direction (+1/-1) per rule mapping
- Evidence:
  - demo:hormuz + USO: dir=1 (oil up on Gulf tension) (PASS)
  - demo:hormuz + JETS: dir=-1 (airlines down) (PASS)
  - demo:taiwan + SOXX: dir=-1 (chip stocks down) (PASS)
  - demo:chile + CPER: dir=1 (copper up on quake risk) (PASS)
  - demo:depeg + BTC: dir=-1 (crypto down on depeg) (PASS)
- Result: PASS

### PART A3 - Confidence is bounded, and signals are sorted per event
- Test: All signal confidence values in [0, 0.95]
- Evidence: Loop over all signals confirms conf >= 0 and conf <= 0.95 for every signal; signals sorted by confidence per event (PASS)
- Result: PASS

### PART A4 - Rules respect region and size
- Test: ruleMatches correctly filters by kinds/regions/minSize/minSources/text
- Evidence:
  - chip-quake matches quake in Japan (regions include taiwan/japan/korea via regionsOf(35,139)) with size 0.9 (PASS)
  - chip-quake does NOT match when size < minSize (0.2 < 0.5) (PASS)
  - chip-quake does NOT match when regions empty (PASS)
- Result: PASS

### PART A5 - Old events lose confidence
- Test: Time decay reduces confidence for aged events
- Evidence: demo:hormuz + USO fresh vs aged (ts = now-80h) → aged.conf < fresh.conf (PASS)
- Result: PASS

### PART A6 - A rule with a bad record switches off; a good record raises confidence
- Test: Track record affects rule activation and trust
- Evidence:
  - Bad track record (n=12, hits=3, hit rate 25% < 40%, n>=10) → chip-quake rule paused; no signals from chip-quake (PASS)
  - Good track record (n=20, hits=16, hit rate 80%) → chip-quake signals have higher confidence than baseline (PASS)
- Result: PASS

### ADDITIONAL VALIDATIONS (from test suite, not numbered 1-6 but part of run)
- AI guard: no new numbers allowed (safeReword rejects numeric changes, passes rewording) (PASS)
- Sentiment normalizer handles odd shapes (string labels/case, nested data) (PASS)
- Box rules: M6 quake inside box links to box tickers + ITA/GLD (TSM, SOXX, ITA, GLD); M4 below magnitude floor → context only, no signals; storm in Hormuz box → USO, STNG, ITA, GLD; military cluster → box tickers + ITA/GLD; event outside boxes → context only (PASS)
- AI tests: connection modes (plain/think/parts), rejection cases (stuck thinking, bad model, HTML response), model listing (free models first, reasoning flag, -free suffix, paid detection), key persistence/reuse (PASS)
- GDELT tests: event kind mapping, row filtering (skip crime/country-level/thin), grouping by cell with thresholds, headline extraction, zip decompression (PASS)

Overall: ALL TESTS PASS

# PART B - DIAGNOSTIC TABLES FROM PREVIOUS RUN

## B1. Unit test results summary (server/test.js)
| Test | Status | Evidence |
|---|---|---|
| 1. Unlinked events dropped; kept as context | PASS | demo:fire, demo:sudan → no signals, present in context |
| 2. Direction mapping | PASS | hormuz(USO:+1,JETS:-1), taiwan(SOXX:-1), chile(CPER:+1), depeg(BTC:-1) |
| 3. Confidence bounds & sorting | PASS | conf in [0,0.95] for all signals; sorted per event |
| 4. Region/size filtering (ruleMatches) | PASS | chip-quake matches valid; rejects size<min; rejects empty regions |
| 5. Time decay (old events lose confidence) | PASS | aged < fresh for same event/asset |
| 6. Track record: bad → pause; good → higher conf | PASS | n>=10 hit<40% pauses chip-quake; good record boosts confidence |
| 7. AI guard (no new numbers) | PASS | numeric change rejected (null); rewording allowed |
| 8. Sentiment normalizer robustness | PASS | handles label case and nested shape |
| 9. Box rules (magnitude floor, ITA/GLD extras, cluster support) | PASS | M6→TSM/SOXX/ITA/GLD; M4→context only; storm→USO/STNG/ITA/GLD; cluster→TSM/SOXX/ITA/GLD; outside→context only |

## B2. AI tests (server/test-ai.js)
| Case | Status | Evidence |
|---|---|---|
| Connect: plain/think/parts endpoints | PASS | Successful connections |
| Reject: stuck thinking (no text) | PASS | Throws /thinking|no text/ |
| Reject: bad model (404) | PASS | Throws /model not found/ |
| Reject: HTML response | PASS | Throws /Unexpected reply/ |
| Model list: count, free-first, reasoning flag, -free suffix | PASS | 4 models returned; free models first; thinker:free flagged thinks; step-free free; paid not free |
| Model list: empty list rejected | PASS | Throws /did not return a model list/ |
| Model list: auth failure (401) rejected | PASS | Throws /bad key/ |
| Model list: Anthropic requires key | PASS | Throws /key/ |
| Reuse saved key; change model post-connect | PASS | useSaved works; model updated; hasKey true; listModels with saved key OK |
| Cleanup | PASS | ai.json removed |

## B3. GDELT tests (server/test-gdelt.js)
| Case | Status | Evidence |
|---|---|---|
| Event kind mapping | PASS | 19/191→blockade, 18/183→conflict, 17/172→sanction, 18/186→null |
| Row filtering (parseExport) | PASS | Crime (geoType 3), country centroid (geoType 1), short line, thin (mentions<6/sources<2) excluded → 7 usable |
| Grouping/aggregation | PASS | 7 rows → 4 events; thin cell dropped; Hormuz merged (sources 12); size 0.5-0.7 |
| Headline/slug extraction | PASS | Twitter URLs yield empty slug; path-based URL slugged correctly |
| Layer assignment | PASS | blockade→trade, sanction→policy |
| Timestamp sanity | PASS | Event ts within ~24h of now |
| Engine linkage | PASS | Hormuz→USO (dir+1); Red Sea blockade→ZIM |
| ZIP decompression (deflateRaw) | PASS | unzipFirst reads first file from hand-built zip |

## B4. End-to-end execution (previous run)
| Suite | Output | Result |
|---|---|---|
| server/test.js | "all tests passed (14 events, 45 signals from 16 demo events)\nbox rule tests passed (3 linked, 2 unlinked of 5 synthetic events)" | PASS |
| server/test-ai.js | "all AI tests passed" | PASS |
| server/test-gdelt.js | "all GDELT tests passed" | PASS |

