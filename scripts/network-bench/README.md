# Koto Dev iOS Combat Network Benchmark

This toolkit benchmarks deployed dev iOS combat under mitmproxy network profiles.

## Scope

- App surface: Koto dev iOS app / Capacitor WKWebView
- Origin under test: `https://jrpg-dev.up.railway.app`
- Harness: mitmproxy, preferably scoped to the app WebView
- Output: raw flow logs, app logs, screenshots, summaries, and a Markdown report
- Excluded: production, local Vite, local Express, gameplay fixes, retry fixes, cache fixes

## Profiles

- `baseline-dev-ios`: capture only
- `slow-dev-ios`: 500 ms base latency plus 0-500 ms jitter
- `unreliable-dev-ios`: 500 ms base latency plus 0-1000 ms jitter and 3% seeded failures
- `combat-api-slow-dev-ios`: 900 ms base latency plus 0-700 ms jitter on combat sync/recovery API paths only

## One-Time Setup

Install mitmproxy:

```bash
mitmdump --version
```

If unavailable, install mitmproxy outside this repo using the local machine's normal package manager, then rerun `mitmdump --version`.

Start mitmproxy once so it creates the CA certificate:

```bash
mitmdump --listen-host 127.0.0.1 --listen-port 8080
```

Stop it with `Ctrl-C` after startup. Trust the generated certificate in the booted simulator:

```bash
xcrun simctl keychain booted add-root-cert ~/.mitmproxy/mitmproxy-ca-cert.pem
```

## Proxy Safety

Prefer app-scoped WKWebView proxying when the ignored native iOS project supports it. App-scoped proxying should set:

```text
KOTO_BENCH_APP_PROXY=1
KOTO_BENCH_PROXY_HOST=127.0.0.1
KOTO_BENCH_PROXY_PORT=8080
KOTO_BENCH_PROXY_DOMAINS=jrpg-dev.up.railway.app
```

If host-level proxying is used, record current settings first:

```bash
networksetup -listallnetworkservices
networksetup -getwebproxy "Wi-Fi"
networksetup -getsecurewebproxy "Wi-Fi"
```

Enable proxying for the active service:

```bash
networksetup -setwebproxy "Wi-Fi" 127.0.0.1 8080
networksetup -setsecurewebproxy "Wi-Fi" 127.0.0.1 8080
```

Restore proxying immediately after the run:

```bash
networksetup -setwebproxystate "Wi-Fi" off
networksetup -setsecurewebproxystate "Wi-Fi" off
```

Replace `Wi-Fi` with the active network service when different.

## Running One Profile

Create a run directory:

```bash
RUN_ID="$(date +%Y%m%d-%H%M%S)-dev-ios-combat"
PROFILE=baseline-dev-ios
mkdir -p "output/network-bench/$RUN_ID/$PROFILE/screenshots"
```

Start mitmproxy:

```bash
mitmdump \
  --listen-host 127.0.0.1 \
  --listen-port 8080 \
  --set "koto_profile=scripts/network-bench/profiles/$PROFILE.json" \
  --set "koto_output=output/network-bench/$RUN_ID/$PROFILE/flows.jsonl" \
  -s scripts/network-bench/mitm_koto_bench.py
```

In the iOS simulator, launch the dev iOS app. Capture app logs to:

```text
output/network-bench/$RUN_ID/$PROFILE/app.log
```

Drive this route:

1. Cold launch the dev iOS app.
2. Log in with the dedicated dev benchmark account or the seeded dev tester account when that account works on dev.
3. Start or resume a run.
4. Reach creature combat.
5. Screenshot combat start.
6. Perform attack.
7. Screenshot any visible syncing, loading, disabled-control, or stuck state.
8. Perform defend.
9. Perform another attack.
10. Try to reach terminal or near-terminal combat.
11. Screenshot recovery, post-combat, victory, defeat, or stuck state.

Store screenshots under:

```text
output/network-bench/$RUN_ID/$PROFILE/screenshots/
```

After the route, stop mitmproxy and verify:

```bash
test -s "output/network-bench/$RUN_ID/$PROFILE/flows.jsonl"
test -s "output/network-bench/$RUN_ID/$PROFILE/app.log"
```

## Profile Sweep

Run profiles in this order:

1. `baseline-dev-ios`
2. `slow-dev-ios`
3. `unreliable-dev-ios`
4. `combat-api-slow-dev-ios`

If `unreliable-dev-ios` cannot reach combat, still keep its artifacts and use `combat-api-slow-dev-ios` for targeted combat evidence.

## Summarize

```bash
node scripts/network-bench/summarize-run.mjs --run-dir "output/network-bench/$RUN_ID"
```

Expected:

- `output/network-bench/$RUN_ID/baseline-dev-ios/summary.json`
- `output/network-bench/$RUN_ID/slow-dev-ios/summary.json`
- `output/network-bench/$RUN_ID/unreliable-dev-ios/summary.json`
- `output/network-bench/$RUN_ID/combat-api-slow-dev-ios/summary.json`
- `output/network-bench/$RUN_ID/summary.json`

## Generate Report

```bash
node scripts/network-bench/generate-report.mjs \
  --summary "output/network-bench/$RUN_ID/summary.json" \
  --out "docs/reports/$(date +%Y-%m-%d)-dev-ios-combat-network-benchmark.md"
```

Review and edit the generated report so each ranked finding includes symptom, proxy evidence, app/log evidence, likely cause, and confidence.

## Verification

Run before relying on live results:

```bash
python3 -m unittest tests/network_bench/test_profile_logic.py tests/network_bench/test_mitm_koto_bench.py
python3 -m py_compile scripts/network-bench/mitm_koto_bench.py scripts/network_bench/profile_logic.py
node --test tests/unit/network-bench/summary-lib.test.js
node --check scripts/network-bench/summarize-run.mjs
node --check scripts/network-bench/generate-report.mjs
```

Confirm after each live profile:

```bash
test -s "output/network-bench/$RUN_ID/$PROFILE/flows.jsonl"
test -s "output/network-bench/$RUN_ID/$PROFILE/app.log"
```

## Cleanup

Stop mitmproxy after each profile. Restore host-level proxy settings immediately when host-level proxying was used. Do not commit files under `output/network-bench/`.
