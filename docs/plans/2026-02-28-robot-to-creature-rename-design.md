# Robot → Creature Terminology Rename

**Date:** 2026-02-28
**Status:** Approved

## Problem

The game transitioned from "robots" to "creatures" but the codebase is a hybrid: data files and the narration engine use "creature," while the game engine, UI, CSS, HTML, API endpoints, and sprite paths still use "robot." This is confusing for developers and makes the code harder to maintain.

## Scope

~1,700 occurrences of "robot" across 40+ tracked files. The rename touches every layer: state keys, core logic, server routes, frontend JS, CSS classes, HTML IDs, asset paths, tests, and docs.

## Approach: Layered Rename (6 commits)

Each commit is independently testable. Run `npm run test:unit` after each.

## Save Migration (Critical)

**DO NOT bump `SAVE_VERSION`.** Both save paths (`server.js` and `manager-registry.js`) discard saves with version < SAVE_VERSION, so a version bump would destroy all existing player data.

Instead, use key-based migration on load:

```js
if (data.meta.robotCollection && !data.meta.creatureCollection) {
  data.meta.creatureCollection = data.meta.robotCollection;
  delete data.meta.robotCollection;
  needsSave = true;
}
```

- Old saves (`robotCollection`) → renamed on load, re-saved with new key
- New saves → use `creatureCollection` from the start
- Idempotent — safe to run twice
- No run-state migration needed (`robotParty` is ephemeral, resets each run)

## Naming Convention

| Old | New |
|-----|-----|
| `robot` | `creature` |
| `Robot` | `Creature` |
| `ROBOT` | `CREATURE` |
| `robotParty` | `creatureParty` |
| `robotCollection` | `creatureCollection` |
| `isRobotCombat` | `isCreatureCombat` |
| `.robot-slot` | `.creature-slot` |
| `/api/game/start-robot-encounter` | `/api/game/start-creature-encounter` |
| `/assets/sprites/robots/` | `/assets/sprites/creatures/` |

## Commit Plan

### Commit 1 — Data/State Layer

Files: `state.js`, `manager-registry.js`, `loop.js` (initMeta guard), `server.js` (legacy save migration)

- `state.js`: rename `robotParty` → `creatureParty`, `robotCollection` → `creatureCollection`, `isRobotCombat` → `isCreatureCombat`
- `manager-registry.js`: key-rename migration (robotCollection → creatureCollection), update imports
- `loop.js`: update `initMeta()` fallback check from `robotCollection` to `creatureCollection`
- `server.js`: add same key-rename migration in legacy save load path

### Commit 2 — Core Logic (file renames + exports)

Files: `robots.js` → `creatures.js`, `robot-combat-service.js` → `creature-combat-service.js`, `robot-collection-service.js` → `creature-collection-service.js`, `combat/effects.js`, `dm.js`

- `ROBOT_DATA` → `CREATURE_DATA`, `ROBOTS_BY_ID` → `CREATURES_BY_ID`
- `instantiateRobot` → `instantiateCreature`
- `addXpToRobot` → `addXpToCreature`
- `calculateRobotDamage` → `calculateCreatureDamage`
- `generateEnemyRobot` → `generateEnemyCreature`
- `generateEnemyRobots` → `generateEnemyCreatures`
- `getRobotBuyPrice` → `getCreatureBuyPrice`, `getRobotSellPrice` → `getCreatureSellPrice`
- `generateDealerRobots` → `generateDealerCreatures`
- `handleRobotKO` → `handleCreatureKO`
- `ROBOT_PRICES` → `CREATURE_PRICES`
- `DEFAULT_COLLECTION` export stays the same (name is generic)
- `effects.js`: rename `robot` params to `creature`
- `dm.js`: `'ロボット'` fallback → appropriate creature name

### Commit 3 — Server Routes

Files: `src/routes/game/combat.js`, `src/routes/game/run.js`, `src/routes/game/economy.js`, `server.js`

API endpoint renames:
- `/api/game/start-robot-encounter` → `/api/game/start-creature-encounter`
- `/api/game/robot-combat-cycle` → `/api/game/creature-combat-cycle`
- `/api/game/robot-collection` → `/api/game/creature-collection`
- `/api/game/swap-robot` → `/api/game/swap-creature`
- `/api/game/rearrange-robots` → `/api/game/rearrange-creatures`
- `/api/game/swap-robot-equip` → `/api/game/swap-creature-equip`

Body param renames: `robotId` → `creatureId`, `releaseRobotId` → `releaseCreatureId`

Sprite path string: `'/assets/sprites/robots/${c.id}.webp'` → `'/assets/sprites/creatures/${c.id}.webp'`

### Commit 4 — Frontend JS (file rename + all UI modules)

File rename: `robot-row.js` → `creature-row.js`

Files: `sprite-utils.js`, `combat-loop.js`, `combat-effects.js`, `scene.js`, `game.js`, `api.js`, `exploration.js`, `economy.js`, `move-learn.js`, `move-select.js`, `takeover.js`, `dom.js`, `target-select.js`, `i18n.js`

- `sprite-utils.js`: `robotSpritePath` → `creatureSpritePath`, `robotStaticPath` → `creatureStaticPath`, `configureRobotImg` → `configureCreatureImg`, `robotBgUrl` → `creatureBgUrl`, `probeIdleSprites` param rename, `BASE` path update
- `api.js`: all API wrapper function renames to match new endpoints
- `combat-loop.js`: ~200 occurrences of var/function renames
- `game.js`: ~118 occurrences, imports, function names, `data-robot-id` → `data-creature-id`
- `i18n.js`: key names `newRobot` → `newCreature`, `equippedRobots` → `equippedCreatures`, `reserveRobots` → `reserveCreatures`
- All other UI modules: variable and param renames

### Commit 5 — CSS + HTML

Files: `game.css`, `game.html`

- `game.css`: all 40 `.robot-*` classes → `.creature-*`, keyframes `robot-death` → `creature-death`, `robot-swap-in` → `creature-swap-in`
- `game.html`: IDs `robot-equip-view` → `creature-equip-view`, `robot-equip-close` → `creature-equip-close`, `robot-equip-content` → `creature-equip-content`, update comments

### Commit 6 — Assets + Docs + Tests

- `git mv public/assets/sprites/robots/ public/assets/sprites/creatures/`
- Bump `SPRITE_VERSION` in `sprite-utils.js`
- Rename test directory `tests/unit/robot/` → `tests/unit/creature/`
- Rename `tests/unit/combat/robot-combat-service.test.js` → `creature-combat-service.test.js`
- Update all test imports and descriptions
- Update `CLAUDE.md`: key directories, data file descriptions
- Update `docs/ARCHITECTURE.md`: references to robot files/concepts
- Update `docs/playtest-guide.md`: interaction instructions

## What Does NOT Change

- `data/creatures.json` — already uses "creature"
- `src/narration-engine/` — already uses "creature"
- Creature dialogue cache/memory files — already correct
- `data/items.json` descriptions — already say "creature"
- `data/character-cards/creatures.json` — already correct

## Risks

1. **CSS class renames in JS string literals** — must grep for every `.robot-` class written in JS `innerHTML` and update in lockstep with the CSS rename (commit 5 must match commit 4)
2. **`data-robot-id` HTML attributes** — used in JS event handlers via `dataset.robotId`; renaming to `data-creature-id` means `dataset.creatureId` in all handlers
3. **Sprite cache** — bumping `SPRITE_VERSION` forces re-download for all users, but the directory rename means old cached URLs 404 anyway
