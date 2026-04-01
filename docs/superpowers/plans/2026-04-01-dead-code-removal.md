# Dead Code Removal Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove ~1,000 lines of abandoned dead code across 4 independent targets.

**Architecture:** Pure deletion — no behavioral changes. Each target is a self-contained commit. All four targets are independent and can be executed in parallel.

**Tech Stack:** JavaScript (ES modules), CSS

---

## Task 1: Remove Ultimate Attack System (~809 lines)

**Files:**
- Modify: `public/js/ui/combat-effects.js:706-1091` (delete lines 706-1091, the entire ultimate section)
- Modify: `public/js/ui/combat-audio.js:278-633` (delete lines 278-633, ultimate sounds + dispatch table + export)
- Modify: `public/game.css:433-436,438-441,448-450,2873-2889,3196-3319` (delete all ultimate/charged CSS)
- Modify: `public/js/ui/scene.js:211-215` (delete ultimateCharge check)
- Modify: `src/game/loop.js:1464` (delete ultimate stub)
- Modify: `src/game/services/creature-collection-service.js:74` (delete ultimate property)
- Modify: `public/js/ui/combat-loop.js:43` (remove `playUltimateAnimation` from import)
- Modify: `public/js/ui/combat-loop.js:52` (remove `playUltimateSound` from import)
- Modify: `public/game.js:88-89` (remove dead imports)

- [ ] **Step 1: Delete ultimate animation code from combat-effects.js**

Delete lines 706-1091 (everything from `// ============ ULTIMATE ANIMATIONS ============` through the end of `_woodOverlayEffect`). The file should end after the `updateHpCriticalState` function at line 704.

- [ ] **Step 2: Delete ultimate audio code from combat-audio.js**

Delete lines 278-633 (everything from `// ============ ELEMENT ULTIMATE SOUNDS ============` through the `playUltimateSound` export). Keep `ATTACK_SOUNDS` table and `playAttackSound` export — move them up to immediately follow the last attack sound function. The file's export section should only have `playAttackSound`.

Specifically:
- Delete lines 278-585 (5 ultimate sound functions)
- Delete lines 597-603 (`ULTIMATE_SOUNDS` dispatch table)
- Delete lines 625-633 (`playUltimateSound` export function)
- Keep lines 587-595 (`ATTACK_SOUNDS` table) and 605-619 (`playAttackSound`) — these are active

- [ ] **Step 3: Delete ultimate CSS from game.css**

Delete these blocks:
- Lines 433-436: `.formation-slot.charged .formation-romaji` rule
- Lines 438-441: `@keyframes name-charged-glow`
- Lines 448-450: `.formation-sprite.charged` rule
- Lines 2873: `.creature-popup-ultimate` rule
- Lines 2874-2889: `.creature-popup-ultimate-btn` and `:disabled` rules
- Lines 3196-3319: Entire `/* ===== ULTIMATE ANIMATION OVERLAYS ===== */` section (11 classes)

- [ ] **Step 4: Delete ultimate charge check from scene.js**

Delete lines 211-215:
```javascript
    // Charged state
    if (creature.ultimateCharge >= (creature.ultimateChargeMax || 100)) {
      slotEl.classList.add('charged');
      spriteEl.classList.add('charged');
    }
```

- [ ] **Step 5: Delete ultimate stub from loop.js**

Delete line 1464:
```javascript
    capturedCopy.ultimate = { ...captured.ultimate, charges: 0 };
```

- [ ] **Step 6: Delete ultimate property from creature-collection-service.js**

Delete line 74:
```javascript
    ultimate: r.ultimate,
```

- [ ] **Step 7: Clean up imports in combat-loop.js**

Remove `playUltimateAnimation` from the import on line 43 (keep all other imports from combat-effects.js).

Remove `playUltimateSound` from the import on line 52. Since `playAttackSound` is the only remaining import, the line becomes:
```javascript
import { playAttackSound } from './combat-audio.js';
```

- [ ] **Step 8: Clean up dead imports in game.js**

Line 88: Delete the entire line — neither `playAttackSound` nor `playUltimateSound` is used in game.js (combat-loop.js has its own imports).
```javascript
// DELETE: import { playAttackSound, playUltimateSound } from './js/ui/combat-audio.js';
```

Line 89: Remove `playUltimateAnimation` from the import. Keep `screenShake, showXpPopup, showLevelUpPopup, healEffect, poisonApplyEffect, recoil, pop`.

- [ ] **Step 9: Syntax check all modified files**

Run:
```bash
node --check public/js/ui/combat-effects.js && \
node --check public/js/ui/combat-audio.js && \
node --check public/js/ui/scene.js && \
node --check src/game/loop.js && \
node --check src/game/services/creature-collection-service.js && \
node --check public/js/ui/combat-loop.js && \
node --check public/game.js && \
echo "All OK"
```
Expected: "All OK"

- [ ] **Step 10: Commit**

```bash
git add public/js/ui/combat-effects.js public/js/ui/combat-audio.js public/game.css \
  public/js/ui/scene.js src/game/loop.js src/game/services/creature-collection-service.js \
  public/js/ui/combat-loop.js public/game.js
git commit -m "remove: abandoned ultimate attack system (~809 lines)

Ultimate animations, audio synthesis, CSS, and charge UI were fully
built but never triggered — no creature data, no charge logic, no
call sites beyond unused imports."
```

---

## Task 2: Remove Combat End Narration Round-Trip

**Files:**
- Modify: `src/routes/game/combat.js:1-5,14-17,56-82` (delete endpoint + orphaned params + update fileoverview)
- Modify: `src/routes/game/index.js:94` (remove orphaned dep injection)
- Modify: `public/js/ui/combat-loop.js:3260-3364` (restructure entire try/catch block)

**CRITICAL CONTEXT:** The entire post-combat flow (enemy defeat animation, victory/defeat modals, NPC dialogue, post-combat shop) lives inside a try/catch block that wraps the narration fetch. Deleting just the fetch leaves `narrationResult` references at lines 3321 and 3326 which would crash. The whole block must be restructured.

**Stats tracking note:** The endpoint calls `updateGameStatsWithEvent(gameStats, 'combat', ...)` but `updateGameStatsWithEvent` in game-stats.js has no `'combat'` case — it's a no-op. Safe to remove.

- [ ] **Step 1: Delete `/combat-end-narration` endpoint from combat.js**

Delete lines 56-82 (the entire `router.post('/combat-end-narration', ...)` handler).

Update the fileoverview comment on line 4:
```javascript
// Old: * Handles creature combat, befriending, NPC dialogue, and combat-end-narration
// New: * Handles creature combat, befriending, and NPC dialogue
```

Remove orphaned params from `createCombatRoutes` destructuring (lines 15-17):
```javascript
// DELETE these 3 lines from the function signature:
  updateGameStatsWithEvent,
  saveGameStats,
  getGameStats,
```

Also remove `updateGameStatsWithEvent: deps.updateGameStatsWithEvent,` from `src/routes/game/index.js` line 94 (it's only passed for this endpoint). Keep `saveGameStats` and `getGameStats` only if used elsewhere in this file — verify first.

- [ ] **Step 2: Restructure post-combat flow in combat-loop.js**

Replace the entire try/catch block (lines 3260-3364) with the flattened post-combat flow. The code after the dialogue dismiss (line 3258) should become:

```javascript
  // Kana graduation check disabled — kana combat mode disabled (Task 8.1)
  // [keep entire commented block lines 3284-3312 as-is]

  // Animate enemy defeat
  if (result.victory) {
    animateEnemyDefeat();
    playSFX('enemy-defeat');
  }

  // Show victory or defeat modal
  if (result.victory) {
    playSFX('victory');
    const gs = getGameState();
    const isCreatureCombat = gs?.combat?.isCreatureCombat;
    if (isCreatureCombat && gs?.combat?.npcId) {
      await runNpcDialogue();
    }
    if (isCreatureCombat && showPostCombatShop) {
      await showPostCombatShop();
    }
    showVictoryModal(result);
    wordPractice.prefetchCombatWords();
  } else {
    showGameOverModal(result);
  }
```

This removes:
- The `try {` wrapper and fetch call (lines 3260-3277)
- The `narrationResult` variable and checks (lines 3277, 3280-3282, 3321-3328)
- The `} catch { ... }` fallback block (lines 3347-3364) — it was a duplicate of the try block's logic

This keeps:
- Kana graduation commented block (out of scope)
- Enemy defeat animation
- Victory/defeat modals
- NPC dialogue
- Post-combat shop

- [ ] **Step 3: Syntax check**

Run:
```bash
node --check src/routes/game/combat.js && \
node --check src/routes/game/index.js && \
node --check public/js/ui/combat-loop.js && \
echo "All OK"
```

- [ ] **Step 4: Commit**

```bash
git add src/routes/game/combat.js src/routes/game/index.js public/js/ui/combat-loop.js
git commit -m "remove: dead combat-end-narration round-trip

Server endpoint was hardcoded to return null. Frontend called it
after every fight for nothing — a wasted HTTP request per combat.
The stats tracking call was also a no-op (no 'combat' case in
the switch statement). Flattened post-combat flow out of the
now-unnecessary try/catch."
```

---

## Task 3: Remove DM Narration Pipeline (~150 lines)

**Files:**
- Modify: `server.js:467-478,480-506,514-555,557-629` (delete generateGameNarration + helpers)
- Modify: `server.js:110,118,127` (clean up orphaned imports)
- Modify: `server.js:420` (remove from dependency injection)
- Modify: `src/routes/index.js:53` (remove from dep forwarding)
- Modify: `src/routes/game/index.js:82,93` (remove from route factory params)
- Modify: `src/routes/game/run.js:37` (remove unused destructured param)

- [ ] **Step 1: Delete `generateGameNarration` and its helper functions from server.js**

Delete these blocks in order (bottom-up to preserve line numbers):
1. Lines 557-629: `async function generateGameNarration(...)` — the main dead function
2. Lines 514-555: `async function applyVocabRepair(...)` — only called from generateGameNarration
3. Lines 485-506: `function normalizeNarrationRequest(...)` — only called from generateGameNarration
4. Lines 480-483: `const DM_EVENT_ALIASES = ...` — only used in normalizeNarrationRequest
5. Lines 467-478: `function trackNarrationStats(...)` — only called from generateGameNarration

- [ ] **Step 2: Clean up orphaned imports in server.js**

Line 110: Remove `generateNarration` and `getSimpleNarration` from the dm.js import. If nothing else is imported from dm.js, delete the entire import line.

Line 118: Remove `getSuggestionsForNarration` and `addUsedWords` from the vocab-manager.js import (keep other imports like `configureVocabManager`, `getNarrationVocabularyForUser`).

Line 125: Remove `queueTTSPrefetch` from the tts.js import if it's only used inside `generateGameNarration` (line 623). Keep other tts imports.

Line 127: Remove `enforceVocabLimit` from the vocab-repair.js import (keep `checkSentenceViolations`).

Line 97-98: Remove `getJLPTLevels` and `JLPT_GRAMMAR` from the ai-providers.js import (keep `chat`, `getProviders`).

Check line ~113: If `updateGameStatsWithNarration` is only called from `trackNarrationStats` (line 470), remove it from the game-stats.js import (keep `updateGameStatsWithEvent` if used elsewhere in server.js).

- [ ] **Step 3: Remove from dependency injection chain**

In `server.js` ~line 420: Remove `generateGameNarration,` from the `createRoutes()` call.

In `src/routes/index.js` ~line 53: Remove `generateGameNarration: deps.generateGameNarration,` from `createGameRoutes()` call.

In `src/routes/game/index.js` lines 82 and 93: Remove `generateGameNarration: deps.generateGameNarration,` from both `createRunRoutes()` and `createCombatRoutes()` calls.

In `src/routes/game/run.js` line 37: Remove `generateGameNarration,` from the destructured params.

- [ ] **Step 4: Update server.js fileoverview comments**

Remove references to `generateGameNarration`, `applyVocabRepair`, and `trackNarrationStats` from the doc comment at the top of server.js (lines ~40-42, 53, 60).

- [ ] **Step 5: Syntax check**

Run:
```bash
node --check server.js && \
node --check src/routes/index.js && \
node --check src/routes/game/index.js && \
node --check src/routes/game/run.js && \
echo "All OK"
```

- [ ] **Step 6: Commit**

```bash
git add server.js src/routes/index.js src/routes/game/index.js src/routes/game/run.js
git commit -m "remove: abandoned DM narration pipeline (~150 lines)

generateGameNarration() generated AI text + TTS prefetch + word
tracking, but the result was never used — the combat endpoint
that consumed it was hardcoded to return null."
```

---

## Task 4: Remove getLevels / selectLevel (~30 lines)

**Files:**
- Modify: `public/js/api.js:154-176,636-637` (delete function definitions + exports)

- [ ] **Step 1: Delete function definitions from api.js**

Delete lines 154-176 (the `getLevels()` and `selectLevel()` function definitions). These are between `loginWithCredentials()` and `forfeitRun()`.

- [ ] **Step 2: Delete exports from api.js**

Delete lines 636-637:
```javascript
  getLevels,
  selectLevel,
```

- [ ] **Step 3: Syntax check**

Run:
```bash
node --check public/js/api.js && echo "OK"
```

- [ ] **Step 4: Commit**

```bash
git add public/js/api.js
git commit -m "remove: dead getLevels/selectLevel API functions

Superseded by area selection system. No server endpoint exists
for /api/game/levels — these were frontend-only ghosts."
```

---

## Task 5: Run Tests

- [ ] **Step 1: Run full test suite**

```bash
npm test
```

Expected: All tests pass. If any test references removed code (e.g., `generateGameNarration` mocks in test fixtures), those tests need updating.

**Known test files that mock `generateGameNarration`:**
- `tests/unit/routes/game-run-speed-review-room.test.js` — passes `generateGameNarration` in factory setup
- `tests/integration/vocab/discovery-words.test.js` — passes `generateGameNarration` in factory setup
- `tests/unit/game/whack-a-mole.test.js` — passes `generateGameNarration` in factory setup

These test files pass `generateGameNarration` to route factories. After Task 3 removes it from the factory signatures, the extra key is silently ignored by JS destructuring — **tests won't fail**, but the dead mock should be cleaned up for hygiene.

- [ ] **Step 2: Clean up dead mocks in test files**

Remove `generateGameNarration` from the mock dependency objects in all three test files. This is hygiene, not a fix — tests pass either way.

- [ ] **Step 3: Re-run tests to confirm green**

```bash
npm test
```

- [ ] **Step 4: Commit test fixes (if any)**

```bash
git add tests/
git commit -m "test: update fixtures after narration pipeline removal"
```
