# Robot Combat System Design

> Replaces the chip-based combat system with Pokemon-style robot battling.

## Core Concept

Players collect and deploy robots to fight other robots. Each robot has an element, stats, an auto-attack, and an ultimate ability. The vocab flash card system stays intact — you pick Attack, Defend, or Befriend, review a word, and the action fires.

**Key constraint**: Robots are run-scoped. Your party resets every run — levels, collection, everything. Each run you start fresh with one starter and build from there.

---

## Robot Data Model

Every robot — yours or enemy — uses one structure:

```javascript
{
  id: "fire-common-01",
  name: "ヒノボット",
  nameEn: "Hino Bot",
  element: "fire",           // wood | fire | earth | metal | water
  rarity: "common",          // common | uncommon | rare | epic | legendary
  level: 1,
  xp: 0,
  hp: 100,
  maxHp: 100,
  attack: 20,
  autoSkill: {
    name: "Burn",
    nameEn: "Burn",
    power: 20,
    element: "fire"
  },
  ultimate: {
    name: "Inferno",
    nameEn: "Inferno",
    power: 50,
    element: "fire",
    charges: 0,
    chargesRequired: 5
  }
}
```

### Stats

Two stats: `attack` and `maxHp`. Base values at level 1 common: HP 100, Attack 20, Auto power 20, Ultimate power 50.

**Rarity multipliers** (reuse existing tier weights):
| Rarity | Stat Multiplier | Encounter Weight |
|---|---|---|
| Common | 1.0x | 50 |
| Uncommon | 1.25x | 30 |
| Rare | 1.5x | 12 |
| Epic | 2.0x | 6 |
| Legendary | 2.5x | 2 |

**Leveling**: +10% stats per level. Deployed robots earn 100% XP, reserves earn 50%.

### Element Cycle

Simple 5-way cycle. Each element beats one, loses to one, neutral to three:

```
Wood → Earth → Water → Fire → Metal → Wood
```

Damage multipliers: 1.5x super effective, 0.67x not very effective, 1.0x neutral.

### Robot Pool

25 robots total: 5 elements × 5 rarities (one per combination). Defined in `data/robots.json`.

---

## Combat Flow

### Turn Structure

1. Flash card appears with action choices: **Attack**, **Defend**, **Befriend** (if any enemy ≤30% HP)
2. Player picks a card — this selects the action AND begins vocab review
3. Player reviews the vocab word
4. Action resolves:
   - **Attack**: Your robots auto-attack sequentially left-to-right. Each picks its target using the targeting AI. Ultimates (when used) hit all enemies. All ultimate charges +1.
   - **Defend**: All robots take 50% damage. All ultimate charges +1.
   - **Befriend**: The lowest-HP enemy at ≤30% is captured and removed from battle. If it was the last enemy, battle ends.
5. Enemy robots attack using the same targeting AI
6. Next flash card. Repeat.

### Targeting AI (Both Sides)

1. If any opponent has a type disadvantage against this robot, attack it. If multiple, attack the one with the lowest % HP remaining.
2. Otherwise, attack a neutral-matchup opponent.
3. If neither, attack the opponent with the lowest % HP remaining.

### Damage Formula

```
damage = attack * abilityPower * elementMultiplier * random(0.8, 1.2)
```

MVP omits skill buffs and item buffs (added in V1).

### Ultimate Abilities

Same UX as current chip skills:
- Click a robot → popup → "Use Ultimate" button
- Fires the ultimate, hits all enemies, resets charges to 0
- Charges increase by 1 each turn (Attack or Defend)
- Can be used any time during your turn when fully charged

### Robot KO & Swap

When a deployed robot hits 0 HP, the next reserve robot auto-swaps in (sequential loadout order). When all 6 robots are KO'd, run over.

### Befriend

- Third action card appears when any enemy drops to ≤30% HP
- Works as a standard flash card review — pick it, review the word, capture happens
- Captured robot joins your party (max 6 total)
- Befriend option disabled once you have 6 robots
- If the befriended robot was the last enemy, battle ends

---

## Player State

### Run-Scoped Robot State

Robots live on the run, not the player. Everything resets when a run ends.

```javascript
run.robotParty = {
  active: [],    // 0-3 deployed robots (combat.allies[] mirrors this)
  reserves: [],  // 0-3 bench robots
  maxTotal: 6
}
```

### Combat State (arrays from day one)

```javascript
combat.allies = []   // references to run.robotParty.active
combat.enemies = []  // MVP: always length 1. V1: 1-3.
```

### Replaced Fields
| Old (Chips) | New (Robots) |
|---|---|
| `player.chips` | `run.robotParty` (run-scoped, max 6) |
| `player.equipment.weapon.equippedChips` | `run.robotParty.active` (first 3) |
| `player._chipCharges` | `robot.ultimate.charges` (on each robot) |
| `player._chipLevels` | `robot.level` (on each robot) |
| `player.hp`, `player.maxHp` | Removed — robots ARE your health |
| `player._activeBuffs` | Removed for MVP |
| `player._combatStacks` | Removed |

### Kept
- `player.credits` (for future shops)
- `player.run` structure (encounters only for MVP)

---

## Progression (MVP)

- **Start**: Pick 1 of 3 common starters (Fire, Water, Wood)
- **Loop**: Fight → befriend → fight → die
- **Encounters only**: No shops, shrines, quizzes, or other room types
- **Enemy generation**: Roll rarity using existing weights (common 50, legendary 2). Enemy level scales with your highest robot's level (±1-2 for variance).
- **XP**: Awarded after each battle. Deployed robots get 100%, reserves get 50%.

---

## Frontend UI

### Combat Screen (preserve existing scene dimensions)
- **Top**: Enemy robot with HP bar + element icon
- **Middle**: Vocab flash card area (unchanged)
- **Bottom**: 3 deployed robot slots (replaces 5 chip slots). Each shows:
  - Sprite/icon with element color
  - HP bar
  - Ultimate charge bar (reuses 5-segment chip charge UI)
  - Click → popup → "Use Ultimate" button

### Action Cards
- Attack (unchanged)
- Defend (unchanged)
- Befriend (new, conditional)

### Removed
- Chip pipeline animation (PWR × (1 + BW))
- Chip shop screens
- Chip-related popups

### Preserved
- Vocab flash card review flow
- Enemy HP bar and damage numbers
- Combat effects (screen shake, damage flash)
- Victory/defeat screens
- All scene dimensions and layout

---

## V1 — Depth Layer

Builds on MVP after core combat proves fun:

- **Status effects** from ultimates (burn, freeze, etc.) lasting 1-3 turns based on rarity
- **Element synergy combos** (fire status + water attack = steam explosion)
- **Multiple enemy encounters** (fight 1, 2, or 3 enemy robots)
- **Skill buffs** from ultimates (e.g. "Power Up" +25% for 3 turns, carries between battles)
- **Item buffs**: After each battle, pick 1 of 3 random items. All free. Items grant universal team buffs and stack. 30 items generated with simple stat effects.
- **Team-building point budget** (robots valued 1-5, allocated starting points)
- **Negotiation dialogue** for befriend (conversation you must navigate via dialogue understanding)

## V2 — Full System

- **Four robot roles** (Striker, Mage, Tank/Healer, Trickster) with distinct stat profiles and ability types
- **XP sharing** tuned with PokeRogue-inspired math (incentivize rotation)
- **Enemy scaling algorithm** refined for challenge curve

---

## Suggestions for Future Features (Not in Spec)

- Robot evolution or upgrade paths
- Dual element cycle (creative + destructive)
- Boss encounters with multi-phase patterns
- Robot fusion or modding (chips return as robot mods)
- Rest/heal rooms between fights
- PvP or challenge modes
