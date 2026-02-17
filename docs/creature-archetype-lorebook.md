# Creature Archetype Lorebook

Design reference for creature archetypes. Used when forging new creatures, balancing stats, and implementing combat skills.

## Stat Baseline

Each creature has its own `baseHp` and `baseAttack` set by the creature forge based on archetype ranges. The game code reads per-creature stats — there are no runtime archetype lookup tables.

| Stat | Reference Value |
|------|----------------|
| HP | 100 (Fighter baseline) |
| Attack | 10 (Fighter baseline) |

**Rarity multipliers** (applied on top of archetype-adjusted bases):

| Rarity | Multiplier | Drop Weight |
|--------|-----------|-------------|
| Common | 1.0x | 60 |
| Uncommon | 1.1x | 25 |
| Rare | 1.2x | 10 |
| Epic | 1.3x | 4 |
| Legendary | 1.4x | 1 |

**Level scaling:** `1 + (level - 1) * 0.1` per level.

**Damage formula:** `(attack / 10) * skillPower * elementMultiplier * variance`

---

## Fighter

**Identity:** Straightforward damage dealers. Good at everything, great at sustained single-target output.

### Stats
- **HP:** Standard (1.0x base)
- **Attack:** Standard (1.0x base)
- Fighters are the baseline — other archetypes are defined relative to them.

### Auto Skill
- Elemental damage, single target.
- Standard power scaling. This is the bread-and-butter attack.

### Ultimate
- **Target:** Single enemy (default). Rare/Epic/Legendary Fighters may gain AoE.
- **Damage:** Higher than auto skill, but not dramatically so — Fighters win through consistent output, not burst.
- **Charges Required:** Standard (5). Fighters earn their ultimates at a steady, predictable pace.

### Scaling by Rarity
As Fighters go from Common to Legendary, both their base stats and skill power increase. A Legendary Fighter simply hits harder and takes more punishment — no tricks, just raw strength.

### Design Notes
- AoE ultimate is NOT the default for Fighters. Only Rare+ may have it, and it should feel earned.
- Skill words should be simple, physical verbs: 蹴る (kick), 噛む (bite), 斬る (cut), 叩く (strike).

---

## Mage

**Identity:** Glass cannons with devastating ultimates. Weak auto attacks force reliance on well-timed bursts.

### Stats
- **HP:** Low (~0.7x–0.8x base) — Mages are fragile.
- **Attack:** Low (~0.7x–0.8x base) — their auto skill output suffers.

### Auto Skill
- Elemental damage, single target.
- **Weaker than Fighter auto skills.** Mages feel sluggish between ultimates — this is intentional. The payoff comes from their burst.

### Ultimate
- **Target:** AoE (all enemies) is the default for Mages. Mages have the strongest AoE, but AoE is not exclusive to them — Legendary Fighters may also have AoE ultimates.
- **Damage:** Significantly stronger than Fighter ultimates. The burst is the whole point.
- **Charges Required:** Lower than standard (~3–4). Because their auto skills are weak, Mages need to reach their ultimate faster to stay relevant. Fewer charges compensates for lower per-hit charge generation.

### Scaling by Rarity
Higher rarity Mages get more ultimate damage and slightly better survivability, but they never become tanky. A Legendary Mage is a devastating glass cannon, not a balanced fighter.

### Design Notes
- Mages punish players who ignore them — if left alive, their AoE ultimate hits the whole team.
- As wild enemies, Mages create urgency: kill them fast or suffer the burst.
- Skill words should evoke elemental/magical force: 燃える (burn), 凍る (freeze), 溶かす (melt), 吹く (blow).

---

## Trickster

**Identity:** Disruptors who change the flow of battle through status effects and buffs. Unpredictable and fun.

### Stats
- **HP:** Low-to-mid (~0.8x–0.9x base) — squishier than Fighters but not as fragile as Mages.
- **Attack:** Low-to-mid (~0.8x–0.9x base) — more range than Mages, less consistent than Fighters.
- Tricksters occupy the space between Mage and Fighter — not the worst at anything, not the best at raw numbers.

### Auto Skill
- Elemental damage, single target.
- **Standard-ish power.** Tricksters can hold their own with auto attacks — their autos aren't as punishing as a Mage's weakness.

### Ultimate
- **Target:** Varies — can target enemies, allies, or self depending on the effect.
- **Damage:** Low or zero. Trickster ultimates are about effects, not damage.
- **Charges Required:** Standard (5).
- **Effect types (pick one per creature):**

| Effect | Target | Description |
|--------|--------|-------------|
| **Sleep** | Single enemy | Target skips next turn |
| **Confuse** | Single enemy | Target attacks its own allies on next action |
| **Stun** | Single enemy | Target skips next turn (similar to sleep, different flavor) |
| **Poison** | Single enemy | Target takes damage at start of each turn for N turns |
| **Attack Buff** | Single ally | Temporarily increase an ally's attack |
| **Defense Buff** | Single ally | Temporarily reduce damage taken by an ally |
| **Haste** | Single ally | Ally acts first next turn / gets an extra action |

- Rare/Epic/Legendary Tricksters may target multiple enemies or all allies with their effects.

### Scaling by Rarity
Higher rarity Tricksters get stronger/longer-lasting status effects, wider targeting (single → AoE), and better base stats. A Legendary Trickster can disable an entire enemy team or buff all allies at once.

### Design Notes
- Tricksters change what the player *thinks about* during combat. Instead of "deal damage, take damage," suddenly it's "who do I disable? who do I buff?"
- As wild enemies, Tricksters are annoying in a good way — they disrupt the player's plan.
- Skill words should evoke trickery and transformation: 眠る (sleep), 惑う (bewilder), 化ける (transform), 誘う (lure), 隠す (hide).

---

## Tank/Healer

**Identity:** Resilient protectors who keep the team alive. Low damage, massive HP, sustain through healing and damage reduction.

### Stats
- **HP:** Very high (~1.5x–1.75x base) — Tanks are the hardest creatures to kill.
- **Attack:** Low (~0.7x–0.8x base) — they trade damage for survivability.

### Auto Skill
- Elemental damage, single target.
- **Decent power but low attack stat** means their actual damage output is modest. They can contribute but won't carry.

### Ultimate
- **Target:** Varies — allies, self, or the whole team.
- **Damage:** Zero. Tank/Healer ultimates are purely defensive/restorative.
- **Charges Required:** Standard (5).
- **Effect types (pick one per creature):**

| Effect | Target | Description |
|--------|--------|-------------|
| **Heal** | Single ally | Restore HP to one creature |
| **Group Heal** | All allies | Restore HP to entire team (Rare+ only) |
| **Damage Reduction** | Single ally | Reduce incoming damage for N turns |
| **Team Shield** | All allies | Reduce incoming damage for entire team (Legendary only) |
| **Taunt** | Self | Force enemies to target this creature for N turns |

### Scaling by Rarity
Higher rarity Tanks get larger HP pools, stronger heals/shields, and wider targeting. A Common Tank heals one ally; a Legendary Tank shields the whole team.

### Design Notes
- Tanks are the backbone of a team comp. They don't win fights alone but they prevent losses.
- As wild enemies, Tanks are frustrating walls — pair them with damage dealers to create interesting team fights.
- Skill words should evoke protection and endurance: 守る (protect), 耐える (endure), 癒す (heal), 固める (harden), 受ける (receive).

---

## Archetype Comparison Summary

| | HP | Attack | Auto Skill | Ultimate Type | Ultimate Power | Charges |
|---|---|---|---|---|---|---|
| **Fighter** | Standard | Standard | Solid damage | Single-target damage | Moderate | 5 |
| **Mage** | Low | Low | Weak damage | AoE damage | High | 3–4 |
| **Trickster** | Low-Mid | Low-Mid | Decent damage | Status effects | Effect-based | 5 |
| **Tank/Healer** | Very High | Low | Modest damage | Heal / Shield | Effect-based | 5 |

## Implementation Status

### Implemented (feature/archetype-combat)

**Skill types:** `damage`, `heal`, `poison`
- `damage`: Single-target or AoE based on `target` field. Used by Fighter and Mage ultimates + all auto-attacks.
- `heal`: Targets `single_ally` (lowest HP%) or `all_allies`. Tank/Healer ultimate. Uses same power formula as damage.
- `poison`: Half-power immediate damage + 3-turn DoT. Trickster ultimate. Poison cannot kill (min 1 HP).

**Skill schema fields:** `type`, `target`, `power`, `element`, `chargesRequired`
- `type`: `"damage"` | `"heal"` | `"poison"`
- `target`: `"single_enemy"` | `"all_enemies"` | `"single_ally"` | `"all_allies"`

**Stat system:** Per-creature `baseHp` and `baseAttack` stored in creature data. Forge picks values within archetype ranges. Rarity and level multipliers apply on top.

**Combat effects:** `activeEffects` array on each robot. Effects tick at the start of each combat round. Expired effects auto-remove.

### Deferred

**Skill types not yet implemented:** `sleep`, `confuse`, `stun`, `attack_buff`, `defense_buff`, `haste`, `taunt`, `shield`

These require more complex state tracking:
- Sleep/stun: skip turn logic
- Confuse: redirect attacks to allies
- Buffs: modify damage formulas for N turns
- Taunt: override target selection
- Shield: damage reduction layer

Additional schema fields for deferred types:
- `effect`: specific effect name (e.g., `"sleep"`, `"confuse"`)
- `duration`: number of turns
- `shieldAmount`: damage reduction multiplier
