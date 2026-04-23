# Rest Action + "Not Enough MP" Popup — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a fourth always-present "Rest" (休む) cell to the combat move grid that restores 20% MP per creature, routes through the existing split attack card, and replace the silent dead-click on unaffordable moves with a cyan "Not enough MP!" event popup.

**Architecture:** Rest is a synthetic pseudo-move (`REST_MOVE` constant) injected into the move-select grid at render time — it is never stored on a creature, never in `data/moves.json`, never learnable. Client dispatches it via `moveChoices: [{ creatureIndex, action: 'rest' }]` alongside normal attack entries. The server's `processMoveTurn` handles `action: 'rest'` entries inline: restore `ceil(maxMp * 0.20)` MP, skip attack resolution, emit a synthetic "rest attack" object with `category: 'rest'` so it flows through the existing attack-card orchestrator on the client. The attack card branches on `atk.category === 'rest'` to render `+N MP` in the damage-number slot.

**Tech Stack:** Vanilla JS ES modules (client), Node.js + Express (server), Node built-in test runner (`node --test`), c8 for coverage, existing PixiJS + DOM VFX pipelines.

---

## File Structure

**New files:**
- `src/game/rest-move.js` — exports `REST_MOVE` constant (shared between client and server)
- `public/assets/sprites/actions/rest.webp` — Rest action sprite (asset task, user-generated)

**Modified files:**
- `src/game/services/creature-combat-service.js` — `processMoveTurn` handles `action: 'rest'` entries; emits synthetic rest attack objects
- `public/js/ui/move-select.js` — appends Rest cell, always-attached click handler, routes unaffordable clicks to `notEnoughMp` popup, routes full-MP rest clicks to `fullyRested` popup
- `public/js/ui/event-popup.js` — exports `notEnoughMp` and `fullyRested` presets
- `public/js/ui/attack-card.js` — branches on `atk.category === 'rest'` in `formatResultValue` and `resultTone`; adds `moveIcon` fallback; suppresses effectiveness text for rest
- `public/js/ui/move-effect-label.js` — returns `{ iconType: 'drop', text: '+20% MP' }` when `move.isRest === true` (so the pill reads `0 MP | +20% MP`)
- `public/js/ui/combat-loop.js` — `handleMoveSelected` dispatches `action: 'rest'` choices without target selection
- `public/js/ui/i18n.js` — add `notEnoughMp` and `fullyRested` keys
- `data/live-dictionary.json` — add 休む entry (**gated task — requires user approval**)
- `tests/unit/combat/creature-combat-service.test.js` — new unit tests for Rest handling
- `tests/unit/ui/move-select.test.js` *(create if absent)* — tests for Rest cell rendering and click routing

---

## Task Index

1. Shared `REST_MOVE` constant
2. Server — unit test: rest restores 20% MP
3. Server — implement rest handling in `processMoveTurn`
4. Server — unit test: mixed attacks + rest
5. Server — unit test: rest caps at maxMp
6. Server — unit test: invalid/KO'd creature rest entry is ignored
7. Server — emit synthetic rest attack object for card flow
8. Server — unit test: rest attack object shape
9. Client — `effectLabel` returns `+20% MP` pill for `isRest` moves
10. Client — `event-popup.js` add `notEnoughMp` and `fullyRested` presets
11. Client — `move-select.js` append Rest cell always
12. Client — `move-select.js` always-attached click handler + popup routing
13. Client — i18n strings
14. Client — `combat-loop.js` dispatch `action: 'rest'` in moveChoices
15. Client — `attack-card.js` branch on `category: 'rest'`
16. Integration test — full turn with mixed moves + rest
17. Dictionary entry (gated on user approval)
18. Sprite asset (user-facing task note)
19. Manual Playwright verification + screenshots

---

## Task 1: Shared `REST_MOVE` constant

**Files:**
- Create: `src/game/rest-move.js`

- [ ] **Step 1: Create the constant file**

```js
// src/game/rest-move.js
/**
 * Synthetic "Rest" pseudo-move. Always appended to a creature's move-select
 * grid. Never stored on a creature, never in data/moves.json. Server recognises
 * it via moveChoices entries with { action: 'rest' }.
 */
export const REST_MOVE = Object.freeze({
  id: 'rest',
  name: '休む',
  reading: 'やすむ',
  nameEn: 'rest',
  element: 'neutral',
  category: 'heal',
  target: 'self',
  mpCost: 0,
  power: 0,
  isRest: true,
});

/** Fractional maxMp restored per rest action (20%). */
export const REST_MP_FRACTION = 0.20;

/** Compute the MP gained if `creature` rests. Clamped by current MP headroom. */
export function computeRestMpGain(creature) {
  const maxMp = creature.maxMp || 0;
  const currentMp = creature.mp || 0;
  const headroom = Math.max(0, maxMp - currentMp);
  return Math.min(headroom, Math.ceil(maxMp * REST_MP_FRACTION));
}
```

- [ ] **Step 2: Syntax check**

Run: `node --check src/game/rest-move.js && echo OK`
Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add src/game/rest-move.js
git commit -m "feat(combat): add REST_MOVE constant and computeRestMpGain helper"
```

---

## Task 2: Server unit test — Rest restores 20% MP (rounded up)

**Files:**
- Test: `tests/unit/combat/creature-combat-service.test.js` (append)

- [ ] **Step 1: Read the existing test file to learn test style**

Run: `head -60 tests/unit/combat/creature-combat-service.test.js`
Note the import style and `describe`/`test` structure used by existing tests — match it exactly.

- [ ] **Step 2: Append the failing test**

Append this block to `tests/unit/combat/creature-combat-service.test.js`. If the file uses `node:test` + `node:assert` style (check first), use that. The example below uses the pattern already present in the file — ADAPT if the file uses a different framework:

```js
import { computeRestMpGain } from '../../../src/game/rest-move.js';

describe('Rest action — MP math', () => {
  test('restores ceil(maxMp * 0.20) for a dry creature', () => {
    const creature = { mp: 0, maxMp: 100 };
    assert.equal(computeRestMpGain(creature), 20);
  });

  test('rounds up — 10% of 95 is 9.5, ceil = 10 is wrong; 20% of 95 = 19', () => {
    const creature = { mp: 0, maxMp: 95 };
    assert.equal(computeRestMpGain(creature), 19); // ceil(95 * 0.20) = 19
  });

  test('rounds up on fractional result — maxMp 37, 20% = 7.4 → 8', () => {
    const creature = { mp: 0, maxMp: 37 };
    assert.equal(computeRestMpGain(creature), 8);
  });

  test('clamps to remaining headroom so mp never exceeds maxMp', () => {
    const creature = { mp: 95, maxMp: 100 };
    assert.equal(computeRestMpGain(creature), 5);
  });

  test('returns 0 when already at max MP', () => {
    const creature = { mp: 100, maxMp: 100 };
    assert.equal(computeRestMpGain(creature), 0);
  });

  test('handles missing mp field (treats as 0)', () => {
    const creature = { maxMp: 50 };
    assert.equal(computeRestMpGain(creature), 10);
  });

  test('handles missing maxMp field (returns 0)', () => {
    const creature = { mp: 5 };
    assert.equal(computeRestMpGain(creature), 0);
  });
});
```

- [ ] **Step 3: Run the test, expect PASS**

Since `computeRestMpGain` already exists from Task 1, this test should pass immediately. (It's a unit test of already-implemented logic — retroactive TDD coverage.)

Run: `npm run test:unit -- --test-name-pattern "Rest action — MP math"`
Expected: all 7 assertions pass.

- [ ] **Step 4: Commit**

```bash
git add tests/unit/combat/creature-combat-service.test.js
git commit -m "test(combat): rest MP math — ceil(maxMp * 0.20), clamped to headroom"
```

---

## Task 3: Server — implement `action: 'rest'` handling in `processMoveTurn`

**Files:**
- Modify: `src/game/services/creature-combat-service.js` (function `processMoveTurn` near line 400)

- [ ] **Step 1: Read the existing `processMoveTurn` function**

Run: `sed -n '395,475p' src/game/services/creature-combat-service.js`
Study how it iterates `moveChoices`, deducts MP, calls `executeMove`, and pushes results.

- [ ] **Step 2: Add import**

Add to the top of `src/game/services/creature-combat-service.js` (with the other imports):

```js
import { REST_MOVE, computeRestMpGain } from '../rest-move.js';
```

Adjust the relative path based on the service file's existing imports (check existing imports in the file — if they use `./...` or `../...`, follow the same pattern). The service lives at `src/game/services/creature-combat-service.js` so `../rest-move.js` is correct.

- [ ] **Step 3: Add rest handling branch inside the moveChoices loop**

Inside `processMoveTurn`, modify the `for (const choice of moveChoices) { ... }` loop. At the very top of the loop body, BEFORE the existing `const move = (creature.moves || []).find(...)` line, add:

```js
  for (const choice of moveChoices) {
    const creature = allies[choice.creatureIndex];
    if (!creature || creature.hp <= 0) continue;
    if (isIncapacitated(creature)) continue;

    // Rest pseudo-move — restore 20% MP and skip attack resolution entirely.
    if (choice.action === 'rest') {
      const mpGained = computeRestMpGain(creature);
      creature.mp = Math.min(creature.maxMp || 0, (creature.mp || 0) + mpGained);
      attacks.push(buildRestAttack(creature, choice.creatureIndex, mpGained));
      continue;
    }

    // If all enemies are dead, stop processing damage-oriented moves
    const aliveEnemies = enemies.filter(e => e.hp > 0);
    if (aliveEnemies.length === 0) break;

    const move = (creature.moves || []).find(m => m.id === choice.moveId);
    // ...rest of existing body unchanged
```

(Do not duplicate the existing `hp <= 0` / `isIncapacitated` checks — the added block sits between those checks and the `aliveEnemies` check, as shown.)

- [ ] **Step 4: Add `buildRestAttack` helper near the top of the file**

Add this helper above `processMoveTurn` (near other private helpers in the file):

```js
/**
 * Build a synthetic "attack" object for a rest action so the client's
 * attack-card orchestrator can play it alongside real attacks. The client
 * branches on `category: 'rest'` to render `+N MP` in the number slot
 * and skip damage/effectiveness rendering.
 */
function buildRestAttack(creature, creatureIndex, mpGained) {
  return {
    category: 'rest',
    isRest: true,
    // Attacker = the resting creature
    attackerId: creature.id,
    attackerIndex: creatureIndex,
    attackerName: creature.nameEn || creature.name || '',
    attackerNameJp: creature.name || '',
    attackerBaseWord: creature.baseWord || creature.name || '',
    attackerBaseReading: creature.baseReading || '',
    attackerBaseMeaning: creature.baseMeaning || creature.nameEn || '',
    attackerElement: creature.element || 'neutral',
    attackerMp: creature.mp,
    attackerMaxMp: creature.maxMp || 0,
    // Target = self (same creature)
    targetSide: 'player',
    targetId: creature.id,
    targetIndex: creatureIndex,
    targetName: creature.nameEn || creature.name || '',
    targetNameJp: creature.name || '',
    targetBaseWord: creature.baseWord || creature.name || '',
    targetBaseReading: creature.baseReading || '',
    targetBaseMeaning: creature.baseMeaning || creature.nameEn || '',
    targetElement: creature.element || 'neutral',
    // Move metadata — uses REST_MOVE so the card renders 休む with furigana
    moveName: REST_MOVE.name,
    moveNameEn: REST_MOVE.nameEn,
    moveElement: 'neutral',
    attackerSkillName: REST_MOVE.name,
    attackerSkillReading: REST_MOVE.reading,
    attackerSkillEn: REST_MOVE.nameEn,
    // Result payload
    damage: 0,
    mpGained,
    elementMultiplier: 1,
  };
}
```

- [ ] **Step 5: Syntax check**

Run: `node --check src/game/services/creature-combat-service.js && echo OK`
Expected: `OK`

- [ ] **Step 6: Commit**

```bash
git add src/game/services/creature-combat-service.js
git commit -m "feat(combat): handle action='rest' in processMoveTurn

Adds inline rest handling to the per-creature moveChoices loop: restore
ceil(maxMp * 0.20), skip attack resolution, emit a synthetic attack
object with category='rest' so the client orchestrator can play it
through the existing attack-card pipeline."
```

---

## Task 4: Server unit test — Mixed turn: 2 attacks + 1 rest

**Files:**
- Test: `tests/unit/combat/creature-combat-service.test.js` (append)

- [ ] **Step 1: Read current test file to find existing fixtures**

Run: `grep -n 'function makeCreature\|makeAlly\|fixture\|describe.*processMoveTurn' tests/unit/combat/creature-combat-service.test.js`
If the file has fixture helpers (e.g. `makeCreature()`), reuse them. Otherwise, define minimal inline fixtures as shown below.

- [ ] **Step 2: Append the failing test**

```js
describe('Rest action — processMoveTurn integration', () => {
  test('mixed turn: 2 attacks + 1 rest → 2 attacks fire, 1 rest attack emitted', () => {
    // Minimal fixtures — adjust field names to match what processMoveTurn expects
    const allies = [
      { id: 'a0', hp: 100, maxHp: 100, mp: 50,  maxMp: 100, attack: 20, defense: 10, speed: 10,
        element: 'fire',  nameEn: 'A0', name: 'A0', moves: [{ id: 'm_fire', name: 'F', nameEn: 'fire', element: 'fire', category: 'damage', power: 20, mpCost: 10, target: 'single_enemy' }], activeEffects: [] },
      { id: 'a1', hp: 100, maxHp: 100, mp: 0,   maxMp: 100, attack: 20, defense: 10, speed: 10,
        element: 'water', nameEn: 'A1', name: 'A1', moves: [], activeEffects: [] },
      { id: 'a2', hp: 100, maxHp: 100, mp: 50,  maxMp: 100, attack: 20, defense: 10, speed: 10,
        element: 'earth', nameEn: 'A2', name: 'A2', moves: [{ id: 'm_earth', name: 'E', nameEn: 'earth', element: 'earth', category: 'damage', power: 20, mpCost: 10, target: 'single_enemy' }], activeEffects: [] },
    ];
    const enemies = [
      { id: 'e0', hp: 200, maxHp: 200, attack: 15, defense: 10, element: 'water', activeEffects: [] }
    ];
    const moveChoices = [
      { creatureIndex: 0, moveId: 'm_fire',  targetIndex: 0 },
      { creatureIndex: 1, action: 'rest' },
      { creatureIndex: 2, moveId: 'm_earth', targetIndex: 0 },
    ];

    const result = processMoveTurn(allies, enemies, moveChoices);

    // 3 entries in attacks: attack, rest, attack
    assert.equal(result.attacks.length, 3, 'expected 3 attack entries (2 real + 1 rest)');
    assert.equal(result.attacks[0].category, 'damage');
    assert.equal(result.attacks[1].category, 'rest');
    assert.equal(result.attacks[2].category, 'damage');

    // Rest restored MP to creature a1
    assert.equal(allies[1].mp, 20, 'a1 should be at 20 MP after rest (0 + ceil(100*0.20))');

    // Rest attack object — self-targeted, +20 MP gained
    const restAtk = result.attacks[1];
    assert.equal(restAtk.attackerId, 'a1');
    assert.equal(restAtk.targetId, 'a1');
    assert.equal(restAtk.mpGained, 20);
    assert.equal(restAtk.isRest, true);
    assert.equal(restAtk.damage, 0);
  });
});
```

Ensure `processMoveTurn` is imported at the top of the test file (it should already be).

- [ ] **Step 3: Run the test**

Run: `npm run test:unit -- --test-name-pattern "Rest action — processMoveTurn integration"`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add tests/unit/combat/creature-combat-service.test.js
git commit -m "test(combat): mixed turn 2 attacks + 1 rest emits 3 attack entries"
```

---

## Task 5: Server unit test — Rest clamps at maxMp

**Files:**
- Test: `tests/unit/combat/creature-combat-service.test.js` (append)

- [ ] **Step 1: Append the test**

```js
test('rest on a creature at maxMp: mp stays at maxMp, mpGained is 0, attack entry still emitted', () => {
  const allies = [
    { id: 'a0', hp: 100, maxHp: 100, mp: 100, maxMp: 100, attack: 20, defense: 10, speed: 10,
      element: 'fire', nameEn: 'A0', name: 'A0', moves: [], activeEffects: [] }
  ];
  const enemies = [{ id: 'e0', hp: 200, maxHp: 200, attack: 15, defense: 10, element: 'water', activeEffects: [] }];
  const moveChoices = [{ creatureIndex: 0, action: 'rest' }];

  const result = processMoveTurn(allies, enemies, moveChoices);

  assert.equal(allies[0].mp, 100);
  assert.equal(result.attacks.length, 1);
  assert.equal(result.attacks[0].category, 'rest');
  assert.equal(result.attacks[0].mpGained, 0);
});

test('rest on a creature near maxMp clamps correctly', () => {
  const allies = [
    { id: 'a0', hp: 100, maxHp: 100, mp: 95, maxMp: 100, attack: 20, defense: 10, speed: 10,
      element: 'fire', nameEn: 'A0', name: 'A0', moves: [], activeEffects: [] }
  ];
  const enemies = [{ id: 'e0', hp: 200, maxHp: 200, attack: 15, defense: 10, element: 'water', activeEffects: [] }];
  const moveChoices = [{ creatureIndex: 0, action: 'rest' }];

  processMoveTurn(allies, enemies, moveChoices);
  assert.equal(allies[0].mp, 100, 'should clamp at maxMp, not go to 115');
});
```

- [ ] **Step 2: Run & commit**

Run: `npm run test:unit -- --test-name-pattern "rest on a creature"`
Expected: both PASS.

```bash
git add tests/unit/combat/creature-combat-service.test.js
git commit -m "test(combat): rest clamps at maxMp, emits mpGained=0 when full"
```

---

## Task 6: Server unit test — Invalid/KO'd creature rest entries ignored

**Files:**
- Test: `tests/unit/combat/creature-combat-service.test.js` (append)

- [ ] **Step 1: Append the test**

```js
test('rest entry for KO\'d creature is ignored (no attack emitted, no mp change)', () => {
  const allies = [
    { id: 'a0', hp: 0, maxHp: 100, mp: 0, maxMp: 100, attack: 20, defense: 10, speed: 10,
      element: 'fire', nameEn: 'A0', name: 'A0', moves: [], activeEffects: [] }
  ];
  const enemies = [{ id: 'e0', hp: 200, maxHp: 200, attack: 15, defense: 10, element: 'water', activeEffects: [] }];
  const moveChoices = [{ creatureIndex: 0, action: 'rest' }];

  const result = processMoveTurn(allies, enemies, moveChoices);
  assert.equal(allies[0].mp, 0);
  assert.equal(result.attacks.length, 0);
});

test('rest entry with out-of-range creatureIndex is ignored', () => {
  const allies = [{ id: 'a0', hp: 100, maxHp: 100, mp: 0, maxMp: 100, attack: 20, defense: 10, speed: 10,
    element: 'fire', nameEn: 'A0', name: 'A0', moves: [], activeEffects: [] }];
  const enemies = [{ id: 'e0', hp: 200, maxHp: 200, attack: 15, defense: 10, element: 'water', activeEffects: [] }];
  const moveChoices = [{ creatureIndex: 99, action: 'rest' }];

  const result = processMoveTurn(allies, enemies, moveChoices);
  assert.equal(result.attacks.length, 0);
  assert.equal(allies[0].mp, 0);
});
```

- [ ] **Step 2: Run & commit**

Run: `npm run test:unit -- --test-name-pattern "rest entry"`
Expected: both PASS (the existing `if (!creature || creature.hp <= 0) continue;` check already handles these cases since it runs before the rest branch).

```bash
git add tests/unit/combat/creature-combat-service.test.js
git commit -m "test(combat): rest ignores KO'd and out-of-range creature indices"
```

---

## Task 7: Server unit test — Rest attack object shape

**Files:**
- Test: `tests/unit/combat/creature-combat-service.test.js` (append)

- [ ] **Step 1: Append the shape assertion**

```js
test('rest attack object contains all fields needed by the attack card', () => {
  const allies = [
    { id: 'a0', hp: 100, maxHp: 100, mp: 20, maxMp: 100, attack: 20, defense: 10, speed: 10,
      element: 'fire', nameEn: 'Spark', name: '火ねずみ', baseWord: '火ねずみ', baseReading: 'ひねずみ',
      baseMeaning: 'fire mouse', moves: [], activeEffects: [] }
  ];
  const enemies = [{ id: 'e0', hp: 200, maxHp: 200, attack: 15, defense: 10, element: 'water', activeEffects: [] }];
  const moveChoices = [{ creatureIndex: 0, action: 'rest' }];

  const result = processMoveTurn(allies, enemies, moveChoices);
  const atk = result.attacks[0];

  // Category + flags
  assert.equal(atk.category, 'rest');
  assert.equal(atk.isRest, true);
  assert.equal(atk.damage, 0);
  assert.equal(atk.elementMultiplier, 1);

  // Self-targeting
  assert.equal(atk.attackerId, atk.targetId);
  assert.equal(atk.attackerIndex, atk.targetIndex);

  // Base word fields (needed by entityToToken in attack-card renderer)
  assert.equal(atk.attackerBaseWord, '火ねずみ');
  assert.equal(atk.attackerBaseReading, 'ひねずみ');
  assert.equal(atk.attackerBaseMeaning, 'fire mouse');
  assert.equal(atk.targetBaseWord, '火ねずみ');

  // Move metadata (renders 休む / やすむ / rest in the card)
  assert.equal(atk.attackerSkillName, '休む');
  assert.equal(atk.attackerSkillReading, 'やすむ');
  assert.equal(atk.attackerSkillEn, 'rest');
  assert.equal(atk.moveName, '休む');
  assert.equal(atk.moveNameEn, 'rest');
  assert.equal(atk.moveElement, 'neutral');

  // MP payload
  assert.equal(atk.mpGained, 20);
  assert.equal(atk.attackerMp, 40); // 20 + ceil(100 * 0.20)
  assert.equal(atk.attackerMaxMp, 100);
});
```

- [ ] **Step 2: Run & commit**

Run: `npm run test:unit -- --test-name-pattern "rest attack object"`
Expected: PASS.

```bash
git add tests/unit/combat/creature-combat-service.test.js
git commit -m "test(combat): rest attack object carries all attack-card render fields"
```

---

## Task 8: Client — `effectLabel` returns +20% MP pill for isRest

**Files:**
- Modify: `public/js/ui/move-effect-label.js`

- [ ] **Step 1: Add the isRest branch at the top of `effectLabel`**

Edit `public/js/ui/move-effect-label.js`. In the `effectLabel` function, add this branch as the **very first** check (before the `category === 'buff'` check):

```js
export function effectLabel(move) {
  if (move.isRest) {
    return { iconType: 'drop', text: '+20% MP' };
  }

  if (move.category === 'buff') {
    // ...existing code
```

- [ ] **Step 2: Syntax check**

Run: `node --check public/js/ui/move-effect-label.js && echo OK`
Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add public/js/ui/move-effect-label.js
git commit -m "feat(ui): move-effect-label returns '+20% MP' pill for isRest moves"
```

---

## Task 9: Client — add `notEnoughMp` and `fullyRested` popup presets

**Files:**
- Modify: `public/js/ui/event-popup.js`

- [ ] **Step 1: Add exports**

Append to `public/js/ui/event-popup.js`, after the existing `resistedEffectiveness` export (around line 114):

```js
/** Shown when player clicks a move the creature can't afford. MP cyan, large, brief. */
export const notEnoughMp = (el) => showEventPopup(el, 'Not enough MP!', {
  color: '#4FC3F7',
  particles: 0,
  size: 'large',
  duration: 1200
});

/** Shown when player clicks Rest on a creature already at max MP. */
export const fullyRested = (el) => showEventPopup(el, 'Fully rested!', {
  color: '#4FC3F7',
  particles: 0,
  size: 'large',
  duration: 1200
});
```

- [ ] **Step 2: Syntax check**

Run: `node --check public/js/ui/event-popup.js && echo OK`
Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add public/js/ui/event-popup.js
git commit -m "feat(ui): add notEnoughMp and fullyRested event-popup presets"
```

---

## Task 10: Client — i18n strings (optional wrapper — strings already in presets)

The presets above hard-code the English strings. This is consistent with other hard-coded combat strings in `event-popup.js` (type effectiveness text). Skip the i18n task for now unless the project starts translating combat popups elsewhere.

- [ ] **Step 1: Confirm**

Run: `grep -n "Super-Effective\|'Shielded\|'Confused" public/js/ui/attack-card.js public/js/ui/event-popup.js | head`
Expected: several hard-coded English strings — matches the project pattern.

- [ ] **Step 2: No commit needed** — proceed to Task 11.

---

## Task 11: Client — append Rest cell to move-select grid

**Files:**
- Modify: `public/js/ui/move-select.js`

- [ ] **Step 1: Add REST_MOVE import**

At the top of `public/js/ui/move-select.js`, add:

```js
import { REST_MOVE } from '../../../src/game/rest-move.js';
```

Verify the path resolves. The file `public/js/ui/move-select.js` → `../../../src/game/rest-move.js` → repo root `/src/game/rest-move.js`. Since `public/` is served statically and ES modules need a URL-reachable path, check whether other UI modules import from `src/`:

Run: `grep -rn "from '\\.\\./\\.\\./\\.\\./src" public/js/ui/ | head -5`

- If imports from `src/` exist and work: use the relative path above.
- If no such imports exist: **create a client-side copy** at `public/js/ui/rest-move.js` with the identical `REST_MOVE` constant (omit `computeRestMpGain` — client doesn't need it). Import from `./rest-move.js`.

Pick the approach that matches existing conventions. **The rest of the plan assumes `REST_MOVE` is importable from somewhere and the constant is identical to Task 1.**

- [ ] **Step 2: Modify `showMoves` to append Rest cell**

Edit the `showMoves` function. After the existing `for (const move of creature.moves)` loop that builds move cells, AND before the `if (includeItems)` block, add a Rest cell:

```js
export function showMoves(creature, creatureIndex, opts = {}) {
  // ... existing code up to the move loop ...

  for (const move of creature.moves) {
    const canAfford = (creature.mp ?? creature.currentMp ?? 0) >= (move.mpCost || 0);
    const cell = buildMoveCell(move, canAfford);

    // Always-attached click handler (see Task 12 for unaffordable branch)
    cell.addEventListener('click', () => {
      if (!canAfford) {
        import('./event-popup.js').then(({ notEnoughMp }) => notEnoughMp(cell));
        return;
      }
      if (move.name) playWord(move.name);
      if (moveSelectCb) moveSelectCb(move, creatureIndex);
    });
    grid.appendChild(cell);
  }

  // --- Rest cell — always present as the 4th slot ---
  const restCell = buildMoveCell(REST_MOVE, true);
  restCell.addEventListener('click', () => {
    const atMaxMp = (creature.mp ?? 0) >= (creature.maxMp ?? 0);
    if (atMaxMp) {
      import('./event-popup.js').then(({ fullyRested }) => fullyRested(restCell));
      return;
    }
    if (moveSelectCb) moveSelectCb(REST_MOVE, creatureIndex);
  });
  grid.appendChild(restCell);

  // ... existing includeItems block (may be dead code now, leave as-is) ...
}
```

**Note:** The dynamic `import()` for event-popup avoids a circular import risk. If the existing file already statically imports `event-popup.js`, prefer a static import at the top of the file:

```js
import { notEnoughMp, fullyRested } from './event-popup.js';
```

and replace the `import().then(...)` calls with direct calls. Check with:

Run: `grep -n "from './event-popup" public/js/ui/move-select.js`
If absent: use static import at the top. If present: use that same import pattern.

- [ ] **Step 3: Remove the old canAfford-gated click handler**

The original code had:

```js
if (canAfford) {
  cell.addEventListener('click', () => { ... });
}
```

Replace it with the always-attached handler shown in Step 2. The `.disabled` class on `cell` remains — only the click gating changes.

- [ ] **Step 4: Syntax check**

Run: `node --check public/js/ui/move-select.js && echo OK`
Expected: `OK`

- [ ] **Step 5: Commit**

```bash
git add public/js/ui/move-select.js public/js/ui/rest-move.js 2>/dev/null || git add public/js/ui/move-select.js
git commit -m "feat(ui): append Rest cell to move grid; always-attached click handlers

Rest is always shown as the 4th cell. Unaffordable moves now fire a
'Not enough MP!' popup instead of dead-clicking. Rest on a full-MP
creature fires a 'Fully rested!' popup and does not consume the turn."
```

---

## Task 12: Client — `combat-loop.js` dispatches `action: 'rest'` in moveChoices

**Files:**
- Modify: `public/js/ui/combat-loop.js` (function `handleMoveSelected`, around line 404)

- [ ] **Step 1: Read the current handler**

Run: `sed -n '403,440p' public/js/ui/combat-loop.js`
Confirm the function signature `handleMoveSelected(move, creatureIndex)` and that it pushes to the module-level `moveChoices` array.

- [ ] **Step 2: Add a rest branch at the top of `handleMoveSelected`**

Edit `handleMoveSelected`. Add this branch as the **first action** after the existing `clearActiveGlowForScene(...)` call, before `pendingMove = move`:

```js
function handleMoveSelected(move, creatureIndex) {
  clearActiveGlowForScene(getSceneManager().currentScene);

  // Rest pseudo-move: no target selection, push action entry, advance.
  if (move.isRest) {
    moveChoices.push({ creatureIndex: currentCreatureIndex, action: 'rest' });
    currentCreatureIndex++;
    promptNextCreature();
    return;
  }

  pendingMove = move;
  // ... rest of existing function unchanged
```

- [ ] **Step 3: Syntax check**

Run: `node --check public/js/ui/combat-loop.js && echo OK`
Expected: `OK`

- [ ] **Step 4: Commit**

```bash
git add public/js/ui/combat-loop.js
git commit -m "feat(ui): combat-loop dispatches action='rest' for isRest pseudo-moves

Rest skips target selection and advances to the next creature's turn.
The moveChoices entry { creatureIndex, action: 'rest' } is handled by
processMoveTurn on the server."
```

---

## Task 13: Client — `attack-card.js` branches on `category: 'rest'`

**Files:**
- Modify: `public/js/ui/attack-card.js`

- [ ] **Step 1: Update `resultTone` to handle rest**

Find `resultTone` (around line 12). Add a case:

```js
export function resultTone(atk) {
  switch (atk?.category) {
    case 'damage': return 'damage';
    case 'drain':  return 'damage';
    case 'heal':   return 'heal';
    case 'buff':   return 'buff';
    case 'shield': return 'buff';
    case 'debuff': return 'debuff';
    case 'rest':   return 'heal'; // use existing heal tone for MP cyan/green
    default:       return 'damage';
  }
}
```

- [ ] **Step 2: Update `formatResultValue` to render MP gain**

Find `formatResultValue` (around line 36). Add a case for rest at the top:

```js
export function formatResultValue(atk) {
  const cat = atk?.category;
  if (cat === 'rest') {
    return `+${atk.mpGained ?? 0} MP`;
  }
  if (cat === 'damage' || cat === 'drain') {
    // ...existing code
```

- [ ] **Step 3: Ensure `effectivenessText` returns empty for rest**

Check `effectivenessText` (line 63):

```js
export function effectivenessText(atk) {
  if (atk?.category !== 'damage' && atk?.category !== 'drain') return '';
  // ...
}
```

Since `category === 'rest'` fails the first check, effectiveness text is already suppressed. **No change needed.** Verify manually.

- [ ] **Step 4: Optional — override tone for rest to use MP cyan**

The existing `.sac-tone-heal` class likely uses green. To use MP cyan instead, you have two options:
- **A) Add a new tone class `rest`** and a CSS rule. Update `resultTone` to return `'rest'` and ensure `public/game.css` (or wherever `.sac-tone-*` lives) has `.sac-tone-rest { color: #4FC3F7; }`.
- **B) Accept the heal-green tone** for the MP number — it still reads as "restoration."

**Default to A.** Run:

```bash
grep -n "sac-tone-heal\|sac-tone-damage\|sac-tone-" public/game.css | head
```

Add a `.sac-tone-rest { color: #4FC3F7; }` rule next to the existing tones. Change `resultTone` case to `case 'rest': return 'rest';`.

- [ ] **Step 5: Syntax check**

Run: `node --check public/js/ui/attack-card.js && echo OK`
Expected: `OK`

- [ ] **Step 6: Commit**

```bash
git add public/js/ui/attack-card.js public/game.css
git commit -m "feat(ui): attack-card renders rest as '+N MP' with cyan MP tone

- resultTone returns 'rest' for category='rest' attacks
- formatResultValue shows '+N MP' for rest
- sac-tone-rest CSS rule uses MP cyan (#4FC3F7)
- effectiveness text already suppressed for non-damage/drain categories"
```

---

## Task 14: Client — verify `actionIconPath` falls back for Rest

**Files:**
- Verify: `public/js/ui/attack-card.js` function `actionIconPath` (line 87)

- [ ] **Step 1: Confirm existing fallback**

Read `actionIconPath`:

```js
function actionIconPath(nameEn) {
  if (!nameEn) return '';
  const slug = nameEn.split(';')[0].trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
  return slug ? `/assets/sprites/actions/${slug}.webp?v=20260322` : '';
}
```

For `nameEn = 'rest'`, slug = `'rest'`, path = `/assets/sprites/actions/rest.webp?v=20260322`. If the sprite doesn't exist yet, the `onerror` handler in `moveIconHtml` hides the broken image:

```js
const moveIconHtml = moveIcon
  ? `<img class="sac-sprite" src="${moveIcon}" alt="" onerror="this.style.display='none'">`
  : '';
```

Result: if `rest.webp` is missing, the card just shows no move icon — the text `休む` still renders correctly. Acceptable. No change needed.

- [ ] **Step 2: No commit needed** — proceed.

---

## Task 15: Integration test — full turn via `/api/game/creature-combat-cycle`

**Files:**
- Modify: `tests/integration/flows/combat.test.js` (append — confirm path first)

- [ ] **Step 1: Locate the integration test file**

Run: `ls tests/integration/flows/ | grep combat`
Expected: `combat.test.js` or similar. If different, use that path.

- [ ] **Step 2: Read existing tests for setup pattern**

Run: `head -80 tests/integration/flows/combat.test.js`
Note: how auth/session is set up, how combat is started, how requests are made.

- [ ] **Step 3: Append the integration test**

```js
test('rest action: moveChoices with action=rest restores 20% MP and emits rest attack', async () => {
  // --- Setup ---
  // Follow the file's existing pattern for auth, starting a run, entering combat.
  // Use the existing helper(s) in this test file. Example placeholders:
  const { session, gameManager } = await startTestCombat({
    allies: [
      { id: 'a0', mp: 0, maxMp: 100 /* plus minimum required fields */ }
    ],
    enemies: [
      { id: 'e0', hp: 100, maxHp: 100 }
    ]
  });

  // --- Act ---
  const res = await session
    .post('/api/game/creature-combat-cycle')
    .send({ actionType: 'attack', moveChoices: [{ creatureIndex: 0, action: 'rest' }] });

  // --- Assert ---
  assert.equal(res.status, 200);
  assert.equal(res.body.error, undefined);

  const restAttack = res.body.attacks.find(a => a.category === 'rest');
  assert.ok(restAttack, 'response should include a rest attack');
  assert.equal(restAttack.mpGained, 20);
  assert.equal(restAttack.isRest, true);

  // State shows creature MP restored
  const creature = res.body.state.run?.creatureParty?.active?.[0]
    ?? res.body.state.combat?.allies?.[0];
  assert.equal(creature.mp, 20);
});
```

**Note:** The exact session/helper API depends on the existing test file. Adapt `startTestCombat` to match whatever helper the file already exports or uses. If no helper exists and the pattern is inline fetch-driven, follow that pattern instead.

- [ ] **Step 4: Run the test**

Run: `npm run test:integration -- --test-name-pattern "rest action:"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add tests/integration/flows/combat.test.js
git commit -m "test(combat): integration test for action=rest through /creature-combat-cycle"
```

---

## Task 16: Dictionary entry for 休む — **GATED ON USER APPROVAL**

> **CRITICAL:** `data/live-dictionary.json` MUST NOT be modified without explicit user confirmation (per CLAUDE.md). Do not run this task autonomously.

**Files:**
- Modify: `data/live-dictionary.json`

- [ ] **Step 1: Check if 休む is already present**

Run: `grep -o '"休む":{[^}]*}' data/live-dictionary.json | head -1`

- If it returns a result, proceed to Step 2 (verify correctness).
- If it returns nothing, STOP and ask the user: "休む is not in `data/live-dictionary.json`. I propose adding this entry — please approve:"

```json
"休む":{"reading":"やすむ","definitions":[{"en":"to rest / to take a break","primary":true},{"en":"to be absent / to take time off"},{"en":"to go to bed / to sleep"}]}
"やすむ":{"reading":"やすむ","definitions":[{"en":"to rest / to take a break","primary":true},{"en":"to be absent / to take time off"},{"en":"to go to bed / to sleep"}]}
```

Wait for explicit approval before editing the file.

- [ ] **Step 2: Add the entries (only after user approval)**

If approved, add both keys (`休む` and `やすむ`) matching the file's existing format. Both keys must exist (JP-to-EN and hiragana-to-EN lookups) as confirmed by other entries in the file (e.g. `読む` and `よむ` both present).

- [ ] **Step 3: Validate dictionary consistency**

Run: `npm test` (to catch any dict-dependent test breakage)
Expected: PASS.

- [ ] **Step 4: Commit (only if entry was added)**

```bash
git add data/live-dictionary.json
git commit -m "data(dict): add 休む / やすむ — 'to rest' — for Rest combat action"
```

---

## Task 17: Sprite asset — `/assets/sprites/actions/rest.webp`

**Files:**
- Create: `public/assets/sprites/actions/rest.webp`

> This is a generative-asset task. The plan-executor agent cannot create PNG/WebP assets directly.

- [ ] **Step 1: Surface the asset need to the user**

Report to the user:

> "Rest action needs a sprite at `public/assets/sprites/actions/rest.webp`. Without it, the attack card shows no icon (fallback `onerror` hides it). To generate one: run the sprite quality pipeline or forge flow with a prompt describing a resting/sleeping creature icon in the same style as other action sprites."

Until the sprite is created, Rest functions correctly without it — the card just has no move icon. **Do not block implementation on this asset.**

- [ ] **Step 2: When the sprite is added, bump `SPRITE_VERSION` in `public/js/ui/sprite-utils.js`** (per CLAUDE.md rule).

---

## Task 18: Manual Playwright verification

**Files:** no code changes

- [ ] **Step 1: Confirm with user before launching Playwright** (per CLAUDE.md — never launch without asking)

- [ ] **Step 2: After approval — start dev server**

Run: `npm run dev` (in background)
Wait 5s, then verify: `curl -s -o /dev/null -w "%{http_code}" http://localhost:5173` → `200`

- [ ] **Step 3: Using Playwright MCP, capture 4 screenshots**

Navigate to a combat state and capture:

1. **Move grid with Rest cell** — screenshot `/tmp/rest-grid.png`. Verify the 4th cell shows `休む` with furigana `やすむ` and a `0 MP | +20% MP` pill.
2. **Rest card animation** — click Rest; screenshot the attack card mid-flow `/tmp/rest-card.png`. Verify `+N MP` appears in cyan in the number slot.
3. **"Not enough MP!" popup** — click an unaffordable move on a dry creature; screenshot `/tmp/not-enough-mp.png`. Verify the popup reads "Not enough MP!" in cyan, anchored at the move cell.
4. **"Fully rested!" popup** — use items / win a battle to restore MP to full, click Rest; screenshot `/tmp/fully-rested.png`. Verify the popup appears and the turn is NOT consumed.

- [ ] **Step 4: Delete screenshots after showing them to the user**

Run: `rm /tmp/rest-grid.png /tmp/rest-card.png /tmp/not-enough-mp.png /tmp/fully-rested.png`

- [ ] **Step 5: No commit** — verification task.

---

## Task 19: PvP parity check

**Files:** no code changes expected — just verify.

- [ ] **Step 1: Read `public/js/ui/pvp-battle.js` to find the move-select dispatch path**

Run: `grep -n "showMoves\|onMoveSelect" public/js/ui/pvp-battle.js`
Confirm that PvP uses the same `showMoves` call from `move-select.js`. Since Rest is appended inside `showMoves`, PvP gets the Rest cell automatically. The server-side handling must also apply — verify which server handler PvP hits.

- [ ] **Step 2: If PvP uses a different combat endpoint**, extend that endpoint's move processing to handle `action: 'rest'` entries in the same way. If PvP reuses `processMoveTurn`, nothing more is needed.

Run: `grep -rn "processMoveTurn\|pvp.*combat" src/ | head -10`

- [ ] **Step 3: Commit any PvP changes**

```bash
git add <relevant pvp files>
git commit -m "feat(pvp): handle action='rest' in PvP combat cycle"
```

If no PvP changes are needed, note this in the PR description under "PvE/PvP parity verified."

---

## Task 20: Run full test suite and commit if green

**Files:** none

- [ ] **Step 1: Run all tests**

Run: `npm test`
Expected: all Tier 1 + 2 tests pass. Coverage floor should hold or rise.

- [ ] **Step 2: If any unrelated test fails**, STOP and investigate. Do not merge on red. The Rest change should not affect unrelated systems; any failure is a signal of unintended coupling.

- [ ] **Step 3: Summarize diff**

Run: `git log --oneline master..HEAD`
Expected: ~10-15 commits, each scoped to a single task.

---

## Spec → Plan Coverage Check

| Spec Section | Task(s) |
|---|---|
| §1 Pseudo-move constant | Task 1 |
| §2 Grid layout (4th cell) | Task 11 |
| §3 Turn behavior (20% MP, skip attack, full enemy damage) | Tasks 3, 4, 5 |
| §4 Full-MP interaction ("Fully rested!") | Tasks 9, 11 |
| §5 Client → Server contract (`action: 'rest'`) | Tasks 3, 12, 15 |
| §6 Attack-card parity | Tasks 3, 13, 14 |
| §7 "Not Enough MP!" popup | Tasks 9, 11 |
| §8 i18n | Task 10 (skipped — matches project convention) |
| §9 Dictionary entry | Task 16 (gated) |
| Sprite asset | Task 17 (user-facing) |
| Testing — unit | Tasks 2, 4, 5, 6, 7 |
| Testing — integration | Task 15 |
| Testing — manual/Playwright | Task 18 |
| PvE/PvP parity | Task 19 |

## Risks & gotchas for the implementer

1. **REST_MOVE import path:** Task 11 Step 1 has a branch — if `public/js/ui/` cannot import from `src/`, create a client-side copy. Do not skip the verification.
2. **Dynamic vs static import of event-popup in move-select.js:** Task 11 Step 2 describes both patterns. Match whatever the file already uses.
3. **Dictionary edit gate:** Task 16 is the only task that requires explicit user approval. Do not run autonomously.
4. **Sprite asset:** Task 17 is non-blocking. Rest works without it; the icon just doesn't render.
5. **PvP parity:** Task 19 is a verification task, not a guaranteed code-change task. Check first, extend only if needed.
6. **Test file structure:** Tasks 2-7 append to `tests/unit/combat/creature-combat-service.test.js`. Match the file's existing test framework (node:test, describe/test/assert). Read the file first.
