# Archetype Identity Guide

Defines what makes each archetype distinct — stat ranges, mechanical identity, allowed/forbidden mechanics, and design intent. Every chip belongs to exactly one archetype. New chips must pass the rules defined here.

## Identity Layers

Each archetype is defined by three layers:

1. **Hard Rules** — Non-negotiable constraints. A chip that violates these cannot belong to the archetype. Stat ranges, forbidden effect categories, required design traits.
2. **Mechanical Identity** — How the archetype interacts with the dual-pool pipeline (`PWR x (1 + BW)`). Which pool it affects, how its damage behaves over time, what its actives do.
3. **Design Intent** — Soft guidelines that make a chip "feel right." Fantasy, player experience, synergy role.

---

## Striker

**Fantasy:** The reliable weapon. Hits hard every turn, no setup required.

### Hard Rules

- HP range: 30-50 (medium-low survivability)
- PWR range: 10-25 (highest base Power of any archetype)
- BW range: 0 (Strikers never contribute Bandwidth)
- Passives must NOT be chance-based (no random triggers)
- No healing, no shielding, no defensive effects whatsoever

### Mechanical Identity

- **Primary pool: Power (flat adds).** Strikers increase the base number in `PWR x (1 + BW)`.
- **Damage pattern: Consistent.** A Striker's contribution should be roughly the same on turn 1 as turn 10. Small scaling is fine (Wallet Bot's kill counter), but no feast-or-famine cycles.
- **Passives** provide reliable, predictable Power boosts — flat adds, conditional adds with common triggers, or slow-scaling counters.
- **Actives** are straightforward damage buffs: flat bonus damage, POST_PIPELINE multipliers, or PRE_PIPELINE power boosts. Nothing fancy.

### Design Intent

- Equipping a Striker should feel *safe*. You know what you're getting.
- Strikers are the baseline — other archetypes are defined by how they differ from Strikers.
- A loadout of all Strikers should be viable but unexciting: solid damage, no synergy payoffs.

---

## Mage

**Fantasy:** The spellcaster. Low base damage, but scales the Bandwidth pool and unleashes devastating active skills. Rewards patience and planning.

### Hard Rules

- HP range: 10-30 (lowest survivability of any archetype)
- PWR range: 3-10 (lowest base Power — they rely on Bandwidth and actives)
- BW range: 0-6 (primary Bandwidth contributors)
- Passives must NOT be chance-based (Mages are intentional, not lucky)
- No healing, no shielding, no defensive effects whatsoever

### Mechanical Identity

- **Primary pool: Bandwidth (multipliers and conditional adds).** Mages scale the `(1 + BW)` side of the formula. They make everything else hit harder.
- **Damage pattern: Passive sustain + active burst.** Passives provide Bandwidth scaling through predictable, plannable mechanics. The burst comes from the player choosing when to fire the active skill.
- **Passives** grow or maintain the Bandwidth pool: Nth-attack BW adds, conditional BW multipliers, degrading-but-high BW, ramp-up BW scaling. Always predictable, never random.
- **Actives** are big nuke skills — the Mage's "spell." Calculated from varied sources:
  - Damage = number of equipped chips x N
  - Damage = player attack x multiplier
  - Damage = sum of all chip levels x N
  - Damage = remaining Bandwidth x N
  - Large POST_PIPELINE multipliers (x2.0+)

### Design Intent

- Mages boost the team's damage through Bandwidth on every turn, then unleash a big active skill at the right moment.
- Equipping a Mage is a tradeoff: very low HP contribution and minimal Power, but strong scaling.
- Mages reward loadout planning — their Bandwidth makes Strikers hit harder, and their actives provide player-controlled burst.
- A loadout of all Mages has enormous multipliers but almost no base Power to multiply.

---

## Tank

**Fantasy:** The wall. Keeps the player alive and provides utility through durability. Low damage contribution, but you survive long enough for everything else to work.

### Hard Rules

- HP range: 60-100 (highest survivability of any archetype)
- PWR range: 5-15 (low-to-moderate Power)
- BW range: 0-1 (Tanks don't scale damage)
- No Bandwidth multipliers whatsoever
- No burst damage mechanics
- Passives must NOT be chance-based

### Mechanical Identity

- **Primary contribution: HP pool.** Tanks don't win fights — they stop you from losing them. Their main value is the raw HP they add to the shared pool.
- **Damage pattern: Flat and low.** Tanks provide modest, consistent Power. They are never the reason you dealt big damage.
- **Passives** are defensive or constraint-based utility: slot-count bonuses, empty-slot bonuses, damage reduction, survival triggers, or loadout-shaping conditions. They create interesting deckbuilding decisions rather than combat math.
- **Actives** are defensive or utility-focused:
  - Survive lethal damage (Egg Bot's Revival)
  - Reduce incoming damage by X% for Y turns
  - Conditional Power boosts that reward specific loadout constraints (Duo Bot's "exactly 2 chips")
  - Flat damage boosts with loadout conditions (Eraser Bot's "2+ empty slots")
  - NOT big nukes — that's Mage/Striker territory

### Design Intent

- Equipping a Tank should feel like buying insurance. You sacrifice damage for the safety of a larger HP pool.
- Tanks are the archetype that shapes *how* you build your loadout — their conditions (empty slots, chip count, etc.) force interesting choices.
- A loadout of all Tanks is very safe but painfully slow — you'll survive forever but take ages to kill anything.
- Tanks pair naturally with Mages: the Tank provides the HP the Mage doesn't, the Mage provides the damage the Tank doesn't.

---

## Healer

**Fantasy:** The sustainer. Keeps the HP pool topped up through combat. Low offensive contribution, but extends every fight in your favor.

### Hard Rules

- HP range: 35-55 (moderate survivability)
- PWR range: 3-9 (low Power — they heal, not hit)
- BW range: 0-2 (minimal scaling)
- Must have at least one healing-related mechanic (passive or active)
- No Bandwidth multipliers
- No burst damage mechanics

### Mechanical Identity

- **Primary contribution: HP recovery.** Healers don't prevent damage like Tanks — they recover it. Their value increases in longer fights.
- **Damage pattern: Low and steady, with healing attached.** Healers can deal modest damage, but their output always comes with sustain (lifesteal, heal-on-hit, heal-on-kill).
- **Passives** restore HP through various methods: percentage-based heal per attack, lifesteal from damage dealt, healing-to-damage conversion, or heal-on-condition triggers. Always reliable, never random.
- **Actives** are healing-focused or hybrid:
  - Flat HP restoration (Onigiri's Extra Serving)
  - Heal + damage hybrid (Straw Bot's Big Sip, Leech Bot's Drain Life)
  - Healing amplification (boost all healing received for Y turns)
  - NOT pure damage nukes — if a Healer active deals damage, it must also heal

### Design Intent

- Equipping a Healer should feel like extending your runway. Fights go longer, mistakes are more forgivable.
- Healers are the anti-burst archetype — they grind, not spike. They turn close fights into wins through attrition.
- A loadout of all Healers is nearly unkillable but deals very low damage.
- Healers vs Tanks is a meaningful choice: Tanks give a bigger HP pool upfront, Healers refill the pool you have.

---

## Trickster

**Fantasy:** The wildcard. Unpredictable, chaotic, and capable of breaking the rules. High variance — sometimes brilliant, sometimes disastrous.

### Hard Rules

- HP range: 20-50 (variable — Tricksters don't have a consistent survivability profile)
- PWR range: 1-20 (widest Power range of any archetype)
- BW range: 0-3 (moderate, inconsistent)
- Tricksters are the ONLY archetype allowed to use chance-based mechanics
- Tricksters are the ONLY archetype allowed to destroy chips (their own or others)
- Tricksters are the ONLY archetype allowed to manipulate pipeline execution order (recursion, copying, firing chips twice)

### Mechanical Identity

- **Primary contribution: Variance and rule-breaking.** Tricksters don't own a pool — they bend the pipeline itself. They do things no other archetype is allowed to do.
- **Damage pattern: Unpredictable.** Some turns they do nothing, some turns they double your entire output. The player opts into chaos.
- **Passives** break the normal rules of the pipeline:
  - Chance-based triggers (random procs, coin flips)
  - Chip destruction (random or self-destruction)
  - Pipeline manipulation (restart pipeline, copy previous chip, fire a chip twice)
  - Stacking mechanics with random accumulation
  - Rarity-based or position-based conditional bonuses
- **Actives** amplify the chaos or provide high-variance payoffs:
  - Pipeline modifiers (execute pipeline twice, double next chip's effect)
  - Damage based on accumulated stacks
  - Effects that scale with destroyed chips
  - Large multipliers with downsides or conditions

### Design Intent

- Equipping a Trickster should feel like a gamble. You're trading reliability for ceiling.
- Tricksters are the "combo piece" archetype — they create explosive interactions with other chips through pipeline manipulation.
- A loadout of all Tricksters is volatile: some runs feel godlike, others fall apart. Not for players who want consistency.
- Tricksters are defined by what they're exclusively allowed to do — if a mechanic feels like it "breaks the rules," it belongs here.
- The fun of a Trickster is the stories it creates: "Clock Bot restarted the pipeline and Mirror Bot copied Needle Bot and I one-shot the boss."

---

## At a Glance

**Striker** — The reliable damage dealer. High Power, no Bandwidth, no gimmicks. Passives add flat Power consistently. Actives are straightforward damage buffs. No chance, no healing, no defense. You always know what you're getting. (HP 30-50, PWR 10-25, BW 0)

**Mage** — The glass cannon spellcaster. Lowest HP, lowest base Power, but the only archetype that seriously scales Bandwidth. Passives grow the multiplier pool through predictable, plannable mechanics — never random. Actives are big nukes calculated from varied sources (chip count, attack stat, chip levels, etc.). No chance, no healing, no defense. (HP 10-30, PWR 3-10, BW 0-6)

**Tank** — The wall. Highest HP, low damage. Passives are defensive or constraint-based — they shape how you build your loadout (empty slot bonuses, chip count conditions). Actives are defensive: survive lethal hits, reduce incoming damage for X turns, or conditional boosts tied to loadout constraints. No Bandwidth multipliers, no burst, no chance. (HP 60-100, PWR 5-15, BW 0-1)

**Healer** — The sustainer. Moderate HP, very low Power. Every Healer must have at least one healing mechanic. Passives restore HP through heal-on-hit, lifesteal, or healing-to-damage conversion. Actives are heals or heal+damage hybrids — if a Healer active deals damage, it must also heal. No Bandwidth multipliers, no burst, no chance. (HP 35-55, PWR 3-9, BW 0-2)

**Trickster** — The wildcard. Widest stat ranges, most unpredictable. Tricksters have three exclusive rights no other archetype may use: chance-based mechanics, chip destruction, and pipeline manipulation (recursion, copying, firing chips twice). Passives break the normal rules. Actives amplify the chaos. You opt into variance for a higher ceiling. (HP 20-50, PWR 1-20, BW 0-3)
