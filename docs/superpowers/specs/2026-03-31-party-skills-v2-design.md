# Party Skills v2 — Synergy Loop System

**Date:** 2026-03-31
**Status:** Approved
**Replaces:** Current 5-skill MVP (superEffectiveMend, hasteSpark, guardPulse, battleRhythm, finisherFeast)
**Updated:** 2026-03-31 — adapted for PokeRogue-style stat stages (-6 to +6)

## Overview

Replace the current 5 passive proc skills with a 4-loop, 20-skill system where skills within a loop amplify each other and cross-loop combinations create emergent "Duo Boon" moments. Inspired by Hades (Supergiant), Capybara Go (Habby), and Monster Sanctuary (Moi Rai).

**Design philosophy:** Every skill does something cool IMMEDIATELY when picked. No counter tracking by the player. No invisible percentage boosts. Effects must be VISIBLE in combat (extra hits, shields, debuffs appearing, damage numbers). The game handles the math — the player just plays.

**Scale:** 4 loops × 5 skills = 20 total skills. Players draft 3-5 per run via existing Skill Master rooms (pick 1-of-3). Comparable to Hades at Early Access launch (~60 boons across 6 gods).

## Stat Stages Context

As of 2026-03-31, the combat system uses PokeRogue-style integer stat stages instead of percent-based buffs/debuffs:

- **Range:** -6 to +6 per stat (atk, def, with more types planned: speed, crit, etc.)
- **Formula:** `max(2, 2+stage) / max(2, 2-stage)` → +1 = 1.5x, +6 = 4.0x, -1 = 0.667x, -6 = 0.25x
- **Accumulation:** Stages stack (+1 on top of +2 = +3), capped at ±6
- **Persistence:** Stages persist until combat end (no turn-based expiry)
- **Player advantage:** Auto-increment mechanics (Momentum, Erosion skills) only apply to player-side stages

All party skills that reference "buffs" or "debuffs" in the context of ATK/DEF changes operate on stat stages. Status effects (poison, stun, confuse, sleep, shield, haste, taunt) remain in the `activeEffects` system with turn-based duration.

## Acquisition

No changes to the draft mechanism. Skill Master rooms still offer pick-1-of-3 from the catalog. Skills are stored in `run.partySkills` as before. The catalog expands from 5 to 20 skills.

Skills from all 4 loops appear in the same draft pool. A player might be offered one Chain skill, one Counter skill, and one Debuff skill — forcing a genuine choice about which loop to invest in.

## Core Design Rule: Element-Adaptive Chains

Chain attacks match the ATTACKING CREATURE's element, not a fixed element. A Fire creature's chain deals Fire damage, a Water creature's chain deals Water. This means chains naturally interact with the element wheel — a fire chain hitting a metal enemy is super-effective. This makes party element diversity a strategic choice that directly impacts chain effectiveness.

---

## Loop 1: Chain Combo

**Fantasy:** "Your attacks chain to other enemies. Element matches the attacker."

### Skills

**1. Arc Strike**
- **Trigger:** Any creature lands a damage move
- **Effect:** The hit chains to one random other living enemy for 30% of the original damage, matching the attacker's element
- **Visual:** A second damage number appears on a different enemy with an element-colored arc connecting the two targets
- **Source:** Zeus "Lightning Strike" (Hades)

**2. Forked Arc**
- **Trigger:** A chain hit occurs (requires Arc Strike)
- **Effect:** Each chain bounce has a 50% chance to bounce again to another enemy (up to 4 total bounces). Each bounce targets a random living enemy (can re-hit)
- **Visual:** Forking paths of element-colored arcs — unpredictable, exciting, sometimes the chain keeps going and going
- **Source:** Zeus "Storm Lightning" (Hades) + Capybara Go "Multiple Bolt" cascading

**3. Resonant Arc**
- **Trigger:** A chain bounces more than once (requires Forked Arc)
- **Effect:** Each successive bounce deals +15% MORE than the previous (bounce 1: 30%, bounce 2: 45%, bounce 3: 60%, bounce 4: 75%)
- **Visual:** Chain damage numbers get visibly larger and arc visuals grow brighter with each bounce
- **Source:** Hades "Splitting Bolt" (Zeus Legendary)

**4. Chain Surge**
- **Trigger:** 3+ total chain hits occur across all creatures in a single turn
- **Effect:** All creatures gain atk +1 stage
- **Visual:** End-of-turn "CHAIN SURGE" text, all creatures glow with element color, stage-up icon appears
- **Source:** Capybara Go "Multiple Bolt" threshold + Monster Sanctuary combo meter
- **Cross-loop bridge:** The atk stage change triggers Buff Spread's Shared Vigor (50% chance to chain to an ally)

**5. Elemental Cascade**
- **Trigger:** A chain hit is super-effective (chain element vs target element)
- **Effect:** That chain hit deals double damage (60% instead of 30% base) AND has a 30% chance to apply atk -1 stage to the target
- **Visual:** Larger element burst on SE chain, "SE!" indicator on chain hit
- **Source:** Hades "Sea Storm" Duo Boon (Poseidon+Zeus) — one system triggering another
- **Cross-loop bridge:** The atk stage debuff can trigger Debuff Spread's Contagion

### Internal Synergy

| Skills owned | What happens per attack |
|---|---|
| Arc Strike only | Chain once for 30% damage |
| + Forked Arc | 50% chance each bounce continues (up to 4) |
| + Resonant Arc | Later bounces hit harder (30→45→60→75%) |
| + Chain Surge | 3+ chains/turn → team atk +1 stage |
| + Elemental Cascade | SE chains deal 2x, apply atk -1 stage — bridges to Debuff loop |

---

## Loop 2: Counter Attack

**Fantasy:** "Getting hit triggers retaliation. The enemy's turn is YOUR offense."

### Skills

**1. Retaliation Strike**
- **Trigger:** Any creature takes damage from an enemy attack
- **Effect:** 50% chance the hit creature strikes back for 25% of its ATK, element-matched
- **Visual:** Counter-damage number appears on the attacker with "COUNTER" label
- **Source:** Athena "Divine Strike" (Hades) + Capybara Go "Counter Rate"

**2. Hardened Riposte**
- **Trigger:** A counter occurs on a creature that has a shield or positive def stage
- **Effect:** That counter deals +50% more damage (37.5% ATK total)
- **Visual:** Shield icon flashes before the enlarged counter-damage number
- **Source:** Athena "Brilliant Riposte" (Hades) + Monster Sanctuary "Volatile Shield"

**3. Fury Counter**
- **Trigger:** A counter occurs
- **Effect:** The countering creature permanently gains +10% counter damage for the rest of this combat (stacks up to 10 times, resets between fights)
- **Visual:** Small tally next to creature (e.g., "x3"), counter damage numbers grow visibly
- **Note:** This is a counter-specific multiplier, NOT a stat stage. Kept separate to avoid double-scaling with Momentum and to keep the Counter loop mechanically distinct.
- **Source:** Capybara Go "Combo Mastery" (permanent stacking ATK per combo hit)

**4. Vengeful Mark**
- **Trigger:** A counter occurs
- **Effect:** The enemy that was countered receives atk -1 stage
- **Visual:** Stage-down icon appears on the attacker after the counter hit
- **Note:** Stages persist until combat end, so every counter permanently weakens the attacker. With Erosion, that -1 deepens to -2, -3... each round.
- **Source:** Aphrodite "Heartbreak Strike" Weak application (Hades) — adapted as stat stage debuff
- **Cross-loop bridge:** The atk stage debuff triggers Debuff Spread's Contagion

**5. Last Stand**
- **Trigger:** A creature with Retaliation Strike is below 30% HP when a counter triggers
- **Effect:** Counter deals double damage (50% ATK base)
- **Visual:** Low-HP creature glows red, counter hits show "LAST STAND" with enlarged numbers
- **Source:** Capybara Go "Glass Cannon" (below 30% HP = massive damage boost)

### Internal Synergy

| Skills owned | What happens when your creature gets hit |
|---|---|
| Retaliation Strike only | 50% chance: strike back for 25% ATK |
| + Hardened Riposte | Shielded/def-buffed creatures counter for 37.5% ATK |
| + Fury Counter | Each counter adds +10% permanent, snowballing through the fight |
| + Vengeful Mark | Counters apply atk -1 stage — enemies permanently weaken as they attack you |
| + Last Stand | Below 30% HP: double counter damage. A dying creature hits back hardest |

---

## Loop 3: Debuff Spread

**Fantasy:** "Apply debuffs. They spread. Stack different types. Watch enemies crumble."

"Debuff" in this loop means BOTH negative stat stages (atk -1, def -1, etc.) AND status effects (poison, stun, confuse). Spreading a stat stage means applying the same stage delta to the new target. Spreading a status effect means applying a fresh copy.

### Skills

**1. Contagion**
- **Trigger:** Any debuff is successfully applied to an enemy (stat stage decrease OR status effect)
- **Effect:** 35% chance the same debuff spreads to one random other living enemy
- **Visual:** Debuff icon arcs from primary target to secondary target with "SPREAD" label
- **Source:** Monster Sanctuary "Curse Chain" (#2 most powerful passive — 35% spread on debuff application)

**2. Erosion**
- **Trigger:** Start of each combat round
- **Effect:** Every negative stat stage on every enemy auto-decrements by 1 (e.g., atk -2 → atk -3). Capped at -6.
- **Visual:** At round start, debuffed enemies pulse dark, small "▼" arrows appear next to each affected stage icon
- **Note:** Only affects player-applied stat stages on enemies. Does not affect status effect durations — those still tick down normally.
- **Source:** Monster Sanctuary "Curse Chain" snowball concept — debuffs that worsen passively

**3. Virulent Chain**
- **Trigger:** Contagion's spread triggers (requires Contagion)
- **Effect:** Spreads can now chain up to 3 times total (each 35% independent chance)
- **Visual:** Spread arc bounces enemy-to-enemy-to-enemy in rapid sequence
- **Source:** Full "Curse Chain" mechanic from Monster Sanctuary (chain-trigger-itself property)

**4. Affliction Burst**
- **Trigger:** An enemy has 3+ different debuff types simultaneously (counting both negative stat stages and status effects — e.g., atk -1 + poison + confuse = 3 types)
- **Effect:** Instant burst of 20% of that enemy's max HP as damage. 2-turn cooldown per enemy.
- **Visual:** Debuff icons swirl and detonate in a dramatic explosion, large "AFFLICTION BURST" number
- **Source:** Demeter "Arctic Blast" (Hades) — threshold trigger: 10 Chill stacks → burst damage

**5. Pandemic**
- **Trigger:** An enemy that has any active debuffs (negative stages or status effects) is defeated
- **Effect:** ALL of its debuffs spread to ALL surviving enemies (guaranteed, no chance roll). For stat stages, this applies the defeated enemy's current negative stage values to survivors (additive, capped at -6).
- **Visual:** Debuff icons fly outward from the defeated enemy to all survivors with "PANDEMIC" label
- **Source:** Dionysus "Peer Pressure" Duo Boon (Hades) + Monster Sanctuary "Proliferate"

### Internal Synergy

| Skills owned | What happens when you apply a debuff |
|---|---|
| Contagion only | 35% chance it spreads to another enemy |
| + Erosion | All negative stages on enemies deepen by -1 each round |
| + Virulent Chain | Spreads chain up to 3 times (can hit whole team) |
| + Affliction Burst | 3+ debuff types → 20% max HP instant damage |
| + Pandemic | Kill a debuffed enemy → ALL debuffs jump to all survivors |

---

## Loop 4: Buff Spread

**Fantasy:** "Buff one ally, buff them all. More buffs = more team power."

"Buff" in this loop means BOTH positive stat stages (atk +1, def +1, etc.) AND positive status effects (shield, haste). Spreading a stat stage means applying the same stage delta to the new target. Spreading a status effect means applying a fresh copy.

### Skills

**1. Shared Vigor**
- **Trigger:** Any creature receives a buff (stat stage increase OR positive status effect like shield/haste)
- **Effect:** 50% chance the buff chains to one random other living ally. For stat stages, applies the same stage delta. For status effects, applies a fresh copy at full duration.
- **Visual:** Buff icon appears on primary target, then a 50% chance arc shoots to another ally showing the same icon with "CHAIN" label
- **Source:** Monster Sanctuary "Duality" (#6 most powerful passive — 50% chance one buff type generates another)

**2. Momentum**
- **Trigger:** Start of each combat round
- **Effect:** Every positive stat stage on every party creature auto-increments by 1 (e.g., def +2 → def +3). Capped at +6.
- **Visual:** At round start, buffed creatures glow, small "▲" arrows appear next to each affected stage icon
- **Note:** Only affects positive stat stages on player creatures. Does not affect status effect durations.
- **Source:** Capybara Go "Combo Mastery" snowball concept — power that builds every turn

**3. Diverse Empowerment**
- **Trigger:** A creature with 2+ different positive buff types attacks (counting distinct positive stat stages and positive status effects — e.g., atk +1 + shield = 2 types)
- **Effect:** +8% damage per different buff type active on the attacking creature (e.g., atk stage + def stage + shield = 3 types = +24%)
- **Visual:** Stacking indicator showing buff type count and damage bonus
- **Source:** Monster Sanctuary "Heroic Party" (#8 most powerful passive — +1% damage per buff on team)

**4. Overflow Vitality**
- **Trigger:** Start of turn, any creature has 3+ different buff types active
- **Effect:** That creature regenerates 8% of its max HP
- **Visual:** Golden glow around creatures with 3+ buff types, green healing numbers at turn start
- **Source:** Monster Sanctuary "Critical Mass" self-sustaining loop concept

**5. Radiant Aura**
- **Trigger:** Any creature has 3+ different buff types active
- **Effect:** ALL allies deal +15% damage (aura). If 2+ creatures have 3+ types, bonus doubles to +30%
- **Visual:** Aura glow radiates from buffed creatures, visible "+15%" or "+30%" team indicator
- **Source:** Monster Sanctuary "Heroic Party" aura (team-wide damage bonus from buff count)

### Internal Synergy

| Skills owned | What happens when you cast a buff |
|---|---|
| Shared Vigor only | 50% chance buff chains to another ally |
| + Momentum | All positive stages on your party grow by +1 each round |
| + Diverse Empowerment | +8% damage per different buff type on creature |
| + Overflow Vitality | 3+ buff types → 8% HP regen per turn |
| + Radiant Aura | 3+ types on any creature → +15% team dmg. Two creatures at 3+ → +30% |

---

## Cross-Loop Combinations

These emerge naturally from skill interactions — not designed as explicit "Duo Boon" skills.

### Chain + Counter = "Thunder God"
Counter-attacks ARE attacks. Arc Strike triggers on counters, so every counter chains to another enemy. Enemy attacks you → 50% counter → counter chains. Three enemies attacking → up to 3 counters → up to 3 chains = 6 hits on the enemy's turn.

### Chain + Debuff = "Plague Arc"
Elemental Cascade applies atk -1 stage on SE chain hits (30% chance). Contagion spreads applied debuffs (35% chance). Erosion deepens all negative stages each round. One attack can chain → SE chain applies stage debuff → debuff spreads → all spread targets auto-decrement each round.

### Counter + Debuff = "Toxic Vengeance"
Vengeful Mark applies atk -1 stage on every counter. Contagion can spread that debuff. Erosion deepens it each round. A tank that gets hit repeatedly applies permanent atk debuffs to attackers that spread and deepen. The more they hit you, the weaker they ALL get, and it keeps getting worse.

### Counter + Buff = "Fortified Vengeance"
Hardened Riposte makes counters +50% when shielded or def-staged. Shared Vigor spreads def stage boosts to all allies. Momentum grows those stages each round. One creature buffing itself → chains to allies → all allies have rising def → all counters hit harder every round.

### Chain + Buff = "Surging Valor"
Chain Surge grants atk +1 stage when 3+ chains per turn. That stage change triggers Shared Vigor (50% chain to ally). Momentum grows it each round. Diverse Empowerment counts it as a buff type (+8%). Chains generate stages that grow, spread, and boost damage.

### Debuff + Buff = "Dual Dominance"
Momentum makes your team's stages rise each round. Erosion makes enemy stages sink each round. The gap widens every turn without either side casting a single buff/debuff move after the initial application. Kill a debuffed enemy → Pandemic dumps worsened debuffs to all survivors → Affliction Burst detonates.

### Erosion + Momentum = "Widening Gyre"
The signature cross-loop combo of the stage system. Draft both and every round the stage gap between your team and the enemy widens by 2 (you go up 1, they go down 1). After 3 rounds with initial +1/-1 casts, you're at +4 (3.0x) and enemies are at -4 (0.33x). The multiplier difference is 9:1. This is the ultimate long-fight investment — weak in round 1, game-breaking by round 5.

---

## Implementation Notes

### Data Structure

```javascript
// party-skills.js — skill catalog entry
{
  id: 'arcStrike',
  name: 'Arc Strike',
  loop: 'chain',
  desc: 'Attacks chain to another enemy for 30% damage, matching your element',
  params: {
    chainDamagePct: 0.30,
    maxBounces: 1
  }
}
```

### Combat Engine Integration

All skills trigger in `applyPartySkillsAfterPlayerAttacks()` in `creature-combat-service.js`, which already processes attack records with access to allies, enemies, element data, and the combat object.

**New hooks needed:**
- **After enemy attacks** (for Counter loop): New function `applyPartySkillsAfterEnemyAttacks()` that processes enemy attack records and triggers counter skills
- **After stat stage change** (for Spread loops): Hook into `applyStatChange()` in `effects.js` to check for Contagion/Shared Vigor triggers on stage changes
- **After status effect application** (for Spread loops): Hook into `tryApplyStatus()` for Contagion/Shared Vigor triggers on status effects
- **After kill** (for Pandemic): Hook into the existing `targetDefeated` check
- **Start of round** (for Erosion/Momentum): New function `applyPartySkillsRoundStart()` that auto-increments/decrements stages before any actions

**New combat state:**
- `combat.chainHitsThisTurn` — count of chain hits for Chain Surge threshold
- `combat.counterCounts[creatureIndex]` — per-creature counter stack count for Fury Counter
- `combat.afflictionBurstCooldown[enemyIndex]` — 2-turn cooldown tracker for Affliction Burst

### Stat Stage Interaction Rules

- **Spreading a stage change:** When Contagion or Shared Vigor spreads a stat stage change, it applies the same delta (e.g., atk -1) to the new target via `applyStatChange()`. The new target's existing stages are unaffected — the delta stacks additively.
- **Pandemic stage transfer:** When Pandemic triggers on a defeated enemy, each of the enemy's negative stat stages is applied as a delta to all survivors. E.g., if the defeated enemy had atk -3 and def -2, all survivors receive `applyStatChange(target, 'atk', -3)` and `applyStatChange(target, 'def', -2)`.
- **Erosion/Momentum only affect non-zero stages:** A creature with atk +0 is NOT incremented by Momentum. Only existing positive stages grow. Similarly, Erosion only deepens existing negative stages.
- **Erosion/Momentum are player-advantage only:** Momentum affects player creatures' positive stages. Erosion affects enemies' negative stages. Neither affects enemy self-buffs or enemy-applied debuffs on players.
- **Erosion/Momentum do NOT trigger spread skills:** Auto-increment/decrement ticks are passive deepening, not new applications. Erosion ticks do NOT trigger Contagion. Momentum ticks do NOT trigger Shared Vigor. Only active applications (from moves, Chain Surge, Vengeful Mark, etc.) trigger spread skills.

### Existing Systems Used (No Changes Needed)
- `elementMultiplier` detection for SE chains
- `applyOrRefresh()` for status effect application
- `applyStatChange()` / `applyStatChanges()` for stage modifications
- `getStageMultiplier()` for damage calculation with stages
- `getDamageReduction()` for shield detection in Hardened Riposte
- `partySkillProcs[]` array on attack records for UI display
- Skill Master room offering system (`rollSkillMasterOffers()`)

### Phased Rollout
1. **Phase 1:** Chain Combo loop (5 skills) — extends existing attack processing
2. **Phase 2:** Debuff Spread loop (5 skills, including Erosion) — extends status/stage application + new round-start hook
3. **Phase 3:** Counter Attack loop (5 skills) — requires new enemy-attack hook
4. **Phase 4:** Buff Spread loop (5 skills, including Momentum) — extends buff application + round-start hook

### Balance Levers
- Chain damage percentages (30% base)
- Counter proc chance (50%)
- Spread chances (35% for debuffs, 50% for buffs)
- Bounce probability (50% for Forked Arc)
- Threshold counts (3+ chains for Surge, 3+ debuff types for Burst, 3+ buff types for Radiant Aura)
- Cooldowns (2-turn cooldown on Affliction Burst)
- Auto-increment rate (currently +1/-1 per round for Momentum/Erosion — could be tuned to every-other-round if too fast)
- Fury Counter per-stack bonus (+10%, up to 10 stacks)

---

## Migration

The existing 5 skills (superEffectiveMend, hasteSpark, guardPulse, battleRhythm, finisherFeast) are REMOVED from the catalog. Players with existing runs keep their current skills until the run ends. New runs use the new 20-skill catalog.

The `partyHitCounter` combat state used by battleRhythm is replaced by `chainHitsThisTurn` for Chain Surge.
