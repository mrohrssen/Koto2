# Tutorial Fusion Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rework the first-run tutorial so clearing Starting Meadow unlocks Hineko fusion data, rewards a Fusion Core through Knowledge Review, guides the existing Fusion Lab flow, and then sends the player toward Wild Plains.

**Architecture:** Keep Fusion Lab intact. Add small server-owned tutorial progression helpers and flags, gate the existing Hineko recipe on real Hineko data, then use the existing Cid tutorial narration/highlight hooks around the existing hub, speed review, combat, and Fusion Lab UI. Reward/unlock visuals reuse the existing word-level-up animation style with custom text; do not add a separate reward animation system.

**Tech Stack:** Node.js ES modules, Express routes, browser ES modules, Node test runner, existing Koto UI modules.

---

## File Structure

- Modify `src/game/state.js`: add default meta fields for tutorial fusion state.
- Modify `src/game/services/tutorial-service.js`: add helper functions for Hineko data unlock, Fusion Core award, Fusion Lab gating, and reset behavior.
- Modify `src/game/manager-registry.js`: migrate old saves with missing tutorial fusion fields.
- Modify `src/game/loop.js`: expose new tutorial fusion meta fields to the client.
- Modify `src/game/services/fusion-service.js`: gate the existing Fire Cat / Hineko recipe on Hineko fusion data.
- Modify `src/routes/game/fusion.js`: preserve existing route behavior while returning the locked recipe state.
- Modify `src/routes/game/tutorial.js`: add endpoints for claiming the tutorial Fusion Core and marking tutorial fusion complete.
- Modify `src/game/services/combat-cycle-service.js`: force first Starting Meadow encounter to Cat, include Cid boss intro payload, and emit Hineko-data reward on Starting Meadow Hineko victory.
- Modify `public/js/api.js`: add tutorial fusion endpoint wrappers.
- Modify `public/game.js`: invoke the existing Cid tutorial narration helper for the battle-start warning, show the Hineko data popup through the existing word-level-up animation module, wire tutorial endpoint callbacks, and pass guidance callbacks to Fusion Lab.
- Modify `public/js/ui/exploration.js`: disable/highlight Fusion Lab and Knowledge Review according to tutorial fusion flags.
- Modify `public/js/ui/fusion-lab.js`: guide the existing recipe tile and Start Fusion button without rebuilding the lab.
- Modify `public/js/ui/tutorial-copy.js`: centralize new Cid tutorial copy.
- Modify `public/js/ui/word-level-up.js`: allow the existing word-level-up animation to display custom reward/unlock text.
- Modify tests under `tests/unit/game/` and `tests/integration/flows/fusion.test.js`.

Do not modify `data/dictionary.json`. Do not rebuild Fusion Lab.

---

### Task 1: Tutorial Fusion State Helpers

**Files:**
- Modify: `src/game/state.js`
- Modify: `src/game/services/tutorial-service.js`
- Modify: `src/game/manager-registry.js`
- Modify: `src/game/loop.js`
- Test: `tests/unit/game/tutorial-service.test.js`

- [ ] **Step 1: Add failing tests for default and helper behavior**

Append these imports to the existing import from `tutorial-service.js` in `tests/unit/game/tutorial-service.test.js`:

```js
  ensureTutorialFusionState,
  hasTutorialFusionData,
  unlockTutorialFusionData,
  canUseFusionLab,
  awardTutorialFusionCore,
  markTutorialFusionComplete
```

Add these test cases inside the `describe('tutorial-service', () => { ... })` block:

```js
  describe('tutorial fusion helpers', () => {
    it('new meta starts with empty tutorial fusion state', () => {
      const meta = createMetaProgression();
      assert.deepEqual(meta.tutorialFusionDataUnlocked, []);
      assert.equal(meta.tutorialFusionCoreAwarded, false);
      assert.equal(meta.tutorialFusionComplete, false);
    });

    it('ensureTutorialFusionState migrates missing fields', () => {
      const meta = {};
      ensureTutorialFusionState(meta);
      assert.deepEqual(meta.tutorialFusionDataUnlocked, []);
      assert.equal(meta.tutorialFusionCoreAwarded, false);
      assert.equal(meta.tutorialFusionComplete, false);
    });

    it('unlockTutorialFusionData records Hineko once', () => {
      const meta = createMetaProgression();
      const first = unlockTutorialFusionData(meta, 'hineko');
      const second = unlockTutorialFusionData(meta, 'hineko');
      assert.equal(first.unlocked, true);
      assert.equal(second.unlocked, false);
      assert.deepEqual(meta.tutorialFusionDataUnlocked, ['hineko']);
      assert.equal(hasTutorialFusionData(meta, 'hineko'), true);
    });

    it('canUseFusionLab requires Hineko data', () => {
      const meta = createMetaProgression();
      assert.equal(canUseFusionLab(meta), false);
      unlockTutorialFusionData(meta, 'hineko');
      assert.equal(canUseFusionLab(meta), true);
    });

    it('awardTutorialFusionCore grants exactly one core', () => {
      const meta = createMetaProgression();
      unlockTutorialFusionData(meta, 'hineko');
      const first = awardTutorialFusionCore(meta);
      const second = awardTutorialFusionCore(meta);
      assert.equal(first.awarded, true);
      assert.equal(first.fusionCores, 1);
      assert.equal(second.awarded, false);
      assert.equal(second.fusionCores, 1);
      assert.equal(meta.fusionCores, 1);
      assert.equal(meta.tutorialFusionCoreAwarded, true);
    });

    it('awardTutorialFusionCore refuses before Hineko data', () => {
      const meta = createMetaProgression();
      assert.throws(
        () => awardTutorialFusionCore(meta),
        /Hineko fusion data is required/
      );
      assert.equal(meta.fusionCores, 0);
    });

    it('markTutorialFusionComplete completes tutorial fusion and tutorial step', () => {
      const meta = createMetaProgression();
      markTutorialFusionComplete(meta);
      assert.equal(meta.tutorialFusionComplete, true);
      assert.equal(meta.tutorialStep, 6);
    });
  });
```

- [ ] **Step 2: Run the focused test and confirm it fails**

Run:

```bash
node --test tests/unit/game/tutorial-service.test.js
```

Expected: FAIL because the new helper exports and meta fields do not exist.

- [ ] **Step 3: Add default meta fields**

In `src/game/state.js`, extend `createMetaProgression()` near the existing tutorial fields:

```js
    // Tutorial state (first-run guided experience)
    tutorialStep: 0,
    tutorialFireDropsGifted: false,
    tutorialFusionDataUnlocked: [],
    tutorialFusionCoreAwarded: false,
    tutorialFusionComplete: false
```

- [ ] **Step 4: Implement tutorial fusion helpers**

In `src/game/services/tutorial-service.js`, add these constants and functions after `TUTORIAL_STEPS`:

```js
export const TUTORIAL_FUSION_CREATURE_ID = 'hineko';

export function ensureTutorialFusionState(meta) {
  if (!meta) return meta;
  if (!Array.isArray(meta.tutorialFusionDataUnlocked)) {
    meta.tutorialFusionDataUnlocked = [];
  }
  if (typeof meta.tutorialFusionCoreAwarded !== 'boolean') {
    meta.tutorialFusionCoreAwarded = false;
  }
  if (typeof meta.tutorialFusionComplete !== 'boolean') {
    meta.tutorialFusionComplete = false;
  }
  return meta;
}

export function hasTutorialFusionData(meta, creatureId = TUTORIAL_FUSION_CREATURE_ID) {
  ensureTutorialFusionState(meta);
  return !!meta?.tutorialFusionDataUnlocked?.includes(creatureId);
}

export function unlockTutorialFusionData(meta, creatureId = TUTORIAL_FUSION_CREATURE_ID) {
  ensureTutorialFusionState(meta);
  if (!meta) return { unlocked: false, creatureId };
  if (meta.tutorialFusionDataUnlocked.includes(creatureId)) {
    return { unlocked: false, creatureId };
  }
  meta.tutorialFusionDataUnlocked.push(creatureId);
  return {
    unlocked: true,
    creatureId,
    message: 'Obtained Hineko Fusion Data!'
  };
}

export function canUseFusionLab(meta) {
  return hasTutorialFusionData(meta, TUTORIAL_FUSION_CREATURE_ID);
}

export function awardTutorialFusionCore(meta) {
  ensureTutorialFusionState(meta);
  if (!hasTutorialFusionData(meta, TUTORIAL_FUSION_CREATURE_ID)) {
    throw new Error('Hineko fusion data is required before awarding a tutorial Fusion Core');
  }
  if (meta.tutorialFusionCoreAwarded) {
    return {
      awarded: false,
      fusionCores: Number.isFinite(meta.fusionCores) ? meta.fusionCores : 0
    };
  }
  meta.fusionCores = (Number.isFinite(meta.fusionCores) ? meta.fusionCores : 0) + 1;
  meta.tutorialFusionCoreAwarded = true;
  return {
    awarded: true,
    fusionCores: meta.fusionCores,
    message: 'Obtained 1x Fusion Core!'
  };
}

export function markTutorialFusionComplete(meta) {
  ensureTutorialFusionState(meta);
  if (!meta) return { completed: false };
  meta.tutorialFusionComplete = true;
  meta.tutorialStep = TUTORIAL_STEPS.COMPLETE;
  return { completed: true, tutorialStep: meta.tutorialStep };
}
```

Update `resetTutorial(meta)` in the same file:

```js
export function resetTutorial(meta) {
  meta.tutorialStep = 0;
  meta.tutorialFireDropsGifted = false;
  meta.tutorialFusionDataUnlocked = [];
  meta.tutorialFusionCoreAwarded = false;
  meta.tutorialFusionComplete = false;
}
```

- [ ] **Step 5: Migrate loaded saves**

In `src/game/manager-registry.js`, add this import:

```js
import { ensureTutorialFusionState } from './services/tutorial-service.js';
```

After the existing tutorial field migration block, add:

```js
          const beforeTutorialFusion = JSON.stringify({
            tutorialFusionDataUnlocked: data.meta.tutorialFusionDataUnlocked,
            tutorialFusionCoreAwarded: data.meta.tutorialFusionCoreAwarded,
            tutorialFusionComplete: data.meta.tutorialFusionComplete
          });
          ensureTutorialFusionState(data.meta);
          const afterTutorialFusion = JSON.stringify({
            tutorialFusionDataUnlocked: data.meta.tutorialFusionDataUnlocked,
            tutorialFusionCoreAwarded: data.meta.tutorialFusionCoreAwarded,
            tutorialFusionComplete: data.meta.tutorialFusionComplete
          });
          if (beforeTutorialFusion !== afterTutorialFusion) {
            needsSave = true;
          }
```

- [ ] **Step 6: Expose tutorial fusion fields in enriched state**

In `src/game/loop.js`, add these properties to the `meta` object returned by `getState()`:

```js
        tutorialStep: this.meta.tutorialStep ?? 6,
        tutorialFusionDataUnlocked: Array.isArray(this.meta.tutorialFusionDataUnlocked) ? this.meta.tutorialFusionDataUnlocked : [],
        tutorialFusionCoreAwarded: !!this.meta.tutorialFusionCoreAwarded,
        tutorialFusionComplete: !!this.meta.tutorialFusionComplete
```

Replace the existing single `tutorialStep` line rather than duplicating it.

- [ ] **Step 7: Run the focused test and confirm it passes**

Run:

```bash
node --test tests/unit/game/tutorial-service.test.js
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/game/state.js src/game/services/tutorial-service.js src/game/manager-registry.js src/game/loop.js tests/unit/game/tutorial-service.test.js
git commit -m "$(cat <<'EOF'
Add tutorial fusion progression state

EOF
)"
```

---

### Task 2: Gate Existing Fusion Recipe On Hineko Data

**Files:**
- Modify: `src/game/services/fusion-service.js`
- Modify: `src/routes/game/misc.js`
- Modify: `tests/unit/game/fusion-service.test.js`
- Modify: `tests/integration/flows/fusion.test.js`

- [ ] **Step 1: Add failing unit tests for the Hineko data gate**

In `tests/unit/game/fusion-service.test.js`, update `makeMeta()` to include Hineko data by default:

```js
function makeMeta(overrides = {}) {
  return {
    creatureCollection: ['hi', 'neko'],
    fusionCores: 1,
    tutorialFusionDataUnlocked: ['hineko'],
    ...overrides
  };
}
```

Add this test after the eligibility test:

```js
  it('locks Fire Cat until Hineko fusion data is unlocked', () => {
    const meta = makeMeta({ tutorialFusionDataUnlocked: [] });

    const state = getFusionState(meta);

    assert.equal(state.recipes[0].canFuse, false);
    assert.equal(state.recipes[0].dataUnlocked, false);
    assert.equal(state.recipes[0].lockedReason, 'Hineko fusion data required');
  });
```

Add this test before the missing ingredient test:

```js
  it('rejects fusion before Hineko fusion data is unlocked', () => {
    const meta = makeMeta({ tutorialFusionDataUnlocked: [] });

    const result = startFusion(meta, FUSION_RECIPES.fireCat.id);

    assert.equal(result.success, false);
    assert.equal(result.error, 'Hineko fusion data required');
    assert.equal(meta.fusionCores, 1);
    assert.deepEqual(meta.creatureCollection, ['hi', 'neko']);
  });
```

- [ ] **Step 2: Run unit test and confirm it fails**

Run:

```bash
node --test tests/unit/game/fusion-service.test.js
```

Expected: FAIL because recipe state does not include `dataUnlocked` and `startFusion()` does not enforce it.

- [ ] **Step 3: Implement the existing recipe gate**

In `src/game/services/fusion-service.js`, add this import:

```js
import { hasTutorialFusionData, TUTORIAL_FUSION_CREATURE_ID } from './tutorial-service.js';
```

Update `buildRecipeState(meta, recipe)`:

```js
function buildRecipeState(meta, recipe) {
  const collection = getCollection(meta);
  const missingIngredientIds = recipe.ingredientIds.filter(id => !collection.includes(id));
  const alreadyUnlocked = collection.includes(recipe.resultId);
  const fusionCores = getFusionCores(meta);
  const hasEnoughCores = fusionCores >= recipe.cost.fusionCores;
  const requiresData = recipe.resultId === TUTORIAL_FUSION_CREATURE_ID;
  const dataUnlocked = !requiresData || hasTutorialFusionData(meta, recipe.resultId);
  const lockedReason = dataUnlocked ? null : 'Hineko fusion data required';

  return {
    ...recipe,
    missingIngredientIds,
    alreadyUnlocked,
    hasEnoughCores,
    dataUnlocked,
    lockedReason,
    canFuse: dataUnlocked && missingIngredientIds.length === 0 && hasEnoughCores && !alreadyUnlocked
  };
}
```

Update `startFusion(meta, recipeId)` after the `alreadyUnlocked` check and before missing ingredients:

```js
  if (!recipeState.dataUnlocked) {
    return { success: false, error: recipeState.lockedReason || 'Fusion data required', recipe: recipeState };
  }
```

- [ ] **Step 4: Let the existing debug collection route seed Hineko data for tests**

In `src/routes/game/misc.js`, change the debug set collection request body handling from:

```js
    const { creatureIds } = req.body;
```

to:

```js
    const { creatureIds, tutorialFusionDataUnlocked } = req.body;
```

After:

```js
    meta.creatureCollection = creatureIds;
```

add:

```js
    if (Array.isArray(tutorialFusionDataUnlocked)) {
      meta.tutorialFusionDataUnlocked = tutorialFusionDataUnlocked;
    }
```

This keeps the support test-only/debug-only because the route is already gated to `NODE_ENV === 'test'` or debug mode.

- [ ] **Step 5: Update integration fusion flow to set Hineko data**

In `tests/integration/flows/fusion.test.js`, find the test that posts `/api/game/fusion/start` successfully. Before calling `/api/game/fusion/start`, add:

```js
    const collectionRes = await client.post('/api/game/debug-set-collection', {
      creatureIds: ['hi', 'neko'],
      tutorialFusionDataUnlocked: ['hineko']
    });
```

Replace the existing `debug-set-collection` call in that test rather than adding a second one.

- [ ] **Step 6: Run fusion tests**

Run:

```bash
node --test tests/unit/game/fusion-service.test.js
node --test tests/integration/flows/fusion.test.js
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/game/services/fusion-service.js src/routes/game/misc.js tests/unit/game/fusion-service.test.js tests/integration/flows/fusion.test.js
git commit -m "$(cat <<'EOF'
Gate Hineko fusion on boss data

EOF
)"
```

---

### Task 3: Force Cat As The First Starting Meadow Encounter

**Files:**
- Modify: `src/game/services/tutorial-service.js`
- Modify: `src/game/services/combat-cycle-service.js`
- Test: `tests/unit/game/tutorial-service.test.js`

- [ ] **Step 1: Add failing helper tests**

Add `shouldForceStartingMeadowCatEncounter` to the tutorial-service imports in `tests/unit/game/tutorial-service.test.js`.

Add:

```js
  describe('Starting Meadow Cat encounter', () => {
    it('forces Cat only for first Starting Meadow encounter before Hineko data', () => {
      const meta = createMetaProgression();
      const run = {
        currentArea: { id: 'hajimari-no-hiroba' },
        currentRoom: 0,
        currentAreaEncounters: 0,
        rooms: [{ type: 'encounter' }]
      };
      assert.equal(shouldForceStartingMeadowCatEncounter(meta, run), true);
      run.currentRoom = 1;
      assert.equal(shouldForceStartingMeadowCatEncounter(meta, run), false);
    });

    it('does not force Cat in Wild Plains', () => {
      const meta = createMetaProgression();
      const run = {
        currentArea: { id: 'wild-plains' },
        currentRoom: 0,
        currentAreaEncounters: 0,
        rooms: [{ type: 'encounter' }]
      };
      assert.equal(shouldForceStartingMeadowCatEncounter(meta, run), false);
    });
  });
```

- [ ] **Step 2: Run test and confirm it fails**

Run:

```bash
node --test tests/unit/game/tutorial-service.test.js
```

Expected: FAIL because `shouldForceStartingMeadowCatEncounter` is not exported.

- [ ] **Step 3: Implement the helper**

In `src/game/services/tutorial-service.js`, add:

```js
export function shouldForceStartingMeadowCatEncounter(meta, run) {
  ensureTutorialFusionState(meta);
  const currentRoom = run?.rooms?.[run?.currentRoom || 0];
  return run?.currentArea?.id === 'hajimari-no-hiroba'
    && (run?.currentRoom || 0) === 0
    && currentRoom?.type === 'encounter'
    && !hasTutorialFusionData(meta, TUTORIAL_FUSION_CREATURE_ID);
}
```

- [ ] **Step 4: Force the encounter in combat generation**

In `src/game/services/combat-cycle-service.js`, extend the tutorial-service import:

```js
  shouldProtectBefriend,
  advanceTutorial as advanceTutorialStep,
  shouldForceStartingMeadowCatEncounter
```

Inside `startCreatureEncounter()`, in the non-boss/non-NPC branch, replace the existing `enemyCreatures = generateEnemyCreatures(...)` block with:

```js
      if (shouldForceStartingMeadowCatEncounter(this.gm.meta, this.gm.run)) {
        enemyCreatures = [generateEnemyCreature(highestLevel, ['neko'], stage)];
      } else {
        enemyCreatures = generateEnemyCreatures(highestLevel, {
          maxEnemies: isStarterOnly ? 1 : (isFirstBattle ? 2 : undefined),
          creaturePool,
          stage,
          encounterIndex,
          totalEncounters
        });
      }
```

This preserves the existing befriend tutorial because room 0 remains a normal encounter; only the generated creature ID changes.

- [ ] **Step 5: Run focused tests and syntax check**

Run:

```bash
node --test tests/unit/game/tutorial-service.test.js
node --check src/game/services/combat-cycle-service.js
```

Expected: PASS and syntax OK.

- [ ] **Step 6: Commit**

```bash
git add src/game/services/tutorial-service.js src/game/services/combat-cycle-service.js tests/unit/game/tutorial-service.test.js
git commit -m "$(cat <<'EOF'
Force Cat for first tutorial encounter

EOF
)"
```

---

### Task 4: Starting Meadow Hineko Boss Data Reward

**Files:**
- Modify: `src/game/services/tutorial-service.js`
- Modify: `src/game/services/combat-cycle-service.js`
- Test: `tests/unit/game/tutorial-service.test.js`

- [ ] **Step 1: Add failing tests for boss intro and victory reward conditions**

Add these imports in `tests/unit/game/tutorial-service.test.js`:

```js
  shouldShowStartingMeadowHinekoIntro,
  collectStartingMeadowHinekoVictoryReward
```

Add:

```js
  describe('Starting Meadow Hineko boss tutorial', () => {
    function makeBossRun(areaId = 'hajimari-no-hiroba') {
      return {
        currentArea: { id: areaId },
        currentRoom: 9,
        rooms: [
          null, null, null, null, null, null, null, null, null,
          { type: 'boss', boss: { creatureId: 'hineko' } }
        ]
      };
    }

    it('shows boss intro only for Starting Meadow Hineko without data', () => {
      const meta = createMetaProgression();
      assert.equal(shouldShowStartingMeadowHinekoIntro(meta, makeBossRun()), true);
      assert.equal(shouldShowStartingMeadowHinekoIntro(meta, makeBossRun('wild-plains')), false);
      unlockTutorialFusionData(meta, 'hineko');
      assert.equal(shouldShowStartingMeadowHinekoIntro(meta, makeBossRun()), false);
    });

    it('collects Hineko fusion data only for Starting Meadow Hineko victory', () => {
      const meta = createMetaProgression();
      const combat = { isBoss: true, enemies: [{ id: 'hineko', hp: 0 }] };
      const reward = collectStartingMeadowHinekoVictoryReward(meta, makeBossRun(), combat);
      assert.deepEqual(meta.tutorialFusionDataUnlocked, ['hineko']);
      assert.equal(reward?.type, 'fusionData');
      assert.equal(reward?.message, 'Obtained Hineko Fusion Data!');

      const wildMeta = createMetaProgression();
      const wildReward = collectStartingMeadowHinekoVictoryReward(wildMeta, makeBossRun('wild-plains'), combat);
      assert.equal(wildReward, null);
      assert.deepEqual(wildMeta.tutorialFusionDataUnlocked, []);
    });
  });
```

- [ ] **Step 2: Run test and confirm it fails**

Run:

```bash
node --test tests/unit/game/tutorial-service.test.js
```

Expected: FAIL because the new helpers do not exist.

- [ ] **Step 3: Implement boss helpers**

In `src/game/services/tutorial-service.js`, add:

```js
function getCurrentRoom(run) {
  return run?.rooms?.[run?.currentRoom || 0] || null;
}

function isStartingMeadowHinekoBoss(run) {
  const room = getCurrentRoom(run);
  return run?.currentArea?.id === 'hajimari-no-hiroba'
    && room?.type === 'boss'
    && room?.boss?.creatureId === TUTORIAL_FUSION_CREATURE_ID;
}

export function shouldShowStartingMeadowHinekoIntro(meta, run) {
  return isStartingMeadowHinekoBoss(run)
    && !hasTutorialFusionData(meta, TUTORIAL_FUSION_CREATURE_ID);
}

export function collectStartingMeadowHinekoVictoryReward(meta, run, combat) {
  if (!combat?.isBoss) return null;
  const bossId = combat?.enemies?.[0]?.id;
  if (bossId !== TUTORIAL_FUSION_CREATURE_ID) return null;
  if (!isStartingMeadowHinekoBoss(run)) return null;
  const result = unlockTutorialFusionData(meta, TUTORIAL_FUSION_CREATURE_ID);
  if (!result.unlocked) return null;
  return {
    type: 'fusionData',
    creatureId: TUTORIAL_FUSION_CREATURE_ID,
    message: result.message
  };
}
```

- [ ] **Step 4: Emit boss intro and reward from combat service**

In `src/game/services/combat-cycle-service.js`, extend the tutorial-service import:

```js
  shouldShowStartingMeadowHinekoIntro,
  collectStartingMeadowHinekoVictoryReward
```

In `startCreatureEncounter()`, add `tutorialBossIntro` to the returned object:

```js
    const tutorialBossIntro = shouldShowStartingMeadowHinekoIntro(this.gm.meta, this.gm.run)
      ? {
          speaker: 'Cid',
          lines: [
            'Careful! This creature is stronger than normal.',
            "You can't befriend this creature, but defeat it and our scientists can collect data.",
            'With enough data, our fusion scientists can add it to your team.'
          ]
        }
      : null;
```

Then include it in the return payload:

```js
      tutorialBossIntro
```

For every victory path in `src/game/services/combat-cycle-service.js` that calls `finalizeCombatVictory(...)`, add this immediately after that call:

```js
      const tutorialRewards = [];
      const tutorialFusionReward = collectStartingMeadowHinekoVictoryReward(this.gm.meta, this.gm.run, this.gm.combat);
      if (tutorialFusionReward) tutorialRewards.push(tutorialFusionReward);
```

Then include `tutorialRewards` in that victory return object:

```js
        tutorialRewards,
```

If a victory branch already declares local variables with the same name, use the same pattern once in that branch and return the existing variable.

- [ ] **Step 5: Run focused tests and syntax check**

Run:

```bash
node --test tests/unit/game/tutorial-service.test.js
node --check src/game/services/combat-cycle-service.js
```

Expected: PASS and syntax OK.

- [ ] **Step 6: Commit**

```bash
git add src/game/services/tutorial-service.js src/game/services/combat-cycle-service.js tests/unit/game/tutorial-service.test.js
git commit -m "$(cat <<'EOF'
Unlock Hineko data from Starting Meadow boss

EOF
)"
```

---

### Task 5: Tutorial Fusion API Endpoints

**Files:**
- Modify: `src/routes/game/tutorial.js`
- Modify: `public/js/api.js`
- Test: `tests/unit/game/tutorial-service.test.js`

- [ ] **Step 1: Add route logic using existing helpers**

In `src/routes/game/tutorial.js`, extend the import:

```js
import {
  getTutorialStep,
  advanceTutorial,
  TUTORIAL_STEPS,
  awardTutorialFusionCore,
  markTutorialFusionComplete
} from '../../game/services/tutorial-service.js';
```

Add these routes before `router.get('/tutorial-state', ...)`:

```js
  router.post('/tutorial-fusion-core', (req, res) => {
    const meta = req.gameManager.getMeta();
    try {
      const result = awardTutorialFusionCore(meta);
      req.saveGame();
      res.json({ ...result, state: req.getEnrichedGameState() });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  router.post('/tutorial-fusion-complete', (req, res) => {
    const meta = req.gameManager.getMeta();
    const result = markTutorialFusionComplete(meta);
    req.saveGame();
    res.json({ ...result, state: req.getEnrichedGameState() });
  });
```

- [ ] **Step 2: Add API wrappers**

In `public/js/api.js`, add:

```js
async function claimTutorialFusionCore() {
  return apiCall('/tutorial-fusion-core', 'POST');
}

async function completeTutorialFusion() {
  return apiCall('/tutorial-fusion-complete', 'POST');
}
```

Export both names in the module's final export object:

```js
  claimTutorialFusionCore,
  completeTutorialFusion,
```

- [ ] **Step 3: Run syntax checks**

Run:

```bash
node --check src/routes/game/tutorial.js
node --check public/js/api.js
```

Expected: both OK.

- [ ] **Step 4: Commit**

```bash
git add src/routes/game/tutorial.js public/js/api.js
git commit -m "$(cat <<'EOF'
Add tutorial fusion reward endpoints

EOF
)"
```

---

### Task 6: Hub Guidance, Disabled Fusion Lab, And Review Core Reward

**Files:**
- Modify: `public/js/ui/tutorial-copy.js`
- Modify: `public/js/ui/exploration.js`
- Modify: `public/game.js`
- Modify: `public/js/ui/word-level-up.js`

- [ ] **Step 1: Add tutorial copy helpers**

In `public/js/ui/tutorial-copy.js`, add:

```js
export function getPostHinekoReviewNarration() {
  return [
    'You did it! Hineko was tough, but you beat it.',
    "Hey! It looks like you're starting to learn some Japanese.",
    "Let's review those words before we head to the next area."
  ];
}

export function getFusionCoreNarration() {
  return [
    'Oh! You got a fusion core!',
    "The next area is tough, let's use it to get stronger."
  ];
}

export function getFusionLabNarration() {
  return [
    'Look! We unlocked the data for Hineko. Select it.',
    'Now click Fuse.'
  ];
}

export function getPostFusionNarration() {
  return [
    'With Hineko in your party, you should be strong enough for the next area!',
    'Keep exploring, discovering new creatures, and getting stronger.'
  ];
}
```

- [ ] **Step 2: Import copy and endpoint callbacks in exploration UI**

In `public/js/ui/exploration.js`, update the tutorial-copy import:

```js
import {
  getTutorialNarration,
  getFormationNarration,
  getPostHinekoReviewNarration,
  getFusionCoreNarration,
  getFusionLabNarration,
  getPostFusionNarration
} from './tutorial-copy.js';
```

Add callback holders near `apiTutorialAdvance`:

```js
let apiClaimTutorialFusionCore = null;
let apiCompleteTutorialFusion = null;
```

In `init(callbacks)`, assign:

```js
  apiClaimTutorialFusionCore = callbacks.apiClaimTutorialFusionCore;
  apiCompleteTutorialFusion = callbacks.apiCompleteTutorialFusion;
```

- [ ] **Step 3: Import the existing word-level-up animation helper**

In `public/js/ui/exploration.js`, add:

```js
import { showWordLevelUp } from './word-level-up.js';
```

Do not use `event-popup.js` for tutorial unlock/reward animations. These tutorial rewards should visually match the existing word-level-up animation.

- [ ] **Step 4: Add local tutorial fusion helpers in exploration UI**

In `public/js/ui/exploration.js`, before `renderHub()`, add:

```js
function hasHinekoFusionData(meta) {
  return Array.isArray(meta?.tutorialFusionDataUnlocked)
    && meta.tutorialFusionDataUnlocked.includes('hineko');
}

function needsPostHinekoReview(meta) {
  return hasHinekoFusionData(meta) && !meta?.tutorialFusionCoreAwarded;
}

function needsFusionLabTutorial(meta) {
  return hasHinekoFusionData(meta)
    && !!meta?.tutorialFusionCoreAwarded
    && !(meta?.creatureCollection || []).includes('hineko')
    && !meta?.tutorialFusionComplete;
}

function needsPostFusionMessage(meta) {
  return hasHinekoFusionData(meta)
    && (meta?.creatureCollection || []).includes('hineko')
    && !meta?.tutorialFusionComplete;
}
```

- [ ] **Step 5: Update `renderHub()` button behavior**

In `renderHub()`, compute these values after `dueCount`:

```js
  const hasFusionData = hasHinekoFusionData(gameState.meta);
  const postHinekoReview = needsPostHinekoReview(gameState.meta);
  const fusionLabTutorial = needsFusionLabTutorial(gameState.meta);
```

Replace the Knowledge Review button handler with:

```js
    { label: `📚 Knowledge Review${dueCount > 0 ? ` (${dueCount})` : ''}`, onClick: async () => {
      if (getGameState().meta?.tutorialStep === 4) {
        await apiTutorialAdvance?.(4);
      }
      const result = await apiGetDueWords();
      if (result?.words?.length > 0) {
        const options = postHinekoReview
          ? {
              onComplete: async () => {
                const reward = await apiClaimTutorialFusionCore?.();
                if (reward?.state) updateGameState({ ...reward.state, phase: getGameState().phase });
                const target = document.querySelector('.speed-review-counter') || document.getElementById('speed-review-takeover') || document.body;
                showWordLevelUp(target, '', { message: reward?.message || 'Obtained 1x Fusion Core!' });
                await showTutorialNarration(getFusionCoreNarration(), { showSprite: true });
              }
            }
          : {};
        speedReview.start(result.words, options);
      } else {
        sceneModule.showNarration('No words to review', { autoDismiss: 2000 });
      }
    }},
```

Replace the Fusion Lab button object with:

```js
    { label: 'Fusion Lab', onClick: () => {
      if (!hasFusionData) return;
      const gs = getGameState();
      gs.phase = 'fusion_lab';
      updateUI();
    }, disabled: !hasFusionData },
```

- [ ] **Step 6: Add hub narration/highlighting priority**

In `renderHub()`, after the existing step 3 block and before the existing step 4 block, add:

```js
  if (postHinekoReview && dueCount > 0) {
    await showTutorialNarration(getPostHinekoReviewNarration(), { showSprite: true });
    const buttons = document.querySelectorAll('.action-btn');
    buttons.forEach(btn => {
      if (btn.textContent.includes('Knowledge Review')) {
        btn.classList.add('tutorial-highlight');
      } else {
        btn.classList.add('tutorial-dimmed');
      }
    });
    return;
  }

  if (fusionLabTutorial) {
    await showTutorialNarration(getFusionLabNarration(), { showSprite: true });
    const buttons = document.querySelectorAll('.action-btn');
    buttons.forEach(btn => {
      if (btn.textContent.includes('Fusion Lab')) {
        btn.classList.add('tutorial-highlight');
      } else {
        btn.classList.add('tutorial-dimmed');
      }
    });
    return;
  }

  if (needsPostFusionMessage(gameState.meta)) {
    await showTutorialNarration(getPostFusionNarration(), { showSprite: true });
    const result = await apiCompleteTutorialFusion?.();
    if (result?.state) updateGameState({ ...result.state, phase: 'hub' });
    return;
  }
```

This priority makes the new victory path override the old formation step. The old death/recovery path still runs when Hineko data has not been unlocked.

- [ ] **Step 7: Wire callbacks from `public/game.js`**

In `public/game.js`, extend the API import list:

```js
  claimTutorialFusionCore as apiClaimTutorialFusionCore,
  completeTutorialFusion as apiCompleteTutorialFusion,
```

In `explorationUI.init({ ... })`, add:

```js
    apiClaimTutorialFusionCore,
    apiCompleteTutorialFusion,
```

- [ ] **Step 8: Run syntax checks**

Run:

```bash
node --check public/js/ui/tutorial-copy.js
node --check public/js/ui/exploration.js
node --check public/js/ui/word-level-up.js
node --check public/game.js
```

Expected: all OK.

- [ ] **Step 9: Commit**

```bash
git add public/js/ui/tutorial-copy.js public/js/ui/exploration.js public/js/ui/word-level-up.js public/game.js
git commit -m "$(cat <<'EOF'
Guide post-Hineko review and Fusion Lab entry

EOF
)"
```

---

### Task 7: Reuse Cid Tutorial Narration And Word-Level-Up Rewards

**Files:**
- Modify: `public/game.js`
- Modify: `public/js/ui/exploration.js`
- Modify: `public/js/ui/word-level-up.js`

- [ ] **Step 1: Extend the existing word-level-up animation for custom text**

In `public/js/ui/word-level-up.js`, replace the existing function signature and first text block with:

```js
export function showWordLevelUp(anchorEl, wordText, { message = null } = {}) {
  const text = message || (wordText ? `${wordText} leveled up!` : '');
  if (!anchorEl || !text) return;

  const rect = anchorEl.getBoundingClientRect();
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;

  // Gold text popup
  const el = document.createElement('div');
  el.className = 'word-level-up-text';
  el.textContent = text;
  el.style.left = `${cx}px`;
  el.style.top = `${cy}px`;
  document.body.appendChild(el);
  el.addEventListener('animationend', () => el.remove());
```

Keep the existing gold spark burst code below this block unchanged. This preserves all existing `showWordLevelUp(card, displayWord(word))` calls while allowing tutorial rewards to use the same animation classes and spark behavior.

- [ ] **Step 2: Export the existing Cid tutorial narration helper**

In `public/js/ui/exploration.js`, change:

```js
async function showTutorialNarration(pages, { showSprite = false } = {}) {
```

to:

```js
export async function showTutorialNarration(pages, { showSprite = false } = {}) {
```

This reuses the existing Cid tutorial dialogue path for hub, review, formation, skill master, and boss tutorial copy. Do not create a new Cid narration helper in `public/game.js`.

- [ ] **Step 3: Import the word-level-up helper in `public/game.js`**

In `public/game.js`, add:

```js
import { showWordLevelUp } from './js/ui/word-level-up.js';
```

- [ ] **Step 4: Show boss intro through the existing tutorial narration function**

In `startEncounter()`, after the BattleScene transition for creature combat and before `updateUI()`, add:

```js
    if (result?.tutorialBossIntro?.lines?.length) {
      await explorationUI.showTutorialNarration(result.tutorialBossIntro.lines, { showSprite: true });
    }
```

Place this after the NPC battle intro block so it does not collide with NPC trainer rooms. This must call `explorationUI.showTutorialNarration(...)`, not a new custom Cid helper.

- [ ] **Step 5: Show Hineko data reward with the word-level-up animation**

In `showVictoryModal(result)` in `public/game.js`, after `loadGameState(); updateUI();`, add:

```js
      const fusionDataReward = result?.tutorialRewards?.find(reward => reward.type === 'fusionData');
      if (fusionDataReward) {
        const target = document.getElementById('scene-area') || document.body;
        showWordLevelUp(target, '', { message: fusionDataReward.message || 'Obtained Hineko Fusion Data!' });
      }
```

Keep this before the adventure report or return-to-hub UI settles so the player sees the popup as part of the boss victory.

- [ ] **Step 6: Run syntax check**

Run:

```bash
node --check public/js/ui/exploration.js
node --check public/js/ui/word-level-up.js
node --check public/game.js
```

Expected: OK.

- [ ] **Step 7: Commit**

```bash
git add public/js/ui/exploration.js public/js/ui/word-level-up.js public/game.js
git commit -m "$(cat <<'EOF'
Show tutorial Hineko data rewards

EOF
)"
```

---

### Task 8: Guide Existing Fusion Lab UI

**Files:**
- Modify: `public/js/ui/fusion-lab.js`
- Modify: `public/game.js`

- [ ] **Step 1: Add non-invasive tutorial highlighting in Fusion Lab**

In `public/js/ui/fusion-lab.js`, add:

```js
function shouldGuideHinekoRecipe() {
  const meta = callbacks.getGameState?.()?.meta;
  return Array.isArray(meta?.tutorialFusionDataUnlocked)
    && meta.tutorialFusionDataUnlocked.includes('hineko')
    && !!meta.tutorialFusionCoreAwarded
    && !(meta.creatureCollection || []).includes('hineko')
    && !meta.tutorialFusionComplete;
}
```

In `renderRecipeTiles()`, after `renderChoices(...)` and before creating the footer, add:

```js
  if (shouldGuideHinekoRecipe()) {
    const cards = actionArea.querySelectorAll('.ui-choice');
    cards.forEach((card, index) => {
      if ((recipes[index]?.resultId) === 'hineko') {
        card.classList.add('tutorial-highlight');
      } else {
        card.classList.add('tutorial-dimmed');
      }
    });
  }
```

In `renderScene(recipe, result = null)`, after the `startBtn` listener is registered, add:

```js
  if (shouldGuideHinekoRecipe() && recipe.resultId === 'hineko') {
    startBtn?.classList.add('tutorial-highlight');
  }
```

This guides the existing recipe and existing Start Fusion button. It does not create a second picker or a second fuse path.

- [ ] **Step 2: Mark tutorial completion after successful fusion**

In `beginFusion(recipe)`, after:

```js
  fusionState = result;
  const nextRecipe = getSelectedRecipe();
```

add:

```js
  if (recipe.resultId === 'hineko' && callbacks.getGameState?.()?.meta && !callbacks.getGameState().meta.tutorialFusionComplete) {
    callbacks.showToast?.('Hineko joined your collection!', 1800);
  }
```

Do not call `completeTutorialFusion()` here. The final Cid message is owned by the hub after the player clicks Back to Hub.

- [ ] **Step 3: Pass `getGameState` to Fusion Lab**

In `public/game.js`, add to `fusionLabUI.init({ ... })`:

```js
    getGameState: () => gameState,
```

- [ ] **Step 4: Run syntax checks**

Run:

```bash
node --check public/js/ui/fusion-lab.js
node --check public/game.js
```

Expected: OK.

- [ ] **Step 5: Commit**

```bash
git add public/js/ui/fusion-lab.js public/game.js
git commit -m "$(cat <<'EOF'
Guide existing Fusion Lab tutorial flow

EOF
)"
```

---

### Task 9: Full Automated Verification

**Files:**
- No source edits expected.

- [ ] **Step 1: Run focused unit tests**

Run:

```bash
node --test tests/unit/game/tutorial-service.test.js
node --test tests/unit/game/fusion-service.test.js
node --test tests/unit/game/rooms-koto2.test.js
```

Expected: PASS.

- [ ] **Step 2: Run focused integration test**

Run:

```bash
node --test tests/integration/flows/fusion.test.js
```

Expected: PASS.

- [ ] **Step 3: Run frontend syntax checks**

Run:

```bash
node --check public/game.js
node --check public/js/ui/exploration.js
node --check public/js/ui/fusion-lab.js
node --check public/js/ui/tutorial-copy.js
node --check public/js/ui/word-level-up.js
node --check public/js/api.js
```

Expected: all OK.

- [ ] **Step 4: Run full test suite**

Run:

```bash
npm test
```

Expected: PASS. If it fails for known unrelated branch baseline reasons, record exact failing tests and verify the focused tests above still pass.

---

### Task 10: Visual Verification

**Files:**
- No source edits expected unless visual bugs are found.

- [ ] **Step 1: Ask before opening browser automation**

The workspace rules say not to launch Playwright without asking first. Ask the user for permission before browser testing.

- [ ] **Step 2: Start the dev server**

Run:

```bash
npm run dev
```

Expected: Vite dev server available at `http://localhost:5173`.

- [ ] **Step 3: Verify the server responds**

Run:

```bash
curl -s -o /dev/null -w "%{http_code}" http://localhost:5173
```

Expected: `200`.

- [ ] **Step 4: Manual fresh-save tutorial pass**

Using the browser, verify:

1. Prologue is unchanged.
2. First Starting Meadow encounter is Cat.
3. Cid's Hineko warning appears only at Starting Meadow Hineko.
4. Defeating Hineko shows "Obtained Hineko Fusion Data!".
5. Hub highlights Knowledge Review.
6. Final review card grants "Obtained 1x Fusion Core!".
7. Fusion Lab is disabled before Hineko data and enabled after Hineko data.
8. Existing Fusion Lab UI is used; no duplicate picker appears.
9. Existing Start Fusion adds Hineko to the collection.
10. Returning to hub shows the final Cid message.
11. Wild Plains is available.
12. Wild Plains Hineko does not replay the Starting Meadow boss warning.

- [ ] **Step 5: Capture and clean up screenshots**

Take screenshots for:

- Hineko data popup.
- Fusion Core popup.
- Fusion Lab guided highlight.
- Final Cid message.

Delete screenshot files immediately after use so the repo stays clean.

---

## Self-Review Notes

- Spec coverage: prologue unchanged, first Cat, Starting Meadow-only Hineko boss intro through existing Cid tutorial narration, Hineko data popup through the existing word-level-up animation, disabled Fusion Lab gate, post-Hineko review core, existing Fusion Lab guidance, final Cid message, and Wild Plains non-repeat are covered.
- Placeholder scan: no unspecified implementation steps remain; each code-changing task includes concrete code or exact placement.
- Type consistency: the plan uses `tutorialFusionDataUnlocked`, `tutorialFusionCoreAwarded`, and `tutorialFusionComplete` consistently across server state, API responses, and frontend checks.
