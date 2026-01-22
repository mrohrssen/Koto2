# Dead Code Cleanup Plan (Revised)

## Summary

Massive cleanup of experimental/dead features. The game's core loop: turn-based combat, pipeline chips (5 flat slots, all fire), post-combat free chip rewards (1 of 3), shrine rooms, ward exploration, boss progression. Everything else is dead code.

---

## Key Corrections from Original Plan

| Original Plan Said | Corrected Action |
|---|---|
| Remove status effects from enemy.js | **KEEP all enemy abilities** (freeze, sleep, barrier, vanish, berserk are live) |
| Rename realtime-combat.js → combat.js | **DELETE realtime-combat.js entirely** (turn-based only) |
| Rename `/realtime-attack` → `/attack` | **DELETE `/realtime-attack`**, keep existing `/attack` |
| Remove blacksmith room | Correct - remove, chip upgrade will be rebuilt as level system at shrine |
| Remove equipment from player | Correct - but also **redesign chip slots to flat 5-slot array** |
| Remove shop endpoints | **Keep post-combat chip selection** (make FREE), remove merchant shop only |
| Remove gold | **KEEP gold** - reserved for future shrine chip level-up |

---

## Phase 1: Delete Dead Files

Delete entirely:
- `src/game/items/equipment.js` (930 lines)
- `src/game/items/class-equipment.js` (105 lines)
- `src/game/items/sets.js` (182 lines)
- `src/game/items/skills.js` (165 lines)
- `src/game/items/consumables.js` (297 lines)
- `src/game/events.js` (139 lines)
- `public/js/ui/realtime-combat.js` (realtime UI)

**~2,100 lines deleted**

---

## Phase 2: Fix Import Chains

### `src/game/items/index.js`
- Remove all imports/re-exports from deleted modules (equipment, consumables, skills, sets, class-equipment)
- Remove `calculateEquipmentBonuses`, `hasRangedWeapon`, `getItem` (equipment version), `getAllItems`, `getItemsByType`
- Keep only chip-related re-exports from chips.js

### `src/game/items.js` (top-level barrel)
- Update to match new index.js (chips only)

### `src/game/services/combat-service.js` and `exploration-service.js`
- Remove `import { eventBus, GameEvents } from '../events.js'`
- Remove all `eventBus.emit(...)` calls (no subscribers exist)

---

## Phase 3: Chip Slot Redesign (Equipment → Flat Array)

### `src/game/state.js` - `createNewPlayer()` becomes:
```javascript
{ name, class, hp: 100, maxHp: 100, attack: 15, gold: 250, chips: [], equippedChips: [] }
```

Remove: `equipment`, `stats`, `sp`, `maxSp`, `statPoints`, `level`, `xp`, `rank`, `inventory`, `statuses`
Remove functions: `allocateStat()`, `checkLevelUp()`, `recalculatePlayerResources()`, `getRankIndex()`, `getNextRank()`, `RANKS`

### `src/game/items/chips.js` - Rewrite slot functions:
- `equipChip(player, chipId)` → push to `player.equippedChips[]` (max 5)
- `unequipChip(player, chipId)` → filter from `player.equippedChips[]`
- `getWeaponPipelineChips(player)` → map `player.equippedChips` to chip objects
- `getEquippedChips(player)` → same as above
- `getUsedChipSlots(player)` → `player.equippedChips.length`
- DELETE: `attemptChipUpgrade`, `getNextRarity`, `getUpgradeCost`, `getUpgradeFailureChance`, `createUpgradedChip`, `CHIP_UPGRADE_CONFIG`

### `src/game/services/combat-service.js`
- Update SACRIFICE/UNSTABLE_CORE handlers: `player.equippedChips.splice(...)` instead of `player.equipment.weapon.equippedChips`

### `src/game/combat/player-actions.js`
- Remove equipment bonus checks (armorPen, doubleStrike, vsBossDamage, etc.)
- Remove weapon reference, use `player.equippedChips` directly

### `src/game/loop.js`
- Remove `calculateEquipmentBonuses` import and calls
- Remove equipment/inventory delegation methods
- Update `getState()` to not enrich with equipment bonuses

---

## Phase 4: Delete Realtime Combat

### `src/game/services/combat-service.js`
- DELETE `executeRealtimeCycle()` method entirely

### `src/game/loop.js`
- DELETE `realtimeAttackCycle()` method

### `src/routes/game/combat.js`
- DELETE `/realtime-attack` endpoint
- DELETE `/equip`, `/unequip` endpoints (equipment gone)
- KEEP: `/attack`, `/start-encounter`, `/start-boss`

### `src/game/stats.js`
- DELETE: `calculateASPD()`, `calculateAttackInterval()`, `getEntityAttackInterval()`

### Frontend (`public/game.js`)
- Remove all realtime combat imports and references

---

## Phase 5: Remove Dead Room Types

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

## Phase 6: Make Post-Combat Chips FREE

### `src/game/services/exploration-service.js` - `buyFromPostCombatShop()`
- Remove gold check and gold deduction
- Auto-equip chip if `player.equippedChips.length < 5`

### `src/game/rooms.js` - `generatePostCombatShop()`
- Set `price: 0` on generated chips

---

## Phase 7: Clean Combat Rewards

### `src/game/combat/rewards.js`
- DELETE: `attemptRefinement()`, `getRefinementPreview()`, `processCounterAttack()`
- Remove equipment bonus calculations from `processVictory()` (goldFind, dropRate, xpGain, onKillHp, onKillSp)
- Simplify: gold = `enemy.goldReward`, keep chip drops

### `src/game/combat/player-actions.js`
- Remove status effect infliction from weapons (lines 127-182)
- Remove equipment imports

---

## Phase 8: Clean Stats and Prefetch

### `src/game/stats.js` → keep only:
- `calculateMaxHp()`, `calculateDerivedStats()` (for ATK), `calculatePhysicalDamage()`, `calculateMagicDamage()`
- Remove all stub functions, SP, ASPD, hit/flee/crit

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
- Remove realtime combat, equipment UI, stat allocation, dead room handling

---

## Phase 10: Verification

1. `node --check` all modified JS files
2. `npm run test:unit` - remove/update tests for deleted features
3. `./scripts/e2e-test.sh` - fix failures
4. Manual test: create player → explore → encounter → attack → victory → pick free chip → next room → shrine → boss → next floor
5. Verify enemy abilities still work (freeze, barrier, vanish, berserk)
6. Verify chip pipeline fires all 5 equipped chips
7. No console errors in browser or server

---

## DO NOT REMOVE (critical live systems)

- Enemy status effects and abilities (freeze, sleep, barrier, vanish, berserk, counter, breath, etc.)
- Post-combat chip selection (1 of 3, now free)
- Gold tracking and enemy gold drops
- DM/narration system (`src/game/dm.js`)
- JPDB vocabulary integration
- Shrine rooms
- Ward/floor progression
- Enemy dialogue and intent system
- Pipeline chip execution (`executeChipPipeline`)
- Turn-based `/attack` endpoint and `executeAttack()` in combat-service

---

## Estimated Impact

- **~3,500-4,500 lines of code deleted** across all files
- **~15-20 files modified** (stripping dead references)
- **7 files deleted entirely**
- **1 architectural change**: equipment-based chip slots → flat 5-slot array
- Game functionality preserved: turn-based combat, chips, free chip rewards, exploration, vocabulary, narration, enemy abilities
