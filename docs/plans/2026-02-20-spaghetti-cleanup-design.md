# Spaghetti Cleanup: Extract, Audit, Decompose

**Date:** 2026-02-20
**Goal:** Reduce bug risk and enable faster feature work through a medium-scope refactor: consolidate duplicated code, remove dead systems, and break up the worst monolithic functions.

**Non-goal:** Deep architectural restructure (God class extraction, full service layer for routes). That can come later once this cleanup makes the code legible enough to plan it.

---

## Approach

Bottom-up in 3 phases, each independently valuable:

1. **Phase 1 — Dead Systems + Extract & Consolidate** — Remove confirmed dead code, then extract duplicated blocks into named helpers. Pure mechanical changes, no behavior change.
2. **Phase 1.5 — Dead Code Audit** — With the code now legible, sweep for unreachable functions, dead results, and orphaned wiring. Review kill list before deleting.
3. **Phase 2 — Break Up Monsters** — Split the 4 worst long functions into composable pieces, reusing Phase 1 helpers.

Each phase gets its own worktree branch, merged to master independently.

---

## Phase 1: Dead Systems + Extract & Consolidate

### 1a. Remove Phaser exploration system

**Evidence:** `shouldUsePhaser()` in `public/game.js` returns `false` unconditionally. Comment says "Phaser disabled - using VN-style backgrounds instead."

**Delete:**
- `public/js/phaser/` — 5 files, 921 lines (exploration-scene.js, exploration-controls.js, phaser-bridge.js, exploration-ui.js, index.js)
- `public/js/vendor/phaser.min.js` — 1.1MB vendor bundle

**Edit (remove Phaser refs):**
- `public/game.js` — remove imports (lines 104-105), `shouldUsePhaser()`, `getRoomDataForPhaser()`, `setupPhaserEventListeners()` (78 lines), Phaser branches in `updateUI()`, and all 28 Phaser references
- `public/game.html` — remove Phaser script tag and canvas element
- `public/game.css` — remove Phaser canvas styling

**Impact:** 1.1MB less JS downloaded by every player. ~1,000 lines of dead code removed.

### 1b. Disable dead narration calls

**Evidence:** Frontend discards `narration` from route responses for runStart, encounterStart, and shrine events. The server `await`s a 49-second LLM call whose result is garbage collected.

**Keep:** `src/game/dm.js` and all narration infrastructure intact (buildDmSystemPrompt, DM_PROMPTS, generateNarration). Keep `generateGameNarration` in the dependency injection chain. Combat-end narration path stays (frontend displays it). This infrastructure will be re-enabled when narration is wired to the frontend.

**Edit (remove 6 dead call sites):**
- `src/routes/game/run.js:66` — `generateGameNarration('runStart', ...)` → set `narration = null`
- `src/routes/game/run.js:166` — same (duplicate in levels/select)
- `src/routes/game/run.js:251` — `generateGameNarration('encounterStart', ...)` → set `narration = null`
- `src/routes/game/combat.js:102` — `generateGameNarration('encounterStart', ...)` → set `narration = null`
- `src/routes/game/economy.js:66` — `generateGameNarration('shrine', ...)` → set `narration = null`
- `src/routes/game/player.js:18` — `generateGameNarration('runStart', ...)` → set `narration = null`

**Impact:** Eliminates multiple 10-49 second LLM waits on route responses where the result was discarded.

### 1c. Delete simulation system

**Evidence:** Zero imports in any file. Not wired to any route, test, or script.

**Delete:**
- `src/game/simulation/simulator.js` (370 lines)
- `src/game/simulation/ai-player.js` (160 lines)
- `src/game/simulation/stats.js` (216 lines)

**Impact:** 746 lines removed.

### 1d. Extract `flushPendingCaptures()` in loop.js

**Problem:** Identical 20-line capture-flush block copy-pasted 3 times (lines 715, 901, 1156).

**Fix:** Extract to `_flushPendingCaptures()` private method on GameManager. Call from all 3 locations.

### 1e. Extract `withAnimationActive(fn)` wrapper in combat-loop.js

**Problem:** `if (setCombatAnimationActive) setCombatAnimationActive(true/false)` guard pattern appears 48 times.

**Fix:**
```js
async function withAnimationActive(fn) {
  if (setCombatAnimationActive) setCombatAnimationActive(true);
  try { return await fn(); }
  finally { if (setCombatAnimationActive) setCombatAnimationActive(false); }
}
```

### 1f. Extract `queueBackgroundDialogue(req)` in run.js

**Problem:** Identical 35-line block (build userKeys, call generateMissingDialoguesFn + queueMissingNpcDialoguesFn) duplicated in start-run and levels/select handlers.

**Fix:** Extract to helper function at top of run.js. Call from both routes.

### 1g. Consolidate flash card functions in actions.js

**Problem:** `showFlashCard` (62 lines), `showDualFlashCards` (98 lines), `showTripleFlashCards` (119 lines) are 80%+ identical — same swipe handlers, click handlers, state setup. Only card count differs.

**Fix:** Consolidate into `showFlashCards(words, mode)` with parameterized card count. ~317 lines → ~120 lines.

### 1h. Extract `buildVocabConfig(req)` utility

**Problem:** 18-line vocab-setup block (build userKeys, get vocabulary, construct vocabSet, build checkViolationsFn) duplicated across `src/routes/game/combat.js` and `src/routes/game/run.js`.

**Fix:** Extract to shared utility in `src/routes/game/` or a small helpers file. Import from both routes.

### 1i. Extract `getHpColor(pct)` helper in game.js

**Problem:** Same HP color ternary duplicated at lines 993 and 1011.

**Fix:**
```js
function getHpColor(pct) {
  if (pct > 60) return 'var(--hp-green)';
  if (pct > 30) return 'var(--hp-yellow)';
  return 'var(--hp-red)';
}
```

---

## Phase 1.5: Dead Code Audit

With Phase 1 done and the code more legible, sweep for three categories:

### Category A — Dead functions
Grep every `export function` and `module.exports` in `src/` and `public/js/`. For each export, verify something imports/calls it. Delete orphans.

**Known targets from scan:**
- `getEnemyDisplayStats()` in enemies.js — zero callers
- `transformEnemy()` in enemies.js — zero callers
- `getRoomDescription()` in lorebook — zero callers

### Category B — Dead results
Trace every expensive async operation to verify the frontend uses the result. Look for:
- AI/LLM calls where the response is assigned but never consumed
- Async fire-and-forget calls that error silently
- Route responses with fields the frontend ignores

**Known target:** Verify combat-end narration box actually displays during playtest. If not, disable that call too.

### Category C — Dead wiring
- Route endpoints the frontend never calls (cross-reference `api.js` exports with frontend fetch calls)
- Event listeners bound to DOM elements that no longer exist (chip system remnants)
- CSS selectors matching nothing in current HTML

**Output:** A kill list with evidence for each item. Review together before deleting — some "dead" code may be reachable through dynamic paths (Phaser events, debug endpoints, etc.).

---

## Phase 2: Break Up Monsters

### 2a. Split `executeRobotPlayerAttack` + `executeRobotDefendThenPause` in combat-loop.js

**Problem:** `executeRobotPlayerAttack` is 290 lines mixing fetch, animation, UI, and state. `executeRobotDefendThenPause` (197 lines) is 95% identical.

**Fix:** Extract shared helpers:
- `showPlayerAttackSequence(attackResult)` — player robot attack animations
- `showEnemyAttackSequence(enemyResult)` — enemy attack animations + HP updates
- `handleKoSwaps(result)` — KO detection and robot swap UI
- `syncCombatState(result)` — state update + UI refresh

Both functions become thin orchestrators calling the same helpers. ~490 lines of duplication → ~200 lines of shared helpers.

### 2b. Split `robotCombatCycle` in loop.js

**Problem:** 172 lines with 4+ nesting levels. Three distinct paths (attack/defend/befriend) interleaved with shared victory logic.

**Fix:** Extract `_handleRobotAttack()`, `_handleRobotDefend()`, `_handleRobotBefriend()` as private GameManager methods. Main function becomes a dispatcher: validate state → delegate to handler → flush captures (Phase 1d helper) → return result.

### 2c. Extract WhackAMoleGame class from exploration.js

**Problem:** `startWhackAMoleGame` (287 lines) defines 8 nested closures sharing mutable outer state (score, timeLeft, tiles, gameOver).

**Fix:** Extract to `WhackAMoleGame` class. State moves to instance properties. Closures become methods. Entry point becomes `new WhackAMoleGame(container, words, onComplete).start()`.

### 2d. Extract befriend/NPC route logic into service functions

**Problem:** `/befriend-answer` (102 lines) and `/npc-dialogue-respond` (92 lines) in combat.js contain deep business logic — game state mutations, KO handling, bond updates, dialogue regen — that belongs in the service layer.

**Fix:**
- Move befriend-answer body to `handleBefriendAnswer(combat, roundIndex, selectedIndex)` in `src/game/services/robot-combat-service.js`
- Move npc-dialogue-respond body to `handleNpcDialogueResponse(combat, npcId, selectedIndex)` in a service
- Routes become 15-20 line shells: validate → delegate → respond

---

## Verification Strategy

After each phase:
1. `node --check` every edited JS file
2. `npm run test:unit` — no new failures beyond pre-existing ~48
3. Server boot test (`npm start`, verify with curl)
4. Orphan grep for broken imports

After Phase 2, playtest the core loop (start run → encounter → combat → victory → shop → next room) to verify no regressions.

---

## Risk Notes

- **Phase 1 is near-zero risk** — extracting identical code and deleting unreachable systems. Each commit is independently revertable.
- **Phase 1.5 requires human review** of kill list before deletion. Some "dead" code may be reachable through dynamic dispatch or debug endpoints.
- **Phase 2 changes behavior boundaries** — the same logic runs but through different function call paths. Playtest required after merge.
- **Flash card consolidation (1g)** is the highest-risk Phase 1 item since it changes function signatures. Test card interactions (single/dual/triple) after.
- **All deleted code recoverable** from git history.
