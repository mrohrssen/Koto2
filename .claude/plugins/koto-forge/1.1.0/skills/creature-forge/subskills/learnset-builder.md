# Learnset Builder (Subagent 2)

You are building a learnset (list of learnable moves) for a creature in Koto, a Japanese vocabulary learning RPG. Creatures learn moves as they level up, Pokemon-style.

## Input

Read the baton JSON file at the path provided to you. Key fields you need:

- `meaning` — the creature's concept (e.g., "scissors", "turtle")
- `frequencyTier` — the creature's rarity tier
- `archetype` — Fighter, Mage, Trickster, or Tank/Healer
- `element` — fire, water, wood, earth, or metal
- `stage` — the creature's game stage (1-10)

## Your Task

Search `data/moves.json` and build a learnset of 4-6 moves for this creature. Each move in the learnset is a reference to an existing move by its `id`, paired with the level at which the creature learns it.

### Step 0: Pick the level-1 starter move

The level-1 move is what a player sees the creature use most often in combat. Pick in this priority order:

1. **Thematic match** — a move whose meaning fits the creature's concept (e.g. bird → `tobu` fly, fish → `nomu` drink, cat → `okoru` get angry).
2. **Element-STAB match** — a damage/buff/debuff move sharing the creature's element.
3. **Archetype fit** — Fighter: damage; Mage: damage or buff; Trickster: debuff or hide; Tank/Healer: buff or heal.

**Starter-cap rule:** Before finalizing, read `data/creatures.json` and count how many creatures already have your candidate as their `level: 1` move. If the count is ≥ 2, pick a different move.

**`tataku` rule:** `tataku` is allowed as a starter only if no other candidate fits the thematic, element, or archetype tests.

**Anti-duplication rule:** The level-1 move must not appear at any other level in this creature's learnset. When building the rest of the learnset (Steps 1–6), exclude the level-1 move from the candidate pool.

### Step 1: Read the Move Pool

Read `data/moves.json`. Each move has:

```json
{
  "id": "hashiru",
  "name": "走る",
  "element": "neutral|fire|water|wood|earth|metal",
  "category": "damage|heal|buff|debuff|shield|drain",
  "tier": 1|2|3,
  "stage": 1-10,
  "mpCost": 8-42,
  "power": 0-65,
  "statusEffect": null|"poison"|"sleep"|"stun"|"confuse"|"attack_buff"|"haste"|"shield"|"team_shield"|"taunt"
}
```

### Step 2: Filter Eligible Moves

A move is eligible if:
1. **Stage <= creature's stage** — the creature shouldn't learn words beyond its difficulty tier
2. **Not over-assigned** — check `data/creatures.json` to see how many creatures already have this move in their learnset. Avoid moves used by 4+ creatures unless there's no alternative.

### Step 3: Select Moves by Archetype

Pick moves that match the creature's archetype role:

| Archetype | Target Mix (4-6 moves) |
|-----------|----------------------|
| **Fighter** | 3-4 damage, 1 buff or shield, 0-1 other |
| **Mage** | 2 damage, 1-2 buff/debuff, 1 heal or shield |
| **Trickster** | 2 damage, 2-3 debuff (status effects), 0-1 buff |
| **Tank/Healer** | 1-2 damage, 2-3 heal/shield, 0-1 buff (taunt preferred) |

### Step 4: Ensure STAB Coverage

At least 1 move MUST match the creature's element (for Same-Type Attack Bonus — 1.5x damage). Prioritize same-element damage moves.

### Step 5: Tier Spread

Distribute moves across tiers for level progression:
- **Level 1:** reserved for the starter chosen in Step 0 (do not re-pick here)
- **Level 5:** Tier 1 move (basic, low cost)
- **Levels 9, 12:** Tier 2 moves (stronger, moderate cost)
- **Levels 16, 20:** Tier 3 moves (powerful, high cost) — only if creature has 5-6 moves

If fewer than 6 eligible moves exist at the creature's stage, reduce the learnset to 4-5.

### Step 6: Thematic Coherence

Choose moves that feel natural for the creature's concept:
- A turtle creature (water/Tank) -> bite, drink, sleep, harden, shield moves
- A scissors creature (metal/Fighter) -> cut, slash, sharpen, clamp moves
- A book creature (wood/Mage) -> read, write, confuse, illuminate moves

Don't force thematic matches if the move doesn't mechanically fit — archetype fit > theme.

## Output

Read the baton JSON, add your output fields, write it back. Append:

```json
{
  "learnset": [
    {
      "moveId": "kamu",
      "moveName": "噛む",
      "moveNameEn": "Bite",
      "element": "neutral",
      "category": "damage",
      "tier": 1,
      "level": 1,
      "reason": "Basic physical attack, thematic for a turtle — tier 1 damage at level 1"
    },
    {
      "moveId": "nomu",
      "moveName": "飲む",
      "moveNameEn": "Drink",
      "element": "water",
      "category": "heal",
      "tier": 1,
      "level": 5,
      "reason": "STAB water move, healing fits Tank/Healer archetype — tier 1 at level 5"
    }
  ],
  "learnsetSummary": {
    "totalMoves": 6,
    "stabMoves": 2,
    "damageCount": 2,
    "healCount": 2,
    "buffCount": 1,
    "shieldCount": 1,
    "tierSpread": "T1: 3, T2: 2, T3: 1"
  }
}
```

Read the baton file, add these fields to the existing object, and write the entire object back to the same file.
