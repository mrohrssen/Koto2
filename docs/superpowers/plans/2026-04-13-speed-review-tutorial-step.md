# Speed Review Tutorial Step Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace chest/crest tutorial steps with a condition-gated speed review tutorial, simplify death hub narration, and comment out deprecated element systems.

**Architecture:** Linear tutorial state machine in `tutorial-service.js` gets two steps removed (CHEST_OPEN, CREST_EQUIP) and one added (SPEED_REVIEW). Frontend `renderHub()` gains two new tutorial blocks (death hub narration at step 3, speed review at step 4). All changes are within existing patterns.

**Tech Stack:** Node.js, ES6 modules, node:test for testing

**Spec:** `docs/superpowers/specs/2026-04-13-speed-review-tutorial-step-design.md`

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `src/game/services/tutorial-service.js` | Modify | Renumber steps, update narrations, comment out deprecated helpers |
| `src/game/loop.js` | Modify | Comment out fire drops call in `_onRunDefeat` |
| `src/game/services/crest-service.js` | Modify | Comment out `shouldHardcodeCrestReward` import/usage |
| `src/routes/game/tutorial.js` | Modify | Update allowed client-advance range |
| `public/js/ui/exploration.js` | Modify | Add step 3 + step 4 tutorial blocks in `renderHub()`, renumber step 6→5 |
| `public/js/ui/chests.js` | Modify | Remove tutorial step 4 narration and advance blocks |
| `public/js/ui/crests-equip.js` | Modify | Remove tutorial step 5 narration block |
| `public/game.js` | Modify | Renumber step 6→5, update `?? 7` → `?? 6` |
| `tests/unit/game/tutorial-service.test.js` | Modify | Renumber, remove chest/crest tests, add speed review tests |

---

## Task 1: Update tutorial-service.js (backend state machine)

**Files:**
- Modify: `src/game/services/tutorial-service.js`
- Test: `tests/unit/game/tutorial-service.test.js`

- [ ] **Step 1: Update TUTORIAL_STEPS enum and narrations**

In `src/game/services/tutorial-service.js`, replace the entire `TUTORIAL_STEPS` and `NARRATIONS` block:

```js
export const TUTORIAL_STEPS = {
  SKILL_SELECTION: 0,
  BEFRIEND: 1,
  ITEM_SHOP: 2,
  DEATH_HUB: 3,
  SPEED_REVIEW: 4,
  CREATURE_FORMATION: 5,
  COMPLETE: 6
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
    "Don't worry, you'll get stronger each run!"
  ],
  [TUTORIAL_STEPS.SPEED_REVIEW]: [
    'Hey! It looks like you\'re starting to learn some Japanese.',
    'The Translator detected {dueCount} words for you to review.',
    'If you pass the review, you\'ll just see the Japanese for these words from now on.',
    'But don\'t worry, you can always click them to see the full translation.',
    'Keep exploring and watch your Japanese grow!'
  ],
  [TUTORIAL_STEPS.CREATURE_FORMATION]: [],
  [TUTORIAL_STEPS.COMPLETE]: []
};
```

- [ ] **Step 2: Update getTutorialStep default**

Change line 50 from `?? 7` to `?? 6`:

```js
export function getTutorialStep(meta) {
  return meta?.tutorialStep ?? 6;
}
```

- [ ] **Step 3: Update advanceTutorial cap**

Change the cap in `advanceTutorial` from `TUTORIAL_STEPS.COMPLETE` (which is now 6, no code change needed — it uses the constant). Verify the function still reads:

```js
export function advanceTutorial(meta) {
  if (!meta || meta.tutorialStep >= TUTORIAL_STEPS.COMPLETE) return TUTORIAL_STEPS.COMPLETE;
  meta.tutorialStep += 1;
  return meta.tutorialStep;
}
```

No change needed here — it already uses `TUTORIAL_STEPS.COMPLETE`.

- [ ] **Step 4: Comment out deprecated helpers**

Comment out `shouldGiftFireDrops`, `shouldHardcodeCrestReward`, and `giftTutorialFireDrops`. Keep them in the file for reference but inactive:

```js
// Deprecated: elements are no longer a thing
// export function shouldGiftFireDrops(meta) {
//   return getTutorialStep(meta) === TUTORIAL_STEPS.DEATH_HUB && !meta?.tutorialFireDropsGifted;
// }

// Deprecated: chest tutorial removed
// export function shouldHardcodeCrestReward(meta) {
//   return getTutorialStep(meta) === TUTORIAL_STEPS.CHEST_OPEN;
// }
```

```js
// Deprecated: elements are no longer a thing
// export function giftTutorialFireDrops(meta) {
//   if (!shouldGiftFireDrops(meta)) return false;
//   if (!meta.elementDrops) meta.elementDrops = { fire: 0, water: 0, earth: 0, wood: 0, metal: 0 };
//   meta.elementDrops.fire += 3;
//   meta.tutorialFireDropsGifted = true;
//   return true;
// }
```

- [ ] **Step 5: Run syntax check**

Run: `node --check src/game/services/tutorial-service.js && echo "OK"`
Expected: `OK`

- [ ] **Step 8: Update tests**

Rewrite `tests/unit/game/tutorial-service.test.js`. Key changes:
- Remove imports: `shouldGiftFireDrops`, `shouldHardcodeCrestReward`, `giftTutorialFireDrops`
- Change all `7` references to `6` (COMPLETE)
- Change `6` references in isTutorialActive to `5` (last active step)
- Remove `shouldGiftFireDrops` test block (lines 97-101)
- Remove `shouldHardcodeCrestReward` test block (lines 102-105)
- Remove `giftTutorialFireDrops` describe block (lines 108-122)
- Remove the `import { openChest }` at line 217 AND the entire `describe('tutorial chest override')` block at lines 219-250 (this is a separate top-level describe outside the main test block)

Update the migration test:
```js
it('existing saves without tutorialStep get migrated to 6', () => {
  const oldMeta = { prologueComplete: true, lifetimeStats: { totalRuns: 5 } };
  if (oldMeta.tutorialStep === undefined) {
    oldMeta.tutorialStep = 6;
    oldMeta.tutorialFireDropsGifted = false;
  }
  assert.equal(oldMeta.tutorialStep, 6);
});
```

Update `advanceTutorial` test:
```js
it('does not go past 6', () => {
  const meta = { tutorialStep: 6 };
  assert.equal(advanceTutorial(meta), 6);
});
```

Update `isTutorialActive` tests:
```js
it('true when step < 6', () => {
  assert.equal(isTutorialActive({ tutorialStep: 0 }), true);
  assert.equal(isTutorialActive({ tutorialStep: 5 }), true);
});
it('false when step >= 6', () => {
  assert.equal(isTutorialActive({ tutorialStep: 6 }), false);
});
```

Update `getTutorialNarration` loop to go `0..5`:
```js
it('returns array of strings for each step', () => {
  for (let i = 0; i <= 5; i++) {
    const narration = getTutorialNarration(i);
    assert.ok(Array.isArray(narration), `step ${i} should return array`);
    assert.ok(narration.every(s => typeof s === 'string'), `step ${i} pages should be strings`);
  }
});
it('returns empty array for step 6', () => {
  assert.deepEqual(getTutorialNarration(6), []);
});
```

Update `getTutorialStep` test:
```js
it('returns 6 if missing', () => {
  assert.equal(getTutorialStep({}), 6);
});
```

- [ ] **Step 9: Run tests**

Run: `npm test`
Expected: All pass

- [ ] **Step 10: Commit**

```bash
git add src/game/services/tutorial-service.js tests/unit/game/tutorial-service.test.js
git commit -m "refactor: renumber tutorial steps, remove chest/crest, add speed review narration"
```

---

## Task 2: Update backend callers (loop.js, crest-service.js, tutorial route)

**Files:**
- Modify: `src/game/loop.js:75,177-182`
- Modify: `src/game/services/crest-service.js:9,76-82`
- Modify: `src/routes/game/tutorial.js:16`

- [ ] **Step 1: Comment out fire drops in loop.js**

In `src/game/loop.js` line 75, remove `giftTutorialFireDrops` from the import:

```js
// Before:
import { shouldProtectBefriend, advanceTutorial as advanceTutorialStep, getTutorialStep, giftTutorialFireDrops } from './services/tutorial-service.js';

// After:
import { shouldProtectBefriend, advanceTutorial as advanceTutorialStep, getTutorialStep } from './services/tutorial-service.js';
```

In `_onRunDefeat()` (lines 177-183), comment out the fire drops call:

```js
_onRunDefeat() {
  // Tutorial: advance to step 3 (death → hub)
  if (getTutorialStep(this.meta) === 2) {
    advanceTutorialStep(this.meta);
    // giftTutorialFireDrops(this.meta); // Deprecated: elements are no longer a thing
  }
}
```

- [ ] **Step 2: Comment out shouldHardcodeCrestReward in crest-service.js**

In `src/game/services/crest-service.js` line 9, comment out the import:

```js
// import { shouldHardcodeCrestReward } from './tutorial-service.js'; // Deprecated: chest tutorial removed
```

In `openChest` (lines 75-84), remove the if/else and keep only the else branch. This is a structural change, not just commenting — the `} else {` and closing `}` must be removed:

```js
// Before (lines 75-84):
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

// After:
  const crest = generateCrest(element);
```

- [ ] **Step 3: Update tutorial route allowed range**

In `src/routes/game/tutorial.js` line 16, update the range to allow steps 3-5:

```js
// Before:
if (currentStep < TUTORIAL_STEPS.DEATH_HUB || currentStep > TUTORIAL_STEPS.CREATURE_FORMATION) {

// After:
if (currentStep < TUTORIAL_STEPS.DEATH_HUB || currentStep > TUTORIAL_STEPS.CREATURE_FORMATION) {
```

This uses the constant names, so with DEATH_HUB still at 3 and CREATURE_FORMATION now at 5, the range is already correct (3-5). **No code change needed** — the constants handle the renumbering. Verify by reading the line.

- [ ] **Step 4: Run syntax checks**

```bash
node --check src/game/loop.js && node --check src/game/services/crest-service.js && node --check src/routes/game/tutorial.js && echo "OK"
```
Expected: `OK`

- [ ] **Step 5: Run tests**

Run: `npm test`
Expected: All pass

- [ ] **Step 6: Commit**

```bash
git add src/game/loop.js src/game/services/crest-service.js src/routes/game/tutorial.js
git commit -m "refactor: comment out fire drops and crest tutorial override, update route range"
```

---

## Task 3: Update frontend — chests.js, crests-equip.js, game.js

**Files:**
- Modify: `public/js/ui/chests.js:46-54,130-138`
- Modify: `public/js/ui/crests-equip.js:50-53`
- Modify: `public/game.js:857-866,1831,1842`

- [ ] **Step 1: Remove tutorial blocks from chests.js**

In `public/js/ui/chests.js`, remove both tutorial blocks. **Work bottom-up** to avoid line number shifts — remove the advance block (lines 130-138) first, then the narration block (lines 46-54).

Remove the tutorial narration block (lines 46-54):

```js
// Before (lines 46-54):
  // Tutorial step 4: Cid explains chests
  if ((state.tutorialStep ?? 7) === 4 && callbacks.showNarration) {
    selectedElement = 'fire';
    renderScene('fire');
    renderActions(state);
    await callbacks.showNarration('Every run you can use your resources to get stronger.', { speaker: 'Cid' });
    await callbacks.showNarration("I'll give you 3 Fire Elements.", { speaker: 'Cid' });
    await callbacks.showNarration("Let's open that fire chest!", { speaker: 'Cid' });
  }

// After:
  // (Tutorial chest narration removed — chests no longer in tutorial)
```

Remove the tutorial advance block (lines 130-138):

```js
// Before (lines 130-138):
        // Tutorial: advance step 4→5
        if (callbacks.getTutorialStep?.() === 4) {
          try {
            await fetch(apiUrl('/api/game/tutorial-advance'), {
              method: 'POST',
              headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
              body: JSON.stringify({ expectedStep: 4 })
            });
          } catch (e) { console.warn('[Tutorial] advance failed:', e); }
        }

// After: (remove entire block)
```

- [ ] **Step 2: Remove tutorial block from crests-equip.js**

In `public/js/ui/crests-equip.js`, remove lines 50-53:

```js
// Before:
  // Tutorial step 5: Cid guides crest equip
  if ((state.tutorialStep ?? 7) === 5 && callbacks.showNarration) {
    await callbacks.showNarration("Now let's equip that crest to power up!", { speaker: 'Cid' });
  }

// After: (remove entire block)
```

- [ ] **Step 3: Renumber tutorial step in game.js**

In `public/game.js`, update the creature formation advance (lines 857-863):

```js
// Before:
    // Tutorial: advance step 6→7 (tutorial complete)
    if (gameState?.meta?.tutorialStep === 6) {
      ...
          body: JSON.stringify({ expectedStep: 6 })

// After:
    // Tutorial: advance step 5→6 (tutorial complete)
    if (gameState?.meta?.tutorialStep === 5) {
      ...
          body: JSON.stringify({ expectedStep: 5 })
```

Update the `?? 7` fallbacks (lines 1831 and 1842):

```js
// Before:
    getTutorialStep: () => gameState?.meta?.tutorialStep ?? 7,

// After:
    getTutorialStep: () => gameState?.meta?.tutorialStep ?? 6,
```

(Both occurrences — one in chests callbacks, one in crests callbacks.)

- [ ] **Step 4: Run syntax checks**

```bash
node --check public/js/ui/chests.js && node --check public/js/ui/crests-equip.js && node --check public/game.js && echo "OK"
```
Expected: `OK`

- [ ] **Step 5: Run tests**

Run: `npm test`
Expected: All pass

- [ ] **Step 6: Commit**

```bash
git add public/js/ui/chests.js public/js/ui/crests-equip.js public/game.js
git commit -m "refactor: remove chest/crest tutorial from frontend, renumber steps"
```

---

## Task 4: Add speed review tutorial in renderHub()

**Files:**
- Modify: `public/js/ui/exploration.js:395-417`

- [ ] **Step 1: Add step 3 (DEATH_HUB) narration block**

In `public/js/ui/exploration.js`, replace the entire tutorial block in `renderHub()` (lines 395-417). Change `const tutorialStep` to `let tutorialStep` since we reassign after step 3 advance. Replace the old step 6 block with steps 3, 4, and 5:

```js
  let tutorialStep = gameState.meta?.tutorialStep;

  // Tutorial step 3: encourage after first death, then auto-advance to 4
  if (tutorialStep === 3) {
    await showTutorialNarration([
      'That was tough huh?',
      "Don't worry, you'll get stronger each run!"
    ]);
    await apiTutorialAdvance?.(3);
    tutorialStep = getGameState().meta?.tutorialStep;
  }

  // Tutorial step 4: introduce speed review (condition-gated on dueCount > 0)
  if (tutorialStep === 4 && dueCount > 0) {
    await showTutorialNarration([
      'Hey! It looks like you\'re starting to learn some Japanese.',
      `The Translator detected ${dueCount} words for you to review.`,
      'If you pass the review, you\'ll just see the Japanese for these words from now on.',
      'But don\'t worry, you can always click them to see the full translation.',
      'Keep exploring and watch your Japanese grow!'
    ]);
    const buttons = document.querySelectorAll('.action-btn');
    buttons.forEach(btn => {
      if (btn.textContent.includes('速習')) {
        btn.classList.add('tutorial-highlight');
      } else {
        btn.classList.add('tutorial-dimmed');
      }
    });
  }

  // Tutorial step 5: guide to formation and re-enter
  if (tutorialStep === 5) {
    const creatureCount = Math.min((gameState.meta?.creatureCollection || []).length, 3);
    await showTutorialNarration([
      `Now you have ${creatureCount} creatures!`,
      'Each creature costs points.',
      "Select your best party and let's go back to the Starting Meadow!"
    ]);
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

- [ ] **Step 2: Add tutorial advance on speed review button click**

In the speed review button's onClick handler (around line 383), add the advance call before launching:

```js
{ label: `📚 速習${dueCount > 0 ? ` (${dueCount})` : ''}`, onClick: async () => {
  // Tutorial step 4→5: advance when player clicks speed review
  if (getGameState().meta?.tutorialStep === 4) {
    await apiTutorialAdvance?.(4);
  }
  const result = await apiGetDueWords();
  if (result?.words?.length > 0) {
    speedReview.start(result.words);
  } else {
    sceneModule.showNarration('復習する言葉がありません', { autoDismiss: 2000 });
  }
}},
```

- [ ] **Step 3: Run syntax check**

Run: `node --check public/js/ui/exploration.js && echo "OK"`
Expected: `OK`

- [ ] **Step 4: Run tests**

Run: `npm test`
Expected: All pass

- [ ] **Step 5: Commit**

```bash
git add public/js/ui/exploration.js
git commit -m "feat: add speed review tutorial step with glow system in hub"
```

---

## Task 5: Final verification

- [ ] **Step 1: Run full test suite**

Run: `npm test`
Expected: All tests pass

- [ ] **Step 2: Start dev server and verify no startup errors**

Run: `npm run dev` (in background)
Wait 3s, then: `curl -s -o /dev/null -w "%{http_code}" http://localhost:3000`
Expected: `200`

- [ ] **Step 3: Verify no remaining hardcoded old step numbers**

Grep for stale references:
```bash
# Should find NO matches for tutorialStep === 7 (old COMPLETE)
grep -rn 'tutorialStep === 7' public/ src/
# Should find NO matches for expectedStep: 6 or expectedStep: 7
grep -rn 'expectedStep: [67]' public/ src/
# Verify ?? 7 is gone from frontend
grep -rn '?? 7' public/
```

- [ ] **Step 4: Commit any fixes if needed**

- [ ] **Step 5: Stop dev server**
