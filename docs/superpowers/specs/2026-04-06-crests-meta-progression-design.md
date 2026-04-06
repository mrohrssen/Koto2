# Crests (紋) — Meta Progression System

**Date:** 2026-04-06
**Status:** Approved
**Replaces:** Meta-upgrades system (progressionTokens, hp_boost/atk_boost/xp_boost)

## Overview

Crests are equippable elemental tokens that provide permanent party-wide stat buffs. Players earn element drops by defeating enemies, spend drops to open element-matched chests (gacha-style), and equip one crest per element (5 slots total). This replaces the old meta-upgrade shop entirely.

## Core Loop

```
Defeat enemy → Collect 1 element drop (matches enemy type)
              → Accumulate drops across runs (persistent)
              → Spend 3 drops to open matching chest
              → Gacha reveal with PixiJS animation
              → Receive random crest (rarity-weighted)
              → Equip best crest per element slot
              → Party stats buffed in all content
```

## Element → Stat Mapping

| Element | Stat Buffed | Field | Notes |
|---------|-------------|-------|-------|
| Fire    | ATK         | baseAttack   | % multiplier to base attack |
| Water   | MP          | baseMp       | % multiplier to base MP |
| Wood    | HP          | baseHp       | % multiplier to base HP |
| Earth   | DEF         | baseDefense  | % multiplier to base defense |
| Metal   | XP          | xpMultiplier | % multiplier to XP gain |

## Rarity Tiers

| Rarity    | Buff Range | Drop Rate |
|-----------|-----------|-----------|
| Common    | +3–5%     | 60%       |
| Uncommon  | +6–10%    | 25%       |
| Rare      | +11–18%   | 10%       |
| Epic      | +19–28%   | 4%        |
| Legendary | +29–40%   | 1%        |

Within each tier, the exact value is randomly rolled (uniform distribution).

## Data Model

### Meta-Progression Additions

```javascript
// Replaces progressionTokens and upgrades
elementDrops: { fire: 0, water: 0, earth: 0, wood: 0, metal: 0 },
crests: [],           // Array of all owned crest objects
equippedCrests: {     // One slot per element, crest ID or null
  fire: null,
  water: null,
  earth: null,
  wood: null,
  metal: null
}
```

### Crest Object

```javascript
{
  id: "crest_fire_a7x3",   // Unique ID (element + random suffix)
  element: "fire",          // fire|water|earth|wood|metal
  rarity: "rare",           // common|uncommon|rare|epic|legendary
  stat: "attack",           // The stat this element always buffs
  value: 0.15               // +15% (rolled within rarity band)
}
```

### Meta-Progression Removals

- `progressionTokens` — delete
- `upgrades` — delete
- `data/meta-upgrades.json` — delete file

## Element Drop Mechanics

- **Source:** Defeating enemies in PvE combat
- **Amount:** Exactly 1 drop per enemy, matching the enemy's element
- **Persistence:** Stored on meta-progression, accumulates across all runs
- **PvP:** No drops from PvP battles
- **Flee/Lose:** No drops on flee or loss
- **Display:** Animated pickup during combat (elemental orb visual). No summary screen — players see totals on the Chests screen.

## Chest Opening

- **Cost:** 3 element drops of matching type
- **Result:** 1 random crest of that element, rarity determined by loot table
- **No tiered chests** — single chest type per element, flat cost
- **No multi-pull** — one chest at a time

### PixiJS Chest Animation Sequence

1. **Chest appears** center screen — element-colored chest bounces in
2. **Chest shakes** — builds anticipation (0.5–1s)
3. **Chest bursts open** — lid flies off, particles explode outward
4. **Rarity reveal** — screen flashes rarity color, crest rises from chest:
   - **Common:** white/gray, subtle particles
   - **Uncommon:** green glow, gentle sparkles
   - **Rare:** blue burst, brighter particles
   - **Epic:** purple explosion, screen shake, heavy particles
   - **Legendary:** gold eruption, full-screen flash, sustained particle shower
5. **Crest card lands** — shows element icon, rarity border, stat and value (e.g., "ATK +15%")
6. **Tap to dismiss** — returns to chest screen with updated drop count

Timing: ~2–3s for common, ~4–5s for legendary.

## Hub UI Changes

### Old Hub (remove)
1. 📚 速習 (Vocab Review)
2. ⬆️ 強化 (Upgrades) ← **DELETE**
3. ⚔️ Multiplayer Battle
4. ⚡ 潜入 (Infiltrate)

### New Hub
1. 📚 速習 (Vocab Review)
2. 🎁 **Chests** (open chests with element drops)
3. 🔮 **Crests** (equip crests)
4. ⚔️ Multiplayer Battle
5. ⚡ 潜入 (Infiltrate)

## Chests Screen

- 5 chests displayed, one per element, each with element color/icon
- Below each chest: current drop count and cost (e.g., "7/3")
- Affordable chests glow/pulse to indicate they can be opened
- Tapping an affordable chest triggers the PixiJS gacha animation
- Match existing game UI colors and styling

## Crests (Equip) Screen

- **Top:** 5 equip slots in horizontal row, one per element with element icons
  - Empty: dimmed element icon with "+"
  - Filled: equipped crest with rarity border color (white/green/blue/purple/gold)
- **Below:** Scrollable inventory grid of all owned crests
  - Filter tabs: All / Fire / Water / Wood / Earth / Metal
  - Sorted by rarity (best first), then value
  - Each tile: element icon, rarity border, stat value (e.g., "+15%")
  - Crests weaker than currently equipped are slightly dimmed
- **Equip flow:**
  1. Tap equip slot → inventory auto-filters to that element
  2. Tap crest from inventory → preview shows stat comparison (current vs. new)
  3. Confirm → crest equips, slot lights up
  4. Tap equipped crest to unequip
- **Visual style:** match existing game UI. Rarity borders: white / green / blue / purple / gold. Subtle breathing glow on equipped slots.

## Crest Buff Application

- **When:** At creature instantiation — applies to all creatures when they are created
  - Run start (party creatures spawned)
  - Mid-run befriending (new creature joins party)
  - PvP team assembly
- **How:** % multiplier to base stat after level scaling and rarity multipliers, before in-run item buffs
- **Scope:** Always active in all content (PvE and PvP)
- **No stacking:** One crest per element, max 5 buffs active
- **Consistent:** Same code path for all creature instantiation — buff is part of the spawn function, not a separate pass

### Application Order

```
Base stat → Level scaling → Rarity multiplier → Crest buff → In-run item buffs
```

## Crest Inventory Management

- **No salvage or merge** in v1 — players hoard all crests and equip the best
- **No inventory limit** for v1
- Future: may add salvage (discard for drops) or merge (combine 3 → next tier) based on how inventory bloat feels

## Visual Identity

- **Element icons:** Simple elemental symbols (flame, droplet, leaf, rock, gear)
- **Rarity borders:** white (common), green (uncommon), blue (rare), purple (epic), gold (legendary)
- No unique names or Japanese word tie-in for v1 — just element + rarity + value

## Migration

- **Clean wipe:** No migration from old meta-upgrades
- `progressionTokens` and `upgrades` fields silently dropped on save load
- Players start fresh with 0 drops and no crests

## Files to Remove

- `data/meta-upgrades.json`
- `public/js/ui/meta-shop.js`
- Meta-shop button in `public/js/ui/exploration.js`
- `progressionTokens` / `upgrades` references in `src/game/state.js`
- Token reward logic from boss/befriend handlers in `server.js`

## Files to Create/Modify

- `src/game/services/crest-service.js` — crest generation, chest opening, equip logic
- `public/js/ui/chests.js` — chest screen UI
- `public/js/ui/crests.js` — equip screen UI
- `public/js/ui/chest-animation.js` — PixiJS gacha animation
- `src/game/state.js` — new meta-progression fields
- `src/game/creatures.js` — crest buff application at instantiation
- `server.js` — new API endpoints, element drop on enemy defeat
- `public/js/ui/exploration.js` — hub button changes
- `data/creatures.json` — no changes needed (elements already defined)
