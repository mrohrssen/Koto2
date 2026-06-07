# Dev iOS Combat Network Benchmark Report

Date: 2026-06-07
Generated At: 2026-06-07T08:50:49.211Z
App Mode: Dev iOS combat flow
Network Harness: mitmproxy

## Executive Summary

This benchmark captured the Koto Dev iOS combat route on the iPhone 17 Pro simulator through mitmproxy profiles for baseline, broad slow network, unreliable network, and targeted combat API delay. Combat was reached in all completed profiles after switching to `serve-sim` for simulator interaction and using disposable dev benchmark account `s-bench0607a`.

The largest player-visible risk is not the raw combat API request time by itself. The slow, unreliable, and combat-API-slow profiles all logged long combat result/verification intervals after successful requests, with max turn totals from 42.3s to 91.5s while the measured combat API request stayed around 1.4s to 1.8s. Broad slow/unreliable profiles also show startup and asset/media cost, especially `battle.mp3` and the main JS bundle.

## Setup

- App mode: Dev iOS combat flow
- Network harness: mitmproxy
- Profiles: `baseline-dev-ios`, `slow-dev-ios`, `unreliable-dev-ios`, `combat-api-slow-dev-ios`
- Inputs: per-profile `flows.jsonl` request captures and `app.log` timing logs
- Simulator: iPhone 17 Pro, iOS 26.5, UDID `EDD2A528-2C7A-4B2B-9791-82403B2D7599`
- Native bundle: `com.koto.app.dev`
- Dev origin: `https://jrpg-dev.up.railway.app`
- Interaction: `serve-sim` browser mirror for WebView input, after Xcode accessibility snapshots did not expose WebView login controls
- Account: disposable dev benchmark account `s-bench0607a` / `test1234`; the documented `devtester` login was not accepted by the deployed dev app during this run
- Proxy cleanup: HTTP and HTTPS Wi-Fi proxy states were restored to `Enabled: No` after each profile

## Ranked Findings

1. Combat result verification dominates the delayed-combat experience.

   Evidence: `combat-api-slow-dev-ios` recorded `/api/game/creature-combat-cycle` at 1403ms in mitm and 1412ms in the app log, but the combat timing log reports `totalMs: 91499` with `outcome: "awaiting_verification"`. `slow-dev-ios` shows the same pattern with a 1198ms combat-cycle API log and `totalMs: 58850`. `unreliable-dev-ios` completed a combat-cycle request at 1767ms and still logged `totalMs: 42264`. The request and turn-total figures come from app logs and flow captures, so the issue to investigate is the post-result verification/turn-completion path rather than only server response latency.

   Recommended owner area: combat UI state machine and verification polling. Add timing spans around result-card display, tap-to-continue handling, verification fetches, and turn queue draining so a future run can identify where the extra 42s to 91s is spent.

2. Asset and media startup cost remains visible even outside targeted API delay.

   Evidence: baseline's slowest request was `/assets/audio/bgm/battle.mp3` at 2198ms and the main JS bundle reached 1115ms. Under `slow-dev-ios`, `battle.mp3` reached 2460ms, the main JS bundle reached 2330ms, CSS reached 1712ms, and the document request reached 1631ms. Under `unreliable-dev-ios`, `battle.mp3` reached 2699ms and the main JS bundle reached 1979ms.

   Recommended owner area: startup asset policy. Prioritize combat shell interactivity before audio and non-critical chunks, prewarm the battle assets before route transition where possible, and add a clear loading state for incomplete battle-stage assets.

3. The benchmark saw degraded route/session continuity without request failures.

   Evidence: all completed profiles have `failureCount: 0`, but `unreliable-dev-ios` relaunched to the login screen and required logging back in before returning to room 3 combat. The route notes cannot prove whether this was cookie/session expiry, WebView storage behavior, or app restart state recovery. However, from a player and benchmark perspective, the route was interrupted even though the captured dev-origin requests returned HTTP 200.

   Recommended owner area: session recovery instrumentation. Log auth/session restoration decisions at startup, include route/phase restoration in app logs, and make the logged-out state distinguish expired auth from missing local state.

4. Rest-card behavior was inconsistent across captures and needs better instrumentation before ranking as a bug.

   Evidence: `slow-dev-ios` logged Rest-targeted clicks without a following combat API timing entry until Strike was tapped. `combat-api-slow-dev-ios` logged a later Rest-targeted click without a following API timing entry before capture ended. In contrast, `unreliable-dev-ios` logged a Rest-targeted click followed by a successful `/api/game/creature-combat-cycle` timing entry. Because the interaction was coordinate-driven through the simulator mirror, this report treats Rest as an instrumentation gap rather than a confirmed product defect.

   Recommended owner area: input diagnostics. Log move id, active actor id, enabled/disabled reason, and whether the click is ignored or starts a combat-cycle request.

## Evidence Limits

- The baseline directory includes the original blocked login screenshot plus later completed combat screenshots; route notes distinguish those phases.
- `combat-api-slow-dev-ios` intentionally captured only targeted API flows, so it is not comparable to broad profiles for asset or document timing.
- The mitm console saw host-level TLS noise while the macOS Wi-Fi proxy was enabled. The persisted JSONL files are the filtered dev-origin benchmark artifacts used for this report.

## Profile: baseline-dev-ios

Requests: 29
Failures: 0

### Category Summary

| Category | Requests | Failures | p50 ms | p95 ms | max ms |
| --- | ---: | ---: | ---: | ---: | ---: |
| audio | 2 | 0 | 452 | 2198 | 2198 |
| javascript | 8 | 0 | 434 | 1115 | 1115 |
| api | 10 | 0 | 445 | 751 | 751 |
| image | 2 | 0 | 734 | 740 | 740 |
| css | 1 | 0 | 728 | 728 | 728 |
| other | 4 | 0 | 435 | 598 | 598 |
| tts | 1 | 0 | 515 | 515 | 515 |
| document | 1 | 0 | 448 | 448 | 448 |

### Slowest Requests

| Method | Path | Category | Status | Duration ms | Injected delay ms | Injected failure |
| --- | --- | --- | ---: | ---: | ---: | --- |
| GET | /assets/audio/bgm/battle.mp3 | audio | 206 | 2198 | 0 | No |
| GET | /assets/index-BCbeSRFF.js | javascript | 200 | 1115 | 0 | No |
| POST | /api/game/creature-combat-cycle | api | 200 | 751 | 0 | No |
| GET | /assets/sprites/creatures/neko.webp | image | 200 | 740 | 0 | No |
| GET | /assets/sprites/creatures/hi.webp | image | 200 | 734 | 0 | No |
| GET | /assets/index-XqpBecgY.css | css | 200 | 728 | 0 | No |
| GET | /assets/sprites/npcs-animated/manifest.json | other | 200 | 598 | 0 | No |
| POST | /api/game/befriend-conversation | api | 200 | 583 | 0 | No |
| POST | /api/tts/synthesize | tts | 200 | 515 | 0 | No |
| GET | /api/settings | api | 200 | 476 | 0 | No |

### App Timing Log Counts

- API timing logs: 3
- Combat timing logs: 1
- Connection logs: 0

### Combat Timing Summary

| Requests | Turns | Server logs | Failed turns | Max request ms | Max turn total ms | Max server total ms | Max server resolve ms | Max server save ms | Outcomes |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| 1 | 0 | 0 | 0 | 768 | 0 | 0 | 0 | 0 | - |

### Delay Buckets

| Bucket | Count | max ms |
| --- | ---: | ---: |
| network_request | 2 | 751 |
| server_resolve_save | 0 | 0 |
| verification_gap | 0 | 768 |
| asset_chunk_media | 13 | 2198 |
| recovery_fetch | 0 | 0 |
| ui_control_gap | 0 | 0 |
| unknown | 0 | 0 |

## Profile: combat-api-slow-dev-ios

Requests: 2
Failures: 0

### Category Summary

| Category | Requests | Failures | p50 ms | p95 ms | max ms |
| --- | ---: | ---: | ---: | ---: | ---: |
| api | 2 | 0 | 1403 | 1443 | 1443 |

### Slowest Requests

| Method | Path | Category | Status | Duration ms | Injected delay ms | Injected failure |
| --- | --- | --- | ---: | ---: | ---: | --- |
| GET | /api/game/state | api | 200 | 1443 | 1013 | No |
| POST | /api/game/creature-combat-cycle | api | 200 | 1403 | 970 | No |

### App Timing Log Counts

- API timing logs: 3
- Combat timing logs: 1
- Connection logs: 0

### Combat Timing Summary

| Requests | Turns | Server logs | Failed turns | Max request ms | Max turn total ms | Max server total ms | Max server resolve ms | Max server save ms | Outcomes |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| 0 | 1 | 0 | 0 | 0 | 91499 | 0 | 0 | 0 | awaiting_verification: 1 |

### Delay Buckets

| Bucket | Count | max ms |
| --- | ---: | ---: |
| network_request | 2 | 1443 |
| server_resolve_save | 0 | 0 |
| verification_gap | 1 | 0 |
| asset_chunk_media | 0 | 0 |
| recovery_fetch | 0 | 0 |
| ui_control_gap | 0 | 0 |
| unknown | 0 | 0 |

## Profile: slow-dev-ios

Requests: 35
Failures: 0

### Category Summary

| Category | Requests | Failures | p50 ms | p95 ms | max ms |
| --- | ---: | ---: | ---: | ---: | ---: |
| audio | 2 | 0 | 1275 | 2460 | 2460 |
| javascript | 8 | 0 | 1217 | 2330 | 2330 |
| image | 2 | 0 | 1227 | 1808 | 1808 |
| css | 1 | 0 | 1712 | 1712 | 1712 |
| document | 1 | 0 | 1631 | 1631 | 1631 |
| api | 14 | 0 | 1192 | 1570 | 1570 |
| other | 3 | 0 | 1316 | 1419 | 1419 |
| tts | 4 | 0 | 1226 | 1383 | 1383 |

### Slowest Requests

| Method | Path | Category | Status | Duration ms | Injected delay ms | Injected failure |
| --- | --- | --- | ---: | ---: | ---: | --- |
| GET | /assets/audio/bgm/battle.mp3 | audio | 206 | 2460 | 602 | No |
| GET | /assets/index-BCbeSRFF.js | javascript | 200 | 2330 | 971 | No |
| GET | /assets/sprites/creatures/sakana.webp | image | 200 | 1808 | 921 | No |
| GET | /assets/index-XqpBecgY.css | css | 200 | 1712 | 966 | No |
| GET | / | document | 200 | 1631 | 947 | No |
| POST | /api/game/known-words/expose | api | 200 | 1570 | 967 | No |
| POST | /api/game/known-words/expose | api | 200 | 1477 | 882 | No |
| GET | /assets/asset-manifest.json | other | 200 | 1419 | 842 | No |
| POST | /api/game/known-words/expose | api | 200 | 1417 | 978 | No |
| GET | /assets/index-Cdj8CJ8R.js | javascript | 200 | 1394 | 971 | No |

### App Timing Log Counts

- API timing logs: 4
- Combat timing logs: 1
- Connection logs: 0

### Combat Timing Summary

| Requests | Turns | Server logs | Failed turns | Max request ms | Max turn total ms | Max server total ms | Max server resolve ms | Max server save ms | Outcomes |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| 0 | 1 | 0 | 0 | 1 | 58850 | 0 | 0 | 0 | awaiting_verification: 1 |

### Delay Buckets

| Bucket | Count | max ms |
| --- | ---: | ---: |
| network_request | 3 | 1344 |
| server_resolve_save | 0 | 0 |
| verification_gap | 1 | 1 |
| asset_chunk_media | 16 | 2460 |
| recovery_fetch | 0 | 0 |
| ui_control_gap | 0 | 0 |
| unknown | 0 | 0 |

## Profile: unreliable-dev-ios

Requests: 32
Failures: 0

### Category Summary

| Category | Requests | Failures | p50 ms | p95 ms | max ms |
| --- | ---: | ---: | ---: | ---: | ---: |
| audio | 2 | 0 | 1445 | 2699 | 2699 |
| tts | 4 | 0 | 1213 | 2134 | 2134 |
| api | 13 | 0 | 1396 | 1996 | 1996 |
| javascript | 8 | 0 | 1523 | 1979 | 1979 |
| document | 1 | 0 | 1932 | 1932 | 1932 |
| css | 1 | 0 | 1449 | 1449 | 1449 |
| other | 3 | 0 | 1180 | 1397 | 1397 |

### Slowest Requests

| Method | Path | Category | Status | Duration ms | Injected delay ms | Injected failure |
| --- | --- | --- | ---: | ---: | ---: | --- |
| GET | /assets/audio/bgm/battle.mp3 | audio | 206 | 2699 | 703 | No |
| POST | /api/tts/synthesize | tts | 200 | 2134 | 1401 | No |
| GET | /api/settings | api | 200 | 1996 | 1416 | No |
| GET | /assets/index-BCbeSRFF.js | javascript | 200 | 1979 | 1179 | No |
| GET | /assets/index-Cdj8CJ8R.js | javascript | 200 | 1941 | 1361 | No |
| GET | / | document | 200 | 1932 | 1316 | No |
| GET | /assets/index-BhJAVE5U.js | javascript | 200 | 1900 | 1324 | No |
| POST | /api/game/known-words/expose | api | 200 | 1885 | 1329 | No |
| GET | /api/auth/me | api | 200 | 1829 | 1087 | No |
| POST | /api/game/known-words/expose | api | 200 | 1814 | 1038 | No |

### App Timing Log Counts

- API timing logs: 3
- Combat timing logs: 1
- Connection logs: 0

### Combat Timing Summary

| Requests | Turns | Server logs | Failed turns | Max request ms | Max turn total ms | Max server total ms | Max server resolve ms | Max server save ms | Outcomes |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| 0 | 1 | 0 | 0 | 0 | 42264 | 0 | 0 | 0 | awaiting_verification: 1 |

### Delay Buckets

| Bucket | Count | max ms |
| --- | ---: | ---: |
| network_request | 3 | 1762 |
| server_resolve_save | 0 | 0 |
| verification_gap | 1 | 0 |
| asset_chunk_media | 14 | 2699 |
| recovery_fetch | 0 | 0 |
| ui_control_gap | 0 | 0 |
| unknown | 0 | 0 |

## Profile Delay Anchor

| Profile | p95 API ms | p95 TTS ms | p95 asset pain ms | Worst visible symptom |
| --- | ---: | ---: | ---: | --- |
| baseline-dev-ios | 751 | 515 | 2198 | 1 combat timing log(s) |
| combat-api-slow-dev-ios | 1443 | 0 | 0 | 1 combat timing log(s) |
| slow-dev-ios | 1570 | 1383 | 2460 | 1 combat timing log(s) |
| unreliable-dev-ios | 1996 | 2134 | 2699 | 1 combat timing log(s) |

## Recommended Fix Themes

- Instrument the combat turn lifecycle with separate spans for request dispatch, response parse, result-card render, player continue input, verification fetch, and next actor selection.
- Treat battle audio and large JS chunks as non-blocking where possible; combat route should show an explicit loading state if the stage is waiting for assets.
- Add startup session restoration logs that identify auth state, persisted route phase, and recovery decision.
- Add move-card ignored-click diagnostics, especially for Rest, including active actor, disabled reason, MP delta eligibility, and whether a combat-cycle request was attempted.
- Keep future iOS benchmark runs on a scoped proxy path where possible. The current host Wi-Fi proxy works, but it routes unrelated host app traffic through mitm while active.

## Raw Artifacts

- Run summary: `summary.json`
- baseline-dev-ios: `summary.json`
- baseline-dev-ios: `flows.jsonl`
- baseline-dev-ios: `app.log`
- baseline-dev-ios: `route-notes.md`
- baseline-dev-ios: `screenshots/00-start.png` through `screenshots/05-after-talk.png`
- combat-api-slow-dev-ios: `summary.json`
- combat-api-slow-dev-ios: `flows.jsonl`
- combat-api-slow-dev-ios: `app.log`
- combat-api-slow-dev-ios: `route-notes.md`
- combat-api-slow-dev-ios: `screenshots/00-start.png` through `screenshots/06-after-rest-later.png`
- slow-dev-ios: `summary.json`
- slow-dev-ios: `flows.jsonl`
- slow-dev-ios: `app.log`
- slow-dev-ios: `route-notes.md`
- slow-dev-ios: `screenshots/00-start.png` through `screenshots/09-after-second-target.png`
- unreliable-dev-ios: `summary.json`
- unreliable-dev-ios: `flows.jsonl`
- unreliable-dev-ios: `app.log`
- unreliable-dev-ios: `route-notes.md`
- unreliable-dev-ios: `screenshots/00-start.png` through `screenshots/05-after-rest.png`
