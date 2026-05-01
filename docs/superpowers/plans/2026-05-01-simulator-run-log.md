# Simulator Run Log Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a simulator results run log that always plays the latest returned area option and reports per-run area, rewards, mastered words, regular combat pacing, and boss combat rounds.

**Architecture:** Keep storage event-backed: the runner enriches the existing `run_summary` event, and the results API normalizes those events into rows for the dashboard. Add small pure helpers for area selection, combat metric aggregation, and run-log row normalization so the behavior can be tested without running a full simulation.

**Tech Stack:** Node.js ES modules, Express, SQLite via better-sqlite3, node:test, vanilla browser JS

**Spec:** `docs/superpowers/specs/2026-05-01-simulator-run-log-design.md`

---

## File Structure

- Create `simulator/engine/run-metrics.js`: pure helpers for latest-area selection, area summary extraction, regular/boss combat metric aggregation, and final `run_summary` event data.
- Create `simulator/tests/unit/run-metrics.test.js`: unit tests for the runner helpers.
- Create `simulator/routes/run-log.js`: pure helper that builds normalized run-log rows from simulator events.
- Create `simulator/tests/unit/run-log.test.js`: unit tests for run-log normalization, including fallback derivation from `room_entered` events.
- Modify `simulator/engine/runner.js`: import helper functions, choose the latest returned area, collect per-run combat metrics, and log the enriched `run_summary`.
- Modify `simulator/routes/results.js`: expose `GET /api/results/:simId/run-log`.
- Create `simulator/tests/unit/results-routes.test.js`: route-level test for the new endpoint.
- Modify `simulator/public/js/api.js`: add `results.runLog(simId)`.
- Modify `simulator/public/js/results.js`: add the `Run Log` tab renderer.

No SQLite schema changes are needed.

## Task 1: Runner Metric Helpers

**Files:**
- Create: `simulator/engine/run-metrics.js`
- Test: `simulator/tests/unit/run-metrics.test.js`

- [ ] **Step 1: Write failing tests for latest-area selection and combat metrics**

Create `simulator/tests/unit/run-metrics.test.js`:

```js
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildRunSummaryEventData,
  createRunCombatMetrics,
  recordCombatResult,
  selectLatestAreaOption,
  summarizeRunCombatMetrics
} from '../../engine/run-metrics.js';

describe('run metrics helpers', () => {
  it('selects the last area from a wrapped area-options response', () => {
    const area = selectLatestAreaOption({
      areas: [
        { id: 'hajimari-no-hiroba', nameEn: 'Starting Meadow' },
        { id: 'wild-plains', nameEn: 'Wild Plains' }
      ]
    });

    assert.deepEqual(area, { id: 'wild-plains', nameEn: 'Wild Plains' });
  });

  it('selects the last area from a raw area-options array', () => {
    const area = selectLatestAreaOption([
      { areaId: 'one', nameEn: 'One' },
      { areaId: 'two', nameEn: 'Two' }
    ]);

    assert.deepEqual(area, { areaId: 'two', nameEn: 'Two' });
  });

  it('returns null when no area options are available', () => {
    assert.equal(selectLatestAreaOption({ areas: [] }), null);
    assert.equal(selectLatestAreaOption({ areas: null }), null);
    assert.equal(selectLatestAreaOption(null), null);
  });

  it('summarizes regular combat separately from boss combat', () => {
    const metrics = createRunCombatMetrics();

    recordCombatResult(metrics, 'encounter', { combat: { rounds: 2 } });
    recordCombatResult(metrics, 'npcBattle', { combat: { rounds: 5 } });
    recordCombatResult(metrics, 'boss', { combat: { rounds: 9 } });
    recordCombatResult(metrics, 'friendlyNpc', { outcome: 'cleared' });

    assert.deepEqual(summarizeRunCombatMetrics(metrics), {
      combatCount: 2,
      avgCombatRounds: 3.5,
      maxCombatRounds: 5,
      bossCombatRounds: 9
    });
  });

  it('uses zero regular metrics and null boss rounds when no combat is recorded', () => {
    assert.deepEqual(summarizeRunCombatMetrics(createRunCombatMetrics()), {
      combatCount: 0,
      avgCombatRounds: 0,
      maxCombatRounds: 0,
      bossCombatRounds: null
    });
  });

  it('builds the enriched run_summary event payload', () => {
    const metrics = createRunCombatMetrics();
    recordCombatResult(metrics, 'encounter', { combat: { rounds: 4 } });
    recordCombatResult(metrics, 'boss', { combat: { rounds: 8 } });

    const payload = buildRunSummaryEventData({
      wordsImmersed: 6,
      wordsMastered: [{ word: '猫', meaning: 'cat', exposures: 4 }],
      creaturesDefeated: 3,
      creaturesBefriended: 1,
      itemsCollected: 2
    }, {
      areaId: 'wild-plains',
      name: '野原',
      nameEn: 'Wild Plains'
    }, metrics, true);

    assert.deepEqual(payload, {
      areaId: 'wild-plains',
      areaName: 'Wild Plains',
      areaNameJa: '野原',
      wiped: true,
      completed: false,
      wordsImmersed: 6,
      wordsMastered: [{ word: '猫', meaning: 'cat', exposures: 4 }],
      creaturesDefeated: 3,
      creaturesBefriended: 1,
      itemsCollected: 2,
      combatCount: 1,
      avgCombatRounds: 4,
      maxCombatRounds: 4,
      bossCombatRounds: 8
    });
  });
});
```

- [ ] **Step 2: Run the new test and verify it fails**

Run: `cd simulator && npm run test:unit -- tests/unit/run-metrics.test.js`

Expected: FAIL with an import error because `simulator/engine/run-metrics.js` does not exist.

- [ ] **Step 3: Add the run metric helper module**

Create `simulator/engine/run-metrics.js`:

```js
/**
 * Pure helpers for simulator run selection and run_summary metrics.
 */

export function getAreaOptionsFromResponse(data) {
  const areas = data?.areas ?? data ?? [];
  return Array.isArray(areas) ? areas : [];
}

export function selectLatestAreaOption(data) {
  const areas = getAreaOptionsFromResponse(data);
  return areas.length > 0 ? areas[areas.length - 1] : null;
}

export function getAreaId(area) {
  return area?.id ?? area?.areaId ?? null;
}

export function summarizeArea(area) {
  return {
    areaId: getAreaId(area),
    areaName: area?.nameEn ?? area?.name ?? getAreaId(area) ?? 'Unknown',
    areaNameJa: area?.name ?? null
  };
}

export function createRunCombatMetrics() {
  return {
    regularRounds: [],
    bossCombatRounds: null
  };
}

function readPositiveRoundCount(result) {
  const rounds = Number(result?.combat?.rounds);
  return Number.isFinite(rounds) && rounds > 0 ? rounds : null;
}

export function recordCombatResult(metrics, roomType, result) {
  const rounds = readPositiveRoundCount(result);
  if (rounds === null) return metrics;

  if (roomType === 'boss') {
    metrics.bossCombatRounds = rounds;
  } else {
    metrics.regularRounds.push(rounds);
  }

  return metrics;
}

export function summarizeRunCombatMetrics(metrics) {
  const regularRounds = Array.isArray(metrics?.regularRounds) ? metrics.regularRounds : [];
  const combatCount = regularRounds.length;
  const totalRounds = regularRounds.reduce((sum, rounds) => sum + rounds, 0);
  const avgCombatRounds = combatCount > 0
    ? Math.round((totalRounds / combatCount) * 10) / 10
    : 0;
  const maxCombatRounds = combatCount > 0 ? Math.max(...regularRounds) : 0;
  const bossRounds = Number(metrics?.bossCombatRounds);

  return {
    combatCount,
    avgCombatRounds,
    maxCombatRounds,
    bossCombatRounds: Number.isFinite(bossRounds) && bossRounds > 0 ? bossRounds : null
  };
}

export function buildRunSummaryEventData(serverRunSummary = {}, selectedArea = null, combatMetrics = createRunCombatMetrics(), runWiped = false) {
  return {
    ...summarizeArea(selectedArea),
    wiped: runWiped,
    completed: !runWiped,
    wordsImmersed: serverRunSummary.wordsImmersed ?? 0,
    wordsMastered: serverRunSummary.wordsMastered ?? [],
    creaturesDefeated: serverRunSummary.creaturesDefeated ?? 0,
    creaturesBefriended: serverRunSummary.creaturesBefriended ?? 0,
    itemsCollected: serverRunSummary.itemsCollected ?? 0,
    ...summarizeRunCombatMetrics(combatMetrics)
  };
}
```

- [ ] **Step 4: Run helper tests and syntax check**

Run:

```bash
cd simulator
node --check engine/run-metrics.js && npm run test:unit -- tests/unit/run-metrics.test.js
```

Expected: PASS.

- [ ] **Step 5: Commit helper work**

```bash
git add simulator/engine/run-metrics.js simulator/tests/unit/run-metrics.test.js
git commit -m "$(cat <<'EOF'
test(simulator): add run summary metric helpers

Capture latest-area selection and regular-vs-boss combat pacing in pure helpers so runner wiring stays small.
EOF
)"
```

## Task 2: Runner Integration

**Files:**
- Modify: `simulator/engine/runner.js`
- Test: `simulator/tests/unit/run-metrics.test.js`

- [ ] **Step 1: Extend helper tests for `areaId` fallback**

Add this test inside `describe('run metrics helpers', () => { ... })` in `simulator/tests/unit/run-metrics.test.js`:

```js
  it('builds area summary fields from either id shape', () => {
    const payload = buildRunSummaryEventData({}, {
      areaId: 'school',
      nameEn: 'School',
      name: '学校'
    }, createRunCombatMetrics(), false);

    assert.equal(payload.areaId, 'school');
    assert.equal(payload.areaName, 'School');
    assert.equal(payload.areaNameJa, '学校');
  });
```

- [ ] **Step 2: Run test to verify helper coverage still passes**

Run: `cd simulator && npm run test:unit -- tests/unit/run-metrics.test.js`

Expected: PASS.

- [ ] **Step 3: Import helpers in the runner**

In `simulator/engine/runner.js`, replace the import block:

```js
import { createSimCaller } from './sim-call.js';
import { createTestUser, seedStartingVocab, advanceTime } from './auth.js';
import { getRoomHandler } from './rooms/index.js';
import { runCrestCycle } from './crest-cycle.js';
```

with:

```js
import { createSimCaller } from './sim-call.js';
import { createTestUser, seedStartingVocab, advanceTime } from './auth.js';
import { getRoomHandler } from './rooms/index.js';
import { runCrestCycle } from './crest-cycle.js';
import {
  buildRunSummaryEventData,
  createRunCombatMetrics,
  getAreaId,
  recordCombatResult,
  selectLatestAreaOption
} from './run-metrics.js';
```

- [ ] **Step 4: Initialize selected area and combat metrics per run**

In `simulator/engine/runner.js`, immediately after:

```js
        if (!startRunResult.ok) continue; // Skip this run if start fails
```

add:

```js
        let selectedArea = null;
        const combatMetrics = createRunCombatMetrics();
```

- [ ] **Step 5: Replace random area selection with latest returned option**

Replace the area-selection block in `simulator/engine/runner.js`:

```js
        // Pick an area
        const areasResult = await simCall('GET', '/api/game/area-options', null, `day ${day} run ${run} areas`);
        if (areasResult.ok) {
          const areas = areasResult.data?.areas ?? areasResult.data ?? [];
          if (areas.length > 0) {
            const area = areas[Math.floor(Math.random() * areas.length)];
            const areaId = area.id ?? area.areaId;
            await simCall('POST', '/api/game/select-area', { areaId }, `day ${day} run ${run} select area`);
          }
        }
```

with:

```js
        // Pick the latest returned area option while respecting game unlock rules.
        const areasResult = await simCall('GET', '/api/game/area-options', null, `day ${day} run ${run} areas`);
        if (areasResult.ok) {
          selectedArea = selectLatestAreaOption(areasResult.data);
          const areaId = getAreaId(selectedArea);
          if (areaId) {
            await simCall('POST', '/api/game/select-area', { areaId }, `day ${day} run ${run} select area`);
          }
        }
```

- [ ] **Step 6: Record combat metrics after each handled room**

In `simulator/engine/runner.js`, immediately after:

```js
          const result = await handler(simCall, roomData, handlerContext, logEvent);
```

add:

```js
          recordCombatResult(combatMetrics, roomType, result);
```

- [ ] **Step 7: Replace the run summary payload construction**

Replace:

```js
        const serverRunSummary = forfeitResult.data?.runSummary ?? {};
        logEvent(day, run, 0, 'run_summary', {
          wiped: runWiped,
          completed: !runWiped,
          wordsImmersed: serverRunSummary.wordsImmersed ?? 0,
          wordsMastered: serverRunSummary.wordsMastered ?? [],
          creaturesDefeated: serverRunSummary.creaturesDefeated ?? 0,
          creaturesBefriended: serverRunSummary.creaturesBefriended ?? 0,
          itemsCollected: serverRunSummary.itemsCollected ?? 0,
        });
```

with:

```js
        const serverRunSummary = forfeitResult.data?.runSummary ?? {};
        logEvent(day, run, 0, 'run_summary',
          buildRunSummaryEventData(serverRunSummary, selectedArea, combatMetrics, runWiped)
        );
```

- [ ] **Step 8: Run syntax check and helper tests**

Run:

```bash
cd simulator
node --check engine/runner.js && npm run test:unit -- tests/unit/run-metrics.test.js
```

Expected: PASS.

- [ ] **Step 9: Commit runner integration**

```bash
git add simulator/engine/runner.js simulator/tests/unit/run-metrics.test.js
git commit -m "$(cat <<'EOF'
feat(simulator): record area and combat pacing per run

Select the latest returned area option and enrich run_summary events with regular and boss combat metrics.
EOF
)"
```

## Task 3: Run Log Normalization Helper

**Files:**
- Create: `simulator/routes/run-log.js`
- Test: `simulator/tests/unit/run-log.test.js`

- [ ] **Step 1: Write failing tests for run-log rows**

Create `simulator/tests/unit/run-log.test.js`:

```js
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildRunLogRows } from '../../routes/run-log.js';

describe('run log result rows', () => {
  it('normalizes run_summary events into run-log rows', () => {
    const rows = buildRunLogRows([
      {
        id: 1,
        day: 1,
        run: 1,
        room: 0,
        event_type: 'run_summary',
        data: {
          areaId: 'wild-plains',
          areaName: 'Wild Plains',
          areaNameJa: '野原',
          completed: true,
          wiped: false,
          creaturesBefriended: 1,
          itemsCollected: 2,
          wordsMastered: [{ word: '猫', meaning: 'cat', exposures: 4 }],
          combatCount: 5,
          avgCombatRounds: 3.2,
          maxCombatRounds: 6,
          bossCombatRounds: 9
        }
      }
    ]);

    assert.deepEqual(rows, [{
      day: 1,
      run: 1,
      areaId: 'wild-plains',
      areaName: 'Wild Plains',
      areaNameJa: '野原',
      completed: true,
      wiped: false,
      creaturesBefriended: 1,
      itemsCollected: 2,
      wordsMastered: [{ word: '猫', meaning: 'cat', exposures: 4 }],
      wordsMasteredCount: 1,
      combatCount: 5,
      avgCombatRounds: 3.2,
      maxCombatRounds: 6,
      bossCombatRounds: 9
    }]);
  });

  it('derives regular and boss combat metrics from room_entered events when summary fields are missing', () => {
    const rows = buildRunLogRows([
      { id: 1, day: 1, run: 1, room: 1, event_type: 'room_entered', data: { roomType: 'encounter', outcome: 'cleared', rounds: 2 } },
      { id: 2, day: 1, run: 1, room: 2, event_type: 'room_entered', data: { roomType: 'npcBattle', outcome: 'cleared', rounds: 4 } },
      { id: 3, day: 1, run: 1, room: 9, event_type: 'room_entered', data: { roomType: 'boss', outcome: 'cleared', rounds: 8 } },
      { id: 4, day: 1, run: 1, room: 0, event_type: 'run_summary', data: { completed: true, areaName: 'Wild Plains' } }
    ]);

    assert.equal(rows[0].combatCount, 2);
    assert.equal(rows[0].avgCombatRounds, 3);
    assert.equal(rows[0].maxCombatRounds, 4);
    assert.equal(rows[0].bossCombatRounds, 8);
  });

  it('uses null boss rounds when a run does not reach a boss', () => {
    const rows = buildRunLogRows([
      { id: 1, day: 2, run: 1, room: 1, event_type: 'room_entered', data: { roomType: 'encounter', outcome: 'wiped', rounds: 7 } },
      { id: 2, day: 2, run: 1, room: 0, event_type: 'run_summary', data: { wiped: true } }
    ]);

    assert.equal(rows[0].combatCount, 1);
    assert.equal(rows[0].avgCombatRounds, 7);
    assert.equal(rows[0].maxCombatRounds, 7);
    assert.equal(rows[0].bossCombatRounds, null);
  });

  it('defaults missing collection and word fields safely', () => {
    const rows = buildRunLogRows([
      { id: 1, day: 3, run: 2, room: 0, event_type: 'run_summary', data: {} }
    ]);

    assert.equal(rows[0].areaName, 'Unknown');
    assert.equal(rows[0].creaturesBefriended, 0);
    assert.equal(rows[0].itemsCollected, 0);
    assert.deepEqual(rows[0].wordsMastered, []);
    assert.equal(rows[0].wordsMasteredCount, 0);
    assert.equal(rows[0].combatCount, 0);
    assert.equal(rows[0].avgCombatRounds, 0);
    assert.equal(rows[0].maxCombatRounds, 0);
    assert.equal(rows[0].bossCombatRounds, null);
  });
});
```

- [ ] **Step 2: Run new test to verify it fails**

Run: `cd simulator && npm run test:unit -- tests/unit/run-log.test.js`

Expected: FAIL with an import error because `simulator/routes/run-log.js` does not exist.

- [ ] **Step 3: Add the run-log normalization module**

Create `simulator/routes/run-log.js`:

```js
function numericOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function numericOrDefault(value, fallback) {
  const number = numericOrNull(value);
  return number === null ? fallback : number;
}

function runKey(day, run) {
  return `${day}:${run}`;
}

function summarizeRounds(rounds, bossCombatRounds) {
  const combatCount = rounds.length;
  const totalRounds = rounds.reduce((sum, value) => sum + value, 0);
  return {
    combatCount,
    avgCombatRounds: combatCount > 0 ? Math.round((totalRounds / combatCount) * 10) / 10 : 0,
    maxCombatRounds: combatCount > 0 ? Math.max(...rounds) : 0,
    bossCombatRounds
  };
}

function deriveCombatByRun(events) {
  const byRun = new Map();

  for (const event of events) {
    if (event.event_type !== 'room_entered') continue;
    const rounds = numericOrNull(event.data?.rounds);
    if (rounds === null || rounds <= 0) continue;

    const key = runKey(event.day, event.run);
    if (!byRun.has(key)) {
      byRun.set(key, { regularRounds: [], bossCombatRounds: null });
    }

    const metrics = byRun.get(key);
    if (event.data?.roomType === 'boss') {
      metrics.bossCombatRounds = rounds;
    } else {
      metrics.regularRounds.push(rounds);
    }
  }

  const summaries = new Map();
  for (const [key, metrics] of byRun.entries()) {
    summaries.set(key, summarizeRounds(metrics.regularRounds, metrics.bossCombatRounds));
  }
  return summaries;
}

function normalizeWordsMastered(wordsMastered) {
  return Array.isArray(wordsMastered) ? wordsMastered : [];
}

export function buildRunLogRows(events = []) {
  const combatByRun = deriveCombatByRun(events);

  return events
    .filter(event => event.event_type === 'run_summary')
    .map(event => {
      const data = event.data || {};
      const fallbackCombat = combatByRun.get(runKey(event.day, event.run)) || {
        combatCount: 0,
        avgCombatRounds: 0,
        maxCombatRounds: 0,
        bossCombatRounds: null
      };
      const wordsMastered = normalizeWordsMastered(data.wordsMastered);
      const bossRounds = data.bossCombatRounds === null
        ? null
        : numericOrNull(data.bossCombatRounds);

      return {
        day: event.day,
        run: event.run,
        areaId: data.areaId ?? null,
        areaName: data.areaName ?? data.areaId ?? 'Unknown',
        areaNameJa: data.areaNameJa ?? null,
        completed: Boolean(data.completed),
        wiped: Boolean(data.wiped),
        creaturesBefriended: numericOrDefault(data.creaturesBefriended, 0),
        itemsCollected: numericOrDefault(data.itemsCollected, 0),
        wordsMastered,
        wordsMasteredCount: wordsMastered.length,
        combatCount: numericOrDefault(data.combatCount, fallbackCombat.combatCount),
        avgCombatRounds: numericOrDefault(data.avgCombatRounds, fallbackCombat.avgCombatRounds),
        maxCombatRounds: numericOrDefault(data.maxCombatRounds, fallbackCombat.maxCombatRounds),
        bossCombatRounds: bossRounds ?? fallbackCombat.bossCombatRounds
      };
    });
}
```

- [ ] **Step 4: Run helper tests and syntax check**

Run:

```bash
cd simulator
node --check routes/run-log.js && npm run test:unit -- tests/unit/run-log.test.js
```

Expected: PASS.

- [ ] **Step 5: Commit run-log helper**

```bash
git add simulator/routes/run-log.js simulator/tests/unit/run-log.test.js
git commit -m "$(cat <<'EOF'
test(simulator): normalize run log rows from events

Build event-backed run-log rows with regular combat metrics separated from boss rounds.
EOF
)"
```

## Task 4: Results API Endpoint

**Files:**
- Modify: `simulator/routes/results.js`
- Test: `simulator/tests/unit/results-routes.test.js`

- [ ] **Step 1: Write failing route test for `/run-log`**

Create `simulator/tests/unit/results-routes.test.js`:

```js
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createStore } from '../../db/store.js';
import createResultRoutes from '../../routes/results.js';

async function withResultServer(testFn) {
  const tmpDir = mkdtempSync(join(tmpdir(), 'koto-sim-routes-'));
  const store = createStore(join(tmpDir, 'test.db'));
  const app = express();
  app.use(express.json());
  app.use('/api/results', createResultRoutes(store, 'http://example.test', 'secret'));
  const server = await new Promise(resolve => {
    const listener = app.listen(0, () => resolve(listener));
  });

  try {
    const baseUrl = `http://127.0.0.1:${server.address().port}`;
    await testFn({ store, baseUrl });
  } finally {
    await new Promise(resolve => server.close(resolve));
    store.close();
    rmSync(tmpDir, { recursive: true, force: true });
  }
}

describe('result routes', () => {
  it('returns normalized run-log rows', async () => {
    await withResultServer(async ({ store, baseUrl }) => {
      const profileId = store.createProfile('route-profile', {});
      const simId = store.createSimulation(profileId);
      store.logEvent(simId, 1, 1, 1, 'room_entered', { roomType: 'encounter', outcome: 'cleared', rounds: 2 });
      store.logEvent(simId, 1, 1, 9, 'room_entered', { roomType: 'boss', outcome: 'cleared', rounds: 8 });
      store.logEvent(simId, 1, 1, 0, 'run_summary', {
        areaId: 'wild-plains',
        areaName: 'Wild Plains',
        completed: true,
        creaturesBefriended: 1,
        itemsCollected: 2,
        wordsMastered: [{ word: '猫' }]
      });

      const response = await fetch(`${baseUrl}/api/results/${simId}/run-log`);
      assert.equal(response.status, 200);
      const rows = await response.json();

      assert.equal(rows.length, 1);
      assert.equal(rows[0].areaName, 'Wild Plains');
      assert.equal(rows[0].combatCount, 1);
      assert.equal(rows[0].avgCombatRounds, 2);
      assert.equal(rows[0].maxCombatRounds, 2);
      assert.equal(rows[0].bossCombatRounds, 8);
      assert.equal(rows[0].wordsMasteredCount, 1);
    });
  });
});
```

- [ ] **Step 2: Run route test and verify it fails**

Run: `cd simulator && npm run test:unit -- tests/unit/results-routes.test.js`

Expected: FAIL with HTTP 404 for `/api/results/:simId/run-log`.

- [ ] **Step 3: Import the run-log builder in results routes**

In `simulator/routes/results.js`, add this import after the Express import:

```js
import { buildRunLogRows } from './run-log.js';
```

- [ ] **Step 4: Add the run-log route before the generic `/:simId/events` route**

In `simulator/routes/results.js`, add this route after the snapshots route and before `router.get('/:simId/events', ...)`:

```js
  // Get normalized run log rows for a simulation
  router.get('/:simId/run-log', (req, res) => {
    try {
      const events = store.getEvents(Number(req.params.simId));
      res.json(buildRunLogRows(events));
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
```

- [ ] **Step 5: Run route tests and existing result-adjacent tests**

Run:

```bash
cd simulator
node --check routes/results.js && npm run test:unit -- tests/unit/run-log.test.js tests/unit/results-routes.test.js tests/unit/store.test.js
```

Expected: PASS.

- [ ] **Step 6: Commit route endpoint**

```bash
git add simulator/routes/results.js simulator/tests/unit/results-routes.test.js
git commit -m "$(cat <<'EOF'
feat(simulator): expose run log results endpoint

Return normalized per-run rows from existing event data for the dashboard Run Log tab.
EOF
)"
```

## Task 5: Dashboard API Client

**Files:**
- Modify: `simulator/public/js/api.js`

- [ ] **Step 1: Add the client method**

In `simulator/public/js/api.js`, replace the `results` export:

```js
export const results = {
  snapshots: (simId) => api('GET', `/api/results/${simId}/snapshots`),
  events: (simId, filters = {}) => {
    const params = new URLSearchParams();
    if (filters.day !== undefined) params.set('day', filters.day);
    if (filters.type !== undefined) params.set('type', filters.type);
    if (filters.limit !== undefined) params.set('limit', filters.limit);
    const qs = params.toString();
    return api('GET', `/api/results/${simId}/events${qs ? '?' + qs : ''}`);
  },
  eventCounts: (simId) => api('GET', `/api/results/${simId}/event-counts`),
  vocabulary: (simId) => api('GET', `/api/results/${simId}/vocabulary`),
  compare: (simIds) => api('POST', '/api/results/compare', { simIds }),
};
```

with:

```js
export const results = {
  snapshots: (simId) => api('GET', `/api/results/${simId}/snapshots`),
  events: (simId, filters = {}) => {
    const params = new URLSearchParams();
    if (filters.day !== undefined) params.set('day', filters.day);
    if (filters.type !== undefined) params.set('type', filters.type);
    if (filters.limit !== undefined) params.set('limit', filters.limit);
    const qs = params.toString();
    return api('GET', `/api/results/${simId}/events${qs ? '?' + qs : ''}`);
  },
  eventCounts: (simId) => api('GET', `/api/results/${simId}/event-counts`),
  runLog: (simId) => api('GET', `/api/results/${simId}/run-log`),
  vocabulary: (simId) => api('GET', `/api/results/${simId}/vocabulary`),
  compare: (simIds) => api('POST', '/api/results/compare', { simIds }),
};
```

- [ ] **Step 2: Run syntax check**

Run: `node --check simulator/public/js/api.js && echo "OK"`

Expected: `OK`.

- [ ] **Step 3: Commit dashboard API method**

```bash
git add simulator/public/js/api.js
git commit -m "$(cat <<'EOF'
feat(simulator): add run log API client

Expose the new run-log results endpoint to dashboard tabs.
EOF
)"
```

## Task 6: Run Log Results Tab

**Files:**
- Modify: `simulator/public/js/results.js`

- [ ] **Step 1: Add formatting helpers above `renderStatsTab`**

In `simulator/public/js/results.js`, insert this code after `renderTabs`:

```js
function formatNumber(value, digits = 1) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '0';
  return Number.isInteger(number) ? String(number) : number.toFixed(digits);
}

function formatBossRounds(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? String(number) : 'N/A';
}

function formatMasteredWords(words) {
  if (!Array.isArray(words) || words.length === 0) return '';

  return words.map(entry => {
    if (typeof entry === 'string') return esc(entry);
    const word = entry?.word ?? '?';
    const meaning = entry?.meaning ? ` - ${entry.meaning}` : '';
    const exposures = Number.isFinite(Number(entry?.exposures)) ? ` (${entry.exposures} exposures)` : '';
    return `${esc(word)}${esc(meaning)}${esc(exposures)}`;
  }).join('<br>');
}
```

- [ ] **Step 2: Add the run log tab renderer before `renderDialogueTab`**

In `simulator/public/js/results.js`, add this function before `async function renderDialogueTab(contentEl, simId) {`:

```js
async function renderRunLogTab(contentEl, simId) {
  contentEl.innerHTML = '<div class="empty-state">Loading run log...</div>';

  let rows;
  try {
    rows = await results.runLog(simId);
  } catch (err) {
    contentEl.innerHTML = `<div class="empty-state">Error: ${esc(err.message)}</div>`;
    return;
  }

  if (!rows || rows.length === 0) {
    contentEl.innerHTML = '<div class="empty-state">No run summaries yet.</div>';
    return;
  }

  const totalCreatures = rows.reduce((sum, row) => sum + (Number(row.creaturesBefriended) || 0), 0);
  const totalItems = rows.reduce((sum, row) => sum + (Number(row.itemsCollected) || 0), 0);
  const totalMastered = rows.reduce((sum, row) => sum + (Number(row.wordsMasteredCount) || 0), 0);
  const regularMax = rows.reduce((max, row) => Math.max(max, Number(row.maxCombatRounds) || 0), 0);
  const bossMax = rows.reduce((max, row) => Math.max(max, Number(row.bossCombatRounds) || 0), 0);
  const rowsWithRegularCombat = rows.filter(row => (Number(row.combatCount) || 0) > 0);
  const avgRegular = rowsWithRegularCombat.length > 0
    ? rowsWithRegularCombat.reduce((sum, row) => sum + (Number(row.avgCombatRounds) || 0), 0) / rowsWithRegularCombat.length
    : 0;

  contentEl.innerHTML = `
    <div class="summary-stats">
      <div class="stat-card">
        <div class="stat-value">${rows.length}</div>
        <div class="stat-label">Runs Logged</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${regularMax}</div>
        <div class="stat-label">Max Regular Rounds</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${bossMax > 0 ? bossMax : 'N/A'}</div>
        <div class="stat-label">Max Boss Rounds</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${formatNumber(avgRegular)}</div>
        <div class="stat-label">Avg Regular Rounds</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${totalCreatures}</div>
        <div class="stat-label">Creatures Befriended</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${totalItems}</div>
        <div class="stat-label">Items Collected</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${totalMastered}</div>
        <div class="stat-label">Words Mastered</div>
      </div>
    </div>

    <div class="vocab-table-wrap">
      <table class="vocab-table">
        <thead>
          <tr>
            <th>Day / Run</th>
            <th>Area</th>
            <th>Outcome</th>
            <th>Befriended</th>
            <th>Items</th>
            <th>Mastered</th>
            <th>Regular Fights</th>
            <th>Avg Regular</th>
            <th>Max Regular</th>
            <th>Boss Rounds</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map(row => {
            const masteredDetail = formatMasteredWords(row.wordsMastered);
            const masteredCell = masteredDetail
              ? `<details><summary>${row.wordsMasteredCount || 0}</summary>${masteredDetail}</details>`
              : String(row.wordsMasteredCount || 0);
            const outcome = row.wiped ? 'Wiped' : (row.completed ? 'Completed' : 'Stopped');
            return `
              <tr>
                <td>Day ${row.day}, Run ${row.run}</td>
                <td>${esc(row.areaName || row.areaId || 'Unknown')}</td>
                <td>${outcome}</td>
                <td>${row.creaturesBefriended || 0}</td>
                <td>${row.itemsCollected || 0}</td>
                <td>${masteredCell}</td>
                <td>${row.combatCount || 0}</td>
                <td>${formatNumber(row.avgCombatRounds)}</td>
                <td>${row.maxCombatRounds || 0}</td>
                <td>${formatBossRounds(row.bossCombatRounds)}</td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    </div>
  `;
}
```

- [ ] **Step 3: Add the Run Log tab**

In the `tabs` array in `renderResults`, replace:

```js
    { key: 'daily', label: 'Daily Detail' },
    { key: 'vocabulary', label: 'Vocabulary' },
```

with:

```js
    { key: 'daily', label: 'Daily Detail' },
    { key: 'runLog', label: 'Run Log' },
    { key: 'vocabulary', label: 'Vocabulary' },
```

- [ ] **Step 4: Wire the Run Log renderer**

In the `renderers` object in `renderResults`, replace:

```js
      daily: () => renderDailyDetailTab(contentEl, simId),
      vocabulary: () => renderVocabularyTab(contentEl, simId),
```

with:

```js
      daily: () => renderDailyDetailTab(contentEl, simId),
      runLog: () => renderRunLogTab(contentEl, simId),
      vocabulary: () => renderVocabularyTab(contentEl, simId),
```

- [ ] **Step 5: Run syntax check**

Run: `node --check simulator/public/js/results.js && echo "OK"`

Expected: `OK`.

- [ ] **Step 6: Commit dashboard tab**

```bash
git add simulator/public/js/results.js
git commit -m "$(cat <<'EOF'
feat(simulator): add run log results tab

Show per-run area, rewards, mastered words, regular combat pacing, and boss combat rounds.
EOF
)"
```

## Task 7: Verification And Documentation

**Files:**
- Modify: `docs/LEARNING_SIMULATOR.md`

- [ ] **Step 1: Update logged events documentation**

In `docs/LEARNING_SIMULATOR.md`, replace the logged events table:

```md
| Event | Data |
|---|---|
| `word_exposure` | Word, source (bark/npc/cid/discovery/speed_review), location |
| `word_learned` | Word, source, when FSRS card reaches Review state |
| `dialogue_seen` | Full Japanese text, source (CID/NPC/combat), NPC id |
| `combat_round` | Move used, damage, creatures involved |
| `room_entered` | Room type, outcome (cleared/wiped/skipped) |
| `api_error` | Endpoint, status code, error body, day/run/room context |
| `crest_cycle_*` | Crest automation lifecycle (`started`, `chest_opened`, `equipped`, `summary`, `error`) |
```

with:

```md
| Event | Data |
|---|---|
| `run_summary` | Per-run area, completion/wipe status, words immersed/mastered, creatures defeated/befriended, items collected, regular combat pacing, boss combat rounds |
| `dialogue_seen` | Full Japanese text, source (CID/NPC/combat), NPC id |
| `combat_round` | Move used, damage, creatures involved |
| `room_entered` | Room type, outcome (cleared/wiped/skipped), final combat rounds for combat rooms |
| `creature_befriended` | Creature id/name from successful befriend quiz |
| `item_acquired` | Item id/name from NPC shops and post-combat shops |
| `api_error` | Endpoint, status code, error body, day/run/room context |
| `crest_cycle_*` | Crest automation lifecycle (`started`, `chest_opened`, `equipped`, `summary`, `error`) |
```

- [ ] **Step 2: Update results tab documentation**

In `docs/LEARNING_SIMULATOR.md`, replace:

```md
Four tabs per simulation:

- **Progression** — Line chart of known words over time + new words per day
- **Daily Detail** — Per-day breakdown of runs, rooms, reviews
- **Dialogue** — Scrollable transcript of all Japanese text encountered, grouped by day
- **Errors** — API failures with endpoint, status code, and context
```

with:

```md
Results tabs per simulation:

- **Stats** — Aggregate run, learning, and collection stats
- **Progression** — Line chart of known words over time + new words per day
- **Daily Detail** — Per-day breakdown of runs, rooms, reviews
- **Run Log** — Per-run area, outcome, rewards, mastered words, regular combat pacing, and boss combat rounds
- **Vocabulary** — Word knowledge pulled from the game server for the simulation user
- **Dialogue** — Scrollable transcript of all Japanese text encountered, grouped by day
- **Errors** — API failures with endpoint, status code, and context
```

- [ ] **Step 3: Run full simulator unit test suite**

Run:

```bash
cd simulator
npm run test:unit
```

Expected: all simulator unit tests pass.

- [ ] **Step 4: Run syntax checks for changed JS files**

Run:

```bash
node --check simulator/engine/run-metrics.js && \
node --check simulator/engine/runner.js && \
node --check simulator/routes/run-log.js && \
node --check simulator/routes/results.js && \
node --check simulator/public/js/api.js && \
node --check simulator/public/js/results.js && \
echo "OK"
```

Expected: `OK`.

- [ ] **Step 5: Commit verification and docs**

```bash
git add docs/LEARNING_SIMULATOR.md
git commit -m "$(cat <<'EOF'
docs(simulator): document run log metrics

Describe run_summary analytics and the new Run Log results tab.
EOF
)"
```

## Task 8: Manual Smoke Check

**Files:**
- No file changes

- [ ] **Step 1: Start the game server if one is not already running**

Check terminals first. If no `npm run dev` game server is active, run:

```bash
ADMIN_SECRET=dev-secret npm run dev
```

Expected: Vite/game server starts and serves the game.

- [ ] **Step 2: Start the simulator**

In a second terminal:

```bash
cd simulator
ADMIN_SECRET=dev-secret GAME_SERVER_URL=http://localhost:3000 npm run dev
```

Expected: simulator starts at `http://localhost:3100`.

- [ ] **Step 3: Run a short simulator profile**

In the simulator dashboard, create or use a small profile with:

```json
{
  "durationDays": 1,
  "runsPerDay": 1,
  "dailyPlayMinutes": 30,
  "speedReviewAccuracy": 0.7,
  "wordDiscoveryAccuracy": 0.9,
  "combatSkill": 0.5,
  "startingVocab": [],
  "aiDialogueMode": "skip"
}
```

Start a simulation and wait for it to complete or produce at least one `run_summary`.

- [ ] **Step 4: Verify Run Log tab behavior**

Open the simulation results and click `Run Log`.

Expected:

- A row appears for each completed simulator run.
- The area column shows the selected area.
- Regular combat average and maximum exclude the boss fight.
- Boss rounds show a number if the boss was reached.
- Boss rounds show `N/A` if the run ended before a boss.
- Creatures befriended, items collected, and mastered words match the run summary values.

- [ ] **Step 5: Final status check**

Run:

```bash
git status --short
```

Expected: only intentional files from this plan are modified. Do not revert unrelated user changes.
