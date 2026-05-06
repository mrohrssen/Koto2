# Crystals Currency Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add persistent crystals, a once-per-UTC-day login award, and server-enforced costs for starting runs, translating dialogue, and dialogue Learn actions.

**Architecture:** Store crystals in `meta`, centralize all award/spend/idempotency behavior in one wallet service, and call that service from game and dialogue routes. The client displays balance and button costs, but the server remains authoritative for every award and spend.

**Tech Stack:** Node.js ES modules, Express routes, file-backed `GameManager` saves, `node:test`, `supertest`, browser-side vanilla JS modules, CSS in `public/game.css`.

---

## File Structure

- Create `src/game/services/crystal-wallet-service.js`: crystal constants, meta normalization, daily award, spend helpers, idempotency records, in-flight duplicate request guard.
- Create `tests/unit/game/crystal-wallet-service.test.js`: unit coverage for wallet service behavior.
- Modify `src/game/state.js`: default crystal fields in `createMetaProgression()`.
- Modify `src/game/manager-registry.js`: old-save backfill for crystal fields.
- Modify `src/game/loop.js`: expose crystal fields in `GameManager.getState()`.
- Create `src/routes/game/crystals.js`: authenticated daily login award route.
- Modify `src/routes/game/index.js`: mount crystal routes.
- Modify `src/routes/game/run.js`: spend 25 crystals before `gameManager.startRun()`.
- Create `tests/unit/routes/crystals-routes.test.js`: daily login and start-run crystal route tests.
- Modify `src/routes/index.js`: pass manager dependencies into dialogue routes.
- Modify `src/routes/dialogue.js`: charge 5 crystals for successful translations with idempotency.
- Modify `tests/unit/routes/dialogue-translate.test.js`: translation charging tests.
- Create `public/js/ui/crystals.js`: client render helpers for crystal costs, HUD balance, daily bonus modal, and insufficient-crystal messaging.
- Create `tests/unit/ui/crystals.test.js`: pure UI helper tests.
- Modify `public/index.html`: add crystal balance HUD chip.
- Modify `public/js/dom.js`: expose `crystalBalance`.
- Modify `public/game.css`: crystal HUD, modal, and inline button-cost styling.
- Modify `public/js/api.js`: daily claim API, translation idempotency argument, and insufficient-crystal response preservation.
- Modify `public/game.js`: claim daily crystals on authenticated boot, update HUD, handle insufficient start-run responses.
- Modify `public/js/ui/npc-dialogue-card.js`: inline crystal costs inside Translate/Learn buttons, idempotency key generation, in-flight guards, no-cost repeat state.
- Modify `tests/unit/ui/npc-dialogue-card.test.js`: paid button rendering and duplicate request behavior.

## Task 1: Crystal Wallet Service

**Files:**
- Create: `src/game/services/crystal-wallet-service.js`
- Create: `tests/unit/game/crystal-wallet-service.test.js`

- [ ] **Step 1: Write wallet service tests**

Create `tests/unit/game/crystal-wallet-service.test.js`:

```js
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  CRYSTAL_COSTS,
  CRYSTAL_REASONS,
  awardDailyLoginCrystals,
  createUtcDateString,
  ensureCrystalMeta,
  getCrystalBalance,
  prepareCrystalSpend,
  recordCrystalSpend,
  withCrystalActionInFlight
} from '../../../src/game/services/crystal-wallet-service.js';

describe('crystal wallet service', () => {
  it('backfills missing crystal meta fields', () => {
    const meta = {};
    ensureCrystalMeta(meta);

    assert.equal(meta.crystals, 0);
    assert.equal(meta.lastCrystalLoginDate, null);
    assert.deepEqual(meta.crystalCharges, {});
  });

  it('normalizes invalid crystal meta fields', () => {
    const meta = { crystals: -10, lastCrystalLoginDate: 42, crystalCharges: [] };
    ensureCrystalMeta(meta);

    assert.equal(meta.crystals, 0);
    assert.equal(meta.lastCrystalLoginDate, null);
    assert.deepEqual(meta.crystalCharges, {});
  });

  it('formats UTC dates as YYYY-MM-DD', () => {
    assert.equal(createUtcDateString(new Date('2026-05-06T23:59:59.000Z')), '2026-05-06');
  });

  it('awards daily crystals once per UTC date', () => {
    const meta = { crystals: 25 };

    const first = awardDailyLoginCrystals(meta, new Date('2026-05-06T01:00:00.000Z'));
    const second = awardDailyLoginCrystals(meta, new Date('2026-05-06T22:00:00.000Z'));
    const third = awardDailyLoginCrystals(meta, new Date('2026-05-07T00:00:00.000Z'));

    assert.deepEqual(first, { awarded: true, amount: 100, balance: 125, today: '2026-05-06' });
    assert.deepEqual(second, { awarded: false, amount: 0, balance: 125, today: '2026-05-06' });
    assert.deepEqual(third, { awarded: true, amount: 100, balance: 225, today: '2026-05-07' });
  });

  it('returns insufficient_crystals without mutating balance', () => {
    const meta = { crystals: 10 };
    const result = prepareCrystalSpend(meta, {
      reason: CRYSTAL_REASONS.startRun,
      key: 'run:start',
      cost: CRYSTAL_COSTS.startRun
    });

    assert.deepEqual(result, {
      ok: false,
      error: 'insufficient_crystals',
      cost: 25,
      balance: 10
    });
    assert.equal(meta.crystals, 10);
  });

  it('records a successful spend once for an idempotency key', () => {
    const meta = { crystals: 50 };
    const first = recordCrystalSpend(meta, {
      reason: CRYSTAL_REASONS.translate,
      key: 'dialogue:1',
      cost: CRYSTAL_COSTS.translate,
      now: new Date('2026-05-06T01:00:00.000Z')
    });
    const second = prepareCrystalSpend(meta, {
      reason: CRYSTAL_REASONS.translate,
      key: 'dialogue:1',
      cost: CRYSTAL_COSTS.translate
    });

    assert.equal(first.ok, true);
    assert.equal(first.crystals.charged, true);
    assert.equal(first.crystals.balance, 45);
    assert.equal(second.ok, true);
    assert.equal(second.crystals.charged, false);
    assert.equal(second.crystals.alreadyCharged, true);
    assert.equal(getCrystalBalance(meta), 45);
  });

  it('keeps translation and learn charges separate for the same key', () => {
    const meta = { crystals: 50 };
    recordCrystalSpend(meta, {
      reason: CRYSTAL_REASONS.translate,
      key: 'dialogue:1',
      cost: CRYSTAL_COSTS.translate
    });
    recordCrystalSpend(meta, {
      reason: CRYSTAL_REASONS.learn,
      key: 'dialogue:1',
      cost: CRYSTAL_COSTS.learn
    });

    assert.equal(meta.crystals, 30);
    assert.equal(Object.keys(meta.crystalCharges).length, 2);
  });

  it('joins duplicate in-flight actions for the same user/reason/key', async () => {
    let calls = 0;
    const run = () => withCrystalActionInFlight({
      userId: 'user-1',
      reason: CRYSTAL_REASONS.translate,
      key: 'dialogue:1',
      action: async () => {
        calls += 1;
        await new Promise(resolve => setTimeout(resolve, 5));
        return { ok: true, value: calls };
      }
    });

    const [first, second] = await Promise.all([run(), run()]);
    assert.deepEqual(first, { ok: true, value: 1 });
    assert.deepEqual(second, { ok: true, value: 1 });
    assert.equal(calls, 1);
  });

  it('prunes old charge records after the cap', () => {
    const meta = { crystals: 500 };
    for (let i = 0; i < 105; i += 1) {
      recordCrystalSpend(meta, {
        reason: CRYSTAL_REASONS.translate,
        key: `dialogue:${i}`,
        cost: 1,
        now: new Date(2026, 0, 1, 0, 0, i)
      });
    }

    assert.equal(Object.keys(meta.crystalCharges).length, 100);
    assert.equal(meta.crystalCharges['translate:dialogue:0'], undefined);
    assert.ok(meta.crystalCharges['translate:dialogue:104']);
  });
});
```

- [ ] **Step 2: Run wallet tests to verify they fail**

Run: `npm run test:unit -- tests/unit/game/crystal-wallet-service.test.js`

Expected: FAIL because `src/game/services/crystal-wallet-service.js` does not exist.

- [ ] **Step 3: Implement wallet service**

Create `src/game/services/crystal-wallet-service.js`:

```js
export const DAILY_CRYSTAL_BONUS = 100;
export const CRYSTAL_COSTS = {
  startRun: 25,
  translate: 5,
  learn: 15
};

export const CRYSTAL_REASONS = {
  startRun: 'start_run',
  translate: 'translate',
  learn: 'learn'
};

const MAX_CHARGE_RECORDS = 100;
const inFlightCrystalActions = new Map();

export function createUtcDateString(now = new Date()) {
  const date = now instanceof Date ? now : new Date(now);
  return date.toISOString().slice(0, 10);
}

export function ensureCrystalMeta(meta) {
  if (!meta || typeof meta !== 'object') {
    throw new Error('meta is required');
  }
  if (!Number.isFinite(meta.crystals) || meta.crystals < 0) {
    meta.crystals = 0;
  }
  meta.crystals = Math.floor(meta.crystals);
  if (typeof meta.lastCrystalLoginDate !== 'string') {
    meta.lastCrystalLoginDate = null;
  }
  if (!meta.crystalCharges || typeof meta.crystalCharges !== 'object' || Array.isArray(meta.crystalCharges)) {
    meta.crystalCharges = {};
  }
  return meta;
}

export function getCrystalBalance(meta) {
  ensureCrystalMeta(meta);
  return meta.crystals;
}

export function awardDailyLoginCrystals(meta, now = new Date()) {
  ensureCrystalMeta(meta);
  const today = createUtcDateString(now);
  if (meta.lastCrystalLoginDate === today) {
    return { awarded: false, amount: 0, balance: meta.crystals, today };
  }
  meta.crystals += DAILY_CRYSTAL_BONUS;
  meta.lastCrystalLoginDate = today;
  return { awarded: true, amount: DAILY_CRYSTAL_BONUS, balance: meta.crystals, today };
}

function chargeIdFor(reason, key) {
  return `${reason}:${String(key || '').trim()}`;
}

function hasCharge(meta, reason, key) {
  return !!meta.crystalCharges[chargeIdFor(reason, key)];
}

function pruneChargeRecords(meta) {
  const entries = Object.entries(meta.crystalCharges)
    .sort((a, b) => String(a[1].chargedAt || '').localeCompare(String(b[1].chargedAt || '')));
  while (entries.length > MAX_CHARGE_RECORDS) {
    const [oldestKey] = entries.shift();
    delete meta.crystalCharges[oldestKey];
  }
}

export function prepareCrystalSpend(meta, { reason, key, cost }) {
  ensureCrystalMeta(meta);
  const numericCost = Number(cost);
  if (!reason || !key || !Number.isFinite(numericCost) || numericCost <= 0) {
    throw new Error('reason, key, and positive cost are required');
  }
  if (hasCharge(meta, reason, key)) {
    return {
      ok: true,
      crystals: {
        cost: numericCost,
        charged: false,
        alreadyCharged: true,
        balance: meta.crystals
      }
    };
  }
  if (meta.crystals < numericCost) {
    return {
      ok: false,
      error: 'insufficient_crystals',
      cost: numericCost,
      balance: meta.crystals
    };
  }
  return {
    ok: true,
    crystals: {
      cost: numericCost,
      charged: false,
      alreadyCharged: false,
      balance: meta.crystals
    }
  };
}

export function recordCrystalSpend(meta, { reason, key, cost, now = new Date() }) {
  ensureCrystalMeta(meta);
  const prepared = prepareCrystalSpend(meta, { reason, key, cost });
  if (!prepared.ok || prepared.crystals.alreadyCharged) return prepared;

  meta.crystals -= cost;
  meta.crystalCharges[chargeIdFor(reason, key)] = {
    reason,
    key,
    cost,
    chargedAt: new Date(now).toISOString()
  };
  pruneChargeRecords(meta);

  return {
    ok: true,
    crystals: {
      cost,
      charged: true,
      alreadyCharged: false,
      balance: meta.crystals
    }
  };
}

export async function withCrystalActionInFlight({ userId, reason, key, action }) {
  if (!userId || !reason || !key || typeof action !== 'function') {
    throw new Error('userId, reason, key, and action are required');
  }

  const inFlightKey = `${userId}:${reason}:${key}`;
  if (inFlightCrystalActions.has(inFlightKey)) {
    return inFlightCrystalActions.get(inFlightKey);
  }

  const task = Promise.resolve()
    .then(action)
    .finally(() => inFlightCrystalActions.delete(inFlightKey));
  inFlightCrystalActions.set(inFlightKey, task);
  return task;
}

export function clearCrystalInFlightForTest() {
  inFlightCrystalActions.clear();
}
```

- [ ] **Step 4: Run wallet tests to verify they pass**

Run: `npm run test:unit -- tests/unit/game/crystal-wallet-service.test.js`

Expected: PASS.

- [ ] **Step 5: Checkpoint**

If the user has explicitly asked for commits, run:

```bash
git add src/game/services/crystal-wallet-service.js tests/unit/game/crystal-wallet-service.test.js
git commit -m "$(cat <<'EOF'
feat(game): add crystal wallet service

EOF
)"
```

## Task 2: Meta Defaults, Migration, And State Exposure

**Files:**
- Modify: `src/game/state.js`
- Modify: `src/game/manager-registry.js`
- Modify: `src/game/loop.js`
- Create: `tests/unit/game/crystal-meta-state.test.js`

- [ ] **Step 1: Write failing state and migration tests**

Create `tests/unit/game/crystal-meta-state.test.js`:

```js
import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createMetaProgression } from '../../../src/game/state.js';
import { GameManager } from '../../../src/game/loop.js';
import { getManager, clearManagersForTest } from '../../../src/game/manager-registry.js';
import { setDataDirForTest, resetDataDirForTest } from '../../../src/data-dir.js';

describe('crystal meta state', () => {
  afterEach(() => {
    clearManagersForTest();
    resetDataDirForTest();
  });

  it('createMetaProgression includes crystal defaults', () => {
    const meta = createMetaProgression();

    assert.equal(meta.crystals, 0);
    assert.equal(meta.lastCrystalLoginDate, null);
    assert.deepEqual(meta.crystalCharges, {});
  });

  it('GameManager.getState exposes crystal balance', () => {
    const gm = new GameManager();
    gm.initMeta();
    gm.meta.crystals = 125;

    const state = gm.getState();
    assert.equal(state.meta.crystals, 125);
    assert.equal(state.meta.lastCrystalLoginDate, null);
    assert.deepEqual(state.meta.crystalCharges, {});
  });

  it('manager registry migrates old saves missing crystal fields', () => {
    const dir = join(tmpdir(), `koto-crystal-meta-${Date.now()}`);
    mkdirSync(dir, { recursive: true });
    setDataDirForTest(dir);

    writeFileSync(join(dir, '.jrpg-save-user-1.json'), JSON.stringify({
      version: 2,
      player: null,
      meta: {
        lifetimeStats: {
          totalRuns: 0,
          runsCompleted: 0,
          runsFailed: 0,
          totalDamageDealt: 0,
          totalDamageTaken: 0,
          totalCreditsEarned: 0,
          highestAreasCleared: 0,
          totalPlayTime: 0,
          firstPlayDate: null,
          lastPlayDate: null
        },
        unlocks: [],
        achievements: [],
        creatureCollection: ['hikaribon', 'hanatchi', 'tsukimochi'],
        creatureCounts: { hikaribon: 1, hanatchi: 1, tsukimochi: 1 },
        befriendCount: {},
        bossesDefeated: [],
        levels: { highestUnlocked: 1, completed: [], current: null },
        npcBonds: {},
        prologueComplete: true,
        kanaMode: false,
        pvpTeams: [null, null, null],
        seenCidScripts: [],
        elementDrops: { fire: 0, water: 0, earth: 0, wood: 0, metal: 0 },
        fusionCores: 0,
        crests: [],
        equippedCrests: { fire: null, water: null, earth: null, wood: null, metal: null },
        itemsDiscovered: [],
        tutorialStep: 6,
        tutorialFireDropsGifted: false,
        tutorialFusionDataUnlocked: [],
        tutorialFusionCoreAwarded: false,
        tutorialFusionComplete: false
      },
      run: null,
      combat: null
    }, null, 2));

    const gm = getManager('user-1');
    assert.equal(gm.meta.crystals, 0);
    assert.equal(gm.meta.lastCrystalLoginDate, null);
    assert.deepEqual(gm.meta.crystalCharges, {});

    rmSync(dir, { recursive: true, force: true });
  });
});
```

- [ ] **Step 2: Run state tests to verify they fail**

Run: `npm run test:unit -- tests/unit/game/crystal-meta-state.test.js`

Expected: FAIL because crystal fields are not yet in meta/state/migration.

- [ ] **Step 3: Add default crystal fields**

Modify `src/game/state.js` inside `createMetaProgression()` after `fusionCores`:

```js
    // Premium API-gating currency collected outside runs (persistent)
    crystals: 0,
    lastCrystalLoginDate: null,
    crystalCharges: {},
```

- [ ] **Step 4: Backfill old saves**

Modify `src/game/manager-registry.js`:

```js
import { ensureCrystalMeta } from './services/crystal-wallet-service.js';
```

Inside the `if (data.meta) { ... }` migration block, after the `fusionCores` backfill:

```js
          const beforeCrystals = JSON.stringify({
            crystals: data.meta.crystals,
            lastCrystalLoginDate: data.meta.lastCrystalLoginDate,
            crystalCharges: data.meta.crystalCharges
          });
          ensureCrystalMeta(data.meta);
          const afterCrystals = JSON.stringify({
            crystals: data.meta.crystals,
            lastCrystalLoginDate: data.meta.lastCrystalLoginDate,
            crystalCharges: data.meta.crystalCharges
          });
          if (beforeCrystals !== afterCrystals) {
            needsSave = true;
          }
```

- [ ] **Step 5: Expose crystals in game state**

Modify `src/game/loop.js` in the `meta` object returned by `getState()`:

```js
        fusionCores: this.meta.fusionCores || 0,
        crystals: Number.isFinite(this.meta.crystals) ? this.meta.crystals : 0,
        lastCrystalLoginDate: this.meta.lastCrystalLoginDate || null,
        crystalCharges: this.meta.crystalCharges || {},
        crests: this.meta.crests || [],
```

- [ ] **Step 6: Run state tests**

Run: `npm run test:unit -- tests/unit/game/crystal-wallet-service.test.js tests/unit/game/crystal-meta-state.test.js`

Expected: PASS.

- [ ] **Step 7: Checkpoint**

If the user has explicitly asked for commits, run:

```bash
git add src/game/state.js src/game/manager-registry.js src/game/loop.js tests/unit/game/crystal-meta-state.test.js
git commit -m "$(cat <<'EOF'
feat(game): persist crystal balance in meta state

EOF
)"
```

## Task 3: Daily Login Route And Start-Run Cost

**Files:**
- Create: `src/routes/game/crystals.js`
- Modify: `src/routes/game/index.js`
- Modify: `src/routes/game/run.js`
- Create: `tests/unit/routes/crystals-routes.test.js`

- [ ] **Step 1: Write route tests**

Create `tests/unit/routes/crystals-routes.test.js`:

```js
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../../../src/app.js';
import { clearManagersForTest, getManager } from '../../../src/game/manager-registry.js';
import { resetDataDirForTest } from '../../../src/data-dir.js';

describe('crystal game routes', () => {
  beforeEach(() => {
    process.env.CRYSTAL_TEST_NOW = '2026-05-06T01:00:00.000Z';
  });

  afterEach(() => {
    delete process.env.CRYSTAL_TEST_NOW;
    clearManagersForTest();
    resetDataDirForTest();
  });

  it('awards daily login crystals once per UTC date', async () => {
    const app = createApp({ authBypass: true });

    const first = await request(app)
      .post('/api/game/crystals/daily-login')
      .send({})
      .expect(200);
    const second = await request(app)
      .post('/api/game/crystals/daily-login')
      .send({})
      .expect(200);

    assert.deepEqual(first.body, {
      ok: true,
      awarded: true,
      amount: 100,
      balance: 100,
      today: '2026-05-06'
    });
    assert.deepEqual(second.body, {
      ok: true,
      awarded: false,
      amount: 0,
      balance: 100,
      today: '2026-05-06'
    });
  });

  it('charges 25 crystals to start a run', async () => {
    const app = createApp({ authBypass: true });
    const gm = getManager('test-user');
    gm.initMeta();
    gm.meta.crystals = 50;
    gm.createPlayer('Tester');

    const res = await request(app)
      .post('/api/game/start-run')
      .send({})
      .expect(200);

    assert.equal(res.body.state.meta.crystals, 25);
    assert.equal(gm.meta.crystals, 25);
    assert.equal(!!gm.run, true);
  });

  it('rejects start-run when balance is too low without creating a run', async () => {
    const app = createApp({ authBypass: true });
    const gm = getManager('test-user');
    gm.initMeta();
    gm.meta.crystals = 10;
    gm.createPlayer('Tester');

    const res = await request(app)
      .post('/api/game/start-run')
      .send({})
      .expect(402);

    assert.deepEqual(res.body, {
      ok: false,
      error: 'insufficient_crystals',
      cost: 25,
      balance: 10
    });
    assert.equal(gm.meta.crystals, 10);
    assert.equal(gm.run, null);
  });
});
```

- [ ] **Step 2: Run route tests to verify they fail**

Run: `npm run test:unit -- tests/unit/routes/crystals-routes.test.js`

Expected: FAIL because `/api/game/crystals/daily-login` does not exist and `start-run` does not charge crystals.

- [ ] **Step 3: Create daily login route**

Create `src/routes/game/crystals.js`:

```js
import { Router } from 'express';
import { awardDailyLoginCrystals } from '../../game/services/crystal-wallet-service.js';

function nowForCrystalAward() {
  return process.env.NODE_ENV === 'test' && process.env.CRYSTAL_TEST_NOW
    ? new Date(process.env.CRYSTAL_TEST_NOW)
    : new Date();
}

export default function createCrystalRoutes() {
  const router = Router();

  router.post('/crystals/daily-login', (req, res) => {
    const meta = req.gameManager.getMeta();
    const result = awardDailyLoginCrystals(meta, nowForCrystalAward());
    if (result.awarded) req.saveGame();
    res.json({ ok: true, ...result });
  });

  return router;
}
```

- [ ] **Step 4: Mount daily login route**

Modify `src/routes/game/index.js`:

```js
import createCrystalRoutes from './crystals.js';
```

Mount before run routes:

```js
  // Mount crystal currency routes
  router.use(createCrystalRoutes());

  // Mount run routes
  router.use(createRunRoutes({
```

- [ ] **Step 5: Charge start-run**

Modify `src/routes/game/run.js` imports:

```js
import {
  CRYSTAL_COSTS,
  CRYSTAL_REASONS,
  prepareCrystalSpend,
  recordCrystalSpend
} from '../../game/services/crystal-wallet-service.js';
```

Inside `router.post('/start-run'...)`, before starter validation calls `gameManager.startRun(...)`:

```js
      const meta = gameManager.getMeta();
      const startRunChargeKey = `start-run:${Date.now()}`;
      const preparedSpend = prepareCrystalSpend(meta, {
        reason: CRYSTAL_REASONS.startRun,
        key: startRunChargeKey,
        cost: CRYSTAL_COSTS.startRun
      });
      if (!preparedSpend.ok) {
        return res.status(402).json(preparedSpend);
      }
```

Then after starter validation and immediately before `gameManager.startRun(...)`:

```js
      const spendResult = recordCrystalSpend(meta, {
        reason: CRYSTAL_REASONS.startRun,
        key: startRunChargeKey,
        cost: CRYSTAL_COSTS.startRun
      });
      if (!spendResult.ok) {
        return res.status(402).json(spendResult);
      }
```

- [ ] **Step 6: Run route tests**

Run: `npm run test:unit -- tests/unit/routes/crystals-routes.test.js`

Expected: PASS.

- [ ] **Step 7: Run affected integration helpers check**

Update `tests/integration/helpers/api-client.js` before running integration tests:

```js
    claimDailyCrystals: () => request('POST', '/api/game/crystals/daily-login', {}),
```

Then update integration flows and helpers that call `start-run` after a fresh login to call `await client.claimDailyCrystals();` after login and before `start-run`. The files already known to call `start-run` in authenticated flows are:

- `tests/integration/exposure-flow.test.js`
- `tests/integration/flows/combat.test.js`
- `tests/integration/flows/game-state.test.js`
- `tests/integration/flows/meta-progression.test.js`
- `tests/integration/flows/vocab-review.test.js`
- `tests/integration/flows/fusion.test.js`
- `tests/integration/helpers/game-flow.js`

Run: `npm run test:integration -- tests/integration/flows/game-state.test.js tests/integration/exposure-flow.test.js`

Expected: PASS.

- [ ] **Step 8: Checkpoint**

If the user has explicitly asked for commits, run:

```bash
git add src/routes/game/crystals.js src/routes/game/index.js src/routes/game/run.js tests/unit/routes/crystals-routes.test.js tests/integration/helpers/api-client.js tests/integration/flows tests/integration/exposure-flow.test.js
git commit -m "$(cat <<'EOF'
feat(game): charge crystals for daily login and run starts

EOF
)"
```

## Task 4: Charge Dialogue Translation After Success

**Files:**
- Modify: `src/routes/index.js`
- Modify: `src/routes/dialogue.js`
- Modify: `tests/unit/routes/dialogue-translate.test.js`

- [ ] **Step 1: Add failing translation charging tests**

Append to `tests/unit/routes/dialogue-translate.test.js`:

```js
import { getManager, clearManagersForTest } from '../../../src/game/manager-registry.js';
```

Add `afterEach` to clear managers:

```js
afterEach(() => {
  clearManagersForTest();
});
```

Add these tests inside the existing `describe('POST /api/dialogue/translate', ...)` block:

```js
  it('charges 5 crystals after a successful translation', async () => {
    const app = createApp({
      authBypass: true,
      routeOverrides: {
        dialogueTranslationCache: new DialogueTranslationCache({ inMemory: true }),
        dialogueTranslationChatFn: async () => 'Wait!',
        getDialogueTranslationConfig: () => ({ provider: 'openai', apiKey: 'key', model: 'gpt-5-mini' })
      }
    });
    const gm = getManager('test-user');
    gm.initMeta();
    gm.meta.crystals = 20;

    const res = await request(app)
      .post('/api/dialogue/translate')
      .send({ text: '待って！', idempotencyKey: 'encounter-1:page-0' })
      .expect(200);

    assert.equal(res.body.ok, true);
    assert.equal(res.body.translation, 'Wait!');
    assert.deepEqual(res.body.crystals, {
      cost: 5,
      charged: true,
      alreadyCharged: false,
      balance: 15
    });
    assert.equal(gm.meta.crystals, 15);
  });

  it('does not charge translation when the translation service is unavailable', async () => {
    const app = createApp({
      authBypass: true,
      routeOverrides: {
        dialogueTranslationCache: new DialogueTranslationCache({ inMemory: true }),
        dialogueTranslationChatFn: async () => 'Wait!',
        getDialogueTranslationConfig: () => null
      }
    });
    const gm = getManager('test-user');
    gm.initMeta();
    gm.meta.crystals = 20;

    const res = await request(app)
      .post('/api/dialogue/translate')
      .send({ text: '待って！', idempotencyKey: 'encounter-1:page-0' })
      .expect(503);

    assert.deepEqual(res.body, { ok: false, error: 'translation_unavailable' });
    assert.equal(gm.meta.crystals, 20);
  });

  it('does not double-charge repeat translation taps for the same idempotency key', async () => {
    const app = createApp({
      authBypass: true,
      routeOverrides: {
        dialogueTranslationCache: new DialogueTranslationCache({ inMemory: true }),
        dialogueTranslationChatFn: async () => 'Wait!',
        getDialogueTranslationConfig: () => ({ provider: 'openai', apiKey: 'key', model: 'gpt-5-mini' })
      }
    });
    const gm = getManager('test-user');
    gm.initMeta();
    gm.meta.crystals = 20;

    await request(app)
      .post('/api/dialogue/translate')
      .send({ text: '待って！', idempotencyKey: 'encounter-1:page-0' })
      .expect(200);

    const second = await request(app)
      .post('/api/dialogue/translate')
      .send({ text: '待って！', idempotencyKey: 'encounter-1:page-0' })
      .expect(200);

    assert.deepEqual(second.body.crystals, {
      cost: 5,
      charged: false,
      alreadyCharged: true,
      balance: 15
    });
    assert.equal(gm.meta.crystals, 15);
  });

  it('rejects translation before calling AI when crystals are insufficient', async () => {
    let called = false;
    const app = createApp({
      authBypass: true,
      routeOverrides: {
        dialogueTranslationCache: new DialogueTranslationCache({ inMemory: true }),
        dialogueTranslationChatFn: async () => { called = true; return 'Wait!'; },
        getDialogueTranslationConfig: () => ({ provider: 'openai', apiKey: 'key', model: 'gpt-5-mini' })
      }
    });
    const gm = getManager('test-user');
    gm.initMeta();
    gm.meta.crystals = 4;

    const res = await request(app)
      .post('/api/dialogue/translate')
      .send({ text: '待って！', idempotencyKey: 'encounter-1:page-0' })
      .expect(402);

    assert.deepEqual(res.body, {
      ok: false,
      error: 'insufficient_crystals',
      cost: 5,
      balance: 4
    });
    assert.equal(called, false);
  });
```

- [ ] **Step 2: Run translation route tests to verify they fail**

Run: `npm run test:unit -- tests/unit/routes/dialogue-translate.test.js`

Expected: FAIL because translation routes do not accept `idempotencyKey` or charge crystals.

- [ ] **Step 3: Pass manager dependencies into dialogue routes**

Modify `src/routes/index.js` import area:

```js
import { getManager, saveManager } from '../game/manager-registry.js';
```

Modify dialogue route creation:

```js
  router.use('/dialogue', createDialogueRoutes({
    dialogueTranslationCache: deps.dialogueTranslationCache,
    dialogueTranslationChatFn: deps.dialogueTranslationChatFn,
    getDialogueTranslationConfig: deps.getDialogueTranslationConfig,
    getManager: deps.getManager || getManager,
    saveManager: deps.saveManager || saveManager
  }));
```

- [ ] **Step 4: Charge translation after success**

Modify `src/routes/dialogue.js` imports:

```js
import {
  CRYSTAL_COSTS,
  CRYSTAL_REASONS,
  prepareCrystalSpend,
  recordCrystalSpend,
  withCrystalActionInFlight
} from '../game/services/crystal-wallet-service.js';
```

Modify the factory signature:

```js
export default function createDialogueRoutes({
  dialogueTranslationCache = new DialogueTranslationCache(),
  dialogueTranslationChatFn = chat,
  getDialogueTranslationConfig = buildDialogueTranslationConfig,
  getManager,
  saveManager
} = {}) {
```

Inside `/translate`, after empty text validation:

```js
    const idempotencyKey = String(req.body?.idempotencyKey || '').trim();
    if (!idempotencyKey) {
      return res.status(400).json({ ok: false, error: 'missing_idempotency_key' });
    }

    const gameManager = getManager(req.user.id);
    const meta = gameManager.getMeta();
    const preparedSpend = prepareCrystalSpend(meta, {
      reason: CRYSTAL_REASONS.translate,
      key: idempotencyKey,
      cost: CRYSTAL_COSTS.translate
    });
    if (!preparedSpend.ok) {
      return res.status(402).json(preparedSpend);
    }
```

Wrap translation resolution:

```js
    const response = await withCrystalActionInFlight({
      userId: req.user.id,
      reason: CRYSTAL_REASONS.translate,
      key: idempotencyKey,
      action: async () => {
        const latestSpend = prepareCrystalSpend(meta, {
          reason: CRYSTAL_REASONS.translate,
          key: idempotencyKey,
          cost: CRYSTAL_COSTS.translate
        });

        const result = await translateDialogueText({
          text,
          entities: req.body?.entities,
          cache: dialogueTranslationCache,
          chatFn: dialogueTranslationChatFn,
          config: getDialogueTranslationConfig()
        });

        if (!result.ok) {
          return { status: 503, body: result };
        }

        const spendResult = latestSpend.crystals?.alreadyCharged
          ? latestSpend
          : recordCrystalSpend(meta, {
              reason: CRYSTAL_REASONS.translate,
              key: idempotencyKey,
              cost: CRYSTAL_COSTS.translate
            });

        if (!spendResult.ok) {
          return { status: 402, body: spendResult };
        }

        saveManager(req.user.id);
        return {
          status: 200,
          body: {
            ...result,
            crystals: spendResult.crystals
          }
        };
      }
    });

    return res.status(response.status).json(response.body);
```

Keep the original empty-text behavior unchanged: empty text returns `translation_unavailable` and does not require an idempotency key.

- [ ] **Step 5: Update old translation tests**

Existing translation tests that send non-empty text must include `idempotencyKey` and enough balance:

```js
const gm = getManager('test-user');
gm.initMeta();
gm.meta.crystals = 100;
```

Add `.send({ text: '待って！', idempotencyKey: 'test:wait' })` style keys to all non-empty translation requests.

- [ ] **Step 6: Run translation route tests**

Run: `npm run test:unit -- tests/unit/routes/dialogue-translate.test.js`

Expected: PASS.

- [ ] **Step 7: Checkpoint**

If the user has explicitly asked for commits, run:

```bash
git add src/routes/index.js src/routes/dialogue.js tests/unit/routes/dialogue-translate.test.js
git commit -m "$(cat <<'EOF'
feat(dialogue): charge crystals for translations

EOF
)"
```

## Task 5: Client Crystal API, HUD, And Daily Bonus Modal

**Files:**
- Create: `public/js/ui/crystals.js`
- Create: `tests/unit/ui/crystals.test.js`
- Modify: `public/index.html`
- Modify: `public/js/dom.js`
- Modify: `public/game.css`
- Modify: `public/js/api.js`
- Modify: `public/game.js`

- [ ] **Step 1: Write UI helper tests**

Create `tests/unit/ui/crystals.test.js`:

```js
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  crystalCostHtml,
  updateCrystalBalance,
  showDailyCrystalBonusModal,
  removeDailyCrystalBonusModal
} from '../../../public/js/ui/crystals.js';

class FakeElement {
  constructor() {
    this.innerHTML = '';
    this.textContent = '';
    this.className = '';
    this.children = [];
    this.listeners = {};
  }
  addEventListener(type, handler) {
    this.listeners[type] = handler;
  }
  click() {
    this.listeners.click?.();
  }
  appendChild(child) {
    this.children.push(child);
    return child;
  }
  remove() {
    this.removed = true;
  }
  querySelector(selector) {
    return this.children.find(child => child.className.includes(selector.slice(1))) || null;
  }
}

describe('crystal UI helpers', () => {
  it('renders crystal cost markup for inside buttons', () => {
    assert.equal(
      crystalCostHtml(5),
      '<span class="crystal-cost" aria-label="5 crystals"><span class="crystal-icon" aria-hidden="true">◆</span><span class="crystal-cost-number">5</span></span>'
    );
  });

  it('updates the crystal balance chip', () => {
    const chip = new FakeElement();
    updateCrystalBalance(chip, 125);

    assert.match(chip.innerHTML, /crystal-icon/);
    assert.match(chip.innerHTML, /125/);
    assert.equal(chip.className, 'hud-chip crystal-balance');
  });

  it('shows and dismisses the daily bonus modal', () => {
    const body = new FakeElement();
    const documentLike = {
      body,
      createElement: () => new FakeElement()
    };

    const modal = showDailyCrystalBonusModal({ amount: 100, balance: 125, documentRef: documentLike });
    assert.equal(body.children.length, 1);
    assert.match(modal.innerHTML, /Daily Login Bonus/);
    assert.match(modal.innerHTML, /\+100/);
    assert.match(modal.innerHTML, /125/);

    removeDailyCrystalBonusModal(modal);
    assert.equal(modal.removed, true);
  });
});
```

- [ ] **Step 2: Run UI helper tests to verify they fail**

Run: `npm run test:unit -- tests/unit/ui/crystals.test.js`

Expected: FAIL because `public/js/ui/crystals.js` does not exist.

- [ ] **Step 3: Create crystal UI helper module**

Create `public/js/ui/crystals.js`:

```js
import { esc } from './bootstrap-client.js';

export function crystalCostHtml(cost) {
  const safeCost = Number.isFinite(Number(cost)) ? Math.max(0, Math.floor(Number(cost))) : 0;
  return `<span class="crystal-cost" aria-label="${safeCost} crystals"><span class="crystal-icon" aria-hidden="true">◆</span><span class="crystal-cost-number">${safeCost}</span></span>`;
}

export function updateCrystalBalance(el, balance) {
  if (!el) return;
  const safeBalance = Number.isFinite(Number(balance)) ? Math.max(0, Math.floor(Number(balance))) : 0;
  el.className = 'hud-chip crystal-balance';
  el.innerHTML = `<span class="crystal-icon" aria-hidden="true">◆</span><span class="crystal-balance-number">${safeBalance}</span>`;
  el.setAttribute?.('aria-label', `${safeBalance} crystals`);
}

export function showDailyCrystalBonusModal({ amount, balance, documentRef = document } = {}) {
  const doc = documentRef;
  const modal = doc.createElement('div');
  modal.className = 'crystal-daily-modal-backdrop';
  modal.innerHTML = `
    <section class="crystal-daily-modal" role="dialog" aria-modal="true" aria-label="Daily login bonus">
      <div class="crystal-daily-icon" aria-hidden="true">◆</div>
      <h2>Daily Login Bonus</h2>
      <p class="crystal-daily-award">+${esc(String(amount || 0))} Crystals</p>
      <p class="crystal-daily-balance">Balance: ${esc(String(balance || 0))}</p>
      <button class="crystal-daily-dismiss" type="button">Nice!</button>
    </section>
  `;
  doc.body.appendChild(modal);
  modal.querySelector?.('.crystal-daily-dismiss')?.addEventListener('click', () => removeDailyCrystalBonusModal(modal));
  return modal;
}

export function removeDailyCrystalBonusModal(modal) {
  modal?.remove?.();
}
```

- [ ] **Step 4: Add crystal HUD element**

Modify `public/index.html` inside `.top-hud-right`, before `#bots-btn`:

```html
          <span class="hud-chip crystal-balance" id="crystal-balance" aria-label="0 crystals">
            <span class="crystal-icon" aria-hidden="true">◆</span><span class="crystal-balance-number">0</span>
          </span>
```

Modify `public/js/dom.js`:

```js
  get crystalBalance() { return el('crystal-balance'); },
```

- [ ] **Step 5: Add CSS**

Modify `public/game.css` near HUD styles:

```css
.crystal-balance {
  gap: 5px;
  color: #d8f7ff;
}

.crystal-icon {
  color: #79e7ff;
  text-shadow: 0 0 8px rgba(121, 231, 255, 0.75);
}

.crystal-cost {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  margin-right: 8px;
  flex: 0 0 auto;
  font-weight: 800;
}

.crystal-daily-modal-backdrop {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: grid;
  place-items: center;
  padding: 24px;
  background: rgba(0, 0, 0, 0.45);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
}

.crystal-daily-modal {
  width: min(320px, 100%);
  border-radius: 24px;
  padding: 24px;
  text-align: center;
  color: #1c2430;
  background: linear-gradient(180deg, #f2fdff 0%, #d9f7ff 100%);
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.28);
}

.crystal-daily-icon {
  font-size: 40px;
  color: #13bce8;
  margin-bottom: 8px;
}

.crystal-daily-modal h2 {
  margin: 0 0 8px;
  font-size: 22px;
}

.crystal-daily-award {
  margin: 0;
  font-size: 24px;
  font-weight: 900;
}

.crystal-daily-balance {
  margin: 8px 0 18px;
  font-weight: 700;
}

.crystal-daily-dismiss {
  border: 0;
  border-radius: 14px;
  padding: 12px 18px;
  font-weight: 800;
  color: #fff;
  background: #159fd0;
}
```

- [ ] **Step 6: Add client API wrapper**

Modify `public/js/api.js` after `getSettings()` or near game state endpoints:

```js
async function claimDailyCrystals() {
  return apiCall('/crystals/daily-login', 'POST', {});
}
```

Export it in the default export list and named export list at the bottom of `public/js/api.js`.

- [ ] **Step 7: Claim daily crystals on authenticated boot**

Modify `public/game.js` imports:

```js
  claimDailyCrystals as apiClaimDailyCrystals,
```

Add:

```js
import { updateCrystalBalance, showDailyCrystalBonusModal } from './js/ui/crystals.js';
```

Update `updateStatusBar()` after `dom.essenceDisplay.textContent = ...`:

```js
  updateCrystalBalance(dom.crystalBalance, gameState.meta?.crystals || 0);
```

Add helper near `loadGameState()`:

```js
async function claimDailyCrystalBonus() {
  const result = await apiClaimDailyCrystals();
  if (!result?.ok) return;

  updateGameState({
    ...gameState,
    meta: {
      ...(gameState.meta || {}),
      crystals: result.balance,
      lastCrystalLoginDate: result.today
    }
  });
  updateCrystalBalance(dom.crystalBalance, result.balance);

  if (result.awarded) {
    showDailyCrystalBonusModal({ amount: result.amount, balance: result.balance });
  }
}
```

Call it in `initGame()` immediately after `await loadGameState();`:

```js
  await loadGameState();
  await claimDailyCrystalBonus();
```

- [ ] **Step 8: Handle insufficient crystals on start-run**

Modify `startNewRun()`:

```js
  const result = await apiStartRun({});
  if (result?.error === 'insufficient_crystals') {
    scene.showToast('Come back tomorrow for more crystals.', 3000);
    return;
  }
```

Also update `playPrologue()` first-run auto-start path with the same guard before selecting the first area:

```js
    const runResult = await apiStartRun({});
    if (runResult?.error === 'insufficient_crystals') {
      scene.showToast('Come back tomorrow for more crystals.', 3000);
      return;
    }
```

- [ ] **Step 9: Run UI helper and syntax checks**

Run:

```bash
npm run test:unit -- tests/unit/ui/crystals.test.js
node --check public/js/ui/crystals.js
node --check public/game.js
node --check public/js/api.js
```

Expected: PASS and `node --check` returns no syntax errors.

- [ ] **Step 10: Checkpoint**

If the user has explicitly asked for commits, run:

```bash
git add public/js/ui/crystals.js tests/unit/ui/crystals.test.js public/index.html public/js/dom.js public/game.css public/js/api.js public/game.js
git commit -m "$(cat <<'EOF'
feat(ui): show crystal balance and daily bonus

EOF
)"
```

## Task 6: Paid Dialogue Buttons And Learn Integration Boundary

**Files:**
- Modify: `public/js/api.js`
- Modify: `public/js/ui/npc-dialogue-card.js`
- Modify: `tests/unit/ui/npc-dialogue-card.test.js`

- [ ] **Step 1: Write dialogue-card tests**

Append tests to `tests/unit/ui/npc-dialogue-card.test.js`:

```js
  it('renders crystal costs inside Translate and Learn buttons', () => {
    showNpcDialogueCard({
      speaker: 'Mira',
      tokens: [{ surface: '待つ', baseForm: '待つ', reading: 'まつ', meaning: 'wait', pos: 'verb' }],
      knownWords: new Set(),
      onLearn: async () => ({ ok: true, crystals: { balance: 80 } })
    });

    assert.match(actionArea.innerHTML, /class="crystal-cost"/);
    assert.match(actionArea.innerHTML, /crystal-cost-number">5</);
    assert.match(actionArea.innerHTML, /crystal-cost-number">15</);
    assert.match(actionArea.innerHTML, /npc-dialogue-translate[\s\S]*crystal-cost[\s\S]*Translate/);
    assert.match(actionArea.innerHTML, /npc-dialogue-learn[\s\S]*crystal-cost[\s\S]*Learn/);
  });

  it('sends a stable translation idempotency key and blocks duplicate in-flight clicks', async () => {
    let resolveTranslation;
    translationResponse = new Promise(resolve => { resolveTranslation = resolve; });

    showNpcDialogueCard({
      speaker: 'Mira',
      encounterId: 'enc-1',
      tokens: [{ surface: '待って！', baseForm: '待つ', reading: 'まって', meaning: 'wait', pos: 'verb' }],
      knownWords: new Set(),
    });

    const [translateButton] = actionArea.querySelectorAll('.npc-dialogue-utility');
    translateButton.click();
    translateButton.click();

    assert.equal(translatedRequests.length, 1);
    assert.equal(translatedRequests[0].idempotencyKey.includes('translate:'), true);

    resolveTranslation({ ok: true, translation: 'Wait!', crystals: { balance: 95 } });
    await new Promise(resolve => setTimeout(resolve, 0));
  });

  it('calls injected Learn action once with a learn idempotency key', async () => {
    const learnRequests = [];
    showNpcDialogueCard({
      speaker: 'Mira',
      encounterId: 'enc-1',
      tokens: [{ surface: '待って！', baseForm: '待つ', reading: 'まって', meaning: 'wait', pos: 'verb' }],
      knownWords: new Set(),
      onLearn: async (payload) => {
        learnRequests.push(payload);
        return { ok: true, crystals: { balance: 80 } };
      }
    });

    const [, learnButton] = actionArea.querySelectorAll('.npc-dialogue-utility');
    learnButton.click();
    learnButton.click();

    await new Promise(resolve => setTimeout(resolve, 0));

    assert.equal(learnRequests.length, 1);
    assert.equal(learnRequests[0].idempotencyKey.includes('learn:'), true);
    assert.equal(learnRequests[0].sourceText, '待って！');
  });
```

Update the `translateDialogue` mock near the top of the file to capture the third argument:

```js
    translateDialogue: async (text, entities = [], idempotencyKey = '') => {
      translatedRequests.push({ text, entities, idempotencyKey });
      return translationResponse;
    }
```

- [ ] **Step 2: Run dialogue-card tests to verify they fail**

Run: `npm run test:unit -- tests/unit/ui/npc-dialogue-card.test.js`

Expected: FAIL because costs, idempotency keys, and Learn callbacks are not wired.

- [ ] **Step 3: Update translation API wrapper**

Modify `public/js/api.js`:

```js
export async function translateDialogue(text, entities = [], idempotencyKey = '') {
```

Inside the request body setup:

```js
    if (idempotencyKey) body.idempotencyKey = idempotencyKey;
```

When returning an error, preserve crystal error details:

```js
      return {
        ok: false,
        error: data?.error || 'translation_unavailable',
        cost: data?.cost,
        balance: data?.balance
      };
```

- [ ] **Step 4: Add dialogue idempotency helpers**

Modify `public/js/ui/npc-dialogue-card.js` imports:

```js
import { crystalCostHtml } from './crystals.js';
```

Add helper functions near `getDialogueSourceText()`:

```js
function stableEntitySignature(entities = []) {
  return (entities || [])
    .map(entity => `${entity.type}:${entity.id}:${entity.surface}:${entity.displayName}`)
    .sort()
    .join('|');
}

function getDialogueActionKey({ action, options, pageIndex, sourceText, entities }) {
  const scope = options.encounterId || options.dialogueId || options.roomId || options.speaker || 'dialogue';
  return `${action}:${scope}:page-${pageIndex}:${sourceText}:${stableEntitySignature(entities)}`;
}
```

- [ ] **Step 5: Render inline costs inside buttons**

Modify Translate button markup:

```js
            <button class="npc-dialogue-utility npc-dialogue-translate" type="button" ${canTranslate ? '' : 'disabled'}>
              ${crystalCostHtml(5)}
              <span class="npc-dialogue-book-icon" aria-hidden="true"></span>
```

Modify Learn button setup:

```js
      const canLearn = !!sourceText && typeof options.onLearn === 'function';
```

Use `canLearn` in markup:

```js
            <button class="npc-dialogue-utility npc-dialogue-learn" type="button" ${canLearn ? '' : 'disabled'}>
              ${crystalCostHtml(15)}
              <span class="npc-dialogue-learn-icon" aria-hidden="true"></span>
```

- [ ] **Step 6: Add in-flight and repeat state for Translate**

Inside `render()`, before `requestTranslation`:

```js
      const translationKey = getDialogueActionKey({
        action: 'translate',
        options,
        pageIndex,
        sourceText,
        entities: translationEntities
      });
      let translationInFlight = false;
      let translationPaidForPage = false;
```

Modify `requestTranslation`:

```js
      const requestTranslation = async () => {
        if (!sourceText || translationInFlight) return;
        translationInFlight = true;
        const translateButton = actionArea.querySelector('.npc-dialogue-translate');
        if (translateButton) translateButton.disabled = true;
        setTranslationSheet('loading');
        const result = await translateDialogue(sourceText, translationEntities, translationKey);
        translationInFlight = false;
        if (translateButton) translateButton.disabled = false;
        if (resolved) return;
        if (result?.ok && result.translation) {
          translationPaidForPage = true;
          if (translateButton) {
            translateButton.classList.add('npc-dialogue-utility--paid');
            translateButton.querySelector('.crystal-cost')?.remove();
          }
          setTranslationSheet('success', result.translation, result.entities || []);
          options.onCrystalBalanceChange?.(result.crystals?.balance);
          return;
        }
        setTranslationSheet(result?.error === 'insufficient_crystals' ? 'insufficient' : 'unavailable');
      };
```

Update `renderTranslationSheet()` to handle `state === 'insufficient'` with:

```js
      ? '<p class="npc-dialogue-translation-error">Not enough crystals. Come back tomorrow for more.</p>'
```

- [ ] **Step 7: Add Learn callback in-flight guard**

Inside `render()`, add:

```js
      const learnKey = getDialogueActionKey({
        action: 'learn',
        options,
        pageIndex,
        sourceText,
        entities: translationEntities
      });
      let learnInFlight = false;
      let learnPaidForPage = false;

      const requestLearn = async () => {
        if (!canLearn || learnInFlight || learnPaidForPage) return;
        learnInFlight = true;
        const learnButton = actionArea.querySelector('.npc-dialogue-learn');
        if (learnButton) learnButton.disabled = true;
        const result = await options.onLearn({
          sourceText,
          entities: translationEntities,
          idempotencyKey: learnKey,
          pageIndex
        });
        learnInFlight = false;
        if (resolved) return;
        if (result?.ok) {
          learnPaidForPage = true;
          if (learnButton) {
            learnButton.disabled = false;
            learnButton.classList.add('npc-dialogue-utility--paid');
            learnButton.querySelector('.crystal-cost')?.remove();
          }
          options.onCrystalBalanceChange?.(result.crystals?.balance);
          return;
        }
        if (learnButton) learnButton.disabled = false;
      };
```

Attach the listener:

```js
      actionArea.querySelector('.npc-dialogue-learn')?.addEventListener('click', requestLearn);
```

- [ ] **Step 8: Run dialogue-card tests and syntax check**

Run:

```bash
npm run test:unit -- tests/unit/ui/npc-dialogue-card.test.js
node --check public/js/ui/npc-dialogue-card.js
node --check public/js/api.js
```

Expected: PASS and syntax checks succeed.

- [ ] **Step 9: Checkpoint**

If the user has explicitly asked for commits, run:

```bash
git add public/js/api.js public/js/ui/npc-dialogue-card.js tests/unit/ui/npc-dialogue-card.test.js
git commit -m "$(cat <<'EOF'
feat(ui): show crystal costs on dialogue actions

EOF
)"
```

## Task 7: Full Verification And Visual Check

**Files:**
- Read: `docs/playtest-guide.md`
- No planned source edits unless verification finds a bug.

- [ ] **Step 1: Run focused unit tests**

Run:

```bash
npm run test:unit -- \
  tests/unit/game/crystal-wallet-service.test.js \
  tests/unit/game/crystal-meta-state.test.js \
  tests/unit/routes/crystals-routes.test.js \
  tests/unit/routes/dialogue-translate.test.js \
  tests/unit/ui/crystals.test.js \
  tests/unit/ui/npc-dialogue-card.test.js
```

Expected: PASS.

- [ ] **Step 2: Run integration tests**

Run: `npm run test:integration`

Expected: PASS. If flows fail at `start-run` with `insufficient_crystals`, update the test helper flow to claim daily crystals before starting the run, then rerun.

- [ ] **Step 3: Run full test suite**

Run: `npm test`

Expected: PASS.

- [ ] **Step 4: Run syntax checks for edited JS**

Run:

```bash
node --check src/game/services/crystal-wallet-service.js
node --check src/routes/game/crystals.js
node --check src/routes/game/run.js
node --check src/routes/dialogue.js
node --check public/js/ui/crystals.js
node --check public/js/ui/npc-dialogue-card.js
node --check public/js/api.js
node --check public/game.js
```

Expected: every command exits 0.

- [ ] **Step 5: Visual verification**

Because this changes CSS and visible UI, ask the user before opening Playwright. After approval:

1. Read `docs/playtest-guide.md`.
2. Start the dev server with `npm run dev`.
3. Navigate to `http://localhost:5173`.
4. Authenticate or use a test account.
5. Capture a screenshot showing the crystal HUD chip.
6. Trigger daily login award by using a fresh test user or resetting the save date, then capture the daily bonus modal.
7. Navigate to a dialogue card and capture Translate/Learn buttons showing the crystal icon and number inside the button.
8. Delete any screenshot files created during verification in the same work session.

- [ ] **Step 6: Check lints for edited files**

Use the IDE diagnostics tool for:

```text
src/game/services/crystal-wallet-service.js
src/game/state.js
src/game/manager-registry.js
src/game/loop.js
src/routes/game/crystals.js
src/routes/game/index.js
src/routes/game/run.js
src/routes/index.js
src/routes/dialogue.js
public/js/ui/crystals.js
public/js/ui/npc-dialogue-card.js
public/js/api.js
public/game.js
```

Expected: no new diagnostics introduced by this work.

- [ ] **Step 7: Final checkpoint**

If the user has explicitly asked for commits, run:

```bash
git status --short
git diff --stat
git add docs/superpowers/specs/2026-05-06-crystals-currency-design.md docs/superpowers/plans/2026-05-06-crystals-currency.md
git add src/game/services/crystal-wallet-service.js src/game/state.js src/game/manager-registry.js src/game/loop.js
git add src/routes/game/crystals.js src/routes/game/index.js src/routes/game/run.js src/routes/index.js src/routes/dialogue.js
git add public/index.html public/js/dom.js public/game.css public/js/api.js public/game.js public/js/ui/crystals.js public/js/ui/npc-dialogue-card.js
git add tests/unit/game/crystal-wallet-service.test.js tests/unit/game/crystal-meta-state.test.js tests/unit/routes/crystals-routes.test.js tests/unit/routes/dialogue-translate.test.js tests/unit/ui/crystals.test.js tests/unit/ui/npc-dialogue-card.test.js
git commit -m "$(cat <<'EOF'
feat(game): add persistent crystal currency

EOF
)"
```

## Execution Notes

- Do not modify `data/dictionary.json`.
- Do not use `npm start` for browser verification; use `npm run dev` and `http://localhost:5173`.
- Treat `meta.crystals` as separate from run-local `run.player.credits`.
- Charge translation and learn only after success.
- Never double-charge the same dialogue page/encounter idempotency key for the same action reason.
- Keep the crystal icon and number inside paid buttons on the left side.
