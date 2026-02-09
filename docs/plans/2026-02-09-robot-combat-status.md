# Robot Combat Wiring — Status Report

**Date:** 2026-02-09
**Branch:** `feature/robot-combat`
**Worktree:** `/Users/michia/Documents/jrpg/.worktrees/robot-combat`

---

## What Was Done

### Problem
The robot combat system was built across 11 commits (data, services, GameManager methods, API routes, frontend UI) but was completely disconnected from the live game flow. Playing the game still ran old chip-based combat because the frontend never called the robot endpoints.

### Wiring Fixes (5 committed)

1. **`0f99e23` — Wire starter selection into level-select flow**
   - `public/js/api.js`: `selectLevel()` accepts optional `starterId`
   - `public/js/ui/exploration.js`: Level card click → fetch starters → show selection → pass starterId to API
   - `public/game.js`: Pass `apiGetStarters` and `showStarterSelection` callbacks to exploration.init()

2. **`3ec2a0d` — Route combat entry to robot endpoint**
   - `public/game.js`: `startEncounter()` checks `robotParty.active.length > 0` and calls `apiStartRobotEncounter()` instead of old chip endpoints
   - Skips possessed dialogue for robot encounters

3. **`94e5dd3` — Robot combat loop with attack, defend, and routing**
   - `public/js/ui/combat-loop.js`: Added `executeRobotPlayerAttack()` and `executeRobotDefendThenPause()`
   - `resumeCombatAfterVocab()` routes to robot or chip combat based on `state.combat.isRobotCombat`
   - Robot cycle processes both player AND enemy phases in one API call (unlike chip combat's separate calls)

4. **`d257448` — HP bar hiding + encounters-only rooms**
   - `public/game.js`: `updatePlayerHP()` hides HP bar when robot party active
   - `src/game/rooms.js`: Thread `encountersOnly` parameter through room generation
   - `src/game/services/exploration-service.js`: Pass `encountersOnly` to `generateFloorRooms`
   - `src/game/loop.js`: Set `encountersOnly = true` when starterId provided

5. **`60cf588` — Skip starting chip shop in robot combat**
   - `src/game/loop.js`: Skip chip shop generation when `starterId` provided (chips irrelevant in robot combat)
   - Fixed bug where `startingChipShop.active = true` caused `renderWardSelection` to early-return, leaving starter screen stuck

### Uncommitted Fixes (6 files changed)

These are fixes found during verification testing. **Not yet committed.**

#### `src/game/loop.js` — Robot combat victory: mark room interacted + boss defeated
- When `robotCombatCycle` detects all enemies defeated, now marks `currentRoom.interacted = true`
- If room is a boss room, sets `run.bossDefeated = true` (triggers `floor_complete` phase via phase machine)
- Without this, boss defeats left the game stuck in `boss_ready` phase

#### `src/game/services/combat-service.js` — Boss encounters use robot combat when robot party exists
- `startBossEncounter()` now detects `robotParty.active.length > 0`
- Creates a robot-compatible boss wrapper with `autoSkill` (power: 100), `element`, `ultimate`, `id`
- Sets `combat.allies`, `combat.enemies`, `combat.isRobotCombat = true`
- Without this, boss fights used old chip combat where robot players deal 0 damage (no chips)

#### `src/routes/game/combat.js` — Combat end narration: handle robot enemies
- `combat-end-narration` endpoint reads enemy from `combat.enemy || combat.enemies[0]`
- Old combat uses `combat.enemy`, robot combat uses `combat.enemies[]`

#### `src/routes/game/misc.js` — Debug set-enemy-hp: handle both combat modes
- Sets HP on both `combat.enemy` AND `combat.enemies[]` when they exist
- They can be separate objects (createCombatState copies the enemy)

#### `tests/e2e/fixtures/game-helpers.ts` — E2E test helpers handle robot combat
- `startRun()`: Detects starter selection vs chip selection, picks first starter if shown
- `setupRun()`: Skips chip selection step when in robot combat mode
- `getEnemyHp()` / `getEnemyMaxHp()`: Check `combat.enemies[0]` first (robot), fall back to `combat.enemy` (old)
- Added `_isRobotCombat` flag for conditional test flow

#### `tests/e2e/utils/selectors.ts` — Added starter selection selectors
- `.starter-card`, `.starter-selection`

---

## Verification Results

### Manual Browser Playthrough — PASSED
Full flow verified in browser:
1. Hub → Infiltrate → Level Select → **Starter Selection** (3 robots shown) ✅
2. Pick fire starter → **Ward Selection** appears ✅
3. Select ward → **Encounter Room** (encounters-only working) ✅
4. Click Fight → **Robot Combat** starts (`POST /api/game/start-robot-encounter → 200`) ✅
5. Dual vocab cards → Pick attack → **Robot attack executes** (Hino Bot deals damage) ✅
6. Enemy counter-attacks → New vocab cards → Combat loop continues ✅
7. Server state confirms: `isRobotCombat: true`, enemy HP decreasing, ally HP decreasing ✅

### Unit Tests — 48 failures (all pre-existing)
All failures are `dual-pool-pipeline` and `chip-stats` tests that fail on master too.
29 robot-specific tests all pass.

### E2E Tests — 15/16 passed before shrine test

| Test | Result | Notes |
|------|--------|-------|
| Boss room shows fight button | ✅ | |
| Boss fight starts combat | ✅ | |
| Defeating boss completes floor | ✅ | With uncommitted fixes |
| Character creation (4 tests) | ✅ | |
| Combat flow (various) | ✅ | |
| Exploration (various) | ✅ | |
| Quiz room (3 tests) | ✅ | |
| **Shrine room shows chip options** | ❌ | **Expected failure** — shrine offers chip upgrades but robot players have no chips. Shows "No chips equipped to upgrade" correctly. |

**Full suite was not completed** — stopped at test 16 (shrine). Remaining ~51 tests not yet run.

---

## Outstanding Work

### Must Do (before merge)

1. **Commit the uncommitted fixes** — 6 files with critical boss combat and test helper changes
2. **Run full E2E suite** — Only 15/67 tests verified. Need to run all to check for other failures
3. **Shrine test** — Either skip it for robot combat or adapt it. The behavior is correct (no chips = no upgrades) but the test expects chip options

### Known Issues (non-blocking)

4. **Enemy HP bar doesn't visually update** during robot combat — `characterUI.updateEnemyHPBar()` is called but the bar stays at full. Server state shows HP decreasing correctly. Likely a DOM element visibility or scene module issue.
5. **Missing enemy sprites** — `wood-common.webp` returns 404. Robot enemies don't have sprites yet. Cosmetic only.
6. **Boss robot wrapper is minimal** — Boss enemies get a generic `autoSkill` and `element` wrapper. Bosses should eventually have their own robot-compatible stats.

### Nice to Have (post-merge)

7. **Post-combat shop** — Robot combat skips the chip shop after encounters. Could add a robot-equivalent reward (befriend chance, XP bonus, etc.)
8. **Robot party display in combat** — Allied robot HP bars should update during combat rounds
9. **Befriend action** — Frontend wiring exists but not fully tested in the E2E flow
10. **Ultimate attacks** — Charge system is wired but not tested end-to-end

---

## File Reference

### Modified by wiring (committed)
- `public/js/api.js` — selectLevel accepts starterId
- `public/js/ui/exploration.js` — starter selection before level select
- `public/game.js` — combat routing, HP bar hiding, callback wiring
- `public/js/ui/combat-loop.js` — robot attack/defend functions, routing
- `src/game/loop.js` — encountersOnly flag, skip chip shop
- `src/game/rooms.js` — encountersOnly parameter threading
- `src/game/services/exploration-service.js` — pass encountersOnly

### Modified by verification fixes (uncommitted)
- `src/game/loop.js` — room interacted + bossDefeated on robot victory
- `src/game/services/combat-service.js` — boss encounter robot combat setup
- `src/routes/game/combat.js` — enemy fallback for robot combat
- `src/routes/game/misc.js` — debug endpoint handles both combat modes
- `tests/e2e/fixtures/game-helpers.ts` — starter selection + robot combat helpers
- `tests/e2e/utils/selectors.ts` — starter card selectors
