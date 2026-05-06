# Boss-Locked Fusion Roster Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add 10 boss-locked fusion creatures and recipes directly on `dev`.

**Architecture:** This is a focused data and service-contract change. The new creatures are authored in `data/creatures.json`, recipes are added to `FUSION_RECIPES`, and tests validate that every new recipe is a two-creature, boss-defeat-locked fusion whose ingredients and result exist.

**Tech Stack:** Node.js ES modules, JSON data files, built-in `node:test`.

---

## File Structure

- Create: `tests/unit/game/boss-locked-fusion-roster.test.js`
  - Owns the roster data contract for the 10 new fusions.
- Create: `docs/superpowers/specs/2026-05-06-boss-locked-fusion-learnset-ledger.md`
  - Human-authored stat and learnset rationale for each fusion.
- Modify: `data/creatures.json`
  - Adds 10 fusion creature templates.
- Modify: `src/game/services/fusion-service.js`
  - Adds 10 boss-locked recipes to `FUSION_RECIPES`.
- Modify: `tests/unit/game/fusion-service.test.js`
  - Updates recipe visibility expectations to account for additional boss-locked recipes.
- Modify: `tests/integration/flows/fusion.test.js`
  - Keeps integration expectations robust when more recipes exist.

---

### Task 1: Add Failing Fusion Roster Contract Test

**Files:**
- Create: `tests/unit/game/boss-locked-fusion-roster.test.js`

- [ ] **Step 1: Create the roster data-contract test**

Create `tests/unit/game/boss-locked-fusion-roster.test.js`:

```js
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FUSION_RECIPES } from '../../../src/game/services/fusion-service.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..', '..');
const creatures = JSON.parse(readFileSync(resolve(REPO_ROOT, 'data/creatures.json'), 'utf8'));
const areas = JSON.parse(readFileSync(resolve(REPO_ROOT, 'data/areas.json'), 'utf8'));
const moves = JSON.parse(readFileSync(resolve(REPO_ROOT, 'data/moves.json'), 'utf8'));

const creaturesById = new Map(creatures.map(creature => [creature.id, creature]));
const movesById = new Map(moves.map(move => [move.id, move]));

const EXPECTED_FUSIONS = [
  { recipeKey: 'shadowDog', recipeId: 'shadow-dog', resultId: 'kageno-inu', name: '影の犬', reading: 'かげのいぬ', nameEn: 'Shadow Dog', rarity: 'uncommon', element: 'water', ingredientIds: ['kage', 'inu'] },
  { recipeKey: 'lightHorse', recipeId: 'light-horse', resultId: 'hikarino-uma', name: '光の馬', reading: 'ひかりのうま', nameEn: 'Light Horse', rarity: 'uncommon', element: 'metal', ingredientIds: ['hikari', 'uma'] },
  { recipeKey: 'cloudFish', recipeId: 'cloud-fish', resultId: 'kumono-sakana', name: '雲の魚', reading: 'くものさかな', nameEn: 'Cloud Fish', rarity: 'uncommon', element: 'water', ingredientIds: ['kumo', 'sakana'] },
  { recipeKey: 'moonWolf', recipeId: 'moon-wolf', resultId: 'tsukino-ookami', name: '月の狼', reading: 'つきのおおかみ', nameEn: 'Moon Wolf', rarity: 'rare', element: 'metal', ingredientIds: ['tsuki', 'ookami'] },
  { recipeKey: 'iceBear', recipeId: 'ice-bear', resultId: 'koorino-kuma', name: '氷の熊', reading: 'こおりのくま', nameEn: 'Ice Bear', rarity: 'rare', element: 'water', ingredientIds: ['koori', 'kuma'] },
  { recipeKey: 'sandSnake', recipeId: 'sand-snake', resultId: 'sunano-hebi', name: '砂の蛇', reading: 'すなのへび', nameEn: 'Sand Snake', rarity: 'uncommon', element: 'earth', ingredientIds: ['suna', 'hebi'] },
  { recipeKey: 'thunderBird', recipeId: 'thunder-bird', resultId: 'kaminarino-tori', name: '雷の鳥', reading: 'かみなりのとり', nameEn: 'Thunder Bird', rarity: 'rare', element: 'metal', ingredientIds: ['kaminari', 'tori'] },
  { recipeKey: 'snowFox', recipeId: 'snow-fox', resultId: 'yukino-kitsune', name: '雪の狐', reading: 'ゆきのきつね', nameEn: 'Snow Fox', rarity: 'rare', element: 'water', ingredientIds: ['yuki', 'kitsune'] },
  { recipeKey: 'flowerFairy', recipeId: 'flower-fairy', resultId: 'hanano-yousei', name: '花の妖精', reading: 'はなのようせい', nameEn: 'Flower Fairy', rarity: 'rare', element: 'wood', ingredientIds: ['hana', 'yousei'] },
  { recipeKey: 'boneOni', recipeId: 'bone-oni', resultId: 'honeno-oni', name: '骨の鬼', reading: 'ほねのおに', nameEn: 'Bone Oni', rarity: 'rare', element: 'earth', ingredientIds: ['hone', 'oni'] }
];

function placedFusionIds() {
  const expectedIds = new Set(EXPECTED_FUSIONS.map(fusion => fusion.resultId));
  const placed = [];
  for (const area of areas) {
    for (const creatureId of area.creatures || []) {
      if (expectedIds.has(creatureId)) placed.push(`${area.id}:${creatureId}`);
    }
    if (area.bossCreatureId && expectedIds.has(area.bossCreatureId)) {
      placed.push(`${area.id}:boss:${area.bossCreatureId}`);
    }
  }
  return placed;
}

describe('boss-locked fusion roster', () => {
  it('adds the approved fusion creature templates', () => {
    for (const expected of EXPECTED_FUSIONS) {
      const creature = creaturesById.get(expected.resultId);
      assert.ok(creature, `${expected.resultId} missing`);
      assert.equal(creature.name, expected.name);
      assert.equal(creature.reading, expected.reading);
      assert.equal(creature.nameEn, expected.nameEn);
      assert.equal(creature.rarity, expected.rarity);
      assert.equal(creature.element, expected.element);
      assert.equal(creature.rank, null);
      assert.equal(creature.isStarter, false);
      assert.equal(creature.stage, 1);
      assert.equal(creature.createdAt, '2026-05-06');
      assert.ok(!('baseWord' in creature));
      assert.ok(!('baseReading' in creature));
      assert.ok(!('baseMeaning' in creature));
      assert.ok(!('baseRank' in creature));
    }
  });

  it('adds boss-defeat-locked two-creature recipes', () => {
    for (const expected of EXPECTED_FUSIONS) {
      const recipe = FUSION_RECIPES[expected.recipeKey];
      assert.ok(recipe, `${expected.recipeKey} missing`);
      assert.equal(recipe.id, expected.recipeId);
      assert.equal(recipe.name, expected.name);
      assert.equal(recipe.nameEn, expected.nameEn);
      assert.deepEqual(recipe.ingredientIds, expected.ingredientIds);
      assert.equal(recipe.resultId, expected.resultId);
      assert.equal(recipe.requiresBossDefeatId, expected.resultId);
      assert.deepEqual(recipe.cost, { fusionCores: 1 });
      for (const ingredientId of expected.ingredientIds) {
        assert.ok(creaturesById.has(ingredientId), `${recipe.id} ingredient ${ingredientId} missing`);
      }
    }
  });

  it('keeps fusion learnsets legal and manually capped', () => {
    for (const expected of EXPECTED_FUSIONS) {
      const creature = creaturesById.get(expected.resultId);
      assert.ok(creature.learnset.length >= 5, `${expected.resultId} has too few moves`);
      assert.ok(creature.learnset.length <= 6, `${expected.resultId} has too many moves`);
      const levelOne = creature.learnset.filter(entry => entry.level === 1);
      assert.equal(levelOne.length, 1, `${expected.resultId} must have exactly one level 1 move`);
      const move = movesById.get(levelOne[0].moveId);
      assert.ok(move, `${expected.resultId} level 1 move missing`);
      assert.equal(move.category, 'damage');
      assert.equal(move.target, 'single_enemy');
      assert.ok((move.tier || 1) <= 2);
      assert.notEqual(move.category, 'drain');
      assert.notEqual(move.statusEffect, 'cleanse');
    }
  });

  it('does not place future fusion bosses in areas yet', () => {
    assert.deepEqual(placedFusionIds(), []);
  });
});
```

- [ ] **Step 2: Run the focused test and verify failure**

Run:

```bash
npm run test:unit -- --test-reporter=spec tests/unit/game/boss-locked-fusion-roster.test.js
```

Expected: fails because the 10 recipes and result creatures do not exist yet.

---

### Task 2: Add Fusion Creatures and Learnset Ledger

**Files:**
- Create: `docs/superpowers/specs/2026-05-06-boss-locked-fusion-learnset-ledger.md`
- Modify: `data/creatures.json`

- [ ] **Step 1: Write the fusion learnset ledger**

Create the ledger with one section per fusion. Each section must include role read, stat intent, and a table listing each move ID, level, and reason.

- [ ] **Step 2: Add the 10 creature templates**

Append 10 new templates to `data/creatures.json`, using the roster IDs from the design spec. Each template must include `name`, `nameEn`, `reading`, `meaning`, `rank: null`, approved `element`, approved `rarity`, stronger-than-normal base stats, `archetype`, `isStarter: false`, a 5-6 move learnset, `stage: 1`, and `createdAt: "2026-05-06"`.

- [ ] **Step 3: Parse-check creature JSON**

Run:

```bash
node -e "JSON.parse(require('fs').readFileSync('data/creatures.json','utf8')); console.log('creatures JSON OK')"
```

Expected: prints `creatures JSON OK`.

---

### Task 3: Add Recipes and Update Fusion Tests

**Files:**
- Modify: `src/game/services/fusion-service.js`
- Modify: `tests/unit/game/fusion-service.test.js`
- Modify: `tests/integration/flows/fusion.test.js`

- [ ] **Step 1: Add 10 recipes**

Add recipe entries to `FUSION_RECIPES` with keys `shadowDog`, `lightHorse`, `cloudFish`, `moonWolf`, `iceBear`, `sandSnake`, `thunderBird`, `snowFox`, `flowerFairy`, and `boneOni`. Each recipe must have exactly two ingredients, `requiresBossDefeatId` equal to `resultId`, and `cost: { fusionCores: 1 }`.

- [ ] **Step 2: Update tests that assume visible recipe counts**

Update tests to look up Fire Cat by ID instead of relying on `recipes[0]` length/count assumptions when extra boss-locked recipes exist.

- [ ] **Step 3: Run focused fusion tests**

Run:

```bash
npm run test:unit -- --test-reporter=spec tests/unit/game/boss-locked-fusion-roster.test.js tests/unit/game/fusion-service.test.js
```

Expected: both files pass.

---

### Task 4: Final Verification and Commit on Dev

**Files:**
- All files changed in Tasks 1-3.

- [ ] **Step 1: Run syntax checks**

Run:

```bash
node --check src/game/services/fusion-service.js && node --check tests/unit/game/boss-locked-fusion-roster.test.js && node --check tests/unit/game/fusion-service.test.js && node --check tests/integration/flows/fusion.test.js
```

Expected: no syntax errors.

- [ ] **Step 2: Run focused unit tests**

Run:

```bash
npm run test:unit -- --test-reporter=spec tests/unit/game/boss-locked-fusion-roster.test.js tests/unit/game/fusion-service.test.js tests/unit/creature/creature-move-expansion-data.test.js tests/unit/creature/starter-distribution.test.js
```

Expected: all listed tests pass.

- [ ] **Step 3: Run relevant integration test**

Run:

```bash
npm run test:integration -- --test-reporter=spec tests/integration/flows/fusion.test.js
```

Expected: fusion integration flow passes.

- [ ] **Step 4: Inspect diff and commit**

Run git status, diff, and log per repository commit workflow. Commit only the fusion roster spec, plan, ledger, tests, service change, and creature data.
