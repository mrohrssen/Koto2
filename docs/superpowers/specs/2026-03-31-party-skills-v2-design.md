# Party Skills v2 — Synergy Loop System

**Date:** 2026-03-31
**Status:** Approved
**Replaces:** Current 5-skill MVP (superEffectiveMend, hasteSpark, guardPulse, battleRhythm, finisherFeast)

## Overview

Replace the current 5 passive proc skills with a 4-loop, 20-skill system where skills within a loop amplify each other and cross-loop combinations create emergent "Duo Boon" moments. Inspired by Hades (Supergiant), Capybara Go (Habby), and Monster Sanctuary (Moi Rai).

**Design philosophy:** Every skill does something cool IMMEDIATELY when picked. No counter tracking by the player. No invisible percentage boosts. Effects must be VISIBLE in combat (extra hits, shields, debuffs appearing, damage numbers). The game handles the math — the player just plays.

**Scale:** 4 loops × 5 skills = 20 total skills. Players draft 3-5 per run via existing Skill Master rooms (pick 1-of-3). Comparable to Hades at Early Access launch (~60 boons across 6 gods).

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
- **Effect:** All creatures get +20% damage buff for next turn (visible buff icon)
- **Visual:** End-of-turn "CHAIN SURGE" text, all creatures glow with element color
- **Source:** Capybara Go "Multiple Bolt" threshold + Monster Sanctuary combo meter

**5. Elemental Cascade**
- **Trigger:** A chain hit is super-effective (chain element vs target element)
- **Effect:** That chain hit deals double damage (60% instead of 30% base) AND has a 30% chance to apply ATK debuff to the target
- **Visual:** Larger element burst on SE chain, "SE!" indicator on chain hit
- **Source:** Hades "Sea Storm" Duo Boon (Poseidon+Zeus) — one system triggering another
- **Cross-loop bridge:** The ATK debuff application can trigger Debuff Spread's Contagion

### Internal Synergy

| Skills owned | What happens per attack |
|---|---|
| Arc Strike only | Chain once for 30% damage |
| + Forked Arc | 50% chance each bounce continues (up to 4) |
| + Resonant Arc | Later bounces hit harder (30→45→60→75%) |
| + Chain Surge | 3+ chains/turn → team +20% damage next turn |
| + Elemental Cascade | SE chains deal 2x, apply ATK debuff — bridges to Debuff loop |

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
- **Trigger:** A counter occurs on a creature that has a shield or defense buff active
- **Effect:** That counter deals +50% more damage (37.5% ATK total)
- **Visual:** Shield icon flashes before the enlarged counter-damage number
- **Source:** Athena "Brilliant Riposte" (Hades) + Monster Sanctuary "Volatile Shield"

**3. Fury Counter**
- **Trigger:** A counter occurs
- **Effect:** The countering creature permanently gains +10% counter damage for the rest of this combat (stacks up to 10 times, resets between fights)
- **Visual:** Small tally next to creature (e.g., "x3"), counter damage numbers grow visibly
- **Source:** Capybara Go "Combo Mastery" (permanent stacking ATK per combo hit)

**4. Vengeful Mark**
- **Trigger:** A counter occurs
- **Effect:** The enemy that was countered receives ATK debuff (-15%, 2 turns)
- **Visual:** Debuff icon appears on the attacker after the counter hit
- **Source:** Aphrodite "Heartbreak Strike" Weak application (Hades) — adapted as ATK debuff
- **Cross-loop bridge:** The ATK debuff is a debuff application — triggers Debuff Spread's Contagion

**5. Last Stand**
- **Trigger:** A creature with Retaliation Strike is below 30% HP when a counter triggers
- **Effect:** Counter deals double damage (50% ATK base)
- **Visual:** Low-HP creature glows red, counter hits show "LAST STAND" with enlarged numbers
- **Source:** Capybara Go "Glass Cannon" (below 30% HP = massive damage boost)

### Internal Synergy

| Skills owned | What happens when your creature gets hit |
|---|---|
| Retaliation Strike only | 50% chance: strike back for 25% ATK |
| + Hardened Riposte | Shielded creatures counter for 37.5% ATK |
| + Fury Counter | Each counter adds +10% permanent, snowballing through the fight |
| + Vengeful Mark | Counters apply ATK debuff — enemies weaken as they attack you |
| + Last Stand | Below 30% HP: double counter damage. A dying creature hits back hardest |

---

## Loop 3: Debuff Spread

**Fantasy:** "Apply debuffs. They spread. Stack different types. Watch enemies crumble."

### Skills

**1. Contagion**
- **Trigger:** Any debuff/status is successfully applied to an enemy
- **Effect:** 35% chance the same debuff spreads to one random other living enemy
- **Visual:** Debuff icon arcs from primary target to secondary target with "SPREAD" label
- **Source:** Monster Sanctuary "Curse Chain" (#2 most powerful passive — 35% spread on debuff application)

**2. Festering Grip**
- **Trigger:** Passive — always active when owned
- **Effect:** Debuffs your party applies last +1 turn. Enemies with 2+ different debuff types take 15% more damage from all sources
- **Visual:** Extended duration counter on debuff icons. "FESTERING" label on enemies with 2+ types, larger damage numbers
- **Source:** Monster Sanctuary "Death Blow" (#1 most powerful passive — +5% damage per debuff on target). Simplified to threshold.

**3. Virulent Chain**
- **Trigger:** Contagion's spread triggers (requires Contagion)
- **Effect:** Spreads can now chain up to 3 times total (each 35% independent chance)
- **Visual:** Spread arc bounces enemy-to-enemy-to-enemy in rapid sequence
- **Source:** Full "Curse Chain" mechanic from Monster Sanctuary (chain-trigger-itself property)

**4. Affliction Burst**
- **Trigger:** An enemy has 3+ different debuff types simultaneously
- **Effect:** Instant burst of 20% of that enemy's max HP as damage. 2-turn cooldown per enemy.
- **Visual:** Debuff icons swirl and detonate in a dramatic explosion, large "AFFLICTION BURST" number
- **Source:** Demeter "Arctic Blast" (Hades) — threshold trigger: 10 Chill stacks → burst damage

**5. Pandemic**
- **Trigger:** An enemy that has any active debuffs is defeated
- **Effect:** ALL of its debuffs spread to ALL surviving enemies (guaranteed, no chance roll)
- **Visual:** Debuff icons fly outward from the defeated enemy to all survivors with "PANDEMIC" label
- **Source:** Dionysus "Peer Pressure" Duo Boon (Hades) + Monster Sanctuary "Proliferate"

### Internal Synergy

| Skills owned | What happens when you apply a debuff |
|---|---|
| Contagion only | 35% chance it spreads to another enemy |
| + Festering Grip | Debuffs last +1 turn, 2+ types = +15% more damage taken |
| + Virulent Chain | Spreads chain up to 3 times (can hit whole team) |
| + Affliction Burst | 3+ debuff types → 20% max HP instant damage |
| + Pandemic | Kill a debuffed enemy → ALL debuffs jump to all survivors |

---

## Loop 4: Buff Spread

**Fantasy:** "Buff one ally, buff them all. More buffs = more team power."

### Skills

**1. Shared Vigor**
- **Trigger:** Any creature receives a buff (ATK buff, DEF buff, shield, haste)
- **Effect:** 50% chance the buff chains to one random other living ally at full power
- **Visual:** Buff icon appears on primary target, then a 50% chance arc shoots to another ally showing the same icon with "CHAIN" label
- **Source:** Monster Sanctuary "Duality" (#6 most powerful passive — 50% chance one buff type generates another)

**2. Lingering Aura**
- **Trigger:** Passive — always active when owned
- **Effect:** All buffs on your team last +1 turn. When a buff expires naturally (not dispelled), the creature gets a small shield (5% max HP, 1 turn)
- **Visual:** Buff duration counters show +1. On expiry, buff fades gracefully and small shield icon pulses
- **Source:** Monster Sanctuary "Buff Charging" (buffs generate residual value)

**3. Diverse Empowerment**
- **Trigger:** A creature with 2+ different buff types attacks
- **Effect:** +8% damage per different buff type active on the attacking creature (e.g., ATK buff + DEF buff + shield = 3 types = +24%)
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
| Shared Vigor only | 50% chance buff chains to another ally at full power |
| + Lingering Aura | Buffs last +1 turn, expiry grants small shields |
| + Diverse Empowerment | +8% damage per different buff type on creature |
| + Overflow Vitality | 3+ buff types → 8% HP regen per turn |
| + Radiant Aura | 3+ types on any creature → +15% team dmg. Two creatures at 3+ → +30% |

---

## Cross-Loop Combinations

These emerge naturally from skill interactions — not designed as explicit "Duo Boon" skills.

### Chain + Counter = "Thunder God"
Counter-attacks ARE attacks. Arc Strike triggers on counters, so every counter chains to another enemy. Enemy attacks you → 50% counter → counter chains. Three enemies attacking → up to 3 counters → up to 3 chains = 6 hits on the enemy's turn.

### Chain + Debuff = "Plague Arc"
Elemental Cascade applies ATK debuff on SE chain hits (30% chance). Contagion spreads applied debuffs (35% chance). One attack can chain → SE chain applies debuff → debuff spreads. A single attack can debuff multiple enemies through cascading interactions.

### Counter + Debuff = "Toxic Vengeance"
Vengeful Mark applies ATK debuff on every counter. Contagion can spread that debuff. A tank that gets hit repeatedly applies ATK debuffs to attackers that spread across the enemy team. The more they hit you, the weaker they all get.

### Counter + Buff = "Fortified Vengeance"
Hardened Riposte makes counters +50% when shielded/buffed. Shared Vigor spreads DEF buffs to all allies. One creature buffing itself → chains to allies → all allies have DEF buff → all counters hit +50% harder.

### Chain + Buff = "Surging Valor"
Chain Surge grants +20% damage buff when 3+ chains per turn. That buff triggers Shared Vigor (50% chain to ally). Diverse Empowerment counts it as a buff type (+8%). Chains generate buffs, buffs increase chain damage.

### Debuff + Buff = "Dual Dominance"
Buff Spread makes your team self-sustaining (regen, shields, +30% damage). Debuff Spread makes enemies crumble. Kill a debuffed enemy → Pandemic dumps debuffs to all survivors → Affliction Burst detonates. Unkillable team vs melting enemies.

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
  // Params for the combat engine
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
- **After buff/debuff application** (for Spread loops): Hook into `tryApplyStatus()` in `effects.js` to check for Contagion/Shared Vigor triggers
- **After kill** (for Pandemic): Hook into the existing `targetDefeated` check

**New combat state:**
- `combat.chainHitsThisTurn` — count of chain hits for Chain Surge threshold
- `combat.counterCounts[creatureIndex]` — per-creature counter stack count for Fury Counter
- `combat.afflictionBurstCooldown[enemyIndex]` — 2-turn cooldown tracker for Affliction Burst

### Existing Systems Used (No Changes Needed)
- `elementMultiplier` detection for SE chains
- `applyOrRefresh()` for debuff/buff application
- `tryApplyStatus()` for ATK debuff from Vengeful Mark
- `getDamageReduction()` for shield detection in Hardened Riposte
- `partySkillProcs[]` array on attack records for UI display
- Skill Master room offering system (`rollSkillMasterOffers()`)

### Phased Rollout
1. **Phase 1:** Chain Combo loop (5 skills) — extends existing attack processing
2. **Phase 2:** Debuff Spread loop (5 skills) — extends existing status application
3. **Phase 3:** Counter Attack loop (5 skills) — requires new enemy-attack hook
4. **Phase 4:** Buff Spread loop (5 skills) — extends existing buff application

### Balance Levers
- Chain damage percentages (30% base)
- Counter proc chance (50%)
- Spread chances (35% for debuffs, 50% for buffs)
- Bounce probability (50% for Forked Arc)
- Threshold counts (3+ chains for Surge, 3+ debuff types for Burst, 3+ buff types for Radiant Aura)
- Cooldowns (2-turn cooldown on Affliction Burst)

---

## Migration

The existing 5 skills (superEffectiveMend, hasteSpark, guardPulse, battleRhythm, finisherFeast) are REMOVED from the catalog. Players with existing runs keep their current skills until the run ends. New runs use the new 20-skill catalog.

The `partyHitCounter` combat state used by battleRhythm is replaced by `chainHitsThisTurn` for Chain Surge.
