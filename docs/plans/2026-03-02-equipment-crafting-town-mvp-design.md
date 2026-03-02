# Equipment, Crafting & Town MVP Design

**Date:** 2026-03-02
**Status:** Draft — awaiting review
**Scope:** Minimum viable implementation of three interconnected systems that unlock three blocked vocabulary categories (~300 words total) and add meaningful meta-progression.

## Why These Three Together

The GDD designs these as a single interlocking economy:

```
Exploration → Resources (crafting vocab)
Resources → Equipment + Consumables (equipment vocab + compound word teaching)
Gold from runs → Town buildings (structure vocab)
Creatures → Party OR Town workers (dual-role, incentivizes collecting)
```

Building any one without the others leaves dangling ends. The MVP activates all three loops at minimum depth.

---

## System 1: Equipment

### What It Teaches
~15 words at MVP: weapon nouns (剣 sword, 弓 bow, 槍 spear), armor nouns (盾 shield, 鎧 armor), material-modifier compounds (鉄の剣 Iron Sword).

### MVP Scope

**1 equipment slot per creature.** No loadout complexity. Equip one thing, it boosts stats.

**~15 equipment pieces** (the Stage 2 target from the vocab doc):

| ID | Word | Reading | Meaning | Type | Stat | Value | Rarity | Rank |
|----|------|---------|---------|------|------|-------|--------|------|
| sword | 剣 | けん | sword | weapon | attack | +2 | common | — |
| bow | 弓 | ゆみ | bow | weapon | attack | +2 | common | — |
| spear | 槍 | やり | spear | weapon | attack | +3 | uncommon | — |
| katana | 刀 | かたな | katana | weapon | attack | +3 | uncommon | — |
| shield | 盾 | たて | shield | armor | maxHp | +15 | common | — |
| armor | 鎧 | よろい | armor | armor | maxHp | +20 | uncommon | — |
| iron-sword | 鉄の剣 | てつのけん | iron sword | weapon | attack | +4 | rare | — |
| steel-shield | 鋼の盾 | はがねのたて | steel shield | armor | maxHp | +30 | rare | — |
| gold-bow | 金の弓 | きんのゆみ | gold bow | weapon | attack | +5 | epic | — |
| ... | ... | ... | ... | ... | ... | ... | ... | — |

*Exact words to be sourced from JPDB frequency lists during implementation. The above are examples matching the GDD's naming patterns.*

**Equipment sources:**
1. **Crafted** from resources (primary source, teaches compound formation)
2. **Post-combat reward** — equipment can appear as a shop option alongside consumables (rare roll)
3. **Dealer rooms** — dealers can stock equipment alongside creatures

**Stat model:** Flat bonuses only at MVP. Equipment adds a flat value to the creature's base attack or maxHp. Applied at combat time via a `getEquippedAttack(creature)` helper, same pattern as `getBuffedAttack` in item-service.

**Equip UI:** On the creature info panel (already exists for viewing creature stats), add an equipment slot showing:
- Equipment sprite (128x128, same pipeline as item icons)
- Japanese name (large) + furigana (small above)
- English meaning
- Stat bonus
- Tap to unequip / swap

**Equip management:** Between combats (exploring phase), player can open creature panel → tap equipment slot → see inventory of unequipped gear → tap to equip. Equipping is instant, no cost.

### Data Schema

```json
// data/equipment.json
{
  "id": "iron-sword",
  "word": "鉄の剣",
  "reading": "てつのけん",
  "meaning": "iron sword",
  "components": [
    { "word": "鉄", "reading": "てつ", "meanings": ["iron"], "rank": 3200 },
    { "word": "剣", "reading": "けん", "meanings": ["sword"], "rank": 5100 }
  ],
  "type": "weapon",
  "stat": "attack",
  "value": 4,
  "rarity": "rare",
  "recipe": { "iron": 2, "stone": 1 }
}
```

### State Changes

```js
// In createNewRun():
run.equipment = {
  inventory: [],        // array of equipment IDs (unequipped gear)
}

// On each creature in party:
creature.equipment = null;  // equipment ID string or null

// In createMetaProgression():
// No change — equipment doesn't persist across runs (same as items/buffs)
```

**Equipment resets each run** (same as item buffs). You find/craft equipment during a run and lose it when the run ends. This keeps the crafting loop relevant every run.

---

## System 2: Crafting

### What It Teaches
~10 words at MVP: raw material nouns (木 wood, 鉄 iron, 石 stone, 草 herb, 水 water, 土 earth, 砂 sand, 骨 bone, 布 cloth, 炎 flame).

### MVP Scope

**~10 resource types.** Each is a single Japanese word — a noun the player learns by gathering it repeatedly.

**Gathering during exploration.** When the player enters a sub-area room (any room type), there's a chance to find 1-2 resources. The sub-area's theme determines which resources spawn:
- Forest sub-areas → 木, 草
- Water sub-areas → 水, 石
- Cave sub-areas → 鉄, 石, 骨
- Open/field sub-areas → 土, 砂, 草
- Fire/magic sub-areas → 炎, 鉄

Resource pickup is a small notification: the resource icon + Japanese name + reading + meaning appears briefly. No interruption to gameplay flow.

**Simple recipes.** 2-3 resources → 1 output (equipment piece or consumable item). The crafting UI shows ingredient words visually combining into the product word. This is the compound word teaching mechanic the GDD highlights.

**~20 recipes at MVP:**
- ~10 producing equipment (the 15 equipment pieces, some found, some crafted)
- ~10 producing consumables (existing items from items.json that get a recipe added)

**Crafting UI:** Accessible from the hub (between runs) and during exploration (from the pause/menu). Shows:
- Available recipes (only those the player has discovered or that are always visible — TBD)
- Each recipe: ingredient icons + words → product icon + word
- Grayed out if missing materials
- Tap to craft

**No recipe discovery at MVP.** All recipes visible from the start. Keeps it simple.

### Data Schema

```json
// data/resources.json
[
  {
    "id": "wood",
    "word": "木",
    "reading": "き",
    "meaning": "wood / tree",
    "rank": 500,
    "icon": "wood.webp",
    "subAreaTags": ["forest", "garden"]
  }
]

// data/recipes.json
[
  {
    "id": "iron-sword",
    "ingredients": { "iron": 2, "stone": 1 },
    "output": { "type": "equipment", "id": "iron-sword" },
    "word": "鉄の剣",
    "reading": "てつのけん",
    "meaning": "iron sword"
  },
  {
    "id": "herb-tea",
    "ingredients": { "herb": 2, "water": 1 },
    "output": { "type": "item", "id": "green-tea" },
    "word": "薬草茶",
    "reading": "やくそうちゃ",
    "meaning": "herbal tea"
  }
]
```

### State Changes

```js
// In createNewRun():
run.resources = {};  // resourceId -> count (e.g., { wood: 3, iron: 1 })

// Resources reset each run (same as items/equipment)
```

**Resources reset each run.** This keeps gathering relevant every run. The town (below) is the persistent meta-progression layer.

### Gathering Mechanic

On room entry, `ExplorationService` rolls for resource drops based on the sub-area's tags:

```
chance per room: 40% to find 1 resource, 10% to find 2
resource pool: filtered by sub-area tags
```

The resource appears as a brief toast notification — no modal, no disruption. Player's resource inventory is visible in the pause menu and crafting screen.

---

## System 3: Town

### What It Teaches
~10 words at MVP (5 buildings × 2 words each — building name + upgrade modifier): 市場 market, 宿 inn, 道場 dojo, 病院 hospital, 工房 workshop. Upgrade modifiers: 小さな small, 大きな big.

### MVP Scope

**5 buildings** (the Stage 2 target):

| ID | Word | Reading | Meaning | Function | Worker Bonus |
|----|------|---------|---------|----------|-------------|
| market | 市場 | いちば | market | Better post-combat shop (extra item slot) | +1 more shop option |
| inn | 宿 | やど | inn | Heal creatures between runs (start with more HP) | Heal amount +25% |
| dojo | 道場 | どうじょう | dojo | Bonus starting XP for run creatures | +10% starting XP |
| hospital | 病院 | びょういん | hospital | Auto-revive 1 creature per run at 25% HP | Revive at 50% instead |
| workshop | 工房 | こうぼう | workshop | Unlock crafting recipes | +1 bonus resource per gather |

**2 upgrade levels per building:**
- Level 0: Not built (no effect)
- Level 1: 小さな + building (e.g., 小さな市場 "Small Market") — base effect
- Level 2: 大きな + building (e.g., 大きな市場 "Big Market") — enhanced effect

This teaches adjective progression naturally, as the GDD describes.

**Gold currency.** Runs award gold based on performance (areas cleared, creatures befriended, etc.). Gold is spent on building/upgrading. Gold persists across runs — it IS the meta-progression currency.

```
Gold per run (MVP formula):
  base: 50 per area cleared
  bonus: 25 per creature befriended
  bonus: 10 per unique room type visited
  completion bonus: 200 for clearing all 10 areas
```

**Building costs:**

| Level | Cost |
|-------|------|
| 1 (build) | 200 gold |
| 2 (upgrade) | 500 gold |

A player clearing 5 areas earns ~250 gold + bonuses. So building a single structure takes 1-2 runs. Upgrading all 5 to max takes ~15-20 runs — a meaningful long-term goal.

**Creature workers.** Each building has 1 worker slot. Assigning a creature from the permanent collection gives the building a bonus effect (see Worker Bonus column above). The creature can't be selected for runs while assigned.

This creates the GDD's dual-role tension: do you bring your best creature on the run, or leave it at the hospital for the auto-revive bonus?

**Town screen.** The hub phase gets a visual overhaul — instead of just "Start Run", the hub becomes the town overview:
- Row/grid of buildings (built ones show sprite + Japanese name, unbuilt show silhouette + "???")
- Tap building → see details, assign/remove worker, upgrade
- "Start Run" button still prominent
- Gold balance displayed

### Data Schema

```json
// data/buildings.json
[
  {
    "id": "market",
    "word": "市場",
    "reading": "いちば",
    "meaning": "market",
    "levels": [
      {
        "level": 1,
        "name": "小さな市場",
        "nameEn": "Small Market",
        "cost": 200,
        "effect": "postCombatShopSlots",
        "value": 4
      },
      {
        "level": 2,
        "name": "大きな市場",
        "nameEn": "Big Market",
        "cost": 500,
        "effect": "postCombatShopSlots",
        "value": 5
      }
    ],
    "workerBonus": {
      "effect": "postCombatShopSlots",
      "value": 1
    }
  }
]
```

### State Changes

```js
// In createMetaProgression():
meta.town = {
  gold: 0,
  buildings: {},       // buildingId -> { level: 0|1|2, workerId: creatureId|null }
};

// Gold is the ONLY new persistent currency.
// Buildings persist. Workers persist (reference creature collection IDs).
```

### Town Effects on Runs

When a run starts, `startRun()` reads `meta.town.buildings` and applies active effects:

- **market** (level 1+): `run.shopSlots = 3 + bonusFromMarket`
- **inn** (level 1+): `run.player.hp = Math.min(run.player.maxHp, run.player.hp + healAmount)`
- **dojo** (level 1+): starting creatures get bonus XP
- **hospital** (level 1+): `run.autoReviveCharges = 1` (consumed on first creature KO)
- **workshop** (level 1+): unlocks crafting (without workshop, crafting is unavailable)

Worker bonuses stack additively with building level effects.

---

## How The Three Systems Connect

```
                    ┌─────────────┐
                    │   TOWN      │  (meta-progression, persists)
                    │  Buildings  │
                    │  Workers    │
                    │  Gold       │
                    └──────┬──────┘
                           │ workshop unlocks crafting
                           │ town effects boost runs
                           ▼
┌──────────┐    ┌─────────────────┐    ┌────────────┐
│EXPLORATION│───▶│    CRAFTING     │───▶│ EQUIPMENT  │
│ find      │    │ resources →     │    │ equip to   │
│ resources │    │ equipment +     │    │ creatures  │
│           │    │ consumables     │    │ +stats     │
└──────────┘    └─────────────────┘    └────────────┘
     │                                       │
     └────── both reset each run ────────────┘
```

**Within a run:** Explore → gather resources → craft equipment/consumables → equip creatures → fight better → earn gold.

**Between runs:** Spend gold → build/upgrade town → unlock crafting, get run bonuses → assign creature workers → start next run stronger.

**Vocabulary touchpoints per run:**
- ~10 resource words (gathering, inventory, crafting UI)
- ~15 equipment words (crafting, equipping, creature panels)
- ~10 building/modifier words (town screen, run-start bonuses)
- Cross-system pairings (creature name + building name, resource name + equipment name)

---

## New Phases

Two new phases added to the phase machine:

| Phase | When | Transitions From | Transitions To |
|-------|------|-------------------|----------------|
| `town` | Player is in the town hub viewing/managing buildings | `hub` | `hub` |
| `crafting` | Player has the crafting screen open | `exploring`, `hub` | `exploring`, `hub` |

These are lightweight — the town screen is effectively a sub-screen of the hub, and crafting is a modal overlay. They could also be implemented as UI overlays without new phases if that's simpler.

## New API Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/game/town` | Get town state (buildings, workers, gold) |
| POST | `/api/game/town/build` | Build or upgrade a building `{ buildingId }` |
| POST | `/api/game/town/assign-worker` | Assign creature to building `{ buildingId, creatureId }` |
| POST | `/api/game/town/remove-worker` | Remove creature from building `{ buildingId }` |
| POST | `/api/game/craft` | Craft a recipe `{ recipeId }` |
| POST | `/api/game/equip` | Equip gear to creature `{ creatureIndex, equipmentId }` |
| POST | `/api/game/unequip` | Unequip gear `{ creatureIndex }` |

## New Services

| File | Pattern | Responsibility |
|------|---------|---------------|
| `town-service.js` | Pure functions | Build/upgrade buildings, assign workers, calculate run bonuses |
| `crafting-service.js` | Pure functions | Check recipe availability, execute crafts, roll resource drops |
| `equipment-service.js` | Pure functions | Equip/unequip, calculate stat bonuses, validate equipment |

## New Data Files

| File | Contents |
|------|----------|
| `data/equipment.json` | ~15 equipment definitions |
| `data/resources.json` | ~10 resource definitions |
| `data/recipes.json` | ~20 recipe definitions |
| `data/buildings.json` | 5 building definitions with level data |

## New UI Modules

| File | Purpose |
|------|---------|
| `public/js/ui/town.js` | Town overview screen, building cards, worker assignment |
| `public/js/ui/crafting.js` | Crafting screen, recipe list, ingredient display |
| `public/js/ui/equipment.js` | Equipment slot on creature panel, equip picker |

## Art Assets Needed

| Type | Count | Size | Notes |
|------|-------|------|-------|
| Equipment icons | ~15 | 128x128 | Same pipeline as item icons |
| Resource icons | ~10 | 128x128 | Same pipeline as item icons |
| Building sprites | 5 | 256x256 or 512x512 | Two states each (level 1, level 2) = 10 total |
| Town background | 1 | 1536x1024 | Hub/town screen background |

## CLAUDE.md Update

Remove the "Don't add equipment systems" guardrail. Replace with:
> Equipment, crafting, and town systems are implemented. See `docs/plans/2026-03-02-equipment-crafting-town-mvp-design.md`.

---

## What This MVP Does NOT Include

Deliberately cut to keep scope minimal:

- **No recipe discovery** — all recipes visible from start
- **No equipment rarity scaling** — flat stat bonuses only, no % bonuses or special effects
- **No crafting during combat** — only between combats or at hub
- **No building prerequisites** — any building can be built in any order
- **No town visual progression** — buildings are cards/icons, not an illustrated town scene
- **No worker leveling** — worker bonus is flat, doesn't improve over time
- **No equipment trading at dealers** — dealers still only trade creatures
- **No resource trading** — can't buy/sell resources
- **No quests from town NPCs** — town NPCs are a future system

These are all natural expansion points for later stages.

---

## Success Criteria

1. All three vocab categories are teachable: player encounters resource words, equipment words, and building words during normal gameplay
2. Meta-progression loop works: gold earned → buildings built → runs get easier/more varied → more gold
3. Creature dual-role tension exists: player must choose between party strength and town bonuses
4. Crafting compound word teaching works: combining 鉄 + 剣 shows the player how 鉄の剣 is formed
5. Run-to-run variety increases: town bonuses change what's available each run
