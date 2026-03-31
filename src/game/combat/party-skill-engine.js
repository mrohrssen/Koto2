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
