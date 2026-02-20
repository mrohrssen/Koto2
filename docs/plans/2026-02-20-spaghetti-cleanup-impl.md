# Spaghetti Cleanup Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Remove dead systems, consolidate duplicated code, audit for more dead code, and decompose the worst monolithic functions — in 3 independently mergeable phases.

**Architecture:** Bottom-up refactor. Phase 1 removes confirmed dead systems and extracts duplicated blocks into named helpers (pure mechanical, no behavior change). Phase 1.5 audits for additional dead code. Phase 2 decomposes the 4 worst long functions using Phase 1 helpers.

**Tech Stack:** Node.js/Express backend, vanilla JS ES6 modules frontend, CSS.

---

## Phase 1: Dead Systems + Extract & Consolidate

### Task 1: Create worktree

**Step 1: Create isolated worktree**

```bash
cd /Users/michia/Documents/jrpg
/usr/bin/git worktree add ../jrpg-wt-cleanup -b refactor/spaghetti-cleanup
cd ../jrpg-wt-cleanup
```

**Step 2: Verify worktree is clean**

```bash
/usr/bin/git status
```

Expected: clean working tree on `refactor/spaghetti-cleanup` branch.

---

### Task 2: Remove Phaser exploration system

Phaser is fully dead. `shouldUsePhaser()` returns `false` unconditionally. 1.1MB vendor bundle + 921 lines of glue code.

**Files:**
- Delete: `public/js/phaser/` (5 files, 921 lines)
- Delete: `public/js/vendor/phaser.min.js` (1.1MB)
- Modify: `public/game.js` — remove imports, Phaser branches, 3 functions
- Modify: `public/game.html` — remove Phaser script tag and container div
- Modify: `public/game.css` — remove Phaser CSS section

**Step 1: Delete Phaser module files and vendor bundle**

```bash
rm -rf public/js/phaser/
rm -f public/js/vendor/phaser.min.js
```

**Step 2: Edit `public/game.js` — remove Phaser imports (lines 104-105)**

Remove these two import lines:
```js
import * as phaser from './js/phaser/index.js';
import { gameEvents } from './js/phaser/phaser-bridge.js';
```

**Step 3: Edit `public/game.js` — simplify `updateUI()` Phaser branch (lines 222-236)**

Replace the entire Phaser if/else block:
```js
  // Handle Phaser exploration mode
  console.log('[DEBUG] updateUI. phase:', gameState.phase, 'shouldUsePhaser:', shouldUsePhaser());
  if (shouldUsePhaser()) {
    console.log('[DEBUG] Phaser SHOULD activate. isActive:', phaser.isExplorationActive());
    if (!phaser.isExplorationActive()) {
      const roomData = getRoomDataForPhaser();
      console.log('[DEBUG] Starting Phaser with roomData:', roomData);
      phaser.startExploration(roomData);
    }
    // Don't update HTML scene/content when Phaser is active
  } else {
    // Make sure Phaser is hidden when not in exploration
    if (phaser.isExplorationActive()) {
      phaser.stopExploration();
    }
    updateScene();
    updateChipRow();
    updatePlayerHP();
```

With just the else-body (no conditional):
```js
  updateScene();
  updateChipRow();
  updatePlayerHP();
```

**Step 4: Edit `public/game.js` — delete 3 dead functions (lines 708-816)**

Delete entirely:
- `setupPhaserEventListeners()` (lines 710-788)
- `getRoomDataForPhaser()` (lines 793-809)
- `shouldUsePhaser()` (lines 814-816)
- The section comment `// ============ PHASER EXPLORATION HANDLERS ============` (line 708)

**Step 5: Edit `public/game.js` — remove `setupPhaserEventListeners()` call**

Find the call (around line 1407) and delete it:
```js
  setupPhaserEventListeners();
```

**Step 6: Edit `public/game.html` — remove Phaser container div (lines 49-51)**

Delete:
```html
    <!-- Phaser Exploration Canvas (hidden by default) -->
    <div class="phaser-container" id="phaser-container" style="display: none;">
      <div id="phaser-game"></div>
```

Also remove the closing `</div>` for this container.

**Step 7: Edit `public/game.html` — remove Phaser script tag (lines 213-214)**

Delete:
```html
  <!-- Phaser 3 for exploration -->
  <script src="/js/vendor/phaser.min.js"></script>
```

**Step 8: Edit `public/game.css` — remove Phaser CSS section (lines 2267-2312)**

Delete the entire `/* ============ PHASER EXPLORATION ============ */` section including `.phaser-container`, `.phaser-container canvas`, `.exploration-context-btn`, `.exploration-context-btn.visible`, `.exploration-context-btn:active`.

**Step 9: Syntax check and verify**

```bash
node --check public/game.js && echo "OK"
```

**Step 10: Commit**

```bash
/usr/bin/git add -A && /usr/bin/git commit -m "refactor: remove dead Phaser exploration system

shouldUsePhaser() returned false unconditionally. Removes 1.1MB vendor
bundle, 921 lines of glue code, and all references in game.js/html/css."
```

---

### Task 3: Disable dead narration calls

The frontend discards narration from these routes. The `await generateGameNarration(...)` calls block responses for 10-49 seconds to generate text nobody sees. Keep dm.js and all infrastructure intact for future re-enablement.

**Files:**
- Modify: `src/routes/game/run.js:66-68` — start-run narration
- Modify: `src/routes/game/run.js:166-168` — levels/select narration
- Modify: `src/routes/game/run.js:249-255` — proceed/encounterStart narration
- Modify: `src/routes/game/combat.js:101-106` — start-encounter narration
- Modify: `src/routes/game/economy.js:66-69` — shrine narration
- Modify: `src/routes/game/player.js:18` — create-player narration

**Step 1: Edit `src/routes/game/run.js` — start-run (line 66)**

Replace:
```js
      const narration = await generateGameNarration('runStart', {
        player: gameManager.run.player
      }, req.userKeys);
```
With:
```js
      const narration = null; // DM narration disabled — frontend discards this
```

**Step 2: Edit `src/routes/game/run.js` — levels/select (line 166)**

Same replacement as Step 1 (identical block at line 166-168).

**Step 3: Edit `src/routes/game/run.js` — proceed/encounterStart (lines 249-255)**

Replace:
```js
      let narration = null;
      if (room.type === 'monster') {
        narration = await generateGameNarration('encounterStart', {
          enemy: room.enemy,
          player: gameManager.run.player
        }, req.userKeys);
      }
```
With:
```js
      const narration = null; // DM narration disabled — frontend discards this
```

**Step 4: Edit `src/routes/game/combat.js` — start-encounter (lines 102-106)**

Replace:
```js
      const narration = await generateGameNarration('encounterStart', {
        enemy: encounter.enemy,
        player: gameManager.run.player,
        allies: gameManager.combat?.allies || []
      }, req.userKeys);
```
With:
```js
      const narration = null; // DM narration disabled — frontend discards this
```

**Step 5: Edit `src/routes/game/economy.js` — shrine (lines 66-69)**

Replace:
```js
      const narration = await generateGameNarration('shrine', {
        player: gameManager.run.player,
        effect: result.effect
      }, req.userKeys);
```
With:
```js
      const narration = null; // DM narration disabled — frontend discards this
```

**Step 6: Edit `src/routes/game/player.js` — create-player (line 18)**

Replace:
```js
    const narration = await generateGameNarration('runStart', gameManager.player, req.userKeys);
```
With:
```js
    const narration = null; // DM narration disabled — frontend discards this
```

**Step 7: Syntax check**

```bash
node --check src/routes/game/run.js && node --check src/routes/game/combat.js && node --check src/routes/game/economy.js && node --check src/routes/game/player.js && echo "OK"
```

**Step 8: Commit**

```bash
/usr/bin/git add -A && /usr/bin/git commit -m "perf: disable dead narration LLM calls in 6 route handlers

Frontend discards narration from runStart, encounterStart, and shrine
routes. These await calls blocked responses for 10-49 seconds generating
text nobody sees. dm.js infrastructure kept intact for future use."
```

---

### Task 4: Delete simulation system

Zero imports anywhere. Not wired to any route, test, or script.

**Files:**
- Delete: `src/game/simulation/simulator.js` (370 lines)
- Delete: `src/game/simulation/ai-player.js` (160 lines)
- Delete: `src/game/simulation/stats.js` (216 lines)
- Delete: `src/game/simulation/` directory

**Step 1: Delete simulation directory**

```bash
rm -rf src/game/simulation/
```

**Step 2: Verify no broken imports**

```bash
grep -r "simulation" src/ --include='*.js' -l
```

Expected: no results (or only docs/comments, not imports).

**Step 3: Commit**

```bash
/usr/bin/git add -A && /usr/bin/git commit -m "refactor: delete dead simulation system (746 lines, zero callers)"
```

---

### Task 5: Extract `_flushPendingCaptures()` in loop.js

Identical 20-line capture-flush block copy-pasted at lines 715, 901, and 1156.

**Files:**
- Modify: `src/game/loop.js`

**Step 1: Add `_flushPendingCaptures()` as a private method on GameManager**

Add this method to the GameManager class (near the other helper methods, before `robotCombatCycle`):

```js
  /**
   * Move pending captures into party and collection after victory.
   * @returns {Array} New collection additions
   */
  _flushPendingCaptures() {
    const pending = this.run.robotParty.pendingCaptures || [];
    const newAdditions = [];
    for (const robot of pending) {
      const total = this.run.robotParty.active.length + this.run.robotParty.reserves.length;
      if (total >= this.run.robotParty.maxTotal) break;
      if (this.run.robotParty.active.length < 3) {
        this.run.robotParty.active.push(robot);
      } else {
        this.run.robotParty.reserves.push(robot);
      }
      if (this.meta && !robot.temporary) {
        const result = addToCollection(this.meta.robotCollection || [], robot.id);
        if (result.added) {
          this.meta.robotCollection = result.collection;
          newAdditions.push({ id: robot.id, name: robot.name, nameEn: robot.nameEn, element: robot.element, rarity: robot.rarity });
        }
      }
    }
    this.run.robotParty.pendingCaptures = [];
    return newAdditions;
  }
```

**Step 2: Replace site 1 — `robotCombatCycle` (lines 714-737)**

Replace the inline `flushPendingCaptures` const + its call with:
```js
      const newCollectionAdditions = this._flushPendingCaptures();
```

Remove the 23-line `const flushPendingCaptures = () => { ... };` block entirely and replace the call to `flushPendingCaptures()` with `this._flushPendingCaptures()`.

**Step 3: Replace site 2 — `useRobotUltimate` (lines 901-919)**

Replace the inline capture-flush block with:
```js
      newCollectionAdditions = this._flushPendingCaptures();
```

**Step 4: Replace site 3 — `befriendReplace` (lines 1156-1175)**

Replace the inline capture-flush block with:
```js
      newCollectionAdditions = this._flushPendingCaptures();
```

**Step 5: Syntax check and unit tests**

```bash
node --check src/game/loop.js && echo "OK"
npm run test:unit 2>&1 | tail -5
```

**Step 6: Commit**

```bash
/usr/bin/git add src/game/loop.js && /usr/bin/git commit -m "refactor: extract _flushPendingCaptures() — consolidate 3 copies into 1"
```

---

### Task 6: Extract `queueBackgroundDialogue(req)` in run.js

Identical 35-line dialogue-generation block duplicated in start-run (lines 72-108) and levels/select (lines 172-208).

**Files:**
- Modify: `src/routes/game/run.js`

**Step 1: Add helper function at top of `createRunRoutes`**

Inside `createRunRoutes` but before the route definitions, add:

```js
  /** Fire-and-forget: queue missing befriend + NPC dialogues for current run */
  function queueBackgroundDialogues(req) {
    const userKeys = req.userKeys || {};
    if (!userKeys.aiApiKey) return;

    const aiConfig = {
      provider: userKeys.aiProvider || 'anthropic',
      apiKey: userKeys.aiApiKey,
      openaiModel: userKeys.openaiModel,
      openrouterModel: userKeys.openrouterModel,
      jlptLevel: userKeys.jlptLevel || 'N4'
    };

    if (generateMissingDialoguesFn && getUserVocabulary) {
      const { words: vocabulary } = getUserVocabulary(req.user.id);
      generateMissingDialoguesFn(req.user.id, aiConfig, vocabulary).catch(e => {
        console.error('[BefriendDialogue] Background bulk generation failed:', e.message);
      });
    }

    if (queueMissingNpcDialoguesFn && getUserVocabulary) {
      const { words: vocabulary, vidSet } = getUserVocabulary(req.user.id);
      const vocabSet = new Set(vocabulary);
      const checkViolationsFn = userKeys.jpdbApiKey && checkSentenceViolations
        ? async (text) => checkSentenceViolations(text, vocabSet, userKeys.jpdbApiKey, new Set(), vidSet)
        : null;
      queueMissingNpcDialoguesFn(req.user.id, aiConfig, { words: vocabulary, vidSet, checkViolationsFn }).catch(e => {
        console.error('[NpcDialogue] Background generation failed:', e.message);
      });
    }
  }
```

**Step 2: Replace site 1 — start-run (lines 72-108)**

Replace the entire 36-line block (from `// Fire-and-forget: generate any missing befriend dialogues` through the end of the NPC dialogue block) with:

```js
      queueBackgroundDialogues(req);
```

**Step 3: Replace site 2 — levels/select (lines 172-208)**

Same replacement as Step 2.

**Step 4: Syntax check**

```bash
node --check src/routes/game/run.js && echo "OK"
```

**Step 5: Commit**

```bash
/usr/bin/git add src/routes/game/run.js && /usr/bin/git commit -m "refactor: extract queueBackgroundDialogues() — consolidate 2 identical 35-line blocks"
```

---

### Task 7: Extract `getHpColor(pct)` in game.js

Same HP color ternary duplicated at two locations in `openRobotEquipView`.

**Files:**
- Modify: `public/game.js`

**Step 1: Add helper near top of file (with other utility functions)**

```js
function getHpColor(pct) {
  if (pct > 60) return 'var(--hp-green)';
  if (pct > 30) return 'var(--hp-yellow)';
  return 'var(--hp-red)';
}
```

**Step 2: Replace both inline ternaries**

Find both occurrences of:
```js
hpPct > 60 ? 'var(--hp-green)' : hpPct > 30 ? 'var(--hp-yellow)' : 'var(--hp-red)'
```

Replace each with:
```js
getHpColor(hpPct)
```

**Step 3: Syntax check**

```bash
node --check public/game.js && echo "OK"
```

**Step 4: Commit**

```bash
/usr/bin/git add public/game.js && /usr/bin/git commit -m "refactor: extract getHpColor() — deduplicate HP color ternary"
```

---

### Task 8: Extract `buildVocabConfig(req)` utility

18-line vocab-setup block duplicated across `src/routes/game/combat.js` and `src/routes/game/run.js`.

**Files:**
- Create: `src/routes/game/route-helpers.js`
- Modify: `src/routes/game/combat.js`
- Modify: `src/routes/game/run.js`

**Step 1: Create `src/routes/game/route-helpers.js`**

```js
/**
 * Build vocabulary config object from request for dialogue generation.
 * Shared by combat and run routes.
 */
export function buildVocabConfig(req, getUserVocabulary, checkSentenceViolations) {
  const userKeys = req.userKeys || {};
  if (!userKeys.aiApiKey || !getUserVocabulary) return null;

  const { words: vocabulary, vidSet } = getUserVocabulary(req.user.id);
  const vocabSet = new Set(vocabulary);
  const checkViolationsFn = userKeys.jpdbApiKey && checkSentenceViolations
    ? async (text) => checkSentenceViolations(text, vocabSet, userKeys.jpdbApiKey, new Set(), vidSet)
    : null;

  return {
    aiConfig: {
      provider: userKeys.aiProvider || 'anthropic',
      apiKey: userKeys.aiApiKey,
      openaiModel: userKeys.openaiModel,
      openrouterModel: userKeys.openrouterModel,
      jlptLevel: userKeys.jlptLevel || 'N4'
    },
    vocabulary,
    vidSet,
    vocabSet,
    checkViolationsFn
  };
}
```

**Step 2: Import and use in combat.js and run.js**

Replace the inline vocab-setup blocks in both files with:
```js
import { buildVocabConfig } from './route-helpers.js';
// ...
const vocabConfig = buildVocabConfig(req, getUserVocabulary, checkSentenceViolations);
```

Then use `vocabConfig.aiConfig`, `vocabConfig.vocabulary`, etc. where the individual variables were used.

**Step 3: Syntax check both files**

```bash
node --check src/routes/game/route-helpers.js && node --check src/routes/game/combat.js && node --check src/routes/game/run.js && echo "OK"
```

**Step 4: Commit**

```bash
/usr/bin/git add src/routes/game/route-helpers.js src/routes/game/combat.js src/routes/game/run.js && /usr/bin/git commit -m "refactor: extract buildVocabConfig() — deduplicate vocab setup across routes"
```

---

### Task 9: Extract `withAnimationActive(fn)` in combat-loop.js

`if (setCombatAnimationActive) setCombatAnimationActive(true/false)` guard pattern appears 48 times.

**Files:**
- Modify: `public/js/ui/combat-loop.js`

**Step 1: Add wrapper function near top of module (after `init()` assigns callbacks)**

```js
/** Wrap an async combat animation sequence with the animation-active guard. */
async function withAnimationActive(fn) {
  if (setCombatAnimationActive) setCombatAnimationActive(true);
  try {
    return await fn();
  } finally {
    if (setCombatAnimationActive) setCombatAnimationActive(false);
  }
}
```

**Step 2: Wrap the major combat functions**

For each function that uses the guard pattern (`executeRobotPlayerAttack`, `executeRobotDefendThenPause`, `executePlayerAttack`, `executeDefendThenPause`, `executeBefriendAction`, etc.), wrap the body in `withAnimationActive()` and remove all interior guard calls.

Example — before:
```js
async function executeRobotPlayerAttack(...) {
  if (setCombatAnimationActive) setCombatAnimationActive(true);
  try {
    // ... 280 lines of animation code ...
    // scattered: if (setCombatAnimationActive) setCombatAnimationActive(false);
    // scattered: if (setCombatAnimationActive) setCombatAnimationActive(false);
  } catch (error) {
    if (setCombatAnimationActive) setCombatAnimationActive(false);
  }
}
```

After:
```js
async function executeRobotPlayerAttack(...) {
  return withAnimationActive(async () => {
    // ... 280 lines of animation code ...
    // all interior setCombatAnimationActive calls removed
  });
}
```

**Important:** Work through one function at a time. Remove ALL `setCombatAnimationActive` calls inside the wrapped body, including error paths. The `finally` block in `withAnimationActive` handles cleanup.

**Step 3: Syntax check**

```bash
node --check public/js/ui/combat-loop.js && echo "OK"
```

**Step 4: Commit**

```bash
/usr/bin/git add public/js/ui/combat-loop.js && /usr/bin/git commit -m "refactor: extract withAnimationActive() — replace 48 guard pairs with 1 wrapper"
```

---

### Task 10: Consolidate flash card functions in actions.js

`showFlashCard` (62 lines), `showDualFlashCards` (98 lines), `showTripleFlashCards` (119 lines) are 80%+ identical.

**Files:**
- Modify: `public/js/ui/actions.js`

**Step 1: Study all three functions**

Read `public/js/ui/actions.js` fully. Identify the differences between the three functions:
- Card count (1, 2, 3)
- Callback name (`onCardSwipe` vs `onDualCardSelect` vs `onTripleCardSelect`)
- Layout (single card vs flex row)

**Step 2: Create unified `showFlashCards(words, mode, callback)`**

Write a single function that handles 1, 2, or 3 cards. The `mode` parameter (`'single'`, `'dual'`, `'triple'`) controls layout and callback behavior. Reuse the same card rendering, flip, and swipe logic.

**Step 3: Update callers**

Find all call sites of `showFlashCard`, `showDualFlashCards`, `showTripleFlashCards` and update to use `showFlashCards`. Check `public/js/ui/combat-loop.js` and `public/game.js` for callers.

**Step 4: Delete the old three functions**

Remove `showFlashCard`, `showDualFlashCards`, `showTripleFlashCards`. Keep only `showFlashCards`.

**Step 5: Syntax check**

```bash
node --check public/js/ui/actions.js && node --check public/js/ui/combat-loop.js && node --check public/game.js && echo "OK"
```

**Step 6: Commit**

```bash
/usr/bin/git add public/js/ui/actions.js public/js/ui/combat-loop.js public/game.js && /usr/bin/git commit -m "refactor: consolidate 3 flash card functions into 1 parameterized showFlashCards()"
```

---

### Task 11: Phase 1 verification

**Step 1: Full syntax check**

```bash
for f in public/game.js public/js/ui/actions.js public/js/ui/combat-loop.js src/game/loop.js src/routes/game/run.js src/routes/game/combat.js src/routes/game/economy.js src/routes/game/player.js; do node --check "$f" || echo "FAIL: $f"; done && echo "ALL OK"
```

**Step 2: Run unit tests**

```bash
npm run test:unit 2>&1 | tail -10
```

Expected: no NEW failures beyond pre-existing ~48.

**Step 3: Server boot test**

```bash
npm start &
sleep 3
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000
kill %1
```

Expected: HTTP 200.

**Step 4: Merge Phase 1**

```bash
cd /Users/michia/Documents/jrpg
/usr/bin/git checkout master
/usr/bin/git merge refactor/spaghetti-cleanup
```

Do NOT remove the worktree yet — Phase 1.5 and 2 continue on it.

---

## Phase 1.5: Dead Code Audit

### Task 12: Audit dead exports

**Step 1: Generate export inventory**

For each `export function` and `export const` in `src/` and `public/js/`, grep for import sites. Record any with zero callers.

```bash
# Example for one file:
grep -n "export function\|export const\|export async function" src/game/enemies.js
# Then for each export name:
grep -r "importedName" src/ public/js/ --include='*.js' -l
```

**Step 2: Document findings in a kill list**

Create `docs/plans/2026-02-20-dead-code-kill-list.md` with a table:
- Export name | File | Evidence (zero callers / result discarded / etc.)

**Step 3: Commit kill list**

```bash
/usr/bin/git add docs/plans/2026-02-20-dead-code-kill-list.md && /usr/bin/git commit -m "docs: dead code audit kill list"
```

---

### Task 13: Audit dead results and dead wiring

**Step 1: Trace AI/LLM calls**

Check every `chat(` and `aiConfig.chat(` call. Verify the result is used by the consumer (frontend displays it, or backend stores it).

**Step 2: Cross-reference routes with frontend**

Compare every route endpoint in `src/routes/` against `public/js/api.js` fetch calls. Flag routes the frontend never calls.

**Step 3: Check for orphaned DOM wiring**

Grep for `getElementById`, `querySelector` targeting elements that may not exist in `game.html` anymore (chip system remnants, old views).

**Step 4: Add findings to kill list and commit**

---

### Task 14: Review kill list with user, then execute deletions

**Step 1: Present kill list to user for approval**

Some "dead" code may be reachable through dynamic dispatch or debug endpoints. Get explicit approval before deleting.

**Step 2: Delete approved items**

**Step 3: Syntax check + unit tests + server boot**

**Step 4: Commit**

```bash
/usr/bin/git add -A && /usr/bin/git commit -m "refactor: delete dead code identified in audit

[list items deleted]"
```

**Step 5: Merge Phase 1.5**

```bash
cd /Users/michia/Documents/jrpg
/usr/bin/git checkout master
/usr/bin/git merge refactor/spaghetti-cleanup
```

---

## Phase 2: Break Up Monsters

### Task 15: Split `executeRobotPlayerAttack` + `executeRobotDefendThenPause`

These two functions in `public/js/ui/combat-loop.js` total ~490 lines with 95% duplication. Extract shared helpers.

**Files:**
- Modify: `public/js/ui/combat-loop.js`

**Step 1: Read both functions fully**

Read `executeRobotPlayerAttack` (~line 553, 290 lines) and `executeRobotDefendThenPause` (~line 849, 197 lines). Identify the exact duplicated sequences.

**Step 2: Extract `showPlayerAttackSequence(attackResult)`**

Extract the player robot attack animation loop (damage numbers, HP bar updates, KO checks for enemies).

**Step 3: Extract `showEnemyAttackSequence(enemyResult)`**

Extract the enemy attack animation loop (damage to player robots, HP bar updates).

**Step 4: Extract `handleKoSwaps(result)`**

Extract the KO detection and robot swap UI flow.

**Step 5: Rewrite both functions as thin orchestrators**

`executeRobotPlayerAttack`:
```js
return withAnimationActive(async () => {
  const result = await fetchCombatCycle('attack');
  await showPlayerAttackSequence(result);
  await showEnemyAttackSequence(result);
  await handleKoSwaps(result);
  syncCombatState(result);
});
```

`executeRobotDefendThenPause` becomes similar but skips the player attack sequence and passes a defend flag.

**Step 6: Syntax check**

```bash
node --check public/js/ui/combat-loop.js && echo "OK"
```

**Step 7: Commit**

```bash
/usr/bin/git add public/js/ui/combat-loop.js && /usr/bin/git commit -m "refactor: split executeRobotPlayerAttack into composable helpers

Extract showPlayerAttackSequence, showEnemyAttackSequence, handleKoSwaps.
executeRobotDefendThenPause now reuses same helpers (was 95% duplicated)."
```

---

### Task 16: Split `robotCombatCycle` in loop.js

172 lines with 4+ nesting levels and 3 distinct paths.

**Files:**
- Modify: `src/game/loop.js`

**Step 1: Read `robotCombatCycle` fully (starts ~line 698)**

Identify the 3 paths: attack (default), defend, befriend.

**Step 2: Extract `_handleRobotAttackTurn()`**

Move the attack-path logic (player attack → enemy turn → victory check) into a private method. Use `this._flushPendingCaptures()` from Task 5.

**Step 3: Extract `_handleRobotDefendTurn()`**

Move the defend-path logic.

**Step 4: Extract `_handleRobotBefriendTurn()`**

Move the befriend-path logic.

**Step 5: Simplify `robotCombatCycle` to dispatcher**

```js
robotCombatCycle(actionType = 'attack') {
  if (!this.combat?.active) throw new Error('No active combat');
  switch (actionType) {
    case 'attack': return this._handleRobotAttackTurn();
    case 'defend': return this._handleRobotDefendTurn();
    case 'befriend': return this._handleRobotBefriendTurn();
    default: throw new Error(`Unknown action: ${actionType}`);
  }
}
```

**Step 6: Syntax check + unit tests**

```bash
node --check src/game/loop.js && echo "OK"
npm run test:unit 2>&1 | tail -5
```

**Step 7: Commit**

```bash
/usr/bin/git add src/game/loop.js && /usr/bin/git commit -m "refactor: split robotCombatCycle into 3 handler methods (attack/defend/befriend)"
```

---

### Task 17: Extract WhackAMoleGame class

287 lines with 8 nested closures sharing mutable state.

**Files:**
- Create: `public/js/ui/whack-a-mole.js`
- Modify: `public/js/ui/exploration.js`
- Modify: `public/js/ui/index.js`

**Step 1: Read `startWhackAMoleGame` in exploration.js (starts ~line 1163)**

Identify all shared state variables and the 8 helper closures.

**Step 2: Create `public/js/ui/whack-a-mole.js` with WhackAMoleGame class**

Move state to instance properties. Convert closures to methods. Constructor takes `(container, words, onComplete)`.

```js
export class WhackAMoleGame {
  constructor(container, words, onComplete) { ... }
  start() { ... }
  _renderGameUI() { ... }
  _updateTimerDisplay() { ... }
  _updateWordCard() { ... }
  _setTileFaceUp() { ... }
  _flipEvent() { ... }
  _ensureCorrectTileVisible() { ... }
  _endGame() { ... }
}
```

**Step 3: Update exploration.js**

Replace `startWhackAMoleGame(container, words, onComplete)` with:
```js
import { WhackAMoleGame } from './whack-a-mole.js';
// ...
new WhackAMoleGame(container, words, onComplete).start();
```

**Step 4: Add export to `public/js/ui/index.js`**

```js
export * as whackAMole from './whack-a-mole.js';
```

**Step 5: Syntax check**

```bash
node --check public/js/ui/whack-a-mole.js && node --check public/js/ui/exploration.js && echo "OK"
```

**Step 6: Commit**

```bash
/usr/bin/git add public/js/ui/whack-a-mole.js public/js/ui/exploration.js public/js/ui/index.js && /usr/bin/git commit -m "refactor: extract WhackAMoleGame class from 287-line closure nest"
```

---

### Task 18: Extract befriend/NPC route logic into services

`/befriend-answer` (102 lines) and `/npc-dialogue-respond` (92 lines) contain deep business logic that belongs in the service layer.

**Files:**
- Modify: `src/game/services/robot-combat-service.js`
- Modify: `src/routes/game/combat.js`

**Step 1: Read both route handlers fully**

Read `/befriend-answer` (combat.js ~line 321) and `/npc-dialogue-respond` (combat.js ~line 482).

**Step 2: Extract `handleBefriendAnswer()` to robot-combat-service.js**

Move the game-logic body (state validation, answer evaluation, KO handling, collection updates) into a service function. Return a result object the route can serialize.

**Step 3: Extract `handleNpcDialogueResponse()` to a service**

Same pattern — move bond updates, memory logging, dialogue regen into a service function.

**Step 4: Thin out the route handlers**

Routes become ~15-20 lines: validate request → call service → `req.saveGame()` → `res.json()`.

**Step 5: Syntax check + unit tests**

```bash
node --check src/routes/game/combat.js && node --check src/game/services/robot-combat-service.js && echo "OK"
npm run test:unit 2>&1 | tail -5
```

**Step 6: Commit**

```bash
/usr/bin/git add src/routes/game/combat.js src/game/services/robot-combat-service.js && /usr/bin/git commit -m "refactor: extract befriend/NPC answer logic from routes into services"
```

---

### Task 19: Phase 2 verification and merge

**Step 1: Full syntax check**

```bash
for f in $(find public/js/ src/ -name '*.js' -not -path '*/vendor/*' -not -path '*/node_modules/*'); do node --check "$f" 2>/dev/null || echo "FAIL: $f"; done
```

**Step 2: Unit tests**

```bash
npm run test:unit 2>&1 | tail -10
```

**Step 3: Server boot test**

```bash
npm start &
sleep 3
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000
kill %1
```

**Step 4: Playtest core loop**

Using Playwright MCP browser, playtest: start run → encounter → combat (attack + defend) → victory → shop → next room. Verify no regressions in the refactored code paths.

**Step 5: Merge and cleanup**

```bash
cd /Users/michia/Documents/jrpg
/usr/bin/git checkout master
/usr/bin/git merge refactor/spaghetti-cleanup
/usr/bin/git worktree remove ../jrpg-wt-cleanup
/usr/bin/git branch -d refactor/spaghetti-cleanup
```
