# Combat Loop Strangler Fig Extraction — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract `public/js/ui/combat-loop.js` (3,653 lines, 6 concerns) into 6 focused modules using incremental Strangler Fig extraction, reducing coordinator to ~1,440 lines doing one job.

**Architecture:** Each extraction is two commits — a pure move (cut-paste + wire delegation) then a simplify (clean up the isolated code). Extracted modules receive dependencies as function arguments, never reaching into shared module state. The coordinator remains the only file with mutable state.

**Tech Stack:** ES6 modules, Node.js test runner with c8 coverage, PixiJS v8 (mocked in tests)

**Spec:** `docs/superpowers/specs/2026-04-15-combat-loop-strangler-fig-design.md`

---

## Chunk 1: Extract befriend.js

The befriend flow is the largest extraction (~750 lines) and the most independent. Functions are scattered across two regions of combat-loop.js (884–1048 and 2763–3363) but only call each other and shared callbacks.

### Task 1: Move befriend functions to new module

**Files:**
- Create: `public/js/ui/befriend.js`
- Modify: `public/js/ui/combat-loop.js`

- [ ] **Step 1: Create `befriend.js` with all befriend functions**

Cut these functions from `combat-loop.js` and paste into `befriend.js`:

From lines 884–1048:
- `isBefriendSlotBlocked` (884)
- `isBefriendAvailableForSlot` (889)
- `getMoveSelectBefriendOpts` (899)
- `mergeBefriendSlotsFromTalkResponse` (908)
- `resumeMoveSelectionAfterBefriendSpend` (921)
- `buildLiveAllyHpMap` (935)
- `showBefriendEnemyAttacksAnimated` (944)
- `handleBefriendTalk` (962)

From lines 2763–3363:
- `renderBefriendQuiz` (2773)
- `showBefriendReleasePrompt` (3000)
- `showBefriendTargetSelect` (3048)
- `showConversationRound` (3075)
- `showAnswerFeedback` (3092)
- `executeBefriendAction` (3111)
- Helper: `renderButtonsAsync` (used only by befriend — check if defined elsewhere or inline)
- Helper: `playDialogueAudio` (used only by befriend conversation — check location)

Each function that currently reads module-level variables (`getGameState`, `narration`, `combatActive`, etc.) must be converted to accept a `ctx` object parameter. The coordinator will pass these when calling.

Export the public API:
```js
export { renderBefriendQuiz, executeBefriendAction, handleBefriendTalk };
export { isBefriendSlotBlocked, isBefriendAvailableForSlot, getMoveSelectBefriendOpts };
export { mergeBefriendSlotsFromTalkResponse, resumeMoveSelectionAfterBefriendSpend };
```

Add required imports at the top of `befriend.js` — copy only the imports these functions actually use from `combat-loop.js` (e.g., `renderJpSentence`, `getKnownWords`, `toRomaji`, `SPRITE_VERSION`, pixi formation functions, narration-box functions, etc.).

- [ ] **Step 2: Wire combat-loop.js to delegate to befriend.js**

At the top of `combat-loop.js`, add:
```js
import * as befriend from './befriend.js';
```

Replace every internal call to the moved functions with delegation. Examples:

```js
// Before (in handleMoveSelected or wherever handleBefriendTalk is called):
handleBefriendTalk();

// After:
befriend.handleBefriendTalk(buildBefriendCtx());
```

Add a helper in `combat-loop.js` to build the context object:
```js
function buildBefriendCtx() {
  return {
    getGameState, updateGameState, narration, characterUI, settings,
    delay, showFormation, hideEnemy, showNpcInDisplay,
    showDamageNumber, animatePlayerHurt, updateCreatureRowData,
    combatActive, startMoveSelection, stopCombatLoop,
    apiGetBefriendConversation, apiSubmitBefriendAnswer, apiBefriendReplace,
    insertAttackCard, waitForCardTap, showAttackDisplay,
    API_BASE, getAuthHeaders: () => getAuthHeaders(),
  };
}
```

The exact contents of `ctx` depend on what each befriend function actually accesses. Audit each function during the move.

- [ ] **Step 3: Syntax check both files**

Run:
```bash
node --check public/js/ui/befriend.js && node --check public/js/ui/combat-loop.js && echo "OK"
```
Expected: `OK`

- [ ] **Step 4: Run full test suite**

Run:
```bash
npm test
```
Expected: All existing tests pass. Zero test changes — this is a pure structural move.

- [ ] **Step 5: Commit the move**

```bash
git add public/js/ui/befriend.js public/js/ui/combat-loop.js
git commit -m "refactor: extract befriend.js from combat-loop (pure move)"
```

### Task 2: Simplify befriend.js

**Files:**
- Modify: `public/js/ui/befriend.js`
- Modify: `public/js/ui/combat-loop.js`

- [ ] **Step 1: Audit and clean up befriend.js**

Now that the code is isolated, look for:
- Dead code: conditional branches that can never execute now that befriend doesn't share state with the turn loop
- Overly defensive null checks on values that are always passed via `ctx`
- Duplicate patterns (e.g., multiple functions building the same speaker object from `quizData`)
- Delete the `@file` JSDoc header if one was carried over
- Remove any `// ============` section markers that no longer make sense

- [ ] **Step 2: Clean up combat-loop.js**

Remove:
- Dead `let` declarations for variables that only befriend used
- Any `// ============ END KANA MODE COMBAT ============` markers that are now orphaned by the gap where befriend functions were
- Update the `@file` header if still present (or delete it — it's stale)

- [ ] **Step 3: Syntax check + test**

```bash
node --check public/js/ui/befriend.js && node --check public/js/ui/combat-loop.js && echo "OK"
npm test
```
Expected: `OK`, all tests pass.

- [ ] **Step 4: Commit the simplify**

```bash
git add public/js/ui/befriend.js public/js/ui/combat-loop.js
git commit -m "refactor: simplify befriend.js — remove dead code and stale headers"
```

### Task 3: Add befriend unit tests

**Files:**
- Create: `tests/unit/ui/befriend.test.js`

- [ ] **Step 1: Write tests for befriend eligibility helpers**

These are pure functions that can be tested without mocking:

```js
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// Import the functions (adjust path if they take ctx)
import {
  isBefriendSlotBlocked,
  isBefriendAvailableForSlot,
  getMoveSelectBefriendOpts,
} from '../../../public/js/ui/befriend.js';

describe('befriend eligibility', () => {
  it('blocks befriend when slot has no befriend data', () => {
    // Test with a slot that has no befriendChance
    const slot = { creature: { id: 'test' } };
    assert.equal(isBefriendSlotBlocked(slot), true);
  });

  it('allows befriend when enemy is below 50% HP with befriend data', () => {
    // Test with eligible slot
    // ... (exact assertions depend on function signatures after extraction)
  });
});
```

Adapt the exact test cases to the actual function signatures after extraction. The key is to test the eligibility logic with direct inputs.

- [ ] **Step 2: Run tests to verify they pass**

```bash
npm run test:unit -- --test-name-pattern "befriend"
```
Expected: All new tests pass.

- [ ] **Step 3: Commit**

```bash
git add tests/unit/ui/befriend.test.js
git commit -m "test: add befriend eligibility unit tests"
```

## Chunk 2: Extract kana-combat.js

The smallest extraction — 90 lines, entirely self-contained, with its own state variables.

### Task 4: Move kana combat functions to new module

**Files:**
- Create: `public/js/ui/kana-combat.js`
- Modify: `public/js/ui/combat-loop.js`

- [ ] **Step 1: Create `kana-combat.js`**

Cut these functions from `combat-loop.js` (lines 789–882):
- `startKanaCombatRound` (803)
- `fetchKanaCard` (850)
- `submitKanaReview` (863)
- `pickCheapestMove` (875)

Move these state variables from the module state section:
- `kanaSwipeResolve` (616)
- `kanaSwipeDirection` (617)

Keep the exported wrapper functions in `combat-loop.js` but delegate:
```js
// combat-loop.js keeps exports, delegates to kana module
import * as kanaCombat from './kana-combat.js';

export function handleKanaSwipe(direction) {
  kanaCombat.handleSwipe(direction);
}

export function isKanaRoundInProgress() {
  return kanaCombat.isRoundInProgress();
}
```

`kana-combat.js` exports:
```js
export { handleSwipe, isRoundInProgress, startRound, pickCheapestMove };
```

The kana functions use `API_BASE`, `getAuthHeaders`, `delay`, and `getGameState`. Pass these via a `ctx` argument to `startRound()`, or have a `kana.init(ctx)` since kana mode has its own state.

- [ ] **Step 2: Syntax check both files**

```bash
node --check public/js/ui/kana-combat.js && node --check public/js/ui/combat-loop.js && echo "OK"
```

- [ ] **Step 3: Run full test suite**

```bash
npm test
```
Expected: All tests pass unchanged.

- [ ] **Step 4: Commit**

```bash
git add public/js/ui/kana-combat.js public/js/ui/combat-loop.js
git commit -m "refactor: extract kana-combat.js from combat-loop (pure move)"
```

### Task 5: Simplify kana-combat.js

**Files:**
- Modify: `public/js/ui/kana-combat.js`
- Modify: `public/js/ui/combat-loop.js`

- [ ] **Step 1: Clean up kana-combat.js**

- Remove any carried-over comments referencing the old file structure
- Delete `// ============ KANA MODE COMBAT ============` and `// ============ END KANA MODE COMBAT ============` markers
- Check if `pickCheapestMove` can be simplified now that it's in its own module

- [ ] **Step 2: Clean up combat-loop.js**

- Remove the orphaned `// ============ KANA MODE COMBAT ============` section markers
- Remove `let kanaSwipeResolve` and `let kanaSwipeDirection` from module state

- [ ] **Step 3: Syntax check + test**

```bash
node --check public/js/ui/kana-combat.js && node --check public/js/ui/combat-loop.js && echo "OK"
npm test
```

- [ ] **Step 4: Commit**

```bash
git add public/js/ui/kana-combat.js public/js/ui/combat-loop.js
git commit -m "refactor: simplify kana-combat.js — clean up markers and state"
```

## Chunk 3: Extract attack-card.js

Pure UI rendering — 400 lines of card building, no game logic.

### Task 6: Move attack card functions to new module

**Files:**
- Create: `public/js/ui/attack-card.js`
- Modify: `public/js/ui/combat-loop.js`
- Modify: `public/js/ui/pvp-battle.js` (imports `showAttackDisplay` from combat-loop)

- [ ] **Step 1: Create `attack-card.js`**

Cut these functions from `combat-loop.js` (lines 158–563):
- Constants: `ATTACK_CARD_TIMING` (160), `ELEMENT_THEME` (166), `KANJI_RE` (174), `KATAKANA_RE` (175)
- `actionIconPath` (178)
- `escHtml` (184)
- `wrapWithRuby` (192)
- `buildSplitAttackCard` (214)
- `insertAttackCard` (288) — currently exported
- `insertNpcAttackCard` (318)
- `waitForCardTap` (361) — currently exported
- `showAttackCardAndWait` (393)
- `showAttackPartySkillProcs` (402)
- `showAttackDisplay` (496) — currently exported, imported by `pvp-battle.js`

These functions use some combat-loop state:
- `showAttackDisplay` uses `impactEffect`, `fireCreatureAttackEffect`, `enemyCreatureAttackEffect` — these will move to `combat-vfx.js` in Task 8. For now, pass them as function arguments or import from combat-loop.
- `showAttackPartySkillProcs` uses `getGameState`, `characterUI`, `narration` — pass via `ctx`.

Exports:
```js
export {
  buildSplitAttackCard, insertAttackCard, insertNpcAttackCard,
  waitForCardTap, showAttackCardAndWait, showAttackDisplay,
  showAttackPartySkillProcs,
  ATTACK_CARD_TIMING, ELEMENT_THEME,
};
```

- [ ] **Step 2: Update imports in combat-loop.js**

```js
import {
  insertAttackCard, insertNpcAttackCard, waitForCardTap,
  showAttackCardAndWait, showAttackDisplay, showAttackPartySkillProcs,
} from './attack-card.js';
```

Remove the cut functions. Keep re-exporting what external consumers need:
```js
// Re-export for pvp-battle.js and other consumers
export { insertAttackCard, waitForCardTap, showAttackDisplay } from './attack-card.js';
```

- [ ] **Step 3: Update pvp-battle.js import**

Change:
```js
import { showAttackDisplay } from './combat-loop.js';
```
To:
```js
import { showAttackDisplay } from './attack-card.js';
```

Or keep the re-export from combat-loop.js so pvp-battle.js doesn't need to change. Prefer the direct import if it's a clean one-line change.

- [ ] **Step 4: Syntax check all affected files**

```bash
node --check public/js/ui/attack-card.js && \
node --check public/js/ui/combat-loop.js && \
node --check public/js/ui/pvp-battle.js && echo "OK"
```

- [ ] **Step 5: Run full test suite**

```bash
npm test
```

- [ ] **Step 6: Commit**

```bash
git add public/js/ui/attack-card.js public/js/ui/combat-loop.js public/js/ui/pvp-battle.js
git commit -m "refactor: extract attack-card.js from combat-loop (pure move)"
```

### Task 7: Simplify attack-card.js

**Files:**
- Modify: `public/js/ui/attack-card.js`
- Modify: `public/js/ui/combat-loop.js`

- [ ] **Step 1: Clean up attack-card.js**

- Delete stale headers/comments
- Check if `escHtml` duplicates anything in the codebase (it likely does — search for other HTML escape utils)
- Look for dead branches in `buildSplitAttackCard` that handle cases no longer possible
- Check if `ELEMENT_THEME` is duplicated elsewhere (there's `ELEMENT_COLORS` in `pixi/effects.js`)

- [ ] **Step 2: Clean up combat-loop.js**

- Remove the `// ============ SPLIT ATTACK CARD ============` section marker
- Verify no dangling references to the moved constants

- [ ] **Step 3: Syntax check + test**

```bash
node --check public/js/ui/attack-card.js && node --check public/js/ui/combat-loop.js && echo "OK"
npm test
```

- [ ] **Step 4: Commit**

```bash
git add public/js/ui/attack-card.js public/js/ui/combat-loop.js
git commit -m "refactor: simplify attack-card.js — remove dead code and duplication"
```

## Chunk 4: Extract combat-vfx.js

The biggest structural change — pulls together the Pixi adapter layer, HP sync helpers, and combat animation sequences. This is where ghost sprite and state sync bugs live.

### Task 8: Move VFX and combat helper functions to new module

**Files:**
- Create: `public/js/ui/combat-vfx.js`
- Modify: `public/js/ui/combat-loop.js`

- [ ] **Step 1: Create `combat-vfx.js`**

Cut these functions from `combat-loop.js`:

From lines 62–157 (Pixi adapters):
- `spritePos` (72)
- `effectDelay` (78)
- `impactEffect` (84)
- `fireCreatureAttackEffect` (122)
- `enemyCreatureAttackEffect` (137)
- `npcSpritePath` (148)

From lines 1212–1314 (slot-finding + HP helpers):
- `findCreatureSlotByAttackerId` (1212)
- `findEnemyTargetElement` (1237)
- `updateCreatureHpBars` (1251)
- `showEnemyDamageDisplay` (1299)

From lines 1561–2120 (shared combat helpers):
- `showFloatingText` (1564)
- `showEffectEvents` (1582)
- `syncStatusIconsFromResult` (1638)
- `syncStatusForCreature` (1655)
- `showMoveEffectsApplied` (1670)
- `showPartySkillProcs` (1719)
- `showRoundStartEvents` (1744)
- `showOneCounterAttackAnimated` (1775)
- `showCounterAttacks` (1833)
- `buildAllyHpMap` (1846)
- `buildEnemyHpMapForPlayerAttacks` (1861)
- `buildMergedInitiativeAttacks` (1883) — **check**: this may belong in the coordinator since it's orchestration logic, not VFX. Move it only if it's purely data transformation.
- `showOneEnemyAttackAnimated` (1897)
- `showEnemyAttacksAnimated` (1958)
- `showNpcSkillAttacksAnimated` (1970)
- `showKoSwapAnimations` (2003)
- `syncFinalState` (2088) — **check**: this updates game state, which is coordinator logic. Keep in combat-loop.js if it mutates module state.

**Critical decision per function:** If a function mutates `combat-loop.js` module state (e.g., calls `updateGameState`), it must either:
1. Stay in the coordinator, or
2. Accept state-mutation callbacks via `ctx`

Audit each function before moving. Pure functions that take inputs and produce visual outputs move. Functions that change game state stay or get callbacks.

Copy only the imports these functions use (PixiJS formation, effects, text, banners, status-vfx, tween, etc.).

- [ ] **Step 2: Wire combat-loop.js to use combat-vfx.js**

```js
import * as vfx from './combat-vfx.js';
```

Replace internal calls. The orchestrator functions (`playOnePlayerAttackInMoveTurn`, `executeMoveTurn`, etc.) now call `vfx.impactEffect(...)`, `vfx.showEnemyAttacksAnimated(...)`, etc.

If `showAttackDisplay` in `attack-card.js` needs VFX functions, update it to import from `combat-vfx.js` directly (this is allowed — extracted modules can import other extracted modules if the dependency is one-directional and doesn't create cycles. The spec says "no extracted module imports another" but attack-card calling VFX is a legitimate one-way dependency).

- [ ] **Step 3: Syntax check all files**

```bash
node --check public/js/ui/combat-vfx.js && \
node --check public/js/ui/combat-loop.js && \
node --check public/js/ui/attack-card.js && echo "OK"
```

- [ ] **Step 4: Run full test suite**

```bash
npm test
```

- [ ] **Step 5: Commit**

```bash
git add public/js/ui/combat-vfx.js public/js/ui/combat-loop.js public/js/ui/attack-card.js
git commit -m "refactor: extract combat-vfx.js from combat-loop (pure move)"
```

### Task 9: Simplify combat-vfx.js

**Files:**
- Modify: `public/js/ui/combat-vfx.js`
- Modify: `public/js/ui/combat-loop.js`

- [ ] **Step 1: Clean up combat-vfx.js**

- Delete stale headers and section markers
- Look for duplicate HP map construction patterns (`buildAllyHpMap` vs `buildEnemyHpMapForPlayerAttacks` vs `buildLiveAllyHpMap` in befriend.js) — can any of these share a single utility?
- Check if `findCreatureSlotByAttackerId` and `findEnemyTargetElement` have similar DOM query patterns that can be unified
- Verify `effectDelay` isn't duplicated elsewhere (there's a `wait` from `pixi/tween.js` that may do the same thing)

- [ ] **Step 2: Clean up combat-loop.js**

- Remove `// ============ PIXI ADAPTER FUNCTIONS ============` marker
- Remove `// ============ SHARED CREATURE COMBAT HELPERS ============` marker
- Remove orphaned `let` declarations for state only VFX functions used
- The `getLog()` intent log helper (line 62) stays — it's used across the coordinator

- [ ] **Step 3: Syntax check + test**

```bash
node --check public/js/ui/combat-vfx.js && node --check public/js/ui/combat-loop.js && echo "OK"
npm test
```

- [ ] **Step 4: Commit**

```bash
git add public/js/ui/combat-vfx.js public/js/ui/combat-loop.js
git commit -m "refactor: simplify combat-vfx.js — deduplicate HP map builders, remove stale code"
```

### Task 10: Playwright playtest milestone

After extracting the 4 biggest modules (befriend, kana, attack-card, VFX), verify the game still works visually.

**Precondition:** Ask user before opening Playwright (per CLAUDE.md rules).

- [ ] **Step 1: Start dev server**

```bash
npm run dev &
sleep 5
curl -s -o /dev/null -w "%{http_code}" http://localhost:5173
```
Expected: `200`

- [ ] **Step 2: Play through a combat encounter**

Using Playwright, navigate to `http://localhost:5173`, start a run, enter combat, and verify:
- Move selection renders correctly
- Player attacks show attack cards + VFX
- Enemy attacks animate with HP bar sync
- Befriend quiz triggers on low-HP enemy (if encountered)
- Combat ends cleanly with victory narration

- [ ] **Step 3: Screenshot evidence**

Take a screenshot at each phase. Delete screenshots after viewing (per CLAUDE.md cleanup rules).

## Chunk 5: Extract npc-dialogue-ui.js and final cleanup

### Task 11: Move NPC dialogue functions to new module

**Files:**
- Create: `public/js/ui/npc-dialogue-ui.js`
- Modify: `public/js/ui/combat-loop.js`

- [ ] **Step 1: Create `npc-dialogue-ui.js`**

Cut from `combat-loop.js` (lines 3525–3653):
- `showNpcGreeting` (3525) — currently exported
- `isNpcDialogueActive` (3540) — currently exported
- `runNpcDialogue` (3546) — currently exported
- `showBondFeedback` (3625)
- `showBondSummary` (3643)

Move the `npcDialogueActive` state variable (find its `let` declaration in the module state section).

These functions use: `narration`, `getGameState`, `updateGameState`, `apiStartNpcDialogue`, `apiRespondNpcDialogue`, `showNpcSprite`, `hideNpcSprite`, `delay`. Pass via init or ctx pattern.

Exports:
```js
export { showNpcGreeting, isNpcDialogueActive, runNpcDialogue };
```

- [ ] **Step 2: Wire combat-loop.js delegation**

```js
import * as npcDialogueUI from './npc-dialogue-ui.js';
```

Re-export for `game.js` consumption:
```js
export const showNpcGreeting = npcDialogueUI.showNpcGreeting;
export const isNpcDialogueActive = npcDialogueUI.isNpcDialogueActive;
export const runNpcDialogue = npcDialogueUI.runNpcDialogue;
```

Or update `game.js` to import directly from `npc-dialogue-ui.js`. Check which approach requires fewer changes by looking at lines 614–616 and 1934 in `game.js`.

- [ ] **Step 3: Syntax check + test**

```bash
node --check public/js/ui/npc-dialogue-ui.js && node --check public/js/ui/combat-loop.js && echo "OK"
npm test
```

- [ ] **Step 4: Commit**

```bash
git add public/js/ui/npc-dialogue-ui.js public/js/ui/combat-loop.js
git commit -m "refactor: extract npc-dialogue-ui.js from combat-loop (pure move)"
```

### Task 12: Simplify npc-dialogue-ui.js and final coordinator cleanup

**Files:**
- Modify: `public/js/ui/npc-dialogue-ui.js`
- Modify: `public/js/ui/combat-loop.js`

- [ ] **Step 1: Clean up npc-dialogue-ui.js**

- Delete stale headers
- Check if `showBondFeedback` and `showBondSummary` can be inlined into `runNpcDialogue` (they may only be called once)

- [ ] **Step 2: Final coordinator cleanup**

Now that all 5 extractions are done, clean up `combat-loop.js`:
- Delete the stale `@file` JSDoc header entirely
- Remove all orphaned `// ============` section markers
- Audit remaining `let` declarations — how many of the original 55 are left? Remove any that are now unused.
- Remove orphaned callback variables that were only used by extracted functions
- Verify the `init()` function only sets callbacks the coordinator actually uses (not callbacks that were forwarded to extracted modules)

- [ ] **Step 3: Verify final line count**

```bash
wc -l public/js/ui/combat-loop.js public/js/ui/befriend.js public/js/ui/kana-combat.js public/js/ui/attack-card.js public/js/ui/combat-vfx.js public/js/ui/npc-dialogue-ui.js
```
Expected: combat-loop.js around 1,400 lines. Total may be slightly less than 3,653 due to simplification.

- [ ] **Step 4: Syntax check + full test suite**

```bash
for f in public/js/ui/combat-loop.js public/js/ui/befriend.js public/js/ui/kana-combat.js public/js/ui/attack-card.js public/js/ui/combat-vfx.js public/js/ui/npc-dialogue-ui.js; do
  node --check "$f" || exit 1
done && echo "All OK"
npm test
```

- [ ] **Step 5: Commit**

```bash
git add public/js/ui/npc-dialogue-ui.js public/js/ui/combat-loop.js
git commit -m "refactor: simplify npc-dialogue-ui.js and final coordinator cleanup"
```

## Chunk 6: Integration tests

Write integration tests for the cross-module flows where recurring bugs lived.

### Task 13: Add integration tests for combat flows

**Files:**
- Create: `tests/integration/combat-flow.test.js`

- [ ] **Step 1: Set up test harness with stubs**

Create the test file with minimal DOM and PixiJS stubs. The coordinator needs:
- A fake `document` with `getElementById` and `querySelector` (use jsdom or minimal stubs)
- Stub PixiJS formation functions that record calls
- Stub narration that records calls and auto-resolves
- Stub API calls that return canned responses

```js
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

// Stub setup (exact stubs depend on what init() requires)
function createStubs() {
  const calls = [];
  return {
    calls,
    getGameState: () => ({ /* minimal game state */ }),
    updateGameState: (s) => calls.push(['updateGameState', s]),
    narration: {
      showNarration: async (text, opts) => { calls.push(['narration', text]); },
      forceHideNarration: () => calls.push(['hideNarration']),
    },
    characterUI: {
      updateEnemyHPBar: (hp) => calls.push(['enemyHP', hp]),
      updatePlayerHPBar: (hp) => calls.push(['playerHP', hp]),
    },
    // ... other stubs
  };
}
```

- [ ] **Step 2: Write basic combat cycle test**

Test: start combat → select move → player attacks → enemy attacks → next turn.

```js
describe('combat flow integration', () => {
  it('completes a basic attack cycle', async () => {
    const stubs = createStubs();
    combatLoop.init(stubs);
    await combatLoop.startCombatLoop();
    // Verify move selection started
    // Simulate move selection
    // Verify attack card shown, VFX played, HP updated
    // Verify enemy attack follows
  });
});
```

The exact assertions depend on the final API surface after extraction. Focus on verifying the call sequence across module boundaries.

- [ ] **Step 3: Write KO + swap test**

Test the dead-sprites-reappear bug pattern:
```js
it('swaps reserve creature after KO without ghost sprites', async () => {
  // Set up state with 3 allies, enemy attack kills ally 0
  // Verify: KO animation called for slot 0
  // Verify: swap animation shows new creature
  // Verify: no extra sprite creation calls (the ghost bug)
});
```

- [ ] **Step 4: Write befriend flow test**

Test: enemy below 50% → quiz triggers → Talk → name quiz → creature joins.

- [ ] **Step 5: Write combat end test**

Test: last enemy defeated → victory narration → XP events → stopCombatLoop.

- [ ] **Step 6: Write kana mode test**

Test: enter kana mode → fetch card → swipe right → move selected.

- [ ] **Step 7: Run all tests**

```bash
npm test
```
Expected: All unit + integration tests pass.

- [ ] **Step 8: Commit**

```bash
git add tests/integration/combat-flow.test.js
git commit -m "test: add combat flow integration tests for cross-module wiring"
```

### Task 14: Update barrel export (if needed)

**Files:**
- Modify: `public/js/ui/index.js`

- [ ] **Step 1: Check if index.js needs updating**

`index.js` re-exports `combatLoop` from `combat-loop.js`. Since we kept re-exports in `combat-loop.js` for backward compatibility, this may not need changes. Verify:

```bash
node --check public/js/ui/index.js && echo "OK"
```

If any consumer imports moved functions from the barrel, add re-exports for the new modules:
```js
export * as befriend from './befriend.js';
export * as attackCard from './attack-card.js';
// etc. — only if actually imported via the barrel
```

- [ ] **Step 2: Commit if changes needed**

```bash
git add public/js/ui/index.js
git commit -m "refactor: update barrel exports for extracted combat modules"
```

### Task 15: Final verification

- [ ] **Step 1: Run full test suite one last time**

```bash
npm test
```

- [ ] **Step 2: Verify no circular dependencies**

```bash
# Quick check: each extracted module should NOT import combat-loop.js
grep -l "combat-loop" public/js/ui/befriend.js public/js/ui/kana-combat.js public/js/ui/attack-card.js public/js/ui/combat-vfx.js public/js/ui/npc-dialogue-ui.js 2>/dev/null
```
Expected: No output (no extracted module imports the coordinator).

- [ ] **Step 3: Verify line count targets**

```bash
wc -l public/js/ui/combat-loop.js public/js/ui/befriend.js public/js/ui/kana-combat.js public/js/ui/attack-card.js public/js/ui/combat-vfx.js public/js/ui/npc-dialogue-ui.js
```

- [ ] **Step 4: Playwright smoke test**

Ask user before opening. Full combat encounter + befriend flow if possible.
