# Enemy Scaling System Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace Koto's flat enemy scaling with a stage-based + encounter-ramping system inspired by Pokerogue, where enemy levels, count, rarity, and XP rewards all scale with progression.

**Architecture:** New pure functions in `src/game/creatures.js` compute enemy level from area stage + encounter index + party size. `generateEnemyCreature()` and `generateEnemyCreatures()` gain new parameters. `loop.js` passes context through. XP formula scales with enemy level.

**Tech Stack:** Node.js, node:test, ES modules

**Design doc:** `docs/plans/2026-03-03-enemy-scaling-design.md`

---

### Task 1: Add `getEnemyLevel()` pure function with tests

**Files:**
- Modify: `src/game/creatures.js` — add new exported function
- Create: `tests/unit/creature/enemy-scaling.test.js`

**Step 1: Write the failing tests**

Create `tests/unit/creature/enemy-scaling.test.js`:

```javascript
import { describe, it } from 'node:test';
import assert from 'node:assert';
import { getEnemyLevel } from '../../../src/game/creatures.js';

describe('getEnemyLevel', () => {
  it('computes baseline from stage', () => {
    // Stage 1, encounter 0, 2 enemies (1.0x), player level 10
    const level = getEnemyLevel({ stage: 1, encounterIndex: 0, enemyCount: 2, playerLevel: 10 });
    // stageBaseline = 1 * 3 = 3, encounterBonus = 0, partySizeMult = 1.0 → 3
    assert.strictEqual(level, 3);
  });

  it('ramps with encounter index', () => {
    // Stage 3, encounter 5, 2 enemies, player level 20
    const level = getEnemyLevel({ stage: 3, encounterIndex: 5, enemyCount: 2, playerLevel: 20 });
    // stageBaseline = 9, encounterBonus = 9 * (5 * 0.08) = 3.6, total = 12.6, round = 13
    assert.strictEqual(level, 13);
  });

  it('applies solo multiplier (1.2x) for 1 enemy', () => {
    const level = getEnemyLevel({ stage: 3, encounterIndex: 0, enemyCount: 1, playerLevel: 20 });
    // stageBaseline = 9, encounterBonus = 0, * 1.2 = 10.8, round = 11
    assert.strictEqual(level, 11);
  });

  it('applies group multiplier (0.85x) for 3 enemies', () => {
    const level = getEnemyLevel({ stage: 3, encounterIndex: 0, enemyCount: 3, playerLevel: 20 });
    // stageBaseline = 9, encounterBonus = 0, * 0.85 = 7.65, round = 8
    assert.strictEqual(level, 8);
  });

  it('clamps to playerLevel + 5 max', () => {
    // Stage 10, encounter 5 → high raw level, but player is only level 10
    const level = getEnemyLevel({ stage: 10, encounterIndex: 5, enemyCount: 1, playerLevel: 10 });
    assert.strictEqual(level, 15); // 10 + 5
  });

  it('clamps to playerLevel - 5 min (floor 1)', () => {
    // Stage 1, encounter 0, 3 enemies → low raw level, player is level 20
    const level = getEnemyLevel({ stage: 1, encounterIndex: 0, enemyCount: 3, playerLevel: 20 });
    assert.strictEqual(level, 15); // 20 - 5
  });

  it('never returns below 1', () => {
    const level = getEnemyLevel({ stage: 1, encounterIndex: 0, enemyCount: 3, playerLevel: 1 });
    assert.ok(level >= 1);
  });

  it('defaults to stage 1 when stage is undefined', () => {
    const level = getEnemyLevel({ encounterIndex: 0, enemyCount: 2, playerLevel: 5 });
    // stageBaseline = 1 * 3 = 3
    assert.strictEqual(level, 3);
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `node --test tests/unit/creature/enemy-scaling.test.js`
Expected: FAIL — `getEnemyLevel` is not exported

**Step 3: Implement `getEnemyLevel` in `src/game/creatures.js`**

Add before the `generateEnemyCreature` function (around line 190):

```javascript
const PARTY_SIZE_MULTIPLIERS = {
  1: 1.2,
  2: 1.0,
  3: 0.85
};

export function getEnemyLevel({ stage = 1, encounterIndex = 0, enemyCount = 1, playerLevel = 1 }) {
  const stageBaseline = stage * 3;
  const encounterBonus = stageBaseline * (encounterIndex * 0.08);
  const rawLevel = stageBaseline + encounterBonus;
  const sizeMultiplier = PARTY_SIZE_MULTIPLIERS[enemyCount] || 1.0;
  const adjustedLevel = Math.round(rawLevel * sizeMultiplier);
  const minLevel = Math.max(1, playerLevel - 5);
  const maxLevel = playerLevel + 5;
  return Math.max(minLevel, Math.min(adjustedLevel, maxLevel));
}
```

**Step 4: Run tests to verify they pass**

Run: `node --test tests/unit/creature/enemy-scaling.test.js`
Expected: All 8 tests PASS

**Step 5: Commit**

```bash
git add src/game/creatures.js tests/unit/creature/enemy-scaling.test.js
git commit -m "feat: add getEnemyLevel() with stage-based scaling formula"
```

---

### Task 2: Add stage-based rarity system with tests

**Files:**
- Modify: `src/game/creatures.js` — add `getRarityWeightsForStage()`, update `rollRarity()`
- Modify: `tests/unit/creature/enemy-scaling.test.js` — add rarity tests

**Step 1: Write the failing tests**

Append to `tests/unit/creature/enemy-scaling.test.js`:

```javascript
import { getRarityWeightsForStage } from '../../../src/game/creatures.js';

describe('getRarityWeightsForStage', () => {
  it('stage 1 is heavily common-weighted, no epic', () => {
    const weights = getRarityWeightsForStage(1);
    assert.strictEqual(weights.common, 80);
    assert.strictEqual(weights.uncommon, 18);
    assert.strictEqual(weights.rare, 2);
    assert.strictEqual(weights.epic, 0);
    assert.strictEqual(weights.legendary, undefined);
  });

  it('stage 5 has moderate rarity spread', () => {
    const weights = getRarityWeightsForStage(5);
    assert.strictEqual(weights.common, 50);
    assert.strictEqual(weights.uncommon, 35);
    assert.strictEqual(weights.rare, 12);
    assert.strictEqual(weights.epic, 3);
    assert.strictEqual(weights.legendary, undefined);
  });

  it('stage 8 has rare/epic prevalent', () => {
    const weights = getRarityWeightsForStage(8);
    assert.strictEqual(weights.common, 30);
    assert.strictEqual(weights.uncommon, 30);
    assert.strictEqual(weights.rare, 25);
    assert.strictEqual(weights.epic, 15);
    assert.strictEqual(weights.legendary, undefined);
  });

  it('stage 10 is endgame distribution', () => {
    const weights = getRarityWeightsForStage(10);
    assert.strictEqual(weights.common, 20);
    assert.strictEqual(weights.uncommon, 30);
    assert.strictEqual(weights.rare, 30);
    assert.strictEqual(weights.epic, 20);
    assert.strictEqual(weights.legendary, undefined);
  });

  it('never includes legendary in wild encounters', () => {
    for (let s = 1; s <= 10; s++) {
      const weights = getRarityWeightsForStage(s);
      assert.strictEqual(weights.legendary, undefined, `Stage ${s} should not have legendary`);
    }
  });

  it('defaults to stage 1 weights when stage is undefined', () => {
    const weights = getRarityWeightsForStage(undefined);
    assert.strictEqual(weights.common, 80);
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `node --test tests/unit/creature/enemy-scaling.test.js`
Expected: FAIL — `getRarityWeightsForStage` is not exported

**Step 3: Implement `getRarityWeightsForStage` and update `rollRarity`**

Add to `src/game/creatures.js` after `RARITY_WEIGHTS`:

```javascript
const STAGE_RARITY_TABLE = {
  // stage range: { common, uncommon, rare, epic } — no legendary in wild
  early:  { common: 80, uncommon: 18, rare: 2, epic: 0 },   // stage 1-3
  mid:    { common: 50, uncommon: 35, rare: 12, epic: 3 },   // stage 4-6
  late:   { common: 30, uncommon: 30, rare: 25, epic: 15 },  // stage 7-9
  endgame: { common: 20, uncommon: 30, rare: 30, epic: 20 }  // stage 10
};

export function getRarityWeightsForStage(stage) {
  const s = stage || 1;
  if (s <= 3) return { ...STAGE_RARITY_TABLE.early };
  if (s <= 6) return { ...STAGE_RARITY_TABLE.mid };
  if (s <= 9) return { ...STAGE_RARITY_TABLE.late };
  return { ...STAGE_RARITY_TABLE.endgame };
}
```

Update the existing `rollRarity()` function (line ~181) to accept an optional stage parameter:

```javascript
export function rollRarity(stage) {
  const weights = stage != null ? getRarityWeightsForStage(stage) : RARITY_WEIGHTS;
  const totalWeight = Object.values(weights).reduce((a, b) => a + b, 0);
  let roll = Math.random() * totalWeight;
  for (const [rarity, weight] of Object.entries(weights)) {
    roll -= weight;
    if (roll <= 0) return rarity;
  }
  return 'common';
}
```

**Step 4: Run tests to verify they pass**

Run: `node --test tests/unit/creature/enemy-scaling.test.js`
Expected: All tests PASS

**Step 5: Run existing creature tests to verify no regressions**

Run: `node --test tests/unit/creature/creatures.test.js`
Expected: All existing tests PASS (rollRarity without args still uses old weights)

**Step 6: Commit**

```bash
git add src/game/creatures.js tests/unit/creature/enemy-scaling.test.js
git commit -m "feat: add stage-based rarity weights, legendaries are boss-exclusive"
```

---

### Task 3: Add encounter-index-based enemy count with tests

**Files:**
- Modify: `src/game/creatures.js` — add `getEnemyCountWeights()`
- Modify: `tests/unit/creature/enemy-scaling.test.js`

**Step 1: Write the failing tests**

Append to `tests/unit/creature/enemy-scaling.test.js`:

```javascript
import { getEnemyCountWeights } from '../../../src/game/creatures.js';

describe('getEnemyCountWeights', () => {
  it('early encounters favor solo enemies', () => {
    const weights = getEnemyCountWeights(0);
    assert.deepStrictEqual(weights, [
      { count: 1, weight: 50 },
      { count: 2, weight: 40 },
      { count: 3, weight: 10 }
    ]);
  });

  it('mid encounters are balanced', () => {
    const weights = getEnemyCountWeights(3);
    assert.deepStrictEqual(weights, [
      { count: 1, weight: 40 },
      { count: 2, weight: 35 },
      { count: 3, weight: 25 }
    ]);
  });

  it('late encounters favor groups', () => {
    const weights = getEnemyCountWeights(5);
    assert.deepStrictEqual(weights, [
      { count: 1, weight: 30 },
      { count: 2, weight: 35 },
      { count: 3, weight: 35 }
    ]);
  });

  it('very late encounters use late weights', () => {
    const weights = getEnemyCountWeights(10);
    assert.deepStrictEqual(weights, [
      { count: 1, weight: 30 },
      { count: 2, weight: 35 },
      { count: 3, weight: 35 }
    ]);
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `node --test tests/unit/creature/enemy-scaling.test.js`
Expected: FAIL — `getEnemyCountWeights` is not exported

**Step 3: Implement `getEnemyCountWeights`**

Add to `src/game/creatures.js` after the existing `ENEMY_COUNT_WEIGHTS`:

```javascript
const ENCOUNTER_COUNT_TABLE = {
  early: [   // encounterIndex 0-2
    { count: 1, weight: 50 },
    { count: 2, weight: 40 },
    { count: 3, weight: 10 }
  ],
  mid: [     // encounterIndex 3-4
    { count: 1, weight: 40 },
    { count: 2, weight: 35 },
    { count: 3, weight: 25 }
  ],
  late: [    // encounterIndex 5+
    { count: 1, weight: 30 },
    { count: 2, weight: 35 },
    { count: 3, weight: 35 }
  ]
};

export function getEnemyCountWeights(encounterIndex = 0) {
  if (encounterIndex <= 2) return ENCOUNTER_COUNT_TABLE.early;
  if (encounterIndex <= 4) return ENCOUNTER_COUNT_TABLE.mid;
  return ENCOUNTER_COUNT_TABLE.late;
}
```

**Step 4: Run tests to verify they pass**

Run: `node --test tests/unit/creature/enemy-scaling.test.js`
Expected: All tests PASS

**Step 5: Commit**

```bash
git add src/game/creatures.js tests/unit/creature/enemy-scaling.test.js
git commit -m "feat: add encounter-index-based enemy count distribution"
```

---

### Task 4: Wire scaling into `generateEnemyCreatures()` and `generateEnemyCreature()`

**Files:**
- Modify: `src/game/creatures.js` — update `generateEnemyCreatures()` and `generateEnemyCreature()` signatures and logic

**Step 1: Write the failing tests**

Append to `tests/unit/creature/enemy-scaling.test.js`:

```javascript
import { generateEnemyCreatures } from '../../../src/game/creatures.js';

describe('generateEnemyCreatures with scaling', () => {
  it('accepts stage and encounterIndex options', () => {
    const enemies = generateEnemyCreatures(10, {
      stage: 3,
      encounterIndex: 2,
      creaturePool: ['hikaribon', 'kamedor', 'kazenoko']
    });
    assert.ok(enemies.length >= 1 && enemies.length <= 3);
    for (const e of enemies) {
      assert.ok(e.level >= 1, `enemy level should be >= 1, got ${e.level}`);
    }
  });

  it('enemies are higher level with higher stage', () => {
    // Run many trials and compare average levels
    let avgLowStage = 0;
    let avgHighStage = 0;
    const trials = 50;
    const pool = ['hikaribon', 'kamedor', 'kazenoko'];
    for (let i = 0; i < trials; i++) {
      const low = generateEnemyCreatures(15, { stage: 1, encounterIndex: 0, creaturePool: pool });
      const high = generateEnemyCreatures(15, { stage: 7, encounterIndex: 0, creaturePool: pool });
      avgLowStage += low.reduce((s, e) => s + e.level, 0) / low.length;
      avgHighStage += high.reduce((s, e) => s + e.level, 0) / high.length;
    }
    avgLowStage /= trials;
    avgHighStage /= trials;
    assert.ok(avgHighStage > avgLowStage, `Stage 7 avg (${avgHighStage}) should be > Stage 1 avg (${avgLowStage})`);
  });

  it('still works with legacy call (no stage/encounterIndex)', () => {
    const enemies = generateEnemyCreatures(5);
    assert.ok(enemies.length >= 1 && enemies.length <= 3);
    for (const e of enemies) {
      assert.ok(e.hp > 0);
    }
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `node --test tests/unit/creature/enemy-scaling.test.js`
Expected: FAIL — generateEnemyCreatures doesn't use stage/encounterIndex yet (the "enemies are higher level with higher stage" test should fail since levels are still based on playerLevel ±1)

**Step 3: Update `generateEnemyCreature()` and `generateEnemyCreatures()`**

Replace `generateEnemyCreature` (lines ~191-236):

```javascript
export function generateEnemyCreature(targetLevel, creaturePool = null, stage = null) {
  let group;

  if (creaturePool && creaturePool.length > 0) {
    // Area-restricted: only spawn creatures from this area's pool
    group = CREATURE_DATA.filter(r => creaturePool.includes(r.id));
    if (group.length === 0) group = CREATURE_DATA; // fallback if pool IDs don't match
  } else if (stage != null) {
    // Stage-based rarity filtering
    const rarity = rollRarity(stage);
    group = CREATURE_DATA.filter(r => r.rarity === rarity);
    if (!group || group.length === 0) group = CREATURE_DATA;
  } else {
    // Random element+rarity selection (legacy/fallback)
    const elements = ['wood', 'fire', 'earth', 'metal', 'water'];
    for (let attempts = 0; attempts < 20; attempts++) {
      const rarity = rollRarity();
      const element = elements[Math.floor(Math.random() * elements.length)];
      group = CREATURES_BY_ELEMENT_RARITY[`${element}-${rarity}`];
      if (group && group.length > 0) break;
    }
    if (!group || group.length === 0) {
      group = CREATURE_DATA;
    }
  }

  // When using area pool with stage-based rarity, filter pool by rolled rarity
  if (creaturePool && creaturePool.length > 0 && stage != null) {
    const rarity = rollRarity(stage);
    const rarityFiltered = group.filter(r => r.rarity === rarity);
    if (rarityFiltered.length > 0) group = rarityFiltered;
    // If no match in pool for that rarity, use full pool (fallback)
  }

  const template = group[Math.floor(Math.random() * group.length)];
  const creature = instantiateCreature(template.id);

  while (creature.level < targetLevel) {
    addXpToCreature(creature, xpToNextLevel(creature.level));
  }

  // Ensure enemy has ALL moves up to its level
  const tmpl = CREATURES_BY_ID[creature.id];
  if (tmpl?.learnset) {
    if (!creature.moves) creature.moves = [];
    for (const entry of tmpl.learnset) {
      if (entry.level <= creature.level) {
        const moveData = MOVES_BY_ID[entry.moveId];
        if (moveData && !creature.moves.find(m => m.id === moveData.id)) {
          creature.moves.push({ ...moveData });
        }
      }
    }
  }

  return creature;
}
```

Replace `generateEnemyCreatures` (lines ~244-260):

```javascript
export function generateEnemyCreatures(highestAllyLevel = 1, { maxEnemies, creaturePool, stage, encounterIndex } = {}) {
  // Determine enemy count using encounter-aware weights
  const countWeights = encounterIndex != null ? getEnemyCountWeights(encounterIndex) : ENEMY_COUNT_WEIGHTS;
  const totalWeight = countWeights.reduce((s, w) => s + w.weight, 0);
  let roll = Math.random() * totalWeight;
  let enemyCount = 1;
  for (const { count, weight } of countWeights) {
    roll -= weight;
    if (roll <= 0) { enemyCount = count; break; }
  }
  if (maxEnemies) enemyCount = Math.min(enemyCount, maxEnemies);

  // Determine per-enemy level using scaling formula or legacy fallback
  const enemies = [];
  for (let i = 0; i < enemyCount; i++) {
    let targetLevel;
    if (stage != null) {
      targetLevel = getEnemyLevel({
        stage,
        encounterIndex: encounterIndex || 0,
        enemyCount,
        playerLevel: highestAllyLevel
      });
    } else {
      // Legacy: highestAllyLevel ± 1
      const levelVariance = Math.floor(Math.random() * 3) - 1;
      targetLevel = Math.max(1, highestAllyLevel + levelVariance);
    }
    enemies.push(generateEnemyCreature(targetLevel, creaturePool, stage));
  }
  return enemies;
}
```

**Step 4: Run ALL creature tests to verify nothing broke**

Run: `node --test tests/unit/creature/enemy-scaling.test.js tests/unit/creature/creatures.test.js`
Expected: All tests PASS

**Step 5: Syntax check**

Run: `node --check src/game/creatures.js && echo "OK"`
Expected: OK

**Step 6: Commit**

```bash
git add src/game/creatures.js tests/unit/creature/enemy-scaling.test.js
git commit -m "feat: wire stage/encounter scaling into enemy generation"
```

---

### Task 5: Wire `loop.js` to pass stage and encounter context

**Files:**
- Modify: `src/game/loop.js` — update `startCreatureEncounter()` to pass stage + encounterIndex

**Step 1: Write the test**

Append to `tests/unit/creature/enemy-scaling.test.js`:

```javascript
describe('loop.js integration expectations', () => {
  it('getEnemyLevel handles encounterIndex=0 at stage 5 reasonably', () => {
    // Simulate what loop.js will pass
    const level = getEnemyLevel({ stage: 5, encounterIndex: 0, enemyCount: 2, playerLevel: 15 });
    assert.ok(level >= 10 && level <= 20, `Expected 10-20, got ${level}`);
  });
});
```

**Step 2: Run to confirm it passes** (should pass with existing getEnemyLevel)

Run: `node --test tests/unit/creature/enemy-scaling.test.js`
Expected: PASS

**Step 3: Update `startCreatureEncounter()` in `loop.js`**

In `src/game/loop.js`, find the `startCreatureEncounter()` method (around line 447). Replace lines 455-461:

Before:
```javascript
const highestLevel = Math.max(...this.run.creatureParty.active.map(r => r.level), 1);
const isFirstBattle = (this.run.encountersCompleted || 0) === 0;
const creaturePool = this.run.currentArea?.creatures || null;
const enemyCreatures = generateEnemyCreatures(highestLevel, {
  maxEnemies: isFirstBattle ? 2 : undefined,
  creaturePool
});
```

After:
```javascript
const highestLevel = Math.max(...this.run.creatureParty.active.map(r => r.level), 1);
const isFirstBattle = (this.run.encountersCompleted || 0) === 0;
const creaturePool = this.run.currentArea?.creatures || null;
const stage = this.run.currentArea?.stage || null;
const encounterIndex = this.run.encountersCompleted || 0;
const enemyCreatures = generateEnemyCreatures(highestLevel, {
  maxEnemies: isFirstBattle ? 2 : undefined,
  creaturePool,
  stage,
  encounterIndex
});
```

**Step 4: Syntax check**

Run: `node --check src/game/loop.js && echo "OK"`
Expected: OK

**Step 5: Run full unit + integration test suite**

Run: `npm test`
Expected: All tests PASS

**Step 6: Commit**

```bash
git add src/game/loop.js
git commit -m "feat: pass area stage and encounter index to enemy generation"
```

---

### Task 6: Scale XP rewards with enemy level

**Files:**
- Modify: `src/game/services/creature-combat-service.js` — update XP formula in `awardKillXp()`
- Modify: `tests/unit/combat/creature-combat-service.test.js` — update XP test expectations

**Step 1: Check existing XP tests**

Read `tests/unit/combat/creature-combat-service.test.js` and find tests that assert on XP values. They use `BASE_KILL_XP * enemyLevel * xpMultiplier`. The new formula is `(BASE_KILL_XP + enemyLevel * 2) * xpMultiplier`.

**Step 2: Update the XP formula**

In `src/game/services/creature-combat-service.js`, find `awardKillXp()` (line ~590). Change line:

Before:
```javascript
const baseXp = Math.floor(BASE_KILL_XP * enemyLevel * xpMultiplier);
```

After:
```javascript
const baseXp = Math.floor((BASE_KILL_XP + enemyLevel * 2) * xpMultiplier);
```

**Step 3: Update affected tests**

In `tests/unit/combat/creature-combat-service.test.js`, find any tests that assert specific XP values based on the old formula and update them to match the new formula: `(10 + enemyLevel * 2) * multiplier`.

For example, if a test uses `enemyLevel = 1`:
- Old: `10 * 1 = 10`
- New: `(10 + 1*2) = 12`

**Step 4: Run combat tests**

Run: `node --test tests/unit/combat/creature-combat-service.test.js`
Expected: All PASS

**Step 5: Run full test suite**

Run: `npm test`
Expected: All PASS

**Step 6: Commit**

```bash
git add src/game/services/creature-combat-service.js tests/unit/combat/creature-combat-service.test.js
git commit -m "feat: scale XP rewards with enemy level (BASE_XP + level*2)"
```

---

### Task 7: Final integration test and cleanup

**Files:**
- Modify: `tests/unit/creature/enemy-scaling.test.js` — add integration-level tests

**Step 1: Write integration tests**

Append to `tests/unit/creature/enemy-scaling.test.js`:

```javascript
describe('Full scaling integration', () => {
  it('stage 1 enemies are lower level than stage 7 enemies at same player level', () => {
    const pool = ['hikaribon', 'kamedor', 'kazenoko'];
    const s1 = generateEnemyCreatures(15, { stage: 1, encounterIndex: 0, creaturePool: pool });
    const s7 = generateEnemyCreatures(15, { stage: 7, encounterIndex: 0, creaturePool: pool });
    const avgS1 = s1.reduce((s, e) => s + e.level, 0) / s1.length;
    const avgS7 = s7.reduce((s, e) => s + e.level, 0) / s7.length;
    // With clamping, s7 should be at or above s1
    assert.ok(avgS7 >= avgS1, `Stage 7 (${avgS7}) should be >= Stage 1 (${avgS1})`);
  });

  it('later encounters produce higher average enemy levels', () => {
    const pool = ['hikaribon', 'kamedor', 'kazenoko'];
    let avgEarly = 0;
    let avgLate = 0;
    const trials = 30;
    for (let i = 0; i < trials; i++) {
      const early = generateEnemyCreatures(20, { stage: 5, encounterIndex: 0, creaturePool: pool });
      const late = generateEnemyCreatures(20, { stage: 5, encounterIndex: 5, creaturePool: pool });
      avgEarly += early.reduce((s, e) => s + e.level, 0) / early.length;
      avgLate += late.reduce((s, e) => s + e.level, 0) / late.length;
    }
    avgEarly /= trials;
    avgLate /= trials;
    assert.ok(avgLate >= avgEarly, `Late encounters (${avgLate}) should be >= early (${avgEarly})`);
  });

  it('no enemy is ever legendary in wild encounters with stage', () => {
    const pool = ['hikaribon', 'kamedor', 'kazenoko'];
    for (let i = 0; i < 100; i++) {
      const enemies = generateEnemyCreatures(30, { stage: 10, encounterIndex: 5, creaturePool: pool });
      for (const e of enemies) {
        assert.notStrictEqual(e.rarity, 'legendary', 'Should never get legendary in wild');
      }
    }
  });
});
```

**Step 2: Run all scaling tests**

Run: `node --test tests/unit/creature/enemy-scaling.test.js`
Expected: All PASS

**Step 3: Run full test suite**

Run: `npm test`
Expected: All PASS

**Step 4: Commit**

```bash
git add tests/unit/creature/enemy-scaling.test.js
git commit -m "test: add integration tests for enemy scaling system"
```
