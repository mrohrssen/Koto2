# Dead Code Cleanup Plan

## Summary

Massive cleanup of experimental/dead features accumulated during development. The game's core is: turn-based combat (vocab-pause style), pipeline chips, HP/attack stats, ward exploration. Everything else has been disabled or stubbed.

---

## Files to DELETE Entirely

| File | Lines | Reason |
|------|-------|--------|
| `src/game/items/equipment.js` | 930 | No equipment system |
| `src/game/items/class-equipment.js` | 105 | No starter gear |
| `src/game/items/sets.js` | 182 | Set bonuses never called |
| `src/game/items/skills.js` | 165 | Skills to be rebuilt as chips |
| `src/game/items/consumables.js` | 297 | No consumables |
| `src/game/items/index.js` | ~226 | Barrel for deleted modules |
| `src/game/items.js` | ~50 | Top-level barrel |
| `src/game/events.js` | 139 | Event bus unused, no subscribers |

**~2,094 lines deleted**

---

## Files to HEAVILY Modify

### 1. `src/game/stats.js` (~148 lines → ~30 lines)
**Remove:**
- All stub functions: `getStatPointCost`, `getTotalCostToReach`, `getStatPointsForLevel`, `getTotalStatPointsToLevel`, `calculateHpRegen`, `calculateSpRegen`, `calculateDefendRecovery`, `calculateFleeChance`, `calculateStatusResistance`, `calculateItemHealing`
- ASPD functions: `calculateASPD`, `calculateAttackInterval`, `getEntityAttackInterval`
- Derived stats from `calculateDerivedStats`: def, matk, mdef, hit, flee, crit, critShield, perfectDodge
- SP functions: `calculateMaxSp`
- `STAT_NAMES`, `STAT_DESCRIPTIONS` (return empty objects)

**Keep:**
- `calculateMaxHp` (returns 100 + bonus)
- `getStartingPlayerStats` (just hp/attack)
- `calculateDamage` (attack * variance)

### 2. `src/game/state.js`
**Remove from `createNewPlayer()`:**
- `stats` object (str, agi, vit, int, dex, luk)
- `equipment` slots (weapon, armor, shield, accessory)
- `sp`, `maxSp`
- `statPoints`, `level`, `xp`
- `rank`
- `inventory` (if only held consumables/equipment)

**Remove functions:**
- `calculateXpToNext()`
- `checkLevelUp()`
- `allocateStat()`
- `recalculatePlayerResources()`
- `getRankIndex()`, `getNextRank()`
- `RANKS` constant

**Keep:** hp, maxHp, attack, gold, chips, name, class

### 3. `src/game/combat/player-actions.js`
**Remove:**
- All equipment bonus checks: `armorPen`, `doubleStrike`, `vsBossDamage`, `damageBonus`, `statusInflictBonus`
- Status effect infliction from weapons (lines 127-160)
- Transform effect from weapons (lines 162-182)
- Imports from deleted items modules

**Keep:** Basic attack calculation, chip pipeline execution

### 4. `src/game/combat/rewards.js`
**Remove:**
- `attemptRefinement()` function
- `getRefinementPreview()` function
- `processCounterAttack()` function
- On-kill HP/SP from equipment
- XP bonus calculations
- Equipment bonus imports
- `goldFind`, `dropRate`, `xpGain` bonus calculations

**Keep:** Gold rewards, basic victory processing, chip drops

### 5. `src/game/combat/enemy.js`
**Remove:**
- Status effect application code
- Status effect DoT processing
- Any references to player defense/resistance

**Keep:** Enemy turns, abilities, intent system, damage dealing

### 6. `src/game/rooms.js`
**Remove room types:**
- `blacksmith`
- `merchant`
- `body`
- `treasure`
- `trap`

**Remove functions:**
- `generateMerchantInventory()`
- Trap logic (disarm/trigger)
- Body/chest loot tables (`BODY_LOOT`, `CHEST_LOOT`)

**Keep:** `empty`, `encounter`, `shrine` (and any other active room types)

### 7. `src/game/services/exploration-service.js`
**Remove:**
- `getRefinePreview()` method
- `refineEquipment()` method
- `getChipUpgradePreview()` method (blacksmith removed)
- `performChipUpgrade()` method (blacksmith removed)
- Shop/merchant handling
- Trap handling
- Body/treasure room handling
- Equipment slot references

### 8. `src/game/services/combat-service.js`
**Remove:**
- `checkLevelUp()` calls after combat
- Turn-based `executeAttack()` method (dead code, never called from frontend)
- Turn validation logic for the dead turn-based mode
- Status effect processing
- SP-related code

**Rename:** "realtime" references → just "combat" (e.g., `executeRealtimeCycle` → `executeCombatCycle`)

### 9. `src/game/loop.js` (GameManager)
**Remove:**
- Dead method delegations to removed features
- Equipment/inventory methods
- Stat allocation methods
- Shop/blacksmith methods
- Refinement methods

### 10. `src/game/prefetch.js`
**Remove:**
- Dead narration prefetch queue (generator returns null)
- `eagerPrefetchForRun()`
- `predictAndPrefetch()`
- All queue management for narration
- Prefetch statistics tracking

**Keep:** TTS prefetch if it works independently

### 11. Server Routes
**`src/routes/game/economy.js`:**
- Remove `/shop-buy`, `/shop-skip` endpoints
- Remove `/post-combat-shop-buy`, `/post-combat-shop-refresh`
- Remove trap disarm/trigger endpoints
- Remove blacksmith/refinement endpoints

**`src/routes/game/player.js`:**
- Remove `/allocate-stat` endpoint

**`src/routes/game/misc.js`:**
- Remove `/debug-force-combat`, `/debug-force-blacksmith`, `/debug-chips`
- Remove `/narrate` endpoint

**`src/routes/game/combat.js`:**
- Remove `/attack` (turn-based, never called)
- Rename `/realtime-attack` → `/attack`

### 12. Frontend - `public/game.js`
**Remove:**
- `triggerJpdbParse()` (disabled)
- Stat allocation functions
- Equipment-related functions
- SP bar updates
- Status effect display code
- References to deleted endpoints

**Rename:** realtime combat function names

### 13. Frontend - `public/js/ui/economy.js`
**Remove:**
- `openBlacksmith()`, `refineItemHandler()`, `closeBlacksmith()`
- `openChipUpgradeModal()`, `performChipUpgrade()`, `closeChipUpgradeModal()`
- Shop buy/sell functions
- `formatItemStats()` equipment stat formatting
- Equipment slot rendering

### 14. Frontend - `public/js/ui/character.js`
**Remove:**
- Stat allocation functions (getStatPointCost, calculateDerivedPreview, handleStatIncrease/Decrease, etc.)
- `updateEquipment()` function
- `equipItem()`, `unequipItemHandler()` functions
- `allocateStatPoint()` function
- SP display updates

### 15. Frontend - `public/js/ui/realtime-combat.js`
**Rename:** File to `combat.js`, rename exported functions to remove "realtime" prefix

### 16. `src/game/combat/mechanics.js`
**Remove:**
- Hit/miss/crit/dodge fields from `resolvePhysicalAttack()` return value
- `getCombatPreview()` hit/crit chance calculations
- Perfect dodge references

---

## Systems to KEEP

- `stats.full.js` (as reference, clearly marked)
- `chips.old.json` (as reference)
- `src/game/simulation/` (actively used)
- All spec files
- Gold tracking (no spending yet, future use)
- Pipeline chip system (core mechanic)
- Ward/floor progression
- DM/narration system
- Enemy dialogue and intent system
- JPDB vocabulary integration
- Shrine rooms

---

## Verification

After cleanup:
1. `node --check` all modified JS files for syntax
2. Run `npm run test:unit` (49 tests) - many will need updating/removing
3. Run `./scripts/e2e-test.sh` - expect some test failures from removed features
4. Manual test: start game → create character → explore → encounter enemy → complete combat → check state
5. Verify no console errors in browser
6. Verify no server startup errors

---

## Estimated Impact

- **~3,000-4,000 lines of code deleted** across all files
- **~15-20 files modified** (stripping dead references)
- **8 files deleted entirely**
- Game functionality preserved: combat, chips, exploration, vocabulary, narration
