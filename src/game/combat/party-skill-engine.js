import { applyStatChange, applyHeal, getStageMultiplier, breakSleep, initStatStages } from './effects.js';
import { getElementMultiplier } from '../../shared/combat/creature-math.js';
import { getPartySkillLevel } from '../party-skills.js';

// ── Helpers ─────────────────────────────────────────────────────────

export function toActivePartySkillIdSet(runPartySkills) {
  const ids = [];
  for (const id of ['arcStrike', 'hpMaster', 'counterMaster', 'buffMaster', 'expMaster', 'debuffMaster']) {
    if (getPartySkillLevel(runPartySkills, id) > 0) ids.push(id);
  }
  return new Set(ids);
}

function rollProc(chance, rng = Math.random) {
  return rng() < (Number(chance) || 0);
}

function livingEnemies(enemies) {
  return enemies.filter(e => e && e.hp > 0);
}

function livingAllies(allies) {
  return allies.filter(a => a && a.hp > 0);
}

function randomFrom(arr, rng = Math.random) {
  if (arr.length === 0) return null;
  return arr[Math.floor(rng() * arr.length)];
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
 * Called after processMoveTurn or an interleaved player initiative slot.
 * Modifies attack records in-place.
 * Handles: Chain loop, spread triggers from chains, Affliction Burst checks, Pandemic on kills.
 */
export function applyAfterPlayerAttacks({ attacks, allies, enemies, runPartySkills, combat, resetTurnCounters = true, rng = Math.random }) {
  const active = toActivePartySkillIdSet(runPartySkills);
  if (!active.size) return;
  if (!Array.isArray(attacks) || attacks.length === 0) return;
  if (!combat) return;
  if (typeof combat.chainHitsThisTurn !== 'number') combat.chainHitsThisTurn = 0;
  const arcLevel = getPartySkillLevel(runPartySkills, 'arcStrike');

  // Reset per-turn counters for legacy whole-round callers. Interleaved
  // initiative callers reset once at round start and pass resetTurnCounters=false.
  if (resetTurnCounters) {
    combat.chainHitsThisTurn = 0;
    combat.chainSurgeTriggeredThisTurn = false;
  }

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
    if (arcLevel >= 1) {
      applyArcStrikeTree({ record, attacker, enemies, combat, rng, arcLevel });
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
          tryContagion(active, enemies, record.targetIndex, stat, change, record, combat, rng);
        }
      }
    }

    // ── Contagion on primary attack's status effects ──
    if (record.effectApplied && active.has('contagion')) {
      tryContagionStatus(active, enemies, record.targetIndex, record.effectApplied, record, combat, rng);
    }
  }

  // ── Shared Vigor on buff moves ──
  if (active.has('sharedVigor')) {
    for (const record of attacks) {
      if (record.category !== 'buff') continue;
      if (record.statChangesApplied) {
        for (const [stat, change] of Object.entries(record.statChangesApplied)) {
          if (change > 0) {
            trySharedVigor(active, allies, record.targetIndex, stat, change, combat, rng);
          }
        }
      }
    }
  }

  // ── Chain Surge: 3+ chain hits → team atk +1 ──
  if (active.has('chainSurge') && combat.chainHitsThisTurn >= 3 && !combat.chainSurgeTriggeredThisTurn) {
    for (let i = 0; i < allies.length; i++) {
      const ally = allies[i];
      if (!ally || ally.hp <= 0) continue;
      initStatStages(ally);
      const delta = applyStatChange(ally, 'atk', 1);
      if (delta !== 0) {
        // Shared Vigor trigger
        trySharedVigor(active, allies, i, 'atk', 1, combat, rng);
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
    combat.chainSurgeTriggeredThisTurn = true;
  }

  // ── Affliction Burst check on all enemies ──
  if (active.has('afflictionBurst')) {
    checkAfflictionBurst(enemies, combat, attacks);
  }
}

// ── Hook 3: After Enemy Attacks ─────────────────────────────────────

/**
 * Evaluate a single enemy attack for a counter response.
 * Returns a counter record or null. Applies damage to the enemy immediately.
 */
export function computeInlineCounter(record, allies, enemies, runPartySkills, combat, rng = Math.random) {
  const active = toActivePartySkillIdSet(runPartySkills);
  if (!active.size || !active.has('retaliationStrike')) return null;

  if (typeof record.targetIndex !== 'number') return null;
  const defender = allies?.[record.targetIndex];
  if (!defender || defender.hp <= 0) return null;
  if (typeof record.damage !== 'number' || record.damage <= 0) return null;

  if (!rollProc(0.50, rng)) return null;

  const enemyIdx = record.attackerIndex;
  const enemy = enemies?.[enemyIdx];
  if (!enemy || enemy.hp <= 0) return null;

  if (!combat.counterCounts) combat.counterCounts = {};

  let counterDmg = Math.floor((defender.attack || 10) * 0.25);

  if (active.has('hardenedRiposte')) {
    initStatStages(defender);
    const hasDefStage = (defender.statStages?.def || 0) > 0;
    if (hasDefStage) {
      counterDmg = Math.floor(counterDmg * 1.5);
    }
  }

  if (active.has('furyCounter')) {
    const key = String(record.targetIndex);
    if (!combat.counterCounts[key]) combat.counterCounts[key] = 0;
    combat.counterCounts[key] = Math.min(combat.counterCounts[key] + 1, 10);
    counterDmg = Math.floor(counterDmg * (1 + combat.counterCounts[key] * 0.10));
  }

  if (active.has('lastStand') && defender.hp < defender.maxHp * 0.30) {
    counterDmg = Math.floor(counterDmg * 2);
  }

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

  if (active.has('vengefulMark') && enemy.hp > 0) {
    initStatStages(enemy);
    const delta = applyStatChange(enemy, 'atk', -1);
    if (delta !== 0) {
      counterRecord.procs.push({
        skillId: 'vengefulMark', skillName: 'Vengeful Mark',
        type: 'stageChange', targetIndex: enemyIdx, targetSide: 'enemy', stat: 'atk', delta
      });
      tryContagionFromCounter(active, enemies, enemyIdx, 'atk', -1, counterRecord, combat, rng);
    }
  }

  if (active.has('pandemic') && enemy.hp <= 0) {
    triggerPandemicCounter(enemy, enemies, counterRecord, combat);
  }

  return counterRecord;
}

/**
 * Called after processEnemyTurn. Handles Counter loop skills.
 * @returns {object[]} Array of counter attack records for frontend display
 */
export function applyAfterEnemyAttacks({ enemyAttacks, allies, enemies, runPartySkills, combat, rng = Math.random }) {
  const active = toActivePartySkillIdSet(runPartySkills);
  if (!active.size || !active.has('retaliationStrike')) return [];
  if (!Array.isArray(enemyAttacks) || enemyAttacks.length === 0) return [];

  const counterAttacks = [];
  for (const record of enemyAttacks) {
    const counter = computeInlineCounter(record, allies, enemies, runPartySkills, combat, rng);
    if (counter) counterAttacks.push(counter);
  }

  if (active.has('afflictionBurst') && counterAttacks.length > 0) {
    checkAfflictionBurstCounter(enemies, combat, counterAttacks);
  }

  return counterAttacks;
}

function chainDamageForBounce(baseDmg, bounceIndex, arcLevel) {
  const basePct = 30;
  const pct = arcLevel >= 3 ? basePct + 15 * bounceIndex : basePct;
  return Math.floor((baseDmg * pct) / 100);
}

function shouldContinueArcBounce({ bounceIndex, arcLevel, rng }) {
  if (bounceIndex === 0) return true;
  if (arcLevel >= 4 && bounceIndex === 1) return true;
  if (arcLevel >= 2 && bounceIndex === 1) return rollProc(0.50, rng);
  if (arcLevel >= 5 && bounceIndex >= 2) return rollProc(0.25, rng);
  return false;
}

function applyArcStrikeTree({ record, attacker, enemies, combat, rng, arcLevel }) {
  const baseDmg = Math.max(0, Number(record.damage) || 0);
  if (baseDmg <= 0) return;

  let bounceIndex = 0;
  let sourceIndex = record.targetIndex;
  while (shouldContinueArcBounce({ bounceIndex, arcLevel, rng })) {
    const targets = livingEnemies(enemies).filter(enemy => enemies.indexOf(enemy) !== sourceIndex);
    if (targets.length === 0) break;

    const target = randomFrom(targets, rng);
    const targetIndex = enemies.indexOf(target);
    const damage = Math.min(chainDamageForBounce(baseDmg, bounceIndex, arcLevel), target.hp);
    target.hp -= damage;
    combat.chainHitsThisTurn += 1;

    record.partySkillProcs.push({
      skillId: 'arcStrike',
      skillName: 'Arc Strike',
      type: 'chainHit',
      targetIndex,
      damage,
      element: attacker?.element || 'neutral',
      isSE: getElementMultiplier(attacker?.element || 'neutral', target.element) > 1,
      bounceNum: bounceIndex + 1,
      sourceIndex
    });

    sourceIndex = targetIndex;
    bounceIndex += 1;
  }
}

// ── Spread Mechanics ────────────────────────────────────────────────

/** Try to spread a stat stage debuff via Contagion. */
function tryContagion(active, enemies, sourceIdx, stat, delta, record, combat, rng = Math.random) {
  if (!active.has('contagion')) return;
  const maxChains = active.has('virulentChain') ? 3 : 1;

  let spreadCount = 0;
  let currentIdx = sourceIdx;

  while (spreadCount < maxChains && rollProc(0.35, rng)) {
    const others = livingEnemies(enemies).filter(e => e !== enemies[currentIdx]);
    if (others.length === 0) break;
    const target = randomFrom(others, rng);
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
function tryContagionStatus(active, enemies, sourceIdx, effectType, record, combat, rng = Math.random) {
  if (!active.has('contagion')) return;
  // Only spread negative effects
  const debuffTypes = ['poison', 'sleep', 'stun', 'confuse'];
  if (!debuffTypes.includes(effectType)) return;

  const maxChains = active.has('virulentChain') ? 3 : 1;
  let spreadCount = 0;
  let currentIdx = sourceIdx;

  while (spreadCount < maxChains && rollProc(0.35, rng)) {
    const others = livingEnemies(enemies).filter(e => e !== enemies[currentIdx]);
    if (others.length === 0) break;
    const target = randomFrom(others, rng);
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
function tryContagionFromCounter(active, enemies, sourceIdx, stat, delta, counterRecord, combat, rng = Math.random) {
  if (!active.has('contagion')) return;
  const maxChains = active.has('virulentChain') ? 3 : 1;
  let spreadCount = 0;
  let currentIdx = sourceIdx;

  while (spreadCount < maxChains && rollProc(0.35, rng)) {
    const others = livingEnemies(enemies).filter(e => e !== enemies[currentIdx]);
    if (others.length === 0) break;
    const target = randomFrom(others, rng);
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
function trySharedVigor(active, allies, sourceIdx, stat, delta, combat, rng = Math.random) {
  if (!active.has('sharedVigor')) return;
  if (!rollProc(0.50, rng)) return;

  const others = livingAllies(allies).filter(a => a !== allies[sourceIdx]);
  if (others.length === 0) return;
  const target = randomFrom(others, rng);
  initStatStages(target);
  applyStatChange(target, stat, delta);
  // Note: Shared Vigor spread does NOT re-trigger Shared Vigor (no infinite loops)
}

/** Spread all debuffs from a defeated enemy to all survivors. Returns survivor count (0 if none). */
function spreadDefeatedDebuffs(defeated, enemies) {
  const survivors = livingEnemies(enemies).filter(e => e !== defeated);
  if (survivors.length === 0) return 0;

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

  return survivors.length;
}

/** Trigger Pandemic: all debuffs from defeated enemy spread to all survivors. */
function triggerPandemic(defeated, enemies, record, combat) {
  const survivorCount = spreadDefeatedDebuffs(defeated, enemies);
  if (survivorCount === 0) return;

  record.partySkillProcs.push({
    skillId: 'pandemic', skillName: 'Pandemic',
    type: 'pandemic', survivorCount
  });
}

/** Pandemic from counter kills. */
function triggerPandemicCounter(defeated, enemies, counterRecord, combat) {
  const survivorCount = spreadDefeatedDebuffs(defeated, enemies);
  if (survivorCount === 0) return;

  counterRecord.procs.push({
    skillId: 'pandemic', skillName: 'Pandemic',
    type: 'pandemic', survivorCount
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
export function checkAfflictionBurstCounter(enemies, combat, counterAttacks) {
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
  if (creature.statStages) {
    for (const [stat, val] of Object.entries(creature.statStages)) {
      if ((stat === 'atk' || stat === 'def' || stat === 'dex') && val > 0) count++;
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
