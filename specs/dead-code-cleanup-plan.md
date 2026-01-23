# Dead Code Cleanup Plan (Revised v2)

## Summary

Massive cleanup of experimental/dead features. The game's core loop: vocab-pause combat (word review triggers each attack cycle), pipeline chips (5 flat slots, all fire), post-combat free chip rewards (1 of 3), shrine rooms, ward exploration, boss progression. Everything else is dead code.

---

## Key Corrections from Original Plan

| Original Plan Said | Corrected Action |
|---|---|
| Remove status effects from enemy.js | **KEEP all enemy abilities** (freeze, sleep, barrier, vanish, berserk are live) |
| DELETE realtime-combat.js entirely | **KEEP realtime-combat.js** - it's the ONLY combat loop (vocab-pause system) |
| DELETE `/realtime-attack`, keep `/attack` | **KEEP `/realtime-attack`**, DELETE `/attack` (unused) |
| Remove blacksmith room | Correct - remove, chip upgrade will be rebuilt as level system at shrine |
| Remove equipment from player | Correct - but also **redesign chip slots to flat 5-slot array** |
| Remove shop endpoints | **Keep post-combat chip selection** (make FREE), remove merchant shop only |
| Remove gold | **KEEP gold** - reserved for future shrine chip level-up |

### Why "Realtime" Combat is Actually the Turn-Based System

Despite the misleading name, `realtime-combat.js` implements **vocab-pause turn-based combat**:

1. Combat starts paused → word cards shown via `wordPractice.initCombatWords()`
2. Player reviews a word → `resumeCombatAfterVocab()` fires
3. Player attack via `/realtime-attack` (attackerType: 'player')
4. 400ms delay → Enemy attack via `/realtime-attack` (attackerType: 'enemy')
5. `combatPausedForVocab = true` → waits for next word review
6. Repeat from step 2

The `/attack` endpoint and `performAttack()` in game.js are **never called** in the live game. They are the actual dead code.

---

## Phase 1: Delete Dead Files ✅ DONE

Deleted entirely:
- `src/game/items/equipment.js` (930 lines)
- `src/game/items/class-equipment.js` (105 lines)
- `src/game/items/sets.js` (182 lines)
- `src/game/items/skills.js` (165 lines)
- `src/game/items/consumables.js` (297 lines)
- `src/game/events.js` (139 lines)

**~1,818 lines deleted**

**Did NOT delete**: `public/js/ui/realtime-combat.js` (it's the live combat loop)

---

## Phase 2: Fix Import Chains ✅ DONE

### `src/game/items/index.js`
- Removed all imports/re-exports from deleted modules (equipment, consumables, skills, sets, class-equipment)
- Removed `getAllItems`, `getItemsByType`, `ITEM_SETS`, `getEquippedSetBonuses`, `HACKER_EQUIPMENT`, `getMaxChipSlots`
- Kept chip-related re-exports from chips.js
- Kept `calculateEquipmentBonuses` (returns zeros), `getItem` (checks chips only), `getSkill` (returns null), `getClassStartingEquipment` (returns default weapon), `hasRangedWeapon` (returns false) as stub functions — other files still import these
- Kept refinement system (self-contained, used by rewards.js)

### `src/game/items.js` (top-level barrel)
- Updated to re-export only what's available from new index.js

### `src/game/services/combat-service.js` and `exploration-service.js`
- Removed `import { eventBus, GameEvents } from '../events.js'`
- Removed all `eventBus.emit(...)` calls (8 in combat-service, 6 in exploration-service)

### Additional fixes (discovered during implementation)
- `src/game/state.js`: removed dead `import { CLASS_CONFIG } from './items/class-equipment.js'`
- `server.js`: removed unused `CONSUMABLES`, `SKILLS` from items.js import

### Branch
`refactor/dead-code-cleanup-phases-1-2` — server starts and runs cleanly, playtested OK

---

## Phase 3: Simplify Equipment (Keep Weapon as Chip Holder) ✅ DONE

Keep the existing `player.equipment.weapon.equippedChips` structure unchanged. The weapon is just a chip holder with no stats. This means ALL existing chip pipeline code works without modification.

### `src/game/state.js` - `createNewPlayer()` becomes:
```javascript
{
  name, class, hp: 100, maxHp: 100, attack: 15, gold: 250,
  chips: [],
  equipment: { weapon: { id: 'defaultWeapon', equippedChips: [] } }
}
```

Remove: `stats`, `sp`, `maxSp`, `statPoints`, `level`, `xp`, `rank`, `inventory`, `statuses`
Remove: body/shield/accessory equipment slots (only weapon remains)
Remove functions: `allocateStat()`, `checkLevelUp()`, `recalculatePlayerResources()`, `getRankIndex()`, `getNextRank()`, `RANKS`

### `src/game/items/class-equipment.js` → ✅ Already deleted in Phase 1
- `getClassStartingEquipment()` is now a stub in `index.js` returning `{ weapon: { id: 'defaultWeapon', equippedChips: [] } }`

### `src/game/items/chips.js` - Minimal changes:
- `getWeaponPipelineChips(player)` → **NO CHANGES** (already reads `player.equipment.weapon.equippedChips`)
- `equipChip(player, equipmentSlot, chipId)` → **NO CHANGES** (already works, frontend always passes 'weapon')
- `unequipChip(player, equipmentSlot, chipId)` → **NO CHANGES** (already works)
- `getEquippedChips(player)` → simplify to only check weapon slot (remove body/shield/accessory iteration)
- `getChipLoadout(player)` → simplify to only return weapon slot data (keep `{ equipment: { weapon: {...} }, inventory: [...] }` shape so frontend doesn't crash)
- DELETE: `attemptChipUpgrade`, `getNextRarity`, `getUpgradeCost`, `getUpgradeFailureChance`, `createUpgradedChip`, `CHIP_UPGRADE_CONFIG`

### `src/game/services/combat-service.js`
- **NO CHANGES** to SACRIFICE/UNSTABLE_CORE handlers (already correctly access `player.equipment.weapon.equippedChips`)

### `src/game/combat/player-actions.js`
- Remove equipment bonus checks (armorPen, doubleStrike, vsBossDamage, etc.) - they all return 0 anyway
- `getWeaponPipelineChips(player)` call remains unchanged
- Keep `executePlayerAttack()` (used by `executeRealtimeCycle()`)

### `src/game/loop.js`
- Remove `calculateEquipmentBonuses` import and calls
- Remove equipment/inventory delegation methods (for body/shield/accessory)
- Update `getState()` to not enrich with equipment bonuses

---

## Phase 4: Delete Dead Turn-Based Combat Code ✅ DONE

The unused turn-based `/attack` system (never called by frontend):

### `src/game/services/combat-service.js`
- DELETE `executeAttack()` method (the turn-based version, ~180 lines)
- KEEP `executeRealtimeCycle()` (the live vocab-pause combat loop)

### `src/game/loop.js`
- DELETE `attack()` delegation method
- KEEP `realtimeAttackCycle()` method

### `src/routes/game/combat.js`
- DELETE `/attack` endpoint handler
- DELETE `/equip`, `/unequip` endpoints (equipment gone)
- KEEP: `/realtime-attack`, `/start-encounter`, `/start-boss`, `/combat-end-narration`

### `src/game/combat/player-actions.js`
- DELETE `executeAttack()` (legacy function at line 189, never called in live flow)
- KEEP `executePlayerAttack()` (called by `executeRealtimeCycle()`)

### `src/game/stats.js`
- DELETE: `calculateASPD()`, `calculateAttackInterval()`, `getEntityAttackInterval()`
- These return hardcoded values (1000ms) and the frontend never uses the intervals for timing - combat pacing is entirely controlled by vocab pause + 400ms delay

### `src/game/services/combat-service.js` - ASPD cleanup
- Remove `import { getEntityAttackInterval } from '../stats.js'`
- Remove `getEntityAttackInterval()` calls in `executeRealtimeCycle()` (lines 334-335)
- Remove `playerInterval`/`enemyInterval` from `executeRealtimeCycle()` response object

### `public/js/ui/realtime-combat.js` - ASPD cleanup
- Remove `currentPlayerInterval`/`currentEnemyInterval` state variables
- Remove assignments from API response (`result.playerInterval`, `result.enemyInterval`)
- Combat timing remains unchanged (400ms delay before enemy attack, vocab pause for player)

### Frontend (`public/game.js`)
- DELETE `performAttack()` function (never called by UI)
- DELETE `window.performAttack` export
- Remove attack-related imports from api.js if unused

### `public/js/api.js`
- DELETE `attack()` function (never called)
- Remove from exports

---

## Phase 5: Remove Dead Room Types ✅ DONE

### `src/game/rooms.js`
- Keep only: `encounter`, `shrine`, `boss`
- DELETE constants: `TRAP_TYPES`, `BODY_LOOT`, `CHEST_LOOT`, `BODY_DESCRIPTIONS`, `EMPTY_DESCRIPTIONS`
- DELETE functions: `generateMerchantInventory`, `generateBodyLoot`, `generateChestLoot`, `calculateTrapDamage`, `attemptDisarm`, `attemptAvoid`, `selectLootTier`, `selectTreasureTier`
- Simplify `generateFloorRooms()`: N encounters + optional shrine + boss
- Simplify `createRoom()`, `getRoomEntryNarration()`, `getRoomActions()`: remove dead room cases

### `src/game/services/exploration-service.js`
- DELETE: `disarmTrap`, `triggerTrap`, `lootBody`, `skipBody`, `openTreasure`, `skipTreasure`
- DELETE: `getShopInventory`, `buyFromShop` (merchant)
- DELETE: `getRefinePreview`, `refineEquipment`, `getChipUpgradePreview`, `performChipUpgrade`
- KEEP: `useShrine`, `buyFromPostCombatShop`, `skipShop`, `refreshPostCombatShop`

### `src/routes/game/economy.js`
- DELETE: `/shop-buy`, `/shop-skip`, `/disarm`, `/trigger-trap`, `/loot`, `/skip-body`, `/skip-treasure`, `/open-treasure`
- DELETE: `/shop` GET, `/shop/buy` POST, `/refine-preview`, `/refine`, `/chip-upgrade-preview`, `/chip-upgrade`
- KEEP: `/post-combat-shop-buy`, `/post-combat-shop-refresh`, `/use-shrine`

### `src/routes/game/player.js`
- DELETE: `/allocate-stat`, `/stat-info`

### `src/game/loop.js`
- DELETE delegation methods for all removed features

---

## Phase 6: Make Post-Combat Chips FREE ✅ DONE

### `src/game/services/exploration-service.js` - `buyFromPostCombatShop()`
- Remove gold check and gold deduction
- Auto-equip chip if `player.equipment.weapon.equippedChips.length < 5`

### `src/game/rooms.js` - `generatePostCombatShop()`
- Set `price: 0` on generated chips

---

## Phase 7: Clean Combat Rewards ✅ DONE

### `src/game/combat/rewards.js`
- DELETE: `attemptRefinement()`, `getRefinementPreview()`, `processCounterAttack()`
- Remove equipment bonus calculations from `processVictory()` (goldFind, dropRate, xpGain, onKillHp, onKillSp)
- Simplify: gold = `enemy.goldReward`, keep chip drops

### `src/game/combat/player-actions.js`
- Remove status effect infliction from weapons (lines 127-182)
- Remove equipment imports

---

## Phase 8: Clean Stats and Prefetch ✅ DONE

### `src/game/stats.js` → keep only:
- `calculateMaxHp()`, `calculateDerivedStats()` (for ATK), `calculatePhysicalDamage()`, `calculateMagicDamage()`
- Remove all stub functions, SP, hit/flee/crit
- ASPD already deleted in Phase 4

### `src/game/prefetch.js`
- Remove dead narration prefetch queue, `eagerPrefetchForRun()`, `predictAndPrefetch()`
- Keep TTS prefetch if independent, otherwise gut the file

### `src/game/state.js` - META_UPGRADES
- Remove: `manaPool`, `potionStock`, `defensePower`, `magicPower`, `swiftness`, `potionEfficiency`, `xpGain`, `trapResist`, `skillFireball`, `skillHeal`
- Keep: `vitality`, `startingGold`, `attackPower`, `goldFind`

---

## Phase 9: Frontend Cleanup

### `public/js/ui/economy.js`
- DELETE: blacksmith functions, merchant shop functions, `formatItemStats()`
- UPDATE: `showPostCombatShopContent()` to not show prices
- KEEP: `buyFromShop()` (post-combat), `skipShop()`, `refreshShop()`

### `public/js/ui/character.js`
- DELETE: stat allocation, equipment display, SP updates
- UPDATE: chip modal for flat 5-slot model

### `public/game.js`
- Remove equipment UI, stat allocation, dead room handling
- KEEP: all realtime-combat.js integration (imports, init, startRealtimeCombat calls)

---

## Phase 10: Save Migration

Old saves contain `player.level`, `player.xp`, `player.stats`, `player.equipment.body/shield/accessory`, etc. After cleanup:
- `dm.js` references `player.level` for narration context → remove or default to 1
- `rewards.js` modifies `player.xp` → remove XP tracking entirely
- `loop.js` reads `player.level` → remove references
- Old save files will load fine (generic JSON), but code accessing removed fields crashes

**Solution**: Delete `.jrpg-save.json` as part of cleanup (require new game). Add a version field to saves going forward:
```javascript
{ version: 2, player: { ... }, completedRuns: [], savedAt: '...' }
```

---

## Phase 11: Verification

1. `node --check` all modified JS files
2. `npm run test:unit` - remove/update tests for deleted features
3. `./scripts/e2e-test.sh` - fix failures
4. Manual test: create player → explore → encounter → word card appears → answer word → attack fires → enemy attacks → word card appears → repeat → victory → pick free chip → next room → shrine → boss → next floor
5. Verify enemy abilities still work (freeze, barrier, vanish, berserk)
6. Verify chip pipeline fires all 5 equipped chips
7. No console errors in browser or server
8. Verify combat pacing: word review → player attack → 400ms → enemy attack → pause

---

## DO NOT REMOVE (critical live systems)

- **Vocab-pause combat loop** (`realtime-combat.js`, `/realtime-attack`, `executeRealtimeCycle()`, `/combat-end-narration`)
- Enemy status effects and abilities (freeze, sleep, barrier, vanish, berserk, counter, breath, etc.)
- Post-combat chip selection (1 of 3, now free)
- Gold tracking and enemy gold drops
- DM/narration system (`src/game/dm.js`)
- JPDB vocabulary integration and word-practice.js
- Shrine rooms
- Ward/floor progression
- Enemy dialogue and intent system
- Pipeline chip execution (`executeChipPipeline`)
- `startRealtimeCombat()` calls in game.js encounter/boss flow

---

## Optional: Rename for Clarity (Separate PR)

The "realtime" naming is confusing since it's actually a vocab-pause turn-based system. Consider renaming:
- `realtime-combat.js` → `combat-loop.js`
- `/realtime-attack` → `/combat-cycle`
- `executeRealtimeCycle()` → `executeCombatCycle()`
- `startRealtimeCombat()` → `startCombatLoop()`
- `realtimeAttackCycle()` → `combatCycle()`

---

## Estimated Impact

- **~3,500-4,500 lines of code deleted** across all files
- **~15-20 files modified** (stripping dead references)
- **6 files deleted entirely** (Phase 1, class-equipment.js included)
- **1 simplification**: multi-slot equipment → single weapon chip holder (no stat bonuses)
- Game functionality preserved: vocab-pause combat, chips, free chip rewards, exploration, vocabulary, narration, enemy abilities

### Progress So Far
- **Phases 1-2**: ✅ Complete (2,035 lines removed, 12 files changed, 6 files deleted)
- **Combat reload fix**: ✅ `game.js` now auto-resumes `startRealtimeCombat()` on page load when in combat phase (fixes stuck UI on refresh)
- **Flaky test fix**: ✅ `combat.spec.ts` "should show word cards" rewritten to use `setupCombat()` instead of fragile room-navigation loop (87/87 E2E pass)
- **Phase 3**: ✅ Complete (~836 lines removed, 13 files changed, 1 test file deleted)
  - Simplified `createNewPlayer()`: removed stats, sp, maxSp, statPoints, level, xp, rank, statuses
  - Removed: `allocateStat`, `checkLevelUp`, `recalculatePlayerResources`, `getRankIndex`, `getNextRank`, `calculateXpToNext`, `getFullPlayerStats`
  - Removed: `CHIP_UPGRADE_CONFIG`, `attemptChipUpgrade`, `getNextRarity`, `getUpgradeCost`, `getUpgradeFailureChance`, `createUpgradedChip`
  - Simplified `getEquippedChips`, `getChipLoadout`, `equipChip` to weapon-only
  - Removed equipment bonus checks from `executePlayerAttack` (armorPen, doubleStrike, vsBossDamage, damageBonus)
  - Removed blacksmith/refinement/chip-upgrade endpoints and service methods
  - Removed dead imports from: server.js, loop.js, state.js, combat-service.js, exploration-service.js, player routes
  - 84/84 E2E pass (3 blacksmith tests removed)
- **Phase 4**: ✅ Complete (~330 lines removed, 11 files changed)
  - Deleted `executeAttack()` from combat-service.js (~170 lines), loop.js delegation, and player-actions.js (~45 lines)
  - Deleted `/attack`, `/equip`, `/unequip` route endpoints
  - Deleted ASPD functions from stats.js (`calculateASPD`, `calculateAttackInterval`, `getEntityAttackInterval`)
  - Removed ASPD interval tracking from `executeRealtimeCycle()` response and realtime-combat.js client state
  - Deleted `performAttack()`, `handleCombatEnd()`, `window.performAttack` from game.js
  - Deleted `attack()`, `useItem()`, `useSkill()`, `enemyTurn()` from api.js
  - Removed unused combat imports from combat-service.js, combat/index.js, combat.js barrel
  - 84/84 E2E pass, 49/49 unit tests pass
- **Phase 5**: ✅ Complete (~998 lines removed, 4 files changed)
  - Simplified ROOM_TYPES to only encounter/shrine/boss
  - Simplified generateFloorRooms: N encounters + optional shrine (40% chance) + boss
  - Removed: TRAP_TYPES, BODY_LOOT, CHEST_LOOT, BODY_DESCRIPTIONS, EMPTY_DESCRIPTIONS, ROOM_WEIGHTS
  - Removed: generateMerchantInventory, generateBodyLoot, generateChestLoot, calculateTrapDamage, attemptDisarm, attemptAvoid, selectLootTier, selectTreasureTier, selectRoomType
  - Removed exploration-service methods: disarmTrap, triggerTrap, lootBody, skipBody, openTreasure, skipTreasure, getShopInventory, buyFromShop (merchant)
  - Removed economy routes: /disarm, /trigger-trap, /loot, /skip-body, /skip-treasure, /open-treasure, /shop GET, /shop/buy POST, /shop-buy
  - Removed loop.js delegations: disarmTrap, triggerTrap, lootBody, skipBody, skipTreasure, openTreasure, getShopInventory, buyFromShop
  - Kept: /shop-skip (used by frontend for post-combat shop skip)
  - 84/84 E2E pass, 49/49 unit tests pass
- **Phase 6**: ✅ Complete (~130 lines removed, 6 files changed)
  - Set `price: 0` on generated post-combat chips in rooms.js
  - Removed gold check/deduction from `buyFromPostCombatShop()`
  - Added auto-equip: chip goes to weapon slot if fewer than 5 equipped
  - Removed legacy equipment/consumable handling from buy function
  - Updated frontend: all post-combat chips show "FREE", button label "選択", narration says 獲得 instead of 購入
  - Removed dead `shopBuy` from api.js (endpoint removed in Phase 5)
  - Removed dead `apiShopBuy` callback from economy.js and game.js
  - Removed dead `equipItem()` and `addItemToInventory()` from exploration-service.js and loop.js (endpoints removed in Phase 4)
  - Removed dead `getItem` import from exploration-service.js
  - 84/84 E2E pass, 49/49 unit tests pass
- **Phase 7**: ✅ Complete (~210 lines removed, 8 files changed)
  - Deleted `attemptRefinement()`, `getRefinementPreview()`, `processCounterAttack()` from rewards.js
  - Simplified `processVictory()`: removed XP tracking, equipment bonus calculations (goldFind, dropRate, xpGain), drops/inventory logic, onKillHp/onKillSp
  - Simplified `processBossVictory()`: removed inventory manipulation (keeps bossDrop for display)
  - Removed weapon status infliction and transform code from player-actions.js
  - Removed `processCounterAttack` parameter and counter-attack blocks from `executeEnemyTurn()` in enemy.js
  - Removed dead `calculateEquipmentBonuses` import from enemy.js and mechanics.js
  - Deleted entire refinement system from items/index.js (REFINEMENT_CONFIG, getRefinementBonus, getRefinementCost, getBreakChance, getItemDisplayName)
  - Removed `calculateEquipmentBonuses` and `hasRangedWeapon` stubs (no consumers remain)
  - Cleaned barrel re-exports in combat/index.js, combat.js, items.js
  - 84/84 E2E pass, 49/49 unit tests pass
- **Phase 8**: ✅ Complete (~920 lines removed, 9 files changed)
  - stats.js: removed 13 stub functions (`calculateMaxSp`, `getStatPointCost`, `getTotalCostToReach`, `getStatPointsForLevel`, `getTotalStatPointsToLevel`, `calculateHpRegen`, `calculateSpRegen`, `calculateDefendRecovery`, `calculateHitChance`, `calculateEffectiveCrit`, `calculateFleeChance`, `calculateStatusResistance`, `calculateItemHealing`, `getStartingPlayerStats`, `STAT_NAMES`, `STAT_DESCRIPTIONS`)
  - mechanics.js: removed unused stats.js imports (5 functions imported but never called)
  - prefetch.js: gutted dead narration prefetch system (~830 lines removed), kept TTS audio cache
  - Removed: `getCachedNarration`, `setPrefetchGenerator`, `predictAndPrefetch`, `eagerPrefetchForRun`, `queuePrefetch`, `clearCombatCache`, `generateCacheKey`, `getPredictions`, `estimateDamage`, `estimatePlayerDamage`
  - state.js: removed 10 dead META_UPGRADES (manaPool, potionStock, defensePower, magicPower, swiftness, potionEfficiency, xpGain, trapResist, skillFireball, skillHeal), simplified `getMetaUpgradeEffects`
  - server.js: removed dead prefetch imports, `triggerPrefetch()`, `queueRunStartPrefetch()`, `prefetchGeneratorFn`, cached narration check
  - routes: removed `eagerPrefetchForRun`/`queueRunStartPrefetch`/`clearCombatCache` from deps chain (index.js, game/index.js, player.js, run.js)
  - 84/84 E2E pass, 49/49 unit tests pass
- **Phases 9-10**: Pending
