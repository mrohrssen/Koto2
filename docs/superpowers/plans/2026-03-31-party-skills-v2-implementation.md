# Party Skills v2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the 5-skill party skill MVP with a 20-skill synergy loop system built on PokeRogue-style stat stages.

**Architecture:** Extract party skill processing from `creature-combat-service.js` into a dedicated `party-skill-engine.js` with four hook points (round-start, after-player-attacks, after-enemy-attacks, on-buff/debuff-applied). The skill catalog in `party-skills.js` expands from 5 to 20 entries. Combat state gains new counters. The frontend adds new proc type displays.

**Tech Stack:** Node.js ES modules, node:test for TDD, existing combat/effects infrastructure.

**Spec:** `docs/superpowers/specs/2026-03-31-party-skills-v2-design.md`

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `src/game/party-skills.js` | Rewrite | 20-skill catalog with loop metadata |
| `src/game/combat/party-skill-engine.js` | Create | All party skill hook functions (round-start, after-player-attacks, after-enemy-attacks, spread triggers) |
| `src/game/combat/effects.js` | Modify | Add `countDebuffTypes()` and `countBuffTypes()` query helpers |
| `src/game/services/creature-combat-service.js` | Modify | Remove old `applyPartySkillsAfterPlayerAttacks`, re-export from engine |
| `src/game/state.js` | Modify | Expand `createCombatState` with new counters |
| `src/game/loop.js` | Modify | Wire round-start and after-enemy-attacks hooks |
| `public/js/ui/combat-loop.js` | Modify | Display new proc types (chain, counter, spread, stage changes) |
| `tests/unit/combat/party-skill-engine.test.js` | Create | Tests for all 20 skills |
| `tests/unit/combat/party-skills.test.js` | Modify | Update imports to use engine, keep old tests working |

---

### Task 1: Foundation — Skill Catalog Rewrite

**Files:**
- Rewrite: `src/game/party-skills.js`
- Test: `tests/unit/combat/party-skills.test.js` (add catalog test)

- [ ] **Step 1: Write test for new catalog structure**

In `tests/unit/combat/party-skills.test.js`, add at the top after existing imports:

```javascript
import { PARTY_SKILLS_CATALOG, rollSkillMasterOffers, getPartySkillDisplay } from '../../../src/game/party-skills.js';

test('catalog has 20 skills across 4 loops', () => {
  const skills = Object.values(PARTY_SKILLS_CATALOG);
  assert.equal(skills.length, 20);

  const loops = new Set(skills.map(s => s.loop));
  assert.deepEqual([...loops].sort(), ['buff', 'chain', 'counter', 'debuff']);

  for (const loop of ['chain', 'counter', 'debuff', 'buff']) {
    const loopSkills = skills.filter(s => s.loop === loop);
    assert.equal(loopSkills.length, 5, `${loop} loop should have 5 skills`);
  }

  // Every skill has required fields
  for (const skill of skills) {
    assert.ok(skill.id, `skill missing id`);
    assert.ok(skill.name, `${skill.id} missing name`);
    assert.ok(skill.loop, `${skill.id} missing loop`);
    assert.ok(skill.desc, `${skill.id} missing desc`);
  }
});

test('rollSkillMasterOffers excludes owned and returns up to count', () => {
  const offers = rollSkillMasterOffers({ ownedSkillIds: [], count: 3 });
  assert.equal(offers.length, 3);
  // All unique
  assert.equal(new Set(offers).size, 3);
  // All valid IDs
  for (const id of offers) {
    assert.ok(PARTY_SKILLS_CATALOG[id], `${id} not in catalog`);
  }

  // Excludes owned
  const offers2 = rollSkillMasterOffers({ ownedSkillIds: offers, count: 3 });
  for (const id of offers2) {
    assert.ok(!offers.includes(id), `${id} should be excluded`);
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm run test:unit -- --test-name-pattern="catalog has 20 skills"
```

Expected: FAIL — catalog still has 5 skills.

- [ ] **Step 3: Rewrite party-skills.js with 20-skill catalog**

Replace the entire contents of `src/game/party-skills.js`:

```javascript
export const PARTY_SKILLS_CATALOG = {
  // ── Loop 1: Chain Combo ──
  arcStrike: {
    id: 'arcStrike', name: 'Arc Strike', loop: 'chain',
    desc: 'Attacks chain to another enemy for 30% damage, matching your element.',
    params: { chainDamagePct: 0.30, maxBounces: 1 }
  },
  forkedArc: {
    id: 'forkedArc', name: 'Forked Arc', loop: 'chain',
    desc: 'Chain bounces have a 50% chance to bounce again (up to 4 total).',
    params: { bounceChance: 0.50, maxBounces: 4 }
  },
  resonantArc: {
    id: 'resonantArc', name: 'Resonant Arc', loop: 'chain',
    desc: 'Each successive chain bounce deals +15% more than the previous.',
    params: { escalation: 0.15 }
  },
  chainSurge: {
    id: 'chainSurge', name: 'Chain Surge', loop: 'chain',
    desc: '3+ chain hits in a turn: all creatures gain ATK +1 stage.',
    params: { threshold: 3, stageDelta: 1 }
  },
  elementalCascade: {
    id: 'elementalCascade', name: 'Elemental Cascade', loop: 'chain',
    desc: 'Super-effective chains deal 2x and may apply ATK -1 stage.',
    params: { debuffChance: 0.30, stageDelta: -1 }
  },

  // ── Loop 2: Counter Attack ──
  retaliationStrike: {
    id: 'retaliationStrike', name: 'Retaliation Strike', loop: 'counter',
    desc: '50% chance to counter when hit for 25% ATK, element-matched.',
    params: { procChance: 0.50, damagePct: 0.25 }
  },
  hardenedRiposte: {
    id: 'hardenedRiposte', name: 'Hardened Riposte', loop: 'counter',
    desc: 'Counters deal +50% when you have a shield or positive DEF stage.',
    params: { bonusMult: 0.50 }
  },
  furyCounter: {
    id: 'furyCounter', name: 'Fury Counter', loop: 'counter',
    desc: 'Each counter permanently adds +10% counter damage (up to 10 stacks).',
    params: { stackBonus: 0.10, maxStacks: 10 }
  },
  vengefulMark: {
    id: 'vengefulMark', name: 'Vengeful Mark', loop: 'counter',
    desc: 'Counters apply ATK -1 stage to the attacker.',
    params: { stageDelta: -1 }
  },
  lastStand: {
    id: 'lastStand', name: 'Last Stand', loop: 'counter',
    desc: 'Below 30% HP: counters deal double damage.',
    params: { hpThreshold: 0.30, damageMult: 2.0 }
  },

  // ── Loop 3: Debuff Spread ──
  contagion: {
    id: 'contagion', name: 'Contagion', loop: 'debuff',
    desc: '35% chance applied debuffs spread to another enemy.',
    params: { spreadChance: 0.35 }
  },
  erosion: {
    id: 'erosion', name: 'Erosion', loop: 'debuff',
    desc: 'Each round, all negative stat stages on enemies deepen by 1.',
    params: { tickAmount: -1 }
  },
  virulentChain: {
    id: 'virulentChain', name: 'Virulent Chain', loop: 'debuff',
    desc: 'Contagion spreads can chain up to 3 times.',
    params: { maxChains: 3 }
  },
  afflictionBurst: {
    id: 'afflictionBurst', name: 'Affliction Burst', loop: 'debuff',
    desc: '3+ debuff types on an enemy: burst for 20% max HP. 2-turn cooldown.',
    params: { threshold: 3, burstPct: 0.20, cooldown: 2 }
  },
  pandemic: {
    id: 'pandemic', name: 'Pandemic', loop: 'debuff',
    desc: 'Defeated debuffed enemies spread ALL debuffs to all survivors.',
    params: {}
  },

  // ── Loop 4: Buff Spread ──
  sharedVigor: {
    id: 'sharedVigor', name: 'Shared Vigor', loop: 'buff',
    desc: '50% chance buffs chain to a random ally.',
    params: { spreadChance: 0.50 }
  },
  momentum: {
    id: 'momentum', name: 'Momentum', loop: 'buff',
    desc: 'Each round, all positive stat stages on your party grow by 1.',
    params: { tickAmount: 1 }
  },
  diverseEmpowerment: {
    id: 'diverseEmpowerment', name: 'Diverse Empowerment', loop: 'buff',
    desc: '+8% damage per different buff type on the attacker.',
    params: { bonusPerType: 0.08 }
  },
  overflowVitality: {
    id: 'overflowVitality', name: 'Overflow Vitality', loop: 'buff',
    desc: '3+ buff types: regenerate 8% max HP at turn start.',
    params: { threshold: 3, regenPct: 0.08 }
  },
  radiantAura: {
    id: 'radiantAura', name: 'Radiant Aura', loop: 'buff',
    desc: '3+ buff types on any creature: +15% team damage. Two at 3+: +30%.',
    params: { threshold: 3, singleBonus: 0.15, doubleBonus: 0.30 }
  }
};

function toOwnedSet(ownedSkillIds) {
  if (!ownedSkillIds) return new Set();
  if (ownedSkillIds instanceof Set) return ownedSkillIds;
  if (Array.isArray(ownedSkillIds)) return new Set(ownedSkillIds.filter(Boolean));
  return new Set();
}

/**
 * Roll random distinct party-skill IDs for Skill Master offers.
 * Excludes already-owned IDs.
 */
export function rollSkillMasterOffers({ ownedSkillIds = [], count = 3 }) {
  const owned = toOwnedSet(ownedSkillIds);
  const eligible = Object.keys(PARTY_SKILLS_CATALOG).filter(id => !owned.has(id));
  if (eligible.length === 0) return [];

  for (let i = eligible.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [eligible[i], eligible[j]] = [eligible[j], eligible[i]];
  }

  const n = Math.max(0, Math.min(Number(count) || 0, eligible.length));
  return eligible.slice(0, n);
}

export function getPartySkillDisplay(id) {
  const def = PARTY_SKILLS_CATALOG[id];
  if (!def) return null;
  return { id: def.id, name: def.name, desc: def.desc, loop: def.loop, params: def.params };
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm run test:unit -- --test-name-pattern="catalog has 20 skills|rollSkillMasterOffers"
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/game/party-skills.js tests/unit/combat/party-skills.test.js
git commit -m "feat: expand party skills catalog to 20 skills across 4 loops"
```

---

### Task 2: Foundation — Engine Scaffold + Combat State

**Files:**
- Create: `src/game/combat/party-skill-engine.js`
- Modify: `src/game/state.js:230-250`
- Modify: `src/game/services/creature-combat-service.js:1-5,52-61,78-184`
- Modify: `src/game/loop.js:68,710-716`
- Create: `tests/unit/combat/party-skill-engine.test.js`

- [ ] **Step 1: Create engine scaffold with empty hook functions**

Create `src/game/combat/party-skill-engine.js`:

```javascript
/**
 * Party Skill Engine — processes all party skill hooks during combat.
 *
 * Hook points:
 * 1. applyRoundStartSkills()   — Erosion, Momentum (start of each round)
 * 2. applyAfterPlayerAttacks() — Chain loop skills (after player moves)
 * 3. applyAfterEnemyAttacks()  — Counter loop skills (after enemy moves)
 *
 * Spread skills (Contagion, Shared Vigor) are triggered inline by the
 * chain/counter/buff/debuff hooks when they apply effects.
 *
 * IMPORTANT RULE: Erosion/Momentum round-start ticks are passive deepening,
 * NOT new applications. They must NEVER call tryContagion() or trySharedVigor().
 * Only active applications (from moves, Chain Surge, Vengeful Mark, etc.)
 * trigger spread skills. See spec: "Stat Stage Interaction Rules".
 */

import { applyStatChange, applyHeal, getDamageReduction, getStageMultiplier, breakSleep, initStatStages } from './effects.js';
import { getElementMultiplier } from '../creatures.js';
import { PARTY_SKILLS_CATALOG } from '../party-skills.js';

// ── Helpers ─────────────────────────────────────────────────────────

export function toActivePartySkillIdSet(runPartySkills) {
  if (!runPartySkills) return new Set();
  const ids = [];
  for (const entry of runPartySkills) {
    if (!entry) continue;
    if (typeof entry === 'string') ids.push(entry);
    else if (typeof entry === 'object' && typeof entry.id === 'string') ids.push(entry.id);
  }
  return new Set(ids.filter(Boolean));
}

function rollProc(chance) {
  return Math.random() < (Number(chance) || 0);
}

function livingEnemies(enemies) {
  return enemies.filter(e => e && e.hp > 0);
}

function livingAllies(allies) {
  return allies.filter(a => a && a.hp > 0);
}

function randomFrom(arr) {
  if (arr.length === 0) return null;
  return arr[Math.floor(Math.random() * arr.length)];
}

// ── Hook 1: Round Start ─────────────────────────────────────────────

/**
 * Called at start of each combat round, before any actions.
 * Handles: Erosion, Momentum, Overflow Vitality
 * @returns {object[]} Array of event objects for frontend display
 */
export function applyRoundStartSkills({ allies, enemies, runPartySkills, combat }) {
  const active = toActivePartySkillIdSet(runPartySkills);
  if (!active.size) return [];
  const events = [];

  // Erosion: deepen all negative stat stages on enemies by -1
  if (active.has('erosion')) {
    for (let i = 0; i < enemies.length; i++) {
      const enemy = enemies[i];
      if (!enemy || enemy.hp <= 0 || !enemy.statStages) continue;
      for (const [stat, val] of Object.entries(enemy.statStages)) {
        if (val < 0) {
          const delta = applyStatChange(enemy, stat, -1);
          if (delta !== 0) {
            events.push({ type: 'erosion', targetSide: 'enemy', targetIndex: i, stat, delta, newVal: enemy.statStages[stat] });
          }
        }
      }
    }
  }

  // Momentum: grow all positive stat stages on allies by +1
  if (active.has('momentum')) {
    for (let i = 0; i < allies.length; i++) {
      const ally = allies[i];
      if (!ally || ally.hp <= 0 || !ally.statStages) continue;
      for (const [stat, val] of Object.entries(ally.statStages)) {
        if (val > 0) {
          const delta = applyStatChange(ally, stat, 1);
          if (delta !== 0) {
            events.push({ type: 'momentum', targetSide: 'ally', targetIndex: i, stat, delta, newVal: ally.statStages[stat] });
          }
        }
      }
    }
  }

  // Overflow Vitality: 3+ buff types → 8% HP regen
  if (active.has('overflowVitality')) {
    for (let i = 0; i < allies.length; i++) {
      const ally = allies[i];
      if (!ally || ally.hp <= 0) continue;
      if (countBuffTypes(ally) >= 3) {
        const amount = Math.floor(ally.maxHp * 0.08);
        if (amount > 0) {
          const healed = applyHeal(ally, amount);
          if (healed > 0) {
            events.push({ type: 'overflowVitality', targetSide: 'ally', targetIndex: i, healAmount: healed });
          }
        }
      }
    }
  }

  return events;
}

// ── Hook 2: After Player Attacks ────────────────────────────────────

/**
 * Called after processMoveTurn. Modifies attack records in-place.
 * Handles: Chain loop, spread triggers from chains, Affliction Burst checks, Pandemic on kills.
 */
export function applyAfterPlayerAttacks({ attacks, allies, enemies, runPartySkills, combat }) {
  const active = toActivePartySkillIdSet(runPartySkills);
  if (!active.size) return;
  if (!Array.isArray(attacks) || attacks.length === 0) return;
  if (!combat) return;
  if (typeof combat.chainHitsThisTurn !== 'number') combat.chainHitsThisTurn = 0;

  // Reset per-turn counters
  combat.chainHitsThisTurn = 0;

  for (const record of attacks) {
    if (!isQualifyingPlayerAttack(record)) continue;
    if (!record.partySkillProcs) record.partySkillProcs = [];

    const attacker = allies?.[record.attackerIndex] || null;

    // ── Diverse Empowerment: +8% per buff type on attacker ──
    if (active.has('diverseEmpowerment') && attacker) {
      const buffCount = countBuffTypes(attacker);
      if (buffCount >= 2) {
        const bonusPct = buffCount * 0.08;
        const bonus = Math.floor(record.damage * bonusPct);
        if (bonus > 0) {
          const target = enemies?.[record.targetIndex];
          if (target && target.hp > 0) {
            const capped = Math.min(bonus, target.hp - 1);
            if (capped > 0) {
              target.hp -= capped;
              record.damage += capped;
              record.partySkillProcs.push({
                skillId: 'diverseEmpowerment', skillName: 'Diverse Empowerment',
                type: 'bonusDamage', bonusDamage: capped
              });
            }
          }
        }
      }
    }

    // ── Radiant Aura: +15%/+30% team damage ──
    if (active.has('radiantAura')) {
      const creaturesAt3Plus = livingAllies(allies).filter(a => countBuffTypes(a) >= 3).length;
      if (creaturesAt3Plus > 0) {
        const bonusPct = creaturesAt3Plus >= 2 ? 0.30 : 0.15;
        const bonus = Math.floor(record.damage * bonusPct);
        if (bonus > 0) {
          const target = enemies?.[record.targetIndex];
          if (target && target.hp > 0) {
            const capped = Math.min(bonus, target.hp - 1);
            if (capped > 0) {
              target.hp -= capped;
              record.damage += capped;
              record.partySkillProcs.push({
                skillId: 'radiantAura', skillName: 'Radiant Aura',
                type: 'bonusDamage', bonusDamage: capped
              });
            }
          }
        }
      }
    }

    // ── Arc Strike: chain to another enemy ──
    if (active.has('arcStrike')) {
      const otherEnemies = livingEnemies(enemies).filter((_, idx) => idx !== record.targetIndex);
      if (otherEnemies.length > 0) {
        const chainTarget = randomFrom(otherEnemies);
        const chainIdx = enemies.indexOf(chainTarget);
        const baseDmg = Math.max(0, Number(record.damage) || 0);
        let chainDmg = Math.floor(baseDmg * 0.30);

        // Elemental Cascade: SE chains deal 2x + chance for atk -1
        const chainElemMult = getElementMultiplier(attacker?.element || 'neutral', chainTarget.element);
        const isSE = chainElemMult > 1;
        if (isSE && active.has('elementalCascade')) {
          chainDmg = Math.floor(chainDmg * 2);
        }

        // Apply chain damage (can KO)
        const actualChainDmg = Math.min(chainDmg, chainTarget.hp);
        chainTarget.hp -= actualChainDmg;
        combat.chainHitsThisTurn += 1;

        const chainProc = {
          skillId: 'arcStrike', skillName: 'Arc Strike',
          type: 'chainHit', targetIndex: chainIdx, damage: actualChainDmg,
          element: attacker?.element || 'neutral', isSE
        };
        record.partySkillProcs.push(chainProc);

        // Elemental Cascade debuff
        if (isSE && active.has('elementalCascade') && rollProc(0.30)) {
          initStatStages(chainTarget);
          const delta = applyStatChange(chainTarget, 'atk', -1);
          if (delta !== 0) {
            record.partySkillProcs.push({
              skillId: 'elementalCascade', skillName: 'Elemental Cascade',
              type: 'stageChange', targetIndex: chainIdx, targetSide: 'enemy', stat: 'atk', delta
            });
            // Contagion trigger
            tryContagion(active, enemies, chainIdx, 'atk', -1, record, combat);
          }
        }

        // Forked Arc: 50% chance to bounce again (up to 4 total)
        if (active.has('forkedArc')) {
          const maxBounces = active.has('virulentChain') ? 4 : 4; // virulentChain is for debuff spread, not arc bounces
          let prevDmg = actualChainDmg;
          let bounceCount = 1; // already did 1 bounce
          while (bounceCount < 4 && rollProc(0.50)) {
            const bounceTargets = livingEnemies(enemies);
            if (bounceTargets.length === 0) break;
            const bounceTarget = randomFrom(bounceTargets);
            const bounceIdx = enemies.indexOf(bounceTarget);

            let bounceDmg = Math.floor(baseDmg * 0.30);
            // Resonant Arc: +15% per bounce
            if (active.has('resonantArc')) {
              bounceDmg = Math.floor(baseDmg * (0.30 + 0.15 * bounceCount));
            }
            // Elemental Cascade on bounces
            const bounceElemMult = getElementMultiplier(attacker?.element || 'neutral', bounceTarget.element);
            const bounceSE = bounceElemMult > 1;
            if (bounceSE && active.has('elementalCascade')) {
              bounceDmg = Math.floor(bounceDmg * 2);
            }

            const actualBounceDmg = Math.min(bounceDmg, bounceTarget.hp);
            bounceTarget.hp -= actualBounceDmg;
            combat.chainHitsThisTurn += 1;
            bounceCount++;

            record.partySkillProcs.push({
              skillId: 'forkedArc', skillName: 'Forked Arc',
              type: 'chainHit', targetIndex: bounceIdx, damage: actualBounceDmg,
              element: attacker?.element || 'neutral', isSE: bounceSE, bounceNum: bounceCount
            });

            // Elemental Cascade debuff on bounces
            if (bounceSE && active.has('elementalCascade') && rollProc(0.30)) {
              initStatStages(bounceTarget);
              const delta = applyStatChange(bounceTarget, 'atk', -1);
              if (delta !== 0) {
                record.partySkillProcs.push({
                  skillId: 'elementalCascade', skillName: 'Elemental Cascade',
                  type: 'stageChange', targetIndex: bounceIdx, targetSide: 'enemy', stat: 'atk', delta
                });
                tryContagion(active, enemies, bounceIdx, 'atk', -1, record, combat);
              }
            }

            prevDmg = actualBounceDmg;
          }
        }

        // Check if chain killed anything → Pandemic
        if (active.has('pandemic') && chainTarget.hp <= 0) {
          triggerPandemic(chainTarget, enemies, record, combat);
        }
      }
    }

    // ── Check Pandemic on primary target kill ──
    if (active.has('pandemic') && record.targetDefeated) {
      const target = enemies?.[record.targetIndex];
      if (target) {
        triggerPandemic(target, enemies, record, combat);
      }
    }

    // ── Contagion on primary attack's stat changes ──
    if (record.statChangesApplied && active.has('contagion')) {
      for (const [stat, change] of Object.entries(record.statChangesApplied)) {
        if (change < 0) {
          tryContagion(active, enemies, record.targetIndex, stat, change, record, combat);
        }
      }
    }

    // ── Contagion on primary attack's status effects ──
    if (record.effectApplied && active.has('contagion')) {
      tryContagionStatus(active, enemies, record.targetIndex, record.effectApplied, record, combat);
    }
  }

  // ── Chain Surge: 3+ chain hits → team atk +1 ──
  if (active.has('chainSurge') && combat.chainHitsThisTurn >= 3) {
    for (let i = 0; i < allies.length; i++) {
      const ally = allies[i];
      if (!ally || ally.hp <= 0) continue;
      initStatStages(ally);
      const delta = applyStatChange(ally, 'atk', 1);
      if (delta !== 0) {
        // Shared Vigor trigger
        trySharedVigor(active, allies, i, 'atk', 1, combat);
      }
    }
    // Add surge proc to last attack record
    const lastAtk = attacks[attacks.length - 1];
    if (lastAtk) {
      if (!lastAtk.partySkillProcs) lastAtk.partySkillProcs = [];
      lastAtk.partySkillProcs.push({
        skillId: 'chainSurge', skillName: 'Chain Surge',
        type: 'teamBuff', stat: 'atk', delta: 1
      });
    }
  }

  // ── Affliction Burst check on all enemies ──
  if (active.has('afflictionBurst')) {
    checkAfflictionBurst(enemies, combat, attacks);
  }
}

// ── Hook 3: After Enemy Attacks ─────────────────────────────────────

/**
 * Called after processEnemyTurn. Handles Counter loop skills.
 * @returns {object[]} Array of counter attack records for frontend display
 */
export function applyAfterEnemyAttacks({ enemyAttacks, allies, enemies, runPartySkills, combat }) {
  const active = toActivePartySkillIdSet(runPartySkills);
  if (!active.size || !active.has('retaliationStrike')) return [];
  if (!Array.isArray(enemyAttacks) || enemyAttacks.length === 0) return [];
  if (!combat) return;
  if (!combat.counterCounts) combat.counterCounts = {};

  const counterAttacks = [];

  for (const record of enemyAttacks) {
    if (typeof record.targetIndex !== 'number') continue;
    const defender = allies?.[record.targetIndex];
    if (!defender || defender.hp <= 0) continue;
    if (typeof record.damage !== 'number' || record.damage <= 0) continue;

    // Retaliation Strike: 50% chance to counter
    if (!rollProc(0.50)) continue;

    const enemyIdx = record.attackerIndex;
    const enemy = enemies?.[enemyIdx];
    if (!enemy || enemy.hp <= 0) continue;

    // Base counter damage: 25% of defender's attack stat
    let counterDmg = Math.floor((defender.attack || 10) * 0.25);

    // Hardened Riposte: +50% if shielded or def stage > 0
    if (active.has('hardenedRiposte')) {
      initStatStages(defender);
      const hasShield = getDamageReduction(defender) > 0;
      const hasDefStage = (defender.statStages?.def || 0) > 0;
      if (hasShield || hasDefStage) {
        counterDmg = Math.floor(counterDmg * 1.5);
      }
    }

    // Fury Counter: +10% per stack
    if (active.has('furyCounter')) {
      const key = String(record.targetIndex);
      if (!combat.counterCounts[key]) combat.counterCounts[key] = 0;
      combat.counterCounts[key] = Math.min(combat.counterCounts[key] + 1, 10);
      counterDmg = Math.floor(counterDmg * (1 + combat.counterCounts[key] * 0.10));
    }

    // Last Stand: below 30% HP → double damage
    if (active.has('lastStand') && defender.hp < defender.maxHp * 0.30) {
      counterDmg = Math.floor(counterDmg * 2);
    }

    // Apply counter damage to enemy
    const actualDmg = Math.min(counterDmg, enemy.hp);
    enemy.hp -= actualDmg;

    const counterRecord = {
      type: 'counter',
      defenderIndex: record.targetIndex,
      defenderName: defender.nameEn,
      defenderElement: defender.element,
      targetIndex: enemyIdx,
      targetName: enemy.nameEn,
      damage: actualDmg,
      targetDefeated: enemy.hp <= 0,
      furyStacks: combat.counterCounts?.[String(record.targetIndex)] || 0,
      isLastStand: active.has('lastStand') && defender.hp < defender.maxHp * 0.30,
      procs: []
    };

    // Vengeful Mark: atk -1 stage on countered enemy
    if (active.has('vengefulMark') && enemy.hp > 0) {
      initStatStages(enemy);
      const delta = applyStatChange(enemy, 'atk', -1);
      if (delta !== 0) {
        counterRecord.procs.push({
          skillId: 'vengefulMark', skillName: 'Vengeful Mark',
          type: 'stageChange', targetIndex: enemyIdx, targetSide: 'enemy', stat: 'atk', delta
        });
        // Contagion trigger
        tryContagionFromCounter(active, enemies, enemyIdx, 'atk', -1, counterRecord, combat);
      }
    }

    // Pandemic on counter kill
    if (active.has('pandemic') && enemy.hp <= 0) {
      triggerPandemicCounter(enemy, enemies, counterRecord, combat);
    }

    counterAttacks.push(counterRecord);
  }

  // Affliction Burst check after counters
  if (active.has('afflictionBurst') && counterAttacks.length > 0) {
    checkAfflictionBurstCounter(enemies, combat, counterAttacks);
  }

  return counterAttacks;
}

// ── Spread Mechanics ────────────────────────────────────────────────

/** Try to spread a stat stage debuff via Contagion. */
function tryContagion(active, enemies, sourceIdx, stat, delta, record, combat) {
  if (!active.has('contagion')) return;
  const maxChains = active.has('virulentChain') ? 3 : 1;

  let spreadCount = 0;
  let currentIdx = sourceIdx;

  while (spreadCount < maxChains && rollProc(0.35)) {
    const others = livingEnemies(enemies).filter((_, idx) => idx !== currentIdx);
    if (others.length === 0) break;
    const target = randomFrom(others);
    const targetIdx = enemies.indexOf(target);
    initStatStages(target);
    const actualDelta = applyStatChange(target, stat, delta);
    if (actualDelta !== 0) {
      record.partySkillProcs.push({
        skillId: 'contagion', skillName: 'Contagion',
        type: 'spread', spreadType: 'stage', targetIndex: targetIdx, stat, delta: actualDelta
      });
    }
    currentIdx = targetIdx;
    spreadCount++;
  }
}

/** Try to spread a status effect via Contagion. */
function tryContagionStatus(active, enemies, sourceIdx, effectType, record, combat) {
  if (!active.has('contagion')) return;
  // Only spread negative effects
  const debuffTypes = ['poison', 'sleep', 'stun', 'confuse'];
  if (!debuffTypes.includes(effectType)) return;

  const maxChains = active.has('virulentChain') ? 3 : 1;
  let spreadCount = 0;
  let currentIdx = sourceIdx;

  while (spreadCount < maxChains && rollProc(0.35)) {
    const others = livingEnemies(enemies).filter((_, idx) => idx !== currentIdx);
    if (others.length === 0) break;
    const target = randomFrom(others);
    const targetIdx = enemies.indexOf(target);
    // Apply a basic version of the effect
    if (!target.activeEffects) target.activeEffects = [];
    const existing = target.activeEffects.find(e => e.type === effectType);
    if (!existing) {
      target.activeEffects.push({ type: effectType, remainingTurns: 2, sourceId: 'contagion' });
    }
    record.partySkillProcs.push({
      skillId: 'contagion', skillName: 'Contagion',
      type: 'spread', spreadType: 'status', targetIndex: targetIdx, effectType
    });
    currentIdx = targetIdx;
    spreadCount++;
  }
}

/** Contagion from counter attacks (uses counterRecord.procs instead of record.partySkillProcs). */
function tryContagionFromCounter(active, enemies, sourceIdx, stat, delta, counterRecord, combat) {
  if (!active.has('contagion')) return;
  const maxChains = active.has('virulentChain') ? 3 : 1;
  let spreadCount = 0;
  let currentIdx = sourceIdx;

  while (spreadCount < maxChains && rollProc(0.35)) {
    const others = livingEnemies(enemies).filter((_, idx) => idx !== currentIdx);
    if (others.length === 0) break;
    const target = randomFrom(others);
    const targetIdx = enemies.indexOf(target);
    initStatStages(target);
    const actualDelta = applyStatChange(target, stat, delta);
    if (actualDelta !== 0) {
      counterRecord.procs.push({
        skillId: 'contagion', skillName: 'Contagion',
        type: 'spread', spreadType: 'stage', targetIndex: targetIdx, stat, delta: actualDelta
      });
    }
    currentIdx = targetIdx;
    spreadCount++;
  }
}

/** Try to spread a buff via Shared Vigor (50% chance to chain to random ally). */
function trySharedVigor(active, allies, sourceIdx, stat, delta, combat) {
  if (!active.has('sharedVigor')) return;
  if (!rollProc(0.50)) return;

  const others = livingAllies(allies).filter((_, idx) => idx !== sourceIdx);
  if (others.length === 0) return;
  const target = randomFrom(others);
  initStatStages(target);
  applyStatChange(target, stat, delta);
  // Note: Shared Vigor spread does NOT re-trigger Shared Vigor (no infinite loops)
}

/** Trigger Pandemic: all debuffs from defeated enemy spread to all survivors. */
function triggerPandemic(defeated, enemies, record, combat) {
  const survivors = livingEnemies(enemies).filter(e => e !== defeated);
  if (survivors.length === 0) return;

  // Spread negative stat stages
  if (defeated.statStages) {
    for (const [stat, val] of Object.entries(defeated.statStages)) {
      if (val >= 0) continue;
      for (const survivor of survivors) {
        initStatStages(survivor);
        applyStatChange(survivor, stat, val);
      }
    }
  }

  // Spread negative status effects
  if (defeated.activeEffects) {
    const debuffTypes = ['poison', 'sleep', 'stun', 'confuse'];
    for (const effect of defeated.activeEffects) {
      if (!debuffTypes.includes(effect.type)) continue;
      for (const survivor of survivors) {
        if (!survivor.activeEffects) survivor.activeEffects = [];
        if (!survivor.activeEffects.find(e => e.type === effect.type)) {
          survivor.activeEffects.push({ ...effect, sourceId: 'pandemic' });
        }
      }
    }
  }

  record.partySkillProcs.push({
    skillId: 'pandemic', skillName: 'Pandemic',
    type: 'pandemic', survivorCount: survivors.length
  });
}

/** Pandemic from counter kills. */
function triggerPandemicCounter(defeated, enemies, counterRecord, combat) {
  const survivors = livingEnemies(enemies).filter(e => e !== defeated);
  if (survivors.length === 0) return;

  if (defeated.statStages) {
    for (const [stat, val] of Object.entries(defeated.statStages)) {
      if (val >= 0) continue;
      for (const survivor of survivors) {
        initStatStages(survivor);
        applyStatChange(survivor, stat, val);
      }
    }
  }

  counterRecord.procs.push({
    skillId: 'pandemic', skillName: 'Pandemic',
    type: 'pandemic', survivorCount: survivors.length
  });
}

/** Check Affliction Burst on all enemies. */
function checkAfflictionBurst(enemies, combat, attacks) {
  if (!combat.afflictionBurstCooldown) combat.afflictionBurstCooldown = {};

  for (let i = 0; i < enemies.length; i++) {
    const enemy = enemies[i];
    if (!enemy || enemy.hp <= 0) continue;

    // Cooldown check
    const key = String(i);
    if ((combat.afflictionBurstCooldown[key] || 0) > 0) {
      combat.afflictionBurstCooldown[key]--;
      continue;
    }

    if (countDebuffTypes(enemy) >= 3) {
      const burstDmg = Math.floor(enemy.maxHp * 0.20);
      const actualDmg = Math.min(burstDmg, enemy.hp);
      enemy.hp -= actualDmg;
      combat.afflictionBurstCooldown[key] = 2;

      // Add to last attack record
      const lastAtk = attacks[attacks.length - 1];
      if (lastAtk) {
        if (!lastAtk.partySkillProcs) lastAtk.partySkillProcs = [];
        lastAtk.partySkillProcs.push({
          skillId: 'afflictionBurst', skillName: 'Affliction Burst',
          type: 'burst', targetIndex: i, damage: actualDmg, targetDefeated: enemy.hp <= 0
        });
      }
    }
  }
}

/** Affliction Burst from counter phase. */
function checkAfflictionBurstCounter(enemies, combat, counterAttacks) {
  if (!combat.afflictionBurstCooldown) combat.afflictionBurstCooldown = {};

  for (let i = 0; i < enemies.length; i++) {
    const enemy = enemies[i];
    if (!enemy || enemy.hp <= 0) continue;
    const key = String(i);
    if ((combat.afflictionBurstCooldown[key] || 0) > 0) {
      combat.afflictionBurstCooldown[key]--;
      continue;
    }
    if (countDebuffTypes(enemy) >= 3) {
      const burstDmg = Math.floor(enemy.maxHp * 0.20);
      const actualDmg = Math.min(burstDmg, enemy.hp);
      enemy.hp -= actualDmg;
      combat.afflictionBurstCooldown[key] = 2;
      const lastCounter = counterAttacks[counterAttacks.length - 1];
      if (lastCounter) {
        lastCounter.procs.push({
          skillId: 'afflictionBurst', skillName: 'Affliction Burst',
          type: 'burst', targetIndex: i, damage: actualDmg, targetDefeated: enemy.hp <= 0
        });
      }
    }
  }
}

// ── Buff/Debuff Type Counting ───────────────────────────────────────

/** Count distinct debuff types on a creature (negative stages + negative status effects). */
export function countDebuffTypes(creature) {
  let count = 0;
  // Count negative stat stages
  if (creature.statStages) {
    for (const val of Object.values(creature.statStages)) {
      if (val < 0) count++;
    }
  }
  // Count negative status effects
  const debuffTypes = ['poison', 'sleep', 'stun', 'confuse'];
  if (creature.activeEffects) {
    const seen = new Set();
    for (const e of creature.activeEffects) {
      if (debuffTypes.includes(e.type) && !seen.has(e.type)) {
        seen.add(e.type);
        count++;
      }
    }
  }
  return count;
}

/** Count distinct buff types on a creature (positive stages + positive status effects). */
export function countBuffTypes(creature) {
  let count = 0;
  // Count positive stat stages
  if (creature.statStages) {
    for (const val of Object.values(creature.statStages)) {
      if (val > 0) count++;
    }
  }
  // Count positive status effects
  const buffTypes = ['shield', 'team_shield', 'haste'];
  if (creature.activeEffects) {
    const seen = new Set();
    for (const e of creature.activeEffects) {
      if (buffTypes.includes(e.type) && !seen.has(e.type)) {
        seen.add(e.type);
        count++;
      }
    }
  }
  return count;
}

// ── Qualifying Record Check ─────────────────────────────────────────

function isQualifyingPlayerAttack(record) {
  if (!record || typeof record !== 'object') return false;
  if (typeof record.attackerIndex !== 'number' || record.attackerIndex < 0) return false;
  const cat = record.category;
  return (cat === 'damage' || cat === 'drain') && typeof record.damage === 'number' && record.damage > 0;
}
```

- [ ] **Step 2: Update combat state with new counters**

In `src/game/state.js`, find the `createCombatState` function (line ~230) and add new fields after `partyHitCounter: 0`:

```javascript
    // Party skills v2 (combat-scoped)
    partyHitCounter: 0,       // Legacy — kept for backward compat
    chainHitsThisTurn: 0,     // Chain Surge threshold counter (resets each turn)
    counterCounts: {},        // Per-creature counter stack count for Fury Counter
    afflictionBurstCooldown: {}, // Per-enemy cooldown tracker for Affliction Burst
```

- [ ] **Step 3: Update creature-combat-service.js to delegate to engine**

In `src/game/services/creature-combat-service.js`:

Replace the import and re-export. At the top, add:

```javascript
import { applyAfterPlayerAttacks, applyAfterEnemyAttacks, applyRoundStartSkills, toActivePartySkillIdSet as _toActiveSet } from '../combat/party-skill-engine.js';
```

Replace the old `applyPartySkillsAfterPlayerAttacks` function (lines 78-184) with a thin wrapper:

```javascript
export function applyPartySkillsAfterPlayerAttacks({ attacks, allies, enemies, runPartySkills, combat }) {
  return applyAfterPlayerAttacks({ attacks, allies, enemies, runPartySkills, combat });
}
```

Remove the old `toActivePartySkillIdSet`, `isQualifyingPlayerAttackRecord`, and `rollProc` helper functions (lines 52-76) since they're now in the engine. Keep them if other code in the file references them — check first.

Also export the new hooks:

```javascript
export { applyAfterEnemyAttacks, applyRoundStartSkills } from '../combat/party-skill-engine.js';
```

- [ ] **Step 4: Wire hooks into loop.js**

In `src/game/loop.js`, update the import (line 68):

```javascript
import { processMoveTurn, processDefendTurn, processEnemyTurn, processBefriend, awardBattleXp, handleCreatureKO, tickAllEffects, executeNpcSkill, CREDITS_PER_KILL, applyPartySkillsAfterPlayerAttacks, applyAfterEnemyAttacks, applyRoundStartSkills, shouldTriggerBefriendQuiz, generateBefriendQuiz, processBefriendQuizAnswer, resolveBefriendFight } from './services/creature-combat-service.js';
```

In `_handleCreatureAttackTurn` (line ~702), add round-start skills BEFORE player moves:

```javascript
  _handleCreatureAttackTurn(effectEvents, moveChoices) {
    this.combat.befriendAttemptedSlots = {};

    // Party skills: round-start (Erosion, Momentum, Overflow Vitality)
    const roundStartEvents = applyRoundStartSkills({
      allies: this.combat.allies,
      enemies: this.combat.enemies,
      runPartySkills: this.run.partySkills,
      combat: this.combat
    });

    const metaMults = { hpMult: this.run.metaHpMult || 1, atkMult: this.run.metaAtkMult || 1 };
    const playerResult = processMoveTurn(/* ... existing args ... */);
    // ... existing party skills call ...
```

After the enemy phase (~line 878), add counter hook:

```javascript
    const enemyResult = processEnemyTurn(this.combat.enemies, this.combat.allies, false, this.run.itemBuffs);

    // Party skills: counter attacks
    const counterAttacks = applyAfterEnemyAttacks({
      enemyAttacks: enemyResult.attacks,
      allies: this.combat.allies,
      enemies: this.combat.enemies,
      runPartySkills: this.run.partySkills,
      combat: this.combat
    }) || [];
```

Add `roundStartEvents` and `counterAttacks` to the return object so the frontend can display them.

- [ ] **Step 5: Run syntax checks**

```bash
node --check src/game/combat/party-skill-engine.js && echo "OK"
node --check src/game/party-skills.js && echo "OK"
node --check src/game/services/creature-combat-service.js && echo "OK"
node --check src/game/loop.js && echo "OK"
```

Expected: All OK

- [ ] **Step 6: Run existing tests to verify nothing broke**

```bash
npm test
```

Expected: All existing tests pass. The old party skill tests should still work since `applyPartySkillsAfterPlayerAttacks` is still exported with the same signature (as a thin wrapper).

- [ ] **Step 7: Commit**

```bash
git add src/game/combat/party-skill-engine.js src/game/state.js src/game/services/creature-combat-service.js src/game/loop.js
git commit -m "feat: party skill engine scaffold with 3 hook points"
```

---

### Task 3: Chain Loop — Arc Strike

**Files:**
- Test: `tests/unit/combat/party-skill-engine.test.js`
- Code: `src/game/combat/party-skill-engine.js` (already has implementation)

- [ ] **Step 1: Write tests for Arc Strike**

Create `tests/unit/combat/party-skill-engine.test.js`:

```javascript
import test from 'node:test';
import assert from 'node:assert/strict';

import { applyAfterPlayerAttacks, applyRoundStartSkills, applyAfterEnemyAttacks, countDebuffTypes, countBuffTypes } from '../../../src/game/combat/party-skill-engine.js';

function makeAlly({ id = 'ally', hp = 50, maxHp = 100, attack = 20, element = 'fire', defense = 10 } = {}) {
  return { id, hp, maxHp, attack, defense, element, activeEffects: [], statStages: { atk: 0, def: 0 } };
}

function makeEnemy({ id = 'enemy', hp = 100, maxHp = 100, element = 'water', attack = 15, defense = 10 } = {}) {
  return { id, hp, maxHp, attack, defense, element, activeEffects: [], statStages: { atk: 0, def: 0 } };
}

function makeDmgRecord({ attackerIndex = 0, targetIndex = 0, damage = 20, elementMultiplier = 1.0 } = {}) {
  return {
    attackerIndex, category: 'damage', damage, elementMultiplier,
    targetIndex, targetDefeated: false, partySkillProcs: [],
    statChangesApplied: null, effectApplied: null
  };
}

function makeCombat() {
  return { chainHitsThisTurn: 0, counterCounts: {}, afflictionBurstCooldown: {} };
}

function withStubbedRandom(value, fn) {
  const original = Math.random;
  Math.random = () => value;
  try { return fn(); } finally { Math.random = original; }
}

// ── Arc Strike ──

test('arcStrike: chains 30% damage to another enemy', () => {
  const allies = [makeAlly({ element: 'fire' })];
  const enemies = [makeEnemy({ id: 'e1', hp: 100 }), makeEnemy({ id: 'e2', hp: 100 })];
  const combat = makeCombat();
  const attacks = [makeDmgRecord({ damage: 40, targetIndex: 0 })];

  withStubbedRandom(0.99, () => {
    applyAfterPlayerAttacks({
      attacks, allies, enemies,
      runPartySkills: [{ id: 'arcStrike' }],
      combat
    });
  });

  // Chain should hit e2 for 30% of 40 = 12
  assert.equal(enemies[1].hp, 88);
  assert.equal(combat.chainHitsThisTurn, 1);
  const proc = attacks[0].partySkillProcs.find(p => p.skillId === 'arcStrike');
  assert.ok(proc);
  assert.equal(proc.type, 'chainHit');
  assert.equal(proc.damage, 12);
});

test('arcStrike: no chain when only one enemy alive', () => {
  const allies = [makeAlly()];
  const enemies = [makeEnemy({ id: 'e1', hp: 100 })];
  const combat = makeCombat();
  const attacks = [makeDmgRecord({ damage: 30 })];

  applyAfterPlayerAttacks({
    attacks, allies, enemies,
    runPartySkills: [{ id: 'arcStrike' }],
    combat
  });

  assert.equal(enemies[0].hp, 100); // no self-chain
  assert.equal(combat.chainHitsThisTurn, 0);
});
```

- [ ] **Step 2: Run tests**

```bash
npm run test:unit -- --test-name-pattern="arcStrike"
```

Expected: PASS (implementation already in engine scaffold)

- [ ] **Step 3: Commit**

```bash
git add tests/unit/combat/party-skill-engine.test.js
git commit -m "test: Arc Strike chain damage tests"
```

---

### Task 4: Chain Loop — Forked Arc + Resonant Arc

**Files:**
- Test: `tests/unit/combat/party-skill-engine.test.js`

- [ ] **Step 1: Write tests**

Append to `tests/unit/combat/party-skill-engine.test.js`:

```javascript
// ── Forked Arc ──

test('forkedArc: bounces continue with 50% chance', () => {
  const allies = [makeAlly({ element: 'fire' })];
  const enemies = [
    makeEnemy({ id: 'e1', hp: 100 }),
    makeEnemy({ id: 'e2', hp: 100 }),
    makeEnemy({ id: 'e3', hp: 100 })
  ];
  const combat = makeCombat();
  const attacks = [makeDmgRecord({ damage: 40, targetIndex: 0 })];

  // random returns 0.1 → all procs succeed (< 0.35 for contagion, < 0.5 for bounce)
  withStubbedRandom(0.1, () => {
    applyAfterPlayerAttacks({
      attacks, allies, enemies,
      runPartySkills: [{ id: 'arcStrike' }, { id: 'forkedArc' }],
      combat
    });
  });

  // Should have multiple chain hits (initial + bounces)
  const chainProcs = attacks[0].partySkillProcs.filter(p => p.type === 'chainHit');
  assert.ok(chainProcs.length >= 2, `expected multiple bounces, got ${chainProcs.length}`);
  assert.ok(combat.chainHitsThisTurn >= 2);
});

// ── Resonant Arc ──

test('resonantArc: later bounces deal more damage', () => {
  const allies = [makeAlly({ element: 'neutral' })]; // neutral to avoid SE
  const enemies = [
    makeEnemy({ id: 'e1', hp: 200, element: 'neutral' }),
    makeEnemy({ id: 'e2', hp: 200, element: 'neutral' }),
    makeEnemy({ id: 'e3', hp: 200, element: 'neutral' })
  ];
  const combat = makeCombat();
  const attacks = [makeDmgRecord({ damage: 100, targetIndex: 0 })];

  withStubbedRandom(0.1, () => {
    applyAfterPlayerAttacks({
      attacks, allies, enemies,
      runPartySkills: [{ id: 'arcStrike' }, { id: 'forkedArc' }, { id: 'resonantArc' }],
      combat
    });
  });

  const chainProcs = attacks[0].partySkillProcs.filter(p => p.type === 'chainHit');
  // First chain: 30% of 100 = 30
  assert.equal(chainProcs[0].damage <= 30, true);
  // Later bounces should deal more due to resonance
  if (chainProcs.length >= 3) {
    assert.ok(chainProcs[2].damage > chainProcs[0].damage,
      `bounce 3 (${chainProcs[2].damage}) should be > bounce 1 (${chainProcs[0].damage})`);
  }
});
```

- [ ] **Step 2: Run tests**

```bash
npm run test:unit -- --test-name-pattern="forkedArc|resonantArc"
```

Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add tests/unit/combat/party-skill-engine.test.js
git commit -m "test: Forked Arc and Resonant Arc bounce tests"
```

---

### Task 5: Chain Loop — Chain Surge + Elemental Cascade

**Files:**
- Test: `tests/unit/combat/party-skill-engine.test.js`

- [ ] **Step 1: Write tests**

Append to `tests/unit/combat/party-skill-engine.test.js`:

```javascript
// ── Chain Surge ──

test('chainSurge: 3+ chain hits grants team atk +1 stage', () => {
  const allies = [
    makeAlly({ id: 'a1' }),
    makeAlly({ id: 'a2' }),
    makeAlly({ id: 'a3' })
  ];
  const enemies = [
    makeEnemy({ id: 'e1', hp: 200, element: 'neutral' }),
    makeEnemy({ id: 'e2', hp: 200, element: 'neutral' }),
    makeEnemy({ id: 'e3', hp: 200, element: 'neutral' })
  ];
  const combat = makeCombat();
  // 3 attacks = potentially 3 chain hits
  const attacks = [
    makeDmgRecord({ attackerIndex: 0, damage: 50, targetIndex: 0 }),
    makeDmgRecord({ attackerIndex: 1, damage: 50, targetIndex: 1 }),
    makeDmgRecord({ attackerIndex: 2, damage: 50, targetIndex: 2 })
  ];

  withStubbedRandom(0.99, () => {
    applyAfterPlayerAttacks({
      attacks, allies, enemies,
      runPartySkills: [{ id: 'arcStrike' }, { id: 'chainSurge' }],
      combat
    });
  });

  assert.equal(combat.chainHitsThisTurn, 3);
  for (const ally of allies) {
    assert.equal(ally.statStages.atk, 1, `${ally.id} should have atk +1`);
  }
});

// ── Elemental Cascade ──

test('elementalCascade: SE chains deal 2x damage', () => {
  // Fire attacker, water target = SE chain
  const allies = [makeAlly({ element: 'fire' })];
  const enemies = [
    makeEnemy({ id: 'e1', hp: 200, element: 'fire' }),   // primary target (neutral chain)
    makeEnemy({ id: 'e2', hp: 200, element: 'metal' })    // chain target (fire vs metal = SE)
  ];
  const combat = makeCombat();
  const attacks = [makeDmgRecord({ damage: 100, targetIndex: 0 })];

  withStubbedRandom(0.99, () => {
    applyAfterPlayerAttacks({
      attacks, allies, enemies,
      runPartySkills: [{ id: 'arcStrike' }, { id: 'elementalCascade' }],
      combat
    });
  });

  const chainProc = attacks[0].partySkillProcs.find(p => p.skillId === 'arcStrike');
  assert.ok(chainProc);
  // Fire chain vs metal = SE → 2x: floor(100 * 0.30 * 2) = 60
  assert.equal(chainProc.isSE, true);
  assert.equal(chainProc.damage, 60);
});
```

- [ ] **Step 2: Run tests**

```bash
npm run test:unit -- --test-name-pattern="chainSurge|elementalCascade"
```

Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add tests/unit/combat/party-skill-engine.test.js
git commit -m "test: Chain Surge and Elemental Cascade tests"
```

---

### Task 6: Debuff Spread — Contagion + Virulent Chain

**Files:**
- Test: `tests/unit/combat/party-skill-engine.test.js`

- [ ] **Step 1: Write tests**

```javascript
// ── Contagion ──

test('contagion: 35% chance to spread stat stage debuff', () => {
  const allies = [makeAlly()];
  const enemies = [
    makeEnemy({ id: 'e1', hp: 100 }),
    makeEnemy({ id: 'e2', hp: 100 })
  ];
  enemies[0].statStages.atk = -1; // already debuffed by a move
  const combat = makeCombat();
  const attacks = [makeDmgRecord({
    damage: 20, targetIndex: 0,
    ...{ statChangesApplied: { atk: -1 } } // the move applied atk -1
  })];
  attacks[0].statChangesApplied = { atk: -1 };

  withStubbedRandom(0.1, () => { // < 0.35 → contagion procs
    applyAfterPlayerAttacks({
      attacks, allies, enemies,
      runPartySkills: [{ id: 'contagion' }],
      combat
    });
  });

  // e2 should have atk -1 from contagion spread
  assert.equal(enemies[1].statStages.atk, -1);
  const spreadProc = attacks[0].partySkillProcs.find(p => p.skillId === 'contagion');
  assert.ok(spreadProc);
});

// ── Virulent Chain ──

test('virulentChain: contagion spreads chain up to 3 times', () => {
  const allies = [makeAlly()];
  const enemies = [
    makeEnemy({ id: 'e1', hp: 100 }),
    makeEnemy({ id: 'e2', hp: 100 }),
    makeEnemy({ id: 'e3', hp: 100 }),
    makeEnemy({ id: 'e4', hp: 100 })
  ];
  const combat = makeCombat();
  const attacks = [makeDmgRecord({ damage: 20, targetIndex: 0 })];
  attacks[0].statChangesApplied = { atk: -1 };

  withStubbedRandom(0.1, () => { // all rolls succeed
    applyAfterPlayerAttacks({
      attacks, allies, enemies,
      runPartySkills: [{ id: 'contagion' }, { id: 'virulentChain' }],
      combat
    });
  });

  const spreads = attacks[0].partySkillProcs.filter(p => p.skillId === 'contagion');
  assert.ok(spreads.length >= 2, `expected multiple spreads, got ${spreads.length}`);
});
```

- [ ] **Step 2: Run tests**

```bash
npm run test:unit -- --test-name-pattern="contagion|virulentChain"
```

Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add tests/unit/combat/party-skill-engine.test.js
git commit -m "test: Contagion and Virulent Chain spread tests"
```

---

### Task 7: Debuff Spread — Erosion

**Files:**
- Test: `tests/unit/combat/party-skill-engine.test.js`

- [ ] **Step 1: Write tests**

```javascript
// ── Erosion ──

test('erosion: deepens negative stages on enemies each round', () => {
  const allies = [makeAlly()];
  const enemies = [
    makeEnemy({ id: 'e1', hp: 100 }),
    makeEnemy({ id: 'e2', hp: 100 })
  ];
  enemies[0].statStages = { atk: -2, def: 0 };
  enemies[1].statStages = { atk: 0, def: -1 };
  const combat = makeCombat();

  const events = applyRoundStartSkills({
    allies, enemies,
    runPartySkills: [{ id: 'erosion' }],
    combat
  });

  assert.equal(enemies[0].statStages.atk, -3); // -2 → -3
  assert.equal(enemies[0].statStages.def, 0);   // 0 stays 0
  assert.equal(enemies[1].statStages.atk, 0);   // 0 stays 0
  assert.equal(enemies[1].statStages.def, -2);  // -1 → -2

  const erosionEvents = events.filter(e => e.type === 'erosion');
  assert.equal(erosionEvents.length, 2);
});

test('erosion: caps at -6', () => {
  const allies = [makeAlly()];
  const enemies = [makeEnemy()];
  enemies[0].statStages = { atk: -6, def: -5 };
  const combat = makeCombat();

  applyRoundStartSkills({
    allies, enemies,
    runPartySkills: [{ id: 'erosion' }],
    combat
  });

  assert.equal(enemies[0].statStages.atk, -6); // already at cap
  assert.equal(enemies[0].statStages.def, -6); // -5 → -6
});

test('erosion: does not affect dead enemies', () => {
  const allies = [makeAlly()];
  const enemies = [makeEnemy({ hp: 0 })];
  enemies[0].statStages = { atk: -2, def: 0 };
  const combat = makeCombat();

  applyRoundStartSkills({
    allies, enemies,
    runPartySkills: [{ id: 'erosion' }],
    combat
  });

  assert.equal(enemies[0].statStages.atk, -2); // unchanged
});
```

- [ ] **Step 2: Run tests**

```bash
npm run test:unit -- --test-name-pattern="erosion"
```

Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add tests/unit/combat/party-skill-engine.test.js
git commit -m "test: Erosion auto-decrement tests"
```

---

### Task 8: Debuff Spread — Affliction Burst + Pandemic

**Files:**
- Test: `tests/unit/combat/party-skill-engine.test.js`

- [ ] **Step 1: Write tests**

```javascript
// ── Affliction Burst ──

test('afflictionBurst: 3+ debuff types triggers 20% max HP burst', () => {
  const allies = [makeAlly()];
  const enemies = [makeEnemy({ id: 'e1', hp: 100, maxHp: 100 })];
  enemies[0].statStages = { atk: -1, def: -1 };
  enemies[0].activeEffects = [{ type: 'poison', damagePerTurn: 5, remainingTurns: 3 }];
  const combat = makeCombat();
  const attacks = [makeDmgRecord({ damage: 10, targetIndex: 0 })];

  applyAfterPlayerAttacks({
    attacks, allies, enemies,
    runPartySkills: [{ id: 'afflictionBurst' }],
    combat
  });

  // 3 debuff types (atk -1, def -1, poison) → 20% of 100 = 20 damage
  assert.equal(enemies[0].hp, 80); // 100 - 20 burst
  assert.equal(combat.afflictionBurstCooldown['0'], 2);
});

test('afflictionBurst: respects 2-turn cooldown', () => {
  const allies = [makeAlly()];
  const enemies = [makeEnemy({ hp: 100, maxHp: 100 })];
  enemies[0].statStages = { atk: -1, def: -1 };
  enemies[0].activeEffects = [{ type: 'poison', damagePerTurn: 5, remainingTurns: 3 }];
  const combat = makeCombat();
  combat.afflictionBurstCooldown = { '0': 2 }; // on cooldown
  const attacks = [makeDmgRecord({ damage: 10 })];

  applyAfterPlayerAttacks({
    attacks, allies, enemies,
    runPartySkills: [{ id: 'afflictionBurst' }],
    combat
  });

  assert.equal(enemies[0].hp, 100); // no burst, on cooldown
  assert.equal(combat.afflictionBurstCooldown['0'], 1); // decremented
});

// ── Pandemic ──

test('pandemic: defeated enemy spreads debuffs to all survivors', () => {
  const allies = [makeAlly()];
  const enemies = [
    makeEnemy({ id: 'e1', hp: 0 }), // defeated
    makeEnemy({ id: 'e2', hp: 100 }),
    makeEnemy({ id: 'e3', hp: 100 })
  ];
  enemies[0].statStages = { atk: -3, def: -2 };
  enemies[0].activeEffects = [{ type: 'poison', damagePerTurn: 5, remainingTurns: 2, sourceId: 'test' }];
  const combat = makeCombat();
  const attacks = [makeDmgRecord({ damage: 50, targetIndex: 0 })];
  attacks[0].targetDefeated = true;

  applyAfterPlayerAttacks({
    attacks, allies, enemies,
    runPartySkills: [{ id: 'pandemic' }],
    combat
  });

  // Survivors get the defeated enemy's debuffs
  assert.equal(enemies[1].statStages.atk, -3);
  assert.equal(enemies[1].statStages.def, -2);
  assert.equal(enemies[2].statStages.atk, -3);
  assert.equal(enemies[2].statStages.def, -2);
  assert.ok(enemies[1].activeEffects.some(e => e.type === 'poison'));
  assert.ok(enemies[2].activeEffects.some(e => e.type === 'poison'));
});
```

- [ ] **Step 2: Run tests**

```bash
npm run test:unit -- --test-name-pattern="afflictionBurst|pandemic"
```

Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add tests/unit/combat/party-skill-engine.test.js
git commit -m "test: Affliction Burst and Pandemic tests"
```

---

### Task 9: Counter Loop — Retaliation Strike + Modifiers

**Files:**
- Test: `tests/unit/combat/party-skill-engine.test.js`

- [ ] **Step 1: Write tests**

```javascript
// ── Retaliation Strike ──

test('retaliationStrike: 50% counter for 25% ATK', () => {
  const allies = [makeAlly({ attack: 40 })];
  const enemies = [makeEnemy({ id: 'e1', hp: 100 })];
  const combat = makeCombat();
  const enemyAttacks = [{
    attackerIndex: 0, targetIndex: 0, damage: 15,
    attackerId: 'e1', attackerName: 'Enemy'
  }];

  withStubbedRandom(0.1, () => { // < 0.5 → counter procs
    const counters = applyAfterEnemyAttacks({
      enemyAttacks, allies, enemies,
      runPartySkills: [{ id: 'retaliationStrike' }],
      combat
    });

    assert.equal(counters.length, 1);
    assert.equal(counters[0].type, 'counter');
    assert.equal(counters[0].damage, 10); // 40 * 0.25 = 10
    assert.equal(enemies[0].hp, 90);
  });
});

test('retaliationStrike: no counter on 50%+ random roll', () => {
  const allies = [makeAlly({ attack: 40 })];
  const enemies = [makeEnemy()];
  const combat = makeCombat();
  const enemyAttacks = [{ attackerIndex: 0, targetIndex: 0, damage: 15 }];

  withStubbedRandom(0.9, () => { // > 0.5 → no counter
    const counters = applyAfterEnemyAttacks({
      enemyAttacks, allies, enemies,
      runPartySkills: [{ id: 'retaliationStrike' }],
      combat
    });

    assert.equal(counters.length, 0);
    assert.equal(enemies[0].hp, 100);
  });
});

// ── Hardened Riposte ──

test('hardenedRiposte: +50% counter when def stage positive', () => {
  const allies = [makeAlly({ attack: 40 })];
  allies[0].statStages = { atk: 0, def: 2 };
  const enemies = [makeEnemy({ hp: 100 })];
  const combat = makeCombat();
  const enemyAttacks = [{ attackerIndex: 0, targetIndex: 0, damage: 15 }];

  withStubbedRandom(0.1, () => {
    const counters = applyAfterEnemyAttacks({
      enemyAttacks, allies, enemies,
      runPartySkills: [{ id: 'retaliationStrike' }, { id: 'hardenedRiposte' }],
      combat
    });

    // 40 * 0.25 * 1.5 = 15
    assert.equal(counters[0].damage, 15);
  });
});

// ── Fury Counter ──

test('furyCounter: stacks +10% per counter', () => {
  const allies = [makeAlly({ attack: 100 })];
  const enemies = [makeEnemy({ hp: 500 })];
  const combat = makeCombat();
  combat.counterCounts = { '0': 3 }; // already 3 stacks

  const enemyAttacks = [{ attackerIndex: 0, targetIndex: 0, damage: 15 }];

  withStubbedRandom(0.1, () => {
    const counters = applyAfterEnemyAttacks({
      enemyAttacks, allies, enemies,
      runPartySkills: [{ id: 'retaliationStrike' }, { id: 'furyCounter' }],
      combat
    });

    // Stack 4 now: 100 * 0.25 * (1 + 4 * 0.10) = 25 * 1.4 = 35
    assert.equal(combat.counterCounts['0'], 4);
    assert.equal(counters[0].damage, 35);
  });
});

// ── Vengeful Mark ──

test('vengefulMark: counter applies atk -1 to attacker', () => {
  const allies = [makeAlly({ attack: 40 })];
  const enemies = [makeEnemy({ hp: 100 })];
  const combat = makeCombat();
  const enemyAttacks = [{ attackerIndex: 0, targetIndex: 0, damage: 15 }];

  withStubbedRandom(0.1, () => {
    const counters = applyAfterEnemyAttacks({
      enemyAttacks, allies, enemies,
      runPartySkills: [{ id: 'retaliationStrike' }, { id: 'vengefulMark' }],
      combat
    });

    assert.equal(enemies[0].statStages.atk, -1);
    const markProc = counters[0].procs.find(p => p.skillId === 'vengefulMark');
    assert.ok(markProc);
  });
});

// ── Last Stand ──

test('lastStand: double counter below 30% HP', () => {
  const allies = [makeAlly({ attack: 40, hp: 20, maxHp: 100 })]; // 20% HP
  const enemies = [makeEnemy({ hp: 100 })];
  const combat = makeCombat();
  const enemyAttacks = [{ attackerIndex: 0, targetIndex: 0, damage: 15 }];

  withStubbedRandom(0.1, () => {
    const counters = applyAfterEnemyAttacks({
      enemyAttacks, allies, enemies,
      runPartySkills: [{ id: 'retaliationStrike' }, { id: 'lastStand' }],
      combat
    });

    // 40 * 0.25 * 2 = 20
    assert.equal(counters[0].damage, 20);
    assert.equal(counters[0].isLastStand, true);
  });
});
```

- [ ] **Step 2: Run tests**

```bash
npm run test:unit -- --test-name-pattern="retaliationStrike|hardenedRiposte|furyCounter|vengefulMark|lastStand"
```

Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add tests/unit/combat/party-skill-engine.test.js
git commit -m "test: Counter loop — all 5 skills"
```

---

### Task 10: Buff Spread — Momentum

**Files:**
- Test: `tests/unit/combat/party-skill-engine.test.js`

- [ ] **Step 1: Write tests**

```javascript
// ── Momentum ──

test('momentum: grows positive stages on allies each round', () => {
  const allies = [
    makeAlly({ id: 'a1' }),
    makeAlly({ id: 'a2' })
  ];
  allies[0].statStages = { atk: 2, def: 0 };
  allies[1].statStages = { atk: 0, def: 1 };
  const enemies = [makeEnemy()];
  const combat = makeCombat();

  const events = applyRoundStartSkills({
    allies, enemies,
    runPartySkills: [{ id: 'momentum' }],
    combat
  });

  assert.equal(allies[0].statStages.atk, 3); // +2 → +3
  assert.equal(allies[0].statStages.def, 0); // 0 stays 0
  assert.equal(allies[1].statStages.atk, 0); // 0 stays 0
  assert.equal(allies[1].statStages.def, 2); // +1 → +2

  const momentumEvents = events.filter(e => e.type === 'momentum');
  assert.equal(momentumEvents.length, 2);
});

test('momentum: caps at +6', () => {
  const allies = [makeAlly()];
  allies[0].statStages = { atk: 6, def: 5 };
  const enemies = [makeEnemy()];
  const combat = makeCombat();

  applyRoundStartSkills({
    allies, enemies,
    runPartySkills: [{ id: 'momentum' }],
    combat
  });

  assert.equal(allies[0].statStages.atk, 6); // already at cap
  assert.equal(allies[0].statStages.def, 6); // +5 → +6
});

test('momentum: does not affect dead allies', () => {
  const allies = [makeAlly({ hp: 0 })];
  allies[0].statStages = { atk: 2, def: 0 };
  const enemies = [makeEnemy()];
  const combat = makeCombat();

  applyRoundStartSkills({
    allies, enemies,
    runPartySkills: [{ id: 'momentum' }],
    combat
  });

  assert.equal(allies[0].statStages.atk, 2); // unchanged
});
```

- [ ] **Step 2: Run tests**

```bash
npm run test:unit -- --test-name-pattern="momentum"
```

Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add tests/unit/combat/party-skill-engine.test.js
git commit -m "test: Momentum auto-increment tests"
```

---

### Task 11: Buff Spread — Shared Vigor, Diverse Empowerment, Overflow Vitality, Radiant Aura

**Files:**
- Test: `tests/unit/combat/party-skill-engine.test.js`

- [ ] **Step 1: Write tests**

```javascript
// ── Overflow Vitality ──

test('overflowVitality: 3+ buff types → 8% HP regen at round start', () => {
  const allies = [makeAlly({ hp: 50, maxHp: 100 })];
  allies[0].statStages = { atk: 1, def: 1 };
  allies[0].activeEffects = [{ type: 'haste', sourceId: 'test' }]; // 3rd buff type
  const enemies = [makeEnemy()];
  const combat = makeCombat();

  const events = applyRoundStartSkills({
    allies, enemies,
    runPartySkills: [{ id: 'overflowVitality' }],
    combat
  });

  assert.equal(allies[0].hp, 58); // 50 + 8% of 100 = 58
  const regenEvent = events.find(e => e.type === 'overflowVitality');
  assert.ok(regenEvent);
});

test('overflowVitality: does not trigger with < 3 buff types', () => {
  const allies = [makeAlly({ hp: 50, maxHp: 100 })];
  allies[0].statStages = { atk: 1, def: 0 }; // only 1 buff type
  const enemies = [makeEnemy()];
  const combat = makeCombat();

  applyRoundStartSkills({
    allies, enemies,
    runPartySkills: [{ id: 'overflowVitality' }],
    combat
  });

  assert.equal(allies[0].hp, 50); // unchanged
});

// ── countBuffTypes / countDebuffTypes ──

test('countBuffTypes: counts positive stages + positive status effects', () => {
  const creature = makeAlly();
  creature.statStages = { atk: 2, def: 1 };
  creature.activeEffects = [
    { type: 'shield', percent: 10, remainingTurns: 2 },
    { type: 'haste', sourceId: 'test' }
  ];
  assert.equal(countBuffTypes(creature), 4); // atk, def, shield, haste
});

test('countDebuffTypes: counts negative stages + negative status effects', () => {
  const creature = makeEnemy();
  creature.statStages = { atk: -2, def: 0 };
  creature.activeEffects = [
    { type: 'poison', damagePerTurn: 5, remainingTurns: 2, sourceId: 'test' },
    { type: 'confuse', remainingTurns: 2, sourceId: 'test' }
  ];
  assert.equal(countDebuffTypes(creature), 3); // atk, poison, confuse
});

// ── Diverse Empowerment ──

test('diverseEmpowerment: +8% per buff type on attacker', () => {
  const allies = [makeAlly({ attack: 50 })];
  allies[0].statStages = { atk: 1, def: 1 }; // 2 buff types
  const enemies = [makeEnemy({ hp: 100 })];
  const combat = makeCombat();
  const attacks = [makeDmgRecord({ attackerIndex: 0, damage: 50, targetIndex: 0 })];

  applyAfterPlayerAttacks({
    attacks, allies, enemies,
    runPartySkills: [{ id: 'diverseEmpowerment' }],
    combat
  });

  // 2 buff types → 16% bonus → floor(50 * 0.16) = 8
  const proc = attacks[0].partySkillProcs.find(p => p.skillId === 'diverseEmpowerment');
  assert.ok(proc);
  assert.equal(proc.bonusDamage, 8);
  assert.equal(enemies[0].hp, 92); // 100 - 8
});

// ── Radiant Aura ──

test('radiantAura: +15% when one creature at 3+ buff types', () => {
  const allies = [makeAlly({ attack: 50 }), makeAlly({ id: 'a2' })];
  allies[0].statStages = { atk: 1, def: 1 };
  allies[0].activeEffects = [{ type: 'haste', sourceId: 'test' }]; // 3 types
  const enemies = [makeEnemy({ hp: 100 })];
  const combat = makeCombat();
  const attacks = [makeDmgRecord({ attackerIndex: 0, damage: 50, targetIndex: 0 })];

  applyAfterPlayerAttacks({
    attacks, allies, enemies,
    runPartySkills: [{ id: 'radiantAura' }],
    combat
  });

  // +15% of 50 = 7
  const proc = attacks[0].partySkillProcs.find(p => p.skillId === 'radiantAura');
  assert.ok(proc);
  assert.equal(proc.bonusDamage, 7);
});
```

- [ ] **Step 2: Run tests**

```bash
npm run test:unit -- --test-name-pattern="overflowVitality|countBuffTypes|countDebuffTypes|diverseEmpowerment|radiantAura"
```

Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add tests/unit/combat/party-skill-engine.test.js
git commit -m "test: Buff Spread loop — all 5 skills"
```

---

### Task 12: Widening Gyre — Erosion + Momentum Integration Test

**Files:**
- Test: `tests/unit/combat/party-skill-engine.test.js`

- [ ] **Step 1: Write cross-loop integration test**

```javascript
// ── Widening Gyre (Erosion + Momentum) ──

test('widening gyre: erosion + momentum widens stage gap each round', () => {
  const allies = [makeAlly()];
  allies[0].statStages = { atk: 1, def: 0 }; // initial buff
  const enemies = [makeEnemy()];
  enemies[0].statStages = { atk: -1, def: 0 }; // initial debuff
  const combat = makeCombat();

  // Simulate 3 rounds
  for (let round = 0; round < 3; round++) {
    applyRoundStartSkills({
      allies, enemies,
      runPartySkills: [{ id: 'erosion' }, { id: 'momentum' }],
      combat
    });
  }

  // After 3 rounds: ally atk 1→2→3→4, enemy atk -1→-2→-3→-4
  assert.equal(allies[0].statStages.atk, 4);
  assert.equal(enemies[0].statStages.atk, -4);
});
```

- [ ] **Step 2: Run test**

```bash
npm run test:unit -- --test-name-pattern="widening gyre"
```

Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add tests/unit/combat/party-skill-engine.test.js
git commit -m "test: Widening Gyre cross-loop integration"
```

---

### Note: Cross-Loop Combos

The spec defines 7 cross-loop combos (Thunder God, Plague Arc, Toxic Vengeance, Fortified Vengeance, Surging Valor, Dual Dominance, Widening Gyre). These emerge naturally from skill interactions — they are NOT separate features to implement. The Widening Gyre integration test (Task 12) validates the most important combo. The others work automatically when the individual skills work correctly.

---

### Task 13: Migration — Remove Old Skills

**Files:**
- Modify: `src/game/services/creature-combat-service.js` (remove old skill logic)
- Modify: `tests/unit/combat/party-skills.test.js` (update old tests)

- [ ] **Step 1: Remove old skill processing from creature-combat-service.js**

The old `applyPartySkillsAfterPlayerAttacks` function (now a thin wrapper) should delegate entirely to the engine. Remove the old `toActivePartySkillIdSet`, `isQualifyingPlayerAttackRecord`, and `rollProc` helper functions from creature-combat-service.js if they are no longer used by other code in the file. Check with a search first:

```bash
grep -n 'toActivePartySkillIdSet\|isQualifyingPlayerAttackRecord\|rollProc' src/game/services/creature-combat-service.js
```

If only used by the old party skills code, remove them.

- [ ] **Step 2: Update old party-skills.test.js**

The existing tests for old skills (superEffectiveMend, hasteSpark, etc.) should be marked with a comment that they test legacy skills and will be removed when migration is complete. For now, keep them working by ensuring the engine still accepts these old skill IDs gracefully (they simply won't trigger any logic since they're not in the new catalog).

Update the import path if needed:

```javascript
// These tests cover legacy skills that are being phased out.
// They verify the engine gracefully ignores unknown skill IDs.
```

- [ ] **Step 3: Run all tests**

```bash
npm test
```

Expected: All pass. Old skill tests may need adjustment since the engine no longer processes legacy skill IDs.

- [ ] **Step 4: Commit**

```bash
git add src/game/services/creature-combat-service.js tests/unit/combat/party-skills.test.js
git commit -m "refactor: remove legacy party skill processing, delegate to engine"
```

---

### Task 14: Frontend — New Proc Type Displays

**Files:**
- Modify: `public/js/ui/combat-loop.js:391-422`

- [ ] **Step 1: Add new proc type handlers in showAttackDisplay**

In `public/js/ui/combat-loop.js`, extend the party skill procs display section (~line 391-422). After the existing `teamShield` handler, add:

```javascript
      // Chain hit — show arc to target
      else if (proc.type === 'chainHit') {
        const allEnemySlots = document.querySelectorAll('#enemy-formation .formation-slot');
        const chainTargetEl = allEnemySlots[proc.targetIndex];
        if (chainTargetEl) {
          spawnParticles(chainTargetEl, 4, proc.isSE ? '#FF6B6B' : '#FFD93D');
          damageNumber(chainTargetEl, proc.damage);
        }
      }
      // Stage change (buff or debuff from skill proc)
      else if (proc.type === 'stageChange') {
        const SC_NAMES = { atk: 'ATK', def: 'DEF' };
        const dir = proc.delta > 0 ? `+${proc.delta}` : `${proc.delta}`;
        const text = `${SC_NAMES[proc.stat] || proc.stat} ${dir}`;
        const slots = proc.targetSide === 'enemy'
          ? document.querySelectorAll('#enemy-formation .formation-slot')
          : document.querySelectorAll('#player-formation .formation-slot');
        const el = slots[proc.targetIndex];
        if (el) {
          if (proc.delta > 0) buff(el, text);
          else debuff(el, text);
        }
      }
      // Spread (contagion)
      else if (proc.type === 'spread') {
        const allEnemySlots = document.querySelectorAll('#enemy-formation .formation-slot');
        const spreadTargetEl = allEnemySlots[proc.targetIndex];
        if (spreadTargetEl) {
          skillProc(spreadTargetEl, 'SPREAD!');
          spawnParticles(spreadTargetEl, 4, '#9C27B0');
        }
      }
      // Team buff (e.g., Chain Surge)
      else if (proc.type === 'teamBuff') {
        const allAllySlots = document.querySelectorAll('#player-formation .formation-slot');
        const SC_NAMES = { atk: 'ATK', def: 'DEF' };
        allAllySlots.forEach(slot => {
          buff(slot, `${SC_NAMES[proc.stat] || proc.stat} +${proc.delta}`);
        });
      }
      // Burst (Affliction Burst)
      else if (proc.type === 'burst') {
        const allEnemySlots = document.querySelectorAll('#enemy-formation .formation-slot');
        const burstTargetEl = allEnemySlots[proc.targetIndex];
        if (burstTargetEl) {
          skillProc(burstTargetEl, `AFFLICTION BURST!`);
          damageNumber(burstTargetEl, proc.damage);
          spawnParticles(burstTargetEl, 10, '#E91E63');
        }
      }
      // Pandemic
      else if (proc.type === 'pandemic') {
        const allEnemySlots = document.querySelectorAll('#enemy-formation .formation-slot');
        allEnemySlots.forEach(slot => {
          skillProc(slot, 'PANDEMIC!');
          spawnParticles(slot, 6, '#9C27B0');
        });
      }
```

- [ ] **Step 2: Add counter attack display**

The counter attacks returned by `applyAfterEnemyAttacks` need to be rendered in the combat loop. In `combat-loop.js`, after the enemy attack display section, add a handler for counter records. This will be wired when the frontend receives `counterAttacks` from the server.

Find where enemy attacks are displayed and add after:

```javascript
// Counter attacks display
if (result.counterAttacks?.length) {
  for (const counter of result.counterAttacks) {
    const defenderSlot = allySlots[counter.defenderIndex];
    const enemySlot = enemySlots[counter.targetIndex];

    if (defenderSlot) {
      skillProc(defenderSlot, counter.isLastStand ? 'LAST STAND!' : 'COUNTER!');
      flashElement(defenderSlot.querySelector('.formation-sprite'), 1);
    }
    if (enemySlot) {
      damageNumber(enemySlot, counter.damage);
      spawnParticles(enemySlot, 6, '#FF8A65');
    }

    // Counter procs (Vengeful Mark, Contagion, etc.)
    for (const proc of counter.procs || []) {
      if (proc.type === 'stageChange') {
        const el = enemySlots[proc.targetIndex];
        if (el) debuff(el, `ATK ${proc.delta}`);
      } else if (proc.type === 'spread') {
        const el = enemySlots[proc.targetIndex];
        if (el) { skillProc(el, 'SPREAD!'); spawnParticles(el, 4, '#9C27B0'); }
      }
    }

    await effectDelay(600);
  }
}
```

- [ ] **Step 3: Add round-start event display**

Add a handler for round-start events (Erosion, Momentum, Overflow Vitality) at the beginning of the round display:

```javascript
// Round-start skill events
if (result.roundStartEvents?.length) {
  for (const event of result.roundStartEvents) {
    if (event.type === 'erosion') {
      const slots = document.querySelectorAll('#enemy-formation .formation-slot');
      const el = slots[event.targetIndex];
      if (el) debuff(el, `${event.stat.toUpperCase()} ▼`);
    } else if (event.type === 'momentum') {
      const slots = document.querySelectorAll('#player-formation .formation-slot');
      const el = slots[event.targetIndex];
      if (el) buff(el, `${event.stat.toUpperCase()} ▲`);
    } else if (event.type === 'overflowVitality') {
      const slots = document.querySelectorAll('#player-formation .formation-slot');
      const el = slots[event.targetIndex];
      if (el) healEffect(el, event.healAmount);
    }
  }
  await effectDelay(800);
}
```

- [ ] **Step 4: Syntax check**

```bash
node --check public/js/ui/combat-loop.js && echo "OK"
```

Expected: OK

- [ ] **Step 5: Commit**

```bash
git add public/js/ui/combat-loop.js
git commit -m "feat: frontend display for all party skill v2 proc types"
```

---

### Task 15: Wire Return Values + Integration Test

**Files:**
- Modify: `src/game/loop.js` (pass roundStartEvents + counterAttacks to return values)
- Test: `tests/integration/party-skills-v2.test.js`

- [ ] **Step 1: Update loop.js return objects**

In `_handleCreatureAttackTurn`, ensure `roundStartEvents` and `counterAttacks` are included in all return paths. Find each return statement and add:

```javascript
return {
  actionType: 'attack',
  playerAttacks: playerResult.attacks || [],
  // ... existing fields ...
  roundStartEvents,    // ADD THIS
  counterAttacks,      // ADD THIS
  // ...
};
```

Do this for ALL return paths in `_handleCreatureAttackTurn` (there are ~4: befriend quiz, all enemies defeated, all allies KO'd after NPC, normal flow).

Also add the hooks to `_handleCreatureDefendTurn` and `_handleCreatureBefriendTurn` — round start skills should fire on those turns too.

- [ ] **Step 2: Write integration test**

Create `tests/integration/party-skills-v2.test.js`:

```javascript
import test from 'node:test';
import assert from 'node:assert/strict';

import { applyAfterPlayerAttacks, applyRoundStartSkills, applyAfterEnemyAttacks } from '../../src/game/combat/party-skill-engine.js';

test('full combat round: chain → counter → erosion cycle', () => {
  const allies = [
    { id: 'a1', hp: 80, maxHp: 100, attack: 30, defense: 10, element: 'fire', activeEffects: [], statStages: { atk: 0, def: 0 } }
  ];
  const enemies = [
    { id: 'e1', hp: 150, maxHp: 150, attack: 20, defense: 10, element: 'metal', activeEffects: [], statStages: { atk: 0, def: 0 } },
    { id: 'e2', hp: 150, maxHp: 150, attack: 20, defense: 10, element: 'water', activeEffects: [], statStages: { atk: -1, def: 0 } }
  ];
  const skills = [
    { id: 'arcStrike' },
    { id: 'erosion' },
    { id: 'retaliationStrike' },
    { id: 'vengefulMark' }
  ];
  const combat = { chainHitsThisTurn: 0, counterCounts: {}, afflictionBurstCooldown: {} };

  // Round start: erosion deepens e2's atk -1 → -2
  applyRoundStartSkills({ allies, enemies, runPartySkills: skills, combat });
  assert.equal(enemies[1].statStages.atk, -2);

  // Player attack: chain should fire (fire vs metal = SE)
  const attacks = [{
    attackerIndex: 0, category: 'damage', damage: 30,
    elementMultiplier: 1.5, targetIndex: 0, targetDefeated: false,
    partySkillProcs: [], statChangesApplied: null, effectApplied: null
  }];
  applyAfterPlayerAttacks({ attacks, allies, enemies, runPartySkills: skills, combat });

  // Arc Strike should have chained
  assert.ok(combat.chainHitsThisTurn >= 1);

  // Enemy attack → counter
  const enemyAttacks = [{ attackerIndex: 0, targetIndex: 0, damage: 20 }];
  const counters = applyAfterEnemyAttacks({
    enemyAttacks, allies, enemies, runPartySkills: skills, combat
  });

  // Counter may or may not proc (random), but structure is valid
  assert.ok(Array.isArray(counters));
});
```

- [ ] **Step 3: Run all tests**

```bash
npm test
```

Expected: All pass.

- [ ] **Step 4: Commit**

```bash
git add src/game/loop.js tests/integration/party-skills-v2.test.js
git commit -m "feat: wire party skill v2 return values + integration test"
```

---

### Task 16: Shared Vigor Hook for Buff Moves

**Files:**
- Modify: `src/game/combat/party-skill-engine.js`
- Test: `tests/unit/combat/party-skill-engine.test.js`

- [ ] **Step 1: Write test for Shared Vigor on buff moves**

```javascript
// ── Shared Vigor (via afterPlayerAttacks on buff category moves) ──

test('sharedVigor: buff move stat change chains to another ally', () => {
  const allies = [
    makeAlly({ id: 'a1' }),
    makeAlly({ id: 'a2' }),
    makeAlly({ id: 'a3' })
  ];
  const enemies = [makeEnemy()];
  const combat = makeCombat();

  // Simulate a buff move that applied def +1 to ally 0
  const attacks = [{
    attackerIndex: 0, category: 'buff', damage: 0,
    elementMultiplier: 1, targetIndex: 0, targetDefeated: false,
    partySkillProcs: [], statChangesApplied: { def: 1 }, effectApplied: null
  }];
  allies[0].statStages.def = 1; // move already applied this

  withStubbedRandom(0.1, () => { // < 0.5 → shared vigor procs
    applyAfterPlayerAttacks({
      attacks, allies, enemies,
      runPartySkills: [{ id: 'sharedVigor' }],
      combat
    });
  });

  // One other ally should also have def +1
  const buffedAllies = allies.filter(a => a.statStages.def > 0);
  assert.ok(buffedAllies.length >= 2, 'shared vigor should spread buff to another ally');
});
```

- [ ] **Step 2: Add Shared Vigor trigger for buff moves in applyAfterPlayerAttacks**

In the engine's `applyAfterPlayerAttacks`, add handling for buff-category moves. After the existing qualifying attack check, add a section that processes ALL records (not just damage):

```javascript
  // ── Shared Vigor on buff/shield moves ──
  if (active.has('sharedVigor')) {
    for (const record of attacks) {
      if (record.category !== 'buff' && record.category !== 'shield') continue;
      if (record.statChangesApplied) {
        for (const [stat, change] of Object.entries(record.statChangesApplied)) {
          if (change > 0) {
            trySharedVigor(active, allies, record.targetIndex, stat, change, combat);
          }
        }
      }
    }
  }
```

Add this BEFORE the qualifying attack loop (since buff moves have damage = 0 and wouldn't pass the qualifying check).

- [ ] **Step 3: Run tests**

```bash
npm run test:unit -- --test-name-pattern="sharedVigor"
```

Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/game/combat/party-skill-engine.js tests/unit/combat/party-skill-engine.test.js
git commit -m "feat: Shared Vigor triggers on buff moves"
```

---

### Task 17: Final Test Suite Run + Cleanup

**Files:**
- All modified files

- [ ] **Step 1: Run full test suite**

```bash
npm test
```

Expected: All tests pass.

- [ ] **Step 2: Run syntax check on all modified files**

```bash
node --check src/game/party-skills.js && \
node --check src/game/combat/party-skill-engine.js && \
node --check src/game/combat/effects.js && \
node --check src/game/services/creature-combat-service.js && \
node --check src/game/loop.js && \
node --check public/js/ui/combat-loop.js && \
echo "All OK"
```

Expected: All OK

- [ ] **Step 3: Verify no leftover references to old skills in engine**

```bash
grep -rn 'superEffectiveMend\|hasteSpark\|guardPulse\|battleRhythm\|finisherFeast' src/game/combat/party-skill-engine.js
```

Expected: No matches.

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "feat: party skills v2 — 20-skill synergy loop system complete"
```
