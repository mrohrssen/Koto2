# Balance Simulator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a simulator dashboard Balance tab that starts game-server-admin 3v3 creature balance simulations and displays aggregate per-creature win/loss rates.

**Architecture:** The game server runs the balance job through admin-only endpoints and production combat code. The simulator app proxies start/current/cancel calls to the game server, mirrors completed aggregate results into SQLite, and renders a new dashboard tab. Creature level instantiation is shared so both balance runs and PvE enemies use the latest 3 eligible learned moves.

**Tech Stack:** Node.js ES modules, Express, SQLite via better-sqlite3, vanilla dashboard JavaScript, node:test, shared Koto creature/PvP combat modules.

---

## File Structure

- `src/game/creatures.js` — add shared latest-learned-moves helper and combat-ready level instantiation; update PvE enemy generation to use it.
- `tests/unit/creature/creatures.test.js` — add regression coverage for latest 3 learned moves and high-level PvE enemies.
- `src/game/balance-simulator.js` — new game-server balance simulation engine and one-active-job manager.
- `tests/unit/game/balance-simulator.test.js` — new unit tests for sampling, accounting, battle outcomes, aggregate-only results, cancel, and max-round draws.
- `src/routes/admin.js` — add admin-only balance simulation routes.
- `tests/unit/admin-balance-simulator-routes.test.js` — route tests for admin auth, validation, single active job, polling, and cancellation.
- `simulator/db/schema.sql` — add `balance_runs` table.
- `simulator/db/store.js` — add migration and accessors for mirrored balance results.
- `simulator/tests/unit/store.test.js` — test balance result persistence.
- `simulator/routes/balance.js` — new simulator backend proxy routes.
- `simulator/server.js` — mount `/api/balance`.
- `simulator/tests/unit/balance-routes.test.js` — test proxy behavior and mirroring completed results.
- `simulator/public/js/api.js` — add balance API client.
- `simulator/public/js/balance.js` — new Balance tab renderer and pure sorting/formatting helpers.
- `simulator/public/js/app.js` — route `#balance`.
- `simulator/public/index.html` — add Balance nav link and script.
- `simulator/public/css/dashboard.css` — add small Balance tab layout/table styles.
- `simulator/tests/unit/balance-view.test.js` — test pure UI formatting/sorting helpers.
- `docs/LEARNING_SIMULATOR.md` — document the Balance tab and admin API behavior.

---

## Task 1: Shared Level-N Creature Instantiation

**Files:**
- Modify: `src/game/creatures.js`
- Modify: `tests/unit/creature/creatures.test.js`

- [ ] **Step 1: Add failing tests for latest learned moves**

Add this import to `tests/unit/creature/creatures.test.js`:

```js
import {
  getElementMultiplier,
  ELEMENT_CYCLE,
  instantiateCreature,
  instantiateCreatureForCombat,
  getLatestLearnedMoves,
  RARITY_MULTIPLIERS,
  calculateCreatureDamage,
  addXpToCreature,
  xpToNextLevel,
  getStatsForLevel,
  selectTarget,
  generateEnemyCreature,
  generateEnemyCreatures,
  syncCreatureDefense
} from '../../../src/game/creatures.js';
```

Add these tests inside the existing `describe('Move learning cap', () => { ... })` block:

```js
  it('selects the latest 3 eligible learnset moves for a high-level creature', () => {
    const learned = getLatestLearnedMoves('hi', 40);

    assert.deepStrictEqual(learned.map(move => move.id), ['moeru', 'tobu', 'naku']);
  });

  it('instantiates combat creatures with latest learned moves and clean combat state', () => {
    const creature = instantiateCreatureForCombat('hi', 40);

    assert.strictEqual(creature.level, 40);
    assert.strictEqual(creature.hp, creature.maxHp);
    assert.strictEqual(creature.mp, creature.maxMp);
    assert.deepStrictEqual(creature.activeEffects, []);
    assert.deepStrictEqual(creature.moves.map(move => move.id), ['moeru', 'tobu', 'naku']);
  });

  it('uses latest learned moves for high-level wild enemies', () => {
    const creature = generateEnemyCreature(40, ['hi']);

    assert.strictEqual(creature.id, 'hi');
    assert.deepStrictEqual(creature.moves.map(move => move.id), ['moeru', 'tobu', 'naku']);
  });
```

- [ ] **Step 2: Run the creature tests to verify failure**

Run: `npm run test:unit -- tests/unit/creature/creatures.test.js`

Expected: fails because `instantiateCreatureForCombat` and `getLatestLearnedMoves` are not exported.

- [ ] **Step 3: Implement latest learned moves and combat instantiation**

In `src/game/creatures.js`, replace the move-building block inside `instantiateCreature` with a call to `getLatestLearnedMoves`, and add the exported helpers below `syncPartyCreatureMoves`:

```js
export function getLatestLearnedMoves(templateOrId, level = STARTING_LEVEL) {
  const template = typeof templateOrId === 'string'
    ? CREATURES_BY_ID[templateOrId]
    : templateOrId;
  if (!template) throw new Error(`Creature template not found: ${templateOrId}`);

  return (template.learnset || [])
    .filter(entry => entry.level <= level)
    .slice(-MAX_CREATURE_MOVES)
    .map(entry => MOVES_BY_ID[entry.moveId])
    .filter(Boolean)
    .map(move => ({ ...move }));
}

export function instantiateCreatureForCombat(templateId, startingLevel = STARTING_LEVEL) {
  const creature = instantiateCreature(templateId, startingLevel);
  creature.moves = getLatestLearnedMoves(templateId, startingLevel);
  creature.hp = creature.maxHp;
  creature.mp = creature.maxMp;
  creature.activeEffects = [];
  delete creature.statStages;
  return creature;
}
```

Change the `instantiateCreature` move assignment to:

```js
  const moves = getLatestLearnedMoves(template, startingLevel);
```

Update `generateEnemyCreature` to instantiate directly at the target level and remove the manual level-up loop and move-filling loop:

```js
  const creature = instantiateCreatureForCombat(template.id, targetLevel);

  syncCreatureMoves(creature);
  return creature;
```

- [ ] **Step 4: Run the focused creature tests**

Run: `npm run test:unit -- tests/unit/creature/creatures.test.js`

Expected: all tests in `creatures.test.js` pass.

- [ ] **Step 5: Syntax check**

Run: `node --check src/game/creatures.js && echo "OK"`

Expected: `OK`

- [ ] **Step 6: Commit shared instantiation**

```bash
git add src/game/creatures.js tests/unit/creature/creatures.test.js
git commit -m "fix(creatures): use latest learned moves for combat instantiation"
```

---

## Task 2: Balance Simulation Engine

**Files:**
- Create: `src/game/balance-simulator.js`
- Create: `tests/unit/game/balance-simulator.test.js`

- [ ] **Step 1: Write failing unit tests for sampling and aggregate accounting**

Create `tests/unit/game/balance-simulator.test.js`:

```js
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  chooseAiMovesForSide,
  createBalanceSimulationManager,
  createInitialBalanceResults,
  recordBattleOutcome,
  runBalanceBattle,
  sampleUniqueCreatureIds,
  serializeBalanceJob
} from '../../../src/game/balance-simulator.js';

function creature(id, overrides = {}) {
  return {
    uid: crypto.randomUUID(),
    id,
    name: id,
    nameEn: id,
    rarity: 'common',
    element: 'neutral',
    level: 5,
    hp: 100,
    maxHp: 100,
    mp: 100,
    maxMp: 100,
    attack: 20,
    defense: 5,
    activeEffects: [],
    moves: [{
      id: 'hit',
      name: '打つ',
      nameEn: 'Hit',
      reading: 'うつ',
      element: 'neutral',
      category: 'damage',
      target: 'single_enemy',
      power: 20,
      mpCost: 0,
      statusEffect: null,
      statusChance: 0,
      statusDuration: 0
    }],
    ...overrides
  };
}

describe('sampleUniqueCreatureIds', () => {
  it('samples 6 unique creature IDs', () => {
    const ids = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];
    const picked = sampleUniqueCreatureIds(ids, () => 0);

    assert.equal(picked.length, 6);
    assert.equal(new Set(picked).size, 6);
  });

  it('rejects rosters with fewer than 6 creatures', () => {
    assert.throws(
      () => sampleUniqueCreatureIds(['a', 'b', 'c', 'd', 'e']),
      /at least 6 creatures/
    );
  });
});

describe('recordBattleOutcome', () => {
  it('applies wins to every winner and losses to every loser', () => {
    const rows = createInitialBalanceResults([
      { id: 'a', name: 'A', nameEn: 'A', rarity: 'common' },
      { id: 'b', name: 'B', nameEn: 'B', rarity: 'rare' },
      { id: 'c', name: 'C', nameEn: 'C', rarity: 'epic' },
      { id: 'd', name: 'D', nameEn: 'D', rarity: 'common' },
      { id: 'e', name: 'E', nameEn: 'E', rarity: 'common' },
      { id: 'f', name: 'F', nameEn: 'F', rarity: 'common' }
    ]);

    recordBattleOutcome(rows, ['a', 'b', 'c'], ['d', 'e', 'f'], 'sideA');

    assert.equal(rows.get('a').appearances, 1);
    assert.equal(rows.get('a').wins, 1);
    assert.equal(rows.get('b').wins, 1);
    assert.equal(rows.get('c').wins, 1);
    assert.equal(rows.get('d').losses, 1);
    assert.equal(rows.get('e').losses, 1);
    assert.equal(rows.get('f').losses, 1);
  });

  it('records draws without wins or losses', () => {
    const rows = createInitialBalanceResults([
      { id: 'a', name: 'A', nameEn: 'A', rarity: 'common' },
      { id: 'b', name: 'B', nameEn: 'B', rarity: 'common' },
      { id: 'c', name: 'C', nameEn: 'C', rarity: 'common' },
      { id: 'd', name: 'D', nameEn: 'D', rarity: 'common' },
      { id: 'e', name: 'E', nameEn: 'E', rarity: 'common' },
      { id: 'f', name: 'F', nameEn: 'F', rarity: 'common' }
    ]);

    recordBattleOutcome(rows, ['a', 'b', 'c'], ['d', 'e', 'f'], 'draw');

    assert.equal(rows.get('a').appearances, 1);
    assert.equal(rows.get('a').draws, 1);
    assert.equal(rows.get('a').wins, 0);
    assert.equal(rows.get('a').losses, 0);
  });
});

describe('chooseAiMovesForSide', () => {
  it('uses production enemy AI helpers to build PvP move choices', () => {
    const sideA = [creature('a')];
    const sideB = [creature('b')];

    const moves = chooseAiMovesForSide(sideA, sideB);

    assert.deepEqual(moves, [{ creatureIndex: 0, moveId: 'hit', targetIndex: 0 }]);
  });
});

describe('runBalanceBattle', () => {
  it('returns sideA when sideB is fully dead', () => {
    const sideA = [creature('a', { attack: 1000 }), creature('b', { attack: 1000 }), creature('c', { attack: 1000 })];
    const sideB = [creature('d', { hp: 1, maxHp: 1 }), creature('e', { hp: 1, maxHp: 1 }), creature('f', { hp: 1, maxHp: 1 })];

    const result = runBalanceBattle(sideA, sideB, { maxRounds: 10 });

    assert.equal(result.winner, 'sideA');
    assert.ok(result.rounds >= 1);
  });

  it('returns draw on max-round cap', () => {
    const sideA = [creature('a', { moves: [] }), creature('b', { moves: [] }), creature('c', { moves: [] })];
    const sideB = [creature('d', { moves: [] }), creature('e', { moves: [] }), creature('f', { moves: [] })];

    const result = runBalanceBattle(sideA, sideB, { maxRounds: 1 });

    assert.equal(result.winner, 'draw');
    assert.equal(result.reason, 'max_rounds');
  });
});

describe('createBalanceSimulationManager', () => {
  it('rejects a second active job and serializes aggregate-only results', async () => {
    const manager = createBalanceSimulationManager({
      runSimulation: async ({ job }) => {
        job.completedBattles = job.battleCount;
        job.status = 'completed';
        job.completedAt = '2026-05-05T00:00:00.000Z';
      }
    });

    const first = manager.start({ battleCount: 1, creatureLevel: 5 });
    assert.equal(first.status, 'running');

    assert.throws(
      () => manager.start({ battleCount: 1, creatureLevel: 5 }),
      /already running/
    );

    await manager.waitForIdle();
    const current = manager.current();

    assert.equal(current.status, 'completed');
    assert.equal(current.battleCount, 1);
    assert.equal('battles' in current, false);
  });

  it('marks an active job cancelled', () => {
    const manager = createBalanceSimulationManager({
      runSimulation: async () => new Promise(() => {})
    });

    manager.start({ battleCount: 10, creatureLevel: 5 });
    const cancelled = manager.cancel();

    assert.equal(cancelled.status, 'cancelled');
  });
});
```

- [ ] **Step 2: Run the new tests to verify failure**

Run: `npm run test:unit -- tests/unit/game/balance-simulator.test.js`

Expected: fails because `src/game/balance-simulator.js` does not exist.

- [ ] **Step 3: Implement the balance simulator module**

Create `src/game/balance-simulator.js`:

```js
import { CREATURES_BY_ID, instantiateCreatureForCombat } from './creatures.js';
import { pickEnemyMoveChoice, pickEnemyTarget } from './services/creature-combat-service.js';
import { resolveRound } from '../pvp/pvp-combat.js';

export const DEFAULT_BALANCE_MAX_ROUNDS = 100;
const DEFAULT_YIELD_EVERY = 100;

function nowIso() {
  return new Date().toISOString();
}

function makeJobId() {
  return `balance-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function assertPositiveInteger(value, name) {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }
}

export function sampleUniqueCreatureIds(creatureIds, random = Math.random) {
  if (!Array.isArray(creatureIds) || creatureIds.length < 6) {
    throw new Error('Balance simulations require at least 6 creatures');
  }
  const shuffled = [...creatureIds];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled.slice(0, 6);
}

export function createInitialBalanceResults(templates = Object.values(CREATURES_BY_ID)) {
  const rows = new Map();
  for (const template of templates) {
    rows.set(template.id, {
      creatureId: template.id,
      name: template.name,
      nameEn: template.nameEn,
      rarity: template.rarity,
      appearances: 0,
      wins: 0,
      losses: 0,
      draws: 0,
      winRate: 0,
      lossRate: 0
    });
  }
  return rows;
}

function incrementAppearance(rows, creatureId) {
  const row = rows.get(creatureId);
  if (!row) return;
  row.appearances++;
}

export function recordBattleOutcome(rows, sideAIds, sideBIds, winner) {
  for (const id of [...sideAIds, ...sideBIds]) incrementAppearance(rows, id);

  if (winner === 'draw') {
    for (const id of [...sideAIds, ...sideBIds]) rows.get(id).draws++;
    return;
  }

  const winningIds = winner === 'sideA' ? sideAIds : sideBIds;
  const losingIds = winner === 'sideA' ? sideBIds : sideAIds;
  for (const id of winningIds) rows.get(id).wins++;
  for (const id of losingIds) rows.get(id).losses++;
}

export function serializeResultRows(rows) {
  return [...rows.values()]
    .map(row => ({
      ...row,
      winRate: row.appearances > 0 ? row.wins / row.appearances : 0,
      lossRate: row.appearances > 0 ? row.losses / row.appearances : 0
    }))
    .sort((a, b) => b.winRate - a.winRate || b.appearances - a.appearances || a.nameEn.localeCompare(b.nameEn));
}

export function chooseAiMovesForSide(myTeam, theirTeam) {
  const choices = [];
  for (let i = 0; i < myTeam.length; i++) {
    const creature = myTeam[i];
    if (!creature || creature.hp <= 0) continue;

    const choice = pickEnemyMoveChoice(creature, theirTeam, myTeam);
    if (!choice?.move) continue;

    const target = pickEnemyTarget(creature, choice.move, choice.mode, theirTeam, myTeam);
    if (!target?.target) continue;

    const targetIndex = target.targetSide === 'player'
      ? theirTeam.indexOf(target.target)
      : myTeam.indexOf(target.target);

    choices.push({ creatureIndex: i, moveId: choice.move.id, targetIndex: Math.max(0, targetIndex) });
  }
  return choices;
}

export function runBalanceBattle(sideA, sideB, options = {}) {
  const maxRounds = options.maxRounds || DEFAULT_BALANCE_MAX_ROUNDS;
  for (let round = 1; round <= maxRounds; round++) {
    const movesA = chooseAiMovesForSide(sideA, sideB);
    const movesB = chooseAiMovesForSide(sideB, sideA);
    const result = resolveRound(sideA, sideB, movesA, movesB, {
      combatA: {},
      combatB: {}
    });
    if (result.winner) return { winner: result.winner, rounds: round, reason: 'resolved' };
  }
  return { winner: 'draw', rounds: maxRounds, reason: 'max_rounds' };
}

export async function runBalanceSimulation(config) {
  const {
    job,
    battleCount,
    creatureLevel,
    random = Math.random,
    maxRounds = DEFAULT_BALANCE_MAX_ROUNDS,
    yieldEvery = DEFAULT_YIELD_EVERY,
    shouldCancel = () => false,
    onProgress = () => {}
  } = config;

  assertPositiveInteger(battleCount, 'battleCount');
  assertPositiveInteger(creatureLevel, 'creatureLevel');

  const templates = Object.values(CREATURES_BY_ID);
  const templateIds = templates.map(template => template.id);
  const rows = job.resultRows || createInitialBalanceResults(templates);
  job.resultRows = rows;

  for (let i = job.completedBattles; i < battleCount; i++) {
    if (shouldCancel()) {
      job.status = 'cancelled';
      job.completedAt = nowIso();
      return job;
    }

    const picked = sampleUniqueCreatureIds(templateIds, random);
    const sideAIds = picked.slice(0, 3);
    const sideBIds = picked.slice(3, 6);
    const sideA = sideAIds.map(id => instantiateCreatureForCombat(id, creatureLevel));
    const sideB = sideBIds.map(id => instantiateCreatureForCombat(id, creatureLevel));
    const battle = runBalanceBattle(sideA, sideB, { maxRounds });

    recordBattleOutcome(rows, sideAIds, sideBIds, battle.winner);
    if (battle.winner === 'draw') job.draws++;
    job.completedBattles++;
    onProgress(job);

    if (job.completedBattles % yieldEvery === 0) {
      await new Promise(resolve => setImmediate(resolve));
    }
  }

  job.status = 'completed';
  job.completedAt = nowIso();
  return job;
}

export function serializeBalanceJob(job) {
  if (!job) return null;
  return {
    jobId: job.jobId,
    status: job.status,
    battleCount: job.battleCount,
    creatureLevel: job.creatureLevel,
    completedBattles: job.completedBattles,
    draws: job.draws,
    startedAt: job.startedAt,
    completedAt: job.completedAt,
    errorMessage: job.errorMessage || null,
    results: serializeResultRows(job.resultRows || new Map())
  };
}

export function createBalanceSimulationManager(options = {}) {
  const runSimulation = options.runSimulation || runBalanceSimulation;
  let activeJob = null;
  let latestJob = null;
  let activePromise = null;

  function start({ battleCount, creatureLevel }) {
    assertPositiveInteger(battleCount, 'battleCount');
    assertPositiveInteger(creatureLevel, 'creatureLevel');
    if (activeJob && activeJob.status === 'running') {
      throw new Error('A balance simulation is already running');
    }

    const job = {
      jobId: makeJobId(),
      status: 'running',
      battleCount,
      creatureLevel,
      completedBattles: 0,
      draws: 0,
      startedAt: nowIso(),
      completedAt: null,
      errorMessage: null,
      cancelled: false,
      resultRows: createInitialBalanceResults()
    };

    activeJob = job;
    latestJob = job;
    activePromise = Promise.resolve()
      .then(() => runSimulation({
        job,
        battleCount,
        creatureLevel,
        shouldCancel: () => job.cancelled
      }))
      .catch(error => {
        job.status = 'errored';
        job.errorMessage = error.message;
        job.completedAt = nowIso();
      })
      .finally(() => {
        if (activeJob === job) activeJob = null;
      });

    return serializeBalanceJob(job);
  }

  function current() {
    return serializeBalanceJob(activeJob || latestJob);
  }

  function cancel() {
    if (!activeJob || activeJob.status !== 'running') {
      throw new Error('No active balance simulation');
    }
    activeJob.cancelled = true;
    activeJob.status = 'cancelled';
    activeJob.completedAt = nowIso();
    return serializeBalanceJob(activeJob);
  }

  async function waitForIdle() {
    if (activePromise) await activePromise;
  }

  return { start, current, cancel, waitForIdle };
}
```

- [ ] **Step 4: Run the focused balance simulator tests**

Run: `npm run test:unit -- tests/unit/game/balance-simulator.test.js`

Expected: all tests pass.

- [ ] **Step 5: Syntax check**

Run: `node --check src/game/balance-simulator.js && echo "OK"`

Expected: `OK`

- [ ] **Step 6: Commit balance engine**

```bash
git add src/game/balance-simulator.js tests/unit/game/balance-simulator.test.js
git commit -m "feat(balance): add aggregate 3v3 simulation engine"
```

---

## Task 3: Game Server Admin Routes

**Files:**
- Modify: `src/routes/admin.js`
- Create: `tests/unit/admin-balance-simulator-routes.test.js`

- [ ] **Step 1: Write failing admin route tests**

Create `tests/unit/admin-balance-simulator-routes.test.js`:

```js
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import createAdminRoutes from '../../src/routes/admin.js';

async function withServer({ secret = 'test-secret', manager }, testFn) {
  process.env.ADMIN_SECRET = secret;
  const app = express();
  app.use(express.json());
  app.use('/api/admin', createAdminRoutes({ dataDir: process.cwd(), balanceManager: manager }));
  const server = await new Promise(resolve => {
    const listener = app.listen(0, () => resolve(listener));
  });
  try {
    const baseUrl = `http://127.0.0.1:${server.address().port}`;
    await testFn(baseUrl);
  } finally {
    await new Promise(resolve => server.close(resolve));
    delete process.env.ADMIN_SECRET;
  }
}

function fakeManager() {
  let active = null;
  return {
    start(input) {
      if (active?.status === 'running') throw new Error('A balance simulation is already running');
      active = {
        jobId: 'job-1',
        status: 'running',
        battleCount: input.battleCount,
        creatureLevel: input.creatureLevel,
        completedBattles: 0,
        draws: 0,
        results: []
      };
      return active;
    },
    current() {
      return active;
    },
    cancel() {
      if (!active) throw new Error('No active balance simulation');
      active = { ...active, status: 'cancelled' };
      return active;
    }
  };
}

describe('admin balance simulator routes', () => {
  afterEach(() => {
    delete process.env.ADMIN_SECRET;
  });

  it('requires admin auth', async () => {
    await withServer({ manager: fakeManager() }, async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/admin/balance-simulations/current`);

      assert.equal(res.status, 403);
    });
  });

  it('starts a balance simulation with valid input', async () => {
    await withServer({ manager: fakeManager() }, async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/admin/balance-simulations/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-secret': 'test-secret' },
        body: JSON.stringify({ battleCount: 1000, creatureLevel: 40 })
      });

      assert.equal(res.status, 201);
      const body = await res.json();
      assert.equal(body.status, 'running');
      assert.equal(body.battleCount, 1000);
      assert.equal(body.creatureLevel, 40);
    });
  });

  it('rejects invalid start input', async () => {
    await withServer({ manager: fakeManager() }, async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/admin/balance-simulations/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-secret': 'test-secret' },
        body: JSON.stringify({ battleCount: 0, creatureLevel: 40 })
      });

      assert.equal(res.status, 400);
    });
  });

  it('returns current job progress', async () => {
    await withServer({ manager: fakeManager() }, async (baseUrl) => {
      await fetch(`${baseUrl}/api/admin/balance-simulations/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-secret': 'test-secret' },
        body: JSON.stringify({ battleCount: 10, creatureLevel: 5 })
      });

      const res = await fetch(`${baseUrl}/api/admin/balance-simulations/current`, {
        headers: { 'x-admin-secret': 'test-secret' }
      });

      assert.equal(res.status, 200);
      const body = await res.json();
      assert.equal(body.jobId, 'job-1');
    });
  });

  it('cancels an active job', async () => {
    await withServer({ manager: fakeManager() }, async (baseUrl) => {
      await fetch(`${baseUrl}/api/admin/balance-simulations/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-secret': 'test-secret' },
        body: JSON.stringify({ battleCount: 10, creatureLevel: 5 })
      });

      const res = await fetch(`${baseUrl}/api/admin/balance-simulations/cancel`, {
        method: 'POST',
        headers: { 'x-admin-secret': 'test-secret' }
      });

      assert.equal(res.status, 200);
      const body = await res.json();
      assert.equal(body.status, 'cancelled');
    });
  });
});
```

- [ ] **Step 2: Run admin balance route tests to verify failure**

Run: `npm run test:unit -- tests/unit/admin-balance-simulator-routes.test.js`

Expected: fails because the route does not exist.

- [ ] **Step 3: Add admin balance routes**

In `src/routes/admin.js`, add this import:

```js
import { createBalanceSimulationManager } from '../game/balance-simulator.js';
```

Add this module-level default manager after the imports:

```js
const defaultBalanceManager = createBalanceSimulationManager();
```

Change the route factory signature:

```js
export default function createAdminRoutes({ dataDir, balanceManager = defaultBalanceManager }) {
```

Before `return router;`, add:

```js
  router.post('/balance-simulations/start', (req, res) => {
    try {
      const battleCount = Number(req.body?.battleCount);
      const creatureLevel = Number(req.body?.creatureLevel);
      const job = balanceManager.start({ battleCount, creatureLevel });
      res.status(201).json(job);
    } catch (err) {
      const status = err.message?.includes('already running') ? 409 : 400;
      res.status(status).json({ error: err.message });
    }
  });

  router.get('/balance-simulations/current', (req, res) => {
    try {
      const job = balanceManager.current();
      if (!job) return res.json({ status: 'idle', jobId: null, results: [] });
      res.json(job);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.post('/balance-simulations/cancel', (req, res) => {
    try {
      res.json(balanceManager.cancel());
    } catch (err) {
      res.status(404).json({ error: err.message });
    }
  });
```

- [ ] **Step 4: Run admin route tests**

Run: `npm run test:unit -- tests/unit/admin-balance-simulator-routes.test.js tests/unit/admin-routes.test.js tests/unit/admin-word-knowledge-endpoint.test.js`

Expected: all listed tests pass.

- [ ] **Step 5: Syntax check**

Run: `node --check src/routes/admin.js && echo "OK"`

Expected: `OK`

- [ ] **Step 6: Commit admin API**

```bash
git add src/routes/admin.js tests/unit/admin-balance-simulator-routes.test.js
git commit -m "feat(admin): expose balance simulation controls"
```

---

## Task 4: Simulator Balance Persistence

**Files:**
- Modify: `simulator/db/schema.sql`
- Modify: `simulator/db/store.js`
- Modify: `simulator/tests/unit/store.test.js`

- [ ] **Step 1: Write failing store tests for balance runs**

Append this block to `simulator/tests/unit/store.test.js` before the final closing `});`:

```js
  describe('balance runs', () => {
    it('saves and retrieves completed balance runs as aggregate JSON', () => {
      const result = {
        jobId: 'balance-test-1',
        status: 'completed',
        battleCount: 1000,
        creatureLevel: 40,
        completedBattles: 1000,
        draws: 3,
        startedAt: '2026-05-05T00:00:00.000Z',
        completedAt: '2026-05-05T00:01:00.000Z',
        results: [
          { creatureId: 'hi', nameEn: 'Fire', rarity: 'common', appearances: 12, wins: 8, losses: 4, winRate: 0.6667, lossRate: 0.3333 }
        ]
      };

      const id = store.saveBalanceRun(result);
      assert.ok(id > 0);

      const rows = store.getBalanceRuns();
      const saved = rows.find(row => row.job_id === 'balance-test-1');

      assert.ok(saved);
      assert.equal(saved.battle_count, 1000);
      assert.equal(saved.creature_level, 40);
      assert.equal(saved.result_data.jobId, 'balance-test-1');
      assert.equal(saved.result_data.results.length, 1);
    });

    it('upserts balance runs by job id', () => {
      store.saveBalanceRun({
        jobId: 'balance-upsert',
        status: 'completed',
        battleCount: 10,
        creatureLevel: 5,
        completedBattles: 10,
        draws: 0,
        startedAt: '2026-05-05T00:00:00.000Z',
        completedAt: '2026-05-05T00:01:00.000Z',
        results: []
      });
      store.saveBalanceRun({
        jobId: 'balance-upsert',
        status: 'completed',
        battleCount: 20,
        creatureLevel: 5,
        completedBattles: 20,
        draws: 1,
        startedAt: '2026-05-05T00:00:00.000Z',
        completedAt: '2026-05-05T00:02:00.000Z',
        results: []
      });

      const rows = store.getBalanceRuns().filter(row => row.job_id === 'balance-upsert');

      assert.equal(rows.length, 1);
      assert.equal(rows[0].battle_count, 20);
      assert.equal(rows[0].draws, 1);
    });
  });
```

- [ ] **Step 2: Run simulator store tests to verify failure**

Run: `cd simulator && npm run test:unit -- tests/unit/store.test.js`

Expected: fails because `saveBalanceRun` and `getBalanceRuns` are not defined.

- [ ] **Step 3: Add the balance_runs schema**

Append to `simulator/db/schema.sql`:

```sql
CREATE TABLE IF NOT EXISTS balance_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL,
  battle_count INTEGER NOT NULL,
  creature_level INTEGER NOT NULL,
  completed_battles INTEGER NOT NULL DEFAULT 0,
  draws INTEGER NOT NULL DEFAULT 0,
  started_at TEXT,
  completed_at TEXT,
  result_data TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_balance_runs_created ON balance_runs(created_at DESC);
```

- [ ] **Step 4: Add balance store statements and methods**

In `simulator/db/store.js`, after the snapshot prepared statements, add:

```js
  // --- Balance runs ---

  const upsertBalanceRun = db.prepare(`
    INSERT INTO balance_runs
      (job_id, status, battle_count, creature_level, completed_battles, draws,
       started_at, completed_at, result_data, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(job_id) DO UPDATE SET
      status = excluded.status,
      battle_count = excluded.battle_count,
      creature_level = excluded.creature_level,
      completed_battles = excluded.completed_battles,
      draws = excluded.draws,
      started_at = excluded.started_at,
      completed_at = excluded.completed_at,
      result_data = excluded.result_data,
      updated_at = datetime('now')
  `);
  const selectBalanceRuns = db.prepare(
    'SELECT * FROM balance_runs ORDER BY created_at DESC'
  );
  const selectBalanceRun = db.prepare(
    'SELECT * FROM balance_runs WHERE job_id = ?'
  );
```

Inside the returned store object, before `close()`, add:

```js
    // --- Balance runs ---
    saveBalanceRun(result) {
      const info = upsertBalanceRun.run(
        result.jobId,
        result.status,
        result.battleCount,
        result.creatureLevel,
        result.completedBattles,
        result.draws || 0,
        result.startedAt || null,
        result.completedAt || null,
        JSON.stringify(result)
      );
      const row = selectBalanceRun.get(result.jobId);
      return row?.id || info.lastInsertRowid;
    },

    getBalanceRuns() {
      const rows = selectBalanceRuns.all();
      for (const row of rows) {
        try { row.result_data = JSON.parse(row.result_data); } catch { /* keep as string */ }
      }
      return rows;
    },

    getBalanceRun(jobId) {
      const row = selectBalanceRun.get(jobId);
      if (!row) return null;
      try { row.result_data = JSON.parse(row.result_data); } catch { /* keep as string */ }
      return row;
    },
```

- [ ] **Step 5: Run simulator store tests**

Run: `cd simulator && npm run test:unit -- tests/unit/store.test.js`

Expected: all store tests pass.

- [ ] **Step 6: Commit simulator persistence**

```bash
git add simulator/db/schema.sql simulator/db/store.js simulator/tests/unit/store.test.js
git commit -m "feat(simulator): persist aggregate balance results"
```

---

## Task 5: Simulator Balance Proxy Routes

**Files:**
- Create: `simulator/routes/balance.js`
- Modify: `simulator/server.js`
- Create: `simulator/tests/unit/balance-routes.test.js`

- [ ] **Step 1: Write failing proxy route tests**

Create `simulator/tests/unit/balance-routes.test.js`:

```js
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createStore } from '../../db/store.js';
import createBalanceRoutes from '../../routes/balance.js';

async function listen(app) {
  return new Promise(resolve => {
    const server = app.listen(0, () => resolve(server));
  });
}

async function withServers(handler, testFn) {
  const tmpDir = mkdtempSync(join(tmpdir(), 'koto-balance-routes-'));
  const store = createStore(join(tmpDir, 'test.db'));

  const game = express();
  game.use(express.json());
  game.use(handler);
  const gameServer = await listen(game);
  const gameUrl = `http://127.0.0.1:${gameServer.address().port}`;

  const sim = express();
  sim.use(express.json());
  sim.use('/api/balance', createBalanceRoutes(store, gameUrl, 'secret'));
  const simServer = await listen(sim);
  const simUrl = `http://127.0.0.1:${simServer.address().port}`;

  try {
    await testFn({ simUrl, store });
  } finally {
    await new Promise(resolve => simServer.close(resolve));
    await new Promise(resolve => gameServer.close(resolve));
    store.close();
    rmSync(tmpDir, { recursive: true, force: true });
  }
}

describe('simulator balance routes', () => {
  it('starts a game-server balance job with admin secret', async () => {
    await withServers((req, res) => {
      assert.equal(req.headers['x-admin-secret'], 'secret');
      assert.equal(req.path, '/api/admin/balance-simulations/start');
      res.status(201).json({
        jobId: 'job-start',
        status: 'running',
        battleCount: req.body.battleCount,
        creatureLevel: req.body.creatureLevel,
        completedBattles: 0,
        draws: 0,
        results: []
      });
    }, async ({ simUrl }) => {
      const res = await fetch(`${simUrl}/api/balance/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ battleCount: 100, creatureLevel: 40 })
      });

      assert.equal(res.status, 201);
      const body = await res.json();
      assert.equal(body.jobId, 'job-start');
      assert.equal(body.creatureLevel, 40);
    });
  });

  it('mirrors completed current result into SQLite', async () => {
    await withServers((req, res) => {
      res.json({
        jobId: 'job-complete',
        status: 'completed',
        battleCount: 10,
        creatureLevel: 5,
        completedBattles: 10,
        draws: 1,
        startedAt: '2026-05-05T00:00:00.000Z',
        completedAt: '2026-05-05T00:01:00.000Z',
        results: []
      });
    }, async ({ simUrl, store }) => {
      const res = await fetch(`${simUrl}/api/balance/current`);

      assert.equal(res.status, 200);
      const rows = store.getBalanceRuns();
      assert.equal(rows.length, 1);
      assert.equal(rows[0].job_id, 'job-complete');
    });
  });

  it('lists mirrored balance runs', async () => {
    await withServers((req, res) => res.json({ status: 'idle', results: [] }), async ({ simUrl, store }) => {
      store.saveBalanceRun({
        jobId: 'saved-job',
        status: 'completed',
        battleCount: 20,
        creatureLevel: 8,
        completedBattles: 20,
        draws: 0,
        results: []
      });

      const res = await fetch(`${simUrl}/api/balance/runs`);

      assert.equal(res.status, 200);
      const body = await res.json();
      assert.equal(body.length, 1);
      assert.equal(body[0].job_id, 'saved-job');
    });
  });
});
```

- [ ] **Step 2: Run proxy route tests to verify failure**

Run: `cd simulator && npm run test:unit -- tests/unit/balance-routes.test.js`

Expected: fails because `simulator/routes/balance.js` does not exist.

- [ ] **Step 3: Implement proxy routes**

Create `simulator/routes/balance.js`:

```js
import { Router } from 'express';

function isTerminalJob(job) {
  return ['completed', 'cancelled', 'errored'].includes(job?.status) && job?.jobId;
}

async function forwardJson(gameServerUrl, adminSecret, method, path, body) {
  const response = await fetch(`${gameServerUrl}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'x-admin-secret': adminSecret
    },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const payload = await response.json().catch(() => ({ error: response.statusText }));
  return { response, payload };
}

function mirrorTerminalResult(store, payload) {
  if (isTerminalJob(payload)) {
    store.saveBalanceRun(payload);
  }
}

export default function createBalanceRoutes(store, gameServerUrl, adminSecret) {
  const router = Router();

  router.post('/start', async (req, res) => {
    try {
      const { response, payload } = await forwardJson(
        gameServerUrl,
        adminSecret,
        'POST',
        '/api/admin/balance-simulations/start',
        req.body
      );
      mirrorTerminalResult(store, payload);
      res.status(response.status).json(payload);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.get('/current', async (_req, res) => {
    try {
      const { response, payload } = await forwardJson(
        gameServerUrl,
        adminSecret,
        'GET',
        '/api/admin/balance-simulations/current'
      );
      mirrorTerminalResult(store, payload);
      res.status(response.status).json(payload);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.post('/cancel', async (_req, res) => {
    try {
      const { response, payload } = await forwardJson(
        gameServerUrl,
        adminSecret,
        'POST',
        '/api/admin/balance-simulations/cancel'
      );
      mirrorTerminalResult(store, payload);
      res.status(response.status).json(payload);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.get('/runs', (_req, res) => {
    try {
      res.json(store.getBalanceRuns());
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  return router;
}
```

- [ ] **Step 4: Mount proxy routes**

In `simulator/server.js`, add:

```js
import createBalanceRoutes from './routes/balance.js';
```

Then mount the route after `/api/results`:

```js
app.use('/api/balance', createBalanceRoutes(store, GAME_SERVER_URL, ADMIN_SECRET));
```

- [ ] **Step 5: Run proxy route tests**

Run: `cd simulator && npm run test:unit -- tests/unit/balance-routes.test.js`

Expected: all balance route tests pass.

- [ ] **Step 6: Syntax check**

Run: `node --check simulator/routes/balance.js && node --check simulator/server.js && echo "OK"`

Expected: `OK`

- [ ] **Step 7: Commit simulator proxy routes**

```bash
git add simulator/routes/balance.js simulator/server.js simulator/tests/unit/balance-routes.test.js
git commit -m "feat(simulator): proxy balance simulation jobs"
```

---

## Task 6: Dashboard Balance Tab

**Files:**
- Modify: `simulator/public/js/api.js`
- Create: `simulator/public/js/balance.js`
- Modify: `simulator/public/js/app.js`
- Modify: `simulator/public/index.html`
- Modify: `simulator/public/css/dashboard.css`
- Create: `simulator/tests/unit/balance-view.test.js`

- [ ] **Step 1: Write failing pure UI helper tests**

Create `simulator/tests/unit/balance-view.test.js`:

```js
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { formatPercent, sortBalanceRows } from '../../public/js/balance.js';

describe('balance view helpers', () => {
  it('formats rates as percentages', () => {
    assert.equal(formatPercent(0.625), '62.5%');
    assert.equal(formatPercent(0), '0%');
  });

  it('sorts by win rate descending by default', () => {
    const rows = [
      { nameEn: 'Weak', winRate: 0.2, appearances: 10 },
      { nameEn: 'Strong', winRate: 0.8, appearances: 10 },
      { nameEn: 'Medium', winRate: 0.5, appearances: 10 }
    ];

    const sorted = sortBalanceRows(rows, 'winRate', 'desc');

    assert.deepEqual(sorted.map(row => row.nameEn), ['Strong', 'Medium', 'Weak']);
  });

  it('sorts text columns ascending', () => {
    const rows = [
      { nameEn: 'Water', rarity: 'rare' },
      { nameEn: 'Fire', rarity: 'common' }
    ];

    const sorted = sortBalanceRows(rows, 'nameEn', 'asc');

    assert.deepEqual(sorted.map(row => row.nameEn), ['Fire', 'Water']);
  });
});
```

- [ ] **Step 2: Run UI helper tests to verify failure**

Run: `cd simulator && npm run test:unit -- tests/unit/balance-view.test.js`

Expected: fails because `simulator/public/js/balance.js` does not exist.

- [ ] **Step 3: Add balance API client methods**

In `simulator/public/js/api.js`, add:

```js
export const balance = {
  start: (battleCount, creatureLevel) => api('POST', '/api/balance/start', { battleCount, creatureLevel }),
  current: () => api('GET', '/api/balance/current'),
  cancel: () => api('POST', '/api/balance/cancel'),
  runs: () => api('GET', '/api/balance/runs'),
};
```

- [ ] **Step 4: Implement Balance tab renderer**

Create `simulator/public/js/balance.js`:

```js
import { balance } from './api.js';

let refreshInterval = null;
let sortKey = 'winRate';
let sortDir = 'desc';

function esc(str) {
  const div = document.createElement('div');
  div.textContent = str ?? '';
  return div.innerHTML;
}

export function formatPercent(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number === 0) return '0%';
  return `${(number * 100).toFixed(1)}%`;
}

export function sortBalanceRows(rows, key = 'winRate', dir = 'desc') {
  const copy = [...(rows || [])];
  const direction = dir === 'asc' ? 1 : -1;
  copy.sort((a, b) => {
    const av = a[key];
    const bv = b[key];
    if (typeof av === 'number' || typeof bv === 'number') {
      return ((Number(av) || 0) - (Number(bv) || 0)) * direction;
    }
    return String(av ?? '').localeCompare(String(bv ?? '')) * direction;
  });
  return copy;
}

function stopRefresh() {
  if (refreshInterval) {
    clearInterval(refreshInterval);
    refreshInterval = null;
  }
}

function renderRows(job) {
  const rows = sortBalanceRows(job?.results || [], sortKey, sortDir);
  if (rows.length === 0) {
    return '<div class="empty-state">No balance results yet. Start a run to generate aggregate win rates.</div>';
  }

  const header = [
    ['nameEn', 'Creature'],
    ['rarity', 'Rarity'],
    ['appearances', 'Appearances'],
    ['wins', 'Wins'],
    ['losses', 'Losses'],
    ['winRate', 'Win Rate'],
    ['lossRate', 'Loss Rate']
  ].map(([key, label]) => `<th><button class="table-sort" data-sort="${key}">${label}</button></th>`).join('');

  const body = rows.map(row => `
    <tr>
      <td><span class="vocab-word">${esc(row.nameEn || row.name || row.creatureId)}</span></td>
      <td>${esc(row.rarity)}</td>
      <td>${row.appearances || 0}</td>
      <td>${row.wins || 0}</td>
      <td>${row.losses || 0}</td>
      <td>${formatPercent(row.winRate)}</td>
      <td>${formatPercent(row.lossRate)}</td>
    </tr>
  `).join('');

  return `
    <div class="vocab-table-wrap">
      <table class="vocab-table balance-table">
        <thead><tr>${header}</tr></thead>
        <tbody>${body}</tbody>
      </table>
    </div>
  `;
}

function renderStatus(job) {
  if (!job || job.status === 'idle') {
    return '<div class="empty-state">No active balance simulation.</div>';
  }
  const total = Number(job.battleCount) || 0;
  const done = Number(job.completedBattles) || 0;
  const pct = total > 0 ? Math.min(100, (done / total) * 100) : 0;
  return `
    <div class="balance-status">
      <span class="status-badge status-${esc(job.status)}">${esc(job.status)}</span>
      <strong>${done.toLocaleString()} / ${total.toLocaleString()}</strong>
      <span>Level ${esc(job.creatureLevel)}</span>
      <span>Draws: ${(job.draws || 0).toLocaleString()}</span>
      <div class="progress-bar"><div class="fill" style="width: ${pct}%"></div></div>
    </div>
  `;
}

async function refresh(appEl) {
  const job = await balance.current();
  const statusEl = appEl.querySelector('[data-balance-status]');
  const resultsEl = appEl.querySelector('[data-balance-results]');
  if (statusEl) statusEl.innerHTML = renderStatus(job);
  if (resultsEl) resultsEl.innerHTML = renderRows(job);

  if (job?.status === 'running' && !refreshInterval) {
    refreshInterval = setInterval(() => refresh(appEl).catch(console.error), 1000);
  }
  if (job?.status !== 'running') stopRefresh();
}

export async function renderBalance(appEl) {
  stopRefresh();
  appEl.innerHTML = `
    <section class="balance-panel">
      <div class="sim-header">
        <h2>Balance Simulator</h2>
      </div>
      <form class="balance-form">
        <div class="form-row">
          <div class="form-group">
            <label>Battle Count</label>
            <input name="battleCount" type="number" min="1" step="1" value="10000">
          </div>
          <div class="form-group">
            <label>Creature Level</label>
            <input name="creatureLevel" type="number" min="1" step="1" value="40">
          </div>
        </div>
        <div class="actions">
          <button class="btn btn-primary" type="submit">Start</button>
          <button class="btn btn-danger" type="button" data-cancel>Cancel</button>
        </div>
      </form>
      <div data-balance-status></div>
      <div data-balance-results></div>
    </section>
  `;

  appEl.querySelector('.balance-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const battleCount = Number(form.querySelector('[name="battleCount"]').value);
    const creatureLevel = Number(form.querySelector('[name="creatureLevel"]').value);
    await balance.start(battleCount, creatureLevel);
    await refresh(appEl);
  });

  appEl.querySelector('[data-cancel]').addEventListener('click', async () => {
    await balance.cancel();
    await refresh(appEl);
  });

  appEl.addEventListener('click', async (event) => {
    const button = event.target.closest('[data-sort]');
    if (!button) return;
    const nextKey = button.dataset.sort;
    if (sortKey === nextKey) sortDir = sortDir === 'desc' ? 'asc' : 'desc';
    else {
      sortKey = nextKey;
      sortDir = nextKey === 'nameEn' || nextKey === 'rarity' ? 'asc' : 'desc';
    }
    await refresh(appEl);
  });

  await refresh(appEl);
}
```

- [ ] **Step 5: Wire the Balance tab into the SPA**

In `simulator/public/js/app.js`, add:

```js
import { renderBalance } from './balance.js';
```

Add the route:

```js
  balance: () => renderBalance(appEl),
```

In `simulator/public/index.html`, add the nav link after Compare:

```html
      <a href="#balance" class="nav-link" data-view="balance">Balance</a>
```

Add the script before `app.js`:

```html
  <script type="module" src="/js/balance.js"></script>
```

- [ ] **Step 6: Add Balance tab styles**

Append to `simulator/public/css/dashboard.css`:

```css
/* Balance simulator */
.balance-panel {
  display: grid;
  gap: 16px;
}

.balance-form {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 16px;
}

.balance-form .actions {
  display: flex;
  gap: 8px;
}

.balance-status {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 16px;
  display: grid;
  gap: 8px;
}

.balance-status strong {
  color: var(--text);
}

.table-sort {
  font: inherit;
  color: inherit;
  background: transparent;
  border: none;
  cursor: pointer;
  text-align: left;
}

.table-sort:hover {
  color: var(--text);
}
```

- [ ] **Step 7: Run UI helper tests and syntax checks**

Run: `cd simulator && npm run test:unit -- tests/unit/balance-view.test.js`

Expected: all tests pass.

Run: `node --check simulator/public/js/api.js && node --check simulator/public/js/app.js && node --check simulator/public/js/balance.js && echo "OK"`

Expected: `OK`

- [ ] **Step 8: Commit dashboard tab**

```bash
git add simulator/public/js/api.js simulator/public/js/balance.js simulator/public/js/app.js simulator/public/index.html simulator/public/css/dashboard.css simulator/tests/unit/balance-view.test.js
git commit -m "feat(simulator): add balance dashboard tab"
```

---

## Task 7: Documentation And Verification

**Files:**
- Modify: `docs/LEARNING_SIMULATOR.md`

- [ ] **Step 1: Update simulator documentation**

In `docs/LEARNING_SIMULATOR.md`, under `## Dashboard`, add:

```md
### Balance Screen

The Balance screen runs random 3v3 creature battles through the game server's admin balance simulation API.

Inputs:

| Setting | Description |
|---|---|
| Battle count | Number of random 3v3 battles to run |
| Creature level | Level assigned to every creature in the run |

Rules:

- Each battle samples 6 unique creatures from the full roster.
- All creatures use the latest 3 moves they would know at the selected level.
- Combat resolves through the shared PvP round resolver.
- Both sides choose moves using the same production combat AI helpers used by PvE enemies.
- Results are aggregate-only: appearances, wins, losses, draws, win rate, and loss rate.
- No per-battle logs or replays are stored.
```

Under `## Environment Variables`, add:

```md
The Balance screen also requires `ADMIN_SECRET` because the simulator backend starts and polls game-server admin jobs.
```

- [ ] **Step 2: Run all focused unit tests**

Run: `npm run test:unit -- tests/unit/creature/creatures.test.js tests/unit/game/balance-simulator.test.js tests/unit/admin-balance-simulator-routes.test.js`

Expected: all listed game-server tests pass.

Run: `cd simulator && npm run test:unit -- tests/unit/store.test.js tests/unit/balance-routes.test.js tests/unit/balance-view.test.js`

Expected: all listed simulator tests pass.

- [ ] **Step 3: Run syntax checks for edited JavaScript files**

Run:

```bash
node --check src/game/creatures.js && \
node --check src/game/balance-simulator.js && \
node --check src/routes/admin.js && \
node --check simulator/db/store.js && \
node --check simulator/routes/balance.js && \
node --check simulator/server.js && \
node --check simulator/public/js/api.js && \
node --check simulator/public/js/app.js && \
node --check simulator/public/js/balance.js && \
echo "OK"
```

Expected: `OK`

- [ ] **Step 4: Run broader unit suites**

Run: `npm run test:unit`

Expected: all game-server unit tests pass.

Run: `cd simulator && npm run test:unit`

Expected: all simulator unit tests pass.

- [ ] **Step 5: Visual verification with user approval**

Ask the user before launching the browser because the project rules require consent before Playwright. After approval, run the dev servers and verify the Balance tab visually:

```bash
ADMIN_SECRET=dev-secret npm run dev
```

In a second terminal:

```bash
cd simulator && ADMIN_SECRET=dev-secret GAME_SERVER_URL=http://localhost:3000 npm run dev
```

Open `http://localhost:3100/#balance`, confirm the tab renders, start a small run with `battleCount=25` and `creatureLevel=40`, wait for completion, and capture a screenshot showing aggregate rows with rarity and win/loss rates. Delete any screenshot file immediately after it is shown.

- [ ] **Step 6: Commit docs and verification fixes**

```bash
git add docs/LEARNING_SIMULATOR.md
git commit -m "docs(simulator): document balance simulation dashboard"
```

---

## Final Verification Checklist

- [ ] `npm run test:unit -- tests/unit/creature/creatures.test.js tests/unit/game/balance-simulator.test.js tests/unit/admin-balance-simulator-routes.test.js` passes.
- [ ] `cd simulator && npm run test:unit -- tests/unit/store.test.js tests/unit/balance-routes.test.js tests/unit/balance-view.test.js` passes.
- [ ] `npm run test:unit` passes.
- [ ] `cd simulator && npm run test:unit` passes.
- [ ] Syntax check command from Task 7 passes.
- [ ] Balance tab has been visually verified with a screenshot after user-approved browser launch.
- [ ] No per-battle logs are stored in game-server responses or simulator SQLite rows.
- [ ] High-level PvE enemies use the latest 3 eligible learned moves.
