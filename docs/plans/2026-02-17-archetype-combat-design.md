# Archetype Combat System Design

Date: 2026-02-17

## Goal

Replace the flat robot/chip combat system with archetype-differentiated creatures. Creatures from `new-creatures-staging.json` become the sole creature pool. Each archetype (Fighter, Mage, Trickster, Tank/Healer) plays differently in combat through distinct stats, skill types, and targeting.

## Approach: Layered Refactor

Four independent layers, merged sequentially:

1. Schema + Stats
2. Combat Effects
3. Chip Removal
4. UI Polish

---

## Layer 1: Schema + Stats

### New Creature Data Format

Creatures carry their own mechanical stats (set by the forge skill based on archetype ranges). The game code reads whatever the creature says — no archetype lookup tables at runtime.

```json
{
  "id": "kamedor",
  "name": "カメドル",
  "nameEn": "Kamedor",
  "element": "water",
  "archetype": "Tank/Healer",
  "rarity": "uncommon",

  "baseHp": 160,
  "baseAttack": 7,

  "baseWord": "亀", "baseReading": "かめ", "baseMeaning": ["turtle"],
  "word": "アイドル", "reading": "アイドル", "meaning": ["idol"],

  "description": "...",

  "autoSkill": {
    "name": "守る", "nameEn": "Protect",
    "power": 15, "element": "water",
    "type": "damage", "target": "single_enemy",
    "word": "守る", "reading": "まもる", "rank": 800
  },

  "ultimate": {
    "name": "癒す", "nameEn": "Heal",
    "type": "heal", "target": "single_ally",
    "power": 40,
    "element": "water",
    "chargesRequired": 5,
    "word": "癒す", "reading": "いやす", "rank": 15000
  }
}
```

### Changes from Current robots.json

- `baseHp` / `baseAttack` are per-creature (not flat 100/10)
- `archetype` field preserved for display and logic
- Skills gain `type` (`"damage"` | `"heal"` | `"poison"`) and `target` (`"single_enemy"` | `"all_enemies"` | `"single_ally"` | `"all_allies"`)
- `chargesRequired` varies (Mages 3-4, others 5)

### Stat Pipeline (unchanged formula)

```
finalHp = floor(baseHp * rarityMult * levelMult)
finalAttack = floor(baseAttack * rarityMult * levelMult)
```

Rarity multipliers: Common 1.0x, Uncommon 1.1x, Rare 1.2x, Epic 1.3x, Legendary 1.4x.
Level scaling: `1 + (level - 1) * 0.1`.

### Archetype Stat Ranges (for forge reference)

| Archetype | HP Range | Attack Range |
|-----------|----------|--------------|
| Fighter | 1.0x (100) | 1.0x (10) |
| Mage | 0.7-0.8x (70-80) | 0.7-0.8x (7-8) |
| Trickster | 0.8-0.9x (80-90) | 0.8-0.9x (8-9) |
| Tank/Healer | 1.5-1.75x (150-175) | 0.7-0.8x (7-8) |

The forge picks specific values per creature. These ranges are guidelines, not runtime constants.

---

## Layer 2: Combat Effects

### Skill Type Branching

Currently `processAttackTurn` and `processUltimate` both call `calculateRobotDamage()` and subtract HP. We branch on the skill's `type` field.

### Three Skill Types (This Pass)

| Type | Execution | Example |
|------|-----------|---------|
| `damage` | Calculate damage, subtract from target HP. Single or AoE based on `target`. | Fighter auto, Mage ultimate |
| `heal` | Calculate heal: `power * attack/10 * variance`. Add to target HP (capped at maxHp). Single ally or all allies. | Tank/Healer ultimate |
| `poison` | Deal small immediate damage + apply poison. Poisoned creature takes `power * 0.2` damage at start of each turn for 3 turns. | Trickster ultimate |

### Active Effects Tracking

Each robot in combat state gains an `activeEffects` array:

```js
robot.activeEffects = [
  { type: 'poison', remainingTurns: 3, damagePerTurn: 4, sourceId: 'hebiveil-1' }
]
```

At the start of each combat round: apply poison damage, decrement `remainingTurns`, remove expired effects.

### Ultimate Targeting

| Target | Logic |
|--------|-------|
| `single_enemy` | Use existing target selection (prefers element advantage by HP%) |
| `all_enemies` | Hit every alive enemy (current behavior) |
| `single_ally` | Pick the ally with lowest HP% |
| `all_allies` | Apply to every alive ally |

AoE is not Mage-exclusive — any creature can have it if specified in data. Mages just tend to have the strongest AoE. Legendary Fighters may also get AoE ultimates.

Auto-attacks stay damage-only, single-target. Only ultimates can heal or poison.

### Deferred Effects

Sleep, confuse, stun, attack buff, defense buff, haste, taunt, team shield. These need more complex state tracking and are not in this pass.

---

## Layer 3: Chip Removal

Delete all chip-related code:

- State: chip inventory, equipped chips, chip state factories
- Services: chip equipping, chip combat execution (sequential firing)
- UI: chip display, chip equip screen, chip combat animations
- Routes: `/api/game/chip*` endpoints

Anything that only exists to support chips goes. Shared helpers stay. The item system (persistent + consumable) is untouched.

This layer is done after Layers 1-2 so we have a working combat system to test against.

---

## Layer 4: UI Polish

### New UI Behaviors

- **Heal display**: Green heal number floating up on healed ally. HP bar animates up.
- **Poison application**: Brief poison indicator on target. Subtle visual marker (purple tint or icon on HP bar) persists until effect expires.
- **Poison tick**: At round start, poisoned creatures flash with small damage number. HP bar ticks down.
- **Ultimate targeting**: Single-target ultimates emphasize the target. AoE keeps current presentation.
- **Archetype display**: Creature info popups and party screen show the archetype.

### Unchanged

- Vocab card flow (flip, swipe)
- Charge bar (fills to `chargesRequired`, max varies per creature)
- Damage numbers (same style, green for heals)
- Combat loop timing (attack/pause/enemy-attack cadence)

### Not in This Pass

Per-archetype ultimate animations, status effect icons for future effects, archetype-specific combat stances.
