# Combat Loop Strangler Fig Refactoring

**Date:** 2026-04-15
**Status:** Approved
**Problem:** `public/js/ui/combat-loop.js` is 3,653 lines doing 6 unrelated jobs with 55 shared mutable variables. It accounts for 25 of 88 fix commits in the last two weeks — nearly 2 bug fixes per day in a single file. The structural problems (implicit state sharing, no phase boundaries, interleaved concerns) make every bug fix risk introducing new regressions.

## Approach: Incremental Strangler Fig Extraction

Based on research from Fowler (Extract Class, Strangler Fig), Spolsky (never rewrite from scratch), and game development literature (State pattern for game loops), we extract modules from the edges inward. Each extraction is two commits: a pure **move** (cut-paste + wire delegation) then a **simplify** (clean up the now-isolated code). This keeps the game working at every step and makes regressions easy to diagnose.

## Hotspot Analysis (Evidence)

Two-week git history (2026-04-01 to 2026-04-15):

| Metric | Value |
|--------|-------|
| Total commits | 467 |
| Fix commits | 88 (19% of all work) |
| Fix touches on combat-loop.js | 25 (highest of any file) |
| Top 5 files | 0.6% of codebase, 43% of fix touches |

Recurring bug patterns in combat-loop.js:
- **Sprite visibility / ghost elements** (15 fixes) — no single source of truth for what should be on screen
- **State sync / stale state** (15 fixes) — client, server, and PixiJS layer each track state independently
- **Sequencing / ordering** (22 fixes) — implicit ordering via nested async chains
- **Tutorial conflicts** (6 fixes) — CID narration competing with game events

## Extraction Order

Easiest and most independent first, working inward toward the core:

### Extraction 1: `befriend.js` (~590 lines)

**Source lines:** 2763–3110 (`renderBefriendQuiz` + helpers) and 3111–3363 (`executeBefriendAction` + conversation flow)

**Contains:**
- `renderBefriendQuiz` — Fight/Talk choice, name quiz, tutorial Cid overlay
- `executeBefriendAction` — 3-round befriend conversation loop
- `showBefriendReleasePrompt`, `showBefriendTargetSelect`
- `showConversationRound`, `showAnswerFeedback`
- Befriend enemy attack retaliation on wrong answer

**Why first:** Nearly self-contained. Shares narration callbacks and game state getters with the rest, but doesn't participate in the turn loop or attack card system. The quiz and conversation are two phases of the same feature — splitting them would create unnecessary cross-imports.

**State ownership:** Stateless. Receives everything via function arguments.

### Extraction 2: `kana-combat.js` (~90 lines)

**Source lines:** 789–882

**Contains:**
- `startKanaCombatRound`, `fetchKanaCard`, `submitKanaReview`
- `handleKanaSwipe`, `isKanaRoundInProgress`
- `pickCheapestMove`

**Why second:** Entirely separate combat mode with zero entanglement to the main turn loop. Smallest extraction — quick confidence builder.

**State ownership:** `kanaSwipeResolve`, `kanaSwipeDirection` (2 variables move out of combat-loop).

### Extraction 3: `attack-card.js` (~400 lines)

**Source lines:** 158–563

**Contains:**
- `buildSplitAttackCard` (player, enemy, NPC variants)
- `insertAttackCard`, `insertNpcAttackCard`
- `waitForCardTap`
- `showAttackCardAndWait`, `showAttackDisplay`, `showAttackPartySkillProcs`
- Card HTML helpers (`actionIconPath`, `wrapWithRuby`, `escHtml`)

**Why third:** Pure UI rendering with no game logic. Sprite visibility bugs cluster here because card rendering and effect playback are interleaved in the same file. Extracting forces a clean boundary between "build the card" and "play the effects."

**State ownership:** None. Pure functions that build HTML and return elements.

### Extraction 4: `combat-vfx.js` (~560 lines)

**Source lines:** 60–157 (Pixi adapter functions) and 1561–2120 (shared combat helpers)

**Contains:**
- `impactEffect`, `fireCreatureAttackEffect`, `enemyCreatureAttackEffect`
- `showOneEnemyAttackAnimated`, `showEnemyAttacksAnimated`
- `showNpcSkillAttacksAnimated`
- `showOneCounterAttackAnimated`, `showCounterAttacks`
- `showKoSwapAnimations`
- `showEffectEvents`, `showMoveEffectsApplied`
- HP bar sync helpers (`updateCreatureHpBars`, `buildAllyHpMap`, `buildEnemyHpMapForPlayerAttacks`)
- Status icon sync (`syncStatusIconsFromResult`, `syncStatusForCreature`)
- `showFloatingText`, `showRoundStartEvents`

**Why fourth:** This is where "ghost sprite" and "state sync" bugs live. These functions currently reach into module-level variables for enemy/ally data. Extracting forces them to receive state as explicit parameters, eliminating the implicit coupling that causes sync bugs.

**State ownership:** None. Pure effects that take parameters and fire animations.

### Extraction 5: `npc-dialogue-ui.js` (~130 lines)

**Source lines:** 3525–3653

**Contains:**
- `showNpcGreeting`, `runNpcDialogue`, `isNpcDialogueActive`
- `showBondFeedback`, `showBondSummary`

**Why fifth:** Small, independent post-combat feature that was dumped at the bottom of combat-loop.js. No relationship to combat turns.

**State ownership:** `npcDialogueActive` (1 variable moves out).

### No Extraction: Coordinator Restructure (~1,600 lines)

After all extractions, `combat-loop.js` retains:
- Module state for turn sequencing (~20 variables, down from 55)
- `init()`, `startCombatLoop`, `executePlayerAttack`
- Move selection UI (`initMoveUI`, `startMoveSelection`, `promptNextCreature`, `handleMoveSelected`, `handleTargetSelected`, `handleDefendSelected`)
- `stopCombatLoop`
- Initiative orchestrators (`executeMoveTurn`, `buildMergedInitiativeAttacks`)
- `syncFinalState`
- State getters (`isCombatActive`, `isCombatPausedForVocab`, `cleanupCombat`)

Clean up in place during the final simplify pass. No further extraction needed — this is genuinely one concern (turn sequencing).

## Module Communication

### Before (Monolith)
Every function reads and mutates 55 shared module-level variables and 25 injected callbacks. Changing state in the befriend flow silently affects the turn loop.

### After (Explicit Interfaces)
```
combat-loop.js (coordinator)
  ├── befriend.js        → befriend.startQuiz(ctx), befriend.executeTalk(ctx)
  ├── attack-card.js     → attackCard.build(atk), attackCard.waitForTap(el)
  ├── combat-vfx.js      → vfx.impactEffect(opts), vfx.showEnemyAttacks(opts)
  ├── kana-combat.js     → kana.startRound(ctx), kana.handleSwipe(dir)
  └── npc-dialogue-ui.js → npcDialogue.showGreeting(data), npcDialogue.runDialogue(ctx)
```

**Key rule:** Extracted modules receive what they need as function arguments, not by reaching into shared state.

```js
// Before: reads module-level variables
async function renderBefriendQuiz(quizData, result) {
  const state = getGameState();        // module-level callback
  if (!combatActive) return;           // module-level flag
  await narration.showNarration(...);  // module-level callback
}

// After: receives only what it uses
export async function startQuiz(quizData, result, { getGameState, narration, showFormation, hideEnemy }) {
  const state = getGameState();
  // caller decides whether combat is active — this function doesn't know
}
```

**Dependency flow is strictly one-directional.** No extracted module imports another extracted module. No circular dependencies. The coordinator is the only file that knows the full picture.

### State Distribution After Extraction

| Module | State It Owns |
|--------|--------------|
| `kana-combat.js` | `kanaSwipeResolve`, `kanaSwipeDirection` |
| `npc-dialogue-ui.js` | `npcDialogueActive` |
| `befriend.js` | none — stateless, receives everything via args |
| `attack-card.js` | none — pure rendering |
| `combat-vfx.js` | none — pure effects |
| `combat-loop.js` | ~20 remaining turn-sequencing variables + injected callbacks |

## Two-Commit Discipline

Every extraction follows Fowler's two-commit pattern:

1. **Move commit** — Pure cut-and-paste into the new file. The old file delegates to the new module via imports. Zero behavior changes. All existing tests must pass unchanged. If any test breaks, the wiring is wrong — fix the wiring, not the test.

2. **Simplify commit** — Now that the code is isolated, clean up:
   - Delete the stale `@file` JSDoc header from both the extracted module and the updated `combat-loop.js`. These headers describe an older version of the code and actively mislead. Don't replace them — the module name and exports speak for themselves.
   - Dead code paths that existed because everything was in one file
   - State variables that were shared but only used by one concern
   - Overly defensive null checks from implicit caller/callee contracts
   - Duplicate logic (e.g., HP map building)
   - Verbose patterns that collapse once scope is smaller

If something breaks after the move, it was the wiring. If something breaks after the simplify, it was the cleanup. No ambiguity.

## Testing Strategy

### Existing Tests (Gate)
All existing unit and integration tests must pass after every commit. The move commits are pure structural changes — broken tests mean broken wiring.

### New Unit Tests (Per Module)

| Module | What To Test |
|--------|-------------|
| `attack-card.js` | `build()` returns correct HTML for player/enemy/NPC cards. `waitForTap()` resolves on click. |
| `kana-combat.js` | `startRound()` fetches card and sets up swipe handler. `handleSwipe()` submits review and picks cheapest move. |
| `befriend.js` | `startQuiz()` shows Fight/Talk, returns choice. `executeTalk()` runs 3-round conversation, handles correct/wrong. |
| `combat-vfx.js` | `impactEffect()` calls correct tier of shake/particles/damage for given damage/maxHp ratios. |
| `npc-dialogue-ui.js` | `runDialogue()` shows rounds, emits bond feedback, returns summary. |

Each module takes explicit arguments, so tests pass test data directly with minimal mocking.

### New Integration Tests (Cross-Module Flows)

These exercise the coordinator's wiring across module boundaries — the exact seam where our recurring bugs live:

| Flow | What It Tests |
|------|--------------|
| **Basic combat cycle** | Start → select move → player attacks → enemy attacks → next turn. Verifies coordinator wires attack cards, VFX, and HP sync correctly. |
| **Befriend mid-combat** | Enemy below 50% → quiz triggers → Talk → name quiz → creature joins. Verifies befriend.js hands control back to coordinator cleanly. |
| **KO + swap** | Ally dies → KO animation → reserve swaps in → combat continues. The dead-sprites-reappear bug pattern. |
| **Combat end** | Last enemy defeated → victory narration → XP → post-combat shop. Verifies stopCombatLoop transitions out correctly. |
| **NPC skill + counter** | NPC fires skill → counter procs → HP syncs for both. The counter-fires-twice bug pattern. |

Integration tests import `combat-loop.js` with lightweight stubs for DOM and PixiJS. Assertion pattern: after a sequence of actions, verify functions were called in the correct order with correct arguments.

### Syntax Check (Fast Feedback)
After every edit:
```bash
node --check public/js/ui/combat-loop.js && node --check public/js/ui/befriend.js && echo "OK"
```

### Manual Playtest (Milestones)
Full combat encounter in Playwright after extractions #1 (befriend — biggest move) and #3 (attack cards — most wiring changes). Not after every extraction.

## End State

**Before:** 1 file, 3,653 lines, 6 jobs, 55 shared mutable variables, untestable in isolation.

**After:** 6 files, each doing 1 job, shared state only in the coordinator, independently testable:

```
public/js/ui/
  combat-loop.js        ~1,600 lines  (turn sequencing coordinator)
  befriend.js           ~590 lines    (befriend quiz + conversation)
  attack-card.js        ~400 lines    (card rendering)
  combat-vfx.js         ~560 lines    (effects + HP sync)
  kana-combat.js        ~90 lines     (kana combat mode)
  npc-dialogue-ui.js    ~130 lines    (post-combat NPC dialogue)
```

Total lines will decrease during simplify passes as dead code and duplication are removed. The exact reduction depends on what the simplify passes find.

## Risks and Mitigations

| Risk | Mitigation |
|------|-----------|
| Move commit breaks subtle async timing | Two-commit discipline isolates move from simplify. Syntax check + full test suite after each. |
| Extracted module needs state it doesn't have | The ctx argument pattern means the coordinator passes what's needed. If a module reaches for something it shouldn't, that's a design signal to rethink the boundary. |
| PvE/PvP parity breaks during extraction | combat-vfx.js and attack-card.js serve both modes. Extraction preserves this — the coordinator calls the same module functions for both. Integration tests cover both paths. |
| Simplify pass removes something that was actually needed | Simplify is its own commit, so revert is trivial. Tests catch regressions. |

## References

- [Things You Should Never Do, Part I — Joel Spolsky](https://www.joelonsoftware.com/2000/04/06/things-you-should-never-do-part-i/)
- [Refactoring: This Class Is Too Large — Martin Fowler](https://martinfowler.com/articles/class-too-large.html)
- [Extract Class — Refactoring.guru](https://refactoring.guru/extract-class)
- [Strangler Fig Pattern — Wikipedia](https://en.wikipedia.org/wiki/Strangler_fig_pattern)
- [State Pattern — Game Programming Patterns (Robert Nystrom)](https://gameprogrammingpatterns.com/state.html)
- [Strangler Fig Pattern — Shopify Engineering](https://shopify.engineering/refactoring-legacy-code-strangler-fig-pattern)
