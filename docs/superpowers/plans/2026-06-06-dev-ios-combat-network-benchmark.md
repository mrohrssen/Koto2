# Dev iOS Combat Network Benchmark Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore and adapt the old mitmproxy benchmark so deployed dev iOS combat delays can be measured, classified, and reported under poor network profiles.

**Architecture:** Recover the historical network-benchmark toolkit from git history, retarget it to `jrpg-dev.up.railway.app`, and extend it with combat-specific profile filtering plus combat timing summaries. The live benchmark runs against the dev iOS WebView only, writes raw artifacts under `output/network-bench/`, and commits only source tooling, tests, runbook docs, and the final Markdown report.

**Tech Stack:** mitmproxy/mitmdump, Python 3 stdlib tests, Node.js ES modules and `node:test`, XcodeBuildMCP iOS Simulator tooling, deployed Koto dev Railway app.

---

## Source Design

Approved spec:

`docs/superpowers/specs/2026-06-06-dev-ios-combat-network-benchmark-design.md`

This plan implements the spec as a diagnostic project only. It must not change gameplay behavior, retry policy, combat mechanics, cache behavior, UI copy, Japanese language content, dictionary data, or dialogue frames.

## File Structure

- Create/restore: `scripts/network-bench/profiles/baseline-dev-ios.json` - no-delay dev-origin capture.
- Create/restore: `scripts/network-bench/profiles/slow-dev-ios.json` - latency and jitter on all dev-origin traffic.
- Create/restore: `scripts/network-bench/profiles/unreliable-dev-ios.json` - latency, jitter, and seeded low-rate request failures.
- Create: `scripts/network-bench/profiles/combat-api-slow-dev-ios.json` - latency on combat synchronization paths only.
- Create/restore: `scripts/__init__.py` - Python package marker.
- Create/restore: `scripts/network_bench/__init__.py` - Python package marker.
- Create/restore and modify: `scripts/network_bench/profile_logic.py` - profile loading, host/path matching, deterministic delay/failure decisions, URL categorization, flow record shaping.
- Create/restore and modify: `scripts/network-bench/mitm_koto_bench.py` - mitmproxy addon that applies profile decisions and writes matched flow JSONL.
- Create/restore and modify: `tests/network_bench/test_profile_logic.py` - pure Python tests for profile logic, dev host defaults, path filters, and record shaping.
- Create/restore and modify: `tests/network_bench/test_mitm_koto_bench.py` - mitmproxy addon unit tests using fake mitmproxy modules.
- Create/restore and modify: `scripts/network-bench/summary-lib.mjs` - flow aggregation, log classification, combat timing extraction, delay bucket summaries.
- Create/restore: `scripts/network-bench/summarize-run.mjs` - CLI that reads profile directories and writes per-profile plus aggregate summaries.
- Create/restore and modify: `scripts/network-bench/generate-report.mjs` - CLI that generates a dev-iOS combat benchmark report skeleton from summaries.
- Create/restore and modify: `tests/unit/network-bench/summary-lib.test.js` - Node tests for flow summaries and combat log extraction.
- Create: `tests/fixtures/network-bench/dev-ios-combat/slow/flows.jsonl` - fixture proxy flows for dry-run summary.
- Create: `tests/fixtures/network-bench/dev-ios-combat/slow/app.log` - fixture app logs with API and combat timing lines.
- Create/restore and modify: `scripts/network-bench/README.md` - dev iOS benchmark setup, runbook, cleanup, and verification.
- Create after live run: `docs/reports/YYYY-MM-DD-dev-ios-combat-network-benchmark.md` - final ranked findings report.

Generated live artifacts stay under `output/network-bench/` and are not committed.

## Task 0: Create Isolated Worktree

**Files:**
- No source files changed in this task.

- [ ] **Step 1: Sync dev in the persistent worktree**

Run:

```bash
cd /Users/michiarohrssen/Documents/Claude/koto-dev
/usr/bin/git pull origin dev
```

Expected: `dev` is up to date or fast-forwards cleanly. If unrelated local changes block the pull, stop and report the blocking file list.

- [ ] **Step 2: Create the feature worktree**

Run:

```bash
cd /Users/michiarohrssen/Documents/Claude/koto-dev
/usr/bin/git worktree add ../koto-wt-dev-ios-combat-network-benchmark -b feature/dev-ios-combat-network-benchmark
cd ../koto-wt-dev-ios-combat-network-benchmark
```

Expected: new worktree is created on `feature/dev-ios-combat-network-benchmark`.

- [ ] **Step 3: Verify the source design exists**

Run:

```bash
test -f docs/superpowers/specs/2026-06-06-dev-ios-combat-network-benchmark-design.md
```

Expected: command exits with status `0`.

## Task 1: Restore Dev iOS Profiles And Profile Logic

**Files:**
- Create: `scripts/network-bench/profiles/baseline-dev-ios.json`
- Create: `scripts/network-bench/profiles/slow-dev-ios.json`
- Create: `scripts/network-bench/profiles/unreliable-dev-ios.json`
- Create: `scripts/network-bench/profiles/combat-api-slow-dev-ios.json`
- Restore/Create: `scripts/__init__.py`
- Restore/Create: `scripts/network_bench/__init__.py`
- Restore/Modify: `scripts/network_bench/profile_logic.py`
- Restore/Modify: `tests/network_bench/test_profile_logic.py`

- [ ] **Step 1: Restore historical Python package files**

Run:

```bash
/usr/bin/git restore --source 378ad5e6 -- scripts/__init__.py scripts/network_bench/__init__.py scripts/network_bench/profile_logic.py tests/network_bench/test_profile_logic.py
```

Expected: four files are restored into the worktree.

- [ ] **Step 2: Replace profile tests with dev host and path-filter coverage**

Use `apply_patch` to replace `tests/network_bench/test_profile_logic.py` with:

```python
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from scripts.network_bench.profile_logic import (
    _unit_interval,
    categorize_url,
    decision_for_flow,
    flow_record,
    load_profile,
    matches_profile,
)


DEV_HOST = "jrpg-dev.up.railway.app"


class ProfileLogicTest(unittest.TestCase):
    def write_profile(self, data):
        tmpdir = tempfile.TemporaryDirectory()
        path = Path(tmpdir.name) / "profile.json"
        path.write_text(json.dumps(data), encoding="utf-8")
        self.addCleanup(tmpdir.cleanup)
        return path

    def test_load_profile_normalizes_defaults(self):
        path = self.write_profile({
            "name": "baseline-dev-ios",
            "matchHost": DEV_HOST
        })

        profile = load_profile(path)

        self.assertEqual(profile["name"], "baseline-dev-ios")
        self.assertEqual(profile["matchHost"], DEV_HOST)
        self.assertEqual(profile["pathPrefixes"], [])
        self.assertEqual(profile["delay"]["baseMs"], 0)
        self.assertEqual(profile["delay"]["jitterMs"], 0)
        self.assertEqual(profile["failure"]["rate"], 0)
        self.assertEqual(profile["failure"]["status"], 599)

    def test_matches_profile_matches_dev_host(self):
        profile = load_profile(self.write_profile({
            "name": "p",
            "matchHost": DEV_HOST
        }))

        self.assertTrue(matches_profile(profile, f"https://{DEV_HOST}/api/game/state"))
        self.assertFalse(matches_profile(profile, "https://jrpg-production.up.railway.app/api/game/state"))
        self.assertFalse(matches_profile(profile, "https://example.com/api/game/state"))

    def test_matches_profile_respects_path_prefixes(self):
        profile = load_profile(self.write_profile({
            "name": "combat-api-slow-dev-ios",
            "matchHost": DEV_HOST,
            "pathPrefixes": [
                "/api/game/creature-combat-cycle",
                "/api/game/state",
                "/api/game/kanji-kombat/answer"
            ]
        }))

        self.assertTrue(matches_profile(profile, f"https://{DEV_HOST}/api/game/creature-combat-cycle"))
        self.assertTrue(matches_profile(profile, f"https://{DEV_HOST}/api/game/state?refresh=1"))
        self.assertTrue(matches_profile(profile, f"https://{DEV_HOST}/api/game/kanji-kombat/answer"))
        self.assertFalse(matches_profile(profile, f"https://{DEV_HOST}/assets/index.js"))
        self.assertFalse(matches_profile(profile, f"https://{DEV_HOST}/api/settings"))

    def test_categorize_url(self):
        cases = {
            f"https://{DEV_HOST}/": "document",
            f"https://{DEV_HOST}/game.html": "document",
            f"https://{DEV_HOST}/assets/index.js": "javascript",
            f"https://{DEV_HOST}/assets/game.css": "css",
            f"https://{DEV_HOST}/assets/sprites/creatures/hi.webp": "image",
            f"https://{DEV_HOST}/assets/audio/click.mp3": "audio",
            f"https://{DEV_HOST}/api/game/state": "api",
            f"https://{DEV_HOST}/api/tts/synthesize": "tts",
            f"wss://{DEV_HOST}/socket.io/?EIO=4": "websocket",
            f"https://{DEV_HOST}/privacy": "other",
        }

        for url, expected in cases.items():
            with self.subTest(url=url):
                self.assertEqual(categorize_url(url), expected)

    def test_decision_is_deterministic(self):
        profile = load_profile(self.write_profile({
            "name": "unreliable-dev-ios",
            "matchHost": DEV_HOST,
            "seed": "seed-one",
            "delay": {"baseMs": 100, "jitterMs": 250},
            "failure": {"rate": 0.5, "status": 599, "body": "fail"}
        }))

        url = f"https://{DEV_HOST}/api/game/state"
        first = decision_for_flow(profile, "GET", url, 7)
        second = decision_for_flow(profile, "GET", url, 7)

        self.assertEqual(first, second)
        self.assertGreaterEqual(first["delayMs"], 100)
        self.assertLessEqual(first["delayMs"], 350)

    def test_unit_interval_stays_below_one_at_hash_upper_bound(self):
        with patch("scripts.network_bench.profile_logic.hashlib.sha256") as sha256:
            sha256.return_value.hexdigest.return_value = "f" * 16 + "0" * 48

            result = _unit_interval("seed")

        self.assertGreaterEqual(result, 0)
        self.assertLess(result, 1)

    def test_decision_failure_rate_one_always_fails(self):
        profile = load_profile(self.write_profile({
            "name": "always-fail",
            "matchHost": DEV_HOST,
            "delay": {"baseMs": 25, "jitterMs": 0},
            "failure": {"rate": 1, "status": 599}
        }))

        decision = decision_for_flow(profile, "GET", f"https://{DEV_HOST}/api/game/state", 1)

        self.assertTrue(decision["matches"])
        self.assertEqual(decision["delayMs"], 25)
        self.assertTrue(decision["shouldFail"])

    def test_decision_for_unmatched_path_has_no_injection(self):
        profile = load_profile(self.write_profile({
            "name": "combat-api-slow-dev-ios",
            "matchHost": DEV_HOST,
            "pathPrefixes": ["/api/game/creature-combat-cycle"],
            "delay": {"baseMs": 500, "jitterMs": 250},
            "failure": {"rate": 1, "status": 599}
        }))

        decision = decision_for_flow(profile, "GET", f"https://{DEV_HOST}/assets/index.js", 1)

        self.assertFalse(decision["matches"])
        self.assertEqual(decision["delayMs"], 0)
        self.assertFalse(decision["shouldFail"])

    def test_flow_record_contains_report_fields(self):
        profile = load_profile(self.write_profile({
            "name": "slow-dev-ios",
            "matchHost": DEV_HOST,
            "delay": {"baseMs": 500, "jitterMs": 0}
        }))
        decision = decision_for_flow(profile, "POST", f"https://{DEV_HOST}/api/game/creature-combat-cycle", 1)

        record = flow_record(
            profile=profile,
            method="POST",
            url=f"https://{DEV_HOST}/api/game/creature-combat-cycle",
            status=200,
            startedAt="2026-06-06T00:00:00.000Z",
            endedAt="2026-06-06T00:00:01.000Z",
            durationMs=1000,
            responseBytes=2048,
            decision=decision,
            error=None,
        )

        self.assertEqual(record["profile"], "slow-dev-ios")
        self.assertEqual(record["method"], "POST")
        self.assertEqual(record["host"], DEV_HOST)
        self.assertEqual(record["path"], "/api/game/creature-combat-cycle")
        self.assertEqual(record["category"], "api")
        self.assertEqual(record["status"], 200)
        self.assertEqual(record["durationMs"], 1000)
        self.assertEqual(record["responseBytes"], 2048)
        self.assertEqual(record["injectedDelayMs"], 500)
        self.assertFalse(record["injectedFailure"])


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 3: Run the failing Python test**

Run:

```bash
python3 -m unittest tests/network_bench/test_profile_logic.py
```

Expected: FAIL because `pathPrefixes` is not normalized and `.html` documents are not categorized as `document`.

- [ ] **Step 4: Add path filter support to profile logic**

Use `apply_patch` to update `scripts/network_bench/profile_logic.py`:

```diff
@@
 def load_profile(path):
@@
     return {
         "name": raw["name"],
         "description": raw.get("description", ""),
         "matchHost": raw["matchHost"],
+        "pathPrefixes": [str(prefix) for prefix in raw.get("pathPrefixes", [])],
         "seed": raw.get("seed", raw["name"]),
@@
 def matches_profile(profile, url):
     parsed = urlparse(url)
-    return parsed.hostname == profile["matchHost"]
+    if parsed.hostname != profile["matchHost"]:
+        return False
+    prefixes = profile.get("pathPrefixes") or []
+    if not prefixes:
+        return True
+    path = parsed.path or "/"
+    return any(path.startswith(prefix) for prefix in prefixes)
@@
-    if path == "/":
+    if path == "/" or lower.endswith(".html"):
         return "document"
```

Expected: `load_profile()` exposes `pathPrefixes`, `matches_profile()` rejects unmatched paths, and `.html` responses are categorized as documents.

- [ ] **Step 5: Add dev iOS profile JSON files**

Use `apply_patch` to add `scripts/network-bench/profiles/baseline-dev-ios.json`:

```json
{
  "name": "baseline-dev-ios",
  "description": "Control profile. Capture deployed dev iOS WebView traffic through mitmproxy without artificial impairment.",
  "matchHost": "jrpg-dev.up.railway.app",
  "seed": "koto-baseline-dev-ios-2026-06-06",
  "delay": {
    "baseMs": 0,
    "jitterMs": 0
  },
  "failure": {
    "rate": 0,
    "status": 599,
    "body": "Koto dev iOS benchmark injected failure"
  }
}
```

Use `apply_patch` to add `scripts/network-bench/profiles/slow-dev-ios.json`:

```json
{
  "name": "slow-dev-ios",
  "description": "Sluggish but mostly reliable deployed dev iOS connection. Adds latency and jitter to dev-origin traffic.",
  "matchHost": "jrpg-dev.up.railway.app",
  "seed": "koto-slow-dev-ios-2026-06-06",
  "delay": {
    "baseMs": 500,
    "jitterMs": 500
  },
  "failure": {
    "rate": 0,
    "status": 599,
    "body": "Koto dev iOS benchmark injected failure"
  }
}
```

Use `apply_patch` to add `scripts/network-bench/profiles/unreliable-dev-ios.json`:

```json
{
  "name": "unreliable-dev-ios",
  "description": "Sluggish deployed dev iOS connection with seeded low-rate request failures.",
  "matchHost": "jrpg-dev.up.railway.app",
  "seed": "koto-unreliable-dev-ios-2026-06-06",
  "delay": {
    "baseMs": 500,
    "jitterMs": 1000
  },
  "failure": {
    "rate": 0.03,
    "status": 599,
    "body": "Koto dev iOS benchmark injected failure"
  }
}
```

Use `apply_patch` to add `scripts/network-bench/profiles/combat-api-slow-dev-ios.json`:

```json
{
  "name": "combat-api-slow-dev-ios",
  "description": "Focused deployed dev iOS profile that delays combat synchronization and recovery endpoints only.",
  "matchHost": "jrpg-dev.up.railway.app",
  "pathPrefixes": [
    "/api/game/creature-combat-cycle",
    "/api/game/state",
    "/api/game/kanji-kombat/answer"
  ],
  "seed": "koto-combat-api-slow-dev-ios-2026-06-06",
  "delay": {
    "baseMs": 900,
    "jitterMs": 700
  },
  "failure": {
    "rate": 0,
    "status": 599,
    "body": "Koto dev iOS benchmark injected failure"
  }
}
```

- [ ] **Step 6: Run Python tests and syntax check**

Run:

```bash
python3 -m unittest tests/network_bench/test_profile_logic.py
python3 -m py_compile scripts/network_bench/profile_logic.py
```

Expected: both commands PASS.

- [ ] **Step 7: Commit profile logic and dev profiles**

Run:

```bash
/usr/bin/git add scripts/__init__.py scripts/network_bench scripts/network-bench/profiles tests/network_bench/test_profile_logic.py
/usr/bin/git commit -m "test: add dev ios network benchmark profiles"
```

Expected: commit includes only Python profile logic, Python package markers, dev profile JSON files, and profile logic tests.

## Task 2: Restore And Harden mitmproxy Addon

**Files:**
- Restore/Modify: `scripts/network-bench/mitm_koto_bench.py`
- Restore/Modify: `tests/network_bench/test_mitm_koto_bench.py`

- [ ] **Step 1: Restore historical mitmproxy addon and tests**

Run:

```bash
/usr/bin/git restore --source bf3761a6 -- scripts/network-bench/mitm_koto_bench.py tests/network_bench/test_mitm_koto_bench.py
```

Expected: addon and fake-mitmproxy tests are restored.

- [ ] **Step 2: Update the default addon profile path**

Use `apply_patch` to update `scripts/network-bench/mitm_koto_bench.py`:

```diff
@@
         loader.add_option(
             "koto_profile",
             str,
-            "scripts/network-bench/profiles/baseline.json",
+            "scripts/network-bench/profiles/baseline-dev-ios.json",
             "path to profile JSON",
         )
```

Expected: running `mitmdump` without explicit `koto_profile` targets the dev iOS baseline profile.

- [ ] **Step 3: Update fake addon test host**

Use `apply_patch` to update `tests/network_bench/test_mitm_koto_bench.py`:

```diff
@@
-            "matchHost": "jrpg-production.up.railway.app",
+            "matchHost": "jrpg-dev.up.railway.app",
@@
-                "https://jrpg-production.up.railway.app/api/game/state",
+                "https://jrpg-dev.up.railway.app/api/game/state",
@@
-            self.assertEqual(records[0]["host"], "jrpg-production.up.railway.app")
+            self.assertEqual(records[0]["host"], "jrpg-dev.up.railway.app")
```

Expected: addon tests assert dev-origin capture.

- [ ] **Step 4: Add path-filter fake flow test**

Append this test method to `MitmKotoBenchTest` in `tests/network_bench/test_mitm_koto_bench.py`:

```python
    def test_path_filtered_profile_ignores_non_matching_dev_paths(self):
        with tempfile.TemporaryDirectory() as tmp:
            tmpdir = Path(tmp)
            profile_path = tmpdir / "profile.json"
            profile_path.write_text(json.dumps({
                "name": "combat-api-slow-dev-ios",
                "matchHost": "jrpg-dev.up.railway.app",
                "pathPrefixes": ["/api/game/creature-combat-cycle"],
                "delay": {"baseMs": 0, "jitterMs": 0}
            }), encoding="utf-8")
            output_path = tmpdir / "flows.jsonl"

            module, output_path = self.load_addon_module(tmpdir)
            module.ctx.options.koto_profile = str(profile_path)
            module.ctx.options.koto_output = str(output_path)
            addon = module.KotoNetworkBench()
            addon.load(FakeLoader())
            addon.configure({"koto_profile", "koto_output"})

            ignored = FakeFlow(
                "GET",
                "https://jrpg-dev.up.railway.app/assets/index.js",
                response=FakeResponse(200, b"js"),
            )
            asyncio.run(addon.request(ignored))
            addon.response(ignored)

            matched = FakeFlow(
                "POST",
                "https://jrpg-dev.up.railway.app/api/game/creature-combat-cycle",
                response=FakeResponse(200, b"{}"),
            )
            asyncio.run(addon.request(matched))
            addon.response(matched)

            records = self.read_records(output_path)
            self.assertEqual(len(records), 1)
            self.assertEqual(records[0]["path"], "/api/game/creature-combat-cycle")
```

Expected: path-filtered profile writes only the matching combat API record.

- [ ] **Step 5: Run addon tests and syntax check**

Run:

```bash
python3 -m unittest tests/network_bench/test_profile_logic.py tests/network_bench/test_mitm_koto_bench.py
python3 -m py_compile scripts/network-bench/mitm_koto_bench.py scripts/network_bench/profile_logic.py
```

Expected: all Python tests and syntax checks PASS.

- [ ] **Step 6: Commit mitmproxy addon**

Run:

```bash
/usr/bin/git add scripts/network-bench/mitm_koto_bench.py tests/network_bench/test_mitm_koto_bench.py
/usr/bin/git commit -m "test: restore dev ios mitmproxy benchmark addon"
```

Expected: commit includes only the addon and addon tests.

## Task 3: Restore Summary Tooling And Add Combat Timing Classification

**Files:**
- Restore/Modify: `scripts/network-bench/summary-lib.mjs`
- Restore: `scripts/network-bench/summarize-run.mjs`
- Restore/Modify: `scripts/network-bench/generate-report.mjs`
- Restore/Modify: `tests/unit/network-bench/summary-lib.test.js`
- Create: `tests/fixtures/network-bench/dev-ios-combat/slow/flows.jsonl`
- Create: `tests/fixtures/network-bench/dev-ios-combat/slow/app.log`

- [ ] **Step 1: Restore historical Node summary/report files**

Run:

```bash
/usr/bin/git restore --source af5e55e0 -- scripts/network-bench/summary-lib.mjs scripts/network-bench/summarize-run.mjs tests/unit/network-bench/summary-lib.test.js
/usr/bin/git restore --source 08249b12 -- scripts/network-bench/generate-report.mjs
```

Expected: summary library, summarize CLI, report generator, and Node tests are restored.

- [ ] **Step 2: Add combat timing tests**

Append to `tests/unit/network-bench/summary-lib.test.js`:

```javascript
test('summarizeLogLines extracts structured combat timing buckets', () => {
  const lines = [
    '[Combat Timing] request {"actionType":"attack","requestMs":1320,"indicatorShown":true,"failed":false}',
    '[Combat Timing] turn {"actionType":"attack","requestMs":1320,"animationMs":650,"totalMs":1970,"outcome":"optimistic_verified","failed":false}',
    '[Combat Timing] server {"actionType":"attack","statusCode":200,"resolveMs":18,"saveMs":7,"totalMs":25}',
    '[Combat Timing] turn {"actionType":"defend","requestMs":1600,"animationMs":0,"totalMs":1600,"outcome":"recovery_failed","failed":true}',
  ];

  const summary = summarizeLogLines(lines);

  assert.equal(summary.combatTiming.length, 4);
  assert.deepEqual(summary.combat.requestCount, 1);
  assert.deepEqual(summary.combat.turnCount, 2);
  assert.deepEqual(summary.combat.serverCount, 1);
  assert.deepEqual(summary.combat.failedTurns, 1);
  assert.deepEqual(summary.combat.outcomes, {
    optimistic_verified: 1,
    recovery_failed: 1,
  });
  assert.deepEqual(summary.combat.maxRequestMs, 1600);
  assert.deepEqual(summary.combat.maxTurnTotalMs, 1970);
  assert.deepEqual(summary.combat.maxServerTotalMs, 25);
});

test('classifyDelayBuckets distinguishes combat API and asset pain', () => {
  const records = [
    { path: '/api/game/creature-combat-cycle', category: 'api', durationMs: 1500, status: 200 },
    { path: '/api/game/state', category: 'api', durationMs: 1200, status: 200 },
    { path: '/assets/index.js', category: 'javascript', durationMs: 2300, status: 599, injectedFailure: true },
    { path: '/assets/audio/bgm/battle.mp3', category: 'audio', durationMs: 3100, status: 206 },
  ];
  const logSummary = summarizeLogLines([
    '[Combat Timing] turn {"actionType":"attack","requestMs":1500,"animationMs":400,"totalMs":1900,"outcome":"optimistic_verified","failed":false}',
    '[Combat Timing] server {"actionType":"attack","statusCode":200,"resolveMs":20,"saveMs":8,"totalMs":28}',
  ]);

  const buckets = classifyDelayBuckets(records, logSummary);

  assert.equal(buckets.network_request.count, 2);
  assert.equal(buckets.asset_chunk_media.count, 2);
  assert.equal(buckets.server_resolve_save.maxMs, 28);
  assert.equal(buckets.verification_gap.maxMs, 1500);
});
```

- [ ] **Step 3: Run Node tests to verify failure**

Run:

```bash
node --test tests/unit/network-bench/summary-lib.test.js
```

Expected: FAIL because `summarizeLogLines()` does not expose `combat` and `classifyDelayBuckets()` is not exported.

- [ ] **Step 4: Add combat summary helpers**

Use `apply_patch` to update `scripts/network-bench/summary-lib.mjs`:

```diff
@@
 export function rankSlowRequests(records, limit = 20) {
@@
 }
+
+function parseTimingObject(line) {
+  const match = line.match(/\{.*\}$/);
+  if (!match) return null;
+  try {
+    return JSON.parse(match[0]);
+  } catch {
+    return null;
+  }
+}
+
+function summarizeCombatTiming(lines = []) {
+  const requestLogs = [];
+  const turnLogs = [];
+  const serverLogs = [];
+  const outcomes = {};
+
+  for (const line of lines) {
+    const parsed = parseTimingObject(line);
+    if (!parsed) continue;
+    if (line.includes('[Combat Timing] request')) requestLogs.push(parsed);
+    if (line.includes('[Combat Timing] turn')) {
+      turnLogs.push(parsed);
+      if (parsed.outcome) outcomes[parsed.outcome] = (outcomes[parsed.outcome] || 0) + 1;
+    }
+    if (line.includes('[Combat Timing] server')) serverLogs.push(parsed);
+  }
+
+  return {
+    requestCount: requestLogs.length,
+    turnCount: turnLogs.length,
+    serverCount: serverLogs.length,
+    failedTurns: turnLogs.filter(log => log.failed === true).length,
+    outcomes,
+    maxRequestMs: Math.max(0, ...turnLogs.map(log => normalizeNumber(log.requestMs)), ...requestLogs.map(log => normalizeNumber(log.requestMs))),
+    maxTurnTotalMs: Math.max(0, ...turnLogs.map(log => normalizeNumber(log.totalMs))),
+    maxServerTotalMs: Math.max(0, ...serverLogs.map(log => normalizeNumber(log.totalMs))),
+    maxServerResolveMs: Math.max(0, ...serverLogs.map(log => normalizeNumber(log.resolveMs))),
+    maxServerSaveMs: Math.max(0, ...serverLogs.map(log => normalizeNumber(log.saveMs))),
+  };
+}
+
+function isCombatSyncPath(record) {
+  const path = record?.path || '';
+  return path.startsWith('/api/game/creature-combat-cycle')
+    || path.startsWith('/api/game/state')
+    || path.startsWith('/api/game/kanji-kombat/answer');
+}
+
+function isAssetChunkMedia(record) {
+  return ['javascript', 'image', 'audio', 'tts'].includes(record?.category);
+}
+
+export function classifyDelayBuckets(records = [], logSummary = {}) {
+  const combatRecords = records.filter(isCombatSyncPath);
+  const assetRecords = records.filter(isAssetChunkMedia);
+  const combat = logSummary.combat || {};
+  const verificationGapMs = Math.max(0, normalizeNumber(combat.maxRequestMs) - normalizeNumber(combat.maxServerTotalMs));
+
+  return {
+    network_request: {
+      count: combatRecords.length,
+      maxMs: Math.max(0, ...combatRecords.map(normalizeDuration)),
+    },
+    server_resolve_save: {
+      count: normalizeNumber(combat.serverCount),
+      maxMs: normalizeNumber(combat.maxServerTotalMs),
+    },
+    verification_gap: {
+      count: normalizeNumber(combat.turnCount),
+      maxMs: verificationGapMs,
+    },
+    asset_chunk_media: {
+      count: assetRecords.length,
+      maxMs: Math.max(0, ...assetRecords.map(normalizeDuration)),
+    },
+    recovery_fetch: {
+      count: Object.entries(combat.outcomes || {}).filter(([outcome]) => outcome.includes('recovery')).reduce((sum, [, count]) => sum + count, 0),
+      maxMs: normalizeNumber(combat.maxRequestMs),
+    },
+    ui_control_gap: {
+      count: 0,
+      maxMs: 0,
+    },
+    unknown: {
+      count: 0,
+      maxMs: 0,
+    },
+  };
+}
@@
 export function summarizeLogLines(lines = []) {
+  const combatTiming = lines.filter((line) => line.includes('[Combat Timing]'));
   return {
     apiTiming: lines.filter((line) => line.includes('[API Timing]')),
-    combatTiming: lines.filter((line) => line.includes('[Combat Timing]')),
+    combatTiming,
+    combat: summarizeCombatTiming(combatTiming),
     connection: lines.filter((line) => line.includes('Connection lost') || line.includes('retrying')),
   };
 }
@@
 export function aggregateProfile(profile, records, logLines = []) {
+  const appLog = summarizeLogLines(logLines);
   return {
@@
-    appLog: summarizeLogLines(logLines),
+    appLog,
+    delayBuckets: classifyDelayBuckets(records, appLog),
   };
 }
```

Expected: summary library exports `classifyDelayBuckets()`, parses structured combat timing JSON, and adds `delayBuckets` to profile summaries.

- [ ] **Step 5: Update import list in Node tests**

Use `apply_patch` to update the import block in `tests/unit/network-bench/summary-lib.test.js`:

```diff
 import {
   aggregateProfile,
   aggregateRun,
+  classifyDelayBuckets,
   percentile,
   rankSlowRequests,
   summarizeCategories,
   summarizeLogLines,
 } from '../../../scripts/network-bench/summary-lib.mjs';
```

Expected: tests can call `classifyDelayBuckets()`.

- [ ] **Step 6: Update existing log-summary expected objects**

In the existing `summarizeLogLines extracts known timing...` test, replace the expected object with:

```javascript
  assert.deepEqual(summarizeLogLines(lines), {
    apiTiming: ['[API Timing] GET /api/game/state 123ms'],
    combatTiming: ['[Combat Timing] enemy turn 220ms'],
    combat: {
      requestCount: 0,
      turnCount: 0,
      serverCount: 0,
      failedTurns: 0,
      outcomes: {},
      maxRequestMs: 0,
      maxTurnTotalMs: 0,
      maxServerTotalMs: 0,
      maxServerResolveMs: 0,
      maxServerSaveMs: 0,
    },
    connection: ['Connection lost while polling', 'socket retrying in 1000ms'],
  });
```

In the existing `aggregateProfile returns profile counts...` test, update the expected `appLog` object to include the same `combat` summary:

```javascript
    appLog: {
      apiTiming: ['[API Timing] GET /api/game/state 100ms'],
      combatTiming: ['[Combat Timing] enemy turn 220ms'],
      combat: {
        requestCount: 0,
        turnCount: 0,
        serverCount: 0,
        failedTurns: 0,
        outcomes: {},
        maxRequestMs: 0,
        maxTurnTotalMs: 0,
        maxServerTotalMs: 0,
        maxServerResolveMs: 0,
        maxServerSaveMs: 0,
      },
      connection: ['Connection lost during combat'],
    },
```

Expected: existing assertions match the new `summarizeLogLines()` return shape.

- [ ] **Step 7: Update aggregateProfile expected object**

In the existing `aggregateProfile returns profile counts...` test, add this `delayBuckets` field to the expected object:

```javascript
    delayBuckets: {
      network_request: {
        count: 1,
        maxMs: 100,
      },
      server_resolve_save: {
        count: 0,
        maxMs: 0,
      },
      verification_gap: {
        count: 0,
        maxMs: 0,
      },
      asset_chunk_media: {
        count: 1,
        maxMs: 300,
      },
      recovery_fetch: {
        count: 0,
        maxMs: 0,
      },
      ui_control_gap: {
        count: 0,
        maxMs: 0,
      },
      unknown: {
        count: 0,
        maxMs: 0,
      },
    },
```

Expected: test matches the new aggregate shape.

- [ ] **Step 8: Add fixture dry-run files**

Use `apply_patch` to add `tests/fixtures/network-bench/dev-ios-combat/slow/flows.jsonl`:

```jsonl
{"category":"api","durationMs":1500,"endedAt":"2026-06-06T00:00:01.500Z","error":null,"host":"jrpg-dev.up.railway.app","injectedDelayMs":900,"injectedFailure":false,"method":"POST","path":"/api/game/creature-combat-cycle","profile":"slow-dev-ios","responseBytes":2048,"status":200,"timestamp":"2026-06-06T00:00:00.000Z","url":"https://jrpg-dev.up.railway.app/api/game/creature-combat-cycle"}
{"category":"api","durationMs":1200,"endedAt":"2026-06-06T00:00:03.000Z","error":null,"host":"jrpg-dev.up.railway.app","injectedDelayMs":800,"injectedFailure":false,"method":"GET","path":"/api/game/state","profile":"slow-dev-ios","responseBytes":4096,"status":200,"timestamp":"2026-06-06T00:00:01.800Z","url":"https://jrpg-dev.up.railway.app/api/game/state"}
{"category":"javascript","durationMs":2200,"endedAt":"2026-06-06T00:00:05.500Z","error":null,"host":"jrpg-dev.up.railway.app","injectedDelayMs":750,"injectedFailure":false,"method":"GET","path":"/assets/index-test.js","profile":"slow-dev-ios","responseBytes":500000,"status":200,"timestamp":"2026-06-06T00:00:03.300Z","url":"https://jrpg-dev.up.railway.app/assets/index-test.js"}
```

Use `apply_patch` to add `tests/fixtures/network-bench/dev-ios-combat/slow/app.log`:

```text
[API Timing] POST /api/game/creature-combat-cycle -> 200 in 1500ms
[Combat Timing] request {"actionType":"attack","requestMs":1500,"indicatorShown":true,"failed":false}
[Combat Timing] turn {"actionType":"attack","requestMs":1500,"animationMs":500,"totalMs":2000,"outcome":"optimistic_verified","failed":false}
[Combat Timing] server {"actionType":"attack","statusCode":200,"actionCountBefore":1,"actionCountAfter":2,"cycleCountBefore":0,"cycleCountAfter":1,"resolveMs":20,"saveMs":10,"totalMs":30}
```

- [ ] **Step 9: Run Node tests and fixture dry run**

Run:

```bash
node --test tests/unit/network-bench/summary-lib.test.js
node scripts/network-bench/summarize-run.mjs --run-dir tests/fixtures/network-bench/dev-ios-combat
node --check scripts/network-bench/summarize-run.mjs
node --check scripts/network-bench/generate-report.mjs
```

Expected: tests pass, fixture summary files are written under `tests/fixtures/network-bench/dev-ios-combat/slow/summary.json` and `tests/fixtures/network-bench/dev-ios-combat/summary.json`, and syntax checks pass.

- [ ] **Step 10: Remove generated fixture summaries**

Run:

```bash
/usr/bin/git status --short tests/fixtures/network-bench/dev-ios-combat
```

Expected: `summary.json` files appear as generated artifacts. Remove only those generated summaries:

```bash
rm -f tests/fixtures/network-bench/dev-ios-combat/summary.json tests/fixtures/network-bench/dev-ios-combat/slow/summary.json
```

Expected: only `flows.jsonl` and `app.log` remain untracked or modified under the fixture directory.

- [ ] **Step 11: Commit summary tooling**

Run:

```bash
/usr/bin/git add scripts/network-bench/summary-lib.mjs scripts/network-bench/summarize-run.mjs scripts/network-bench/generate-report.mjs tests/unit/network-bench/summary-lib.test.js tests/fixtures/network-bench/dev-ios-combat/slow/flows.jsonl tests/fixtures/network-bench/dev-ios-combat/slow/app.log
/usr/bin/git commit -m "test: add combat network benchmark summaries"
```

Expected: commit includes Node summary/report tooling, tests, and fixture inputs only.

## Task 4: Write Dev iOS Benchmark Runbook

**Files:**
- Restore/Modify: `scripts/network-bench/README.md`

- [ ] **Step 1: Restore historical README**

Run:

```bash
/usr/bin/git restore --source c7eed7f4 -- scripts/network-bench/README.md
```

Expected: historical iOS network benchmark README is restored.

- [ ] **Step 2: Replace README with dev iOS combat runbook**

Use `apply_patch` to replace `scripts/network-bench/README.md` with:

```markdown
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
```

- [ ] **Step 3: Check README for production target leakage**

Run:

```bash
rg -n "jrpg-production|production origin|production app" scripts/network-bench/README.md
```

Expected: no matches.

- [ ] **Step 4: Commit runbook**

Run:

```bash
/usr/bin/git add scripts/network-bench/README.md
/usr/bin/git commit -m "docs: add dev ios combat network benchmark runbook"
```

Expected: commit includes only the README.

## Task 5: Verify Tooling Before Live Benchmark

**Files:**
- Verify all files created in Tasks 1-4.

- [ ] **Step 1: Run Python tests**

Run:

```bash
python3 -m unittest tests/network_bench/test_profile_logic.py tests/network_bench/test_mitm_koto_bench.py
```

Expected: PASS.

- [ ] **Step 2: Run Python syntax checks**

Run:

```bash
python3 -m py_compile scripts/network-bench/mitm_koto_bench.py scripts/network_bench/profile_logic.py
```

Expected: PASS.

- [ ] **Step 3: Run Node tests and syntax checks**

Run:

```bash
node --test tests/unit/network-bench/summary-lib.test.js
node --check scripts/network-bench/summarize-run.mjs
node --check scripts/network-bench/generate-report.mjs
```

Expected: PASS.

- [ ] **Step 4: Run fixture summary dry run**

Run:

```bash
node scripts/network-bench/summarize-run.mjs --run-dir tests/fixtures/network-bench/dev-ios-combat
node -e "const s=require('./tests/fixtures/network-bench/dev-ios-combat/summary.json'); if (!s.profiles?.[0]?.appLog?.combat?.turnCount) process.exit(1); console.log('fixture combat timing ok')"
rm -f tests/fixtures/network-bench/dev-ios-combat/summary.json tests/fixtures/network-bench/dev-ios-combat/slow/summary.json
```

Expected: prints `fixture combat timing ok`, then removes generated fixture summaries.

- [ ] **Step 5: Run focused full verification**

Run:

```bash
npm run test:unit -- tests/unit/network-bench/summary-lib.test.js
```

Expected: PASS. This command validates that the benchmark Node tests work through the repo's unit-test script.

- [ ] **Step 6: Inspect git state**

Run:

```bash
/usr/bin/git status --short
```

Expected: no generated fixture summaries remain. Any uncommitted changes are intentional plan/tooling changes from Tasks 1-4 only.

## Task 6: Run Dev iOS Benchmark Sweep

**Files:**
- Generated only: `output/network-bench/$RUN_ID/**`

- [ ] **Step 1: Confirm mitmdump is available**

Run:

```bash
mitmdump --version
```

Expected: mitmproxy version prints. If unavailable, request approval to install mitmproxy using the local machine's package manager, then rerun this command.

- [ ] **Step 2: Confirm iOS simulator defaults**

Use XcodeBuildMCP:

```text
session_show_defaults
```

Expected: defaults show the dev iOS app project, scheme, and an iOS simulator. If defaults are empty, discover projects and set defaults before continuing.

- [ ] **Step 3: Boot simulator and trust mitmproxy CA**

Use XcodeBuildMCP:

```text
boot_sim
open_sim
```

Then run:

```bash
xcrun simctl keychain booted add-root-cert ~/.mitmproxy/mitmproxy-ca-cert.pem
```

Expected: simulator is booted and the certificate command exits with status `0`.

- [ ] **Step 4: Create run directory**

Run:

```bash
RUN_ID="$(date +%Y%m%d-%H%M%S)-dev-ios-combat"
mkdir -p "output/network-bench/$RUN_ID"
printf '%s\n' "$RUN_ID"
```

Expected: run ID prints.

- [ ] **Step 5: Run baseline profile**

Run mitmproxy:

```bash
PROFILE=baseline-dev-ios
mkdir -p "output/network-bench/$RUN_ID/$PROFILE/screenshots"
mitmdump \
  --listen-host 127.0.0.1 \
  --listen-port 8080 \
  --set "koto_profile=scripts/network-bench/profiles/$PROFILE.json" \
  --set "koto_output=output/network-bench/$RUN_ID/$PROFILE/flows.jsonl" \
  -s scripts/network-bench/mitm_koto_bench.py
```

In another tool call, launch the dev iOS app through XcodeBuildMCP with proxy environment when app-scoped proxying is supported:

```text
KOTO_BENCH_APP_PROXY=1
KOTO_BENCH_PROXY_HOST=127.0.0.1
KOTO_BENCH_PROXY_PORT=8080
KOTO_BENCH_PROXY_DOMAINS=jrpg-dev.up.railway.app
```

Drive the route from the README, capture screenshots, and save app logs to:

```text
output/network-bench/$RUN_ID/baseline-dev-ios/app.log
```

Expected: route reaches first usable app screen and records whether combat was reached.

- [ ] **Step 6: Run slow profile**

Repeat Step 5 with:

```bash
PROFILE=slow-dev-ios
mkdir -p "output/network-bench/$RUN_ID/$PROFILE/screenshots"
mitmdump \
  --listen-host 127.0.0.1 \
  --listen-port 8080 \
  --set "koto_profile=scripts/network-bench/profiles/$PROFILE.json" \
  --set "koto_output=output/network-bench/$RUN_ID/$PROFILE/flows.jsonl" \
  -s scripts/network-bench/mitm_koto_bench.py
```

Expected: route captures visible slow combat states, including any `Syncing turn...` or missing-control state.

- [ ] **Step 7: Run unreliable profile**

Repeat Step 5 with:

```bash
PROFILE=unreliable-dev-ios
mkdir -p "output/network-bench/$RUN_ID/$PROFILE/screenshots"
mitmdump \
  --listen-host 127.0.0.1 \
  --listen-port 8080 \
  --set "koto_profile=scripts/network-bench/profiles/$PROFILE.json" \
  --set "koto_output=output/network-bench/$RUN_ID/$PROFILE/flows.jsonl" \
  -s scripts/network-bench/mitm_koto_bench.py
```

Expected: route captures failure/recovery behavior. If combat is blocked before entry, record the visible blocker in `output/network-bench/$RUN_ID/unreliable-dev-ios/route-notes.md`.

- [ ] **Step 8: Run combat API slow profile**

Repeat Step 5 with:

```bash
PROFILE=combat-api-slow-dev-ios
mkdir -p "output/network-bench/$RUN_ID/$PROFILE/screenshots"
mitmdump \
  --listen-host 127.0.0.1 \
  --listen-port 8080 \
  --set "koto_profile=scripts/network-bench/profiles/$PROFILE.json" \
  --set "koto_output=output/network-bench/$RUN_ID/$PROFILE/flows.jsonl" \
  -s scripts/network-bench/mitm_koto_bench.py
```

Expected: non-combat assets are not delayed by the profile, and combat turn synchronization delays are visible if the UI still waits after optimistic playback.

- [ ] **Step 9: Verify artifacts**

Run:

```bash
for PROFILE in baseline-dev-ios slow-dev-ios unreliable-dev-ios combat-api-slow-dev-ios; do
  test -s "output/network-bench/$RUN_ID/$PROFILE/flows.jsonl"
  test -s "output/network-bench/$RUN_ID/$PROFILE/app.log"
done
```

Expected: all `flows.jsonl` and `app.log` files are non-empty. If a profile could not produce an app log, create `output/network-bench/$RUN_ID/$PROFILE/app.log` with a one-line explanation of the capture failure before summarizing.

- [ ] **Step 10: Restore proxy settings**

If host-level proxying was used, run:

```bash
networksetup -setwebproxystate "Wi-Fi" off
networksetup -setsecurewebproxystate "Wi-Fi" off
```

Expected: host traffic no longer routes through mitmproxy. If the active service was not `Wi-Fi`, use the service recorded before enabling the proxy.

## Task 7: Generate And Commit Benchmark Report

**Files:**
- Create: `docs/reports/2026-06-06-dev-ios-combat-network-benchmark.md`

- [ ] **Step 1: Summarize live run**

Run:

```bash
node scripts/network-bench/summarize-run.mjs --run-dir "output/network-bench/$RUN_ID"
```

Expected: writes per-profile `summary.json` files and `output/network-bench/$RUN_ID/summary.json`.

- [ ] **Step 2: Generate report skeleton**

Run:

```bash
node scripts/network-bench/generate-report.mjs \
  --summary "output/network-bench/$RUN_ID/summary.json" \
  --out docs/reports/2026-06-06-dev-ios-combat-network-benchmark.md
```

Expected: report file exists.

- [ ] **Step 3: Replace generated findings with evidence-backed ranked findings**

Edit `docs/reports/2026-06-06-dev-ios-combat-network-benchmark.md` so every finding uses this exact structure:

```markdown
### Finding 1: Combat action waits after optimistic playback

**Severity:** High | Medium | Low
**Confidence:** High | Medium | Low
**Profiles:** baseline-dev-ios | slow-dev-ios | unreliable-dev-ios | combat-api-slow-dev-ios

**Symptom:** Describe the observed iOS screen state in one sentence.

**Evidence:**
- Proxy: Name the path, category, status, duration, and injected delay from `flows.jsonl` or `summary.json`.
- App: Name the API Timing line, Combat Timing line, phase, screenshot filename, or route note that proves the visible symptom.

**Likely Cause:** Choose one bucket: `network_request`, `server_resolve_save`, `client_playback`, `verification_gap`, `recovery_fetch`, `asset_chunk_media`, `ui_control_gap`, or `unknown`.

**Follow-Up:** Name one concrete fix project or measurement follow-up.
```

The report must include at least three findings when the artifacts support them. If fewer than three findings are supported, write a section named `Insufficient Evidence` that lists which profiles ran and why fewer findings were justified.

- [ ] **Step 4: Record setup details**

Add these concrete setup fields to the report:

```markdown
- Commit SHA: paste the output of `/usr/bin/git rev-parse --short HEAD`.
- Run ID: paste the value printed when `$RUN_ID` was created.
- Origin: `https://jrpg-dev.up.railway.app`
- App surface: deployed dev iOS WebView
- Simulator: paste the simulator name and runtime from XcodeBuildMCP.
- mitmproxy: paste the first line of `mitmdump --version`.
- Account: paste the benchmark account username or dev tester account used for the run.
- Combat reached:
  - baseline-dev-ios: yes/no
  - slow-dev-ios: yes/no
  - unreliable-dev-ios: yes/no
  - combat-api-slow-dev-ios: yes/no
```

Expected: future reruns can reproduce the environment closely.

- [ ] **Step 5: Verify report does not reference production as target**

Run:

```bash
rg -n "jrpg-production|production app|production account" docs/reports/2026-06-06-dev-ios-combat-network-benchmark.md
```

Expected: no matches. The word `production` may appear only if the report explicitly says production was excluded.

- [ ] **Step 6: Commit report**

Run:

```bash
/usr/bin/git add docs/reports/2026-06-06-dev-ios-combat-network-benchmark.md
/usr/bin/git commit -m "docs: report dev ios combat network benchmark"
```

Expected: commit includes only the report.

## Task 8: Final Verification And Handoff

**Files:**
- Verify all committed benchmark tooling and report files.

- [ ] **Step 1: Run targeted verification**

Run:

```bash
python3 -m unittest tests/network_bench/test_profile_logic.py tests/network_bench/test_mitm_koto_bench.py
python3 -m py_compile scripts/network-bench/mitm_koto_bench.py scripts/network_bench/profile_logic.py
node --test tests/unit/network-bench/summary-lib.test.js
node --check scripts/network-bench/summarize-run.mjs
node --check scripts/network-bench/generate-report.mjs
```

Expected: PASS.

- [ ] **Step 2: Inspect git status**

Run:

```bash
/usr/bin/git status --short
```

Expected: no tracked source changes remain. Raw `output/network-bench/**` artifacts may exist but must not be staged.

- [ ] **Step 3: Merge to dev**

Run:

```bash
cd /Users/michiarohrssen/Documents/Claude/koto-dev
/usr/bin/git pull origin dev
/usr/bin/git merge feature/dev-ios-combat-network-benchmark
/usr/bin/git push origin dev
```

Expected: feature branch merges cleanly and `dev` pushes.

- [ ] **Step 4: Advance master after dev push**

Run:

```bash
cd /Users/michiarohrssen/Documents/Claude/koto-dev
/usr/bin/git push origin dev:master
```

Expected: `master` advances to the same commit as `dev`.

- [ ] **Step 5: Remove feature worktree**

Run:

```bash
cd /Users/michiarohrssen/Documents/Claude/koto-dev
/usr/bin/git worktree remove ../koto-wt-dev-ios-combat-network-benchmark
/usr/bin/git branch -d feature/dev-ios-combat-network-benchmark
```

Expected: worktree and local feature branch are removed.

- [ ] **Step 6: Final handoff**

Report:

```text
Benchmark run id: paste the run ID used for the live sweep
Profiles completed: baseline-dev-ios, slow-dev-ios, unreliable-dev-ios, combat-api-slow-dev-ios
Combat reached by profile: include one yes/no row for each completed profile
Report: docs/reports/2026-06-06-dev-ios-combat-network-benchmark.md
Top findings: list the titles of the first three ranked findings from the report
Verification: targeted Python/Node checks passed
Proxy cleanup: restored/unchanged
Raw artifacts: output/network-bench/$RUN_ID (not committed)
```

Expected: user has a concise summary plus a report path and can choose the next fix project from ranked evidence.
