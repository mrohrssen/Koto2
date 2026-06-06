# Dev iOS Combat Network Benchmark Design

**Date:** 2026-06-06
**Status:** Approved design
**Scope:** Restore and adapt the old mitmproxy network benchmark for the deployed dev iOS app, focused on combat delays and broken gameplay under poor connections.

## Goal

Identify why deployed dev iOS combat still shows waiting screens, loading screens, or broken interaction under low-speed, high-latency, and laggy connections.

The benchmark should answer:

- Did the player wait because the combat POST was slow?
- Did the player wait because server resolve or save was slow?
- Did optimistic playback finish before verification, leaving a visible gap?
- Did recovery fetches, state reloads, chunk failures, assets, or media become the blocker?
- Did controls stay tappable, disappear, or fail to return after a slow or failed request?

This is diagnostic work only. It should produce repeatable evidence and a ranked report. Gameplay behavior, retry policy, combat mechanics, cache behavior, and UI copy should not be changed in this project.

## Target

The benchmark targets only the deployed dev iOS app path:

- App surface: dev iOS app / Capacitor WKWebView.
- Origin: `https://jrpg-dev.up.railway.app`.
- Excluded: local Vite, local Express, production Railway, and production iOS app.

The benchmark must not touch production accounts or production origin traffic.

## Current Context

An earlier iOS unreliable-network benchmark existed in git history. It used mitmproxy and produced profiles, JSONL flow logs, summary tooling, and a Markdown report. The relevant historical files were:

- `scripts/network-bench/mitm_koto_bench.py`
- `scripts/network_bench/profile_logic.py`
- `scripts/network-bench/profiles/baseline.json`
- `scripts/network-bench/profiles/slow.json`
- `scripts/network-bench/profiles/unreliable.json`
- `scripts/network-bench/summarize-run.mjs`
- `scripts/network-bench/generate-report.mjs`
- `scripts/network-bench/README.md`

The current tree no longer contains that toolkit, but the implementation is recoverable from git history.

Since the old benchmark, combat has gained better timing signals:

- Client request timing logs: `[Combat Timing] request`
- Client turn/playback/verification timing logs: `[Combat Timing] turn`
- Server resolve/save timing logs: `[Combat Timing] server`
- API wrapper timing logs: `[API Timing]`

Those logs make a combat-focused rerun more valuable than the old broad remote-shell route.

## Non-Goals

- Do not fix combat responsiveness in this project.
- Do not modify Japanese text, dialogue frames, dictionary data, or learning content.
- Do not add production telemetry.
- Do not make this a CI gate.
- Do not benchmark production.
- Do not use local Vite or local Express for the primary result.
- Do not leave host or simulator proxy settings enabled after the run.

## Benchmark Strategy

Restore the old mitmproxy toolkit, then retarget it to `jrpg-dev.up.railway.app` and make the report combat-specific.

The benchmark should run the same dev iOS route under multiple network profiles. Each profile records:

- mitmproxy flow JSONL for dev-origin requests
- iOS runtime logs, including API and combat timing lines
- screenshots at key visible states
- a profile summary JSON
- a final Markdown report with ranked findings

The report should correlate network-level evidence with app-visible evidence. A high-confidence finding needs both a slow or failed request and a visible symptom, log timing gap, or screenshot.

## Network Profiles

Use dev-specific profile names and seeds.

### Baseline Dev iOS

No artificial delay or failure. This verifies the route, proxy path, certificate trust, log capture, and report pipeline.

### Slow Dev iOS

Latency and jitter on all dev-origin traffic, no deliberate failures.

Initial shape:

- `baseMs`: 500
- `jitterMs`: 500
- `failure.rate`: 0

This models a sluggish but functioning mobile connection.

### Unreliable Dev iOS

Latency, jitter, and low seeded request failure.

Initial shape:

- `baseMs`: 500
- `jitterMs`: 1000
- `failure.rate`: 0.03

This models a connection that occasionally fails but can usually continue.

### Combat API Slow Dev iOS

Optional focused profile that delays only:

- `/api/game/creature-combat-cycle`
- `/api/game/state`
- `/api/game/kanji-kombat/answer`, if Kanji Kombat combat is included

This isolates combat synchronization and recovery from asset, audio, and chunk noise. If this profile is implemented, the profile logic needs URL path filters in addition to host matching.

## App Route

The route should keep variance low and maximize combat evidence:

1. Cold launch the deployed dev iOS app.
2. Reach a logged-in state using a dedicated dev benchmark account, or the seeded dev tester if the deployed dev environment supports it.
3. Start or resume an exploration run.
4. Reach creature combat through the shortest safe route.
5. Capture a screenshot at combat start.
6. Perform an attack turn.
7. Capture state while the request is pending or while `Syncing turn...` is visible, if it appears.
8. Perform a defend turn.
9. Perform another attack turn.
10. Try to reach a terminal or near-terminal turn when feasible.
11. Capture post-combat, recovery, or stuck state.

If the route cannot naturally reach combat because the current room sequence branches, the benchmark may use an existing dev-safe debug route or setup step only if it is already available and does not alter production. The report must record whether combat was reached naturally or through a debug setup.

## Measurement Model

### Proxy-Level Evidence

Each flow record should include:

- profile name
- timestamp
- method
- URL host and path
- category: document, JavaScript, CSS, image, audio, API, TTS, websocket, other
- injected delay
- injected failure
- status
- total duration
- response size
- error text when available

The mitmproxy addon must continue ignoring non-Koto traffic. Matching should be host-scoped to `jrpg-dev.up.railway.app` by default.

### App-Level Evidence

The runner or manual log capture should collect:

- `[API Timing]` lines
- `[Combat Timing] request` lines
- `[Combat Timing] turn` lines
- `[Combat Timing] server` lines from dev app logs when available
- connection/offline/retry logs
- JavaScript chunk or module import failures
- current game phase at checkpoints when accessible

The summary should parse combat timing objects well enough to distinguish request time, animation/playback time, total turn time, terminal waits, recovery outcomes, and failures.

### User-Visible Evidence

Capture screenshots at:

- first usable app screen
- combat start
- immediately after action tap
- any visible `Syncing turn...`, loading, or disabled-control state
- recovered move-selection state
- victory, defeat, post-combat, or stuck state

Screenshots and raw artifacts go under `output/network-bench/` and must not be committed unless explicitly requested.

## Delay Classification

The report should classify each painful moment into one primary bucket:

- `network_request`: the blocking API call or asset request was slow.
- `server_resolve_save`: server timing shows resolve or save as the main delay.
- `client_playback`: client animations or playback dominate the visible wait.
- `verification_gap`: optimistic playback completed before server verification, leaving dead time.
- `recovery_fetch`: a failed/null/corrected request caused a state reload or recovery wait.
- `asset_chunk_media`: JS chunk, image, audio, or TTS loading blocked progress or startup.
- `ui_control_gap`: controls disappeared, stayed tappable, duplicated actions, or did not return.
- `unknown`: evidence is insufficient.

The report should prefer specific endpoint and log evidence over broad category claims.

## Tooling Design

### Restored Toolkit

Restore the old benchmark structure:

- `scripts/network-bench/profiles/*.json`
- `scripts/network_bench/profile_logic.py`
- `scripts/network-bench/mitm_koto_bench.py`
- `scripts/network-bench/summary-lib.mjs`
- `scripts/network-bench/summarize-run.mjs`
- `scripts/network-bench/generate-report.mjs`
- `scripts/network-bench/README.md`
- Python and Node tests for the pure logic.

The restored version should use the final historical fixes:

- non-Koto traffic is ignored
- matched Koto flows are sequenced deterministically
- injected failures use a text/plain response
- report tooling tolerates missing or partial data

### Dev iOS Retargeting

Profiles should default to `jrpg-dev.up.railway.app`.

The README should document the dev iOS target and explicitly state that production must not be used for this diagnostic.

If app-scoped proxying is available for the current simulator runtime, prefer it over host-level proxy changes. If host-level proxying is required, record original settings and restore them immediately after the run.

### Report Generator

The report generator should produce:

- profile request category tables
- slowest request tables
- app timing log counts
- combat timing summaries
- ranked findings template
- before/after table for future reruns

The final report should be manually reviewed and edited from the generated template so findings are concrete and ranked by user-visible pain.

## Report Output

Create:

```text
docs/reports/YYYY-MM-DD-dev-ios-combat-network-benchmark.md
```

The report should include:

1. Executive summary.
2. Setup: commit SHA, dev iOS app target, simulator, mitmproxy version, profiles, account, route, and run ID.
3. Profile results: baseline, slow, unreliable, and optional combat API slow.
4. Combat timing analysis.
5. Ranked findings with symptom, evidence, likely cause, and confidence.
6. Failure and recovery notes.
7. Duplicate-control and stuck-state notes.
8. Before/after table for future fix validation.
9. Raw artifact paths.

## Testing And Verification

Before live iOS benchmarking:

- Python unit tests for profile loading, matching, deterministic decisions, path filtering, and record shaping.
- Python syntax check for the mitmproxy addon.
- Node unit tests for summary and report helpers.
- Node syntax checks for CLI scripts.
- Fixture-based summary dry run that proves combat timing lines are grouped.

For the live benchmark:

- Confirm `mitmdump --version`.
- Confirm the dev iOS app can launch.
- Confirm the proxy captures non-empty dev-origin flow logs.
- Confirm screenshots are captured for combat states.
- Confirm proxy settings are restored after the run.

The benchmark is complete when the final report ranks the main painful delays and includes enough evidence to decide the next fix project.

## Risks And Mitigations

### Dev iOS Account State May Vary

Use a dedicated dev benchmark account or record the exact dev tester state. If the account cannot reach combat quickly, record that setup blocker and use an existing dev-safe setup route only if available.

### Proxy Setup Can Interfere With The Machine

Prefer app-scoped WKWebView proxy configuration. If host-level proxying is used, record previous settings and restore them in the same session.

### Unreliable Profile May Block Combat

Run baseline and slow first. Keep unreliable failure rate low. If unreliable does not reach combat, the report should still include the blocker and may add the combat API slow profile for targeted combat evidence.

### Asset Noise May Bury Combat Findings

Use the broad slow profile to capture the real player experience, then use the optional combat API slow profile to isolate combat synchronization.

### Over-Attribution

Do not claim a request caused a visible wait unless there is app timing, screenshot, phase, or control-state evidence linking the request to the symptom.

## Open Follow-Ups

- After the report, choose fix projects by ranked finding.
- Rerun the same dev iOS benchmark after fixes to produce before/after evidence.
- Consider a separate production benchmark only after the dev fixes are validated and explicitly approved.
