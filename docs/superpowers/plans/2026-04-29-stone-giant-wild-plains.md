# Stone Giant Wild Plains Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Re-add `ishino-kyojin` as the tanky uncommon boss of Wild Plains, then pause before adding its quantity-based fusion recipe.

**Architecture:** Phase 1 is data-first: add one creature template, point Wild Plains at it, and prove the data loads through existing creature and room generation paths. Phase 2 is intentionally gated until creature-count fusion lands; then add a recipe requiring `ishi x3` and verify duplicate ingredient counts are consumed.

**Tech Stack:** Node.js ES modules, JSON data files, `node:test`, existing Koto room generation and creature instantiation services.

---

## File Structure

- Modify `data/creatures.json`: add the `ishino-kyojin` creature template near the other stage 1 earth/tank creatures or near `hineko`, keeping valid JSON array syntax.
- Modify `data/areas.json`: change only `wild-plains.bossCreatureId` from `hineko` to `ishino-kyojin`; do not add `ishino-kyojin` to the Wild Plains `creatures` encounter pool.
- Modify `tests/unit/creature/creatures.test.js`: add focused coverage that Stone Giant instantiates with the approved uncommon tank stats and first-three active moves.
- Modify `tests/unit/game/rooms-koto2.test.js`: update Wild Plains boss expectation and add/keep an assertion that Starting Meadow still uses `hineko`.
- Later, after quantity fusion lands, modify `src/game/services/fusion-service.js` and fusion tests for the `stone-giant` recipe. Do not do this before the pause gate.

---

### Task 1: Add Failing Creature Template Coverage

**Files:**
- Modify: `tests/unit/creature/creatures.test.js`

- [ ] **Step 1: Add the failing Stone Giant instantiation test**

In `tests/unit/creature/creatures.test.js`, inside `describe('Creature Instantiation', () => { ... })`, after the existing `it('has category and target on first move', ...)` test, insert:

```js
  it('instantiates Stone Giant as an uncommon tank boss creature', () => {
    const creature = instantiateCreature('ishino-kyojin', 10);

    assert.strictEqual(creature.id, 'ishino-kyojin');
    assert.strictEqual(creature.name, '石の巨人');
    assert.strictEqual(creature.nameEn, 'Stone Giant');
    assert.strictEqual(creature.element, 'earth');
    assert.strictEqual(creature.rarity, 'uncommon');
    assert.strictEqual(creature.archetype, 'Tank/Healer');
    assert.strictEqual(creature.baseWord, '巨人');
    assert.strictEqual(creature.baseReading, 'きょじん');
    assert.strictEqual(creature.baseMeaning, 'giant / great man');

    // Uncommon multiplier 1.1 is applied to base templates before level scaling.
    // Level 10 scaling is 1.9x.
    assert.strictEqual(creature.baseHpTemplate, 110);
    assert.strictEqual(creature.baseAttackTemplate, 14);
    assert.strictEqual(creature.baseMpTemplate, 50);
    assert.strictEqual(creature.baseDefenseTemplate, 9);
    assert.strictEqual(creature.maxHp, 229); // floor(floor(110 * 1.1) * 1.9)
    assert.strictEqual(creature.attack, 28); // floor(floor(14 * 1.1) * 1.9)
    assert.strictEqual(creature.maxMp, 104); // floor(floor(50 * 1.1) * 1.9)
    assert.strictEqual(creature.defense, 17); // round(floor(9 * 1.1) * 1.9)

    assert.deepStrictEqual(creature.moves.map(move => move.id), [
      'mamoru',
      'tataku',
      'nigiru'
    ]);
  });
```

- [ ] **Step 2: Run the focused creature test and confirm it fails**

Run:

```bash
npm run test:unit -- tests/unit/creature/creatures.test.js
```

Expected: FAIL with an error containing `Creature template not found: ishino-kyojin`.

- [ ] **Step 3: Commit only if working in a branch where test-first commits are desired**

Do not commit if the user asked for a single final commit later. If committing now is appropriate, run:

```bash
/usr/bin/git add tests/unit/creature/creatures.test.js
/usr/bin/git commit -m "$(cat <<'EOF'
test: cover Stone Giant creature template

EOF
)"
```

---

### Task 2: Add Stone Giant Creature Data

**Files:**
- Modify: `data/creatures.json`

- [ ] **Step 1: Add the Stone Giant JSON object**

In `data/creatures.json`, add this object as a new top-level array entry. A good location is immediately after the existing `ishi` entry, because Stone Giant is an earth tank derived from Stone.

```json
  {
    "id": "ishino-kyojin",
    "name": "石の巨人",
    "nameEn": "Stone Giant",
    "element": "earth",
    "rarity": "uncommon",
    "baseHp": 110,
    "baseAttack": 14,
    "baseMp": 50,
    "baseDefense": 9,
    "baseWord": "巨人",
    "baseReading": "きょじん",
    "baseMeaning": "giant / great man",
    "baseRank": 4900,
    "archetype": "Tank/Healer",
    "isStarter": false,
    "learnset": [
      {
        "moveId": "mamoru",
        "level": 1
      },
      {
        "moveId": "tataku",
        "level": 5
      },
      {
        "moveId": "nigiru",
        "level": 10
      },
      {
        "moveId": "suwaru",
        "level": 16
      },
      {
        "moveId": "horu",
        "level": 22
      }
    ],
    "stage": 1,
    "createdAt": "2026-04-29"
  }
```

Make sure commas around neighboring array entries remain valid.

- [ ] **Step 2: Run the focused creature test and confirm it passes**

Run:

```bash
npm run test:unit -- tests/unit/creature/creatures.test.js
```

Expected: PASS for `tests/unit/creature/creatures.test.js`.

- [ ] **Step 3: Validate creature JSON and referenced move IDs**

Run:

```bash
node --input-type=module - <<'EOF'
import { readFileSync } from 'fs';

const creatures = JSON.parse(readFileSync('data/creatures.json', 'utf8'));
const moves = JSON.parse(readFileSync('data/moves.json', 'utf8'));
const moveIds = new Set(moves.map(move => move.id));
const stoneGiant = creatures.find(creature => creature.id === 'ishino-kyojin');

if (!stoneGiant) throw new Error('Missing ishino-kyojin');
for (const entry of stoneGiant.learnset || []) {
  if (!moveIds.has(entry.moveId)) {
    throw new Error(`Missing move referenced by Stone Giant: ${entry.moveId}`);
  }
}

console.log('Stone Giant creature data OK');
EOF
```

Expected output:

```text
Stone Giant creature data OK
```

- [ ] **Step 4: Commit only if using task-by-task commits**

```bash
/usr/bin/git add data/creatures.json tests/unit/creature/creatures.test.js
/usr/bin/git commit -m "$(cat <<'EOF'
feat: add Stone Giant creature template

EOF
)"
```

---

### Task 3: Update Wild Plains Boss Coverage

**Files:**
- Modify: `tests/unit/game/rooms-koto2.test.js`

- [ ] **Step 1: Make the Wild Plains boss expectation fail for the current data**

In `tests/unit/game/rooms-koto2.test.js`, replace the Wild Plains boss test:

```js
    it('keeps boss at room 30', () => {
      const rooms = generateAreaRooms('wild-plains');
      assert.equal(rooms[29].type, 'boss');
      assert.equal(rooms[29].boss.creatureId, 'hineko');
    });
```

with:

```js
    it('keeps Stone Giant as the boss at room 30', () => {
      const rooms = generateAreaRooms('wild-plains');
      assert.equal(rooms[29].type, 'boss');
      assert.equal(rooms[29].boss.creatureId, 'ishino-kyojin');
    });
```

- [ ] **Step 2: Strengthen the Starting Meadow regression assertion**

In the Starting Meadow test, keep the `hineko` assertion. If the test name still says `places npcBattle at room 6 and boss at room 10`, update only the name to be explicit:

```js
    it('places npcBattle at room 6 and keeps Hineko as boss at room 10', () => {
      const rooms = generateAreaRooms('hajimari-no-hiroba');
      assert.equal(rooms[5].type, 'npcBattle');
      assert.equal(rooms[9].type, 'boss');
      assert.equal(rooms[9].boss.creatureId, 'hineko');
    });
```

- [ ] **Step 3: Run the focused room generation test and confirm it fails**

Run:

```bash
npm run test:unit -- tests/unit/game/rooms-koto2.test.js
```

Expected: FAIL because Wild Plains still has `hineko` in `data/areas.json`.

- [ ] **Step 4: Commit only if using task-by-task commits**

```bash
/usr/bin/git add tests/unit/game/rooms-koto2.test.js
/usr/bin/git commit -m "$(cat <<'EOF'
test: expect Stone Giant as Wild Plains boss

EOF
)"
```

---

### Task 4: Assign Stone Giant To Wild Plains

**Files:**
- Modify: `data/areas.json`

- [ ] **Step 1: Change only the Wild Plains boss ID**

In `data/areas.json`, find the `wild-plains` area object and change:

```json
    "bossCreatureId": "hineko",
```

to:

```json
    "bossCreatureId": "ishino-kyojin",
```

Do not change the `creatures` list. It should remain:

```json
    "creatures": [
      "hi",
      "mizu",
      "ki",
      "ishi",
      "tetsu",
      "kaze",
      "mushi",
      "hana",
      "tori",
      "sakana",
      "neko",
      "inu"
    ],
```

- [ ] **Step 2: Run focused room generation tests**

Run:

```bash
npm run test:unit -- tests/unit/game/rooms-koto2.test.js
```

Expected: PASS. Starting Meadow should still assert `hineko`; Wild Plains should assert `ishino-kyojin`.

- [ ] **Step 3: Validate area JSON and boss reference**

Run:

```bash
node --input-type=module - <<'EOF'
import { readFileSync } from 'fs';

const areas = JSON.parse(readFileSync('data/areas.json', 'utf8'));
const creatures = JSON.parse(readFileSync('data/creatures.json', 'utf8'));
const creatureIds = new Set(creatures.map(creature => creature.id));
const wildPlains = areas.find(area => area.id === 'wild-plains');
const startingMeadow = areas.find(area => area.id === 'hajimari-no-hiroba');

if (startingMeadow?.bossCreatureId !== 'hineko') {
  throw new Error(`Starting Meadow boss changed unexpectedly: ${startingMeadow?.bossCreatureId}`);
}
if (wildPlains?.bossCreatureId !== 'ishino-kyojin') {
  throw new Error(`Wild Plains boss is not Stone Giant: ${wildPlains?.bossCreatureId}`);
}
if (!creatureIds.has(wildPlains.bossCreatureId)) {
  throw new Error(`Wild Plains boss is not a known creature: ${wildPlains.bossCreatureId}`);
}
if ((wildPlains.creatures || []).includes('ishino-kyojin')) {
  throw new Error('Stone Giant should not be in the Wild Plains encounter pool yet');
}

console.log('Wild Plains boss data OK');
EOF
```

Expected output:

```text
Wild Plains boss data OK
```

- [ ] **Step 4: Commit only if using task-by-task commits**

```bash
/usr/bin/git add data/areas.json tests/unit/game/rooms-koto2.test.js
/usr/bin/git commit -m "$(cat <<'EOF'
feat: make Stone Giant the Wild Plains boss

EOF
)"
```

---

### Task 5: Final Verification For Phase 1

**Files:**
- No additional edits expected.

- [ ] **Step 1: Run focused tests**

Run:

```bash
npm run test:unit -- tests/unit/creature/creatures.test.js tests/unit/game/rooms-koto2.test.js
```

Expected: PASS.

- [ ] **Step 2: Run full unit tests**

Run:

```bash
npm run test:unit
```

Expected: PASS. If there are unrelated pre-existing failures, capture the failing test names and do not broaden this Stone Giant task to fix them without user approval.

- [ ] **Step 3: Check lints in edited files**

Use Cursor lints or run the existing test commands above. JSON files should parse from the validation commands in Tasks 2 and 4.

- [ ] **Step 4: Review git diff**

Run:

```bash
/usr/bin/git diff -- data/creatures.json data/areas.json tests/unit/creature/creatures.test.js tests/unit/game/rooms-koto2.test.js
```

Expected: diff only includes Stone Giant data, Wild Plains boss assignment, and focused tests.

- [ ] **Step 5: Stop before fusion recipe work**

Stop here and report Phase 1 completion. Do not add the `stone-giant` fusion recipe yet. Wait for the user to confirm that creature-count fusion has landed and that the recipe should be added.

---

### Task 6: Later Fusion Recipe After Creature-Count Fusion Lands

**Status:** Do not start until the user gives the greenlight after creature-count fusion is merged.

**Files:**
- Modify: `src/game/services/fusion-service.js`
- Modify: `tests/unit/game/fusion-service.test.js`
- Modify UI tests or Fusion Lab UI only if the quantity-fusion branch introduces a recipe display contract that needs updates.

- [ ] **Step 1: Confirm quantity-fusion API shape before editing**

Open `src/game/services/fusion-service.js` and confirm recipes support duplicate ingredient requirements, either through repeated IDs such as:

```js
ingredientIds: ['ishi', 'ishi', 'ishi']
```

or through requirement objects such as:

```js
ingredients: [{ id: 'ishi', count: 3 }]
```

Use the shape already merged by creature-count fusion. Do not invent a second recipe schema.

- [ ] **Step 2: Add failing fusion service coverage**

In `tests/unit/game/fusion-service.test.js`, add a test matching the merged quantity-fusion helpers. If the merged API uses `creatureCounts`, the test should assert this behavior:

```js
it('fuses Stone Giant from three owned Stone copies', () => {
  const meta = makeMeta({
    creatureCollection: ['hi', 'neko', 'ishi'],
    creatureCounts: { hi: 1, neko: 1, ishi: 3 },
    fusionCores: 1
  });

  const result = startFusion(meta, FUSION_RECIPES.stoneGiant.id);

  assert.equal(result.success, true);
  assert.equal(result.unlockedCreatureId, 'ishino-kyojin');
  assert.equal(meta.fusionCores, 0);
  assert.equal(meta.creatureCounts.ishi, 0);
  assert.equal(meta.creatureCounts['ishino-kyojin'], 1);
  assert.ok(meta.creatureCollection.includes('ishino-kyojin'));
});
```

Also add the insufficient-count guard:

```js
it('rejects Stone Giant fusion without three owned Stone copies', () => {
  const meta = makeMeta({
    creatureCollection: ['hi', 'neko', 'ishi'],
    creatureCounts: { hi: 1, neko: 1, ishi: 2 },
    fusionCores: 1
  });

  const result = startFusion(meta, FUSION_RECIPES.stoneGiant.id);

  assert.equal(result.success, false);
  assert.equal(meta.fusionCores, 1);
  assert.equal(meta.creatureCounts.ishi, 2);
  assert.equal(meta.creatureCounts['ishino-kyojin'] || 0, 0);
});
```

- [ ] **Step 3: Run fusion tests and confirm the new tests fail**

Run:

```bash
npm run test:unit -- tests/unit/game/fusion-service.test.js
```

Expected: FAIL because `FUSION_RECIPES.stoneGiant` does not exist yet.

- [ ] **Step 4: Add the Stone Giant recipe using the merged schema**

If the merged schema still uses repeated `ingredientIds`, add:

```js
  stoneGiant: {
    id: 'stone-giant',
    name: '石の巨人',
    nameEn: 'Stone Giant',
    ingredientIds: ['ishi', 'ishi', 'ishi'],
    resultId: 'ishino-kyojin',
    cost: { fusionCores: 1 }
  }
```

If the merged schema uses counted ingredient objects, add:

```js
  stoneGiant: {
    id: 'stone-giant',
    name: '石の巨人',
    nameEn: 'Stone Giant',
    ingredients: [{ id: 'ishi', count: 3 }],
    resultId: 'ishino-kyojin',
    cost: { fusionCores: 1 }
  }
```

Use exactly one schema: the one already in the file after creature-count fusion lands.

- [ ] **Step 5: Run fusion tests**

Run:

```bash
npm run test:unit -- tests/unit/game/fusion-service.test.js
```

Expected: PASS.

- [ ] **Step 6: Run Fusion Lab verification after UI support exists**

If quantity-fusion UI has landed, open the Fusion Lab manually or with browser tooling only after user approval for browser launch. Verify the recipe displays `ishi x3` or `Owned N/3`, and that the start button is disabled below three owned `ishi`.

- [ ] **Step 7: Commit only if using task-by-task commits**

```bash
/usr/bin/git add src/game/services/fusion-service.js tests/unit/game/fusion-service.test.js
/usr/bin/git commit -m "$(cat <<'EOF'
feat: add Stone Giant fusion recipe

EOF
)"
```

---

## Self-Review Notes

- Spec coverage: Phase 1 covers creature data, moves, Wild Plains assignment, no sprite asset, and no normal encounter pool entry. Phase 2 covers the delayed `ishi x3` recipe behind a pause gate.
- Red-flag scan: passed; the only conditional language is in Task 6 where the plan must adapt to the schema produced by the pending creature-count fusion branch.
- Type consistency: all current-phase IDs match the spec: `ishino-kyojin`, `wild-plains`, `hineko`, `ishi`, and move IDs `mamoru`, `tataku`, `nigiru`, `suwaru`, `horu`.
