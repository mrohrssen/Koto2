# Meta Progression Shop

## Overview

A simple meta progression shop accessible from the hub. Players earn Progression Tokens by defeating bosses and spend them on permanent upgrades that persist across runs.

## Currency: Progression Tokens

- **Earning:** 1 token awarded per boss defeated or befriended (end of each area)
- **Storage:** `meta.progressionTokens` (integer, default 0, persists across runs)
- **Spending:** At the hub shop only

## Upgrades

Three upgrades, each with 5 levels. All bonuses are percentage-based, applied multiplicatively to base stats at run start.

| ID | Name (EN) | Effect | Per Level | Max (L5) |
|---|---|---|---|---|
| `hp_boost` | HP Boost | +% base HP to all creatures | +5% | +25% |
| `xp_boost` | XP Boost | +% XP earned from combat | +10% | +50% |
| `atk_boost` | ATK Boost | +% base ATK to all creatures | +5% | +25% |

### Cost Schedule

Escalating cost per level:

| Level | Token Cost |
|---|---|
| 1 | 1 |
| 2 | 2 |
| 3 | 3 |
| 4 | 4 |
| 5 | 5 |

- Cost per upgrade to max: 15 tokens
- Total to max all 3: 45 tokens (45 boss kills)

## Data

### `data/meta-upgrades.json`

```json
[
  {
    "id": "hp_boost",
    "nameEn": "HP Boost",
    "description": "Increases base HP of all creatures",
    "effectType": "percentHp",
    "valuesPerLevel": [5, 10, 15, 20, 25],
    "costsPerLevel": [1, 2, 3, 4, 5],
    "maxLevel": 5
  },
  {
    "id": "xp_boost",
    "nameEn": "XP Boost",
    "description": "Increases XP earned from combat",
    "effectType": "percentXp",
    "valuesPerLevel": [10, 20, 30, 40, 50],
    "costsPerLevel": [1, 2, 3, 4, 5],
    "maxLevel": 5
  },
  {
    "id": "atk_boost",
    "nameEn": "ATK Boost",
    "description": "Increases base ATK of all creatures",
    "effectType": "percentAtk",
    "valuesPerLevel": [5, 10, 15, 20, 25],
    "costsPerLevel": [1, 2, 3, 4, 5],
    "maxLevel": 5
  }
]
```

### Meta State Changes

In `createMetaProgression()` (`src/game/state.js`):

```javascript
progressionTokens: 0  // Add to meta state
// upgrades: {} already exists
```

Upgrade levels stored as `meta.upgrades.hp_boost = 3` (level 3 purchased).

### Save Migration

Existing saves won't have `progressionTokens`. Add migration in `getManager()` (`src/game/manager-registry.js`):

```javascript
if (data.meta.progressionTokens === undefined) {
  data.meta.progressionTokens = 0;
}
```

### State Serialization

Add `progressionTokens` and `upgrades` to `getState()` in `src/game/loop.js` so the frontend has access via the main game state (needed for hub UI token display).

## Backend

### Token Award

When a boss is defeated or befriended (in GameManager or combat service), increment:

```javascript
this.meta.progressionTokens += 1;
```

This hooks into the existing boss defeat/befriend flow (separate work — boss implementation is out of scope for this spec).

### API Endpoints

**`GET /api/game/meta-shop`**

Returns upgrade definitions, current levels, and token balance.

```json
{
  "progressionTokens": 7,
  "upgrades": [
    {
      "id": "hp_boost",
      "nameEn": "HP Boost",
      "description": "Increases base HP of all creatures",
      "currentLevel": 2,
      "maxLevel": 5,
      "nextCost": 3,
      "nextValue": 15,
      "currentValue": 10
    }
  ]
}
```

If an upgrade is maxed, `nextCost` and `nextValue` are `null`.

**`POST /api/game/meta-shop/buy`**

Request: `{ "upgradeId": "hp_boost" }`

Validation:
- Upgrade ID must exist
- Current level < maxLevel
- Player has enough tokens
- Player must be in hub phase (not mid-run)

Response: Updated meta-shop state (same format as GET).

### Applying Bonuses

#### Stat Bonuses (HP/ATK)

Meta bonuses are baked into creature base stats at creation time. Store multipliers on run state at run start:

```javascript
run.metaHpMult = 1 + (hpUpgradeValue / 100);   // e.g., 1.15 for level 3
run.metaAtkMult = 1 + (atkUpgradeValue / 100);
```

Apply via a helper function called from **every creature creation point** (run start party, dealer purchases, befriending):

```javascript
function applyMetaBonuses(creature, run) {
  creature.maxHp = Math.floor(creature.maxHp * run.metaHpMult);
  creature.hp = creature.maxHp;
  creature.attack = Math.floor(creature.attack * run.metaAtkMult);
}
```

These baked-in bonuses stack multiplicatively with the existing `itemBuffs` system (which applies at combat time). At max upgrades (+25% meta ATK + a +50% item buff), effective ATK = base * 1.25 * 1.5 = 1.875x. This is intentional — meta upgrades feel impactful because they compound with items.

#### XP Bonus

Fold into the existing `itemBuffs.xpMultiplier` at run start rather than introducing a new field:

```javascript
run.itemBuffs.xpMultiplier = 1 + (xpUpgradeValue / 100);  // e.g., 1.3 for level 3
```

XP items then multiply on top of this base. No changes needed to `awardKillXp()` in combat service.

#### Hub Phase Check

"Hub phase" means `run === null`. The shop is inaccessible during `run_ended`, `run_complete`, or any other phase with an active run object.

#### Save on Purchase

`POST /api/game/meta-shop/buy` must call `saveManager()` after modifying meta state to prevent data loss on server crash.

## Frontend

### Hub UI Addition

Add an "Upgrades" button to `exploration.js:renderHub()` (alongside existing "Equip Bots" and "Infiltrate" buttons). Show token balance on the button. Clicking opens the meta-shop as a full-screen panel (same pattern as creature equip).

### Upgrades Panel

Simple panel/modal showing:
- Token balance at top
- 3 upgrade cards, each showing:
  - Upgrade name and description
  - Current level (e.g., "Level 2 / 5")
  - Current bonus (e.g., "+10% HP")
  - Next level cost and bonus (e.g., "Next: +15% HP — 3 tokens")
  - Buy button (disabled if can't afford or maxed)
  - "MAX" badge when fully upgraded

### New UI Module

`public/js/ui/meta-shop.js` — follows existing patterns:
- `init({ getGameState, updateGameState, updateUI })`
- Fetches from `GET /api/game/meta-shop`
- Posts to `POST /api/game/meta-shop/buy`
- Updates local state after purchase

## Out of Scope

- Boss implementation (tokens will be awarded when bosses exist — on defeat or befriend)
- Japanese vocab on upgrade names (meta system, not a learning moment)
- New sprites or art for the shop
- Achievement integration
- Upgrade prerequisites or unlock conditions

## Implementation Notes

- Update `docs/ARCHITECTURE.md` to remove the "No essence currency or meta-upgrade system" bullet and document the new system
- Token award hook point should be clearly marked with a TODO comment for when boss implementation lands
