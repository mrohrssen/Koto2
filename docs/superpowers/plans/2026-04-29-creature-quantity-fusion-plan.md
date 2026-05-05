# Creature Quantity Fusion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add spendable creature copy counts so befriending grants duplicate copies, fusion consumes required base creatures on every attempt, and starter/fusion selection surfaces owned quantities.

**Architecture:** Keep `meta.creatureCollection` as the permanent discovery set and add `meta.creatureCounts` as the current spendable inventory. Centralize quantity mutation in `src/game/services/creature-collection-service.js`, then update migration, befriend capture flushing, fusion service logic, route validation, and frontend displays to consume that shared API.

**Tech Stack:** Node.js ES modules, Express routes, browser JavaScript modules, `node:test`, Vite dev server for visual verification.

---

## File Structure

- Modify `src/game/services/creature-collection-service.js`: owns quantity helpers, starter validation by quantity, and catalog count output.
- Modify `src/game/state.js`: initializes `creatureCounts` for new saves.
- Modify `src/game/loop.js`: ensures loaded/new meta has creature counts.
- Modify `src/game/manager-registry.js`: migrates old saves and removes stale count keys.
- Modify `src/game/services/combat-cycle-service.js`: increments spendable counts when pending captures flush after victory.
- Modify `src/game/services/fusion-service.js`: builds quantity-aware recipe state and atomically consumes ingredients.
- Modify `src/routes/game/combat.js`: passes `creatureCounts` into the collection catalog.
- Modify `src/routes/game/run.js`: validates starter selection against quantity counts.
- Modify `public/game.js`: displays owned quantities in starter creature select and treats count `0` as unavailable.
- Modify `public/js/ui/fusion-lab.js`: displays owned/required ingredient counts and repeat-fusion status.
- Modify `public/game.css`: styles starter and fusion quantity badges.
- Modify tests:
  - `tests/unit/creature/collection-service.test.js`
  - `tests/unit/game/fusion-service.test.js`
  - `tests/unit/game/creature-capture-counts.test.js`

## Task 0: Isolate The Work

**Files:**
- No source files modified.

- [ ] **Step 1: Check current repo and worktree state**

Run:

```bash
/usr/bin/git rev-parse --show-toplevel
/usr/bin/git status --short
/usr/bin/git worktree list
```

Expected: repo root is `/Users/michiarohrssen/Documents/Claude/koto-dev`. There may be unrelated dirty files; do not revert them.

- [ ] **Step 2: Create an isolated implementation worktree**

Run from `/Users/michiarohrssen/Documents/Claude/koto-dev`:

```bash
/usr/bin/git worktree add ../koto-wt-creature-quantities -b feature/creature-quantities
cd ../koto-wt-creature-quantities
```

Expected: new worktree exists at `/Users/michiarohrssen/Documents/Claude/koto-wt-creature-quantities` on branch `feature/creature-quantities`.

- [ ] **Step 3: Copy the approved spec and plan into the feature worktree**

Copy both docs before implementation so the feature branch contains its own spec and plan:

```bash
cp ../koto-dev/docs/superpowers/specs/2026-04-29-creature-quantity-fusion-design.md docs/superpowers/specs/2026-04-29-creature-quantity-fusion-design.md
cp ../koto-dev/docs/superpowers/plans/2026-04-29-creature-quantity-fusion-plan.md docs/superpowers/plans/2026-04-29-creature-quantity-fusion-plan.md
```

Expected: both docs exist in the feature worktree.

## Task 1: Collection Quantity Helpers

**Files:**
- Modify: `src/game/services/creature-collection-service.js`
- Test: `tests/unit/creature/collection-service.test.js`

- [ ] **Step 1: Write failing collection helper tests**

Append these tests inside `describe('creature-collection-service', () => { ... })` in `tests/unit/creature/collection-service.test.js`, after the existing `addToCollection` describe block:

```js
  describe('creature copy counts', () => {
    it('initializes default starter counts for new or old meta', () => {
      const meta = { creatureCollection: ['hi'] };

      const counts = ensureCreatureCounts(meta);

      assert.strictEqual(counts.hi, 1);
      for (const id of DEFAULT_COLLECTION) {
        assert.strictEqual(counts[id], 1);
        assert.ok(meta.creatureCollection.includes(id));
      }
    });

    it('adds creature copies and preserves discovery', () => {
      const meta = { creatureCollection: ['hi'], creatureCounts: { hi: 1 } };

      const result = addCreatureCopy(meta, 'hi');
      const newResult = addCreatureCopy(meta, 'neko', 2);

      assert.deepStrictEqual(result, { addedDiscovery: false, count: 2 });
      assert.deepStrictEqual(newResult, { addedDiscovery: true, count: 2 });
      assert.strictEqual(meta.creatureCounts.hi, 2);
      assert.strictEqual(meta.creatureCounts.neko, 2);
      assert.ok(meta.creatureCollection.includes('neko'));
    });

    it('counts duplicate requirements by creature ID', () => {
      assert.deepStrictEqual(countRequirements(['hi', 'hi', 'neko']), [
        { id: 'hi', required: 2 },
        { id: 'neko', required: 1 }
      ]);
    });

    it('consumes creature copies atomically', () => {
      const meta = { creatureCollection: ['hi', 'neko'], creatureCounts: { hi: 2, neko: 1 } };

      const result = consumeCreatureCopies(meta, [
        { id: 'hi', required: 2 },
        { id: 'neko', required: 1 }
      ]);

      assert.strictEqual(result.success, true);
      assert.strictEqual(meta.creatureCounts.hi, 0);
      assert.strictEqual(meta.creatureCounts.neko, 0);
      assert.deepStrictEqual(result.consumed, [
        { id: 'hi', required: 2, ownedBefore: 2, ownedAfter: 0 },
        { id: 'neko', required: 1, ownedBefore: 1, ownedAfter: 0 }
      ]);
    });

    it('does not partially consume when requirements are missing', () => {
      const meta = { creatureCollection: ['hi', 'neko'], creatureCounts: { hi: 2, neko: 0 } };

      const result = consumeCreatureCopies(meta, [
        { id: 'hi', required: 2 },
        { id: 'neko', required: 1 }
      ]);

      assert.strictEqual(result.success, false);
      assert.deepStrictEqual(result.missing, [
        { id: 'neko', required: 1, owned: 0, missing: 1 }
      ]);
      assert.strictEqual(meta.creatureCounts.hi, 2);
      assert.strictEqual(meta.creatureCounts.neko, 0);
    });

    it('validates starter selection against owned counts', () => {
      const meta = {
        creatureCollection: ['hi', 'mizu'],
        creatureCounts: { hi: 1, mizu: 0 }
      };

      const valid = validateTeamSelection(meta.creatureCollection, ['hi'], meta.creatureCounts);
      const invalid = validateTeamSelection(meta.creatureCollection, ['mizu'], meta.creatureCounts);

      assert.strictEqual(valid.valid, true);
      assert.strictEqual(invalid.valid, false);
      assert.match(invalid.reason, /no owned copies/i);
    });

    it('adds owned count to catalog rows', () => {
      const catalog = getCollectionCatalog(['hi'], { hi: 5 }, { hi: 2 });
      const hi = catalog.find(c => c.id === 'hi');

      assert.strictEqual(hi.owned, true);
      assert.strictEqual(hi.ownedCount, 2);
      assert.strictEqual(hi.befriendCount, 5);
    });
  });
```

Update the import at the top of the test file:

```js
import {
  MAX_TEAM_POINTS,
  DEFAULT_COLLECTION,
  validateTeamSelection,
  addToCollection,
  getCollectionCatalog,
  ensureCreatureCounts,
  getCreatureCount,
  addCreatureCopy,
  consumeCreatureCopies,
  countRequirements
} from '../../../src/game/services/creature-collection-service.js';
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
node --test tests/unit/creature/collection-service.test.js
```

Expected: FAIL with missing export errors for `ensureCreatureCounts`, `getCreatureCount`, `addCreatureCopy`, `consumeCreatureCopies`, and `countRequirements`.

- [ ] **Step 3: Implement quantity helpers**

In `src/game/services/creature-collection-service.js`, replace `validateTeamSelection`, `addToCollection`, and `getCollectionCatalog` plus add helpers so the exported section reads:

```js
export const DEFAULT_COLLECTION = ['hikaribon', 'hanatchi', 'tsukimochi'];

function normalizeCount(value) {
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

export function ensureCreatureCounts(meta) {
  if (!meta || typeof meta !== 'object') return {};
  if (!Array.isArray(meta.creatureCollection)) meta.creatureCollection = [...DEFAULT_COLLECTION];
  if (!meta.creatureCounts || typeof meta.creatureCounts !== 'object' || Array.isArray(meta.creatureCounts)) {
    meta.creatureCounts = {};
  }

  for (const id of Object.keys(meta.creatureCounts)) {
    if (!CREATURES_BY_ID[id]) {
      delete meta.creatureCounts[id];
      continue;
    }
    meta.creatureCounts[id] = normalizeCount(meta.creatureCounts[id]);
  }

  for (const id of meta.creatureCollection) {
    if (CREATURES_BY_ID[id] && getCreatureCount(meta, id) === 0) {
      meta.creatureCounts[id] = 1;
    }
  }

  for (const id of DEFAULT_COLLECTION) {
    if (!meta.creatureCollection.includes(id)) meta.creatureCollection.push(id);
    if (getCreatureCount(meta, id) === 0) meta.creatureCounts[id] = 1;
  }

  return meta.creatureCounts;
}

export function getCreatureCount(metaOrCounts, creatureId) {
  const counts = metaOrCounts?.creatureCounts || metaOrCounts || {};
  return normalizeCount(counts[creatureId]);
}

export function addToCollection(collection, creatureId) {
  if (collection.includes(creatureId)) {
    return { added: false, collection };
  }
  collection.push(creatureId);
  return { added: true, collection };
}

export function addCreatureCopy(meta, creatureId, amount = 1) {
  if (!CREATURES_BY_ID[creatureId]) {
    throw new Error(`Unknown creature: ${creatureId}`);
  }
  ensureCreatureCounts(meta);
  const addAmount = normalizeCount(amount);
  const discovery = addToCollection(meta.creatureCollection, creatureId);
  meta.creatureCounts[creatureId] = getCreatureCount(meta, creatureId) + addAmount;
  return { addedDiscovery: discovery.added, count: meta.creatureCounts[creatureId] };
}

export function countRequirements(ids) {
  const byId = new Map();
  for (const id of ids || []) {
    byId.set(id, (byId.get(id) || 0) + 1);
  }
  return [...byId.entries()].map(([id, required]) => ({ id, required }));
}

export function consumeCreatureCopies(meta, requirements) {
  ensureCreatureCounts(meta);
  const normalized = requirements.map(req => ({
    id: req.id,
    required: normalizeCount(req.required)
  })).filter(req => req.required > 0);

  const missing = normalized
    .map(req => {
      const owned = getCreatureCount(meta, req.id);
      return { id: req.id, required: req.required, owned, missing: Math.max(0, req.required - owned) };
    })
    .filter(req => req.missing > 0);

  if (missing.length > 0) {
    return { success: false, missing };
  }

  const consumed = normalized.map(req => {
    const ownedBefore = getCreatureCount(meta, req.id);
    const ownedAfter = ownedBefore - req.required;
    meta.creatureCounts[req.id] = ownedAfter;
    return { id: req.id, required: req.required, ownedBefore, ownedAfter };
  });

  return { success: true, consumed };
}

export function validateTeamSelection(collection, selectedIds, creatureCounts = null) {
  if (!selectedIds || selectedIds.length === 0) {
    return { valid: false, reason: 'Select at least 1 creature' };
  }

  for (const id of selectedIds) {
    if (!collection.includes(id)) {
      return { valid: false, reason: `${id} not in collection` };
    }
    if (creatureCounts && getCreatureCount(creatureCounts, id) <= 0) {
      return { valid: false, reason: `${id} has no owned copies` };
    }
  }

  let totalCost = 0;
  for (const id of selectedIds) {
    const creature = CREATURES_BY_ID[id];
    if (!creature) {
      return { valid: false, reason: `Unknown creature: ${id}` };
    }
    totalCost += RARITY_POINT_COST[creature.rarity] || 3;
  }

  if (totalCost > MAX_TEAM_POINTS) {
    return { valid: false, reason: `Selection exceeds point budget (${totalCost}/${MAX_TEAM_POINTS})` };
  }

  return { valid: true, totalCost };
}

export function getCollectionCatalog(collection, befriendCount = {}, creatureCounts = {}) {
  return CREATURE_DATA.map(r => {
    const ownedCount = getCreatureCount(creatureCounts, r.id);
    return {
      id: r.id,
      name: r.name,
      nameEn: r.nameEn,
      element: r.element,
      rarity: r.rarity,
      baseHp: r.baseHp,
      baseAttack: r.baseAttack,
      baseDefense: r.baseDefense,
      baseMp: r.baseMp,
      archetype: r.archetype,
      area: r.area,
      baseWord: r.baseWord,
      baseMeaning: r.baseMeaning,
      modifier: r.modifier || null,
      autoSkill: r.autoSkill,
      learnset: (r.learnset || []).map(entry => ({
        level: entry.level,
        moveId: entry.moveId,
        nameEn: MOVES_BY_ID[entry.moveId]?.nameEn || entry.moveId,
        name: MOVES_BY_ID[entry.moveId]?.name || '',
        element: MOVES_BY_ID[entry.moveId]?.element || 'neutral'
      })),
      pointCost: RARITY_POINT_COST[r.rarity] || 3,
      owned: collection.includes(r.id) && ownedCount > 0,
      discovered: collection.includes(r.id),
      ownedCount,
      befriendCount: befriendCount[r.id] || 0
    };
  });
}
```

Keep the imports and constants at the top of the file unchanged.

- [ ] **Step 4: Remove unused test import if necessary**

If `getCreatureCount` is imported but not used directly after edits, either add this assertion to the first helper test:

```js
      assert.strictEqual(getCreatureCount(meta, 'hi'), 1);
```

or remove `getCreatureCount` from the import list.

- [ ] **Step 5: Run collection tests**

Run:

```bash
node --test tests/unit/creature/collection-service.test.js
```

Expected: PASS.

- [ ] **Step 6: Commit helper layer**

Run:

```bash
/usr/bin/git add src/game/services/creature-collection-service.js tests/unit/creature/collection-service.test.js
/usr/bin/git commit -m "$(cat <<'EOF'
Add creature copy inventory helpers

EOF
)"
```

Expected: commit succeeds.

## Task 2: Meta Initialization And Save Migration

**Files:**
- Modify: `src/game/state.js`
- Modify: `src/game/loop.js`
- Modify: `src/game/manager-registry.js`
- Test: `tests/unit/creature/collection-service.test.js`

- [ ] **Step 1: Add new-save test**

Append this test to `tests/unit/creature/collection-service.test.js` inside `describe('creature copy counts', () => { ... })`:

```js
    it('preserves explicit zero counts during normal helper use', () => {
      const meta = {
        creatureCollection: ['hi'],
        creatureCounts: { hi: 0, hikaribon: 1, hanatchi: 1, tsukimochi: 1 }
      };

      ensureCreatureCounts(meta);

      assert.strictEqual(meta.creatureCounts.hi, 0);
    });
```

Expected note: this test guards against remigrating a fused-away creature back to `1` every time helpers run.

- [ ] **Step 2: Run test to verify failure**

Run:

```bash
node --test tests/unit/creature/collection-service.test.js
```

Expected: FAIL if `ensureCreatureCounts()` currently grants `1` to every discovered ID even when an explicit count exists at `0`.

- [ ] **Step 3: Adjust `ensureCreatureCounts()` to distinguish missing from zero**

In `src/game/services/creature-collection-service.js`, update the loop over `meta.creatureCollection`:

```js
  for (const id of meta.creatureCollection) {
    if (CREATURES_BY_ID[id] && meta.creatureCounts[id] === undefined) {
      meta.creatureCounts[id] = 1;
    }
  }
```

Keep the default starter guarantee as written so default starters remain at least `1`.

- [ ] **Step 4: Initialize new saves**

In `src/game/state.js`, add `creatureCounts` immediately after `creatureCollection`:

```js
    // Current spendable creature copies (persists across runs)
    creatureCounts: {
      hikaribon: 1,
      hanatchi: 1,
      tsukimochi: 1
    },
```

- [ ] **Step 5: Ensure loaded meta in `GameManager.initMeta()`**

Update the imports in `src/game/loop.js` to include `ensureCreatureCounts`:

```js
import { ensureCreatureCounts } from './services/creature-collection-service.js';
```

Then update `initMeta()`:

```js
  initMeta(metaData = null) {
    this.meta = metaData || createMetaProgression();
    if (!this.meta.creatureCollection) {
      this.meta.creatureCollection = ['hikaribon', 'hanatchi', 'tsukimochi'];
    }
    ensureCreatureCounts(this.meta);
    return this.meta;
  }
```

- [ ] **Step 6: Migrate saved meta in `manager-registry`**

Update the imports in `src/game/manager-registry.js`:

```js
import { DEFAULT_COLLECTION, ensureCreatureCounts } from './services/creature-collection-service.js';
```

In the existing “remove stale creature IDs and ensure defaults” block, after filtering `data.meta.creatureCollection`, add count cleanup and migration:

```js
            if (!data.meta.creatureCounts || typeof data.meta.creatureCounts !== 'object' || Array.isArray(data.meta.creatureCounts)) {
              data.meta.creatureCounts = {};
            }
            for (const id of Object.keys(data.meta.creatureCounts)) {
              if (!CREATURES_BY_ID[id]) delete data.meta.creatureCounts[id];
            }
            ensureCreatureCounts(data.meta);
```

If `DEFAULT_COLLECTION` is already imported from another module in this file, do not duplicate the import; adjust the existing import instead.

- [ ] **Step 7: Run syntax checks**

Run:

```bash
node --check src/game/state.js
node --check src/game/loop.js
node --check src/game/manager-registry.js
node --check src/game/services/creature-collection-service.js
```

Expected: all print no syntax errors.

- [ ] **Step 8: Run collection tests**

Run:

```bash
node --test tests/unit/creature/collection-service.test.js
```

Expected: PASS.

- [ ] **Step 9: Commit migration**

Run:

```bash
/usr/bin/git add src/game/state.js src/game/loop.js src/game/manager-registry.js src/game/services/creature-collection-service.js tests/unit/creature/collection-service.test.js
/usr/bin/git commit -m "$(cat <<'EOF'
Initialize spendable creature counts

EOF
)"
```

Expected: commit succeeds.

## Task 3: Befriend Capture Counts And Catalog API

**Files:**
- Modify: `src/game/services/combat-cycle-service.js`
- Modify: `src/routes/game/combat.js`
- Test: `tests/unit/game/creature-capture-counts.test.js`

- [ ] **Step 1: Create focused failing test**

Create `tests/unit/game/creature-capture-counts.test.js`:

```js
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { CombatCycleService } from '../../../src/game/services/combat-cycle-service.js';

function makeServiceWithPendingCapture() {
  const captured = {
    id: 'hi',
    name: '火',
    nameEn: 'Hi',
    element: 'fire',
    rarity: 'common',
    hp: 10,
    maxHp: 10,
    temporary: false
  };

  const gm = {
    run: {
      crestMults: {},
      runSummary: { creaturesBefriended: 0 },
      creatureParty: {
        active: [],
        reserves: [],
        pendingCaptures: [captured],
        maxTotal: 6
      }
    },
    meta: {
      creatureCollection: ['hi'],
      creatureCounts: { hi: 1 },
      befriendCount: { hi: 1 }
    }
  };

  return { service: new CombatCycleService(gm), gm };
}

describe('creature capture counts', () => {
  it('increments spendable copies and lifetime befriend count for duplicate captures', () => {
    const { service, gm } = makeServiceWithPendingCapture();

    const additions = service._flushPendingCaptures();

    assert.deepEqual(additions, []);
    assert.equal(gm.meta.creatureCounts.hi, 2);
    assert.equal(gm.meta.befriendCount.hi, 2);
    assert.equal(gm.run.runSummary.creaturesBefriended, 1);
    assert.equal(gm.run.creatureParty.active.length, 1);
    assert.equal(gm.run.creatureParty.pendingCaptures.length, 0);
  });
});
```

- [ ] **Step 2: Run test to verify failure**

Run:

```bash
node --test tests/unit/game/creature-capture-counts.test.js
```

Expected: FAIL because `_flushPendingCaptures()` still uses `addToCollection()` and does not increment `creatureCounts`.

- [ ] **Step 3: Update befriend capture flush**

In `src/game/services/combat-cycle-service.js`, change the import:

```js
import { addCreatureCopy } from './creature-collection-service.js';
```

Replace the discovery block in `_flushPendingCaptures()`:

```js
        const result = addCreatureCopy(this.gm.meta, creature.id);
        if (result.addedDiscovery) {
          newAdditions.push({ id: creature.id, name: creature.name, nameEn: creature.nameEn, element: creature.element, rarity: creature.rarity });
        }
```

Keep the existing `befriendCount` and `runSummary.creaturesBefriended` increments.

- [ ] **Step 4: Update catalog route to return counts**

In `src/routes/game/combat.js`, update `/creature-collection`:

```js
      const collection = meta.creatureCollection || ['hikaribon', 'hanatchi', 'tsukimochi'];
      const befriendCount = meta.befriendCount || {};
      const creatureCounts = meta.creatureCounts || {};
      res.json({ collection, catalog: getCollectionCatalog(collection, befriendCount, creatureCounts) });
```

- [ ] **Step 5: Run syntax checks**

Run:

```bash
node --check src/game/services/combat-cycle-service.js
node --check src/routes/game/combat.js
```

Expected: no syntax errors.

- [ ] **Step 6: Run focused tests**

Run:

```bash
node --test tests/unit/game/creature-capture-counts.test.js tests/unit/creature/collection-service.test.js
```

Expected: PASS.

- [ ] **Step 7: Commit befriend/catalog changes**

Run:

```bash
/usr/bin/git add src/game/services/combat-cycle-service.js src/routes/game/combat.js tests/unit/game/creature-capture-counts.test.js
/usr/bin/git commit -m "$(cat <<'EOF'
Track duplicate creature captures as owned copies

EOF
)"
```

Expected: commit succeeds.

## Task 4: Quantity-Aware Fusion Service

**Files:**
- Modify: `src/game/services/fusion-service.js`
- Test: `tests/unit/game/fusion-service.test.js`

- [ ] **Step 1: Replace fusion tests with quantity expectations**

In `tests/unit/game/fusion-service.test.js`, update `makeMeta()`:

```js
function makeMeta(overrides = {}) {
  return {
    creatureCollection: ['hi', 'neko'],
    creatureCounts: { hi: 1, neko: 1 },
    fusionCores: 1,
    tutorialFusionDataUnlocked: ['hineko'],
    ...overrides
  };
}
```

Replace the “spends one fusion core...” test with:

```js
  it('spends one fusion core, consumes ingredients, and adds a Fire Cat copy', () => {
    const meta = makeMeta();

    const result = startFusion(meta, FUSION_RECIPES.fireCat.id);

    assert.equal(result.success, true);
    assert.equal(result.recipe.resultId, 'hineko');
    assert.equal(result.unlockedCreatureId, 'hineko');
    assert.equal(meta.fusionCores, 0);
    assert.deepEqual(meta.creatureCollection, ['hi', 'neko', 'hineko']);
    assert.deepEqual(meta.creatureCounts, { hi: 0, neko: 0, hineko: 1 });
  });
```

Replace the “does not spend a fusion core when Fire Cat is already unlocked” test with:

```js
  it('allows repeat fusion for an already-discovered result and consumes ingredients again', () => {
    const meta = makeMeta({
      creatureCollection: ['hi', 'neko', 'hineko'],
      creatureCounts: { hi: 2, neko: 1, hineko: 1 },
      fusionCores: 2
    });

    const result = startFusion(meta, FUSION_RECIPES.fireCat.id);

    assert.equal(result.success, true);
    assert.equal(meta.fusionCores, 1);
    assert.deepEqual(meta.creatureCounts, { hi: 1, neko: 0, hineko: 2 });
  });
```

Add this duplicate requirement test:

```js
  it('supports recipes that require multiple copies of the same ingredient', () => {
    const tripleHiRecipe = {
      id: 'triple-hi-test',
      name: '三火',
      nameEn: 'Triple Hi',
      ingredientIds: ['hi', 'hi', 'hi'],
      resultId: 'neko',
      cost: { fusionCores: 1 }
    };
    const meta = makeMeta({
      creatureCollection: ['hi'],
      creatureCounts: { hi: 3 },
      fusionCores: 1
    });

    const state = getFusionState(meta, [tripleHiRecipe]);

    assert.equal(state.recipes[0].canFuse, true);
    assert.deepEqual(state.recipes[0].ingredientRequirements, [
      { id: 'hi', required: 3, owned: 3, missing: 0 }
    ]);
  });
```

Update “rejects when ingredient missing” to use counts:

```js
  it('rejects fusion when an ingredient quantity is missing', () => {
    const meta = makeMeta({ creatureCounts: { hi: 1, neko: 0 } });

    const result = startFusion(meta, FUSION_RECIPES.fireCat.id);

    assert.equal(result.success, false);
    assert.equal(result.error, 'Missing fusion ingredients');
    assert.deepEqual(result.missingIngredientIds, ['neko']);
    assert.equal(meta.fusionCores, 1);
    assert.deepEqual(meta.creatureCounts, { hi: 1, neko: 0 });
  });
```

- [ ] **Step 2: Run tests to verify failure**

Run:

```bash
node --test tests/unit/game/fusion-service.test.js
```

Expected: FAIL because fusion still checks unique collection membership, blocks already-unlocked result, lacks `ingredientRequirements`, and does not consume counts.

- [ ] **Step 3: Update fusion service imports**

In `src/game/services/fusion-service.js`, replace the collection import:

```js
import {
  addCreatureCopy,
  consumeCreatureCopies,
  countRequirements,
  ensureCreatureCounts,
  getCreatureCount
} from './creature-collection-service.js';
```

- [ ] **Step 4: Make recipe state quantity-aware**

Replace `buildRecipeState()` and `getFusionState()` with:

```js
function buildRecipeState(meta, recipe) {
  const collection = getCollection(meta);
  ensureCreatureCounts(meta);
  const ingredientRequirements = countRequirements(recipe.ingredientIds).map(req => {
    const owned = getCreatureCount(meta, req.id);
    return {
      ...req,
      owned,
      missing: Math.max(0, req.required - owned)
    };
  });
  const missingIngredientIds = ingredientRequirements
    .filter(req => req.missing > 0)
    .map(req => req.id);
  const alreadyDiscovered = collection.includes(recipe.resultId);
  const resultOwned = getCreatureCount(meta, recipe.resultId);
  const fusionCores = getFusionCores(meta);
  const hasEnoughCores = fusionCores >= recipe.cost.fusionCores;
  const requiresData = recipe.resultId === TUTORIAL_FUSION_CREATURE_ID;
  const dataUnlocked = !requiresData || hasTutorialFusionData(meta, recipe.resultId);
  const lockedReason = dataUnlocked ? null : 'Hineko fusion data required';

  return {
    ...recipe,
    ingredientRequirements,
    missingIngredientIds,
    alreadyUnlocked: alreadyDiscovered,
    alreadyDiscovered,
    resultOwned,
    hasEnoughCores,
    dataUnlocked,
    lockedReason,
    canFuse: dataUnlocked && missingIngredientIds.length === 0 && hasEnoughCores
  };
}

export function getFusionState(meta, recipes = Object.values(FUSION_RECIPES)) {
  return {
    fusionCores: getFusionCores(meta),
    recipes: recipes.map(recipe => buildRecipeState(meta, recipe))
  };
}
```

- [ ] **Step 5: Make `startFusion()` consume counts and allow repeats**

In `src/game/services/fusion-service.js`, remove the early `recipeState.alreadyUnlocked` rejection. Replace the success mutation block with:

```js
  const consumeResult = consumeCreatureCopies(meta, recipeState.ingredientRequirements);
  if (!consumeResult.success) {
    return {
      success: false,
      error: 'Missing fusion ingredients',
      missingIngredientIds: consumeResult.missing.map(entry => entry.id),
      recipe: buildRecipeState(meta, recipe)
    };
  }

  meta.fusionCores = getFusionCores(meta) - recipe.cost.fusionCores;
  addCreatureCopy(meta, recipe.resultId);
```

Return `consumedIngredients` for debugging/UI:

```js
  return {
    success: true,
    unlockedCreatureId: recipe.resultId,
    consumedIngredients: consumeResult.consumed,
    recipe: buildRecipeState(meta, recipe)
  };
```

- [ ] **Step 6: Run fusion tests**

Run:

```bash
node --test tests/unit/game/fusion-service.test.js
```

Expected: PASS.

- [ ] **Step 7: Run related tests**

Run:

```bash
node --test tests/unit/game/fusion-service.test.js tests/unit/creature/collection-service.test.js
```

Expected: PASS.

- [ ] **Step 8: Commit fusion service**

Run:

```bash
/usr/bin/git add src/game/services/fusion-service.js tests/unit/game/fusion-service.test.js
/usr/bin/git commit -m "$(cat <<'EOF'
Consume creature copies during fusion

EOF
)"
```

Expected: commit succeeds.

## Task 5: Starter Selection Validation Uses Counts

**Files:**
- Modify: `src/routes/game/run.js`
- Test: `tests/unit/creature/collection-service.test.js`
- Test: `tests/integration/flows/meta-progression.test.js`

- [ ] **Step 1: Update route validation**

In `src/routes/game/run.js`, update both `validateTeamSelection()` call sites to pass `meta.creatureCounts || {}`:

```js
        const validation = validateTeamSelection(collection, ids, meta.creatureCounts || {});
```

and:

```js
      const validation = validateTeamSelection(collection, starterIds, meta.creatureCounts || {});
```

- [ ] **Step 2: Run syntax check**

Run:

```bash
node --check src/routes/game/run.js
```

Expected: no syntax errors.

- [ ] **Step 3: Run route-adjacent tests**

Run:

```bash
node --test tests/unit/creature/collection-service.test.js tests/integration/flows/meta-progression.test.js
```

Expected: PASS. If integration tests fail because test fixtures do not initialize `creatureCounts`, update fixture meta to include counts matching `creatureCollection`.

- [ ] **Step 4: Commit route validation**

Run:

```bash
/usr/bin/git add src/routes/game/run.js tests/integration/flows/meta-progression.test.js
/usr/bin/git commit -m "$(cat <<'EOF'
Validate starter choices against owned copies

EOF
)"
```

Expected: commit succeeds. If `tests/integration/flows/meta-progression.test.js` was unchanged, omit it from `git add`.

## Task 6: Starter Select Quantity UI

**Files:**
- Modify: `public/game.js`
- Modify: `public/game.css`

- [ ] **Step 1: Update starter select ownership logic**

In `public/game.js` inside `showCollectionSelect(catalog, collection)`, add helpers after `fullName(r)`:

```js
    function ownedCount(r) {
      return Number.isFinite(r?.ownedCount) ? r.ownedCount : 0;
    }

    function isAvailable(r) {
      return collection.includes(r.id) && ownedCount(r) > 0;
    }
```

- [ ] **Step 2: Display count in inspected card**

In `renderOwnedCard(r)`, replace the footer:

```js
          <div class="cc-foot">
            <span>${r.pointCost} pts</span>
            <span>Owned x${ownedCount(r)}</span>
            <span>Befriended ${r.befriendCount || 0}x</span>
          </div>
```

- [ ] **Step 3: Display count on grid cells**

In the `cellsHtml` mapping, replace ownership and cell HTML with:

```js
          const owned = isAvailable(r);
          const discovered = collection.includes(r.id);
          return `
            <div class="collection-cell${!owned ? ' unowned' : ''}" data-id="${r.id}" data-rarity="${r.rarity}" data-element="${r.element}">
              <img data-creature-id="${r.id}" alt="${r.nameEn}" />
              ${owned ? `<span class="point-badge">${r.pointCost}</span>` : ''}
              ${discovered ? `<span class="owned-count-badge">x${ownedCount(r)}</span>` : ''}
              <span class="creature-name">${discovered ? r.nameEn : '???'}</span>
            </div>
          `;
```

- [ ] **Step 4: Use count availability in click/update paths**

Replace each `const owned = collection.includes(id);` inside `showCollectionSelect()` with:

```js
            const owned = isAvailable(creature);
```

for click handling, and:

```js
        const row = sorted.find(r => r.id === id);
        const owned = row ? isAvailable(row) : false;
```

for update pass. In card rendering, use:

```js
            const owned = isAvailable(inspected);
            const discovered = collection.includes(inspected.id);
            cardArea.innerHTML = owned || discovered ? renderOwnedCard(inspected) : renderRedactedCard(inspected);
```

This means discovered-but-zero creatures show their details and `Owned x0`, but cannot be selected.

- [ ] **Step 5: Add CSS for count badge**

In `public/game.css` near `.collection-cell .point-badge`, add:

```css
.collection-cell .owned-count-badge {
  position: absolute;
  top: 2px;
  right: 4px;
  padding: 1px 5px;
  border-radius: 999px;
  background: rgba(20, 24, 38, 0.82);
  color: #fff;
  font-size: 0.62rem;
  font-weight: 800;
  line-height: 1.2;
  border: 1px solid rgba(255, 255, 255, 0.3);
}
```

- [ ] **Step 6: Run syntax check**

Run:

```bash
node --check public/game.js
```

Expected: no syntax errors.

- [ ] **Step 7: Commit starter UI**

Run:

```bash
/usr/bin/git add public/game.js public/game.css
/usr/bin/git commit -m "$(cat <<'EOF'
Show owned creature counts in starter select

EOF
)"
```

Expected: commit succeeds.

## Task 7: Fusion Lab Quantity UI

**Files:**
- Modify: `public/js/ui/fusion-lab.js`
- Modify: `public/game.css`

- [ ] **Step 1: Update recipe tiles for repeat fusion**

In `public/js/ui/fusion-lab.js`, inside `renderRecipeTiles()`, replace subtitle/badge handling:

```js
        subtitle: recipe.canFuse ? 'Ready to fuse' : getRequirementText(recipe),
        pills: `
          <span class="fusion-core-pill">${recipe.cost.fusionCores} Fusion Core</span>
          <span class="fusion-core-pill">Owned x${recipe.resultOwned || 0}</span>
        `,
        badge: { text: recipe.canFuse ? 'Ready' : 'Locked', color: recipe.canFuse ? '#ef8f35' : '#777' }
```

- [ ] **Step 2: Render ingredient requirements instead of raw ingredient IDs**

In `renderScene()`, replace selected IDs setup:

```js
  const selectedRequirements = (recipe.ingredientRequirements || []).slice(0, 5);
  while (selectedRequirements.length < 5) selectedRequirements.push(null);
```

and replace the row mapping:

```js
        ${selectedRequirements.map((requirement, index) => renderIngredientSlot(requirement, recipe, index)).join('')}
```

- [ ] **Step 3: Update ingredient slot renderer**

Replace `renderIngredientSlot(id, recipe, index)` with:

```js
function renderIngredientSlot(requirement, recipe, index) {
  if (!requirement) {
    return `<div class="fusion-slot fusion-slot--empty"><span>Slot ${index + 1}</span></div>`;
  }

  const creature = getCreature(requirement.id);
  const isMissing = requirement.missing > 0;
  return `
    <div class="fusion-slot ${isMissing ? 'fusion-slot--missing' : ''}">
      <div class="fusion-slot-sprite">
        ${creatureSpriteHtml(creature.id, creature.name || creature.baseWord, creature.element, 'fusion-ingredient-sprite')}
      </div>
      <div class="fusion-slot-name">${escapeHtml(creature.nameEn)}</div>
      <div class="fusion-slot-count">${requirement.owned}/${requirement.required} owned</div>
    </div>
  `;
}
```

- [ ] **Step 4: Update requirement text**

Replace the start of `getRequirementText(recipe)`:

```js
  if (recipe.dataUnlocked === false) return recipe.lockedReason || 'Fusion data required.';
  const missingRequirements = (recipe.ingredientRequirements || []).filter(req => req.missing > 0);
  if (missingRequirements.length > 0) {
    const missing = missingRequirements
      .map(req => {
        const creature = getCreature(req.id);
        return `${creature.nameEn} ${req.owned}/${req.required}`;
      })
      .join(', ');
    return `Need more: ${missing}`;
  }
```

Remove the old `if (recipe.alreadyUnlocked)` branch.

- [ ] **Step 5: Use result copy language**

In `renderScene()`, replace result name:

```js
      <div class="fusion-result-name">${escapeHtml(resultCreature.nameEn)}${result ? ' +1 Copy!' : ''}</div>
```

- [ ] **Step 6: Add fusion count CSS**

In `public/game.css` near `.fusion-slot-name`, add:

```css
.fusion-slot-count {
  margin-top: 1px;
  color: rgba(255, 255, 255, 0.72);
  font-size: 0.62rem;
  font-weight: 800;
  white-space: nowrap;
}
```

- [ ] **Step 7: Run syntax check**

Run:

```bash
node --check public/js/ui/fusion-lab.js
```

Expected: no syntax errors.

- [ ] **Step 8: Commit fusion UI**

Run:

```bash
/usr/bin/git add public/js/ui/fusion-lab.js public/game.css
/usr/bin/git commit -m "$(cat <<'EOF'
Show owned ingredient counts in fusion lab

EOF
)"
```

Expected: commit succeeds.

## Task 8: Full Verification

**Files:**
- No intentional source edits except fixes found by verification.

- [ ] **Step 1: Run focused unit tests**

Run:

```bash
node --test tests/unit/creature/collection-service.test.js tests/unit/game/fusion-service.test.js tests/unit/game/creature-capture-counts.test.js
```

Expected: PASS.

- [ ] **Step 2: Run broader test suite**

Run:

```bash
npm test
```

Expected: PASS. If failures are unrelated to this work, capture the failing test names and errors before deciding whether to fix or report.

- [ ] **Step 3: Run JS syntax checks**

Run:

```bash
node --check public/game.js
node --check public/js/ui/fusion-lab.js
node --check src/game/services/creature-collection-service.js
node --check src/game/services/fusion-service.js
node --check src/game/services/combat-cycle-service.js
node --check src/routes/game/combat.js
node --check src/routes/game/run.js
```

Expected: all pass.

- [ ] **Step 4: Read lints for edited files**

Use Cursor `ReadLints` for:

```text
src/game/services/creature-collection-service.js
src/game/services/fusion-service.js
src/game/services/combat-cycle-service.js
src/routes/game/combat.js
src/routes/game/run.js
public/game.js
public/js/ui/fusion-lab.js
```

Expected: no new linter errors in edited files.

- [ ] **Step 5: Ask before browser verification**

Because this includes visual UI changes, ask the user before launching Playwright/browser verification:

```text
This change needs visual verification for starter select and fusion lab. May I open the browser to verify the UI?
```

Expected: user approves before any browser session is opened.

- [ ] **Step 6: Visual verification after approval**

After approval, run the dev server using the existing project convention:

```bash
npm run dev
```

Navigate to `http://localhost:5173`, verify:

- Starter creature select shows `xN` badges and inspected card `Owned xN`.
- A discovered creature with `ownedCount: 0` is visible but not selectable.
- Fusion Lab ingredient slots show `owned/required`.
- Repeat fusion is presented as another copy, not blocked as already unlocked.

Expected: screenshots confirm the UI states. Delete any screenshot files immediately after use.

- [ ] **Step 7: Final status**

Run:

```bash
/usr/bin/git status --short
```

Expected: only intentional changes are present.

## Self-Review

- Spec coverage:
  - Spendable `creatureCounts`: Tasks 1 and 2.
  - Befriend duplicates: Task 3.
  - Fusion consumes base creatures and supports repeat fusion: Task 4.
  - Starter select count display and no duplicate selection: Task 6.
  - Fusion count display and duplicate requirements: Task 7.
  - Tests and visual verification: Task 8.
- Placeholder scan: no unresolved placeholder or optional behavior remains.
- Type consistency:
  - `creatureCounts`, `ownedCount`, `ingredientRequirements`, `alreadyDiscovered`, and `resultOwned` are defined before use.
  - `validateTeamSelection(collection, selectedIds, creatureCounts)` remains backward compatible for older tests that pass only two arguments.
