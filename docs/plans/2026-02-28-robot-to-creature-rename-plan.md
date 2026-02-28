# Robot → Creature Rename Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Rename all ~1,700 "robot" references to "creature" across the entire codebase in 6 layered commits.

**Architecture:** Layered rename in dependency order — state → core logic → routes → frontend → CSS/HTML → assets/docs. Each layer is independently testable. Save migration uses key-based rename (NO version bump) to preserve existing player data.

**Tech Stack:** ES6 modules, Express routes, vanilla JS frontend, CSS

**Design doc:** `docs/plans/2026-02-28-robot-to-creature-rename-design.md`

---

### Task 1: Data/State Layer

**Files:**
- Modify: `src/game/state.js`
- Modify: `src/game/manager-registry.js`
- Modify: `src/game/loop.js` (lines 93-98 initMeta, plus all ~140 occurrences)
- Modify: `server.js` (lines 264-291 save load, line 27 comment, line 419 comment)

**Step 1: Rename state keys in `state.js`**

In `createMetaProgression()`:
- Line 74: comment `// Permanent robot collection` → `// Permanent creature collection`
- Line 75: `robotCollection:` → `creatureCollection:`

In `createNewRun()`:
- Line 296: comment `// Robot party (run-scoped)` → `// Creature party (run-scoped)`
- Line 297: `robotParty:` → `creatureParty:`
- Line 298: comment `// 0-3 deployed robots` → `// 0-3 deployed creatures`
- Line 299: comment `// 0-3 bench robots` → `// 0-3 bench creatures`

In `createCombatState()`:
- Line 367: comment `// references to run.robotParty.active` → `// references to run.creatureParty.active`
- Line 368: comment `// MVP: single enemy robot` → `// MVP: single enemy creature`
- Line 376: comment `// Robot swap state` → `// Creature swap state`

**Step 2: Add save migration in `manager-registry.js`**

After line 40 (inside the `if (data.meta)` block), before the existing robotCollection filter, add key-rename migration:

```js
// Migrate: rename robotCollection → creatureCollection (no version bump)
if (data.meta.robotCollection && !data.meta.creatureCollection) {
  data.meta.creatureCollection = data.meta.robotCollection;
  delete data.meta.robotCollection;
  needsSave = true;
}
```

Then update the existing filter block (lines 41-51) to reference `creatureCollection` instead of `robotCollection`.

Update imports (lines 5-6):
- `ROBOTS_BY_ID` → `CREATURES_BY_ID` (will exist after Task 2, but import path changes here)
- `robot-collection-service.js` → `creature-collection-service.js` (will exist after Task 2)

**IMPORTANT:** Since Task 2 hasn't renamed these files yet, temporarily keep the old import paths in this commit. Task 2 will update them. Alternatively, do Tasks 1 and 2 together in the same commit if the intermediate state would break. The key decision: **if tests import from `robots.js`, they'll break if we rename state keys but not the module.** To avoid this, rename the state keys AND update all references in `loop.js` in the same step, but keep `manager-registry.js` imports pointing to old filenames until Task 2.

Actually — the cleaner approach: **In Task 1, only change the state factory defaults and add the migration. Keep `loop.js` referencing `robotParty`/`robotCollection` for now (the property names on the state objects will change, but loop.js creates fresh state via the factories).** Then in Task 2, rename all the property accesses in loop.js alongside the module renames.

**Wait — this won't work.** If `createNewRun()` returns `{ creatureParty: ... }` but `loop.js` reads `this.run.robotParty`, everything breaks.

**Revised approach for Task 1:** Rename state keys AND update ALL references to those keys across the entire codebase in one commit. This is the only safe way since the keys are accessed everywhere.

**Step 2 (revised): Update ALL `robotParty` → `creatureParty` references across the codebase**

Search-and-replace `robotParty` → `creatureParty` in ALL files:
- `src/game/loop.js` (~30 references)
- `src/game/services/robot-combat-service.js` (~15 references)
- `src/game/services/exploration-service.js` (~20 references)
- `src/routes/game/combat.js` (~10 references)
- `public/game.js` (~10 references)
- `public/js/ui/combat-loop.js` (~15 references)
- `public/js/ui/exploration.js` (~5 references)

**Step 3: Update ALL `robotCollection` → `creatureCollection` references**

Search-and-replace `robotCollection` → `creatureCollection` in ALL files:
- `src/game/loop.js` (lines 95-97 in initMeta)
- `src/game/manager-registry.js` (lines 41-51 migration block — after adding the rename migration above)
- `src/routes/game/combat.js` (line 149)
- `src/routes/game/run.js` (lines 93, 155)
- `public/game.js` (if any direct references)

**Step 4: Update ALL `isRobotCombat` → `isCreatureCombat` references**

Search-and-replace `isRobotCombat` → `isCreatureCombat` in ALL files:
- `src/game/state.js` (createCombatState)
- `src/game/loop.js` (~5 references)
- `src/routes/game/combat.js` (line 239)
- `public/js/ui/combat-loop.js` (~10 references)
- `public/game.js` (if any)

**Step 5: Add save migration in `server.js`**

Around line 288, before `gameManager.initMeta(...)`, add:
```js
// Migrate: rename robotCollection → creatureCollection
if (gameSave?.meta?.robotCollection && !gameSave?.meta?.creatureCollection) {
  gameSave.meta.creatureCollection = gameSave.meta.robotCollection;
  delete gameSave.meta.robotCollection;
}
```

Update line 27 comment: `Robots:` → `Creatures:`
Update line 419 comment: `robot-specific` → `creature-specific`

**Step 6: Run tests**

```bash
npm run test:unit
```

All 154 tests should pass. The tests themselves still use `robotParty`/`robotCollection` in their own local variables (not accessing state factories directly in most cases), but any that create state via factories will now get `creatureParty`. Verify and fix any test failures.

**Step 7: Commit**

```bash
git add -A
git commit -m "refactor: rename robot state keys to creature (robotParty → creatureParty, robotCollection → creatureCollection, isRobotCombat → isCreatureCombat)"
```

---

### Task 2: Core Logic (file renames + exports)

**Files:**
- Rename: `src/game/robots.js` → `src/game/creatures.js`
- Rename: `src/game/services/robot-combat-service.js` → `src/game/services/creature-combat-service.js`
- Rename: `src/game/services/robot-collection-service.js` → `src/game/services/creature-collection-service.js`
- Modify: `src/game/combat/effects.js`
- Modify: `src/game/dm.js`
- Update imports in: `src/game/loop.js`, `src/game/manager-registry.js`, `src/routes/game/combat.js`, `src/routes/game/run.js`, `src/game/services/exploration-service.js`, `src/game/services/item-service.js`

**Step 1: Rename exports in `robots.js` (before moving file)**

All renames in `src/game/robots.js`:
- `ROBOT_DATA` → `CREATURE_DATA` (line 6)
- `ROBOTS_BY_ID` → `CREATURES_BY_ID` (line 14)
- `ROBOTS_BY_ELEMENT_RARITY` → `CREATURES_BY_ELEMENT_RARITY` (line 15)
- `instantiateRobot` → `instantiateCreature` (line 56)
- `addXpToRobot` → `addXpToCreature` (line 108)
- `calculateRobotDamage` → `calculateCreatureDamage` (line 157)
- `generateEnemyRobot` → `generateEnemyCreature` (line 191)
- `generateEnemyRobots` → `generateEnemyCreatures` (line 244)
- `ROBOT_PRICES` → `CREATURE_PRICES` (line 262)
- `getRobotBuyPrice` → `getCreatureBuyPrice` (line 270)
- `getRobotSellPrice` → `getCreatureSellPrice` (line 274)
- `generateDealerRobots` → `generateDealerCreatures` (line 279)
- All local `robot` variables → `creature`
- Error message: `'Robot template not found'` → `'Creature template not found'`
- Comment at line 287: `// Pick 1 random robot` → `// Pick 1 random creature`

**Step 2: Rename file**

```bash
git mv src/game/robots.js src/game/creatures.js
```

**Step 3: Rename exports in `robot-combat-service.js`**

- `handleRobotKO` → `handleCreatureKO` (line 631)
- All local `robot` variables → `creature` where they refer to ally creatures
- All `robotIndex` → `creatureIndex`
- All `robotParty` params → `creatureParty` (already renamed in state, but param names in function signatures need updating)
- `buildAttackRecord(robot, robotIndex, ...)` → `buildAttackRecord(creature, creatureIndex, ...)`
- All JSDoc comments: `robot` → `creature`
- `hastedRobotIndices` → `hastedCreatureIndices`
- `activeRobots` → `activeCreatures`, `reserveRobots` → `reserveCreatures`
- Import renames: `calculateRobotDamage` → `calculateCreatureDamage`, `addXpToRobot` → `addXpToCreature`, `generateEnemyRobot` → `generateEnemyCreature` from `../creatures.js`

**Step 4: Rename file**

```bash
git mv src/game/services/robot-combat-service.js src/game/services/creature-combat-service.js
```

**Step 5: Rename exports in `robot-collection-service.js`**

- `ROBOT_DATA` → `CREATURE_DATA` (line 6)
- `ROBOTS_BY_ID` → `CREATURES_BY_ID` (line 7)
- Error strings: `'Select at least 1 robot'` → `'Select at least 1 creature'`, `'Unknown robot: ${id}'` → `'Unknown creature: ${id}'`
- `addToCollection(collection, robotId)` → `addToCollection(collection, creatureId)`
- Local `robot` → `creature`

**Step 6: Rename file**

```bash
git mv src/game/services/robot-collection-service.js src/game/services/creature-collection-service.js
```

**Step 7: Update `combat/effects.js`**

Rename all `robot` parameters to `creature`:
- `tickEffects(robot)` → `tickEffects(creature)` and all internal references
- `isIncapacitated(robot)` → `isIncapacitated(creature)`
- `isConfused(robot)` → `isConfused(creature)`
- `hasHaste(robot)` → `hasHaste(creature)`
- `consumeHaste(robot)` → `consumeHaste(creature)`
- `getAttackMultiplier(robot)` → `getAttackMultiplier(creature)`
- `getDamageReduction(robot)` → `getDamageReduction(creature)`
- `getFlatAttackBonus(robot)` → `getFlatAttackBonus(creature)`
- All JSDoc `@param {object} robot` → `@param {object} creature`

**Step 8: Update `dm.js`**

- Line 749: comment `robot capture` → `creature capture`
- Line 751: `const robot = ctx?.robot || {}` → `const creature = ctx?.creature || {}`
- Line 752: `robot.name || robot.nameEn || 'ロボット'` → `creature.name || creature.nameEn || 'クリーチャー'`
- Line 753: `robot.element` → `creature.element`
- Lines 755-768: Update Japanese prompt text: `ロボット` → `クリーチャー` where it refers to the entity type generically. Keep the creature's actual name variable.

**Step 9: Update ALL import paths**

Every file that imports from `robots.js`, `robot-combat-service.js`, or `robot-collection-service.js` needs updated import paths AND renamed imports:

- `src/game/loop.js`: Update import paths and rename imported functions
- `src/game/manager-registry.js`: `ROBOTS_BY_ID` → `CREATURES_BY_ID` from `./creatures.js`, `robot-collection-service.js` → `creature-collection-service.js`
- `src/game/services/exploration-service.js`: All robot-named imports
- `src/routes/game/combat.js`: Import paths and names
- `src/routes/game/run.js`: Import path for collection service

**Step 10: Update loop.js method names**

- `startRobotEncounter()` → `startCreatureEncounter()`
- `robotCombatCycle()` → `creatureCombatCycle()`
- `swapRobot()` → `swapCreature()`
- `rearrangeRobots()` → `rearrangeCreatures()`
- `swapRobotOutOfCombat()` → `swapCreatureOutOfCombat()`
- `_handleRobotAttackTurn()` → `_handleCreatureAttackTurn()`
- `_handleRobotDefendTurn()` → `_handleCreatureDefendTurn()`
- `_handleRobotBefriendTurn()` → `_handleCreatureBefriendTurn()`
- All local `robot` variables → `creature`
- `initMeta`: `robotCollection` → `creatureCollection` (already done in Task 1 for the check, but verify)

**Step 11: Update exploration-service.js**

- All `robot`/`robotId` variables → `creature`/`creatureId`
- `useShrine(robotId)` → `useShrine(creatureId)`
- `useQuizReward(rewardType, robotId)` → `useQuizReward(rewardType, creatureId)`
- `dealerSell(robotId)` → `dealerSell(creatureId)`
- `dealerBuy(robotId)` → `dealerBuy(creatureId)`
- Error strings: `'Robot not in party'` → `'Creature not in party'`, `'Cannot sell your last robot'` → `'Cannot sell your last creature'`, `'Party is full (max 6 robots)'` → `'Party is full (max 6 creatures)'`
- `room.dealer.offeredRobots` → `room.dealer.offeredCreatures`
- `room.dealer.soldRobots` → `room.dealer.soldCreatures`
- `room.dealer.purchasedRobot` → `room.dealer.purchasedCreature`
- Import renames from creatures.js

**IMPORTANT:** The dealer state keys (`offeredRobots`, `soldRobots`, `purchasedRobot`) are part of room state generated in `rooms.js`. Search for these keys in `rooms.js` and update there too.

**Step 12: Run tests**

```bash
npm run test:unit
```

Fix any failures from import path changes or renamed functions. Tests themselves still use old names in their own code — that's fine for now (Task 6 renames tests).

**Step 13: Commit**

```bash
git add -A
git commit -m "refactor: rename robot modules to creature (robots.js → creatures.js, all exports and internal naming)"
```

---

### Task 3: Server Routes

**Files:**
- Modify: `src/routes/game/combat.js`
- Modify: `src/routes/game/run.js`
- Modify: `src/routes/game/economy.js`
- Modify: `server.js` (route comments only — save migration already done in Task 1)

**Step 1: Rename endpoints and handler code in `combat.js`**

Import updates (lines 8-10):
- `handleRobotKO` → `handleCreatureKO` from `creature-combat-service.js`
- `MOVES_BY_ID` from `../../game/creatures.js`
- `getCollectionCatalog` from `../../game/services/creature-collection-service.js`

Endpoint renames:
- Line 87: comment `ROBOT COMBAT` → `CREATURE COMBAT`
- Line 89: comment `robot encounter` → `creature encounter`
- Line 90: `'/start-robot-encounter'` → `'/start-creature-encounter'`
- Line 93: `startRobotEncounter()` → `startCreatureEncounter()`
- Line 101: comment `Robot combat cycle` → `Creature combat cycle`
- Line 102: comment `robotIndex` → `creatureIndex`
- Line 105: `'/robot-combat-cycle'` → `'/creature-combat-cycle'`
- Line 109: `robotCombatCycle()` → `creatureCombatCycle()`
- Line 120: `robotIndex` → `creatureIndex` (body param for learn-move)
- Line 122-124: `robotParty` → `creatureParty`
- Line 144: comment `robot collection` → `creature collection`
- Line 145: `'/robot-collection'` → `'/creature-collection'`
- Line 149: `robotCollection` → `creatureCollection`
- Line 158: `'/robot-shop-roll'` → `'/creature-shop-roll'`
- Line 169: `'/robot-shop-select'` → `'/creature-shop-select'`
- Line 181: comment `Robot swap` → `Creature swap`
- Line 182: `'/swap-robot'` → `'/swap-creature'`
- Line 186: `swapRobot()` → `swapCreature()`
- Line 194: comment `Rearrange active robots` → `Rearrange active creatures`
- Line 195: `'/rearrange-robots'` → `'/rearrange-creatures'`
- Line 199: `rearrangeRobots()` → `rearrangeCreatures()`
- Line 207: comment `Robot swap (out of combat)` → `Creature swap (out of combat)`
- Line 208: `'/swap-robot-equip'` → `'/swap-creature-equip'`
- Line 212: `swapRobotOutOfCombat()` → `swapCreatureOutOfCombat()`
- Line 223: `releaseRobotId` → `releaseCreatureId`
- Line 239: `isRobotCombat` → `isCreatureCombat` (already done in Task 1)
- Line 240: error string `'No active robot combat'` → `'No active creature combat'`
- Line 244: error string `'Cannot befriend NPC trainer robots'` → `'Cannot befriend NPC trainer creatures'`

**Step 2: Rename variables in `run.js`**

- Line 15: import path `robot-collection-service.js` → `creature-collection-service.js`
- Lines 89, 151: comments `robot selection` → `creature selection`
- Lines 93, 155: `robotCollection` → `creatureCollection` (already done in Task 1)
- Line 276: `robotId` → `creatureId` (body param)
- Line 278: error string `'robotId required'` → `'creatureId required'`
- Line 280: `useShrine(robotId)` → `useShrine(creatureId)`
- Line 291: `robotId` → `creatureId` (body param)
- Line 295: `useQuizReward(rewardType, robotId)` → `useQuizReward(rewardType, creatureId)`
- Line 482: sprite path `'/assets/sprites/robots/${c.id}.webp'` → `'/assets/sprites/creatures/${c.id}.webp'`

**Step 3: Rename variables in `economy.js`**

- Line 55: comment `sell a robot` → `sell a creature`
- Line 58: `robotId` → `creatureId`
- Line 60: `dealerSell(robotId)` → `dealerSell(creatureId)`
- Line 69: comment `buy offered robot` → `buy offered creature`
- Line 72: `robotId` → `creatureId`
- Line 74: `dealerBuy(robotId)` → `dealerBuy(creatureId)`

**Step 4: Run tests**

```bash
npm run test:unit
```

**Step 5: Commit**

```bash
git add -A
git commit -m "refactor: rename robot API endpoints to creature (/start-creature-encounter, /creature-combat-cycle, etc.)"
```

---

### Task 4: Frontend JS

**Files:**
- Rename: `public/js/ui/robot-row.js` → `public/js/ui/creature-row.js`
- Modify: `public/js/ui/sprite-utils.js`
- Modify: `public/js/ui/combat-loop.js`
- Modify: `public/js/ui/combat-effects.js`
- Modify: `public/js/ui/scene.js`
- Modify: `public/game.js`
- Modify: `public/js/api.js`
- Modify: `public/js/ui/exploration.js`
- Modify: `public/js/ui/economy.js`
- Modify: `public/js/ui/move-learn.js`
- Modify: `public/js/ui/move-select.js`
- Modify: `public/js/ui/takeover.js`
- Modify: `public/js/dom.js`
- Modify: `public/js/ui/target-select.js`
- Modify: `public/js/ui/i18n.js`

**IMPORTANT: CSS classes in JS string literals must stay as `.robot-*` in this task. They get renamed in Task 5, and both tasks must be applied together or the CSS won't match. Actually — it's cleaner to rename CSS classes in JS at the same time as CSS. So in this task, rename variables/functions/imports but leave CSS class string literals unchanged. Task 5 will do a coordinated rename of CSS classes everywhere (CSS file + JS string literals).**

**Revised approach: In Task 4, rename function names, variable names, import paths, API endpoint strings, and data attributes. Leave CSS class names (`.robot-*`) for Task 5.**

**Step 1: Rename `sprite-utils.js` exports**

- Line 1: comment `Robot sprite` → `Creature sprite`
- Line 4: comment `{robotId}` → `{creatureId}`
- Line 8: `BASE = '/assets/sprites/robots'` — **LEAVE AS-IS until Task 6** (directory not renamed yet)
- Line 16: `robotSpritePath` → `creatureSpritePath`
- Line 22: `robotStaticPath` → `creatureStaticPath`
- Line 31: `configureRobotImg` → `configureCreatureImg`
- Line 60: `robotBgUrl` → `creatureBgUrl`
- Line 67: `probeIdleSprites(robotIds)` → `probeIdleSprites(creatureIds)` (param name only)
- Comments: update all `robot` → `creature`

**Step 2: Rename `robot-row.js` → `creature-row.js`**

```bash
git mv public/js/ui/robot-row.js public/js/ui/creature-row.js
```

Inside the file, rename:
- All function params: `robots` stays as `robots` when it's a data array (actually rename to `creatures`)
- `onSwapRobot` → `onSwapCreature`
- `onRearrangeRobot` → `onRearrangeCreature`
- `currentActiveRobots` → `currentActiveCreatures`
- `swapRobotCallback` → `swapCreatureCallback`
- `rearrangeRobotCallback` → `rearrangeCreatureCallback`
- `render(robots)` → `render(creatures)`, `updateData(robots)` → `updateData(creatures)`
- Import: `configureRobotImg` → `configureCreatureImg`, `robotStaticPath` → `creatureStaticPath`
- **CSS classes in innerHTML: LEAVE AS `.robot-*` for now (Task 5)**

**Step 3: Rename `api.js` functions and endpoint strings**

- `startRobotEncounter` → `startCreatureEncounter`
- `robotCombatCycle` → `creatureCombatCycle`
- `getRobotCollection` → `getCreatureCollection`
- `robotShopRoll` → `creatureShopRoll`
- `robotShopSelect` → `creatureShopSelect`
- `swapRobot` → `swapCreature`
- `rearrangeRobots` → `rearrangeCreatures`
- `swapRobotEquip` → `swapCreatureEquip`
- `shrineUpgrade(robotId)` → `shrineUpgrade(creatureId)`
- `quizReward(rewardType, robotId)` → `quizReward(rewardType, creatureId)`
- `dealerSell(robotId)` → `dealerSell(creatureId)`
- `dealerBuy(robotId)` → `dealerBuy(creatureId)`
- `learnMove(robotIndex, ...)` → `learnMove(creatureIndex, ...)`
- `befriendReplace(releaseRobotId)` → `befriendReplace(releaseCreatureId)`
- API path strings: `/start-robot-encounter` → `/start-creature-encounter`, etc. (match Task 3 endpoint renames)
- Section comment: `ROBOT COMBAT` → `CREATURE COMBAT`

**Step 4: Rename `combat-loop.js` variables and functions**

- `currentRobotIndex` → `currentCreatureIndex`
- `apiRobotCombatCycle` → `apiCreatureCombatCycle`
- `updateRobotRowData` → `updateCreatureRowData`
- Import renames: `fireRobotAttackEffect` → `fireCreatureAttackEffect`, `enemyRobotAttackEffect` → `enemyCreatureAttackEffect`, `configureRobotImg` → `configureCreatureImg`, `robotSpritePath` → `creatureSpritePath`
- `promptNextRobot` → `promptNextCreature`
- `handleMoveSelected(move, robotIndex)` → `handleMoveSelected(move, creatureIndex)`
- `executeRobotMovesTurn` → `executeCreatureMovesTurn`
- `executeRobotDefendThenPause` → `executeCreatureDefendThenPause`
- `findRobotSlotByAttackerId` → `findCreatureSlotByAttackerId`
- `updateRobotHpBars` → `updateCreatureHpBars`
- All local `robot` vars → `creature`
- `isRobotCombat` → `isCreatureCombat` (already done in Task 1 for state, but local variable references need updating)
- `robotParty` → `creatureParty` (already done in Task 1)
- `moveChoices` array: `robotIndex` → `creatureIndex`
- `showLearnPrompt(robot, robotIndex, ...)` → `showLearnPrompt(creature, creatureIndex, ...)`
- API path string: `'/api/game/robot-combat-cycle'` → `'/api/game/creature-combat-cycle'`
- Log strings: `'[CombatLoop] Robot attack'` → `'[CombatLoop] Creature attack'`
- **CSS class queries: LEAVE AS `.robot-*` for Task 5**
- `data-robot-id` → leave for Task 5 (coordinate with HTML attribute rename)

Actually — `data-robot-id` is a JS data attribute, not CSS. Rename it here:
- All `data-robot-id` → `data-creature-id`
- All `dataset.robotId` → `dataset.creatureId`

**Step 5: Rename `combat-effects.js` functions**

- `fireRobotAttackEffect` → `fireCreatureAttackEffect`
- `enemyRobotAttackEffect` → `enemyCreatureAttackEffect`
- `healEffect(robotSlotEl, ...)` → `healEffect(creatureSlotEl, ...)`
- `showXpPopup(robotSlotEl, ...)` → `showXpPopup(creatureSlotEl, ...)`
- `showLevelUpPopup(robotSlotEl, ...)` → `showLevelUpPopup(creatureSlotEl, ...)`
- `playerHitEffect(damage, hpBarEl, robotRowEl)` → `playerHitEffect(damage, hpBarEl, creatureRowEl)`
- All local `robotSlotEl`/`robotRowEl` → `creatureSlotEl`/`creatureRowEl`
- **CSS class queries: LEAVE AS `.robot-*` for Task 5**

**Step 6: Rename `scene.js` variables**

- Import: `configureRobotImg` → `configureCreatureImg`
- `isRobot` → `isCreature`
- `showRobotPlaceholder(enemy)` → `showCreaturePlaceholder(enemy)`
- `showEnemyRobots()` → `showEnemyCreatures()`
- **CSS classes in innerHTML: LEAVE for Task 5**
- Comments: update

**Step 7: Rename `game.js` variables and functions**

- Import: `robotRow` → `creatureRow` from `./js/ui/creature-row.js`
- Import renames: `configureRobotImg` → `configureCreatureImg`, `robotSpritePath` → `creatureSpritePath`, `probeIdleSprites`
- API import renames: `startRobotEncounter as apiStartCreatureEncounter`, etc.
- `openRobotEquipView()` → `openCreatureEquipView()`
- `renderRobotEquipContent()` → `renderCreatureEquipContent()`
- `creatureRow.init({ swapCreatureCallback, rearrangeCreatureCallback })`
- `takeover.open('robotEquip')` → `takeover.open('creatureEquip')`
- `allRobotIds` → `allCreatureIds`
- `hasRobots` → `hasCreatures`
- `data-robot-id` → `data-creature-id`, `dataset.robotId` → `dataset.creatureId`
- i18n keys: `'newRobot'` → `'newCreature'`, `'equippedRobots'` → `'equippedCreatures'`, `'reserveRobots'` → `'reserveCreatures'`
- `updateRobotRowData` → `updateCreatureRowData`
- `apiGetRobotCollection` → `apiGetCreatureCollection`
- `apiBefriendReplace: (releaseRobotId)` → `(releaseCreatureId)`
- **CSS classes in innerHTML: LEAVE for Task 5**

**Step 8: Rename remaining UI modules**

`exploration.js`:
- Import: `configureRobotImg` → `configureCreatureImg`, `robotBgUrl` → `creatureBgUrl`
- `apiGetRobotCollection` → `apiGetCreatureCollection`
- All `robot` loop vars → `creature`
- `robotCards` → `creatureCards`
- `allRobots` → `allCreatures`
- `data-robot-id` → `data-creature-id`, `dataset.robotId` → `dataset.creatureId`
- `apiShrineUpgrade(robotId)` → `apiShrineUpgrade(creatureId)`
- `apiQuizReward(rewardType, robotId)` → `apiQuizReward(rewardType, creatureId)`
- Error/comment strings

`economy.js`:
- Import: `robotSpritePath` → `creatureSpritePath`
- `offeredRobots` → `offeredCreatures`, `partyRobots` → `partyCreatures`
- All `robot` loop vars → `creature`
- `data-robot-id` → `data-creature-id`
- `dealerBuy(robotId)` → `dealerBuy(creatureId)`, `dealerSell(robotId)` → `dealerSell(creatureId)`

`move-learn.js`:
- `showLearnPrompt(robot, robotIndex, ...)` → `showLearnPrompt(creature, creatureIndex, ...)`
- All `robot.` → `creature.`

`move-select.js`:
- `showMoves(robot, robotIndex)` → `showMoves(creature, creatureIndex)`
- `setActiveLabel(robot)` → `setActiveLabel(creature)`
- All `robot.` → `creature.`

`takeover.js`:
- `views.robotEquip` → `views.creatureEquip`
- `dom.robotEquipView` → `dom.creatureEquipView`
- `dom.robotEquipClose` → `dom.creatureEquipClose`
- `case 'robotEquip'` → `case 'creatureEquip'`
- `dom.robotEquipContent` → `dom.creatureEquipContent`

`dom.js`:
- `robotEquipView` → `creatureEquipView` (getter — but it reads `el('robot-equip-view')` which is an HTML ID; Task 5 renames the HTML IDs, so update the string here too)
- Actually, rename the getter AND the el() string together: `get creatureEquipView() { return el('creature-equip-view'); }` — but the HTML ID must also change in Task 5. **To avoid breakage, rename the getter name now but keep the el() string pointing to old ID. Task 5 updates both HTML and el() strings together.**
- Revised: just rename the getter property names, keep el() strings for Task 5.

`target-select.js`:
- Import: `ELEMENT_COLORS` from `'./creature-row.js'` (updated path)
- Import: `configureRobotImg` → `configureCreatureImg`

`i18n.js`:
- `newRobot:` → `newCreature:`
- `equippedRobots:` → `equippedCreatures:`
- `reserveRobots:` → `reserveCreatures:`

**Step 9: Run syntax check on all modified files**

```bash
for f in public/js/ui/creature-row.js public/js/ui/sprite-utils.js public/js/ui/combat-loop.js public/js/ui/combat-effects.js public/js/ui/scene.js public/game.js public/js/api.js public/js/ui/exploration.js public/js/ui/economy.js public/js/ui/move-learn.js public/js/ui/move-select.js public/js/ui/takeover.js public/js/dom.js public/js/ui/target-select.js public/js/ui/i18n.js; do node --check "$f" && echo "OK: $f" || echo "FAIL: $f"; done
```

**Step 10: Commit**

```bash
git add -A
git commit -m "refactor: rename robot references in frontend JS (robot-row → creature-row, all function/variable names)"
```

---

### Task 5: CSS + HTML (coordinated class rename)

**Files:**
- Modify: `public/game.css`
- Modify: `public/game.html`
- Modify: ALL JS files that reference `.robot-*` CSS classes in string literals

**This task must be atomic — CSS class names, HTML IDs, and JS class references must all change together.**

**Step 1: Rename all CSS classes in `game.css`**

Global find-replace in `game.css`:
- `.robot-enemy` → `.creature-enemy`
- `.enemy-robot-` → `.enemy-creature-`
- `.robot-slot` → `.creature-slot`
- `.robot-icon` → `.creature-icon`
- `.robot-dying` → `.creature-dying`
- `.robot-swapping-in` → `.creature-swapping-in`
- `.robot-sprite-icon` → `.creature-sprite-icon`
- `.robot-element-icon` → `.creature-element-icon`
- `.robot-level-badge` → `.creature-level-badge`
- `.robot-slot-name` → `.creature-slot-name`
- `.robot-hp-bar` → `.creature-hp-bar`
- `.robot-hp-fill` → `.creature-hp-fill`
- `.robot-xp-bar` → `.creature-xp-bar`
- `.robot-xp-fill` → `.creature-xp-fill`
- `.robot-charge-bar` → `.creature-charge-bar`
- `.robot-mp-bar` → `.creature-mp-bar`
- `.robot-mp-fill` → `.creature-mp-fill`
- `.robot-mp-text` → `.creature-mp-text`
- `.robot-ultimate-label` → `.creature-ultimate-label`
- `.robot-xp-popup` → `.creature-xp-popup`
- `.robot-levelup-popup` → `.creature-levelup-popup`
- `.robot-popup-` → `.creature-popup-`
- `.robot-equip-` → `.creature-equip-`
- `.robot-name` → `.creature-name`
- `.combat-robot-attack` → `.combat-creature-attack`
- `@keyframes robot-death` → `@keyframes creature-death`
- `@keyframes robot-swap-in` → `@keyframes creature-swap-in`
- `animation: robot-death` → `animation: creature-death`
- `animation: robot-swap-in` → `animation: creature-swap-in`
- `.poisoned .robot-hp-fill` → `.poisoned .creature-hp-fill`
- Comment: `/* Enemy Robot Display */` → `/* Enemy Creature Display */`

**Step 2: Rename HTML IDs in `game.html`**

- Line 49: comment `robot slots` → `creature slots`
- Line 51: comment `3 robot slots` → `3 creature slots`
- Line 137: `id="robot-equip-view"` → `id="creature-equip-view"`
- Line 138: `id="robot-equip-close"` → `id="creature-equip-close"`
- Line 139: `id="robot-equip-content"` → `id="creature-equip-content"`
- Line 182: comment `robot-row.js` → `creature-row.js`

**Step 3: Update el() strings in `dom.js`**

- `el('robot-equip-view')` → `el('creature-equip-view')`
- `el('robot-equip-close')` → `el('creature-equip-close')`
- `el('robot-equip-content')` → `el('creature-equip-content')`

**Step 4: Update CSS class references in ALL JS files**

Search all `.js` files under `public/` for any string containing `robot-` that refers to a CSS class, and rename to `creature-`. Key files:

- `creature-row.js` (formerly robot-row.js): ~20 CSS class string references
- `combat-loop.js`: `.robot-slot`, `.robot-dying`, `.robot-swapping-in`, `.robot-sprite-icon`, `.robot-icon`, `.robot-hp-fill`, `.robot-mp-fill`, `.robot-level-badge`, `.enemy-robot-slot`, `.combat-robot-attack`
- `combat-effects.js`: `.robot-slot`, `.robot-icon`, `.robot-level-badge`, `.robot-xp-popup`, `.robot-levelup-popup`
- `scene.js`: `.robot-enemy`, `.enemy-robot-slot`, `.enemy-robot-icon`, `.enemy-robot-sprite`, `.enemy-robot-element`, `.enemy-robot-level`, `.enemy-robot-name`, `.enemy-robot-hp-bar`, `.enemy-robot-hp-fill`
- `game.js`: `.robot-equip-slot`, `.robot-equip-sprite`, `.robot-equip-info`, `.robot-equip-name`, `.robot-equip-stats`, `.robot-equip-list`, `.robot-name`, `.robot-hp-bar`, `.robot-hp-fill`

**Step 5: Run syntax check**

```bash
for f in public/js/ui/creature-row.js public/js/ui/combat-loop.js public/js/ui/combat-effects.js public/js/ui/scene.js public/game.js public/js/dom.js; do node --check "$f" && echo "OK: $f" || echo "FAIL: $f"; done
```

**Step 6: Commit**

```bash
git add -A
git commit -m "refactor: rename .robot-* CSS classes to .creature-*, update HTML IDs and JS class references"
```

---

### Task 6: Assets, Tests, and Docs

**Files:**
- Move: `public/assets/sprites/robots/` → `public/assets/sprites/creatures/`
- Modify: `public/js/ui/sprite-utils.js` (BASE path + SPRITE_VERSION)
- Rename: `tests/unit/robot/` → `tests/unit/creature/`
- Rename: `tests/unit/combat/robot-combat-service.test.js` → `tests/unit/combat/creature-combat-service.test.js`
- Modify: All test files (imports, variable names, describe blocks)
- Modify: `CLAUDE.md`
- Modify: `docs/ARCHITECTURE.md`
- Modify: `docs/playtest-guide.md`

**Step 1: Move sprite directory**

```bash
git mv public/assets/sprites/robots public/assets/sprites/creatures
```

**Step 2: Update `sprite-utils.js`**

- `BASE = '/assets/sprites/robots'` → `BASE = '/assets/sprites/creatures'`
- Bump `SPRITE_VERSION = '20260221'` → `SPRITE_VERSION = '20260228'`

**Step 3: Rename test directory and files**

```bash
git mv tests/unit/robot tests/unit/creature
git mv tests/unit/combat/robot-combat-service.test.js tests/unit/combat/creature-combat-service.test.js
```

**Step 4: Update all test file contents**

For each test file, update:
- Import paths: `robots.js` → `creatures.js`, `robot-combat-service.js` → `creature-combat-service.js`, `robot-collection-service.js` → `creature-collection-service.js`
- Import names: all renamed exports
- `describe` block strings: `'Robot'` → `'Creature'`, etc.
- Local variables: `robot` → `creature`, `robotIndex` → `creatureIndex`, `robotParty` → `creatureParty`
- Helper functions: `mockRobot()` → `mockCreature()` in `tests/unit/item/service.test.js`
- `tests/helpers/fixtures.js`: any `robot` references

Files:
- `tests/unit/creature/robots.test.js` → rename to `creatures.test.js` (if not already)
- `tests/unit/creature/swap.test.js`
- `tests/unit/creature/party.test.js`
- `tests/unit/creature/collection-service.test.js`
- `tests/unit/combat/creature-combat-service.test.js`
- `tests/unit/combat/effects.test.js`
- `tests/unit/game/exploration-xp.test.js`
- `tests/unit/item/service.test.js`
- `tests/unit/item/xp.test.js`
- `tests/helpers/fixtures.js`

**Step 5: Run ALL tests**

```bash
npm run test:unit
npm run test:integration
```

All tests must pass.

**Step 6: Update `CLAUDE.md`**

Key changes:
- `data/robots.json` → remove (file doesn't exist; reference `data/creatures.json` instead)
- `js/ui/` includes: `robot-row` → `creature-row`
- Services: `Robot combat, collection` → `Creature combat, collection`
- Constants: `ROBOTS` → `CREATURES`
- Playwright tip: `.robot-popup` → `.creature-popup`
- "Players use robots and consumable items" → "Players use creatures and consumable items"
- Key Directories section: update all file descriptions

**Step 7: Update `docs/ARCHITECTURE.md`**

Search-and-replace `robot` → `creature` throughout (case-sensitive where needed). This is a documentation file so the risk is low.

**Step 8: Update `docs/playtest-guide.md`**

Same approach — search-and-replace `robot` → `creature` in all relevant sections.

**Step 9: Final verification**

```bash
# Grep for any remaining "robot" references in tracked source files (excluding docs/plans/)
git ls-files | grep -v node_modules | grep -v docs/plans/ | xargs grep -li 'robot' --include='*.js' --include='*.css' --include='*.html' --include='*.json' 2>/dev/null
```

This should return empty (or only `data/` files that are gitignored, and the design doc).

**Step 10: Commit**

```bash
git add -A
git commit -m "refactor: move sprites to /creatures/, rename tests, update docs — completes robot→creature rename"
```

---

## Post-Rename Verification Checklist

After all 6 commits:

1. `npm run test:unit` — all pass
2. `npm run test:integration` — all pass
3. `grep -r 'robot' src/ public/ --include='*.js' --include='*.css' --include='*.html' -l` — empty
4. `node --check server.js` — OK
5. Server starts: `npm run dev` and verify no crash
6. No remaining `robotParty`, `robotCollection`, `isRobotCombat` in any source file
