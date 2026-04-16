# First Run Tutorial Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a gacha-style Cid-guided tutorial that walks new players through their first run and first hub return (steps 0–7), teaching skills → combat → befriend → items → death → chests → crests → party formation.

**Architecture:** A `meta.tutorialStep` (0–7) state machine drives everything. A new `tutorial-service.js` provides pure functions. Existing services (`exploration-service`, `creature-combat-service`, `crest-service`) check tutorial state at key decision points and apply overrides. Client reads `tutorialStep` from game state and shows Cid narrations via the existing narration box.

**Tech Stack:** Node.js, Express, ES modules, `node:test` for testing, vanilla JS frontend

**Spec:** `docs/superpowers/specs/2026-04-07-first-run-tutorial-design.md`

---

## Chunk 1: Data Model & Tutorial Service

### Task 1: Add tutorial fields to meta state

**Files:**
- Modify: `src/game/state.js:39-90` (createMetaProgression)
- Modify: `src/game/loop.js:291-301` (getState meta whitelist)
- Modify: `src/game/manager-registry.js:29-90` (migration)
- Test: `tests/unit/game/tutorial-service.test.js` (new)

- [ ] **Step 1: Write failing test for tutorial fields in meta**

```js
// tests/unit/game/tutorial-service.test.js
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createMetaProgression } from '../../../src/game/state.js';

describe('tutorial state', () => {
  it('new meta has tutorialStep 0 and tutorialFireDropsGifted false', () => {
    const meta = createMetaProgression();
    assert.equal(meta.tutorialStep, 0);
    assert.equal(meta.tutorialFireDropsGifted, false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/unit/game/tutorial-service.test.js`
Expected: FAIL — `meta.tutorialStep` is `undefined`

- [ ] **Step 3: Add fields to createMetaProgression**

In `src/game/state.js`, inside `createMetaProgression()` return object, add before the closing brace (after `equippedCrests`):

```js
    // Tutorial state (first-run guided experience)
    tutorialStep: 0,
    tutorialFireDropsGifted: false
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/unit/game/tutorial-service.test.js`
Expected: PASS

- [ ] **Step 5: Add tutorialStep to getState() meta whitelist**

In `src/game/loop.js`, inside the `meta:` block in `getState()` (around line 298, after `pvpTeams`), add:

```js
      tutorialStep: this.meta.tutorialStep ?? 7,
```

Use `?? 7` so legacy saves without the field default to "tutorial complete."

- [ ] **Step 6: Add migration for existing saves**

In `src/game/manager-registry.js`, after the `equippedCrests` migration block (around line 73), add:

```js
          // Migrate: add tutorial fields for existing accounts
          if (data.meta.tutorialStep === undefined) {
            // Existing players skip the tutorial
            data.meta.tutorialStep = 7;
            data.meta.tutorialFireDropsGifted = false;
            needsSave = true;
          }
```

- [ ] **Step 7: Write migration test**

Add to `tests/unit/game/tutorial-service.test.js`:

```js
describe('tutorial migration', () => {
  it('existing saves without tutorialStep get 7 (skip tutorial)', async () => {
    // This is validated by the migration code in manager-registry.js
    // A meta object from an old save won't have tutorialStep
    const oldMeta = { prologueComplete: true, lifetimeStats: { totalRuns: 5 } };
    // After migration logic:
    if (oldMeta.tutorialStep === undefined) {
      oldMeta.tutorialStep = 7;
      oldMeta.tutorialFireDropsGifted = false;
    }
    assert.equal(oldMeta.tutorialStep, 7);
    assert.equal(oldMeta.tutorialFireDropsGifted, false);
  });
});
```

- [ ] **Step 8: Run all tests**

Run: `node --test tests/unit/game/tutorial-service.test.js`
Expected: All PASS

- [ ] **Step 9: Syntax check modified files**

Run: `node --check src/game/state.js && node --check src/game/loop.js && node --check src/game/manager-registry.js && echo "OK"`
Expected: OK

- [ ] **Step 10: Commit**

```bash
git add src/game/state.js src/game/loop.js src/game/manager-registry.js tests/unit/game/tutorial-service.test.js
git commit -m "feat(tutorial): add tutorialStep to meta state with migration"
```

---

### Task 2: Create tutorial-service.js with narration data and step logic

**Files:**
- Create: `src/game/services/tutorial-service.js`
- Test: `tests/unit/game/tutorial-service.test.js` (append)

- [ ] **Step 1: Write failing tests for tutorial-service functions**

Append to `tests/unit/game/tutorial-service.test.js`:

```js
import {
  getTutorialStep,
  advanceTutorial,
  isTutorialActive,
  getTutorialNarration,
  shouldOverrideSkillOffers,
  shouldProtectBefriend,
  shouldFixRoomSequence,
  shouldGiftFireDrops,
  shouldHardcodeCrestReward,
  TUTORIAL_STEPS
} from '../../../src/game/services/tutorial-service.js';

describe('tutorial-service', () => {
  describe('getTutorialStep', () => {
    it('returns tutorialStep from meta', () => {
      assert.equal(getTutorialStep({ tutorialStep: 3 }), 3);
    });
    it('returns 7 if missing', () => {
      assert.equal(getTutorialStep({}), 7);
    });
  });

  describe('advanceTutorial', () => {
    it('increments tutorialStep by 1', () => {
      const meta = { tutorialStep: 0 };
      assert.equal(advanceTutorial(meta), 1);
      assert.equal(meta.tutorialStep, 1);
    });
    it('does not go past 7', () => {
      const meta = { tutorialStep: 7 };
      assert.equal(advanceTutorial(meta), 7);
    });
  });

  describe('isTutorialActive', () => {
    it('true when step < 7', () => {
      assert.equal(isTutorialActive({ tutorialStep: 0 }), true);
      assert.equal(isTutorialActive({ tutorialStep: 6 }), true);
    });
    it('false when step >= 7', () => {
      assert.equal(isTutorialActive({ tutorialStep: 7 }), false);
    });
  });

  describe('getTutorialNarration', () => {
    it('returns array of strings for each step', () => {
      for (let i = 0; i <= 6; i++) {
        const narration = getTutorialNarration(i);
        assert.ok(Array.isArray(narration), `step ${i} should return array`);
        assert.ok(narration.length > 0, `step ${i} should have narration`);
        assert.ok(narration.every(s => typeof s === 'string'), `step ${i} pages should be strings`);
      }
    });
    it('returns empty array for step 7', () => {
      assert.deepEqual(getTutorialNarration(7), []);
    });
  });

  describe('condition helpers', () => {
    it('shouldOverrideSkillOffers at step 0 only', () => {
      assert.equal(shouldOverrideSkillOffers({ tutorialStep: 0 }), true);
      assert.equal(shouldOverrideSkillOffers({ tutorialStep: 1 }), false);
    });
    it('shouldProtectBefriend at step 1 only', () => {
      assert.equal(shouldProtectBefriend({ tutorialStep: 1 }), true);
      assert.equal(shouldProtectBefriend({ tutorialStep: 2 }), false);
    });
    it('shouldFixRoomSequence when step < 3', () => {
      assert.equal(shouldFixRoomSequence({ tutorialStep: 0 }), true);
      assert.equal(shouldFixRoomSequence({ tutorialStep: 2 }), true);
      assert.equal(shouldFixRoomSequence({ tutorialStep: 3 }), false);
    });
    it('shouldGiftFireDrops at step 3 when not yet gifted', () => {
      assert.equal(shouldGiftFireDrops({ tutorialStep: 3, tutorialFireDropsGifted: false }), true);
      assert.equal(shouldGiftFireDrops({ tutorialStep: 3, tutorialFireDropsGifted: true }), false);
      assert.equal(shouldGiftFireDrops({ tutorialStep: 4, tutorialFireDropsGifted: false }), false);
    });
    it('shouldHardcodeCrestReward at step 4 only', () => {
      assert.equal(shouldHardcodeCrestReward({ tutorialStep: 4 }), true);
      assert.equal(shouldHardcodeCrestReward({ tutorialStep: 5 }), false);
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/unit/game/tutorial-service.test.js`
Expected: FAIL — module not found

- [ ] **Step 3: Create tutorial-service.js**

```js
// src/game/services/tutorial-service.js
/**
 * @fileoverview Tutorial state machine for the first-run guided experience.
 * Pure functions — no side effects, no imports beyond constants.
 */

export const TUTORIAL_STEPS = {
  SKILL_SELECTION: 0,
  BEFRIEND: 1,
  ITEM_SHOP: 2,
  DEATH_HUB: 3,
  CHEST_OPEN: 4,
  CREST_EQUIP: 5,
  CREATURE_FORMATION: 6,
  COMPLETE: 7
};

const NARRATIONS = {
  [TUTORIAL_STEPS.SKILL_SELECTION]: [
    'Each run you can get skills to make your party stronger.',
    "Let's just pick the first one."
  ],
  [TUTORIAL_STEPS.BEFRIEND]: [
    'Wow! This creature wants to talk!',
    "Let's try to befriend them."
  ],
  [TUTORIAL_STEPS.ITEM_SHOP]: [
    "Here you'll be offered items to power up. Choose wisely!"
  ],
  [TUTORIAL_STEPS.DEATH_HUB]: [
    'That was tough huh?',
    "Don't worry, no one gets past the Starting Meadow on their first try.",
    'We need to get stronger.',
    'Here, let me show you how. Click Chests!'
  ],
  [TUTORIAL_STEPS.CHEST_OPEN]: [
    'Every run you can use your resources to get stronger.',
    "I'll give you 3 Fire Elements.",
    "Let's open that fire chest!"
  ],
  [TUTORIAL_STEPS.CREST_EQUIP]: [
    "Now let's equip that crest to power up!"
  ],
  // Step 6 narration is dynamic (creature count), handled by client
  [TUTORIAL_STEPS.CREATURE_FORMATION]: [],
  [TUTORIAL_STEPS.COMPLETE]: []
};

const BEFRIEND_WRONG_NARRATION = "No, I don't think that's it... try again.";

export function getTutorialStep(meta) {
  return meta?.tutorialStep ?? 7;
}

export function advanceTutorial(meta) {
  if (!meta || meta.tutorialStep >= TUTORIAL_STEPS.COMPLETE) return TUTORIAL_STEPS.COMPLETE;
  meta.tutorialStep += 1;
  return meta.tutorialStep;
}

export function isTutorialActive(meta) {
  return getTutorialStep(meta) < TUTORIAL_STEPS.COMPLETE;
}

export function getTutorialNarration(step) {
  return NARRATIONS[step] || [];
}

export function getBefriendWrongNarration() {
  return BEFRIEND_WRONG_NARRATION;
}

export function shouldOverrideSkillOffers(meta) {
  return getTutorialStep(meta) === TUTORIAL_STEPS.SKILL_SELECTION;
}

export function shouldProtectBefriend(meta) {
  return getTutorialStep(meta) === TUTORIAL_STEPS.BEFRIEND;
}

export function shouldFixRoomSequence(meta) {
  return getTutorialStep(meta) < TUTORIAL_STEPS.DEATH_HUB;
}

export function shouldGiftFireDrops(meta) {
  return getTutorialStep(meta) === TUTORIAL_STEPS.DEATH_HUB && !meta?.tutorialFireDropsGifted;
}

export function shouldHardcodeCrestReward(meta) {
  return getTutorialStep(meta) === TUTORIAL_STEPS.CHEST_OPEN;
}

/**
 * Gift 3 fire drops for the tutorial chest step.
 * Idempotent via tutorialFireDropsGifted flag.
 */
export function giftTutorialFireDrops(meta) {
  if (!shouldGiftFireDrops(meta)) return false;
  if (!meta.elementDrops) meta.elementDrops = { fire: 0, water: 0, earth: 0, wood: 0, metal: 0 };
  meta.elementDrops.fire += 3;
  meta.tutorialFireDropsGifted = true;
  return true;
}

/**
 * Get creature formation narration (dynamic based on creature count).
 */
export function getFormationNarration(creatureCount) {
  return [
    `Now you have ${creatureCount} creatures!`,
    'Each creature costs points.',
    "Select your best party and let's go back to the Starting Meadow!"
  ];
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/unit/game/tutorial-service.test.js`
Expected: All PASS

- [ ] **Step 5: Add test for giftTutorialFireDrops**

Append to the test file:

```js
  describe('giftTutorialFireDrops', () => {
    it('adds 3 fire drops and sets flag', () => {
      const meta = { tutorialStep: 3, tutorialFireDropsGifted: false, elementDrops: { fire: 0, water: 0, earth: 0, wood: 0, metal: 0 } };
      const result = giftTutorialFireDrops(meta);
      assert.equal(result, true);
      assert.equal(meta.elementDrops.fire, 3);
      assert.equal(meta.tutorialFireDropsGifted, true);
    });
    it('is idempotent — does not double-gift', () => {
      const meta = { tutorialStep: 3, tutorialFireDropsGifted: true, elementDrops: { fire: 3, water: 0, earth: 0, wood: 0, metal: 0 } };
      const result = giftTutorialFireDrops(meta);
      assert.equal(result, false);
      assert.equal(meta.elementDrops.fire, 3);
    });
  });

  describe('getFormationNarration', () => {
    it('includes creature count in first page', () => {
      const pages = getFormationNarration(2);
      assert.equal(pages.length, 3);
      assert.ok(pages[0].includes('2'));
    });
  });
```

Add `giftTutorialFireDrops, getFormationNarration` to the import at top.

- [ ] **Step 6: Run tests**

Run: `node --test tests/unit/game/tutorial-service.test.js`
Expected: All PASS

- [ ] **Step 7: Commit**

```bash
git add src/game/services/tutorial-service.js tests/unit/game/tutorial-service.test.js
git commit -m "feat(tutorial): create tutorial-service with step logic and narrations"
```

---

## Chunk 2: Server-Side Integration (Skills, Rooms, Befriend)

### Task 3: Override skill offers at tutorial step 0

**Files:**
- Modify: `src/game/services/exploration-service.js:583-682`
- Test: `tests/unit/game/tutorial-service.test.js` (append)

- [ ] **Step 1: Write failing test**

Append to `tests/unit/game/tutorial-service.test.js`:

```js
describe('tutorial skill override integration', () => {
  it('shouldOverrideSkillOffers returns true only at step 0', () => {
    assert.equal(shouldOverrideSkillOffers({ tutorialStep: 0 }), true);
    assert.equal(shouldOverrideSkillOffers({ tutorialStep: 1 }), false);
  });
});
```

(This test already exists from Task 2 — this step is a sanity check. The real integration is in exploration-service.)

- [ ] **Step 2: Modify getSkillMasterOffers() in exploration-service.js**

In `src/game/services/exploration-service.js`, add import at top:

```js
import { shouldOverrideSkillOffers, advanceTutorial } from './tutorial-service.js';
```

In `getSkillMasterOffers()` (around line 588), inside the `if (isInitialPick)` block, before `if (!Array.isArray(pick.offered))`, add:

```js
      // Tutorial step 0: offer only retaliationStrike
      if (shouldOverrideSkillOffers(this.gm.meta)) {
        pick.offered = ['retaliationStrike'];
        const offered = pick.offered.map(id => getPartySkillDisplay(id)).filter(Boolean);
        this.gm.emitState();
        return { offered };
      }
```

- [ ] **Step 3: Add tutorial advance in chooseSkillMasterOffer()**

In `chooseSkillMasterOffer()` (around line 635), inside the `if (isInitialPick)` block, after `pick.chosenId = skillId;` and before `this.gm.emitState();`, add:

```js
      // Tutorial step 0 → 1: advance after first skill pick
      if (shouldOverrideSkillOffers(this.gm.meta)) {
        advanceTutorial(this.gm.meta);
      }
```

- [ ] **Step 4: Syntax check**

Run: `node --check src/game/services/exploration-service.js && echo "OK"`
Expected: OK

- [ ] **Step 5: Run existing skill master tests**

Run: `node --test tests/unit/game/skill-master-service.test.js`
Expected: All PASS (no regression)

- [ ] **Step 6: Commit**

```bash
git add src/game/services/exploration-service.js
git commit -m "feat(tutorial): override skill offers to retaliationStrike at step 0"
```

---

### Task 4: Override room generation for tutorial runs

**Files:**
- Modify: `src/game/services/exploration-service.js:177-203` (enterArea)
- Modify: `src/game/rooms.js:184-226` (generateAreaRooms — add optional tutorialMode param)
- Test: `tests/unit/game/tutorial-service.test.js` (append)

- [ ] **Step 1: Write failing test for tutorial room sequence**

Append to `tests/unit/game/tutorial-service.test.js`:

```js
import { generateAreaRooms } from '../../../src/game/rooms.js';

describe('tutorial room generation', () => {
  it('tutorialMode forces room 0 to encounter and room 1 to friendlyNpc', () => {
    const rooms = generateAreaRooms('hajimari-no-hiroba', undefined, undefined, undefined, undefined, true);
    assert.equal(rooms[0].type, 'encounter');
    assert.equal(rooms[1].type, 'friendlyNpc');
    // Room 2+ can be anything
    assert.equal(rooms.length, 30);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/unit/game/tutorial-service.test.js`
Expected: FAIL — room[0].type is random

- [ ] **Step 3: Add tutorialMode parameter to generateAreaRooms**

In `src/game/rooms.js`, modify the function signature at line 196:

```js
export function generateAreaRooms(areaId, _roomCount, _lastSpecialType, _encountersOnly, _forceRoomType, tutorialMode = false) {
```

After the `for` loop that generates all rooms (after line 222, before the boss creature attachment), add:

```js
  // Tutorial override: force first 2 rooms for guaranteed befriend + item shop
  if (tutorialMode) {
    if (rooms[0]) rooms[0].type = ROOM_TYPES.encounter;
    if (rooms[1]) rooms[1].type = ROOM_TYPES.friendlyNpc;
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/unit/game/tutorial-service.test.js`
Expected: PASS

- [ ] **Step 5: Wire tutorialMode in enterArea()**

In `src/game/services/exploration-service.js`, add `shouldFixRoomSequence` to the existing tutorial-service import:

```js
import { shouldOverrideSkillOffers, advanceTutorial, shouldFixRoomSequence } from './tutorial-service.js';
```

In `enterArea()` (around line 193), change:

```js
    this.gm.run.rooms = generateAreaRooms(areaId);
```

to:

```js
    const tutorialMode = shouldFixRoomSequence(this.gm.meta);
    this.gm.run.rooms = generateAreaRooms(areaId, undefined, undefined, undefined, undefined, tutorialMode);
```

- [ ] **Step 6: Syntax check**

Run: `node --check src/game/rooms.js && node --check src/game/services/exploration-service.js && echo "OK"`
Expected: OK

- [ ] **Step 7: Run existing room tests**

Run: `node --test tests/unit/game/rooms-koto2.test.js`
Expected: All PASS (no regression — existing tests don't pass tutorialMode)

- [ ] **Step 8: Commit**

```bash
git add src/game/rooms.js src/game/services/exploration-service.js
git commit -m "feat(tutorial): force encounter+friendlyNpc in first 2 rooms for tutorial"
```

---

### Task 5: Protect befriend quiz during tutorial (no damage on wrong answer)

**Files:**
- Modify: `src/game/services/creature-combat-service.js:1050-1129` (processBefriendQuizAnswer)
- Modify: `src/game/loop.js:1667-1726` (handleBefriendQuizAnswer)
- Test: `tests/unit/game/tutorial-service.test.js` (append)

- [ ] **Step 1: Write failing test for tutorial-protected befriend**

Append to `tests/unit/game/tutorial-service.test.js`:

```js
import { processBefriendQuizAnswer } from '../../../src/game/services/creature-combat-service.js';

describe('tutorial befriend protection', () => {
  function makeQuizCombat() {
    return {
      befriendQuiz: {
        creatureId: 'test-creature',
        creatureName: 'TestCreature',
        targetIndex: 0,
        options: [
          { id: 'correct', name: 'TestCreature', correct: true },
          { id: 'wrong1', name: 'WrongA', correct: false },
          { id: 'wrong2', name: 'WrongB', correct: false }
        ]
      },
      enemies: [{ id: 'test-creature', hp: 1, maxHp: 10, element: 'fire', moves: [{ id: 'm1', name: 'Hit', nameEn: 'Hit', element: 'fire', power: 10 }] }],
      allies: [{ id: 'ally1', hp: 50, maxHp: 50, element: 'water' }]
    };
  }

  it('wrong answer with tutorialProtect keeps quiz alive and deals no damage', () => {
    const combat = makeQuizCombat();
    const party = { active: combat.allies, reserves: [] };
    const result = processBefriendQuizAnswer('wrong1', combat, party, { tutorialProtect: true });
    assert.equal(result.correct, false);
    assert.equal(result.tutorialRetry, true);
    // Quiz should NOT be cleared
    assert.ok(combat.befriendQuiz !== null, 'quiz should remain active');
    // Ally should take no damage
    assert.equal(combat.allies[0].hp, 50);
  });

  it('wrong answer without tutorialProtect clears quiz', () => {
    const combat = makeQuizCombat();
    const party = { active: combat.allies, reserves: [] };
    // NOTE: The existing wrong-answer path has a ReferenceError bug at line ~1115
    // where bare `allies` is used instead of `combat.allies`. This may throw.
    // If it does, fix the bug first: change `allies.indexOf(allyTarget)` to
    // `(combat.allies || []).indexOf(allyTarget)` in creature-combat-service.js
    try {
      const result = processBefriendQuizAnswer('wrong1', combat, party);
      assert.equal(result.correct, false);
      assert.equal(combat.befriendQuiz, null);
    } catch (e) {
      if (e instanceof ReferenceError && e.message.includes('allies')) {
        // Pre-existing bug — fix bare `allies` reference before continuing
        assert.fail('Fix pre-existing bug: bare `allies` var in processBefriendQuizAnswer wrong-answer path');
      }
      throw e;
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/unit/game/tutorial-service.test.js`
Expected: FAIL — `tutorialRetry` is undefined, quiz is cleared

- [ ] **Step 2.5: Fix pre-existing bug — bare `allies` reference**

In `src/game/services/creature-combat-service.js`, around line 1115 in the wrong-answer counter-attack block, find:

```js
      targetIndex: allies.indexOf(allyTarget),
```

Change to:

```js
      targetIndex: (combat.allies || []).indexOf(allyTarget),
```

This is a pre-existing `ReferenceError` bug where `allies` is undefined in that scope. Must be fixed before the tutorial changes.

- [ ] **Step 3: Add tutorialProtect option to processBefriendQuizAnswer**

In `src/game/services/creature-combat-service.js`, modify the function signature at line 1060:

Change:
```js
export function processBefriendQuizAnswer(answerId, combat, creatureParty) {
```
To:
```js
export function processBefriendQuizAnswer(answerId, combat, creatureParty, options = {}) {
```

In the wrong-answer path (around line 1102, after `const isCorrect = answerId === correctOption?.id;` and inside the `if (!isCorrect)` block that starts the counter-attack logic), add at the very beginning of the wrong-answer section (before `const aliveAllies`):

```js
  // Tutorial protection: wrong answer = no damage, keep quiz alive
  if (options.tutorialProtect) {
    return { correct: false, tutorialRetry: true };
  }
```

This goes right after the `if (isCorrect) { ... }` block ends and before the existing wrong-answer counter-attack code. The key is that `combat.befriendQuiz` is NOT set to `null` and no damage is dealt.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/unit/game/tutorial-service.test.js`
Expected: PASS

- [ ] **Step 5: Wire tutorial protection in loop.js handleBefriendQuizAnswer**

In `src/game/loop.js`, add import:

```js
import { shouldProtectBefriend, advanceTutorial as advanceTutorialStep } from './services/tutorial-service.js';
```

In `handleBefriendQuizAnswer()` (line 1672), change:

```js
    const result = processBefriendQuizAnswer(answerId, this.combat, this.run.creatureParty);
```

to:

```js
    const tutorialProtect = shouldProtectBefriend(this.meta);
    const result = processBefriendQuizAnswer(answerId, this.combat, this.run.creatureParty, { tutorialProtect });
```

Also, in the success path (after `result.correct && result.allEnemiesDefeated` block, around line 1674), add tutorial advance:

```js
    if (result.correct && shouldProtectBefriend(this.meta)) {
      advanceTutorialStep(this.meta);
    }
```

Place this before the existing `if (result.correct && result.allEnemiesDefeated)` block.

- [ ] **Step 6: Syntax check**

Run: `node --check src/game/services/creature-combat-service.js && node --check src/game/loop.js && echo "OK"`
Expected: OK

- [ ] **Step 7: Commit**

```bash
git add src/game/services/creature-combat-service.js src/game/loop.js
git commit -m "feat(tutorial): protect befriend quiz from failure at step 1"
```

---

### Task 6: Advance tutorial on item shop visit and on death

**Files:**
- Modify: `src/game/loop.js` (defeat handling and friendly NPC completion)

- [ ] **Step 1: Add tutorial advance on friendly NPC room completion**

In `src/game/loop.js`, find where `friendlyNpc` room is marked as completed/interacted. Search for where `room.friendlyNpc.completed = true` is set. Add after it:

```js
    // Tutorial step 2 → 3: advance after visiting item shop
    if (getTutorialStep(this.meta) === 2) {
      advanceTutorialStep(this.meta);
    }
```

Note: Import `getTutorialStep` alongside the existing tutorial imports if not already imported.

Actually, based on the spec, step 2→3 advances on **death**, not on room completion. The step 2 narration fires when the friendlyNpc room is entered. The advance to step 3 happens when the run ends via defeat.

- [ ] **Step 2: Add centralized tutorial defeat handler**

There are multiple places in `loop.js` where `this.run.active = false` signals defeat (lines ~1066, ~1175, ~1338, ~1461, ~1726). Rather than patching each one, add a private method to GameManager:

```js
  _onRunDefeat() {
    // Tutorial: advance to step 3 (death → hub) and gift fire drops
    if (getTutorialStep(this.meta) === 2) {
      advanceTutorialStep(this.meta);
      giftTutorialFireDrops(this.meta);
    }
  }
```

Add imports for `giftTutorialFireDrops, getTutorialStep` to the existing tutorial import.

Then search for every occurrence of `this.run.active = false` in loop.js and add `this._onRunDefeat();` immediately after each one. There are multiple defeat paths:

1. After enemy turn all-allies-KO (~line 1066)
2. After befriend quiz wrong answer all-allies-KO (~line 1726 in `handleBefriendQuizAnswer`)
3. Any other `this.run.active = false` in combat resolution

Search with: `grep -n 'this.run.active = false' src/game/loop.js` to find all locations.

- [ ] **Step 3: Syntax check**

Run: `node --check src/game/loop.js && echo "OK"`
Expected: OK

- [ ] **Step 4: Commit**

```bash
git add src/game/loop.js
git commit -m "feat(tutorial): advance to step 3 on defeat, gift fire drops"
```

---

## Chunk 3: Tutorial Route & Crest Override

### Task 7: Create tutorial route for hub-side step advances

**Files:**
- Create: `src/routes/game/tutorial.js`
- Modify: `src/routes/game/index.js` (mount route)
- Test: `tests/unit/game/tutorial-service.test.js` (append)

- [ ] **Step 1: Create tutorial route file**

```js
// src/routes/game/tutorial.js
import { Router } from 'express';
import { getTutorialStep, advanceTutorial, TUTORIAL_STEPS } from '../../game/services/tutorial-service.js';

export default function createTutorialRoutes() {
  const router = Router();

  /**
   * POST /tutorial-advance
   * Advance tutorial step from client (hub-side steps 3-6).
   * Body: { expectedStep: number }
   * Validates current step matches expected to prevent race conditions.
   */
  router.post('/tutorial-advance', (req, res) => {
    const { expectedStep } = req.body;
    const meta = req.gameManager.getMeta();
    const currentStep = getTutorialStep(meta);

    if (typeof expectedStep !== 'number' || expectedStep !== currentStep) {
      return res.status(400).json({
        error: 'Tutorial step mismatch',
        currentStep
      });
    }

    // Only allow client-driven advances for hub steps (3-6)
    if (currentStep < TUTORIAL_STEPS.DEATH_HUB || currentStep > TUTORIAL_STEPS.CREATURE_FORMATION) {
      return res.status(400).json({
        error: 'Cannot advance tutorial at this step from client',
        currentStep
      });
    }

    const newStep = advanceTutorial(meta);
    req.saveGame();
    res.json({ tutorialStep: newStep, state: req.getEnrichedGameState() });
  });

  /**
   * GET /tutorial-state
   * Get current tutorial step (convenience endpoint).
   */
  router.get('/tutorial-state', (req, res) => {
    const meta = req.gameManager.getMeta();
    res.json({ tutorialStep: getTutorialStep(meta) });
  });

  return router;
}
```

- [ ] **Step 2: Mount route in game index**

In `src/routes/game/index.js`, add import:

```js
import createTutorialRoutes from './tutorial.js';
```

After the crest routes mount (around line 106), add:

```js
  // Mount tutorial routes
  router.use(createTutorialRoutes());
```

- [ ] **Step 3: Syntax check**

Run: `node --check src/routes/game/tutorial.js && node --check src/routes/game/index.js && echo "OK"`
Expected: OK

- [ ] **Step 4: Commit**

```bash
git add src/routes/game/tutorial.js src/routes/game/index.js
git commit -m "feat(tutorial): add tutorial-advance route for hub-side steps"
```

---

### Task 8: Hardcode common fire crest reward at tutorial step 4

**Files:**
- Modify: `src/game/services/crest-service.js:65-78` (openChest)
- Test: `tests/unit/game/tutorial-service.test.js` (append)

- [ ] **Step 1: Write failing test**

Append to `tests/unit/game/tutorial-service.test.js`:

```js
import { openChest } from '../../../src/game/services/crest-service.js';

describe('tutorial chest override', () => {
  it('openChest returns common fire crest when tutorialStep is 4', () => {
    const meta = {
      tutorialStep: 4,
      elementDrops: { fire: 3, water: 0, earth: 0, wood: 0, metal: 0 },
      crests: []
    };
    const result = openChest(meta, 'fire');
    assert.equal(result.success, true);
    assert.equal(result.crest.element, 'fire');
    assert.equal(result.crest.rarity, 'common');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/unit/game/tutorial-service.test.js`
Expected: FAIL — rarity is random, not guaranteed `common`

- [ ] **Step 3: Add tutorial override to openChest**

In `src/game/services/crest-service.js`, add import:

```js
import { shouldHardcodeCrestReward } from './tutorial-service.js';
```

In `openChest()` (line 74), change:

```js
  const crest = generateCrest(element);
```

to:

```js
  let crest;
  if (shouldHardcodeCrestReward(meta)) {
    // Tutorial step 4: guaranteed common fire crest
    crest = generateCrest(element);
    crest.rarity = 'common';
    const range = RARITY_RANGES.common;
    crest.value = Math.round((range.min + Math.random() * (range.max - range.min)) * 100) / 100;
  } else {
    crest = generateCrest(element);
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/unit/game/tutorial-service.test.js`
Expected: PASS

- [ ] **Step 5: Run existing crest tests for regression**

Run: `node --test tests/unit/game/crest-service.test.js`
Expected: All PASS

- [ ] **Step 6: Syntax check**

Run: `node --check src/game/services/crest-service.js && echo "OK"`
Expected: OK

- [ ] **Step 7: Commit**

```bash
git add src/game/services/crest-service.js
git commit -m "feat(tutorial): hardcode common fire crest at tutorial step 4"
```

---

## Chunk 4: Client-Side Tutorial UI

### Task 9: Add tutorial CSS

**Files:**
- Modify: `public/game.css`

- [ ] **Step 1: Add tutorial-highlight pulse animation**

Append to `public/game.css`:

```css
/* Tutorial highlight — pulsing glow on target buttons */
.tutorial-highlight {
  animation: tutorial-pulse 1.5s ease-in-out infinite;
  position: relative;
  z-index: 10;
}

@keyframes tutorial-pulse {
  0%, 100% { box-shadow: 0 0 8px 2px rgba(255, 215, 0, 0.4); }
  50% { box-shadow: 0 0 20px 6px rgba(255, 215, 0, 0.8); }
}

/* Dim non-highlighted elements during tutorial */
.tutorial-dimmed {
  opacity: 0.3;
  pointer-events: none;
}
```

- [ ] **Step 2: Syntax check (CSS doesn't have node --check, so visual verify later)**

- [ ] **Step 3: Commit**

```bash
git add public/game.css
git commit -m "feat(tutorial): add tutorial-highlight and tutorial-dimmed CSS"
```

---

### Task 10: Client tutorial rendering in exploration.js (run phases: steps 0-2)

**Files:**
- Modify: `public/js/ui/exploration.js`

- [ ] **Step 1: Add tutorial narration helper**

Near the top of `public/js/ui/exploration.js` (after the imports), add a helper that shows multi-page Cid narration sequentially:

```js
/** Show multi-page Cid tutorial narration. Returns when all pages dismissed. */
async function showTutorialNarration(pages) {
  for (const page of pages) {
    await sceneModule.showNarration(page, { speaker: 'Cid' });
  }
}
```

- [ ] **Step 2: Add tutorial narration before skill picker (step 0)**

Find where the skill master UI is rendered (search for `SKILL_MASTER` or `skillMaster` in exploration.js). Before the skill picker buttons are shown, add:

```js
  // Tutorial step 0: Cid explains skills
  const tutorialStep = getGameState().meta?.tutorialStep;
  if (tutorialStep === 0) {
    await showTutorialNarration([
      'Each run you can get skills to make your party stronger.',
      "Let's just pick the first one."
    ]);
  }
```

- [ ] **Step 3: Add tutorial narration before befriend quiz (step 1)**

Find where the befriend quiz UI is rendered in `combat-loop.js` (the quiz presentation). Before showing the quiz options, add:

```js
  // Tutorial step 1: Cid encourages befriending
  const tutorialStep = getGameState().meta?.tutorialStep;
  if (tutorialStep === 1) {
    await narration.showNarration('Wow! This creature wants to talk!', { speaker: 'Cid' });
    await narration.showNarration("Let's try to befriend them.", { speaker: 'Cid' });
  }
```

On wrong answer handling: the befriend quiz flow in `renderBefriendQuiz()` (combat-loop.js ~line 2840) needs to loop when `tutorialRetry` is returned. Find the section where the player's answer is submitted and wrap the Talk path in a `while` loop:

```js
  // Wrap the quiz answer submission in a loop for tutorial retry
  let quizDone = false;
  while (!quizDone) {
    // ... existing: show options, wait for player selection, submit answer
    const result = await submitBefriendAnswer(answerId);
    
    if (result.tutorialRetry) {
      await narration.showNarration("No, I don't think that's it... try again.", { speaker: 'Cid' });
      // Loop back to re-present the same quiz options
      continue;
    }
    quizDone = true;
    // ... existing: handle correct/incorrect result
  }
```

IMPORTANT: A bare `return` would exit `renderBefriendQuiz` entirely, abandoning the quiz. The `while` loop ensures the quiz options are re-presented after Cid's retry message. Study the exact structure of `renderBefriendQuiz` to find the right insertion point — the loop wraps the answer-submission section, not the entire function.

- [ ] **Step 4: Add tutorial narration before friendly NPC (step 2)**

Find where the friendly NPC room is rendered. Before showing item offers, add:

```js
  // Tutorial step 2: Cid explains items
  const tutorialStep = getGameState().meta?.tutorialStep;
  if (tutorialStep === 2) {
    await showTutorialNarration([
      "Here you'll be offered items to power up. Choose wisely!"
    ]);
  }
```

- [ ] **Step 5: Syntax check**

Run: `node --check public/js/ui/exploration.js && echo "OK"`
Expected: OK

- [ ] **Step 6: Commit**

```bash
git add public/js/ui/exploration.js public/js/ui/combat-loop.js
git commit -m "feat(tutorial): add Cid narrations for run-phase tutorial steps 0-2"
```

---

### Task 11: Client tutorial rendering for hub phases (steps 3-6)

**Files:**
- Modify: `public/js/ui/exploration.js` (renderHub)
- Modify: `public/js/ui/chests.js` (chest screen)
- Modify: `public/js/ui/crests-equip.js` (crest equip screen)

- [ ] **Step 1: Add tutorial flow to renderHub (step 3)**

In `renderHub()` in `exploration.js` (around line 337), after the hub renders, add:

```js
  // Tutorial step 3: Cid guides to chests after death
  const tutorialStep = gameState.meta?.tutorialStep;
  if (tutorialStep === 3) {
    await showTutorialNarration([
      'That was tough huh?',
      "Don't worry, no one gets past the Starting Meadow on their first try.",
      'We need to get stronger.',
      'Here, let me show you how. Click Chests!'
    ]);
    // Highlight the Chests button
    const buttons = document.querySelectorAll('.action-btn');
    buttons.forEach(btn => {
      if (btn.textContent.includes('Chests')) {
        btn.classList.add('tutorial-highlight');
      } else if (!btn.textContent.includes('Chests')) {
        btn.classList.add('tutorial-dimmed');
      }
    });
  }
```

- [ ] **Step 2: Add tutorial advance when Chests button is clicked (step 3→4)**

In `renderHub()`, wrap the Chests button's onClick to call `tutorial-advance` first:

```js
    { label: '🎁 Chests', onClick: async () => {
      const gs = getGameState();
      if (gs.meta?.tutorialStep === 3) {
        await fetch(apiUrl('/api/game/tutorial-advance'), {
          method: 'POST',
          headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
          body: JSON.stringify({ expectedStep: 3 })
        });
      }
      chestsUI.show();
    }},
```

- [ ] **Step 3: Add tutorial narration inside chests screen (step 4)**

In `public/js/ui/chests.js`, in `show()`, after the panel is rendered and appended to DOM, add:

```js
  // Tutorial step 4: Cid explains chests
  const tutorialStep = state.tutorialStep ?? 7;
  if (tutorialStep === 4) {
    // Note: need to get narration show function passed via callbacks
    if (callbacks.showNarration) {
      await callbacks.showNarration('Every run you can use your resources to get stronger.', { speaker: 'Cid' });
      await callbacks.showNarration("I'll give you 3 Fire Elements.", { speaker: 'Cid' });
      await callbacks.showNarration("Let's open that fire chest!", { speaker: 'Cid' });
    }
    // Highlight fire chest, dim others
    panel.querySelectorAll('.chest-card').forEach(card => {
      const btn = card.querySelector('.chest-open-btn');
      if (btn?.dataset.element === 'fire') {
        card.classList.add('tutorial-highlight');
      } else {
        card.classList.add('tutorial-dimmed');
      }
    });
  }
```

The `callbacks.showNarration` needs to be wired from `game.js` when initializing chests. Add `showNarration` to the chests init callbacks.

After chest is opened at step 4, call `tutorial-advance` with expectedStep 4 to move to step 5. Add in the chest open click handler, after the crest is received:

```js
        // Tutorial: advance step 4→5 after opening fire chest
        if (callbacks.getTutorialStep?.() === 4) {
          await fetch(callbacks.apiUrl('/api/game/tutorial-advance'), {
            method: 'POST',
            headers: { ...callbacks.getAuthHeaders(), 'Content-Type': 'application/json' },
            body: JSON.stringify({ expectedStep: 4 })
          });
        }
```

- [ ] **Step 4: Add tutorial flow to crests-equip screen (step 5)**

In `public/js/ui/crests-equip.js`, in `show()`, after panel is rendered, add:

```js
  // Tutorial step 5: Cid guides crest equip
  const tutorialStep = state.tutorialStep ?? 7;
  if (tutorialStep === 5 && callbacks.showNarration) {
    await callbacks.showNarration("Now let's equip that crest to power up!", { speaker: 'Cid' });
    // Highlight fire slot
    panel.querySelectorAll('.crest-slot').forEach(slot => {
      if (slot.dataset.element === 'fire') {
        slot.classList.add('tutorial-highlight');
      }
    });
  }
```

After crest is equipped at step 5, call `tutorial-advance` with expectedStep 5. The equip action is wired in `wireEvents()` via `wireInventoryClicks()` in `crests-equip.js`. Find where the equip POST to `/api/game/crests/equip` succeeds (the `.then()` or `await` after the fetch), and add:

```js
        // Tutorial: advance step 5→6 after equipping fire crest
        if (callbacks.getTutorialStep?.() === 5) {
          await fetch(callbacks.apiUrl('/api/game/tutorial-advance'), {
            method: 'POST',
            headers: { ...callbacks.getAuthHeaders(), 'Content-Type': 'application/json' },
            body: JSON.stringify({ expectedStep: 5 })
          });
        }
```

- [ ] **Step 5: Add tutorial flow for creature formation (step 6)**

After crest equip advances to step 6, the client should navigate back to hub and open the creature formation screen. In `renderHub()`, add:

```js
  if (tutorialStep === 6) {
    const creatureCount = Math.min((gameState.meta?.creatureCollection || []).length, 3);
    await showTutorialNarration([
      `Now you have ${creatureCount} creatures!`,
      'Each creature costs points.',
      "Select your best party and let's go back to the Starting Meadow!"
    ]);
    // Highlight the Infiltrate button — creature formation happens at run start.
    // The player selects creatures as part of the normal run-start flow.
    const buttons = document.querySelectorAll('.action-btn');
    buttons.forEach(btn => {
      if (btn.textContent.includes('潜入')) {
        btn.classList.add('tutorial-highlight');
      } else {
        btn.classList.add('tutorial-dimmed');
      }
    });
  }
```

After formation is confirmed: the creature selection happens in `showCollectionSelect()` in `public/game.js` (~line 879). When the player confirms their selection and the run starts via `apiStartRun()` (~line 851), add tutorial advance. In `startNewRun()` in `game.js`, after `apiStartRun` succeeds and `updateGameState` is called, add:

```js
    // Tutorial: advance step 6→7 (tutorial complete) after first formation
    if (gameState?.meta?.tutorialStep === 6) {
      await fetch(apiUrl('/api/game/tutorial-advance'), {
        method: 'POST',
        headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ expectedStep: 6 })
      });
    }
```

- [ ] **Step 6: Syntax check all modified client files**

Run: `node --check public/js/ui/exploration.js && node --check public/js/ui/chests.js && node --check public/js/ui/crests-equip.js && echo "OK"`
Expected: OK

- [ ] **Step 7: Commit**

```bash
git add public/js/ui/exploration.js public/js/ui/chests.js public/js/ui/crests-equip.js public/game.js
git commit -m "feat(tutorial): add Cid narrations and highlights for hub tutorial steps 3-6"
```

---

## Chunk 5: Callback Wiring, Integration Testing & Polish

### Task 12: Wire showNarration and tutorialStep into chests/crests callbacks

> **IMPORTANT:** This task MUST be done BEFORE Task 11 (client tutorial rendering for hub phases). Task 11's code in chests.js and crests-equip.js depends on `callbacks.showNarration` and `callbacks.getTutorialStep` being available.

**Files:**
- Modify: `public/game.js` (init callbacks for chests and crests)

- [ ] **Step 1: Add showNarration to chests init**

In `public/game.js`, find where `chestsUI.init()` is called. Add to its callback object:

```js
showNarration: (text, opts) => narrationBox.show(text, opts),
getTutorialStep: () => gameState?.meta?.tutorialStep ?? 7,
```

- [ ] **Step 2: Add showNarration to crests-equip init**

Find where `crestsEquipUI.init()` is called. Add similarly:

```js
showNarration: (text, opts) => narrationBox.show(text, opts),
getTutorialStep: () => gameState?.meta?.tutorialStep ?? 7,
```

- [ ] **Step 3: Ensure tutorialStep is included in crest state responses**

In `src/routes/game/crests.js`, the GET `/crests` endpoint returns `getCrestState(meta)`. Check if `getCrestState` includes `tutorialStep`. If not, modify the GET handler:

```js
  router.get('/crests', (req, res) => {
    const meta = req.gameManager.getMeta();
    const state = getCrestState(meta);
    state.tutorialStep = meta.tutorialStep ?? 7;
    res.json(state);
  });
```

- [ ] **Step 4: Syntax check**

Run: `node --check public/game.js && node --check src/routes/game/crests.js && echo "OK"`
Expected: OK

- [ ] **Step 5: Commit**

```bash
git add public/game.js src/routes/game/crests.js
git commit -m "feat(tutorial): wire narration and tutorialStep into chest/crest callbacks"
```

---

### Task 13: Run full test suite and fix regressions

- [ ] **Step 1: Run unit tests**

Run: `npm run test:unit`
Expected: All PASS

- [ ] **Step 2: Run integration tests**

Run: `npm run test:integration`
Expected: All PASS

- [ ] **Step 3: Fix any failures**

If tests fail, diagnose and fix. Common issues:
- Import paths for tutorial-service.js
- Missing mock data for `tutorialStep` in existing test fixtures
- processBefriendQuizAnswer signature change breaking existing callers

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "fix(tutorial): resolve test regressions from tutorial integration"
```

---

### Task 14: Manual playtest checklist

This task is not automated — use Playwright MCP to verify each step visually.

- [ ] **Step 1: Reset a test account** (set `tutorialStep: 0`, clear creature collection to just starter)
- [ ] **Step 2: Start new run** — verify Cid narration appears before skill picker, only `retaliationStrike` offered
- [ ] **Step 3: Win first combat** — verify befriend quiz triggers, Cid narration appears, wrong answer shows retry message with no damage
- [ ] **Step 4: Visit friendly NPC** — verify Cid narration appears before item offers
- [ ] **Step 5: Die and return to hub** — verify Cid narration (4 pages), Chests button pulses, other buttons dimmed
- [ ] **Step 6: Open fire chest** — verify Cid narration (3 pages), fire chest highlighted, reward is common fire crest
- [ ] **Step 7: Equip crest** — verify auto-navigate to crests, Cid narration, fire slot highlighted
- [ ] **Step 8: Creature formation** — verify Cid narration with correct creature count, player selects creatures
- [ ] **Step 9: Start run 2** — verify no tutorial narrations, normal gameplay
