# loop.js Breakup Design Spec

## Problem

`src/game/loop.js` is a 2,026-line god class (`GameManager`) that handles combat turn resolution, befriending, creature management, meta-progression, state serialization, exploration delegation, and lifecycle management. The combat methods alone are ~1,400 lines with severe internal duplication:

- **Element-drop collection** block (18 lines) copy-pasted **6 times** across every combat exit path
- **KO swap/removal** loop (17 lines) copy-pasted **4 times** in GameManager (attack:1048, defend:1221, befriend:1401, befriend-quiz:1846) plus a simplified variant in `swapCreature` (1560) and a **5th full copy** inline in the `befriend-talk` route handler (`combat.js:336-350`)
- **Defeat check + pending captures save** block (35 lines) copy-pasted **3 times**
- **Victory cleanup** (mark room, track boss, increment encounters) copy-pasted across all victory paths

Additionally, `src/pvp/pvp-combat.js` (310 lines) reimplements KO handling and win-condition checking independently, violating PvE/PvP parity. Both systems use the same low-level functions from `creature-combat-service.js` but orchestrate them differently.

The exploration side was already extracted to `ExplorationService`, but GameManager retains ~20 one-liner pass-through methods (~120 lines) that just forward calls.

## Goals

1. Eliminate duplicated combat resolution logic — each pattern exists exactly once
2. PvP consumes the same resolution helpers as PvE
3. GameManager becomes a thin coordinator (~470 lines) with two services doing the work
4. Routes call services directly instead of going through pass-throughs

## Non-Goals

- Frontend combat deduplication (already completed in a previous remediation)
- Changing the public API shape that routes consume (method names stay the same, just on the service instead of the manager)
- Refactoring `creature-combat-service.js` or `exploration-service.js` internals

## Architecture

### New file: `src/game/combat/resolution.js`

Shared pure/near-pure helper functions consumed by both PvE (`CombatCycleService`) and PvP (`pvp-combat.js`).

```js
/**
 * Process KO'd creatures — swap reserves in or permanently remove.
 * Returns raw data; callers format for their response shape.
 *
 * PvE callers map to: { slot, replacement: nameEn }
 * PvP callers map to: { side, index, replacement: creatureObject }
 *
 * Also compacts the allies array in-place (removes null slots).
 *
 * @param {object[]} allies - Active creature array (mutated: nulls compacted)
 * @param {object} party - creatureParty object with active/reserves
 * @returns {{ koSwaps: Array<{index: number, replacement: object}>, koRemovals: Array<{index: number, name: string}> }}
 */
export function processKOSwaps(allies, party) { ... }

/**
 * Check if all creatures on a side are defeated.
 * @param {object[]} creatures
 * @returns {boolean}
 */
export function checkAllDefeated(creatures) { ... }

/**
 * Collect element drops from defeated enemies into meta-progression and run summary.
 * No-op if meta is null.
 * @param {object|null} meta - Meta-progression state
 * @param {object[]} enemies - Enemy creatures
 * @param {object|null} runSummary - Run summary for adventure report tracking
 */
export function collectElementDrops(meta, enemies, runSummary) { ... }

/**
 * End-of-combat victory cleanup: mark room interacted, increment encounters,
 * handle boss defeat tracking and narration.
 * @param {object} combat - Combat state
 * @param {object} run - Run state
 * @param {object} opts - { narrate?: Function, meta?: object }
 */
export function finalizeCombatVictory(combat, run, opts = {}) { ... }

/**
 * Save pending captures to permanent collection and end the run on defeat.
 * @param {object} combat - Combat state
 * @param {object} run - Run state
 * @param {object|null} meta - Meta-progression
 * @param {object} opts - { onDefeat?: Function }
 */
export function resolveDefeat(combat, run, meta, opts = {}) { ... }

/**
 * Build the elementDropsCollected array for the combat result payload.
 * @param {object[]} enemies
 * @returns {string[]} Element names
 */
export function getElementDropList(enemies) { ... }
```

### New file: `src/game/services/combat-cycle-service.js`

Owns all combat turn resolution, befriend flow, and creature swapping. Constructed with a reference to the GameManager (same pattern as `ExplorationService`).

**Methods moved from GameManager:**

| Method | GameManager line | Notes |
|--------|---------------:|-------|
| `startCreatureEncounter()` | 537 | |
| `creatureCombatCycle(actionType, moveChoices)` | 704 | Dispatcher only |
| `_handleCreatureAttackTurn(effectEvents, moveChoices)` | 730 | Uses resolution helpers |
| `_handleCreatureDefendTurn(effectEvents)` | 1193 | Uses resolution helpers |
| `_handleCreatureBefriendTurn(effectEvents)` | 1304 | Uses resolution helpers |
| `swapCreature(activeIndex, reserveIndex)` | 1532 | |
| `rearrangeCreatures(indexA, indexB)` | 1607 | |
| `swapCreatureOutOfCombat(activeIndex, reserveIndex)` | 1636 | |
| `befriendReplace(releaseCreatureId)` | 1660 | Uses resolution helpers |
| `getBefriendQuiz()` | 1771 | |
| `handleBefriendQuizAnswer(answerId)` | 1786 | Uses resolution helpers |
| `handleBefriendFight()` | 1884 | Uses resolution helpers |
| `_flushPendingCaptures()` | 668 | Private, called by victory paths |
| `rollPostCombatShop()` | 1483 | |
| `selectShopItem(itemIndex, targetIndex)` | 1497 | |

**Dead code to remove during extraction:**

| Method/Route | Location | Notes |
|--------|----------|-------|
| `completeNpcDialogue()` | loop.js:655 | Zero callers — dead code, remove |
| `debugForceCombat` route | misc.js:47 | Calls nonexistent GameManager method — remove dead route |

**Route-level combat logic to absorb:**

The `befriend-talk` handler in `combat.js:330-370` contains a full inline copy of the KO swap/removal + defeat check pattern. This must be replaced with a `CombatCycleService` method (e.g., `handleBefriendTalkRejection`) so the route becomes a thin caller. Similarly, `swapCreature` (loop.js:1560) has a simplified KO variant that should use `processKOSwaps` once extracted.

The service accesses `this.gm.combat`, `this.gm.run`, `this.gm.meta`, `this.gm.userId` through the manager reference, same as `ExplorationService` accesses `this.gm.run`.

### Modified file: `src/pvp/pvp-combat.js`

Replace inline KO handling (lines 254-289) and win-condition check (lines 291-296) with shared helpers:

```js
import { processKOSwaps, checkAllDefeated } from '../game/combat/resolution.js';

// Replace ~35 lines with:
const { koSwaps: koSwapsA, koRemovals: koRemovalsA } = partyA
  ? processKOSwaps(sideA, partyA, { sideLabel: 'sideA' })
  : { koSwaps: [], koRemovals: [] };
const { koSwaps: koSwapsB, koRemovals: koRemovalsB } = partyB
  ? processKOSwaps(sideB, partyB, { sideLabel: 'sideB' })
  : { koSwaps: [], koRemovals: [] };

const allADead = checkAllDefeated(sideA);
const allBDead = checkAllDefeated(sideB);
```

`processKOSwaps` returns `{ index, replacement: creatureObject }` for swaps and `{ index, name }` for removals. Callers map to their response format:
- PvE maps `{ index }` → `{ slot: index }` and `replacement` → `replacement.nameEn`
- PvP maps `{ index }` → `{ side: 'sideA', index }` and keeps the full object

The function also compacts the array in-place (filters nulls), unifying PvE's `.filter()` reassignment and PvP's backward-splice approach into one consistent behavior.

### Modified file: `src/game/loop.js`

**After extraction, GameManager retains:**

- Constructor + service initialization (~15 lines)
- `initMeta`, `getMeta` (~15 lines)
- `updateLifetimeStats`, `_onRunDefeat`, `checkAchievements` (~80 lines)
- `onNarration`, `onStateChange`, `narrate`, `emitState` (~30 lines)
- `getState`, `getPhase` (~95 lines)
- `createPlayer`, `loadPlayer` (~15 lines)
- `startRun`, `confirmCreatures` (~70 lines)
- `skipShop` (~5 lines — the one non-delegated shop method)
- `exposeWords` (~20 lines)
- `forfeitRun`, `reset`, `fullReset` (~55 lines)
- Imports (~35 lines)
- `applyDebugSuperAttack` (standalone function, stays as export, ~8 lines)

**Estimated size: ~470 lines** (includes imports and standalone export).

Pass-through methods for ExplorationService (lines 410-528) are removed. Routes updated to call `gm.explorationService.methodName()` directly — precedent already exists at `run.js:223` and `run.js:238`.

**Note:** `getState()` calls `this.settleSpeedReviewRoomPendingRewards()` at line 213, which delegates to `explorationService`. After removing pass-throughs, this call in `getState()` changes to `this.explorationService.settleSpeedReviewRoomPendingRewards()`.

Combat pass-throughs are added for CombatCycleService, following the same delegation pattern:
```js
// Routes call gm.combatCycleService.startCreatureEncounter() directly
// No pass-throughs needed on GameManager
```

### Route changes

**`src/routes/game/combat.js`** — 11 call sites change from `gameManager.method()` to `gameManager.combatCycleService.method()`:
- Lines 59, 126, 178, 190, 203, 216, 229, 242, 255, 268, 280
- Lines 178 (`rollPostCombatShop`) and 190 (`selectShopItem`) were missing from the original count
- Lines 330-370: inline KO handling in `befriend-talk` handler → replace with service method call

**`src/routes/game/run.js`** — Exploration calls change to `gameManager.explorationService.method()`:
- Lines 156, 167, 209, 250, 285, 325, 341, 356, 526, 543, 573, 590, 680, 708, 720, 788

**`src/routes/game/economy.js`** — 4 dealer calls change:
- Lines 22, 34, 47, 59

**`src/routes/game/misc.js`** — 4 `selectArea` calls change:
- Lines 81, 94, 106, 137

**`src/routes/game/combat.js:563`** — 1 `getCurrentRoom` call changes to `explorationService`

**`src/routes/game/run.js`** — Additional `getCurrentRoom` calls at lines 250, 285, 720, 788 (via `gm.getCurrentRoom()`)

## Execution Strategy

Same proven pattern as the combat-loop strangler fig: incremental commits, each independently shippable.

**Phase 1: Shared resolution helpers** (2-3 commits)
1. Create `resolution.js` with all helpers, add unit tests
2. Wire PvE (`loop.js`) to use helpers — each turn method shrinks
3. Wire PvP (`pvp-combat.js`) to use `processKOSwaps` + `checkAllDefeated`

**Phase 2: CombatCycleService extraction** (2 commits)
4. Create `combat-cycle-service.js`, move combat methods — pure move
5. Simplify: clean up the service internals now that helpers are in use

**Phase 3: GameManager cleanup** (2 commits)
6. Remove exploration pass-throughs, update routes
7. Remove combat pass-throughs (if any were added as temporary scaffolding), update routes

## Testing Strategy

- **Unit tests** for `resolution.js` helpers — these are pure functions, easy to test in isolation
- **Seam tests** for `CombatCycleService` — verify the service produces correct combat results through the same scenarios the existing tests cover
- **Existing integration tests** continue to pass at every commit — they call through routes, which call through the manager, so the internal restructuring is transparent
- **When test infrastructure is ready**: integration tests for combat flows will exercise the full stack through HTTP

## Risks

- **Route middleware pattern**: Routes access `req.gameManager` which is set by middleware. The services are properties on the manager, so `req.gameManager.combatCycleService` works without middleware changes.
- **`this` references**: The turn methods currently use `this.combat`, `this.run`, `this.meta` directly. In the service, these become `this.gm.combat`, etc. Mechanical but must be thorough — every reference must be updated.
- **`emitState()` calls**: Several combat methods call `this.emitState()`. The service needs to call `this.gm.emitState()`. Same for `this.narrate()`, `this.exposeWords()`.
- **Route-level combat logic**: The `befriend-talk` handler in `combat.js:330-370` runs its own enemy turn + KO handling inline. This needs to become a service method or the duplication survives the extraction. The route also imports `processEnemyTurn` and `handleCreatureKO` directly — those imports should be removed once the logic moves to the service.
