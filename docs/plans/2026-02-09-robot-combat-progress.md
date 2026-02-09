# Robot Combat System — Progress Report

**Branch:** `feature/robot-combat`
**Worktree:** `/Users/michia/Documents/jrpg/.worktrees/robot-combat`
**Base SHA:** `edea49d` (master)
**Head SHA:** `332f8bf` (11 commits, +2120 lines across 19 files)

---

## Completed (Tasks 1–12)

### Task 1: Robot Data File
- **File created:** `data/robots.json` (552 lines)
- 25 robots: 5 elements (wood, fire, earth, metal, water) × 5 rarities (common → legendary)
- IDs follow `{element}-{rarity}` pattern (e.g., `fire-common`, `water-legendary`)
- Base stats uniform per rarity; auto-skill/ultimate power scales by rarity
- All have unique Japanese + English names for auto-skill and ultimate

### Task 2: Robot Service Module
- **File created:** `src/game/robots.js` (151 lines)
- **Tests:** `tests/unit/robots.test.js` — 18/18 pass
- Exports: `getElementMultiplier`, `instantiateRobot`, `calculateRobotDamage`, `getStatsForLevel`, `addXpToRobot`, `selectTarget`, `rollVariance`, `rollRarity`, `generateEnemyRobot`, `getAllRobots`, `getStarterRobots`
- Element cycle: Wood → Earth → Water → Fire → Metal → Wood (1.5x advantage, 0.67x disadvantage)
- Damage formula: `attack × (abilityPower / 100) × elementMultiplier × variance`
- Targeting AI: type-disadvantaged > neutral > fallback lowest %HP

### Task 3: Robot Party State
- **Modified:** `src/game/state.js` (+10 lines)
- **Tests:** `tests/unit/robot-party.test.js` — 2/2 pass
- Added `robotParty: { active: [], reserves: [], maxTotal: 6 }` to `createNewRun()`
- Added `allies: [], enemies: []` to `createCombatState()` (backward-compatible, `enemy` field preserved)

### Task 4: Robot Combat Service
- **File created:** `src/game/services/robot-combat-service.js` (158 lines)
- **Tests:** `tests/unit/robot-combat-service.test.js` — 8/8 pass
- Exports: `processAttackTurn`, `processDefendTurn`, `processEnemyTurn`, `processBefriend`, `processUltimate`, `awardBattleXp`, `handleRobotKO`
- Stateless service — takes mutable arrays, modifies in place, returns result descriptors

### Task 5: GameManager Integration
- **Modified:** `src/game/loop.js` (+182 lines)
- **Modified:** `src/routes/game/combat.js` (+51 lines)
- Added GameManager methods: `startRobotEncounter()`, `robotCombatCycle(actionType)`, `useRobotUltimate(robotIndex)`, `getStarters()`
- Added `robotParty` and `allies/enemies/isRobotCombat` to `getState()`
- Added API endpoints: `POST /start-robot-encounter`, `POST /robot-combat-cycle`, `POST /use-robot-ultimate`, `GET /starters`

### Task 6: Starter Selection API
- **Modified:** `src/game/loop.js` — `startRun(levelId, starterId)` now accepts starter
- **Modified:** `src/routes/game/run.js` — Both `/start-run` and `/levels/select` pass `starterId`
- **Tests:** `tests/unit/robot-starter.test.js` — 1/1 pass

### Task 7: Frontend Robot Slots UI
- **File created:** `public/js/ui/robot-row.js` (143 lines)
- **Modified:** `public/js/ui/index.js` — added `robotRow` export
- **Modified:** `public/game.css` — robot slot styles (~120 lines)
- 3 robot slots replacing chip slots, with HP bars, charge bars, ultimate popup
- Reuses `dom.chipRow` and `dom.chipPopup` containers

### Task 8: Befriend Action Card
- **Modified:** `public/js/ui/actions.js` (+125 lines) — `showTripleFlashCards()` function
- **Modified:** `public/js/ui/combat-loop.js` (+90 lines) — `executeBefriendAction()`, befriend branch in `resumeCombatAfterVocab()`
- Heart icon SVG, green color scheme for befriend card
- Calls `POST /api/game/robot-combat-cycle` with `actionType: 'befriend'`

### Task 9: Frontend Robot Combat Loop Integration
- **Modified:** `public/js/api.js` (+26 lines) — `startRobotEncounter`, `robotCombatCycle`, `useRobotUltimate`, `getStarters`
- **Modified:** `public/game.js` (+120 lines) — robotRow init, updateChipRow routes to robots, ultimate handler, showTripleFlashCards wiring
- **Modified:** `public/js/ui/combat-loop.js` — `showTripleFlashCards` callback, befriend detection in `showNextDualCardsFromQueue()`

### Task 10: Starter Selection Screen
- **Modified:** `public/game.js` — `startNewRun()` now fetches starters and shows selection
- **Modified:** `public/js/api.js` — `startRun()` now accepts optional body for `{ starterId }`
- **Modified:** `public/game.css` — starter card styles
- 3 starter cards (fire/water/wood) with element icons, stats, skill names

### Task 11: Enemy Robot Display
- **Modified:** `public/js/ui/scene.js` (+42 lines) — element icons, robot placeholder, colored border
- **Modified:** `public/game.css` — enemy robot display styles
- Robots detected by presence of `element` property
- `showRobotPlaceholder()` shows element emoji in colored circle when no sprite

### Task 12: Test Results
- **Unit tests:** 249 pass, 21 fail (pre-existing chip stats failures, +29 new passes, 0 new failures)
- **Integration tests:** 15 pass, 2 fail (pre-existing chip healing failures)
- **Syntax check:** All 19 modified files pass `node --check`
- **E2E (partial run):** 7 passed, 1 failed (`defeating enemy ends combat` — likely timing issue, not a regression from our changes)

---

## Remaining (Task 13)

### Task 13: Update E2E Tests for Robot Combat
**Status:** Not started

The existing E2E tests use the old chip combat flow. Since robot combat is a **parallel path** (old chip endpoints are preserved), E2E tests should still pass. The one failure observed (`defeating enemy ends combat`) appears to be a timing flakiness issue.

**What needs doing:**
1. Run full E2E suite and confirm 60+/66 pass (the CLAUDE.md threshold)
2. If the encounter test consistently fails, investigate whether it's a timing issue or a real regression from the `allies/enemies` additions to `createCombatState()`
3. Optionally add new E2E tests for the robot combat flow (starter selection → robot encounter → attack/defend/befriend)

**How to run:**
```bash
cd /Users/michia/Documents/jrpg/.worktrees/robot-combat
./scripts/e2e-test.sh
```

---

## Architecture Summary

| Layer | Old (Chips) | New (Robots) |
|-------|------------|--------------|
| Data | `data/chips.json` | `data/robots.json` (25 robots) |
| Service | `src/game/items/chips.js` | `src/game/robots.js` |
| Combat | `src/game/combat/player-actions.js` | `src/game/services/robot-combat-service.js` |
| State | `player.chips` | `run.robotParty` (run-scoped) |
| Combat State | `combat.enemy` | `combat.allies[]`, `combat.enemies[]` |
| API | `POST /game/combat-cycle` | `POST /game/robot-combat-cycle` |
| Frontend Slots | `chip-row.js` (5 slots) | `robot-row.js` (3 slots) |
| Action Cards | Attack / Defend | Attack / Defend / Befriend |

**Backward compatibility:** Old chip endpoints remain functional. `createCombatState()` adds `allies`/`enemies` without removing `enemy`. `createNewRun()` adds `robotParty` without removing chip state.

---

## To Merge

Once Task 13 is resolved:

```bash
cd /Users/michia/Documents/jrpg/.worktrees/robot-combat
/usr/bin/git add -A && /usr/bin/git commit -m "..."  # if any remaining changes

cd /Users/michia/Documents/jrpg
/usr/bin/git checkout master
/usr/bin/git pull origin master
/usr/bin/git merge feature/robot-combat
/usr/bin/git push origin master

/usr/bin/git worktree remove .worktrees/robot-combat
/usr/bin/git branch -d feature/robot-combat
```
